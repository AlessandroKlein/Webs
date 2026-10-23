import plugin from '../../../plugins/organizaciones/src/server';

// Smoke (sin DB/Redis reales): verifica que POST/PATCH /organizations aceptan
// `domain`, lo normalizan, validan unicidad y invalidan la caché de routing
// `tenant:domain:<host>` (ADR-0017). El bug MEDIO-1 era que `domain` no se podía
// setear por API (solo psql).

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

const routes: Record<string, Handler> = {};
let redisDels: string[] = [];
const created: Array<Record<string, unknown>> = [];
let updatedData: Record<string, unknown> | undefined;

const fakeDb = {
  organization: {
    findUnique: async (args: { where: Record<string, unknown> }) => {
      // Unicidad de dominio: 'taken.com' ya pertenece a otra org.
      if (args.where?.domain === 'taken.com') return { id: 'org-other' };
      if (args.where?.domain) return null; // dominio libre
      if (args.where?.id) return { id: args.where.id as string, domain: 'old.com' }; // org actual (PATCH)
      return null;
    },
    create: async (args: { data: Record<string, unknown> }) => {
      created.push(args.data);
      return { id: 'org-new', ...args.data };
    },
    update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      updatedData = args.data;
      return { id: args.where.id as string, ...args.data };
    },
  },
};

const makeReply = (): { reply: unknown; rec: { status?: number; body?: unknown } } => {
  const rec: { status?: number; body?: unknown } = {};
  const reply = {
    status: (code: number) => ({
      send: (body: unknown) => {
        rec.status = code;
        rec.body = body;
        return body;
      },
    }),
  };
  return { reply, rec };
};

const fakeFastify: Record<string, unknown> = {
  prisma: fakeDb,
  redis: { del: async (key: string) => void redisDels.push(key) },
  authenticate: async () => {},
  authorize: () => async () => {},
  requireTenant: async () => {},
  resolveTenant: async () => ({ organizationId: 'root-1', chainId: 'root-1', isSuperAdmin: true, isChainAdmin: true }),
  resolveScope: async (tenant: unknown) => ({
    organizationId: (tenant as { organizationId?: string | null })?.organizationId ?? '00000000-0000-4000-8000-000000000001',
  }),
  get: () => {},
  post: (path: string, _opts: unknown, handler: Handler) => {
    routes[path] = handler;
  },
  patch: (path: string, _opts: unknown, handler: Handler) => {
    routes[path] = handler;
  },
  delete: () => {},
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok:', msg);
};

const reset = (): void => {
  redisDels = [];
  created.length = 0;
  updatedData = undefined;
};

(async () => {
  await (plugin as { register: (f: Record<string, unknown>) => Promise<void> }).register(fakeFastify);

  const post = routes['/organizations'];
  const patch = routes['/organizations/:id'];
  assert(Boolean(post) && Boolean(patch), 'rutas /organizations + /organizations/:id registradas');

  // 1. POST normaliza dominio (protocolo/path/puerto → hostname) + invalida caché.
  reset();
  const r1 = await post({ body: { name: 'Sucursal Norte', domain: 'https://Example.com:8080/ruta' } }, makeReply().reply);
  assert(created[0]?.domain === 'example.com', `POST normaliza domain → 'example.com' (got ${String(created[0]?.domain)})`);
  assert((r1 as { domain?: string })?.domain === 'example.com', 'POST responde con el dominio normalizado');
  assert(redisDels.includes('tenant:domain:example.com'), 'POST invalida caché tenant:domain:example.com');

  // 2. POST dominio duplicado → 409.
  reset();
  const { reply: r2Reply, rec: r2Rec } = makeReply();
  await post({ body: { name: 'Dup', domain: 'taken.com' } }, r2Reply);
  assert(r2Rec.status === 409, `POST dominio duplicado → 409 (got ${String(r2Rec.status)})`);
  assert(created.length === 0, 'POST duplicado NO crea la organización');

  // 3. PATCH actualiza dominio + invalida viejo y nuevo.
  reset();
  await patch({ params: { id: 'org-1' }, body: { domain: 'New.com' } }, makeReply().reply);
  assert(updatedData?.domain === 'new.com', `PATCH setea domain → 'new.com' (got ${String(updatedData?.domain)})`);
  assert(redisDels.includes('tenant:domain:old.com'), 'PATCH invalida dominio viejo (old.com)');
  assert(redisDels.includes('tenant:domain:new.com'), 'PATCH invalida dominio nuevo (new.com)');

  // 4. POST sin domain → null (no participa del routing por hostname).
  reset();
  await post({ body: { name: 'Sin dominio' } }, makeReply().reply);
  assert(created[0]?.domain === null, 'POST sin domain → null');

  // 5. POST con domain en blanco → null.
  reset();
  await post({ body: { name: 'Blanco', domain: '   ' } }, makeReply().reply);
  assert(created[0]?.domain === null, 'POST con domain en blanco → null');

  console.log('PASS 5/5');
})();
