/**
 * Run-length codec for baked per-tile map layers (one character per tile, row-major y*W+x).
 * Encoded form: tokens "<char><count in base 36>" joined by ".", e.g. "g1k.w3.p2" (count 1k = 56).
 * Characters must not be "." and must be printable ASCII.
 */

/**
 * Encode a per-tile character string.
 * @param {string} s one character per tile
 * @returns {string}
 */
export function encodeRLE(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    let j = i + 1;
    while (j < s.length && s[j] === c) j++;
    out.push(c + (j - i).toString(36));
    i = j;
  }
  return out.join('.');
}

/**
 * Decode to a per-tile character string.
 * @param {string} rle
 * @param {number} [expectedLength] throws if the decoded length differs
 * @returns {string}
 */
export function decodeRLE(rle, expectedLength) {
  const parts = [];
  let n = 0;
  if (rle) {
    for (const tok of rle.split('.')) {
      const count = parseInt(tok.slice(1), 36);
      parts.push(tok[0].repeat(count));
      n += count;
    }
  }
  if (expectedLength !== undefined && n !== expectedLength) {
    throw new Error(`RLE layer length ${n} != ${expectedLength}`);
  }
  return parts.join('');
}
