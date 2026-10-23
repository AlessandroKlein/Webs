/**
 * Smoke test del gap G2 (t39): `resolveTenant` debe respetar X-Org-Id/X-Chain-Id
 * para admins de cadena/sucursal que NO son super_admin, y fallar cerrado (403)
 * cuando el usuario no tiene alcance sobre la org/rama solicitada.
 *
 * Ejecutar: pnpm --filter @webs/api exec tsx ../../scripts/test-tenant-g2.ts
 */
import { resolveTenant } from '../apps/api/src/lib/tenant';

// Estructura multi-tenant de prueba: rootOrg (raíz) + orgA/orgB (sucursales).
const orgs: Record<string, { chainId: string | null }> = {
  rootOrg: { chainId: null },
  orgA: { chainId: 'rootOrg' },
  orgB: { chainId: 'rootOrg' },
};

const memberships = [
  { id: 'm1', userId: 'u1', organizationId: 'orgA', role: 'admin', status: 'active' }, // admin de sucursal
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

  // G2: admin de sucursal cambia a su propia sucursal vía X-Org-Id → permitido.
  const t1 = await resolveTenant(fastify, makeRequest('u1', { 'x-org-id': 'orgA' }) as never);
  check('branch admin → own branch (X-Org-Id=orgA) → orgA + chainId=rootOrg + no chain-admin', t1.organizationId === 'orgA' && t1.chainId === 'rootOrg' && t1.isChainAdmin === false);

  // G2: admin de sucursal intenta ver OTRA sucursal → negado (null → 403).
  const t2 = await resolveTenant(fastify, makeRequest('u1', { 'x-org-id': 'orgB' }) as never);
  check('branch admin → other branch (X-Org-Id=orgB) denied → null', t2.organizationId === null);

  // G2: admin de sucursal intenta vista consolidada → negado (null → 403).
  const t3 = await resolveTenant(fastify, makeRequest('u1', { 'x-chain-id': 'rootOrg' }) as never);
  check('branch admin → consolidated (X-Chain-Id=rootOrg) denied → null', t3.organizationId === null);

  // G2: admin de la raíz obtiene vista consolidada → root + isChainAdmin.
  const t4 = await resolveTenant(fastify, makeRequest('u2', { 'x-chain-id': 'rootOrg' }) as never);
  check('chain admin → consolidated (X-Chain-Id=rootOrg) → rootOrg + isChainAdmin', t4.organizationId === 'rootOrg' && t4.chainId === 'rootOrg' && t4.isChainAdmin === true);

  // super_admin puede elegir cualquier org vía header.
  const t5 = await resolveTenant(fastify, makeRequest('u3', { 'x-org-id': 'orgB' }) as never);
  check('super_admin → any org via header → orgB', t5.organizationId === 'orgB' && t5.isSuperAdmin === true);

  // Sin header: admin de sucursal cae a su membresía por defecto.
  const t6 = await resolveTenant(fastify, makeRequest('u1', {}) as never);
  check('branch admin → default membership org → orgA', t6.organizationId === 'orgA');

  if (failures > 0) {
    console.error(`\n${failures} check(s) fallaron`);
    process.exit(1);
  }
  console.log('\nTodos los checks de G2 pasaron.');
})();
