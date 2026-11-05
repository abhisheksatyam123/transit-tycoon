/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/Map/Track/TrackIteration.h (iterateTrackToJunction)
 * The Locomotion map-element dependencies (TileManager, TrackElement, StationElement)
 * are replaced by two injected callbacks so the loop logic is engine-agnostic:
 *   filter(connectionTrackStart, tad) -> boolean   keep walking while truthy
 *   getConnections(nextPos, nextRotation) -> { connections: number[] } | null
 * Coordinates are world units (32 = 1 tile edge), matching the C++ Pos3.
 */
import { getUnkTrack } from './trackData.js';
import { getTrackConnectionEnd } from './connection.js';
import { AdditionalTaDFlags, ROTATION_OFFSET } from './trackEnum.js';

const posEq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * Walk a track chain from `trackStart` until a junction or a dead end.
 * Faithful port of OpenLoco's iterateTrackToJunction: stops when the filter
 * rejects a tile, when the chain does not have exactly one connection forward,
 * or when it loops back to the start.
 *
 * @param {{x:number, y:number, z:number}} trackStart world units
 * @param {number} tad basic trackAndDirection of the starting piece
 * @param {{filter: (connectionTrackStart: {x:number, y:number, z:number}, tad: number) => boolean,
 *          getConnections: (nextPos: {x:number, y:number, z:number}, nextRotation: number) => ({ connections: number[] } | null)}} deps
 * @param {{maxSteps?: number}} [options] defensive bound; default Infinity (faithful to the unbounded C++ loop)
 * @returns {{pos: {x:number, y:number, z:number}, tad: number, steps: number, stoppedBy: 'filter'|'junction'|'deadend'|'loop'|'maxSteps'}}
 */
export function iterateTrackToJunction(trackStart, tad, { filter, getConnections }, { maxSteps = Infinity } = {}) {
  let pos = { ...trackStart };
  let current = tad;

  for (let steps = 0; ; steps++) {
    if (steps >= maxSteps) {
      return { pos, tad: current, steps, stoppedBy: 'maxSteps' };
    }
    let connectionTrackStart = { ...pos };

    if (current & (1 << 2)) {
      const trackSize = getUnkTrack(current);
      connectionTrackStart = {
        x: connectionTrackStart.x + trackSize.pos[0],
        y: connectionTrackStart.y + trackSize.pos[1],
        z: connectionTrackStart.z + trackSize.pos[2],
      };
      if (trackSize.rotationEnd < 12) {
        const off = ROTATION_OFFSET[trackSize.rotationEnd];
        connectionTrackStart = { x: connectionTrackStart.x - off.x, y: connectionTrackStart.y - off.y, z: connectionTrackStart.z };
      }
    }

    if (!filter(connectionTrackStart, current)) {
      return { pos, tad: current, steps, stoppedBy: 'filter' };
    }

    const { nextPos, nextRotation } = getTrackConnectionEnd(pos, current);
    const tc = getConnections(nextPos, nextRotation);

    // If there is a junction or no connection we stop
    if (!tc || tc.connections.length !== 1) {
      return { pos, tad: current, steps, stoppedBy: tc && tc.connections.length > 1 ? 'junction' : 'deadend' };
    }

    // Now we move to the next track piece
    pos = nextPos;
    current = tc.connections[0] & AdditionalTaDFlags.basicTaDMask;

    // If we have looped back to the start we stop
    if (posEq(pos, trackStart)) {
      return { pos, tad: current, steps: steps + 1, stoppedBy: 'loop' };
    }
  }
}
