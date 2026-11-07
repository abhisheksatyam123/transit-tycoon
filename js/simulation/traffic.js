/**
 * Private-car traffic: towns spawn cars that drive along the road network between
 * buildings. Cars queue when lanes are full (congestion) and give up when stuck.
 * State lives in state.traffic (see scratchpad/traffic-contract.md). Pure & deterministic.
 */
import { PLANS_PER_TICK } from '../config/traffic.js';
import { getSetting } from './settings.js';
import { TICKS_PER_DAY } from './constants.js';
import { hashSeed, createRng } from './rng.js';
import { roadConnected } from './network.js';
import { dirBetween } from './constants.js';
import { planTrip, repath, linkBit, tileIndex } from './trafficTrips.js';
import { authorityTown, ROAD_WORKS_SPEED } from './townAuthority.js';
import {
  MAX_CARS, MAX_CARS_LIMIT, POP_PER_CAR_CAP, TRIPS_PER_POP_PER_DAY, CAR_SPEED, LANE_CAPACITY, CONGESTION_SLOW, LANE_OFFSET, GAP_MIN, ACCEL, DECEL, CORNER_SLOW,
  STUCK_TICKS, HISTORY_DAYS, CONGESTED_LOAD, LOAD_ALPHA, JAM_CONGESTED, JAM_ALPHA, HWY_LANE_OFFSET, HWY_LANE_CAPACITY,
} from '../config/traffic.js';

/** Per-tile lane capacity: highway tiles (tile.highway on, tile.road present) hold HWY_LANE_CAPACITY. */
function laneCapacity(map, tileIndex) {
  const t = map.tiles[tileIndex];
  return t && t.highway === 1 && t.road ? HWY_LANE_CAPACITY : LANE_CAPACITY;
}

/**
 * Create the initial traffic state.
 * @param {object} state game state (needs map, seed)
 * @returns {object} state.traffic
 */
export function createTraffic(state) {
  const n = state.map.width * state.map.height;
  const perTown = {};
  for (const t of state.towns || []) perTown[t.id] = { trips: 0, failed: 0, aborted: 0 };
  return {
    rngState: hashSeed(String(state.seed) + ':traffic'),
    nextCarId: 1,
    cars: [],
    load: new Array(n).fill(0),
    /** EMA share of car-ticks on each tile spent blocked by a full next link (0..1) */
    jam: new Array(n).fill(0),
    stats: {
      active: 0, tripsToday: 0, failedToday: 0, abortedToday: 0,
      tripsTotal: 0, failedTotal: 0, abortedTotal: 0,
      avgTripTicks: 0, avgSpeedRatio: 1, congestedTiles: 0, history: [],
      suppressedToday: 0, suppressedTotal: 0,
    },
    perTown,
    /** daily accumulators: per-tile car-tick samples, speed ratio sum and sample count */
    acc: { samples: new Array(n).fill(0), blocked: new Array(n).fill(0), speedSum: 0, speedN: 0 },
  };
}

/**
 * Towns with active road reconstruction (townAuthority 'roadworks') for this tick, or null.
 * Null in every game without the action, so the default car speed path is unchanged.
 */
let worksTowns = null;
/** tile -> under road works, memoised for the tick (authorityTown scans towns). */
let worksMemo = null;
function roadWorksAt(state, tile) {
  if (!worksTowns) return false;
  const hit = worksMemo.get(tile);
  if (hit !== undefined) return hit;
  const t = state.map.tiles[tile];
  let r = false;
  if (t && t.road) {
    const town = authorityTown(state, tile % state.map.width, Math.floor(tile / state.map.width));
    r = !!town && worksTowns.has(town);
  }
  worksMemo.set(tile, r);
  return r;
}

/** Occupancy key for cars/vehicles leaving tile `tile` in direction bit `bit`. */
const BIT_INDEX = { 1: 0, 2: 1, 4: 2, 8: 3 };
function occKey(tile, bit) { return tile * 4 + BIT_INDEX[bit]; }

