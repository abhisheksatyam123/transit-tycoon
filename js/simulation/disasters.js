/**
 * Disasters (OpenTTD disaster_vehicle.cpp): a zeppelin that crashes on an airport runway and blocks landings there
 * for a while, and a small UFO that hunts a road vehicle and destroys it. Setting `disasters` (default off).
 *
 * Off: nothing is created, no random number is drawn, and the daily hook returns at once (gameLoop checks
 * `state.disasters` before calling the per-tick step, so an idle world pays nothing per tick).
 * Lazy state: `state.disasterDelay` (days until the next roll, OTTD _disaster_delay) exists once the setting is on;
 * `state.disasters` ({zep?, ufo?}) exists only while a disaster is active and is deleted when both are gone.
 *
 * Simplifications (not in OpenTTD): at most one zeppelin and one UFO at a time; a zeppelin without a
 * small/city/larger airport is not created (OpenTTD crashes it on a random tile instead); tile positions are
 * floats in tile units; the UFO speed and the zeppelin speed are chosen here, not taken from the source.
 */
import { getSetting } from './settings.js';
import { notify } from './news.js';
import { createRng } from './rng.js';
import { getTile } from './map.js';
import { removeVehicle } from './planeCrash.js';
import { airportTypeId } from './airportTypes.js';
import { nearestTown } from './state.js';

/** OpenTTD DisasterCreation years [min, max) (disaster_vehicle.cpp _disasters table, lines 941-942). */
const ZEP_YEARS = [1930, 1955];
const UFO_YEARS = [1940, 1970];
/** OpenTTD big UFO era (disaster_vehicle.cpp _disasters line 944). */
const BIG_UFO_YEARS = [2000, 2100];
/** Big UFO: random tiles before homing in on a train (line 598: ++age < 6), breakdown radius 12 tiles (line 571). */
const BIG_UFO_WANDER = 6;
const BIG_UFO_RADIUS = 12;
/** Chosen here (OTTD: the Skyranger destroyer flies in from the west): ticks after landing until it shoots the UFO down. */
const BIG_UFO_DESTROY_TICKS = 400;
/** OpenTTD submarine eras (line 945-946): small 1940-1965, big 1975-2010. Submarine lives 8880 ticks (line 693). */
const SUB_SMALL_YEARS = [1940, 1965], SUB_BIG_YEARS = [1975, 2010];
const SUB_MAX_AGE = 8880, SUB_STEP = 0.125; // step chosen here; moves every second tick (line 695)
/** Airplane (refinery) and helicopter (factory) eras (lines 947-948). */
const BOMB_YEARS = [1960, 1990], HELI_YEARS = [1970, 2000];
/** Attack phase (OpenTTD DisasterTick_Aircraft): fire within 15 tiles, 112 ticks until the strike, 55 ticks of explosions. */
const ATTACK_RANGE = 15, ATTACK_STRIKE_TICKS = 112, ATTACK_EXPLODE_TICKS = 55;
const AIR_STEP = 0.25, HELI_STEP = 0.125; // tiles per tick (chosen here)
const ATTACK_TYPES = { bomber: new Set(['refinery']), heli: new Set(['factory', 'factory_tropic']) };
/** OpenTTD ResetDisasterDelay: 730 + GB(Random(), 0, 9) days (line 970). */
const DELAY_MIN = 730, DELAY_SPAN = 512;
/** Zeppelin: age limit in the blocking phase (line 277: ++age <= 13320) and the crash phase (lines 296-313). */
const ZEP_BLOCK_TICKS = 13320;
const ZEP_CRASH_END = 350;
/** Zeppelin flies every second tick (line 239-241: HasBit(tick_counter, 0) returns early). Speed: chosen here. */
const ZEP_STEP = 0.125; // tiles per moving tick
/** UFO: arrive at a random tile 6 times before picking a road vehicle (lines 342-346). */
const UFO_WANDER_STEPS = 6;
const UFO_SPEED = 0.0625; // tiles per tick (chosen here)
/** UFO crashes into its target within one tile (line 384), then the UFO is removed after 50 ticks (line 412). */
const UFO_CRASH_DIST = 1;
const UFO_DESTROY_AGE = 50;

