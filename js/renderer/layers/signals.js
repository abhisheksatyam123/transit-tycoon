/**
 * Block signal post (T3b): a small mast with a lamp drawn on a signalled rail tile.
 * Drawn in screen space at the tile centre; lamp is red when `red` is true, else green.
 *
 * OpenGFX wiring (SX4): when the OpenGFX pack is active, block/oneway/path signals blit the
 * base-pack electric light sprites 1275..1290 (light-generic.png, base-1005-rail-infra.pnml
 * `tmpl_signals(10, 50)`; per `rail_cmd.cpp DrawSingleSignal` the normal electric block sprite
 * is SPR_ORIGINAL_SIGNALS_BASE=1275). Frames are (direction pair, [red, green]):
 *   ne-sw 1275/1276, sw-ne 1277/1278, se-nw 1279/1280, nw-se 1281/1282,
 *   e-w 1283/1284, w-e 1285/1286, s-n 1287/1288, n-s 1289/1290.
 * Track tiles in TT are axis-aligned only, so only the four axis pairs are used.
 * Pre-signals (entry/exit/combo) live in extra sets 5088+ (extra-signals.pnml) which are not in
 * the base pack, so they stay procedural. When the pack is off they also stay procedural.
 */
import { HALF_H } from '../iso.js';
import { packActive, packState } from '../pack/state.js';
import { blitPack, blitPackFrom } from '../pack/draw.js';

/**
 * Data-driven signal sprite lookup (base OpenGFX electric light signals 1275..1290).
 * Each dir bit maps to {red, green} sprite ids for the axis pair used in TT.
 * dir: 0 (two-way block, axis-neutral) or 1=N, 2=E, 4=S, 8=W (TT DIRS bits).
 * Preserves prior axis mapping: E->e-w, W->w-e, N->n-s, S->s-n, default->e-w.
 */
export const SIGNAL_SPRITES = {
  0: { red: 1283, green: 1284 }, // two-way block (axis-neutral e-w)
  1: { red: 1289, green: 1290 }, // N: n-s
  2: { red: 1283, green: 1284 }, // E: e-w
  4: { red: 1287, green: 1288 }, // S: s-n
  8: { red: 1285, green: 1286 }, // W: w-e
};

/**
 * Resolve the base-pack sprite id for a block/oneway/path signal. PURE (unit-tested).
 * Data-driven via SIGNAL_SPRITES; unknown dirs fall back to the axis-neutral pair.
 * @param {number} dir TT DIRS bit (0,1,2,4,8)
 * @param {boolean} red true=reserved/red lamp, false=green/free
 * @returns {number} OpenGFX sprite id
 */
export function resolveSignalSprite(dir, red) {
  const pair = SIGNAL_SPRITES[dir] || SIGNAL_SPRITES[0];
  return red ? pair.red : pair.green;
}

/**
 * OpenGFX electric light signal sprite id for a (dir, red) pair. PURE (unit-tested).
 * Backward-compatible wrapper over resolveSignalSprite / SIGNAL_SPRITES.
 * dir: 0 (two-way block, no direction) or 1=N, 2=E, 4=S, 8=W (TT DIRS bits).
 * red=true reserved (red lamp), false green (free).
 */
export function signalSpriteId(dir, red) {
  return resolveSignalSprite(dir, red);
}

/**
 * Build the extra-pack sprite key for a pre-signal (entry/exit/combo). PURE (unit-tested).
 * Pre-signals live in EXTRA pack as `presignal_{type}.{frame}` (frames 0..15).
 * @param {'entry'|'exit'|'combo'} type
 * @param {number} dir TT DIRS bit
 * @param {boolean} red
 * @returns {string} sprite key
 */
export function presignalSpriteKey(type, dir, red) {
  return `presignal_${type}.${presignalFrame(dir, red)}`;
}

/**
 * Draw the OpenGFX signal sprite (blitPack, anchored at the tile top corner like every pack
 * sprite). Returns false when the pack is off, the sprite is missing, or the type is a
 * pre-signal (entry/exit/combo: extra set 5088+, not in the base pack).
 */
export function drawSignalSprite(ctx, sx, sy, red = false, type = 'block', dir = 0) {
  if (type === 'entry' || type === 'exit' || type === 'combo') {
    // pre-signals live in the EXTRA pack (presignal_{entry,exit,combo}.0..15), not base. Frame = dir axis pair + red/green.
    if (!packActive() || !packState.extra) return false;
    return blitPackFrom(packState.extra, ctx, presignalSpriteKey(type, dir, red), sx, sy - HALF_H);
  }
  if (!packActive()) return false;
  return blitPack(ctx, String(resolveSignalSprite(dir, red)), sx, sy - HALF_H);
}

