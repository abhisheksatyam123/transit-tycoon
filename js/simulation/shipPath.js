/**
 * Water pathfinder for ships (OpenTTD yapf_ship, simplified): A* over water tiles, 4-connected like our rail/road
 * grids. Passable: water tiles without a land structure (ship depots and buoys are allowed, and so are bridge decks
 * because they keep terrain 'water'). Goal tiles (docks on land, depots and buoys on water) are always enterable.
 * Ships never move over land, so an island with no water route is unreachable (the vehicle is lost).
 */
import { DIRS } from './constants.js';
import { SHIP_ACCEL_TICKS } from '../config/ships.js';
import { lockParts } from './cmdCanal.js';
import { aqueductStepOk } from './aqueduct.js';

/** Buoy and depot tiles and bridge decks are water; other buildings and land are not passable. */
export function shipPassable(map, idx) {
  const t = map.tiles[idx];
  if (t && t.aqueduct) return t.aqueduct.role === 'deck' || (t.terrain === 'water' && !t.building);
  if (!t || t.terrain !== 'water') return false;
  const b = t.building;
  return !b || b.type === 'depot' || (b.type === 'station' && b.kind === 'buoy');
}

/**
 * May a ship step from tile index a to adjacent index b? Ordinary water (sea, lakes, rivers) always may.
 * Canal and lock water (tile.canal) only joins water at the same height, except that a lock's lower, middle and
 * upper tiles link to each other (OpenTTD locks change the water level this way). Old saves have no canals.
 */
export function shipStepOk(map, a, b) {
  const ta = map.tiles[a], tb = map.tiles[b];
  if (ta.aqueduct || tb.aqueduct) return aqueductStepOk(ta, tb);
  if (!ta.canal && !tb.canal) return true;
  if (ta.height === tb.height) return true;
  if (!ta.lock || !tb.lock) return false;
  const W = map.width;
  const parts = lockParts(map, a % W, (a - (a % W)) / W) || [];
  return parts.some((p) => p.x === b % W && p.y === (b - (b % W)) / W);
}

/** Binary min-heap of [priority, index] pairs (ties broken by index, so results are deterministic). */
class Heap {
  constructor() { this.a = []; }
  push(p, i) {
    const a = this.a; a.push([p, i]);
    let k = a.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (less(a[k], a[up])) { [a[k], a[up]] = [a[up], a[k]]; k = up; } else break;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === k) break;
        [a[k], a[m]] = [a[m], a[k]]; k = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

function less(p, q) { return p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]); }

/**
 * Shortest water route from start to the nearest goal tile.
 * @param {{width:number,height:number,tiles:object[]}} map
 * @param {{x:number,y:number}} start ship head tile (need not be passable: a ship may leave a dock)
 * @param {{x:number,y:number}[]} goals
 * @returns {{x:number,y:number}[]|null} tiles from start (inclusive) to the goal (inclusive), or null
 */
export function findShipPath(map, start, goals) {
  if (!goals || !goals.length) return null;
  const W = map.width, H = map.height;
  const goalSet = new Set(goals.map((g) => g.y * W + g.x));
  const s0 = start.y * W + start.x;
  if (goalSet.has(s0)) return [{ x: start.x, y: start.y }];
  const N = W * H;
  const g = new Float64Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (i) => {
    const x = i % W, y = (i - x) / W;
    let best = Infinity;
    for (const q of goals) best = Math.min(best, Math.abs(q.x - x) + Math.abs(q.y - y));
    return best;
  };
  const open = new Heap();
  g[s0] = 0;
  open.push(h(s0), s0);
  let goal = -1;
  while (open.size) {
    const [, i] = open.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (goalSet.has(i)) { goal = i; break; }
    const x = i % W, y = (i - x) / W;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (closed[j]) continue;
      if (!goalSet.has(j) && !shipPassable(map, j)) continue;
      if (!shipStepOk(map, i, j)) continue;
      const ng = g[i] + 1;
      if (ng < g[j]) {
        g[j] = ng; parent[j] = i;
        open.push(ng + h(j), j);
      }
    }
  }
  if (goal < 0) return null;
  const out = [];
  for (let i = goal; i !== -1; i = i === s0 ? -1 : parent[i]) {
    out.push({ x: i % W, y: (i - (i % W)) / W });
  }
  return out.reverse();
}

/**
 * Goal tiles of a ship order at station st: the open water tiles beside its docks, and the buoy tiles themselves.
 * Ships never enter a dock tile (land); they stop on the water next to it.
 * @returns {{x:number,y:number}[]}
 */
export function shipGoals(map, st) {
  const out = [], seen = new Set();
  const add = (x, y) => {
    const k = y * map.width + x;
    if (!seen.has(k)) { seen.add(k); out.push({ x, y }); }
  };
  for (const p of st.tiles) {
    if (p.kind === 'buoy') add(p.x, p.y);
    else if (p.kind === 'dock') {
      for (const d of DIRS) {
        const nx = p.x + d.dx, ny = p.y + d.dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        if (shipPassable(map, ny * map.width + nx)) add(nx, ny);
      }
    }
  }
  return out;
}

/**
 * The station a ship stopped on tile (x,y) is at, for order `order`: the buoy station on that tile, or a dock of the
 * order's station beside it. Returns null when the tile is not a stop of that station.
 * @returns {{id:number}|null}
 */
export function shipStopAt(state, v, order) {
  if (!order) return null;
  const { map } = state;
  const at = (x, y) => (x < 0 || y < 0 || x >= map.width || y >= map.height ? null : map.tiles[y * map.width + x].building);
  const here = at(v.tx, v.ty);
  if (here && here.type === 'station' && here.kind === 'buoy' && here.stationId === order.stationId) return { id: here.stationId };
  for (const d of DIRS) {
    const b = at(v.tx + d.dx, v.ty + d.dy);
    if (b && b.type === 'station' && b.kind === 'dock' && b.stationId === order.stationId) return { id: b.stationId };
  }
  return null;
}

/**
 * Ship speed (tiles/tick): accelerates to the target over SHIP_ACCEL_TICKS and brakes faster than it accelerates.
 * @param {{speed:number}} v
 * @param {number} targetTiles max speed in tiles per tick
 */
export function shipSpeedStep(v, targetTiles) {
  const step = targetTiles / SHIP_ACCEL_TICKS;
  if (v.speed > targetTiles) return Math.max(targetTiles, v.speed - step * 4);
  return Math.min(targetTiles, v.speed + step);
}

/** Link check for a ship: the next path tile must still be open water (or a buoy / depot). */
export function shipLinkOk(map, v) {
  const b = v.path[v.pathIndex + 1];
  if (!b) return true;
  return shipPassable(map, b.y * map.width + b.x);
}
