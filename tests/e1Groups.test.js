/** E1 groups: nested groups (lazy parentId, reparent, cycle check, delete re-link, livery inheritance) and
 * per-vehicle-type groups behind the opt-in strictGroupKind setting (default off = today's behaviour). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { groupColourMap, effectiveGroupColour } from '../js/renderer/groupLivery.js';
import { COMPANY_COLOURS } from '../js/simulation/companyColour.js';
import { groupDepth, isGroupDescendant } from '../js/ui/windows/vehicleList.js';

const RED = COMPANY_COLOURS[0].hex;
const BLUE = COMPANY_COLOURS[1].hex;

function setup() {
  return flatGame(41);
}

/** Add plain vehicles (groups only need id + kind on a vehicle). */
function fakeVehicle(g, id, kind, orderGroup) {
  const v = { id, kind };
  if (orderGroup != null) v.orderGroup = orderGroup;
  g.state.vehicles.push(v);
  return v;
}

describe('E1 default (strictGroupKind off)', () => {
  test('the setting defaults to false and has exactly one SETTING_META entry', () => {
    expect(DEFAULT_SETTINGS.strictGroupKind).toBe(false);
    const hits = SETTING_META.filter((m) => m.key === 'strictGroupKind');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('companies');
    expect(getSetting(setup().state, 'strictGroupKind')).toBe(false);
  });

  test('a flat group saves exactly as before: no parentId, no kind', () => {
    const g = setup();
    const grp = g.createGroup('Coal').group;
    expect(grp).toEqual({ id: 1, name: 'Coal' });
    const st = parseState(serializeState(g.state));
    expect(st.company.groups).toEqual([{ id: 1, name: 'Coal' }]);
  });

  test('mixed vehicle types are allowed and kind is not written', () => {
    const g = setup();
    const grp = g.createGroup('Mixed').group;
    const train = fakeVehicle(g, 9001, 'train');
    const bus = fakeVehicle(g, 9002, 'road');
    expect(g.addVehicleToGroup(train.id, grp.id).ok).toBe(true);
    expect(g.addVehicleToGroup(bus.id, grp.id).ok).toBe(true);
    expect(train.groupId).toBe(grp.id);
    expect(bus.groupId).toBe(grp.id);
    expect(g.state.company.groups[0]).toEqual({ id: 1, name: 'Mixed' });
  });

  test('opts.kind is ignored while the setting is off (default-preserving)', () => {
    const g = setup();
    const grp = g.createGroup('Typed', { kind: 'train' }).group;
    expect(grp.kind).toBeUndefined();
  });

  test('groupDepth/isGroupDescendant are cycle-safe on flat lists', () => {
    const groups = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    expect(groupDepth(groups, groups[0])).toBe(0);
    expect(isGroupDescendant(groups, 1, 2)).toBe(false);
  });
});

describe('E1 nested groups', () => {
  test('createGroup stores a lazy parentId and the save round-trips it', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B', { parentId: a.id }).group;
    expect(a.parentId).toBeUndefined();
    expect(b.parentId).toBe(a.id);
    const st = parseState(serializeState(g.state));
    expect(st.company.groups).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B', parentId: 1 },
    ]);
  });

  test('createGroup rejects an unknown parent', () => {
    const g = setup();
    expect(g.createGroup('B', { parentId: 99 }).ok).toBe(false);
    expect(g.state.company.groups).toBeUndefined();
  });

  test('alterGroupParent reparents, clears and bumps groupColourRev only on change', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B').group;
    const rev0 = g.state.company.groupColourRev || 0;
    expect(g.alterGroupParent(b.id, a.id).ok).toBe(true);
    expect(b.parentId).toBe(a.id);
    expect((g.state.company.groupColourRev || 0)).toBe(rev0 + 1);
    const rev1 = g.state.company.groupColourRev;
    expect(g.alterGroupParent(b.id, a.id).ok).toBe(true); // no change: no bump
    expect(g.state.company.groupColourRev).toBe(rev1);
    expect(g.alterGroupParent(b.id, null).ok).toBe(true);
    expect(b.parentId).toBeUndefined();
    expect(g.state.company.groupColourRev).toBe(rev1 + 1);
  });

  test('alterGroupParent rejects self, unknown parents and cycles', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B').group;
    const c = g.createGroup('C', { parentId: b.id }).group;
    expect(g.alterGroupParent(a.id, a.id).ok).toBe(false);
    expect(g.alterGroupParent(a.id, 99).ok).toBe(false);
    expect(g.alterGroupParent(b.id, a.id).ok).toBe(true); // A -> B
    expect(g.alterGroupParent(a.id, b.id).ok).toBe(false); // B would contain itself
    expect(g.alterGroupParent(b.id, c.id).ok).toBe(false); // C is under B
    expect(b.parentId).toBe(a.id);
    expect(c.parentId).toBe(b.id);
  });

  test('deleting a group re-links its children to the deleted group parent', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B', { parentId: a.id }).group;
    const c = g.createGroup('C', { parentId: b.id }).group;
    expect(g.deleteGroup(b.id).ok).toBe(true);
    expect(c.parentId).toBe(a.id);
    expect(g.deleteGroup(a.id).ok).toBe(true);
    expect(c.parentId).toBeUndefined();
    expect(g.state.company.groups).toEqual([{ id: 3, name: 'C' }]);
  });

  test('deleting a top-level parent removes the parentId of its children', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B', { parentId: a.id }).group;
    g.deleteGroup(a.id);
    expect(b.parentId).toBeUndefined();
  });

  test('group livery inherits through the parent chain (flat games unchanged)', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B', { parentId: a.id }).group;
    expect(effectiveGroupColour(g.state.company.groups, a)).toBeUndefined();
    g.setGroupColour(a.id, RED);
    let map = groupColourMap(g.state);
    expect(map.get(a.id)).toBe(RED);
    expect(map.get(b.id)).toBe(RED); // inherited
    g.setGroupColour(b.id, BLUE);
    map = groupColourMap(g.state);
    expect(map.get(b.id)).toBe(BLUE); // own colour wins
    g.setGroupColour(b.id, null);
    g.setGroupColour(a.id, null);
    expect(groupColourMap(g.state)).toBeNull();
  });

  test('reparenting changes an inherited colour (rev cache rebuild)', () => {
    const g = setup();
    const a = g.createGroup('A').group;
    const b = g.createGroup('B').group;
    const c = g.createGroup('C', { parentId: a.id }).group;
    g.setGroupColour(a.id, RED);
    g.setGroupColour(b.id, BLUE);
    expect(groupColourMap(g.state).get(c.id)).toBe(RED);
    g.alterGroupParent(c.id, b.id);
    expect(groupColourMap(g.state).get(c.id)).toBe(BLUE);
  });
});

