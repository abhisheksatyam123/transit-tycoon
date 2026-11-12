import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { autorenewVehicle, isAutoreplaceEligible } from '../js/simulation/autorenew.js';
import { replacementCandidates } from '../js/simulation/autoreplace.js';

/** A flat map with a coal line; buy trains with the given cargo/wagon (year defaults to 1960, when Comet/Thunder run). */
function line(year = 1960) {
  const g = flatGame();
  const L = coalLine(g);
  g.state.date.year = year;
  const mk = (cargo = 'COAL', wagon = 'wag_hopper') => {
    const year = g.state.date.year;
    g.state.date.year = 1920; // the Puffer is only on sale in 1920; the test year is set for the rules
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: wagon, wagons: 2, cargoId: cargo });
    g.state.date.year = year;
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  return { g, L, mk };
}

function addGroup(g, name = 'Group A') {
  const r = g.createGroup(name);
  expect(r.ok).toBe(true);
  return r.group;
}

describe('E2 per-group autoreplace (opt-in)', () => {
  test('nothing stored by default and company lookup is unchanged', () => {
    const { g, mk } = line();
    const v = mk();
    expect(g.state.company.groupAutoreplace).toBeUndefined();
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    v.state = 'depot';
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
    expect(g.state.company.groupAutoreplace).toBeUndefined();
  });

  test('a group rule overrides the company rule for that group only', () => {
    const { g, mk } = line();
    const a = mk();
    const b = mk();
    const grp = addGroup(g);
    expect(g.addVehicleToGroup(b.id, grp.id).ok).toBe(true);
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_thunder').ok).toBe(true);

    a.state = 'depot';
    b.state = 'depot';
    expect(autorenewVehicle(g.ctx, a).modelId).toBe('eng_comet');
    // b is in the group: its own rule wins over the company rule
    expect(autorenewVehicle(g.ctx, b).modelId).toBe('eng_thunder');
    expect(g.state.company.groupAutoreplace).toEqual({ [grp.id]: { eng_puffer: 'eng_thunder' } });
  });

  test('without a group rule the company rule still applies inside the group', () => {
    const { g, mk } = line();
    const v = mk();
    const grp = addGroup(g);
    g.addVehicleToGroup(v.id, grp.id);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'depot';
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('group setter validation and clearing keep the map lazy', () => {
    const { g } = line();
    const grp = addGroup(g);
    expect(g.setGroupAutoreplace(999, 'eng_puffer', 'eng_comet').ok).toBe(false);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', 'trk_heavy').ok).toBe(false);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_puffer').ok).toBe(false);
    expect(g.setGroupAutoreplace(grp.id, 'nope', 'eng_comet').ok).toBe(false);
    expect(g.state.company.groupAutoreplace).toEqual({ [grp.id]: { eng_puffer: 'eng_comet' } });

    expect(g.clearGroupAutoreplace(grp.id).ok).toBe(true);
    expect(g.state.company.groupAutoreplace).toBeUndefined();
    expect(g.clearGroupAutoreplace(999).ok).toBe(false);
  });

  test('clearing one old model removes the empty group table', () => {
    const { g } = line();
    const grp = addGroup(g);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    g.setGroupAutoreplace(grp.id, 'eng_comet', 'eng_thunder');
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', null).ok).toBe(true);
    expect(g.state.company.groupAutoreplace).toEqual({ [grp.id]: { eng_comet: 'eng_thunder' } });
    g.clearGroupAutoreplace(grp.id, 'eng_comet');
    expect(g.state.company.groupAutoreplace).toBeUndefined();
  });

  test('deleting a group drops its rules', () => {
    const { g } = line();
    const grp = addGroup(g);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    expect(g.deleteGroup(grp.id).ok).toBe(true);
    expect(g.state.company.groupAutoreplace).toBeUndefined();
  });

  test('group rule lookup respects the when-old flag (A1)', () => {
    const { g, mk } = line();
    const v = mk();
    const grp = addGroup(g);
    g.addVehicleToGroup(v.id, grp.id);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_thunder');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    v.state = 'depot';
    v.age = 0;
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    v.age = v.maxAge + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_thunder');
  });

  test('current TT protect semantics: a protected group blocks its own rule and the company rule', () => {
    const { g, mk } = line();
    const v = mk();
    const grp = addGroup(g);
    g.addVehicleToGroup(v.id, grp.id);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_thunder');
    g.setAutoreplace('eng_puffer', 'eng_comet');
    expect(g.setGroupFlag(grp.id, 'replaceProtect', true).ok).toBe(true);
    v.state = 'depot';
    v.age = v.maxAge + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('group rules survive a save round-trip', () => {
    const { g } = line();
    const grp = addGroup(g);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.groupAutoreplace).toEqual({ [grp.id]: { eng_puffer: 'eng_comet' } });
    expect(g2.serialize()).toBe(g.serialize());
  });
});

describe('E2 wagon-kind autoreplace (opt-in)', () => {
  test('wagon models are accepted by the company and group setters; candidates keep the cargo', () => {
    const { g } = line();
    const grp = addGroup(g);
    expect(replacementCandidates('wag_hopper', 1960).map((m) => m.id)).toContain('wag_box');
    expect(replacementCandidates('wag_hopper', 1960).map((m) => m.id)).not.toContain('wag_coach');
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    expect(g.setGroupAutoreplace(grp.id, 'wag_hopper', 'wag_box').ok).toBe(true);
    expect(g.setAutoreplace('wag_hopper', 'wag_coach').ok).toBe(false); // cannot carry GRAI
  });

  test('a wagon rule remaps wagonModelId on replace and keeps the wagon count', () => {
    const { g, mk } = line();
    const v = mk('GRAI', 'wag_hopper');
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.wagons).toBe(2);
    expect(nv.cargoId).toBe('GRAI');
  });

  test('a group wagon rule applies only to that group', () => {
    const { g, mk } = line();
    const a = mk('GRAI', 'wag_hopper');
    const b = mk('GRAI', 'wag_hopper');
    const grp = addGroup(g);
    g.addVehicleToGroup(b.id, grp.id);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setGroupAutoreplace(grp.id, 'wag_hopper', 'wag_box');
    a.state = 'depot';
    b.state = 'depot';
    expect(autorenewVehicle(g.ctx, a).wagonModelId).toBe('wag_hopper');
    expect(autorenewVehicle(g.ctx, b).wagonModelId).toBe('wag_box');
  });

  test('no wagon rule leaves the wagon model exactly as it was', () => {
    const { g, mk } = line();
    const v = mk('COAL', 'wag_hopper');
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.wagonModelId).toBe('wag_hopper');
    expect(nv.wagons).toBe(2);
  });
});
