/**
 * Company window (gap #25 stage 2): one row per company (the player plus AI rivals) with name, colour,
 * money, loan, value, vehicles, stations and last-year profit. Opened from the League tab.
 */
import { el, clear } from '../dom.js';
import { money } from '../format.js';
import { liveCompanyValue, rivalValue } from './graphs.js';
import { playerSharesOf, sharePrice, shareBlock } from '../../simulation/shares.js';
import { getSetting } from '../../simulation/settings.js';
import { playerColourOf, COMPANY_COLOURS, setCompanyColour } from '../../simulation/companyColour.js';
import { presidentDisplayName, presidentFaceId, MAX_PRESIDENT_FACE_ID } from '../../simulation/cmdRename.js';
import { openRename } from '../rename.js';
import { openCompanyInfrastructure } from './companyInfrastructure.js';

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
    // live value/fleet: the stored companyValue and stats are only refreshed at month end (and go stale
    // once a rival is taken over or wound up); the league rows already use these live forms
    const bankrupt = !!(r.bankrupt || r.taken);
    const profit = bankrupt ? 0 : (r.stats && typeof r.stats.profit === 'number' ? r.stats.profit : lastYear(r));
    rows.push({ name: r.name, colour: r.colour, player: false, money: r.money, loan: r.loan, value: rivalValue(state, r),
      vehicles: veh(r.id).length, stations: stn(r.id), profit, bankrupt,
    id: r.id, offer: !bankrupt && r.takeoverOffer ? r.takeoverOffer.price : null,
      shares: playerSharesOf(r), sharePrice: sharePrice(r), buyBlock: shareBlock(state, r.id, 'buy'), sellBlock: shareBlock(state, r.id, 'sell') });
  }
  return rows;
}


export const FACE_SKIN = ['#f1c27d','#e0ac69','#c68642','#8d5524','#ffdbac','#f8d7b0','#e2b06a','#a66a2e'];
export function faceAvatarSVG(faceId){ const id=((faceId||0)%16+16)%16; const hi=id%4, sk=id>>2, skin=FACE_SKIN[sk]; const hair=['#222','#6b4f2a','#b0b0b0','#d9a05b'][hi]; const glasses=hi>=2?' <circle cx="22" cy="24" r="5" fill="none" stroke="#111"/><circle cx="32" cy="24" r="5" fill="none" stroke="#111"/>':''; const tie=sk%2===0?' <path d="M27 36 l-3 8 7 6 7-6 -3-8 z" fill="#3366cc"/>':''; return `<svg viewBox="0 0 54 54" width="36" height="36" role="img" aria-label="President face ${id}"><circle cx="27" cy="27" r="26" fill="#dfe8f5"/><circle cx="27" cy="26" r="15" fill="${skin}"/><path d="M12 24 a15 15 0 0 1 30 0 l0 -4 a15 10 0 0 0 -30 0 z" fill="${hair}"/>${glasses}${tie}<circle cx="21" cy="25" r="1.8" fill="#111"/><circle cx="33" cy="25" r="1.8" fill="#111"/><path d="M21 33 q6 5 12 0" stroke="#111" fill="none"/></svg>`; }
function presidentFaceRow(app, refresh){ const wrap=el('p.small.president-face'); wrap.innerHTML=''; const fid=presidentFaceId(app.game.state); const av=el('span.president-avatar'); av.innerHTML=faceAvatarSVG(fid); wrap.appendChild(av); wrap.appendChild(document.createTextNode(' President face '+fid+' ')); const picker=el('span.face-picker'); picker.style.display='none'; for(let i=0;i<=MAX_PRESIDENT_FACE_ID;i++){ const b=el('button.face-option',{type:'button',title:'Face '+i,'aria-label':'Face '+i, onclick:()=>{ const r=app.game.setCompanyManagerFace(i); if(!r.ok){app.toast(r.error,'error',true);return;} app.toast('Manager face: '+i,'good'); refresh(); }}); b.innerHTML=faceAvatarSVG(i); b.style.margin='2px'; b.style.padding='2px'; b.style.border=i===fid?'2px solid #007bff':'1px solid #ccc'; picker.appendChild(b); } wrap.appendChild(el('button.btn',{type:'button',text:'Change face…', onclick:()=>{ picker.style.display=picker.style.display==='none'?'block':'none'; }})); wrap.appendChild(picker); return wrap; }

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
        const s = JSON.stringify(rows) + withShares + cheated + presidentDisplayName(app.game.state) + presidentFaceId(app.game.state);
        if (s === sig) return;
        sig = s;
        clear(table);
        const head = ['Company', 'Money', 'Loan', 'Value', 'Vehicles', 'Stations', 'Last-month profit', 'Takeover'].concat(withShares ? ['Shares', 'Trade 25%'] : []);
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
        // Company and President rename (OpenTTD CmdRenameCompany / CmdRenamePresident)
        table.appendChild(el('p.small', null, el('span', { text: 'Company: ' + (app.game.state.company.name || 'Player') + ' ' }),
          el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'company') })));
        table.appendChild(el('p.small', null, el('span', { text: 'President: ' + presidentDisplayName(app.game.state) + ' ' }),
          el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'president') })));
        table.appendChild(presidentFaceRow(app, () => { sig=''; }));
        if (cheated) table.appendChild(el('p.small.neg', { text: 'Cheated game: a cheat was used (Settings > Cheats).' }));
        table.appendChild(colourChooser(app));
        // Read-only owned-infrastructure window (OpenTTD CompanyInfrastructureWindow)
        table.appendChild(el('div.btn-row', null,
          el('button.btn', { type: 'button', text: 'Infrastructure…', title: 'Owned infrastructure pieces and monthly maintenance (read-only)',
            onclick: () => openCompanyInfrastructure(app) })));
      };
    },
  });
}
