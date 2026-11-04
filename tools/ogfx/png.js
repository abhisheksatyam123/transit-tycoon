/**
 * Minimal PNG codec: decode 8-bit palette/RGB/RGBA/gray (filters 0-4), encode RGBA. Uses node:zlib.
 */
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Decode a PNG to RGBA plus (for palette images) the raw palette index per pixel.
 * @param {Buffer} buf
 * @returns {{width:number,height:number,rgba:Uint8Array,palIdx:Uint8Array|null}}
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, bitDepth = 8, ctype = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const raw = inflateSync(Buffer.concat(idat));
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!chans) throw new Error(`bad colour type ${ctype}`);
  const bpp = Math.max(1, (chans * bitDepth) >> 3);
  const stride = Math.ceil((w * chans * bitDepth) / 8);
  const pix = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pix.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 0xff;
    }
    prev = out;
  }
  const n = w * h;
  const rgba = new Uint8Array(n * 4);
  let palIdx = null;
  if (ctype === 3) {
    palIdx = new Uint8Array(n);
    const mask = 2 ** bitDepth - 1;
    for (let i = 0; i < n; i++) {
      const idx = bitDepth === 8 ? pix[i] : (pix[(i * bitDepth) >> 3] >> (8 - bitDepth - ((i * bitDepth) & 7))) & mask;
      palIdx[i] = idx;
      rgba[i * 4] = palette[idx * 3]; rgba[i * 4 + 1] = palette[idx * 3 + 1]; rgba[i * 4 + 2] = palette[idx * 3 + 2];
      rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  } else if (bitDepth === 8) {
    for (let i = 0; i < n; i++) {
      const s = i * chans;
      if (ctype === 0 || ctype === 4) {
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = pix[s];
        rgba[i * 4 + 3] = ctype === 4 ? pix[s + 1] : 255;
      } else {
        rgba[i * 4] = pix[s]; rgba[i * 4 + 1] = pix[s + 1]; rgba[i * 4 + 2] = pix[s + 2];
        rgba[i * 4 + 3] = ctype === 6 ? pix[s + 3] : 255;
      }
    }
  } else throw new Error(`unsupported bit depth ${bitDepth}`);
  return { width: w, height: h, rgba, palIdx };
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * Encode RGBA pixels to a PNG file buffer.
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} rgba
 * @returns {Buffer}
 */
export function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
