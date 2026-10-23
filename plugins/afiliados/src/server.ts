import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/**
 * afiliados — servidor.
 *
 * CRUD de afiliados y referidos bajo `/api/v1/plugins/afiliados`:
 *  - GET    /affiliates
 *  - POST   /affiliates {userId, code?, commission?}
 *  - PATCH  /affiliates/:id
 *  - DELETE /affiliates/:id
 *  - GET    /referrals
 *  - POST   /referrals {affiliateId, email}
 *  - PATCH  /referrals/:id {status}
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const defaultCommission = Number((config as Record<string, unknown>).defaultCommission ?? 0) || 0;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    const genCode = () => crypto.randomUUID().slice(0, 8);

    fastify.get('/affiliates', { preHandler: [authenticate] }, async () =>
      db.affiliate.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    fastify.post('/affiliates', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; code?: string; commission?: number } };
      const userId = body?.userId ?? '';
      if (!userId) return { ok: false, error: 'userId es requerido' };
      const code = (body?.code ?? '').trim() || genCode();
      const commission = Number(body?.commission ?? defaultCommission) || 0;
      const affiliate = await db.affiliate.create({ data: { userId, code, commission } });
      return { ok: true, affiliate };
    });

    fastify.patch('/affiliates/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { code?: string; commission?: number; userId?: string };
      };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      const data: Record<string, unknown> = {};
      if (typeof body?.code === 'string' && body.code) data.code = body.code;
      if (typeof body?.commission === 'number') data.commission = body.commission;
      if (typeof body?.userId === 'string' && body.userId) data.userId = body.userId;
      const affiliate = await db.affiliate.update({ where: { id: params.id }, data });
      return { ok: true, affiliate };
    });

    fastify.delete('/affiliates/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      await db.affiliate.delete({ where: { id: params.id } });
      return { ok: true };
    });

    fastify.get('/referrals', { preHandler: [authenticate] }, async () =>
      db.referral.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    fastify.post('/referrals', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { affiliateId?: string; email?: string } };
      const affiliateId = body?.affiliateId ?? '';
      if (!affiliateId) return { ok: false, error: 'affiliateId es requerido' };
      const referral = await db.referral.create({
        data: { affiliateId, email: body?.email ?? null, status: 'pending' },
      });
      return { ok: true, referral };
    });

    fastify.patch('/referrals/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { status?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      const referral = await db.referral.update({
        where: { id: params.id },
        data: { status: body?.status ?? 'pending' },
      });
      return { ok: true, referral };
    });
  },
});