function airportStationAt(state, x, y) {
  const t = getTile(state.map, Math.floor(x), Math.floor(y));
  const b = t && t.building;
  if (!b || b.type !== 'station' || b.kind !== 'airport' || b.stationId == null) return null;
  return b.stationId;
}

/** True while an airport's runway is blocked by a crashed zeppelin (OpenTTD AirportBlock::RunwayIn, line 273). */
export function airportBlockedByDisaster(state, st) {
  const z = state.disasters && state.disasters.zep;
  return !!(z && st && z.stationId === st.id && z.state >= 2);
}

/** Road vehicle position in tile units (front of the vehicle along its path). */
function roadPos(v) {
  const cur = v.path && v.path[v.pathIndex];
  const next = v.path && v.path[v.pathIndex + 1];
  if (!cur) return { x: v.tx, y: v.ty };
  if (!next) return { x: cur.x, y: cur.y };
  const p = v.progress || 0;
  return { x: cur.x + (next.x - cur.x) * p, y: cur.y + (next.y - cur.y) * p };
}

/** Daily roll (OpenTTD _economy_disaster_daily, line 974-981). Called from the day loop; no-op with the setting off. */
export function dailyDisasters(game) {
  const s = game.state;
  if (!getSetting(s, 'disasters')) return;
  if (s.disasterDelay == null) s.disasterDelay = DELAY_MIN + createRng(s, 'rngState').int(0, DELAY_SPAN - 1);
  if (--s.disasterDelay !== 0) return;
  const rng = createRng(s, 'rngState');
  s.disasterDelay = DELAY_MIN + rng.int(0, DELAY_SPAN - 1);
  const avail = disasterKindsForYear(s.date.year);
  if (!avail.length) return;
  const pick = avail[rng.int(0, avail.length - 1)];
  if (pick === 'zep') spawnZeppelin(game, rng);
  else if (pick === 'bigufo') spawnBigUfo(game, rng);
  else if (pick === 'bomber' || pick === 'heli') spawnAttacker(game, rng, pick);
  else if (pick === 'sub') spawnSub(game, rng);
  else spawnUfo(game, rng);
  const d = s.disasters;
  if (d && !hasAny(d)) delete s.disasters;
}

/** Disaster kinds whose OpenTTD era (_disasters table, lines 940-950) includes `year`, in table order. */
export function disasterKindsForYear(year) {
  const avail = [];
  const inEra = (r) => year >= r[0] && year < r[1];
  if (inEra(ZEP_YEARS)) avail.push('zep');
  if (inEra(UFO_YEARS)) avail.push('ufo');
  if (inEra(BOMB_YEARS)) avail.push('bomber');
  if (inEra(HELI_YEARS)) avail.push('heli');
  if (inEra(BIG_UFO_YEARS)) avail.push('bigufo');
  if (inEra(SUB_SMALL_YEARS)) avail.push('sub');
  if (inEra(SUB_BIG_YEARS)) avail.push('sub');
  return avail;
}

const DISASTER_KEYS = ['zep', 'ufo', 'bigUfo', 'bomber', 'heli', 'sub'];
function hasAny(d) { return DISASTER_KEYS.some((k) => d[k]); }

/** Pick a random industry of the given attack types (OpenTTD Disaster_Airplane/Helicopter_Init: random candidate). */
function attackTarget(state, rng, kind) {
  const cands = (state.industries || []).filter((i) => ATTACK_TYPES[kind].has(i.typeId));
  return cands.length ? cands[rng.int(0, cands.length - 1)] : null;
}

/** Plane (refinery) or helicopter (factory) init (OpenTTD Disaster_Airplane_Init line 793, Helicopter_Init line 819). */
function spawnAttacker(game, rng, kind) {
  const s = game.state;
  const d = s.disasters || (s.disasters = {});
  if (d[kind]) return;
  const ind = attackTarget(s, rng, kind);
  if (!ind) return;
  const cx = ind.x + ind.w / 2, cy = ind.y + ind.h / 2;
  // bomber enters from the east edge; helicopter from the west (lines 797-799, 823)
  const x = kind === 'bomber' ? s.map.width + 9 : -16;
  d[kind] = { kind, indId: ind.id, x, y: cy, dest: { x: cx, y: cy }, state: 0, age: 0, prev: null, name: ind.name };
}

