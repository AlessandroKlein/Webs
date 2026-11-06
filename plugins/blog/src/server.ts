import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

type PostStatus = 'published' | 'draft' | 'scheduled';

/** Convierte texto a slug (minúsculas, sin tildes, solo [a-z0-9-]). */
const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

export default definePlugin(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    const resolveOrgId = async (request: unknown): Promise<string> => {
      try {
        const { resolveTenant } = fastify as unknown as {
          resolveTenant?: (req: unknown) => Promise<{ organizationId?: string | null }>;
        };
        const tenant = resolveTenant ? await resolveTenant(request) : null;
        return tenant?.organizationId ?? ROOT_ORG_ID;
      } catch {
        return ROOT_ORG_ID;
      }
    };

    // Genera un slug único por organización (sufijo -2, -3, ... si colisiona).
    const uniqueSlug = async (organizationId: string, base: string, ignoreId?: string): Promise<string> => {
      const root = base || 'post';
      let slug = root;
      let n = 2;
      for (;;) {
        const existing = await db.blogPost.findFirst({
          where: { organizationId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
          select: { id: true },
        });
        if (!existing) return slug;
        slug = `${root}-${n++}`;
      }
    };

    const notFound = (reply: unknown, message: string) =>
      (reply as { status: (c: number) => { send: (b: unknown) => unknown } }).status(404).send({ error: message });

    // Listado: con ?limit&offset devuelve {items,total,limit,offset}; sin params, array plano (compat admin).
    fastify.get('/posts', async (request: unknown) => {
      const { query } = request as { query?: { status?: string; q?: string; limit?: string; offset?: string } };
      const where: Record<string, unknown> = {};
      if (query?.status && query.status !== 'all') where.status = query.status;
      if (query?.q) where.title = { contains: query.q, mode: 'insensitive' };
      const paginated = query?.limit !== undefined || query?.offset !== undefined;
      if (!paginated) return db.blogPost.findMany({ where, orderBy: { createdAt: 'desc' } });
      const limit = Math.min(50, Math.max(1, Number(query?.limit ?? 10)));
      const offset = Math.max(0, Number(query?.offset ?? 0));
      const [items, total] = await Promise.all([
        db.blogPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
        db.blogPost.count({ where }),
      ]);
      return { items, total, limit, offset };
    });

    // Detalle público por slug: solo posts publicados de la org resuelta.
    fastify.get('/posts/:slug', async (request: unknown, reply: unknown) => {
      const { params } = request as { params?: { slug?: string } };
      const organizationId = await resolveOrgId(request);
      const post = await db.blogPost.findFirst({
        where: { organizationId, slug: params?.slug, status: 'published' },
      });
      if (!post) {
        return (reply as { code: (c: number) => { send: (b: unknown) => unknown } })
          .code(404)
          .send({ error: 'Post no encontrado' });
      }
      return post;
    });

    // Detalle por id (admin). Va bajo /by-id para no colisionar con /posts/:slug:
    // Fastify rechaza dos rutas con la misma forma y distinto nombre de parámetro.
    fastify.get('/posts/by-id/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.findUnique({ where: { id: params?.id } });
    });

    fastify.post('/posts', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: {
          title?: string;
          body?: string;
          category?: string | null;
          tags?: unknown;
          status?: PostStatus;
          excerpt?: string | null;
          featuredImage?: string | null;
        };
      };
      const organizationId = await resolveOrgId(request);
      const user = (request as { user?: { sub?: unknown; id?: unknown } }).user;
      const authorId = typeof user?.sub === 'string' ? user.sub : typeof user?.id === 'string' ? user.id : null;
      const slug = await uniqueSlug(organizationId, slugify(body?.title ?? ''));
      const status = body?.status ?? 'draft';
      return db.blogPost.create({
        data: {
          title: body?.title ?? '',
          body: body?.body ?? '',
          slug,
          category: body?.category ?? null,
          excerpt: body?.excerpt ?? null,
          featuredImage: body?.featuredImage ?? null,
          tags: Array.isArray(body?.tags) ? body.tags : [],
          status,
          authorId,
          publishedAt: status === 'published' ? new Date() : null,
          organizationId,
        },
      });
    });

    fastify.patch('/posts/:id', { preHandler: [authenticate] }, async (request: unknown, reply: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: {
          title?: string;
          body?: string;
          category?: string | null;
          tags?: unknown;
          status?: PostStatus;
          excerpt?: string | null;
          featuredImage?: string | null;
          slug?: string | null;
        };
      };
      const organizationId = await resolveOrgId(request);
      const existing = await db.blogPost.findUnique({ where: { id: params?.id } });
      if (!existing) return notFound(reply, 'Post no encontrado');
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.body !== undefined) data.body = body.body;
      if (body?.category !== undefined) data.category = body.category;
      if (body?.excerpt !== undefined) data.excerpt = body.excerpt;
      if (body?.featuredImage !== undefined) data.featuredImage = body.featuredImage;
      if (body?.tags !== undefined) data.tags = body.tags;
      if (body?.status !== undefined) {
        data.status = body.status;
        if (body.status === 'published' && !existing.publishedAt) data.publishedAt = new Date();
      }
      if (body?.slug !== undefined) {
        data.slug = body.slug ? await uniqueSlug(organizationId, slugify(body.slug), params?.id) : null;
      }
      return db.blogPost.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/posts/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.delete({ where: { id: params?.id } });
    });

    // Comentarios ligados a un post: lectura pública, publicación autenticada.
    fastify.get('/posts/:slug/comments', async (request: unknown) => {
      const { params } = request as { params?: { slug?: string } };
      const organizationId = await resolveOrgId(request);
      const post = await db.blogPost.findFirst({
        where: { organizationId, slug: params?.slug, status: 'published' },
        select: { id: true },
      });
      if (!post) return [];
      return db.comment.findMany({ where: { postId: post.id }, orderBy: { createdAt: 'asc' } });
    });

    fastify.post('/posts/:slug/comments', { preHandler: [authenticate] }, async (request: unknown, reply: unknown) => {
      const { params, body } = request as {
        params?: { slug?: string };
        body?: { body?: string; rating?: number };
      };
      const organizationId = await resolveOrgId(request);
      const post = await db.blogPost.findFirst({
        where: { organizationId, slug: params?.slug, status: 'published' },
        select: { id: true },
      });
      if (!post) return notFound(reply, 'Post no encontrado o no publicado');
      const user = request as { user?: { displayName?: unknown; email?: unknown } };
      const author =
        typeof user?.user?.displayName === 'string' && user.user.displayName
          ? user.user.displayName
          : typeof user?.user?.email === 'string' && user.user.email
            ? user.user.email
            : 'Anónimo';
      return db.comment.create({
        data: {
          author,
          body: body?.body ?? '',
          rating: Math.min(5, Math.max(1, Math.round(body?.rating ?? 5))),
          organizationId,
          postId: post.id,
        },
      });
    });

    // Listado de categorías existentes (útil para filtros del front).
    fastify.get('/categories', async () => {
      const rows = await db.blogPost.findMany({ distinct: ['category'], select: { category: true } });
      return (rows as Array<{ category: string | null }>)
        .map((r) => r.category)
        .filter((c): c is string => c !== null);
    });
  },
});
