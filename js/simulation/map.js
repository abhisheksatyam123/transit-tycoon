/**
 * Tile grid: creation, indexing and value-noise terrain generation.
 */
import { DIRS } from './constants.js';
import { DEFAULT_SNOW_LINE } from './climate.js';

/**
 * Terrain snow starts this many levels above the snow line setting (mapgen snowLine, default 5 = the
 * climate snow line): the level where OpenTTD TileLoopClearAlps reaches full snow (climate.js snowDensity,
 * z - line + 1 >= 3). Default 5 + 2 = 7 = the historic hard-coded threshold, so default maps are unchanged.
 */
export const SNOW_TERRAIN_OFFSET = 2;

/** Terrain snow height for a mapgen snow line (levels; above 7 = no snow terrain, e.g. High = 7 -> 9). */
export function snowTerrainHeight(snowLine) {
  return (Number.isInteger(snowLine) ? snowLine : DEFAULT_SNOW_LINE) + SNOW_TERRAIN_OFFSET;
}

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

/** Sea level presets (fraction of tiles below sea level); 'none' = no sea. Medium is the historic default. */
export const SEA_LEVELS = { none: 0, low: 0.1, medium: 0.18, high: 0.3 };
/** Height scale per terrain type (OpenTTD terrain_type): flat maps stay at 0..2, mountainous uses the full range. */
export const TERRAIN_SCALE = { flat: 0.3, hilly: 0.7, normal: 1, mountainous: 1 };
/** Elevation fbm lattice per smoothness setting (base cell, octaves); 'normal' is the historic default. */
export const SMOOTHNESS = { smooth: [32, 3], normal: [24, 4], rough: [16, 5] };
/** Number of rivers to aim for (attempts are capped in carveRivers). */
export const RIVER_COUNTS = { none: 0, few: 2, many: 6 };
/** Rivers carved by rivers: 'flowing' (OpenTTD-style rivers on slopes, see carveFlowingRivers). */
export const FLOW_RIVER_COUNT = 4;
/** Town and industry count multipliers (density options; 'normal' keeps today's counts). */
export const DENSITY = { low: 0.5, normal: 1, high: 1.5 };

/**
 * OpenTTD tgp.cpp HeightMapCurves (lines 570-684): "Variety distribution" (genworld_gui.cpp:395).
 * Four curve maps (tgp.cpp:601-604, control points as fractions of the height range) reshape a
 * normalised height; a randomised grid of 2^level cells (sx/sy, tgp.cpp:612-617) picks a curve per
 * cell, and each tile blends the four corner curve results bilinearly with OTTD's sine easing
 * (tgp.cpp:626-633). Ported onto TT's 0..1 normalised elevation instead of OTTD height_t levels.
 */
const VARIETY_CURVES = [
  [[0, 0], [0.8, 0.13], [1, 0.4]],
  [[0, 0], [0.53, 0.13], [0.8, 0.27], [1, 0.6]],
  [[0, 0], [0.53, 0.27], [0.8, 0.57], [1, 0.8]],
  [[0, 0], [0.4, 0.3], [0.7, 0.8], [0.92, 0.99], [1, 0.99]],
];
/** Piecewise-linear evaluation of one OTTD control-point curve (tgp.cpp:657-668). */
function curveEval(cm, v) {
  for (let i = 0; i < cm.length - 1; i++) {
    const p1 = cm[i], p2 = cm[i + 1];
    if (v >= p1[0] && v < p2[0]) return p1[1] + (v - p1[0]) * (p2[1] - p1[1]) / (p2[0] - p1[0]);
  }
  return cm[cm.length - 1][1];
}
/**
 * Apply variety curves in place to `values` (normalised 0..1 per tile, width*height).
 * Draws the cell grid from rng only (variety > 0 callers only).
 */