/** Submarine init (OpenTTD Disaster_Submarine_Init, lines 867-888): a water tile on the top or bottom edge. */
function spawnSub(game, rng) {
  const s = game.state;
  const d = s.disasters || (s.disasters = {});
  if (d.sub) return;
  const W = s.map.width, H = s.map.height;
  const x = rng.int(0, W - 1);
  const down = rng.int(0, 1) === 0;
  const y = down ? 0 : H - 1;
  const t = getTile(s.map, x, y);
  if (!t || t.terrain !== 'water') return; // OTTD: no submarine if the edge tile is not water (line 882)
  d.sub = { x, y, dx: 0, dy: down ? 1 : -1, age: 0, tick: 0, big: false };
  notify({ state: s }, 'Submarine sighted offshore', 'info', x, y, 'general');
}

/** Airport types a zeppelin targets (OpenTTD AT_SMALL / AT_LARGE; TT's small and city-sized airports). */
const ZEP_TYPES = new Set(['small', 'city', 'metropolitan', 'international']);

/** Zeppelin init (OpenTTD Disaster_Zeppeliner_Init, lines 753-766): the first airport station of a target type. */
function spawnZeppelin(game, rng) {
  const s = game.state;
  const d = s.disasters || (s.disasters = {});
  if (d.zep) return;
  let st = null;
  for (const x of s.stations || []) {
    if (!(x.tiles || []).some((t) => t.kind === 'airport')) continue;
    const b = airportBuildingOf(s, x);
    if (b && ZEP_TYPES.has(airportTypeId(b))) { st = x; break; }
  }
  if (!st) { if (!Object.keys(d).length) delete s.disasters; return; } // no airport: nothing to crash (TT has no random-tile fallback)
  const t0 = st.tiles.find((t) => t.kind === 'airport');
  // OpenTTD spawns it at the north edge flying SE over the airport (lines 762-765); here it starts 8 tiles up-left
  // of the first airport tile so its diagonal flight crosses that tile (ZEP_STEP moves x and y alike)
  d.zep = { stationId: st.id, x: t0.x - 8, y: t0.y - 8, state: 0, age: 0, tick: 0, name: st.name };
}

function airportBuildingOf(state, st) {
  for (const t of st.tiles || []) {
    const tile = getTile(state.map, t.x, t.y);
    if (tile && tile.building && tile.building.type === 'station' && tile.building.kind === 'airport') return tile.building;
  }
  return null;
}

/** Small UFO init (OpenTTD Disaster_Small_Ufo_Init, lines 778-786): random start, flies to the map centre. */
function spawnUfo(game, rng) {
  const s = game.state;
  const d = s.disasters || (s.disasters = {});
  if (d.ufo) return;
  const W = s.map.width, H = s.map.height;
  d.ufo = { x: rng.int(0, W - 1), y: rng.int(0, H - 1), dest: { x: W >> 1, y: H >> 1 }, state: 0, age: 0, targetId: null, alt: 1 };
}

/** Big UFO init (OpenTTD Disaster_Big_Ufo_Init, lines 847-860): from the north edge, first flies to the map centre. */
function spawnBigUfo(game, rng) {
  const s = game.state;
  const d = s.disasters || (s.disasters = {});
  if (d.bigUfo) return;
  const W = s.map.width, H = s.map.height;
  d.bigUfo = { x: rng.int(0, W - 1), y: H - 1, dest: { x: W >> 1, y: H >> 1 }, state: 0, age: 0, targetId: null };
}

/**
 * Big UFO per-tick (OpenTTD DisasterTick_Big_Ufo, lines 540-640). States: 0 wander, then home in on a player train
 * (lines 598-630); 1 landing on it; 2 landed: trains within 12 tiles break down every tick (lines 571-572) until the
 * destroyer shoots it down. Track under the UFO is blocked only through these breakdowns (simplification).
 */
