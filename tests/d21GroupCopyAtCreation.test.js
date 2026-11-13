import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { keepLengthState, isKeepLengthFor } from '../js/simulation/autoreplace.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

/** D21 copy-at-creation (opt-in, groupCopyKeepLength, default off). Off = today's lazy follow; on = freeze at creation. */

describe('groupCopyKeepLength (D21)', () => {
  test('default is off and has exactly one settings meta entry', () => {
    expect(DEFAULT_SETTINGS.groupCopyKeepLength).toBe(false);
    expect(SETTING_META.filter((m) => m.key === 'groupCopyKeepLength').length).toBe(1);
  });

  test('off: a new group writes no key and follows the company setting live', () => {
    const g = flatGame();
    const r = g.createGroup('Alpha');
    expect(r.ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
    expect(keepLengthState(g.state, r.group.id).inherited).toBe(true);
    setSetting(g.state, 'renewKeepLength', true);
    expect(keepLengthState(g.state, r.group.id).value).toBe(true);
  });

  test('on: a new group freezes the current company value and ignores later changes', () => {
    const g = flatGame();
    setSetting(g.state, 'groupCopyKeepLength', true);
    setSetting(g.state, 'renewKeepLength', true);
    const a = g.createGroup('Keep');
    expect(a.ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval[a.group.id]).toBe(true);
    setSetting(g.state, 'renewKeepLength', false);
    const st = keepLengthState(g.state, a.group.id);
    expect(st.inherited).toBe(false);
    expect(st.value).toBe(true);
  });

  test('on with keep-length off: the copied value is an explicit false', () => {
    const g = flatGame();
    setSetting(g.state, 'groupCopyKeepLength', true);
    const b = g.createGroup('Plain');
    expect(g.state.company.groupReplaceWagonRemoval[b.group.id]).toBe(false);
    setSetting(g.state, 'renewKeepLength', true);
    expect(isKeepLengthFor(g.state, { ownerId: null, groupId: b.group.id, kind: 'train' })).toBe(false);
  });

  test('dry run and a rejected name write nothing', () => {
    const g = flatGame();
    setSetting(g.state, 'groupCopyKeepLength', true);
    expect(g.createGroup('Dry', { dryRun: true }).ok).toBe(true);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
    expect(g.createGroup('').ok).toBe(false);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
  });

  test('deleting a copied group drops its frozen entry (no stale flag on a reused id)', () => {
    const g = flatGame();
    setSetting(g.state, 'groupCopyKeepLength', true);
    setSetting(g.state, 'renewKeepLength', true);
    const a = g.createGroup('Gone');
    g.deleteGroup(a.group.id);
    expect(g.state.company.groupReplaceWagonRemoval).toBeUndefined();
  });
});
