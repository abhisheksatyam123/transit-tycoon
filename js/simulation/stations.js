/**
 * Stations: creation/merge, catchment, coverage index, acceptance and ratings.
 */
import { CATCHMENT, ACCEPT_THRESHOLD, TICKS_PER_DAY, DIRS } from './constants.js';
import { tileRadius } from '../config/stationTypes.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { allocId, findStation } from './state.js';
import { stationName } from './naming.js';
import { advertBonus } from './townAuthority.js';
import { getSetting } from './settings.js';
import { isToyland } from './climate.js';
import { inBounds } from './map.js';
import { airportType, airportTypeId } from './airportTypes.js';

/**
 * Create a new station record (not yet having tiles).
 */
export function createStation(state, x, y) {
  const st = {
    id: allocId(state), name: stationName(state, x, y), x, y,
    kinds: { rail: false, bus: false, truck: false }, tiles: [],
    cargo: {}, rating: {}, lastPickup: {}, accepts: {},
    lastSpeed: 0, arrived: { train: false, road: false },
  };
  state.stations.push(st);
  return st;
}

/**
 * Find an existing station owning a tile 4-adjacent to any of the given tiles.
 * @returns {object|null} station
 */
export function adjacentStation(state, tiles) {
  const { map } = state;
  for (const p of tiles) {
    for (const d of DIRS) {
      const nx = p.x + d.dx, ny = p.y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const b = map.tiles[ny * map.width + nx].building;
      if (b && b.type === 'station') return findStation(state, b.stationId);
    }
  }
  return null;
}

/** Recompute station.kinds from its tiles. */
export function refreshKinds(st) {
  st.kinds = { rail: false, bus: false, truck: false };
  for (const t of st.tiles) st.kinds[t.kind] = true;
}

/**
 * Catchment radius of one station tile (the radius the catchment code uses).
 * Airport tiles take the radius of their airport type (city 6, small/heliport 4); rail/bus/truck use the
 * kind base plus style bonus; anything else falls back to CATCHMENT or 3.
 * @returns {number}
 */
export function catchRadius(state, t) {
  const r = t.radius ?? tileRadius(t);
  if (r !== undefined) return r;
  if (t.kind === 'airport') {
    const map = state && state.map;
    const b = map && map.tiles[t.y * map.width + t.x] ? map.tiles[t.y * map.width + t.x].building : null;
    return airportType(airportTypeId(b)).catchment;
  }
  return CATCHMENT[t.kind] ?? 3;
}

/**
 * Catchment tiles of a station (deduplicated, in scan order).
 * @returns {{x:number,y:number}[]}
 */
export function catchmentTiles(state, st) {
  const { map } = state;
  if (!st || st.tiles.length === 0) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of st.tiles) {
    const r = catchRadius(state, t);
    x0 = Math.min(x0, t.x - r); y0 = Math.min(y0, t.y - r);
    x1 = Math.max(x1, t.x + r); y1 = Math.max(y1, t.y + r);
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(map.width - 1, x1); y1 = Math.min(map.height - 1, y1);
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const t of st.tiles) {
        const r = catchRadius(state, t);
        if (Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r) { out.push({ x, y }); break; }
      }
    }
  }
  return out;
}

/**
 * Build the coverage index: tile index -> station ids whose catchment covers it.
 * @returns {Map<number, number[]>}
 */
export function buildCoverage(state) {
  const cov = new Map();
  const w = state.map.width;
  for (const st of state.stations) {
    for (const p of catchmentTiles(state, st)) {
      const i = p.y * w + p.x;
      let arr = cov.get(i);
      if (!arr) { arr = []; cov.set(i, arr); }
      arr.push(st.id);
    }
  }
  return cov;
}

/**
 * Acceptance per cargo (in eighths) of one tile.
 * @returns {{[cargoId:string]:number}}
 */
export function tileAcceptance(state, x, y) {
  const t = state.map.tiles[y * state.map.width + x];
  const b = t.building;
  if (!b) return {};
  if (b.type === 'house') {
    const a = { PASS: b.level + 3, MAIL: b.level + 1 };
    if (b.level >= 2) a.GOOD = b.level * 2;
    // T-IN: towns of level 2+ also take food and building materials when extraIndustries is on
    if (b.level >= 2 && getSetting(state, 'extraIndustries')) { a.FOOD = b.level * 2; a.BMAT = b.level * 2; }
    // TY2: toyland towns accept sweets, toys and fizzy drinks (OpenTTD town acceptance in toyland)
    if (b.level >= 2 && isToyland(state)) { a.SWEETS = b.level * 2; a.TOYS = b.level * 2; a.FIZZY_DRINKS = b.level * 2; }
    return a;
  }
  if (b.type === 'industry') {
    const ind = state.industries.find((i) => i.id === b.industryId);
    const type = ind && INDUSTRY_BY_ID[ind.typeId];
    if (!type) return {};
    return Object.fromEntries(type.accepts.map((c) => [c, 8]));
  }
  return {};
}