function tickBigUfo(ctx, u, d) {
  const { state } = ctx;
  if (u.state === 0) {
    const dx = u.dest.x - u.x, dy = u.dest.y - u.y;
    if (Math.abs(dx) + Math.abs(dy) >= UFO_CRASH_DIST) {
      const L = Math.hypot(dx, dy) || 1;
      u.x += (dx / L) * UFO_SPEED; u.y += (dy / L) * UFO_SPEED;
      return;
    }
    if (++u.age < BIG_UFO_WANDER) {
      const rng = createRng(state, 'rngState');
      u.dest = { x: rng.int(0, state.map.width - 1), y: rng.int(0, state.map.height - 1) };
      return;
    }
    const rng = createRng(state, 'rngState');
    const trains = (state.vehicles || []).filter((v) => v.kind === 'train' && v.ownerId == null && v.state !== 'depot');
    if (!trains.length) { d.bigUfo = null; return; } // no targetable train: the UFO leaves (line 615-619)
    const target = trains[rng.int(0, trains.length - 1)];
    u.targetId = target.id; u.state = 1; u.age = 0;
    return;
  }
  if (u.state === 1) {
    const target = (state.vehicles || []).find((v) => v.id === u.targetId);
    const p = target ? roadPos(target) : { x: u.x, y: u.y };
    const dist = Math.abs(u.x - p.x) + Math.abs(u.y - p.y);
    if (dist >= UFO_CRASH_DIST) {
      const L = Math.hypot(p.x - u.x, p.y - u.y) || 1;
      u.x += ((p.x - u.x) / L) * UFO_SPEED; u.y += ((p.y - u.y) / L) * UFO_SPEED;
      return;
    }
    // landed on the rail (line 540-575): the train under it is destroyed, the rest in radius break down
    u.state = 2; u.age = 0; u.lx = p.x; u.ly = p.y;
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (target && state.vehicles.includes(target)) {
      notify(ctx, `Train destroyed in 'UFO' landing!`, 'bad', tx, ty, 'accident');
      removeVehicle(state, target);
    }
    notify(ctx, `'UFO' lands near ${nearTownName(state, tx, ty)}!`, 'bad', tx, ty, 'accident');
    if (ctx.emit) ctx.emit('disaster', { kind: 'bigufo', x: tx, y: ty });
    return;
  }
  // state 2: landed; trains within 12 tiles stay broken down, then the destroyer shoots the UFO down (lines 642-687)
  breakTrainsNear(state, u.lx, u.ly);
  if (++u.age < BIG_UFO_DESTROY_TICKS) return;
  notify(ctx, `'UFO' shot down near ${nearTownName(state, Math.floor(u.lx), Math.floor(u.ly))}`, 'good', Math.floor(u.lx), Math.floor(u.ly), 'accident');
  d.bigUfo = null;
}

function breakTrainsNear(state, x, y) {
  for (const v of state.vehicles || []) {
    if (v.kind !== 'train') continue;
    const p = roadPos(v);
    if (Math.abs(p.x - x) + Math.abs(p.y - y) <= BIG_UFO_RADIUS) { v.breakdownTicks = Math.max(v.breakdownTicks || 0, 5); v.state = 'broken'; v.breakdownFrozen = true; v.speed = 0; }
  }
}

function nearTownName(state, x, y) {
  const t = nearestTown(state, x, y);
  return t ? t.name : 'the map';
}

/** Set a target's production to 0 (OpenTTD DestructIndustry; here a closure held while the attacker is active). */
function closeIndustry(ind, a) {
  if (a.prev == null) a.prev = ind.productionRate == null ? 255 : ind.productionRate;
  ind.productionRate = 0;
}
function reopenIndustry(state, a) {
  const ind = (state.industries || []).find((i) => i.id === a.indId);
  if (ind && a.prev != null) ind.productionRate = a.prev;
  a.prev = null;
}

/**
 * Bomber / helicopter per-tick (OpenTTD DisasterTick_Aircraft, lines 447-506). 0 fly to the target; 1 within 15 tiles
 * and hovering; 2 after 112 ticks the strike closes the industry (DestructIndustry), 55 ticks of explosions; 3 fly out
 * and leave. Simplification: the closure is lifted when the aircraft leaves (OTTD destroys the building for good).
 */
