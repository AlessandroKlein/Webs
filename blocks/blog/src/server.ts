import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type PostStatus = 'published' | 'draft' | 'scheduled';

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/posts', async () => db.blogPost.findMany({ where: { status: 'published' }, orderBy: { createdAt: 'desc' } }));
    fastify.get('/posts/all', async () => db.blogPost.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.get('/posts/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.findUnique({ where: { id: params?.id } });
    });
    fastify.post('/posts', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; body?: string; category?: string; tags?: string[]; status?: PostStatus } };
      return db.blogPost.create({
        data: { title: body?.title ?? '', body: body?.body ?? '', category: body?.category ?? null, tags: body?.tags ?? [], status: body?.status ?? 'draft' },
      });
    });

    fastify.patch('/posts/:id', async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { title?: string; body?: string; category?: string | null; tags?: string[]; status?: PostStatus };
      };
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.body !== undefined) data.body = body.body;
      if (body?.category !== undefined) data.category = body.category;
      if (body?.tags !== undefined) data.tags = body.tags;
      if (body?.status !== undefined) data.status = body.status;
      return db.blogPost.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/posts/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.blogPost.delete({ where: { id: params?.id } });
    });

    fastify.get('/categories', async () => {
      const rows = await db.blogPost.findMany({ distinct: ['category'], select: { category: true } });
      return (rows as Array<{ category: string | null }>).map((r) => r.category).filter((c): c is string => c !== null);
    });
  },
});
