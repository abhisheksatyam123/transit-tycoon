/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/Engine/include/OpenLoco/Engine/World.hpp (coordinate constants/helpers),
 *         include/OpenLoco/Map/Tile.h (kOffsets, kReverseRotation), Math/Vector.hpp (rotate).
 * World coordinates: 32 units per tile; z in world units (1 smallZ = 4 units, 1 slope level = 16).
 */
import { ROTATION_OFFSET } from '../trackEnum.js';

export const TILE_SIZE = 32;
export const SMALL_Z_STEP = 4;
export const MICRO_Z_STEP = 16;
export const MICRO_TO_SMALL_Z_STEP = 4;

/** kOffsets (Tile.h): sequence offsets of a 2x2 object. */
export const OFFSETS = Object.freeze([{ x: 0, y: 0 }, { x: 0, y: 32 }, { x: 32, y: 32 }, { x: 32, y: 0 }].map(Object.freeze));
/** kReverseRotation (Tile.h). */
export const REVERSE_ROTATION = Object.freeze([2, 3, 0, 1, 10, 11, 8, 9, 6, 7, 4, 5, 14, 15, 12, 13]);
export { ROTATION_OFFSET };

/** @typedef {{x:number,y:number}} Pos2 */
/** @typedef {{x:number,y:number,z:number}} Pos3 */

/** @returns {Pos2} */
export const pos2 = (x, y) => ({ x, y });
/** @returns {Pos3} */
export const pos3 = (x, y, z) => ({ x, y, z });
/** Pos3 + [dx,dy,dz] or {x,y,z}. @returns {Pos3} */
export function addPos3(p, d) {
  return Array.isArray(d) ? { x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] } : { x: p.x + d.x, y: p.y + d.y, z: p.z + (d.z || 0) };
}
/** World (x,y) -> tile coords (C++ toTileSpace, truncating division). @returns {Pos2} */
export const toTileSpace = (p) => ({ x: Math.trunc(p.x / TILE_SIZE), y: Math.trunc(p.y / TILE_SIZE) });
/** Tile coords -> world origin of the tile (C++ toWorldSpace). @returns {Pos2} */
export const toWorldSpace = (t) => ({ x: t.x * TILE_SIZE, y: t.y * TILE_SIZE });

/** Math::Vector::rotate: rotate a Pos2 by `direction & 3` quarter turns. @returns {Pos2} */
export function rotatePos2(v, direction) {
  switch (direction & 3) {
    case 1: return { x: v.y, y: -v.x };
    case 2: return { x: -v.x, y: -v.y };
    case 3: return { x: -v.y, y: v.x };
    default: return { x: v.x, y: v.y };
  }
}
