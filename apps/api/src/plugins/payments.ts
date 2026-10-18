import fp from 'fastify-plugin';
import { registerPaymentProvider } from '../modules/payments/registry';

/**
 * Expone el registro de proveedores de pago a los bloques vía
 * `fastify.payments.register(adapter)`.
 */
export default fp(async (fastify) => {
  fastify.decorate('payments', { register: registerPaymentProvider });
});
