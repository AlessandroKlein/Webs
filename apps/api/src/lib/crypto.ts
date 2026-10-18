import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado de datos sensibles (PII) a nivel de campo con **AES-256-GCM**
 * (autenticado). Usa una clave maestra derivada de `ENCRYPTION_KEY`.
 *
 * Formato de salida: `iv.tag.ciphertext` (base64, separado por `.`).
 * Nunca guardes estos valores en texto plano en la base de datos.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY no está configurada (necesaria para cifrar datos sensibles)');
  }
  return createHash('sha256').update(secret).digest();
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

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
