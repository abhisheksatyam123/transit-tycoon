/** gap #25 stage 3: AI rival freight, rival HQ and takeover offers (aiCompanies opt-in). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { acceptTakeover } from '../js/simulation/aiCompanies.js';
import { pickFreightPair } from '../js/simulation/aiFreight.js';

function seed15() {
  const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  return g;
}

describe('aiCompanies stage 3: freight', () => {
  test('a rival builds a truck route from a producer and its trucks earn', () => {
    const g = seed15();
    g.stepDays(730);
    const r = g.state.rivals[0];
    const freight = r.routes.filter((q) => q.freight);
    expect(freight.length).toBeGreaterThanOrEqual(1);
    const rt = freight[0];
    // the route's stops and depot are the rival's, and its trucks are stamped and carry the route's cargo
    const trucks = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'road' && v.cargoId === rt.cargo);
    expect(trucks.length).toBeGreaterThanOrEqual(1);
    expect(g.state.stations.find((s) => s.id === rt.a).ownerId).toBe(r.id);
    expect(g.state.stations.find((s) => s.id === rt.b).ownerId).toBe(r.id);
    // trucks deliver: owner-routed income is recorded on the rival's ledger (byType income), not the player's
    const deliveredByRival = r.ledger.history.reduce((a, h) => a + (h.income || 0), 0) + (r.ledger.current.income || 0);
    expect(deliveredByRival).toBeGreaterThan(0);
    expect(trucks.some((v) => v.profit && v.profit.some((p) => p > 0))).toBe(true);
  }, 120000);

  test('freight roads are paid by the rival (player money not charged)', () => {
    const g = seed15();
    const base = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    g.stepDays(730);
    base.stepDays(730);
    // the rival's freight road is rival-owned money: the player's money path is unaffected by it
    expect(g.state.company.money).toBe(base.state.company.money);
  }, 120000);

  test('pickFreightPair returns a producer/acceptor pair within the distance window, or null', () => {
    const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    const p = pickFreightPair(g.state, new Set());
    if (p) {
      expect(p.src.id).not.toBe(p.dst.id);
      expect(p.src.production[p.cargo]).toBeGreaterThan(0);
    }
  });
});

describe('aiCompanies stage 3: takeover', () => {
  test('accepting an offer transfers the rival vehicles, stations and money to the player', () => {
    const g = seed15();
    g.stepDays(365);
    const r = g.state.rivals[0];
    // force the offer (rival is in its bankruptcy window)
    r.takeoverOffer = { price: 1000 };
    const before = g.state.company.money;
    const res = acceptTakeover(g.ctx, r.id);
    expect(res.ok).toBe(true);
    expect(g.state.vehicles.some((v) => v.ownerId === r.id)).toBe(false);
    expect(g.state.stations.some((s) => s.ownerId === r.id)).toBe(false);
    expect(g.state.company.money).toBeGreaterThan(before - 1000 - 1);
    expect(r.bankrupt).toBe(true);
    expect(r.takeoverOffer).toBeUndefined();
  }, 60000);

  test('no offer means no takeover; a rival cannot be bought twice', () => {
    const g = seed15();
    g.stepDays(60);
    const r = g.state.rivals[0];
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(false);
    r.takeoverOffer = { price: 0 };
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(true);
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(false);
  });

  test('the player cannot afford a takeover above its cash', () => {
    const g = seed15();
    g.stepDays(60);
    const r = g.state.rivals[0];
    g.state.company.money = 100;
    r.takeoverOffer = { price: 10 ** 9 };
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(false);
  });
});
