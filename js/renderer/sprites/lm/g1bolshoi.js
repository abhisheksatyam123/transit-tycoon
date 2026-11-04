/** R5e: Bolshoi Theatre (1x1): cream neoclassical box, 8-column portico with pediment, Apollo quadriga, green roof. */
import { registerLandmark } from './registry.js';
import { build, C, lerp2 } from './g1lib.js';
import { PX } from '../pixelArt.js';

/** Portico faces +v (viewer's left). Columns run along u across the front. */
function draw(s) {
  // main block (roof ~ 30 m)
  s.box(-0.36, -0.3, 0.36, 0.3, 0, 30, C.kCream, { top: C.kGreen, windows: { rows: 2, cols: 6, colour: PX.window, lit: 0.1 } });
  // portico projecting on +v face
  s.box(-0.3, 0.3, 0.3, 0.42, 0, 36, C.kWhite, { noTop: true });
  for (let i = 0; i < 8; i++) {
    const u = -0.28 + i * 0.08;
    s.poly3([[u, 0.4, 0], [u + 0.03, 0.4, 0], [u + 0.03, 0.4, 30], [u, 0.4, 30]], C.kWhite, 1.0);
  }
  // pediment
  s.poly3([[-0.32, 0.42, 36], [0.32, 0.42, 36], [0, 0.42, 44]], C.kWhite, 1.0);
  // green roof slope behind the drum
  s.box(-0.3, -0.26, 0.3, 0.2, 30, 33, C.kGreen);
  // quadriga on top: chariot block + 4 horses as small blobs
  s.box(-0.08, -0.06, 0.08, 0.06, 33, 37, C.kBronze);
  for (const du of [-0.1, -0.04, 0.02, 0.08]) s.box(du - 0.02, -0.02, du + 0.02, 0.02, 37, 40, C.kBronze);
}

registerLandmark('bolshoi', () => build(1, 1, 60, draw));
