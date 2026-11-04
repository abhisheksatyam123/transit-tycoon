/**
 * Synchronous LZW compressor for save games, emitting UTF-16-safe strings.
 *
 * Format: the input is treated as a sequence of UTF-16 code units. Symbols are
 * LZW codes, starting with the 65536 single code units as the initial
 * dictionary and growing up to MAX_CODES entries. Code widths grow from 16 to
 * at most 22 bits, computed identically on both sides from the code index.
 * Codes are packed MSB-first into a bitstream and emitted as 15 bits per output
 * char (value + 32), so every output char is in 0x20..0x801F: never a surrogate
 * and never a control character. Trailing padding (< 15 bits) is ignored because
 * it is always shorter than the next code width, so no length header is needed.
 * compress('') === '' and decompress('') === ''.
 */

const BASE = 65536;
const MAX_CODES = 1 << 22; // dictionary capacity (codes >= BASE are phrases)
const CHUNK_BITS = 15;
const CHUNK_OFFSET = 32;

/** Bit width needed to represent code index i (dictionary holds BASE+min(i,cap) entries). */
function widthFor(i) {
  const maxVal = BASE + Math.min(i, MAX_CODES - BASE) - 1;
  let w = 16;
  while (2 ** w <= maxVal) w++;
  return w;
}

/**
 * Compress a string.
 * @param {string} str
 * @returns {string} UTF-16-safe compressed string
 */
export function compress(str) {
  const out = [];
  const dict = new Map(); // key cur*BASE + ch -> code
  let next = BASE;
  let acc = 0; // pending bits as a number (kept < 2^53)
  let nbits = 0;
  let index = 0; // number of codes emitted

  const put = (code) => {
    const w = widthFor(index);
    acc = acc * 2 ** w + code;
    nbits += w;
    while (nbits >= CHUNK_BITS) {
      const v = Math.floor(acc / 2 ** (nbits - CHUNK_BITS));
      out.push(String.fromCharCode(v + CHUNK_OFFSET));
      acc -= v * 2 ** (nbits - CHUNK_BITS);
      nbits -= CHUNK_BITS;
    }
    index++;
    if (next < MAX_CODES) dict.set(lastKey, next++);
  };

  let cur = -1;
  let lastKey = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (cur < 0) { cur = c; continue; }
    const key = cur * BASE + c;
    const found = dict.get(key);
    if (found !== undefined) { cur = found; continue; }
    lastKey = key;
    put(cur);
    cur = c;
  }
  if (cur >= 0) {
    // final code: no dictionary entry is needed after it
    const w = widthFor(index);
    acc = acc * 2 ** w + cur;
    nbits += w;
    while (nbits >= CHUNK_BITS) {
      const v = Math.floor(acc / 2 ** (nbits - CHUNK_BITS));
      out.push(String.fromCharCode(v + CHUNK_OFFSET));
      acc -= v * 2 ** (nbits - CHUNK_BITS);
      nbits -= CHUNK_BITS;
    }
  }
  if (nbits > 0) {
    const v = acc * 2 ** (CHUNK_BITS - nbits);
    out.push(String.fromCharCode(v + CHUNK_OFFSET));
  }
  return out.join('');
}

/**
 * Decompress a string produced by compress().
 * @param {string} str
 * @returns {string}
 */
export function decompress(str) {
  const n = str.length;
  let pos = 0;
  let acc = 0;
  let nbits = 0;
  const avail = () => nbits + CHUNK_BITS * (n - pos);
  const read = (w) => {
    while (nbits < w) {
      acc = acc * 2 ** CHUNK_BITS + (str.charCodeAt(pos++) - CHUNK_OFFSET);
      nbits += CHUNK_BITS;
    }
    const v = Math.floor(acc / 2 ** (nbits - w));
    acc -= v * 2 ** (nbits - w);
    nbits -= w;
    return v;
  };

  const strs = []; // strs[code - BASE] for phrase codes
  const out = [];
  let index = 0;
  let prev = null; // string of previous code
  while (true) {
    const w = widthFor(index);
    if (avail() < w) break;
    const code = read(w);
    let entry;
    if (code < BASE) entry = String.fromCharCode(code);
    else if (code - BASE < strs.length) entry = strs[code - BASE];
    else if (prev !== null && code - BASE === strs.length) entry = prev + prev[0]; // KwKwK
    else throw new Error('lz: corrupt stream');
    if (prev !== null && BASE + strs.length < MAX_CODES) strs.push(prev + entry[0]);
    out.push(entry);
    prev = entry;
    index++;
  }
  return out.join('');
}
