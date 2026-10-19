import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface CalendarConfig {
  provider?: string;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
}

/**
 * Proveedores de calendario soportados. `local` persiste en la base de datos;
 * `google` y `caldav` se integran mediante adaptadores externos (ver TODO).
 */
const CALENDAR_PROVIDERS = ['local', 'google', 'caldav'] as const;
type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

/**
 * Bloque de calendario. Rutas bajo `/api/v1/blocks/calendario`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as CalendarConfig;
    const provider = (CALENDAR_PROVIDERS as readonly string[]).includes(String(cfg.provider))
      ? (cfg.provider as CalendarProvider)
      : 'local';

    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // TODO(adaptadores): modelar un `CalendarProviderAdapter` para `google`
    // (Google Calendar API) y `caldav`. Hoy todas las rutas persisten en la DB
    // local sin importar `settings.provider`; el adaptador reemplazaría esa
    // persistencia por la sincronización contra el calendario externo.
    void provider;

    // Listado público con filtro por rango de `start` (`?from=&to=`).
    fastify.get('/events', async (request: unknown) => {
      const { query } = request as { query?: { from?: string; to?: string } };
      const where: Record<string, unknown> = {};
      if (query?.from || query?.to) {
        const start: Record<string, unknown> = {};
        if (query?.from) start.gte = new Date(query.from);
        if (query?.to) start.lte = new Date(query.to);
        where.start = start;
      }
      return db.calendarEvent.findMany({ where, orderBy: { start: 'asc' } });
    });

    fastify.post(
      '/events',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { body } = request as {
          body?: { title?: string; start?: string; end?: string; type?: string };
        };
        return db.calendarEvent.create({
          data: {
            title: body?.title ?? '',
            start: new Date(body?.start ?? Date.now()),
            end: body?.end ? new Date(body.end) : null,
            type: body?.type ?? null,
          },
        });
      },
    );

    fastify.patch(
      '/events/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params, body } = request as {
          params?: { id?: string };
          body?: { title?: string; start?: string; end?: string; type?: string };
        };
        const data: Record<string, unknown> = {};
        if (body?.title !== undefined) data.title = body.title;
        if (body?.start !== undefined) data.start = new Date(body.start);
        if (body?.end !== undefined) data.end = body.end ? new Date(body.end) : null;
        if (body?.type !== undefined) data.type = body.type;
        return db.calendarEvent.update({ where: { id: params?.id }, data });
      },
    );

    fastify.delete(
      '/events/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params } = request as { params?: { id?: string } };
        await db.calendarEvent.delete({ where: { id: params?.id } });
        return { ok: true };
      },
    );
  },
});
