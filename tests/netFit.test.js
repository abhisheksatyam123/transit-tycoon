import { test, expect } from 'bun:test';
import { smoothPath, RADII } from '../js/renderer/net/fit.js';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
/** Boundary-midpoint path from a start tile and step directions (like net/index.js). */
function path(x, y, steps) {
  const out = [];
  for (const d of steps) { out.push(x + DX[d] * 0.5, y + DY[d] * 0.5); x += DX[d]; y += DY[d]; }
  return out;
}
const pts = (f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
const maxDevFromChord = (P, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  return Math.max(...P.map((p) => Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L));
};

test('OpenLoco radii are extracted', () => {
  expect(RADII.railCurve).toBeGreaterThan(2);
  expect(RADII.railLarge45).toBeGreaterThan(3);
  expect(RADII.roadCurve).toBeGreaterThan(1);
});

test('straight stays straight, endpoints exact, spacing <= 0.125', () => {
  const steps = [1, 1, 1, 1, 1, 1];
  const raw = path(0, 0, steps);
  const P = pts(smoothPath(raw, { kind: 'road', steps }));
  expect(P[0]).toEqual([raw[0], raw[1]]);
  expect(P[P.length - 1]).toEqual([raw[raw.length - 2], raw[raw.length - 1]]);
  for (const p of P) expect(Math.abs(p[1])).toBeLessThan(1e-9);
  for (let i = 1; i < P.length; i++) expect(Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])).toBeLessThanOrEqual(0.1251);
});

test('1:1 staircase becomes one straight 45° line (between the axis lead-in/out)', () => {
  const steps = [1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1];
  const raw = pts(path(0, 0, steps));
  const P = pts(smoothPath(raw.flat(), { kind: 'rail', steps }));
  const mid = P.filter((p) => p[0] > 2.5 && p[0] < 5.5);
  expect(maxDevFromChord(mid, mid[0], mid[mid.length - 1])).toBeLessThan(0.02);
});

test('shallow run of 1-tile jogs becomes one straight line (no zig-zag)', () => {
  const steps = [1, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1];
  const raw = pts(path(0, 0, steps));
  const P = pts(smoothPath(raw.flat(), { kind: 'road', steps }));
  const mid = P.filter((p) => p[0] > 4.5 && p[0] < 12.5);
  expect(maxDevFromChord(mid, mid[0], mid[mid.length - 1])).toBeLessThan(0.3);
});

test('90° corner is a smooth arc (tangent continuity, axis-aligned ends)', () => {
  const steps = [1, 1, 1, 1, 2, 2, 2, 2];
  const P = pts(smoothPath(path(0, 0, steps), { kind: 'rail', steps }));
  let maxTurn = 0;
  for (let i = 2; i < P.length; i++) {
    const a = Math.atan2(P[i - 1][1] - P[i - 2][1], P[i - 1][0] - P[i - 2][0]);
    const b = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    maxTurn = Math.max(maxTurn, d);
  }
  expect(maxTurn).toBeLessThan(0.2);
  expect(Math.abs(P[1][1] - P[0][1])).toBeLessThan(1e-9); // leaves the start node along +x
  const n = P.length;
  expect(Math.abs(P[n - 1][0] - P[n - 2][0])).toBeLessThan(1e-9); // enters the end node along +y
});
