/** D15 order UI: the "Auto refit" checkbox (Orders window) round-trips refitAuto through the order command,
 * and the control is only shown for plain station stops while the stationAutoRefit setting is on. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { autoRefitShown } from '../js/ui/windows/orders.js';
import { setSetting } from '../js/simulation/settings.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('D15 order UI: auto refit checkbox', () => {
  test('refitAuto round-trips through setOrders and survives a flag edit (modifyOrder)', () => {
    const { g, L, v } = setup();
    expect(g.setOrders(v.id, [{ stationId: L.a.id, refitAuto: true }, { stationId: L.b.id }]).ok).toBe(true);
    expect(v.orders[0].refitAuto).toBe(true);
    expect(v.orders[1]).not.toHaveProperty('refitAuto');
    expect(g.modifyOrder(v.id, 0, { stopLocation: 'middle' }).ok).toBe(true);
    expect(v.orders[0].refitAuto).toBe(true);
    expect(g.setOrders(v.id, [{ stationId: L.a.id }, { stationId: L.b.id }]).ok).toBe(true);
    expect(v.orders[0]).not.toHaveProperty('refitAuto');
  });

  test('a flag edit that makes the order invalid drops refitAuto instead of failing', () => {
    const { g, L, v } = setup();
    expect(g.setOrders(v.id, [{ stationId: L.a.id, refitAuto: true }, { stationId: L.b.id }]).ok).toBe(true);
    expect(g.modifyOrder(v.id, 0, { stop: 'via' }).ok).toBe(true);
    expect(v.orders[0]).not.toHaveProperty('refitAuto');
  });

  test('checkbox is hidden for every order when stationAutoRefit is off (default)', () => {
    const { g, L } = setup();
    const st = g.state.stations.find((s) => s.id === L.a.id);
    expect(autoRefitShown(g.state, { stationId: L.a.id, refitAuto: true }, st)).toBe(false);
    expect(autoRefitShown(g.state, { stationId: L.a.id }, st)).toBe(false);
  });

  test('checkbox shows for plain station stops only, when the setting is on', () => {
    const { g, L } = setup();
    setSetting(g.state, 'stationAutoRefit', true);
    const st = g.state.stations.find((s) => s.id === L.a.id);
    expect(autoRefitShown(g.state, { stationId: L.a.id }, st)).toBe(true);
    expect(autoRefitShown(g.state, { stationId: L.a.id, load: 'full' }, st)).toBe(true);
    expect(autoRefitShown(g.state, { stationId: L.a.id, load: 'none' }, st)).toBe(false);
    expect(autoRefitShown(g.state, { stationId: L.a.id, stop: 'via' }, st)).toBe(false);
    expect(autoRefitShown(g.state, { stationId: L.a.id, depotId: 1 }, st)).toBe(false);
    expect(autoRefitShown(g.state, { cond: { v: 'load', cmp: '<', val: 50, to: 0 } }, st)).toBe(false);
    expect(autoRefitShown(g.state, { stationId: 999999 }, undefined)).toBe(false);
    const waypoint = { id: 7, tiles: [{ kind: 'waypoint' }] };
    expect(autoRefitShown(g.state, { stationId: 7 }, waypoint)).toBe(false);
  });
});
