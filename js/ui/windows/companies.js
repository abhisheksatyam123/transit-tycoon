/**
 * Company window (gap #25 stage 2): one row per company (the player plus AI rivals) with name, colour,
 * money, loan, value, vehicles, stations and last-year profit. Opened from the League tab.
 */
import { el, clear } from '../dom.js';
import { money } from '../format.js';
import { liveCompanyValue } from './graphs.js';
import { playerSharesOf, sharePrice, shareBlock } from '../../simulation/shares.js';
import { getSetting } from '../../simulation/settings.js';
import { playerColourOf, COMPANY_COLOURS, setCompanyColour } from '../../simulation/companyColour.js';
import { presidentDisplayName } from '../../simulation/cmdRename.js';
import { openRename } from '../rename.js';

/** Rows for the company window: the player first, then the rivals (pure, testable). */
export function companyRows(state) {
  const rows = [];
  const c = state.company;
  const veh = (id) => state.vehicles.filter((v) => (id == null ? v.ownerId == null : v.ownerId === id));
  const stn = (id) => state.stations.filter((s) => (id == null ? s.ownerId == null : s.ownerId === id)).length;
  const lastYear = (co) => (co.ledger.history || []).slice(-12).reduce((a, h) => a + (h.income || 0) - (h.expenses || 0), 0);
  rows.push({ name: c.name || 'Player', colour: playerColourOf(state), player: true, money: c.money, loan: c.loan, value: liveCompanyValue(state, c),
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

/**
 * Company colour chooser (OpenTTD company colour): the 16 company colours; a colour a rival uses is disabled.
 * The choice is applied through game.setCompanyColour (CmdSetCompanyColour).
 * @param {import('../app.js').App} app
 */
function colourChooser(app) {
  const state = app.game.state;
  const cur = playerColourOf(state);
  const taken = new Set((state.rivals || []).map((r) => String(r.colour || '').toLowerCase()));
  const wrap = el('div.colour-chooser');
  wrap.appendChild(el('p.small', { text: 'Your company colour (rivals keep theirs):' }));
  const row = el('div.colour-row');
  for (const c of COMPANY_COLOURS) {
    const isTaken = taken.has(c.hex) && c.hex !== cur;
    const b = el('button.colour-swatch', { type: 'button', title: isTaken ? c.name + ' (used by a rival)' : c.name,
      'aria-label': c.name, 'aria-pressed': String(c.hex === cur), disabled: isTaken,
      style: { background: c.hex, width: '20px', height: '20px', margin: '2px', border: c.hex === cur ? '2px solid #fff' : '1px solid #0008', outline: c.hex === cur ? '2px solid #000' : 'none' },
      onclick: () => {
        const res = app.game.setCompanyColour(c.hex);
        if (!res.ok) { app.toast(res.error, 'error', true); return; }
        app.toast('Company colour: ' + c.name, 'good');
        app.renderer.invalidateGround();
        app.ui.refreshToolbar?.();
      } });
    row.appendChild(b);
  }
  wrap.appendChild(row);
  return wrap;
}

/** Vehicle types of the colour scheme (cmdGroup.js TYPE_COLOUR_KEYS) with their labels. */
const SCHEME_TYPES = [['rail', 'Trains & metro'], ['road', 'Buses & trucks'], ['tram', 'Trams'], ['air', 'Aircraft'], ['ship', 'Ships']];

/**
 * Colour scheme (OpenLoco CompanyWindow colour scheme tab / OpenTTD livery, simplified): one swatch row per vehicle
 * type, same swatches as the group livery; 'Company colour' resets a type. Rebuilt only when the scheme changes.
 * @param {import('../app.js').App} app
 */
function colourScheme(app) {
  const wrap = el('div.colour-scheme');
  let sig = null;
  wrap.update = () => {
    const tc = app.game.state.company.typeColours || {};
    const s = JSON.stringify(tc) + (app.game.state.company.colour || '');
    if (s === sig) return;
    sig = s;
    const rows = SCHEME_TYPES.map(([type, label]) => {
      const cur = tc[type] || null;
      const set = (hex) => { app.exec(app.game.setTypeColour(type, hex), { sound: 'click' }); app.wm.updateAll(); };
      return el('div.colour-row', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', margin: '2px 0' } },
        el('span.small', { text: label, style: { width: '120px' } }),
        ...COMPANY_COLOURS.map((c) => el('button.colour-swatch', { type: 'button',
          title: c.name, 'aria-label': label + ' colour ' + c.name, 'aria-pressed': String(c.hex === cur),
          style: { background: c.hex, width: '16px', height: '16px', margin: '1px', border: c.hex === cur ? '2px solid #fff' : '1px solid #0008', outline: c.hex === cur ? '2px solid #000' : 'none' },
          onclick: () => set(c.hex) })),
        el('button.btn.sm', { type: 'button', text: 'Company colour', title: 'Draw ' + label.toLowerCase() + ' in the company colour', disabled: !cur, onclick: () => set(null) }));
    });
    wrap.replaceChildren(el('p.small', { text: 'Colour scheme (per vehicle type; group colour overrides):' }), ...rows);
  };
  wrap.update();
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
      const scheme = colourScheme(app);
      body.appendChild(scheme);
      let sig = '';
      return () => {
        const rows = companyRows(app.game.state);
        const withShares = !!getSetting(app.game.state, 'shares');
        const cheated = !!app.game.state.cheated; // OpenTTD marks a cheated company (lazy state.cheated, cheats.js)
        scheme.update(); // cheap: rebuilds only when the scheme changed
        const s = JSON.stringify(rows) + withShares + cheated + presidentDisplayName(app.game.state);
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
        // President (OpenTTD CmdRenamePresident): lazy name, default label until renamed
        table.appendChild(el('p.small', null, el('span', { text: 'President: ' + presidentDisplayName(app.game.state) + ' ' }),
          el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'president') })));
        if (cheated) table.appendChild(el('p.small.neg', { text: 'Cheated game: a cheat was used (Settings > Cheats).' }));
        table.appendChild(colourChooser(app));
      };
    },
  });
}
