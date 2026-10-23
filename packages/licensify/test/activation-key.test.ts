import { describe, expect, it } from "vitest";
import {
  createActivationKey,
  createActivationKeyFromSigned,
  generateKeyPair,
  getFingerprint,
  InvalidActivationKeyError,
  LicenseExpiredError,
  parseActivationKey,
  SignatureVerificationError,
  signLicense,
  verifyActivationKey,
} from "../src/index.js";

const payload = {
  id: "lic-1",
  productId: "plugin-x",
  licensee: "ACME",
  features: ["reports"],
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2999-01-01T00:00:00.000Z",
};

describe("Offline activation key", () => {
  it("issues and activates on the same machine (full round-trip)", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const key = createActivationKey(payload, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });

    // Compact, unambiguous, human-typable
    expect(key).toMatch(/^[0-9A-Z]+$/);

    const result = verifyActivationKey(key, {
      publicKeyPem: kp.publicKeyPem,
      fingerprint: fp,
    });
    expect(result.payload).toEqual(payload);
    expect(result.expired).toBe(false);
  });

  it("issues and activates a minimal payload with undefined limits/expiresAt (P0 regression)", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    // The API emits keys with these optional fields explicitly `undefined`
    // (POST /license/keys without limits/expiresAt). stableStringify must omit
    // them, not interpolate the literal "undefined" into the signed JSON.
    const minimal = {
      id: "lic-min",
      productId: "plugin-x",
      licensee: "ACME",
      features: undefined,
      limits: undefined,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: undefined,
    };
    const key = createActivationKey(minimal, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });
    const result = verifyActivationKey(key, {
      publicKeyPem: kp.publicKeyPem,
      fingerprint: fp,
    });
    expect(result.payload).toEqual({
      id: "lic-min",
      productId: "plugin-x",
      licensee: "ACME",
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.expired).toBe(false);
  });

  it("fails to activate on a different machine (node-locking)", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const other = "a".repeat(64); // a different fingerprint
    const key = createActivationKey(payload, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });
    expect(() =>
      verifyActivationKey(key, { publicKeyPem: kp.publicKeyPem, fingerprint: other }),
    ).toThrow(InvalidActivationKeyError);
  });

  it("rejects a tampered activation key", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const key = createActivationKey(payload, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });
    // Flip one character in the middle.
    const idx = Math.floor(key.length / 2);
    const flipped = key.slice(0, idx) + (key[idx] === "A" ? "B" : "A") + key.slice(idx + 1);
    expect(() =>
      verifyActivationKey(flipped, { publicKeyPem: kp.publicKeyPem, fingerprint: fp }),
    ).toThrow();
  });

  it("rejects a key signed by the wrong vendor key", () => {
    const vendor = generateKeyPair();
    const attacker = generateKeyPair();
    const fp = getFingerprint();
    const key = createActivationKey(payload, {
      privateKeyPem: attacker.privateKeyPem,
      fingerprint: fp,
    });
    expect(() =>
      verifyActivationKey(key, { publicKeyPem: vendor.publicKeyPem, fingerprint: fp }),
    ).toThrow(SignatureVerificationError);
  });

  it("rejects an expired license", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const expired = { ...payload, expiresAt: "2000-01-01T00:00:00.000Z" };
    const key = createActivationKey(expired, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });
    expect(() =>
      verifyActivationKey(key, { publicKeyPem: kp.publicKeyPem, fingerprint: fp }),
    ).toThrow(LicenseExpiredError);
  });

  it("parseActivationKey extracts a v1 envelope", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const key = createActivationKey(payload, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: fp,
    });
    const parsed = parseActivationKey(key);
    expect(parsed.version).toBe(1);
    expect(parsed.salt.length).toBe(16);
    expect(parsed.iv.length).toBe(12);
    expect(parsed.tag.length).toBe(16);
    expect(parsed.ciphertext.length).toBeGreaterThan(0);
  });

  it("supports issuing from an already-signed license", () => {
    const kp = generateKeyPair();
    const fp = getFingerprint();
    const signed = signLicense(payload, kp.privateKeyPem);
    const key = createActivationKeyFromSigned(signed, { fingerprint: fp });
    const result = verifyActivationKey(key, {
      publicKeyPem: kp.publicKeyPem,
      fingerprint: fp,
    });
    expect(result.signedLicense).toEqual(signed);
  });

  it("throws InvalidActivationKeyError on garbage input", () => {
    expect(() =>
      verifyActivationKey("not-a-valid-key", {
        publicKeyPem: generateKeyPair().publicKeyPem,
        fingerprint: getFingerprint(),
      }),
    ).toThrow(InvalidActivationKeyError);
  });
});
