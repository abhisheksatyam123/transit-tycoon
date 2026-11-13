/** gap #25 stage 3: AI rival freight, rival HQ and takeover offers (aiCompanies opt-in). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { acceptTakeover } from '../js/simulation/aiCompanies.js';
import { pickFreightPair, pickFreightPairs, stopAxisOk, FREIGHT_MIN_DIST, FREIGHT_MAX_DIST } from '../js/simulation/aiFreight.js';

// Load-tolerant timeouts (N13-T). Measured on a quiet machine: 730-day seed-15 freight tests ~10 s,
// 1825-day seed-11 test ~43 s. Under load (~19 on 8 cores) they took 241 s and 339 s, which hit the
// old 120000 / 180000 ms timeouts. LONG_TIMEOUT_MS leaves headroom above the loaded times.
const LONG_TIMEOUT_MS = 300000;

// Baseline money for the same seed without aiCompanies after 730 days. Game instances are fully
// seeded (game.rng) and share no module state, so this value is the same wherever it is computed.
let baselineMoney730 = null;
function baselineMoney() {
  if (baselineMoney730 === null) {
    const base = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    base.stepDays(730);
    baselineMoney730 = base.state.company.money;
  }
  return baselineMoney730;
}

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
  }, LONG_TIMEOUT_MS);

  test('freight roads are paid by the rival (player money not charged)', () => {
    const g = seed15();
    g.stepDays(730);
    // the rival's freight road is rival-owned money: the player's money path is unaffected by it
    expect(g.state.company.money).toBe(baselineMoney());
  }, LONG_TIMEOUT_MS);


  test('pickFreightPairs is a deterministic ranked list within the window, excluding used ids', () => {
    const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    const all = pickFreightPairs(g.state, new Set());
    expect(all.length).toBeGreaterThan(0);
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      expect(p.dist).toBeGreaterThanOrEqual(FREIGHT_MIN_DIST);
      expect(p.dist).toBeLessThanOrEqual(FREIGHT_MAX_DIST);
      expect(p.score).toBe(p.src.production[p.cargo] * 100 - p.dist);
      if (i > 0) expect(all[i - 1].score).toBeGreaterThanOrEqual(p.score);
    }
    // the single-pair helper is the top of the same ranking
    expect(pickFreightPair(g.state, new Set())).toEqual(all[0]);
    // used producer/acceptor ids drop out, and the list is stable across calls
    const used = new Set([all[0].src.id, all[0].dst.id]);
    const rest = pickFreightPairs(g.state, used);
    expect(rest.some((p) => used.has(p.src.id) || used.has(p.dst.id))).toBe(false);
    expect(rest.map((p) => [p.src.id, p.dst.id, p.cargo]))
      .toEqual(all.filter((p) => !used.has(p.src.id) && !used.has(p.dst.id)).map((p) => [p.src.id, p.dst.id, p.cargo]));
    expect(pickFreightPairs(g.state, new Set(), 2)).toEqual(all.slice(0, 2));
  });

  test('stopAxisOk rejects a stop whose existing road would become a junction', () => {
    const xAxis = { road: 2 | 8 }, yAxis = { road: 1 | 4 }, corner = { road: 1 | 2 };
    const eastPath = [{ x: 5, y: 5 }, { x: 6, y: 5 }]; // path leaves its start tile east
    const southPath = [{ x: 5, y: 5 }, { x: 5, y: 6 }]; // path leaves its start tile south
    expect(stopAxisOk({ road: 0 }, eastPath, true)).toBe(true); // empty land takes the path axis
    expect(stopAxisOk(xAxis, eastPath, true)).toBe(true); // existing road already runs along the path
    expect(stopAxisOk(xAxis, southPath, true)).toBe(false); // perpendicular arrival would make a junction
    expect(stopAxisOk(yAxis, southPath, false)).toBe(true); // last tile, step north from the previous tile
    expect(stopAxisOk(corner, eastPath, true)).toBe(false); // already a junction
  });

  test('seed 11 builds a freight route instead of retrying one unbuildable pair', () => {
    const g = Game.create({ seed: 11, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    g.stepDays(1825);
    const r = g.state.rivals[0];
    const freight = r.routes.filter((q) => q.freight);
    expect(freight.length).toBeGreaterThanOrEqual(1);
    const trucks = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'road');
    expect(trucks.length).toBeGreaterThanOrEqual(freight.length);
  }, LONG_TIMEOUT_MS);

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
