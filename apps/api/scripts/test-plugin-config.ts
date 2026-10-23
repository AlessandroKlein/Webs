/**
 * Smoke test para t183 (config-freeze): verifica que `resolvePluginConfig` resuelva
 * la config de un plugin en tiempo de request (defaults del manifest + overrides de
 * settings), y que `schemaDefaults` extraiga correctamente los defaults.
 *
 * No necesita BD: mockea `app.prisma.pluginInstallation.findUnique` y registra un
 * manifest fake en `pluginRegistry`.
 */
import { schemaDefaults, resolvePluginConfig } from '../src/plugins/loader';
import { pluginRegistry } from '../src/plugins/registry';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  } else {
    console.log(`  ok: ${msg}`);
  }
}

const settings = {
  type: 'object',
  properties: {
    currency: { type: 'string', default: 'ARS' },
    requirePayment: { type: 'boolean', default: true },
    paymentProvider: { type: 'string', default: 'mercadopago' },
  },
};

const manifest = {
  id: 'test-subs',
  name: '@webs/plugin-test-subs',
  version: '0.1.0',
  type: 'plugin',
  displayName: { es: 'Test', en: 'Test' },
  description: { es: 'Test', en: 'Test' },
  author: 'Test',
  apiVersion: '1.0.0',
  settings,
};

pluginRegistry.registerAvailable(manifest as never);

// Mock: installation devuelve `config` (o null si no está instalado).
let installationConfig: unknown = null;
const app = {
  prisma: {
    pluginInstallation: {
      findUnique: async () => (installationConfig === null ? null : { config: installationConfig }),
    },
  },
} as never;

async function main(): Promise<void> {
  // 1) schemaDefaults extrae el default booleano.
  const d = schemaDefaults(settings as never);
  assert(d.requirePayment === true, 'schemaDefaults extrae requirePayment=true');
  assert(d.currency === 'ARS', 'schemaDefaults extrae currency=ARS');

  // 2) Sin instalación → sólo defaults (caso hot-install antes de crear el registro).
  installationConfig = null;
  let r = await resolvePluginConfig(app, 'test-subs');
  assert(r.requirePayment === true, 'sin instalación → requirePayment default true');
  assert(r.paymentProvider === 'mercadopago', 'sin instalación → paymentProvider default');

  // 3) Con instalación y override → override pisa el default.
  installationConfig = { requirePayment: false };
  r = await resolvePluginConfig(app, 'test-subs');
  assert(r.requirePayment === false, 'override requirePayment=false se refleja');
  assert(r.currency === 'ARS', 'override parcial conserva currency default');

  // 4) Config null en BD → defaults (no rompe).
  installationConfig = null;
  r = await resolvePluginConfig(app, 'test-subs');
  assert(r.requirePayment === true, 'config null en BD → default true');

  if (failures > 0) {
    console.error(`\nSMOKE FAIL (${failures} check(s) fallaron)`);
    process.exit(1);
  }
  console.log('\nPASS: resolvePluginConfig/schemaDefaults (config-freeze)');
}

void main();
