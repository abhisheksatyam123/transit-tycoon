/**
 * Occupancy index reuse (blocking.js): beginOccupancy returns a pooled object whose Maps and body-key /
 * tile-list arrays are cleared and reused. These tests pin the properties pooling must not break:
 *  - rebuilding a state gives exactly the same index (same tile keys, same insertion order, same values);
 *  - a released index carries nothing into the next state (no stale tiles/vehicles between games);
 *  - an index still in use is never cleared/recycled by a later build or release;
 *  - a state built after another (or a game created after another) is unaffected by what came before.
 */
import { test, expect, describe } from 'bun:test';
import { beginOccupancy, releaseOccupancy, vehiclesOn } from '../js/simulation/blocking.js';
import { flatGame } from './helpers.js';

/** Flat WxW state with no signals (so no signal blocks are indexed). */
function makeState(W = 12) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  return { map: { width: W, height: W, tiles }, settings: {}, vehicles: [], tick: 0, date: { day: 1, month: 0, year: 1950 } };
}

/** Vehicle with a trailing history (head first, like the sim keeps it). */
function makeVehicle(id, kind, tx, ty, hist, extra = {}) {
  return { id, kind, state: 'running', tx, ty, history: hist, ...extra };
}

/** Structural snapshot keyed by stable vehicle id (object identity differs between states). */
function snapshot(occ) {
  const out = { rail: [], road: [], keys: [], blocks: [], blockIds: [] };
  for (const layer of ['rail', 'road']) {
    for (const [k, list] of occ[layer]) out[layer].push([k, list.map((v) => v.id)]);
  }
  for (const [v, keys] of occ.keys) out.keys.push([v.id, [...keys]]);
  for (const [b, list] of occ.blocks) out.blocks.push([b, list.map((v) => v.id)]);
  for (const [v, ids] of occ.blockIds) out.blockIds.push([v.id, [...ids]]);
  return out;
}

