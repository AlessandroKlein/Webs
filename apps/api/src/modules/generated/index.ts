import type { FastifyInstance } from 'fastify';
import generatedRoutes from './routes';

/** Módulo del motor generador de APIs (ADR-0020): recursos + registros bajo `/generated`. */
export default async function generatedModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(generatedRoutes);
}
