/**
 * Ground layer: sloped terrain tops and animated water following the continuous corner heights
 * (see heights.js), a dark earth skirt on the map's south/east edges only, and shore foam.
 * Called per tile in painter's order by the renderer.
 */
import { terrainTop, waterTop, TERRAIN_VARIANTS, WATER_FRAMES } from '../sprites/terrain.js';
import { tileHash, makeSprite } from '../sprites/canvas.js';
import { HALF_W, HALF_H, TILE_W, TILE_H, HEIGHT_STEP as S } from '../iso.js';
import { drawSloped } from '../slope.js';
import { cliffFace } from '../sprites/terrain.js';
import { blit } from '../sprites/canvas.js';
import { packActive, packState } from '../pack/state.js';
import { drawOgfxGround } from '../pack/ground.js';
import { arcticActive, drawArcticSnow, drawArcticRock } from '../pack/arctic.js';
import { tropicActive, drawTropicDesert } from '../pack/tropic.js';
import { toylandActive, drawToylandGround } from '../pack/toyland.js';
import { tropicZoneAt } from '../../simulation/climate.js';
import { drawCanalPack, drawRiverPack, drawRiverBanks, extraActive, RIVER_BANKS, RIVER_INSET } from '../pack/extra.js';

/** flat corner heights (river/shore helpers) */
const flat = (c) => c[0] === c[1] && c[1] === c[2] && c[2] === c[3];

/** True when a river tile borders land on any side (only then is its water clipped). */
function riverHasLand(map, x, y) {
  const W = map.width, H = map.height, t = map.tiles;
  const water = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && (!!t[ny * W + nx].canal || t[ny * W + nx].terrain === 'water');
  return !water(x, y - 1) || !water(x + 1, y) || !water(x, y + 1) || !water(x - 1, y);
}

/**
 * Clip path of a flat river tile (centre cx, cy): the diamond with each land-bordering edge pushed inward by
 * RIVER_INSET px. Corner N sits between edges N-E (neighbour N) and W-N (neighbour W), and so on.
 */
function riverClipPath(ctx, map, x, y, cx, cy) {
  const W = map.width, H = map.height, t = map.tiles;
  const water = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && (!!t[ny * W + nx].canal || t[ny * W + nx].terrain === 'water');
  const land = [!water(x, y - 1), !water(x + 1, y), !water(x, y + 1), !water(x - 1, y)];
  // inward unit normals of edges: 0 N-E, 1 E-S, 2 S-W, 3 W-N
  const nrm = [[-0.894, 0.447], [-0.894, -0.447], [0.894, -0.447], [0.894, 0.447]];
  const d = RIVER_INSET;
  const corner = (px, py, e1, e2) => {
    let ox = 0, oy = 0;
    if (land[e1]) { ox += nrm[e1][0] * d; oy += nrm[e1][1] * d; }
    if (land[e2]) { ox += nrm[e2][0] * d; oy += nrm[e2][1] * d; }
    return [px + ox, py + oy];
  };
  const N = corner(cx, cy - 16, 0, 3), E = corner(cx + 32, cy, 1, 0), S = corner(cx, cy + 16, 2, 1), Wp = corner(cx - 32, cy, 3, 2);
  ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(S[0], S[1]); ctx.lineTo(Wp[0], Wp[1]); ctx.closePath();
}

/** Fast array memo of sprites (avoids string-key allocation per tile per frame). */
const KINDS = ['grass', 'forest', 'desert', 'rock', 'snow', 'water'];
const KIND_INDEX = { grass: 0, forest: 1, desert: 2, rock: 3, snow: 4, water: 5 };
/** colour of the map-edge skirt */
const SKIRT = '#3b2f22';
/** @type {any[]} index: kind*TERRAIN_VARIANTS + variant */
const tops = [];
/** @type {any[]} index: frame*TERRAIN_VARIANTS + variant */
const waters = [];

/**
 * @param {number} k kind index
 * @param {number} v variant
 */
