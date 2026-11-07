/**
 * Disaster vehicles (zeppelin, small UFO): procedural sprites (OpenGFX has no disaster sprites in the pack).
 * Drawn only while state.disasters holds an active disaster, so an idle world costs nothing.
 */

/** Blimp body and the crashed-on-runway smoke pose (OpenTTD SPR_BLIMP / SPR_BLIMP_CRASHED stand-in). */
function drawBlimp(ctx, p, crashed) {
  ctx.save();
  ctx.translate(p.x, p.y - 60);
  ctx.fillStyle = crashed ? '#7a6a58' : '#d8dde6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a4a66';
  ctx.fillRect(-8, 6, 16, 4);
  ctx.restore();
}

/** Small UFO: a saucer with a light (OpenTTD SPR_UFO_SMALL_SCOUT stand-in). */
function drawUfo(ctx, p, alt, flash) {
  ctx.save();
  ctx.translate(p.x, p.y - 40 - alt * 20);
  ctx.fillStyle = '#9ad8ff';
  ctx.beginPath();
  ctx.ellipse(0, -3, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? '#ffe066' : '#b0b8c4';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the active disasters above the map pass.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state game state (reads state.disasters)
 * @param {(x:number,y:number)=>{x:number,y:number}} toScreen tile (float) -> canvas point
 * @param {number} frame renderer frame counter (UFO light flashes)
 */
export function drawDisasters(ctx, state, toScreen, frame) {
  const d = state && state.disasters;
  if (!d) return;
  if (d.zep) {
    const z = d.zep;
    if (z.state === 0) drawBlimp(ctx, toScreen(z.x, z.y), false);
    else if (z.state === 1) drawBlimp(ctx, toScreen(z.fx != null ? z.fx : z.x, z.fy != null ? z.fy : z.y), false);
    else drawBlimp(ctx, toScreen(z.fx != null ? z.fx : z.x, z.fy != null ? z.fy : z.y), true);
  }
  if (d.ufo) {
    const u = d.ufo;
    drawUfo(ctx, toScreen(u.x, u.y), u.alt != null ? u.alt : 1, (frame & 8) !== 0);
  }
}
