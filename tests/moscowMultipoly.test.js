import { describe, test, expect } from 'bun:test';
import { assembleRings, polygonsOf, polygonMask } from '../tools/moscow/multipoly.js';

const P = (lat, lon) => ({ lat, lon });

describe('moscow bake multipolygons', () => {
  test('assembleRings joins split and reversed segments into one closed ring', () => {
    const a = [P(55.70, 37.50), P(55.70, 37.60)];
    const b = [P(55.75, 37.60), P(55.70, 37.60)]; // reversed
    const c = [P(55.75, 37.60), P(55.75, 37.50), P(55.70, 37.50)];
    const rings = assembleRings([a, b, c]);
    expect(rings.length).toBe(1);
    const r = rings[0];
    expect(r[0]).toEqual(r[r.length - 1]);
    expect(r.length).toBe(5);
  });

  test('relation outer minus inner rasterises with a hole', () => {
    const outer = [P(55.70, 37.50), P(55.70, 37.60), P(55.76, 37.60), P(55.76, 37.50), P(55.70, 37.50)];
    const inner = [P(55.72, 37.53), P(55.72, 37.57), P(55.74, 37.57), P(55.74, 37.53), P(55.72, 37.53)];
    const rel = { type: 'relation', id: 1, tags: { type: 'multipolygon', landuse: 'forest' },
      members: [{ type: 'way', role: 'outer', geometry: outer }, { type: 'way', role: 'inner', geometry: inner }] };
    const polys = polygonsOf([rel]);
    expect(polys.length).toBe(1);
    const full = polygonMask({ el: rel, outer: polys[0].outer, inner: [] }).n;
    const holed = polygonMask(polys[0]).n;
    expect(full).toBeGreaterThan(holed);
    expect(holed).toBeGreaterThan(0);
  });
});
