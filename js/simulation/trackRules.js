/**
 * Rules deciding whether rail/road bits may be added to a tile.
 */
import { AXIS_BITS } from './constants.js';
import { straightAxis } from './network.js';
import { COSTS } from '../config/costs.js';

/** Error messages shared by commands. */
export const ERR = {
  bounds: 'Out of map bounds',
  water: "Can't build on water",
  house: 'Tile occupied by a house',
  industry: 'Tile occupied by an industry',
  station: 'Tile occupied by a station',
  depot: 'Tile occupied by a depot',
  crossing: 'Level crossings must be straight and perpendicular',
  money: 'Not enough money',
  built: 'Already built',
  track: 'Track or road in the way',
  vehicle: 'Vehicle in the way',
  tunnel: 'Tunnel in the way: build beside it or at its portals',
};

/**
 * Check whether `bits` can be added to tile on `layer` ('rail'|'road').
 * @returns {string|null} error message or null when allowed
 */
export function canAddBits(tile, layer, bits, deck = false) {
  if (!tile) return ERR.bounds;
  if (tile.terrain === 'water' && !deck) return ERR.water;
  // a tunnel's underground run takes no surface track; a portal only continues along its own axis
  if (tile.playerTunnel && tile.tunnel && bits) return ERR.tunnel;
  if (tile.playerTunnel && tile.tunnelPortal && (bits & ~AXIS_BITS[straightAxis(tile.rail | tile.road) || 'x'])) return ERR.tunnel;
  if (deck && tile.terrain !== 'water') return ERR.water;
  const b = tile.building;
  if (b) {
    if (b.type === 'house') return ERR.house;
    if (b.type === 'industry') return ERR.industry;
    if (b.type === 'station') {
      const ok = layer === 'rail' ? b.kind === 'rail' : b.kind !== 'rail';
      if (!ok || (bits & ~AXIS_BITS[b.axis])) return ERR.station;
      return null;
    }
    if (b.type === 'depot') {
      if (b.kind !== layer || (bits & ~b.dir)) return ERR.depot;
      return null;
    }
  }
  const other = layer === 'rail' ? 'road' : 'rail';
  if (tile[other]) {
    const mine = straightAxis(tile[layer] | bits);
    const theirs = straightAxis(tile[other]);
    if (!mine || !theirs || mine === theirs) return ERR.crossing;
  }
  return null;
}

/** Longest player bridge in tiles, heads included (OpenTTD-style span limit). */
export const MAX_BRIDGE_LENGTH = 12;
/** Longest player rail tunnel in tiles, both portals included. */
export const MAX_TUNNEL_LENGTH = 16;

/**
 * Extra cost to clear terrain before building (forest/rock), 0 otherwise.
 */
export function clearingCost(tile) {
  if (tile.terrain === 'forest') return COSTS.clearForest;
  if (tile.terrain === 'rock') return COSTS.clearRock;
  if (tile.field !== undefined) return COSTS.clearField; // T29 farm field (opt-in)
  return 0;
}

/** Clear terrain for building (forest/rock -> grass). */
export function clearTerrain(tile) {
  if (tile.terrain === 'forest' || tile.terrain === 'rock') tile.terrain = 'grass';
  if (tile.field !== undefined) delete tile.field; // T29: building over a farm field clears it
}

/**
 * Validate that a value is an integer coordinate pair inside the map.
 */
export function coordsOk(map, ...coords) {
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i], y = coords[i + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  }
  return true;
}

/**
 * Standard money check + result helper.
 * @returns {{ok:false,error:string}|null}
 */
export function checkMoney(state, cost) {
  if (cost > state.company.money) return { ok: false, error: ERR.money };
  return null;
}