/** Reused occupancy buffer (one Int32 per tile and outgoing direction), sized to the map. */
let scratch = null;
let occOwner = null;
/** Keys incremented this tick (cleared at the start of the next tick instead of refilling the map). */
let occTouched = new Int32Array(1024);
let nOccTouched = 0;
function occupancyScratch(state) {
  const n = state.map.width * state.map.height * 4;
  if (!scratch || scratch.length !== n || occOwner !== state) {
    scratch = new Int32Array(n);
    occOwner = state;
    nOccTouched = 0;
  } else {
    for (let i = 0; i < nOccTouched; i++) scratch[occTouched[i]] = 0;
    nOccTouched = 0;
  }
  return scratch;
}

/** Increment an occupancy count and remember the key so it can be cleared next tick. */
function occAdd(occ, k) {
  occ[k]++;
  if (nOccTouched === occTouched.length) {
    const grown = new Int32Array(occTouched.length * 2);
    grown.set(occTouched);
    occTouched = grown;
  }
  occTouched[nOccTouched++] = k;
}

/**
 * Build occupancy counts (cars and player road vehicles) keyed by tile+outgoing dir.
 * @returns {Map<number,number>}
 */
function buildOccupancy(state, cars, occ) {
  const W = state.map.width;
  for (const c of cars) {
    const a = c.path[c.i], b = c.path[c.i + 1];
    if (b === undefined) continue;
    occAdd(occ, occKey(a, linkBit(state.map, a, b)));
  }
  for (const v of state.vehicles) {
    // loading buses/trucks stand in the stop bay and do not block the through lane
    if (v.kind !== 'road' || v.roadType === 'tram' || v.state === 'loading' || !v.path || v.pathIndex >= v.path.length - 1) continue;
    const a = v.path[v.pathIndex], b = v.path[v.pathIndex + 1];
    occAdd(occ, occKey(a.y * W + a.x, linkBit(state.map, a.y * W + a.x, b.y * W + b.x)));
  }
  return occ;
}

/**
 * Active car cap: scales with total population, clamped to [MAX_CARS, MAX_CARS_LIMIT].
 * @param {object} state
 * @returns {number}
 */
export function carCap(state) {
  let pop = 0;
  for (const t of state.towns) pop += t.population || 0;
  return Math.min(MAX_CARS_LIMIT, Math.max(MAX_CARS, Math.floor(pop / POP_PER_CAR_CAP)));
}

/** Spawn cars for every town for this tick (each town draws once). */
function spawnCars(ctx, tr, rng, occ) {
  const { state } = ctx;
  const rate = TRIPS_PER_POP_PER_DAY / TICKS_PER_DAY;
  const cap = carCap(state);
  let plans = 0;
  for (const town of state.towns) {
    if (!town.population) continue;
    if (!rng.chance(Math.min(1, town.population * rate))) continue;
    if (tr.cars.length >= cap) { tr.stats.suppressedToday++; tr.stats.suppressedTotal++; continue; }
    if (plans >= PLANS_PER_TICK) break;
    plans++;
    const pt = tr.perTown[town.id] ||= { trips: 0, failed: 0, aborted: 0 };
    const plan = planTrip(state, rng, town);
    if (!plan) continue;
    if (plan.failed) {
      pt.failed++; tr.stats.failedToday++; tr.stats.failedTotal++;
      continue;
    }
    // origin lane full: the trip is suppressed (demand the street cannot absorb)
    const k0 = occKey(plan.path[0], linkBit(state.map, plan.path[0], plan.path[1]));
    if (occ[k0] >= laneCapacity(state.map, plan.path[0])) { tr.stats.suppressedToday++; tr.stats.suppressedTotal++; continue; }
    occAdd(occ, k0);
    tr.cars.push({
      id: tr.nextCarId++, townId: town.id, path: plan.path, i: 0, t: 0, speed: CAR_SPEED,
      wait: 0, born: state.tick, kind: rng.chance(0.15) ? 'van' : 'car', color: rng.int(0, 7),
    });
  }
}

/** Finish a car: count as trip, abort or failure. */
function endCar(tr, c, ok, tick) {
  const pt = tr.perTown[c.townId] ||= { trips: 0, failed: 0, aborted: 0 };
  if (ok) {
    tr.stats.tripsToday++; tr.stats.tripsTotal++; pt.trips++;
    const ticks = tick - c.born;
    tr.stats.avgTripTicks = tr.stats.avgTripTicks === 0 ? ticks : tr.stats.avgTripTicks * 0.9 + ticks * 0.1;
  } else {
    tr.stats.abortedToday++; tr.stats.abortedTotal++; pt.aborted++;
  }
}

