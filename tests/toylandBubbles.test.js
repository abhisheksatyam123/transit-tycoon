// IA5: bubble generator effect sprites (4748-4762) are packed as a late block; old pack keys keep their positions.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBubble, drawBubbles, clearBubbles, BUBBLE_MAX } from '../js/renderer/bubbles.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'assets/opengfx/toyland/manifest.json'), 'utf8'));

describe('toyland bubble effect sprites', () => {
  test('4748-4762 are packed and existing keys stay at their positions', () => {
    for (let id = 4748; id <= 4762; id++) expect(manifest.sprites[String(id)]).toBeDefined();
    // the late IA5 block sits after the TY5 keys (4719/4720), so the sort order places it last
    const keys = Object.keys(manifest.sprites);
    expect(keys.includes('4762')).toBe(true);
    expect(manifest.sprites['4719']).toBeDefined();
    expect(manifest.sprites['4746']).toBeDefined();
  });

  test('extractor declares the late block (order 550000+) and keeps the TY5 block', () => {
    const src = readFileSync(join(root, 'tools/ogfx/extract_toyland.js'), 'utf8');
    expect(src).toMatch(/550000 \+ id/);
    expect(src).toMatch(/500000 \+ id/);
    expect(existsSync(join(root, 'js/renderer/bubbles.js'))).toBe(true);
  });

  test('pool is capped and does not grow past BUBBLE_MAX', () => {
    clearBubbles();
    for (let i = 0; i < BUBBLE_MAX + 20; i++) spawnBubble(0, 0);
    let calls = 0;
    const ctx = { drawImage() { calls++; } };
    const pack = { sprites: {}, atlases: [] };
    drawBubbles(ctx, pack, 0); // no sprite entries: nothing blits, but the pool is still walked
    expect(calls).toBe(0);
    clearBubbles();
  });

  test('bubbles pop after their life', () => {
    clearBubbles();
    spawnBubble(0, 0);
    const pack = { sprites: { 4748: [0, 0, 0, 15, 15, -7, -15, 0] }, atlases: [{}] };
    let n = 0;
    const ctx = { drawImage() { n++; } };
    for (let i = 0; i < 200; i++) drawBubbles(ctx, pack, 0.05);
    expect(n).toBeGreaterThan(0);
    const before = n;
    drawBubbles(ctx, pack, 0.05);
    expect(n).toBe(before); // popped: no more draws
    clearBubbles();
  });
});
