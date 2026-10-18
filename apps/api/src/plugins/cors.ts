import fp from 'fastify-plugin';
import cors from '@fastify/cors';

/** CORS con orígenes configurables vía `CORS_ORIGIN`. */
export default fp<{ origins: string[] }>(async (fastify, opts) => {
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Permite peticiones sin Origin (curl, server-to-server) y orígenes listados.
      if (!origin || opts.origins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Origen no permitido por CORS'), false);
    },
    credentials: true,
  });
});
