#!/usr/bin/env bun
/**
 * ms/day for a rail-heavy run with settings.trainAcceleration original vs realistic (same world).
 * Usage: bun tools/train-accel-bench.js [--scenario moscow|none] [--seed N] [--days D]
 */
import '../js/simulation/scenarios/moscowData.js';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';

const args = { scenario: 'moscow', seed: 1, days: 120 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--scenario') args.scenario = process.argv[++i];
  else if (a === '--seed') args.seed = Number(process.argv[++i]);
  else if (a === '--days') args.days = Number(process.argv[++i]);
}

function run(mode) {
  const g = args.scenario === 'none' ? Game.create({ seed: args.seed }) : Game.create({ scenario: args.scenario, seed: args.seed });
  setSetting(g.state, 'trainAcceleration', mode);
  g.stepDays(5); // warm-up
  const t0 = performance.now();
  g.stepDays(args.days);
  const ms = (performance.now() - t0) / args.days;
  const trains = (g.state.vehicles || []).filter((v) => v.kind === 'train').length;
  return { ms, trains };
}

const first = process.env.ORDER === "rf" ? "realistic" : "original"; const r1 = run(first), r2 = run(first === "original" ? "realistic" : "original"); const orig = first === "original" ? r1 : r2, real = first === "original" ? r2 : r1;
console.log(`scenario=${args.scenario} seed=${args.seed} days=${args.days} trains=${orig.trains}`);
console.log(`original  ${orig.ms.toFixed(3)} ms/day`);
console.log(`realistic ${real.ms.toFixed(3)} ms/day (${((real.ms / orig.ms - 1) * 100).toFixed(1)}%)`);
