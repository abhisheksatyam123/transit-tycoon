/**
 * Heightmap import (pure, no DOM): RGBA pixels -> OpenTTD greyscale -> map height levels.
 * Mirrors OpenTTD heightmap.cpp: RGBToGreyscale (integer 0.299/0.587/0.114 weights, /65536),
 * the image is stretched over the map (nearest sample), 0 stays sea level and 1..255 map evenly onto 1..levels.
 * The per-pixel aspect options of OpenTTD are not implemented (the map is always stretched).
 * Heightmap rotation is opt-in (see HEIGHTMAP_ROTATIONS / rotateGrid below); 'none' keeps the historic
 * import path byte-for-byte.
 */

/** Highest land level our terrain uses (heights 0..7, 0 = water). */
export const HEIGHTMAP_LEVELS = 7;

/**
 * Opt-in heightmap rotations/mirrors (OpenTTD's heightmap mirror/transpose mapping, U5). Values are a
 * dihedral set: the four rotations are built from transpose + flips, so each is an exact pixel mapping.
 * 'none' (the default) leaves the image untouched.
 * @type {readonly string[]}
 */
export const HEIGHTMAP_ROTATIONS = Object.freeze([
  'none', 'rot90', 'rot180', 'rot270', 'flipX', 'flipY', 'transpose', 'antiTranspose',
]);

/**
 * OpenTTD RGBToGreyscale: ((r*19595) + (g*38470) + (b*7471)) / 65536, integer division.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} 0..255
 */
export function rgbToGrey(r, g, b) {
  return Math.floor((r * 19595 + g * 38470 + b * 7471) / 65536);
}

/**
 * Convert interleaved RGBA (or RGB with stride 3) pixels to a greyscale array.
 * @param {ArrayLike<number>} pixels row-major, 4 bytes per pixel (RGBA) when stride=4
 * @param {number} width
 * @param {number} height
 * @param {number} [stride=4]
 * @returns {Uint8Array} width*height greyscale values
 */
export function greyscaleFromPixels(pixels, width, height, stride = 4) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * stride;
    out[i] = rgbToGrey(pixels[p], pixels[p + 1], pixels[p + 2]);
  }
  return out;
}

/**
 * Rotate/mirror a height (or greyscale) grid. All transforms are exact pixel permutations; 90/270/transpose
 * swap the output dimensions. 'none' returns an unchanged copy.
 * @param {ArrayLike<number>} grid row-major width*height values
 * @param {number} width
 * @param {number} height
 * @param {string} [rotation] one of HEIGHTMAP_ROTATIONS
 * @returns {{values:Uint8Array,width:number,height:number}}
 */
export function rotateGrid(grid, width, height, rotation = 'none') {
  if (!HEIGHTMAP_ROTATIONS.includes(rotation)) throw new Error(`heightmap: unknown rotation '${rotation}'`);
  if (grid.length !== width * height) throw new Error('heightmap: pixel count does not match the size');
  if (rotation === 'none') return { values: Uint8Array.from(grid), width, height };
  const swap = rotation === 'rot90' || rotation === 'rot270' || rotation === 'transpose' || rotation === 'antiTranspose';
  const outW = swap ? height : width;
  const outH = swap ? width : height;
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sx = 0, sy = 0;
      switch (rotation) {
        case 'rot90': sx = y; sy = height - 1 - x; break;            // clockwise quarter turn
        case 'rot180': sx = width - 1 - x; sy = height - 1 - y; break;
        case 'rot270': sx = width - 1 - y; sy = x; break;            // counter-clockwise quarter turn
        case 'flipX': sx = width - 1 - x; sy = y; break;             // horizontal mirror
        case 'flipY': sx = x; sy = height - 1 - y; break;            // vertical mirror
        case 'transpose': sx = y; sy = x; break;                     // main-diagonal reflection
        case 'antiTranspose': sx = width - 1 - y; sy = height - 1 - x; break; // anti-diagonal reflection
      }
      out[y * outW + x] = grid[sy * width + sx];
    }
  }
  return { values: out, width: outW, height: outH };
}

/**
 * Stretch a greyscale image over a map of mapW x mapH tiles (nearest sample at tile centres).
 * @param {Uint8Array} grey
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} mapW
 * @param {number} mapH
 * @returns {Uint8Array} mapW*mapH greyscale values
 */
export function resampleGrey(grey, imgW, imgH, mapW, mapH) {
  if (!(imgW > 0 && imgH > 0 && mapW > 0 && mapH > 0)) throw new Error('heightmap: empty size');
  if (grey.length !== imgW * imgH) throw new Error('heightmap: pixel count does not match the size');
  const out = new Uint8Array(mapW * mapH);
  for (let y = 0; y < mapH; y++) {
    const sy = Math.min(imgH - 1, Math.floor((y + 0.5) * imgH / mapH));
    for (let x = 0; x < mapW; x++) {
      const sx = Math.min(imgW - 1, Math.floor((x + 0.5) * imgW / mapW));
      out[y * mapW + x] = grey[sy * imgW + sx];
    }
  }
  return out;
}

/**
 * OpenTTD GreyscaleToMapHeights height rule: 0 stays sea (0); 1..255 scale evenly onto 1..levels.
 * @param {number} g greyscale 0..255
 * @param {number} [levels=HEIGHTMAP_LEVELS]
 * @returns {number} 0..levels
 */
export function greyToHeight(g, levels = HEIGHTMAP_LEVELS) {
  if (g <= 0) return 0;
  return 1 + Math.floor(((g - 1) * levels) / 255);
}

/**
 * Greyscale map (already sized to the map) -> height levels per tile (Uint8Array, 0 = water).
 * @param {Uint8Array} grey
 * @param {number} [levels]
 * @returns {Uint8Array}
 */
export function greyToHeights(grey, levels = HEIGHTMAP_LEVELS) {
  const out = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) out[i] = greyToHeight(grey[i], levels);
  return out;
}

/**
 * Full pipeline for one import: greyscale image -> heights for a mapW x mapH map.
 * @param {Uint8Array} grey greyscale image (imgW*imgH)
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} mapW
 * @param {number} mapH
 * @param {string} [rotation] one of HEIGHTMAP_ROTATIONS (applied after stretching; default 'none')
 * @returns {Uint8Array} mapW*mapH heights 0..7
 */
export function heightsForMap(grey, imgW, imgH, mapW, mapH, rotation = 'none') {
  const heights = greyToHeights(resampleGrey(grey, imgW, imgH, mapW, mapH));
  if (rotation === 'none') return heights;
  const r = rotateGrid(heights, mapW, mapH, rotation);
  return r.values;
}
