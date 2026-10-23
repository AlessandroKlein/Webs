import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

type PostStatus = 'published' | 'draft' | 'scheduled';

export default definePlugin(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Resuelve la organización activa (tenant) con fallback a la org raíz 'principal'.
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

    // Listado público: filtra por `?status=` y busca por `?q=` (contiene title).
    fastify.get('/posts', async (request: unknown) => {
      const { query } = request as { query?: { status?: string; q?: string } };
      const where: Record<string, unknown> = {};
      if (query?.status && query.status !== 'all') where.status = query.status;
      if (query?.q) where.title = { contains: query.q, mode: 'insensitive' };
      return db.blogPost.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    fastify.get('/posts/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.findUnique({ where: { id: params?.id } });
    });

    fastify.post('/posts', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { title?: string; body?: string; category?: string | null; tags?: unknown; status?: PostStatus };
      };
      return db.blogPost.create({
        data: {
          title: body?.title ?? '',
          body: body?.body ?? '',
          category: body?.category ?? null,
          tags: Array.isArray(body?.tags) ? body.tags : [],
          status: body?.status ?? 'draft',
          organizationId: await resolveOrgId(request),
        },
      });
    });

    fastify.patch('/posts/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { title?: string; body?: string; category?: string | null; tags?: unknown; status?: PostStatus };
      };
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.body !== undefined) data.body = body.body;
      if (body?.category !== undefined) data.category = body.category;
      if (body?.tags !== undefined) data.tags = body.tags;
      if (body?.status !== undefined) data.status = body.status;
      return db.blogPost.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/posts/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.delete({ where: { id: params?.id } });
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
