/**
 * Read-only queries used by the UI: tile descriptions, nearby stations, model lists.
 */
import { CARGO_BY_ID } from '../config/cargos.js';
import { modelAvailable } from './vehicles.js';
import { ALL_VEHICLE_MODELS } from '../config/vehicles.js';
import { describeBits } from './network.js';
import { findDepot, findIndustry, findStation, findTown } from './state.js';
import { tileAcceptance, waitingAmount } from './stations.js';
import { vehiclePrice, runningCost } from './prices.js';
import { purchasable } from './vehicles.js';
import { industryType } from './industries.js';
import { RAIL_TYPES } from '../config/railTypes.js';
import { styleById } from '../config/stationTypes.js';
import { airportType, airportTypeId } from './airportTypes.js';
import { clearingCost } from './trackRules.js';
import { authorityTown, ratingTitle, townRating } from './townAuthority.js';
import { companyById } from './owner.js';
import { formatMoney } from './currency.js';
import { bridgeType as bridgeTypeOf } from '../config/bridges.js';
import { nearestTown } from './state.js';

const KIND_ALIASES = { train: ['engine'], engine: ['engine'], wagon: ['wagon'], road: ['bus', 'truck', 'tram'], bus: ['bus'], truck: ['truck'], aircraft: ['aircraft'], air: ['aircraft'], ship: ['ship'] };

/**
 * Vehicle models available at the current date.
 * @param {object} state
 * @param {string} kind 'engine'|'train'|'wagon'|'road'|'bus'|'truck'
 * @returns {any[]} model copies with inflated `cost` and `running`
 */
export function listModels(state, kind, ownerId = null) {
  const kinds = KIND_ALIASES[kind] || [kind];
  // copies carrying the inflation-adjusted price / yearly running cost (what buying now would charge)
  return ALL_VEHICLE_MODELS.filter((m) => kinds.includes(m.kind) && purchasable(m, state.date.year) && modelAvailable(state, m, ownerId))
    .map((m) => ({ ...m, cost: vehiclePrice(state, m), running: runningCost(state, m.running) }));
}

/**
 * Stations with any tile within Chebyshev `radius` of (x,y).
 */
