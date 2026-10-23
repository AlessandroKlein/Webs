import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { DecryptionError } from "./errors.js";
import type { EncryptedBlob, SplitKey } from "./types.js";
import { sha256 } from "./util.js";

const IV_LENGTH = 12; // GCM standard nonce size
const KEY_LENGTH = 32; // AES-256

/**
 * AES-256-GCM encryption with an XOR **split key**.
 *
 * The real 32-byte key never needs to sit as one contiguous constant in the
 * binary: it is derived (SHA-256 of a secret), then split into two random
 * parts `partA` and `partB = partA XOR key`. Only `partA` and `partB` are
 * stored; the key is reconstructed in memory at the moment of use.
 */

export interface RawEncrypted {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** Derive a 32-byte AES key from a secret (SHA-256). */
export function deriveKey(secret: string | Buffer | Uint8Array): Buffer {
  return sha256(secret);
}

/**
 * Split a 32-byte key into two 32-byte parts such that `partA XOR partB` is
 * the original key. `partA` is random, so each split is different.
 */
export function splitKey(key: Buffer): SplitKey {
  assertKeyLength(key);
  const partA = randomBytes(KEY_LENGTH);
  const partB = xorBuffers(key, partA);
  return { partA, partB };
}

/** Recombine two split-key parts into the original key (`partA XOR partB`). */
export function combineKey(partA: Buffer, partB: Buffer): Buffer {
  assertKeyLength(partA);
  assertKeyLength(partB);
  return xorBuffers(partA, partB);
}

/** Low-level AES-256-GCM encryption returning raw iv/ciphertext/tag. */
export function encryptAesGcmRaw(
  plaintext: string | Buffer | Uint8Array,
  key: Buffer,
): RawEncrypted {
  assertKeyLength(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  return { iv, ciphertext, tag: cipher.getAuthTag() };
}

/** Low-level AES-256-GCM decryption from raw iv/ciphertext/tag. */
export function decryptAesGcmRaw(parts: RawEncrypted, key: Buffer): Buffer {
  assertKeyLength(key);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, parts.iv);
    decipher.setAuthTag(parts.tag);
    return Buffer.concat([
      decipher.update(parts.ciphertext),
      decipher.final(),
    ]);
  } catch (error) {
    throw new DecryptionError(undefined, { cause: error });
  }
}

/**
 * Encrypt with AES-256-GCM. Returns a Webs-compatible `iv.tag.ciphertext`
 * structure (each field base64), matching `apps/api/src/lib/crypto.ts`.
 */
export function encryptAesGcm(
  plaintext: string | Buffer | Uint8Array,
  key: Buffer,
): EncryptedBlob {
  const raw = encryptAesGcmRaw(plaintext, key);
  return {
    iv: raw.iv.toString("base64"),
    tag: raw.tag.toString("base64"),
    ciphertext: raw.ciphertext.toString("base64"),
  };
}

/** Serialize an {@link EncryptedBlob} to the compact `iv.tag.ciphertext` string. */
export function serializeEncrypted(blob: EncryptedBlob): string {
  return `${blob.iv}.${blob.tag}.${blob.ciphertext}`;
}

/** Parse the compact `iv.tag.ciphertext` string back into an {@link EncryptedBlob}. */
export function parseEncrypted(serialized: string): EncryptedBlob {
  const parts = serialized.split(".");
  if (parts.length !== 3) {
    throw new DecryptionError("Invalid encrypted payload format (expected iv.tag.ciphertext)");
  }
  return { iv: parts[0]!, tag: parts[1]!, ciphertext: parts[2]! };
}

/**
 * Decrypt AES-256-GCM ciphertext. Accepts an {@link EncryptedBlob} or the
 * compact `iv.tag.ciphertext` string. Throws {@link DecryptionError} on any
 * tampering or wrong key (GCM authentication failure).
 */
export function decryptAesGcm(
  blob: EncryptedBlob | string,
  key: Buffer,
): Buffer {
  const parsed = typeof blob === "string" ? parseEncrypted(blob) : blob;
  return decryptAesGcmRaw(
    {
      iv: Buffer.from(parsed.iv, "base64"),
      tag: Buffer.from(parsed.tag, "base64"),
      ciphertext: Buffer.from(parsed.ciphertext, "base64"),
    },
    key,
  );
}

function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i]! ^ b[i]!;
  }
  return out;
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`AES-256 key must be ${KEY_LENGTH} bytes (got ${key.length}). Use deriveKey().`);
  }
}
