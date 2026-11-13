/**
 * AI rival airport upgrade (gap #25 remainder): a rival air route's airport is rebuilt IN PLACE as a larger
 * type once its two towns pass the population bar of that type (AIR_TYPE_ORDER in aiAir.js) and the type is
 * available. The new footprint shares the old top-left corner; the station record and its id are kept, so
 * the planes' orders stay valid and they keep flying. Only rival-owned tiles, houses and clear flat land may
 * be taken; any other tile refuses the upgrade. Refused while a plane is on the ground in the footprint or
 * stopped in the hangar (wait until empty).
 *
 * Money (the player's demolish rules, cmdTrack.js): the old airport is paid for per tile
 * (COSTS.demolishStation, no refund), the new one at the buildAirport price (type cost, clearing, houses).
 * Monthly, one airport per rival (called from aiCompanies.updateMonthly). Nothing draws from the rng.
 */
import { AIR_TYPE_ORDER, airRoutesOf, airPlaneModel } from './aiAir.js';
import { airportType, airportTypeId } from './airportTypes.js';
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { clearingCost, clearTerrain, coordsOk, checkMoney, objectError } from './trackRules.js';
import { refreshKinds, recomputeAcceptance } from './stations.js';
import { allocId, findTown } from './state.js';
import { removeDepot, vehicleOnTile } from './cmdStation.js';
import { stampOwner } from './owner.js';
import { clearHouseAt } from './largeHouses.js';
import { pushNews } from './news.js';
import { getTile } from './map.js';

const key = (x, y) => `${x},${y}`;
const area = (id) => airportType(id).w * airportType(id).h;

/**
 * Upgrade one rival air route's two airports together (see file comment): both ends move to the same larger
 * type, so the route keeps one plane class. Each route is tried in turn; at most one route is upgraded per call.
 * @returns {boolean} true when a route's airports were upgraded
 */
