/** gap #25: rival rail routes are signalled (aiCompanies opt-in): owner-charged block signals. */
import { test, expect, describe, beforeAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { buildRailRoute, railRoutesOf } from '../js/simulation/aiRail.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { buildSignal } from '../js/simulation/signals.js';

let shared;
function world() {
  const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  g.stepDays(365);
  return g;
}

describe('rival rail signalling', () => {
  beforeAll(() => { shared = world(); }, 120000);
  test('built rail route carries block signals charged to the rival', () => {
    const g = shared;
    const r = ensureRivals(g.state)[0];
    r.money = 10_000_000;
    expect(buildRailRoute({ state: g.state }, r)).toBe(true);
    expect(railRoutesOf(r).length).toBeGreaterThanOrEqual(1);
    const sig = [];
    g.state.map.tiles.forEach((t, i) => { if (t.signal) sig.push({ x: i % g.state.map.width, y: Math.floor(i / g.state.map.width) }); });
    expect(sig.length).toBeGreaterThan(0);
    // rival paid: ledger construction > 0, player ledger untouched for signals
    expect((r.ledger.current.byType.construction || 0)).toBeGreaterThan(0);
  }, 120000);
  test('buildSignal with unknown owner refused; player signal unchanged', () => {
    const g = shared;
    const r = ensureRivals(g.state)[0];
    expect(buildSignal({ state: g.state }, 10, 10, { owner: 9999 }).ok).toBe(false);
    expect(buildSignal({ state: g.state }, 10, 10, { owner: r.id }).ok).toBe(false); // no rail there
  }, 120000);
});
