import type { FastifyInstance } from 'fastify';
import inventoryRoutes from './routes';
import stockRoutes from './stock';

/** Módulo de inventario completo (ADR-0023): catálogo, almacenes, stock y operaciones bajo `/inventory`. */
export default async function inventoryModule(fastify: FastifyInstance): Promise<void> {
  await fastify.register(inventoryRoutes);
  await fastify.register(stockRoutes);
}