function tickAttacker(ctx, a, d, key) {
  const { state } = ctx;
  const ind = (state.industries || []).find((i) => i.id === a.indId);
  if (!ind && a.state < 2) { d[key] = null; return; } // target gone before the strike: it leaves
  const step = key === 'bomber' ? AIR_STEP : HELI_STEP;
  if (a.state === 0) {
    const dx = a.dest.x - a.x, dy = a.dest.y - a.y, L = Math.hypot(dx, dy) || 1;
    if (L <= ATTACK_RANGE) { a.state = 1; a.age = 0; return; }
    a.x += (dx / L) * step; a.y += (dy / L) * step;
    return;
  }
  if (a.state === 1) {
    if (++a.age < ATTACK_STRIKE_TICKS) return;
    a.state = 2; a.age = 0;
    closeIndustry(ind, a);
    const tx = Math.floor(a.dest.x), ty = Math.floor(a.dest.y);
    const town = nearTownName(state, tx, ty);
    const text = key === 'bomber' ? `Oil refinery explosion near ${town}!` : `Factory destroyed in suspicious circumstances near ${town}!`;
    notify(ctx, text, 'bad', tx, ty, 'accident');
    if (ctx.emit) ctx.emit('disaster', { kind: key, x: tx, y: ty });
    return;
  }
  if (a.state === 2) {
    if (++a.age < ATTACK_EXPLODE_TICKS) return;
    a.state = 3; a.age = 0;
    reopenIndustry(state, a);
    return;
  }
  // state 3: leave by the side it came from
  a.x += key === 'bomber' ? step : -step;
  if (a.x > state.map.width + 9 || a.x < -16) { reopenIndustry(state, a); d[key] = null; }
}

/** Submarine per-tick (OpenTTD DisasterTick_Submarine, lines 689-715): cosmetic; drifts through water, turns at land. */
function tickSub(ctx, sub, d) {
  const { state } = ctx;
  sub.tick++;
  if (++sub.age > SUB_MAX_AGE) { d.sub = null; return; }
  if ((sub.tick & 1) === 0) return; // HasBit(tick_counter, 0)
  const nx = sub.x + sub.dx * SUB_STEP, ny = sub.y + sub.dy * SUB_STEP;
  const t = getTile(state.map, Math.floor(nx), Math.floor(ny));
  const rng = createRng(state, 'rngState');
  if (t && t.terrain === 'water' && rng.next() >= 1 / 90) { sub.x = nx; sub.y = ny; return; }
  // turn 90 degrees left or right (OTTD: random turn; line 713)
  const left = rng.int(0, 1) === 0;
  const dx = sub.dx, dy = sub.dy;
  sub.dx = left ? -dy : dy; sub.dy = left ? dx : -dx;
}

/** Zeppelin per-tick (OpenTTD DisasterTick_Zeppeliner, lines 235-320). */
function tickZeppelin(ctx, z, d) {
  const { state } = ctx;
  z.tick++;
  if (z.state < 2) {
    if ((z.tick & 1) === 0) return; // HasBit(tick_counter, 0): moves on alternate ticks (line 241)
    // fly SE (direction SE, one tile diagonal per move); reach the first airport tile, then crash (line 252-258)
    z.x += ZEP_STEP; z.y += ZEP_STEP;
    if (z.state === 0) {
      const sid = airportStationAt(state, z.x, z.y);
      if (sid != null) {
        z.state = 1; z.age = 0;
        z.stationId = sid; z.fx = z.x; z.fy = z.y;
        const st = (state.stations || []).find((q) => q.id === sid);
        notify(ctx, `Zeppelin disaster at ${st ? st.name : 'the airport'}!`, 'bad', Math.floor(z.x), Math.floor(z.y), 'accident');
        if (ctx.emit) ctx.emit('disaster', { kind: 'zeppelin', x: Math.floor(z.x), y: Math.floor(z.y) });
      } else if (z.x > state.map.width + 9 || z.y > state.map.height + 9) { d.zep = null; return; } // off the map (line 264)
      return;
    }
    // state 1: smoke for 38 moving steps, then the blocking phase (lines 246-252)
    if (++z.age === 38) { z.state = 2; z.age = 0; }
    return;
  }
  // state 2: crash on the runway (blocks landings from here on, line 273); state 3: cleared later (lines 277-290)
  if (z.state === 2) {
    if (++z.age === ZEP_CRASH_END) { z.state = 3; z.age = 0; }
    return;
  }
  if (++z.age <= ZEP_BLOCK_TICKS) return;
  if (ctx.emit) ctx.emit('disasterCleared', { kind: 'zeppelin', stationId: z.stationId });
  d.zep = null;
}