function top(k, v) {
  const i = k * TERRAIN_VARIANTS + v;
  return tops[i] || (tops[i] = terrainTop(KINDS[k], v));
}

/**
 * Draw the ground of one tile.
 * @param {CanvasRenderingContext2D} ctx world-space context
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx screen x of tile centre (flat, height 0)
 * @param {number} sy screen y of tile centre (flat, height 0)
 * @param {number} frame animation frame counter
 * @param {number[]} c corner heights [hN,hE,hS,hW] (levels) from Heights.tileCorners
 */
export function drawGround(ctx, map, x, y, sx, sy, frame, c) {
  const W = map.width, H = map.height;
  const tile = map.tiles[y * W + x];
  const hash = tileHash(x, y);
  const k = KIND_INDEX[tile.terrain] ?? 0;
  // canal and lock water (tile.canal) follows the terrain heights too (a lock tile is a slope): procedural water
  const flowing = !!(tile.river || tile.canal);
  // EXTRA pack (canal dikes/locks, river slopes; pack/extra.js): drawn in place of the procedural water when present
  // locks: rear wall at tile origin, front wall at the OTTD DrawTileSeq offset (pack/extra.js); tram overlay stays procedural (anchor unverified)
  if (tile.canal && extraActive() && drawCanalPack(ctx, map, x, y, sx, sy, c, tile.lock ?? null)) return;
  if (tile.river && !tile.canal && extraActive() && c.some((h) => h !== c[0]) && drawRiverPack(ctx, map, x, y, sx, sy, c)) return;
  // river tiles (tile.river) sit on slopes: the flat water sprite 4061 would leave a wedge, so they are drawn procedurally
  // sub-arctic (opt-in, pack/arctic.js): tiles at or above the snow line get OpenGFX snowy ground (OpenTTD DrawClearLandTile)
  if (arcticActive() && k !== 5 && !flowing && drawArcticSnow(ctx, sx, sy, c)) {
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  }
  // sub-tropical (opt-in, pack/tropic.js): OpenTTD desert ground in the desert zone (and on desert terrain); trees (cacti) in the desert zone stand on sand too
  if (tropicActive(packState.enabled) && (k === 2 || ((k === 0 || k === 1) && tropicZoneAt(map, x, y) === 1)) && !flowing && drawTropicDesert(ctx, sx, sy, c, hash)) {
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  }
  // toyland (opt-in, pack/toyland.js): OpenGFX toyland ground for land and desert kinds (not water, not river/canal)
  if (toylandActive(packState.enabled) && k !== 5 && !flowing && drawToylandGround(ctx, sx, sy, c, hash, tile.terrain)) {
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  }
  // sub-arctic rocky ground (render-only, a few percent of clear grass away from towns and roads; arctic games only)
  if (arcticActive() && k === 0 && !flowing && rockTile(map, x, y, hash) && drawArcticRock(ctx, sx, sy, c)) {
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  }
  if (packActive() && k === 5 && !flowing) { // water: OpenGFX flat water tile 4061 (water_land.h SPR_FLAT_WATER_TILE)
    if (drawOgfxGround(ctx, 'water', hash, sx, sy, c)) return;
  } else if (packActive() && k === 5 && tile.river && !tile.canal && !flat(c) && drawRiverSlopeFallback(ctx, sx, sy, c)) {
    // WB: sloped river tile with no rapids sprite: flat diamond in the averaged 4061 colour, so it matches the OGFX water
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  } else if (packActive() && k === 5 && tile.river && !tile.canal && flat(c) && riverFlatUnderlay(ctx, sx, sy, c) && drawOgfxGround(ctx, 'water', hash, sx, sy, c)) {
    // flat river (WB): OpenGFX flat water 4061 under the bank pieces, which are drawn on top so the sprite edge is covered
    if (!(RIVER_BANKS && extraActive() && riverHasLand(map, x, y) && drawRiverBanks(ctx, map, x, y, sx, sy, c))) drawShore(ctx, map, x, y, sx, sy, c);
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    return;
  } else if (packActive() && !flowing) { // OpenGFX slope sprite (OpenTTD clear_land.h + landscape.cpp)
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    // Flat land next to water is plain land in OpenTTD; the OpenGFX shore sprites (4062..) are for
    // sloped coast tiles only, which our flat-water vertex model does not produce (pack/water.js unused).
    if (drawOgfxGround(ctx, tile.terrain, hash, sx, sy, c)) { drawCliffWalls(ctx, map, x, y, sx, sy, tile); return; }
  }
  if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
  if (k === 5) {
    const f = ((frame >> 3) + (hash & 7)) % WATER_FRAMES;
    const i = f * TERRAIN_VARIANTS + (hash % TERRAIN_VARIANTS);
    const water = waters[i] || (waters[i] = waterTop(f, hash % TERRAIN_VARIANTS));
    if (tile.river && !tile.canal && RIVER_BANKS && extraActive() && flat(c)) {
      // flat river: the water diamond is clipped only along its LAND edges (inset RIVER_INSET px), so the bank
      // pieces own the outer edge and no water sliver shows; water-water edges stay full (no seam)
      if (riverHasLand(map, x, y)) {
        ctx.save();
        ctx.beginPath();
        riverClipPath(ctx, map, x, y, sx, sy - S * c[0]);
        ctx.clip();
        drawSloped(ctx, water, sx, sy, c);
        ctx.restore();
      } else drawSloped(ctx, water, sx, sy, c); // all-water neighbours: no clip, so no anti-aliased seam
      if (!drawRiverBanks(ctx, map, x, y, sx, sy, c)) drawShore(ctx, map, x, y, sx, sy, c);
    } else {
      drawSloped(ctx, water, sx, sy, c);
      drawShore(ctx, map, x, y, sx, sy, c);
    }
    if (tile.canal) drawCanal(ctx, map, x, y, sx, sy, c, tile.lock);
  } else {
    drawSloped(ctx, top(k, hash % TERRAIN_VARIANTS), sx, sy, c);
    if (!flowing) drawCliffWalls(ctx, map, x, y, sx, sy, tile);
  }
}

