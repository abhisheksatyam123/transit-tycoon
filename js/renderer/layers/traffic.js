/**
 * Traffic rendering layer: isometric 3-D car sprites and a road-load heatmap.
 * Pure drawing helpers; they only read game/traffic state and never mutate it.
 */
import { packActive } from '../pack/state.js';
import { drawPackCar } from '../pack/vehicles.js';
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';
import { blit } from '../sprites/canvas.js';
import { carSprite, carTraits } from '../sprites/cars.js';
import { getPoseMap, smoothPose, poseCovered } from '../net/pose.js';
import { LANE_OFFSET, HWY_LANE_OFFSET } from '../../config/traffic.js';

/**
 * Move a car from its sim lane pose onto the smooth net centreline (render-only). The lane point is
 * projected on the ribbon, the lane offset is re-applied along the smooth normal (right of travel),
 * and the heading becomes the ribbon tangent. Blends back to the sim pose near junctions.
 * @param {{id:number,kind:string,color:number,dir:number,fx:number,fy:number,ang:number}} car
 * @returns {typeof car} the same car when not on net tiles, else a new pose object
 */
export function smoothCarPose(car) {
  const map = getPoseMap();
  if (!map || car.ang === undefined || !poseCovered(map, 'road', car.fx, car.fy)) return car;
  const p = { x: 0, y: 0, angle: 0, w: 1 };
  /** Lane offset per current tile (highway tiles use the wider offset). */
  const L = (typeof car.fx === 'number' && map.tiles[Math.floor(car.fy) * map.width + Math.floor(car.fx)]?.highway === 1
    && map.tiles[Math.floor(car.fy) * map.width + Math.floor(car.fx)]?.road)
    ? HWY_LANE_OFFSET : LANE_OFFSET;
  // remove the sim lane offset (right of the sim heading), project the centreline, re-add it
  const ox = -Math.sin(car.ang) * L, oy = Math.cos(car.ang) * L;
  const p2 = smoothPose(map, 'road', car.fx - ox, car.fy - oy, car.ang);
  if (!p2) return car;
  const nx = -Math.sin(p2.angle) * L, ny = Math.cos(p2.angle) * L;
  p.x = p2.x; p.y = p2.y; p.angle = p2.angle; p.w = p2.w;
  const w = p.w;
  let da = p.angle - car.ang;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return {
    id: car.id, kind: car.kind, color: car.color, dir: car.dir,
    fx: car.fx + (p.x + nx - car.fx) * w, fy: car.fy + (p.y + ny - car.fy) * w,
    ang: car.ang + da * w,
  };
}

/** Previous sim-tick pose per car id, used to blend between sim ticks. */
let prevPose = new Map();
let curPose = new Map();
let lastTick = -1, lastStamp = 0, tickMs = 1000 / 30;

/**
 * Sub-tick interpolation of car poses: the sim advances on fixed ticks, so each car is blended from
 * its pose on the previous tick toward its current pose by the wall-clock fraction of the tick elapsed.
 * @param {{id:number,fx:number,fy:number,ang:number}[]} cars poses for the current sim tick
 * @param {number} tick current sim tick number
 * @param {number} now wall-clock ms (performance.now())
 * @returns {{id:number,fx:number,fy:number,ang:number,dir:number,kind:string,color:number}[]}
 */
export function interpolateCars(cars, tick, now) {
  if (tick !== lastTick) {
    if (lastTick >= 0 && now > lastStamp) tickMs = Math.min(200, Math.max(10, now - lastStamp));
    prevPose = curPose;
    curPose = new Map();
    lastTick = tick;
    lastStamp = now;
  }
  const alpha = Math.min(1, Math.max(0, (now - lastStamp) / tickMs));
  const out = new Array(cars.length);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    curPose.set(c.id, c);
    const p = prevPose.get(c.id);
    if (!p) { out[i] = smoothCarPose(c); continue; }
    let da = c.ang - p.ang;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    out[i] = smoothCarPose({
      id: c.id, kind: c.kind, color: c.color, dir: c.dir,
      fx: p.fx + (c.fx - p.fx) * alpha, fy: p.fy + (c.fy - p.fy) * alpha, ang: p.ang + da * alpha,
    });
  }
  return out;
}

