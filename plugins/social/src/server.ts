import { lookup } from 'node:dns/promises';
import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

type MediaItem = { url: string; type?: string; caption?: string };
type PollOption = { id: string; label: string };

interface PostBody {
  author?: string;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaUrls?: MediaItem[];
  visibility?: string;
  poll?: { question: string; options: PollOption[]; endsAt?: string };
}

// ---------------------------------------------------------------------------
// Link preview (unfurl) con protección SSRF (ADR-0024 §6): resuelve el
// hostname vía DNS y re-valida la IP; deniega loopback/privadas/link-local.
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (/^127\./.test(ip)) return true; // loopback
  if (/^10\./.test(ip)) return true; // RFC1918
  if (/^192\.168\./.test(ip)) return true; // RFC1918
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true; // RFC1918
  if (/^169\.254\./.test(ip)) return true; // link-local
  if (/^0\./.test(ip)) return true; // "this" network
  if (ip === '::1') return true; // IPv6 loopback
  if (/^fe80:/i.test(ip)) return true; // IPv6 link-local
  if (/^fc[0-9a-f]{2}:/i.test(ip) || /^fd[0-9a-f]{2}:/i.test(ip)) return true; // IPv6 ULA
  return false;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIp(h);
  if (h.includes(':')) return isPrivateIp(h);
  return false;
}

/** `true` si el host es público y resuelve a IP pública; `false` en cualquier error. */
async function isSafeHost(host: string): Promise<boolean> {
  if (isPrivateHost(host)) return false;
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function metaContent(html: string, prop: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re);
  return (m?.[1] ?? '').replace(/&amp;/g, '&').slice(0, 2000);
}

function parsePreview(html: string, url: string): Record<string, unknown> {
  const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title');
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const image = metaContent(html, 'og:image');
  const siteName = metaContent(html, 'og:site_name');
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  return {
    url,
    title: title || titleTag || '',
    description,
    image,
    siteName,
  };
}

