import Redis from 'ioredis';

/**
 * Cliente Redis opcional. Se usa para:
 *  - caché de respuestas,
 *  - pub/sub para escalar WebSocket en múltiples instancias,
 *  - bloqueos distribuidos.
 *
 * Devuelve `null` si no hay `REDIS_URL` configurada (desarrollo simple).
 */
export function createRedis(url?: string): Redis | null {
  if (!url) return null;
  const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  void client.connect().catch((err) => {
    console.warn('[redis] no se pudo conectar:', err?.message);
  });
  return client;
}
