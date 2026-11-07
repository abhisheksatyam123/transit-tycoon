/**
 * Ground movement of aircraft at airports with the OpenTTD FTA (simplified port of aircraft_cmd.cpp
 * AircraftEventHandler_* / AirportMove and the block flags of airport.h, table/airport_movement.h).
 *
 * Positions are the footprint tiles of the airport (not OTTD's 1/16 tile coordinates). Taxi runs over
 * apron, terminal and runway tiles (BFS, 4-connected); the hangar is only a start tile; the tower is never
 * crossed. Blocks (OTTD AirportBlock Term / RunwayInOut): a plane may not step onto a runway or terminal tile
 * that another aircraft occupies (taxiing in its ground phase, or loading there). A blocked plane waits;
 * after FTA_WAIT_MAX ticks it goes anyway (avoids head-on deadlocks on a one-tile taxi).
 *
 * Ground phase of an aircraft: v.ftaGroundEnd = index in v.path where the ground part ends (lift-off on the
 * last runway tile for takeoff, the terminal tile for landing taxi). Lazy: absent unless the plane is taxiing.
 *  - takeoff: hangar/terminal -> taxi to the runway -> roll along the runway row -> airborne -> flight.
 *  - landing: approach -> touch down on the runway centre -> roll out -> taxi to a free terminal -> loading.
 * Helicopters and the types outside FTA_GROUND_TYPES keep the flight model of aircraft.js (no taxi).
 */
import { airportTypeId, isHelicopter } from './airportTypes.js';
import { airLine } from './aircraft.js';
import { airportBlockedByDisaster } from './disasters.js';

/** Airport types whose helicopters use the helipad ground phase (OTTD helipads: heliport, helidepot, helistation). */
export const HELI_PAD_TYPES = new Set(['heliport', 'helidepot', 'helistation']);

/** Airport types with the ported ground movement. */
export const FTA_GROUND_TYPES = new Set(['city', 'small', 'commuter', 'metropolitan', 'international']);
/** Layout part names (airportTypes.js): landing runway, departure runway (takeoff roll; metro/international), apron. */
export const RUNWAY_PART = 'runway';
export const DEPARTURE_PART = 'runwayDep';
/** Parts an aircraft taxies on (taxi graph). */
const TAXI_PARTS = new Set(['apron', 'terminal', 'runway', DEPARTURE_PART, 'helipad']);
/** Parts that are blocks: one aircraft at a time in the ground phase (runways, terminals, and the apron). */
const BLOCK_PARTS = new Set(['apron', 'terminal', 'runway', DEPARTURE_PART, 'helipad']);
/** Ticks a blocked plane waits before it moves anyway (deadlock guard). */
export const FTA_WAIT_MAX = 40;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** True for an airport tile building of an FTA type (city, small). */
export function isFtaGroundBuilding(b) {
  return !!b && b.type === 'station' && b.kind === 'airport' && FTA_GROUND_TYPES.has(airportTypeId(b));
}

/** True when aircraft v uses the ground FTA at tile building b. */
export function ftaGroundFor(v, b) {
  return v.kind === 'aircraft' && !isHelicopter(v) && isFtaGroundBuilding(b);
}

function buildingAt(state, x, y) {
  const { map } = state;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const b = map.tiles[y * map.width + x].building;
  return b && b.type === 'station' && b.kind === 'airport' ? b : null;
}

/** Tiles of station st whose airport part is `part` (in station order). */
export function ftaPartTiles(state, st, part) {
  const out = [];
  for (const t of st.tiles) {
    const b = buildingAt(state, t.x, t.y);
    if (b && b.stationId === st.id && b.part === part) out.push({ x: t.x, y: t.y });
  }
  return out;
}

/**
 * BFS over the taxiable airport tiles of station st from (sx,sy) to the nearest of `goals`.
 * The start tile may be any airport tile (hangar, terminal, runway).
 * @returns {{x,y}[]|null} path including both ends
 */
export function taxiPath(state, st, sx, sy, goals, avoid = null) {
  const goalSet = new Set(goals.map((g) => `${g.x},${g.y}`));
  if (!goalSet.size) return null;
  if (goalSet.has(`${sx},${sy}`)) return [{ x: sx, y: sy }];
  const prev = new Map([[`${sx},${sy}`, null]]);
  const queue = [{ x: sx, y: sy }];
  let found = null;
  for (let qi = 0; qi < queue.length && !found; qi++) {
    const c = queue[qi];
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy, key = `${x},${y}`;
      if (prev.has(key)) continue;
      const b = buildingAt(state, x, y);
      if (!b || b.stationId !== st.id || !TAXI_PARTS.has(b.part)) continue;
      if (avoid && !goalSet.has(key) && avoid(x, y)) continue; // a parked plane is never driven over
      prev.set(key, c);
      if (goalSet.has(key)) { found = { x, y }; break; }
      queue.push({ x, y });
    }
  }
  if (!found) return null;
  const out = [];
  for (let c = found; c; c = prev.get(`${c.x},${c.y}`)) out.push({ x: c.x, y: c.y });
  return out.reverse();
}