function applyVarietyCurves(width, height, values, rng, level) {
  const factor = Math.sqrt(width / height);
  const sx = Math.min(128, Math.max(1, Math.floor((2 ** level) * factor + 0.5)));
  const sy = Math.min(128, Math.max(1, Math.floor((2 ** level) / factor + 0.5)));
  const grid = new Uint8Array(sx * sy);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.floor(rng.next() * 4);
  const ease = (f) => { // OTTD xr/yr: sin(sin((2f-1)*pi/2)*pi/2) remapped to 0..1 (tgp.cpp:628-633)
    const v = Math.sin(Math.sin((2 * f - 1) * Math.PI / 2) * Math.PI / 2);
    return 0.5 * (v + 1);
  };
  const ht = new Float64Array(4);
  // per-column / per-row grid cell and easing weight (computed once, not per tile)
  const colCell = new Uint16Array(width), colR = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const gx = (sx * x) / width, x1 = Math.min(sx - 1, Math.floor(gx));
    colCell[x] = x1 * 65536 + Math.min(sx - 1, x1 + 1); colR[x] = ease(gx - x1);
  }
  for (let y = 0; y < height; y++) {
    const gy = (sy * y) / height;
    const y1 = Math.min(sy - 1, Math.floor(gy)), y2 = Math.min(sy - 1, y1 + 1);
    const yr = ease(gy - y1);
    for (let x = 0; x < width; x++) {
      const xc = colCell[x], x1 = xc >>> 16, x2 = xc & 0xffff, xr = colR[x];
      const i = y * width + x;
      const h = values[i];
      for (let t = 0; t < 4; t++) ht[t] = curveEval(VARIETY_CURVES[t], h);
      const ca = grid[y1 * sx + x1], cb = grid[y2 * sx + x1], cc = grid[y1 * sx + x2], cd = grid[y2 * sx + x2];
      values[i] = (ht[ca] * (1 - yr) + ht[cb] * yr) * (1 - xr) + (ht[cc] * (1 - yr) + ht[cd] * yr) * xr;
    }
  }
}

/**
 * Generate terrain in place: heights 0..7, water (sea/lakes/rivers), forests, desert, rock, snow.
 * Options (all default to today's map; default draws are identical to the historic generator):
 * - waterRatio: explicit sea fraction (overrides seaLevel)
 * - seaLevel: 'none' | 'low' | 'medium' | 'high'
 * - terrain: 'flat' | 'normal' | 'hilly' | 'mountainous'
 * - smoothness: 'smooth' | 'normal' | 'rough'
 * - cliffs: 'off' (default) | 'on' (steep steps up to CLIFF_SLOPE_CAP levels, marked around cliffs as rock; no RNG draws)
 * - lakes: 'off' (default) | 'few' | 'many' (enclosed land basins flooded to water at height 0; RNG draws only when not off)
 * - variety: 0 (default, none) | 1..5 (very low..very high): OTTD curve-map height variety (see applyVarietyCurves)
 * - mountainStyle: 'off' (default) | 'on' (land within 12 tiles of a peak becomes rock, OpenLoco generateTerrainOnMountains; no RNG draws)
 * - snowLine: 5 (default; snow terrain from height 7) | 3 (snow from 5) | 7 (no snow terrain, the line is above level 7)
 * - rivers: 'none' | 'few' | 'many' (valley rivers, extra RNG draws only when not 'none') | 'flowing'
 *   (rivers on slopes at their height; the heights are not changed)
 * @param {object} map
 * @param {object} rng
 * @param {{waterRatio?:number,seaLevel?:string,terrain?:string,smoothness?:string,rivers?:string,cliffs?:string}} [opts]
 */
export function generateTerrain(map, rng, opts = {}) {
  const { width, height, tiles } = map;
  const waterRatio = opts.waterRatio ?? SEA_LEVELS[opts.seaLevel ?? 'medium'] ?? SEA_LEVELS.medium;
  const scale = TERRAIN_SCALE[opts.terrain ?? 'normal'] ?? 1;
  const [eBase, eOct] = SMOOTHNESS[opts.smoothness ?? 'normal'] ?? SMOOTHNESS.normal;
  const elev = fbm(rng, width, height, eBase, eOct);
  const forest = fbm(rng, width, height, 12, 3);
  const dry = fbm(rng, width, height, 20, 2);
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) values[y * width + x] = elev(x, y);
  }
  const cliffsOn = opts.cliffs === 'on';
  // OTTD variety (tgp.cpp HeightMapCurves): variety 0 leaves the heights and the RNG sequence untouched
  const variety = Math.max(0, Math.min(5, Math.floor(Number(opts.variety) || 0)));
  if (variety > 0) applyVarietyCurves(width, height, values, rng, variety);
  const sorted = Array.from(values).sort((a, b) => a - b);
  const noSea = waterRatio <= 0;
  const sea = noSea ? sorted[0] : sorted[Math.floor(sorted.length * waterRatio)]; // no sea: heights span from the lowest point
  const top = sorted[sorted.length - 1];
  const mountainous = (opts.terrain === 'mountainous');
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const v = values[i];
    if (!noSea && v < sea) { t.terrain = 'water'; t.height = 0; continue; }
    let n = (v - sea) / Math.max(1e-9, top - sea);
    if (mountainous) n = Math.pow(n, 0.6); // more peaks, full range
    t.height = Math.min(7, Math.floor((n * scale * (cliffsOn ? CLIFF_RELIEF : 1)) * 8));
  }
  finishTerrain(map, rng, opts, forest, dry);
}