/** Steps of at least this many levels get a vertical cliff face (cliffs mapgen option; default maps never reach it). */
const CLIFF_WALL_STEP = 2;
/**
 * Vertical cliff faces under a raised tile's south-west / south-east edge when the neighbour is CLIFF_WALL_STEP or more
 * levels lower (cliffs mapgen option; cliffFace sprite, sprites/terrain.js). Normal maps have no such step, so this
 * costs two comparisons per tile per chunk build. Drawn in the tile's own painter slot, so the lower neighbour's top
 * covers the foot of the wall. Walls on water and river/canal tiles are skipped.
 */
function drawCliffWalls(ctx, map, x, y, sx, sy, tile) {
  const W = map.width, H = map.height, t = map.tiles;
  const h = tile.height;
  if (h < CLIFF_WALL_STEP || tile.terrain === 'water') return;
  if (y + 1 < H) {
    const d = h - t[(y + 1) * W + x].height;
    if (d >= CLIFF_WALL_STEP) blit(ctx, cliffFace(tile.terrain, 'sw', d), sx, sy - S * h);
  }
  if (x + 1 < W) {
    const d = h - t[y * W + x + 1].height;
    if (d >= CLIFF_WALL_STEP) blit(ctx, cliffFace(tile.terrain, 'se', d), sx, sy - S * h);
  }
}

