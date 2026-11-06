// Cargodist monthly graph rebuild timing: 256x256 random map, ~50 stations, dense random order legs.
import { Game } from '../js/simulation/game.js';
import { noteLeg, rebuildGraph } from '../js/simulation/cargodist.js';
import { setSetting } from '../js/simulation/settings.js';
const g = Game.create({ seed: 3, width: 256, height: 256 });
const s = g.state;
setSetting(s, 'cargodist', 'symmetric');
let seed = 9; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const legs = [];
for (let i = 0; i < 120; i++) legs.push([Math.floor(rnd() * 50), Math.floor(rnd() * 50)]);
for (let i = 0; i < 50; i++) s.stations.push({ id: 1000 + i, name: 'S' + i, x: Math.floor(rnd() * 256), y: Math.floor(rnd() * 256), cargo: {}, rating: {}, lastPickup: {}, accepts: {}, tiles: [], kinds: {} });
const sts = s.stations.slice(-50);
for (const st of sts) st.cdSupply = { PASS: 100 + Math.floor(rnd() * 900), MAIL: 50 };
const noteAll = () => { for (const [i, j] of legs) if (i !== j) noteLeg(s, sts[i], sts[j].id, [{ cargoId: 'PASS', capacity: 40 }, { cargoId: 'MAIL', capacity: 20 }]); };
const times = [];
noteAll();
for (let k = 0; k < 20; k++) {
  for (const st of sts) st.cdSupply = { PASS: 100 + Math.floor(rnd() * 900), MAIL: 50 };
  noteAll(); // vehicles run every month, so their edges stay fresh
  const t0 = performance.now();
  for (const c of ['PASS', 'MAIL']) rebuildGraph(s, c, 'symmetric');
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
console.log(`stations=50 edges=${Object.keys(s.cargoDist.PASS.edges).length} rebuild(PASS+MAIL) median=${times[10].toFixed(2)}ms p90=${times[18].toFixed(2)}ms max=${times[19].toFixed(2)}ms`);