/** Car length plus bumper gap (tiles): the spacing a car keeps to the car ahead in its lane. */
const SPACING = 0.38 + GAP_MIN;

/** Scratch: first car (sorted position) per lane key, -1 when empty; reset after use. */
let laneFirst = null;
let laneHead = null;
let laneNext = new Int32Array(0);
let laneTouched = new Int32Array(0);

let laneKeyed = [];
let laneGroup = new Int32Array(64);
/**
 * Index cars by the lane they occupy this tick: sets c._key, c._ahead (car just ahead on the same
 * lane, or null) and returns the scratch array of lane-first cars for next-tile lookups.
 */
function laneIndex(map, cars, nKeys) {
  if (!laneFirst || laneFirst.length !== nKeys) { laneFirst = new Int32Array(nKeys).fill(-1); laneHead = new Int32Array(nKeys).fill(-1); }
  if (laneNext.length < cars.length) { laneNext = new Int32Array(cars.length * 2); laneTouched = new Int32Array(cars.length * 2); }
  // bucket cars by lane key (linked lists over car indices); keys visited in ascending order
  let nTouched = 0;
  for (let j = 0; j < cars.length; j++) {
    const c = cars[j];
    c._key = -1;
    c._ahead = null;
    if (c.i + 1 >= c.path.length) continue;
    const a = c.path[c.i];
    const k = occKey(a, linkBit(map, a, c.path[c.i + 1]));
    c._key = k;
    if (laneHead[k] < 0) laneTouched[nTouched++] = k;
    laneNext[j] = laneHead[k];
    laneHead[k] = j;
  }
  // lane visit order is irrelevant: every lookup is per lane (laneFirst/_ahead), so no key sort is needed.
  // within a lane: order by progress on the tile, then car id (a total order, so the result is unique)
  const keyed = laneKeyed;
  let nk = 0;
  for (let q = 0; q < nTouched; q++) {
    const k = laneTouched[q];
    let m = 0;
    for (let j = laneHead[k]; j >= 0; j = laneNext[j]) {
      if (m === laneGroup.length) { const g = new Int32Array(m * 2); g.set(laneGroup); laneGroup = g; }
      laneGroup[m++] = j;
    }
    laneHead[k] = -1;
    if (m > 1) {
      if (m <= 32) {
        // stable insertion sort: small lanes, no allocation
        for (let x = 1; x < m; x++) {
          const v = laneGroup[x], cv = cars[v];
          let y = x - 1;
          while (y >= 0) {
            const cy = cars[laneGroup[y]];
            if ((cy.t - cv.t || cy.id - cv.id) <= 0) break;
            laneGroup[y + 1] = laneGroup[y];
            y--;
          }
          laneGroup[y + 1] = v;
        }
      } else {
        const grp = new Array(m);
        for (let x = 0; x < m; x++) grp[x] = cars[laneGroup[x]];
        grp.sort((p, r) => p.t - r.t || p.id - r.id);
        for (let x = 0; x < m; x++) keyed[nk + x] = grp[x];
        nk += m;
        continue;
      }
    }
    for (let x = 0; x < m; x++) keyed[nk++] = cars[laneGroup[x]];
  }
  keyed.length = nk;
  for (let p = 0; p < nk; p++) {
    const c = keyed[p];
    if (laneFirst[c._key] < 0) laneFirst[c._key] = p;
    if (p + 1 < nk && keyed[p + 1]._key === c._key) c._ahead = keyed[p + 1];
  }
  return keyed;
}

/** True when the path bends at index i (the car turns through that tile). */
function bendsAt(W, path, i) {
  if (i <= 0 || i + 1 >= path.length) return false;
  const p = path[i - 1], n = path[i + 1], c = path[i];
  return (p + n) !== 2 * c; // straight through when the neighbours are opposite
}

/** Speed cap from the car ahead on a lane: leader gap in tiles, leader speed. */
function gapLimit(v, gap, leaderSpeed) {
  if (gap < GAP_MIN) return 0;
  if (gap < SPACING) return Math.min(v, leaderSpeed);
  return v;
}

