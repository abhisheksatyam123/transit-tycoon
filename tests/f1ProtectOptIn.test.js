import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { autoreplaceTarget } from '../js/simulation/autoreplace.js';
import { autorenewVehicle, isAutoreplaceEligible, massAutoreplace } from '../js/simulation/autorenew.js';
import { effectiveMaxAge } from '../js/simulation/vehicles.js';

/** Flat map + coal line. Rules are set in 1960 (Comet/Thunder on sale); the Puffer is bought in 1920. */
function setup() {
  const g = flatGame();
  const L = coalLine(g);
  g.state.date.year = 1960;
  const mk = (cargo = 'COAL', wagon = 'wag_hopper') => {
    const year = g.state.date.year;
    g.state.date.year = 1920;
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: wagon, wagons: 2, cargoId: cargo });
    g.state.date.year = year;
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  const protectedGroup = g.createGroup('protected');
  expect(protectedGroup.ok).toBe(true);
  const openGroup = g.createGroup('open');
  expect(openGroup.ok).toBe(true);
  return { g, L, mk, groupId: protectedGroup.group.id, openId: openGroup.group.id };
}

function protect(g, groupId) {
  expect(g.setGroupFlag(groupId, 'replaceProtect', true).ok).toBe(true);
}

describe('F1 protect opt-in (default: current TT semantics)', () => {
  test('setting exists, defaults off and is not written by a new game', () => {
    expect(DEFAULT_SETTINGS.autoreplaceProtectOttd).toBe(false);
    const { g, mk, groupId } = setup();
    mk();
    g.addVehicleToGroup(g.state.vehicles[0].id, groupId);
    protect(g, groupId);
    expect(getSetting(g.state, 'autoreplaceProtectOttd')).toBe(false);
    expect(g.state.settings?.autoreplaceProtectOttd).toBeUndefined();
    expect(g.serialize()).not.toContain('autoreplaceProtectOttd');
  });

  test('protected group blocks its own rule and the company rule', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    expect(g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder').ok).toBe(true);
    protect(g, groupId);
    v.state = 'depot';
    expect(autoreplaceTarget(g.state, v)).toBeUndefined();
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(g.state.vehicles.includes(v)).toBe(true);
  });

  test('mass autoreplace skips a protected group even with a group rule', () => {
    const { g, L, mk, groupId } = setup();
    const a = mk(), b = mk();
    g.addVehicleToGroup(a.id, groupId);
    g.addVehicleToGroup(b.id, groupId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder');
    protect(g, groupId);
    a.state = 'depot'; b.state = 'depot';
    const r = massAutoreplace(g.ctx, L.depotId);
    expect(r.ok).toBe(true); expect(r.replaced).toBe(0); expect(r.skipped).toBe(2);
    expect(g.state.vehicles.includes(a)).toBe(true);
    expect(g.state.vehicles.includes(b)).toBe(true);
  });

  test('autorenew by age is blocked too (TT behaviour)', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    protect(g, groupId);
    setSetting(g.state, 'autorenew', true);
    v.state = 'depot';
    v.age = effectiveMaxAge(g.state, v) + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });
});

describe('F1 protect opt-in (OpenTTD semantics)', () => {
  test('protected group: its own rule applies and wins over the company rule', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder');
    protect(g, groupId);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    v.state = 'depot';
    expect(autoreplaceTarget(g.state, v)).toBe('eng_thunder');
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_thunder');
    expect(g.state.vehicles.includes(v)).toBe(false);
  });

  test('protected group does not fall back to the company rule', () => {
    const { g, L, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    protect(g, groupId);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    v.state = 'depot';
    expect(autoreplaceTarget(g.state, v)).toBeUndefined();
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(massAutoreplace(g.ctx, L.depotId).replaced).toBe(0);
    expect(g.state.vehicles.includes(v)).toBe(true);
  });

  test('unprotected group still falls back to the company rule', () => {
    const { g, mk, openId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, openId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    v.state = 'depot';
    expect(autoreplaceTarget(g.state, v)).toBe('eng_comet');
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('group rule respects replace-when-old: young waits, old replaces', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    protect(g, groupId);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    v.state = 'depot';
    expect(autoreplaceTarget(g.state, v)).toBe('eng_thunder');
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    v.age = effectiveMaxAge(g.state, v) + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_thunder');
  });

  test('when-old protected group stays blocked while the opt-in is off, even when old', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    protect(g, groupId);
    v.state = 'depot';
    v.age = effectiveMaxAge(g.state, v) + 1;
    expect(autoreplaceTarget(g.state, v)).toBeUndefined();
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('autorenew by age still runs in a protected group (no rule)', () => {
    const { g, mk, groupId } = setup();
    const v = mk();
    g.addVehicleToGroup(v.id, groupId);
    protect(g, groupId);
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    g.state.date.year = 1920; // the Puffer is still on sale for the same-model renewal
    v.state = 'depot';
    v.age = effectiveMaxAge(g.state, v) + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_puffer');
  });

  test('group wagon rule remaps the wagon model when the group is protected', () => {
    const { g, mk, groupId } = setup();
    const v = mk('GRAI', 'wag_hopper');
    g.addVehicleToGroup(v.id, groupId);
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_comet');
    expect(g.setGroupAutoreplace(groupId, 'wag_hopper', 'wag_box').ok).toBe(true);
    protect(g, groupId);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.wagons).toBe(2);
    expect(nv.cargoId).toBe('GRAI');
  });

  test('mass autoreplace applies the protected group rule only', () => {
    const { g, L, mk, groupId, openId } = setup();
    const a = mk(), b = mk();
    g.addVehicleToGroup(a.id, groupId);
    g.addVehicleToGroup(b.id, openId);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setGroupAutoreplace(groupId, 'eng_puffer', 'eng_thunder');
    protect(g, groupId);
    setSetting(g.state, 'autoreplaceProtectOttd', true);
    a.state = 'depot'; b.state = 'depot';
    const r = massAutoreplace(g.ctx, L.depotId);
    expect(r.ok).toBe(true); expect(r.replaced).toBe(2); expect(r.skipped).toBe(0);
    const models = g.state.vehicles.map((v) => v.modelId).sort();
    expect(models).toEqual(['eng_comet', 'eng_thunder']);
  });
});
