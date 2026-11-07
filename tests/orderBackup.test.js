/** Order backups (OpenTTD order_backup.cpp): sell from depot keeps orders; rebuy in same depot restores. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { sharers } from '../js/simulation/sharedOrders.js';
import { removeDepot } from '../js/simulation/cmdStation.js';

const BUY = { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' };

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const v = g.buyVehicle(L.depotId, BUY).vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v };
}

const sell = (g, id) => g.sellVehicle(id, { backupOrders: true });

describe('order backup: sell and rebuy', () => {
  test('sell from the depot window then buy in the same depot restores the orders and index', () => {
    const { g, L, v } = setup();
    g.state.vehicles.find((w) => w.id === v.id).orderIndex = 1;
    expect(sell(g, v.id).ok).toBe(true);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
    expect(n.orderIndex).toBe(1);
    expect(n.orders[0].full).toBe(true);
    expect(g.state.orderBackups).toBeUndefined(); // consumed; key removed
  });

  test('sell-all path (no backupOrders option) does not back up', () => {
    const { g, L, v } = setup();
    expect(g.sellVehicle(v.id).ok).toBe(true);
    expect(g.state.orderBackups).toBeUndefined();
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders).toEqual([]);
  });

  test('clone does not consume the backup', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    const other = g.buyVehicle(L.depotId, BUY, { noRestore: true }).vehicle;
    expect(g.setOrders(other.id, [{ stationId: L.a.id }]).ok).toBe(true);
    expect(g.cloneVehicle(other.id).ok).toBe(true);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
  });

  test('the latest sell replaces the older backup for that depot', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    const w = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(g.setOrders(w.id, [{ stationId: L.b.id }]).ok).toBe(true);
    sell(g, w.id);
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders.map((o) => o.stationId)).toEqual([L.b.id]);
  });
});

describe('order backup: shared orders', () => {
  test('a backup of a shared vehicle re-joins the surviving shared list', () => {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(c.orderGroup).toBeDefined();
    expect(sell(g, c.id).ok).toBe(true);
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orderGroup).toBe(v.orderGroup);
    expect(sharers(g.state, n).map((w) => w.id)).toEqual([v.id]);
    expect(n.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
  });

  test('shared list gone: the orders are copied as a plain list', () => {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    sell(g, c.id);
    g.sellVehicle(v.id); // the surviving sharer is sold too (no backup)
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orderGroup).toBeUndefined();
    expect(n.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
  });
});

describe('order backup: compatibility and removal', () => {
  test('incompatible kind is not restored and the backup is kept', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    g.state.orderBackups[L.depotId].kind = 'road:bus'; // a backup of a different vehicle kind
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders).toEqual([]);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
  });

  test('removed depot clears its backup', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    removeDepot({ state: g.state }, L.depotId);
    expect(g.state.orderBackups).toBeUndefined();
  });

  test('station removed: its orders are dropped on restore', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    // drop station B (the second order) from the state, as a demolition would
    g.state.stations = g.state.stations.filter((s) => s.id !== L.b.id);
    const n = g.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders.map((o) => o.stationId)).toEqual([L.a.id]);
  });

  test('save/load keeps the backup and old saves load without it', () => {
    const { g, L, v } = setup();
    sell(g, v.id);
    const g2 = new (g.constructor)(parseState(serializeState(g.state)));
    const n = g2.buyVehicle(L.depotId, BUY).vehicle;
    expect(n.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
    const old = parseState(serializeState(flatGame(3).state));
    expect(old.orderBackups).toBeUndefined();
  });
});
