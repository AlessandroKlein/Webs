import fs from 'node:fs';
import type { Env } from '../config/env';

export interface TlsOptions {
  cert: Buffer;
  key: Buffer;
}

/**
 * Carga las credenciales TLS desde archivo o desde variables de entorno
 * (útil para secretos de Kubernetes). Devuelve `null` si TLS está deshabilitado
 * o no hay certificado/clave configurados.
 */
export function loadTls(env: Env): TlsOptions | null {
  if (!env.SSL_ENABLED) return null;

  const cert = env.SSL_CERT_PATH
    ? fs.readFileSync(env.SSL_CERT_PATH)
    : env.SSL_CERT
      ? Buffer.from(env.SSL_CERT)
      : null;
  const key = env.SSL_KEY_PATH
    ? fs.readFileSync(env.SSL_KEY_PATH)
    : env.SSL_KEY
      ? Buffer.from(env.SSL_KEY)
      : null;

  if (!cert || !key) return null;
  return { cert, key };
}
