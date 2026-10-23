import { describe, expect, it } from "vitest";
import {
  generateKeyPair,
  signEd25519,
  verifyEd25519,
} from "../src/index.js";

describe("Ed25519", () => {
  it("generates a valid PEM key pair", () => {
    const kp = generateKeyPair();
    expect(kp.publicKeyPem).toContain("-----BEGIN PUBLIC KEY-----");
    expect(kp.privateKeyPem).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("signs and verifies a round-trip payload", () => {
    const kp = generateKeyPair();
    const payload = { id: "lic-1", productId: "p", licensee: "A" };
    const sig = signEd25519(payload, kp.privateKeyPem);
    expect(verifyEd25519(payload, sig, kp.publicKeyPem)).toBe(true);
  });

  it("is deterministic: same payload + key => same signature", () => {
    const kp = generateKeyPair();
    const payload = { a: 1, b: [2, 3], c: { d: "e" } };
    expect(signEd25519(payload, kp.privateKeyPem)).toBe(
      signEd25519(payload, kp.privateKeyPem),
    );
  });

  it("canonicalizes object key order", () => {
    const kp = generateKeyPair();
    const sig1 = signEd25519({ a: 1, b: 2 }, kp.privateKeyPem);
    const sig2 = signEd25519({ b: 2, a: 1 }, kp.privateKeyPem);
    expect(sig1).toBe(sig2);
  });

  it("rejects a tampered payload", () => {
    const kp = generateKeyPair();
    const sig = signEd25519({ id: "x" }, kp.privateKeyPem);
    expect(verifyEd25519({ id: "y" }, sig, kp.publicKeyPem)).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const sig = signEd25519({ id: "x" }, a.privateKeyPem);
    expect(verifyEd25519({ id: "x" }, sig, b.publicKeyPem)).toBe(false);
  });

  it("returns false on a malformed signature", () => {
    const kp = generateKeyPair();
    expect(verifyEd25519({ id: "x" }, "!!!not-base64url!!!", kp.publicKeyPem)).toBe(false);
  });
});
