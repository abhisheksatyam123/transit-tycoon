/**
 * Company infrastructure window (OpenTTD company_gui.cpp CompanyInfrastructureWindow, read-only).
 * Lists the player's owned infrastructure piece counts and the monthly maintenance cost, from
 * js/simulation/infrastructure.js (one cheap pass over the tiles; nothing is stored). Opened from the
 * Companies window; no hotkey. UI only: the game state is read, never changed.
 */
import { el, clear } from '../dom.js';
import { money } from '../format.js';
import { getSetting } from '../../simulation/settings.js';
import { countInfrastructure, infrastructureMaintenance } from '../../simulation/infrastructure.js';

/**
 * Piece counts and cost for the player company (pure, testable). `sea` is always 0: TT has no canal /
 * sea infrastructure and the simulation does not maintain docks or ship depots.
 * @param {any} state
 * @returns {{rail:number, road:number, signals:number, stations:number, air:number, sea:number,
 *   monthly:number, maintenanceOff:boolean}}
 */
export function infrastructureSummary(state) {
  const c = countInfrastructure(state);
  const on = !!getSetting(state, 'infraMaintenance');
  return {
    rail: c.rail, road: c.road, signals: c.signals, stations: c.stations, air: c.airports, sea: 0,
    monthly: on ? infrastructureMaintenance(state) : 0,
    maintenanceOff: !on,
  };
}

/**
 * Rows as shown in the window: {id, label, value, text, note?}. `text` is the exact rendered line.
 * @param {any} state
 * @returns {{id:string, label:string, value:number, text:string, note?:string}[]}
 */
export function infrastructureRows(state) {
  const s = infrastructureSummary(state);
  const rows = [
    { id: 'rail', label: 'Rail pieces', value: s.rail },
    { id: 'road', label: 'Road pieces', value: s.road },
    { id: 'signals', label: 'Signals', value: s.signals },
    { id: 'stations', label: 'Stations', value: s.stations },
    { id: 'air', label: 'Airports (air)', value: s.air },
    { id: 'sea', label: 'Sea pieces', value: s.sea, note: 'no sea infrastructure maintenance in TT' },
    { id: 'cost', label: 'Monthly infrastructure cost', value: s.monthly, money: true,
      note: s.maintenanceOff ? 'infrastructure maintenance off' : '' },
  ];
  return rows.map((r) => ({ ...r, text: `${r.label}: ${r.money ? money(r.value) : String(r.value)}` }));
}

/** @param {import('../app.js').App} app */
export function openCompanyInfrastructure(app) {
  return app.wm.open('companyInfrastructure', {
    title: 'Company infrastructure',
    width: 460,
    build(body) {
      const host = el('div');
      body.appendChild(host);
      body.appendChild(el('p.small.muted', { text: 'Read-only: owned pieces and their monthly maintenance (OpenTTD Company infrastructure).' }));
      let sig = '';
      return () => {
        const rows = infrastructureRows(app.game.state);
        const s = JSON.stringify(rows);
        if (s === sig) return;
        sig = s;
        clear(host);
        const tbl = el('table.ledger');
        tbl.appendChild(el('tr', null, ['Infrastructure', 'Pieces', 'Monthly cost', 'Notes'].map((h) => el('th', { text: h }))));
        for (const r of rows) {
          const cost = r.id === 'cost';
          tbl.appendChild(el('tr', null,
            el('td.lbl', { text: r.label }),
            el('td.mono', { text: cost ? '—' : String(r.value) }),
            el('td.mono', { text: cost ? money(r.value) : '' }),
            el('td.small.muted', { text: r.note || '' })));
        }
        host.appendChild(tbl);
      };
    },
  });
}
