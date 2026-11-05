import { test, expect } from 'bun:test';
import {
  TRACK_PIECES, ROAD_PIECES, TRACK_COORDINATES, ROAD_COORDINATES,
  TRACK_MISC_DATA, ROAD_MISC_DATA, ROAD_UNK_NEXT_TO, ROAD_OCCUPATION_MASKS, CURVATURE_DEGREES,
  getTrackPiece, getRoadPiece, getUnkTrack, getUnkRoad, getTrackMiscData, getRoadMiscData,
  getRoadUnkNextTo, getRoadOccupationMask, getCurvatureDegree,
} from '../js/openloco/trackData.js';
import { TrackId, RoadId, AdditionalTaDFlags, NULL_TAD, ROTATION_OFFSET } from '../js/openloco/trackEnum.js';
import { QuarterTile } from '../js/openloco/quarterTile.js';
import { getTrackConnectionEnd, getRoadConnectionEnd } from '../js/openloco/connection.js';
import { iterateTrackToJunction } from '../js/openloco/trackIteration.js';

const rotl8 = (v, n) => ((v << n) | (v >> (8 - n))) & 0xff;

test('table sizes match the OpenLoco originals', () => {
  expect(TRACK_PIECES.length).toBe(44);
  expect(ROAD_PIECES.length).toBe(10);
  expect(TRACK_COORDINATES.length).toBe(352);
  expect(ROAD_COORDINATES.length).toBe(80);
  expect(TRACK_MISC_DATA.length).toBe(44);
  expect(ROAD_MISC_DATA.length).toBe(10);
  expect(ROAD_UNK_NEXT_TO.length).toBe(20);
  expect(ROAD_OCCUPATION_MASKS.length).toBe(128);
  expect(CURVATURE_DEGREES.length).toBe(88);
});

test('piece ids line up with TrackId / RoadId', () => {
  expect(TrackId.straight).toBe(0);
  expect(TrackId.turnaroundAnticlockwise).toBe(43);
  expect(RoadId.turnaround).toBe(9);
  expect(TRACK_PIECES[TrackId.straight][0].connectFlags).toEqual([0xff, 0xff, 0xff, 0xff]);
  expect(ROAD_PIECES[RoadId.straight][0].connectFlags).toEqual([0xff, 0xff, 0xff, 0xff]);
});

test('generateConnections invariant holds for every piece tile', () => {
  for (const table of [TRACK_PIECES, ROAD_PIECES]) {
    for (const piece of table) {
      for (const tile of piece) {
        const base = tile.connectFlags[0];
        expect(tile.connectFlags[1]).toBe(rotl8(base, 2));
        expect(tile.connectFlags[2]).toBe(rotl8(base, 4));
        expect(tile.connectFlags[3]).toBe(rotl8(base, 6));
        for (const f of tile.connectFlags) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(256); }
      }
    }
  }
});

test('tile indices are dense and x/y/z are on the expected grid', () => {
  for (const table of [TRACK_PIECES, ROAD_PIECES]) {
    for (const piece of table) {
      expect(piece.map((t) => t.index)).toEqual(piece.map((_, i) => i));
      for (const t of piece) {
        expect(Math.abs(t.x % 32)).toBe(0);
        expect(Math.abs(t.y % 32)).toBe(0);
        expect(Math.abs(t.z % 16)).toBe(0);
      }
    }
  }
});

test('coordinates tables stay in range and on the world grid', () => {
  for (const coords of [TRACK_COORDINATES, ROAD_COORDINATES]) {
    for (const c of coords) {
      expect(c.rotationBegin).toBeGreaterThanOrEqual(0);
      expect(c.rotationBegin).toBeLessThan(16);
      expect(c.rotationEnd).toBeGreaterThanOrEqual(0);
      expect(c.rotationEnd).toBeLessThan(16);
      expect(Math.abs(c.pos[0] % 32)).toBe(0);
      expect(Math.abs(c.pos[1] % 32)).toBe(0);
      expect(Math.abs(c.pos[2] % 16)).toBe(0);
    }
  }
});

test('reverse lookups agree with piece tables', () => {
  // straight: entry 4 is the reversed rotation of entry 0 (rot 2 = opposite of rot 0)
  expect(TRACK_COORDINATES[4]).toEqual({ rotationBegin: 2, rotationEnd: 2, pos: [32, 0, 0] });
  expect(getUnkTrack(4)).toEqual(TRACK_COORDINATES[4]);
  expect(getUnkRoad(4)).toEqual(ROAD_COORDINATES[4]);
});

