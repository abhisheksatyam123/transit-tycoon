/**
 * Display-only sub-tile offsets for grounded aircraft, from OpenTTD airport node positions (airportPositions.js,
 * 1/16 tile). Our footprints are hand-drawn, so no fit of OTTD node coordinates onto our tiles was reliable
 * (affine role-consistency 3-5 of 9-12 nodes). A grounded plane stays on the tile of its own footprint part
 * (apron, runway, terminal, hangar asphalt) and takes a sub-tile offset from the OTTD node of its role: the node's
 * position inside its 16-unit OTTD tile block, scaled to +-OFFSET_MAX. The simulation never reads this.
 */
import { OTTD_AIRPORT_NODES } from './airportPositions.js';

/** Largest sub-tile offset (tiles) a grounded plane may take from its tile centre. */
export const OFFSET_MAX = 0.3;

/** OTTD node name per footprint part: the node whose sub-tile position defines the plane's offset. */
const ROLE_NODE = { runway: 'Going down for land', apron: 'Taxi to Airport center' };

/** Footprint parts that keep a zero offset: planes at terminal, tower and hangar tiles stay on the base drawing. */
const ZERO_PARTS = new Set(['hangar', 'terminal', 'tower']);

/** Node index for a footprint part of a type, or the touchdown node when the type has no named node for it. */
export function roleNodeIndex(typeId, part) {
  const d = OTTD_AIRPORT_NODES[typeId];
  if (!d) return -1;
  const name = ROLE_NODE[part] || ROLE_NODE.runway;
  const i = d.nodes.findIndex((n) => n.name === name);
  return i >= 0 ? i : d.landing;
}

/**
 * Sub-tile offset (dx,dy tiles, each within +-OFFSET_MAX) for a grounded plane of type typeId on a tile of footprint
 * part `part`. Null when the type has no OTTD table.
 * @returns {{dx:number,dy:number}|null}
 */
export function groundOffset(typeId, part) {
  if (ZERO_PARTS.has(part)) return { dx: 0, dy: 0 };
  const d = OTTD_AIRPORT_NODES[typeId];
  const i = roleNodeIndex(typeId, part);
  if (!d || i < 0) return null;
  const n = d.nodes[i];
  // position inside the 16-unit OTTD tile block, centred on 0, scaled to the allowed offset
  const fx = ((n.x % 16) + 16) % 16 / 16 - 0.5, fy = ((n.y % 16) + 16) % 16 / 16 - 0.5;
  return { dx: Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, fx * 2 * OFFSET_MAX)), dy: Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, fy * 2 * OFFSET_MAX)) };
}
