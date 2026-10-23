/**
 * Core data model for Licensify.
 *
 * A license is a **signed, immutable payload**. The signature is produced with
 * the vendor's Ed25519 private key (which never leaves the issuance
 * environment) and verified with the vendor's public key (embedded in the
 * consumer). Anything that changes the payload invalidates the signature.
 */

/** The license payload. This is the source of truth that gets signed. */
export interface LicensePayload {
  /** Globally unique license id (UUID or similar). */
  id: string;
  /** Product/plugin id this license unlocks. */
  productId: string;
  /** Licensee name or company. */
  licensee: string;
  /** Enabled feature flags (optional). */
  features?: string[];
  /** Numeric limits, e.g. `{ "seats": 5, "maxRequestsPerDay": 10000 }`. */
  limits?: Record<string, number>;
  /** ISO-8601 timestamp of issuance. */
  issuedAt: string;
  /** Optional ISO-8601 expiry timestamp. Absent = perpetual. */
  expiresAt?: string;
}

/** A signed license: the payload plus its Ed25519 signature (base64url). */
export interface SignedLicense {
  /** Format version (1). */
  v: 1;
  /** The signed payload. */
  payload: LicensePayload;
  /** Ed25519 signature over the canonical payload, base64url-encoded. */
  signature: string;
}

/** An Ed25519 key pair, returned as PEM strings (SPKI public, PKCS#8 private). */
export interface KeyPair {
  /** SPKI PEM of the public (verification) key. */
  publicKeyPem: string;
  /** PKCS#8 PEM of the private (signing) key. Keep this secret. */
  privateKeyPem: string;
}

/** Split AES-256 key: two random 32-byte parts whose XOR is the real key. */
export interface SplitKey {
  /** First 32-byte part (random). */
  partA: Buffer;
  /** Second 32-byte part (`partA XOR key`). */
  partB: Buffer;
}

/** Result of an AES-256-GCM encryption (Webs-compatible `iv.tag.ciphertext`). */
export interface EncryptedBlob {
  /** 12-byte IV, base64. */
  iv: string;
  /** 16-byte auth tag, base64. */
  tag: string;
  /** Ciphertext, base64. */
  ciphertext: string;
}

/** Node-locking fingerprint options. */
export interface FingerprintOptions {
  /**
   * Optional extra signals to mix into the fingerprint (e.g. a vendor secret
   * or additional hardware identifiers). Never store raw PII in it.
   */
  extraSignals?: string[];
  /**
   * Optional salt. Providing a stable salt makes the fingerprint domain- and
   * vendor-specific without exposing the raw machine identifiers.
   */
  salt?: string;
}

/** Full activation options (consumer side). */
export interface VerifyActivationOptions {
  /** SPKI PEM of the vendor's public key. */
  publicKeyPem: string;
  /** Fingerprint of the machine performing activation (hex). */
  fingerprint: string;
  /** Reference time for expiry checks (defaults to `Date.now()`). */
  now?: number;
}

/** Issuance options (vendor side). */
export interface IssueActivationOptions {
  /** PKCS#8 PEM of the vendor's private key. */
  privateKeyPem: string;
  /** Fingerprint of the target machine (hex). */
  fingerprint: string;
  /** Optional explicit salt (16 bytes recommended). Random when omitted. */
  salt?: Buffer;
}

/** Result of a successful offline activation. */
export interface ActivationResult {
  /** The license payload that was activated. */
  payload: LicensePayload;
  /** The raw signed license. */
  signedLicense: SignedLicense;
  /** The canonical fingerprint the key was bound to. */
  fingerprint: string;
  /** Whether the license has an expiry in the future or is perpetual. */
  expired: false;
  /** Expiry timestamp, if any. */
  expiresAt?: string;
}

/** A persistence backend for the anti-clock guard's last-seen timestamp. */
export interface ClockStore {
  /** Return the persisted wall-clock timestamp in ms, or null if none. */
  load(): number | null;
  /** Persist a wall-clock timestamp in ms. */
  save(timestamp: number): void;
}
