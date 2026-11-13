/**
 * D19 render: with `shipDiagonal` on, a ship's diagonal step is interpolated on the true line (Euclidean length)
 * and faces the nearest of the 4 axis facings. Off = the Manhattan path is unchanged.
 */
import { describe, it, expect } from 'bun:test';
import { getVehicleSegments } from '../js/simulation/vehicles.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';

function ship(path, pathIndex, progress) {
  return { kind: 'ship', state: 'moving', path, pathIndex, progress, history: path.slice(0, pathIndex + 1).reverse(),
    load: { amount: 0 }, capacity: 0, wagons: 0, cargoId: null, roadType: null, tx: path[0].x, ty: path[0].y };
}
const st = (on) => ({ settings: { ...DEFAULT_SETTINGS, shipDiagonal: on } });

describe('D19 ship render', () => {
  it('default setting is off', () => {
    expect(DEFAULT_SETTINGS.shipDiagonal).toBe(false);
  });

  it('diagonal step, halfway: position on the straight line between the tiles', () => {
    const v = ship([{ x: 2, y: 2 }, { x: 3, y: 3 }], 0, 0.5);
    const seg = getVehicleSegments(v, st(true))[0];
    expect(seg.x).toBeCloseTo(2.5, 6);
    expect(seg.y).toBeCloseTo(2.5, 6);
  });

  it('diagonal step faces one of the 4 axis facings (1,2,4,8)', () => {
    const v = ship([{ x: 2, y: 2 }, { x: 3, y: 3 }], 0, 0.5);
    const seg = getVehicleSegments(v, st(true))[0];
    expect([1, 2, 4, 8]).toContain(seg.dir);
  });

  it('axis steps are unaffected by the setting', () => {
    const v = ship([{ x: 2, y: 2 }, { x: 3, y: 2 }], 0, 0.25);
    const on = getVehicleSegments(v, st(true))[0];
    const off = getVehicleSegments(v, st(false))[0];
    expect(on).toEqual(off);
    expect(on.x).toBeCloseTo(2.25, 6);
    expect(on.dir).toBe(2); // travelling east
  });

  it('setting off keeps the old result for diagonal history (no state passed)', () => {
    const v = ship([{ x: 2, y: 2 }, { x: 3, y: 3 }], 0, 0.5);
    const off = getVehicleSegments(v, st(false))[0];
    expect(off.x).toBeCloseTo(2.5, 6);
    expect(off.y).toBeCloseTo(2.5, 6);
  });
});
