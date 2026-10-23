import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Plugin de organizaciones multi-tenant + membresías + asistencia por QR.
 * Rutas bajo `/api/v1/plugins/organizaciones`. Requiere sesión (authenticate),
 * RBAC (authorize) y scoping multi-tenant fail-closed (requireTenant).
 */
export default definePlugin(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const authorize = (fastify as unknown as { authorize: unknown }).authorize as (
      permission: string,
    ) => unknown;
    const requireTenant = (fastify as unknown as {
      requireTenant?: (req: unknown, reply: unknown) => Promise<void>;
    }).requireTenant;
    const resolveScope = async (request: unknown): Promise<Record<string, unknown>> => {
      const api = fastify as unknown as {
        resolveScope?: (tenant: unknown) => Promise<Record<string, unknown>>;
        resolveTenant?: (req: unknown) => Promise<unknown>;
      };
      if (api.resolveTenant && api.resolveScope) return api.resolveScope(await api.resolveTenant(request));
      return { organizationId: ROOT_ORG_ID };
    };

    const resolveTenant = (fastify as unknown as {
      resolveTenant?: (req: unknown) => Promise<{
        organizationId?: string | null;
        chainId?: string | null;
        isSuperAdmin?: boolean;
        isChainAdmin?: boolean;
      }>;
    }).resolveTenant;

    // Scoping específico para Organization (su PK es `id`, NO tiene `organizationId`):
    // - super_admin sin org → {} (ve todo)
    // - admin de cadena → raíz + sucursales ({ OR: [{ id: chainId }, { chainId }] })
    // - sucursal/usuario → solo su org ({ id: organizationId })
    // NO usar resolveScope genérico aquí (produce `organizationId`, que Organization no tiene).
    const resolveOrgScope = async (request: unknown): Promise<Record<string, unknown>> => {
      const tenant = resolveTenant ? await resolveTenant(request) : null;
      const orgId = tenant?.organizationId ?? null;
      const chainId = tenant?.chainId ?? null;
      const isSuperAdmin = Boolean(tenant?.isSuperAdmin);
      const isChainAdmin = Boolean(tenant?.isChainAdmin);
      if (isSuperAdmin && !orgId) return {};
      if (isChainAdmin && chainId) return { OR: [{ id: chainId }, { chainId }] };
      return { id: orgId ?? ROOT_ORG_ID };
    };

    // -------- Organizaciones (multi-tenant) --------

    fastify.get('/organizations', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const orgs = await db.organization.findMany({ where: await resolveOrgScope(request), orderBy: { createdAt: 'desc' } });
      const counts = await db.membership.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((c: { organizationId: string; _count: { _all: number } }) => [c.organizationId, c._count._all]));
      return orgs.map((o: { id: string }) => ({ ...o, memberCount: countMap.get(o.id) ?? 0 }));
    });

    fastify.post('/organizations', { preHandler: [authenticate, authorize('organization.manage')] }, async (request: unknown) => {
      const { body } = request as {
        body?: {
          name?: string; slug?: string; plan?: string; active?: boolean; shareInventory?: boolean; logoUrl?: string;
          type?: 'standalone' | 'chain' | 'branch'; parentId?: string | null;
        };
      };
      const type = body?.type ?? 'standalone';
      const parentId = body?.parentId ?? null;
      // chainId desnormalizado: sucursal → raíz del padre; raíz/standalone → null.
      let chainId: string | null = null;
      if (parentId) {
        const parent = await db.organization.findUnique({ where: { id: parentId }, select: { chainId: true } });
        chainId = parent?.chainId ?? parentId;
      }
      return db.organization.create({
        data: {
          name: body?.name ?? '',
          slug: body?.slug || null,
          plan: body?.plan ?? 'free',
          active: body?.active ?? true,
          shareInventory: body?.shareInventory ?? false,
          logoUrl: body?.logoUrl || null,
          type,
          parentId,
          chainId,
        },
      });
    });

    fastify.patch('/organizations/:id', { preHandler: [authenticate, authorize('organization.manage')] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: {
          name?: string; slug?: string | null; plan?: string; active?: boolean; shareInventory?: boolean; logoUrl?: string | null;
          type?: 'standalone' | 'chain' | 'branch'; parentId?: string | null;
        };
      };
      const data: Record<string, unknown> = {};
      if (body?.name !== undefined) data.name = body.name;
      if (body?.slug !== undefined) data.slug = body.slug;
      if (body?.plan !== undefined) data.plan = body.plan;
      if (body?.active !== undefined) data.active = body.active;
      if (body?.shareInventory !== undefined) data.shareInventory = body.shareInventory;
      if (body?.logoUrl !== undefined) data.logoUrl = body.logoUrl;
      if (body?.type !== undefined) data.type = body.type;
      if (body?.parentId !== undefined) {
        data.parentId = body.parentId;
        // Recalcula chainId al reparentar: sucursal → raíz del padre; sin padre → raíz propia.
        if (body.parentId) {
          const parent = await db.organization.findUnique({ where: { id: body.parentId }, select: { chainId: true } });
          data.chainId = parent?.chainId ?? body.parentId;
        } else {
          data.chainId = null;
        }
      }
      return db.organization.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/organizations/:id', { preHandler: [authenticate, authorize('organization.manage')] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const id = params?.id ?? '';
      await db.attendanceRecord.deleteMany({ where: { organizationId: id } });
      await db.membership.deleteMany({ where: { organizationId: id } });
      return db.organization.delete({ where: { id } });
    });

    // -------- Planes de membresía --------

    fastify.get('/plans', { preHandler: [authenticate] }, async () =>
      db.membershipPlan.findMany({ orderBy: { name: 'asc' } }),
    );

    fastify.post('/plans', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { body } = request as { body?: { name?: string; price?: number; durationDays?: number; features?: unknown[]; active?: boolean } };
      return db.membershipPlan.create({
        data: {
          name: body?.name ?? '',
          price: Number(body?.price ?? 0),
          durationDays: Number(body?.durationDays ?? 30),
          features: body?.features ?? [],
          active: body?.active ?? true,
        },
      });
    });

    fastify.patch('/plans/:id', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { name?: string; price?: number; durationDays?: number; features?: unknown[]; active?: boolean };
      };
      const data: Record<string, unknown> = {};
      if (body?.name !== undefined) data.name = body.name;
      if (body?.price !== undefined) data.price = Number(body.price);
      if (body?.durationDays !== undefined) data.durationDays = Number(body.durationDays);
      if (body?.features !== undefined) data.features = body.features;
      if (body?.active !== undefined) data.active = body.active;
      return db.membershipPlan.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/plans/:id', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.membershipPlan.delete({ where: { id: params?.id } });
    });

    // -------- Membresías --------

    fastify.get('/memberships', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const rows = await db.membership.findMany({ where: await resolveScope(request), orderBy: { createdAt: 'desc' } });
      const orgs = await db.organization.findMany({ select: { id: true, name: true } });
      const users = await db.user.findMany({ select: { id: true, displayName: true, email: true } });
      const orgMap = new Map(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));
      const userMap = new Map(users.map((u: { id: string; displayName: string | null; email: string }) => [u.id, u.displayName ?? u.email]));
      return rows.map((m: { organizationId: string; userId: string }) => ({
        ...m,
        organizationName: orgMap.get(m.organizationId) ?? m.organizationId,
        userName: userMap.get(m.userId) ?? m.userId,
      }));
    });

    fastify.post('/memberships', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { body } = request as {
        body?: { organizationId?: string; userId?: string; role?: string; plan?: string; status?: string; endDate?: string };
      };
      const qrcode = crypto.randomUUID();
      return db.membership.create({
        data: {
          organizationId: body?.organizationId ?? '',
          userId: body?.userId ?? '',
          role: body?.role ?? 'member',
          plan: body?.plan ?? 'free',
          status: body?.status ?? 'active',
          endDate: body?.endDate ? new Date(body.endDate) : null,
          qrcode,
        },
      });
    });

    fastify.patch('/memberships/:id', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { role?: string; plan?: string; status?: string; endDate?: string | null; renew?: boolean };
      };
      const data: Record<string, unknown> = {};
      if (body?.role !== undefined) data.role = body.role;
      if (body?.plan !== undefined) data.plan = body.plan;
      if (body?.status !== undefined) data.status = body.status;
      if (body?.renew) {
        const current = await db.membership.findUnique({ where: { id: params?.id } });
        const plan = current?.plan ? await db.membershipPlan.findMany({ where: { name: current.plan } }) : [];
        const durationDays = plan?.[0]?.durationDays ?? 30;
        data.endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
        data.status = 'active';
      } else if (body?.endDate !== undefined) {
        data.endDate = body.endDate ? new Date(body.endDate) : null;
      }
      return db.membership.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/memberships/:id', { preHandler: [authenticate, authorize('membership.manage')] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      await db.attendanceRecord.deleteMany({ where: { membershipId: params?.id } });
      return db.membership.delete({ where: { id: params?.id } });
    });

    // -------- Asistencia por QR --------

    fastify.post('/attendance/scan', { preHandler: [authenticate, authorize('attendance.manage')] }, async (request: unknown) => {
      const { body } = request as { body?: { qrcode?: string } };
      const qrcode = body?.qrcode;
      if (!qrcode) return { ok: false, error: 'QR vacío' };
      const membership = await db.membership.findUnique({ where: { qrcode } });
      if (!membership) return { ok: false, error: 'Membresía no encontrada' };
      if (membership.status !== 'active') return { ok: false, error: `Membresía ${membership.status}` };
      if (membership.endDate && new Date(membership.endDate) < new Date()) {
        return { ok: false, error: 'Membresía vencida' };
      }
      const org = await db.organization.findUnique({ where: { id: membership.organizationId } });
      const record = await db.attendanceRecord.create({
        data: {
          organizationId: membership.organizationId,
          membershipId: membership.id,
          userId: membership.userId,
          method: 'qr',
        },
      });
      return { ok: true, membership, organization: org?.name ?? null, record };
    });

    // -------- Asistencia externa (escáneres / sistemas automáticos) --------
    // Endpoint PÚBLICO (sin `authenticate`) para que un escáner físico o un
    // sistema automático registre asistencia. Acepta una API key opcional por
    // header `X-Scanner-Key` (y un `scannerId` opcional en el body) que se
    // guarda en AttendanceRecord.method como `external:<scannerId>` para
    // auditoría. La validación de membresía es idéntica a `/attendance/scan`.
    fastify.post('/attendance/external', async (request: unknown) => {
      const { body, headers } = request as {
        body?: { qrcode?: string; scannerId?: string };
        headers?: Record<string, string | string[] | undefined>;
      };
      const qrcode = body?.qrcode;
      if (!qrcode) return { ok: false, error: 'QR vacío' };
      const headerValue = headers?.['x-scanner-key'];
      const scannerKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      const scannerId = body?.scannerId ?? (typeof scannerKey === 'string' && scannerKey.trim() ? scannerKey.trim() : '');
      const membership = await db.membership.findUnique({ where: { qrcode } });
      if (!membership) return { ok: false, error: 'Membresía no encontrada' };
      if (membership.status !== 'active') return { ok: false, error: `Membresía ${membership.status}` };
      if (membership.endDate && new Date(membership.endDate) < new Date()) {
        return { ok: false, error: 'Membresía vencida' };
      }
      const org = await db.organization.findUnique({ where: { id: membership.organizationId } });
      const method = scannerId ? `external:${scannerId}` : 'external';
      const record = await db.attendanceRecord.create({
        data: {
          organizationId: membership.organizationId,
          membershipId: membership.id,
          userId: membership.userId,
          method,
        },
      });
      return { ok: true, membership, organization: org?.name ?? null, record };
    });

    fastify.get('/attendance', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { query } = request as { query?: { organizationId?: string; membershipId?: string } };
      const where: Record<string, unknown> = { ...(await resolveScope(request)) };
      const and: Array<Record<string, unknown>> = [];
      if (query?.organizationId) and.push({ organizationId: query.organizationId });
      if (query?.membershipId) and.push({ membershipId: query.membershipId });
      if (and.length) where.AND = and;
      return db.attendanceRecord.findMany({ where, orderBy: { timestamp: 'desc' }, take: 500 });
    });

    fastify.get('/attendance/stats', { preHandler: [authenticate, requireTenant] }, async (request: unknown) => {
      const { query } = request as { query?: { organizationId?: string; days?: string } };
      const days = Number(query?.days ?? 30);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const where: Record<string, unknown> = { ...(await resolveScope(request)), timestamp: { gte: since } };
      const and: Array<Record<string, unknown>> = [];
      if (query?.organizationId) and.push({ organizationId: query.organizationId });
      if (and.length) where.AND = and;
      const records = await db.attendanceRecord.findMany({ where, select: { timestamp: true } });
      const byDay = new Map<string, number>();
      for (const r of records as Array<{ timestamp: Date }>) {
        const key = r.timestamp.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
      return { total: records.length, byDay: Object.fromEntries(byDay) };
    });
  },
});
