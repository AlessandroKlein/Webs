import { describe, expect, it } from "vitest";
import {
  combineKey,
  DecryptionError,
  decryptAesGcm,
  decryptAesGcmRaw,
  deriveKey,
  encryptAesGcm,
  encryptAesGcmRaw,
  parseEncrypted,
  serializeEncrypted,
  splitKey,
} from "../src/index.js";

describe("AES-256-GCM + split-key", () => {
  it("derives a 32-byte key from a secret", () => {
    expect(deriveKey("secret").length).toBe(32);
  });

  it("split + combine restores the original key", () => {
    const key = deriveKey("my-secret");
    const { partA, partB } = splitKey(key);
    expect(partA.length).toBe(32);
    expect(partB.length).toBe(32);
    expect(combineKey(partA, partB)).toEqual(key);
  });

  it("encrypt/decrypt round-trips (string and Buffer)", () => {
    const key = deriveKey("k");
    for (const msg of ["hello world", Buffer.from([0, 1, 2, 255])]) {
      const blob = encryptAesGcm(msg, key);
      expect(decryptAesGcm(blob, key)).toEqual(Buffer.from(msg));
    }
  });

  it("raw encrypt/decrypt round-trips", () => {
    const key = deriveKey("k");
    const raw = encryptAesGcmRaw("payload", key);
    expect(decryptAesGcmRaw(raw, key).toString("utf8")).toBe("payload");
  });

  it("serialize/parse the Webs-compatible iv.tag.ciphertext format", () => {
    const key = deriveKey("k");
    const blob = encryptAesGcm("data", key);
    const serialized = serializeEncrypted(blob);
    expect(serialized.split(".").length).toBe(3);
    expect(parseEncrypted(serialized)).toEqual(blob);
    expect(decryptAesGcm(serialized, key).toString("utf8")).toBe("data");
  });

  it("throws DecryptionError on wrong key", () => {
    const blob = encryptAesGcm("data", deriveKey("right"));
    expect(() => decryptAesGcm(blob, deriveKey("wrong"))).toThrow(DecryptionError);
  });

  it("throws DecryptionError on tampered ciphertext (GCM auth failure)", () => {
    const key = deriveKey("k");
    const blob = encryptAesGcm("data", key);
    const tampered = {
      ...blob,
      ciphertext: Buffer.from("AAAA").toString("base64"),
    };
    expect(() => decryptAesGcm(tampered, key)).toThrow(DecryptionError);
  });

  it("rejects a wrong-size key", () => {
    expect(() => encryptAesGcm("data", Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});
