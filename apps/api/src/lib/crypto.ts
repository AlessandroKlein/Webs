import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { JsonSchema } from '@webs/plugin-sdk';

/**
 * Cifrado de datos sensibles (PII) a nivel de campo con **AES-256-GCM**
 * (autenticado). Usa una clave maestra derivada de `ENCRYPTION_KEY`.
 *
 * Formato de salida: `iv.tag.ciphertext` (base64, separado por `.`).
 * Nunca guardes estos valores en texto plano en la base de datos.
 */

/**
 * Deriva la clave maestra de 32 bytes a partir de `ENCRYPTION_KEY` usando
 * SHA-256. Lanza un error si la variable de entorno no está configurada.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY no está configurada (necesaria para cifrar datos sensibles)');
  }
  return createHash('sha256').update(secret).digest();
}

/** Cifra una cadena con AES-256-GCM y devuelve `iv.tag.ciphertext` en base64. */
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Descifra un valor en formato `iv.tag.ciphertext` y devuelve el texto plano. */
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || !data) throw new Error('Dato cifrado con formato inválido');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Indica si la clave de cifrado está configurada en el entorno. */
export function hasEncryptionKey(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

/**
 * Cifra los campos marcados como `x-ui.secret` en un valor de ajustes, de forma
 * transparente (para guardarlos cifrados en reposo). Sin `ENCRYPTION_KEY` no
 * cifra (avisa y deja el valor tal cual, para no romper el arranque).
 */
export function encryptSecretFields(
  schema: JsonSchema | undefined,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema?.properties) return value;
  if (!hasEncryptionKey()) {
    console.warn('[crypto] ENCRYPTION_KEY no definida; los campos secretos se guardan sin cifrar');
    return value;
  }
  const out: Record<string, unknown> = { ...value };
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop) continue;
    if (prop['x-ui']?.secret && typeof out[key] === 'string' && out[key] !== '') {
      out[key] = encrypt(out[key] as string);
    } else if (prop.type === 'object' && prop.properties && out[key] && typeof out[key] === 'object') {
      out[key] = encryptSecretFields(prop, out[key] as Record<string, unknown>);
    }
  }
  return out;
}

/** Descifra los campos marcados como `x-ui.secret` (tolerante a valores planos). */
export function decryptSecretFields(
  schema: JsonSchema | undefined,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema?.properties) return value;
  const out: Record<string, unknown> = { ...value };
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop) continue;
    if (prop['x-ui']?.secret && typeof out[key] === 'string' && out[key] !== '') {
      try {
        out[key] = decrypt(out[key] as string);
      } catch {
        /* valor sin cifrar (transición) */
      }
    } else if (prop.type === 'object' && prop.properties && out[key] && typeof out[key] === 'object') {
      out[key] = decryptSecretFields(prop, out[key] as Record<string, unknown>);
    }
  }
  return out;
}
