/**
 * Moscow industries from landuse. Connected clusters of landuse 'i' (industrial, 4-neighbour)
 * host the processing industries (factories, steel mills, power stations, sawmills), largest
 * first. Suppliers (farms, forests, mines, oil wells) go on the outskirts beyond the MKAD band,
 * spread by angle around the Kremlin. Deterministic: no rng, fixed scan orders.
 */
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { placeIndustry } from '../industries.js';
import { clearFootprint } from './moscowLand.js';
import { airportReserve } from './moscowAirports.js';

/** Industry must stay this far (tiles) from the Kremlin centre. */
const MIN_KREMLIN_DIST = 30;
/** Clusters smaller than this (tiles) get no industry; the largest URBAN_MAX are used. */
const MIN_CLUSTER = 12;
/** Maximum urban (cluster) industries. */
const URBAN_MAX = 24;
/** Urban type cycle, applied to clusters from largest to smallest. */
const URBAN_TYPES = ['steel_mill', 'factory', 'power_station', 'factory', 'sawmill', 'power_station', 'factory', 'steel_mill'];
/** Outskirt suppliers: type, count, band of distances from the Kremlin (tiles), terrain of the anchor. */
export const SUPPLIERS = [
  { typeId: 'farm', n: 3, band: [105, 150], terrain: 'grass' },
  { typeId: 'forest', n: 3, band: [60, 130], terrain: 'forest' },
  { typeId: 'iron_mine', n: 2, band: [95, 150], terrain: 'grass' },
  { typeId: 'coal_mine', n: 2, band: [95, 150], terrain: 'grass' },
  { typeId: 'oil_wells', n: 1, band: [95, 160], terrain: 'grass' },
];
/** Minimum spacing (tiles) between outskirt suppliers and any other industry. */
const SUPPLIER_SPACING = 25;

/**
 * Connected components of one landuse char (4-neighbour), largest first.
 * @param {string} lu one char per tile
 * @param {number} W width
 * @param {number} H height
 * @param {string} ch landuse char to group
 * @returns {{tiles:number[], size:number, cx:number, cy:number}[]} tiles are indices; ties keep scan order
 */
export function landuseClusters(lu, W, H, ch = 'i') {
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || lu[s] !== ch) continue;
    const tiles = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      tiles.push(i);
      const x = i % W, y = (i - x) / W;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < W - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - W);
      if (y < H - 1) nb.push(i + W);
      for (const j of nb) if (!seen[j] && lu[j] === ch) { seen[j] = 1; stack.push(j); }
    }
    let sx = 0, sy = 0;
    for (const i of tiles) { sx += i % W; sy += Math.floor(i / W); }
    out.push({ tiles, size: tiles.length, cx: sx / tiles.length, cy: sy / tiles.length, first: s });
  }
  out.sort((a, b) => b.size - a.size || a.first - b.first);
  return out.map(({ first, ...c }) => c);
}

/** Per-tile flags that keep industries off airports, metro and any track or road. */
function blockedMask(state, map, L, major) {
  const W = map.width, n = W * map.height;
  const blocked = new Uint8Array(n);
  const reserve = airportReserve(state.map, map);
  for (let i = 0; i < n; i++) {
    if (reserve[i] || major[i] || L.metro[i] !== '0' || L.metroLine[i] !== '-') blocked[i] = 1;
  }
  for (const line of map.metroLines || []) {
    for (const s of line.stations || []) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < map.height) blocked[y * W + x] = 1;
      }
    }
  }
  return blocked;
}

/** Footprint at (x0,y0) can take an industry: in bounds, land, no road/rail, no station/landmark/airport. */
function fits(state, blocked, x0, y0, w, h) {
  const { map } = state;
  if (x0 < 1 || y0 < 1 || x0 + w >= map.width - 1 || y0 + h >= map.height - 1) return false;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = y * map.width + x;
    const t = map.tiles[i];
    if (blocked[i] || t.terrain === "water" || t.rail) return false;
    if (t.building && t.building.type !== 'house') return false;
  }
  return true;
}

/** Centre of a footprint anchored at (x0,y0) is far enough from the Kremlin. */
function farEnough(kremlin, x0, y0, w, h) {
  return Math.hypot(x0 + w / 2 - kremlin.x, y0 + h / 2 - kremlin.y) >= MIN_KREMLIN_DIST;
}

/**
 * Anchor for an urban industry inside a cluster: footprint wholly on 'i' tiles if possible, else
 * the first footprint that touches the cluster. Tiles nearest the centroid are tried first.
 * @returns {{x:number,y:number,full:boolean}|null}
 */
