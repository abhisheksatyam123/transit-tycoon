/**
 * Moscow industries from landuse. Connected clusters of landuse 'i' (industrial, 4-neighbour)
 * host the processing industries (factories, steel mills, power stations, sawmills), largest
 * first. Suppliers (farms, forests, mines, oil wells) go on the outskirts beyond the MKAD band,
 * spread by angle around the Kremlin. Deterministic: no rng, fixed scan orders.
 */
import { tl, TS } from './moscowScale.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { placeIndustry } from '../industries.js';
import { clearFootprint } from './moscowLand.js';
import { airportReserve } from './moscowAirports.js';

/** Industry must stay this far (tiles) from the Kremlin centre. */
const MIN_KREMLIN_DIST = tl(30);
/**
 * Secondary (processing) industries: placed in the suburb band, types interleaved round the circle so
 * every compass sector gets a mix and no two of one type sit next to each other.
 */
export const SECONDARY = [
  { typeId: 'factory', n: 8 },
  { typeId: 'power_station', n: 6 },
  { typeId: 'steel_mill', n: 5 },
  { typeId: 'sawmill', n: 3 },
];
/** Suburb band (tiles from the Kremlin) for secondary industries. */
const SECONDARY_BAND = [tl(30), tl(80)];
/** Outskirt suppliers: type, count, band of distances from the Kremlin (tiles), terrain of the anchor. */
export const SUPPLIERS = [
  { typeId: 'farm', n: 3, band: [tl(105), tl(150)], terrain: 'grass' },
  { typeId: 'forest', n: 3, band: [tl(60), tl(130)], terrain: 'forest' },
  { typeId: 'iron_mine', n: 2, band: [tl(95), tl(150)], terrain: 'grass' },
  { typeId: 'coal_mine', n: 2, band: [tl(95), tl(150)], terrain: 'grass' },
  { typeId: 'oil_wells', n: 1, band: [tl(95), tl(160)], terrain: 'grass' },
];
/** Same-type industries keep this many tiles apart (Chebyshev). */
const SAME_TYPE_SPACING = tl(25);
/** Any two industries keep this many tiles apart (Chebyshev). */
const ANY_SPACING = tl(12);
/** An industry must have a road tile within this many tiles of its footprint. */
const ROAD_REACH = 2;
/** Surface rail within this many tiles of the footprint is preferred (scoring bonus only). */
const RAIL_REACH = tl(4);

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
      for (let dy = -tl(3); dy <= tl(3); dy++) for (let dx = -tl(3); dx <= tl(3); dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < map.height) blocked[y * W + x] = 1;
      }
    }
  }
  return blocked;
}

/** Summed-area table of a W x H 0/1 grid: P[(y+1)*(W+1)+(x+1)]. */
function prefix(W, H, f) {
  const P = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    P[(y + 1) * (W + 1) + x + 1] = f(y * W + x) + P[y * (W + 1) + x + 1] + P[(y + 1) * (W + 1) + x] - P[y * (W + 1) + x];
  }
  return P;
}
/** Sum of the table over the inclusive rectangle [x0,x1]x[y0,y1] (clipped to the map). */
function rectSum(P, W, H, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
  if (x0 > x1 || y0 > y1) return 0;
  return P[(y1 + 1) * (W + 1) + x1 + 1] - P[y0 * (W + 1) + x1 + 1] - P[(y1 + 1) * (W + 1) + x0] + P[y0 * (W + 1) + x0];
}

/**
 * Site grids for the planner: buildable (free) tiles, road and surface-rail tiles, landuse 'i' tiles, and
 * occupancy stamps for placed industries (any-type and same-type spacing).
 */
function siteGrids(state, map, L, blocked) {
  const W = state.map.width, H = state.map.height;
  const tiles = state.map.tiles;
  const free = (i) => {
    const t = tiles[i];
    if (blocked[i] || t.terrain === 'water' || t.rail || t.road || t.highway) return 0;
    return !t.building || t.building.type === 'house' ? 1 : 0;
  };
  return {
    W, H,
    free: prefix(W, H, free),
    road: prefix(W, H, (i) => (tiles[i].road || tiles[i].highway ? 1 : 0)),
    rail: prefix(W, H, (i) => (tiles[i].rail && !tiles[i].tunnel ? 1 : 0)),
    urban: prefix(W, H, (i) => (L.landuse[i] === 'i' ? 1 : 0)),
    occ: new Uint8Array(W * H),
    occType: new Map(),
  };
}

