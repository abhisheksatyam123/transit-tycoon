/** Copy / share orders onto an existing vehicle (OpenTTD CmdCloneOrder CO_COPY / CO_SHARE). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { sharers } from '../js/simulation/sharedOrders.js';

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const buy = (spec) => g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL', ...spec });
  const a = buy().vehicle;
  const b = buy().vehicle;
  expect(g.setOrders(a.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  expect(g.setOrders(b.id, [{ stationId: L.b.id }, { stationId: L.a.id }]).ok).toBe(true);
  return { g, L, a, b };
}

describe('copy orders', () => {
  test('copy: target gets an independent deep copy, index reset to 0', () => {
    const { g, a, b } = setup();
    b.orderIndex = 1;
    const r = g.copyOrders(b.id, a.id, { share: false });
    expect(r.ok).toBe(true);
    expect(b.orders).toEqual(a.orders);
    expect(b.orders).not.toBe(a.orders);
    expect(b.orders[0]).not.toBe(a.orders[0]);
    expect(b.orderIndex).toBe(0);
    expect(b.orderGroup).toBeUndefined();
    // independence: editing the source later does not touch the copy
    expect(g.setOrders(a.id, [{ stationId: a.orders[1].stationId }]).ok).toBe(true);
    expect(b.orders.length).toBe(2);
  });

  test('copy leaves the shared group the target was in; the group keeps the others', () => {
    const { g, a, b } = setup();
    const c = g.cloneVehicle(b.id, { shareOrders: true }).vehicle;
    expect(sharers(g.state, b).length).toBe(1);
    expect(g.copyOrders(b.id, a.id, { share: false }).ok).toBe(true);
    expect(b.orderGroup).toBeUndefined();
    expect(c.orderGroup).toBeUndefined(); // a lone member dissolves the group
    expect(sharers(g.state, c).length).toBe(0);
  });

  test('share: target joins the source group and takes its orders', () => {
    const { g, a, b } = setup();
    const r = g.copyOrders(b.id, a.id, { share: true });
    expect(r.ok).toBe(true);
    expect(a.orderGroup).toBeDefined();
    expect(b.orderGroup).toBe(a.orderGroup);
    expect(b.orders).toEqual(a.orders);
    expect(sharers(g.state, a)).toContain(b);
    // an edit on the source now reaches the target
    expect(g.setOrders(a.id, [{ stationId: a.orders[0].stationId }, { stationId: b.orders[1].stationId }]).ok).toBe(true);
    expect(b.orders).toEqual(a.orders);
  });

  test('share: joins a group that already exists on the source', () => {
    const { g, a, b } = setup();
    const c = g.cloneVehicle(a.id, { shareOrders: true }).vehicle;
    expect(g.copyOrders(b.id, a.id, { share: true }).ok).toBe(true);
    expect(b.orderGroup).toBe(a.orderGroup);
    expect(c.orderGroup).toBe(a.orderGroup);
  });

  test('refused: same vehicle, unknown vehicle, source without orders', () => {
    const { g, a, b } = setup();
    expect(g.copyOrders(a.id, a.id).ok).toBe(false);
    expect(g.copyOrders(a.id, 999999).ok).toBe(false);
    b.orders = [];
    expect(g.copyOrders(a.id, b.id).ok).toBe(false);
  });

  test('refused: different vehicle type (train from road vehicle)', () => {
    const { g, a } = setup();
    const r = g.buildRoad(10, 30, 30, 30);
    expect(r.ok).toBe(true);
    const d = g.buildDepot(12, 31, 'road', 1);
    expect(d.ok).toBe(true);
    const bus = g.buyVehicle(g.state.depots[g.state.depots.length - 1].id, { modelId: 'bus_city' });
    expect(bus.ok).toBe(true);
    const before = a.orders.map((o) => ({ ...o }));
    const rr = g.copyOrders(a.id, bus.vehicle.id);
    expect(rr.ok).toBe(false);
    expect(g.copyOrders(a.id, bus.vehicle.id, { share: true }).ok).toBe(false);
    expect(a.orders).toEqual(before);
    expect(a.orderGroup).toBeUndefined();
  });

  test('refused: foreign (rival) vehicle as source or target', () => {
    const { g, a, b } = setup();
    b.ownerId = 7;
    expect(g.copyOrders(a.id, b.id).ok).toBe(false);
    expect(g.copyOrders(b.id, a.id).ok).toBe(false);
    expect(g.copyOrders(a.id, b.id, { share: true }).ok).toBe(false);
  });

  test('dry run changes nothing', () => {
    const { g, a, b } = setup();
    const before = JSON.stringify(b.orders);
    expect(g.copyOrders(b.id, a.id, { dryRun: true, share: true }).ok).toBe(true);
    expect(JSON.stringify(b.orders)).toBe(before);
    expect(b.orderGroup).toBeUndefined();
  });

  test('save / load round trip keeps copied orders and the shared group', () => {
    const { g, a, b } = setup();
    expect(g.copyOrders(b.id, a.id, { share: true }).ok).toBe(true);
    const s = parseState(serializeState(g.state));
    const a2 = s.vehicles.find((x) => x.id === a.id);
    const b2 = s.vehicles.find((x) => x.id === b.id);
    expect(b2.orderGroup).toBe(a2.orderGroup);
    expect(b2.orders).toEqual(a.orders);
    // a copied (unshared) vehicle round trips too
    expect(g.copyOrders(b.id, a.id, { share: false }).ok).toBe(true);
    const s2 = parseState(serializeState(g.state));
    const b3 = s2.vehicles.find((x) => x.id === b.id);
    expect('orderGroup' in b3).toBe(false);
    expect(b3.orders).toEqual(a.orders);
  });
});
