import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const defaultDiscountPercent = Number(cfg.defaultDiscountPercent ?? 10);
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // ------------------------------------------------------------------
    // Cupones (persistentes, tabla `coupons`)
    // ------------------------------------------------------------------
    fastify.get('/coupons', async () => db.coupon.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post('/coupons', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { code?: string; discountPercent?: number; validUntil?: string; active?: boolean } };
      return db.coupon.create({
        data: {
          code: body?.code ?? '',
          discountPercent: Number(body?.discountPercent ?? defaultDiscountPercent),
          validUntil: body?.validUntil ? new Date(body.validUntil) : null,
          active: body?.active ?? true,
        },
      });
    });

    fastify.patch('/coupons/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { code?: string; discountPercent?: number; validUntil?: string | null; active?: boolean };
      };
      const data: Record<string, unknown> = {};
      if (body?.code !== undefined) data.code = body.code;
      if (body?.discountPercent !== undefined) data.discountPercent = Number(body.discountPercent);
      if (body?.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;
      if (body?.active !== undefined) data.active = body.active;
      return db.coupon.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/coupons/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.coupon.delete({ where: { id: params?.id } });
    });

    // ------------------------------------------------------------------
    // Campañas de email (tabla `email_campaigns`)
    // ------------------------------------------------------------------
    fastify.get('/campaigns', async () => db.emailCampaign.findMany({ orderBy: { createdAt: 'desc' } }));

    fastify.post('/campaigns', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { name?: string; subject?: string; recipientType?: string } };
      // TODO: si `settings.emailProvider` no es "internal", encolar el envío en el
      // proveedor configurado (mailchimp/resend/sendgrid) usando `settings.emailApiKey`.
      return db.emailCampaign.create({
        data: {
          name: body?.name ?? '',
          subject: body?.subject ?? null,
          recipientType: body?.recipientType ?? 'all',
          status: 'draft',
        },
      });
    });

    // ------------------------------------------------------------------
    // Contadores simples
    // ------------------------------------------------------------------
    fastify.get('/stats', async () => {
      const [coupons, activeCoupons, campaigns] = await Promise.all([
        db.coupon.count(),
        db.coupon.count({ where: { active: true } }),
        db.emailCampaign.count(),
      ]);
      return { coupons, activeCoupons, campaigns };
    });
  },
});
