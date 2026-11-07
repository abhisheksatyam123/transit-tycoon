#!/usr/bin/env bun
// SV: Moscow save timing. Sync serializeState (old behaviour: one long main-thread task) and, when the
// tree has it, the time-sliced serializeStateAsync (longest slice + total). Usage: bun tools/as-savetime.js
import { Game } from '../js/simulation/game.js';
import * as SAVE from '../js/simulation/save.js';
const { loadMoscowData } = await import('../js/simulation/scenarios/moscowRegistry.js');
await loadMoscowData();
const m = Game.create({ seed: 1, scenario: 'moscow' });
m.stepDays(60);
const s = m.state;
const best = (fn, n = 3) => { let b = 1e9, r; for (let i = 0; i < n; i++) { const t0 = performance.now(); r = fn(); b = Math.min(b, performance.now() - t0); } return [b, r]; };
const [syncMs, syncStr] = best(() => SAVE.serializeState(s));
console.log(`sync serializeState: ${syncMs.toFixed(1)} ms (one task), chars ${syncStr.length}`);
if (SAVE.serializeStateAsync) {
  let bestMax = 1e9, bestTot = 1e9, str;
  for (let i = 0; i < 3; i++) {
    const st = {};
    str = await SAVE.serializeStateAsync(s, st);
    bestMax = Math.min(bestMax, st.maxSliceMs); bestTot = Math.min(bestTot, st.totalMs);
  }
  console.log(`async sliced: longest slice ${bestMax.toFixed(1)} ms, total ${bestTot.toFixed(1)} ms, identical=${str === syncStr}`);
}
