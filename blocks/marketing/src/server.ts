import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const coupons = (Array.isArray((config as Record<string, unknown>).coupons) ? (config as Record<string, unknown>).coupons : []) as Array<{ code: string; percent: number }>;

    fastify.post('/coupon/validate', async (request: unknown) => {
      const { body } = request as { body?: { code?: string; amount?: number } };
      const coupon = coupons.find((c) => c.code === body?.code);
      if (!coupon) return { valid: false };
      const discount = Math.round((body?.amount ?? 0) * coupon.percent) / 100;
      return { valid: true, percent: coupon.percent, discount, total: (body?.amount ?? 0) - discount };
    });
  },
});
