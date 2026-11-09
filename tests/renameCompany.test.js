/**
 * Tests for company and president rename (cmdRename.renameCompany / renamePresident,
 * UI command registration, validation rules, blank handling, uniqueness, save/load,
 * and old-save compatibility).
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { ISSUE_COMMANDS } from '../js/ui/app.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { MAX_NAME_LENGTH, validateName, presidentDisplayName, PRESIDENT_DEFAULT_NAME } from '../js/simulation/cmdRename.js';

describe('validateName rules', () => {
  test('trims whitespace and enforces 1..32 code points', () => {
    expect(validateName('  Acme Transport  ')).toEqual({ ok: true, name: 'Acme Transport' });
    expect(validateName('A')).toEqual({ ok: true, name: 'A' });
    const maxLenName = '🌟'.repeat(MAX_NAME_LENGTH);
    expect(validateName(maxLenName)).toEqual({ ok: true, name: maxLenName });
    const tooLong = '🌟'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateName(tooLong).ok).toBe(false);
  });

  test('rejects blank, whitespace-only, non-string, and control characters', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
    expect(validateName(null).ok).toBe(false);
    expect(validateName(undefined).ok).toBe(false);
    expect(validateName(12345).ok).toBe(false);
    expect(validateName('Line1\nLine2').ok).toBe(false);
    expect(validateName('Tab\tChar').ok).toBe(false);
    expect(validateName('Null\0Byte').ok).toBe(false);
  });
});

describe('renameCompany', () => {
  test('renames player company and trims name', () => {
    const g = Game.create({ seed: 1 });
    expect(g.state.company.name).toBe('Transit Tycoon Co.');
    const r = g.renameCompany('  Mega Rail  ');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Mega Rail');
    expect(g.state.company.name).toBe('Mega Rail');
  });

  test('rejects invalid names, blanks, and control characters without altering name', () => {
    const g = Game.create({ seed: 1 });
    const orig = g.state.company.name;
    expect(g.renameCompany('').ok).toBe(false);
    expect(g.renameCompany('   ').ok).toBe(false);
    expect(g.renameCompany('x'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
    expect(g.renameCompany('Bad\x1fName').ok).toBe(false);
    expect(g.state.company.name).toBe(orig);
  });

  test('dryRun validates without modifying state', () => {
    const g = Game.create({ seed: 1 });
    const orig = g.state.company.name;
    const r = g.renameCompany('New Name Corp', { dryRun: true });
    expect(r.ok).toBe(true);
    expect(g.state.company.name).toBe(orig);
  });

  test('single human company: no uniqueness conflict with itself', () => {
    const g = Game.create({ seed: 1 });
    const r = g.renameCompany(g.state.company.name.toLowerCase());
    expect(r.ok).toBe(true);
    expect(g.state.company.name).toBe('transit tycoon co.');
  });
});

describe('renamePresident', () => {
  test('renames president and sets lazy company.presidentName', () => {
    const g = Game.create({ seed: 1 });
    expect(g.state.company.presidentName).toBeUndefined();
    expect(presidentDisplayName(g.state)).toBe(PRESIDENT_DEFAULT_NAME);
    const r = g.renamePresident('  Alice Smith  ');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Alice Smith');
    expect(g.state.company.presidentName).toBe('Alice Smith');
    expect(presidentDisplayName(g.state)).toBe('Alice Smith');
  });

  test('blank name resets president to default and removes lazy field', () => {
    const g = Game.create({ seed: 1 });
    g.renamePresident('Alice');
    expect(g.state.company.presidentName).toBe('Alice');
    const r = g.renamePresident('   ');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('');
    expect('presidentName' in g.state.company).toBe(false);
    expect(presidentDisplayName(g.state)).toBe(PRESIDENT_DEFAULT_NAME);
  });

  test('dryRun validates without storing or deleting', () => {
    const g = Game.create({ seed: 1 });
    g.renamePresident('Alice');
    const r = g.renamePresident('Bob', { dryRun: true });
    expect(r.ok).toBe(true);
    expect(g.state.company.presidentName).toBe('Alice');
    const r2 = g.renamePresident('', { dryRun: true });
    expect(r2.ok).toBe(true);
    expect(g.state.company.presidentName).toBe('Alice');
  });

  test('rejects over-long names and control characters', () => {
    const g = Game.create({ seed: 1 });
    expect(g.renamePresident('x'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
    expect(g.renamePresident('Alice\nBob').ok).toBe(false);
    expect(g.state.company.presidentName).toBeUndefined();
  });
});

describe('ISSUE_COMMANDS registration', () => {
  test('renamePresident and renameCompany are registered in ISSUE_COMMANDS', () => {
    expect(ISSUE_COMMANDS).toContain('renamePresident');
    expect(ISSUE_COMMANDS).toContain('renameCompany');
  });
});

describe('Save/load roundtrip & old saves', () => {
  test('roundtrips company name and president name', () => {
    const g = Game.create({ seed: 1 });
    g.renameCompany('Roundtrip Co');
    g.renamePresident('Jane Doe');
    const json = serializeState(g.state);
    const loaded = parseState(json);
    expect(loaded.company.name).toBe('Roundtrip Co');
    expect(loaded.company.presidentName).toBe('Jane Doe');
  });

  test('old save without presidentName loads cleanly with presidentName undefined', () => {
    const g = Game.create({ seed: 1 });
    const json = serializeState(g.state);
    const parsedRaw = JSON.parse(json);
    delete parsedRaw.company.presidentName;
    const loaded = parseState(JSON.stringify(parsedRaw));
    expect(loaded.company.presidentName).toBeUndefined();
    expect(presidentDisplayName(loaded)).toBe(PRESIDENT_DEFAULT_NAME);
  });

  test('resetting president name deletes the field so save output does not contain presidentName', () => {
    const g = Game.create({ seed: 1 });
    g.renamePresident('Temporary');
    g.renamePresident('');
    const json = serializeState(g.state);
    const parsedRaw = JSON.parse(json);
    expect('presidentName' in parsedRaw.company).toBe(false);
  });
});
