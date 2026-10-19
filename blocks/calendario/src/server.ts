import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/events', async () => db.calendarEvent.findMany({ orderBy: { start: 'asc' } }));
    fastify.post('/events', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; start?: string; end?: string; type?: string } };
      return db.calendarEvent.create({
        data: { title: body?.title ?? '', start: new Date(body?.start ?? Date.now()), end: body?.end ? new Date(body.end) : null, type: body?.type ?? null },
      });
    });
    fastify.delete('/events/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      await db.calendarEvent.delete({ where: { id: params?.id } });
      return { ok: true };
    });
  },
});
