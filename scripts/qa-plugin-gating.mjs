#!/usr/bin/env node
/**
 * qa-plugin-gating.mjs — QA: gating del menú por plugin.
 * Sin dependencias. `node scripts/qa-plugin-gating.mjs [--live]`.
 *
 * 1. Extrae cada `requiresPlugin` del menú de `apps/web/src/layouts/AdminLayout.tsx`.
 * 2. Valida que cada valor exista como `id` en `plugins/*\/plugin.json`.
 * 3. Con `--live` (API arriba): login + `GET /api/v1/plugins` y verifica que
 *    cada instalación devuelva `enabled` booleano.
 *
 * Exit 1 si algún `requiresPlugin` no existe en el catálogo, o (--live) si el
 * API no devuelve `enabled` booleano.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LIVE = process.argv.includes('--live');
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.QA_EMAIL ?? 'admin@webs.test';
const PASSWORD = process.env.QA_PASSWORD ?? 'Admin12345!';

let exitCode = 0;
const ok = (msg) => console.log(`  OK  ${msg}`);
const bad = (msg) => { console.log(`  BAD ${msg}`); exitCode = 1; };

// ---- 1. Extraer requiresPlugin del menú ----
const layout = readFileSync(join(ROOT, 'apps', 'web', 'src', 'layouts', 'AdminLayout.tsx'), 'utf8');
const requires = new Set();
for (const m of layout.matchAll(/requiresPlugin\s*:\s*['"]([^'"]+)['"]/g)) requires.add(m[1]);
const requiresSorted = [...requires].sort();
console.log(`[qa-plugin-gating] requiresPlugin detectados (${requiresSorted.length}): ${requiresSorted.join(', ')}`);

// ---- 2. Catálogo plugins/*/plugin.json (id) ----
const pluginsDir = join(ROOT, 'plugins');
const catalog = new Map(); // id -> version
for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const manifestPath = join(pluginsDir, dir.name, 'plugin.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest && typeof manifest.id === 'string') catalog.set(manifest.id, manifest.version ?? '?');
  } catch {
    /* plugin sin manifest JSON válido: se ignora */
  }
}
console.log(`[qa-plugin-gating] catálogo local: ${catalog.size} plugins.`);

for (const r of requiresSorted) {
  if (catalog.has(r)) ok(`requiresPlugin "${r}" existe en catálogo (v${catalog.get(r)})`);
  else bad(`requiresPlugin "${r}" NO existe en plugins/*/plugin.json`);
}

// ---- 3. (--live) verificar enabled booleano ----
if (LIVE) {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) {
    bad(`login ${login.status}`);
  } else {
    const { accessToken } = await login.json();
    ok('login admin');
    const res = await fetch(`${API}/plugins`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    if (!res.ok) {
      bad(`GET /plugins ${res.status}`);
    } else {
      const installed = Array.isArray(body.installed) ? body.installed : [];
      ok(`GET /plugins → ${installed.length} instalados`);
      let nonBool = 0;
      for (const inst of installed) {
        if (typeof inst.enabled !== 'boolean') {
          bad(`instalación "${inst.pluginId}" sin enabled booleano (${typeof inst.enabled})`);
          nonBool++;
        }
      }
      if (!nonBool) ok('toda instalación devuelve `enabled` booleano');
    }
  }
} else {
  console.log('[qa-plugin-gating] (sin --live, solo validación estática)');
}

// process.exitCode (no process.exit) para evitar la aserción libuv de undici
// al salir con sockets keep-alive abiertos en Windows.
process.exitCode = exitCode;
