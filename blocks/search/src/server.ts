import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const minChars = Number(cfg.minChars ?? 1);
    const maxResults = Number(cfg.maxResults ?? 20);
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/search', async (request: unknown) => {
      const { query } = request as { query?: { q?: string } };
      const q = (query?.q ?? '').trim();
      if (q.length < minChars) return { results: { content: [], posts: [], products: [] } };

      const [content, posts, products] = await Promise.all([
        searchContent(q),
        searchPosts(q),
        searchProducts(q),
      ]);
      return { results: { content, posts, products } };
    });

    // Prisma `contains` con `mode: 'insensitive'` (Postgres). Si el provider no lo
    // soporta, se hace fallback a filtrado en JS con toLowerCase.
    async function searchContent(q: string) {
      try {
        return await db.content.findMany({
          where: { slug: { contains: q, mode: 'insensitive' } },
          orderBy: { updatedAt: 'desc' },
          take: maxResults,
        });
      } catch {
        const all = await db.content.findMany({ orderBy: { updatedAt: 'desc' } });
        return (all as Array<{ slug: string }>)
          .filter((c) => String(c.slug ?? '').toLowerCase().includes(q.toLowerCase()))
          .slice(0, maxResults);
      }
    }

    async function searchPosts(q: string) {
      try {
        return await db.blogPost.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { body: { contains: q, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: maxResults,
        });
      } catch {
        const all = await db.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
        return (all as Array<{ title: string; body: string }>)
          .filter(
            (p) =>
              p.title.toLowerCase().includes(q.toLowerCase()) ||
              p.body.toLowerCase().includes(q.toLowerCase()),
          )
          .slice(0, maxResults);
      }
    }

    async function searchProducts(q: string) {
      try {
        return await db.product.findMany({
          where: { title: { contains: q, mode: 'insensitive' } },
          orderBy: { title: 'asc' },
          take: maxResults,
        });
      } catch {
        const all = await db.product.findMany({ orderBy: { title: 'asc' } });
        return (all as Array<{ title: string }>)
          .filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, maxResults);
      }
    }
  },
});
