/** R5e: Cathedral of Christ the Saviour (1x1): white cube, one huge central gold dome, four smaller gold domes (103 m). */
import { registerLandmark } from './registry.js';
import { build, C } from './g1lib.js';
import { PX } from '../pixelArt.js';

function draw(s) {
  // stepped white platform + cube
  s.box(-0.42, -0.42, 0.42, 0.42, 0, 6, C.kGreyStone);
  s.box(-0.34, -0.34, 0.34, 0.34, 6, 34, C.kWhite, { windows: { rows: 4, cols: 5, colour: PX.window, lit: 0.1 } });
  // four corner drums with small domes
  for (const [u, v] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) {
    s.cylinder(u, v, 0.06, 34, 42, C.kWhite);
    s.onion(u, v, 0.075, 42, 22, C.kGold, C.kGold);
  }
  // central drum and huge gold dome (top ~ 84 px)
  s.cylinder(0, 0, 0.14, 34, 46, C.kWhite);
  s.onion(0, 0, 0.19, 46, 38, C.kGold, C.kGold);
}

registerLandmark('christ_saviour', () => build(1, 1, 110, draw));
