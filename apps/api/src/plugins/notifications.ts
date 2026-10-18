import fp from 'fastify-plugin';
import { registerNotificationProvider } from '../modules/notifications/registry';

/**
 * Expone el registro de proveedores de notificaciones a los bloques vía
 * `fastify.notifications.register(adapter)`.
 */
export default fp(async (fastify) => {
  fastify.decorate('notifications', { register: registerNotificationProvider });
});
