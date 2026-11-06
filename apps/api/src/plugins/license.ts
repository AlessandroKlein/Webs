import fp from 'fastify-plugin';
import { LicenseService, type LicenseMode } from '../modules/licenses/service';

/** Expone `fastify.license` e inicia la verificación periódica anti-reloj. */
export default fp<{ publicKey?: string; mode?: LicenseMode; production?: boolean }>(
  async (fastify, opts) => {
    const service = new LicenseService(opts.publicKey, opts.mode ?? 'production');
    fastify.decorate('license', service);

    const startup = service.verify();
    if (service.devMode) {
      fastify.log.warn(
        { mode: 'dev' },
        'licencia: MODO DEV habilitado — todas las features premium están activas sin licencia (sólo para pruebas locales)',
      );
    } else if (startup.status !== 'active') {
      if (opts.production && !opts.publicKey) {
        fastify.log.error(
          { status: startup.status },
          'licencia: sin LICENSE_PUBLIC_KEY en producción — sólo el núcleo está operativo (features premium deshabilitadas)',
        );
      } else {
        fastify.log.warn({ status: startup.status }, 'licencia: sin licencia activa');
      }
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
