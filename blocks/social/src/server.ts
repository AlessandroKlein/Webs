import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/feed', async () => db.socialPost.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
    fastify.post('/posts', async (request: unknown) => {
      const { body } = request as { body?: { author?: string; text?: string; mediaUrl?: string; mediaType?: string } };
      return db.socialPost.create({
        data: { author: body?.author ?? 'anon', text: body?.text ?? '', mediaUrl: body?.mediaUrl ?? null, mediaType: body?.mediaType ?? null },
      });
    });
    fastify.post('/posts/:id/like', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.socialPost.update({ where: { id: params?.id }, data: { likes: { increment: 1 } } });
    });
  },
});
