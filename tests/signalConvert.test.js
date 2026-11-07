/** Signal conversion (SC): Ctrl+click / convert changes an existing signal's kind, keeps its direction, costs a build price. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { blockIndex } from '../js/simulation/signals.js';
import { isTypedSignal } from '../js/simulation/pathSignals.js';

function setup() {
  const g = flatGame(7);
  expect(g.buildRail(20, 24, 50, 24).ok).toBe(true);
  return g;
}
const at = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('signal convert', () => {
  test('block -> path keeps direction, charges the build price, and path signal is typed', () => {
    const g = setup();
    expect(g.buildSignal(30, 24).ok).toBe(true);
    const before = g.state.company.money;
    const dry = g.convertSignal(30, 24, 'path', { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(at(g, 30, 24).signal).toBe(1); // dry run changes nothing
    const r = g.convertSignal(30, 24, 'path');
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBeLessThan(before);
    expect(isTypedSignal(at(g, 30, 24).signal)).toBe(true);
    expect(at(g, 30, 24).signal.type).toBe('path');
  });

  test('path -> block removes the typed object and restores the two-way flag', () => {
    const g = setup();
    expect(g.buildSignal(30, 24, { type: 'path', dir: 2 }).ok).toBe(true);
    expect(g.convertSignal(30, 24, 'block').ok).toBe(true);
    expect(at(g, 30, 24).signal).toBe(1);
  });

  test('one-way keeps the existing pass direction', () => {
    const g = setup();
    expect(g.buildSignal(30, 24, { type: 'oneway', dir: 8 }).ok).toBe(true);
    expect(g.convertSignal(30, 24, 'path').ok).toBe(true);
    expect(at(g, 30, 24).signal).toEqual({ type: 'path', dir: 8 });
  });

  test('refuses on non-signal tile, unchanged kind, bad kind, rival track, bounds', () => {
    const g = setup();
    expect(g.convertSignal(30, 24, 'path').ok).toBe(false); // no signal
    expect(g.buildSignal(30, 24).ok).toBe(true);
    expect(g.convertSignal(30, 24, 'block').ok).toBe(false); // already block
    expect(g.convertSignal(30, 24, 'bogus').ok).toBe(false);
    expect(g.convertSignal(-1, 24, 'path').ok).toBe(false);
    at(g, 30, 24).owner = 'rival';
    expect(g.convertSignal(30, 24, 'path').ok).toBe(false);
    expect(at(g, 30, 24).signal).toBe(1);
  });

  test('refused when broke, nothing changes', () => {
    const g = setup();
    expect(g.buildSignal(30, 24).ok).toBe(true);
    g.state.company.money = 0;
    expect(g.convertSignal(30, 24, 'path').ok).toBe(false);
    expect(at(g, 30, 24).signal).toBe(1);
  });

  test('block index is invalidated (path signal does not split blocks)', () => {
    const g = setup();
    expect(g.buildSignal(30, 24).ok).toBe(true);
    const before = blockIndex(g.state);
    expect(g.convertSignal(30, 24, 'path').ok).toBe(true);
    const after = blockIndex(g.state);
    expect(after).not.toBe(before);
    expect(before.count).toBe(2); // block signal splits the line in two
    expect(after.count).toBe(1); // path signal does not split blocks
  });
});

describe('signal convert routing', () => {
  test('a train still reaches the far station after a block signal is converted to path', () => {
    const g = flatGame(19);
    const L = coalLine(g);
    expect(g.buildSignal(27, 24, { type: 'block' }).ok).toBe(true);
    expect(g.convertSignal(27, 24, 'path', {}).ok).toBe(true);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: L.b.id, full: false }, { stationId: L.a.id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    let arrived = false;
    for (let i = 0; i < 60 * 96 && !arrived; i++) { g.step(); if (r.vehicle.atStationId) arrived = true; }
    expect(arrived).toBe(true);
  });
});
