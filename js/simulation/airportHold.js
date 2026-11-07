/**
 * OpenTTD holding-pattern geometry for the drawn position of a holding aircraft (display only: the simulation
 * still routes holding planes on its square loop, so the world hash and the sim are unchanged).
 * Ring = the four "Fly around waiting for a landing spot" nodes of the OTTD AirportMovingData table
 * (airportPositions.js), in 1/16 tile, relative to the touchdown node, sorted into a loop by angle.
 */
import { OTTD_AIRPORT_NODES } from './airportPositions.js';
import { airportTypeId, isHelicopter } from './airportTypes.js';

const cache = new Map();

/** Ring of the type in tiles relative to the touchdown node, sorted into a loop. Null for types without one. */
export function holdRing(typeId) {
  if (cache.has(typeId)) return cache.get(typeId);
  const d = OTTD_AIRPORT_NODES[typeId];
  let ring = null;
  if (d && d.hold.length) {
    const L = d.nodes[d.landing];
    const pts = d.hold.map((i) => ({ x: (d.nodes[i].x - L.x) / 16, y: (d.nodes[i].y - L.y) / 16 }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    ring = pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }
  cache.set(typeId, ring);
  return ring;
}

/** Ring node in the compass direction of sim corner k (0 N, 1 E, 2 S, 3 W): the one most aligned with it. */
function ringNodeFor(ring, k) {
  const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][k];
  let best = ring[0], bd = -Infinity;
  for (const p of ring) { const d = p.x * dir[0] + p.y * dir[1]; if (d > bd) { bd = d; best = p; } }
  return best;
}

/**
 * Drawn tile position of a holding plane flying the leg from sim corner `from` to sim corner `target` (corner order
 * N, E, S, W as in airportFsa.js), f = 0..1 progress along the leg. (ax,ay) = the airport's runway centre tile.
 * Returns null when the type has no OTTD ring (caller keeps the sim position).
 * @returns {{x:number,y:number}|null}
 */
export function holdDrawPos(typeId, ax, ay, from, target, f) {
  const ring = holdRing(typeId);
  if (!ring) return null;
  const a = ringNodeFor(ring, from), b = ringNodeFor(ring, target);
  const t = Math.max(0, Math.min(1, f));
  return { x: ax + a.x + (b.x - a.x) * t, y: ay + a.y + (b.y - a.y) * t };
}

/** True when an aircraft's sim holding applies to the OTTD ring (plane at a plane-airport with a ring). */
export function usesHoldRing(v, building) {
  return !!v && v.kind === 'aircraft' && !!v.hold && !isHelicopter(v) && !!building && holdRing(airportTypeId(building)) !== null;
}
