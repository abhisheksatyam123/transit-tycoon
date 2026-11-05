/**
 * Moscow scenario, tile layer: decodes baked layers (terrain, road bits, rail bits, density),
 * applies heights and local street grid. Pure: no randomness, no DOM.
 */
import { tl, TS } from './moscowScale.js';
import { decodeRLE } from '../../config/maps/rle.js';
import { createMap, inBounds } from '../map.js';
import { DIRS, OPPOSITE } from '../constants.js';
import { TILE_M } from './moscowScale.js';

/** Projection of the baked map (see scratchpad contract): west/north edge in degrees. */
const PROJ = { lonW: 37.22, latN: 55.99 };

/**
 * Project lat/lon to baked tile coordinates (MOSCOW.tileMeters).
 * @returns {{x:number,y:number}}
 */
export function project(lat, lon) {
  return {
    x: Math.round((lon - PROJ.lonW) * 111320 * Math.cos((55.75 * Math.PI) / 180) / TILE_M),
    y: Math.round((PROJ.latN - lat) * 110574 / TILE_M),
  };
}

/** Decode one baked layer; a missing or wrong-length layer is filled with `def`. */
function layer(baked, key, n, def) {
  let s = '';
  try { s = baked[key] ? decodeRLE(baked[key]) : ''; } catch { s = ''; }
  return s.length === n ? s : def.repeat(n);
}

/**
 * Decode every baked layer to one-char-per-tile strings.
 * Metro layers (absent in older bakes): metro = hex track bits, metroLine = line-index char ('-' none).
 * @returns {{n:number,terrain:string,road:string,roadClass:string,rail:string,density:string,metro:string,metroLine:string}}
 */
export function decodeLayers(baked) {
  const n = baked.width * baked.height;
  return {
    n,
    terrain: layer(baked, 'terrain', n, 'g'),
    road: layer(baked, 'road', n, '0'),
    roadClass: layer(baked, 'roadClass', n, '-'),
    rail: layer(baked, 'rail', n, '0'),
    density: layer(baked, 'density', n, '0'),
    metro: layer(baked, 'metro', n, '0'),
    metroLine: layer(baked, 'metroLine', n, '-'),
    landuse: layer(baked, 'landuse', n, '-'),
  };
}

/** Hex bit char to integer (0..15), invalid chars give 0. */
function bitsOf(c) {
  const v = parseInt(c, 16);
  return Number.isNaN(v) ? 0 : v & 15;
}

/** Build the blank tile grid for the baked dimensions. */
export function createMoscowMap(baked) {
  return createMap(baked.width, baked.height);
}

/**
 * Terrain and heights: water 'w' is height 0; land is height 1 (Moscow is flat).
 * Parks 'p' and forest 'f' become forest terrain.
 */
export function applyTerrain(map, L) {
  for (let i = 0; i < L.n; i++) {
    const t = map.tiles[i];
    const c = L.terrain[i];
    if (c === 'w') { t.terrain = 'water'; t.height = 0; }
    else { t.terrain = c === 'p' || c === 'f' ? 'forest' : 'grass'; t.height = 1; }
  }
}

/**
 * Write mutual link bits for one layer ('road' or 'rail') from baked hex chars.
 * Links to out-of-map tiles are dropped; the neighbour always gets the opposite bit.
 */
export function applyBits(map, key, chars) {
  const W = map.width;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < W; x++) {
      const b = bitsOf(chars[y * W + x]);
      if (!b) continue;
      for (const d of DIRS) {
        if (!(b & d.bit)) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (!inBounds(map, nx, ny)) continue;
        map.tiles[y * W + x][key] |= d.bit;
        map.tiles[ny * W + nx][key] |= OPPOSITE[d.bit];
      }
    }
  }
}

/** Avenue class by baked road class: 1 motorway/trunk, 2 primary, 3 secondary. */
export const AVENUE_OF = { m: 1, t: 1, p: 2, s: 3 };

/**
 * Mark the baked motorway/trunk network as full-width 4-lane highways.
 * Local streets and primary avenues are unchanged.
 * @returns {number} tiles upgraded
 */