export function stationsNear(state, x, y, radius) {
  return state.stations.filter((st) => st.tiles.some((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= radius));
}

/** Display names for landmark ids (contract). */
const LANDMARK_NAMES = {
  kremlin: 'Moscow Kremlin', red_square: "Red Square & St Basil's Cathedral", moscow_city: 'Moscow City business district',
  msu: 'Lomonosov Moscow State University', ostankino: 'Ostankino TV Tower', luzhniki: 'Luzhniki Stadium',
  christ_saviour: 'Cathedral of Christ the Saviour', bolshoi: 'Bolshoi Theatre', vdnkh: 'VDNKh exhibition centre',
  gorky_park: 'Gorky Park',
};
const landmarkTitle = (id) => LANDMARK_NAMES[id] || id;
/** Names for avenue classes (tile.avenue). */
const AVENUE_NAME = { 1: 'motorway', 2: 'primary', 3: 'secondary' };
const cargoName = (id) => (CARGO_BY_ID[id] ? CARGO_BY_ID[id].name : id);

/** Display name of an owner value (OTTD GetTileOwner name): 'company' = player, 'rival' = rivalId, 'town' = local authority. */
function ownerName(state, owner, rivalId, x, y) {
  if (owner === 'company') return state.company.name;
  if (owner === 'rival') { const r = companyById(state, rivalId); return r ? r.name : 'Rival company'; }
  if (owner === 'town') {
    const t = authorityTown(state, x, y) || nearestTown(state, x, y);
    return t ? `Town ${t.name}` : 'Town';
  }
  return 'None';
}

/** Track-type name of a tile's rail (config/railTypes.js; absent trk = plain rail). */
function trackName(tile) {
  const rt = RAIL_TYPES[tile.trk || 0];
  return rt ? rt.name : 'Rail';
}

/**
 * Describe a tile for the Query tool (UI only, read-only; cheap: runs on click).
 * Rows follow OpenTTD's Land Area Information (misc_gui.cpp LandInfoWindow) and the
 * per-tile GetTileDesc_* functions: owner, road/rail owner, track type, tram, station
 * class, airport/dock, clear cost, local authority, height and acceptance.
 * @returns {{tile:object, town?:object, industry?:object, station?:object, depot?:object, lines:string[]}}
 */
export function tileInfo(state, x, y, clear = null) {
  const tile = state.map.tiles[y * state.map.width + x];
  const out = { tile, lines: [] };
  const L = out.lines;
  L.push(`Tile ${x}, ${y} — ${tile.terrain}, height ${tile.height}`);
  const b = tile.building;
  if (b && b.type === 'house') {
    out.town = findTown(state, b.townId);
    L.push(`House (level ${b.level}) in ${out.town ? out.town.name : 'town'}`);
  } else if (b && b.type === 'industry') {
    out.industry = findIndustry(state, b.industryId);
    if (out.industry) {
      const type = industryType(out.industry);
      L.push(`${out.industry.name} (${type.name})`);
      const prod = Object.entries(out.industry.producedLastMonth || {}).map(([c, n]) => `${n} ${cargoName(c)}`);
      if (prod.length) L.push(`Produced last month: ${prod.join(', ')}`);
      if (type.accepts && type.accepts.length) L.push(`Accepts: ${type.accepts.map(cargoName).join(', ')}`);
    }
  } else if (b && b.type === 'station') {
    out.station = findStation(state, b.stationId);
    if (out.station) {
      L.push(`${out.station.name} (${stationClass(b)})`);
      const so = out.station.ownerId != null ? ownerName(state, 'rival', out.station.ownerId, x, y) : state.company.name;
      L.push(`Station owner: ${so}`);
      for (const c of Object.keys(out.station.cargo || {})) {
        const n = waitingAmount(out.station, c);
        if (n > 0) L.push(`Waiting: ${n} ${cargoName(c)} (rating ${out.station.rating[c] ?? '-'}%)`);
      }
    }
  } else if (b && b.type === 'landmark') {
    L.push(`${landmarkTitle(b.id)}${b.w * b.h > 1 ? ` (${b.w}×${b.h} footprint)` : ''}`);
  } else if (b && b.type === 'depot') {
    out.depot = findDepot(state, b.depotId);
    L.push(`${b.kind === 'rail' ? 'Rail' : 'Road'} depot`);
  }
  // typed player bridge (config/bridges.js): default bridges (no bridgeType) show nothing extra
  if (tile.bridgeType !== undefined) {
    const bt = bridgeTypeOf(tile.bridgeType);
    if (bt) L.push(`Bridge: ${bt.name}, max speed ${bt.speed} km/h`);
  }
  if (tile.avenue && tile.road) L.push(`Avenue (${AVENUE_NAME[tile.avenue] || 'road'})`);
  // owners: one tile.owner serves road and rail; OTTD prints them separately only when they differ
  const own = tile.owner ?? null;
  const oname = own ? ownerName(state, own, tile.rivalId, x, y) : null;
  if (tile.rail) {
    L.push(`Rail: ${describeBits(tile.rail)} — ${trackName(tile)}${tile.elec ? ', electrified' : ''}`);
    L.push(`Rail owner: ${oname || 'None'}`);
  }
  if (tile.road) {
    L.push(`Road: ${describeBits(tile.road)}${own === 'town' ? ' (town)' : ''}`);
    L.push(`Road owner: ${oname || 'None'}`);
  }
  if (tile.tram) L.push(`Tram track: ${describeBits(tile.tram)}`);
  if (oname && !tile.rail && !tile.road) L.push(`Owner: ${oname}`);
  if (clear && (tile.building || tile.rail || tile.road || tile.tram)) {
    // structures: the bulldozer's own dry-run cost (OTTD LandInfoWindow "Cost to clear", N/A when it cannot)
    L.push(!clear.ok ? 'Clear cost: N/A' : clear.cost > 0 ? `Clear cost: ${formatMoney(clear.cost)}` : 'Clear cost: free');
  } else {
    const cc = clearingCost(tile);
    L.push(cc > 0 ? `Clear cost: ${formatMoney(cc)} (${tile.terrain})` : `Clear cost: free (${tile.terrain})`);
  }
  const auth = authorityTown(state, x, y);
  if (auth) L.push(`Local authority: ${auth.name} (rating ${ratingTitle(townRating(auth))})`);
  else { const nt = nearestTown(state, x, y); if (nt) L.push(`Nearest town: ${nt.name}`); }
  const acc = Object.entries(tileAcceptance(state, x, y)).filter(([, v]) => v > 0);
  if (acc.length) L.push(`Acceptance: ${acc.map(([c, v]) => `${cargoName(c)} ${v}/8`).join(', ')}`);
  return out;
}

/** Station class line (OTTD station GetTileDesc): rail platform style, bus/truck stop style, airport type, dock. */
function stationClass(b) {
  if (b.kind === 'airport') return `${airportType(airportTypeId(b)).name}`;
  if (b.kind === 'dock') return 'Dock';
  if (b.kind === 'rail') return `${styleById('rail', b.style).name}`;
  if (b.kind === 'bus' || b.kind === 'truck') return `${styleById(b.kind, b.style).name}`;
  return `${b.kind} stop`;
}
