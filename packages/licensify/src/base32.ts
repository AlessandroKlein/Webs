/**
 * Crockford Base32 (https://www.crockford.com/base32.html).
 *
 * Chosen for activation keys because it is unambiguous, case-insensitive and
 * free of the visually confusing characters `I`, `L`, `O` and `U`. Encoding is
 * unpadded; decoding is lenient (hyphens are ignored, `O` → `0`, `I`/`L` → `1`).
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const DECODE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) {
    map[ALPHABET[i]!] = i;
  }
  // Lenient aliases (Crockford's optional "check symbol" handling is not used;
  // we only accept the visual aliases that humans may type by mistake).
  map["O"] = 0;
  map["I"] = 1;
  map["L"] = 1;
  return map;
})();

/** Encode bytes to an unpadded Crockford Base32 string. */
export function crockfordBase32Encode(input: Buffer | Uint8Array): string {
  const data = Buffer.from(input);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f]!;
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 0x1f]!;
  }
  return out;
}

/** Decode a Crockford Base32 string (case-insensitive, hyphens ignored). */
export function crockfordBase32Decode(input: string): Buffer {
  const cleaned = input
    .trim()
    .replace(/[-\s]/g, "")
    .replace(/=+$/, "")
    .toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const v = DECODE_MAP[ch];
    if (v === undefined) {
      throw new Error(`Invalid Crockford base32 character: "${ch}"`);
    }
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
