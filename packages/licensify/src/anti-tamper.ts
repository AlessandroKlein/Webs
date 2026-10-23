import { createHash, createHmac } from "node:crypto";
import { TamperError } from "./errors.js";
import { secureCompare } from "./util.js";

/**
 * Anti-tamper: hash a "critical code section" at build time and re-verify the
 * hash at runtime. If an attacker patches the protected code, the hash changes
 * and the guard trips.
 *
 * The recommended flow is:
 * 1. At build time compute `expected = hashSection(criticalSource)` (optionally
 *    keyed with `secret` → HMAC-SHA256 so the hash cannot be recomputed by an
 *    attacker who can read the plain source).
 * 2. Embed `expected` (or split it) in the shipped code.
 * 3. At runtime call `new TamperGuard(expected, { secret }).assert(currentSource)`.
 */

/** SHA-256 of a code section, or HMAC-SHA256 when a secret is provided. */
export function hashSection(content: string | Buffer, secret?: string | Buffer): string {
  if (secret) {
    return createHmac("sha256", secret).update(content).digest("hex");
  }
  return createHash("sha256").update(content).digest("hex");
}

/** A runtime guard that verifies a code section against an expected hash. */
export class TamperGuard {
  private readonly expectedHash: string;
  private readonly secret?: string | Buffer;

  constructor(expectedHash: string, options: { secret?: string | Buffer } = {}) {
    this.expectedHash = expectedHash;
    this.secret = options.secret;
  }

  /** Whether `content` hashes to the expected value (constant-time compare). */
  verify(content: string | Buffer): boolean {
    const actual = hashSection(content, this.secret);
    return secureCompare(actual, this.expectedHash);
  }

  /** Verify, or throw {@link TamperError} on mismatch. */
  assert(content: string | Buffer): void {
    if (!this.verify(content)) {
      throw new TamperError();
    }
  }
}
