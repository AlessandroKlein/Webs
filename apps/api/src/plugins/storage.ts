import fp from 'fastify-plugin';
import { localDriver, registerStorageDriver } from '../lib/storage';

/**
 * Expone el registro de drivers de almacenamiento a los bloques vía
 * `fastify.storage.register(driver)`. Registra el driver local por defecto.
 */
export default fp(async (fastify) => {
  registerStorageDriver(localDriver);
  fastify.decorate('storage', { register: registerStorageDriver });
});