test('lookups throw RangeError out of range', () => {
  expect(() => getTrackPiece(44)).toThrow(RangeError);
  expect(() => getRoadPiece(10)).toThrow(RangeError);
  expect(() => getUnkTrack(352)).toThrow(RangeError);
  expect(() => getUnkRoad(80)).toThrow(RangeError);
  expect(() => getTrackMiscData(44)).toThrow(RangeError);
  expect(() => getRoadMiscData(10)).toThrow(RangeError);
  expect(() => getRoadOccupationMask(128)).toThrow(RangeError);
  expect(() => getCurvatureDegree(88)).toThrow(RangeError);
  expect(() => getTrackPiece(-1)).toThrow(RangeError);
  expect(() => getUnkTrack(1.5)).toThrow(RangeError);
});

test('misc data: reverse ids are valid piece indices, sparkDirection matches curve handedness', () => {
  for (const m of TRACK_MISC_DATA) {
    expect(m.reverseTrackId).toBeGreaterThanOrEqual(0);
    expect(m.reverseTrackId).toBeLessThan(44);
    expect(m.reverseRotation).toBeLessThan(16);
  }
  expect(TRACK_MISC_DATA[TrackId.straight].sparkDirection).toBe(true);
  expect(TRACK_MISC_DATA[TrackId.leftCurveSmall].sparkDirection).toBe(true);
  expect(TRACK_MISC_DATA[TrackId.rightCurveSmall].sparkDirection).toBe(false);
  for (const m of ROAD_MISC_DATA) {
    expect(m.reverseRoadId).toBeGreaterThanOrEqual(0);
    expect(m.reverseRoadId).toBeLessThan(10);
  }
});

test('road occupation masks only carry 0x10/0x20/0x30 in the upper nibble', () => {
  for (const m of ROAD_OCCUPATION_MASKS) {
    expect([0x10, 0x20, 0x30]).toContain(m & 0xf0);
    expect(m & 0x0f).toBe(0);
  }
  expect(getRoadOccupationMask(0)).toBe(0x10);
  expect(getRoadOccupationMask(96)).toBe(0x30); // junction/turnaround section
});

test('curvature degrees match the OpenLoco table shape', () => {
  expect(getCurvatureDegree(0)).toBe(0);   // straight
  expect(getCurvatureDegree(4)).toBe(-60); // leftCurveVerySmall
  expect(getCurvatureDegree(84)).toBe(70);  // turnaround
  expect(getCurvatureDegree(85)).toBe(-70); // turnaround, reversed
  expect(getCurvatureDegree(86)).toBe(-71); // unkTurnaround
  expect(getCurvatureDegree(87)).toBe(71);
});

test('getRoadUnkNextTo: straight table is shared, index is trackAndDirection / 4', () => {
  expect(ROAD_UNK_NEXT_TO[0]).toEqual(ROAD_UNK_NEXT_TO[1]);   // straight + straight reserved share the table
  expect(ROAD_UNK_NEXT_TO[18]).toEqual(ROAD_UNK_NEXT_TO[0]);  // turnaround aliases kStraightUnkNextTo
  expect(getRoadUnkNextTo(0)).toBe(getRoadUnkNextTo(3));
  expect(getRoadUnkNextTo(4)).toBe(getRoadUnkNextTo(7));
  expect(() => getRoadUnkNextTo(80)).toThrow(RangeError);
});

test('QuarterTile: base/z nibbles and cyclic rotation', () => {
  const q = new QuarterTile(0b0111, 0b0011);
  expect(q.getBaseQuarterOccupied()).toBe(0b0111);
  expect(q.getZQuarterOccupied()).toBe(0b0011);
  expect(q.value).toBe(0b0011_0111);
  for (const raw of [0x00, 0x07, 0x0f, 0x19, 0x3c, 0x99, 0xff, 0x21]) {
    let r = QuarterTile.fromRaw(raw);
    for (let i = 0; i < 4; i++) r = r.rotate(1);
    expect(r.value).toBe(raw);
  }
  // rotation keeps each nibble within itself
  for (const raw of [0x01, 0x08, 0x10, 0x80, 0x0f, 0xf0]) {
    const r = QuarterTile.fromRaw(raw).rotate(1);
    expect(r.value & 0x0f).toBe(QuarterTile.fromRaw(raw).rotate(1).value & 0x0f);
  }
  expect(QuarterTile.fromRaw(0x01).rotate(1).value).toBe(0x02);
  expect(QuarterTile.fromRaw(0x08).rotate(1).value).toBe(0x01);
  expect(QuarterTile.fromRaw(0x10).rotate(1).value).toBe(0x20);
  expect(QuarterTile.fromRaw(0x80).rotate(1).value).toBe(0x10);
});

