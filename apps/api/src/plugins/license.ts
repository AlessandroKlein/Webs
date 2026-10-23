import fp from 'fastify-plugin';
import { LicenseService } from '../modules/licenses/service';

/** Expone `fastify.license` e inicia la verificación periódica anti-reloj. */
export default fp<{ publicKey?: string }>(
  async (fastify, opts) => {
    const service = new LicenseService(opts.publicKey);
    fastify.decorate('license', service);

    const startup = service.verify();
    if (startup.status !== 'active') {
      fastify.log.warn({ status: startup.status }, 'licencia: sin licencia activa');
    } else {
      fastify.log.info(
        {
          productId: startup.productId,
          features: startup.features,
          expiresAt: startup.expiresAt,
        },
        'licencia: activa',
      );
    }

    service.startPeriodic((message) => fastify.log.info(message));

    fastify.addHook('onClose', async () => {
      service.stop();
    });
  },
  { name: 'license' },
);
