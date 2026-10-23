import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { createExternalEvent } from '../../../apps/api/src/integrations/calendar';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

interface CalendarConfig {
  provider?: string;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  calendarApiKey?: string;
  calendarAccessToken?: string;
  calendarId?: string;
  caldavUrl?: string;
  caldavUsername?: string;
  caldavPassword?: string;
}

/**
 * Proveedores de calendario soportados. `local` persiste solo en la base de
 * datos; `google` y `caldav` además crean el evento en el calendario externo.
 */
const CALENDAR_PROVIDERS = ['local', 'google', 'caldav'] as const;
type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

/**
 * Plugin de calendario. Rutas bajo `/api/v1/plugins/calendario`.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = config as CalendarConfig;
    const provider = (CALENDAR_PROVIDERS as readonly string[]).includes(String(cfg.provider))
      ? (cfg.provider as CalendarProvider)
      : 'local';

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
    const calendarConfig: Record<string, unknown> = {
      apiKey: cfg.calendarApiKey,
      accessToken: cfg.calendarAccessToken,
      calendarId: cfg.calendarId,
      caldavUrl: cfg.caldavUrl,
      caldavUsername: cfg.caldavUsername,
      caldavPassword: cfg.caldavPassword,
      timezone: cfg.timezone,
    };

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
        // Persistencia local (siempre).
        const created = await db.calendarEvent.create({
          data: {
            title: body?.title ?? '',
            start: new Date(body?.start ?? Date.now()),
            end: body?.end ? new Date(body.end) : null,
            type: body?.type ?? null,
            organizationId: await resolveOrgId(request),
          },
        });
        // Sincronización opcional contra el calendario externo configurado.
        const external = await createExternalEvent(provider, calendarConfig, {
          title: created.title,
          start: created.start,
          end: created.end,
          timezone: cfg.timezone,
        });
        return { ...created, external };
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