test('getTrackConnectionEnd / getRoadConnectionEnd match the coordinate tables', () => {
  const pos = { x: 100, y: -50, z: 32 };
  for (const tad of [0, 1, 4, 5, 100, 351]) {
    const end = getTrackConnectionEnd(pos, tad);
    const c = TRACK_COORDINATES[tad];
    expect(end.nextPos).toEqual({ x: pos.x + c.pos[0], y: pos.y + c.pos[1], z: pos.z + c.pos[2] });
    expect(end.nextRotation).toBe(c.rotationEnd);
  }
  for (const tad of [0, 1, 4, 79]) {
    const end = getRoadConnectionEnd(pos, tad);
    const c = ROAD_COORDINATES[tad];
    expect(end.nextPos).toEqual({ x: pos.x + c.pos[0], y: pos.y + c.pos[1], z: pos.z + c.pos[2] });
    expect(end.nextRotation).toBe(c.rotationEnd);
  }
  expect(() => getTrackConnectionEnd(pos, 352)).toThrow(RangeError);
  expect(() => getRoadConnectionEnd(pos, 80)).toThrow(RangeError);
});

test('additional TaD flags masks are consistent', () => {
  expect(AdditionalTaDFlags.basicTaDMask & AdditionalTaDFlags.hasSignal).toBe(0);
  expect(AdditionalTaDFlags.basicTaDWithSignalMask).toBe(AdditionalTaDFlags.basicTaDMask | AdditionalTaDFlags.hasSignal);
  expect(NULL_TAD).toBe(0xffff);
  expect(ROTATION_OFFSET.length).toBe(16);
  expect(ROTATION_OFFSET[12]).toEqual({ x: -32, y: 32 });
});

test('iterateTrackToJunction stops at junction (more than one connection)', () => {
  const filterCalls = [];
  const res = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, 0, {
    filter: (p, t) => { filterCalls.push([p.x, p.y, t]); return true; },
    getConnections: () => ({ connections: [0, 2] }),
  });
  expect(res.stoppedBy).toBe('junction');
  expect(res.steps).toBe(0);
  expect(filterCalls.length).toBe(1);
});

test('iterateTrackToJunction stops at dead end and when filter rejects', () => {
  const dead = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, 0, {
    filter: () => true,
    getConnections: () => ({ connections: [] }),
  });
  expect(dead.stoppedBy).toBe('deadend');
  const rejected = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, 0, {
    filter: () => false,
    getConnections: () => ({ connections: [0] }),
  });
  expect(rejected.stoppedBy).toBe('filter');
});

test('iterateTrackToJunction walks a closed 4-corner ring and stops at loop-back', () => {
  // Four leftCurveVerySmall (piece 2) corners form a closed ring in the Locomotion tables.
  // Corner rotations come from rotationEnd, exactly how the chain is followed in game.
  const piece = 2; // leftCurveVerySmall
  let calls = 0;
  const res = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, piece << 3, {
    filter: () => true,
    getConnections: (_pos, nextRotation) => { calls++; return { connections: [(piece << 3) | nextRotation] }; },
  });
  expect(res.stoppedBy).toBe('loop');
  expect(calls).toBe(4);
  expect(res.pos).toEqual({ x: 0, y: 0, z: 0 });
});

test('iterateTrackToJunction walks a straight chain bounded by maxSteps', () => {
  // Straight chain never loops back, so without a bound it would walk forever
  // (same as the unbounded C++ while(true)); maxSteps caps it.
  let calls = 0;
  const res = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, 0, {
    filter: () => true,
    getConnections: () => { calls++; return { connections: [0] }; },
  }, { maxSteps: 5 });
  expect(res.stoppedBy).toBe('maxSteps');
  expect(res.steps).toBe(5);
  expect(calls).toBe(5);
});

test('iterateTrackToJunction handles reversed pieces via getUnkTrack', () => {
  // tad = 4 (straight, reversed): connectionTrackStart = pos + getUnkTrack(4).pos - ROTATION_OFFSET[2]
  const seen = [];
  iterateTrackToJunction({ x: 10, y: 20, z: 0 }, 4, {
    filter: (p) => { seen.push([p.x, p.y, p.z]); return false; },
    getConnections: () => ({ connections: [4] }),
  });
  // getUnkTrack(4).pos = [32, 0, 0]; ROTATION_OFFSET[2] = {32, 0} → connectionTrackStart == pos
  expect(seen[0]).toEqual([10, 20, 0]);
});

test('iterateTrackToJunction: junction with no connections object stops', () => {
  const res = iterateTrackToJunction({ x: 0, y: 0, z: 0 }, 0, {
    filter: () => true,
    getConnections: () => null,
  });
  expect(res.stoppedBy).toBe('deadend');
});
