import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const defaultRoom = String(config.room ?? 'general');

    // Mensajes por sala: GET /messages?room=<to>
    fastify.get('/messages', async (request: unknown) => {
      const { query } = request as { query?: { room?: string } };
      const room = query?.room ?? defaultRoom;
      return db.chatMessage.findMany({ where: { to: room }, orderBy: { createdAt: 'desc' }, take: 100 });
    });

    // Salas disponibles: valores distintos de `to`.
    fastify.get('/rooms', async () => {
      const rows = await db.chatMessage.findMany({ distinct: ['to'], select: { to: true } });
      const rooms = (rows as Array<{ to: string }>).map((r) => r.to).filter(Boolean);
      return Array.from(new Set([defaultRoom, ...rooms]));
    });

    fastify.post('/messages', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { from?: string; to?: string; body?: string } };
      const msg = await db.chatMessage.create({
        data: {
          from: body?.from ?? 'anon',
          to: body?.to ?? defaultRoom,
          body: body?.body ?? '',
        },
      });
      if (fastify.events) {
        await fastify.events.emit('chat.message', {
          id: msg.id,
          from: msg.from,
          to: msg.to,
          body: msg.body,
          createdAt: msg.createdAt,
        });
      }
      return msg;
    });
  },
});
