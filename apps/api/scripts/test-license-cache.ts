/* Smoke test t191: invalidación de caché `blocks:catalog` al activar/desactivar licencia.
 * Corre con: pnpm --filter @webs/api exec tsx scripts/test-license-cache.ts
 */
import Fastify from 'fastify';
import licenseRoutes from '../src/modules/licenses/routes';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

async function main(): Promise<void> {
  const deleted: string[] = [];
  let activated = false;

  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.decorate('authorize', () => async () => {});
  app.decorate('license', {
    activate: (key: string) => {
      activated = true;
      return { payload: { productId: 'prod-1' }, signedLicense: {} };
    },
    deactivate: () => {
      activated = false;
    },
    status: () => ({ configured: true, status: activated ? 'active' : 'unlicensed', features: activated ? ['payments'] : [] }),
    verify: () => ({ configured: true, status: activated ? 'active' : 'unlicensed', features: activated ? ['payments'] : [] }),
    fingerprint: () => 'fp-1',
  });
  app.decorate('redis', {
    del: async (key: string) => {
      deleted.push(key);
      return 1;
    },
  });
  app.decorate('prisma', { auditLog: { create: async () => ({}) } });

  await app.register(licenseRoutes);

  await app.inject({ method: 'POST', url: '/activate', payload: { activationKey: '12345678' } });
  check('activate → cacheDel blocks:catalog', deleted.includes('blocks:catalog'));

  deleted.length = 0;
  await app.inject({ method: 'POST', url: '/deactivate' });
  check('deactivate → cacheDel blocks:catalog', deleted.includes('blocks:catalog'));

  console.log(`\n${passed} passed, ${failed} failed`);
  await app.close();
  process.exit(failed === 0 ? 0 : 1);
}

void main();