/** True when another aircraft is on tile (x,y) in its ground phase or loading there (block taken). */
export function ftaTileOccupied(state, v, x, y) {
  for (const o of state.vehicles) {
    if (o === v || o.kind !== 'aircraft' || o.tx !== x || o.ty !== y) continue;
    if (o.state === 'loading' || (o.ftaGroundEnd != null && o.pathIndex <= o.ftaGroundEnd)) return true;
  }
  return false;
}

/** True when another aircraft is loading on tile (x,y): a parked plane, never crossed by a taxiing plane. */
export function ftaParked(state, v, x, y) {
  return state.vehicles.some((o) => o !== v && o.kind === 'aircraft' && o.state === 'loading' && o.tx === x && o.ty === y);
}

/** True when tile (x,y) is taken or promised to another aircraft: it is parked there, taxiing on it, or its
 * ground path ends there (a terminal already chosen by a landing plane). */
export function ftaClaimed(state, v, x, y) {
  if (ftaTileOccupied(state, v, x, y)) return true;
  return state.vehicles.some((o) => o !== v && o.kind === 'aircraft' && o.ftaGroundEnd != null && o.path[o.ftaGroundEnd]
    && o.path[o.ftaGroundEnd].x === x && o.path[o.ftaGroundEnd].y === y);
}

/** True while a runway tile of st is taken by a ground aircraft (landing needs the runway clear). */
export function ftaRunwayBusy(state, st, v) {
  if (st && st.airportClosed) return true; // closed airport (OTTD AirportClosed): runway counts as busy, landings hold
  if (airportBlockedByDisaster(state, st)) return true; // crashed zeppelin on the runway (OTTD AirportBlock::RunwayIn)
  const R = new Set(ftaPartTiles(state, st, RUNWAY_PART).map((t) => `${t.x},${t.y}`));
  if (!R.size) return false;
  for (const o of state.vehicles) {
    if (o === v || o.kind !== 'aircraft' || o.ftaGroundEnd == null || o.pathIndex > o.ftaGroundEnd) continue;
    if (R.has(`${o.tx},${o.ty}`)) return true;
  }
  return false;
}

/** Runway tiles an aircraft takes off from: the departure runway when the layout has one, else the runway. */
export function takeoffRunwayTiles(state, st) {
  const dep = ftaPartTiles(state, st, DEPARTURE_PART);
  return dep.length ? dep : ftaPartTiles(state, st, RUNWAY_PART);
}

/**
 * Takeoff ground path from (fx,fy): taxi to the runway, roll along the runway row to its far end, lift off,
 * then fly to the nearest goal. Null when the airport has no runway or no taxi route.
 * @returns {{path:{x,y}[], groundEnd:number}|null}
 */
export function takeoffPath(state, st, fx, fy, goals, avoid = null) {
  const runway = takeoffRunwayTiles(state, st);
  if (!runway.length || !goals.length) return null;
  const taxi = taxiPath(state, st, fx, fy, runway, avoid);
  if (!taxi) return null;
  const entry = taxi[taxi.length - 1];
  const R = new Set(runway.map((t) => `${t.x},${t.y}`));
  let best = null;
  for (const [dx, dy] of DIRS) {
    let n = 0;
    while (R.has(`${entry.x + dx * (n + 1)},${entry.y + dy * (n + 1)}`)) n++;
    if (n > 0 && (!best || n > best.n)) best = { dx, dy, n };
  }
  const roll = [];
  if (best) for (let k = 1; k <= best.n; k++) roll.push({ x: entry.x + best.dx * k, y: entry.y + best.dy * k });
  const ground = taxi.concat(roll);
  const groundEnd = ground.length - 1;
  const last = ground[groundEnd];
  let goal = goals[0];
  const d = (g) => Math.abs(g.x - last.x) + Math.abs(g.y - last.y);
  for (const g of goals) if (d(g) < d(goal)) goal = g;
  return { path: ground.concat(airLine(last.x, last.y, goal.x, goal.y).slice(1)), groundEnd };
}

/**
 * Takeoff route with OpenTTD's terminal stop (TERMGROUP): from the start tile taxi to a free terminal first, then
 * to the runway. Falls back to the direct route when no terminal is free or reachable.
 * @returns {{path:{x,y}[], groundEnd:number}|null}
 */
export function takeoffViaTerminal(state, st, fx, fy, goals, avoid = null, v = null) {
  const free = ftaPartTiles(state, st, 'terminal').filter((t) => !ftaClaimed(state, v, t.x, t.y));
  const hop = free.length ? taxiPath(state, st, fx, fy, free, avoid) : null;
  if (hop) {
    const e = hop[hop.length - 1];
    const rest = takeoffPath(state, st, e.x, e.y, goals, avoid);
    if (rest) return { path: hop.concat(rest.path.slice(1)), groundEnd: rest.groundEnd + hop.length - 1 };
  }
  return takeoffPath(state, st, fx, fy, goals, avoid);
}

