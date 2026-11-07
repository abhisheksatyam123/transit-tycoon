/**
 * Display-only sub-tile offset of a grounded aircraft (FTA ground phase): the plane is drawn at its tile centre
 * plus the OpenTTD-derived offset of its footprint part (airportDisplay.js). The simulation never reads this.
 */
import { groundOffset } from '../../simulation/airportDisplay.js';
import { airportTypeId } from '../../simulation/airportTypes.js';

/** Adds dx/dy to segment s (tile float coords) when v is on an airport tile of a type with OTTD nodes. */
export function groundedAirOffset(state, v, s) {
  const x = Math.round(s.x), y = Math.round(s.y);
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return;
  const b = state.map.tiles[y * state.map.width + x].building;
  if (!b || b.type !== 'station' || b.kind !== 'airport') return;
  const o = groundOffset(airportTypeId(b), b.part);
  if (!o) return;
  // clamp: an offset whose target point falls on a terminal, tower or hangar tile is dropped (plane stays on the apron)
  const tx = Math.round(s.x + o.dx), ty = Math.round(s.y + o.dy);
  if (tx >= 0 && ty >= 0 && tx < state.map.width && ty < state.map.height) {
    const tb = state.map.tiles[ty * state.map.width + tx].building;
    if (tb && tb.type === 'station' && tb.kind === 'airport' && ['terminal', 'tower', 'hangar'].includes(tb.part)) return;
  }
  s.x += o.dx; s.y += o.dy;
}
