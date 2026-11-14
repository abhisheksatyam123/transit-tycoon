/**
 * aqueductFullSpanLimit (default off): planAqueduct measures an aqueduct like bridges and tunnels (full head-to-head
 * span n > maxLen) when on. Off keeps the legacy n - 2 > maxLen check (off by two). Fixture: same shape as
 * aqueduct.test.js aqGame(), with the east head moved so the head-to-head span is exactly `span` tiles.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { planAqueduct } from '../js/simulation/aqueduct.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const TOO_LONG_PREFIX = 'Aqueduct too long';

/** West head at x=8 (height 1, deck column 9 at 2), valley 10..east-1 at 0, east head at x = 8 + span - 1 (height 2), rear one step down. */
function spanGame(span) {
  const game = Game.create({ seed: 7, width: 40, height: 30 });
  const s = game.state;
  const W = s.map.width;
  const east = 8 + span - 1;
  const H = { 6: 2, 7: 2, 8: 1, 9: 2, [east]: 2, [east + 1]: 1 };
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < W; x++) {
    const t = s.map.tiles[y * W + x];
    let h = 0;
    if (x in H) h = H[x];
    else if (x > east + 1) h = 1;
    t.height = h;
    t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
    delete t.canal; delete t.lock; delete t.aqueduct;
    if (x <= 5) t.terrain = 'water';
  }
  for (const town of s.towns) town.houses = [];
  s.company.money = 5_000_000;
  return game;
}

const plan = (game, span, maxLen, fullSpan) => planAqueduct(game.state.map, 8, 12, 8 + span - 1, 12, maxLen, fullSpan);

describe('aqueductFullSpanLimit: planAqueduct length check', () => {
  test('setting is a boolean that defaults to off', () => {
    expect(DEFAULT_SETTINGS.aqueductFullSpanLimit).toBe(false);
  });

  test('off (4-arg and fullSpan=false): a 14-tile span is accepted at maxLen 12, a 15-tile span is rejected', () => {
    const g14 = spanGame(14);
    const r14 = plan(g14, 14, 12, false);
    expect(r14.ok).toBe(true);
    expect(plan(g14, 14, 12).ok).toBe(true); // 4-arg call unchanged
    const g15 = spanGame(15);
    const r15 = plan(g15, 15, 12, false);
    expect(r15.ok).toBe(false);
    expect(r15.error.startsWith(TOO_LONG_PREFIX)).toBe(true);
  });

  test('on (fullSpan=true): a 12-tile span is accepted at maxLen 12, a 13-tile span is rejected with tooLong', () => {
    const g12 = spanGame(12);
    expect(plan(g12, 12, 12, true).ok).toBe(true);
    const g13 = spanGame(13);
    const r13 = plan(g13, 13, 12, true);
    expect(r13.ok).toBe(false);
    expect(r13.error.startsWith(TOO_LONG_PREFIX)).toBe(true);
    // the same 13-tile span is still accepted with the setting off (the off-by-two)
    expect(plan(g13, 13, 12, false).ok).toBe(true);
  });

  test('game-level: buildCanal reads aqueductFullSpanLimit from state settings', () => {
    const off = spanGame(14);
    expect(off.buildCanal(8, 12, 21, 12).ok).toBe(true);
    const on = spanGame(14);
    setSetting(on.state, 'maxBridgeLength', 12);
    setSetting(on.state, 'aqueductFullSpanLimit', true);
    const r = on.buildCanal(8, 12, 21, 12);
    expect(r.ok).toBe(false);
    expect(r.error.startsWith(TOO_LONG_PREFIX)).toBe(true);
  });

  test('SETTING_META has exactly one aqueductFullSpanLimit entry, a check box in construction', () => {
    const metas = SETTING_META.filter((m) => m.key === 'aqueductFullSpanLimit');
    expect(metas.length).toBe(1);
    expect(metas[0].type).toBe('check');
    expect(metas[0].group).toBe('construction');
  });
});
