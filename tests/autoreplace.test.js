import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { autorenewVehicle } from '../js/simulation/autorenew.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';
import { replacementCandidates } from '../js/simulation/autoreplace.js';
import { vehiclePrice } from '../js/simulation/prices.js';

function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('autoreplace (T18b)', () => {
  test('massAutoreplace refuses a rival-owned depot and changes nothing', () => {
    const { g, L, v } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'depot';
    const depot = g.state.depots.find((d) => d.id === L.depotId);
    depot.ownerId = 7;
    const vehicles = g.state.vehicles.slice();
    const money = g.state.company.money;
    const r = g.massAutoreplace(L.depotId);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(RIVAL_OWNED);
    expect(g.state.vehicles).toEqual(vehicles);
    expect(g.state.company.money).toBe(money);
  });
  test('nothing stored by default', () => {
    const { g } = train();
    expect(g.state.company.autoreplace).toBeUndefined();
  });

  test('set/clear validation', () => {
    const { g } = train();
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    expect(g.state.company.autoreplace).toEqual({ eng_puffer: 'eng_comet' });
    expect(g.setAutoreplace('eng_puffer', 'trk_heavy').ok).toBe(false); // other kind
    expect(g.setAutoreplace('eng_puffer', 'eng_puffer').ok).toBe(false); // same model
    expect(g.setAutoreplace('eng_puffer', 'eng_bolt').ok).toBe(false); // not yet introduced in 1920
    expect(g.setAutoreplace('eng_puffer', 'nope').ok).toBe(false);
    expect(g.setAutoreplace('eng_puffer', null).ok).toBe(true);
    expect(g.state.company.autoreplace).toBeUndefined(); // empty rule table removed
  });

  test('bus/truck replacements must share cargo', () => {
    const { g } = train();
    g.state.date.year = 1970; // trk_heavy introduced 1965
    expect(g.setAutoreplace('trk_bulk', 'trk_heavy').ok).toBe(true); // share COAL
    expect(g.setAutoreplace('trk_goods', 'trk_heavy').ok).toBe(false); // GOOD not carried by heavy
    expect(replacementCandidates('trk_goods', 1970).map((m) => m.id)).not.toContain('trk_heavy');
  });

  test('replacement on depot stop keeps orders, name, unit number and wagons; charges the difference', () => {
    const { g, L, v } = train();
    expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]).ok).toBe(true);
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    v.state = 'depot';
    v.value = Math.round(v.value * 0.4);
    const name = v.name, unit = v.unitNumber, cash = g.state.company.money;
    const newPrice = vehiclePrice(g.state, MODEL_BY_ID.eng_comet.cost + MODEL_BY_ID.wag_hopper.cost * 2);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe('eng_comet');
    expect(nv.name).toBe(name);
    expect(nv.unitNumber).toBe(unit);
    expect(nv.wagons).toBe(2);
    expect(nv.wagonModelId).toBe('wag_hopper');
    expect(nv.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
    expect(g.state.vehicles.includes(v)).toBe(false);
    expect(g.state.company.money).toBe(cash - (newPrice - Math.round(v.value)));
  });

  test('a rule applies to a young vehicle too (no age needed); not to other models', () => {
    const { g, v } = train();
    g.setAutoreplace('eng_comet', 'eng_thunder');
    v.state = 'depot';
    expect(v.age).toBeLessThan(v.maxAge);
    expect(autorenewVehicle(g.ctx, v)).toBe(null); // rule is for eng_comet, not eng_puffer
    g.setAutoreplace('eng_puffer', 'eng_comet');
    expect(autorenewVehicle(g.ctx, v).modelId).toBe('eng_comet');
  });

  test('unaffordable replacement is skipped, vehicle kept', () => {
    const { g, v } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'depot';
    g.state.company.money = 10;
    const n = g.state.vehicles.length;
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(g.state.vehicles.length).toBe(n);
    expect(g.state.vehicles.includes(v)).toBe(true);
    expect(g.state.news.some((x) => /could not afford/.test(x.text))).toBe(true);
  });

  test('autorenew still works without rules', () => {
    const { g, v } = train();
    setSetting(g.state, 'autorenew', true);
    v.state = 'depot';
    v.age = v.maxAge + 1;
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv.modelId).toBe('eng_puffer');
  });

  test('save round-trip keeps the rule table', () => {
    const { g } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.autoreplace).toEqual({ eng_puffer: 'eng_comet' });
    expect(g2.serialize()).toBe(g.serialize());
  });
});
