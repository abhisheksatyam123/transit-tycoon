#!/usr/bin/env bun
/**
 * T20 report: income with settings.gradients OFF vs ON on the same world (Moscow scenario by default).
 * Usage: bun tools/gradients-effect.js [--scenario moscow|none] [--seed N] [--months M]
 */
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';

const args = { scenario: 'moscow', seed: 1, months: 6 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--scenario') args.scenario = process.argv[++i];
  else if (a === '--seed') args.seed = Number(process.argv[++i]);
  else if (a === '--months') args.months = Number(process.argv[++i]);
}

function run(gradients) {
  const g = args.scenario === 'none' ? Game.create({ seed: args.seed }) : Game.create({ scenario: args.scenario, seed: args.seed });
  if (gradients) setSetting(g.state, 'gradients', true);
  const out = [];
  for (let m = 0; m < args.months; m++) {
    g.stepDays(30);
    const l = g.state.company?.ledger?.current;
    out.push({ month: m + 1, money: Math.round(g.state.company.money), income: l ? Math.round(l.income ?? 0) : null });
  }
  return { out, money: g.state.company.money };
}

const off = run(false), on = run(true);
console.log(`scenario=${args.scenario} seed=${args.seed} months=${args.months}`);
for (let i = 0; i < off.out.length; i++) {
  console.log(`m${off.out[i].month} money OFF=${off.out[i].money} ON=${on.out[i].money} | ledger income OFF=${off.out[i].income} ON=${on.out[i].income}`);
}
console.log(`final money OFF=${Math.round(off.money)} ON=${Math.round(on.money)} delta=${Math.round(on.money - off.money)}`);
