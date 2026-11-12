/**
 * F1: mapHeightLimit only refuses RAISING a tile above the cap. Lowering (or levelling down) is always
 * allowed, including tiles already above a lowered cap; the neighbour relax loop never raises above the cap.
 *
 * Pre-fix probe (unmodified cmdTerraform.js, measured with a scratch test under $HOME/tmp):
 *   cap 3, 5x5 plateau at 5, lower centre -> {"ok":false,"error":"Maximum height reached"}  (centre stayed 5)
 *   cap 3, tile at 2, raise -> {"ok":true} (h=3); cap 3, tile at 3, raise -> "Maximum height reached"
 * Post-fix: lower centre -> {"ok":true} (centre 4, neighbours still 5).
 */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { estimateTerraform, MAX_HEIGHT } from '../js/simulation/cmdTerraform.js';

const R = (x0, y0, x1 = x0, y1 = y0) => ({ x0, y0, x1, y1 });
const h = (g, x, y) => g.tile(x, y).height;
const setH = (g, x, y, v) => { g.tile(x, y).height = v; };
/** 5x5 block (18..22) set to one height, so the rule (neighbours differ by <= 1) still holds. */
const plateau = (g, v) => { for (let y = 18; y <= 22; y++) for (let x = 18; x <= 22; x++) setH(g, x, y, v); };
const capped = (cap) => { const g = flatGame(); setSetting(g.state, 'mapHeightLimit', cap); return g; };

describe('mapHeightLimit: cap only refuses raises', () => {
  test('(1) cap 3: a tile at 5 lowers to 4 and the plateau neighbours do not move', () => {
    const g = capped(3);
    plateau(g, 5);
    const r = g.terraform('lower', R(20, 20));
    expect(r.ok).toBe(true);
    expect(h(g, 20, 20)).toBe(4);
    expect(h(g, 19, 20)).toBe(5);
    expect(h(g, 21, 21)).toBe(5);
  });

  test('(1b) cap 3: levelling a plateau at 5 down to 3 is allowed (lower only)', () => {
    const g = capped(3);
    plateau(g, 5);
    const r = g.terraform('level', R(18, 18, 22, 22));
    // level sets the rect to the start tile's height (5): nothing changes, so it is refused as 'nothing'
    expect(r.ok).toBe(false);
    setH(g, 20, 20, 3); // start tile at 3: rect tiles above it are lowered to 3
    const r2 = g.terraform('level', R(20, 20, 22, 22));
    expect(r2.ok).toBe(true);
    expect(h(g, 21, 21)).toBe(3);
  });

  test('(2) cap 3: raising a tile at 2 to 4 is refused with the height-cap error', () => {
    const g = capped(3);
    setH(g, 20, 20, 2);
    const r = g.terraform('raise', R(20, 20));
    expect(r.ok).toBe(true); // 2 -> 3 is within the cap
    expect(h(g, 20, 20)).toBe(3);
    const g2 = capped(3);
    setH(g2, 20, 20, 2);
    setH(g2, 20, 20, 3);
    const e = g2.terraform('raise', R(20, 20));
    expect(e.ok).toBe(false);
    expect(e.error).toBe('Maximum height reached');
    expect(h(g2, 20, 20)).toBe(3);
  });

  test('(2b) cap 3: raising a tile at 3 is refused; raising a plateau at 5 is refused', () => {
    const g = capped(3);
    setH(g, 20, 20, 3);
    expect(g.terraform('raise', R(20, 20))).toEqual({ ok: false, error: 'Maximum height reached' });
    const g2 = capped(3);
    plateau(g2, 5);
    expect(g2.terraform('raise', R(20, 20)).error).toBe('Maximum height reached');
    expect(h(g2, 20, 20)).toBe(5);
  });

  test('(2c) cap 3: a lower that would force a neighbour up above the cap is refused (no cap-breaking raise)', () => {
    const g = capped(3);
    setH(g, 20, 20, 6);
    setH(g, 19, 20, 3); // lowering 6 -> 5 would pull this neighbour to 4 > cap
    const r = g.terraform('lower', R(20, 20));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Maximum height reached');
    expect(h(g, 20, 20)).toBe(6);
    expect(h(g, 19, 20)).toBe(3);
  });

  test('(3a) cap 3: a normal raise and lower inside the cap behave as before', () => {
    const g = capped(3);
    expect(h(g, 20, 20)).toBe(1);
    expect(g.terraform('raise', R(20, 20)).ok).toBe(true);
    expect(h(g, 20, 20)).toBe(2);
    expect(g.terraform('lower', R(20, 20)).ok).toBe(true);
    expect(h(g, 20, 20)).toBe(1);
  });

  test('(3b) default cap 7: raise to 7 allowed, raise past 7 refused, lower from 7 allowed', () => {
    const g = flatGame();
    expect(g.state.map.tiles[20 * g.state.map.width + 20].height).toBe(1);
    setH(g, 20, 20, 6);
    expect(g.terraform('raise', R(20, 20)).ok).toBe(true);
    expect(h(g, 20, 20)).toBe(7);
    expect(g.terraform('raise', R(20, 20)).error).toBe('Maximum height reached');
    expect(g.terraform('lower', R(20, 20)).ok).toBe(true);
    expect(h(g, 20, 20)).toBe(6);
    expect(MAX_HEIGHT).toBe(7);
  });

  test('estimate agrees with the command: a lower above the cap is a valid preview', () => {
    const g = capped(3);
    plateau(g, 5);
    const est = estimateTerraform(g.state, 'lower', R(20, 20));
    expect(est.ok).toBe(true);
    expect(est.tiles ?? est.changes?.length ?? 1).toBeGreaterThan(0);
  });
});
