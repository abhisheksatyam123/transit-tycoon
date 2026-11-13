/**
 * Aircraft layer: drawn after the map pass so planes sit above everything. Each aircraft has a
 * ground shadow at its tile position and a body lifted by `alt * ALT_PX` world px.
 */
import { aircraftSprite, headingIndex, liveryIndex } from '../sprites/aircraft.js';
import { blit } from '../sprites/canvas.js';
import { packActive } from '../pack/state.js';
import { drawPackAircraft } from '../pack/vehicles.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';

/** True for a helicopter model id. */
function isHeliModel(id) {
  const m = MODEL_BY_ID[id];
  return !!(m && m.helicopter);
}

/** World px of lift at full altitude (alt = 1). */
const ALT_PX = 60;

/** @type {Map<number, {x:number,y:number,h:number}>} last screen-independent position per vehicle */
const prev = new Map();

/**
 * Heading (0..7) for an aircraft from its movement since the last frame; falls back to the
 * segment's direction bit (E=0, S=2, W=4, N=6) when stationary.
 * @param {any} s segment (x,y tile floats, dir bit, _vid)
 * @returns {number}
 */
function airHeading(s) {
  const p = prev.get(s._vid);
  let h = null;
  if (p) {
    const dx = s.x - p.x, dy = s.y - p.y;
    if (dx * dx + dy * dy > 1e-8) h = headingIndex(dx, dy);
  }
  if (h === null) {
    if (p) h = p.h;
    else h = s.dir === 2 ? 0 : s.dir === 4 ? 2 : s.dir === 8 ? 4 : s.dir === 1 ? 6 : 0;
  }
  if (p) { p.x = s.x; p.y = s.y; p.h = h; } else prev.set(s._vid, { x: s.x, y: s.y, h });
  return h;
}

/** Forget aircraft that did not appear this frame (call with the live id set size check). */
export function pruneAir(seen) {
  if (prev.size <= seen.size) return;
  for (const id of prev.keys()) if (!seen.has(id)) prev.delete(id);
}

/**
 * Draw all aircraft. Segments carry `_vid`, `_model`, `_alt` (set by the renderer) and `dir`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any[]} segs
 * @param {(x:number,y:number)=>{x:number,y:number}} toScreen tile float -> world px (ground)
 * @param {number} selV selected vehicle id
 */
export function drawAircraftLayer(ctx, segs, toScreen, selV) {
  segs.sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const s of segs) {
    const p = toScreen(s.x, s.y);
    const h = airHeading(s);
    const alt = Math.max(0, Math.min(1, s._alt || 0));
    const lv = liveryIndex(s._model, s._vid);
    // ground shadow (fades as the aircraft climbs away)
    ctx.globalAlpha = 1 - alt * 0.6;
    blit(ctx, aircraftSprite(s._model, h, lv, true), p.x, p.y);
    ctx.globalAlpha = 1;
    if (s._vid === selV) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - alt * ALT_PX, 18, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // s._gc: group livery (renderer.js; undefined = default colours). Helicopters have no OpenGFX sprite in the atlas: always the procedural rotor model
    if (!(packActive() && !isHeliModel(s._model) && drawPackAircraft(ctx, s._model, h, p.x, p.y - alt * ALT_PX, s._gc))) blit(ctx, aircraftSprite(s._model, h, lv, false, s._gc), p.x, p.y - alt * ALT_PX);
  }
}
