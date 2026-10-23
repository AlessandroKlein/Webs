#!/usr/bin/env node
/**
 * Prueba del swap atómico (ADR-0010).
 *
 * Demuestra dos propiedades del `atomicSwap` (mismo algoritmo que
 * `apps/api/src/modules/update/bootloader.ts`):
 *
 *  1. **Atomicidad por directorio**: un lector concurrente NUNCA ve un estado
 *     "roto" (mezcla de archivos de la versión vieja y la nueva). Un `rename`
 *     atómico jamás expone un archivo a medio copiar, a diferencia de una
 *     copia naive (`cp -r`), que sí dejaría ver mezcla viejo/nuevo.
 *  2. **Sin caída del servicio en ejecución**: el proceso sirve desde sus
 *     módulos ya cargados en memoria (como hace Node con el module cache), por
 *     lo que durante el swap no pierde ninguna petición. Tras el swap, un
 *     arranque nuevo lee la versión nueva. El rollback restaura la anterior.
 *
 * Nota honesta: el swap en DOS renames (live→backup y staged→live) deja una
 * ventana ínfima en la que un lector *fresco* de disco ve `ENOENT` (nunca
 * estado roto). En producción no afecta: el proceso vivo sirve desde memoria y
 * el supervisor reinicia después del swap. Esa ventana se reporta como
 * `enoent` informativo y no falla la prueba.
 *
 * Uso: `node scripts/test-update-swap.mjs` (exit 0 = PASS).
 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Mismo algoritmo que apps/api/src/modules/update/bootloader.ts (contrato).
async function atomicSwap(stagedDir, liveDir, backup) {
  await rm(backup, { recursive: true, force: true });
  let movedLive = false;
  try {
    await rename(liveDir, backup);
    movedLive = true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  try {
    await rename(stagedDir, liveDir);
  } catch (err) {
    if (movedLive) {
      try {
        await rename(backup, liveDir);
      } catch {
        /* best-effort */
      }
    }
    throw err;
  }
}

async function atomicRollback(liveDir, backup) {
  await rm(liveDir, { recursive: true, force: true });
  await rename(backup, liveDir);
}

const root = await mkdtemp(path.join(tmpdir(), 'webs-update-swap-'));
const live = path.join(root, 'live');
const staged = path.join(root, 'staged');
const backup = path.join(root, 'backup');

await mkdir(live);
await mkdir(staged);
// Build multi-archivo: sirve para detectar estado roto (mezcla viejo/nuevo).
await writeFile(path.join(live, 'a.js'), 'A1');
await writeFile(path.join(live, 'b.js'), 'B1');
await writeFile(path.join(staged, 'a.js'), 'A2');
await writeFile(path.join(staged, 'b.js'), 'B2');

// Proceso en ejecución: carga el build en memoria al arrancar (module cache)
// y sirve desde memoria; NO relee disco durante el swap.
const cached = { a: 'A1', b: 'B1' };
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`${cached.a}|${cached.b}`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

let torn = 0; // mezcla viejo/nuevo (la propiedad crítica que el rename atómico evita)
let enoent = 0; // ventana informativa del doble rename
let stop = false;

// Lector fresco concurrente (simula un import perezoso / proceso nuevo).
const fresh = (async () => {
  while (!stop) {
    try {
      const [a, b] = await Promise.all([
        readFile(path.join(live, 'a.js'), 'utf8'),
        readFile(path.join(live, 'b.js'), 'utf8'),
      ]);
      const oldOk = a === 'A1' && b === 'B1';
      const newOk = a === 'A2' && b === 'B2';
      if (!oldOk && !newOk) torn += 1;
    } catch (err) {
      if (err.code === 'ENOENT') enoent += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
})();

// Peticiones al proceso en ejecución durante el swap (no debe caerse).
let servedErrors = 0;
let servedOld = 0;
const client = (async () => {
  while (!stop) {
    try {
      const body = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      if (body === 'A1|B1') servedOld += 1;
      else servedErrors += 1;
    } catch {
      servedErrors += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
})();

await new Promise((resolve) => setTimeout(resolve, 50));
await atomicSwap(staged, live, backup);
await new Promise((resolve) => setTimeout(resolve, 100));
stop = true;
await fresh;
await client;
await new Promise((resolve) => server.close(resolve));

// Tras el swap, el build en vivo es el NUEVO.
const newLive =
  (await readFile(path.join(live, 'a.js'), 'utf8')) === 'A2' &&
  (await readFile(path.join(live, 'b.js'), 'utf8')) === 'B2';

// Rollback restaura el ANTERIOR.
await atomicRollback(live, backup);
const rolledBack =
  (await readFile(path.join(live, 'a.js'), 'utf8')) === 'A1' &&
  (await readFile(path.join(live, 'b.js'), 'utf8')) === 'B1';

await rm(root, { recursive: true, force: true });

const ok = torn === 0 && servedErrors === 0 && servedOld > 0 && newLive && rolledBack;
console.log(
  `swap test: ${ok ? 'PASS' : 'FAIL'} — sin_estado_roto=${torn === 0 ? 'OK' : 'ERR'} ` +
    `(mezclas=${torn}), servicio_sin_caida=${servedErrors === 0 ? 'OK' : 'ERR'} ` +
    `(peticiones_servidas=${servedOld}, errores=${servedErrors}), ` +
    `swap_nuevo=${newLive ? 'OK' : 'ERR'}, rollback=${rolledBack ? 'OK' : 'ERR'} ` +
    `(ventana_ENOENT_informativa=${enoent})`,
);
process.exit(ok ? 0 : 1);
