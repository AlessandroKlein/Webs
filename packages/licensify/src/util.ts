import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Canonical, deterministic JSON serialization: object keys are sorted
 * recursively. Signing must always operate on this representation so that the
 * same payload produces the same signature regardless of key insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",");
  return `{${body}}`;
}

/** Encode bytes to lowercase hex. */
export function bytesToHex(bytes: Buffer | Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** Decode hex to bytes. Throws on invalid input. */
export function hexToBytes(hex: string): Buffer {
  const normalized = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (normalized.length % 2 !== 0) {
    throw new Error(`Invalid hex string (odd length): "${hex}"`);
  }
  if (!/^[0-9a-f]*$/.test(normalized)) {
    throw new Error(`Invalid hex string: "${hex}"`);
  }
  return Buffer.from(normalized, "hex");
}

/** SHA-256 of a string or buffer, returned as a 32-byte Buffer. */
export function sha256(input: string | Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(input).digest();
}

/** SHA-256 of a string or buffer, returned as lowercase hex. */
export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Constant-time comparison of two buffers or strings. Use for hashes and
 * other secret-derived values to avoid leaking position via timing.
 */
export function secureCompare(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === "string" ? Buffer.from(a) : a;
  const bufB = typeof b === "string" ? Buffer.from(b) : b;
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length is not leaked through early return.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Base64url (RFC 4648 §5) encode, used for Ed25519 signatures in JSON. */
export function base64UrlEncode(bytes: Buffer | Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Base64url decode. */
export function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
