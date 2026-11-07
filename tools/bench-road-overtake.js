/**
 * Perf of road overtaking (roadOvertaking setting) on the Moscow scenario.
 * Usage: bun tools/bench-road-overtake.js [--days N] [--seed S] [--on 0|1]
 * Prints ms/day for the stepping loop only (world build excluded).
 */
import '../js/simulation/scenarios/moscowData.js';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';

const args = { days: 20, seed: 1, on: 0 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--days') args.days = Number(process.argv[++i]);
  else if (a === '--seed') args.seed = Number(process.argv[++i]);
  else if (a === '--on') args.on = Number(process.argv[++i]);
}
const game = Game.create({ scenario: 'moscow', seed: args.seed });
setSetting(game.state, 'roadOvertaking', args.on === 1);
game.stepDays(2); // warm-up
const t0 = performance.now();
game.stepDays(args.days);
const ms = performance.now() - t0;
console.log(JSON.stringify({ overtaking: args.on === 1, days: args.days, msPerDay: +(ms / args.days).toFixed(2), vehicles: game.state.vehicles.length }));
