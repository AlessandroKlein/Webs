import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.post('/affiliates', async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; commission?: number } };
      const code = `REF_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      return db.affiliate.create({ data: { userId: body?.userId ?? '', code, commission: body?.commission ?? 0 } });
    });
    fastify.get('/affiliates', async () => db.affiliate.findMany({ orderBy: { createdAt: 'desc' } }));
    fastify.post('/referrals', async (request: unknown) => {
      const { body } = request as { body?: { affiliateId?: string; email?: string; status?: string } };
      return db.referral.create({ data: { affiliateId: body?.affiliateId ?? '', email: body?.email ?? null, status: body?.status ?? 'pending' } });
    });
    fastify.get('/referrals', async () => db.referral.findMany({ orderBy: { createdAt: 'desc' } }));
  },
});
