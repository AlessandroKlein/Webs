/**
 * Prueba del swap atómico de PLUGINS (t28 / ADR-0010).
 *
 * Importa las funciones REALES `atomicSwap`/`atomicRollback` que usa el
 * actualizador de plugins (`apps/api/src/modules/update/plugins.ts`) y verifica:
 *
 *  1. `atomicSwap(staged, live, backup)` deja el build NUEVO en `live` y el
 *     ANTERIOR preservado en `backup`.
 *  2. `atomicRollback(live, backup)` restaura el ANTERIOR.
 *
 * A diferencia de `test-update-swap.mjs` (que abre handles de lectura en bucle
 * para medir "estado roto" y falla en Windows con EPERM al renombrar un
 * directorio con un archivo abierto), esta prueba cubre el escenario real de
 * producción del swap de plugins: en el momento del swap NO hay handles abiertos
 * sobre los archivos del plugin (Node ya cerró el handle tras `import()`), por lo
 * que el rename atómico funciona en Windows. La limitación de Windows con handles
 * abiertos está documentada en ADR-0010 ("nota Windows").
 *
 * Uso: `pnpm --filter @webs/api exec tsx ../../scripts/test-plugin-swap.ts`
 * (exit 0 = PASS).
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicSwap, atomicRollback } from '../apps/api/src/modules/update/bootloader';

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'webs-plugin-swap-'));
  const live = path.join(root, 'live');
  const staged = path.join(root, 'staged');
  const backup = path.join(root, 'backup');

  await mkdir(live);
  await mkdir(staged);
  await writeFile(path.join(live, 'plugin.json'), JSON.stringify({ id: 'demo', version: '1.0.0' }));
  await writeFile(path.join(live, 'server.js'), 'OLD');
  await writeFile(path.join(staged, 'plugin.json'), JSON.stringify({ id: 'demo', version: '2.0.0' }));
  await writeFile(path.join(staged, 'server.js'), 'NEW');

  await atomicSwap(staged, live, backup);
  const swapped = (await readFile(path.join(live, 'server.js'), 'utf8')) === 'NEW';
  const preserved = (await readFile(path.join(backup, 'server.js'), 'utf8')) === 'OLD';

  await atomicRollback(live, backup);
  const rolledBack = (await readFile(path.join(live, 'server.js'), 'utf8')) === 'OLD';

  await rm(root, { recursive: true, force: true });

  const ok = swapped && preserved && rolledBack;
  console.log(
    `plugin swap test: ${ok ? 'PASS' : 'FAIL'} — ` +
      `swap_nuevo=${swapped ? 'OK' : 'ERR'}, ` +
      `backup_preservado=${preserved ? 'OK' : 'ERR'}, ` +
      `rollback=${rolledBack ? 'OK' : 'ERR'}`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
