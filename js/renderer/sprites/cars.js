/**
 * Traffic car sprites: 3-D isometric cars with body types chosen by a hash of car id.
 * Types: hatch, sedan, lada, suv, taxi, van, truck, minibus, police, ambulance.
 */
import { makeSprite } from './canvas.js';
import { obox, shadow, orient, lamp, wheels } from './iso3d.js';
import { shade } from '../palette.js';

export const CAR_TYPES = ['hatch', 'sedan', 'lada', 'suv', 'taxi', 'van', 'truck', 'minibus', 'police', 'ambulance'];
/** Cumulative weights out of 100 for CAR_TYPES. */
const CUM = [18, 44, 58, 68, 77, 85, 91, 95, 98, 100];
/** Realistic body palette; index 16 = taxi yellow. */
export const CAR_PALETTE = ['#e8e8ea', '#f5f5f4', '#c4c8d0', '#9aa0aa', '#5b6068', '#1c1d21', '#1f3a66', '#23477a', '#b3261e', '#7a1f1f', '#2f6b3a', '#cdb98f', '#a8946a', '#3b5b8c', '#d9c9a0', '#c2410c', '#f5c400'];
const WHITE = 0, YELLOW = 16;
const GLASS = '#22303f';
const SIZE = 40, AX = 20, AY = 28;

/** Geometry per body type: half length/width (tile units), body top, cabin span, cabin top. */
const SPEC = {
  hatch: { L: 0.086, W: 0.036, h: 4.1, cab: [-0.52, 0.42], ch: 8.2, cw: 0.9 },
  sedan: { L: 0.098, W: 0.037, h: 4.1, cab: [-0.38, 0.28], ch: 7.8, cw: 0.87 },
  lada: { L: 0.092, W: 0.038, h: 4.5, cab: [-0.28, 0.38], ch: 8.6, cw: 0.97 },
  suv: { L: 0.098, W: 0.041, h: 5.8, cab: [-0.48, 0.28], ch: 10.0, cw: 0.94 },
  taxi: { L: 0.098, W: 0.037, h: 4.1, cab: [-0.38, 0.28], ch: 7.8, cw: 0.87 },
  van: { L: 0.118, W: 0.042, h: 8.2, cab: [0.42, 1], ch: 8.4, cw: 0.95 },
  truck: { L: 0.132, W: 0.042, h: 3.3, cab: [0.48, 1], ch: 8.4, cw: 0.95 },
  minibus: { L: 0.124, W: 0.041, h: 8.2, cab: [0.46, 1], ch: 8.6, cw: 0.95 },
  police: { L: 0.098, W: 0.037, h: 4.1, cab: [-0.38, 0.28], ch: 7.8, cw: 0.87 },
  ambulance: { L: 0.118, W: 0.042, h: 8.4, cab: [0.38, 1], ch: 8.6, cw: 0.95 },
};

