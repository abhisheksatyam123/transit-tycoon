/** R5f: Moscow State University Main Building (2x2 footprint): very wide symmetric block along u, central
 *  spired tower, stepped side blocks, long low wings with corner towers. Facade faces the viewer's left (+v). */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const WIN = PX.window, BODY = '#e3d3a8', BASE = PX.brickDark;
const cols = (lenPx) => Math.max(2, Math.round(lenPx / 4));

/** Box with a dense window grid on both visible faces. */
function bx(s, u0, v0, u1, v1, z0, z1, colour = BODY) {
  s.box(u0, v0, u1, v1, z0, z1, colour, {
    windows: { rows: Math.max(2, Math.round((z1 - z0) / 4)), cols: cols((u1 - u0) * 32), colsR: cols((v1 - v0) * 32), colour: WIN, lit: 0.15 },
  });
}

/** Build the MSU sprite. */
export function buildMsu(w, h) {
  const top = heightPx(240), wingTop = heightPx(40), sideTop = heightPx(70);
  const s = footprintPixel(w, h, top);
  // dark plinth under the whole facade
  bx(s, -0.97, -0.2, 0.97, 0.2, 0, 5, BASE);
  // long low wings (9-12 storeys), full width
  bx(s, -0.95, -0.15, 0.95, 0.15, 5, wingTop);
  // corner towers at the wing ends (far ones first)
  const corner = (u) => {
    bx(s, u - 0.08, -0.12, u + 0.08, 0.12, 5, heightPx(60));
    s.spire(u, 0, 0.06, heightPx(60), heightPx(60) + 6, PX.copper, false);
  };
  corner(-0.9);
  // side blocks (18 storeys), stepping up toward the centre
  bx(s, -0.6, -0.2, -0.28, 0.2, 5, sideTop);
  bx(s, 0.28, -0.2, 0.6, 0.2, 5, sideTop);
  corner(0.9);
  // central base (wide, mid height)
  bx(s, -0.3, -0.26, 0.3, 0.26, 5, heightPx(100));
  // central 36-storey tower with spire and star, clock on the facade
  bx(s, -0.18, -0.2, 0.18, 0.2, heightPx(100), top - 22);
  bx(s, -0.1, -0.13, 0.1, 0.13, top - 22, top - 4);
  s.spire(0, 0, 0.09, top - 4, top + 18, PX.gold, true);
  const [cx, cy] = s.P(0, 0.2, top - 30);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy <= 9) s.dot(cx + dx, cy + dy, dx * dx + dy * dy >= 4 ? [226, 181, 59] : [240, 236, 224], 1, 0.02);
  }
  return s.toSprite();
}

registerLandmark('msu', (w, h) => buildMsu(w, h));
