/**
 * v2 layers: metro track bits + per-tile line index, landuse, tall-building levels, airports.
 */
import { WIDTH, HEIGHT, project, projectF, inBBox } from './proj.js';
import { chainTiles, markChain, ringArea } from './raster.js';
import { tag, waysOf, nodeIndex } from './io.js';
import { polygonsOf, polygonMask } from './multipoly.js';

const N = WIDTH * HEIGHT;
/** Line-index alphabet for metroLine (one char per tile). */
const IDX = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Ways of a relation or layer that count as subway track.
 * @param {object} w
 * @returns {boolean}
 */
function isTrack(w) {
  return tag(w, 'railway') === 'subway' && !/^(yard|siding|spur)$/.test(tag(w, 'service'));
}

/**
 * Metro track bits and the per-tile line index.
 * Ways are the railway=subway ways of the subway layer (sidings/yards skipped). Line membership comes
 * from the route relations' member way ids (first relation wins).
 * @param {{subway:Array<object>|null, relations:Array<object>, lineIndexByRef:Map<string,number>}} a
 * @returns {{bits:Uint8Array, lineAt:Uint8Array, ways:number, tiles:number}}
 *   lineAt holds index chars (0 = none)
 */
export function buildMetro({ subway, relations, lineIndexByRef }) {
  const bits = new Uint8Array(N);
  const lineAt = new Uint8Array(N);
  const wayLine = new Map();
  for (const r of relations) {
    const li = lineIndexByRef.get(tag(r, 'ref') || tag(r, 'name'));
    if (li === undefined) continue;
    for (const m of r.members || []) {
      if (m.type === 'way' && !wayLine.has(m.ref)) wayLine.set(m.ref, li);
    }
  }
  let ways = 0;
  for (const w of waysOf(subway)) {
    if (!isTrack(w)) continue;
    ways++;
    const chain = chainTiles(w.geometry);
    markChain(bits, chain);
    const li = wayLine.get(w.id);
    if (li !== undefined) {
      const ch = IDX.charCodeAt(Math.min(li, IDX.length - 1));
      for (const t of chain) if (!lineAt[t]) lineAt[t] = ch;
    }
  }
  let tiles = 0;
  for (const b of bits) if (b) tiles++;
  return { bits, lineAt, ways, tiles };
}

/**
 * Index of a line in the output metroLines array keyed by ref.
 * @param {Array<{ref:string}>} lines
 * @returns {Map<string,number>}
 */
export function lineIndex(lines) {
  return new Map(lines.map((l, i) => [l.ref, i]));
}

/**
 * Landuse classes: 'i' industrial, 'c' commercial, 'm' retail ('-' none). Industrial wins overlaps.
 * @param {Array<object>|null} els landuse layer
 * @returns {{cls:Uint8Array, polys:number}}
 */
export function buildLanduse(els) {
  const cls = new Uint8Array(N);
  const order = [['retail', 'm'], ['commercial', 'c'], ['industrial', 'i']];
  let polys = 0;
  for (const [val, ch] of order) {
    const sel = (els || []).filter((e) => tag(e, 'landuse') === val);
    for (const poly of polygonsOf(sel)) {
      const { mask, n } = polygonMask(poly);
      if (!n) continue;
      polys++;
      for (let t = 0; t < N; t++) if (mask[t]) cls[t] = ch.charCodeAt(0);
    }
  }
  return { cls, polys };
}

/**
 * Level bucket char for a building:levels value (tall buildings only).
 * '4' 7-8, '5' 9-12, '6' 13-17, '7' 18-25, '8' 26-40, '9' 41+; '0' none.
 * @param {number} lv
 * @returns {string}
 */
export function levelBucket(lv) {
  if (lv >= 41) return '9';
  if (lv >= 26) return '8';
  if (lv >= 18) return '7';
  if (lv >= 13) return '6';
  if (lv >= 9) return '5';
  if (lv >= 7) return '4';
  return '0';
}

/**
 * Parse building:levels ("12", "12;14", "12 ") -> max integer or NaN.
 * @param {string} s
 * @returns {number}
 */
export function parseLevels(s) {
  const nums = String(s || '').split(/[;,]/).map((p) => parseFloat(p)).filter((v) => Number.isFinite(v) && v > 0 && v < 200);
  return nums.length ? Math.max(...nums) : NaN;
}

/**
 * Per-tile tall-building layers from way centres.
 * @param {Array<object>|null} els tallbld layer
 * @returns {{levels:Uint8Array, count:Uint8Array, n:number}} levels = bucket char code; count = tall buildings
 */
