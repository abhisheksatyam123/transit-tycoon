/**
 * Tile grid: creation, indexing and value-noise terrain generation.
 */
import { DIRS } from './constants.js';

/**
 * Create a blank tile.
 * @returns {object} Tile
 */
export function makeTile() {
  return { terrain: 'grass', height: 0, rail: 0, road: 0, building: null, owner: null };
}

/**
 * Create an empty map of grass tiles.
 * @param {number} width
 * @param {number} height
 */
export function createMap(width, height) {
  const tiles = new Array(width * height);
  for (let i = 0; i < tiles.length; i++) tiles[i] = makeTile();
  return { width, height, tiles };
}

/** Tile index for (x,y). */
export function idx(map, x, y) {
  return y * map.width + x;
}

/** True when (x,y) is inside the map. */
export function inBounds(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** Tile at (x,y) or null when out of bounds. */
export function getTile(map, x, y) {
  return inBounds(map, x, y) ? map.tiles[y * map.width + x] : null;
}

/**
 * Iterate the 4-neighbours of (x,y) that are inside the map.
 * @returns {{x:number,y:number,dir:object,tile:object}[]}
 */
export function neighbours(map, x, y) {
  const out = [];
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (inBounds(map, nx, ny)) out.push({ x: nx, y: ny, dir: d, tile: map.tiles[ny * map.width + nx] });
  }
  return out;
}

/**
 * Build a value-noise sampler (smooth bilinear interpolation of a random lattice).
 * @param {object} rng game RNG
 * @param {number} width
 * @param {number} height
 * @param {number} cell lattice spacing in tiles
 */
function valueNoise(rng, width, height, cell) {
  const gw = Math.ceil(width / cell) + 2, gh = Math.ceil(height / cell) + 2;
  const lattice = new Float64Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = lattice[y0 * gw + x0], b = lattice[y0 * gw + x0 + 1];
    const c = lattice[(y0 + 1) * gw + x0], d = lattice[(y0 + 1) * gw + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/** Fractal sum of value noise octaves, normalised to ~[0,1]. */
function fbm(rng, width, height, baseCell, octaves) {
  const layers = [];
  let cell = baseCell, amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ fn: valueNoise(rng, width, height, Math.max(2, cell)), amp });
    total += amp;
    cell /= 2;
    amp /= 2;
  }
  return (x, y) => {
    let v = 0;
    for (const l of layers) v += l.fn(x, y) * l.amp;
    return v / total;
  };
}

/**
 * Generate terrain in place: heights 0..7, water (sea/lakes), forests, desert, rock, snow.
 * @param {object} map
 * @param {object} rng
 * @param {{waterRatio?:number}} [opts]
 */
export function generateTerrain(map, rng, opts = {}) {
  const { width, height, tiles } = map;
  const waterRatio = opts.waterRatio ?? 0.18;
  const elev = fbm(rng, width, height, 24, 4);
  const forest = fbm(rng, width, height, 12, 3);
  const dry = fbm(rng, width, height, 20, 2);
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) values[y * width + x] = elev(x, y);
  }
  const sorted = Array.from(values).sort((a, b) => a - b);
  const sea = sorted[Math.floor(sorted.length * waterRatio)];
  const top = sorted[sorted.length - 1];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const v = values[i];
    if (v < sea) { t.terrain = 'water'; t.height = 0; continue; }
    t.height = Math.min(7, Math.floor(((v - sea) / Math.max(1e-9, top - sea)) * 8));
  }
  limitSlopes(map);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      if (t.terrain === 'water') continue;
      if (t.height >= 7) t.terrain = 'snow';
      else if (t.height >= 6 && dry(x, y) > 0.55) t.terrain = 'rock';
      else if (forest(x, y) > 0.6) t.terrain = 'forest';
      else if (t.height <= 2 && dry(x, y) > 0.72) t.terrain = 'desert';
      else t.terrain = 'grass';
    }
  }
}

/** Lower tiles so that 4-neighbours differ by at most 1 height level. */
function limitSlopes(map) {
  const { width, height, tiles } = map;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = tiles[y * width + x];
        for (const n of neighbours(map, x, y)) {
          if (t.height > n.tile.height + 1) { t.height = n.tile.height + 1; changed = true; }
        }
      }
    }
    if (!changed) break;
  }
}

/** True if tile is land without anything built on it (forest counts as free). */
export function isFreeLand(tile) {
  return !!tile && tile.terrain !== 'water' && !tile.building && !tile.rail && !tile.road;
}

/**
 * Clear a rectangle of tiles to grass (removes houses, industries touching it, track).
 * Intended for scenario setup/tests; does not touch stations/depots/vehicles.
 * @param {object} state game state
 */
export function clearArea(state, x0, y0, x1, y1, terrain = 'grass') {
  const map = state.map;
  const xa = Math.max(0, Math.min(x0, x1)), xb = Math.min(map.width - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1)), yb = Math.min(map.height - 1, Math.max(y0, y1));
  const killIndustries = new Set();
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = map.tiles[y * map.width + x];
      if (t.building && t.building.type === 'industry') killIndustries.add(t.building.industryId);
    }
  }
  for (const ind of state.industries) {
    if (!killIndustries.has(ind.id)) continue;
    for (let y = ind.y; y < ind.y + ind.h; y++) {
      for (let x = ind.x; x < ind.x + ind.w; x++) {
        const t = map.tiles[y * map.width + x];
        t.building = null; t.owner = null;
      }
    }
  }
  state.industries = state.industries.filter((i) => !killIndustries.has(i.id));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = map.tiles[y * map.width + x];
      t.terrain = terrain; t.rail = 0; t.road = 0; t.building = null; t.owner = null;
      for (const n of neighbours(map, x, y)) {
        n.tile.rail &= ~(n.dir.bit === 1 ? 4 : n.dir.bit === 2 ? 8 : n.dir.bit === 4 ? 1 : 2);
        n.tile.road &= ~(n.dir.bit === 1 ? 4 : n.dir.bit === 2 ? 8 : n.dir.bit === 4 ? 1 : 2);
      }
    }
  }
  for (const town of state.towns) {
    town.houses = town.houses.filter((h) => h.x < xa || h.x > xb || h.y < ya || h.y > yb);
  }
}
