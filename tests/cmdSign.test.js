/** Map signs (cmdSign.js): add, edit, delete (empty text), validation, lazy state, save round trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { validateSignText, SIGN_MAX_LENGTH, signAt } from '../js/simulation/cmdSign.js';

describe('validateSignText', () => {
  test('trims, accepts up to 32 characters, rejects control characters and non-strings', () => {
    expect(validateSignText('  Depot  ')).toEqual({ ok: true, text: 'Depot' });
    expect(validateSignText('x'.repeat(SIGN_MAX_LENGTH)).ok).toBe(true);
    expect(validateSignText('x'.repeat(SIGN_MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateSignText('a\nb').ok).toBe(false);
    expect(validateSignText(7).ok).toBe(false);
    expect(validateSignText('   ')).toEqual({ ok: true, text: '' });
  });
});

describe('sign commands', () => {
  test('signs are absent until used (lazy) and a world without signs serializes without the key', () => {
    const g = flatGame(31);
    expect(g.state.signs).toBeUndefined();
    expect(serializeState(g.state)).not.toContain('"signs"');
  });

  test('place, edit, then delete with empty text', () => {
    const g = flatGame(31);
    const r = g.placeSign(5, 6, 'North gate');
    expect(r.ok).toBe(true);
    expect(g.state.signs).toHaveLength(1);
    expect(signAt(g.state, 5, 6).text).toBe('North gate');

    expect(g.editSign(r.sign.id, 'Gate').ok).toBe(true);
    expect(signAt(g.state, 5, 6).text).toBe('Gate');

    // placing on a tile that already has a sign edits it (one sign per tile)
    expect(g.placeSign(5, 6, 'Gate 2').ok).toBe(true);
    expect(g.state.signs).toHaveLength(1);

    expect(g.editSign(r.sign.id, '   ').ok).toBe(true);
    expect(g.state.signs).toBeUndefined(); // last sign gone: the lazy list is dropped again
  });

  test('deleteSign removes one sign and keeps the others', () => {
    const g = flatGame(31);
    const a = g.placeSign(2, 2, 'A').sign;
    const b = g.placeSign(3, 3, 'B').sign;
    expect(g.deleteSign(a.id).ok).toBe(true);
    expect(g.state.signs.map((s) => s.text)).toEqual(['B']);
    expect(g.deleteSign(b.id).ok).toBe(true);
    expect(g.state.signs).toBeUndefined();
    expect(g.deleteSign(b.id).ok).toBe(false);
  });

  test('rejects off-map tiles, empty new text and unknown ids', () => {
    const g = flatGame(31);
    const { width, height } = g.state.map;
    expect(g.placeSign(-1, 0, 'x').ok).toBe(false);
    expect(g.placeSign(width, 0, 'x').ok).toBe(false);
    expect(g.placeSign(0, height, 'x').ok).toBe(false);
    expect(g.placeSign(1, 1, '  ').ok).toBe(false);
    expect(g.editSign(999999, 'x').ok).toBe(false);
  });

  test('dryRun validates without changing the state', () => {
    const g = flatGame(31);
    expect(g.placeSign(4, 4, 'Dry', { dryRun: true }).ok).toBe(true);
    expect(g.state.signs).toBeUndefined();
  });

  test('signs survive a save/load round trip with ids kept', () => {
    const g = flatGame(31);
    g.placeSign(7, 8, 'Museum');
    g.placeSign(9, 10, 'Park');
    const back = parseState(serializeState(g.state));
    expect(back.signs.map((s) => [s.x, s.y, s.text])).toEqual([[7, 8, 'Museum'], [9, 10, 'Park']]);
    expect(back.signs.map((s) => s.id)).toEqual(g.state.signs.map((s) => s.id));
  });
});
