import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@webs/core';
import { audit } from '../../lib/audit';
import { sanitize } from '../../lib/sanitize';

/**
 * Constructor de páginas: cada página tiene un `layout` (lista de secciones con
 * bloques + tamaño) o un `redirectUrl` (página externa). La página marcada
 * `isHome` se renderiza en la raíz pública `/`.
 */

/**
 * Sanea recursivamente el HTML de los bloques estructurados de un `layout`.
 * Un bloque puede ser una cadena (id de plugin, se deja intacta) o un objeto
 * `{ type, content?, ... }`; se sanea el campo `content` cuando es HTML.
 */
function sanitizeLayout(layout: unknown): unknown {
  if (!Array.isArray(layout)) return layout;
  return layout.map((section) => {
    if (!section || typeof section !== 'object') return section;
    const s = section as Record<string, unknown>;
    if (!Array.isArray(s.blocks)) return section;
    return {
      ...s,
      blocks: s.blocks.map((block) => {
        if (typeof block === 'string') return block;
        if (!block || typeof block !== 'object') return block;
        const b = { ...(block as Record<string, unknown>) };
        if (typeof b.content === 'string') b.content = sanitize(b.content);
        return b;
      }),
    };
  });
}

/**
 * Registra las rutas de administración, lectura pública y resolución dinámica
 * de páginas. Las rutas administrativas exigen permisos de `content.read` /
 * `content.write`; las rutas `/public/*` son de acceso abierto.
 */
export default async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Administración: listado de páginas --------
  fastify.get(
    '/pages',
    { schema: { tags: ['pages'] }, preHandler: [fastify.authenticate, fastify.authorize('content.read')] },
    async () => fastify.prisma.page.findMany({ orderBy: [{ isHome: 'desc' }, { createdAt: 'asc' }] }),
  );

  // -------- Administración: detalle de una página por id --------
  fastify.get(
    '/pages/:id',
    { schema: { tags: ['pages'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate, fastify.authorize('content.read')] },
    async (request) => {
      const page = await fastify.prisma.page.findUnique({ where: { id: (request.params as { id: string }).id } });
      if (!page) throw new NotFoundError('Página');
      return page;
    },
  );

  // -------- Administración: creación de página --------
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
      // Si la nueva página es la home, se revoca ese rol a las demás (home única).
      if (body.isHome) {
        await fastify.prisma.page.updateMany({ data: { isHome: false } });
      }
      const page = await fastify.prisma.page.create({
        data: {
          slug: body.slug,
          title: body.title,
          layout: sanitizeLayout(body.layout) as never ?? ([] as never),
          redirectUrl: body.redirectUrl ?? null,
          isHome: body.isHome ?? false,
        },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'page.create', resource: 'page', resourceId: page.id });
      return reply.status(201).send(page);
    },
  );

  // -------- Builder visual: guardado upsert (crea o actualiza por slug) --------
  fastify.post(
    '/pages/save',
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
    async (request) => {
      const body = request.body as { slug: string; title: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean };
      // Home única: al guardar con isHome se desmarca cualquier otra home.
      if (body.isHome) {
        await fastify.prisma.page.updateMany({ data: { isHome: false } });
      }
      const data = {
        slug: body.slug,
        title: body.title,
        layout: (sanitizeLayout(body.layout ?? []) as never),
        redirectUrl: body.redirectUrl ?? null,
        isHome: body.isHome ?? false,
      };
      const page = await fastify.prisma.page.upsert({
        where: { slug: body.slug },
        update: data,
        create: data,
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'page.save', resource: 'page', resourceId: page.id });
      return page;
    },
  );

  // -------- Administración: actualización parcial de página --------
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
      // Al promover esta página a home, se desmarca la home anterior (si existe).
      if (body.isHome) await fastify.prisma.page.updateMany({ where: { id: { not: id } }, data: { isHome: false } });
      const data: Record<string, unknown> = {};
      if (body.slug !== undefined) data.slug = body.slug;
      if (body.title !== undefined) data.title = body.title;
      if (body.layout !== undefined) data.layout = sanitizeLayout(body.layout);
      if (body.redirectUrl !== undefined) data.redirectUrl = body.redirectUrl;
      if (body.isHome !== undefined) data.isHome = body.isHome;
      return fastify.prisma.page.update({ where: { id }, data });
    },
  );

  // -------- Administración: eliminación de página --------
  fastify.delete(
    '/pages/:id',
    { schema: { tags: ['pages'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate, fastify.authorize('content.write')] },
    async (request, reply) => {
      await fastify.prisma.page.delete({ where: { id: (request.params as { id: string }).id } });
      return reply.status(204).send();
    },
  );

  // -------- Público --------
  // Listado reducido de páginas públicas (solo slug, título y marca de home).
  fastify.get('/public/pages', { schema: { tags: ['pages'] } }, async () =>
    fastify.prisma.page.findMany({ select: { slug: true, title: true, isHome: true } }),
  );

  // Resuelve una página pública por slug; `home` redirige a la página marcada isHome.
  fastify.get('/public/page/:slug', { schema: { tags: ['pages'], params: { type: 'object', properties: { slug: { type: 'string' } } } } }, async (request) => {
    const slug = (request.params as { slug: string }).slug;
    const page = slug === 'home'
      ? await fastify.prisma.page.findFirst({ where: { isHome: true } })
      : await fastify.prisma.page.findUnique({ where: { slug } });
    if (!page) throw new NotFoundError('Página');
    return { slug: page.slug, title: page.title, layout: page.layout, redirectUrl: page.redirectUrl, isHome: page.isHome };
  });

  // Ruta dinámica de captura: resuelve una página pública por su "ruta" (slug)
  // capturada de la URL. `home` (o ruta vacía) devuelve la página marcada `isHome`.
  fastify.get('/public/*', { schema: { tags: ['pages'] } }, async (request) => {
    const raw = (request.params as Record<string, string>)['*'] ?? '';
    const slug = raw.replace(/\/+$/, '') || 'home';
    const page = slug === 'home'
      ? await fastify.prisma.page.findFirst({ where: { isHome: true } })
      : await fastify.prisma.page.findUnique({ where: { slug } });
    if (!page) throw new NotFoundError('Página');
    return { slug: page.slug, title: page.title, layout: page.layout, redirectUrl: page.redirectUrl, isHome: page.isHome };
  });
}
