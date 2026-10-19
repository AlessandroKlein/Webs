import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/tickets', async () => db.ticket.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/tickets', async (request: unknown) => {
      const { body } = request as { body?: { subject?: string; message?: string } };
      return db.ticket.create({ data: { subject: body?.subject ?? 'Consulta', message: body?.message ?? '', status: 'open' } });
    });
  },
});
