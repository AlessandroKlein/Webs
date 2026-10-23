import { LicenseExpiredError, SignatureVerificationError } from "./errors.js";
import { signEd25519, verifyEd25519 } from "./ed25519.js";
import type { LicensePayload, SignedLicense } from "./types.js";
import { stableStringify } from "./util.js";

/**
 * Signed license primitives: wrap a {@link LicensePayload} with an Ed25519
 * signature, and verify signature + expiry on the consumer side.
 */

/** Sign a payload with the vendor's private key, producing a {@link SignedLicense}. */
export function signLicense(
  payload: LicensePayload,
  privateKeyPem: string,
): SignedLicense {
  const signature = signEd25519(payload, privateKeyPem);
  return { v: 1, payload, signature };
}

/**
 * Verify the Ed25519 signature of a {@link SignedLicense} against the vendor's
 * public key. Throws {@link SignatureVerificationError} on mismatch.
 */
export function verifyLicenseSignature(
  license: SignedLicense,
  publicKeyPem: string,
): void {
  const valid = verifyEd25519(license.payload, license.signature, publicKeyPem);
  if (!valid) {
    throw new SignatureVerificationError();
  }
}

/** Whether a payload is expired at a reference time (default: now). */
export function isLicenseExpired(payload: LicensePayload, now = Date.now()): boolean {
  if (!payload.expiresAt) {
    return false;
  }
  const expiryMs = Date.parse(payload.expiresAt);
  if (Number.isNaN(expiryMs)) {
    // A malformed expiry must not silently grant access: treat as expired.
    return true;
  }
  return now > expiryMs;
}

/** Assert that a payload is not expired; throws {@link LicenseExpiredError}. */
export function assertNotExpired(payload: LicensePayload, now = Date.now()): void {
  if (isLicenseExpired(payload, now)) {
    throw new LicenseExpiredError(payload.expiresAt!);
  }
}

/**
 * Parse a signed license from its JSON text. Uses canonicalization only for
 * signing/verification; the parsed payload is returned as-is.
 */
export function parseSignedLicense(json: string): SignedLicense {
  const parsed = JSON.parse(json) as SignedLicense;
  if (!parsed || parsed.v !== 1 || !parsed.payload || typeof parsed.signature !== "string") {
    throw new Error("Invalid signed license: expected { v: 1, payload, signature }");
  }
  return parsed;
}

/** Serialize a signed license to canonical JSON (for storage / transport). */
export function stringifySignedLicense(license: SignedLicense): string {
  return stableStringify(license);
}