/**
 * Generate terrain from an imported heightmap (heightmap.js): `heights` holds one level per tile
 * (0 = sea/water, 1..7 = land; length width*height). Slopes are limited the same way as the generated
 * map, and the cover (forest, desert, rock, snow), rivers, lakes and mountain style are applied as usual.
 * Options as generateTerrain (waterRatio/seaLevel/terrain are ignored: the heights are the terrain).
 * @param {object} map
 * @param {object} rng
 * @param {Uint8Array} heights
 * @param {{smoothness?:string,rivers?:string,cliffs?:string,lakes?:string,mountainStyle?:string}} [opts]
 */
export function generateTerrainFromHeights(map, rng, heights, opts = {}) {
  const { width, height, tiles } = map;
  if (heights.length !== width * height) throw new Error('heightmap size does not match the map');
  const forest = fbm(rng, width, height, 12, 3);
  const dry = fbm(rng, width, height, 20, 2);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const h = heights[i];
    t.height = Math.min(7, h);
    t.terrain = h === 0 ? 'water' : 'grass';
  }
  finishTerrain(map, rng, opts, forest, dry);
}

/**
 * Shared tail of the terrain generators: slope limit, rivers, lakes, cover (forest/desert/rock/snow),
 * cliffs and mountain style. Heights and water are already set on the tiles.
 */
function finishTerrain(map, rng, opts, forest, dry) {
  const { width, height, tiles } = map;
  const snowAt = snowTerrainHeight(opts.snowLine);
  const cliffs = opts.cliffs === 'on';
  const cap = cliffs ? CLIFF_SLOPE_CAP : 1;
  limitSlopes(map, cap);
  if (opts.rivers === 'flowing') carveFlowingRivers(map, rng, FLOW_RIVER_COUNT);
  const riverTarget = RIVER_COUNTS[opts.rivers ?? 'none'] ?? 0;
  if (riverTarget > 0) {
    carveRivers(map, rng, riverTarget);
    limitSlopes(map, cap); // river banks drop to within one level of the water (cliffs on: within the cap)
  }
  const lakeTarget = LAKE_COUNTS[opts.lakes ?? 'off'] ?? 0;
  if (lakeTarget > 0) {
    const lakeTiles = carveLakes(map, rng, lakeTarget);
    if (lakeTiles.length) relaxAround(map, lakeTiles, cap); // lake shores drop like river banks (local, not a full sweep)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      if (t.terrain === 'water') continue;
      if (t.height >= snowAt) t.terrain = 'snow';
      else if (t.height >= 6 && dry(x, y) > 0.55) t.terrain = 'rock';
      else if (forest(x, y) > 0.6) t.terrain = 'forest';
      else if (t.height <= 2 && dry(x, y) > 0.72) t.terrain = 'desert';
      else t.terrain = 'grass';
    }
  }
  if (cliffs) markCliffs(map);
  if (opts.mountainStyle === 'on') markMountainStyle(map);
}

/** Lakes option: number of lakes to aim for (attempts are capped in carveLakes). */
export const LAKE_COUNTS = { off: 0, few: 3, many: 8 };
/** Lake size cap (tiles) and maximum depth above the lowest spill point (levels). */
export const LAKE_MAX_TILES = 48;
export const LAKE_MAX_DEPTH = 2;
/** OpenLoco generateTerrainOnMountains marks a square of radius 12 around each peak (MapGenerator.cpp:365-388). */
export const MOUNTAIN_RADIUS = 12;
/** Peak height (levels) for the mountain style: the top level (7, the snow line); 6 would cover about half the map at radius 12. */
export const MOUNTAIN_PEAK = 7;

