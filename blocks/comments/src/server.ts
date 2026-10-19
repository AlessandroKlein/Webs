import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Comment { id: string; author: string; body: string; rating: number; createdAt: string }
const comments: Comment[] = [];

export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.get('/comments', async () => comments);
    fastify.post('/comments', async (request: unknown) => {
      const { body } = request as { body?: { author?: string; body?: string; rating?: number } };
      const comment: Comment = {
        id: crypto.randomUUID(),
        author: body?.author ?? 'Anónimo',
        body: body?.body ?? '',
        rating: Math.min(5, Math.max(1, body?.rating ?? 5)),
        createdAt: new Date().toISOString(),
      };
      comments.unshift(comment);
      return comment;
    });
  },
});
