import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface FormulariosConfig {
  allowAnonymous?: boolean;
  successMessage?: string;
  notificationsEmail?: string;
}

/**
 * Bloque de formularios. Rutas bajo `/api/v1/blocks/formularios`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as FormulariosConfig;
    const allowAnonymous = cfg.allowAnonymous !== false;

    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    fastify.get('/forms', async () => db.form.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post(
      '/forms',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { body } = request as { body?: { title?: string; fields?: unknown } };
        return db.form.create({ data: { title: body?.title ?? '', fields: body?.fields ?? [] } });
      },
    );

    fastify.patch(
      '/forms/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params, body } = request as {
          params?: { id?: string };
          body?: { title?: string; fields?: unknown };
        };
        const data: Record<string, unknown> = {};
        if (body?.title !== undefined) data.title = body.title;
        if (body?.fields !== undefined) data.fields = body.fields;
        return db.form.update({ where: { id: params?.id }, data });
      },
    );

    fastify.delete(
      '/forms/:id',
      { preHandler: [authenticate] },
      async (request: unknown) => {
        const { params } = request as { params?: { id?: string } };
        await db.form.delete({ where: { id: params?.id } });
        return { ok: true };
      },
    );

    // Respuestas de un formulario (lectura pública).
    fastify.get('/forms/:id/responses', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.formResponse.findMany({
        where: { formId: params?.id },
        orderBy: { createdAt: 'desc' },
      });
    });

    // La respuesta es anónima por defecto (`allowAnonymous`); con
    // `allowAnonymous=false` exige sesión. Las mutaciones administrativas
    // (crear/editar/borrar formularios) siempre requieren authenticate.
    const responsePreHandler = allowAnonymous ? [] : [authenticate];
    fastify.post(
      '/forms/:id/responses',
      { preHandler: responsePreHandler },
      async (request: unknown) => {
        const { params, body } = request as {
          params?: { id?: string };
          body?: { data?: unknown };
        };
        if (typeof body?.data !== 'object' || body?.data === null || Array.isArray(body?.data)) {
          return { ok: false, error: 'data debe ser un objeto' };
        }
        return db.formResponse.create({
          data: { formId: params?.id ?? '', data: body.data },
        });
      },
    );
  },
});