export function buildTall(els) {
  const levels = new Uint8Array(N);
  const count = new Uint8Array(N);
  let n = 0;
  for (const e of els || []) {
    if (!e.center && e.lat === undefined) continue;
    const lat = e.center ? e.center.lat : e.lat, lon = e.center ? e.center.lon : e.lon;
    const lv = parseLevels(tag(e, 'building:levels'));
    if (!Number.isFinite(lv) || !inBBox(lat, lon)) continue;
    const b = levelBucket(lv);
    if (b === '0') continue;
    const p = project(lat, lon);
    if (p.x < 0 || p.y < 0 || p.x >= WIDTH || p.y >= HEIGHT) continue;
    const t = p.y * WIDTH + p.x;
    n++;
    count[t] = Math.min(9, count[t] + 1);
    if (b > String.fromCharCode(levels[t] || 48)) levels[t] = b.charCodeAt(0);
  }
  for (let t = 0; t < N; t++) if (!levels[t]) levels[t] = 48;
  return { levels, count, n };
}

/**
 * Airports: aerodrome polygons/nodes with runways.
 * @param {Array<object>|null} els aeroway layer
 * @returns {Array<object>} {id,name,x,y,w,h,runways:[{x1,y1,x2,y2}], area, mask:Uint8Array(tiles)}
 */
export function buildAirports(els) {
  const nodes = nodeIndex(els);
  const aero = [];
  const runwayWays = waysOf(els).filter((w) => tag(w, 'aeroway') === 'runway');
  const polys = polygonsOf((els || []).filter((e) => tag(e, 'aeroway') === 'aerodrome'));
  const seenPoly = new Set();
  for (const poly of polys) {
    const el = poly.el;
    const { mask, n } = polygonMask(poly);
    const ring = poly.outer.flat().map((p) => projectF(p.lat, p.lon));
    const idTag = tag(el, 'iata') || tag(el, 'icao') || tag(el, 'name') || `A${el.id}`;
    if (!n) continue;
    seenPoly.add(`${el.type}${el.id}`);
    const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
    aero.push(boxOf(el, idTag, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), ringArea(ring), mask));
  }
  for (const e of els || []) {
    if (e.type !== 'node' || tag(e, 'aeroway') !== 'aerodrome' || seenPoly.has(`node${e.id}`)) continue;
    const p = projectF(e.lat, e.lon);
    const idTag = tag(e, 'iata') || tag(e, 'icao') || tag(e, 'name') || `N${e.id}`;
    aero.push(boxOf(e, idTag, p.x - 5, p.y - 3, p.x + 5, p.y + 3, 60, new Uint8Array(N)));
  }
  for (const a of aero) {
    a.runways = runwayWays.filter((w) => {
      const m = w.geometry[Math.floor(w.geometry.length / 2)];
      const p = projectF(m.lat, m.lon);
      return p.x >= a.x - 2 && p.x <= a.x + a.w + 2 && p.y >= a.y - 2 && p.y <= a.y + a.h + 2;
    }).map((w) => {
      const f = w.geometry[0], l = w.geometry[w.geometry.length - 1];
      const p1 = project(f.lat, f.lon), p2 = project(l.lat, l.lon);
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
  }
  return aero;
}

/**
 * Airport entry from polygon bounds.
 * @returns {object}
 */
function boxOf(el, idTag, fx0, fy0, fx1, fy1, area, mask) {
  const x = Math.floor(fx0), y = Math.floor(fy0);
  const w = Math.max(1, Math.min(WIDTH - Math.max(0, x), Math.ceil(fx1) - x)), h = Math.max(1, Math.min(HEIGHT - Math.max(0, y), Math.ceil(fy1) - y));
  return {
    id: idTag, name: tag(el, 'name'), nameEn: tag(el, 'name:en'),
    x: Math.max(0, x), y: Math.max(0, y), w, h, area, mask, runways: [],
  };
}

/** Keep the IATA hubs plus the four largest others. @param {object[]} list @returns {object[]} */
export function selectAirports(list) {
  const hubs = list.filter((a) => ['SVO', 'VKO', 'DME', 'ZIA'].includes(a.id));
  const rest = list.filter((a) => !hubs.includes(a)).sort((a, b) => b.area - a.area).slice(0, 4);
  return [...hubs, ...rest].sort((a, b) => a.id.localeCompare(b.id));
}

