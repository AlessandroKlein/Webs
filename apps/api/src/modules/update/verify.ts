import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

/**
 * Verificación de integridad y autenticidad de artefactos de actualización.
 *
 * Mismo mecanismo que `@licensify/core` (ADR-0007 / ADR-0010): sha256 del
 * artefacto y firma Ed25519 **offline** (clave pública embebida/configurada,
 * clave privada nunca presente en runtime). Se implementa con los built-ins de
 * `node:crypto` (cero dependencias) para no acoplar el monorepo de Webs a un
 * paquete externo: cuando `@licensify/core` esté publicado, esta capa se puede
 * sustituir por `verifyEd25519`/`sha256Hex` de ese paquete sin cambiar formato
 * (clave pública PEM SPKI, firma base64url sobre el digest en hex).
 */

/** sha256 de un buffer/string, en hexadecimal. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** sha256 de un archivo, en hexadecimal (streaming, no carga en memoria). */
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/**
 * Verifica una firma Ed25519 (base64url) sobre un mensaje (string) con una
 * clave pública PEM (SPKI). Devuelve `true` solo si la firma es válida.
 *
 * El mensaje firmado es el **digest sha256 en hex** del artefacto (no el
 * artefacto completo), igual que en el flujo de releases de Webs: se publica
 * `digest` (hex) y `signature` (base64url de Ed25519 sobre `digest`).
 */
export function verifyEd25519(message: string, signatureB64Url: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    const signature = Buffer.from(signatureB64Url, 'base64url');
    return nodeVerify(null, Buffer.from(message, 'utf8'), key, signature);
  } catch {
    return false;
  }
}

/**
 * Decodifica una firma base64url a bytes. Acepta base64 estándar y base64url
 * (los dos alfabetos); útil para normalizar valores de release.
 */
export function decodeSignature(signature: string): Buffer {
  const normalized = signature.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}
