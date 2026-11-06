/** Player-built road/rail tiles are owned by the player ('company'); rival-built ones are 'rival' (no player upkeep). */
import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';

test('player road and rail tiles get owner company', () => {
  const g = Game.create({ seed: 3, width: 64, height: 64, townCount: 2 });
  g.state.company.money = 1e7;
  let done = 0;
  for (let y = 5; y < 60 && done < 2; y++) {
    const layer = done === 0 ? 'road' : 'rail';
    const pts = Array.from({ length: 5 }, (_, i) => ({ x: 5 + i, y }));
    if (pts.some((p) => { const t = g.tile(p.x, p.y); return t.terrain === 'water' || t.building || t.road || t.rail || t.owner; })) continue;
    const r = layer === 'road' ? g.buildRoadPath(pts) : g.buildRailPath(pts);
    if (!r?.ok) continue;
    for (const p of pts) expect(g.tile(p.x, p.y).owner).toBe('company');
    done++;
  }
  expect(done).toBe(2);
});