/**
 * Advance one car by one tick (at most one tile, since speed < 1 tile/tick).
 * Speed eases toward a target (congestion, corners, car ahead) by ACCEL / DECEL per tick.
 * @returns {boolean} true if the car is finished (arrived or aborted)
 */
function moveCar(ctx, tr, c, occ, lanes) {
  const { state } = ctx;
  const map = state.map;
  const W = map.width;
  const last = c.path.length - 1;
  if (c.i >= last) { endCar(tr, c, true, state.tick); return true; }
  const a = c.path[c.i], b = c.path[c.i + 1];
  const here = c._key; // lane key of this tile's outgoing link, set by laneIndex this tick
  const load = occ[here] / laneCapacity(map, a);
  let target = CAR_SPEED * (1 - CONGESTION_SLOW * Math.min(1, load));
  if (worksTowns && roadWorksAt(state, a)) target *= ROAD_WORKS_SPEED;
  if (bendsAt(W, c.path, c.i)) target *= CORNER_SLOW;
  // car ahead in the same lane (larger progress on this tile)
  const lead = c._ahead;
  if (lead) {
    target = gapLimit(target, lead.t - c.t, lead.speed || 0);
  } else if (c.i + 2 <= last) {
    // next tile: the rear-most car just entered there is the leader across the junction
    const nextKey = occKey(b, linkBit(map, b, c.path[c.i + 2]));
    const p = laneFirst[nextKey];
    if (p >= 0 && lanes[p]._key === nextKey) target = gapLimit(target, 1 - c.t + lanes[p].t, lanes[p].speed || 0);
  }
  const v = c.speed === undefined ? CAR_SPEED : c.speed;
  c.speed = target > v ? Math.min(target, v + ACCEL) : Math.max(target, v - DECEL);
  if (c.speed < 0) c.speed = 0;
  tr.acc.speedSum += c.speed / CAR_SPEED;
  tr.acc.speedN++;
  c.t += c.speed;
  if (c.t < 1) return false;
  // entering tile b: check the road link and the lane capacity ahead
  const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W);
  if (!roadConnected(map, ax, ay, bx, by)) {
    const np = repath(map, a, c.path[last]);
    if (!np) { endCar(tr, c, false, state.tick); return true; }
    c.path = np; c.i = 0; c.t = 0; c.wait = 0;
    return false;
  }
  const nextKey = c.i + 1 < last ? occKey(b, linkBit(map, b, c.path[c.i + 2])) : null;
  if (nextKey !== null && occ[nextKey] >= laneCapacity(map, b)) {
    c.t = 1; c.speed = 0;
    tr.acc.blocked[a]++;
    if (++c.wait >= STUCK_TICKS) { endCar(tr, c, false, state.tick); return true; }
    return false;
  }
  c.wait = 0;
  c.i++; c.t -= 1;
  if (c.i >= last) { endCar(tr, c, true, state.tick); return true; }
  return false;
}

/** Sample per-tile car counts and refresh active count for this tick. */
function sampleTick(tr) {
  tr.stats.active = tr.cars.length;
  for (const c of tr.cars) tr.acc.samples[c.path[c.i]]++;
}

/**
 * Per-tick traffic update: spawn cars, move them, sample occupancy.
 * @param {{state:object}} ctx
 */
export function trafficTick(ctx) {
  const { state } = ctx;
  const tr = state.traffic;
  if (!tr) return;
  const rng = createRng(tr, 'rngState');
  const occ = occupancyScratch(state);
  let works = null;
  for (const t of state.towns || []) if (t.roadWorksMonths > 0) (works ||= new Set()).add(t);
  worksTowns = works;
  worksMemo = worksTowns ? new Map() : null;
  buildOccupancy(state, tr.cars, occ);
  spawnCars(ctx, tr, rng, occ);
  const kept = [];
  const lanes = laneIndex(state.map, tr.cars, occ.length);
  for (const c of tr.cars) if (!moveCar(ctx, tr, c, occ, lanes)) kept.push(c);
  if (laneFirst) for (const c of lanes) laneFirst[c._key] = -1;
  tr.cars = kept;
  worksTowns = null;
  worksMemo = null;
  sampleTick(tr);
}