/** Mark a footprint plus `r` tiles of margin as occupied in `occ`. */
function stamp(occ, W, H, x0, y0, w, h, r) {
  for (let y = Math.max(0, y0 - r); y < Math.min(H, y0 + h + r); y++) for (let x = Math.max(0, x0 - r); x < Math.min(W, x0 + w + r); x++) occ[y * W + x] = 1;
}

/** Footprint at (x0,y0) of size w x h: free ground, not inside any spacing stamp. */
function footprintOk(g, typeId, x0, y0, w, h) {
  const { W, H } = g;
  if (x0 < 1 || y0 < 1 || x0 + w >= W - 1 || y0 + h >= H - 1) return false;
  if (rectSum(g.free, W, H, x0, y0, x0 + w - 1, y0 + h - 1) !== w * h) return false;
  const occType = g.occType.get(typeId);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (g.occ[y * W + x] || (occType && occType[y * W + x])) return false;
  }
  return true;
}

/** Record a placed industry in the spacing stamps. */
function markPlaced(g, typeId, x0, y0, w, h) {
  stamp(g.occ, g.W, g.H, x0, y0, w, h, ANY_SPACING);
  if (!g.occType.has(typeId)) g.occType.set(typeId, new Uint8Array(g.W * g.H));
  stamp(g.occType.get(typeId), g.W, g.H, x0, y0, w, h, SAME_TYPE_SPACING);
}

/**
 * Best free footprint for one industry: inside `band` of the Kremlin, nearest the angle `target`,
 * with a road within ROAD_REACH tiles. Landuse 'i' and surface rail nearby are small scoring bonuses.
 * @returns {{x:number,y:number}|null}
 */
