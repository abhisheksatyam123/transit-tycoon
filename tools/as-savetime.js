#!/usr/bin/env bun
// Times game.serialize() (the synchronous part of an autosave) on a default map and on Moscow.
import { Game } from '../js/simulation/game.js';
import { serializeState } from '../js/simulation/save.js';
const g = Game.create({ seed: 1 });
g.stepDays(60);
const time = (fn, n = 5) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } return Math.min(...t).toFixed(1) + ' ms (min of ' + n + ')'; };
console.log('default map serialize:', time(() => serializeState(g.state)), 'chars', serializeState(g.state).length);
// Moscow: scenario data loaded first (as the app does), then a short run.
const { loadMoscowData } = await import('../js/simulation/scenarios/moscowRegistry.js');
await loadMoscowData();
const m = Game.create({ seed: 1, scenario: 'moscow' });
m.stepDays(60);
console.log('moscow serialize:', time(() => serializeState(m.state)), 'chars', serializeState(m.state).length);