/** Format state.date as YYYY-MM-DD. */
function fmtDate(d) {
  return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * Daily update: fold samples into the load EMA, record history, reset daily counters.
 * Call before the calendar advances so the history date is the day that just ended.
 * @param {{state:object}} ctx
 */
export function trafficDaily(ctx) {
  const { state } = ctx;
  const tr = state.traffic;
  if (!tr) return;
  const st = tr.stats, acc = tr.acc;
  let congested = 0;
  for (let i = 0; i < tr.load.length; i++) {
    // an idle tile with no samples and no load/jam is a fixed point of the update below
    if (acc.samples[i] === 0 && acc.blocked[i] === 0 && tr.load[i] === 0 && tr.jam[i] === 0) continue;
    const sample = acc.samples[i] / TICKS_PER_DAY;
    const v = tr.load[i] * (1 - LOAD_ALPHA) + sample * LOAD_ALPHA;
    tr.load[i] = Math.round(v * 100) / 100;
    const share = acc.samples[i] > 0 ? acc.blocked[i] / acc.samples[i] : 0;
    tr.jam[i] = Math.round((tr.jam[i] * (1 - JAM_ALPHA) + share * JAM_ALPHA) * 1000) / 1000;
    if (tr.load[i] >= CONGESTED_LOAD && tr.jam[i] >= JAM_CONGESTED) congested++;
    acc.samples[i] = 0; acc.blocked[i] = 0;
  }
  st.congestedTiles = congested;
  if (acc.speedN > 0) st.avgSpeedRatio = Math.round((acc.speedSum / acc.speedN) * 1000) / 1000;
  acc.speedSum = 0; acc.speedN = 0;
  st.history.push({
    date: fmtDate(state.date), active: st.active, trips: st.tripsToday, failed: st.failedToday,
    aborted: st.abortedToday, avgSpeedRatio: st.avgSpeedRatio, congestedTiles: congested,
  });
  if (st.history.length > HISTORY_DAYS) st.history.splice(0, st.history.length - HISTORY_DAYS);
  st.tripsToday = 0; st.failedToday = 0; st.abortedToday = 0; st.suppressedToday = 0;
}

/**
 * Lane pose on tile path[i] at fraction t (0..1). Straights run between edge midpoints,
 * corners are quarter arcs about the shared tile corner (radius 0.5 -/+ LANE_OFFSET). Right-hand
 * traffic: the lane sits LANE_OFFSET (or HWY_LANE_OFFSET on highway tiles when `map` is given)
 * to the right of the travel direction.
 * @returns {{x:number,y:number,ang:number}} tile-space point and heading angle (rad)
 */
export function lanePose(W, path, i, t, map = null, side = 1) {
  const tile = path[i];
  const cx = tile % W, cy = (tile - cx) / W;
  const onHwy = map && map.tiles && map.tiles[tile] && map.tiles[tile].highway === 1 && map.tiles[tile].road;
  const L = (onHwy ? HWY_LANE_OFFSET : LANE_OFFSET) * side; // side -1: left-hand traffic (mirror)
  const pIdx = i > 0 ? path[i - 1] : -1, nIdx = i + 1 < path.length ? path[i + 1] : -1;
  const ent = pIdx >= 0 ? [(pIdx % W) - cx, Math.floor(pIdx / W) - cy] : null;
  const ext = nIdx >= 0 ? [(nIdx % W) - cx, Math.floor(nIdx / W) - cy] : null;
  if (ent && ext && ent[0] === -ext[0] && ent[1] === -ext[1]) {
    const n = [-ext[1], ext[0]];
    const ax = 0.5 + 0.5 * ent[0] + L * n[0], ay = 0.5 + 0.5 * ent[1] + L * n[1];
    const bx = 0.5 + 0.5 * ext[0] + L * n[0], by = 0.5 + 0.5 * ext[1] + L * n[1];
    return { x: cx + ax + (bx - ax) * t, y: cy + ay + (by - ay) * t, ang: Math.atan2(ext[1], ext[0]) };
  }
  if (ent && ext) {
    // corner: travel in = -ent, out = ext; arc centre = shared corner of the two edges
    const Cx = 0.5 + 0.5 * (ent[0] + ext[0]), Cy = 0.5 + 0.5 * (ent[1] + ext[1]);
    const din = [-ent[0], -ent[1]];
    const cross = din[0] * ext[1] - din[1] * ext[0];
    const R = cross > 0 ? 0.5 - L : 0.5 + L; // right turn (y-down cross>0) is the tight one
    const a0 = Math.atan2(-ext[1], -ext[0]), a1 = Math.atan2(-ent[1], -ent[0]);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    const a = a0 + delta * t;
    const hd = a + (delta >= 0 ? Math.PI / 2 : -Math.PI / 2);
    return { x: cx + Cx + R * Math.cos(a), y: cy + Cy + R * Math.sin(a), ang: hd };
  }
  // path ends: enter from the edge midpoint, or leave toward it
  const d = ext || (ent ? [-ent[0], -ent[1]] : [1, 0]);
  const n = [-d[1], d[0]];
  const sx = ext ? 0.5 : 0.5 + 0.5 * ent[0], sy = ext ? 0.5 : 0.5 + 0.5 * ent[1];
  const ex = ext ? 0.5 + 0.5 * ext[0] : 0.5, ey = ext ? 0.5 + 0.5 * ext[1] : 0.5;
  return { x: cx + sx + (ex - sx) * t + L * n[0], y: cy + sy + (ey - sy) * t + L * n[1], ang: Math.atan2(d[1], d[0]) };
}

/**
 * Float coordinates and direction of every car for rendering (right-hand traffic offset).
 * Direction is the travel direction of the current link (or of the last link at the end).
 * @param {object} state
 * @returns {{id:number,fx:number,fy:number,dir:number,kind:string,color:number}[]}
 */
export function trafficCars(state) {
  const tr = state.traffic;
  if (!tr) return [];
  const W = state.map.width;
  const side = getSetting(state, 'roadSide') === 'left' ? -1 : 1; // read once per call, not per car
  const out = [];
  for (const c of tr.cars) {
    const p = lanePose(W, c.path, c.i, c.t, state.map, side);
    // dir bit from the heading (nearest of N/E/S/W), kept for existing 4-dir sprites
    const ax = Math.cos(p.ang), ay = Math.sin(p.ang);
    const dir = Math.abs(ax) >= Math.abs(ay) ? (ax >= 0 ? 2 : 8) : (ay >= 0 ? 4 : 1);
    out.push({ id: c.id, fx: p.x, fy: p.y, ang: p.ang, dir, kind: c.kind, color: c.color });
  }
  return out;
}

/**
 * Per-town traffic report and congestion list for the UI.
 * @returns {{active:number,trips:number,failed:number,aborted:number,topCongested:{x:number,y:number,load:number,jam:number}[],perTown:object[]}}
 */
export function trafficStats(state) {
  const tr = state.traffic;
  const W = state.map.width;
  const top = [];
  for (let i = 0; i < tr.load.length; i++) if (tr.load[i] > 0 || tr.jam[i] > 0) top.push({ i, load: tr.load[i], jam: tr.jam[i] });
  top.sort((p, q) => q.jam - p.jam || q.load - p.load || p.i - q.i);
  const activeByTown = {};
  for (const c of tr.cars) activeByTown[c.townId] = (activeByTown[c.townId] || 0) + 1;
  const perTown = state.towns.map((t) => {
    const p = tr.perTown[t.id] || { trips: 0, failed: 0, aborted: 0 };
    return { townId: t.id, name: t.name, population: t.population, trips: p.trips, failed: p.failed, aborted: p.aborted, active: activeByTown[t.id] || 0 };
  });
  return {
    ...tr.stats,
    topCongested: top.slice(0, 10).map((e) => ({ x: e.i % W, y: Math.floor(e.i / W), load: e.load, jam: e.jam })),
    perTown,
  };
}

/**
 * EMA cars per tile at (x,y).
 * @returns {number}
 */
export function trafficLoad(state, x, y) {
  const tr = state.traffic;
  if (!tr || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return 0;
  return tr.load[tileIndex(state.map, x, y)] || 0;
}
