export type {
  ActivationResult,
  ClockStore,
  EncryptedBlob,
  FingerprintOptions,
  IssueActivationOptions,
  KeyPair,
  LicensePayload,
  SignedLicense,
  SplitKey,
  VerifyActivationOptions,
} from "./types.js";

export {
  LicensifyError,
  InvalidActivationKeyError,
  DecryptionError,
  SignatureVerificationError,
  LicenseExpiredError,
  FingerprintMismatchError,
  ClockRollbackError,
  TamperError,
} from "./errors.js";

// Ed25519
export { generateKeyPair, signEd25519, verifyEd25519 } from "./ed25519.js";

// AES-256-GCM + split-key
export {
  deriveKey,
  splitKey,
  combineKey,
  encryptAesGcmRaw,
  decryptAesGcmRaw,
  encryptAesGcm,
  decryptAesGcm,
  serializeEncrypted,
  parseEncrypted,
} from "./aes.js";
export type { RawEncrypted } from "./aes.js";

// Node-locking fingerprint
export {
  getFingerprint,
  fingerprintToBytes,
  deriveFingerprintKey,
} from "./fingerprint.js";

// Signed licenses
export {
  signLicense,
  verifyLicenseSignature,
  isLicenseExpired,
  assertNotExpired,
  parseSignedLicense,
  stringifySignedLicense,
} from "./license.js";

// Offline activation keys
export {
  createActivationKey,
  createActivationKeyFromSigned,
  parseActivationKey,
  verifyActivationKey,
  decryptActivationKeyForIssuer,
} from "./activation-key.js";
export type { ParsedActivationKey } from "./activation-key.js";

// Anti-tamper
export { hashSection, TamperGuard } from "./anti-tamper.js";

// Anti-clock
export {
  monotonicNowMs,
  MemoryClockStore,
  FileClockStore,
  ClockGuard,
} from "./anti-clock.js";
export type { ClockGuardOptions } from "./anti-clock.js";

// Encoding helpers (useful for consumers)
export {
  crockfordBase32Encode,
  crockfordBase32Decode,
} from "./base32.js";
export {
  stableStringify,
  bytesToHex,
  hexToBytes,
  sha256,
  sha256Hex,
  secureCompare,
  base64UrlEncode,
  base64UrlDecode,
} from "./util.js";