describe('E1 per-type groups (strictGroupKind on)', () => {
  test('createGroup sets the kind and validates it', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const grp = g.createGroup('Trains', { kind: 'train' }).group;
    expect(grp.kind).toBe('train');
    expect(g.createGroup('Bad', { kind: 'boat' }).ok).toBe(false);
  });

  test('a typed group rejects a mismatch on add and accepts its own kind', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const grp = g.createGroup('Trains', { kind: 'train' }).group;
    const train = fakeVehicle(g, 9101, 'train');
    const bus = fakeVehicle(g, 9102, 'road');
    expect(g.addVehicleToGroup(bus.id, grp.id).ok).toBe(false);
    expect(bus.groupId).toBeUndefined();
    expect(g.addVehicleToGroup(train.id, grp.id).ok).toBe(true);
    expect(train.groupId).toBe(grp.id);
  });

  test('an untyped group takes the first vehicle kind, then enforces it', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const grp = g.createGroup('Mixed').group;
    expect(grp.kind).toBeUndefined();
    const bus = fakeVehicle(g, 9201, 'road');
    const train = fakeVehicle(g, 9202, 'train');
    expect(g.addVehicleToGroup(bus.id, grp.id).ok).toBe(true);
    expect(grp.kind).toBe('road');
    expect(g.addVehicleToGroup(train.id, grp.id).ok).toBe(false);
  });

  test('addSharedVehiclesToGroup rejects a mixed order group', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const grp = g.createGroup('Trains', { kind: 'train' }).group;
    const v = fakeVehicle(g, 9301, 'train', 'o1');
    fakeVehicle(g, 9302, 'road', 'o1');
    expect(g.addSharedVehiclesToGroup(v.id, grp.id).ok).toBe(false);
    expect(v.groupId).toBeUndefined();
    fakeVehicle(g, 9303, 'train', 'o2');
    fakeVehicle(g, 9304, 'train', 'o2');
    const v2 = g.state.vehicles.find((x) => x.id === 9303);
    expect(g.addSharedVehiclesToGroup(v2.id, grp.id).ok).toBe(true);
    expect(grp.kind).toBe('train');
  });

  test('a child group inherits the parent kind; a mismatched parent is refused', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const parent = g.createGroup('Rail', { kind: 'train' }).group;
    const child = g.createGroup('Express', { parentId: parent.id }).group;
    expect(child.kind).toBe('train');
    expect(g.createGroup('Bus', { kind: 'road' }).ok).toBe(true);
    const bus = g.state.company.groups.find((x) => x.name === 'Bus');
    expect(g.alterGroupParent(bus.id, parent.id).ok).toBe(false);
  });

  test('turning the setting off restores mixed groups', () => {
    const g = setup();
    setSetting(g.state, 'strictGroupKind', true);
    const grp = g.createGroup('Typed', { kind: 'train' }).group;
    setSetting(g.state, 'strictGroupKind', false);
    const bus = fakeVehicle(g, 9401, 'road');
    expect(g.addVehicleToGroup(bus.id, grp.id).ok).toBe(true);
    expect(bus.groupId).toBe(grp.id);
  });
});