/** State with a train and two road vehicles, some sharing a tile (insertion order matters). */
function busyState() {
  const st = makeState();
  const a = makeVehicle(1, 'train', 5, 5, [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
  const b = makeVehicle(2, 'road', 5, 5, [{ x: 5, y: 5 }, { x: 5, y: 6 }], { roadType: 'bus' });
  const c = makeVehicle(3, 'road', 5, 5, [{ x: 5, y: 5 }, { x: 4, y: 5 }], { roadType: 'bus' });
  const d = makeVehicle(4, 'road', 7, 8, [{ x: 7, y: 8 }], { roadType: 'bus' }); // no trailing tile
  st.vehicles = [a, b, c, d];
  return st;
}

describe('occupancy index reuse', () => {
  test('rebuilding a state after release gives a byte-identical index', () => {
    const st = busyState();
    const first = beginOccupancy(st);
    const want = snapshot(first);
    releaseOccupancy(first);
    const second = beginOccupancy(st);
    expect(snapshot(second)).toEqual(want);
    releaseOccupancy(second);
    // and again, now definitely reusing the same pooled object
    const third = beginOccupancy(st);
    expect(snapshot(third)).toEqual(want);
  });

  test('no stale tiles or vehicles leak from a released index into the next state', () => {
    const a = busyState();
    const occA = beginOccupancy(a);
    expect([...occA.keys.keys()].map((v) => v.id)).toEqual([1, 2, 3, 4]);
    releaseOccupancy(occA);

    const b = makeState(20); // different map size and vehicles
    const x = makeVehicle(10, 'road', 1, 1, [{ x: 1, y: 1 }, { x: 0, y: 1 }], { roadType: 'bus' });
    b.vehicles = [x];
    const occB = beginOccupancy(b);
    expect([...occB.keys.keys()].map((v) => v.id)).toEqual([10]);
    expect(occB.rail.size).toBe(0);
    expect([...occB.road.keys()]).toEqual([1 * 20 + 1, 1 * 20 + 0]);
    expect(occB.road.get(1 * 20 + 1)).toEqual([x]);
    // nothing from state a survives anywhere in the reused object
    for (const list of [...occB.road.values(), ...occB.keys.values()]) {
      expect(list.some((v) => v.kind && typeof v.id === 'number' && v.id < 10 && v !== x)).toBe(false);
    }
    releaseOccupancy(occB);
  });

  test('a live index is not cleared or recycled by another build/release', () => {
    const a = busyState();
    const occA = beginOccupancy(a);
    const want = snapshot(occA);

    // Occupy the pool with an unrelated index, then release it (it becomes the next recycled object).
    const b = makeState(20);
    b.vehicles = [makeVehicle(10, 'road', 1, 1, [{ x: 1, y: 1 }], { roadType: 'bus' })];
    const occB = beginOccupancy(b);
    releaseOccupancy(occB);
    expect(snapshot(occA)).toEqual(want); // A was never in the pool: untouched

    // A new build may reuse B's object; A must still be intact and queryable.
    const c = makeState(15);
    c.vehicles = [makeVehicle(20, 'road', 2, 2, [{ x: 2, y: 2 }], { roadType: 'bus' })];
    const occC = beginOccupancy(c);
    expect(snapshot(occA)).toEqual(want);
    expect(vehiclesOn({ state: a, occupancy: occA }, 'road', 5, 5).map((v) => v.id)).toEqual([2, 3]);
    releaseOccupancy(occC);
    releaseOccupancy(occA);
  });

  test('lazy per-tick caches on the index (movement.breaksCycle byId) do not survive reuse', () => {
    const st = busyState();
    const occ = beginOccupancy(st);
    occ.byId = new Map([[1, st.vehicles[0]]]); // as movement.breaksCycle caches it for the current snapshot
    releaseOccupancy(occ);
    const next = beginOccupancy(st);
    expect(next.byId == null).toBe(true); // stale id -> vehicle map would point at the previous tick's objects
    releaseOccupancy(next);
  });

  test('a moved vehicle drops its old tile: no stale occupancy between ticks', () => {
    const st = makeState();
    const v = makeVehicle(1, 'road', 5, 5, [{ x: 5, y: 5 }, { x: 4, y: 5 }], { roadType: 'bus' });
    st.vehicles = [v];
    const occ = beginOccupancy(st);
    expect(occ.road.has(5 * 12 + 5)).toBe(true); // item key is y * width + x
    releaseOccupancy(occ);

    // simulate a tick that moves the vehicle one tile east
    v.tx = 6;
    v.history = [{ x: 6, y: 5 }, { x: 5, y: 5 }];
    const next = beginOccupancy(st);
    expect(next.road.has(5 * 12 + 6)).toBe(true); // new head (6,5)
    expect(next.road.has(5 * 12 + 5)).toBe(true); // still its trailing tile (5,5)
    expect(next.road.has(5 * 12 + 4)).toBe(false); // the tile two back (4,5) is gone
    releaseOccupancy(next);
  });

  test('a game created after another is unaffected by earlier pool use', () => {
    // Real games: two independently created flat worlds. The second is created and stepped after the
    // first, so its index builds reuse objects that were live in the first game's ticks.
    const g1 = flatGame(7);
    g1.step(); g1.step(); g1.step();
    const st1 = g1.state;
    const occ1 = beginOccupancy(st1);
    releaseOccupancy(occ1);

    const g2 = flatGame(7);
    g2.step();
    const st2 = g2.state;
    const occ2 = beginOccupancy(st2);
    const ids2 = new Set(st2.vehicles.map((v) => v.id));
    for (const v of occ2.keys.keys()) expect(ids2.has(v.id)).toBe(true);
    // and the freshly created game's index is exactly what a rebuild of it would produce
    const again = snapshot(occ2);
    releaseOccupancy(occ2);
    expect(snapshot(beginOccupancy(st2))).toEqual(again);
  });
});
