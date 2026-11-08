import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';

import { setIndustryText, MAX_INDUSTRY_TEXT_LENGTH } from '../js/simulation/cmdRename.js';
import { placeIndustry } from '../js/simulation/industries.js';

describe('industry text', () => {
  const withInd = () => { const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20); const id = g.state.industries[0].id; return { g, id }; };
  test('set text on an industry', () => {
    const { g, id } = withInd();
    expect(setIndustryText(g.ctx, id, '  hello  ')).toEqual({ ok: true, cost: 0, text: 'hello' });
    expect(g.state.industries.find((i) => i.id === id).text).toBe('hello');
    expect(setIndustryText(g.ctx, 999999, 'x').ok).toBe(false);
    expect(setIndustryText(g.ctx, id, 42).ok).toBe(false);
  });
  test('empty string deletes ind.text (lazy field)', () => {
    const { g, id } = withInd();
    setIndustryText(g.ctx, id, 'note');
    expect(setIndustryText(g.ctx, id, '   ').ok).toBe(true);
    const ind = g.state.industries.find((i) => i.id === id);
    expect(ind.text).toBeUndefined(); expect('text' in ind).toBe(false);
  });
  test('rejection of control characters', () => {
    const { g, id } = withInd();
    expect(setIndustryText(g.ctx, id, 'a\u0001b').ok).toBe(false);
    expect(setIndustryText(g.ctx, id, 'a\u007fb').ok).toBe(false);
  });
  test('truncation to 320 characters', () => {
    const { g, id } = withInd();
    const r = setIndustryText(g.ctx, id, 'x'.repeat(500));
    expect(r.ok).toBe(true); expect([...r.text].length).toBe(MAX_INDUSTRY_TEXT_LENGTH);
    expect(MAX_INDUSTRY_TEXT_LENGTH).toBe(320);
  });
  test('game.setIndustryText wrapper', () => {
    const { g, id } = withInd();
    expect(g.setIndustryText(id, 'wrapped')).toEqual({ ok: true, cost: 0, text: 'wrapped' });
    expect(g.state.industries.find((i) => i.id === id).text).toBe('wrapped');
  });
  test('save/load round-trip preserves ind.text', () => {
    const { g, id } = withInd();
    setIndustryText(g.ctx, id, 'mine note');
    const back = parseState(serializeState(g.state));
    expect(back.industries.find((i) => i.id === id).text).toBe('mine note');
    const g2 = flatGame(23); placeIndustry(g2.state, 'coal_mine', 10, 20);
    expect(parseState(serializeState(g2.state)).industries[0].text).toBeUndefined();
  });
});