/** Mix an integer into a well-distributed non-negative int. */
export function mixHash(n) {
  let h = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Body type index and palette index for a car id (deterministic).
 * @param {number} id
 * @returns {{type:number, color:number}}
 */
export function carTraits(id) {
  const h = mixHash(id | 0);
  const r = h % 100;
  let type = 0;
  while (r >= CUM[type]) type++;
  const name = CAR_TYPES[type];
  let color;
  if (name === 'taxi') color = YELLOW;
  else if (name === 'police' || name === 'ambulance') color = WHITE;
  else if (name === 'minibus') color = (h >>> 8) % 3 === 0 ? YELLOW : WHITE;
  else color = mixHash(h ^ 0x9e37) % CAR_PALETTE.length;
  return { type, color };
}

/**
 * Draw a car body in tile space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name body type
 * @param {string} col body colour
 * @param {'u'|'v'} axis
 * @param {number} s travel sign
 */
function drawCar(ctx, name, col, axis, s) {
  const sp = SPEC[name];
  const L = sp.L, W = sp.W;
  const bodyDark = shade(col, 0.82);
  const trim = shade(col, 1.18);
  shadow(ctx, axis, L + 0.022, W + 0.032);
  wheels(ctx, axis, L, W, 2.7, 0.052);
  // chassis / lower trim
  obox(ctx, axis, -L, L, -W * 0.98, W * 0.98, 1.2, 2.2, '#1f2937');
  obox(ctx, axis, -L, L, -W, W, 2.0, sp.h, col, trim);
  // side accent line
  obox(ctx, axis, -L * 0.92, L * 0.92, -W - 0.003, W + 0.003, sp.h * 0.55, sp.h * 0.55 + 0.8, bodyDark);
  if (sp.cab) {
    const [c0, c1] = sp.cab;
    const a0 = s > 0 ? c0 * L : -c1 * L, a1 = s > 0 ? c1 * L : -c0 * L;
    obox(ctx, axis, a0, a1, -W * sp.cw, W * sp.cw, sp.h, sp.ch, GLASS, col);
    // roof
    obox(ctx, axis, a0 + 0.008, a1 - 0.008, -W * (sp.cw - 0.05), W * (sp.cw - 0.05), sp.ch - 0.4, sp.ch, trim);
    // A/B pillar hint
    const mid = (a0 + a1) / 2;
    obox(ctx, axis, mid - 0.006, mid + 0.006, -W * sp.cw - 0.002, W * sp.cw + 0.002, sp.h, sp.ch - 0.2, col);
  }
  // front grille / bumper
  obox(ctx, axis, s > 0 ? L - 0.012 : -L - 0.004, s > 0 ? L + 0.004 : -L + 0.012, -W * 0.55, W * 0.55, 2.3, 3.4, '#374151');

  if (name === 'minibus') {
    obox(ctx, axis, -L * 0.9, L * 0.35, -W - 0.003, W + 0.003, sp.h * 0.42, sp.h - 0.8, GLASS);
    obox(ctx, axis, -L, L, -W, W, sp.h - 0.6, sp.h, shade(col, 1.08));
    obox(ctx, axis, s > 0 ? L * 0.55 : -L * 0.55, s > 0 ? L * 0.72 : -L * 0.38, -W - 0.003, W + 0.003, 2.4, sp.h * 0.45, '#64748b');
  }
  if (name === 'ambulance') {
    obox(ctx, axis, -L * 0.95, L * 0.25, -W - 0.003, W + 0.003, sp.h * 0.45, sp.h - 1, GLASS);
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.6, 4.2, '#dc2626');
    obox(ctx, axis, -L * 0.45, -L * 0.25, -W - 0.004, W + 0.004, sp.h * 0.55, sp.h * 0.82, '#dc2626');
    obox(ctx, axis, -L * 0.42, -L * 0.28, -W - 0.004, W + 0.004, sp.h * 0.62, sp.h * 0.75, '#f8fafc');
    obox(ctx, axis, -L * 0.38, -L * 0.32, -W - 0.004, W + 0.004, sp.h * 0.58, sp.h * 0.79, '#f8fafc');
  }
  if (name === 'van') {
    obox(ctx, axis, -L * 0.75, L * 0.3, -W - 0.003, W + 0.003, sp.h * 0.45, sp.h - 1.2, GLASS);
    obox(ctx, axis, -L, L, -W, W, sp.h - 0.5, sp.h, shade(col, 1.06));
  }
  if (name === 'truck') {
    // cargo box behind the cab
    const b0 = s > 0 ? -L : L * 0.42, b1 = s > 0 ? L * 0.42 : L;
    obox(ctx, axis, b0, b1, -W, W, 3.2, 11.5, '#e7e5e4', '#f5f5f4');
    obox(ctx, axis, b0 + 0.01, b1 - 0.01, -W - 0.003, W + 0.003, 5.5, 8.5, '#64748b');
    obox(ctx, axis, b0, b1, -W * 0.96, W * 0.96, 11.5, 12.1, '#d4d4d8');
    // mudflaps / rear
    obox(ctx, axis, s > 0 ? b0 - 0.006 : b1 - 0.002, s > 0 ? b0 + 0.002 : b1 + 0.006, -W * 0.35, W * 0.35, 1.2, 3.2, '#27272a');
  }
  if (name === 'taxi') {
    obox(ctx, axis, -0.04, 0.04, -0.022, 0.022, sp.ch, sp.ch + 2.2, '#fef08a', '#facc15');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.2, 3.1, '#111827');
    obox(ctx, axis, -L * 0.25, L * 0.25, -W - 0.003, W + 0.003, sp.h - 0.3, sp.h, '#111827');
  }
  if (name === 'police') {
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.8, 4.3, '#1d4ed8');
    obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.003, W + 0.003, 4.3, 4.8, '#e5e7eb');
    obox(ctx, axis, -0.055, 0.055, -0.032, 0.032, sp.ch, sp.ch + 1.8, '#1e293b');
    obox(ctx, axis, -0.055, -0.005, -0.032, 0.032, sp.ch + 1.8, sp.ch + 3.1, '#2563eb', '#60a5fa');
    obox(ctx, axis, 0.005, 0.055, -0.032, 0.032, sp.ch + 1.8, sp.ch + 3.1, '#ef4444', '#f87171');
  }
  // lamps: headlights front, brake/tail lights rear
  lamp(ctx, axis, s, L, -W * 0.72, -W * 0.35, 2.4, 3.8, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.35, W * 0.72, 2.4, 3.8, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.72, -W * 0.35, 2.4, 3.7, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.35, W * 0.72, 2.4, 3.7, '#ef4444');
}

/** @type {Map<number, any>} */
const cache = new Map();
const DIRIDX = { 1: 0, 2: 1, 4: 2, 8: 3 };

/**
 * Cached sprite for a body type / palette colour / direction.
 * @param {number} type index into CAR_TYPES
 * @param {number} color index into CAR_PALETTE
 * @param {number} dir direction bit
 */
export function carSprite(type, color, dir) {
  const d = DIRIDX[dir] !== undefined ? DIRIDX[dir] : 1;
  const key = (type * CAR_PALETTE.length + color) * 4 + d;
  let s = cache.get(key);
  if (s) return s;
  const name = CAR_TYPES[type];
  const col = CAR_PALETTE[color];
  s = makeSprite(SIZE, SIZE, AX, AY, (ctx) => {
    const { axis, s: sg } = orient(dir === 1 || dir === 2 || dir === 4 || dir === 8 ? dir : 2);
    drawCar(ctx, name, col, axis, sg);
  });
  cache.set(key, s);
  return s;
}
