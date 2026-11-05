/**
 * Procedural rail / road / level-crossing sprites keyed by connection bitmask (N=1,E=2,S=4,W=8)
 * plus a variant word (chamfer / bridge / grade-separated). Geometry is built in tile space
 * (u = +x, v = +y) and projected, so curves look right in iso.
 * Corner geometry (chamfer vs arc) lives in roadDiag.js.
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { quad, P } from './shapes.js';
import { EDGE, OPP, BITS, V_CHAMFER, V_BRIDGE, V_SEP, V_RCHAMFER, CORNER, cornerLine } from './roadDiag.js';

export { V_CHAMFER, V_BRIDGE, V_SEP, V_RCHAMFER };

const cache = new SpriteCache();

/**
 * Centre lines for a mask in tile space. Two adjacent bits -> quarter arc, or a 45° chamfer when
 * `chamfer` is set; opposite bits -> straight; else spokes from centre.
 * @param {number} mask
 * @param {boolean} [chamfer]
 * @returns {number[][][]} array of polylines; each polyline = [[u,v],...]
 */
export function trackPaths(mask, chamfer = false) {
  const bits = BITS.filter((b) => mask & b);
  if (bits.length === 0) return [];
  if (bits.length === 1) {
    const [u, v] = EDGE[bits[0]];
    return [[[u * 0.1, v * 0.1], [u, v]]];
  }
  if (bits.length === 2) {
    const [a, b] = bits;
    if (OPP[a] === b) return [[EDGE[a], EDGE[b]]];
    return [cornerLine(mask, chamfer)];
  }
  // junction: straight through-lines where present, spokes for the rest
  const out = [];
  const used = new Set();
  for (const b of bits) {
    if (used.has(b)) continue;
    if (mask & OPP[b]) {
      out.push([EDGE[b], EDGE[OPP[b]]]);
      used.add(b); used.add(OPP[b]);
    }
  }
  for (const b of bits) if (!used.has(b)) out.push([[0, 0], EDGE[b]]);
  return out;
}

/**
 * Offset a polyline sideways in tile space.
 * @param {number[][]} pts
 * @param {number} off
 * @returns {number[][]}
 */
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[Math.max(0, i - 1)], n = pts[Math.min(pts.length - 1, i + 1)];
    let tu = n[0] - p[0], tv = n[1] - p[1];
    const l = Math.hypot(tu, tv) || 1;
    tu /= l; tv /= l;
    out.push([pts[i][0] - tv * off, pts[i][1] + tu * off]);
  }
  return out;
}

/**
 * Stroke a tile-space polyline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {number} z
 */
function strokeLine(ctx, pts, z) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = P(pts[i][0], pts[i][1], z);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * Fill a band (polyline with half-width w) in tile space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} pts
 * @param {number} w
 * @param {number} z
 * @param {string} fill
 */
