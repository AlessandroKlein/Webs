import type { FastifyInstance } from 'fastify';

/** Endpoints de salud (liveness y readiness), sin autenticación. */
export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
      },
    },
    async () => ({ status: 'ok', uptime: process.uptime() }),
  );

  fastify.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: { 200: { type: 'object' }, 503: { type: 'object' } },
      },
    },
    async (_request, reply) => {
      try {
        await fastify.prisma.$queryRaw`SELECT 1`;
        return { status: 'ready' };
      } catch {
        return reply.status(503).send({ status: 'not_ready' });
      }
    },
  );
}