/** Tile-space heading (rad) -> screen heading (rad) for the iso projection (x-y, (x+y)/2). */
function screenAngle(a) {
  return Math.atan2(Math.sin(a) + Math.cos(a), Math.cos(a) - Math.sin(a));
}

/** Axis headings of the four car sprites by direction bit. */
const AXIS_ANG = { 2: 0, 4: Math.PI / 2, 8: Math.PI, 1: -Math.PI / 2 };

/**
 * Draw one car at a world-screen point on the road surface. Body type and colour come from a hash of
 * the car id. The nearest axis sprite is rotated in screen space to the exact lane heading, so cars
 * turning through a corner turn smoothly instead of snapping.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id?:number, kind?:string, color?:number, dir:number, ang?:number}} car
 * @param {number} sx world-screen x (tile-centre projected onto road surface)
 * @param {number} sy world-screen y
 */
export function drawCar(ctx, car, sx, sy) {
  if (!car) return;
  if (packActive() && drawPackCar(ctx, car, sx, sy)) return;
  const dir = AXIS_ANG[car.dir] !== undefined ? car.dir : 2;
  const t = carTraits(car.id | 0);
  const s = carSprite(t.type, t.color, dir);
  if (car.ang === undefined) { blit(ctx, s, sx, sy); return; }
  const rot = screenAngle(car.ang) - screenAngle(AXIS_ANG[dir]);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(rot);
  ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
  ctx.restore();
}

/**
 * Heat colour for a load value.
 * @param {number} load
 * @returns {string}
 */
export function heatColor(load) {
  if (load < 0.5) return 'rgb(34,197,94)';
  if (load < 1.5) return 'rgb(234,179,8)';
  return 'rgb(239,68,68)';
}

/**
 * Read the EMA load of a tile, falling back to the raw traffic array.
 * @param {any} game
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function loadAt(game, x, y) {
  try {
    if (typeof game.trafficLoad === 'function') return Number(game.trafficLoad(x, y)) || 0;
    const tr = game.state && game.state.traffic;
    if (tr && tr.load) return Number(tr.load[y * game.state.map.width + x]) || 0;
  } catch { /* ignore */ }
  return 0;
}

/**
 * Translucent diamonds on road tiles, coloured by traffic load.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} game
 * @param {{tileCorners?:(x:number,y:number)=>number[]}|null} heights renderer.heights (optional)
 * @param {{x0:number,y0:number,x1:number,y1:number}} range inclusive tile range
 */
export function drawTrafficHeat(ctx, game, heights, range) {
  if (!game || !game.state || !range) return;
  const map = game.state.map;
  const x0 = Math.max(0, range.x0 | 0), y0 = Math.max(0, range.y0 | 0);
  const x1 = Math.min(map.width - 1, range.x1 | 0), y1 = Math.min(map.height - 1, range.y1 | 0);
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = map.tiles[y * map.width + x];
      if (!tile || !tile.road) continue;
      const load = loadAt(game, x, y);
      if (load <= 0.05) continue;
      let corners = null;
      try {
        if (heights && typeof heights.tileCorners === 'function') corners = heights.tileCorners(x, y);
      } catch { corners = null; }
      const base = (x - y) * HALF_W, baseY = (x + y) * HALF_H;
      const tops = corners && corners.length === 4
        ? corners.map((h) => (Number(h) || 0) * HEIGHT_STEP)
        : [tile.height * HEIGHT_STEP, tile.height * HEIGHT_STEP, tile.height * HEIGHT_STEP, tile.height * HEIGHT_STEP];
      // corners: N (top), E (right), S (bottom), W (left)
      ctx.beginPath();
      ctx.moveTo(base, baseY - HALF_H - tops[0]);
      ctx.lineTo(base + HALF_W, baseY - tops[1]);
      ctx.lineTo(base, baseY + HALF_H - tops[2]);
      ctx.lineTo(base - HALF_W, baseY - tops[3]);
      ctx.closePath();
      ctx.fillStyle = heatColor(load);
      ctx.fill();
    }
  }
  ctx.restore();
}
