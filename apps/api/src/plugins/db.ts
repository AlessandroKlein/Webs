import fp from 'fastify-plugin';
import { createPrismaClient } from '../lib/prisma';

/** Expone `fastify.prisma` y cierra la conexión al apagar el servidor. */
export default fp<{ databaseUrl?: string }>(async (fastify, opts) => {
  const prisma = createPrismaClient(opts.databaseUrl);
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
