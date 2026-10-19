import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type BookingStatus = 'confirmed' | 'attended' | 'cancelled' | 'no-show';

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const services = (Array.isArray((config as Record<string, unknown>).services) ? (config as Record<string, unknown>).services : []) as Array<{ id: string; name: string; duration: number; price: number }>;
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/services', async () => services);
    fastify.get('/bookings', async () => db.booking.findMany({ orderBy: { date: 'desc' } }));
    fastify.post('/bookings', async (request: unknown) => {
      const { body } = request as { body?: { serviceId?: string; name?: string; date?: string } };
      return db.booking.create({ data: { serviceId: body?.serviceId ?? '', name: body?.name ?? '', date: new Date(body?.date ?? Date.now()), status: 'confirmed' } });
    });
    fastify.patch('/bookings/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: BookingStatus } };
      if (!body?.status) return { ok: false };
      return db.booking.update({ where: { id: params?.id }, data: { status: body.status } });
    });
  },
});
