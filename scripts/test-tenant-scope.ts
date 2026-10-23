/**
 * Smoke test de t44 (F14/F15): scoping fail-closed en lecturas de plugins.
 *
 * Verifica que `resolveScope` (usado por los bloques de negocio en sus GET)
 * devuelve un fragmento `where` que encierra al usuario en SU organización
 * (o su cadena si es admin de la raíz), de modo que una sucursal no lee datos
 * ajenos. Además verifica (estático) que el plugin organizaciones aplicó
 * `authorize` RBAC en sus rutas de escritura y `requireTenant` en sus lecturas.
 *
 * Ejecutar: pnpm --filter @webs/api exec tsx ../../scripts/test-tenant-scope.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveTenant, resolveScope } from '../apps/api/src/lib/tenant';

// Raíz del repo (scripts/ → ../), para leer archivos de plugins sin depender del cwd.
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

const orgs: Record<string, { chainId: string | null }> = {
  rootOrg: { chainId: null },
  orgA: { chainId: 'rootOrg' },
  orgB: { chainId: 'rootOrg' },
};

const memberships = [
  { id: 'm1', userId: 'u1', organizationId: 'orgA', role: 'member', status: 'active' }, // usuario de sucursal (no admin)
  { id: 'm2', userId: 'u2', organizationId: 'rootOrg', role: 'admin', status: 'active' }, // admin de la raíz
];

const userRoles: Record<string, Array<{ role: { key: string } }>> = {
  u1: [],
  u2: [],
  u3: [{ role: { key: 'super_admin' } }],
};

function makeFastify() {
  const prisma = {
    userRole: {
      findMany: async ({ where }: { where: { userId: string } }) => userRoles[where.userId] ?? [],
    },
    membership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        memberships.find((m) => {
          if (where.userId && m.userId !== (where.userId as string)) return false;
          if (where.organizationId && m.organizationId !== (where.organizationId as string)) return false;
          if (where.status && m.status !== (where.status as string)) return false;
          const roleFilter = (where.role as { in?: string[] } | undefined)?.in;
          if (roleFilter && !roleFilter.includes(m.role)) return false;
          return true;
        }) ?? null,
    },
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) => orgs[where.id] ?? null,
      findMany: async ({ where }: { where: { OR?: Array<Record<string, string>> } }) => {
        const or = where.OR ?? [];
        return Object.entries(orgs)
          .filter(([id, o]) =>
            or.some(
              (c) => (c.id !== undefined && c.id === id) || (c.chainId !== undefined && c.chainId === o.chainId),
            ),
          )
          .map(([id]) => ({ id }));
      },
    },
  };
  return { prisma };
}

function makeRequest(userId: string, headers: Record<string, string>) {
  return { user: { sub: userId }, headers };
}

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`PASS: ${name}`);
  else {
    console.error(`FAIL: ${name}`);
    failures += 1;
  }
}

(async () => {
  const fastify = makeFastify() as never;

  // F15: usuario de sucursal (no admin) → scope encerrado en SU organización.
  const t1 = await resolveTenant(fastify, makeRequest('u1', {}) as never);
  const s1 = await resolveScope(fastify, t1);
  check(
    'branch user scope == own org (orgA), no data leak',
    (s1.organizationId as string) === 'orgA',
  );

  // F15: admin de la raíz → scope consolidado (su cadena), no una sola org.
  const t2 = await resolveTenant(fastify, makeRequest('u2', {}) as never);
  const s2 = await resolveScope(fastify, t2);
  const inList = (s2.organizationId as { in?: string[] })?.in ?? [];
  check(
    'chain admin scope == consolidated chain (rootOrg+orgA+orgB)',
    Array.isArray(inList) && ['rootOrg', 'orgA', 'orgB'].every((id) => inList.includes(id)),
  );

  // F15: super_admin sin org → scope vacío ({}), ve todo (excepción RBAC).
  const t3 = await resolveTenant(fastify, makeRequest('u3', {}) as never);
  const s3 = await resolveScope(fastify, t3);
  check('super_admin scope == {} (all chains)', Object.keys(s3).length === 0);

  // F14 (estático): organizaciones aplicó authorize RBAC en escrituras.
  const orgSrc = readFileSync(`${repoRoot}plugins/organizaciones/src/server.ts`, 'utf8');
  for (const perm of ['organization.manage', 'membership.manage', 'attendance.manage']) {
    check(`organizaciones RBAC: authorize('${perm}') presente`, orgSrc.includes(`authorize('${perm}')`));
  }
  check('organizaciones scoping: requireTenant en lecturas (GET /organizations)', orgSrc.includes("get('/organizations', { preHandler: [authenticate, requireTenant] }"));
  check('organizaciones scoping: requireTenant en lecturas (GET /memberships)', orgSrc.includes("get('/memberships', { preHandler: [authenticate, requireTenant] }"));

  // F15 (estático): los bloques de negocio aplicaron resolveScope en sus GET.
  for (const f of ['ecommerce', 'inventario', 'pos', 'facturacion']) {
    const src = readFileSync(`${repoRoot}plugins/${f}/src/server.ts`, 'utf8');
    check(`F15: plugins/${f} usa resolveScope`, src.includes('resolveScope(request)'));
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) fallaron`);
    process.exit(1);
  }
  console.log('\nTodos los checks de t44 (F14/F15) pasaron.');
})();
