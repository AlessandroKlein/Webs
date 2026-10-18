/**
 * Rate limiter en memoria por token de API (ventana fija de 1 minuto).
 * En un despliegue en cluster, sustituir por un store compartido (Redis).
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkTokenRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const window = windows.get(key);
  if (!window || now >= window.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  window.count += 1;
  return window.count <= limit;
}
