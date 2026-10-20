import fp from 'fastify-plugin';
import {
  getShippingProvider,
  listShippingProviders,
  registerShippingProvider,
} from '../modules/shipping/registry';

/**
 * Expone el registro de proveedores de envío a los bloques vía
 * `fastify.shipping.register(adapter)`, `fastify.shipping.get(id)` y
 * `fastify.shipping.list()`.
 */
export default fp(async (fastify) => {
  fastify.decorate('shipping', {
    register: registerShippingProvider,
    get: getShippingProvider,
    list: listShippingProviders,
  });
});
