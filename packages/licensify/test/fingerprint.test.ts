import { describe, expect, it } from "vitest";
import {
  deriveFingerprintKey,
  fingerprintToBytes,
  getFingerprint,
} from "../src/index.js";

describe("Fingerprint (node-locking)", () => {
  it("returns a 64-char lowercase hex fingerprint", () => {
    const fp = getFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across calls", () => {
    expect(getFingerprint()).toBe(getFingerprint());
  });

  it("changes when a salt changes", () => {
    expect(getFingerprint({ salt: "a" })).not.toBe(getFingerprint({ salt: "b" }));
  });

  it("changes when extra signals change", () => {
    const base = getFingerprint();
    expect(getFingerprint({ extraSignals: ["disk-serial-xyz"] })).not.toBe(base);
  });

  it("fingerprintToBytes yields 32 bytes and round-trips hex", () => {
    const fp = getFingerprint();
    const bytes = fingerprintToBytes(fp);
    expect(bytes.length).toBe(32);
    expect(bytes.toString("hex")).toBe(fp);
  });

  it("deriveFingerprintKey is deterministic and 32 bytes", () => {
    const salt = Buffer.alloc(16, 7);
    const k1 = deriveFingerprintKey(getFingerprint(), salt);
    const k2 = deriveFingerprintKey(getFingerprint(), salt);
    expect(k1.length).toBe(32);
    expect(k1).toEqual(k2);
  });
});
