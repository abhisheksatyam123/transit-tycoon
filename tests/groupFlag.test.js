import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { isAutoreplaceEligible, autorenewVehicle, massAutoreplace } from '../js/simulation/autorenew.js';

function setUp() {
  const g = flatGame(); const L = coalLine(g);
  const mk = () => { const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' }); expect(r.ok).toBe(true); return r.vehicle; };
  const v1 = mk(), v2 = mk(), v3 = mk();
  g.setAutoreplace('eng_puffer', 'eng_comet');
  for (const v of [v1, v2, v3]) v.state = 'depot';
  const gr = g.createGroup('protected'); const groupId = gr.group.id;
  const gr2 = g.createGroup('open'); const group2Id = gr2.group.id;
  g.addVehicleToGroup(v1.id, groupId);
  g.addVehicleToGroup(v2.id, groupId);
  g.addVehicleToGroup(v3.id, group2Id);
  return { g, L, v1, v2, v3, groupId, group2Id };
}

describe('GroupFlag replace protection', () => {
  test('set/clear replaceProtect and dryRun', () => {
    const { g, groupId } = setUp();
    const grp = () => g.state.company.groups.find(x => x.id === groupId);
    expect(grp().replaceProtect).toBeUndefined();
    expect(g.setGroupFlag(groupId, 'replaceProtect', true).ok).toBe(true);
    expect(grp().replaceProtect).toBe(true);
    expect(g.setGroupFlag(groupId, 'replaceProtection', false).value).toBe(false);
    expect(grp().replaceProtect).toBeUndefined();
    const dry = g.setGroupFlag(groupId, 'replaceProtect', true, { dryRun: true });
    expect(dry).toEqual({ ok: true, cost: 0, flag: 'replaceProtect', value: true });
    expect(grp().replaceProtect).toBeUndefined();
    expect(g.setGroupFlag(99999, 'replaceProtect', true).ok).toBe(false);
  });
  test('protected group not eligible for autoreplace', () => {
    const { g, v1, v3, groupId } = setUp();
    g.setGroupFlag(groupId, 'replaceProtect', true);
    expect(isAutoreplaceEligible(g.state, v1)).toBe(false);
    expect(autorenewVehicle(g.ctx, v1)).toBe(null);
    expect(isAutoreplaceEligible(g.state, v3)).toBe(true);
  });
  test('massAutoreplace skips protected group, replaces unprotected', () => {
    const { g, L, v1, v3, groupId } = setUp();
    g.setGroupFlag(groupId, 'replaceProtect', true);
    const r = massAutoreplace(g.ctx, L.depotId);
    expect(r.ok).toBe(true); expect(r.replaced).toBe(1); expect(r.skipped).toBe(2);
    expect(g.state.vehicles.includes(v1)).toBe(true);
    expect(g.state.vehicles.includes(v3)).toBe(false);
  });
});
