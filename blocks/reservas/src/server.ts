import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type BookingStatus = 'confirmed' | 'attended' | 'cancelled' | 'no-show';
interface Booking { id: string; serviceId: string; name: string; date: string; status: BookingStatus }
const bookings: Booking[] = [];

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const services = (Array.isArray((config as Record<string, unknown>).services) ? (config as Record<string, unknown>).services : []) as Array<{ id: string; name: string; duration: number; price: number }>;

    fastify.get('/services', async () => services);
    fastify.get('/bookings', async () => bookings);
    fastify.post('/bookings', async (request: unknown) => {
      const { body } = request as { body?: { serviceId?: string; name?: string; date?: string } };
      const booking: Booking = { id: crypto.randomUUID(), serviceId: body?.serviceId ?? '', name: body?.name ?? '', date: body?.date ?? new Date().toISOString(), status: 'confirmed' };
      bookings.unshift(booking);
      return booking;
    });
    fastify.patch('/bookings/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: BookingStatus } };
      const b = bookings.find((x) => x.id === params?.id);
      if (!b) return { ok: false };
      if (body?.status) b.status = body.status;
      return b;
    });
  },
});
