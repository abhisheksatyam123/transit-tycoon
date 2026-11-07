/**
 * Rail waypoint (OpenTTD waypoint_cmd.cpp CmdBuildRailWaypoint, simplified to one tile): a station record of kind
 * 'waypoint' on a straight, plain rail tile. The tile keeps its rail; `tile.building` = {type:'station', kind:'waypoint'}
 * (lazy: only waypoint tiles carry it). Trains order it as a "go via" stop: they pass without stopping and the order
 * advances (movement.js onPathEnd). Refused on curves, junctions, stations, signals, bridges, tunnels and road tiles.
 */
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { getTile } from './map.js';
import { straightAxis } from './network.js';
import { ERR, checkMoney, coordsOk, objectError } from './trackRules.js';
import { createStation, refreshKinds } from './stations.js';
import { companyById, stampOwner } from './owner.js';
import { invalidateBlocks } from './signals.js';
import { refusalAt } from './townAuthority.js';

export const WAYPOINT_ERR = {
  notStraight: 'A waypoint needs a straight rail tile (no curve or junction)',
  noRail: 'A waypoint must be built on rail',
  special: 'A waypoint cannot be built on a signal, bridge, tunnel or road tile',
  occupied: 'Tile occupied',
};

/** Validation shared by the dry run and the build. @returns {string|null} error */
function waypointError(state, x, y) {
  const t = getTile(state.map, x, y);
  if (!t) return ERR.bounds;
  if (t.terrain === 'water') return ERR.water;
  if (objectError(t)) return objectError(t);
  if (t.building) return t.building.type === 'station' ? WAYPOINT_ERR.occupied : (ERR[t.building.type] || WAYPOINT_ERR.occupied);
  if (!t.rail) return WAYPOINT_ERR.noRail;
  if (t.road || t.tram || t.signal || t.overBridge || t.tunnel || t.gradeSep || t.bridgeDeck) return WAYPOINT_ERR.special;
  if (!straightAxis(t.rail)) return WAYPOINT_ERR.notStraight;
  return null;
}

/**
 * Build a rail waypoint on the straight rail tile (x,y). Always a new station record.
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildRailWaypoint(ctx, x, y, opts = {}) {
  const { state } = ctx;
  if (!coordsOk(state.map, x, y)) return { ok: false, error: ERR.bounds };
  const err = waypointError(state, x, y);
  if (err) return { ok: false, error: err };
  const t = getTile(state.map, x, y);
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const payee = companyById(state, opts.owner ?? null);
  const cost = constructionTotal(state, COSTS.railWaypoint);
  const money = checkMoney(state, cost, payee);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, stationId: null };
  const st = createStation(state, x, y);
  st.name = `Waypoint ${st.id}`;
  invalidateBlocks(state);
  t.building = { type: 'station', stationId: st.id, kind: 'waypoint', axis: straightAxis(t.rail) };
  t.owner = 'company';
  st.tiles.push({ x, y, kind: 'waypoint', radius: 0 });
  refreshKinds(st);
  spend(payee, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/** True when a station is a rail waypoint (every tile of kind 'waypoint', none of them road). */
export function isWaypointStation(st) {
  return !!st && st.tiles.length > 0 && st.tiles.every((p) => p.kind === 'waypoint' && !p.road);
}

/** Road waypoint (OpenTTD CmdBuildRoadWaypoint, one tile): every tile is kind 'waypoint' with road: true. */
export function isRoadWaypointStation(st) {
  return !!st && st.tiles.length > 0 && st.tiles.every((p) => p.kind === 'waypoint' && p.road === true);
}

export const ROAD_WAYPOINT_ERR = {
  notStraight: 'A road waypoint needs a straight road tile (no junction or curve)',
  noRoad: 'A road waypoint must be built on road',
  special: 'A road waypoint cannot be built on rail, tram, a level crossing, a signal, a bridge or a tunnel',
};

/** Validation shared by the dry run and the build of a road waypoint. @returns {string|null} error */
function roadWaypointError(state, x, y) {
  const t = getTile(state.map, x, y);
  if (!t) return ERR.bounds;
  if (t.terrain === 'water') return ERR.water;
  if (objectError(t)) return objectError(t);
  if (t.building) return t.building.type === 'station' ? WAYPOINT_ERR.occupied : (ERR[t.building.type] || WAYPOINT_ERR.occupied);
  if (!t.road) return ROAD_WAYPOINT_ERR.noRoad;
  if (t.rail || t.tram || t.signal || t.overBridge || t.tunnel || t.gradeSep || t.bridgeDeck || t.playerBridge) return ROAD_WAYPOINT_ERR.special;
  if (!straightAxis(t.road)) return ROAD_WAYPOINT_ERR.notStraight;
  return null;
}

/**
 * Build a road waypoint on the straight road tile (x,y) (OpenTTD waypoint_cmd.cpp CmdBuildRoadWaypoint, one tile):
 * a new station record of kind 'waypoint' with road: true. Road vehicles order it as go-via; the road keeps its bits.
 * Owner and money follow the road-stop rules (stampOwner, town authority refusal), cost COSTS.roadWaypoint.
 * @returns {{ok:true,cost:number,stationId:number|null}|{ok:false,error:string}}
 */
export function buildRoadWaypoint(ctx, x, y, opts = {}) {
  const { state } = ctx;
  if (!coordsOk(state.map, x, y)) return { ok: false, error: ERR.bounds };
  const err = roadWaypointError(state, x, y);
  if (err) return { ok: false, error: err };
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const refused = refusalAt(state, x, y);
  if (refused) return { ok: false, error: refused };
  const t = getTile(state.map, x, y);
  const payee = companyById(state, opts.owner ?? null);
  const cost = constructionTotal(state, COSTS.roadWaypoint);
  const money = checkMoney(state, cost, payee);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, stationId: null };
  const st = stampOwner(state, createStation(state, x, y), opts.owner ?? null);
  st.name = `Road waypoint ${st.id}`;
  invalidateBlocks(state);
  t.building = { type: 'station', stationId: st.id, kind: 'waypoint', axis: straightAxis(t.road), road: true };
  if (!t.owner) t.owner = 'company';
  st.tiles.push({ x, y, kind: 'waypoint', road: true, radius: 0 });
  refreshKinds(st);
  spend(payee, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/** Road waypoint tile (waypoint station building with road: true). */
export function isRoadWaypointTile(tile) {
  return isWaypointTile(tile) && tile.building.road === true;
}

/** Rail waypoint tile (kind 'waypoint' station building) at (x,y). */
export function isWaypointTile(tile) {
  const b = tile && tile.building;
  return !!b && b.type === 'station' && b.kind === 'waypoint';
}
