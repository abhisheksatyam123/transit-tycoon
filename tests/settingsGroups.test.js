import { test, expect } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_GROUPS, SETTING_META, PREF_META, groupOfSetting, isChanged, matchesQuery } from '../js/ui/settingsGroups.js';
import { parseMoneyLabel, formatCostReadout } from '../js/ui/costReadout.js';

const groupIds = new Set(SETTING_GROUPS.map((g) => g.id));

test('every DEFAULT_SETTINGS key appears in exactly one group', () => {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const hits = SETTING_META.filter((m) => m.key === key);
    expect(hits.length).toBe(1);
    expect(groupIds.has(hits[0].group)).toBe(true);
  }
  // no metadata entry for a key the sim does not have
  for (const m of SETTING_META) expect(Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, m.key)).toBe(true);
});

test('group metadata is complete and unique', () => {
  expect(SETTING_GROUPS.map((g) => g.id)).toEqual(['interface', 'construction', 'vehicles', 'economy', 'environment', 'companies', 'difficulty']);
  expect(new Set(SETTING_GROUPS.map((g) => g.id)).size).toBe(SETTING_GROUPS.length);
  for (const g of SETTING_GROUPS) {
    expect(g.title.length).toBeGreaterThan(0);
    expect(g.help.length).toBeGreaterThan(0);
  }
  for (const m of [...SETTING_META, ...PREF_META]) {
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.help.length).toBeGreaterThan(0);
    expect(groupIds.has(m.group)).toBe(true);
  }
  for (const m of SETTING_META) {
    if (m.type === 'select') expect(m.options.length).toBeGreaterThan(0);
    if (m.type === 'number') expect(m.min).toBeLessThan(m.max);
  }
  expect(groupOfSetting('breakdowns')).toBe('vehicles');
  expect(groupOfSetting('nope')).toBeUndefined();
});

test('new-game options are marked and stay live-toggleable (not read-only)', () => {
  for (const key of ['extraIndustries', 'farmFields']) {
    const m = SETTING_META.find((x) => x.key === key);
    expect(m.newGame).toBe(true);
    expect(m.type).toBe('check');
  }
});

test('isChanged compares against defaults', () => {
  expect(isChanged('inflation', true, DEFAULT_SETTINGS)).toBe(false);
  expect(isChanged('inflation', false, DEFAULT_SETTINGS)).toBe(true);
  expect(isChanged('serviceIntervalDays', 0, DEFAULT_SETTINGS)).toBe(false);
});

test('search matches label, help and group title, case-insensitively', () => {
  const titles = Object.fromEntries(SETTING_GROUPS.map((g) => [g.id, g.title]));
  const item = (k) => SETTING_META.find((m) => m.key === k);
  expect(matchesQuery(item('treeGrowth'), '', titles)).toBe(true);
  expect(matchesQuery(item('treeGrowth'), 'TREE', titles)).toBe(true);
  expect(matchesQuery(item('gradients'), 'slope', titles) || matchesQuery(item('gradients'), 'uphill', titles)).toBe(true);
  expect(matchesQuery(item('inflation'), 'zzz-nope', titles)).toBe(false);
  expect(matchesQuery(item('subsidies'), 'economy', titles)).toBe(true);
});

test('cost readout: parses money labels and rejects non-money text', () => {
  expect(parseMoneyLabel('$1,234')).toBe(1234);
  expect(parseMoneyLabel('-$12')).toBe(-12);
  expect(parseMoneyLabel('Not possible')).toBeNull();
  expect(parseMoneyLabel('')).toBeNull();
});

test('cost readout: good, over-budget and refused states', () => {
  const ok = formatCostReadout({ ok: true, label: '$500' }, 2000);
  expect(ok.tone).toBe('good');
  expect(ok.text).toBe('Cost $500 · Balance after $1,500');
  const broke = formatCostReadout({ ok: true, label: '$2,500' }, 2000);
  expect(broke.tone).toBe('bad');
  expect(broke.text).toBe('Cost $2,500 · Balance after -$500');
  const refused = formatCostReadout({ ok: false, label: 'Water in the way' }, 2000);
  expect(refused.tone).toBe('bad');
  expect(refused.text).toBe('Not possible: Water in the way');
  const odd = formatCostReadout({ ok: true, label: 'free' }, 10);
  expect(odd.tone).toBe('neutral');
});
