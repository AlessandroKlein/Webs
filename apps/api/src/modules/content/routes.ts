import type { FastifyInstance } from 'fastify';
import { ConflictError, ForbiddenError, NotFoundError } from '@webs/core';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { sanitizeLocalized } from '../../lib/sanitize';
import { createContentSchema, updateContentSchema, type ContentStatus, type CreateContentBody, type UpdateContentBody } from './schema';

/**
 * Serializa una entidad de contenido de Prisma al formato de respuesta de la API,
 * convirtiendo las fechas a ISO 8601 y normalizando los campos opcionales a `null`.
 */
function serialize(c: {
  id: string;
  type: string;
  slug: string;
  title: unknown;
  body: unknown;
  status: string;
  seo: unknown;
  authorId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    type: c.type,
    slug: c.slug,
    title: c.title,
    body: c.body,
    status: c.status,
    seo: c.seo,
    authorId: c.authorId,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/**
 * Verifica que el usuario posea el permiso `content.publish`; de lo contrario
 * lanza un ForbiddenError. Se invoca antes de crear o publicar contenido.
 */
function assertCanPublish(request: { user?: { permissions?: string[] } }): void {
  const permissions = request.user?.permissions ?? [];
  if (!permissions.includes('content.publish')) {
    throw new ForbiddenError("Se requiere el permiso 'content.publish' para publicar contenido");
  }
}

/**
 * Registra las rutas CRUD de contenido: listado paginado, creación, detalle,
 * actualización parcial y eliminación. Cada endpoint exige autenticación y el
 * permiso de lectura (`content.read`) o escritura (`content.write`) correspondiente.
 */
export default async function contentRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Listado paginado y filtrado de contenido --------
  fastify.get(
    '/content',
    {
      schema: {
        tags: ['content'],
        querystring: {
          type: 'object',
          properties: {
            ...(paginationQuerySchema.properties as object),
            type: { type: 'string' },
            status: { type: 'string' },
            q: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('content.read')],
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const { type, status, q } = request.query as { type?: string; status?: string; q?: string };

      // Filtros opcionales: por tipo, por estado y búsqueda por slug.
      const where: Record<string, unknown> = {};
      if (type) where.type = type;
      if (status) where.status = status;
      if (q) where.slug = { contains: q, mode: 'insensitive' };

      const [items, total] = await fastify.prisma.$transaction([
        fastify.prisma.content.findMany({
          where,
          skip: page * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        fastify.prisma.content.count({ where }),
      ]);

      return pageResponse(items.map(serialize), total, page, pageSize);
    },
  );

  // -------- Creación de contenido --------
  fastify.post(
    '/content',
    {
      schema: { tags: ['content'], body: createContentSchema },
      preHandler: [fastify.authenticate, fastify.authorize('content.write')],
    },
    async (request, reply) => {
      const body = request.body as CreateContentBody;
      const type = body.type ?? 'page';
      const status: ContentStatus = body.status ?? 'draft';
      if (status === 'published') assertCanPublish(request);

      // Valida unicidad del slug para el tipo de contenido antes de crear.
      const existing = await fastify.prisma.content.findUnique({
        where: { type_slug: { type, slug: body.slug } },
      });
      if (existing) throw new ConflictError('Ya existe contenido con ese slug');

      const created = await fastify.prisma.content.create({
        data: {
          type,
          slug: body.slug,
          title: body.title as object,
          body: sanitizeLocalized(body.body) as object | undefined,
          status,
          seo: (body.seo ?? undefined) as object | undefined,
          authorId: request.user?.sub ?? null,
          publishedAt: status === 'published' ? new Date() : null,
        },
      });

      audit(fastify, request, { actorId: request.user?.sub, action: 'content.create', resource: 'content', resourceId: created.id });
      return reply.status(201).send(serialize(created));
    },
  );

  // -------- Detalle de contenido por id --------
  fastify.get(
    '/content/:id',
    {
      schema: { tags: ['content'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('content.read')],
    },
    async (request) => {
      const c = await fastify.prisma.content.findUnique({
        where: { id: (request.params as { id: string }).id },
      });
      if (!c) throw new NotFoundError('Contenido');
      return serialize(c);
    },
  );

  // -------- Actualización parcial de contenido --------
  fastify.patch(
    '/content/:id',
    {
      schema: {
        tags: ['content'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: updateContentSchema,
      },
      preHandler: [fastify.authenticate, fastify.authorize('content.write')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const body = request.body as UpdateContentBody;

      const current = await fastify.prisma.content.findUnique({ where: { id } });
      if (!current) throw new NotFoundError('Contenido');

      if (body.status === 'published' && current.status !== 'published') {
        assertCanPublish(request);
      }

      // Construye únicamente los campos provistos en el body.
      const data: Record<string, unknown> = {};
      if (body.slug !== undefined) data.slug = body.slug;
      if (body.title !== undefined) data.title = body.title as object;
      if (body.body !== undefined) data.body = sanitizeLocalized(body.body) as object;
      if (body.status !== undefined) {
        data.status = body.status;
        if (body.status === 'published' && current.status !== 'published') {
          data.publishedAt = new Date();
        }
      }
      if (body.seo !== undefined) data.seo = (body.seo ?? undefined) as object | undefined;

      const updated = await fastify.prisma.content.update({ where: { id }, data });

      audit(fastify, request, { actorId: request.user?.sub, action: 'content.update', resource: 'content', resourceId: id });
      return serialize(updated);
    },
  );

  // -------- Eliminación de contenido --------
  fastify.delete(
    '/content/:id',
    {
      schema: { tags: ['content'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('content.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      await fastify.prisma.content.delete({ where: { id } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'content.delete', resource: 'content', resourceId: id });
      return reply.status(204).send();
    },
  );
}
