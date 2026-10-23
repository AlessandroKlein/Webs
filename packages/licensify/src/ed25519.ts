import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import type { KeyPair } from "./types.js";
import { base64UrlDecode, base64UrlEncode, stableStringify } from "./util.js";

/**
 * Ed25519 key generation / signing / verification, backed by Node's built-in
 * `crypto` module (no native dependencies, no external code).
 *
 * Key representation is PEM (SPKI for the public key, PKCS#8 for the private
 * key), which is portable across tools (OpenSSL, Node, WebCrypto via SPKI).
 */

/** Generate a fresh Ed25519 key pair. */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Parse a PEM (SPKI or PKCS#8) into a KeyObject for use with sign/verify. */
function parsePublicKey(pem: string): ReturnType<typeof createPublicKey> {
  return createPublicKey(pem);
}

function parsePrivateKey(pem: string): ReturnType<typeof createPrivateKey> {
  return createPrivateKey(pem);
}

/**
 * Sign a value (any JSON-serializable value, or a raw string) with the private
 * key. The value is canonicalized (`stableStringify`) before signing so the
 * same payload always produces the same signature.
 *
 * Returns the signature as base64url.
 */
export function signEd25519(
  value: unknown,
  privateKeyPem: string,
): string {
  const data = Buffer.from(normalizeToBytes(value), "utf8");
  const signature = nodeSign(null, data, parsePrivateKey(privateKeyPem));
  return base64UrlEncode(signature);
}

/**
 * Verify a base64url Ed25519 signature over a value.
 * Returns `true` only when the signature is valid for the given public key.
 */
export function verifyEd25519(
  value: unknown,
  signatureB64Url: string,
  publicKeyPem: string,
): boolean {
  const data = Buffer.from(normalizeToBytes(value), "utf8");
  let signature: Buffer;
  try {
    signature = base64UrlDecode(signatureB64Url);
  } catch {
    return false;
  }
  try {
    return nodeVerify(null, data, parsePublicKey(publicKeyPem), signature);
  } catch {
    return false;
  }
}

/** Canonicalize any value to the exact bytes that get signed/verified. */
function normalizeToBytes(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return stableStringify(value);
}
