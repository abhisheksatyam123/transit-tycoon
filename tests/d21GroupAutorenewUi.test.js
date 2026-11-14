import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { AUTORENEW_OPTIONS, autorenewOptionOf, autorenewValueOf, groupAutorenewVisible } from '../js/ui/windows/vehicleList.js';

/** D21 group window autorenew control (tri-state select, shown only when groupAutorenew is on). Pure helpers only. */

describe('group autorenew select mapping (D21 UI)', () => {
  test('three options in order: company default, renew on, renew off', () => {
    expect(AUTORENEW_OPTIONS).toEqual([['default', 'Company default'], ['on', 'Renew on'], ['off', 'Renew off']]);
  });

  test('stored value maps to option (absent = company default)', () => {
    expect(autorenewOptionOf(undefined)).toBe('default');
    expect(autorenewOptionOf(null)).toBe('default');
    expect(autorenewOptionOf(true)).toBe('on');
    expect(autorenewOptionOf(false)).toBe('off');
  });

  test('option maps back to command value (default clears the entry)', () => {
    expect(autorenewValueOf('default')).toBeNull();
    expect(autorenewValueOf('on')).toBe(true);
    expect(autorenewValueOf('off')).toBe(false);
    expect(autorenewValueOf('bogus')).toBeNull();
  });

  test('round trip stored -> option -> stored for every state', () => {
    for (const stored of [undefined, true, false]) {
      const back = autorenewValueOf(autorenewOptionOf(stored));
      expect(back ?? undefined).toBe(stored);
    }
  });
});

describe('group autorenew control visibility (D21 UI)', () => {
  const grp = { id: 3, name: 'Old', ownerId: null };

  test('hidden while groupAutorenew is off (default), whatever the group', () => {
    expect(groupAutorenewVisible(false, grp)).toBe(false);
    expect(groupAutorenewVisible(undefined, grp)).toBe(false);
  });

  test('shown for a selected player group when groupAutorenew is on', () => {
    expect(groupAutorenewVisible(true, grp)).toBe(true);
  });

  test('hidden when no group is selected or the group is owned by a rival', () => {
    expect(groupAutorenewVisible(true, null)).toBe(false);
    expect(groupAutorenewVisible(true, undefined)).toBe(false);
    expect(groupAutorenewVisible(true, { id: 4, ownerId: 2 })).toBe(false);
  });

  test('visibility follows the real setting (default off, on when set)', () => {
    const g = flatGame(5);
    expect(groupAutorenewVisible(getSetting(g.state, 'groupAutorenew'), grp)).toBe(false);
    setSetting(g.state, 'groupAutorenew', true);
    expect(groupAutorenewVisible(getSetting(g.state, 'groupAutorenew'), grp)).toBe(true);
  });
});
