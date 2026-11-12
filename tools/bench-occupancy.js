/**
 * Occupancy-index churn benchmark (blocking.js). Uses the Moscow scenario (busy, ~97 vehicles on a
 * 457x663 map) because a fresh random world has no vehicles.
 *
 * Part 1 times `beginOccupancy` with the index released back to the pool after each build ("reuse")
 * against never releasing it ("alloc", the old fresh-Maps/arrays-per-tick path). The two are
 * interleaved over several rounds, with a GC between rounds, and the median us/build is reported.
 * The build result is identical either way (same keys, same order); only the allocation differs.
 * A warm-up batch runs first: with only a few thousand iterations the JIT/GC warm-up cost dominates
 * the small per-build difference (the comparison is only meaningful once the loop is optimised).
 *
 * Part 2 times the whole stepping loop (ms/day) as an end-to-end sanity check (noisy on Moscow).
 *
 * Usage: bun tools/bench-occupancy.js [--iters N] [--rounds N] [--days N] [--seed N]
 *
 * Note: this isolates the index build (and its release) from the rest of the tick. On Bun/JSC the alloc
 * path is a cheap nursery pointer-bump while pooled arrays/Maps are promoted and then paid for on every
 * write, so "reuse" can measure slower here even though it allocates less; whole-game timing is the
 * ground truth (Moscow 30 days is unchanged within noise). Use this to count work, not as a speed claim.
 */
import '../js/simulation/scenarios/moscowData.js';
import { Game } from '../js/simulation/game.js';
import * as blocking from '../js/simulation/blocking.js';

const args = { iters: 10000, rounds: 3, days: 8, seed: 1 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--iters') args.iters = Number(process.argv[++i]);
  else if (a === '--rounds') args.rounds = Number(process.argv[++i]);
  else if (a === '--days') args.days = Number(process.argv[++i]);
  else if (a === '--seed') args.seed = Number(process.argv[++i]);
}

const game = Game.create({ scenario: 'moscow', seed: args.seed });
game.stepDays(3); // warm-up: get vehicles moving before measuring
const state = game.state;
const gc = typeof Bun !== 'undefined' && Bun.gc ? () => Bun.gc(true) : () => {};
const release = blocking.releaseOccupancy || null;

/** One timed round of `iters` builds; `reuse` returns each index to the pool afterwards. */
function round(reuse) {
  let sink = 0;
  const t = performance.now();
  for (let i = 0; i < args.iters; i++) {
    const occ = blocking.beginOccupancy(state);
    sink += occ.keys.size;
    if (reuse && release) release(occ);
  }
  return { us: ((performance.now() - t) * 1000) / args.iters, sink };
}

// Warm up the JIT and both allocation paths before timing.
for (let i = 0; i < 1500; i++) {
  const occ = blocking.beginOccupancy(state);
  if (release) release(occ);
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const alloc = [], pooled = [];
let sink = 0;
for (let r = 0; r < args.rounds; r++) {
  gc();
  const a = round(false);
  gc();
  const p = round(true);
  alloc.push(a.us);
  pooled.push(p.us);
  sink = p.sink;
}
const pooledActive = !!release;

// End-to-end: whole stepping loop (world already warmed up; noisy on Moscow because of AI companies).
const t1 = performance.now();
game.stepDays(args.days);
const stepMs = performance.now() - t1;

console.log(JSON.stringify({
  scenario: 'moscow',
  vehicles: state.vehicles.length,
  pooledActive,
  iters: args.iters,
  rounds: args.rounds,
  allocUsPerBuild: +median(alloc).toFixed(2),
  reuseUsPerBuild: pooledActive ? +median(pooled).toFixed(2) : null,
  days: args.days,
  msPerDay: +(stepMs / args.days).toFixed(2),
  sink,
}));
