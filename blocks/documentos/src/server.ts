import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/documents', async () => db.document.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/documents', async (request: unknown) => {
      const { body } = request as { body?: { name?: string; content?: string; userId?: string } };
      return db.document.create({ data: { name: body?.name ?? '', content: body?.content ?? '', userId: body?.userId ?? null } });
    });
    fastify.post('/documents/:id/sign', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.document.update({ where: { id: params?.id }, data: { signed: true } });
    });
  },
});
