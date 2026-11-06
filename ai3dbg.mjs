import { Game } from './js/simulation/game.js';
import { setSetting } from './js/simulation/settings.js';
const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
setSetting(g.state, 'aiCompanies', 1);
for (let i=0;i<4;i++){ g.stepDays(180); const r=g.state.rivals[0]; console.log('d',(i+1)*180,'money',r.money,'loan',r.loan,'value',r.companyValue,'hqRival',!!r.hq,'routes',r.routes.length, 'veh', r.vehicles.length); }
console.log('playerHQ', !!g.state.company.hq);
