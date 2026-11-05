/**
 * Trip planning for private cars: pick an origin house, a destination building and
 * compute the road route. Pure; all randomness comes from the traffic RNG.
 */
import { dirBetween } from './constants.js';
import { DEST_MIX, PATH_MAX_NODES } from '../config/traffic.js';
import { findPath } from './pathfinder.js';
import { neighbours } from './map.js';
import { industryTiles } from './industries.js';
import { manhattan } from './state.js';

/** Tile index of (x,y) on a map. */
export function tileIndex(map, x, y) { return y * map.width + x; }

/**
 * Pick a road tile adjacent to (x,y), or null.
 * @returns {{x:number,y:number}|null}
 */
export function roadNeighbour(map, rng, x, y) {
  const cands = neighbours(map, x, y).filter((n) => n.tile.road);
  return cands.length ? rng.pick(cands) : null;
}

/** Pick a house of `town` that has a road next to it; returns the road tile or null. */
function houseRoad(map, rng, town) {
  if (!town || !town.houses.length) return null;
  for (let k = 0; k < 4; k++) {
    const h = rng.pick(town.houses);
    const t = map.tiles[tileIndex(map, h.x, h.y)];
    if (!t || !t.building || t.building.type !== 'house') continue;
    const r = roadNeighbour(map, rng, h.x, h.y);
    if (r) return { x: r.x, y: r.y };
  }
  return null;
}

/** Nearest other town to `town` (manhattan), or null. */
function nearestTown(state, town) {
  let best = null, bd = Infinity;
  for (const o of state.towns) {
    if (o === town) continue;
    const d = manhattan(town.x, town.y, o.x, o.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** Destination road tile for a trip from `origin` town, or null. */
function pickDestination(state, rng, origin) {
  const r = rng.next();
  let target = origin;
  if (r >= DEST_MIX.sameTown && r < DEST_MIX.sameTown + DEST_MIX.otherTown) {
    target = nearestTown(state, origin) || origin;
  } else if (r >= DEST_MIX.sameTown + DEST_MIX.otherTown) {
    if (!state.industries.length) return null;
    const ind = rng.pick(state.industries);
    const tiles = industryTiles(ind);
    const tile = rng.pick(tiles);
    const road = roadNeighbour(state.map, rng, tile.x, tile.y);
    return road ? { x: road.x, y: road.y } : null;
  }
  return houseRoad(state.map, rng, target);
}

/**
 * Plan a trip for a car leaving `origin` town.
 * @returns {{path:number[]}|{failed:true}|null} path of tile indices; `failed` when no route exists; null when no destination was found.
 */
export function planTrip(state, rng, origin) {
  const { map } = state;
  const start = houseRoad(map, rng, origin);
  if (!start) return null;
  const dest = pickDestination(state, rng, origin);
  if (!dest) return null;
  if (dest.x === start.x && dest.y === start.y) return null;
  const p = findPath(map, start, [dest], 'road', { maxNodes: map.pathMaxNodes || PATH_MAX_NODES });
  if (!p) return { failed: true };
  return { path: p.map((t) => tileIndex(map, t.x, t.y)) };
}

/**
 * Re-route a car from its current tile to its destination (last path tile).
 * @returns {number[]|null} new path (starting at the current tile) or null
 */
export function repath(map, cur, dest) {
  const W = map.width;
  const p = findPath(map, { x: cur % W, y: Math.floor(cur / W) }, [{ x: dest % W, y: Math.floor(dest / W) }], 'road', { maxNodes: map.pathMaxNodes || PATH_MAX_NODES });
  return p ? p.map((t) => tileIndex(map, t.x, t.y)) : null;
}

/** Direction bit of the link between two tile indices (0 if not adjacent). */
export function linkBit(map, a, b) {
  const W = map.width;
  return dirBetween(a % W, Math.floor(a / W), b % W, Math.floor(b / W));
}

