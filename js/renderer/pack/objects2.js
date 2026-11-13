/**
 * Object tiles (cmdObject.js: transmitter, lighthouse, owned land). OpenGFX sprites from the pack when
 * present (OpenTTD SPR_TRANSMITTER 2601, SPR_LIGHTHOUSE 2602); owned land has no OpenGFX sprite in the pack
 * (SPR_BOUGHT_LAND 4790 is absent), so it is drawn procedurally in both modes. Called from layers/objects.js.
 */
import { HALF_H, HALF_W } from '../iso.js';
import { blitPack } from './draw.js';
import { packActive, packState } from './state.js';

const SPR_TRANSMITTER = 2601;
const SPR_LIGHTHOUSE = 2602;

/**
 * Draw the object on a tile. (sx,sy) is the tile centre in screen px (as drawObject receives it).
 * @returns {boolean} true when drawn (false = caller should draw nothing)
 */
export function drawObjectTile(ctx, obj, x, y, sx, sy) {
  const topX = sx, topY = sy - HALF_H;
  if (obj.type === 'transmitter') {
    if (packActive() && packState.pack && packState.pack.sprites[SPR_TRANSMITTER]) {
      return blitPack(ctx, SPR_TRANSMITTER, topX, topY);
    }
    drawTransmitter(ctx, sx, sy);
    return true;
  }
  if (obj.type === 'lighthouse') {
    if (packActive() && packState.pack && packState.pack.sprites[SPR_LIGHTHOUSE]) {
      return blitPack(ctx, SPR_LIGHTHOUSE, topX, topY);
    }
    drawLighthouse(ctx, sx, sy);
    return true;
  }
  if (obj.type === 'owned') { drawOwnedLand(ctx, sx, sy); return true; }
  return false;
}

/** Procedural lattice mast with a red beacon (fallback). */
function drawTransmitter(ctx, sx, sy) {
  const base = sy + 2, top = sy - 46;
  ctx.save();
  ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx - 7, base); ctx.lineTo(sx, top); ctx.lineTo(sx + 7, base);
  ctx.moveTo(sx - 4, base - 12); ctx.lineTo(sx + 4, base - 12);
  ctx.moveTo(sx - 5, base - 24); ctx.lineTo(sx + 5, base - 24);
  ctx.moveTo(sx - 7, base); ctx.lineTo(sx + 5, base - 24); ctx.moveTo(sx + 7, base); ctx.lineTo(sx - 5, base - 24);
  ctx.moveTo(sx - 4, base - 12); ctx.lineTo(sx + 6, base - 24);
  ctx.stroke();
  ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.arc(sx, top, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Procedural white tower with a red band and a lit lamp (fallback). */
function drawLighthouse(ctx, sx, sy) {
  const base = sy + 4;
  ctx.save();
  ctx.fillStyle = '#f4f4f0'; ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(sx - 5, base); ctx.lineTo(sx - 3, base - 34); ctx.lineTo(sx + 3, base - 34); ctx.lineTo(sx + 5, base); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c33';
  ctx.beginPath(); ctx.moveTo(sx - 4.2, base - 14); ctx.lineTo(sx - 3.2, base - 20); ctx.lineTo(sx + 3.2, base - 20); ctx.lineTo(sx + 4.2, base - 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#333'; ctx.fillRect(sx - 4, base - 38, 8, 4);
  ctx.fillStyle = '#ffe36a'; ctx.fillRect(sx - 2.5, base - 37, 5, 2);
  ctx.restore();
}

/** Owned land: a light diamond with fence posts on the four corners (procedural only). */
function drawOwnedLand(ctx, sx, sy) {
  const top = sy - HALF_H, bot = sy + HALF_H, l = sx - HALF_W, r = sx + HALF_W;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(r, sy); ctx.lineTo(sx, bot); ctx.lineTo(l, sy); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f0e6a0'; ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7a5a2a';
  for (const [px, py] of [[sx, top], [r, sy], [sx, bot], [l, sy]]) ctx.fillRect(px - 1, py - 4, 2, 4);
  ctx.restore();
}
