// FX-SNOW: an explicit settings.snowRespread value passed to Game.create must be honoured
// (false was previously dropped by the truthy-only settings loop, so the default true applied).
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { getSetting } from '../js/simulation/settings.js';

const H = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);
const terrainHash = (g) => H(g.state.map.tiles.map((t) => t.height + t.terrain).join(','));

describe('explicit settings.snowRespread in Game.create', () => {
  test('(a) explicit false is stored and changes the seed-1 terrain vs the default game', () => {
    const off = Game.create({ seed: 1, settings: { snowRespread: false } });
    expect(getSetting(off.state, 'snowRespread')).toBe(false);
    expect(terrainHash(off)).not.toBe(terrainHash(Game.create({ seed: 1 })));
  });

  test('(b) absent option keeps the default true', () => {
    expect(getSetting(Game.create({ seed: 1 }).state, 'snowRespread')).toBe(true);
  });

  test('(c) explicit true equals the default game terrain', () => {
    const on = Game.create({ seed: 1, settings: { snowRespread: true } });
    expect(getSetting(on.state, 'snowRespread')).toBe(true);
    expect(terrainHash(on)).toBe(terrainHash(Game.create({ seed: 1 })));
  });
});
