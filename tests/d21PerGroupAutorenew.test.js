import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { autorenewVehicle, isAutoreplaceEligible, autorenewFor } from '../js/simulation/autorenew.js';

/** D21 per-group autorenew (opt-in, groupAutorenew, default off). Group flag lives in company.groupAutorenew. */

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const grp = g.createGroup('Old ones');
  expect(grp.ok).toBe(true);
  expect(g.addVehicleToGroup(v.id, grp.group.id).ok).toBe(true);
  const other = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
  const oldVehicle = (x) => { x.maxAge = 25 * 365; x.age = 26 * 365; x.state = 'depot'; };
  return { g, v, other, grp: grp.group, oldVehicle };
}

describe('groupAutorenew (D21 per-group autorenew)', () => {
  test('default off, exactly one settings meta entry', () => {
    expect(DEFAULT_SETTINGS.groupAutorenew).toBe(false);
    const entries = SETTING_META.filter((m) => m.key === 'groupAutorenew');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
  });

  test('setter is refused while the setting is off and writes nothing', () => {
    const { g, grp } = setup();
    const r = g.setGroupAutorenew(grp.id, true);
    expect(r.ok).toBe(false);
    expect(g.state.company.groupAutorenew).toBeUndefined();
  });

  test('setter validates group, value and owner', () => {
    const { g, grp } = setup();
    setSetting(g.state, 'groupAutorenew', true);
    expect(g.setGroupAutorenew(99999, true).ok).toBe(false);
    expect(g.setGroupAutorenew(grp.id, 'yes').ok).toBe(false);
    expect(g.setGroupAutorenew(grp.id, true, { owner: 2 }).ok).toBe(false);
    expect(g.state.company.groupAutorenew).toBeUndefined();
    const dry = g.setGroupAutorenew(grp.id, false, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(g.state.company.groupAutorenew).toBeUndefined();
  });

  test('on: group off beats company on; group on beats company off', () => {
    const { g, v, other, grp, oldVehicle } = setup();
    setSetting(g.state, 'groupAutorenew', true);
    setSetting(g.state, 'autorenew', true);
    expect(g.setGroupAutorenew(grp.id, false).ok).toBe(true);
    expect(g.state.company.groupAutorenew[grp.id]).toBe(false);
    oldVehicle(v); oldVehicle(other);
    expect(autorenewFor(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBeNull();
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    // ungrouped vehicle keeps following the company setting
    expect(autorenewFor(g.state, other)).toBe(true);
    expect(autorenewVehicle(g.ctx, other)).not.toBeNull();

    // company off, group on
    setSetting(g.state, 'autorenew', false);
    expect(g.setGroupAutorenew(grp.id, true).ok).toBe(true);
    oldVehicle(v);
    expect(autorenewFor(g.state, v)).toBe(true);
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
  });

  test('on: null clears the group entry and it follows the company again', () => {
    const { g, v, grp, oldVehicle } = setup();
    setSetting(g.state, 'groupAutorenew', true);
    setSetting(g.state, 'autorenew', false);
    g.setGroupAutorenew(grp.id, true);
    oldVehicle(v);
    expect(autorenewFor(g.state, v)).toBe(true);
    expect(g.setGroupAutorenew(grp.id, null).ok).toBe(true);
    expect(g.state.company.groupAutorenew).toBeUndefined();
    expect(autorenewFor(g.state, v)).toBe(false);
  });

  test('off: the group flag is ignored and autorenew is company-wide as before', () => {
    const { g, v, grp, oldVehicle } = setup();
    setSetting(g.state, 'groupAutorenew', true);
    setSetting(g.state, 'autorenew', true);
    g.setGroupAutorenew(grp.id, false);
    setSetting(g.state, 'groupAutorenew', false);
    oldVehicle(v);
    expect(autorenewFor(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v)).not.toBeNull();
    // company off + stored group=true: still off, group flag ignored
    setSetting(g.state, 'autorenew', false);
    g.state.company.groupAutorenew[grp.id] = true;
    expect(autorenewFor(g.state, v)).toBe(false);
  });

  test('deleting the group drops its flag; an absent key is never written by default', () => {
    const { g, v, grp } = setup();
    expect(g.serialize()).not.toContain('groupAutorenew');
    setSetting(g.state, 'groupAutorenew', true);
    g.setGroupAutorenew(grp.id, false);
    expect(g.deleteGroup(grp.id).ok).toBe(true);
    expect(g.state.company.groupAutorenew).toBeUndefined();
    expect(v.groupId).toBeUndefined();
  });
});
