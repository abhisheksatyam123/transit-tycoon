/**
 * Airport command: a 6x4 footprint (see aircraft.js airportLayout) of station tiles with
 * building.kind 'airport', a hangar tile that also registers an air depot, and removal.
 */
import { AIRPORT_W, AIRPORT_H } from './constants.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { spend } from './economy.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney } from './trackRules.js';
import { createStation, adjacentStation, refreshKinds, recomputeAcceptance } from './stations.js';
import { allocId, findTown, nearestTown } from './state.js';
import { removeStationTile, removeDepot } from './cmdStation.js';
import { airportLayout } from './aircraft.js';

/**
 * Build an airport with its top-left footprint corner at (x,y).
 * Houses inside the footprint are demolished (costs money); water, rail, road, industries and
 * other stations block. Joins an adjacent station, else creates "<nearest town> Airport".
 * @returns {{ok:true,cost:number,stationId:number|null,depotId:number|null}|{ok:false,error:string}}
 */
export function buildAirport(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x, y, x + AIRPORT_W - 1, y + AIRPORT_H - 1)) return { ok: false, error: ERR.bounds };
  const tiles = airportLayout().map((p) => ({ x: x + p.dx, y: y + p.dy, dx: p.dx, dy: p.dy, part: p.part }));
  let cost = COSTS.airport, minH = Infinity, maxH = -Infinity;
  const houses = [];
  for (const p of tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    if (t.terrain === 'water') return { ok: false, error: ERR.water };
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
  if (maxH - minH > 1) return { ok: false, error: 'Airport needs flat land (heights differ by more than 1)' };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  const existing = adjacentStation(state, tiles);
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null, depotId: null };
  for (const p of houses) {
    const t = map.tiles[p.y * map.width + p.x];
    const town = findTown(state, t.building.townId);
    if (town) town.houses = town.houses.filter((h) => h.x !== p.x || h.y !== p.y);
    t.building = null; t.owner = null;
  }
  const st = existing || createStation(state, x, y);
  if (!existing) st.name = airportName(state, x, y);
  const hangar = tiles.find((p) => p.part === 'hangar');
  const depotId = allocId(state);
  state.depots.push({ id: depotId, kind: 'air', x: hangar.x, y: hangar.y, dir: 4 });
  for (const p of tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    const building = { type: 'station', stationId: st.id, kind: 'airport', part: p.part, dx: p.dx, dy: p.dy };
    if (p.part === 'hangar') building.depotId = depotId;
    t.building = building;
    t.owner = 'company';
    st.tiles.push({ x: p.x, y: p.y, kind: 'airport' });
  }
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, stationId: st.id, depotId };
}

/** "<nearest town> Airport", made unique. */
function airportName(state, x, y) {
  const town = nearestTown(state, x, y);
  const base = `${town ? town.name : 'Metro'} Airport`;
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
  for (const p of airportLayout()) {
    const x = ox + p.dx, y = oy + p.dy;
    const t = map.tiles[y * map.width + x];
    if (!t.building || t.building.type !== 'station' || t.building.kind !== 'airport') continue;
    removeStationTile(ctx, x, y);
    t.building = null; t.owner = null;
  }
  for (const d of state.depots.filter((q) => q.kind === 'air' && q.x === ox && q.y === oy)) removeDepot(ctx, d.id);
}
