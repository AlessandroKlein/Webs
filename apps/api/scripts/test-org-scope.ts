import plugin from '../../../plugins/organizaciones/src/server';

// Smoke (sin DB): verifica que GET /organizations produce el fragmento `where`
// CORRECTO para Organization (PK `id`, NO `organizationId`), que era el bug 500.
type Where = Record<string, unknown>;

let capturedWhere: Where | undefined;
const fakeDb = {
  organization: {
    findMany: async (args: { where?: Where }) => {
      capturedWhere = args.where ?? {};
      return [];
    },
  },
  membership: {
    groupBy: async () => [],
  },
};

let currentTenant: unknown = {};
const routes: Record<string, (req: unknown) => Promise<unknown>> = {};

const fakeFastify: Record<string, unknown> = {
  prisma: fakeDb,
  authenticate: async () => {},
  authorize: () => async () => {},
  requireTenant: async () => {},
  resolveTenant: async () => currentTenant,
  resolveScope: async (tenant: { organizationId?: string | null }) => ({
    organizationId: tenant?.organizationId ?? '00000000-0000-4000-8000-000000000001',
  }),
  get: (path: string, _opts: unknown, handler: (req: unknown) => Promise<unknown>) => {
    routes[path] = handler;
  },
  post: () => {},
  patch: () => {},
  delete: () => {},
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok:', msg);
};

async function run(tenant: unknown): Promise<Where> {
  currentTenant = tenant;
  capturedWhere = undefined;
  await routes['/organizations']({});
  return capturedWhere ?? {};
}

(async () => {
  await (plugin as { register: (f: Record<string, unknown>) => Promise<void> }).register(fakeFastify);

  const superAdmin = await run({ organizationId: null, chainId: null, isSuperAdmin: true, isChainAdmin: true });
  assert(JSON.stringify(superAdmin) === '{}', 'super_admin sin org → {} (ve todo)');

  const chain = await run({ organizationId: 'branch-1', chainId: 'root-1', isSuperAdmin: false, isChainAdmin: true });
  assert(
    JSON.stringify(chain) === JSON.stringify({ OR: [{ id: 'root-1' }, { chainId: 'root-1' }] }),
    'chain admin → OR:[{id:root},{chainId:root}]',
  );

  const branch = await run({ organizationId: 'branch-1', chainId: 'root-1', isSuperAdmin: false, isChainAdmin: false });
  assert(JSON.stringify(branch) === JSON.stringify({ id: 'branch-1' }), 'branch → {id:branch-1}');

  console.log('PASS 3/3');
})();
