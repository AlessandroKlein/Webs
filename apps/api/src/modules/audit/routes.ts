import type { FastifyInstance } from 'fastify';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';

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
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('audit.read')],
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const { action, resource } = request.query as { action?: string; resource?: string };

      const where: Record<string, unknown> = {};
      if (action) where.action = action;
      if (resource) where.resource = resource;

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
}
