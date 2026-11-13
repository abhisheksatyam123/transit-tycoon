/**
 * servingStations: the cached id -> station lookup and the single-tile fast path must select exactly the
 * same stations, in exactly the same order, as the original linear findStation + Set + sort reference.
 * Covers every tile of a dense overlapping coverage index for PASS and MAIL, plus multi-tile calls.
 */
import { test, expect, describe } from 'bun:test';
import { servingStations } from '../js/simulation/cargo.js';
import { buildCoverage, acceptsFromSource } from '../js/simulation/stations.js';
import { findStation, manhattan } from '../js/simulation/state.js';

/** Original implementation (kept here verbatim as the oracle). */
function reference(state, coverage, tileIdxs, cargoId, sx, sy) {
  const ids = new Set();
  for (const i of tileIdxs) {
    const arr = coverage.get(i);
    if (arr) for (const id of arr) ids.add(id);
  }
  const list = [];
  for (const id of ids) {
    const st = findStation(state, id);
    if (st && acceptsFromSource(state, st, cargoId)) list.push(st);
  }
  list.sort((a, b) => (b.rating[cargoId] ?? 0) - (a.rating[cargoId] ?? 0)
    || manhattan(a.x, a.y, sx, sy) - manhattan(b.x, b.y, sx, sy) || a.id - b.id);
  return list.slice(0, 2);
}

/** 40 stations whose 11x11 catchments overlap in a 22x22 block (some tiles are covered by 20+ stations). */
function denseFixture() {
  const W = 64, H = 64;
  const stations = [];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let k = 0; k < 40; k++) {
    const x = 10 + (k % 10), y = 10 + Math.floor(k / 10);
    const st = {
      id: 1000 + k * 7, // non-contiguous, unsorted ids
      x, y,
      tiles: [{ x, y, radius: 5, kind: 'rail' }],
      rating: {},
      lastPickup: {},
      cargo: {},
    };
    // vary ratings so the sort (rating, distance, id) has to work; leave some cargos unrated
    if (rnd() < 0.9) st.rating.PASS = Math.floor(rnd() * 101);
    if (rnd() < 0.9) st.rating.MAIL = Math.floor(rnd() * 101);
    st.lastPickup.PASS = 1;
    if (rnd() < 0.85) st.lastPickup.MAIL = 1;
    stations.push(st);
  }
  const state = { map: { width: W, height: H, tiles: new Array(W * H).fill(null) }, stations, settings: { modifiedCatchment: true } };
  return { state, coverage: buildCoverage(state) };
}

describe('servingStations equivalence', () => {
  test('every covered tile x PASS/MAIL matches the linear reference (id list and order)', () => {
    const { state, coverage } = denseFixture();
    const maxIds = Math.max(...[...coverage.values()].map((a) => a.length));
    expect(maxIds).toBeGreaterThan(10); // genuinely dense / overlapping
    let checked = 0;
    for (const tile of coverage.keys()) {
      const x = tile % state.map.width, y = Math.floor(tile / state.map.width);
      for (const cargoId of ['PASS', 'MAIL']) {
        const got = servingStations(state, coverage, [tile], cargoId, x, y);
        const want = reference(state, coverage, [tile], cargoId, x, y);
        expect(got.map((s) => s.id)).toEqual(want.map((s) => s.id));
        expect(got.length).toBeLessThanOrEqual(2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400); // the 22x22 overlap block, both cargos
  });

  test('multi-tile calls (shared and disjoint catchments) match the reference', () => {
    const { state, coverage } = denseFixture();
    const keys = [...coverage.keys()];
    const cases = [
      [keys[0], keys[1]],
      [keys[40], keys[41], keys[42]],
      [keys[8], keys[400]],
      [0, keys[0], 4095], // uncovered tiles first/last
    ];
    for (const tileIdxs of cases) {
      const sx = tileIdxs[tileIdxs.length - 1] % state.map.width;
      const sy = Math.floor(tileIdxs[tileIdxs.length - 1] / state.map.width);
      for (const cargoId of ['PASS', 'MAIL']) {
        const got = servingStations(state, coverage, tileIdxs, cargoId, sx, sy);
        const want = reference(state, coverage, tileIdxs, cargoId, sx, sy);
        expect(got.map((s) => s.id)).toEqual(want.map((s) => s.id));
        expect(got.length).toBeLessThanOrEqual(2);
      }
    }
  });

  test('hand-built coverage Map without the attached lookup still matches', () => {
    const { state, coverage } = denseFixture();
    const plain = new Map(coverage); // copies tile -> ids only, no lookup expando
    const tile = [...coverage.keys()][30];
    const x = tile % state.map.width, y = Math.floor(tile / state.map.width);
    for (const cargoId of ['PASS', 'MAIL']) {
      expect(servingStations(state, plain, [tile], cargoId, x, y).map((s) => s.id))
        .toEqual(reference(state, plain, [tile], cargoId, x, y).map((s) => s.id));
    }
  });

  test('station list growth invalidates the cached lookup', () => {
    const { state, coverage } = denseFixture();
    const tile = [...coverage.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    const x = tile % state.map.width, y = Math.floor(tile / state.map.width);
    expect(servingStations(state, coverage, [tile], 'PASS', x, y).length).toBe(2);
    // append a station whose rating beats both current bests, on the same tile
    const extra = { id: 99999, x, y, tiles: [{ x, y, radius: 5, kind: 'rail' }], rating: { PASS: 200, MAIL: 200 }, lastPickup: { PASS: 1, MAIL: 1 }, cargo: {} };
    state.stations.push(extra);
    coverage.set(tile, [...coverage.get(tile), extra.id]);
    const got = servingStations(state, coverage, [tile], 'PASS', x, y);
    expect(got.map((s) => s.id)).toEqual(reference(state, coverage, [tile], 'PASS', x, y).map((s) => s.id));
    expect(got[0].id).toBe(99999);
  });
});
