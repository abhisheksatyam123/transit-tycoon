import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { autorenewVehicle, isAutoreplaceEligible, massAutoreplace } from '../js/simulation/autorenew.js';
import { isVehicleOld } from '../js/simulation/vehicles.js';

/**
 * D4/D5 (groups autoreplace follow-up): a wagon-only rule must trigger a replacement (the engine stays), and a
 * mixed consist must remap each wagon through its own rule. No rule = the old behaviour, byte for byte.
 */

/** Flat map + coal line. Rules are set in 1930 (Puffer and all 1900 wagons are still on sale); buy at 1920. */
function setup(year = 1930) {
  const g = flatGame();
  const L = coalLine(g);
  g.state.date.year = year;
  const buy = (spec) => {
    const y = g.state.date.year;
    g.state.date.year = 1920;
    const r = g.buyVehicle(L.depotId, spec);
    g.state.date.year = y;
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  const mk = (cargo = 'GRAI', wagon = 'wag_hopper', wagons = 2) => buy({ modelId: 'eng_puffer', wagonModelId: wagon, wagons, cargoId: cargo });
  const mkMixed = () => buy({ modelId: 'eng_puffer', consist: [
    { modelId: 'wag_hopper', cargoId: 'GRAI' },
    { modelId: 'wag_coach', cargoId: 'PASS' },
  ] });
  return { g, L, mk, mkMixed, buy };
}

function addGroup(g, name = 'Group A') {
  const r = g.createGroup(name);
  expect(r.ok).toBe(true);
  return r.group;
}

function snapshot(g) {
  return JSON.stringify({ vehicles: g.state.vehicles, company: g.state.company });
}

describe('D4 wagon-only autoreplace rule triggers a replacement', () => {
  test('no engine rule: the wagon rule alone qualifies and fires, keeping the engine', () => {
    const { g, mk } = setup();
    const v = mk('GRAI', 'wag_hopper');
    expect(g.state.company.autoreplace).toBeUndefined();
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);

    v.state = 'depot';
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_puffer'); // the engine rule table had nothing to say: engine unchanged
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.wagons).toBe(2);
    expect(nv.cargoId).toBe('GRAI');
    expect(nv.capacity).toBe(2 * 28); // box van capacity
    expect(g.state.vehicles.includes(v)).toBe(false);
  });

  test('a wagon-only rule still fires when the engine is no longer on sale (1960)', () => {
    const { g, mk } = setup(1960);
    const v = mk('GRAI', 'wag_hopper');
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_puffer');
    expect(nv.wagonModelId).toBe('wag_box');
  });

  test('massAutoreplace picks up a wagon-only rule', () => {
    const { g, L, mk } = setup();
    const v = mk('GRAI', 'wag_hopper');
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    const r = massAutoreplace(g.ctx, L.depotId);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBe(1);
    expect(r.skipped).toBe(0);
    expect(g.state.vehicles[0].modelId).toBe('eng_puffer');
    expect(g.state.vehicles[0].wagonModelId).toBe('wag_box');
  });

  test('engine rule precedence still wins when both rules exist', () => {
    const { g, mk } = setup(1960);
    const v = mk('GRAI', 'wag_hopper');
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.wagons).toBe(2);
  });

  test('a wagon rule set to replace-when-old waits for the train to be old', () => {
    const { g, mk } = setup();
    const v = mk('GRAI', 'wag_hopper');
    g.setAutoreplace('wag_hopper', 'wag_box');
    g.setAutoreplaceWhenOld('wag_hopper', true);
    v.state = 'depot';
    v.age = 10;
    expect(isVehicleOld(g.state, v)).toBe(false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    v.age = v.maxAge + 1;
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    expect(autorenewVehicle(g.ctx, v).wagonModelId).toBe('wag_box');
  });

  test('a protected group still blocks its wagon rule under the default TT semantics', () => {
    const { g, mk } = setup();
    const v = mk('GRAI', 'wag_hopper');
    const grp = addGroup(g);
    g.addVehicleToGroup(v.id, grp.id);
    g.setGroupAutoreplace(grp.id, 'wag_hopper', 'wag_box');
    g.setGroupFlag(grp.id, 'replaceProtect', true);
    v.state = 'depot';
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('a group wagon rule with no engine rule applies only to that group', () => {
    const { g, mk } = setup();
    const a = mk('GRAI', 'wag_hopper');
    const b = mk('GRAI', 'wag_hopper');
    const grp = addGroup(g);
    g.addVehicleToGroup(b.id, grp.id);
    g.setGroupAutoreplace(grp.id, 'wag_hopper', 'wag_box');
    a.state = 'depot';
    b.state = 'depot';
    expect(isAutoreplaceEligible(g.state, a)).toBe(false);
    expect(autorenewVehicle(g.ctx, a)).toBe(null);
    const nv = autorenewVehicle(g.ctx, b);
    expect(nv.modelId).toBe('eng_puffer');
    expect(nv.wagonModelId).toBe('wag_box');
  });
});

describe('D4 no wagon rule = unchanged default', () => {
  test('a plain train with no rule is untouched and the state is byte-identical', () => {
    const { g, mk } = setup();
    const v = mk('GRAI', 'wag_hopper');
    v.state = 'depot';
    const before = snapshot(g);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(snapshot(g)).toBe(before);
    expect(v.wagonModelId).toBe('wag_hopper');
    expect(v.modelId).toBe('eng_puffer');
  });

  test('an engine rule alone leaves the wagon model as it was', () => {
    const { g, mk } = setup(1960);
    const v = mk('GRAI', 'wag_hopper');
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.wagonModelId).toBe('wag_hopper');
    expect(nv.wagons).toBe(2);
  });
});

