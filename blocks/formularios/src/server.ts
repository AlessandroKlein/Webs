import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/forms', async () => db.form.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/forms', async (request: unknown) => {
      const { body } = request as { body?: { title?: string; fields?: unknown } };
      return db.form.create({ data: { title: body?.title ?? '', fields: body?.fields ?? [] } });
    });
    fastify.post('/forms/:id/submit', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { data?: unknown } };
      return db.formResponse.create({ data: { formId: params?.id ?? '', data: body?.data ?? {} } });
    });
    fastify.get('/responses', async () => db.formResponse.findMany({ orderBy: { createdAt: 'desc' } }));
  },
});
