/**
 * Structures and catenary transparency classes (OpenTTD transparency.h ~22-33 TO_STRUCTURES / TO_CATENARY):
 * render-only. Defaults are off, so every existing class keeps its previous value and the default frame is
 * unchanged. Persistence uses the same 'tt.transparency' map as the other classes.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import {
  TRANSPARENCY_OPTIONS, TRANSPARENCY_KEY, TRANSPARENT_ALPHA,
  loadTransparency, setTransparency, resetTransparencyCache, tileTransparency, catenaryAlpha,
} from '../js/renderer/transparency.js';
import { drawCatenary, drawTramWires } from '../js/renderer/layers/catenary.js';
import { drawObjectTile } from '../js/renderer/pack/objects2.js';

/** Minimal canvas context recording globalAlpha at every draw call, with real save/restore semantics. */
function fakeCtx() {
  const calls = [];
  const stack = [];
  const ctx = {
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1,
    save() { stack.push(this.globalAlpha); },
    restore() { this.globalAlpha = stack.pop(); },
    beginPath() { calls.push(['beginPath', this.globalAlpha]); },
    moveTo() { calls.push(['moveTo', this.globalAlpha]); },
    lineTo() { calls.push(['lineTo', this.globalAlpha]); },
    arc() { calls.push(['arc', this.globalAlpha]); },
    stroke() { calls.push(['stroke', this.globalAlpha]); },
    fill() { calls.push(['fill', this.globalAlpha]); },
    closePath() { calls.push(['closePath', this.globalAlpha]); },
  };
  return { ctx, calls };
}
const strokeAlphas = (calls) => calls.filter(([k]) => k === 'stroke').map(([, a]) => a);

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  resetTransparencyCache();
});

describe('transparency class list', () => {
  test('default: every class off, loadTransparency is null', () => {
    expect(loadTransparency()).toBeNull();
  });

  test('the classes are appended in OpenTTD TransparencyOption order', () => {
    expect(TRANSPARENCY_OPTIONS.map((o) => o.id)).toEqual([
      'buildings', 'trees', 'industries', 'stations', 'bridges', 'signs', 'structures', 'catenary', 'text',
    ]);
  });

  test('persists like the others, one key pattern', () => {
    setTransparency('structures', true);
    setTransparency('catenary', true);
    expect(loadTransparency()).toEqual({
      buildings: false, trees: false, industries: false, stations: false,
      bridges: false, signs: false, structures: true, catenary: true, text: false,
    });
    const raw = JSON.parse(localStorage.getItem(TRANSPARENCY_KEY));
    expect(raw.structures).toBe(true);
    expect(raw.catenary).toBe(true);
    setTransparency('structures', false);
    setTransparency('catenary', false);
    expect(loadTransparency()).toBeNull();
  });
});

describe('structures transparency (tile.object)', () => {
  test('on: a map object tile is faded to TRANSPARENT_ALPHA', () => {
    const tr = { structures: true };
    expect(tileTransparency({ object: { type: 'transmitter' } }, tr)).toBe(TRANSPARENT_ALPHA);
    expect(tileTransparency({ object: { type: 'lighthouse' } }, tr)).toBe(TRANSPARENT_ALPHA);
    expect(tileTransparency({ object: { type: 'owned' } }, tr)).toBe(TRANSPARENT_ALPHA);
  });

  test('off (other classes on): object alpha unchanged', () => {
    expect(tileTransparency({ object: { type: 'transmitter' } }, { buildings: true, catenary: true })).toBe(1);
    expect(tileTransparency({ object: { type: 'transmitter' } }, { buildings: true, signs: true })).toBe(1);
  });

  test('the object draw inherits the renderer alpha (no reset inside drawObjectTile)', () => {
    const { ctx, calls } = fakeCtx();
    ctx.globalAlpha = TRANSPARENT_ALPHA;
    drawObjectTile(ctx, { type: 'transmitter' }, 10, 20, 100, 100);
    expect(ctx.globalAlpha).toBe(TRANSPARENT_ALPHA);
    expect(strokeAlphas(calls).every((a) => a === TRANSPARENT_ALPHA)).toBe(true);
    expect(strokeAlphas(calls).length).toBeGreaterThan(0);
  });

  test('drawObjectTile is unchanged at alpha 1', () => {
    const { ctx, calls } = fakeCtx();
    drawObjectTile(ctx, { type: 'transmitter' }, 10, 20, 100, 100);
    expect(ctx.globalAlpha).toBe(1);
    expect(strokeAlphas(calls).every((a) => a === 1)).toBe(true);
  });
});

describe('catenary transparency', () => {
  test('catenaryAlpha follows only the catenary class', () => {
    expect(catenaryAlpha({ catenary: true })).toBe(TRANSPARENT_ALPHA);
    expect(catenaryAlpha({ structures: true })).toBe(1);
    expect(catenaryAlpha(null)).toBe(1);
  });

  test('on: drawCatenary strokes at the catenary alpha and restores it', () => {
    const { ctx, calls } = fakeCtx();
    drawCatenary(ctx, { rail: 3 }, { elec: 1 }, null, 0, 0, catenaryAlpha({ catenary: true }));
    expect(strokeAlphas(calls).length).toBe(2);
    expect(strokeAlphas(calls).every((a) => a === TRANSPARENT_ALPHA)).toBe(true);
    expect(ctx.globalAlpha).toBe(1); // save/restore: no leak into later passes
  });

  test('off: drawCatenary strokes at alpha 1', () => {
    const { ctx, calls } = fakeCtx();
    drawCatenary(ctx, { rail: 3 }, { elec: 1 }, null, 0, 0, catenaryAlpha({}));
    expect(strokeAlphas(calls).length).toBe(2);
    expect(strokeAlphas(calls).every((a) => a === 1)).toBe(true);
  });

  test('on: drawTramWires strokes at the catenary alpha; off: unchanged', () => {
    const on = fakeCtx();
    drawTramWires(on.ctx, { tram: 3 }, 0, 0, [0, 0, 0, 0], catenaryAlpha({ catenary: true }));
    expect(strokeAlphas(on.calls).length).toBe(2);
    expect(strokeAlphas(on.calls).every((a) => a === TRANSPARENT_ALPHA)).toBe(true);
    const off = fakeCtx();
    drawTramWires(off.ctx, { tram: 3 }, 0, 0, [0, 0, 0, 0], catenaryAlpha({}));
    expect(strokeAlphas(off.calls).every((a) => a === 1)).toBe(true);
    expect(off.ctx.globalAlpha).toBe(1);
  });
});
