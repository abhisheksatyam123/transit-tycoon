/**
 * Octilinear road and rail builders (R5a). Roads: each OSM way is simplified and routed as
 * octilinear chains. Rail: all tracks are rasterised, thinned to one centreline, traced and
 * then routed the same way so parallel tracks collapse into one line.
 */
import { WIDTH, HEIGHT, projectF, TILE_M } from './proj.js';
import { chainTiles, markChain } from './raster.js';
import { simplifyDP } from './network.js';
import { octiChainTiles } from './octi.js';
import { thin, tracePolylines } from './skel.js';
import { tag, waysOf } from './io.js';
import { highwayClass, higherClass } from './network.js';

/** Smoothing passes applied to float polylines before simplification. */
const SMOOTH = Number(process.env.OCTI_SMOOTH || 0);

/**
 * Moving-average smoothing of a polyline (endpoints fixed).
 * @param {Array<{x:number,y:number}>} pts
 * @param {number} n passes
 * @returns {Array<{x:number,y:number}>}
 */
export function smooth(pts, n) {
  let cur = pts;
  for (let k = 0; k < n && cur.length > 2; k++) {
    const out = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      out.push({ x: 0.25 * cur[i - 1].x + 0.5 * cur[i].x + 0.25 * cur[i + 1].x, y: 0.25 * cur[i - 1].y + 0.5 * cur[i].y + 0.25 * cur[i + 1].y });
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Simplification tolerance in tiles for road and rail polylines. */
const EPS = Number(process.env.OCTI_EPS || 2);
const SHORT = Number(process.env.OCTI_SHORT || 3);
/** Minimum summed length (tiles) of a named secondary street to keep it. */
const SECONDARY_MIN_TILES = (Number(process.env.OCTI_SEC_KM || 3) * 1000) / TILE_M; // 3 km (was '6 km' at a 200 m-per-km bug = 3 km at 100 m)

/**
 * Float tile polyline of a way.
 * @param {Array<{lat:number,lon:number}>} geom
 * @returns {Array<{x:number,y:number}>}
 */
function floatPts(geom) {
  return geom.map((p) => projectF(p.lat, p.lon));
}

/** Polyline length in tiles. @param {Array<{x:number,y:number}>} pts @returns {number} */
function plen(pts) {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return s;
}

/**
 * Drop interior vertices whose adjacent legs are shorter than `minLen` tiles (merges
 * sub-tile wiggles that would otherwise become 1-tile jogs).
 * @param {Array<{x:number,y:number}>} pts
 * @param {number} minLen
 * @returns {Array<{x:number,y:number}>}
 */
export function dropShortLegs(pts, minLen) {
  let out = pts.slice();
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      if (Math.min(l1, l2) < minLen && (i !== 1 || i !== out.length - 2 || true)) {
        // keep endpoints: remove the interior vertex, the short leg is absorbed
        if (i === 1 && l1 < minLen && out.length > 2) { out.splice(1, 1); changed = true; break; }
        if (i === out.length - 2 && l2 < minLen) { out.splice(i, 1); changed = true; break; }
        if (i !== 1 && i !== out.length - 2) { out.splice(i, 1); changed = true; break; }
      }
    }
  }
  return out;
}

/**
 * Rasterise roads octilinearly. Keeps motorway/trunk/primary; secondary only for named
 * streets whose total length reaches SECONDARY_MIN_TILES; _link ways are dropped.
 * @param {Array<object>|null} els roads layer
 * @returns {{bits:Uint8Array, cls:string[], ways:number, mkad:number[], kept:object}}
 */
export function buildRoadsOcti(els) {
  const n = WIDTH * HEIGHT;
  const bits = new Uint8Array(n);
  const cls = new Array(n).fill('.');
  const mkad = [];
  const ways = waysOf(els).filter((w) => !/_link$/.test(tag(w, 'highway')) && highwayClass(tag(w, 'highway')));
  // summed length per name for secondary streets
  const nameLen = new Map();
  for (const w of ways) {
    if (highwayClass(tag(w, 'highway')) !== 's') continue;
    const nm = tag(w, 'name');
    if (!nm) continue;
    nameLen.set(nm, (nameLen.get(nm) || 0) + plen(floatPts(w.geometry)));
  }
  const kept = { m: 0, t: 0, p: 0, s: 0, skipped: 0 };
  let nWays = 0;
  for (const w of ways) {
    const c = highwayClass(tag(w, 'highway'));
    if (c === 's') {
      const nm = tag(w, 'name');
      if (!nm || (nameLen.get(nm) || 0) < SECONDARY_MIN_TILES) { kept.skipped++; continue; }
    }
    nWays++;
    kept[c]++;
    const pts = dropShortLegs(simplifyDP(smooth(floatPts(w.geometry), SMOOTH), EPS), SHORT);
    const chain = octiChainTiles(pts);
    markChain(bits, chain);
    for (const t of chain) cls[t] = higherClass(cls[t], c);
    if (/МКАД|MKAD/i.test(tag(w, 'name') + ' ' + tag(w, 'ref'))) {
      mkad.push(...chainTiles(w.geometry));
    }
  }
  return { bits, cls, ways: nWays, mkad, kept };
}

/**
 * Rasterise railway=rail ways, merge parallel tracks by dilate-thin-trace, and route the
 * centrelines octilinearly.
 * @param {Array<object>|null} els rail layer
 * @returns {{bits:Uint8Array, ways:number, lines:number}}
 */
export function buildRailOcti(els) {
  const W = WIDTH, H = HEIGHT;
  const mask = new Uint8Array(W * H);
  let ways = 0;
  for (const w of waysOf(els)) {
    if (tag(w, 'railway') !== 'rail') continue;
    ways++;
    const pts = floatPts(w.geometry);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(a.x + ((b.x - a.x) * s) / steps), y = Math.round(a.y + ((b.y - a.y) * s) / steps);
        if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
      }
    }
  }
  // dilate 1 (3x3) so parallel tracks 2-3 tiles apart fuse before thinning
  const dil = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H) dil[Y * W + X] = 1;
    }
  }
  const sk = thin(dil, W, H);
  const lines = tracePolylines(sk, W, H);
  const bits = new Uint8Array(W * H);
  for (const line of lines) {
    const pts = simplifyDP(line, EPS);
    if (pts.length < 2) continue;
    markChain(bits, octiChainTiles(pts));
  }
  return { bits, ways, lines: lines.length };
}
