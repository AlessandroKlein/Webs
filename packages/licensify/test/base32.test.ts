import { describe, expect, it } from "vitest";
import {
  crockfordBase32Decode,
  crockfordBase32Encode,
} from "../src/index.js";

describe("Crockford Base32", () => {
  it("round-trips arbitrary byte lengths", () => {
    for (let n = 0; n <= 64; n++) {
      const bytes = Buffer.alloc(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 37 + n) % 256;
      const encoded = crockfordBase32Encode(bytes);
      expect(crockfordBase32Decode(encoded)).toEqual(bytes);
    }
  });

  it("encodes the empty buffer to an empty string", () => {
    expect(crockfordBase32Encode(Buffer.alloc(0))).toBe("");
    expect(crockfordBase32Decode("").length).toBe(0);
  });

  it("decodes leniently (case, hyphens, O->0, I/L->1)", () => {
    const bytes = Buffer.from([0, 1, 10, 31, 255]);
    const canonical = crockfordBase32Encode(bytes);
    // Lowercase + hyphens
    expect(crockfordBase32Decode(canonical.toLowerCase())).toEqual(bytes);
    expect(
      crockfordBase32Decode(canonical.replace(/(.{2})/g, "$1-").replace(/-$/, "")),
    ).toEqual(bytes);
  });

  it("has no ambiguous characters (I, L, O, U)", () => {
    const encoded = crockfordBase32Encode(Buffer.from("ambiguous check"));
    expect(encoded).not.toMatch(/[ILOU]/);
  });

  it("throws on invalid characters", () => {
    expect(() => crockfordBase32Decode("AB$")).toThrow(/Invalid Crockford/);
  });
});
