import type { FastifyInstance } from 'fastify';
import licenseRoutes from './routes';

/** Módulo de licencias: endpoints de activación/estado/features bajo `/api/v1/license`. */
export default async function licenseModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(licenseRoutes, { prefix: '/license' });
}
