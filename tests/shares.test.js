/** Company shares (OpenTTD economy.cpp share trading, simplified): price, money, 6-month rule, takeover, value. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { sharePrice, sharesValue, shareBlock } from '../js/simulation/shares.js';
import { calculateCompanyValue } from '../js/simulation/loco/company.js';

/** A game with one rival (founded now) and shares on; the rival's value is pinned for exact prices. */
function world(value = 40000, { on = true, age = 12 } = {}) {
  const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4 });
  if (on) setSetting(g.state, 'shares', true);
  setSetting(g.state, 'aiCompanies', 1);
  const [r] = ensureRivals(g.state, 1);
  r.companyValue = value;
  r.foundedAt = g.state.date.year * 12 + g.state.date.month - age;
  g.state.company.money = 1_000_000;
  return { g, r };
}

describe('company shares', () => {
  test('default off: trading is refused and the setting is false', () => {
    const { g, r } = world(40000, { on: false });
    expect(g.state.settings?.shares ?? false).toBe(false);
    expect(g.tradeShare(r.id, 'buy').ok).toBe(false);
    expect(shareBlock(g.state, r.id, 'buy')).toMatch(/switched off/);
  });

  test('buy costs value/4 and sell refunds value/4; money moves accordingly', () => {
    const { g, r } = world(40000);
    const m0 = g.state.company.money;
    expect(sharePrice(r)).toBe(10000);
    const b = g.tradeShare(r.id, 'buy');
    expect(b).toMatchObject({ ok: true, price: 10000 });
    expect(g.state.company.money).toBe(m0 - 10000);
    expect(r.playerShares).toBe(1);
    const s = g.tradeShare(r.id, 'sell');
    expect(s).toMatchObject({ ok: true, price: 10000 });
    expect(g.state.company.money).toBe(m0);
    expect(r.playerShares).toBe(0);
  });

  test('cannot sell a share you do not own; cannot buy with too little money', () => {
    const { g, r } = world(40000);
    expect(g.tradeShare(r.id, 'sell').ok).toBe(false);
    g.state.company.money = 5000;
    expect(g.tradeShare(r.id, 'buy').ok).toBe(false);
    expect(r.playerShares ?? 0).toBe(0);
  });

  test('6-month rule: a company younger than 6 months cannot be bought', () => {
    const { g, r } = world(40000, { age: 5 });
    expect(g.tradeShare(r.id, 'buy').ok).toBe(false);
    expect(shareBlock(g.state, r.id, 'buy')).toMatch(/6 months/);
    g.stepDays(31 * 2);
    expect(g.tradeShare(r.id, 'buy').ok).toBe(true);
  });

  test('the 4th share takes the rival over: stations, vehicles, money and the rival are gone/moved', () => {
    const { g, r } = world(40000);
    r.money = 70000; r.loan = 0;
    const m0 = g.state.company.money;
    for (let i = 0; i < 3; i++) expect(g.tradeShare(r.id, 'buy').takeover).toBeUndefined();
    expect(r.playerShares).toBe(3);
    const last = g.tradeShare(r.id, 'buy');
    expect(last).toMatchObject({ ok: true, takeover: true });
    expect(r.bankrupt).toBe(true);
    expect(r.taken).toBe(true);
    expect(r.playerShares).toBeUndefined();
    // paid 4 x 10000 for shares, got the rival cash (70000) earned on takeover
    expect(g.state.company.money).toBe(m0 - 40000 + 70000);
    expect(shareBlock(g.state, r.id, 'buy')).toMatch(/no longer listed/);
  });

  test('company value includes the value of the rival shares the player holds', () => {
    const { g, r } = world(40000);
    const base = calculateCompanyValue(g.state.company, []).companyValue;
    g.tradeShare(r.id, 'buy');
    g.tradeShare(r.id, 'buy');
    expect(sharesValue(g.state)).toBe(2 * 10000);
    expect(sharesValue(g.state)).toBeGreaterThan(0);
    // buying spends cash 1:1 for share value, so cash + shares keeps the player's total value
    expect(calculateCompanyValue(g.state.company, []).companyValue + sharesValue(g.state)).toBe(base);
    expect(sharePrice(r)).toBe(10000);
  });
});
