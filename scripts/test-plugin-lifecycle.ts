/**
 * Smoke test del ciclo de vida de plugins (F8/F9/F11/F13):
 * - F8: `loadPluginEntry` convierte la ruta a file:// (import en Windows).
 * - F11: `resolvePackageDir` encuentra el directorio aunque su nombre no
 *        coincida con el id/nombre del manifiesto.
 * - F9: `installPlugin` activa el plugin inmediatamente (menu + loaded).
 * - F13: `loadAndActivate` es idempotente y no lanza "Root plugin has already
 *        booted" cuando la app ya está booteada.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { PluginManifest } from '@webs/plugin-sdk';
import {
  resolvePackageDir,
  loadPluginEntry,
  loadAndActivate,
  installPlugin,
  discoverPlugins,
} from '../apps/api/src/plugins/loader';
import { pluginRegistry } from '../apps/api/src/plugins/registry';

const MANIFEST: PluginManifest = {
  name: '@webs/plugin-smoke',
  id: 'smoke-plugin',
  version: '1.0.0',
  type: 'plugin',
  entry: './dist/server.js',
  displayName: { en: 'Smoke' },
  description: { en: 'Smoke test plugin' },
  author: 'Webs',
  apiVersion: '1.0.0',
  menu: [{ id: 'smoke', label: { en: 'Smoke' }, path: '/admin/smoke', target: 'admin' }],
  permissions: ['smoke.read'],
};

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  // 1) Montar un plugin temporal cuyo directorio NO coincide con su id/nombre.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webs-plugin-smoke-'));
  const pkgDir = path.join(root, 'smoke-plugin-dir');
  fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(pkgDir, 'plugin.json'), JSON.stringify(MANIFEST, null, 2));
  fs.writeFileSync(
    path.join(pkgDir, 'dist', 'server.js'),
    [
      'export default {',
      `  manifest: { id: 'smoke-plugin', name: '@webs/plugin-smoke', version: '1.0.0', type: 'plugin' },`,
      '  hooks: {},',
      '  register: async (fastify) => { fastify.get(\'/ping\', async () => ({ ok: true })); },',
      '};',
      '',
    ].join('\n'),
  );

  // 2) App fake: prisma en memoria + register que simula "app ya booteada".
  const installed: Array<Record<string, unknown>> = [];
  const bootedError = Object.assign(new Error('Root plugin has already booted'), {
    code: 'AVV_ERR_ROOT_PLG_BOOTED',
  });
  const log = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => log,
  };
  const app = {
    config: { BLOCK_DIR: root },
    prisma: {
      pluginInstallation: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          const row = { id: 'inst-smoke', ...args.data };
          installed.push(row);
          return row;
        },
        update: async () => ({}),
        findMany: async () => [],
      },
      permission: { upsert: async () => ({}) },
      setting: { upsert: async () => ({}) },
      menu: { upsert: async () => ({}) },
      page: { upsert: async () => ({}), updateMany: async () => ({}) },
    },
    redis: null,
    events: {},
    log,
    register: async () => {
      throw bootedError;
    },
    decorate: () => {},
    addHook: () => {},
    get: () => {},
    post: () => {},
  } as unknown as FastifyInstance;

  try {
    console.log('F11 resolvePackageDir (dir != id):');
    const resolved = resolvePackageDir(app, MANIFEST);
    check('encuentra el directorio escaneando el manifiesto', resolved === pkgDir, `resolved=${resolved}`);

    console.log('F8 loadPluginEntry (file:// en Windows):');
    const plugin = await loadPluginEntry(pkgDir, MANIFEST);
    check('importa el entry y devuelve el ServerPlugin', plugin?.manifest?.id === 'smoke-plugin');

    console.log('F9 installPlugin activa el plugin:');
    discoverPlugins(root);
    const before = pluginRegistry.getLoadedPlugins().length;
    const result = await installPlugin(app, 'smoke-plugin');
    const loaded = pluginRegistry.getLoadedPlugins().some((l) => l.manifest.id === 'smoke-plugin');
    const menu = pluginRegistry.getMenuItems().some((m) => m.pluginId === 'smoke-plugin' && m.items.length === 1);
    check('instala y devuelve el id', result?.blockId === 'smoke-plugin');
    check('queda cargado (activo) tras instalar', loaded);
    check('queda registrado su menú', menu);
    check('no rompió con "already booted"', pluginRegistry.getLoadedPlugins().length === before + 1);

    console.log('F13 loadAndActivate idempotente (sin doble-boot):');
    const inst = installed[0] as { id: string; pluginId: string; manifest: unknown; config: unknown };
    await loadAndActivate(app, inst);
    const after = pluginRegistry.getLoadedPlugins().filter((l) => l.manifest.id === 'smoke-plugin').length;
    check('segunda activación no duplica ni lanza', after === 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\n${failures} chequeo(s) fallaron`);
    process.exit(1);
  }
  console.log('\nTodos los chequeos pasaron.');
}

void main().catch((err) => {
  console.error('Error en el smoke test:', err);
  process.exit(1);
});
