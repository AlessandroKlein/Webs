// Smoke test t46 (F9-rutas): verifica el gate de rutas de plugin registradas en
// el boot y activadas/desactivadas en runtime sin reiniciar.
// Ejecutar desde apps/api:  pnpm --filter @webs/api exec tsx scripts/test-plugin-gate.ts
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { discoverPlugins, registerPluginRoutes, loadAndActivate } from '../src/plugins/loader';
import { pluginRegistry } from '../src/plugins/registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/scripts → repo root (3 niveles) → plugins/.
const pluginsDir = path.resolve(__dirname, '..', '..', '..', 'plugins');

const app = Fastify({ logger: false });

// Decoradores que los plugins esperan de authPlugin/tenantPlugin en producción.
app.decorate('authenticate', async () => {});
app.decorate('authorize', () => async () => {});
app.decorate('requireTenant', async () => {});
app.decorate('resolveTenant', async () => ({ organizationId: '00000000-0000-4000-8000-000000000001' }));
app.decorate('resolveScope', async () => ({}));

const prismaStub = {
  pluginInstallation: { findMany: async () => [], findUnique: async () => null },
  permission: { upsert: async () => ({}) },
  blogPost: {
    findMany: async () => [{ id: 'p1', title: 'hola' }],
    findUnique: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
  },
};

(app as unknown as { prisma: unknown }).prisma = prismaStub;
(app as unknown as { config: unknown }).config = { BLOCK_DIR: pluginsDir };
(app as unknown as { redis: unknown }).redis = null;
(app as unknown as { events: unknown }).events = { emit: async () => {} };

const checks: Array<[string, boolean]> = [];
const assert = (name: string, cond: boolean) => {
  checks.push([name, cond]);
  if (!cond) console.error(`FAIL: ${name}`);
};

try {
  discoverPlugins(pluginsDir);
  const blogManifest = pluginRegistry.getAvailableManifest('blog');
  assert('blog manifest disponible', Boolean(blogManifest));
  if (!blogManifest) throw new Error('blog no disponible');

  await registerPluginRoutes(app, blogManifest, {});

  await app.ready();

  // 1) Sin instalar → gate cierra → 404.
  let res = await app.inject({ method: 'GET', url: '/api/v1/plugins/blog/posts' });
  assert('sin instalar → 404', res.statusCode === 404);

  // 2) Activar (instalar) → gate abre → 200 sin reiniciar.
  await loadAndActivate(app, {
    id: 'inst-blog',
    pluginId: 'blog',
    manifest: blogManifest,
    config: {},
  });
  res = await app.inject({ method: 'GET', url: '/api/v1/plugins/blog/posts' });
  assert('tras activar → 200 sin reiniciar', res.statusCode === 200);

  // 3) Shim legacy /blocks también responde.
  res = await app.inject({ method: 'GET', url: '/api/v1/blocks/blog/posts' });
  assert('shim /blocks → 200', res.statusCode === 200);

  // 4) Desinstalar → gate cierra → 404.
  pluginRegistry.unregisterLoaded('blog');
  res = await app.inject({ method: 'GET', url: '/api/v1/plugins/blog/posts' });
  assert('tras desinstalar → 404', res.statusCode === 404);
} finally {
  await app.close();
}

const failed = checks.filter(([, ok]) => !ok).length;
console.log(`SMOKE ${failed === 0 ? 'OK' : 'FAIL'} (${checks.length - failed}/${checks.length})`);
process.exit(failed === 0 ? 0 : 1);
