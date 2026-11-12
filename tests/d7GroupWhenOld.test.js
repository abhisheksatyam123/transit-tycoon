import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { autorenewVehicle, isAutoreplaceEligible } from '../js/simulation/autorenew.js';
import { isVehicleOld } from '../js/simulation/vehicles.js';
import {
  isReplaceWhenOld, isReplaceWhenOldFor, autoreplaceWhenOldState, setGroupAutoreplaceWhenOld,
} from '../js/simulation/autoreplace.js';

/**
 * D7: per-group replace-when-old. Lazy company.groupAutoreplaceWhenOld = { [gid]: { [oldModelId]: true|false } };
 * an absent entry inherits the company flag live; true/false is an explicit override. Nothing is stored by default.
 */

function setup() {
  const g = flatGame();
  const L = coalLine(g);
  const buy = () => {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  const group = (v, name = 'Group A') => {
    const r = g.createGroup(name);
    expect(r.ok).toBe(true);
    expect(g.addVehicleToGroup(v.id, r.group.id).ok).toBe(true);
    return r.group;
  };
  return { g, L, buy, group };
}

function age(v, old) {
  v.age = old ? v.maxAge + 1 : 10;
  expect(isVehicleOld({ company: {}, settings: {} }, v)).toBe(old);
}

describe('D7 per-group replace-when-old', () => {
  test('nothing stored by default; company scope helper is inherited', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();
    expect(autoreplaceWhenOldState(g.state, null, 'eng_puffer')).toEqual({ value: false, inherited: true, company: false });
    expect(autoreplaceWhenOldState(g.state, grp.id, 'eng_puffer')).toEqual({ value: false, inherited: true, company: false });
  });

  test('absent group entry inherits company on (young waits, old replaces)', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();
    expect(autoreplaceWhenOldState(g.state, grp.id, 'eng_puffer')).toEqual({ value: true, inherited: true, company: true });

    v.state = 'depot';
    age(v, false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    age(v, true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('absent group entry inherits company off (young replaces immediately)', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    v.state = 'depot';
    age(v, false);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('group true overrides company off (young waits)', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    expect(g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', true).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toEqual({ [grp.id]: { eng_puffer: true } });
    expect(g.state.company.autoreplaceWhenOld).toBeUndefined();
    v.state = 'depot';
    age(v, false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    age(v, true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('group false overrides company on (young replaces)', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    expect(g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', false).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toEqual({ [grp.id]: { eng_puffer: false } });
    expect(autoreplaceWhenOldState(g.state, grp.id, 'eng_puffer')).toEqual({ value: false, inherited: false, company: true });
    v.state = 'depot';
    age(v, false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('clearing the entry returns to inheritance', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', false);
    expect(g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', null).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();
    expect(autoreplaceWhenOldState(g.state, grp.id, 'eng_puffer')).toEqual({ value: true, inherited: true, company: true });
    v.state = 'depot';
    age(v, false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('clearing the group rule also clears its when-old entry; deleteGroup drops the table', () => {
    const { g, buy, group } = setup();
    const a = buy();
    const b = buy();
    const grp = group(a);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', true);
    expect(g.setGroupAutoreplace(grp.id, 'eng_puffer', null).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();

    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', true);
    g.setGroupAutoreplaceWhenOld(grp.id, 'wag_hopper', false);
    expect(g.deleteGroup(grp.id).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();
    expect(b.id).toBeTruthy();
  });

  test('setter validates group and model; dryRun stores nothing', () => {
    const { g, buy, group } = setup();
    const grp = group(buy());
    expect(g.setGroupAutoreplaceWhenOld(999, 'eng_puffer', true).ok).toBe(false);
    expect(g.setGroupAutoreplaceWhenOld(grp.id, 'nope', true).ok).toBe(false);
    expect(setGroupAutoreplaceWhenOld(g.state, grp.id, 'eng_puffer', true, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.groupAutoreplaceWhenOld).toBeUndefined();
  });

  test('group when-old gates a wagon rule too', () => {
    const { g, L, group } = setup();
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'GRAI' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'wag_hopper', 'wag_box');
    g.setGroupAutoreplaceWhenOld(grp.id, 'wag_hopper', true);
    v.state = 'depot';
    age(v, false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    age(v, true);
    expect(autorenewVehicle(g.ctx, v).wagonModelId).toBe('wag_box');
  });

  test('rival-owned vehicles do not read the player group entry', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', true);
    expect(isReplaceWhenOldFor(g.state, v, 'eng_puffer')).toBe(true);
    const rival = { ...v, ownerId: 7, groupId: grp.id };
    expect(isReplaceWhenOldFor(g.state, rival, 'eng_puffer')).toBe(false);
    expect(isReplaceWhenOld(g.state, 'eng_puffer')).toBe(false);
  });

  test('save round-trip keeps the group map; default save has no key', () => {
    const { g, buy, group } = setup();
    const v = buy();
    const grp = group(v);
    g.setGroupAutoreplace(grp.id, 'eng_puffer', 'eng_comet');
    expect(g.serialize()).not.toContain('groupAutoreplaceWhenOld');
    expect(g.setGroupAutoreplaceWhenOld(grp.id, 'eng_puffer', false).ok).toBe(true);
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.groupAutoreplaceWhenOld).toEqual({ [grp.id]: { eng_puffer: false } });
    expect(g2.serialize()).toBe(g.serialize());
  });
});
