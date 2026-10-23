import { describe, expect, it } from "vitest";
import { hashSection, TamperError, TamperGuard } from "../src/index.js";

const code = "function verify() { return checkLicense(); }";

describe("Anti-tamper", () => {
  it("hashes a code section deterministically", () => {
    expect(hashSection(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSection(code)).toBe(hashSection(code));
  });

  it("HMAC key changes the hash", () => {
    expect(hashSection(code, "s1")).not.toBe(hashSection(code, "s2"));
  });

  it("guard verifies unchanged code and rejects modified code", () => {
    const guard = new TamperGuard(hashSection(code));
    expect(guard.verify(code)).toBe(true);
    expect(guard.verify(code + " ")).toBe(false);
    expect(() => guard.assert(code + " ")).toThrow(TamperError);
    expect(() => guard.assert(code)).not.toThrow();
  });

  it("guard with secret cannot be forged by recomputing plain SHA-256", () => {
    const secret = "vendor-secret";
    const guard = new TamperGuard(hashSection(code, secret), { secret });
    expect(guard.verify(code)).toBe(true);
    // An attacker who recomputes SHA-256 (no secret) gets a different value.
    expect(hashSection(code)).not.toBe(hashSection(code, secret));
  });
});
