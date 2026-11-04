/** R5e: GUM (2x1): three parallel long cream arcades with light glass gabled roofs and green-roofed turrets (~31 px). */
import { registerLandmark } from './registry.js';
import { build, C, tower } from './g1lib.js';
import { PX } from '../pixelArt.js';

/** Long axis along u (-1..1); three blocks side by side along v. */
function draw(s) {
  for (const vc of [-0.3, 0, 0.3]) {
    s.box(-0.95, vc - 0.12, 0.95, vc + 0.12, 0, 22, C.kCream, { windows: { rows: 2, cols: 14, colour: PX.window, lit: 0.05 } });
    s.gable(-0.95, vc - 0.12, 0.95, vc + 0.12, 22, 9, C.kGlass, true);
  }
  // turrets at the ends with green hipped roofs
  tower(s, -0.95, 0, 0.1, 0.3, 0, 26, C.kCream, C.kGreen, 9);
  tower(s, 0.95, 0, 0.1, 0.3, 0, 26, C.kCream, C.kGreen, 9);
}

registerLandmark('gum', () => build(2, 1, 40, draw));
