import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/index.js";

describe("stableStringify", () => {
  it("omits undefined object keys (matches JSON.stringify)", () => {
    expect(stableStringify({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it("normalizes undefined array items to null", () => {
    expect(stableStringify([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("sorts keys deterministically even with undefined values present", () => {
    expect(stableStringify({ b: 2, a: 1, c: undefined })).toBe('{"a":1,"b":2}');
  });

  it("never interpolates the literal 'undefined'", () => {
    const out = stableStringify({ nested: { x: undefined, y: [undefined, 1] } });
    expect(out).not.toContain("undefined");
    expect(out).toBe('{"nested":{"y":[null,1]}}');
  });

  it("serializes a top-level undefined as null", () => {
    expect(stableStringify(undefined)).toBe("null");
  });
});
