/** Town note text (cmdRename.js setTownText): lazy town.text, set/clear/truncate, save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { MAX_TOWN_TEXT_LENGTH } from '../js/simulation/cmdRename.js';

describe('town text', () => {
  test('set, trim, unknown town, control chars refused', () => {
    const g = flatGame(23); const id = g.state.towns[0].id;
    expect(g.setTownText(id, '  hello  ')).toEqual({ ok: true, cost: 0, text: 'hello' });
    expect(g.state.towns[0].text).toBe('hello');
    expect(g.setTownText(999999, 'x').ok).toBe(false);
    expect(g.setTownText(id, 'a\u0001b').ok).toBe(false);
    expect(g.state.towns[0].text).toBe('hello');
  });
  test('blank clears to undefined', () => {
    const g = flatGame(23); const id = g.state.towns[0].id;
    g.setTownText(id, 'note');
    expect(g.setTownText(id, '   ').ok).toBe(true);
    expect(g.state.towns[0].text).toBeUndefined();
    expect('text' in g.state.towns[0]).toBe(false);
  });
  test('truncation to 320 chars', () => {
    const g = flatGame(23); const id = g.state.towns[0].id;
    const r = g.setTownText(id, 'x'.repeat(500));
    expect(r.ok).toBe(true); expect([...r.text].length).toBe(MAX_TOWN_TEXT_LENGTH);
    expect(g.state.towns[0].text.length).toBe(320);
  });
  test('save/load roundtrip; old save without text loads', () => {
    const g = flatGame(23); const id = g.state.towns[0].id;
    g.setTownText(id, 'harbour town');
    const back = parseState(serializeState(g.state));
    expect(back.towns[0].text).toBe('harbour town');
    const g2 = flatGame(23);
    expect(parseState(serializeState(g2.state)).towns[0].text).toBeUndefined();
  });
});
