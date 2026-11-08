/**
 * Unit tests for MoveSign command (OpenTTD CmdMoveSign / misc_cmd.cpp:250).
 */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { signAt } from '../js/simulation/cmdSign.js';

describe('moveSign command', () => {
  test('move sign to empty tile', () => {
    const g = flatGame(31);
    const placed = g.placeSign(5, 5, 'My Sign');
    expect(placed.ok).toBe(true);
    const signId = placed.sign.id;

    const r = g.moveSign(signId, 10, 12);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
    expect(r.sign.x).toBe(10);
    expect(r.sign.y).toBe(12);

    expect(signAt(g.state, 5, 5)).toBeNull();
    const s = signAt(g.state, 10, 12);
    expect(s).not.toBeNull();
    expect(s.id).toBe(signId);
    expect(s.text).toBe('My Sign');
  });

  test('no-op if same tile', () => {
    const g = flatGame(31);
    const placed = g.placeSign(5, 5, 'Station View');
    expect(placed.ok).toBe(true);
    const signId = placed.sign.id;

    const r = g.moveSign(signId, 5, 5);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
    expect(r.sign.x).toBe(5);
    expect(r.sign.y).toBe(5);
  });

  test('reject outside map', () => {
    const g = flatGame(31);
    const { width, height } = g.state.map;
    const placed = g.placeSign(5, 5, 'Border Sign');
    const signId = placed.sign.id;

    expect(g.moveSign(signId, -1, 5)).toEqual({ ok: false, error: 'Site is outside the map' });
    expect(g.moveSign(signId, 5, -1)).toEqual({ ok: false, error: 'Site is outside the map' });
    expect(g.moveSign(signId, width, 5)).toEqual({ ok: false, error: 'Site is outside the map' });
    expect(g.moveSign(signId, 5, height)).toEqual({ ok: false, error: 'Site is outside the map' });
    expect(g.moveSign(signId, 1.5, 5)).toEqual({ ok: false, error: 'Site is outside the map' });
  });

  test('reject tile with existing sign', () => {
    const g = flatGame(31);
    const a = g.placeSign(2, 2, 'Sign A').sign;
    const b = g.placeSign(4, 4, 'Sign B').sign;

    const r = g.moveSign(a.id, 4, 4);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Site already has a sign');
    expect(a.x).toBe(2);
    expect(a.y).toBe(2);
    expect(b.x).toBe(4);
    expect(b.y).toBe(4);
  });

  test('dryRun does not mutate', () => {
    const g = flatGame(31);
    const placed = g.placeSign(3, 3, 'Dry Sign');
    const signId = placed.sign.id;

    const dry = g.moveSign(signId, 8, 8, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBe(0);
    expect(placed.sign.x).toBe(3);
    expect(placed.sign.y).toBe(3);
    expect(signAt(g.state, 8, 8)).toBeNull();
    expect(signAt(g.state, 3, 3)).not.toBeNull();
  });

  test('game.moveSign wrapper and unknown sign rejection', () => {
    const g = flatGame(31);
    expect(g.moveSign(99999, 1, 1)).toEqual({ ok: false, error: 'Unknown sign' });

    const placed = g.placeSign(1, 1, 'Sign 1');
    const r = g.moveSign(placed.sign.id, 2, 2);
    expect(r.ok).toBe(true);
    expect(r.sign.x).toBe(2);
    expect(r.sign.y).toBe(2);
  });

  test('save/load roundtrip preserves moved sign position', () => {
    const g = flatGame(31);
    const placed = g.placeSign(6, 7, 'Historic Bridge');
    g.moveSign(placed.sign.id, 14, 18);

    const serialized = serializeState(g.state);
    const restored = parseState(serialized);
    expect(restored.signs).toHaveLength(1);
    expect(restored.signs[0].id).toBe(placed.sign.id);
    expect(restored.signs[0].x).toBe(14);
    expect(restored.signs[0].y).toBe(18);
    expect(restored.signs[0].text).toBe('Historic Bridge');
  });
});
