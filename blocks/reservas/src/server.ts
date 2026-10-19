import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface ReservasConfig {
  provider?: string;
  services?: Array<{ id?: string; name?: string; duration?: number; price?: number }>;
}

type BookingStatus = 'confirmed' | 'cancelled';

/** Normaliza el estado recibido (`confirm`/`cancel`) al valor canónico. */
function normalizeStatus(raw?: string): BookingStatus | null {
  const v = (raw ?? '').toLowerCase();
  if (v === 'confirm' || v === 'confirmed') return 'confirmed';
  if (v === 'cancel' || v === 'cancelled') return 'cancelled';
  return null;
}

/**
 * Bloque de reservas y turnos. Rutas bajo `/api/v1/blocks/reservas`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as ReservasConfig;
    const provider = String(cfg.provider ?? 'local');
    const services = (Array.isArray(cfg.services) ? cfg.services : []) as Array<{
      id?: string;
      name?: string;
      duration?: number;
      price?: number;
    }>;

    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Servicios ofrecidos (provienen de `settings.services`).
    fastify.get('/services', async () => services);

    // Listado público con filtro por día (`?date=`).
    fastify.get('/bookings', async (request: unknown) => {
      const { query } = request as { query?: { date?: string } };
      const where: Record<string, unknown> = {};
      if (query?.date) {
        const day = new Date(query.date);
        const from = new Date(day);
        from.setHours(0, 0, 0, 0);
        const to = new Date(day);
        to.setHours(23, 59, 59, 999);
        where.date = { gte: from, lte: to };
      }
      return db.booking.findMany({ where, orderBy: { date: 'asc' } });
    });

    fastify.post(
      '/bookings',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { body } = request as {
          body?: { serviceId?: string; name?: string; date?: string; status?: string };
        };
        const date = new Date(body?.date ?? Date.now());
        const booking = await db.booking.create({
          data: {
            serviceId: body?.serviceId ?? '',
            name: body?.name ?? '',
            date,
            status: body?.status ?? 'confirmed',
          },
        });

        // Con `provider` "local" reflejamos la reserva como evento del calendario
        // local. Con "google"/"caldav" se crearía en el calendario externo a
        // través del adaptador futuro (ver TODO en el bloque calendario).
        if (provider === 'local') {
          await db.calendarEvent.create({
            data: { title: `Reserva: ${booking.name}`, start: date },
          });
        }

        return booking;
      },
    );

    fastify.patch(
      '/bookings/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params, body } = request as {
          params?: { id?: string };
          body?: { status?: string };
        };
        const status = normalizeStatus(body?.status);
        if (!status) return { ok: false, error: 'Estado inválido (confirm/cancel)' };
        return db.booking.update({ where: { id: params?.id }, data: { status } });
      },
    );

    fastify.delete(
      '/bookings/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params } = request as { params?: { id?: string } };
        await db.booking.delete({ where: { id: params?.id } });
        return { ok: true };
      },
    );
  },
});
