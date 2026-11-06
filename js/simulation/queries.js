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

const KIND_ALIASES = { train: ['engine'], engine: ['engine'], wagon: ['wagon'], road: ['bus', 'truck'], bus: ['bus'], truck: ['truck'], aircraft: ['aircraft'], air: ['aircraft'], ship: ['ship'] };

/**
 * Vehicle models available at the current date.
 * @param {object} state
 * @param {string} kind 'engine'|'train'|'wagon'|'road'|'bus'|'truck'
 * @returns {any[]} model copies with inflated `cost` and `running`
 */
export function listModels(state, kind) {
  const kinds = KIND_ALIASES[kind] || [kind];
  // copies carrying the inflation-adjusted price / yearly running cost (what buying now would charge)
  return ALL_VEHICLE_MODELS.filter((m) => kinds.includes(m.kind) && purchasable(m, state.date.year) && modelAvailable(state, m))
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

/**
 * Describe a tile for the Query tool.
 * @returns {{tile:object, town?:object, industry?:object, station?:object, depot?:object, lines:string[]}}
 */
export function tileInfo(state, x, y) {
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
      L.push(`${out.station.name} (${b.kind === 'rail' ? 'rail platform' : b.kind + ' stop'})`);
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
  if (tile.avenue && tile.road) L.push(`Avenue (${AVENUE_NAME[tile.avenue] || 'road'})`);
  if (tile.rail) L.push(`Rail: ${describeBits(tile.rail)}`);
  if (tile.road) L.push(`Road: ${describeBits(tile.road)}${tile.owner === 'town' ? ' (town)' : ''}`);
  const acc = Object.entries(tileAcceptance(state, x, y)).filter(([, v]) => v > 0);
  if (acc.length) L.push(`Acceptance: ${acc.map(([c, v]) => `${cargoName(c)} ${v}/8`).join(', ')}`);
  if (tile.owner) L.push(`Owner: ${tile.owner}`);
  return out;
}
