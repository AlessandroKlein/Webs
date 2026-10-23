import { randomBytes } from "node:crypto";
import { crockfordBase32Decode, crockfordBase32Encode } from "./base32.js";
import { decryptAesGcmRaw, encryptAesGcmRaw } from "./aes.js";
import {
  InvalidActivationKeyError,
} from "./errors.js";
import { deriveFingerprintKey, fingerprintToBytes } from "./fingerprint.js";
import {
  assertNotExpired,
  signLicense,
  verifyLicenseSignature,
} from "./license.js";
import type {
  ActivationResult,
  IssueActivationOptions,
  LicensePayload,
  SignedLicense,
  VerifyActivationOptions,
} from "./types.js";
import { stableStringify } from "./util.js";

/**
 * Offline activation key (Crockford Base32).
 *
 * Binary layout (version 1), in byte order:
 *
 * ```
 * ┌─────────┬─────────┬────────┬────────┬──────────────┬─────────┐
 * │ MAGIC   │ VERSION │ SALT   │ IV     │ CIPHERTEXT   │ TAG     │
 * │ 4 bytes │ 1 byte  │ 16 B   │ 12 B   │ var          │ 16 B    │
 * └─────────┴─────────┴────────┴────────┴──────────────┴─────────┘
 * ```
 *
 * - `MAGIC`  = ASCII `"LSNF"` (0x4C 0x53 0x4E 0x46).
 * - `VERSION` = 0x01.
 * - `SALT`   = 16 random bytes, mixed with the fingerprint to derive the key.
 * - `IV`     = 12 random bytes (AES-GCM nonce).
 * - `CIPHERTEXT` = AES-256-GCM of the canonical JSON of the {@link SignedLicense}.
 * - `TAG`    = 16-byte AES-GCM auth tag.
 *
 * The AES key is `SHA-256(fingerprint_bytes(32) || SALT)`, so the key is
 * **node-locked**: decryption only succeeds on the machine whose fingerprint
 * was used to issue it.
 *
 * The whole blob is encoded as unpadded Crockford Base32 for a compact,
 * unambiguous, human-typable string.
 */

const MAGIC = Buffer.from("LSNF", "ascii");
const VERSION = 0x01;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;

/**
 * Issue an offline activation key for a target machine fingerprint.
 * Signs the payload with the vendor's private key and encrypts it with the
 * fingerprint-derived key.
 */
export function createActivationKey(
  payload: LicensePayload,
  options: IssueActivationOptions,
): string {
  const signed = signLicense(payload, options.privateKeyPem);
  return createActivationKeyFromSigned(signed, options);
}

/** Issue an activation key from an already-signed license. */
export function createActivationKeyFromSigned(
  signed: SignedLicense,
  options: Pick<IssueActivationOptions, "fingerprint" | "salt">,
): string {
  const salt = options.salt ?? randomBytes(SALT_LENGTH);
  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Activation-key salt must be ${SALT_LENGTH} bytes`);
  }
  const key = deriveFingerprintKey(options.fingerprint, salt);
  const plaintext = Buffer.from(stableStringify(signed), "utf8");
  const encrypted = encryptAesGcmRaw(plaintext, key);

  const blob = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    salt,
    encrypted.iv,
    encrypted.ciphertext,
    encrypted.tag,
  ]);
  return crockfordBase32Encode(blob);
}

/** Parsed activation-key envelope (decoded, still encrypted). */
export interface ParsedActivationKey {
  version: number;
  salt: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** Decode and split an activation key into its raw parts (no decryption). */
export function parseActivationKey(activationKey: string): ParsedActivationKey {
  let blob: Buffer;
  try {
    blob = crockfordBase32Decode(activationKey);
  } catch (error) {
    throw new InvalidActivationKeyError(undefined, { cause: error });
  }
  if (blob.length < HEADER_LENGTH + TAG_LENGTH) {
    throw new InvalidActivationKeyError("Activation key is too short");
  }
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new InvalidActivationKeyError("Unknown activation-key magic");
  }
  const version = blob[MAGIC.length];
  if (version !== VERSION) {
    throw new InvalidActivationKeyError(`Unsupported activation-key version: ${version}`);
  }
  const salt = blob.subarray(MAGIC.length + 1, MAGIC.length + 1 + SALT_LENGTH);
  const iv = blob.subarray(
    MAGIC.length + 1 + SALT_LENGTH,
    MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH,
  );
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const ciphertext = blob.subarray(
    MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH,
    blob.length - TAG_LENGTH,
  );
  return { version, salt, iv, ciphertext, tag };
}

/** Decrypt a parsed activation key with the fingerprint-derived key. */
function decryptActivationKey(parsed: ParsedActivationKey, fingerprint: string): SignedLicense {
  const key = deriveFingerprintKey(fingerprint, parsed.salt);
  let plaintext: Buffer;
  try {
    plaintext = decryptAesGcmRaw(
      { iv: parsed.iv, ciphertext: parsed.ciphertext, tag: parsed.tag },
      key,
    );
  } catch (error) {
    throw new InvalidActivationKeyError(
      "Activation key is not bound to this machine (decryption failed)",
      { cause: error },
    );
  }
  try {
    return JSON.parse(plaintext.toString("utf8")) as SignedLicense;
  } catch (error) {
    throw new InvalidActivationKeyError("Activation key payload is not valid JSON", {
      cause: error,
    });
  }
}

/**
 * Fully activate an offline activation key on this machine: decode → decrypt
 * (fingerprint-bound) → verify signature → check expiry.
 *
 * Throws {@link InvalidActivationKeyError} (wrong machine / malformed),
 * {@link SignatureVerificationError} (tampered payload), or
 * {@link LicenseExpiredError}.
 */
export function verifyActivationKey(
  activationKey: string,
  options: VerifyActivationOptions,
): ActivationResult {
  const parsed = parseActivationKey(activationKey);
  const signed = decryptActivationKey(parsed, options.fingerprint);
  verifyLicenseSignature(signed, options.publicKeyPem);
  assertNotExpired(signed.payload, options.now ?? Date.now());
  return {
    payload: signed.payload,
    signedLicense: signed,
    fingerprint: options.fingerprint,
    expired: false,
    expiresAt: signed.payload.expiresAt,
  };
}

/** Decrypt and verify, but ignore the caller-supplied fingerprint (useful to re-issue). */
export function decryptActivationKeyForIssuer(
  activationKey: string,
  fingerprint: string,
): SignedLicense {
  return decryptActivationKey(parseActivationKey(activationKey), fingerprint);
}

/** Re-export for convenience of callers deriving keys from a fingerprint. */
export { deriveFingerprintKey, fingerprintToBytes };
