#!/usr/bin/env bun
/**
 * Diagnostic for Moscow town-roads-split warnings and failed car trips.
 * Usage: bun tools/moscow/splitdiag.js [--days N] [--seed S]
 * Lists each split town (component sizes + tile coords) and, per town, the road components of
 * houses vs. destinations (other town / industry) to show where trips cannot route.
 */
import { Game } from '../../js/simulation/game.js';
import { labelComponents } from '../../js/simulation/diagIssue.js';
import { TOWN_CORE_RADIUS } from '../../js/simulation/diagChecksMap.js';
import { neighbours } from '../../js/simulation/map.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const days = opt('--days', 0), seed = opt('--seed', 1);
const g = Game.create({ scenario: 'moscow', seed });
const s = g.state, map = s.map, W = map.width;
if (days) g.stepDays(days);
const labels = labelComponents(map, 'road', () => true);
const R2 = TOWN_CORE_RADIUS * TOWN_CORE_RADIUS;
const sizes = new Map();
for (let i = 0; i < labels.length; i++) if (labels[i] >= 0) sizes.set(labels[i], (sizes.get(labels[i]) || 0) + 1);
console.log(`map ${map.width}x${map.height} towns=${s.towns.length} roadComponents=${sizes.size} day=${days}`);
console.log('== split towns (core components) ==');
let splits = 0;
for (const town of s.towns) {
  const comp = new Map();
  for (let y = town.y - TOWN_CORE_RADIUS; y <= town.y + TOWN_CORE_RADIUS; y++) for (let x = town.x - TOWN_CORE_RADIUS; x <= town.x + TOWN_CORE_RADIUS; x++) {
    if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
    if ((x - town.x) ** 2 + (y - town.y) ** 2 > R2) continue;
    const l = labels[y * W + x];
    if (l >= 0) comp.set(l, [...(comp.get(l) || []), [x, y]]);
  }
  if (comp.size > 1) {
    splits++;
    const parts = [...comp.entries()].map(([l, t]) => `#${l}:${sizes.get(l)}tiles/${t.length}core@${t[0][0]},${t[0][1]}`);
    console.log(`${town.name} (${town.x},${town.y}) pop=${town.population}: ${parts.join(' | ')}`);
  }
}
console.log(`splits=${splits}`);
console.log('== sampled failed trips (planTrip on each town, origin -> dest) ==');
import { planTrip } from '../../js/simulation/trafficTrips.js';
import { createRng, hashSeed } from '../../js/simulation/rng.js';
const rng = createRng({ r: hashSeed(String(seed) + ':splitdiag') }, 'r');
const per = opt('--samples', 40);
const failByTown = new Map();
let fails = 0, total = 0;
for (const town of s.towns) {
  if (!town.population) continue;
  for (let k = 0; k < per; k++) {
    total++;
    const p = planTrip(s, rng, town);
    if (p && p.failed) {
      fails++;
      failByTown.set(town.name, (failByTown.get(town.name) || 0) + 1);
    }
  }
}
console.log(`sampled=${total} failed=${fails}`);
for (const [n, c] of [...failByTown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  const t = s.towns.find((q) => q.name === n);
  const hr = t.houses.map((h) => neighbours(map, h.x, h.y).find((q) => q.tile.road));
  const comps = [...new Set(hr.filter(Boolean).map((q) => labels[q.y * W + q.x]))];
  console.log(`  ${n} (${t.x},${t.y}) pop=${t.population} fails=${c} houseRoadComps=${JSON.stringify(comps)}`);
}
