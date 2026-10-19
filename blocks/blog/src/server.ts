import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type PostStatus = 'published' | 'draft' | 'scheduled';
interface Post { id: string; title: string; body: string; category: string; tags: string[]; status: PostStatus; createdAt: string }
const posts: Post[] = [];

export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.get('/posts', async () => posts.filter((p) => p.status === 'published'));
    fastify.get('/posts/all', async () => posts);
    fastify.get('/posts/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return posts.find((p) => p.id === params?.id) ?? null;
    });
    fastify.post('/posts', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; body?: string; category?: string; tags?: string[]; status?: PostStatus } };
      const post: Post = {
        id: crypto.randomUUID(),
        title: body?.title ?? '',
        body: body?.body ?? '',
        category: body?.category ?? '',
        tags: body?.tags ?? [],
        status: body?.status ?? 'draft',
        createdAt: new Date().toISOString(),
      };
      posts.unshift(post);
      return post;
    });
  },
});
