import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import { quoteShipping } from '../../../apps/api/src/integrations/shipping';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de envío Andreani. Registra un adaptador en el registro central de
 * envíos (`fastify.shipping.register`); el bloque de ecommerce lo consulta.
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;

    // Normaliza las claves del bloque a las que espera el adaptador compartido.
    const normalized: Record<string, unknown> = {
      token: config.apiKey,
      username: config.userToken,
      password: config.passwordToken,
      baseUrl: config.baseUrl,
    };

    fastify.shipping?.register({
      id: 'andreani',
      displayName: 'Andreani',
      quote: async (_cfg, input) => {
        try {
          const quote = await quoteShipping(
            'andreani',
            normalized,
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