/**
 * True when helicopter v uses the helipad ground phase at tile building b (a pad-type heliport, helidepot or
 * helistation). Helicopters at other airports keep the flight model (no pad block).
 */
export function ftaHeliFor(v, b) {
  return v.kind === 'aircraft' && isHelicopter(v) && !!b && b.type === 'station' && b.kind === 'airport'
    && HELI_PAD_TYPES.has(airportTypeId(b));
}

/**
 * Nearest helipad of station st that v may take now: not occupied, not promised to another helicopter.
 * @returns {{x,y}|null}
 */
export function heliFreePad(state, v, st) {
  let best = null, bd = Infinity;
  for (const p of ftaPartTiles(state, st, 'helipad')) {
    if (ftaClaimed(state, v, p.x, p.y)) continue;
    const d = Math.abs(p.x - v.tx) + Math.abs(p.y - v.ty);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Helicopter departure route from building b (a helipad, or the hangar of a helidepot/helistation), OpenTTD
 * helicopter TakeOff: from a hangar it taxis over the pads to a free one and lifts off there; from a pad it
 * lifts off at once. The ground phase ends on the lift-off pad (groundEnd); the flight to the nearest goal follows.
 * @returns {{path:{x,y}[], groundEnd:number}|null} null when no pad is free (the caller flies instead)
 */
export function heliDepartPath(state, st, v, b, goals, avoid = null) {
  if (!goals.length) return null;
  const nearest = (from) => goals.reduce((a, g) => (Math.abs(g.x - from.x) + Math.abs(g.y - from.y)
    < Math.abs(a.x - from.x) + Math.abs(a.y - from.y) ? g : a));
  if (b.part === 'helipad') {
    const goal = nearest(v);
    return { path: airLine(v.tx, v.ty, goal.x, goal.y), groundEnd: 0 };
  }
  const free = ftaPartTiles(state, st, 'helipad').filter((t) => !ftaClaimed(state, v, t.x, t.y));
  const taxi = free.length ? taxiPath(state, st, v.tx, v.ty, free, avoid) : null;
  if (!taxi) return null;
  const e = taxi[taxi.length - 1];
  const goal = nearest(e);
  return { path: taxi.concat(airLine(e.x, e.y, goal.x, goal.y).slice(1)), groundEnd: taxi.length - 1 };
}

/** True when helicopter v has a helipad of station st it can take now (not occupied, not promised). */
export function heliAnyFree(state, v, st) {
  if (st && st.airportClosed) return false; // closed airport: no landings (OTTD AirportClosed)
  return heliFreePad(state, v, st) !== null;
}

/** Lazy ground-phase fields cleared (ground path finished or flight planned). */
export function clearGround(v) {
  delete v.ftaGroundEnd;
  delete v.ftaWait;
}

/** Apply a ground path to aircraft v and mark it running. */
export function setGroundPath(v, p) {
  v.path = p.path;
  v.pathIndex = 0;
  v.progress = 0;
  v.ftaGroundEnd = p.groundEnd;
  v.state = 'running';
  v.lostSince = null;
}

/**
 * True when another ground-phase aircraft with a lower id is about to step onto (x,y) (its next path tile). Two
 * planes deciding in the same tick would otherwise both enter one apron tile; the lower id goes first.
 */
export function ftaNextClaimed(state, v, x, y) {
  for (const o of state.vehicles) {
    if (o === v || o.kind !== 'aircraft' || o.id >= v.id || o.ftaGroundEnd == null || o.pathIndex >= o.ftaGroundEnd) continue;
    const n = o.path[o.pathIndex + 1];
    if (n && n.x === x && n.y === y) return true;
  }
  return false;
}

/**
 * Whether v may step into its next path tile: blocked when that tile is a runway or terminal tile taken by
 * another aircraft (only while v is in its ground phase, and only for FTA_WAIT_MAX ticks in a row).
 */
export function ftaBlocked(state, v) {
  if (v.ftaGroundEnd == null || v.pathIndex >= v.ftaGroundEnd) return false;
  const next = v.path[v.pathIndex + 1];
  if (!next) return false;
  const b = buildingAt(state, next.x, next.y);
  if (!b || !BLOCK_PARTS.has(b.part)) return false;
  if (!ftaTileOccupied(state, v, next.x, next.y) && !ftaNextClaimed(state, v, next.x, next.y)) return false;
  if ((v.ftaWait || 0) >= FTA_WAIT_MAX) return false;
  return true;
}

/** True when a landing aircraft at st may come down now: runway clear and a terminal tile free. */
export function ftaCanLand(state, v, st) {
  if (!st) return false;
  if (ftaRunwayBusy(state, st, v)) return false;
  return ftaPartTiles(state, st, 'terminal').some((t) => !ftaClaimed(state, v, t.x, t.y));
}
