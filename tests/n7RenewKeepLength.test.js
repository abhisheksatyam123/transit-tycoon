import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { autorenewVehicle, replaceVehicle } from '../js/simulation/autorenew.js';
import { resolvePurchase } from '../js/simulation/vehicles.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { setSetting, DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import {
  isKeepLength, isKeepLengthFor, keepLengthState, setGroupKeepLength,
} from '../js/simulation/autoreplace.js';

/**
 * N7: OpenTTD-style wagon removal / keep-length (D1/D2/D10 of the groups-autoreplace follow-up spec).
 * `renewKeepLength` (default false) caps the replacement chain at the old wagon count and at
 * maxTrainWagons / maxTrainLength, dropping the wagons nearest the engine. Group flag
 * company.groupReplaceWagonRemoval is lazy tri-state (absent = follow the company setting live).
 */

/** Flat map + coal line; rules set in 1960 (Comet available), bought in 1920 (Puffer on sale). */
function setup() {
  const g = flatGame();
  const L = coalLine(g);
  g.state.date.year = 1960;
  const buy = (spec) => {
    const year = g.state.date.year;
    g.state.date.year = 1920;
    const r = g.buyVehicle(L.depotId, spec);
    g.state.date.year = year;
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  const mk = (wagons = 6) => buy({ modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  const mkMixed = () => buy({ modelId: 'eng_puffer', consist: [
    { modelId: 'wag_hopper', cargoId: 'COAL' },
    { modelId: 'wag_box', cargoId: 'GOOD' },
    { modelId: 'wag_hopper', cargoId: 'COAL' },
    { modelId: 'wag_box', cargoId: 'GOOD' },
    { modelId: 'wag_hopper', cargoId: 'COAL' },
    { modelId: 'wag_box', cargoId: 'GOOD' },
  ] });
  const rule = (from = 'eng_puffer', to = 'eng_comet') => { expect(g.setAutoreplace(from, to).ok).toBe(true); };
  const group = (v, name = 'Group A') => {
    const r = g.createGroup(name);
    expect(r.ok).toBe(true);
    expect(g.addVehicleToGroup(v.id, r.group.id).ok).toBe(true);
    return r.group;
  };
  return { g, L, buy, mk, mkMixed, rule, group };
}

describe('N7 renewKeepLength: default off', () => {
  test('DEFAULT_SETTINGS and exactly one SETTING_META entry (group vehicles)', () => {
    expect(DEFAULT_SETTINGS.renewKeepLength).toBe(false);
    const entries = SETTING_META.filter((m) => m.key === 'renewKeepLength');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
  });

  test('off: nothing stored, no group map, and a lowered maxTrainLength does not trim or refuse', () => {
    const { g, mk, rule } = setup();
    const v = mk(6);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
    expect(getSetting(g.state, 'renewKeepLength')).toBe(false);
    rule();
    setSetting(g.state, 'maxTrainLength', 3); // would refuse 6 wagons on a purchase
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.wagons).toBe(6); // count preserved exactly as before, maxTrainLength not enforced here
    expect(nv.capacity).toBe(6 * 30);
  });

  test('off: a save has no new keys', () => {
    const { g, mk } = setup();
    mk(6);
    expect(g.serialize()).not.toContain('renewKeepLength');
    expect(g.serialize()).not.toContain('groupReplaceWagonRemoval');
  });
});

describe('N7 renewKeepLength on: cap trim', () => {
  test('lowered maxTrainLength trims to floor(2*L+1e-9)-1 wagons (3 tiles -> 5) and costs only the kept wagons', () => {
    const { g, L, mk, rule } = setup();
    const v = mk(6);
    // plain replacement, before: 6 wagons (3.5 tiles)
    setSetting(g.state, 'renewKeepLength', true);
    setSetting(g.state, 'maxTrainLength', 3);
    rule();
    v.state = 'depot';
    const oldValue = v.value;
    const r = replaceVehicle(g.ctx, v, 'eng_comet', 'autoreplace');
    expect(r.ok).toBe(true);
    expect(r.vehicle.wagons).toBe(5); // (5+1)*0.5 = 3.0 tiles
    expect(r.vehicle.capacity).toBe(5 * 30);
    // cost is the inflated price of the kept chain minus the old vehicle's resale value
    const depot = g.state.depots.find((d) => d.id === L.depotId);
    const spec = { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 5, cargoId: 'COAL' };
    const price = vehiclePrice(g.state, resolvePurchase(depot, spec, g.state.date.year, false, 12, 3).cost);
    expect(r.cost).toBe(price - oldValue);
    expect(r.vehicle.value).toBe(price - Math.floor(price / 8));
    expect(g.state.vehicles.some((x) => x.id === r.vehicle.id)).toBe(true);
  });

  test('maxTrainWagons is also a cap (old 6, maxTrainLength 7, maxTrainWagons 4 -> 4)', () => {
    const { g, mk, rule } = setup();
    const v = mk(6);
    setSetting(g.state, 'renewKeepLength', true);
    setSetting(g.state, 'maxTrainWagons', 4);
    rule();
    v.state = 'depot';
    expect(autorenewVehicle(g.ctx, v).wagons).toBe(4);
  });

  test('old count already below the cap: nothing is trimmed', () => {
    const { g, mk, rule } = setup();
    const v = mk(4);
    setSetting(g.state, 'renewKeepLength', true);
    setSetting(g.state, 'maxTrainLength', 3); // cap 5, old 4
    rule();
    v.state = 'depot';
    expect(autorenewVehicle(g.ctx, v).wagons).toBe(4);
  });

  test('mixed consist: wagons nearest the engine are dropped, the rear is kept', () => {
    const { g, mkMixed, rule } = setup();
    const v = mkMixed();
    const before = v.consist.map((w) => w.modelId);
    expect(before).toEqual(['wag_hopper', 'wag_box', 'wag_hopper', 'wag_box', 'wag_hopper', 'wag_box']);
    setSetting(g.state, 'renewKeepLength', true);
    setSetting(g.state, 'maxTrainLength', 3); // cap 5 -> drop consist[0]
    rule();
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.wagons).toBe(5);
    expect(nv.consist.map((w) => w.modelId)).toEqual(before.slice(1));
  });
});

describe('N7 group tri-state override', () => {
  test('absent inherits the company setting live', () => {
    const { g, mk, group, rule } = setup();
    const v = mk(6);
    const grp = group(v);
    setSetting(g.state, 'maxTrainLength', 3);
    rule();
    expect(keepLengthState(g.state, grp.id)).toEqual({ value: false, inherited: true, company: false });
    expect(isKeepLengthFor(g.state, v)).toBe(false);
    setSetting(g.state, 'renewKeepLength', true); // the absent group entry follows it live
    expect(keepLengthState(g.state, grp.id)).toEqual({ value: true, inherited: true, company: true });
    expect(isKeepLengthFor(g.state, v)).toBe(true);
    v.state = 'depot';
    expect(autorenewVehicle(g.ctx, v).wagons).toBe(5);
  });

  test('group true overrides company off; group false overrides company on', () => {
    const { g, mk, group, rule } = setup();
    const a = mk(6);
    const b = mk(6);
    const grpA = group(a);
    setSetting(g.state, 'maxTrainLength', 3);
    rule();

    // company off, group on -> trim
    expect(g.setGroupKeepLength(grpA.id, true).ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toEqual({ [grpA.id]: true });
    expect(keepLengthState(g.state, grpA.id)).toEqual({ value: true, inherited: false, company: false });
    a.state = 'depot';
    expect(autorenewVehicle(g.ctx, a).wagons).toBe(5);

    // company on, group false -> no trim
    const grpB = group(b, 'Group B');
    setSetting(g.state, 'renewKeepLength', true);
    expect(g.setGroupKeepLength(grpB.id, false).ok).toBe(true);
    expect(keepLengthState(g.state, grpB.id)).toEqual({ value: false, inherited: false, company: true });
    b.state = 'depot';
    expect(autorenewVehicle(g.ctx, b).wagons).toBe(6);
  });

  test('null clears back to inheritance; dryRun stores nothing; deleteGroup drops the map', () => {
    const { g, group, mk } = setup();
    const v = mk(2);
    const grp = group(v);
    expect(setGroupKeepLength(g.state, grp.id, true, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
    expect(g.setGroupKeepLength(grp.id, false).ok).toBe(true);
    expect(g.setGroupKeepLength(grp.id, null).ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
    expect(keepLengthState(g.state, grp.id)).toEqual({ value: false, inherited: true, company: false });

    expect(g.setGroupKeepLength(grp.id, true).ok).toBe(true);
    expect(g.deleteGroup(grp.id).ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
  });

  test('setter validates group and dryRun', () => {
    const { g } = setup();
    expect(g.setGroupKeepLength(999, true).ok).toBe(false);
  });

  test('save round-trip keeps the setting and the lazy group map', () => {
    const { g, mk, group } = setup();
    const v = mk(2);
    const grp = group(v);
    setSetting(g.state, 'renewKeepLength', true);
    expect(g.setGroupKeepLength(grp.id, false).ok).toBe(true);
    const saved = g.serialize();
    expect(saved).toContain('groupReplaceWagonRemoval');
    const g2 = Game.deserialize(saved);
    expect(getSetting(g2.state, 'renewKeepLength')).toBe(true);
    expect(g2.state.company.groupReplaceWagonRemoval).toEqual({ [grp.id]: false });
    expect(g2.serialize()).toBe(saved);
  });
});

describe('N7 rival vehicles are unaffected', () => {
  test('a rival-owned train never reads the player keep-length policy', () => {
    const { g, mk, rule } = setup();
    const v = mk(6);
    setSetting(g.state, 'renewKeepLength', true);
    setSetting(g.state, 'maxTrainLength', 3);
    rule();
    expect(isKeepLengthFor(g.state, v)).toBe(true);
    const rival = { ...v, ownerId: 7, groupId: null };
    expect(isKeepLengthFor(g.state, rival)).toBe(false);
    v.ownerId = 7; // the real vehicle becomes rival-owned; its replacement must not be trimmed
    v.state = 'depot';
    const r = replaceVehicle(g.ctx, v, 'eng_comet', 'autoreplace');
    if (!r.ok) throw new Error('rival replace failed: ' + r.error);
    expect(r.vehicle.wagons).toBe(6); // not trimmed by the player's setting
  });
});