/** Flat river tile: mean-colour diamond under 4061 so its transparent jagged edge shows water, not the dark canvas (WB3). */
function riverFlatUnderlay(ctx, sx, sy, c) {
  const pack = packState.pack;
  if (!pack || !pack.sprites[4061]) return false;
  const col = waterMeanColour(pack.sprites[4061], pack);
  ctx.beginPath();
  ctx.moveTo(sx, sy - HALF_H - S * c[0]); ctx.lineTo(sx + HALF_W, sy - S * c[1]);
  ctx.lineTo(sx, sy + HALF_H - S * c[2]); ctx.lineTo(sx - HALF_W, sy - S * c[3]); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  return true;
}
/** Sprite made from the OpenGFX flat water 4061 pixels (WB3), built once: a tile-sized diamond at the anchor. */
let waterSpr = null;
/**
 * Sloped river tile without a rapids sprite: the 4061 texture drawn through drawSloped (same plane clip as the
 * procedural water), so it matches the flat 4061 tiles beside it.
 * @returns {boolean} false when the pack's water sprite is missing (caller keeps the procedural water)
 */
function drawRiverSlopeFallback(ctx, sx, sy, c) {
  const pack = packState.pack;
  const sp = pack && pack.sprites[4061];
  if (!sp) return false;
  if (!waterSpr) {
    const [ai, x0, y0, w0, h0] = sp;
    waterSpr = makeSprite(TILE_W, TILE_H, HALF_W, HALF_H, (g) => {
      g.imageSmoothingEnabled = false;
      g.drawImage(pack.atlases[ai], x0, y0, w0, h0, -HALF_W, -HALF_H, TILE_W, h0);
    });
  }
  // underlay: the same planes filled with the 4061 mean colour, so anti-aliased clip seams show water, not canvas
  const N = [sx, sy - HALF_H - S * c[0]], E = [sx + HALF_W, sy - S * c[1]];
  const Sp = [sx, sy + HALF_H - S * c[2]], Wp = [sx - HALF_W, sy - S * c[3]];
  ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(Sp[0], Sp[1]); ctx.lineTo(Wp[0], Wp[1]); ctx.closePath();
  ctx.fillStyle = waterMeanColour(sp, pack);
  ctx.fill();
  drawSloped(ctx, waterSpr, sx, sy, c);
  return true;
}
let waterMean = null;
/** Mean RGB of 4061 as a css colour, computed once (WB3 underlay). */
function waterMeanColour(sp, pack) {
  if (waterMean) return waterMean;
  const [ai, x0, y0, w0, h0] = sp;
  const cv = document.createElement('canvas'); cv.width = w0; cv.height = h0;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(pack.atlases[ai], x0, y0, w0, h0, 0, 0, w0, h0);
  const d = cx.getImageData(0, 0, w0, h0).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  waterMean = n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : '#284c78';
  return waterMean;
}

/**
 * Rocky ground placement (render-only, no state): ~4% of plain grass tiles whose 3x3 neighbourhood has no building,
 * road, rail or tram, so towns and networks stay clean.
 */
function rockTile(map, x, y, hash) {
  if (((hash >>> 12) % 100) >= 4) return false;
  const W = map.width, H = map.height, t = map.tiles;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const n = t[ny * W + nx];
    if (n.building || n.road || n.rail || n.tram || n.bridgeDeck) return false;
  }
  return true;
}

/** Point on the tile surface at fractions (u along +x, v along +y); corners N,E,S,W in heights c. */
function surfPt(sx, sy, c, u, v) {
  const N = [sx, sy - HALF_H - S * c[0]], E = [sx + HALF_W, sy - S * c[1]];
  const Sp = [sx, sy + HALF_H - S * c[2]], Wp = [sx - HALF_W, sy - S * c[3]];
  return [
    (1 - u) * (1 - v) * N[0] + u * (1 - v) * E[0] + u * v * Sp[0] + (1 - u) * v * Wp[0],
    (1 - u) * (1 - v) * N[1] + u * (1 - v) * E[1] + u * v * Sp[1] + (1 - u) * v * Wp[1],
  ];
}

/**
 * Canal banks (stone edge where the canal meets land) and, on a lock tile (tile.lock), the two gates across the
 * channel at the lower and upper ends. Procedural in both render modes (the OpenGFX atlas has no canal set).
 */