function findSite(state, g, typeId, band, terrain, target, kremlin) {
  const type = INDUSTRY_BY_ID[typeId];
  const { W, H } = g;
  const map = state.map;
  const [rMin, rMax] = band;
  const mid = (rMin + rMax) / 2;
  const { w, h } = type;
  let best = null;
  for (let y = Math.max(1, Math.floor(kremlin.y - rMax)); y <= Math.min(H - 2, Math.ceil(kremlin.y + rMax)); y++) {
    for (let x = Math.max(1, Math.floor(kremlin.x - rMax)); x <= Math.min(W - 2, Math.ceil(kremlin.x + rMax)); x++) {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.hypot(cx - kremlin.x, cy - kremlin.y);
      if (r < rMin || r > rMax || r < MIN_KREMLIN_DIST) continue;
      if (terrain && map.tiles[y * W + x].terrain !== terrain && !(terrain === 'grass' && map.tiles[y * W + x].terrain === 'grass')) continue;
      if (rectSum(g.road, W, H, x - ROAD_REACH, y - ROAD_REACH, x + w - 1 + ROAD_REACH, y + h - 1 + ROAD_REACH) === 0) continue;
      if (!footprintOk(g, typeId, x, y, w, h)) continue;
      let d = Math.abs(Math.atan2(cy - kremlin.y, cx - kremlin.x) - target) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const urbanFrac = rectSum(g.urban, W, H, x, y, x + w - 1, y + h - 1) / (w * h);
      const railNear = rectSum(g.rail, W, H, x - RAIL_REACH, y - RAIL_REACH, x + w - 1 + RAIL_REACH, y + h - 1 + RAIL_REACH) > 0;
      const score = d + 0.001 * Math.abs(r - mid) - (urbanFrac >= 0.99 ? 0.5 : urbanFrac > 0 ? 0.2 : 0) - (railNear ? 0.15 : 0);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best;
}

/** Industry placed at (x0,y0) with the footprint cleared (houses demolished). */
function place(state, typeId, x0, y0) {
  const type = INDUSTRY_BY_ID[typeId];
  if (!clearFootprint(state, x0, y0, type.w, type.h)) return null;
  return placeIndustry(state, typeId, x0, y0);
}

/**
 * Place urban (secondary) and outskirt (primary) industries. Secondary types fill the suburb band and
 * are spread round the circle; suppliers go on the outskirts. Industries already on the map (named
 * sites) are kept and respected for spacing. Footprints never touch airports, metro, roads or rail and
 * always have a road within ROAD_REACH tiles.
 * @param {object} state game state (state.map already laid)
 * @param {object} map baked map (landuse, metroLines, airports)
 * @param {{L:object, major:Uint8Array, kremlin:{x:number,y:number}, log:string[]}} ctx
 * @returns {{placed:number, byType:Object<string,number>, clusters:number}}
 */
export function planIndustries(state, map, ctx) {
  const { L, major, kremlin, log } = ctx;
  const byType = {};
  const blocked = blockedMask(state, map, L, major);
  const g = siteGrids(state, map, L, blocked);
  for (const o of state.industries) {
    const t = INDUSTRY_BY_ID[o.typeId];
    stamp(g.occ, g.W, g.H, o.x, o.y, t.w, t.h, ANY_SPACING);
    if (!g.occType.has(o.typeId)) g.occType.set(o.typeId, new Uint8Array(g.W * g.H));
    stamp(g.occType.get(o.typeId), g.W, g.H, o.x, o.y, t.w, t.h, SAME_TYPE_SPACING);
  }
  let placed = 0;
  const count = (typeId) => { byType[typeId] = (byType[typeId] || 0) + 1; placed++; };
  const tryPlace = (typeId, band, terrain, target, label) => {
    const type = INDUSTRY_BY_ID[typeId];
    const a = findSite(state, g, typeId, band, terrain, target, kremlin);
    if (!a || !place(state, typeId, a.x, a.y)) { log.push(`industry ${label}: no free roadside site`); return; }
    markPlaced(g, typeId, a.x, a.y, type.w, type.h);
    count(typeId);
  };

  // secondary: round-robin over types so neighbouring slots differ
  const queue = [];
  const left = SECONDARY.map((s) => ({ typeId: s.typeId, n: s.n }));
  while (left.some((s) => s.n > 0)) for (const s of left) if (s.n > 0) { queue.push(s.typeId); s.n--; }
  queue.forEach((typeId, k) => {
    const target = (2 * Math.PI * (k + 0.5)) / queue.length;
    tryPlace(typeId, SECONDARY_BAND, null, target, `${typeId} #${k}`);
  });

  SUPPLIERS.forEach((sup, si) => {
    const offset = si * 0.37;
    for (let k = 0; k < sup.n; k++) {
      const target = (2 * Math.PI * (k + offset)) / sup.n;
      tryPlace(sup.typeId, sup.band, sup.terrain, target, `${sup.typeId} supplier ${k}`);
    }
  });
  log.push(`industries from landuse: ${placed} placed (${queue.length} secondary, ${SUPPLIERS.reduce((a, s) => a + s.n, 0)} suppliers planned)`);
  return { placed, byType, clusters: landuseClusters(L.landuse, map.width, map.height, 'i').length };
}

/**
 * Footprint for a named real-world industry site: nearest clearable footprint (ring search from the
 * projected site) that also has a road within ROAD_REACH tiles. Falls back to the plain nearest site
 * when no road is near enough, so named sites are never dropped.
 * @returns {{x:number,y:number}|null}
 */
export function namedSiteFootprint(state, typeId, cx, cy, maxR, major) {
  const type = INDUSTRY_BY_ID[typeId];
  const { map } = state;
  const W = map.width, H = map.height;
  const roadNear = (x, y) => {
    for (let yy = y - ROAD_REACH; yy < y + type.h + ROAD_REACH; yy++) for (let xx = x - ROAD_REACH; xx < x + type.w + ROAD_REACH; xx++) {
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && (map.tiles[yy * W + xx].road || map.tiles[yy * W + xx].highway)) return true;
    }
    return false;
  };
  let fallback = null;
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x + type.w >= W - 1 || y + type.h >= H - 1) continue;
      let ok = true;
      for (let yy = y; ok && yy < y + type.h; yy++) for (let xx = x; xx < x + type.w; xx++) {
        const t = map.tiles[yy * W + xx];
        if (!t || t.terrain === 'water' || t.rail || t.road || t.highway || (major && major[yy * W + xx]) || (t.building && t.building.type !== 'house')) { ok = false; break; }
      }
      if (!ok) continue;
      if (roadNear(x, y)) return { x, y };
      if (!fallback) fallback = { x, y };
    }
  }
  return fallback;
}
