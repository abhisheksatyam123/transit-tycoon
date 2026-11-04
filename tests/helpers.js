/** Test helpers: deterministic scenario construction on a cleared area. */
import { Game } from '../js/simulation/game.js';
import { clearArea } from '../js/simulation/map.js';
import { placeIndustry } from '../js/simulation/industries.js';

/** New game with a flat, empty rectangle (x 4..60, y 14..34) and no towns/industries in it. */
export function flatGame(seed = 42) {
  const game = Game.create({ seed, width: 96, height: 96 });
  const s = game.state;
  clearArea(s, 4, 14, 60, 34, 'grass');
  for (let y = 14; y <= 34; y++) for (let x = 4; x <= 60; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.height = 1; t.rail = 0; t.road = 0; t.building = null; t.owner = null;
  }
  for (const town of s.towns) town.houses = town.houses.filter((h) => !(h.x >= 4 && h.x <= 60 && h.y >= 14 && h.y <= 34));
  s.company.money = 1_000_000;
  return game;
}

/** Coal mine at (10,20), power station at (40,20), rail stations at y=24, line between, depot at (20,25). */
export function coalLine(game) {
  const s = game.state;
  const mine = placeIndustry(s, 'coal_mine', 10, 20);
  const power = placeIndustry(s, 'power_station', 40, 20);
  const r = [
    game.buildRailStation(10, 24, 'x', 3), game.buildRailStation(40, 24, 'x', 3),
    game.buildRail(13, 24, 39, 24), game.buildDepot(20, 25, 'rail', 1),
  ];
  for (const x of r) if (!x.ok) throw new Error('build failed: ' + x.error);
  const depotId = s.depots[s.depots.length - 1].id;
  const [a, b] = [s.stations[s.stations.length - 2], s.stations[s.stations.length - 1]];
  return { mine, power, a, b, depotId };
}
