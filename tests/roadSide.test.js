import { describe, expect, test } from 'bun:test';
import { lanePose, trafficCars } from '../js/simulation/traffic.js';
import { LANE_OFFSET, HWY_LANE_OFFSET, roadSideSign } from '../js/config/traffic.js';
import { DEFAULT_SETTINGS, getSetting, setSetting, roadSideLocked } from '../js/simulation/settings.js';

const W = 5;
const idx = (x, y) => y * W + x;

describe('road driving side', () => {
  test('default is right-hand traffic', () => {
    expect(DEFAULT_SETTINGS.roadSide).toBe('right');
  });

  test('left side mirrors the straight lane to the north of an eastbound centre line', () => {
    const path = [idx(1, 2), idx(2, 2), idx(3, 2)];
    const r = lanePose(W, path, 1, 0.5, null, 1);
    const l = lanePose(W, path, 1, 0.5, null, -1);
    expect(r.y).toBeCloseTo(2.5 + LANE_OFFSET, 6);
    expect(l.y).toBeCloseTo(2.5 - LANE_OFFSET, 6);
    expect(l.x).toBeCloseTo(r.x, 6);
    expect(l.ang).toBeCloseTo(r.ang, 6);
  });

  test('side defaults to right when omitted (unchanged behaviour)', () => {
    const path = [idx(1, 2), idx(2, 2), idx(3, 2)];
    expect(lanePose(W, path, 1, 0.3).y).toBeCloseTo(lanePose(W, path, 1, 0.3, null, 1).y, 9);
  });

  test('highway tile mirrors the wider offset', () => {
    const path = [idx(1, 2), idx(2, 2), idx(3, 2)];
    const map = { tiles: [] };
    map.tiles[idx(2, 2)] = { highway: 1, road: 1 };
    const l = lanePose(W, path, 1, 0.5, map, -1);
    expect(l.y).toBeCloseTo(2.5 - HWY_LANE_OFFSET, 6);
  });

  test('left-side corner stays on the mirrored arc (distance from corner is unchanged)', () => {
    const path = [idx(1, 2), idx(2, 2), idx(2, 1)];
    const r = lanePose(W, path, 1, 0.5, null, 1);
    const l = lanePose(W, path, 1, 0.5, null, -1);
    const dr = Math.hypot(r.x - 2, r.y - 2); // arc centre: shared corner of tile (2,2)
    const dl = Math.hypot(l.x - 2, l.y - 2);
    // the two sides sit on opposite arcs about the corner: radii 0.5 -/+ LANE_OFFSET (sum = 1)
    expect(dr + dl).toBeCloseTo(1, 6);
    expect(Math.abs(dr - dl)).toBeCloseTo(2 * LANE_OFFSET, 6);

  });

  test('trafficCars honours the setting (left mirrors right) and the default is unchanged', () => {
    const mk = (settings) => ({
      map: { width: W, tiles: [] },
      settings,
      traffic: { cars: [{ id: 1, kind: 'car', color: 0, path: [idx(1, 2), idx(2, 2), idx(3, 2)], i: 0, t: 0.5 }] },
    });
    const right = trafficCars(mk(undefined))[0];
    const left = trafficCars(mk({ roadSide: 'left' }))[0];
    expect(right.fy).toBeCloseTo(2.5 + LANE_OFFSET, 6);
    expect(left.fy).toBeCloseTo(2.5 - LANE_OFFSET, 6);
  });

  test('getSetting falls back to right; roadSideLocked only when a road vehicle exists', () => {
    expect(getSetting({}, 'roadSide')).toBe('right');
    const st = {};
    setSetting(st, 'roadSide', 'left');
    expect(getSetting(st, 'roadSide')).toBe('left');
    expect(roadSideLocked({ vehicles: [] })).toBe(false);
    expect(roadSideLocked({ vehicles: [{ kind: 'rail' }] })).toBe(false);
    expect(roadSideLocked({ vehicles: [{ kind: 'rail' }, { kind: 'road' }] })).toBe(true);
  });

  test('renderer side sign is a plain module value (default right)', () => {
    expect(roadSideSign.value).toBe(1);
  });
});
