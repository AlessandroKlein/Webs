import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/comments', async () => db.comment.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/comments', async (request: unknown) => {
      const { body } = request as { body?: { author?: string; body?: string; rating?: number } };
      return db.comment.create({
        data: { author: body?.author ?? 'Anónimo', body: body?.body ?? '', rating: Math.min(5, Math.max(1, body?.rating ?? 5)) },
      });
    });
  },
});
