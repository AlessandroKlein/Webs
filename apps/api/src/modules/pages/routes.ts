import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@webs/core';
import { audit } from '../../lib/audit';

/**
 * Constructor de páginas: cada página tiene un `layout` (lista de secciones con
 * bloques + tamaño) o un `redirectUrl` (página externa). La página marcada
 * `isHome` se renderiza en la raíz pública `/`.
 */

export default async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/pages',
    { schema: { tags: ['pages'] }, preHandler: [fastify.authenticate, fastify.authorize('content.read')] },
    async () => fastify.prisma.page.findMany({ orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }] }),
  );

  fastify.post(
    '/pages',
    {
      schema: {
        tags: ['pages'],
        body: {
          type: 'object',
          required: ['slug', 'title'],
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            layout: { type: 'array', items: { type: 'object' } },
            redirectUrl: { type: 'string', nullable: true },
            isHome: { type: 'boolean' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('content.write')],
    },
    async (request, reply) => {
      const body = request.body as { slug: string; title: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean };
      if (body.isHome) {
        await fastify.prisma.page.updateMany({ data: { isHome: false } });
      }
      const page = await fastify.prisma.page.create({
        data: {
          slug: body.slug,
          title: body.title,
          layout: (body.layout as never) ?? ([] as never),
          redirectUrl: body.redirectUrl ?? null,
          isHome: body.isHome ?? false,
        },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'page.create', resource: 'page', resourceId: page.id });
      return reply.status(201).send(page);
    },
  );

  fastify.patch(
    '/pages/:id',
    {
      schema: {
        tags: ['pages'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            layout: { type: 'array', items: { type: 'object' } },
            redirectUrl: { type: 'string', nullable: true },
            isHome: { type: 'boolean' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('content.write')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const body = request.body as { slug?: string; title?: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean };
      if (body.isHome) await fastify.prisma.page.updateMany({ where: { id: { not: id } }, data: { isHome: false } });
      const data: Record<string, unknown> = {};
      if (body.slug !== undefined) data.slug = body.slug;
      if (body.title !== undefined) data.title = body.title;
      if (body.layout !== undefined) data.layout = body.layout;
      if (body.redirectUrl !== undefined) data.redirectUrl = body.redirectUrl;
      if (body.isHome !== undefined) data.isHome = body.isHome;
      return fastify.prisma.page.update({ where: { id }, data });
    },
  );

  fastify.delete(
    '/pages/:id',
    { schema: { tags: ['pages'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate, fastify.authorize('content.write')] },
    async (request, reply) => {
      await fastify.prisma.page.delete({ where: { id: (request.params as { id: string }).id } });
      return reply.status(204).send();
    },
  );

  // -------- Público --------
  fastify.get('/public/pages', { schema: { tags: ['pages'] } }, async () =>
    fastify.prisma.page.findMany({ select: { slug: true, title: true, isHome: true } }),
  );

  fastify.get('/public/page/:slug', { schema: { tags: ['pages'], params: { type: 'object', properties: { slug: { type: 'string' } } } } }, async (request) => {
    const slug = (request.params as { slug: string }).slug;
    const page = slug === 'home'
      ? await fastify.prisma.page.findFirst({ where: { isHome: true } })
      : await fastify.prisma.page.findUnique({ where: { slug } });
    if (!page) throw new NotFoundError('Página');
    return { slug: page.slug, title: page.title, layout: page.layout, redirectUrl: page.redirectUrl, isHome: page.isHome };
  });
}
