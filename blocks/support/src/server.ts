import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Ticket { id: string; subject: string; message: string; status: string; createdAt: string }
const tickets: Ticket[] = [];

export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.get('/tickets', async () => tickets);
    fastify.post('/tickets', async (request: unknown) => {
      const { body } = request as { body?: { subject?: string; message?: string } };
      const ticket: Ticket = {
        id: crypto.randomUUID(),
        subject: body?.subject ?? 'Consulta',
        message: body?.message ?? '',
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      tickets.unshift(ticket);
      return ticket;
    });
  },
});
