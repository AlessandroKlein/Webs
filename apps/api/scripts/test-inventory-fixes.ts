import stockRoutes from '../src/modules/inventory/stock';
import inventoryRoutes from '../src/modules/inventory/routes';

// Smoke (sin DB) t195: cubre F1 (movimiento sin variantId explícito resuelve la
// variante implícita), F2 (transfer crea el nivel de destino si no existe) y F3
// (POST /products con SKU duplicado → 409 sin dejar Product huérfano/committeado).
type Where = Record<string, unknown>;

const ROOT = '00000000-0000-4000-8000-000000000001';
const currentTenant = { organizationId: 'org-1', chainId: 'root-1', isSuperAdmin: false, isChainAdmin: false };

interface Level {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  averageCost: number;
  minQuantity: number;
  criticalQuantity: number;
}

const state: {
  levels: Record<string, Level>;
  movements: Array<Record<string, unknown>>;
  productStock: Record<string, number>;
  committedProducts: string[];
} = {
  levels: {
    'wh-1|prod-1|var-1': {
      id: 'sl-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 10,
      averageCost: 0,
      minQuantity: 5,
      criticalQuantity: 2,
    },
  },
  movements: [],
  productStock: {},
  committedProducts: [],
};

let inTx = false;
let txProducts: string[] = [];
let productCounter = 0;
const slKey = (w: Where): string => `${w.warehouseId}|${w.productId}|${w.variantId ?? 'null'}`;

const fakeDb: Record<string, unknown> = {
  // $transaction con rollback: si la callback lanza, los productos creados se descartan.
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    inTx = true;
    txProducts = [];
    try {
      const r = await fn(fakeDb);
      state.committedProducts.push(...txProducts);
      return r;
    } catch (e) {
      txProducts = [];
      throw e;
    } finally {
      inTx = false;
    }
  },
  product: {
    create: async (args: { data: Where }) => {
      const id = `prod-${++productCounter}`;
      (inTx ? txProducts : state.committedProducts).push(id);
      return { id, ...args.data };
    },
    findFirst: async () => null,
    updateMany: async (args: { where: { id: string }; data: Where }) => {
      state.productStock[args.where.id] = args.data.stock as number;
      return { count: 1 };
    },
  },
  variant: {
    findFirst: async (args: { where: Where }) => {
      // F1/F2: la variante implícita del producto.
      if (args.where.productId === 'prod-1') return { id: 'var-1' };
      return null;
    },
    // F3: SKU duplicado → P2002.
    create: async () => {
      const e = new Error('duplicate') as Error & { code?: string; meta?: unknown };
      e.code = 'P2002';
      e.meta = { target: ['sku'] };
      throw e;
    },
  },
  warehouse: {
    findFirst: async () => ({ id: 'wh-1', isDefault: true }),
    create: async (args: { data: Where }) => ({ id: 'wh-new', ...args.data }),
  },
  stockLevel: {
    findFirst: async (args: { where: Where }) => state.levels[slKey(args.where)] ?? null,
    create: async (args: { data: Where }) => {
      const lvl: Level = {
        id: `sl-${Object.keys(state.levels).length + 1}`,
        organizationId: args.data.organizationId as string,
        warehouseId: args.data.warehouseId as string,
        productId: args.data.productId as string,
        variantId: (args.data.variantId as string | null) ?? null,
        quantity: (args.data.quantity as number) ?? 0,
        averageCost: (args.data.averageCost as number) ?? 0,
        minQuantity: (args.data.minQuantity as number) ?? 0,
        criticalQuantity: (args.data.criticalQuantity as number) ?? 0,
      };
      state.levels[slKey(lvl)] = lvl;
      return lvl;
    },
    update: async (args: { where: { id: string }; data: Where }) => {
      const sl = Object.values(state.levels).find((s) => s.id === args.where.id);
      if (sl) Object.assign(sl, args.data);
      return sl;
    },
    aggregate: async (args: { where: Where }) => {
      const qty = Object.values(state.levels)
        .filter((s) => s.organizationId === args.where.organizationId && s.productId === args.where.productId)
        .reduce((sum, s) => sum + s.quantity, 0);
      return { _sum: { quantity: qty } };
    },
    findMany: async () => Object.values(state.levels),
  },
  stockMovement: {
    create: async (args: { data: Where }) => {
      state.movements.push(args.data);
      return args.data;
    },
    findMany: async () => state.movements,
    findFirst: async () => null,
  },
  inventoryLot: { create: async (a: unknown) => a, findMany: async () => [], update: async (a: unknown) => a },
};

const routes: Record<string, { handler: (req: Where, reply?: unknown) => Promise<unknown> }> = {};

const fakeFastify: Record<string, unknown> = {
  prisma: fakeDb,
  authenticate: async () => {},
  authorize: () => async () => {},
  requireTenant: async () => {},
  resolveTenant: async () => currentTenant,
  resolveScope: async (tenant: { organizationId?: string | null }) => ({ organizationId: tenant?.organizationId ?? ROOT }),
  get: (path: string, _o: unknown, handler: (req: Where) => Promise<unknown>) => { routes[`GET ${path}`] = { handler }; },
  post: (path: string, _o: unknown, handler: (req: Where) => Promise<unknown>) => { routes[`POST ${path}`] = { handler }; },
  patch: (path: string, _o: unknown, handler: (req: Where) => Promise<unknown>) => { routes[`PATCH ${path}`] = { handler }; },
  delete: (path: string, _o: unknown, handler: (req: Where) => Promise<unknown>) => { routes[`DELETE ${path}`] = { handler }; },
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};

(async () => {
  await stockRoutes(fakeFastify as never);
  await inventoryRoutes(fakeFastify as never);

  // F1: movimiento SIN variantId explícito → resuelve la variante implícita.
  await routes['POST /inventory/stock/receive'].handler({
    tenant: currentTenant,
    user: { sub: 'user-1' },
    body: { warehouseId: 'wh-1', productId: 'prod-1', quantity: 5 },
  });
  assert(state.levels['wh-1|prod-1|var-1']!.quantity === 15, 'F1: receive sin variantId → resuelve variante implícita (10+5=15)');

  // F2: transfer a un almacén destino SIN nivel previo → crea el nivel.
  await routes['POST /inventory/stock/transfer'].handler({
    tenant: currentTenant,
    user: { sub: 'user-1' },
    body: { fromWarehouseId: 'wh-1', toWarehouseId: 'wh-2', productId: 'prod-1', quantity: 3 },
  });
  assert(state.levels['wh-1|prod-1|var-1']!.quantity === 12, 'F2: salida origen (15-3=12)');
  assert(state.levels['wh-2|prod-1|var-1']!.quantity === 3, 'F2: nivel destino creado con quantity=3');

  // F3: POST /products con SKU duplicado → 409 sin dejar Product committeado.
  const before = state.committedProducts.length;
  let conflict = false;
  try {
    await routes['POST /inventory/products'].handler({
      tenant: currentTenant,
      user: { sub: 'user-1' },
      body: { title: 'Producto', price: 1000, stock: 5, sku: 'DUP' },
    });
  } catch (e) {
    conflict = (e as { statusCode?: number }).statusCode === 409;
  }
  assert(conflict, 'F3: SKU duplicado → ConflictError 409');
  assert(state.committedProducts.length === before, 'F3: rollback — no quedó Product huérfano/committeado');

  console.log('PASS 5/5');
})();
