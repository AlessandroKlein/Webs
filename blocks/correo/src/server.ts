import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import { quoteShipping } from '../../../apps/api/src/integrations/shipping';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de envío Correo Argentino (MiCorreo). Registra un adaptador en el
 * registro central de envíos (`fastify.shipping.register`).
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;

    fastify.shipping?.register({
      id: 'correo',
      displayName: 'Correo Argentino',
      quote: async (_cfg, input) => {
        try {
          const quote = await quoteShipping(
            'correo',
            config,
            {
              weight: Number(input.weight ?? 0),
              postalCode: input.postalCode,
              destination: input.destination,
              province: input.province,
              city: input.city,
            },
            [],
          );
          if (quote.source !== 'provider' || quote.cost <= 0) return { cost: 0, days: 0 };
          return { cost: quote.cost, days: quote.days ?? 0, currency: quote.currency };
        } catch {
          return { cost: 0, days: 0 };
        }
      },
    });
  },
});
