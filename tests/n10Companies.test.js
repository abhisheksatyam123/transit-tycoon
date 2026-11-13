/** N10: the Companies window shows live rival value/profit and never offers a bankrupt/taken rival. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals, acceptTakeover } from '../js/simulation/aiCompanies.js';
import { companyRows } from '../js/ui/windows/companies.js';

function world(seed = 15) {
  const g = Game.create({ seed, width: 64, height: 64, townCount: 4 });
  setSetting(g.state, 'aiCompanies', 1);
  const r = ensureRivals(g.state, 1)[0];
  g.state.company.money = 1_000_000;
  return { g, r };
}

const rivalRow = (state, id) => companyRows(state).find((row) => row.id === id);

describe('N10 Companies window rows', () => {
  test('rival value is live (cash - loan + fleet), not the month-end companyValue', () => {
    const { g, r } = world();
    r.money = 10_000; r.loan = 2_000; r.companyValue = -999_999; // stale stored value
    g.state.vehicles.push({ id: 999_001, ownerId: r.id, value: 7_500, orders: [], profit: [] });
    expect(rivalRow(g.state, r.id).value).toBe(10_000 - 2_000 + 7_500);
  });

  test('a live rival shows its latest monthly profit and its takeover offer', () => {
    const { g, r } = world();
    r.stats = { profit: -321, vehicles: 0 };
    r.takeoverOffer = { price: 4_000 };
    const row = rivalRow(g.state, r.id);
    expect(row.profit).toBe(-321);
    expect(row.offer).toBe(4_000);
  });

  test('a bankrupt rival shows profit 0 and no Buy button even with a stale offer', () => {
    const { g, r } = world();
    r.bankrupt = true;
    r.stats = { profit: 123_456, vehicles: 3 };
    r.takeoverOffer = { price: 1 }; // stale data that must never become an offer button
    r.companyValue = 987_654;
    const row = rivalRow(g.state, r.id);
    expect(row.bankrupt).toBe(true);
    expect(row.profit).toBe(0);
    expect(row.offer).toBeNull();
  });

  test('after a takeover the rival row has no offer and no stolen fleet value', () => {
    const { g, r } = world();
    g.state.vehicles.push({ id: 999_002, ownerId: r.id, value: 12_345, orders: [], profit: [], state: 'depot' });
    r.takeoverOffer = { price: 0 };
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(true);
    const row = rivalRow(g.state, r.id);
    expect(row.bankrupt).toBe(true);
    expect(row.offer).toBeNull();
    expect(row.value).toBe(r.money - (r.loan || 0)); // the fleet moved to the player
  });
});