/**
 * Recompute which cargos a station accepts from its catchment.
 */
export function recomputeAcceptance(state, st) {
  const sum = {};
  for (const p of catchmentTiles(state, st)) {
    for (const [c, v] of Object.entries(tileAcceptance(state, p.x, p.y))) sum[c] = (sum[c] || 0) + v;
  }
  st.accepts = {};
  for (const [c, v] of Object.entries(sum)) if (v >= ACCEPT_THRESHOLD) st.accepts[c] = true;
  return st.accepts;
}

/** Recompute acceptance for all stations. */
export function recomputeAllAcceptance(state) {
  for (const st of state.stations) recomputeAcceptance(state, st);
}

/** Total waiting amount of a cargo at a station. */
export function waitingAmount(st, cargoId) {
  const list = st.cargo[cargoId];
  if (!list) return 0;
  let s = 0;
  for (const p of list) s += p.amount;
  return s;
}

/**
 * Add waiting cargo to a station (merges with last packet of same source).
 * `feeder` (optional, lazy): OpenTTD feeder share carried by the units, stored on the packet only when non-zero.
 */
/** Max parcels (packets) per station cargo list; overflow merges into the newest packet. */
export const MAX_PARCELS = 32;

export function addWaiting(st, cargoId, amount, sourceX, sourceY, tick, cap, feeder = 0, dest = null, via = undefined, xfer = false) {
  if (amount <= 0) return 0;
  const list = st.cargo[cargoId] || (st.cargo[cargoId] = []);
  const have = waitingAmount(st, cargoId);
  const add = Math.max(0, Math.min(amount, cap - have));
  if (add <= 0) return 0;
  const fs = feeder > 0 ? Math.round((feeder * add) / amount) : 0;
  // OpenTTD CargoList: units from the same source (and destination, cargodist) merge into one packet (weighted
  // age) instead of piling up; the list is also capped at MAX_PARCELS by folding overflow into the newest packet.
  const want = dest == null ? null : dest;
  const wantVia = via === undefined ? null : via;
  let hit = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.sourceX === sourceX && p.sourceY === sourceY && (p.dest ?? null) === want && (p.via ?? null) === wantVia && (p.xfer === true) === xfer) { hit = p; break; }
  }
  if (!hit && list.length >= MAX_PARCELS) {
    // overflow: prefer the newest packet with the same destination, else the newest packet
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].dest ?? null) === want) { hit = list[i]; break; }
    if (!hit) hit = list[list.length - 1];
  }
  if (hit) {
    hit.sinceTick = Math.round((hit.sinceTick * hit.amount + tick * add) / (hit.amount + add));
    hit.amount += add;
    if (fs) hit.feeder = (hit.feeder || 0) + fs;
  } else {
    const p = { amount: add, sourceX, sourceY, sinceTick: tick };
    if (xfer) p.xfer = true; // lazy: cargo transferred from another station (keeps its age while waiting)
    if (fs) p.feeder = fs;
    if (want !== null) p.dest = want;
    if (wantVia !== null) p.via = wantVia; // cargodist: the flow via this parcel is routed by (OpenTTD FlowStat)
    list.push(p);
  }
  return add;
}

/**
 * Take up to `amount` of a cargo from a station (oldest first).
 * `pred` (cargodist): only parcels for which pred(parcel) is true are taken; others stay in the list.
 * `feeder` is the feeder share of the units taken (present only when non-zero).
 * `dests` (present only when some taken parcel has a destination) maps 'u' (no destination) or the
 * destination station id to the amount taken.
 * @returns {{amount:number,sourceX:number,sourceY:number,sinceTick:number,feeder?:number,dests?:object}}
 */
export function takeWaiting(st, cargoId, amount, pred, tick) {
  const list = st.cargo[cargoId] || [];
  let taken = 0, sx = 0, sy = 0, since = 0, feeder = 0, anyDest = false;
  const dests = {};
  for (let i = 0; taken < amount && i < list.length;) {
    const p = list[i];
    if (pred && !pred(p)) { i++; continue; }
    const n = Math.min(p.amount, amount - taken);
    sx += p.sourceX * n; sy += p.sourceY * n;
    // produced here (no xfer flag): age 0 at pickup, OpenLoco Station.cpp enrouteAge stays 0 at the origin station
    since += (tick !== undefined && !p.xfer ? tick : p.sinceTick) * n;
    if (p.feeder) {
      const fs = p.amount === n ? p.feeder : Math.round((p.feeder * n) / p.amount);
      feeder += fs;
      p.feeder -= fs;
      if (!p.feeder) delete p.feeder;
    }
    const dk = p.dest == null ? 'u' : String(p.dest);
    if (p.dest != null) anyDest = true;
    dests[dk] = (dests[dk] || 0) + n;
    taken += n;
    p.amount -= n;
    if (p.amount <= 0) list.splice(i, 1);
    else i++;
  }
  if (taken === 0) return { amount: 0, sourceX: st.x, sourceY: st.y, sinceTick: 0 };
  const out = { amount: taken, sourceX: Math.round(sx / taken), sourceY: Math.round(sy / taken), sinceTick: Math.round(since / taken) };
  if (feeder) out.feeder = feeder;
  if (anyDest) out.dests = dests;
  return out;
}

