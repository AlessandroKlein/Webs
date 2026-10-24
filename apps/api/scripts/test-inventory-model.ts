import inventoryRoutes from '../src/modules/inventory/routes';

// Smoke (sin DB): verifica el modelo core de inventario (ADR-0023) — scoping
// fail-closed por organizationId, creación de producto con variante implícita +
// nivel de stock en el almacén por defecto, y filtro de stock por almacén.
type Where = Record<string, unknown>;

const ROOT = '00000000-0000-4000-8000-000000000001';

let captured: {
  productCreate?: Record<string, unknown>;
  productFindManyWhere?: Where;
  variantCreate?: Record<string, unknown>;
  stockCreate?: Record<string, unknown>;
  warehouseCreate?: Record<string, unknown>;
  stockFindManyWhere?: Where;
} = {};

const currentTenant = { organizationId: 'branch-1', chainId: 'root-1', isSuperAdmin: false, isChainAdmin: false };

const fakeDb: Record<string, unknown> = {
  product: {
    findMany: async (args: { where?: Where }) => {
      captured.productFindManyWhere = args.where ?? {};
      return [];
    },
    findFirst: async () => null,
    create: async (args: { data: Record<string, unknown> }) => {
      captured.productCreate = args.data;
      return { id: 'prod-1', ...args.data };
    },
    update: async () => ({}),
    delete: async () => ({}),
  },
  variant: {
    findMany: async () => [],
    findFirst: async () => null,
    create: async (args: { data: Record<string, unknown> }) => {
      captured.variantCreate = args.data;
      return { id: 'var-1', ...args.data };
    },
    update: async () => ({}),
    delete: async () => ({}),
  },
  category: { findMany: async () => [], findFirst: async () => null, create: async (a: unknown) => a, update: async () => ({}), delete: async () => ({}) },
  brand: { findMany: async () => [], findFirst: async () => null, create: async (a: unknown) => a, update: async () => ({}), delete: async () => ({}) },
  supplier: { findMany: async () => [], findFirst: async () => null, create: async (a: unknown) => a, update: async () => ({}), delete: async () => ({}) },
  warehouse: {
    findMany: async () => [],
    findFirst: async () => null,
    create: async (args: { data: Record<string, unknown> }) => {
      captured.warehouseCreate = args.data;
      return { id: 'wh-1', ...args.data };
    },
    update: async () => ({}),
    delete: async () => ({}),
  },
  stockLevel: {
    findMany: async (args: { where?: Where }) => {
      captured.stockFindManyWhere = args.where ?? {};
      return [];
    },
    findFirst: async () => null,
    create: async (args: { data: Record<string, unknown> }) => {
      captured.stockCreate = args.data;
      return { id: 'sl-1', ...args.data };
    },
  },
};

const routes: Record<string, { handler: (req: unknown) => Promise<unknown>; preHandler: unknown[] }> = {};

const fakeFastify: Record<string, unknown> = {
  prisma: fakeDb,
  authenticate: async () => {},
  authorize: () => async () => {},
  requireTenant: async () => {},
  resolveTenant: async () => currentTenant,
  resolveScope: async (tenant: { organizationId?: string | null }) => ({
    organizationId: tenant?.organizationId ?? ROOT,
  }),
  get: (path: string, opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    routes[`GET ${path}`] = { handler, preHandler: (opts as { preHandler?: unknown[] })?.preHandler ?? [] };
  },
  post: (path: string, opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    routes[`POST ${path}`] = { handler, preHandler: (opts as { preHandler?: unknown[] })?.preHandler ?? [] };
  },
  patch: (path: string, opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    routes[`PATCH ${path}`] = { handler, preHandler: (opts as { preHandler?: unknown[] })?.preHandler ?? [] };
  },
  delete: (path: string, opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    routes[`DELETE ${path}`] = { handler, preHandler: (opts as { preHandler?: unknown[] })?.preHandler ?? [] };
  },
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok:', msg);
};

const asStr = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

(async () => {
  await inventoryRoutes(fakeFastify as never);

  // 1. GET /inventory/products aplica scope por organización.
  await routes['GET /inventory/products'].handler({ tenant: currentTenant, query: {} });
  assert(
    JSON.stringify(captured.productFindManyWhere) === JSON.stringify({ organizationId: 'branch-1' }),
    'GET /products → findMany scoped por organizationId',
  );

  // 2. POST /inventory/products crea producto con organizationId del tenant.
  captured = {};
  await routes['POST /inventory/products'].handler({
    tenant: currentTenant,
    body: { title: 'Remera', price: 2500, stock: 10 },
  });
  assert(asStr(captured.productCreate?.organizationId) === 'branch-1', 'POST /products → organizationId del tenant');
  assert(asStr(captured.productCreate?.stock) === '10', 'POST /products → stock inicial denormalizado');

  // 3. La variante implícita hereda productId + genera SKU determinista.
  assert(asStr(captured.variantCreate?.productId) === 'prod-1', 'variante implícita → productId');
  assert((asStr(captured.variantCreate?.sku)).startsWith('SKU-'), 'variante implícita → SKU generado');

  // 4. El nivel de stock se crea en el almacén por defecto con la cantidad inicial.
  assert(asStr(captured.stockCreate?.warehouseId) === 'wh-1', 'stockLevel → warehouse por defecto');
  assert(asStr(captured.stockCreate?.variantId) === 'var-1', 'stockLevel → variantId');
  assert(asStr(captured.stockCreate?.quantity) === '10', 'stockLevel → quantity inicial');

  // 5. Sin almacén previo, se crea uno por defecto (isDefault=true, code MAIN).
  assert(captured.warehouseCreate?.isDefault === true, 'almacén por defecto → isDefault=true');
  assert(asStr(captured.warehouseCreate?.code) === 'MAIN', 'almacén por defecto → code=MAIN');

  // 6. GET /inventory/stock filtra por warehouseId + scope.
  captured = {};
  await routes['GET /inventory/stock'].handler({ tenant: currentTenant, query: { warehouseId: 'wh-9' } });
  assert(
    JSON.stringify(captured.stockFindManyWhere) === JSON.stringify({ organizationId: 'branch-1', warehouseId: 'wh-9' }),
    'GET /stock → scope + filtro warehouseId',
  );

  // 7. Un tenant distinto (sucursal ajena) ve sólo su org (fail-closed).
  captured = {};
  await routes['GET /inventory/products'].handler({
    tenant: { organizationId: 'branch-2', chainId: 'root-2', isSuperAdmin: false, isChainAdmin: false },
    query: {},
  });
  assert(
    JSON.stringify(captured.productFindManyWhere) === JSON.stringify({ organizationId: 'branch-2' }),
    'sucursal ajena → ve sólo su organización',
  );

  console.log('PASS 7/7');
})();
