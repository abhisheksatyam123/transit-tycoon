// OpenGFX pack: every sprite id the renderer maps to must exist in the extracted manifest.
import { test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { roadSprite, railSprites, treeSprite } from '../js/renderer/pack/lookup.js';

const dir = new URL('../assets/opengfx/', import.meta.url).pathname;
const man = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));

test('pack ships GPL-2.0 licence and attribution', () => {
  expect(existsSync(dir + 'LICENSE')).toBe(true);
  expect(readFileSync(dir + 'LICENSE', 'utf8')).toMatch(/GNU GENERAL PUBLIC LICENSE/);
  expect(existsSync(dir + 'README.md')).toBe(true);
});

test('all 15 road masks map to existing grass and paved sprites', () => {
  for (let m = 1; m < 16; m++) {
    for (const paved of [false, true]) {
      const id = roadSprite(m, paved);
      expect(id).toBeGreaterThan(0);
      expect(man.sprites[id]).toBeDefined();
    }
  }
});

test('rail arms, ground and trees exist', () => {
  for (let m = 1; m < 16; m++) for (const id of railSprites(m)) expect(man.sprites[id]).toBeDefined();
  for (const id of [3981, 3924, 4023]) expect(man.sprites[id][3]).toBe(64); // flat ground 64 px wide
  for (let h = 0; h < 30; h++) expect(man.sprites[treeSprite(h)]).toBeDefined();
});
