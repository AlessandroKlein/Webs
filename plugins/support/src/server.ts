import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

export default definePlugin(manifest, {
  register: async (fastify) => {
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

    // Listado de tickets (requiere autenticación).
    fastify.get('/tickets', { preHandler: [authenticate] }, async () =>
      db.ticket.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    // Crear un ticket (público o autenticado).
    fastify.post('/tickets', async (request: unknown) => {
      const { body } = request as { body?: { subject?: string; message?: string } };
      return db.ticket.create({
        data: {
          subject: body?.subject?.trim() || 'Consulta',
          message: body?.message?.trim() || '',
          status: 'open',
          organizationId: await resolveOrgId(request),
        },
      });
    });

    // Cambiar el estado (open/closed).
    fastify.patch('/tickets/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { status?: string };
      };
      const status = body?.status;
      if (status !== 'open' && status !== 'closed') {
        return { ok: false, error: 'status debe ser open o closed' };
      }
      return db.ticket.update({ where: { id: params?.id }, data: { status } });
    });

    // Eliminar un ticket.
    fastify.delete('/tickets/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.ticket.delete({ where: { id: params?.id } });
    });
  },
});
