// K1: pick must return a tile whose DRAWN quad (4 corner heights, Heights frame: corners at +-0.5) contains the point.
import { test, expect, describe } from 'bun:test';
import { tileToScreen, pickTileQuad } from '../js/renderer/iso.js';
import { Heights } from '../js/renderer/heights.js';

const W = 12, H = 12;
const hAt = (x, y) => ((x * 5 + y * 3) % 6) + (x > 6 ? 2 : 0);
const tiles = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push({ terrain: 'grass', height: hAt(x, y) });
const hs = new Heights({ width: W, height: H, tiles });
const corners = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : hs.tileCorners(x, y));

/** Screen-space quad of tile (x,y) as drawn (corners at +-0.5 around the centre, heights [N,E,S,W]). */
function quadOf(x, y, c) {
  return [tileToScreen(x - 0.5, y - 0.5, c[0]), tileToScreen(x + 0.5, y - 0.5, c[1]),
    tileToScreen(x + 0.5, y + 0.5, c[2]), tileToScreen(x - 0.5, y + 0.5, c[3])];
}
/** Point in triangle (any winding, boundary counts as inside). */
function inTri(p, a, b, c) {
  const d = (u, v, w) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y);
  const d1 = d(p, a, b), d2 = d(p, b, c), d3 = d(p, c, a);
  return !((d1 < -1e-6 || d2 < -1e-6 || d3 < -1e-6) && (d1 > 1e-6 || d2 > 1e-6 || d3 > 1e-6));
}
/** Point in the drawn quad (two triangles, same split as Heights.surfaceH). */
function inQuad(p, x, y) {
  const q = quadOf(x, y, corners(x, y));
  return inTri(p, q[0], q[1], q[2]) || inTri(p, q[0], q[2], q[3]);
}

describe('pickTileQuad', () => {
  test('picked tile always contains the point in its drawn quad (sloped + raised terrain)', () => {
    const bad = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      for (const [dx, dy] of [[0, 0], [0.2, 0.1], [-0.2, 0.15], [0.1, -0.2]]) {
        const h = hs.surfaceH(x + dx, y + dy);
        const p = tileToScreen(x + dx, y + dy, h);
        const r = pickTileQuad(p.x, p.y, corners);
        if (!inQuad(p, r.x, r.y)) bad.push([x, y, dx, dy, r.x, r.y]);
      }
    }
    expect(bad).toEqual([]);
  });

  test('flat map: picked tile contains the point (flat quad)', () => {
    const flat = new Heights({ width: 10, height: 10, tiles: Array.from({ length: 100 }, () => ({ terrain: 'grass', height: 0 })) });
    const cc = (x, y) => (x < 0 || y < 0 || x >= 10 || y >= 10 ? null : flat.tileCorners(x, y));
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 37) % 300) - 150 + 0.3, sy = ((i * 53) % 200) + 0.4;
      const r = pickTileQuad(sx, sy, cc);
      if (r.x < 0 || r.y < 0 || r.x >= 10 || r.y >= 10) continue;
      const p = { x: sx, y: sy };
      const q = quadOf(r.x, r.y, cc(r.x, r.y));
      expect(inTri(p, q[0], q[1], q[2]) || inTri(p, q[0], q[2], q[3])).toBe(true);
    }
  });
});
