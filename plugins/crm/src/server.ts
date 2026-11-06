import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Etapas FIJAS del pipeline (no configurables desde settings). */
const DEAL_STAGES = ['prospecting', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'task'] as const;

type Reply = { status: (code: number) => { send: (body: unknown) => unknown } };

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const isStage = (v: unknown): v is (typeof DEAL_STAGES)[number] =>
  typeof v === 'string' && (DEAL_STAGES as readonly string[]).includes(v);
const isActivityType = (v: unknown): v is (typeof ACTIVITY_TYPES)[number] =>
  typeof v === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(v);

/** Importe en centavos: entero >= 0; `null` si no es válido. */
const parseAmount = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000_000_000 ? n : null;
};

/** Fecha ISO válida o `null`. */
const parseDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(asStr(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

type TenantCtx = { organizationId?: string | null; isSuperAdmin?: boolean };
const tenantOf = (request: unknown): TenantCtx | undefined =>
  (request as { tenant?: TenantCtx }).tenant;

const forbidden = (message: string): Error =>
  Object.assign(new Error(message), { statusCode: 403 });


/**
 * Plugin de CRM: contactos, empresas, deals (pipeline) y actividades.
 * Rutas bajo `/api/v1/plugins/crm`. Requiere sesión, RBAC (crm.read/crm.write)
 * y scoping multi-tenant fail-closed (requireTenant + resolveScope).
 */
export default definePlugin(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (req: unknown) => Promise<void>;
    const authorize = (fastify as unknown as { authorize: unknown }).authorize as (permission: string) => unknown;
    const requireTenant = (fastify as unknown as { requireTenant?: (req: unknown, reply: unknown) => Promise<void> }).requireTenant;

    const resolveScope = async (request: unknown): Promise<Record<string, unknown>> => {
      const tenant = tenantOf(request);
      const api = fastify as unknown as { resolveScope?: (tenant: unknown) => Promise<Record<string, unknown>> };
      if (!tenant || !api.resolveScope) throw forbidden('No se pudo resolver la organización activa');
      return api.resolveScope(tenant);
    };

    // Para writes, una única organización (la del tenant activo); un id de otra
    // org no se acepta: los reads/listados usan resolveScope (fail-closed).
    const resolveOrgId = (request: unknown): string => {
      const organizationId = tenantOf(request)?.organizationId;
      if (!organizationId) throw forbidden('Se requiere una organización activa');
      return organizationId;
    };

    const read = { preHandler: [authenticate, authorize('crm.read'), requireTenant] };
    const write = { preHandler: [authenticate, authorize('crm.write'), requireTenant] };

    // -------- Contactos --------

    fastify.get('/contacts', read, async (request: unknown) => {
      const q = (request as { query?: { search?: string } }).query?.search?.trim() ?? '';
      const scope = await resolveScope(request);
      const where: Record<string, unknown> = { ...scope };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ];
      }
      return db.crmContact.findMany({ where, orderBy: { name: 'asc' } });
    });

    fastify.post('/contacts', write, async (request: unknown) => {
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
      return db.crmContact.create({
        data: {
          organizationId: await resolveOrgId(request),
          name: asStr(body.name),
          email: body.email ? asStr(body.email) : null,
          phone: body.phone ? asStr(body.phone) : null,
          companyId: body.companyId ? asStr(body.companyId) : null,
          title: body.title ? asStr(body.title) : null,
          ownerId: body.ownerId ? asStr(body.ownerId) : null,
          metadata,
        },
      });
    });

    fastify.get('/contacts/:id', read, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const row = await db.crmContact.findFirst({ where: { id, ...scope } });
      if (!row) return (reply as Reply).status(404).send({ error: 'Contacto no encontrado' });
      return row;
    });

    fastify.patch('/contacts/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      const scope = await resolveScope(request);
      const existing = await db.crmContact.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Contacto no encontrado' });
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = asStr(body.name);
      if (body.email !== undefined) data.email = body.email ? asStr(body.email) : null;
      if (body.phone !== undefined) data.phone = body.phone ? asStr(body.phone) : null;
      if (body.companyId !== undefined) data.companyId = body.companyId ? asStr(body.companyId) : null;
      if (body.title !== undefined) data.title = body.title ? asStr(body.title) : null;
      if (body.ownerId !== undefined) data.ownerId = body.ownerId ? asStr(body.ownerId) : null;
      if (body.metadata !== undefined) data.metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
      return db.crmContact.update({ where: { id }, data });
    });

    fastify.delete('/contacts/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const existing = await db.crmContact.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Contacto no encontrado' });
      await db.crmContact.delete({ where: { id } });
      return { ok: true };
    });

    // -------- Empresas --------

    fastify.get('/companies', read, async (request: unknown) => {
      const scope = await resolveScope(request);
      return db.crmCompany.findMany({ where: scope, orderBy: { name: 'asc' } });
    });

    fastify.post('/companies', write, async (request: unknown) => {
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      return db.crmCompany.create({
        data: {
          organizationId: await resolveOrgId(request),
          name: asStr(body.name),
          domain: body.domain ? asStr(body.domain) : null,
          industry: body.industry ? asStr(body.industry) : null,
          phone: body.phone ? asStr(body.phone) : null,
          website: body.website ? asStr(body.website) : null,
        },
      });
    });

    fastify.patch('/companies/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      const scope = await resolveScope(request);
      const existing = await db.crmCompany.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Empresa no encontrada' });
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = asStr(body.name);
      if (body.domain !== undefined) data.domain = body.domain ? asStr(body.domain) : null;
      if (body.industry !== undefined) data.industry = body.industry ? asStr(body.industry) : null;
      if (body.phone !== undefined) data.phone = body.phone ? asStr(body.phone) : null;
      if (body.website !== undefined) data.website = body.website ? asStr(body.website) : null;
      return db.crmCompany.update({ where: { id }, data });
    });

    fastify.delete('/companies/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const existing = await db.crmCompany.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Empresa no encontrada' });
      await db.crmCompany.delete({ where: { id } });
      return { ok: true };
    });

    // -------- Deals (pipeline) --------

    fastify.get('/deals', read, async (request: unknown) => {
      const scope = await resolveScope(request);
      return db.crmDeal.findMany({ where: scope, orderBy: { createdAt: 'desc' } });
    });

    fastify.post('/deals', write, async (request: unknown, reply: unknown) => {
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      if (body.stage !== undefined && !isStage(body.stage)) {
        return (reply as Reply).status(400).send({ error: 'Etapa inválida' });
      }
      const amount = body.amount === undefined ? 0 : parseAmount(body.amount);
      if (amount === null) return (reply as Reply).status(400).send({ error: 'Importe inválido (centavos enteros >= 0)' });
      const expectedCloseAt = parseDate(body.expectedCloseAt);
      if (body.expectedCloseAt && !expectedCloseAt) {
        return (reply as Reply).status(400).send({ error: 'Fecha de cierre inválida' });
      }
      return db.crmDeal.create({
        data: {
          organizationId: resolveOrgId(request),
          title: asStr(body.title),
          contactId: body.contactId ? asStr(body.contactId) : null,
          companyId: body.companyId ? asStr(body.companyId) : null,
          amount,
          currency: body.currency ? asStr(body.currency) : 'ARS',
          stage: isStage(body.stage) ? body.stage : 'prospecting',
          probability: body.probability !== undefined && body.probability !== null ? Number(body.probability) : null,
          expectedCloseAt,
          ownerId: body.ownerId ? asStr(body.ownerId) : null,
        },
      });
    });

    fastify.patch('/deals/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      const scope = await resolveScope(request);
      const existing = await db.crmDeal.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Negocio no encontrado' });
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = asStr(body.title);
      if (body.contactId !== undefined) data.contactId = body.contactId ? asStr(body.contactId) : null;
      if (body.companyId !== undefined) data.companyId = body.companyId ? asStr(body.companyId) : null;
      if (body.amount !== undefined) {
        const amount = parseAmount(body.amount);
        if (amount === null) return (reply as Reply).status(400).send({ error: 'Importe inválido (centavos enteros >= 0)' });
        data.amount = amount;
      }
      if (body.currency !== undefined) data.currency = asStr(body.currency);
      if (body.stage !== undefined) {
        if (!isStage(body.stage)) return (reply as Reply).status(400).send({ error: 'Etapa inválida' });
        data.stage = body.stage;
        data.closedAt = body.stage === 'won' || body.stage === 'lost' ? new Date() : null;
      }
      if (body.probability !== undefined) data.probability = body.probability === null ? null : Number(body.probability);
      if (body.expectedCloseAt !== undefined) {
        const expectedCloseAt = parseDate(body.expectedCloseAt);
        if (body.expectedCloseAt && !expectedCloseAt) {
          return (reply as Reply).status(400).send({ error: 'Fecha de cierre inválida' });
        }
        data.expectedCloseAt = expectedCloseAt;
      }
      if (body.ownerId !== undefined) data.ownerId = body.ownerId ? asStr(body.ownerId) : null;
      return db.crmDeal.update({ where: { id }, data });
    });

    fastify.delete('/deals/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const existing = await db.crmDeal.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Negocio no encontrado' });
      await db.crmDeal.delete({ where: { id } });
      return { ok: true };
    });

    fastify.get('/pipeline', read, async (request: unknown) => {
      const scope = await resolveScope(request);
      const deals = await db.crmDeal.findMany({ where: scope, select: { stage: true, amount: true } });
      // Total por etapa en CENTAVOS; no se normaliza moneda (simplificación MVP).
      const stages = DEAL_STAGES.map((stage) => {
        const rows = deals.filter((d: { stage: string }) => d.stage === stage);
        return { stage, count: rows.length, total: rows.reduce((acc: number, d: { amount: number }) => acc + d.amount, 0) };
      });
      return { stages };
    });

    // -------- Actividades --------

    fastify.get('/activities', read, async (request: unknown) => {
      const scope = await resolveScope(request);
      return db.crmActivity.findMany({ where: scope, orderBy: { dueAt: 'asc' } });
    });

    fastify.post('/activities', write, async (request: unknown, reply: unknown) => {
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      if (body.type !== undefined && !isActivityType(body.type)) {
        return (reply as Reply).status(400).send({ error: 'Tipo de actividad inválido' });
      }
      const dueAt = parseDate(body.dueAt);
      if (body.dueAt && !dueAt) return (reply as Reply).status(400).send({ error: 'Fecha inválida' });
      return db.crmActivity.create({
        data: {
          organizationId: await resolveOrgId(request),
          type: isActivityType(body.type) ? body.type : 'task',
          subject: asStr(body.subject),
          notes: body.notes ? asStr(body.notes) : null,
          dueAt,
          contactId: body.contactId ? asStr(body.contactId) : null,
          dealId: body.dealId ? asStr(body.dealId) : null,
        },
      });
    });

    fastify.patch('/activities/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const body = (request as { body?: Record<string, unknown> }).body ?? {};
      const scope = await resolveScope(request);
      const existing = await db.crmActivity.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Actividad no encontrada' });
      const data: Record<string, unknown> = {};
      if (body.type !== undefined) data.type = isActivityType(body.type) ? body.type : existing.type;
      if (body.subject !== undefined) data.subject = asStr(body.subject);
      if (body.notes !== undefined) data.notes = body.notes ? asStr(body.notes) : null;
      if (body.dueAt !== undefined) {
        const dueAt = parseDate(body.dueAt);
        if (body.dueAt && !dueAt) return (reply as Reply).status(400).send({ error: 'Fecha inválida' });
        data.dueAt = dueAt;
      }
      if (body.done !== undefined) data.doneAt = body.done ? new Date() : null;
      if (body.contactId !== undefined) data.contactId = body.contactId ? asStr(body.contactId) : null;
      if (body.dealId !== undefined) data.dealId = body.dealId ? asStr(body.dealId) : null;
      return db.crmActivity.update({ where: { id }, data });
    });

    fastify.delete('/activities/:id', write, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const existing = await db.crmActivity.findFirst({ where: { id, ...scope } });
      if (!existing) return (reply as Reply).status(404).send({ error: 'Actividad no encontrada' });
      await db.crmActivity.delete({ where: { id } });
      return { ok: true };
    });

    fastify.get('/contacts/:id/activities', read, async (request: unknown, reply: unknown) => {
      const id = asStr((request as { params?: { id?: string } }).params?.id);
      const scope = await resolveScope(request);
      const contact = await db.crmContact.findFirst({ where: { id, ...scope } });
      if (!contact) return (reply as Reply).status(404).send({ error: 'Contacto no encontrado' });
      return db.crmActivity.findMany({ where: { ...scope, contactId: id }, orderBy: { dueAt: 'asc' } });
    });
  },
});
