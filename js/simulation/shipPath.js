/**
 * Water pathfinder for ships (OpenTTD yapf_ship, simplified): A* over water tiles, 4-connected like our rail/road
 * grids. Passable: water tiles without a land structure (ship depots and buoys are allowed, and so are bridge decks
 * because they keep terrain 'water'). Goal tiles (docks on land, depots and buoys on water) are always enterable.
 * Ships never move over land, so an island with no water route is unreachable (the vehicle is lost).
 */
import { DIRS } from './constants.js';
import { MPH_TO_TILES_PER_TICK, DIAGONAL_STEP } from './loco/vehicleMotion.js';

const SHIP_ACCEL_MPH = 1 / 3; // 0.333333_mph (OpenLoco VehicleHead.cpp:2888)
const SHIP_BRAKE_MPH = 1.0;   // 1.0_mph (OpenLoco VehicleHead.cpp:2875)
const SHIP_FAST_BRAKE_MPH = 3.0; // 3.0_mph when speed >= 50 mph (OpenLoco VehicleHead.cpp:2878)
const FAST_BRAKE_THRESHOLD_TILES = 50.0 * MPH_TO_TILES_PER_TICK;
const SHIP_ACCEL_STEP = SHIP_ACCEL_MPH * MPH_TO_TILES_PER_TICK;
const SHIP_BRAKE_STEP = SHIP_BRAKE_MPH * MPH_TO_TILES_PER_TICK;
const SHIP_FAST_BRAKE_STEP = SHIP_FAST_BRAKE_MPH * MPH_TO_TILES_PER_TICK;
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
 * OpenTTD yapf_ship.cpp:339-352 `ship_curve90_penalty` default 6 x YAPF_TILE_LENGTH. A tile step is roughly one
 * YAPF_TILE_LENGTH (100), and TT's step cost is 1, so a 90-degree turn costs 6 tile steps. A 4-connected grid has
 * no 45-degree turns, so OpenTTD's `ship_curve45_penalty` (1 x YAPF_TILE_LENGTH) has no equivalent here.
 */
export const SHIP_CURVE90_COST = 6;

/**
 * Shortest water route from start to the nearest goal tile.
 *
 * By default this is the historical unit-cost 4-connected A* (no turn state), so route choices and world hashes are
 * unchanged. With `opts.turnCost` the search is direction-aware and adds SHIP_CURVE90_COST at each 90-degree turn,
 * matching OpenTTD's ship YAPF curve penalty (the tile count stays the primary cost; the heuristic stays admissible
 * because a step costs at least 1).
 * @param {{width:number,height:number,tiles:object[]}} map
 * @param {{x:number,y:number}} start ship head tile (need not be passable: a ship may leave a dock)
 * @param {{x:number,y:number}[]} goals
 * @param {{turnCost?:boolean}} [opts]
 * @returns {{x:number,y:number}[]|null} tiles from start (inclusive) to the goal (inclusive), or null
 */
