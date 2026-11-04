/**
 * Building density (0..4) per tile from real ring distances.
 */
import { WIDTH, HEIGHT, TILE_M, projectF } from './proj.js';

const KREMLIN = projectF(55.752, 37.6175);
const MOSCOW_CITY = projectF(55.7495, 37.5375);

/**
 * Multi-source BFS distance (tiles) from a set of tile indices.
 * @param {number[]} src
 * @returns {Float32Array}
 */
export function distanceFrom(src) {
  const n = WIDTH * HEIGHT;
  const d = new Float32Array(n).fill(Infinity);
  const q = [];
  for (const t of src) if (d[t] !== 0) { d[t] = 0; q.push(t); }
  for (let h = 0; h < q.length; h++) {
    const t = q[h];
    const x = t % WIDTH, y = (t - x) / WIDTH;
    const nb = [];
    if (x > 0) nb.push(t - 1);
    if (x < WIDTH - 1) nb.push(t + 1);
    if (y > 0) nb.push(t - WIDTH);
    if (y < HEIGHT - 1) nb.push(t + WIDTH);
    for (const u of nb) if (d[u] === Infinity) { d[u] = d[t] + 1; q.push(u); }
  }
  return d;
}

/** Deterministic hash noise in [0,1). @param {number} t @returns {number} */
function noise(t) {
  let h = (t * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * Per tile: index of the settlement whose radius covers it (-1 when none), using the
 * tile's distance in metres to the settlement centre, normalised by radius.
 * Returns null when there are no settlements.
 */
function settlementDistance(settlements) {
  if (!settlements.length) return null;
  const n = WIDTH * HEIGHT;
  const best = new Float32Array(n).fill(Infinity); // min (dist / radius) over settlements
  for (const s of settlements) {
    const x0 = Math.max(0, Math.floor(s.x - s.r / TILE_M - 1)), x1 = Math.min(WIDTH - 1, Math.ceil(s.x + s.r / TILE_M + 1));
    const y0 = Math.max(0, Math.floor(s.y - s.r / TILE_M - 1)), y1 = Math.min(HEIGHT - 1, Math.ceil(s.y + s.r / TILE_M + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = Math.hypot(x - s.x, y - s.y) * TILE_M / s.r;
      const t = y * WIDTH + x;
      if (k < best[t]) best[t] = k;
    }
  }
  return best;
}

/** Density inside a settlement: 2 in the core (<40% of radius), 1 elsewhere, 0 outside. */
function settlementDensity(k) {
  if (!(k < 1)) return 0;
  return k < 0.4 ? 2 : 1;
}

/**
 * Compute density digits.
 * @param {{terrain:Uint8Array, rail:Uint8Array, inside:Uint8Array, mkadTiles:number[], codes:object}} a
 * @returns {Uint8Array} digit values 0..4 per tile
 */
export function buildDensity({ terrain, rail, inside, mkadTiles, settlements = [] }) {
  const n = WIDTH * HEIGHT;
  const out = new Uint8Array(n);
  const mkadD = mkadTiles.length ? distanceFrom(mkadTiles) : null;
  const seedDist = settlementDistance(settlements);
  for (let t = 0; t < n; t++) {
    const x = t % WIDTH, y = (t - x) / WIDTH;
    if (terrain[t] !== 'g' || rail[t]) continue;
    const dk = Math.hypot(x - KREMLIN.x, y - KREMLIN.y) * TILE_M;
    const dc = Math.hypot(x - MOSCOW_CITY.x, y - MOSCOW_CITY.y) * TILE_M;
    const r = noise(t);
    let v;
    if (dc < 600) v = 4;
    else if (dk < 2200) v = 4;
    else if (dk < 4500) v = 3 + (r < 0.4 ? 1 : 0);
    else if (inside[t]) {
      const dm = mkadD ? mkadD[t] * TILE_M : 0;
      v = dm > 6000 ? 2 : 2 + (r < 0.5 ? 1 : 0);
    } else v = seedDist ? settlementDensity(seedDist[t]) : 0;
    out[t] = v;
  }
  return out;
}
