import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

interface PostBody {
  author?: string;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const maxPostLength = Number(config.maxPostLength ?? 500);

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

    // Feed: GET /posts?author=&followingOf=
    // Si `followingOf=<userId>` devuelve las publicaciones de ese usuario y de
    // los que sigue (modelo `Follow`). `author` permite filtrar por un autor.
    fastify.get('/posts', async (request: unknown) => {
      const { query } = request as { query?: { author?: string; followingOf?: string } };
      const conditions: Record<string, unknown>[] = [];
      if (query?.author) conditions.push({ author: query.author });
      if (query?.followingOf) {
        const follows = await db.follow.findMany({
          where: { followerId: query.followingOf },
          select: { followingId: true },
        });
        const ids = [
          query.followingOf,
          ...(follows as Array<{ followingId: string }>).map((f) => f.followingId),
        ];
        conditions.push({ author: { in: ids } });
      }
      const where = conditions.length > 0 ? { AND: conditions } : undefined;
      return db.socialPost.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    });

    fastify.post('/posts', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: PostBody };
      const mediaType = body?.mediaType === 'image' || body?.mediaType === 'video' ? body.mediaType : null;
      return db.socialPost.create({
        data: {
          author: body?.author ?? 'anon',
          text: (body?.text ?? '').slice(0, maxPostLength),
          mediaUrl: mediaType ? body?.mediaUrl ?? null : null,
          mediaType,
          organizationId: await resolveOrgId(request),
        },
      });
    });

    // Like con toggle: PATCH /posts/:id/like  (body: { like?: boolean })
    fastify.patch('/posts/:id/like', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { like?: boolean } };
      const id = params?.id;
      if (!id) return { likes: 0 };
      const post = await db.socialPost.findUnique({ where: { id } });
      const current = (post as { likes?: number } | null)?.likes ?? 0;
      const likes = body?.like === false ? Math.max(0, current - 1) : current + 1;
      return db.socialPost.update({ where: { id }, data: { likes } });
    });

    fastify.delete('/posts/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.socialPost.delete({ where: { id: params?.id } });
    });

    // -------- Seguimiento --------

    fastify.post('/follow', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { followerId?: string; followingId?: string } };
      const followerId = body?.followerId;
      const followingId = body?.followingId;
      if (!followerId || !followingId || followerId === followingId) return { ok: false };
      // Ignora si ya existe (clave única [followerId, followingId]).
      return db.follow.upsert({
        where: { followerId_followingId: { followerId, followingId } },
        create: { followerId, followingId, organizationId: await resolveOrgId(request) },
        update: {},
      });
    });

    // Acepta followerId/followingId por query o por body.
    fastify.delete('/follow', { preHandler: [authenticate] }, async (request: unknown) => {
      const { query, body } = request as {
        query?: { followerId?: string; followingId?: string };
        body?: { followerId?: string; followingId?: string };
      };
      const followerId = query?.followerId ?? body?.followerId;
      const followingId = query?.followingId ?? body?.followingId;
      if (!followerId || !followingId) return { ok: false };
      await db.follow.deleteMany({ where: { followerId, followingId } });
      return { ok: true };
    });

    fastify.get('/follow', async (request: unknown) => {
      const { query } = request as { query?: { followerId?: string; followingId?: string } };
      const where: Record<string, unknown> = {};
      if (query?.followerId) where.followerId = query.followerId;
      if (query?.followingId) where.followingId = query.followingId;
      return db.follow.findMany({ where, orderBy: { createdAt: 'desc' } });
    });

    fastify.get('/follow/counts', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const userId = query?.userId;
      if (!userId) return { followers: 0, following: 0 };
      const [followers, following] = await Promise.all([
        db.follow.count({ where: { followingId: userId } }),
        db.follow.count({ where: { followerId: userId } }),
      ]);
      return { followers, following };
    });

    // Usuarios disponibles para seguir.
    fastify.get('/users', async () => {
      return db.user.findMany({
        select: { id: true, displayName: true, username: true, email: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    // -------- Historias (efímeras, 24h) --------

    fastify.get('/stories', async () => {
      const now = new Date();
      const rows = await db.story.findMany({
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: 'asc' },
      });
      // Agrupa por autor para la barra de historias (avatar + lista de medias).
      const byAuthor = new Map<string, Array<Record<string, unknown>>>();
      for (const s of rows as Array<Record<string, unknown>>) {
        const author = String(s.author);
        if (!byAuthor.has(author)) byAuthor.set(author, []);
        byAuthor.get(author)!.push(s);
      }
      return [...byAuthor.entries()].map(([author, stories]) => ({ author, stories }));
    });

    fastify.post('/stories', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { author?: string; mediaUrl?: string; mediaType?: string } };
      const mediaUrl = body?.mediaUrl ?? '';
      if (!mediaUrl) return { ok: false, error: 'mediaUrl es requerido' };
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return db.story.create({
        data: {
          author: body?.author ?? 'anon',
          mediaUrl,
          mediaType: body?.mediaType === 'video' ? 'video' : 'image',
          expiresAt,
          organizationId: await resolveOrgId(request),
        },
      });
    });

    fastify.delete('/stories/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.story.delete({ where: { id: params?.id } });
    });
  },
});