describe('D5 mixed consists remap each wagon through its own rule', () => {
  function mixed(year = 1930) {
    const ctx = setup(year);
    const v = ctx.mkMixed();
    expect(v.consist).toEqual([
      { modelId: 'wag_hopper', cargoId: 'GRAI' },
      { modelId: 'wag_coach', cargoId: 'PASS' },
    ]);
    return { ...ctx, v };
  }

  test('only the wagon with a rule changes; shape and cargo are preserved', () => {
    const { g, v } = mixed();
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).not.toBe(null);
    expect(nv.modelId).toBe('eng_puffer');
    expect(nv.wagons).toBe(2);
    expect(nv.consist).toEqual([
      { modelId: 'wag_box', cargoId: 'GRAI' },
      { modelId: 'wag_coach', cargoId: 'PASS' },
    ]);
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.capacity).toBe(28 + 40);
    expect(nv.cargoId).toBe('GRAI');
  });

  test('a mixed consist with no rule is untouched (byte-identical default)', () => {
    const { g, v } = mixed();
    v.state = 'depot';
    const before = snapshot(g);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(snapshot(g)).toBe(before);
    expect(v.consist.map((w) => w.modelId)).toEqual(['wag_hopper', 'wag_coach']);
  });

  test('a rule the wagon cargo cannot use leaves that wagon as identity', () => {
    // hopper -> box is a valid rule (they share GRAI), but this hopper carries COAL, which the box van cannot carry.
    const { g, mk } = setup();
    const v = mk('COAL', 'wag_hopper');
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    expect(v.cargoId).toBe('COAL');
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('engine rule precedence still wins for a mixed consist', () => {
    const { g, v } = mixed(1960);
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplace('wag_hopper', 'wag_box');
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.consist).toEqual([
      { modelId: 'wag_box', cargoId: 'GRAI' },
      { modelId: 'wag_coach', cargoId: 'PASS' },
    ]);
  });

  test('a remap that makes the consist uniform drops the consist list', () => {
    const { g, buy } = setup();
    const v = buy({ modelId: 'eng_puffer', consist: [
      { modelId: 'wag_hopper', cargoId: 'GRAI' },
      { modelId: 'wag_box', cargoId: 'GRAI' },
    ] });
    expect(v.consist.map((w) => w.modelId)).toEqual(['wag_hopper', 'wag_box']);
    expect(g.setAutoreplace('wag_hopper', 'wag_box').ok).toBe(true);
    v.state = 'depot';
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.wagons).toBe(2);
    expect(nv.wagonModelId).toBe('wag_box');
    expect(nv.consist).toBeUndefined();
    expect(nv.capacity).toBe(2 * 28);
  });
});
