import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
const seed = Number(process.argv[2] || 15), days = Number(process.argv[3] || 730);
const g = Game.create({ seed, width: 96, height: 96, townCount: 8 });
setSetting(g.state, 'aiCompanies', 1);
for (let d = 0; d < days; d += 365) {
  g.stepDays(Math.min(365, days - d));
  const r = g.state.rivals?.[0];
  if (!r) { console.log('no rival'); continue; }
  const last = r.ledger.history.at(-1);
  console.log(`day ${g.state.date ? '' : ''}${d + 365}: money ${r.money} loan ${r.loan} value ${r.companyValue} veh ${r.vehicles.length} stn ${r.stations.length} routes ${r.routes.length} lastMonthInc ${last?.income} exp ${last?.expenses} stats ${JSON.stringify(r.stats)}`);
}
