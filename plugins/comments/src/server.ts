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

    // Listado público de comentarios.
    fastify.get('/comments', async () => db.comment.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post('/comments', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { author?: string; body?: string; rating?: number } };
      return db.comment.create({
        data: {
          author: body?.author ?? 'Anónimo',
          body: body?.body ?? '',
          rating: Math.min(5, Math.max(1, Math.round(body?.rating ?? 5))),
          organizationId: await resolveOrgId(request),
        },
      });
    });

    fastify.patch('/comments/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { author?: string; body?: string; rating?: number };
      };
      const data: Record<string, unknown> = {};
      if (body?.author !== undefined) data.author = body.author;
      if (body?.body !== undefined) data.body = body.body;
      if (body?.rating !== undefined) data.rating = Math.min(5, Math.max(1, Math.round(body.rating)));
      return db.comment.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/comments/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.comment.delete({ where: { id: params?.id } });
    });
  },
});
