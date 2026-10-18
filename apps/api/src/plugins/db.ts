import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma';

/** Expone `fastify.prisma` y cierra la conexión al apagar el servidor. */
export default fp(async (fastify) => {
  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