/**
 * Lakes (TT-original; OpenLoco has no lake pass: its generateWater, MapGenerator.cpp:219, only floods below sea level).
 * From each candidate (a land local minimum at height >= 2) try levels L = base..base+LAKE_MAX_DEPTH: the land tiles
 * at height <= L connected to the candidate form the basin. A basin that is closed (no edge tile, no water next to
 * it), at most LAKE_MAX_TILES large and does not overlap an earlier lake becomes water at height 0.
 * Returns the number of lakes made. RNG draws only for the candidate picks.
 */
function carveLakes(map, rng, target) {
  const { width, height, tiles } = map;
  const cand = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x, t = tiles[i];
      if (t.terrain === 'water' || t.height < 2) continue;
      let low = true;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (tiles[j].terrain === 'water' || tiles[j].height < t.height) { low = false; break; }
      }
      if (low) cand.push(i);
    }
  }
  if (!cand.length) return [];
  const taken = new Uint8Array(width * height);
  const lakeTiles = [];
  let made = 0;
  for (let attempt = 0; attempt < 200 && made < target; attempt++) {
    const start = cand[Math.floor(rng.next() * cand.length)];
    if (taken[start] || tiles[start].terrain === 'water') continue;
    const basin = findBasin(map, start, taken);
    if (!basin) continue;
    for (const i of basin) { tiles[i].terrain = 'water'; tiles[i].height = 0; taken[i] = 1; lakeTiles.push(i); }
    made++;
  }
  return lakeTiles;
}

/** Lower land around changed tiles until no step exceeds cap (same rule as limitSlopes, seeded from the changed tiles). */
function relaxAround(map, seeds, cap) {
  const { width, height, tiles } = map;
  const queue = seeds.slice();
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % width, y = (i - x) / width;
    const h = tiles[i].height;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx, u = tiles[j];
      if (u.height > h + cap) { u.height = h + cap; queue.push(j); }
      else if (h > u.height + cap) { tiles[i].height = u.height + cap; queue.push(i); }
    }
  }
}

/** Closed land basin around start (see carveLakes), or null. Deterministic, no RNG. */
function findBasin(map, start, taken) {
  const { width, height, tiles } = map;
  const base = tiles[start].height;
  for (let L = base; L <= base + LAKE_MAX_DEPTH; L++) {
    const seen = new Set([start]);
    const queue = [start];
    let ok = true;
    for (let q = 0; q < queue.length && ok; q++) {
      const i = queue[q];
      const x = i % width, y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { ok = false; break; }
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (seen.has(j)) continue;
        const u = tiles[j];
        if (u.terrain === 'water' || taken[j]) { ok = false; break; }
        if (u.height > L) continue; // the basin wall
        seen.add(j);
        queue.push(j);
        if (queue.length > LAKE_MAX_TILES) { ok = false; break; }
      }
    }
    if (ok) return queue;
  }
  return null;
}

/**
 * Mountain style (OpenLoco generateTerrainOnMountains + applySurfaceStyleToMarkedTiles, MapGenerator.cpp:288, 365):
 * land within MOUNTAIN_RADIUS (square) of a peak tile (height >= MOUNTAIN_PEAK) becomes rock. Snow and water stay.
 * Uses a summed-area table, so the cost is O(width*height) whatever the number of peaks. No RNG draws.
 */
function markMountainStyle(map) {
  const { width, height, tiles } = map;
  const W1 = width + 1;
  const sat = new Int32Array(W1 * (height + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      const peak = t.terrain !== 'water' && t.height >= MOUNTAIN_PEAK ? 1 : 0;
      sat[(y + 1) * W1 + x + 1] = sat[y * W1 + x + 1] + sat[(y + 1) * W1 + x] - sat[y * W1 + x] + peak;
    }
  }
  const R = MOUNTAIN_RADIUS;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(height - 1, y + R);
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      if (t.terrain === 'water' || t.terrain === 'snow') continue;
      const x0 = Math.max(0, x - R), x1 = Math.min(width - 1, x + R);
      const n = sat[(y1 + 1) * W1 + x1 + 1] - sat[y0 * W1 + x1 + 1] - sat[(y1 + 1) * W1 + x0] + sat[y0 * W1 + x0];
      if (n > 0) t.terrain = 'rock';
    }
  }
}