export function upgradeTrunkRoads(map, L) {
  let n = 0;
  for (let i = 0; i < L.n; i++) {
    if (L.roadClass[i] !== 'm' && L.roadClass[i] !== 't') continue;
    const t = map.tiles[i];
    if (!t.road || t.highway === 1) continue;
    t.highway = 1;
    n++;
  }
  return n;
}

/**
 * Mark tiles carrying major roads: owner 'town', forest under road cleared.
 * @returns {Uint8Array} 1 where baked roadClass is not '.'
 */
export function markMajor(map, L) {
  const major = new Uint8Array(L.n);
  // classes: any char except '-' / '.' (none) marks a major road; with no class data every road is major
  const haveClass = L.roadClass.split('').some((c) => c !== '-' && c !== '.');
  for (let i = 0; i < L.n; i++) {
    const t = map.tiles[i];
    if (haveClass ? (L.roadClass[i] !== '-' && L.roadClass[i] !== '.') : t.road) major[i] = 1;
    if (!t.road) continue;
    if (t.terrain === 'forest') t.terrain = 'grass';
    t.owner = 'town';
    const av = AVENUE_OF[L.roadClass[i]];
    if (av && haveClass) t.avenue = av;
  }
  return major;
}

/**
 * Link two adjacent tiles on the road layer (mutual bits).
 * @returns {void}
 */
function linkRoad(map, a, b) {
  const W = map.width;
  const ax = a % W, ay = (a - ax) / W, bx = b % W, by = (b - bx) / W;
  const d = DIRS.find((q) => q.dx === bx - ax && q.dy === by - ay);
  if (!d) return;
  map.tiles[a].road |= d.bit;
  map.tiles[b].road |= OPPOSITE[d.bit];
}

/** Candidate for a local street: land, urban density, no road/rail/building. */
function isCandidate(map, L, i) {
  const t = map.tiles[i];
  return t.terrain !== 'water' && L.density[i] !== '0' && !t.road && !t.rail && !t.building;
}

/** Local street pitch: 4x4 house blocks with a street every 5 tiles. */
export const LOCAL_PITCH = tl(10);
/** Minimum baked density for local streets (0 none, 1 outskirts, 2+ urban core). */
export const LOCAL_MIN_DENSITY = 1;

/**
 * Lay a sparse block grid on urban land (density >= LOCAL_MIN_DENSITY): one straight street
 * every LOCAL_PITCH tiles in each axis, only on candidate tiles, linked to the network where they
 * touch it. Streets never run one tile from another road (a free tile next to a road stays free).
 * Tiles flagged in `reserved` (e.g. airport sites) get no local streets.
 * Then drop dead-end local stubs shorter than 3 tiles, and every road component that does not
 * touch a major road (keeps the network connected).
 * @returns {{laid:number,pruned:number,stubs:number,noMajor:boolean}}
 */
export function layLocalStreets(map, L, major, reserved = null) {
  const W = map.width, H = map.height;
  const S = new Uint8Array(L.n);
  const dense = (i) => Number(L.density[i]) >= LOCAL_MIN_DENSITY;
  const ok = (i) => (!reserved || !reserved[i]) && (i >= 0) && dense(i) && isCandidate(map, L, i);
  const touchesRoad = (i) => {
    const x = i % W, y = (i - x) / W;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const nt = map.tiles[ny * W + nx];
      if (nt.road && nt.terrain !== 'water') return true;
    }
    return false;
  };
  // street lines every LOCAL_PITCH tiles; each straight run of candidate tiles is kept only when
  // one of its tiles touches an existing road, so every street starts and ends on the network
  const runs = (tiles) => {
    let run = [];
    const flush = () => {
      if (run.length && run.some(touchesRoad)) for (const j of run) S[j] = 1;
      run = [];
    };
    for (const i of tiles) { if (ok(i)) run.push(i); else flush(); }
    flush();
  };
  for (let y = 0; y < H; y += 1) if (y % LOCAL_PITCH === 0) runs(Array.from({ length: W }, (_, x) => y * W + x));
  for (let x = 0; x < W; x += 1) if (x % LOCAL_PITCH === 0) runs(Array.from({ length: H }, (_, y) => y * W + x));
  let laid = 0;
  const local = new Uint8Array(L.n);
  for (let i = 0; i < L.n; i++) {
    if (!S[i]) continue;
    const x = i % W, y = (i - x) / W;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * W + nx;
      const nt = map.tiles[j];
      if (!S[j] && !(nt.road && nt.terrain !== 'water')) continue;
      linkRoad(map, i, j);
    }
    local[i] = 1;
    laid++;
    map.tiles[i].owner = 'town';
  }
  const stubs = pruneLocalStubs(map, local, major);
  // with no major network at all there is nothing to attach to: keep the local grid as-is
  const anyMajor = major.some((v) => v);
  return { laid, stubs, pruned: anyMajor ? pruneLocalOnly(map, major) : 0, noMajor: !anyMajor };
}