function urbanAnchor(state, blocked, lu, cluster, type, kremlin) {
  const W = state.map.width;
  const ordered = cluster.tiles.slice().sort((a, b) => {
    const da = Math.hypot(a % W - cluster.cx, Math.floor(a / W) - cluster.cy);
    const db = Math.hypot(b % W - cluster.cx, Math.floor(b / W) - cluster.cy);
    return da - db || a - b;
  });
  let fallback = null;
  for (const i of ordered) {
    const tx = i % W, ty = Math.floor(i / W);
    for (let dy = 0; dy < type.h; dy++) for (let dx = 0; dx < type.w; dx++) {
      const x0 = tx - dx, y0 = ty - dy;
      if (!fits(state, blocked, x0, y0, type.w, type.h) || !farEnough(kremlin, x0, y0, type.w, type.h)) continue;
      let full = true;
      for (let y = y0; y < y0 + type.h && full; y++) for (let x = x0; x < x0 + type.w; x++) if (lu[y * W + x] !== 'i') { full = false; break; }
      if (full) return { x: x0, y: y0, full: true };
      if (!fallback) fallback = { x: x0, y: y0, full: false };
    }
  }
  return fallback;
}

/** Industry placed at (x0,y0) with the footprint cleared (houses demolished). */
function place(state, typeId, x0, y0) {
  const type = INDUSTRY_BY_ID[typeId];
  if (!clearFootprint(state, x0, y0, type.w, type.h)) return null;
  return placeIndustry(state, typeId, x0, y0);
}

/** Outskirt supplier candidate scan: best anchor for one angle target, or null. */
function supplierAnchor(state, blocked, sup, type, kremlin, target) {
  const { map } = state;
  const W = map.width;
  const [rMin, rMax] = sup.band;
  const mid = (rMin + rMax) / 2;
  let best = null;
  for (let y = Math.max(1, kremlin.y - rMax); y <= Math.min(map.height - 2, kremlin.y + rMax); y++) {
    for (let x = Math.max(1, kremlin.x - rMax); x <= Math.min(W - 2, kremlin.x + rMax); x++) {
      const r = Math.hypot(x - kremlin.x, y - kremlin.y);
      if (r < rMin || r > rMax) continue;
      const t = map.tiles[y * W + x];
      if (t.terrain !== sup.terrain && !(sup.terrain === 'grass' && t.terrain === 'grass')) continue;
      if (sup.terrain === 'forest' && t.terrain !== 'forest') continue;
      if (!fits(state, blocked, x, y, type.w, type.h)) continue;
      if (state.industries.some((o) => Math.abs(o.x - x) + Math.abs(o.y - y) < SUPPLIER_SPACING)) continue;
      let d = Math.abs(Math.atan2(y - kremlin.y, x - kremlin.x) - target) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const score = d + 0.001 * Math.abs(r - mid);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best;
}

/**
 * Place urban (cluster) and outskirt industries from the landuse layer. Industries already on
 * the map (named sites) are kept; footprints never touch airports, metro, roads or rail.
 * @param {object} state game state (state.map already laid)
 * @param {object} map baked map (landuse, metroLines, airports)
 * @param {{L:object, major:Uint8Array, kremlin:{x:number,y:number}, log:string[]}} ctx
 * @returns {{placed:number, byType:Object<string,number>, clusters:number}}
 */
export function planIndustries(state, map, ctx) {
  const { L, major, kremlin, log } = ctx;
  const W = map.width, H = map.height;
  const lu = L.landuse;
  const byType = {};
  const blocked = blockedMask(state, map, L, major);
  const clusters = landuseClusters(lu, W, H, 'i');
  let placed = 0;
  const count = (typeId) => { byType[typeId] = (byType[typeId] || 0) + 1; placed++; };

  const urban = clusters.filter((c) => c.size >= MIN_CLUSTER).slice(0, URBAN_MAX);
  urban.forEach((c, k) => {
    const typeId = URBAN_TYPES[k % URBAN_TYPES.length];
    const type = INDUSTRY_BY_ID[typeId];
    const a = urbanAnchor(state, blocked, lu, c, type, kremlin);
    if (!a || !place(state, typeId, a.x, a.y)) { log.push(`industry cluster ${k}: no free footprint (${c.size} tiles)`); return; }
    count(typeId);
  });

  for (const sup of SUPPLIERS) {
    const type = INDUSTRY_BY_ID[sup.typeId];
    const offset = SUPPLIERS.indexOf(sup) * 0.37;
    for (let k = 0; k < sup.n; k++) {
      const target = (2 * Math.PI * (k + offset)) / sup.n;
      const a = supplierAnchor(state, blocked, sup, type, kremlin, target);
      if (!a || !place(state, sup.typeId, a.x, a.y)) continue;
      count(sup.typeId);
    }
  }
  log.push(`industries from landuse: ${placed} placed (${clusters.length} industrial clusters, ${urban.length} urban)`);
  return { placed, byType, clusters: clusters.length };
}

