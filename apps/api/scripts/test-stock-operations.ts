import stockRoutes from '../src/modules/inventory/stock';

// Smoke (sin DB): verifica el núcleo de movimientos de stock (ADR-0023 §4–§5):
// entrada → salida ajusta correctamente el StockLevel, escribe el ledger
// inmutable (before/after) y recalcula el costo promedio ponderado + Product.stock.
type Where = Record<string, unknown>;

const ROOT = '00000000-0000-4000-8000-000000000001';
const currentTenant = { organizationId: 'org-1', chainId: 'root-1', isSuperAdmin: false, isChainAdmin: false };

// Estado en memoria del nivel de stock + ledger + agregado de producto.
const state: {
  levels: Record<string, { id: string; organizationId: string; warehouseId: string; productId: string; variantId: string | null; quantity: number; averageCost: number; minQuantity: number; criticalQuantity: number }>;
  movements: Array<Record<string, unknown>>;
  productStock: Record<string, number>;
} = {
  levels: {
    'wh-1|prod-1|var-1': {
      id: 'sl-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 0,
      averageCost: 0,
      minQuantity: 5,
      criticalQuantity: 2,
    },
  },
  movements: [],
  productStock: {},
};

const slKey = (w: Record<string, unknown>): string => `${w.warehouseId}|${w.productId}|${w.variantId ?? 'null'}`;

const fakeDb: Record<string, unknown> = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  stockLevel: {
    findFirst: async (args: { where: Record<string, unknown> }) => state.levels[slKey(args.where)] ?? null,
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const sl = Object.values(state.levels).find((s) => s.id === args.where.id);
      if (sl) Object.assign(sl, args.data);
      return sl;
    },
    aggregate: async (args: { where: Record<string, unknown> }) => {
      const qty = Object.values(state.levels)
        .filter((s) => s.organizationId === args.where.organizationId && s.productId === args.where.productId)
        .reduce((sum, s) => sum + s.quantity, 0);
      return { _sum: { quantity: qty } };
    },
    findMany: async () => Object.values(state.levels),
  },
  stockMovement: {
    create: async (args: { data: Record<string, unknown> }) => {
      state.movements.push(args.data);
      return args.data;
    },
    findMany: async () => state.movements,
    findFirst: async () => null,
  },
  inventoryLot: { create: async (a: unknown) => a, findMany: async () => [], update: async (a: unknown) => a },
  product: { updateMany: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    state.productStock[args.where.id] = args.data.stock as number;
    return { count: 1 };
  } },
  variant: { findFirst: async () => null },
  warehouse: { findFirst: async () => null },
};

const routes: Record<string, { handler: (req: unknown, reply?: unknown) => Promise<unknown> }> = {};

const fakeFastify: Record<string, unknown> = {
  prisma: fakeDb,
  authenticate: async () => {},
  authorize: () => async () => {},
  requireTenant: async () => {},
  resolveTenant: async () => currentTenant,
  resolveScope: async (tenant: { organizationId?: string | null }) => ({ organizationId: tenant?.organizationId ?? ROOT }),
  get: (path: string, _o: unknown, handler: (req: unknown) => Promise<unknown>) => { routes[`GET ${path}`] = { handler }; },
  post: (path: string, _o: unknown, handler: (req: unknown) => Promise<unknown>) => { routes[`POST ${path}`] = { handler }; },
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};

const sl = (): { quantity: number; averageCost: number } => state.levels['wh-1|prod-1|var-1']!;

(async () => {
  await stockRoutes(fakeFastify as never);

  // 1. Entrada de 10 a $100.
  await routes['POST /inventory/stock/receive'].handler({ tenant: currentTenant, user: { sub: 'user-1' }, body: { warehouseId: 'wh-1', productId: 'prod-1', variantId: 'var-1', quantity: 10, unitCost: 100 } });
  assert(sl().quantity === 10, 'entrada +10 → quantity=10');
  assert(sl().averageCost === 100, 'entrada 10×$100 → averageCost=100');
  assert(state.productStock['prod-1'] === 10, 'entrada → Product.stock=10');
  assert(state.movements.length === 1 && state.movements[0]!.type === 'entrada', 'movimiento entrada registrado');
  assert(state.movements[0]!.quantityBefore === 0 && state.movements[0]!.quantityAfter === 10, 'ledger before/after correcto (0→10)');

  // 2. Segunda entrada de 10 a $200 → promedio ponderado = 150.
  await routes['POST /inventory/stock/receive'].handler({ tenant: currentTenant, user: { sub: 'user-1' }, body: { warehouseId: 'wh-1', productId: 'prod-1', variantId: 'var-1', quantity: 10, unitCost: 200 } });
  assert(sl().quantity === 20, 'entrada +10 → quantity=20');
  assert(sl().averageCost === 150, 'promedio ponderado (10×100+10×200)/20 = 150');

  // 3. Salida de 3 (venta) → descuenta stock + ledger.
  await routes['POST /inventory/stock/issue'].handler({ tenant: currentTenant, user: { sub: 'user-1' }, body: { warehouseId: 'wh-1', productId: 'prod-1', variantId: 'var-1', quantity: 3 } });
  assert(sl().quantity === 17, 'salida -3 → quantity=17');
  assert(state.productStock['prod-1'] === 17, 'salida → Product.stock=17');
  const sale = state.movements[state.movements.length - 1]!;
  assert(sale.type === 'salida' && sale.quantity === -3, 'movimiento salida (delta=-3)');
  assert(sale.quantityBefore === 20 && sale.quantityAfter === 17, 'ledger salida before/after (20→17)');

  // 4. Salida que excede stock → 400.
  let rejected = false;
  try {
    await routes['POST /inventory/stock/issue'].handler({ tenant: currentTenant, user: { sub: 'user-1' }, body: { warehouseId: 'wh-1', productId: 'prod-1', variantId: 'var-1', quantity: 999 } });
  } catch (e) {
    rejected = (e as { statusCode?: number }).statusCode === 400;
  }
  assert(rejected, 'salida > stock → BadRequest (no-negativo)');

  console.log('PASS 8/8');
})();