export function upgradeRivalAirports(ctx, r) {
  const { state } = ctx;
  for (const route of airRoutesOf(r)) {
    const ends = [route.a, route.b].map((id) => state.stations.find((s) => s.id === id)).filter((st) => st && st.ownerId === r.id);
    if (ends.length !== 2) continue;
    const origins = ends.map((st) => airportOriginOf(state, st));
    if (origins.some((o) => !o)) continue;
    const curIds = origins.map((o) => airportTypeId(state.map.tiles[o.y * state.map.width + o.x].building));
    if (curIds[0] !== curIds[1]) continue;
    const curId = curIds[0];
    // both towns of the route must pass the bar of the new type (as for the route's first choice)
    const pops = (route.towns || []).map((id) => (state.towns.find((t) => t.id === id) || { population: 0 }).population || 0);
    const pop = pops.length ? Math.min(...pops) : 0;
    for (const { id, minPop } of AIR_TYPE_ORDER) {
      if (id === curId || area(id) <= area(curId) || pop < minPop) continue;
      const type = airportType(id);
      if (type.introYear && state.date.year < type.introYear) continue;
      if (!airPlaneModel(state, id, r.id)) continue;
      // all or nothing: the first end is upgraded only when the second can be too (checked by a dry pass)
      if (!upgradeAirportPair(ctx, r, ends, route, origins, curId, id)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Upgrade both ends or neither. Both ends are checked (canUpgrade) and their total cost is checked against the
 * cash before either commits. The commits then reuse those checks (no second canUpgrade): the two footprints
 * are disjoint (checked here), so the first commit changes nothing the second end's check depends on, and the
 * second commit cannot be refused. Should it be refused anyway, the first end is already upgraded and there is
 * no rollback: that case is logged (console.warn) and reported as false, never thrown (a throw would abort the
 * game tick), so the caller sees a failed upgrade rather than a half-upgraded pair reported as a success.
 */
function upgradeAirportPair(ctx, r, ends, route, origins, curId, typeId) {
  const { state } = ctx;
  const a = canUpgrade(ctx, r, origins[0], curId, typeId), b = canUpgrade(ctx, r, origins[1], curId, typeId);
  if (!a || !b) return false;
  // the footprints must not touch: a new tile of one end on a tile of the other (old or new) would make the
  // second end's check stale after the first commits
  const cells = new Set([...a.newTiles, ...a.oldTiles].map((p) => key(p.x, p.y)));
  if ([...b.newTiles, ...b.oldTiles].some((p) => cells.has(key(p.x, p.y)))) return false;
  // all or nothing: both upgrades must be affordable together, so neither end commits when only one could
  if (checkMoney(state, a.cost + b.cost, r)) return false;
  if (!upgradeAirport(ctx, r, ends[0], route, origins[0], curId, typeId, true, a)) return false; // nothing committed
  if (!upgradeAirport(ctx, r, ends[1], route, origins[1], curId, typeId, false, b)) {
    // invariant violation: the first end is committed and cannot be rolled back (see the comment above)
    console.warn(`airport pair upgrade: route ${route.a}/${route.b} of rival ${r.id} (${r.name}): second end ` +
      `station ${ends[1].id} refused after first end station ${ends[0].id} committed; route left half-upgraded`);
    return false;
  }
  return true;
}

/** Top-left corner of the airport a station owns: footprints are rectangles, so the least x,y tile. */
function airportOriginOf(state, st) {
  const tiles = st.tiles.filter((p) => p.kind === 'airport');
  if (!tiles.length) return null;
  const ox = Math.min(...tiles.map((p) => p.x)), oy = Math.min(...tiles.map((p) => p.y));
  const b = getTile(state.map, ox, oy)?.building;
  return b && b.kind === 'airport' ? { x: ox, y: oy } : null;
}

/**
 * Read-only check of one end (see file comment): the footprint of `typeId` at `origin`, the money and the
 * refusals. @returns {{cost:number,houses:object[],oldTiles:object[],newTiles:object[],oldDepots:object[]}|null}
 */
function canUpgrade(ctx, r, origin, curId, typeId) {
  const { state } = ctx;
  const map = state.map;
  const oldType = airportType(curId), type = airportType(typeId);
  const ox = origin.x, oy = origin.y;
  if (!coordsOk(map, ox, oy, ox + type.w - 1, oy + type.h - 1)) return null;
  const oldTiles = oldType.layout.map((p) => ({ x: ox + p.dx, y: oy + p.dy }));
  const oldSet = new Set(oldTiles.map((p) => key(p.x, p.y)));
  const newTiles = type.layout.map((p) => ({ x: ox + p.dx, y: oy + p.dy, dx: p.dx, dy: p.dy, part: p.part }));
  // wait until no plane is on the ground in either footprint or stopped in the hangar
  const union = [...new Set([...oldSet, ...newTiles.map((p) => key(p.x, p.y))])].map((k) => k.split(',').map(Number));
  for (const [x, y] of union) if (vehicleOnTile(state, x, y)) return null;
  const oldDepots = state.depots.filter((d) => d.kind === 'air' && oldSet.has(key(d.x, d.y)));
  if (state.vehicles.some((v) => v.state === 'depot' && oldDepots.some((d) => d.x === v.tx && d.y === v.ty))) return null;
  // the new footprint: only the old airport's own tiles, houses and clear flat land
  let cost = type.cost, minH = Infinity, maxH = -Infinity;
  const houses = [];
  for (const p of newTiles) {
    if (oldSet.has(key(p.x, p.y))) continue;
    const t = getTile(map, p.x, p.y);
    if (!t || t.terrain === 'water' || objectError(t) || t.rail || t.road) return null;
    if (t.building) {
      if (t.building.type !== 'house') return null;
      houses.push(p); cost += COSTS.demolishHouse;
    } else cost += clearingCost(t);
    minH = Math.min(minH, t.height); maxH = Math.max(maxH, t.height);
  }
  for (const p of oldTiles) { const t = getTile(map, p.x, p.y); if (t) { minH = Math.min(minH, t.height); maxH = Math.max(maxH, t.height); } }
  if (maxH - minH > 1) return null;
  cost += COSTS.demolishStation * oldTiles.length; // the player's demolish charge (no refund)
  cost = constructionTotal(state, cost);
  if (checkMoney(state, cost, r)) return null;
  return { cost, houses, oldTiles, newTiles, oldDepots, oldSet };
}

/**
 * Commit one end: the old airport out, the new one in, same station record. `chk` is the canUpgrade result
 * for this end (checked by the caller); when absent it is checked here.
 */
function upgradeAirport(ctx, r, st, route, origin, curId, typeId, isFirst, chk = canUpgrade(ctx, r, origin, curId, typeId)) {
  const { state } = ctx;
  const map = state.map;
  const type = airportType(typeId);
  if (!chk) return false;
  const { cost, houses, oldTiles, newTiles, oldDepots, oldSet } = chk;
  const oldDepotIds = oldDepots.map((d) => d.id);
  for (const p of oldTiles) {
    const t = getTile(map, p.x, p.y);
    if (t && t.building && t.building.stationId === st.id) { t.building = null; t.owner = null; }
  }
  st.tiles = st.tiles.filter((p) => !oldSet.has(key(p.x, p.y)));
  for (const id of oldDepotIds) removeDepot(ctx, id);
  for (const p of houses) {
    const t = getTile(map, p.x, p.y);
    if (!t || !t.building) continue;
    if (t.building.size) { clearHouseAt(state, p.x, p.y); continue; }
    const town = findTown(state, t.building.townId);
    if (town) town.houses = town.houses.filter((h) => h.x !== p.x || h.y !== p.y);
    t.building = null; t.owner = null;
  }
  const tagged = typeId !== 'city';
  let newDepot = null;
  for (const p of newTiles) {
    const t = getTile(map, p.x, p.y);
    clearTerrain(t);
    const building = { type: 'station', stationId: st.id, kind: 'airport', part: p.part, dx: p.dx, dy: p.dy };
    if (tagged) building.airportType = typeId;
    if (p.part === type.depotPart) {
      const id = allocId(state);
      const depot = { id, kind: 'air', x: p.x, y: p.y, dir: 4 };
      if (tagged) depot.airportType = typeId;
      state.depots.push(stampOwner(state, depot, r.id));
      building.depotId = id;
      if (!newDepot) newDepot = depot;
    }
    t.building = building;
    t.owner = 'rival';
    st.tiles.push({ x: p.x, y: p.y, kind: 'airport' });
  }
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(r, 'construction', cost);
  // planes keep their orders (same station id); the route's depot follows the first end's new hangar
  if (newDepot) {
    if (isFirst) route.depot = newDepot.id;
    r.depots = r.depots.filter((id) => !oldDepotIds.includes(id));
    r.depots.push(newDepot.id);
    for (const v of state.vehicles) if (oldDepotIds.includes(v.depotId)) v.depotId = newDepot.id;
  }
  if (tagged) route.apType = typeId; else delete route.apType;
  pushNews(state, `${r.name} upgraded ${st.name} to a ${type.name}.`, 'info', origin.x, origin.y, 'company');
  return true;
}
