import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/organizations', async () => db.organization.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/organizations', async (request: unknown) => {
      const { body } = request as { body?: { name?: string; plan?: string; active?: boolean } };
      return db.organization.create({
        data: { name: body?.name ?? '', plan: body?.plan ?? 'free', active: body?.active ?? true },
      });
    });
    fastify.post('/organizations/:id/members', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { userId?: string; role?: string } };
      return db.membership.create({
        data: { organizationId: params?.id ?? '', userId: body?.userId ?? '', role: body?.role ?? 'member' },
      });
    });
    fastify.get('/memberships', async () => db.membership.findMany({ orderBy: { createdAt: 'desc' } }));
  },
});
