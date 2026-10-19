import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const room = String((config as Record<string, unknown>).room ?? 'general');
    const sockets = new Set<{ send: (s: string) => void }>();

    fastify.get('/messages', async () => db.chatMessage.findMany({ where: { to: room }, orderBy: { createdAt: 'desc' }, take: 100 }));

    fastify.post('/messages', async (request: unknown) => {
      const { body } = request as { body?: { from?: string; body?: string } };
      const msg = await db.chatMessage.create({ data: { from: body?.from ?? 'anon', to: room, body: body?.body ?? '' } });
      const text = JSON.stringify(msg);
      for (const s of sockets) s.send(text);
      return msg;
    });

    // WebSocket para tiempo real (requiere @fastify/websocket, ya registrado en el núcleo).
    (fastify as unknown as { get: (p: string, o: unknown, h: unknown) => void }).get('/ws', { websocket: true }, (socket: { on: (e: string, cb: (d?: Uint8Array) => void) => void; send: (s: string) => void }) => {
      sockets.add(socket);
      socket.on('message', async (raw) => {
        const text = raw ? new TextDecoder().decode(raw) : '{}';
        const data = JSON.parse(text) as { from?: string; body?: string };
        const msg = await db.chatMessage.create({ data: { from: data.from ?? 'anon', to: room, body: data.body ?? '' } });
        const payload = JSON.stringify(msg);
        for (const s of sockets) s.send(payload);
      });
      socket.on('close', () => sockets.delete(socket));
    });
  },
});