/** Small UFO per-tick (OpenTTD DisasterTick_Ufo, lines 328-420). */
function tickUfo(ctx, u, d) {
  const { state } = ctx;
  if (u.state === 0) {
    const dx = u.dest.x - u.x, dy = u.dest.y - u.y;
    if (Math.abs(dx) + Math.abs(dy) >= UFO_CRASH_DIST) { // fly toward the destination (lines 332-337)
      const L = Math.hypot(dx, dy) || 1;
      u.x += (dx / L) * UFO_SPEED; u.y += (dy / L) * UFO_SPEED;
      return;
    }
    if (++u.age < UFO_WANDER_STEPS) { // line 342: pick a random tile and keep flying
      const rng = createRng(state, 'rngState');
      u.dest = { x: rng.int(0, state.map.width - 1), y: rng.int(0, state.map.height - 1) };
      return;
    }
    u.state = 1; // line 346: hunt a road vehicle
    const rng = createRng(state, 'rngState');
    const roads = (state.vehicles || []).filter((v) => v.kind === 'road' && v.roadType !== 'tram' && v.state !== 'depot');
    if (!roads.length) { d.ufo = null; return; } // no target: the UFO leaves (line 352-355)
    const target = roads[rng.int(0, roads.length - 1)];
    u.targetId = target.id; u.age = 0;
    return;
  }
  // state 1: home in on the target (lines 368-420)
  const target = (state.vehicles || []).find((v) => v.id === u.targetId);
  if (!target) { d.ufo = null; return; }
  const p = roadPos(target);
  const dist = Math.abs(u.x - p.x) + Math.abs(u.y - p.y);
  if (dist >= UFO_CRASH_DIST) {
    const L = Math.hypot(p.x - u.x, p.y - u.y) || 1;
    u.x += ((p.x - u.x) / L) * UFO_SPEED; u.y += ((p.y - u.y) / L) * UFO_SPEED;
    return;
  }
  // within a tile: descend onto the vehicle (line 398-400), then it is destroyed (line 399-409)
  u.alt = Math.max(0, u.alt - 0.25);
  if (u.alt > 0) return;
  const victims = target.load && target.cargoId === 'PASS' ? target.load.amount || 0 : 0;
  notify(ctx, `Road vehicle destroyed in 'UFO' collision!`, 'bad', Math.floor(p.x), Math.floor(p.y), 'accident');
  removeVehicle(state, target);
  if (ctx.emit) ctx.emit('disaster', { kind: 'ufo', x: Math.floor(p.x), y: Math.floor(p.y), victims });
  u.age++;
  if (u.age > UFO_DESTROY_AGE) d.ufo = null; // OpenTTD line 412
}

/**
 * Per-tick step; only called when `state.disasters` exists (gameLoop checks it), so it costs nothing when idle.
 * @param {{state:object, emit?:Function}} ctx
 */
export function tickDisasters(ctx) {
  const { state } = ctx;
  const d = state.disasters;
  if (!d) return;
  if (!getSetting(state, 'disasters')) { // switched off mid-disaster: remove the vehicles
    if (d.bomber) reopenIndustry(state, d.bomber);
    if (d.heli) reopenIndustry(state, d.heli);
    delete state.disasters;
    return;
  }
  if (d.zep) tickZeppelin(ctx, d.zep, d);
  if (d.ufo) tickUfo(ctx, d.ufo, d);
  if (d.bigUfo) tickBigUfo(ctx, d.bigUfo, d);
  if (d.bomber) tickAttacker(ctx, d.bomber, d, 'bomber');
  if (d.heli) tickAttacker(ctx, d.heli, d, 'heli');
  if (d.sub) tickSub(ctx, d.sub, d);
  if (!hasAny(d)) delete state.disasters;
}
