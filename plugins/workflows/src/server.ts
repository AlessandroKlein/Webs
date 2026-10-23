import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/workflows', async () => db.workflow.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/workflows', async (request: unknown) => {
      const { body } = request as { body?: { name?: string; trigger?: string; steps?: unknown; enabled?: boolean } };
      return db.workflow.create({
        data: { name: body?.name ?? '', trigger: body?.trigger ?? '', steps: body?.steps ?? [], enabled: body?.enabled ?? true },
      });
    });
    fastify.patch('/workflows/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { name?: string; trigger?: string; steps?: unknown; enabled?: boolean } };
      return db.workflow.update({
        where: { id: params?.id },
        data: {
          ...(body?.name != null ? { name: body.name } : {}),
          ...(body?.trigger != null ? { trigger: body.trigger } : {}),
          ...(body?.steps != null ? { steps: body.steps } : {}),
          ...(body?.enabled != null ? { enabled: body.enabled } : {}),
        },
      });
    });
  },
});
