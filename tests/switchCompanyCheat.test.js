/** Switch company cheat (OpenTTD switch_company / CmdChangeCompanySetting, cheat_type.h:20). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { switchCompany, activeCompanyId } from '../js/simulation/cheats.js';
import { companyOf, companyById } from '../js/simulation/owner.js';
import { serializeState, parseState } from '../js/simulation/save.js';

function withRival(g) {
  g.state.rivals = [{ id: 1, name: 'RivalOne', money: 500 }];
  return g;
}

describe('switchCompany cheat', () => {
  test('default activeCompanyId is 0 / null and cheated is false', () => {
    const g = flatGame(3);
    expect(activeCompanyId(g.state)).toBe(0);
    expect(g.state.activeCompanyId ?? null).toBe(null);
    expect(g.state.cheated).toBeUndefined();
    expect(g.activeCompanyId).toBe(0);
  });
  test('switchCompany sets activeCompanyId to rival id, marks game as cheated', () => {
    const g = withRival(flatGame(3));
    const r = switchCompany(g.state, 1);
    expect(r).toEqual({ ok: true, activeCompanyId: 1 });
    expect(g.state.activeCompanyId).toBe(1);
    expect(g.state.cheated).toBe(true);
    expect(activeCompanyId(g.state)).toBe(1);
    expect(g.activeCompanyId).toBe(1);
    expect(g.switchCompany(null).ok).toBe(true);
  });
  test('companyOf / ownership resolves to active company', () => {
    const g = withRival(flatGame(3));
    switchCompany(g.state, 1);
    expect(companyOf(g.state, {})).toBe(g.state.rivals[0]);
    expect(companyById(g.state, null)).toBe(g.state.rivals[0]);
    expect(companyById(g.state, 1)).toBe(g.state.rivals[0]);
    expect(companyOf(g.state, { ownerId: 1 })).toBe(g.state.rivals[0]);
  });
  test('switching back to 0 / null restores player company', () => {
    const g = withRival(flatGame(3));
    switchCompany(g.state, 1);
    expect(switchCompany(g.state, 0)).toEqual({ ok: true, activeCompanyId: null });
    expect(activeCompanyId(g.state)).toBe(0);
    expect(companyOf(g.state, {})).toBe(g.state.company);
    expect(companyById(g.state, null)).toBe(g.state.company);
    expect(switchCompany(g.state, null).activeCompanyId).toBe(null);
  });
  test('invalid company id is rejected with error', () => {
    const g = withRival(flatGame(3));
    const r = switchCompany(g.state, 99);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(g.state.activeCompanyId ?? null).toBe(null);
  });
  test('save/load preserves state', () => {
    const g = withRival(flatGame(3));
    switchCompany(g.state, 1);
    const json = serializeState(g.state);
    expect(json.includes('activeCompanyId')).toBe(true);
    const loaded = parseState(json);
    expect(loaded.activeCompanyId).toBe(1);
    expect(loaded.cheated).toBe(true);
    expect(activeCompanyId(loaded)).toBe(1);
  });
});
