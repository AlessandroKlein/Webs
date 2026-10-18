import fp from 'fastify-plugin';
import type { Env } from '../config/env';

/** Expone la configuración tipada como `fastify.config`. */
export default fp<{ env: Env }>(async (fastify, opts) => {
  fastify.decorate('config', opts.env);
});
