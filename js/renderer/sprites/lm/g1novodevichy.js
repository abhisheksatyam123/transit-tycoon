/** R5e: Novodevichy Convent (2x2): white walls with red corner towers, slender red-and-white bell tower, Smolensk cathedral. */
import { registerLandmark } from './registry.js';
import { build, C, wallRun, tower } from './g1lib.js';
import { PX } from '../pixelArt.js';

/** Slender tiered bell tower (red/white drums, gold spire), ~78 px. */
function bellTower(s, u, v) {
  s.cylinder(u, v, 0.11, 0, 14, C.kRed);
  s.cylinder(u, v, 0.09, 14, 30, C.kWhite);
  s.cylinder(u, v, 0.07, 30, 42, C.kRed);
  s.cylinder(u, v, 0.06, 42, 54, C.kWhite);
  s.cylinder(u, v, 0.05, 54, 62, C.kRed);
  s.cylinder(u, v, 0.04, 62, 68, C.kWhite);
  s.spire(u, v, 0.03, 68, 80, C.kGold, false);
}

/** Smolensk cathedral: white body, centre gold dome, four green domes. */
function smolensk(s, u, v) {
  s.box(u - 0.2, v - 0.14, u + 0.2, v + 0.14, 0, 24, C.kWhite, { windows: { rows: 2, cols: 4, colour: PX.window, lit: 0.1 } });
  s.onion(u, v, 0.08, 24, 24, C.kGold, C.kGold);
  for (const [du, dv] of [[-0.12, -0.07], [0.12, -0.07], [-0.12, 0.07], [0.12, 0.07]]) s.onion(u + du, v + dv, 0.05, 24, 14, C.kGreen, C.kGold);
}

function draw(s) {
  const W = [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]];
  wallRun(s, W, 12, C.kWhite);
  smolensk(s, -0.35, -0.25);
  tower(s, 0.7, -0.7, 0.12, 0.12, 0, 20, C.kRed, C.kGreen, 6);
  tower(s, -0.7, 0.7, 0.12, 0.12, 0, 20, C.kRed, C.kGreen, 6);
  bellTower(s, 0.55, 0.55);
}

registerLandmark('novodevichy', () => build(2, 2, 90, draw));
