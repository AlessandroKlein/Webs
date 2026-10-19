import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const maxPostLength = Number(config.maxPostLength ?? 500);

    // Feed público ordenado por fecha descendente.
    fastify.get('/posts', async () => db.socialPost.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));

    fastify.post('/posts', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { author?: string; text?: string; mediaUrl?: string | null; mediaType?: string | null };
      };
      return db.socialPost.create({
        data: {
          author: body?.author ?? 'anon',
          text: (body?.text ?? '').slice(0, maxPostLength),
          mediaUrl: body?.mediaUrl ?? null,
          mediaType: body?.mediaType ?? null,
        },
      });
    });

    fastify.patch('/posts/:id/like', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.socialPost.update({ where: { id: params?.id }, data: { likes: { increment: 1 } } });
    });

    fastify.delete('/posts/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.socialPost.delete({ where: { id: params?.id } });
    });
  },
});