async function unfurl(url: string): Promise<Record<string, unknown> | null> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return null;
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Sigue hasta 5 redirecciones, re-validando cada destino (anti-SSRF por redirect).
    for (let i = 0; i <= 5; i += 1) {
      if (!(await isSafeHost(current.hostname))) return null;
      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'WebsLinkPreview/1.0' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        current = new URL(loc, current);
        if (current.protocol !== 'http:' && current.protocol !== 'https:') return null;
        continue;
      }
      if (res.status >= 400) return null;
      const raw = await res.text();
      return parsePreview(raw.slice(0, 512 * 1024), current.toString());
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractHashtags(text: string): string[] {
  const tags = text.match(/#([\wÀ-ÿ-]+)/g) ?? [];
  return [...new Set(tags.map((t) => t.slice(1).toLowerCase()))];
}

function extractMentions(text: string): string[] {
  const mentions = text.match(/@([\w.]+)/g) ?? [];
  return [...new Set(mentions.map((m) => m.slice(1)))];
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
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

    // Autenticación opcional (para filtrar visibilidad en lecturas públicas).
    const viewerIdOf = async (request: unknown): Promise<string | null> => {
      try {
        const req = request as { jwtVerify?: () => Promise<void>; user?: { sub?: string } };
        if (typeof req.jwtVerify === 'function') await req.jwtVerify();
        return req.user?.sub ?? null;
      } catch {
        return null;
      }
    };

    const visibilityOf = (value: string | undefined): 'public' | 'followers' | 'private' => {
      if (value === 'followers' || value === 'private') return value;
      return 'public';
    };

    // Feed con filtros + visibilidad server-side (ADR-0024 §5).
    fastify.get('/posts', async (request: unknown) => {
      const { query } = request as {
        query?: { author?: string; followingOf?: string; tag?: string; mention?: string };
      };
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
      if (query?.tag) {
        const rows = await db.socialHashtag.findMany({
          where: { tag: query.tag.toLowerCase() },
          select: { postId: true },
        });
        conditions.push({ id: { in: (rows as Array<{ postId: string }>).map((r) => r.postId) } });
      }
      if (query?.mention) {
        const user = await db.user.findUnique({ where: { username: query.mention }, select: { id: true } });
        const rows = user
          ? await db.socialMention.findMany({ where: { userId: user.id }, select: { postId: true } })
          : [];
        conditions.push({ id: { in: (rows as Array<{ postId: string }>).map((r) => r.postId) } });
      }

      // Visibilidad: anónimo → sólo public; autenticado → + sus propios + followers-only de seguidos.
      const viewerId = await viewerIdOf(request);
      const visibilityOr: Record<string, unknown>[] = [{ visibility: 'public' }];
      if (viewerId) {
        visibilityOr.push({ author: viewerId });
        const follows = await db.follow.findMany({
          where: { followerId: viewerId },
          select: { followingId: true },
        });
        if ((follows as Array<{ followingId: string }>).length > 0) {
          visibilityOr.push({
            author: { in: (follows as Array<{ followingId: string }>).map((f) => f.followingId) },
            visibility: 'followers',
          });
        }
      }
      conditions.push({ OR: visibilityOr });

      return db.socialPost.findMany({
        where: { AND: conditions },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    fastify.post('/posts', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body, user } = request as {
        body?: PostBody;
        user?: { sub?: string };
      };
      const text = (body?.text ?? '').slice(0, maxPostLength);
      const visibility = visibilityOf(body?.visibility);
      const organizationId = await resolveOrgId(request);
      const author = body?.author ?? user?.sub ?? 'anon';

      // Normaliza media: mediaUrls[] (galería) o mediaUrl legacy único.
      const mediaUrls: MediaItem[] = Array.isArray(body?.mediaUrls)
        ? body.mediaUrls.filter((m) => typeof m?.url === 'string' && m.url.length > 0)
        : [];
      if (mediaUrls.length === 0 && body?.mediaUrl) {
        mediaUrls.push({
          url: body.mediaUrl,
          type: body.mediaType === 'video' ? 'video' : 'image',
        });
      }

      const hashtags = extractHashtags(text);
      const mentions = extractMentions(text);
      // Resuelve menciones a usuarios reales (username global @unique).
      const mentionedUsers = mentions.length
        ? (await db.user.findMany({
            where: { username: { in: mentions } },
            select: { id: true, username: true },
          })) as Array<{ id: string; username: string }>
        : [];

      // Link preview best-effort (nunca bloquea la publicación).
      let preview: Record<string, unknown> | null = null;
      const link = firstUrl(text);
      if (link) {
        try {
          preview = await unfurl(link);
        } catch {
          preview = null;
        }
      }

      const poll = body?.poll?.question
        ? {
            question: body.poll.question.slice(0, 280),
            options: (body.poll.options ?? [])
              .filter((o) => typeof o?.id === 'string' && typeof o?.label === 'string')
              .slice(0, 20),
            endsAt: body.poll.endsAt ? new Date(body.poll.endsAt) : null,
          }
        : null;

      return db.$transaction(async (tx: Record<string, any>) => {
        const post = await tx.socialPost.create({
          data: {
            author,
            text,
            mediaUrl: mediaUrls[0]?.url ?? null,
            mediaType: mediaUrls[0]?.type ?? null,
            mediaUrls,
            visibility,
            preview,
            organizationId,
          },
        });

        if (hashtags.length > 0) {
          await tx.socialHashtag.createMany({
            data: hashtags.map((tag) => ({ postId: post.id, organizationId, tag })),
            skipDuplicates: true,
          });
        }

        if (mentionedUsers.length > 0) {
          await tx.socialMention.createMany({
            data: mentionedUsers.map((u) => ({ postId: post.id, organizationId, userId: u.id })),
            skipDuplicates: true,
          });
          for (const u of mentionedUsers) {
            await tx.notification.create({
              data: {
                organizationId,
                userId: u.id,
                title: 'Nueva mención',
                body: `${author} te mencionó en una publicación`,
                priority: 'normal',
              },
            });
          }
        }

        if (poll) {
          await tx.socialPoll.create({
            data: {
              postId: post.id,
              organizationId,
              question: poll.question,
              options: poll.options,
              endsAt: poll.endsAt,
            },
          });
        }

        return post;
      });
    });

    fastify.get('/posts/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return null;
      return db.socialPost.findUnique({
        where: { id: params.id },
        include: { poll: { include: { votes: true } }, hashtags: true, mentions: true },
      });
    });

    fastify.post('/posts/:id/vote', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body, user } = request as {
        params?: { id?: string };
        body?: { optionId?: string };
        user?: { sub?: string };
      };
      const post = await db.socialPost.findUnique({
        where: { id: params?.id },
        include: { poll: true },
      });
      if (!post?.poll) return { ok: false, error: 'no_poll' };
      const options = (post.poll.options ?? []) as PollOption[];
      if (!options.some((o) => o.id === body?.optionId)) return { ok: false, error: 'invalid_option' };
      const userId = user?.sub;
      if (!userId) return { ok: false, error: 'unauthenticated' };
      await db.socialPollVote.upsert({
        where: { pollId_userId: { pollId: post.poll.id, userId } },
        create: {
          pollId: post.poll.id,
          organizationId: await resolveOrgId(request),
          userId,
          optionId: body?.optionId,
        },
        update: { optionId: body?.optionId },
      });
      return { ok: true };
    });

    fastify.get('/posts/:id/votes', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      const post = await db.socialPost.findUnique({
        where: { id: params?.id },
        include: { poll: { include: { votes: true } } },
      });
      return post?.poll?.votes ?? [];
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