function band(ctx, pts, w, z, fill) {
  const a = offsetLine(pts, -w), b = offsetLine(pts, w).reverse();
  ctx.beginPath();
  const all = a.concat(b);
  for (let i = 0; i < all.length; i++) {
    const [x, y] = P(all[i][0], all[i][1], z);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Clip to the tile square (its diamond on screen); chamfer ends extend past it. */
function clipTile(ctx) {
  ctx.beginPath();
  const [x0, y0] = P(-0.5, -0.5, 0), [x1, y1] = P(0.5, -0.5, 0), [x2, y2] = P(0.5, 0.5, 0), [x3, y3] = P(-0.5, 0.5, 0);
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.clip();
}

/**
 * Sample points along a polyline every `step` tile units with tangent.
 * @param {number[][]} pts
 * @param {number} step
 * @returns {{u:number,v:number,tu:number,tv:number}[]}
 */
function samples(pts, step) {
  const out = [];
  let carry = step / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [u0, v0] = pts[i], [u1, v1] = pts[i + 1];
    const len = Math.hypot(u1 - u0, v1 - v0);
    if (len === 0) continue;
    const tu = (u1 - u0) / len, tv = (v1 - v0) / len;
    let d = carry;
    while (d <= len) {
      out.push({ u: u0 + tu * d, v: v0 + tv * d, tu, tv });
      d += step;
    }
    carry = d - len;
  }
  return out;
}

/**
 * Draw rails (+ optionally ballast and sleepers) for a mask into ctx at origin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask
 * @param {boolean} ballast
 * @param {boolean} [chamfer] rail corner drawn as a 45° chamfer
 */
export function drawRails(ctx, mask, ballast, chamfer = false, noStop = false) {
  const paths = trackPaths(mask, chamfer);
  if (chamfer) { ctx.save(); clipTile(ctx); }
  if (ballast) for (const p of paths) band(ctx, p, 0.24, 0, '#6f6a62');
  if (ballast) for (const p of paths) band(ctx, p, 0.19, 0.3, '#9b958a');
  ctx.strokeStyle = '#6b4424';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'butt';
  for (const p of paths) {
    for (const s of samples(p, 0.11)) {
      const a = P(s.u + s.tv * 0.19, s.v - s.tu * 0.19, 0.6), b = P(s.u - s.tv * 0.19, s.v + s.tu * 0.19, 0.6);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  ctx.lineCap = 'round';
  for (const off of [-0.1, 0.1]) {
    for (const p of paths) {
      const l = offsetLine(p, off);
      ctx.strokeStyle = '#3d3d3d'; ctx.lineWidth = 1.3; strokeLine(ctx, l, 1);
      ctx.strokeStyle = '#e6eaee'; ctx.lineWidth = 0.7; strokeLine(ctx, l, 1.4);
    }
  }
  if (chamfer) ctx.restore();
  if (!noStop && paths.length === 1 && (mask & (mask - 1)) === 0) {
    // buffer stop at dead end
    const [u, v] = EDGE[mask];
    const bu = u * 0.1, bv = v * 0.1;
    const a = P(bu - v * 0.2 * 2, bv + u * 0.2 * 2, 3), b = P(bu + v * 0.2 * 2, bv - u * 0.2 * 2, 3);
    ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}

/**
 * Road cross-section per class: 0 local street, 1 avenue dual carriageway (median), 2 wide 4-lane
 * (double yellow centre), 3 standard road (current look).
 */
const ROAD_CLS = {
  0: { W: 0.22, asphalt: '#666a71', pave: '#b3aea5' },
  1: { W: 0.44, asphalt: '#4b4f55', pave: '#a7a39a' },
  2: { W: 0.36, asphalt: '#4a4e54', pave: '#a7a39a' },
  3: { W: 0.3, asphalt: '#4b4f55', pave: '#a7a39a' },
};

/** Overhang past tile edges so neighbouring road tiles overlap instead of leaving hairline seams. */
const OVER = 0.04;

/**
 * Draw a 45° chamfer road segment (a straight diagonal band through two edge midpoints).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask corner mask
 * @param {boolean} markings
 * @param {number} cls
 */
function drawChamferRoad(ctx, mask, markings, cls) {
  const { W, asphalt, pave } = ROAD_CLS[cls] || ROAD_CLS[3];
  const pts = cornerLine(mask, true);
  ctx.save();
  clipTile(ctx);
  band(ctx, pts, W + 0.05, 0.2, pave);
  band(ctx, pts, W, 0.4, asphalt);
  if (cls === 1) {
    band(ctx, pts, 0.06, 0.45, '#5f9a4b');
    band(ctx, pts, 0.035, 0.5, '#7cae63');
  } else if (markings) {
    ctx.lineWidth = cls === 2 ? 0.6 : 0.9;
    ctx.strokeStyle = cls === 2 ? '#f2d24b' : '#f2d24b';
    if (cls === 2) {
      for (const o of [-0.03, 0.03]) strokeLine(ctx, offsetLine(pts, o), 0.6);
    } else {
      ctx.setLineDash([3, 3]);
      strokeLine(ctx, pts, 0.6);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/**
 * Bridge deck extras over water: shadow on the water, railings with posts (pillars).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask
 * @param {number} W
 * @param {boolean} chamfer
 */
function drawBridgeRails(ctx, mask, W, chamfer) {
  const paths = trackPaths(mask, chamfer);
  for (const p of paths) band(ctx, p, W + 0.12, 0, 'rgba(12,28,44,0.35)');
  for (const p of paths) {
    for (const off of [-(W + 0.05), W + 0.05]) {
      const l = offsetLine(p, off);
      ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 1.2; strokeLine(ctx, l, 0.5);
      ctx.strokeStyle = '#e4dfd2'; ctx.lineWidth = 1; strokeLine(ctx, l, 2.4);
      ctx.strokeStyle = '#b7b0a0'; ctx.lineWidth = 0.8;
      for (const s of samples(l, 0.22)) {
        const [x0, y0] = P(s.u, s.v, 0), [x1, y1] = P(s.u, s.v, 2.4);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
  }
}

/**
 * Grade-separated deck: low parapet along both edges, no posts (road passes over rails).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask
 * @param {number} W
 * @param {boolean} chamfer
 */
function drawParapet(ctx, mask, W, chamfer) {
  for (const p of trackPaths(mask, chamfer)) {
    for (const off of [-(W + 0.03), W + 0.03]) {
      const l = offsetLine(p, off);
      ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 1.4; strokeLine(ctx, l, 0.3);
      ctx.strokeStyle = '#a9afb8'; ctx.lineWidth = 1.2; strokeLine(ctx, l, 1.1);
    }
  }
}

/**
 * Draw road surface for a mask into ctx at origin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask
 * @param {boolean} [markings]
 * @param {number} [cls] road class 0..3
 * @param {number} [v] variant bits (V_CHAMFER, V_BRIDGE, V_SEP)
 */
export function drawRoad(ctx, mask, markings = true, cls = 3, v = 0) {
  const { W, asphalt, pave } = ROAD_CLS[cls] || ROAD_CLS[3];
  const chamfer = (v & V_CHAMFER) !== 0;
  if (chamfer) {
    drawChamferRoad(ctx, mask, markings, cls);
  } else if (CORNER[mask] !== undefined && cls !== 2) {
    drawArcRoad(ctx, mask, markings, cls, W, asphalt, pave);
  } else {
    drawSquareRoad(ctx, mask, markings, cls, W, asphalt, pave);
  }
  if (v & V_BRIDGE) drawBridgeRails(ctx, mask, W, chamfer);
  if (v & V_SEP) drawParapet(ctx, mask, W, chamfer);
}

/**
 * Isolated 90 degree turn drawn as a smooth quarter-circle road (radius 0.5 centre line, contract
 * geometry), with kerb-lit pavement edges and a dashed centre line.
 */
function drawArcRoad(ctx, mask, markings, cls, W, asphalt, pave) {
  const pts = cornerLine(mask, false);
  ctx.save();
  clipTile(ctx);
  band(ctx, pts, W + 0.05, 0.2, pave);
  band(ctx, pts, W, 0.4, asphalt);
  if (cls === 1) {
    band(ctx, pts, 0.06, 0.45, '#5f9a4b');
  } else if (markings) {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    strokeLine(ctx, pts, 0.6);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Square-cornered road (straights, junctions, isolated turns). */
function drawSquareRoad(ctx, mask, markings, cls, W, asphalt, pave) {
  const spokes = BITS.filter((b) => mask & b);
  const E = OVER;
  // pavement
  quad(ctx, -W - 0.05, -W - 0.05, W + 0.05, W + 0.05, 0.2, pave);
  for (const b of spokes) {
    const [u, v] = EDGE[b];
    if (u === 0) quad(ctx, -W - 0.05, Math.min(0, v) - (v ? E : 0), W + 0.05, Math.max(0, v) + (v ? E : 0), 0.2, pave);
    else quad(ctx, Math.min(0, u) - (u ? E : 0), -W - 0.05, Math.max(0, u) + (u ? E : 0), W + 0.05, 0.2, pave);
  }
  // asphalt
  quad(ctx, -W, -W, W, W, 0.4, asphalt);
  for (const b of spokes) {
    const [u, v] = EDGE[b];
    if (u === 0) quad(ctx, -W, Math.min(0, v) - (v ? E : 0), W, Math.max(0, v) + (v ? E : 0), 0.4, asphalt);
    else quad(ctx, Math.min(0, u) - (u ? E : 0), -W, Math.max(0, u) + (u ? E : 0), W, 0.4, asphalt);
  }
  if (cls === 1) {
    // dual carriageway: grass/concrete median along every straight spoke, lane dashes on each side
    const straight = spokes.length === 2 && OPP[spokes[0]] === spokes[1];
    if (straight) {
      const b = spokes[0];
      const [u, v] = EDGE[b];
      const med = u === 0 ? [-0.06, Math.min(0, v), 0.06, Math.max(0, v)] : [Math.min(0, u), -0.06, Math.max(0, u), 0.06];
      quad(ctx, med[0], med[1], med[2], med[3], 0.45, '#5f9a4b');
      quad(ctx, med[0] + 0.005, med[1] + 0.005, med[2] - 0.005, med[3] - 0.005, 0.5, '#7cae63');
    }
    if (!markings) return;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    for (const b of spokes) {
      const [u, v] = EDGE[b];
      for (const o of [-0.2, 0.2]) {
        const pts = u === 0 ? [[o, 0], [o, v]] : [[0, o], [u, o]];
        strokeLine(ctx, pts, 0.6);
      }
    }
    ctx.setLineDash([]);
    return;
  }
  if (!markings) return;
  const straight = spokes.length === 2 && OPP[spokes[0]] === spokes[1];
  if (cls === 2) {
    // double yellow centre line
    ctx.strokeStyle = '#f2d24b';
    ctx.lineWidth = 0.6;
    for (const b of spokes) {
      const [u, v] = EDGE[b];
      for (const o of [-0.03, 0.03]) {
        const pts = u === 0 ? [[o, 0], [o, v]] : [[0, o], [u, o]];
        strokeLine(ctx, pts, 0.6);
      }
    }
    return;
  }
  ctx.strokeStyle = straight ? '#f2d24b' : '#e5e7eb';
  ctx.lineWidth = 0.9;
  ctx.setLineDash([3, 3]);
  for (const b of spokes) {
    const [u, v] = EDGE[b];
    strokeLine(ctx, [[u * (straight ? 0 : 0.32), v * (straight ? 0 : 0.32)], [u, v]], 0.6);
  }
  ctx.setLineDash([]);
  if (spokes.length >= 3) {
    // zebra crossing hint at junction
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const [x, y] = P(0, 0, 0.6);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

/**
 * Rail sprite (ballast, sleepers, rails).
 * @param {number} mask
 * @param {boolean} [chamfer]
 * @returns {import('./canvas.js').Sprite}
 */
export function railSprite(mask, chamfer = false) {
  return cache.get(`r:${mask}:${chamfer ? 1 : 0}`, () => makeSprite(TILE_W, TILE_H + 4, HALF_W, HALF_H + 4, (ctx) => drawRails(ctx, mask, true, chamfer)));
}

/**
 * Road sprite.
 * @param {number} mask
 * @param {number} [cls]
 * @param {number} [v] variant bits
 * @returns {import('./canvas.js').Sprite}
 */
export function roadSprite(mask, cls = 3, v = 0) {
  return cache.get(`d:${mask}:${cls}:${v}`, () => makeSprite(TILE_W, TILE_H + 4, HALF_W, HALF_H + 4, (ctx) => drawRoad(ctx, mask, true, cls, v)));
}

/**
 * Level crossing: road with rails embedded and barrier posts. Grade-separated (V_SEP) draws the
 * road deck over the rails with a parapet instead; tunnels never reach here (rails are dropped).
 * @param {number} roadMask
 * @param {number} railMask
 * @param {number} [cls]
 * @param {number} [v] variant bits (V_CHAMFER road, V_RCHAMFER rail, V_BRIDGE, V_SEP)
 * @returns {import('./canvas.js').Sprite}
 */
export function crossingSprite(roadMask, railMask, cls = 3, v = 0) {
  return cache.get(`x:${roadMask}:${railMask}:${cls}:${v}`, () => makeSprite(TILE_W, TILE_H + 16, HALF_W, HALF_H + 16, (ctx) => {
    const sep = (v & V_SEP) !== 0;
    if (sep) {
      drawRails(ctx, railMask, false, (v & V_RCHAMFER) !== 0);
      drawRoad(ctx, roadMask, false, cls, v);
      return;
    }
    drawRoad(ctx, roadMask, false, cls, v & ~V_BRIDGE);
    drawRails(ctx, railMask, false, (v & V_RCHAMFER) !== 0);
    const alongU = (railMask & 10) !== 0;
    const posts = alongU ? [[-0.36, -0.36], [0.36, 0.36]] : [[0.36, -0.36], [-0.36, 0.36]];
    for (const [u, pv] of posts) {
      const [x, y] = P(u, pv, 0);
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x - 0.8, y - 10, 1.6, 10);
      ctx.fillStyle = '#dc2626'; ctx.fillRect(x - 0.8, y - 7, 1.6, 2); ctx.fillRect(x - 0.8, y - 3, 1.6, 2);
      ctx.beginPath(); ctx.arc(x, y - 11, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }));
}
