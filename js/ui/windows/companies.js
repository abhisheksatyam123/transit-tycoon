/**
 * Company window (gap #25 stage 2): one row per company (the player plus AI rivals) with name, colour,
 * money, loan, value, vehicles, stations and last-year profit. Opened from the League tab.
 */
import { el, clear } from '../dom.js';
import { money } from '../format.js';
import { liveCompanyValue } from './graphs.js';
import { playerSharesOf, sharePrice, shareBlock } from '../../simulation/shares.js';
import { getSetting } from '../../simulation/settings.js';

/** Rows for the company window: the player first, then the rivals (pure, testable). */
export function companyRows(state) {
  const rows = [];
  const c = state.company;
  const veh = (id) => state.vehicles.filter((v) => (id == null ? v.ownerId == null : v.ownerId === id));
  const stn = (id) => state.stations.filter((s) => (id == null ? s.ownerId == null : s.ownerId === id)).length;
  const lastYear = (co) => (co.ledger.history || []).slice(-12).reduce((a, h) => a + (h.income || 0) - (h.expenses || 0), 0);
  rows.push({ name: c.name || 'Player', colour: '#f5b300', player: true, money: c.money, loan: c.loan, value: liveCompanyValue(state, c),
    vehicles: veh(null).length, stations: stn(null), profit: lastYear(c), bankrupt: !!c.bankrupt });
  for (const r of state.rivals || []) {
    rows.push({ name: r.name, colour: r.colour, player: false, money: r.money, loan: r.loan, value: r.companyValue ?? (r.money - r.loan),
      vehicles: veh(r.id).length, stations: stn(r.id), profit: lastYear(r), bankrupt: !!r.bankrupt,
    id: r.id, offer: r.takeoverOffer ? r.takeoverOffer.price : null,
      shares: playerSharesOf(r), sharePrice: sharePrice(r), buyBlock: shareBlock(state, r.id, 'buy'), sellBlock: shareBlock(state, r.id, 'sell') });
  }
  return rows;
}

/** Buy 25% / Sell 25% buttons for a rival (disabled with the reason as tooltip, shares setting must be on). */
function shareButtons(app, r) {
  const state = app.game.state;
  const wrap = el('span');
  const price = money(r.sharePrice);
  for (const action of ['buy', 'sell']) {
    const why = action === 'buy' ? r.buyBlock : r.sellBlock;
    const label = (action === 'buy' ? 'Buy ' : 'Sell ') + price;
    const btn = el('button', { text: label, title: why || (action === 'buy' ? 'Buy one 25% share for ' + price : 'Sell one 25% share for ' + price),
      disabled: !!why, onclick: () => app.game.tradeShare(r.id, action) });
    wrap.appendChild(btn);
    wrap.appendChild(document.createTextNode(' '));
  }
  return wrap;
}

/** @param {import('../app.js').App} app */
export function openCompanies(app) {
  return app.wm.open('companies', {
    title: 'Companies',
    width: Math.min(getSetting(app.game.state, 'shares') ? 1040 : 620, Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 900) - 24)),
    build(body) {
      const table = el('div.table-wrap');
      body.appendChild(table);
      let sig = '';
      return () => {
        const rows = companyRows(app.game.state);
        const withShares = !!getSetting(app.game.state, 'shares');
        const s = JSON.stringify(rows) + withShares;
        if (s === sig) return;
        sig = s;
        clear(table);
        const head = ['Company', 'Money', 'Loan', 'Value', 'Vehicles', 'Stations', 'Last-year profit', 'Takeover'].concat(withShares ? ['Shares', 'Trade 25%'] : []);
        const tbl = el('table.ledger');
        tbl.appendChild(el('tr', null, head.map((h) => el('th', { text: h }))));
        for (const r of rows) {
          tbl.appendChild(el('tr', null,
            el('td.lbl', null, el('span', { style: { display: 'inline-block', width: '10px', height: '10px', background: r.colour, marginRight: '6px' } }),
              el('span', { text: r.name + (r.player ? ' (you)' : '') + (r.bankrupt ? ' [bankrupt]' : '') })),
            el('td.mono', { text: money(r.money) }),
            el('td.mono', { text: money(r.loan) }),
            el('td.mono' + (r.value < 0 ? '.neg' : ''), { text: money(r.value) }),
            el('td.mono', { text: String(r.vehicles) }),
            el('td.mono', { text: String(r.stations) }),
            el('td.mono' + (r.profit < 0 ? '.neg' : '.pos'), { text: money(r.profit) }),
            el('td', null, r.offer == null ? null : el('button', { text: 'Buy for ' + money(r.offer), onclick: () => app.game.acceptTakeover(r.id) })),
            withShares ? el('td.mono', { text: r.player ? '' : (r.shares * 25) + '%' }) : null,
            withShares ? el('td', null, r.player ? null : shareButtons(app, r)) : null));
        }
        table.appendChild(tbl);
      };
    },
  });
}
