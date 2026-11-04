/** R5e: Moscow Kremlin (3x3): irregular triangular red-brick wall, towers with green tent roofs, Ivan the Great, cathedrals, palace, Senate. */
import { registerLandmark } from './registry.js';
import { build, C, wallRun, tower, tent, lerp2 } from './g1lib.js';
import { PX } from '../pixelArt.js';

// Triangle in tile space: T = north-west corner (Alexander Garden), E = east corner (Red Square), S = south (river).
const T = [-1.3, -1.3], E = [1.5, -0.1], S = [-0.9, 1.4];
const WALL = [T, E, S];
const WALL_H = 21; // heightPx(19)

/** Towers: [u, v, half-size, body top px, roof px, star]. Body from ground. */
const TOWERS = [
  [T[0], T[1], 0.085, 26, 12, true],   // NW corner
  [E[0], E[1], 0.09, 28, 12, true],    // Vodovzvodnaya (east)
  [S[0], S[1], 0.09, 30, 13, true],    // Borovitskaya (south)
  [0.1, -0.7, 0.11, 56, 14, true],     // Spasskaya (Red Square wall, ~70 px)
  [-1.1, 0.0, 0.1, 50, 14, true],      // Troitskaya (~65 px)
  [-0.25, -1.05, 0.08, 24, 10, true],  // north wall
  [0.6, -0.6, 0.08, 24, 10, true],     // east wall
  [-0.3, 1.2, 0.08, 24, 10, true],     // river wall
  [0.9, 0.6, 0.08, 26, 11, true],      // river wall east
  [-1.0, -0.6, 0.075, 22, 10, true],   // west wall
];

/** Spasskaya clock face on the +v (viewer-left) face and a red star above (drawn after the tower). */
function clock(s, u, v, hv, z) {
  const [x, y] = s.P(u, v + hv + 0.001, z);
  const c = PX.kremlinRed ? [232, 214, 170] : [232, 214, 170];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s.dot(x + dx, y + dy, c, 1, 0.01);
  s.dot(x, y, [40, 40, 40], 1, 0);
}

/** White cathedral block with gold/silver domes. domes: [du, dv, r, h, colour]. */
function cathedral(s, cu, cv, hu, hv, bodyH, domes) {
  s.box(cu - hu, cv - hv, cu + hu, cv + hv, 0, bodyH, C.kWhite, { windows: { rows: 2, cols: 4, colour: PX.window, lit: 0.1 } });
  for (const [du, dv, r, h, col] of domes) s.onion(cu + du, cv + dv, r, bodyH, h, col, C.kGold);
}

/** Ivan the Great: two octagonal-ish tiers, drum and gold dome (~74 px). */
function ivan(s, u, v) {
  s.box(u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0, 28, C.kWhite, { windows: { rows: 3, cols: 2, colour: PX.window, lit: 0.1 } });
  s.box(u - 0.07, v - 0.07, u + 0.07, v + 0.07, 28, 48, C.kWhite, { windows: { rows: 3, cols: 2, colour: PX.window, lit: 0 } });
  s.cylinder(u, v, 0.06, 48, 52, C.kGold);
  s.onion(u, v, 0.08, 52, 22, C.kGold, C.kGold);
}

/** Grand Kremlin Palace (long, low, cream/yellow, green roof, white trim) along the river (+v). */
function palace(s) {
  s.box(-0.1, 0.3, 0.62, 0.5, 0, 26, C.kYellow, { top: C.kGreen, windows: { rows: 2, cols: 12, colour: PX.window, lit: 0.1 } });
  s.box(-0.1, 0.3, 0.62, 0.5, 26, 28, C.kWhite, { noTop: true });
}

/** Senate: yellow triangular block with a green dome (north-east corner inside the wall). */
function senate(s) {
  s.box(0.4, -0.7, 0.8, -0.5, 0, 18, C.kYellow, { windows: { rows: 2, cols: 3, colour: PX.window, lit: 0.1 } });
  tent(s, 0.6, -0.6, 0.2, 0.1, 18, 28, C.kGreen);
}

/** Draw the whole Kremlin, far-to-near (sorted by u+v; the wall first). */
function draw(s) {
  // paving inside the walls
  s.poly3([[-1.2, -1.1, 0], [1.2, -0.2, 0], [0.6, 1.0, 0], [-0.9, 1.1, 0]], C.kPaving, 1.0, false);
  const items = [{ k: -99, f: () => wallRun(s, WALL, WALL_H, C.kBrick) }];
  for (const [u, v, hw, body, roof, star] of TOWERS) {
    items.push({ k: u + v, f: () => { tower(s, u, v, hw, hw, 0, body, C.kBrick, C.kGreen, roof, star); if (u === 0.1) clock(s, u, v, hw, 46); } });
  }
  items.push({ k: -0.8, f: () => ivan(s, -0.5, -0.3) });
  items.push({ k: -0.2, f: () => cathedral(s, -0.1, 0.1, 0.2, 0.14, 16,
    [[0, 0, 0.07, 26, C.kGold], [-0.13, -0.08, 0.05, 18, C.kGold], [0.13, -0.08, 0.05, 18, C.kGold],
      [-0.13, 0.08, 0.05, 18, C.kGold], [0.13, 0.08, 0.05, 18, C.kGold]]) });
  items.push({ k: 0.0, f: () => cathedral(s, 0.35, -0.2, 0.13, 0.12, 14,
    [[0, 0, 0.06, 18, C.kGold], [-0.07, -0.05, 0.04, 12, C.kSilver], [0.07, -0.05, 0.04, 12, C.kSilver],
      [-0.07, 0.05, 0.04, 12, C.kSilver], [0.07, 0.05, 0.04, 12, C.kSilver]]) });
  items.push({ k: 0.4, f: () => palace(s) });
  items.push({ k: 0.2, f: () => senate(s) });
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f();
}

registerLandmark('kremlin', () => build(3, 3, 100, draw));
