import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

interface ReservasConfig {
  provider?: string;
  defaultSlots?: number;
  recurrenceLimit?: number;
  services?: Array<{ id?: string; name?: string; duration?: number; price?: number }>;
}

type BookingStatus = 'confirmed' | 'cancelled';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface RecurrenceInput {
  frequency?: string;
  count?: number;
}

/** Normaliza la repetición recibida a `none` | `daily` | `weekly` con su conteo. */
function resolveRecurrence(raw: unknown): { frequency: 'none' | 'daily' | 'weekly'; count: number } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as RecurrenceInput;
  const freq = (typeof raw === 'string' ? raw : obj.frequency ?? '').toLowerCase();
  const frequency = freq === 'daily' ? 'daily' : freq === 'weekly' ? 'weekly' : 'none';
  const count = Math.max(1, Math.floor(Number(obj.count ?? 1)) || 1);
  return { frequency, count };
}

/**
 * Codifica cupos y recurrencia dentro de `CalendarEvent.type` como JSON.
 *
 * Enfoque documentado: el schema (`Booking` / `CalendarEvent`) no expone un campo
 * `capacity`/`slots` y NO está permitido editarlo, así que la clase se materializa
 * como N `CalendarEvent` (uno por ocurrencia) cuyo `type` guarda un JSON con
 * `{ kind: 'clase', serviceId, slots, recurrence, occurrence, total }`. El
 * `serviceId` del `Booking` maestro identifica la clase a la que se anotan los
 * usuarios. El frontend decodifica este JSON para mostrar cupos y repetición.
 */
function encodeClassType(meta: {
  serviceId: string;
  slots: number;
  recurrence: string;
  occurrence: number;
  total: number;
}): string {
  return JSON.stringify({ kind: 'clase', ...meta });
}

/** Normaliza el estado recibido (`confirm`/`cancel`) al valor canónico. */
function normalizeStatus(raw?: string): BookingStatus | null {
  const v = (raw ?? '').toLowerCase();
  if (v === 'confirm' || v === 'confirmed') return 'confirmed';
  if (v === 'cancel' || v === 'cancelled') return 'cancelled';
  return null;
}

/**
 * Plugin de reservas y turnos. Rutas bajo `/api/v1/plugins/reservas`.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = config as ReservasConfig;
    const provider = String(cfg.provider ?? 'local');
    const defaultSlots = Math.max(1, Math.floor(Number(cfg.defaultSlots ?? 10)) || 1);
    const recurrenceLimit = Math.max(1, Math.floor(Number(cfg.recurrenceLimit ?? 12)) || 12);
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

    // Resuelve la organización activa (tenant) con fallback a la org raíz 'principal'.
    const resolveOrgId = async (request: unknown): Promise<string> => {
      try {
        const { resolveTenant } = fastify as unknown as {
          resolveTenant?: (req: unknown) => Promise<{ organizationId?: string | null }>;
        };
        const tenant = resolveTenant ? await resolveTenant(request) : null;
        return tenant?.organizationId ?? ROOT_ORG_ID;
      } catch {
        return ROOT_ORG_ID;
      }
    };

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
          body?: {
            serviceId?: string;
            name?: string;
            date?: string;
            status?: string;
            end?: string;
            slots?: number;
            recurrence?: unknown;
          };
        };
        const name = String(body?.name ?? '');
        const date = new Date(body?.date ?? Date.now());
        const status = normalizeStatus(body?.status) ?? 'confirmed';
        const serviceId = String(body?.serviceId ?? `clase-${Date.now()}`);
        const organizationId = await resolveOrgId(request);

        const booking = await db.booking.create({
          data: { serviceId, name, date, status, organizationId },
        });

        // ¿Es una clase/turno (con cupos o repetición) o una reserva simple?
        const isClass = body?.slots !== undefined || body?.recurrence !== undefined;
        if (!isClass) {
          // Comportamiento original: reserva simple reflejada en el calendario local.
          if (provider === 'local') {
            await db.calendarEvent.create({
              data: { title: `Reserva: ${booking.name}`, start: date, organizationId },
            });
          }
          return booking;
        }

        // Clase/turno: un CalendarEvent por cada ocurrencia. Cupos y recurrencia se
        // guardan en `CalendarEvent.type` como JSON (ver encodeClassType).
        const slots = Math.max(1, Math.floor(Number(body?.slots ?? defaultSlots)) || 1);
        const { frequency, count } = resolveRecurrence(body?.recurrence);
        const intervalMs = frequency === 'daily' ? DAY_MS : frequency === 'weekly' ? WEEK_MS : 0;
        const total = intervalMs > 0 ? Math.min(count, recurrenceLimit) : 1;
        const end = body?.end ? new Date(body.end) : null;

        const events: unknown[] = [];
        for (let i = 0; i < total; i++) {
          const occurrenceStart = new Date(date.getTime() + i * intervalMs);
          const occurrenceEnd = end ? new Date(end.getTime() + i * intervalMs) : null;
          const ev = await db.calendarEvent.create({
            data: {
              title: `Clase: ${name}`,
              start: occurrenceStart,
              end: occurrenceEnd,
              type: encodeClassType({
                serviceId,
                slots,
                recurrence: frequency,
                occurrence: i + 1,
                total,
              }),
              organizationId,
            },
          });
          events.push(ev);
        }

        return { booking, events };
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
