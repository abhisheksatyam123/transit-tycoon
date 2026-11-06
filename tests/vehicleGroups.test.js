/** Vehicle groups (OpenTTD group_cmd): create / rename / delete, assignment, clone and autoreplace keep the group, save round-trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { inGroup, sortVehicles } from '../js/ui/windows/vehicleList.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]);
  return { g, L, v: r.vehicle };
}

describe('vehicle groups', () => {
  test('default game has no groups key and no groupId (lazy storage)', () => {
    const { g, v } = setup();
    expect(g.state.company.groups).toBeUndefined();
    expect(v.groupId).toBeUndefined();
  });

  test('create assigns deterministic ids (max + 1) and rejects duplicate names', () => {
    const { g } = setup();
    const a = g.createGroup('Coal');
    expect(a.ok).toBe(true);
    expect(a.group.id).toBe(1);
    const b = g.createGroup('Express');
    expect(b.group.id).toBe(2);
    expect(g.createGroup('coal').ok).toBe(false);
    expect(g.createGroup('   ').ok).toBe(false);
    expect(g.state.company.groups.map((x) => x.name)).toEqual(['Coal', 'Express']);
  });

  test('rename keeps the id and checks uniqueness', () => {
    const { g } = setup();
    const a = g.createGroup('Coal').group;
    g.createGroup('Express');
    expect(g.renameGroup(a.id, 'Express').ok).toBe(false);
    expect(g.renameGroup(a.id, 'Bulk').ok).toBe(true);
    expect(g.state.company.groups[0]).toEqual({ id: a.id, name: 'Bulk' });
    expect(g.renameGroup(999, 'X').ok).toBe(false);
  });

  test('assign and unassign a vehicle', () => {
    const { g, v } = setup();
    const grp = g.createGroup('Coal').group;
    expect(g.addVehicleToGroup(v.id, grp.id).ok).toBe(true);
    expect(v.groupId).toBe(grp.id);
    expect(g.addVehicleToGroup(v.id, null).ok).toBe(true);
    expect(v.groupId).toBeUndefined();
    expect(g.addVehicleToGroup(v.id, 77).ok).toBe(false);
    expect(g.addVehicleToGroup(-5, grp.id).ok).toBe(false);
  });

  test('delete ungroups its vehicles and removes the key when empty', () => {
    const { g, v } = setup();
    const grp = g.createGroup('Coal').group;
    g.addVehicleToGroup(v.id, grp.id);
    expect(g.deleteGroup(grp.id).ok).toBe(true);
    expect(v.groupId).toBeUndefined();
    expect(g.state.company.groups).toBeUndefined();
    expect(g.deleteGroup(grp.id).ok).toBe(false);
  });

  test('deleting the highest group frees its id (max + 1 rule)', () => {
    const { g } = setup();
    g.createGroup('A'); const b = g.createGroup('B').group;
    g.deleteGroup(b.id);
    expect(g.createGroup('C').group.id).toBe(2);
  });

  test('addSharedVehiclesToGroup moves every vehicle sharing the order list', () => {
    const { g, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const solo = g.buyVehicle(v.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    const grp = g.createGroup('Coal').group;
    const r = g.addSharedVehiclesToGroup(v.id, grp.id);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(v.groupId).toBe(grp.id);
    expect(c.groupId).toBe(grp.id);
    expect(solo.groupId).toBeUndefined();
  });

  test('addSharedVehiclesToGroup fails for a vehicle without shared orders', () => {
    const { g, v } = setup();
    const grp = g.createGroup('Coal').group;
    expect(g.addSharedVehiclesToGroup(v.id, grp.id).ok).toBe(false);
  });

  test('clone copies the source group', () => {
    const { g, v } = setup();
    const grp = g.createGroup('Coal').group;
    g.addVehicleToGroup(v.id, grp.id);
    const c = g.cloneVehicle(v.id, { shareOrders: false }).vehicle;
    expect(c.groupId).toBe(grp.id);
  });

  test('save round-trip keeps groups and membership', () => {
    const { g, v } = setup();
    const grp = g.createGroup('Coal').group;
    g.addVehicleToGroup(v.id, grp.id);
    const st = parseState(serializeState(g.state));
    expect(st.company.groups).toEqual([{ id: grp.id, name: 'Coal' }]);
    expect(st.vehicles.find((w) => w.id === v.id).groupId).toBe(grp.id);
  });

  test('groups have no gameplay effect: money and profit unchanged by grouping', () => {
    const { g, v } = setup();
    const money = g.state.company.money;
    const grp = g.createGroup('Coal').group;
    g.addVehicleToGroup(v.id, grp.id);
    expect(g.state.company.money).toBe(money);
  });
});

describe('vehicle list group filter', () => {
  test('inGroup: all / none / group id', () => {
    const a = { id: 1, groupId: 3 };
    const b = { id: 2 };
    expect(inGroup(a, 'all')).toBe(true);
    expect(inGroup(a, 3)).toBe(true);
    expect(inGroup(a, 'none')).toBe(false);
    expect(inGroup(b, 'none')).toBe(true);
    expect(inGroup(b, 3)).toBe(false);
  });

  test('sortVehicles applies the group filter and keeps sort', () => {
    const vs = [
      { id: 1, name: 'B', kind: 'train', groupId: 2, profitThisYear: 5 },
      { id: 2, name: 'A', kind: 'road', profitThisYear: 9 },
      { id: 3, name: 'C', kind: 'train', groupId: 2, profitThisYear: 1 },
    ];
    expect(sortVehicles(vs, { group: 2 }).map((v) => v.id)).toEqual([1, 3]);
    expect(sortVehicles(vs, { group: 'none' }).map((v) => v.id)).toEqual([2]);
    expect(sortVehicles(vs, { group: 2, sort: 'profitThisYear', dir: -1 }).map((v) => v.id)).toEqual([1, 3]);
    expect(sortVehicles(vs, { group: 'all', sort: 'profitThisYear', dir: -1 }).map((v) => v.id)).toEqual([2, 1, 3]);
  });
});
