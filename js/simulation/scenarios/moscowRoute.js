/**
 * Moscow scenario, routing helpers: A* over the tile grid for surface rail (may overlap roads,
 * crosses water only as bridges), and direct writes of rail bits / station tiles.
 */
import { DIRS, OPPOSITE } from '../constants.js';
import { inBounds } from '../map.js';
import { createStation } from '../stations.js';

/** Minimal binary min-heap keyed by numeric priority. */
class Heap {
  constructor() { this.a = []; }
  push(pri, v) {
    const a = this.a; a.push([pri, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

/** Tiles that rail may never take (industries, depots; houses are demolished when crossed). */
function blockedForRail(t) {
  return !!t.building && t.building.type !== 'station' && t.building.type !== 'house';
}

/** Step cost of entering tile t for rail routing (bridges over water are expensive). */
function stepCost(t) {
  if (t.terrain === 'water') return 6;
  if (t.building && t.building.type === 'house') return 4;
  if (t.rail) return 0.6;
  if (t.road) return 1.1;
  return 1;
}

/**
 * Step cost on baked metro geometry: tiles of this line's own track are cheap, other lines' track
 * costs a little, anything else is off the real tunnels and costs extra.
 */
function metroStep(t, j, geo) {
  if (geo.metro[j] !== '0') return geo.metroLine[j] === geo.ch ? 0.3 : 1.2;
  return stepCost(t) + 3;
}

/**
 * A* route for surface rail between two tile indices. Endpoints may hold stations.
 * With `geo` ({metro, metroLine, ch} baked layers and this line's index char) the route follows the
 * real metro track of the line.
 * @returns {number[]|null} tile indices from a to b inclusive
 */
export function routeRail(map, a, b, maxNodes = 200000, geo = null) {
  const W = map.width, n = map.tiles.length;
  const gScore = new Float64Array(n).fill(Infinity), came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const hx = (i) => i % W, hy = (i) => Math.floor(i / W);
  const bx = hx(b), by = hy(b);
  const hw = geo ? 0.3 : 1;
  const h = (i) => (Math.abs(hx(i) - bx) + Math.abs(hy(i) - by)) * hw;
  const open = new Heap();
  gScore[a] = 0; open.push(h(a), a);
  let nodes = 0;
  while (open.size && nodes++ < maxNodes) {
    const cur = open.pop();
    if (cur === b) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = hx(cur), y = hy(cur);
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * W + nx;
      if (closed[j]) continue;
      const t = map.tiles[j];
      if (blockedForRail(t) && !(j === b && t.building && t.building.type === 'station')) continue;
      if (j !== b && t.building && t.building.type === 'station') continue;
      if (t.building && t.building.type === 'landmark') continue;
      const g = gScore[cur] + (geo ? metroStep(t, j, geo) : stepCost(t));
      if (g < gScore[j]) { gScore[j] = g; came[j] = cur; open.push(g + h(j), j); }
    }
  }
  if (!Number.isFinite(gScore[b])) return null;
  const out = [];
  for (let c = b; c !== -1; c = came[c]) { out.push(c); if (c === a) break; }
  return out.reverse();
}

/** Remove the house on tile i (and from its town's house list). */
function demolishHouse(map, i, towns) {
  const t = map.tiles[i];
  const town = towns.find((tw) => tw.id === t.building.townId);
  if (town) town.houses = town.houses.filter((h) => h.x !== i % map.width || h.y !== Math.floor(i / map.width));
  t.building = null;
}

/**
 * Lay rail bits along a tile path (mutual links). Water tiles stay water (bridge).
 * @returns {{bridges:number, shared:number}} water tiles and road-shared tiles on the path
 */
export function layRailPath(map, path, towns = []) {
  const W = map.width;
  let bridges = 0, shared = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k], b = path[k + 1];
    const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W);
    const d = DIRS.find((q) => q.dx === bx - ax && q.dy === by - ay);
    if (!d) continue;
    map.tiles[a].rail |= d.bit;
    map.tiles[b].rail |= OPPOSITE[d.bit];
  }
  for (const i of path) {
    const t = map.tiles[i];
    if (t.terrain === 'water') bridges++;
    if (t.road) shared++;
    if (t.building && t.building.type === 'house') demolishHouse(map, i, towns);
    if (!t.owner) t.owner = 'company';
  }
  return { bridges, shared };
}

/**
 * Axis ('x'|'y') a station may take on tile `i`: the tile must carry rail bits only on that axis
 * (straight track, no junction) and be a plain rail/land tile. Returns null otherwise.
 */
export function stationAxis(map, i) {
  const t = map.tiles[i];
  if (!t.rail || t.terrain === 'water') return null;
  if (t.rail === 10) return 'x';
  if (t.rail === 5) return 'y';
  return null;
}

/** True when `path` runs straight through index k (prev and next on one axis). */
export function straightAt(map, path, k) {
  if (k <= 0 || k >= path.length - 1) return null;
  const W = map.width;
  const [a, b, c] = [path[k - 1], path[k], path[k + 1]];
  if (Math.floor(a / W) === Math.floor(b / W) && Math.floor(b / W) === Math.floor(c / W)) return 'x';
  if (a % W === b % W && b % W === c % W) return 'y';
  return null;
}

/**
 * Index in `path` nearest to `target` (tile index) that is a straight, station-capable tile.
 * @returns {number} path index or -1
 */
export function nearestStraight(map, path, target, maxShift = 6) {
  const W = map.width;
  const tx = target % W, ty = Math.floor(target / W);
  let best = -1, bd = Infinity;
  for (let k = 1; k < path.length - 1; k++) {
    const i = path[k];
    const d = Math.abs(i % W - tx) + Math.abs(Math.floor(i / W) - ty);
    if (d > maxShift || d >= bd) continue;
    const t = map.tiles[i];
    if (t.terrain === 'water' || t.terrain === 'forest' || (t.building && t.building.type !== 'house' && t.building.type !== 'station')) continue;
    if (!stationAxis(map, i)) continue;
    bd = d; best = k;
  }
  return best;
}

/**
 * Turn a tile into a one-tile rail station along `axis`. Removes a house on the tile; joins an
 * existing station on the tile. Writes station tile data directly (grade-separated overlap with road).
 * @returns {object|null} station record
 */
export function placeStationTile(state, tileIndex, name, axis) {
  const { map } = state;
  const t = map.tiles[tileIndex];
  if (!axis) return null;
  const x = tileIndex % map.width, y = Math.floor(tileIndex / map.width);
  if (t.building && t.building.type === 'house') {
    const town = state.towns.find((tw) => tw.id === t.building.townId);
    if (town) town.houses = town.houses.filter((h) => h.x !== x || h.y !== y);
    t.building = null;
  }
  if (t.building && t.building.type !== 'station') return null;
  let st = t.building ? state.stations.find((s) => s.id === t.building.stationId) : null;
  if (!st) st = createStation(state, x, y);
  st.name = name;
  t.building = { type: 'station', stationId: st.id, kind: 'rail', axis };
  t.owner = 'company';
  if (!st.tiles.some((p) => p.x === x && p.y === y)) st.tiles.push({ x, y, kind: 'rail' });
  st.kinds = { rail: true, bus: false, truck: false };
  return st;
}
