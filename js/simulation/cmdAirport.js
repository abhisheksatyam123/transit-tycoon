/**
 * Airport command: a footprint of station tiles with building.kind 'airport' (city 6x4, small 4x3,
 * heliport 1x1; see airportTypes.js), a hangar (or helipad) tile that also registers an air depot,
 * and removal. City is the default: its records carry no `airportType` field (saves unchanged).
 */
import { airportType, airportTypeId, AIRPORT_TYPES, DEFAULT_AIRPORT_TYPE } from './airportTypes.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { spend } from './economy.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney, objectError } from './trackRules.js';
import { createStation, adjacentStation, refreshKinds, recomputeAcceptance } from './stations.js';
import { allocId, findTown, nearestTown } from './state.js';
import { removeStationTile, removeDepot } from './cmdStation.js';
import { companyById, ownerMismatch, stampOwner, RIVAL_OWNED } from './owner.js';

/**
 * Build an airport with its top-left footprint corner at (x,y). opts.type: airport type id (default city).
 * Houses inside the footprint are demolished (costs money); water, rail, road, industries and
 * other stations block. Joins an adjacent station, else creates "<nearest town> Airport".
 * @returns {{ok:true,cost:number,stationId:number|null,depotId:number|null}|{ok:false,error:string}}
 */
export function buildAirport(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  const typeId = opts.type && AIRPORT_TYPES[opts.type] ? opts.type : DEFAULT_AIRPORT_TYPE;
  const type = airportType(typeId);
  const tagged = typeId !== DEFAULT_AIRPORT_TYPE; // city stays untagged
  if (type.introYear && (state.date?.year ?? 0) < type.introYear) return { ok: false, error: `${type.name} not yet available (from ${type.introYear})` };
  if (!coordsOk(map, x, y, x + type.w - 1, y + type.h - 1)) return { ok: false, error: ERR.bounds };
  // opts.owner: a rival company builds and pays (gap #25 AI air routes); null = the player
  const payee = companyById(state, opts.owner ?? null);
  if (opts.owner != null && !payee) return { ok: false, error: 'Unknown company' };
  const tiles = type.layout.map((p) => ({ x: x + p.dx, y: y + p.dy, dx: p.dx, dy: p.dy, part: p.part }));
  let cost = type.cost, minH = Infinity, maxH = -Infinity;
  const houses = [];
  for (const p of tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    if (t.terrain === 'water') return { ok: false, error: ERR.water };
    if (objectError(t)) return { ok: false, error: objectError(t) };
    minH = Math.min(minH, t.height); maxH = Math.max(maxH, t.height);
    const b = t.building;
    if (b) {
      if (b.type !== 'house') return { ok: false, error: ERR[b.type] || 'Tile occupied' };
      houses.push(p); cost += COSTS.demolishHouse;
      continue;
    }
    if (t.rail || t.road) return { ok: false, error: ERR.track };
    cost += clearingCost(t);
  }
  if (maxH - minH > 1) return { ok: false, error: `${type.name} needs flat land (heights differ by more than 1)` };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost, payee || state.company);
  if (money) return money;
  const existing = adjacentStation(state, tiles);
  if (existing && ownerMismatch(existing, opts)) return { ok: false, error: RIVAL_OWNED };
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null, depotId: null };
  for (const p of houses) {
    const t = map.tiles[p.y * map.width + p.x];
    const town = findTown(state, t.building.townId);
    if (town) town.houses = town.houses.filter((h) => h.x !== p.x || h.y !== p.y);
    t.building = null; t.owner = null;
  }
  const st = existing || stampOwner(state, createStation(state, x, y), opts.owner ?? null);
  if (!existing) st.name = airportName(state, x, y, type.name);
  const depotTile = tiles.find((p) => p.part === type.depotPart);
  const depotId = allocId(state);
  const depot = { id: depotId, kind: 'air', x: depotTile.x, y: depotTile.y, dir: 4 };
  if (tagged) depot.airportType = typeId;
  state.depots.push(stampOwner(state, depot, opts.owner ?? null));
  for (const p of tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    const building = { type: 'station', stationId: st.id, kind: 'airport', part: p.part, dx: p.dx, dy: p.dy };
    if (tagged) building.airportType = typeId;
    if (p.part === type.depotPart) building.depotId = depotId;
    t.building = building;
    t.owner = opts.owner != null ? 'rival' : 'company'; // rival airport tiles: no player upkeep (economy.js)
    st.tiles.push({ x: p.x, y: p.y, kind: 'airport' });
  }
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(payee || state.company, 'construction', cost);
  return { ok: true, cost, stationId: st.id, depotId, area: { x0: x, y0: y, x1: x + type.w - 1, y1: y + type.h - 1 } };
}

/** "<nearest town> Airport" (or "Heliport"), made unique. */
function airportName(state, x, y, typeName) {
  const town = nearestTown(state, x, y);
  const base = `${town ? town.name : 'Metro'} ${typeName === 'Heliport' ? 'Heliport' : 'Airport'}`;
  const used = new Set(state.stations.map((s) => s.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** Origin (top-left corner) of the airport a station-tile building belongs to. */
export function airportOrigin(b, x, y) {
  return { x: x - b.dx, y: y - b.dy };
}

/** True when an air depot (hangar) at origin (ox,oy) holds stopped aircraft. */
export function hangarBusy(state, ox, oy) {
  return state.vehicles.some((v) => v.state === 'depot' && v.tx === ox && v.ty === oy);
}

/**
 * Remove a whole airport: all footprint station tiles, the air depot record and the tiles' building.
 * @param {{state:object}} ctx
 * @param {number} ox origin x
 * @param {number} oy origin y
 */
export function demolishAirport(ctx, ox, oy) {
  const { state } = ctx;
  const map = state.map;
  const origin = map.tiles[oy * map.width + ox].building;
  const type = airportType(airportTypeId(origin));
  for (const p of type.layout) {
    const x = ox + p.dx, y = oy + p.dy;
    const t = map.tiles[y * map.width + x];
    if (!t.building || t.building.type !== 'station' || t.building.kind !== 'airport') continue;
    removeStationTile(ctx, x, y);
    t.building = null; t.owner = null;
  }
  for (const d of state.depots.filter((q) => q.kind === 'air' && q.x === ox && q.y === oy)) removeDepot(ctx, d.id);
}
