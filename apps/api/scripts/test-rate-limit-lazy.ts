// Smoke test t49: el limitador GLOBAL se crea lazy y usa Redis cuando
// `fastify.redis` está decorado (aunque rateLimitPlugin se registre ANTES que
// redisPlugin, como en app.ts). Si usara memoria, no llamaría a Redis.
// Ejecutar desde apps/api:  pnpm --filter @webs/api exec tsx scripts/test-rate-limit-lazy.ts
import Fastify from 'fastify';
import rateLimitPlugin from '../src/plugins/rate-limit';

const calls = { defineCommand: 0, rlflxIncr: 0 };

// Fake ioredis mínimo: `defineCommand` registra `rlflxIncr` (lo que usa
// RateLimiterRedis.consume con secDuration>0) y devuelve [consumed, ttlMs].
const fakeRedis = {
  constructor: { name: 'Object' },
  multi() {
    // `_upsert` construye `this.client.multi()` antes de decidir la ruta; en la
    // ruta `rlflxIncr` no se usa, así que un chain vacío alcanza.
    return {
      set: () => undefined,
      pttl: () => undefined,
      pTTL: () => undefined,
      incrby: () => undefined,
      incrBy: () => undefined,
      get: () => undefined,
      del: () => undefined,
      exec: async () => [],
    };
  },
  defineCommand(name: string, _opts: unknown) {
    calls.defineCommand++;
    (this as unknown as Record<string, unknown>)[name] = async () => {
      calls.rlflxIncr++;
      return [1, 60000];
    };
  },
};

const app = Fastify({ logger: false });

// 1) rateLimitPlugin ANTES de decorar redis (reproduce el orden de app.ts).
await app.register(rateLimitPlugin);
// 2) redisPlugin DESPUÉS (decora fastify.redis).
app.decorate('redis', fakeRedis as never);
app.get('/ping', async () => ({ ok: true }));

await app.ready();

const checks: Array<[string, boolean]> = [];
const assert = (n: string, c: boolean) => {
  checks.push([n, c]);
  if (!c) console.error(`FAIL: ${n}`);
};

try {
  const res = await app.inject({ method: 'GET', url: '/ping', remoteAddress: '1.2.3.4' });
  assert('request 200', res.statusCode === 200);
  assert('RateLimiterRedis construido (defineCommand llamado)', calls.defineCommand === 1);
  assert('consume usó Redis (rlflxIncr llamado)', calls.rlflxIncr >= 1);
} finally {
  await app.close();
}

const failed = checks.filter(([, ok]) => !ok).length;
console.log(`SMOKE ${failed === 0 ? 'OK' : 'FAIL'} (${checks.length - failed}/${checks.length})`);
process.exit(failed === 0 ? 0 : 1);
