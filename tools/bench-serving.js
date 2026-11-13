#!/usr/bin/env bun
/**
 * servingStations microbench (N10 perf): dense 500-station overlapping catchments.
 * Prints the current cached-lookup/fast-path implementation and the original linear-scan
 * reference (same selection algorithm, findStation per covered id) so the win is reproducible
 * without a profiler. 5 reps, median. Usage: bun tools/bench-serving.js [--json]
 */
import { servingStations } from '../js/simulation/cargo.js';
import { buildCoverage, acceptsFromSource } from '../js/simulation/stations.js';
import { findStation, manhattan } from '../js/simulation/state.js';

/** Original servingStations (the pre-N10 oracle). */
function reference(state, coverage, tileIdxs, cargoId, sx, sy) {
  const ids = new Set();
  for (const i of tileIdxs) {
    const arr = coverage.get(i);
    if (arr) for (const id of arr) ids.add(id);
  }
  const list = [];
  for (const id of ids) {
    const st = findStation(state, id);
    if (st && acceptsFromSource(state, st, cargoId)) list.push(st);
  }
  list.sort((a, b) => (b.rating[cargoId] ?? 0) - (a.rating[cargoId] ?? 0)
    || manhattan(a.x, a.y, sx, sy) - manhattan(b.x, b.y, sx, sy) || a.id - b.id);
  return list.slice(0, 2);
}

function fixture(kind) {
  const W = 128, H = 128;
  const stations = [];
  let seed = 20261113;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let k = 0; k < 500; k++) {
    // dense: 25x20 cluster with radius 6, hundreds of stations per tile (sort-heavy path).
    // sparse: 500 separate radius-1 catchments, one station per tile (the TileManager singleton fast path).
    const x = kind === 'dense' ? 40 + (k % 25) : 10 + (k % 25) * 4;
    const y = kind === 'dense' ? 40 + (Math.floor(k / 25) % 25) : 10 + Math.floor(k / 25) * 4;
    stations.push({
      id: 100 + k * 3, x, y,
      tiles: [{ x, y, radius: kind === 'dense' ? 6 : 1, kind: 'rail' }],
      rating: { PASS: Math.floor(rnd() * 101), MAIL: Math.floor(rnd() * 101) },
      lastPickup: { PASS: 1, MAIL: 1 },
      cargo: {},
    });
  }
  const state = { map: { width: W, height: H, tiles: new Array(W * H).fill(null) }, stations, settings: { modifiedCatchment: true } };
  const coverage = buildCoverage(state);
  const tiles = [];
  if (kind === 'dense') {
    for (let y = 46; y <= 58; y++) for (let x = 46; x <= 58; x++) tiles.push(y * W + x);
  } else {
    // sample every 37th covered tile so the run stays short; nearly all are single-candidate
    let n = 0;
    for (const tile of coverage.keys()) if (n++ % 37 === 0) tiles.push(tile);
  }
  return { state, coverage, tiles };
}

function bench(fn, tiles, rounds) {
  for (let i = 0; i < 1000; i++) fn(tiles[i % tiles.length]); // warm-up
  const reps = [];
  let calls = 0;
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let round = 0; round < rounds; round++) {
      for (const tile of tiles) fn(tile);
    }
    const ms = performance.now() - t0;
    calls = rounds * tiles.length;
    reps.push(ms);
  }
  reps.sort((a, b) => a - b);
  const medianMs = reps[2];
  return { medianMs, usPerCall: (medianMs * 1000) / calls, calls };
}

function run(kind) {
  const { state, coverage, tiles } = fixture(kind);
  const rounds = kind === 'dense' ? 20 : 20;
  const use = (tile) => [tile];
  const current = bench((tile) => servingStations(state, coverage, use(tile), 'PASS', tile % state.map.width, Math.floor(tile / state.map.width)), tiles, rounds);
  const before = bench((tile) => reference(state, coverage, use(tile), 'PASS', tile % state.map.width, Math.floor(tile / state.map.width)), tiles, rounds);
  let singles = 0;
  for (const t of tiles) if ((coverage.get(t) || []).length === 1) singles++;
  return {
    fixture: `${state.stations.length} stations, ${coverage.size} covered tiles, ${tiles.length} bench tiles (${singles} single-candidate)`,
    callsPerRep: current.calls,
    before: { ms: Number(before.medianMs.toFixed(2)), usPerCall: Number(before.usPerCall.toFixed(3)) },
    after: { ms: Number(current.medianMs.toFixed(2)), usPerCall: Number(current.usPerCall.toFixed(3)) },
    speedup: Number((before.usPerCall / current.usPerCall).toFixed(2)),
  };
}

const sparse = run('sparse');
const dense = run('dense');
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ sparse, dense }));
} else {
  for (const out of [sparse, dense]) {
    console.log(`servingStations microbench: ${out.fixture}`);
    console.log(`  before (linear findStation) : ${out.before.ms} ms  ${out.before.usPerCall} us/call`);
    console.log(`  after  (byId + fast path)   : ${out.after.ms} ms  ${out.after.usPerCall} us/call`);
    console.log(`  speedup: ${out.speedup}x  (${out.callsPerRep} calls/rep, median of 5)`);
  }
}
