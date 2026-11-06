/**
 * OpenGFX asset pack loader. Fetches assets/opengfx/manifest.json and the atlas images.
 * Resolves to a pack object, or null when anything is missing (the game then keeps procedural sprites).
 */

/**
 * @typedef {Object} OgfxPack
 * @property {Object<string, number[]>} sprites id -> [atlas, x, y, w, h, xoff, yoff, cc]
 * @property {Object<string, number[][]>} groups named ranges
 * @property {HTMLCanvasElement[]} atlases atlas canvases (RGBA)
 * @property {(HTMLCanvasElement|null)[]} masks company-colour mask canvases (same size as atlases)
 */

/** @param {string} url @returns {Promise<HTMLImageElement>} */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

/** @param {HTMLImageElement} img @returns {HTMLCanvasElement} */
function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

/**
 * Load the OpenGFX pack from a base URL.
 * @param {string} [base] folder URL with manifest.json (default 'assets/opengfx/')
 * @returns {Promise<OgfxPack|null>}
 */
export async function loadOpenGfx(base = 'assets/opengfx/') {
  return loadPack(base);
}

/**
 * Load the EXTRA pack (canal/lock/river/tram sprites, keys like 'canal_water.0', see tools/ogfx/extract_extra.js).
 * Separate folder so the base atlases stay untouched. Null when missing.
 * @param {string} [base] default 'assets/opengfx/extra/'
 * @returns {Promise<OgfxPack|null>}
 */
export async function loadExtraPack(base = 'assets/opengfx/extra/') {
  return loadPack(base);
}

/**
 * Load the ARCTIC pack (snowy ground for the sub-arctic climate; assets/opengfx/arctic, keys like 'snow.3.15').
 * @param {string} [base] default 'assets/opengfx/arctic/'
 * @returns {Promise<OgfxPack|null>}
 */
export async function loadArcticPack(base = 'assets/opengfx/arctic/') {
  return loadPack(base);
}

/** @param {string} base folder URL with manifest.json @returns {Promise<OgfxPack|null>} */
async function loadPack(base) {
  try {
    const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const man = await res.json();
    const atlases = [];
    const masks = [];
    for (let i = 0; i < man.atlases.length; i++) {
      const a = man.atlases[i];
      atlases.push(toCanvas(await loadImage(base + a.file)));
      masks.push(a.cc ? toCanvas(await loadImage(base + a.cc)) : null);
    }
    return { sprites: man.sprites, groups: man.groups, atlases, masks, tint: new Map() };
  } catch {
    return null;
  }
}
