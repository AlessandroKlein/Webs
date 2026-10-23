/* eslint-disable */
// Smoke test ADR-0017 (t85): resolución de organización por hostname/subdominio.
// Ejecutar: pnpm --filter @webs/api exec tsx ../../scripts/test-tenant-hostname.ts
import { resolveTenant, resolveTenantByHostname } from '../src/lib/tenant';

type Org = { id: string; chainId: string | null; domain: string | null };
const orgs: Org[] = [
  { id: 'org-root', chainId: null, domain: 'root.dominio.com' },
  { id: 'org-norte', chainId: 'org-root', domain: 'norte.dominio.com' },
];

type Member = { userId: string; organizationId: string; role: string; status: string };
const members: Member[] = [
  { userId: 'u1', organizationId: 'org-norte', role: 'member', status: 'active' },
  { userId: 'u-admin', organizationId: 'org-root', role: 'admin', status: 'active' },
];

function makePrisma() {
  return {
    organization: {
      findUnique: async ({ where }: any) => {
        if (where.domain) return orgs.find((o) => o.domain === where.domain) ?? null;
        if (where.id) return orgs.find((o) => o.id === where.id) ?? null;
        return null;
      },
    },
    membership: {
      findFirst: async ({ where }: any) => {
        const m = members.find((m) => {
          if (where.userId && m.userId !== where.userId) return false;
          if (where.organizationId && m.organizationId !== where.organizationId) return false;
          if (where.status && m.status !== where.status) return false;
          if (where.role) {
            if (where.role.in) return where.role.in.includes(m.role);
            if (m.role !== where.role) return false;
          }
          return true;
        });
        return m ? { id: 'm1', organizationId: m.organizationId, role: m.role } : null;
      },
    },
    userRole: {
      findMany: async ({ where }: any) => {
        if (where.userId === 'u-super') return [{ role: { key: 'super_admin' } }];
        return [];
      },
    },
  };
}

const mkReq = (headers: Record<string, string>, user?: any) => ({ headers, user } as any);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  // 1. Host header match
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const id = await resolveTenantByHostname(fastify, mkReq({ host: 'norte.dominio.com' }));
    check('hostname match → org id', id === 'org-norte');
  }
  // 2. Host with port stripped
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const id = await resolveTenantByHostname(fastify, mkReq({ host: 'NORTE.dominio.com:8080' }));
    check('hostname port+casing stripped', id === 'org-norte');
  }
  // 3. X-Forwarded-Host takes precedence
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const id = await resolveTenantByHostname(fastify, mkReq({ host: 'root.dominio.com', 'x-forwarded-host': 'norte.dominio.com' }));
    check('x-forwarded-host precedence', id === 'org-norte');
  }
  // 4. Unknown host → null
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const id = await resolveTenantByHostname(fastify, mkReq({ host: 'otra.dominio.com' }));
    check('unknown host → null', id === null);
  }
  // 5. Non-super user with membership on hostname org → scoped to that org
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const tenant = await resolveTenant(fastify, mkReq({ host: 'norte.dominio.com' }, { sub: 'u1', orgId: 'org-root' }));
    check('member scoped by hostname (ignores JWT orgId)', tenant.organizationId === 'org-norte' && tenant.chainId === 'org-root');
  }
  // 6. Non-super user WITHOUT membership on hostname org → fail-closed null
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const tenant = await resolveTenant(fastify, mkReq({ host: 'norte.dominio.com' }, { sub: 'u-x' }));
    check('no membership on hostname org → null (fail-closed)', tenant.organizationId === null);
  }
  // 7. super_admin no header → hostname org
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const tenant = await resolveTenant(fastify, mkReq({ host: 'norte.dominio.com' }, { sub: 'u-super' }));
    check('super_admin default to hostname org', tenant.organizationId === 'org-norte');
  }
  // 8. super_admin X-Org-Id overrides hostname
  {
    const fastify = { prisma: makePrisma(), redis: null } as any;
    const tenant = await resolveTenant(fastify, mkReq({ host: 'norte.dominio.com', 'x-org-id': 'org-root' }, { sub: 'u-super' }));
    check('super_admin X-Org-Id overrides hostname', tenant.organizationId === 'org-root');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
