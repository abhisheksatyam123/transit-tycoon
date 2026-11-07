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

/** Big UFO: a larger saucer with a ring of lights (OpenTTD SPR_UFO_HARVESTER stand-in); lower when landed. */
function drawBigUfo(ctx, p, landed, flash) {
  ctx.save();
  ctx.translate(p.x, p.y - (landed ? 6 : 50));
  ctx.fillStyle = '#6a7d9a';
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9ad8ff';
  ctx.beginPath(); ctx.ellipse(0, -5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? '#ffe066' : '#c8d2e0';
  for (let i = -2; i <= 2; i++) { ctx.fillRect(i * 8 - 1, 4, 2, 2); }
  ctx.restore();
}

/** Bomber (plane) and helicopter: a fixed-wing jet or a rotor craft (OpenTTD SPR_F_15 / SPR_AH_64A stand-ins). */
function drawAircraft(ctx, p, kind, firing) {
  ctx.save();
  ctx.translate(p.x, p.y - 45);
  if (kind === 'bomber') {
    ctx.fillStyle = '#c0c8d4';
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(4, -4); ctx.lineTo(-6, -4); ctx.fill();
    ctx.fillRect(-4, -8, 8, 8);
  } else {
    ctx.fillStyle = '#4a5a3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2f25';
    ctx.fillRect(-18, -1, 36, 2); // rotor blur
  }
  if (firing) { ctx.fillStyle = '#ff7043'; ctx.fillRect(-2, 4, 4, 4); }
  ctx.restore();
}

/** Submarine: a dark hull with a conning tower at the surface (OpenTTD SPR_SUB_SMALL / SPR_SUB_LARGE stand-in). */
function drawSub(ctx, p, big) {
  ctx.save();
  ctx.translate(p.x, p.y - 2);
  ctx.fillStyle = '#1d3b52';
  ctx.beginPath(); ctx.ellipse(0, 0, big ? 16 : 11, big ? 4 : 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f5d78';
  ctx.fillRect(-2, -6, 4, 4);
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
  if (d.bigUfo) {
    const u = d.bigUfo;
    const landed = u.state === 2;
    drawBigUfo(ctx, toScreen(landed ? u.lx : u.x, landed ? u.ly : u.y), landed, (frame & 8) !== 0);
  }
  if (d.bomber) drawAircraft(ctx, toScreen(d.bomber.x, d.bomber.y), 'bomber', d.bomber.state === 1 || d.bomber.state === 2);
  if (d.heli) drawAircraft(ctx, toScreen(d.heli.x, d.heli.y), 'heli', d.heli.state === 1 || d.heli.state === 2);
  if (d.sub) drawSub(ctx, toScreen(d.sub.x, d.sub.y), d.sub.big);
}
