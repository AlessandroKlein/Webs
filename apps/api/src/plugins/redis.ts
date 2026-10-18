import fp from 'fastify-plugin';
import { createRedis } from '../lib/redis';

/** Expone `fastify.redis` (null si no hay REDIS_URL). */
export default fp<{ redisUrl?: string }>(async (fastify, opts) => {
  const redis = createRedis(opts.redisUrl);
  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    if (redis) await redis.quit();
  });
});