/** Cliffs option: relief multiplier so the elevation has steep steps (cliffs off = 1, historic). */
export const CLIFF_RELIEF = 2.8;
/** Cliffs option: steepest neighbour step allowed (levels); off = 1 (historic). */
export const CLIFF_SLOPE_CAP = 4;
/** A neighbour step of at least this many levels is a cliff (OpenLoco kCliffTerrainHeightDiff = 4, rescaled to 8-px levels). */
export const CLIFF_STEP = 3;

/**
 * OpenLoco generateTerrainAroundCliffs (MapGenerator.cpp:468): every tile whose south or east step is a cliff
 * marks the square of radius 6 around it; marked land becomes rock. Deterministic, no RNG draws.
 */
function markCliffs(map) {
  const { width, height, tiles } = map;
  const marked = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = tiles[y * width + x].height;
      const south = y + 1 < height ? tiles[(y + 1) * width + x].height : h;
      const east = x + 1 < width ? tiles[y * width + x + 1].height : h;
      if (Math.abs(south - h) < CLIFF_STEP && Math.abs(east - h) < CLIFF_STEP) continue;
      for (let yy = Math.max(0, y - 6); yy <= Math.min(height - 1, y + 6); yy++) {
        for (let xx = Math.max(0, x - 6); xx <= Math.min(width - 1, x + 6); xx++) marked[yy * width + xx] = 1;
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (marked[i] && tiles[i].terrain !== 'water') tiles[i].terrain = 'rock';
  }
}

/**
 * Rivers (OpenTTD-style): start on high land, follow the lowest unvisited neighbour that is not higher
 * than the current tile, and stop at water, the map edge, or a basin (a local minimum that becomes a
 * small lake, as in OpenTTD). Tiles become 1-wide water at height 0. Deterministic apart from the source picks.
 */
function carveRivers(map, rng, target) {
  const { width, height, tiles } = map;
  let maxH = 0;
  for (const t of tiles) if (t.terrain !== 'water' && t.height > maxH) maxH = t.height;
  const thr = Math.max(1, maxH - 2);
  const sources = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = tiles[y * width + x];
      if (t.terrain !== 'water' && t.height >= thr) sources.push(y * width + x);
    }
  }
  if (!sources.length) return;
  let made = 0;
  for (let attempt = 0; attempt < 400 && made < target; attempt++) {
    const path = tracePath(map, sources[Math.floor(rng.next() * sources.length)]);
    if (!path) continue;
    for (let i of path) {
      if (i < 0) i = -1 - i; // lake end: basin tile
      tiles[i].terrain = 'water'; tiles[i].height = 0;
    }
    made++;
  }
}

/** Downhill path from a source index to water or the map edge; null when it gets stuck. */
function tracePath(map, start) {
  const { width, height, tiles } = map;
  const visited = new Set([start]);
  const path = [start];
  let cur = start;
  for (let step = 0; step < 600; step++) {
    const cx = cur % width, cy = (cur - cx) / width;
    if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) return path;
    let best = -1, bestH = Infinity;
    for (const d of DIRS) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      const nt = tiles[ni];
      if (nt.terrain === 'water' && !visited.has(ni)) return path; // joins existing water
      if (visited.has(ni) || nt.height > tiles[cur].height) continue;
      if (nt.height < bestH) { bestH = nt.height; best = ni; }
    }
    if (best < 0) { path.push(-1 - cur); return path; } // basin: the river ends in a lake (marked -1-index)
    visited.add(best);
    path.push(best);
    cur = best;
  }
  return null;
}

/** Height of tile (x,y), or -1 when outside the map. */
function heightAt(map, x, y) {
  return x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : map.tiles[y * map.width + x].height;
}

/**
 * True when the tile's 2x2 corner block of heights is level (OpenTTD SLOPE_FLAT). Corners off the
 * map are ignored. Used by construction.build_on_slopes = off.
 */
export function isLevelTile(map, x, y) {
  const h = heightAt(map, x, y);
  for (const [cx, cy] of [[x + 1, y], [x + 1, y + 1], [x, y + 1]]) {
    const v = heightAt(map, cx, cy);
    if (v >= 0 && v !== h) return false;
  }
  return true;
}

