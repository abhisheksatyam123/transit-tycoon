import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { tileInfo } from '../js/simulation/queries.js';

describe('tileInfo (OpenTTD Land Area Information rows)', () => {
  const game = Game.create({ seed: 7, width: 64, height: 64, townCount: 3, industryCount: 3 });
  const s = game.state;
  const at = (i) => ({ x: i % s.map.width, y: (i - (i % s.map.width)) / s.map.width });
  const find = (pred) => s.map.tiles.findIndex(pred);

  test('road tile shows road owner and clear cost', () => {
    const i = s.map.tiles.findIndex((t) => t.road && !t.building);
    if (i < 0) return;
    const { x, y } = at(i);
    const t = s.map.tiles[i];
    t.owner = 'company';
    const txt = tileInfo(s, x, y).lines.join('\n');
    expect(txt).toMatch(/Road owner: Transit Tycoon Co\.|Road owner: /);
    expect(txt).toMatch(/Clear cost: /);
    expect(txt).not.toMatch(/Rail owner/);
  });

  test('rail tile shows track type and rail owner', () => {
    const i = s.map.tiles.findIndex((t) => t.rail && !t.building);
    if (i < 0) return;
    const { x, y } = at(i);
    s.map.tiles[i].trk = 2;
    s.map.tiles[i].owner = 'rival';
    s.map.tiles[i].rivalId = 999;
    const txt = tileInfo(s, x, y).lines.join('\n');
    expect(txt).toMatch(/— Monorail/);
    expect(txt).toMatch(/Rail owner: Rival company/);
    delete s.map.tiles[i].trk; delete s.map.tiles[i].rivalId;
  });

  test('bare grass tile: clear cost free and no owner rows', () => {
    const i = find((t) => t.terrain === 'grass' && !t.road && !t.rail && !t.building && !t.owner);
    if (i < 0) return;
    const { x, y } = at(i);
    const txt = tileInfo(s, x, y).lines.join('\n');
    expect(txt).toMatch(/Clear cost: free \(grass\)/);
    expect(txt).not.toMatch(/owner/);
  });

  test('forest tile shows the clearing cost', () => {
    const i = find((t) => t.terrain === 'grass' && !t.building && !t.road && !t.rail);
    if (i < 0) return;
    const { x, y } = at(i);
    s.map.tiles[i].terrain = 'forest';
    expect(tileInfo(s, x, y).lines.join('\n')).toMatch(/Clear cost: £?\$?[\d,]+ \(forest\)/);
    s.map.tiles[i].terrain = 'grass';
  });
});
