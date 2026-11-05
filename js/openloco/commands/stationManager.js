/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/World/StationManager.cpp (findNearbyStation, findNearbyEmptyStation, exceedsStationSize,
 *         allocateNewStation, deallocateStation), src/World/Station.cpp (addTileToStation, removeTileFromStation,
 *         recalculateStationCenter, getStationElement).
 *
 * STATION MANAGER INTERFACE (what the station commands call on `ctx.stations`; implement it over the game's own
 * station objects, or use createStationManager below):
 *   findNearbyStation(pos, companyId) -> {id: number|STATION_NULL, isPhysicallyAttached: boolean}
 *   get(id) -> {owner, x, y, z, stationTiles: [{x,y,z}], stationTileSize}   (z low 2 bits carry the rotation)
 *   exceedsStationSize(station, pos) -> boolean
 *   allocateNewStation(pos, owner, mode) -> id | STATION_NULL
 *   deallocateStation(id)
 *   addTileToStation(id, pos, rotation) / removeTileFromStation(id, pos, rotation)
 *   recalculateStation(id)   (recalculateStationModes + recalculateStationCenter; may be a no-op)
 * Not ported: cargo/ratings, town assignment, naming, labels.
 */
import { TILE_SIZE, toTileSpace, toWorldSpace } from '../map/world.js';
import { StationElement } from '../map/transportElements.js';
import { STATION_NULL } from '../map/transportElements.js';

export const MAX_STATION_NEARBY_DISTANCE = 64;
export const STATION_DISTANCE_LIMIT = 8 * TILE_SIZE;
export const MAX_STATION_TILES = 80;
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** In-memory station manager (up to `maxStations` slots) bound to a TileManager. */
export function createStationManager(tm, { maxStations = 1024, disableStationSizeLimit = false } = {}) {
  const stations = new Map();
  let nextTry = 0;
  const mgr = {
    stations,
    get: (id) => stations.get(id) || null,
    findNearbyEmptyStation(pos, companyId, currentMin) {
      let best = STATION_NULL, min = currentMin;
      for (const [id, s] of stations) {
        if (s.stationTileSize !== 0 || s.owner !== companyId) continue;
        const d = chebyshev({ x: s.x, y: s.y }, pos);
        if (Math.abs(s.z - pos.z) > MAX_STATION_NEARBY_DISTANCE || d > MAX_STATION_NEARBY_DISTANCE) continue;
        if (d < min) { min = d; best = id; }
      }
      return best;
    },
    findNearbyStation(pos, companyId) {
      const t = toTileSpace(pos);
      let best = STATION_NULL, min = 0x7fff, attached = false;
      for (let ty = Math.max(0, t.y - 2); ty <= Math.min(tm.height - 1, t.y + 2); ty++) {
        for (let tx = Math.max(0, t.x - 2); tx <= Math.min(tm.width - 1, t.x + 2); tx++) {
          for (const el of tm.getTile(tx, ty)) {
            if (!(el instanceof StationElement) || el.isGhost()) continue;
            const st = stations.get(el.stationId());
            if (!st || st.owner !== companyId) continue;
            const d = chebyshev(toWorldSpace({ x: tx, y: ty }), pos);
            if (d < min) {
              const dz = Math.abs(el.baseHeight() - pos.z);
              if (dz > MAX_STATION_NEARBY_DISTANCE) continue;
              min = d + Math.trunc(dz / 2);
              if (min <= MAX_STATION_NEARBY_DISTANCE) attached = true;
              best = el.stationId();
            }
          }
        }
      }
      const empty = mgr.findNearbyEmptyStation(pos, companyId, min);
      return { id: empty !== STATION_NULL ? empty : best, isPhysicallyAttached: attached };
    },
    exceedsStationSize(station, pos) {
      if (disableStationSizeLimit) return false;
      return chebyshev({ x: pos.x + TILE_SIZE / 2, y: pos.y + TILE_SIZE / 2 }, { x: station.x, y: station.y }) > STATION_DISTANCE_LIMIT;
    },
    allocateNewStation(pos, owner) {
      if (!tm.validCoords(pos)) return STATION_NULL;
      for (let n = 0; n < maxStations; n++) {
        const id = (nextTry + n) % maxStations;
        if (stations.has(id)) continue;
        stations.set(id, { id, owner, x: pos.x, y: pos.y, z: pos.z, stationTiles: [], stationTileSize: 0 });
        nextTry = id + 1;
        return id;
      }
      return STATION_NULL;
    },
    deallocateStation(id) { stations.delete(id); },
    addTileToStation(id, pos, rotation) {
      const s = stations.get(id);
      s.stationTiles.push({ x: pos.x, y: pos.y, z: (pos.z & ~3) | (rotation & 3) });
      s.stationTileSize = s.stationTiles.length;
    },
    removeTileFromStation(id, pos, rotation) {
      const s = stations.get(id);
      if (!s) return;
      const z = pos.z | rotation;
      const i = s.stationTiles.findIndex((t) => t.x === pos.x && t.y === pos.y && t.z === z);
      if (i >= 0) s.stationTiles.splice(i, 1); else s.stationTiles.pop();
      s.stationTileSize = s.stationTiles.length;
    },
    /** recalculateStationCenter (modes/cargo not modelled). */
    recalculateStation(id) {
      const s = stations.get(id);
      if (!s) return;
      let sx = 0, sy = 0, maxZ = 0, count = 0;
      for (const t of s.stationTiles) {
        if (!getStationElement(tm, t)) continue;
        sx += t.x; sy += t.y; maxZ = Math.max(maxZ, t.z & ~15); count++;
      }
      if (count) { s.z = maxZ; s.x = Math.trunc(sx / count) + 16; s.y = Math.trunc(sy / count) + 16; }
    },
  };
  return mgr;
}

/** World::getStationElement(pos): first non-AI station element at baseZ pos.z/4 (null if that one is AI-allocated). */
export function getStationElement(tm, pos) {
  const baseZ = Math.trunc(pos.z / 4);
  for (const el of tm.get(pos)) {
    if (!(el instanceof StationElement) || el.baseZ() !== baseZ) continue;
    return el.isAiAllocated() ? null : el;
  }
  return null;
}
