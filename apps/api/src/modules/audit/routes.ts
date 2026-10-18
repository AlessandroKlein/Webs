import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';

interface AuditFilters {
  action?: string;
  resource?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

function buildWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.resource) where.resource = filters.resource;
  if (filters.actorId) where.actorId = filters.actorId;

  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = new Date(filters.from);
  if (filters.to) createdAt.lte = new Date(filters.to);
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

  return where;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/audit',
    {
      schema: {
        tags: ['audit'],
        querystring: {
          type: 'object',
          properties: {
            ...(paginationQuerySchema.properties as object),
            action: { type: 'string' },
            resource: { type: 'string' },
            actorId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('audit.read')],
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const where = buildWhere(request.query as AuditFilters);

      const [items, total] = await fastify.prisma.$transaction([
        fastify.prisma.auditLog.findMany({
          where,
          skip: page * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { id: true, email: true, displayName: true } } },
        }),
        fastify.prisma.auditLog.count({ where }),
      ]);

      return pageResponse(
        items.map((a) => ({
          id: a.id,
          action: a.action,
          resource: a.resource,
          resourceId: a.resourceId,
          metadata: a.metadata,
          ip: a.ip,
          actor: a.actor,
          createdAt: a.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      );
    },
  );

  fastify.get(
    '/audit/export',
    {
      schema: {
        tags: ['audit'],
        querystring: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            resource: { type: 'string' },
            actorId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('audit.read')],
    },
    async (request, reply) => {
      const where = buildWhere(request.query as AuditFilters);
      const items = await fastify.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000,
        include: { actor: { select: { email: true } } },
      });

      const rows: Array<Record<string, unknown>> = items.map((a) => ({
        createdAt: a.createdAt.toISOString(),
        action: a.action,
        resource: a.resource ?? '',
        resourceId: a.resourceId ?? '',
        actor: a.actor?.email ?? '',
        ip: a.ip ?? '',
      }));

      const headers = Object.keys(rows[0] ?? {});
      const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="audit-log.csv"');
      return csv;
    },
  );
}