/**
 * True when the tile's four corners (its 2x2 block of tile heights, N,E,S,W) form a flat or straight
 * inclined plane: all equal, or exactly two adjacent corners one level above the other two.
 * Corner (diagonal) slopes and steeper or two-level spreads cannot carry a river (OpenTTD slope rule).
 */
export function riverSlopeOk(map, x, y) {
  const c = [heightAt(map, x, y), heightAt(map, x + 1, y), heightAt(map, x + 1, y + 1), heightAt(map, x, y + 1)];
  if (c.some((v) => v < 0)) return false;
  return cornerSlopeOk(c);
}

/**
 * Shared slope rule for a tile's corner heights c = [N,E,S,W] (levels): flat, or a straight single-step
 * incline (two adjacent corners one level above the other two). Used by rivers and by autoslope track checks.
 * @param {number[]} c
 */
export function cornerSlopeOk(c) {
  const mn = Math.min(...c), mx = Math.max(...c);
  if (mx === mn) return true;
  if (mx - mn !== 1) return false;
  const hi = c.map((v) => v === mx);
  if (hi.filter(Boolean).length !== 2) return false;
  const i = hi.indexOf(true);
  return hi[(i + 1) % 4] || hi[(i + 3) % 4]; // the two high corners share an edge (either side of i)
}

/**
 * Flowing rivers (OpenTTD landscape.cpp FlowRiver, simplified): start on high land and step to the
 * lowest unvisited neighbour that is not higher, only over tiles that pass riverSlopeOk. Each river
 * tile is water (terrain 'water', tile.river = 1) and keeps its height. A river ends by joining water
 * (sea or an earlier river at no greater height) or in a basin, where the last tile becomes a lake.
 * Rivers never reach the map edge. Deterministic apart from the source picks (game rng).
 */
function carveFlowingRivers(map, rng, target) {
  const { width, height, tiles } = map;
  let maxH = 0;
  for (const t of tiles) if (t.terrain !== 'water' && t.height > maxH) maxH = t.height;
  const thr = Math.max(1, maxH - 2);
  const sources = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = tiles[y * width + x];
      if (t.terrain !== 'water' && t.height >= thr && riverSlopeOk(map, x, y)) sources.push(y * width + x);
    }
  }
  if (!sources.length) return;
  let made = 0;
  for (let attempt = 0; attempt < 400 && made < target; attempt++) {
    const path = traceFlowing(map, sources[Math.floor(rng.next() * sources.length)]);
    if (!path) continue;
    for (const i of path) {
      tiles[i].terrain = 'water';
      tiles[i].river = 1;
    }
    made++;
  }
}

/** Flowing river path from a source index (see carveFlowingRivers); null when it fails. */
function traceFlowing(map, start) {
  const { width, height, tiles } = map;
  const visited = new Set([start]);
  const path = [start];
  let cur = start;
  for (let step = 0; step < 600; step++) {
    const cx = cur % width, cy = (cur - cx) / width;
    let best = -1, bestH = Infinity;
    for (const d of DIRS) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue; // never reach the edge
      const ni = ny * width + nx;
      if (visited.has(ni)) continue;
      const nt = tiles[ni];
      if (nt.height > tiles[cur].height) continue;
      if (nt.terrain === 'water') return path; // joins the sea, a lake or an earlier river (never higher)
      if (!riverSlopeOk(map, nx, ny)) continue;
      if (nt.height < bestH) { best = ni; bestH = nt.height; }
    }
    if (best < 0) return path.length >= 2 ? path : null; // basin: the last tile becomes a lake
    visited.add(best);
    path.push(best);
    cur = best;
  }
  return null;
}

/** Lower tiles so that 4-neighbours differ by at most `cap` height levels (1 unless cliffs are on). */
export function limitSlopes(map, cap = 1) {
  const { width, height, tiles } = map;
  // historic default: 8 sweeps (kept so the pinned maps stay identical); cliffs: sweep until settled, so the cap really holds
  const passes = cap === 1 ? 8 : 256;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = tiles[y * width + x];
        for (const n of neighbours(map, x, y)) {
          if (t.height > n.tile.height + cap) { t.height = n.tile.height + cap; changed = true; }
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
