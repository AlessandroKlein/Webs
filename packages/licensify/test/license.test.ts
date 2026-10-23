import { describe, expect, it } from "vitest";
import {
  assertNotExpired,
  generateKeyPair,
  isLicenseExpired,
  LicenseExpiredError,
  parseSignedLicense,
  signLicense,
  SignatureVerificationError,
  stringifySignedLicense,
  verifyLicenseSignature,
} from "../src/index.js";

const payload = {
  id: "lic-1",
  productId: "plugin-x",
  licensee: "ACME",
  features: ["reports", "api"],
  limits: { seats: 5 },
  issuedAt: "2026-01-01T00:00:00.000Z",
};

describe("Signed license", () => {
  it("signs and verifies", () => {
    const kp = generateKeyPair();
    const signed = signLicense(payload, kp.privateKeyPem);
    expect(signed.v).toBe(1);
    expect(signed.signature).toBeTruthy();
    expect(() => verifyLicenseSignature(signed, kp.publicKeyPem)).not.toThrow();
  });

  it("throws SignatureVerificationError on tampered payload", () => {
    const kp = generateKeyPair();
    const signed = signLicense(payload, kp.privateKeyPem);
    const tampered = { ...signed, payload: { ...payload, licensee: "EVIL" } };
    expect(() => verifyLicenseSignature(tampered, kp.publicKeyPem)).toThrow(
      SignatureVerificationError,
    );
  });

  it("stringify/parse round-trips", () => {
    const kp = generateKeyPair();
    const signed = signLicense(payload, kp.privateKeyPem);
    const parsed = parseSignedLicense(stringifySignedLicense(signed));
    expect(parsed).toEqual(signed);
  });

  it("expiry: perpetual vs expired vs malformed", () => {
    const perpetual = { ...payload };
    expect(isLicenseExpired(perpetual, Date.now())).toBe(false);

    const future = { ...payload, expiresAt: "2999-01-01T00:00:00.000Z" };
    expect(isLicenseExpired(future, Date.now())).toBe(false);

    const past = { ...payload, expiresAt: "2000-01-01T00:00:00.000Z" };
    expect(isLicenseExpired(past, Date.now())).toBe(true);
    expect(() => assertNotExpired(past, Date.now())).toThrow(LicenseExpiredError);

    const malformed = { ...payload, expiresAt: "not-a-date" };
    expect(isLicenseExpired(malformed, Date.now())).toBe(true);
  });
});