export function findShipPath(map, start, goals, opts) {
  if (opts && opts.diagonal) return findShipPathDiagonal(map, start, goals);
  if (opts && opts.turnCost) return findShipPathTurnCost(map, start, goals);
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

/** Tile has no canal, lock or aqueduct: diagonal ship steps never touch these (their 4-step rules stay as they are). */
function plainWater(map, k) {
  const t = map.tiles[k];
  return !t.canal && !t.lock && !t.aqueduct;
}

/** A diagonal step on the tile grid is taken only between plain tiles and past two passable corner tiles (no cutting land). */
function diagonalStepOk(map, i, j, W) {
  if (!plainWater(map, i) || !plainWater(map, j)) return false;
  const ix = i % W, iy = (i - ix) / W, jx = j % W, jy = (j - jx) / W;
  const c1 = iy * W + jx, c2 = jy * W + ix; // the two orthogonal corners of the diagonal step
  return shipPassable(map, c1) && shipPassable(map, c2) && plainWater(map, c1) && plainWater(map, c2);
}

/** True when two consecutive path tiles differ on both axes (opt-in `shipDiagonal` paths only). */
export function isDiagonalStep(a, b) {
  return !!a && !!b && a.x !== b.x && a.y !== b.y;
}

/** Progress cost of the step from path[i] to path[i+1]: a diagonal step is sqrt(2) tiles (as road/rail, movement.js). */
export function shipStepLen(path, i) {
  return isDiagonalStep(path[i], path[i + 1]) ? DIAGONAL_STEP : 1;
}

/**
 * 8-way variant used by the opt-in `shipDiagonal` setting: orthogonal steps cost 1, diagonal steps sqrt(2), with the
 * corner rule of diagonalStepOk. Octile heuristic (admissible for these costs). Goals keep the tile semantics.
 * Ignores `turnCost`: the turn-cost search is 4-connected only.
 */
function findShipPathDiagonal(map, start, goals) {
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
    for (const q of goals) {
      const dx = Math.abs(q.x - x), dy = Math.abs(q.y - y);
      best = Math.min(best, Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
    }
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
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (closed[j]) continue;
        if (!goalSet.has(j) && !shipPassable(map, j)) continue;
        const diag = dx !== 0 && dy !== 0;
        if (diag) { if (!diagonalStepOk(map, i, j, W)) continue; } else if (!shipStepOk(map, i, j)) continue;
        const ng = g[i] + (diag ? Math.SQRT2 : 1);
        if (ng < g[j]) {
          g[j] = ng; parent[j] = i;
          open.push(ng + h(j), j);
        }
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
 * Direction-aware variant of findShipPath used by the opt-in `shipTurnCost` setting. Node = tile x incoming
 * direction (5 slots per tile: 0..3 = DIRS index of the step just taken, 4 = the start's unknown heading).
 * A straight step costs 1; a 90-degree turn costs 1 + SHIP_CURVE90_COST. Goals keep the historical tile semantics,
 * so docks, buoys, canals, locks and aqueducts behave exactly as in the default search. No diagonal moves.
 */
function findShipPathTurnCost(map, start, goals) {
  if (!goals || !goals.length) return null;
  const W = map.width, H = map.height;
  const goalSet = new Set(goals.map((g) => g.y * W + g.x));
  const s0 = start.y * W + start.x;
  if (goalSet.has(s0)) return [{ x: start.x, y: start.y }];
  const N = W * H;
  const STRIDE = 5; // tile * 5 + incoming direction (4 = start)
  const g = new Float64Array(N * STRIDE).fill(Infinity);
  const parent = new Int32Array(N * STRIDE).fill(-1);
  const closed = new Uint8Array(N * STRIDE);
  const h = (i) => {
    const x = i % W, y = (i - x) / W;
    let best = Infinity;
    for (const q of goals) best = Math.min(best, Math.abs(q.x - x) + Math.abs(q.y - y));
    return best;
  };
  const open = new Heap();
  const startState = s0 * STRIDE + 4;
  g[startState] = 0;
  open.push(h(s0), startState);
  let goalState = -1;
  while (open.size) {
    const [, si] = open.pop();
    if (closed[si]) continue;
    closed[si] = 1;
    const i = (si / STRIDE) | 0;
    if (goalSet.has(i)) { goalState = si; break; }
    const x = i % W, y = (i - x) / W;
    const inDir = si - i * STRIDE;
    for (let di = 0; di < DIRS.length; di++) {
      const d = DIRS[di];
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!goalSet.has(j) && !shipPassable(map, j)) continue;
      if (!shipStepOk(map, i, j)) continue;
      const sj = j * STRIDE + di;
      if (closed[sj]) continue;
      const turn = inDir !== 4 && inDir !== di ? SHIP_CURVE90_COST : 0;
      const ng = g[si] + 1 + turn;
      if (ng < g[sj]) {
        g[sj] = ng; parent[sj] = si;
        open.push(ng + h(j), sj);
      }
    }
  }
  if (goalState < 0) return null;
  const out = [];
  for (let si = goalState; si !== -1; si = si === startState ? -1 : parent[si]) {
    const i = (si / STRIDE) | 0;
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
 * Ship speed (tiles/tick): OpenLoco VehicleHead.cpp:2871-2890 water motion rules.
 * Accelerates by 1/3 mph per tick (+0.333333_mph) up to target.
 * Decelerates by 1.0 mph per tick (or 3.0 mph if speed >= 50 mph) down to target (or 0).
 * @param {{speed:number}} v
 * @param {number} targetTiles target speed in tiles per tick
 */
export function shipSpeedStep(v, targetTiles) {
  const cur = v.speed || 0;
  if (cur === targetTiles) return cur;
  if (cur > targetTiles) {
    const decel = cur >= FAST_BRAKE_THRESHOLD_TILES ? SHIP_FAST_BRAKE_STEP : SHIP_BRAKE_STEP;
    return Math.max(targetTiles, Math.max(0, cur - decel));
  }
  return Math.min(targetTiles, cur + SHIP_ACCEL_STEP);
}

/** Link check for a ship: the next path tile must still be open water (or a buoy / depot). */
export function shipLinkOk(map, v, allowDiagonal = true) {
  const b = v.path[v.pathIndex + 1];
  if (!b) return true;
  if (!allowDiagonal && isDiagonalStep(v.path[v.pathIndex], b)) return false; // saved diagonal path, setting off: replan
  return shipPassable(map, b.y * map.width + b.x);
}
