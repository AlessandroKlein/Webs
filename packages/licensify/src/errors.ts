/** Base error for every Licensify failure. */
export class LicensifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The activation key could not be parsed or decrypted. */
export class InvalidActivationKeyError extends LicensifyError {
  constructor(
    message = "Invalid or malformed activation key",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** AES-256-GCM decryption failed (wrong key / tampered ciphertext). */
export class DecryptionError extends LicensifyError {
  constructor(
    message = "Decryption failed: the key is wrong or the data was tampered with",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** The Ed25519 signature does not match the payload. */
export class SignatureVerificationError extends LicensifyError {
  constructor(message = "Signature verification failed") {
    super(message);
  }
}

/** The license is expired. */
export class LicenseExpiredError extends LicensifyError {
  readonly expiresAt: string;
  constructor(expiresAt: string) {
    super(`License expired at ${expiresAt}`);
    this.expiresAt = expiresAt;
  }
}

/** The license was issued for a different machine (node-locking mismatch). */
export class FingerprintMismatchError extends LicensifyError {
  constructor(message = "Activation key is not bound to this machine (fingerprint mismatch)") {
    super(message);
  }
}

/** The wall clock moved backwards beyond the allowed tolerance. */
export class ClockRollbackError extends LicensifyError {
  readonly lastSeen: number;
  readonly observed: number;
  constructor(lastSeen: number, observed: number) {
    super(`Clock rollback detected: observed ${observed}ms after ${lastSeen}ms`);
    this.lastSeen = lastSeen;
    this.observed = observed;
  }
}

/** A code-integrity (anti-tamper) check failed. */
export class TamperError extends LicensifyError {
  constructor(message = "Code integrity check failed (possible tampering)") {
    super(message);
  }
}