function drawCanal(ctx, map, x, y, sx, sy, c, lock) {
  const W = map.width, H = map.height, t = map.tiles;
  const land = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && !t[ny * W + nx].canal && t[ny * W + nx].terrain !== 'water';
  ctx.strokeStyle = '#6b5a45';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const edge = (u0, v0, u1, v1) => { const a = surfPt(sx, sy, c, u0, v0), b = surfPt(sx, sy, c, u1, v1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
  if (land(x, y - 1)) edge(0, 0, 1, 0);
  if (land(x + 1, y)) edge(1, 0, 1, 1);
  if (land(x, y + 1)) edge(0, 1, 1, 1);
  if (land(x - 1, y)) edge(0, 0, 0, 1);
  ctx.stroke();
  if (!lock) return;
  // gates: across the channel (perpendicular to the lock direction), near both ends of the tile
  const alongX = lock.dir === 2 || lock.dir === 8;
  ctx.strokeStyle = '#3a2e22';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const a of [0.12, 0.88]) {
    const p = alongX ? [[a, 0], [a, 1]] : [[0, a], [1, a]];
    const q0 = surfPt(sx, sy, c, p[0][0], p[0][1]), q1 = surfPt(sx, sy, c, p[1][0], p[1][1]);
    ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]);
  }
  ctx.stroke();
}

/**
 * Dark earth wall under the south (y = H-1) and east (x = W-1) edges, from the edge corners down
 * to level -1, so the map edge reads as a solid block. Interior tiles get no skirt.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} W
 * @param {number} H
 * @param {number} sx
 * @param {number} sy flat tile centre
 * @param {number[]} c corner heights
 */
function drawSkirt(ctx, x, y, W, H, sx, sy, c) {
  ctx.fillStyle = SKIRT;
  if (y === H - 1) {
    // south-west edge: W corner (left) to S corner (bottom)
    ctx.beginPath();
    ctx.moveTo(sx - HALF_W, sy - S * c[3]);
    ctx.lineTo(sx, sy + HALF_H - S * c[2]);
    ctx.lineTo(sx, sy + HALF_H + S);
    ctx.lineTo(sx - HALF_W, sy + S);
    ctx.closePath();
    ctx.fill();
  }
  if (x === W - 1) {
    // south-east edge: E corner (right) to S corner (bottom)
    ctx.beginPath();
    ctx.moveTo(sx + HALF_W, sy - S * c[1]);
    ctx.lineTo(sx, sy + HALF_H - S * c[2]);
    ctx.lineTo(sx, sy + HALF_H + S);
    ctx.lineTo(sx + HALF_W, sy + S);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Light foam line along water edges that border land (follows the sloped corners).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights
 */
function drawShore(ctx, map, x, y, sx, sy, c) {
  const W = map.width, H = map.height, t = map.tiles;
  const land = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && t[ny * W + nx].terrain !== 'water';
  const n = land(x, y - 1), e = land(x + 1, y), s = land(x, y + 1), w = land(x - 1, y);
  if (!(n || e || s || w)) return;
  // corners (inset slightly toward the tile centre)
  const k = 0.95;
  const cy = sy - S * (c[0] + c[1] + c[2] + c[3]) / 4;
  const pt = (px, py) => [sx + (px - sx) * k, cy + (py - cy) * k];
  const N = pt(sx, sy - HALF_H - S * c[0]);
  const E = pt(sx + HALF_W, sy - S * c[1]);
  const Sp = pt(sx, sy + HALF_H - S * c[2]);
  const Wp = pt(sx - HALF_W, sy - S * c[3]);
  ctx.strokeStyle = 'rgba(220,240,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // neighbour N (y-1) is the top-right edge, E (x+1) bottom-right, S (y+1) bottom-left, W (x-1) top-left
  if (n) { ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); }
  if (e) { ctx.moveTo(E[0], E[1]); ctx.lineTo(Sp[0], Sp[1]); }
  if (s) { ctx.moveTo(Sp[0], Sp[1]); ctx.lineTo(Wp[0], Wp[1]); }
  if (w) { ctx.moveTo(Wp[0], Wp[1]); ctx.lineTo(N[0], N[1]); }
  ctx.stroke();
}