/** Frame index for presignal sprites (same direction-pair order as signalSpriteId, frames 0..15). PURE. */
export function presignalFrame(dir, red) {
  const c = red ? 0 : 1;
  // axis pairs only: E(2) e-w pair at 8, W(8) w-e at 10, N(1) n-s at 14, S(4) s-n at 12 (tmpl_signal order)
  switch (dir) {
    case 2: return 8 + c; // E: e-w (frames 8/9)
    case 8: return 10 + c; // W: w-e (10/11)
    case 1: return 14 + c; // N: n-s (14/15)
    case 4: return 12 + c; // S: s-n (12/13)
    default: return 8 + c; // two-way
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx world-space context (tile transform active)
 * @param {number} sx tile centre x (iso)
 * @param {number} sy tile centre y (iso)
 * @param {boolean} [red]
 */
export function drawSignalPost(ctx, sx, sy, red = false, type = 'block', dir = 0) {
  // post beside the track (towards the viewer's right), tall enough to read at default zoom
  const px = sx + 6, base = sy + HALF_H * 0.3, top = base - 18;
  // OpenGFX path: blit the electric light sprite; keep distinguishing overlays (path two-lamp
  // head becomes the pair lamp, oneway gets its dir arrow) for parity with procedural.
  if (drawSignalSprite(ctx, sx, sy, red, type, dir)) {
    if (type === 'path') drawDirArrow(ctx, sx, sy, dir, '#60a5fa');
    if (type === 'oneway') drawDirArrow(ctx, sx, sy, dir, '#f9fafb');
    return;
  }
  if (type === 'entry' || type === 'exit' || type === 'combo') {
    drawPreSignal(ctx, px, base, top, red, type, dir);
    return;
  }
  if (type === 'path') {
    // path signal (T3c): tall post with two lamps, both lit red when the route ahead is reserved
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 2); ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.fillRect(px - 3.5, top - 6, 7, 13);
    const lamp = (y) => { ctx.fillStyle = red ? '#ef4444' : '#22c55e'; ctx.beginPath(); ctx.arc(px, y, 2.2, 0, Math.PI * 2); ctx.fill(); };
    lamp(top - 2); lamp(top + 3.5);
    drawDirArrow(ctx, sx, sy, dir, '#60a5fa');
    return;
  }
  if (type === 'oneway') {
    // one-way block (T3c): post with a white plate on the lamp head to tell it from the two-way mast
    drawSignalPost(ctx, sx, sy, red, 'block');
    ctx.fillStyle = '#f9fafb'; ctx.fillRect(px - 2.5, top - 2, 5, 2);
    drawDirArrow(ctx, sx, sy, dir, '#f9fafb');
    return;
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  // lamp head: dark plate with the lamp
  ctx.fillStyle = '#111827';
  ctx.fillRect(px - 3.5, top - 4, 7, 9);
  ctx.fillStyle = red ? '#ef4444' : '#22c55e';
  ctx.beginPath();
  ctx.arc(px, top + 0.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Screen-space unit vector of a dirBetween bit (iso: east = right-down, south = left-down). */
const DIR_SCREEN = { 1: [1, -1], 2: [1, 1], 4: [-1, 1], 8: [-1, -1] };

/** Small triangle on the track beside the signal, pointing the way trains may pass (dir bit). */
export function drawDirArrow(ctx, sx, sy, dir, color) {
  const v = DIR_SCREEN[dir];
  if (!v) return;
  const ux = v[0] * HALF_H * 0.5, uy = v[1] * HALF_H * 0.5;
  const cx = sx + ux * 0.9, cy = sy + uy * 0.9 + 1;
  const tx = cx + ux * 0.5, ty = cy + uy * 0.5;
  const px = -uy * 0.35, py = ux * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(cx + px, cy + py);
  ctx.lineTo(cx - px, cy - py);
  ctx.closePath();
  ctx.fill();
}

/** Pre-signal post (T3d): yellow lamp housing = entry, orange = exit, split yellow/orange = combo. */
function drawPreSignal(ctx, px, base, top, red, type, dir) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  ctx.fillStyle = '#111827'; ctx.fillRect(px - 3.5, top - 4, 7, 9);
  const housing = type === 'entry' ? '#facc15' : type === 'exit' ? '#f97316' : null;
  ctx.fillStyle = housing || '#facc15';
  ctx.fillRect(px - 2.5, top - 3, 5, 3);
  ctx.fillStyle = type === 'combo' ? '#f97316' : housing;
  ctx.fillRect(px - 2.5, top + 0.5, 5, 3);
  ctx.fillStyle = red ? '#ef4444' : '#22c55e';
  ctx.beginPath(); ctx.arc(px, top - 1.5, 1.4, 0, Math.PI * 2); ctx.fill();
  drawDirArrow(ctx, px - 6, base, dir, '#f9fafb');
}
