// Smoke: confirma que los plugins pos y suscripciones (build ESM de producción)
// cargan SIN "Dynamic require of fs" y que su `register` define rutas (no 404).
const routes = { pos: [], suscripciones: [] };

function makeMockFastify(name) {
  const db = {
    order: { create: async () => ({ id: 'o1' }), findFirst: async () => null },
    payment: { create: async (d) => ({ id: 'p1', ...d.data }) },
    product: { findMany: async () => [] },
    membership: { create: async (d) => ({ id: 'm1', ...d.data }), findFirst: async () => null },
    membershipPlan: { findUnique: async () => ({ id: 'plan1', price: 100 }) },
  };
  const fake = {
    prisma: db,
    authenticate: async () => {},
    authorize: () => async () => {},
    events: { on: () => {}, emit: async () => {} },
    resolveTenant: async () => ({ organizationId: 'org1', chainId: null }),
    requireTenant: async () => {},
    resolveScope: async () => ({ organizationId: 'org1' }),
    payments: { register: () => {} },
    get(...args) { routes[name].push(args[0]); return fake; },
    post(...args) { routes[name].push(args[0]); return fake; },
    patch(...args) { routes[name].push(args[0]); return fake; },
    delete(...args) { routes[name].push(args[0]); return fake; },
  };
  return fake;
}

try {
  const pos = await import('../plugins/pos/dist/server.js');
  const sus = await import('../plugins/suscripciones/dist/server.js');

  const posFake = makeMockFastify('pos');
  const susFake = makeMockFastify('suscripciones');

  await pos.default.register(posFake, { mode: 'cash', terminalId: 't', apiKey: 'k', webhookSecret: 's' });
  await sus.default.register(susFake, { currency: 'ARS', requirePayment: true, paymentProvider: 'mercadopago' });

  console.log('pos routes:', routes.pos.length, routes.pos.join(', '));
  console.log('suscripciones routes:', routes.suscripciones.length, routes.suscripciones.join(', '));

  if (routes.pos.length === 0 || routes.suscripciones.length === 0) {
    console.error('SMOKE_FAIL: expected routes but got none');
    process.exit(1);
  }
  console.log('SMOKE_OK: both plugins load and register routes without Dynamic require of fs');
} catch (e) {
  console.error('SMOKE_FAIL:', e.message);
  process.exit(1);
}
