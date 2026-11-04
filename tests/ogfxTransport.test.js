// OpenGFX transport sprite mapping: every rail/road mask resolves to sprites in the manifest.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { railIds, cornerPiece } from '../js/renderer/pack/rail.js';
import { roadSprite } from '../js/renderer/pack/lookup.js';

const dir = new URL('../assets/opengfx/', import.meta.url).pathname;
const man = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));

test('all rail masks 1..15 map to manifest sprites (grass and bare ground)', () => {
  for (let m = 1; m < 16; m++) {
    for (const grass of [true, false]) {
      const ids = railIds(m, grass);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(man.sprites[id]).toBeDefined();
    }
  }
});

test('corner masks map to the four diagonal half-tile pieces', () => {
  expect(railIds(9)).toEqual([1013]); // N+W = UPPER
  expect(railIds(6)).toEqual([1014]); // S+E = LOWER
  expect(railIds(3)).toEqual([1015]); // N+E = RIGHT
  expect(railIds(12)).toEqual([1016]); // S+W = LEFT
  expect(cornerPiece(9)).toBe('UPPER');
  expect(cornerPiece(6)).toBe('LOWER');
  expect(cornerPiece(3)).toBe('RIGHT');
  expect(cornerPiece(12)).toBe('LEFT');
});

test('straights and crossings use X/Y/cross sprites', () => {
  expect(railIds(5)).toEqual([1012]); // N|S = X
  expect(railIds(10)).toEqual([1011]); // E|W = Y
  expect(railIds(15)).toEqual([1017]);
});

test('all 15 road masks map to existing grass and paved sprites', () => {
  for (let m = 1; m < 16; m++) {
    for (const paved of [false, true]) {
      const id = roadSprite(m, paved);
      expect(id).toBeGreaterThan(0);
      expect(man.sprites[id]).toBeDefined();
    }
  }
});

import { twoCornerSlope, railSlopeId } from '../js/renderer/pack/rail.js';
import { roadSlopeId } from '../js/renderer/pack/road.js';

test('two-corner slopes map to OpenTTD slope names', () => {
  expect(twoCornerSlope([1, 1, 0, 0])).toBe('NE');
  expect(twoCornerSlope([0, 1, 1, 0])).toBe('SE');
  expect(twoCornerSlope([0, 0, 1, 1])).toBe('SW');
  expect(twoCornerSlope([1, 0, 0, 1])).toBe('NW');
  expect(twoCornerSlope([0, 0, 0, 0])).toBe(null);
  expect(twoCornerSlope([2, 0, 0, 0])).toBe(null);
});

test('sloped rail and road use the OpenTTD slope sprites and manifest ids', () => {
  for (const s of ['NE', 'SE', 'SW', 'NW']) {
    const axis = s === 'NE' || s === 'SW' ? 5 : 10;
    const rid = railSlopeId(axis, s);
    expect(rid).toBeGreaterThanOrEqual(1031);
    expect(man.sprites[rid]).toBeDefined();
    expect(railSlopeId(axis === 5 ? 10 : 5, s)).toBe(-1);
    for (const paved of [false, true]) {
      const id = roadSlopeId(axis, s, paved);
      expect(man.sprites[id]).toBeDefined();
    }
  }
  expect(railSlopeId(5, 'NE')).toBe(1031);
  expect(railSlopeId(10, 'SE')).toBe(1032);
  expect(railSlopeId(5, 'SW')).toBe(1033);
  expect(railSlopeId(10, 'NW')).toBe(1034);
  expect(roadSlopeId(5, 'NE', false)).toBe(1343);
});

import { railStationIds, roadStopIds } from '../js/renderer/pack/stations.js';
import { railDepotIds, roadDepotId } from '../js/renderer/pack/depots.js';
import { crossingId } from '../js/renderer/pack/crossing.js';
import { BRIDGE_DECK, WATER_SPRITE, bridgeSprites } from '../js/renderer/pack/bridges.js';

test('stations, depots, crossings and bridges exist in the manifest', () => {
  for (const axis of ['x', 'y']) for (const id of railStationIds(axis)) expect(man.sprites[id]).toBeDefined();
  for (const kind of ['bus', 'truck']) for (const id of roadStopIds(kind, 5)) expect(man.sprites[id]).toBeDefined();
  for (const d of [1, 2, 4, 8]) {
    for (const id of railDepotIds(d)) expect(man.sprites[id]).toBeDefined();
    expect(man.sprites[roadDepotId(d)]).toBeDefined();
  }
  expect(man.sprites[crossingId(5, 10)]).toBeDefined();
  expect(man.sprites[crossingId(10, 5)]).toBeDefined();
  expect(man.sprites[WATER_SPRITE]).toBeDefined();
  for (const k of ['rail', 'road']) for (const a of ['x', 'y']) expect(man.sprites[BRIDGE_DECK[k][a]]).toBeDefined();
});

test('bridge water and deck sprites exist for both axes and kinds', () => {
  for (const k of ['rail', 'road']) for (const a of ['x', 'y']) for (const id of bridgeSprites(k, a)) expect(man.sprites[id]).toBeDefined();
  expect(WATER_SPRITE).toBe(4061);
});
