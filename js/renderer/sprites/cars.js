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
  hatch: { L: 0.084, W: 0.035, h: 4.0, cab: [-0.5, 0.45], ch: 8.0, cw: 0.9 },
  sedan: { L: 0.094, W: 0.036, h: 4.0, cab: [-0.35, 0.3], ch: 7.6, cw: 0.86 },
  lada: { L: 0.089, W: 0.037, h: 4.4, cab: [-0.25, 0.4], ch: 8.4, cw: 0.97 },
  suv: { L: 0.094, W: 0.039, h: 5.6, cab: [-0.45, 0.3], ch: 9.6, cw: 0.94 },
  taxi: { L: 0.094, W: 0.036, h: 4.0, cab: [-0.35, 0.3], ch: 7.6, cw: 0.86 },
  van: { L: 0.114, W: 0.041, h: 8.0, cab: null, ch: 8.0, cw: 1 },
  truck: { L: 0.124, W: 0.040, h: 3.2, cab: [0.5, 1], ch: 8.0, cw: 0.95 },
  minibus: { L: 0.119, W: 0.040, h: 8.0, cab: null, ch: 8.0, cw: 1 },
  police: { L: 0.094, W: 0.036, h: 4.0, cab: [-0.35, 0.3], ch: 7.6, cw: 0.86 },
  ambulance: { L: 0.114, W: 0.041, h: 8.0, cab: null, ch: 8.0, cw: 1 },
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
  shadow(ctx, axis, L + 0.02, W + 0.03);
  wheels(ctx, axis, L, W, 2.6, 0.05);
  obox(ctx, axis, -L, L, -W, W, 1.5, sp.h, col, shade(col, 1.12));
  if (sp.cab) {
    const [c0, c1] = sp.cab;
    const a0 = s > 0 ? c0 * L : -c1 * L, a1 = s > 0 ? c1 * L : -c0 * L;
    obox(ctx, axis, a0, a1, -W * sp.cw, W * sp.cw, sp.h, sp.ch, GLASS, col);
  }
  if (name === 'minibus' || name === 'ambulance') {
    obox(ctx, axis, -L * 0.85, L * 0.85, -W - 0.003, W + 0.003, sp.h - 4, sp.h - 1.5, GLASS);
  }
  if (name === 'van') obox(ctx, axis, -L * 0.2, L * 0.9, -W - 0.003, W + 0.003, sp.h - 3.8, sp.h - 2, GLASS);
  if (name === 'truck') {
    // cargo box behind the cab
    const b0 = s > 0 ? -L : L * 0.45, b1 = s > 0 ? L * 0.45 : L;
    obox(ctx, axis, b0, b1, -W, W, 4, 11, '#e7e5e4', '#d6d3d1');
    obox(ctx, axis, b0 + 0.01, b1 - 0.01, -W - 0.003, W + 0.003, 6, 8, '#64748b');
  }
  if (name === 'taxi') {
    obox(ctx, axis, -0.035, 0.035, -0.02, 0.02, sp.ch, sp.ch + 2, '#fef9c3');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.2, 3.2, '#111827');
  }
  if (name === 'police') {
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.8, 4.2, '#1d4ed8');
    obox(ctx, axis, -0.05, 0.05, -0.03, 0.03, sp.ch, sp.ch + 2, '#1e293b');
    obox(ctx, axis, -0.05, 0.0, -0.03, 0.03, sp.ch + 2, sp.ch + 3, '#2563eb');
    obox(ctx, axis, 0.0, 0.05, -0.03, 0.03, sp.ch + 2, sp.ch + 3, '#ef4444');
  }
  if (name === 'ambulance') obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.5, 4, '#dc2626');
  // lamps: headlights front, brake/tail lights rear
  lamp(ctx, axis, s, L, -W * 0.7, -W * 0.3, 2.5, 3.8, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.3, W * 0.7, 2.5, 3.8, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.7, -W * 0.3, 2.5, 3.8, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.3, W * 0.7, 2.5, 3.8, '#ef4444');
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
