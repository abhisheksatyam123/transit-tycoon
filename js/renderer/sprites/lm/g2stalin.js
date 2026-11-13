/** R5f: Stalinist "wedding cake" skyscrapers (Seven Sisters family): MSU, Ukraina, Kotelnicheskaya, Kudrinskaya, MID,
 *  Leningradskaya, Red Gates. One builder, parameterised per building. Tile space: footprint centre = (0,0). */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const WIN = PX.window;
const cols = (lenPx) => Math.max(2, Math.round(lenPx / 4));
const floors = (z0, z1) => Math.max(2, Math.round((z1 - z0) / 4));

/** Box with dense window grid on both visible faces (unless noWin). */
function bx(s, u0, v0, u1, v1, z0, z1, colour, noWin = false) {
  const windows = noWin ? undefined : {
    rows: floors(z0, z1), cols: cols((u1 - u0) * 32), colsR: cols((v1 - v0) * 32), colour: WIN, lit: 0.18,
  };
  s.box(u0, v0, u1, v1, z0, z1, colour, { windows });
}

/** Small round clock (gold rim, white face) on a visible face, in screen space. */
function clock(s, u, v, z, r = 3) {
  const [x, y] = s.P(u, v, z);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy;
    if (d > r * r) continue;
    s.dot(x + dx, y + dy, d >= (r - 1) * (r - 1) ? [226, 181, 59] : [240, 236, 224], 1, 0.02);
  }
}

/**
 * Build one Stalinist skyscraper.
 * @param {number} w footprint w (tiles) @param {number} h footprint h
 * @param {{m:number, wing:number, wD:number, wH:number, hw:number, hd:number, tiers:Array<[number,number]>,
 *   spireCol:string, star:boolean, steps?:boolean, corners?:boolean, cornerH?:number, body?:string, clockOn?:boolean}} sp
 */
function buildStalin(w, h, sp) {
  const top = heightPx(sp.m);
  const s = footprintPixel(w, h, top);
  const zc = (f) => Math.round(top * f);
  const body = sp.body || PX.cream;
  const wz = zc(sp.wH);
  // plinth (dark brown-red base)
  bx(s, -sp.wing, -sp.wD, sp.wing, sp.wD, 0, 6, PX.brickDark, true);
  // wings: outer blocks step down when sp.steps
  if (sp.steps) {
    bx(s, -sp.wing, -sp.wD, sp.wing, sp.wD, 6, Math.round(wz * 0.6), body);
    bx(s, -sp.wing * 0.5, -sp.wD, sp.wing * 0.5, sp.wD, 6, wz, body);
  } else {
    bx(s, -sp.wing, -sp.wD, sp.wing, sp.wD, 6, wz, body);
  }
  // corner towers: back ones first, front ones after the central tower
  const corners = sp.corners ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [];
  const cu = (c) => [c[0] * (sp.wing - 0.03), c[1] * (sp.wD - 0.03)];
  const drawCorner = (c) => {
    const [u, v] = cu(c), ch = zc(sp.cornerH || 0.62), hh = 0.07;
    bx(s, u - hh, v - hh, u + hh, v + hh, wz, ch, body);
    s.spire(u, v, hh, ch, ch + Math.round(top * 0.12), PX.copper, false);
  };
  corners.filter((c) => c[0] + c[1] < 0).forEach(drawCorner);
  // central tiers, stacked upwards and narrowing
  let zPrev = 0, last = { sc: 1, z: wz };
  for (const [sc, f] of sp.tiers) {
    const z1 = zc(f);
    bx(s, -sp.hw * sc, -sp.hd * sc, sp.hw * sc, sp.hd * sc, zPrev, z1, body);
    zPrev = z1; last = { sc, z: z1 };
  }
  if (sp.clockOn) clock(s, 0, sp.hd * last.sc * 0.0 + sp.hd, zc(sp.tiers[0][1]) * 0.7, 3);
  // spire from the top tier to the top (star on top)
  const hwTop = Math.max(0.03, sp.hw * last.sc * 0.55);
  s.spire(0, 0, hwTop, last.z, top - 4, sp.spireCol, sp.star);
  corners.filter((c) => c[0] + c[1] >= 0).forEach(drawCorner);
  return s.toSprite();
}

/** Parameters per Seven Sisters building (real heights in metres, shapes from photos). */
const SEVEN_SISTERS = {
  ukraina: { m: 206, wing: 0.6, wD: 0.36, wH: 0.45, hw: 0.32, hd: 0.26, tiers: [[1, 0.6], [0.66, 0.82], [0.4, 0.92]],
    spireCol: PX.copper, star: true, corners: true, cornerH: 0.7 },
  kotelnicheskaya: { m: 176, wing: 0.86, wD: 0.3, wH: 0.4, hw: 0.2, hd: 0.2, tiers: [[1, 0.6], [0.7, 0.88]],
    spireCol: PX.copper, star: true, steps: true, body: '#d9c79a' },
  kudrinskaya: { m: 156, wing: 0.62, wD: 0.3, wH: 0.4, hw: 0.24, hd: 0.24, tiers: [[1, 0.45], [0.66, 0.78], [0.42, 0.9]],
    spireCol: PX.copper, star: true, corners: true },
  mid: { m: 172, wing: 0.7, wD: 0.4, wH: 0.38, hw: 0.34, hd: 0.3, tiers: [[1, 0.4], [0.75, 0.72], [0.5, 0.86]],
    spireCol: PX.sand, star: false, corners: true, cornerH: 0.5 },
  leningradskaya: { m: 136, wing: 0.44, wD: 0.3, wH: 0.45, hw: 0.24, hd: 0.2, tiers: [[1, 0.62], [0.6, 0.86]],
    spireCol: PX.copper, star: true },
  red_gates: { m: 133, wing: 0.52, wD: 0.3, wH: 0.42, hw: 0.22, hd: 0.2, tiers: [[1, 0.5], [0.55, 0.8]],
    spireCol: PX.copper, star: true, corners: true, cornerH: 0.6, body: PX.cream },
};

for (const [id, sp] of Object.entries(SEVEN_SISTERS)) {
  registerLandmark(id, (w, h) => buildStalin(w, h, sp));
}