/**
 * Remove local-street dead ends shorter than minLen tiles: a chain of local tiles (degree <= 2,
 * all in `local`) that ends at a free end and joins a junction within minLen tiles is cut off.
 * @returns {number} tiles removed
 */
function pruneLocalStubs(map, local, major) {
  const W = map.width, n = map.tiles.length;
  const deg = (i) => { const b = map.tiles[i].road; return ((b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1)); };
  const nb = (i, d) => (Math.floor(i / W) + d.dy) * W + (i % W) + d.dx;
  const stack = [];
  for (let i = 0; i < n; i++) if (local[i] && !major[i] && deg(i) <= 1) stack.push(i);
  let removed = 0;
  // iterative leaf removal: a local street that ends in a dead end is cut back until every end
  // is a junction or a major road
  while (stack.length) {
    const i = stack.pop();
    if (!local[i] || major[i] || deg(i) > 1) continue;
    const t = map.tiles[i];
    for (const d of DIRS) {
      if (!(t.road & d.bit)) continue;
      const j = nb(i, d);
      map.tiles[j].road &= ~OPPOSITE[d.bit];
      if (local[j] && !major[j] && deg(j) <= 1) stack.push(j);
    }
    t.road = 0;
    local[i] = 0;
    if (!t.building && !t.rail) t.owner = null;
    removed++;
  }
  return removed;
}

/** Clear road components (layer 'road') that contain no major tile. @returns {number} tiles cleared */
function pruneLocalOnly(map, major) {
  const W = map.width, n = map.tiles.length;
  const seen = new Uint8Array(n);
  let cleared = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !map.tiles[s].road) continue;
    const comp = [], stack = [s];
    let hasMajor = false;
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      if (major[i]) hasMajor = true;
      const x = i % W, y = (i - x) / W, bits = map.tiles[i].road;
      for (const d of DIRS) {
        if (!(bits & d.bit)) continue;
        const j = (y + d.dy) * W + x + d.dx;
        if (!seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (hasMajor) continue;
    for (const i of comp) {
      const t = map.tiles[i];
      t.road = 0;
      if (!t.building && !t.rail) t.owner = null;
      cleared++;
    }
  }
  return cleared;
}


/**
 * Embankment fix: straight road/rail tiles baked ON the river but running along it (a perpendicular neighbour is
 * land) become land (the embankment), so roads no longer drive on water. Real bridges (water both sides) stay.
 * @param {{width:number,height:number,tiles:any[]}} map
 * @returns {number} tiles converted
 */
export function embankWaterRoads(map) {
  const W = map.width, H = map.height, T = map.tiles;
  let n = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const t = T[y * W + x];
      if (t.terrain !== 'water') continue;
      const b = (t.road | 0) || (t.rail | 0);
      const perp = b === 5 ? [T[y * W + x - 1], T[y * W + x + 1]] : b === 10 ? [T[(y - 1) * W + x], T[(y + 1) * W + x]] : null;
      if (!perp) continue;
      const land = perp.find((q) => q.terrain !== 'water');
      if (!land) continue;
      t.terrain = land.terrain === 'forest' ? 'grass' : land.terrain;
      t.height = land.height | 0;
      n++;
    }
  }
  return n;
}
