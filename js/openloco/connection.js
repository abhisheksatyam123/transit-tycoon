/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/OpenLoco/Map/Track/Track.cpp (getTrackConnectionEnd / getRoadConnectionEnd)
 * Pure world-unit math: 32 = 1 tile edge, z in 16 = half a level.
 */
import { getUnkTrack, getUnkRoad } from './trackData.js';

/**
 * @typedef {{x:number, y:number, z:number}} Pos3 world units
 * @typedef {{nextPos: Pos3, nextRotation: number}} ConnectionEnd
 */

function addPos(a, b) {
  return { x: a.x + b[0], y: a.y + b[1], z: a.z + b[2] };
}

/**
 * End of a track piece in world units (C++ getTrackConnectionEnd).
 * @param {Pos3} pos piece start (first tile centre, or sequence base for reversed lookup)
 * @param {number} trackAndDirection basic trackAndDirection: trackId << 3 | rotation | (reversed << 2).
 *   AdditionalTaDFlags bits are NOT part of the lookup index (as in the C++); mask with
 *   AdditionalTaDFlags.basicTaDMask before calling if you carry bridge/signal/mod flags.
 * @returns {ConnectionEnd}
 */
export function getTrackConnectionEnd(pos, trackAndDirection) {
  const trackData = getUnkTrack(trackAndDirection);
  return { nextPos: addPos(pos, trackData.pos), nextRotation: trackData.rotationEnd };
}

/**
 * End of a road piece in world units (C++ getRoadConnectionEnd).
 * @param {Pos3} pos
 * @param {number} trackAndDirection same basic-tad rules as getTrackConnectionEnd (max index 79)
 * @returns {ConnectionEnd}
 */
export function getRoadConnectionEnd(pos, trackAndDirection) {
  const roadData = getUnkRoad(trackAndDirection);
  return { nextPos: addPos(pos, roadData.pos), nextRotation: roadData.rotationEnd };
}
