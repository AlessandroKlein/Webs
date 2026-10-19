import type { Redis } from 'ioredis';

/**
 * Caché de consultas repetitivas: Redis si está disponible, memoria en un solo
 * nodo como respaldo. Se usa para settings, i18n y el catálogo de bloques.
 */
const memory = new Map<string, { value: unknown; expiresAt: number }>();

/**
 * Recupera un valor de caché por clave. Usa Redis cuando está disponible y cae
 * al almacén en memoria; devuelve `null` ante ausencia, expiración o error.
 */
export async function cacheGet<T>(redis: Redis | null, key: string): Promise<T | null> {
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value as T;
}

/**
 * Almacena un valor en caché con un TTL en segundos. En Redis usa `SET EX`;
 * en memoria guarda la marca de expiración calculada a partir del TTL.
 */
export async function cacheSet(redis: Redis | null, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* noop */
    }
    return;
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Elimina una clave de la caché, tanto en Redis como en el respaldo en memoria. */
export async function cacheDel(redis: Redis | null, key: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      /* noop */
    }
    return;
  }
  memory.delete(key);
}
