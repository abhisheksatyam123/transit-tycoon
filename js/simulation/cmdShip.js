/**
 * Ship infrastructure commands (OpenTTD station_cmd.cpp CmdBuildDock, ship depot, waypoint_cmd.cpp CmdBuildBuoy):
 * - dock: a land tile (no track, road or building) with at least one passable water neighbour. A station part of
 *   kind 'dock' with catchment radius 4; joins an adjacent station that has no buoy.
 * - ship depot: a water tile on the ship network (a depot record of kind 'ship').
 * - buoy: a one-tile water station of kind 'buoy' (ships can order it as a waypoint; no cargo, no catchment).
 */
import { DIRS } from './constants.js';
import { constructionTotal } from './prices.js';
import { SHIP_COSTS } from '../config/ships.js';
import { spend } from './economy.js';
import { companyById, ownerMismatch, stampOwner, RIVAL_OWNED } from './owner.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney, objectError } from './trackRules.js';
import { createStation, adjacentStation, spreadOk, refreshKinds, recomputeAcceptance } from './stations.js';
import { spreadLimit, distantJoinRefused } from './cmdStation.js';
import { findStation } from './state.js';
import { allocId } from './state.js';
import { getTile } from './map.js';
import { shipPassable } from './shipPath.js';

/** Catchment radius of dock tiles (OpenTTD dock catchment); buoys have none. */
export const DOCK_RADIUS = 4;

const SHIP_ERR = {
  dockLand: 'A dock must be on land next to water',
  dockWater: 'Docks cannot be built on water',
  depotLand: 'A ship depot must be built on water',
  buoyLand: 'A buoy must be built on open water',
  noWaterAccess: 'No water access: the tile needs an open water neighbour',
};

/** True when the tile (land or water) has track, road or a building on it. */
function occupied(t) {
  return !!(t.building || t.rail || t.road);
}

/** True when some 4-neighbour is open water a ship can enter. */
function hasWaterAccess(map, x, y) {
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if (shipPassable(map, ny * map.width + nx)) return true;
  }
  return false;
}

/** Validation shared by the dry run and the build. @returns {string|null} error */
function dockError(map, x, y) {
  const t = getTile(map, x, y);
  if (t.terrain === 'water') return SHIP_ERR.dockWater;
  if (objectError(t)) return objectError(t);
  if (occupied(t)) return ERR[t.building && t.building.type] || ERR.track;
  if (!hasWaterAccess(map, x, y)) return SHIP_ERR.noWaterAccess;
  return null;
}

/**
 * Build a dock on land at (x,y) next to water. Joins an adjacent station (not one with buoys).
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildDock(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const err = dockError(map, x, y);
  if (err) return { ok: false, error: err };
  const t = getTile(map, x, y);
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const payee = companyById(state, opts.owner ?? null);
  let cost = SHIP_COSTS.dock + clearingCost(t);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost, payee);
  if (money) return money;
  let existing = adjacentStation(state, [{ x, y }]);
  if (existing && existing.tiles.some((p) => p.kind === 'buoy')) existing = null;
  if (opts.joinStationId != null) {
    if (distantJoinRefused(state, opts, [{ x, y }])) return { ok: false, error: 'Distant join is disabled in game settings' };
    const joined = findStation(state, opts.joinStationId);
    if (!joined || !spreadOk(joined, [{ x, y }], spreadLimit(state))) return { ok: false, error: 'Station too spread out' };
    existing = joined;
  } else if (existing && !spreadOk(existing, [{ x, y }], spreadLimit(state))) return { ok: false, error: 'Station too spread out' };
  if (existing && ownerMismatch(existing, opts)) return { ok: false, error: RIVAL_OWNED };
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null };
  const st = existing || stampOwner(state, createStation(state, x, y), opts.owner ?? null);
  clearTerrain(t);
  t.building = { type: 'station', stationId: st.id, kind: 'dock' };
  t.owner = 'company';
  st.tiles.push({ x, y, kind: 'dock', radius: DOCK_RADIUS });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(payee, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/**
 * Build a ship depot on open water at (x,y). Its exit faces `dir` (cosmetic for the sprite).
 * @returns {{ok:true,cost:number,depotId:number}|{ok:false,error:string}}
 */
export function buildShipDepot(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const t = getTile(map, x, y);
  if (t.terrain !== 'water') return { ok: false, error: SHIP_ERR.depotLand };
  if (occupied(t)) return { ok: false, error: ERR[t.building && t.building.type] || ERR.track };
  if (!hasWaterAccess(map, x, y)) return { ok: false, error: SHIP_ERR.noWaterAccess };
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const payee = companyById(state, opts.owner ?? null);
  let cost = constructionTotal(state, SHIP_COSTS.depot);
  const money = checkMoney(state, cost, payee);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, depotId: null };
  const dir = [1, 2, 4, 8].includes(opts.dir) ? opts.dir : 4;
  const id = allocId(state);
  t.building = { type: 'depot', depotId: id, kind: 'ship', dir };
  t.owner = 'company';
  state.depots.push(stampOwner(state, { id, kind: 'ship', x, y, dir }, opts.owner ?? null));
  spend(payee, 'construction', cost);
  return { ok: true, cost, depotId: id };
}

/**
 * Build a buoy (waypoint) on open water at (x,y): a one-tile station of kind 'buoy'. Always a new station.
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildBuoy(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const t = getTile(map, x, y);
  if (t.terrain !== 'water') return { ok: false, error: SHIP_ERR.buoyLand };
  if (objectError(t)) return { ok: false, error: objectError(t) };
  if (occupied(t)) return { ok: false, error: ERR[t.building && t.building.type] || ERR.track };
  let cost = constructionTotal(state, SHIP_COSTS.buoy);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, stationId: null };
  const st = createStation(state, x, y);
  st.name = `Buoy ${st.id}`;
  t.building = { type: 'station', stationId: st.id, kind: 'buoy' };
  t.owner = 'company';
  st.tiles.push({ x, y, kind: 'buoy', radius: 0 });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/** True when a station is a buoy (waypoint) station. */
export function isBuoyStation(st) {
  return !!st && st.tiles.length > 0 && st.tiles.every((p) => p.kind === 'buoy');
}

