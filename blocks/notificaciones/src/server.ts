import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/notifications', async () => db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }));
    fastify.post('/notifications', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; body?: string; userId?: string } };
      return db.notification.create({ data: { title: body?.title ?? '', body: body?.body ?? '', userId: body?.userId ?? null } });
    });
    fastify.patch('/notifications/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.notification.update({ where: { id: params?.id }, data: { read: true } });
    });
  },
});