/**
 * Daily rating update for every cargo that has been picked up at the station.
 */
export function updateRatings(state, st) {
  for (const cargoId of Object.keys(st.lastPickup)) {
    const days = (state.tick - st.lastPickup[cargoId]) / TICKS_PER_DAY;
    const waiting = waitingAmount(st, cargoId);
    let target = 20;
    target += days <= 7 ? 40 : days <= 14 ? 30 : days <= 21 ? 20 : days <= 30 ? 10 : 0;
    target += waiting <= 100 ? 25 : waiting <= 300 ? 15 : waiting <= 600 ? 5 : waiting <= 1000 ? 0 : -15;
    target += Math.min(20, Math.max(0, (st.lastSpeed - 40) / 4));
    target += advertBonus(state, st); // town advertising campaign (townAuthority.js), expires by date
    target = Math.max(0, Math.min(100, target));
    const cur = st.rating[cargoId] ?? 69;
    const delta = Math.max(-2, Math.min(2, target - cur));
    st.rating[cargoId] = Math.round(cur + delta);
    // poorly rated stations slowly lose waiting cargo
    if (st.rating[cargoId] < 40 && waiting > 200) takeWaiting(st, cargoId, Math.ceil(waiting * 0.05));
  }
}

/**
 * Mark that a vehicle tried to load cargo at the station (enables production delivery).
 */
export function markPickup(state, st, cargoId, speedKmh) {
  if (st.lastPickup[cargoId] === undefined && st.rating[cargoId] === undefined) st.rating[cargoId] = 75; // OpenLoco initial rating 150/200
  st.lastPickup[cargoId] = state.tick;
  if (speedKmh) st.lastSpeed = speedKmh;
}

/**
 * OpenLoco VehicleHead.cpp:3466-3478: after a real pickup of cargo at the station, the per-cargo carrier stats
 * (StationCargoStats.vehicleSpeed / vehicleAge) become the average of the previous carrier and this one:
 * first pickup sets them, later pickups use (old + new) >> 1. Speed is km/h (vehicle model max speed),
 * age in 256-day units ((day - creationDay) / 256, clamped to 255). Lazy field: st.carrier[cargoId].
 */
export function recordCarrier(st, cargoId, speedKmh, ageDays) {
  const newSpeed = speedKmh | 0;
  const newAge = Math.min(255, Math.floor((ageDays || 0) / 256));
  st.carrier = st.carrier || {};
  const c = st.carrier[cargoId];
  if (c) {
    c.speed = Math.floor((c.speed + newSpeed) / 2);
    c.age = Math.floor((c.age + newAge) / 2);
  } else {
    st.carrier[cargoId] = { speed: newSpeed, age: newAge };
  }
}

/** Tiles of the station of the given kind. */
export function stationTilesOfKind(st, kind) {
  return st.tiles.filter((t) => t.kind === kind);
}

/** Max bounding-box side (tiles) of one station (OpenTTD station_spread default). */
export const STATION_SPREAD = 12;

/**
 * True when the bounding box of a station's tiles plus `extra` fits in `limit` (default STATION_SPREAD; player builds pass the stationSpread setting).
 * @param {{tiles:{x:number,y:number}[]}} st station record (may be null: only `extra`)
 * @param {{x:number,y:number}[]} extra tiles about to be added
 */
export function spreadOk(st, extra, limit = STATION_SPREAD) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const all = [...(st ? st.tiles : []), ...extra];
  for (const p of all) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return x1 - x0 + 1 <= limit && y1 - y0 + 1 <= limit;
}

/**
 * Own stations 4-adjacent to any of the tiles (deduplicated, in scan order).
 * @returns {object[]}
 */
export function adjacentStations(state, tiles) {
  const { map } = state;
  const out = [];
  for (const p of tiles) {
    for (const d of DIRS) {
      const nx = p.x + d.dx, ny = p.y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const b = map.tiles[ny * map.width + nx].building;
      if (b && b.type === 'station') {
        const st = findStation(state, b.stationId);
        if (st && !out.includes(st)) out.push(st);
      }
    }
  }
  return out;
}
