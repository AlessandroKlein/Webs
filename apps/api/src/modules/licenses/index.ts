import type { FastifyInstance } from 'fastify';
import licenseRoutes from './routes';
import licenseKeysRoutes from './keys';

/** Módulo de licencias: endpoints de activación/estado/features bajo `/api/v1/license`. */
export default async function licenseModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(licenseRoutes, { prefix: '/license' });
  // Registro local de ventas y claves (spec `claves-de-venta.md`):
  // `/license/sales`, `/license/keys`.
  await fastify.register(licenseKeysRoutes, { prefix: '/license' });
}
