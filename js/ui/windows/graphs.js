/**
 * Company graphs + league (gap #14; OpenTTD graph_gui.cpp / league_gui.cpp, OpenLoco CompanyList.cpp).
 * Tabs: company value, income & expenses (ledger, 36 months), cargo delivered (per month),
 * performance index (0..1000 with the rating title). The league lists every company with its rating.
 * All series come from existing state (companyValueHistory, ledger.history, cargoUnitsDeliveredHistory,
 * performanceIndexHistory); nothing is recorded here.
 */
import { el, setText } from '../dom.js';
import { money, monthName, num } from '../format.js';
import { performanceToRating, RATING_NAMES, HISTORY_LENGTH } from '../../simulation/loco/company.js';

export const GRAPH_TABS = [
  ['value', 'Company value'],
  ['finance', 'Income / expenses'],
  ['cargo', 'Cargo delivered'],
  ['performance', 'Performance'],
  ['league', 'League'],
];

/** Performance title (OpenLoco performanceToRating + RATING_NAMES). 0..1000 index. */
export function performanceTitle(index) {
  const r = performanceToRating(Math.max(0, Math.min(1000, Number(index) || 0)));
  return { rating: r, title: RATING_NAMES[r] || RATING_NAMES[0] };
}

/** Newest-first history array (as the simulation stores it) -> oldest-first, bounded to `max` months. */
export function chronological(history, max = HISTORY_LENGTH) {
  const arr = Array.isArray(history) ? history.slice(0, max) : [];
  return arr.slice().reverse().map((v) => Number(v) || 0);
}

/**
 * "Nice" axis for a series: rounded min/max and tick step (1/2/5 x 10^n), always containing 0 when
 * the data does. Pure.
 * @param {number[]} values
 * @param {number} [ticks] desired number of intervals
 * @returns {{min:number,max:number,step:number}}
 */
export function niceScale(values, ticks = 4) {
  let lo = 0, hi = 0;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, ticks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

/**
 * Income / expenses series from the ledger history (oldest first) plus the running month.
 * @param {any} company
 * @returns {{labels:string[], income:number[], expenses:number[]}}
 */
export function ledgerSeries(company) {
  const hist = (company && company.ledger && company.ledger.history) || [];
  const cur = company && company.ledger && company.ledger.current;
  const rows = hist.slice(-12).map((h) => ({ label: `${monthName(h.month)}`, income: h.income || 0, expenses: h.expenses || 0 }));
  if (cur) rows.push({ label: 'Now', income: cur.income || 0, expenses: cur.expenses || 0 });
  return { labels: rows.map((r) => r.label), income: rows.map((r) => r.income), expenses: rows.map((r) => r.expenses) };
}

/**
 * Player company value as shown in the status bar (money - loan + vehicle values); the stored
 * c.companyValue is only refreshed at month end (0 on day 0).
 * @param {any} state
 * @param {any} c
 */
export function liveCompanyValue(state, c) {
  if (!c || typeof c.money !== 'number') return (c && c.companyValue) || 0;
  let v = c.money - (c.loan || 0);
  for (const veh of (state && state.vehicles) || []) v += veh.value || 0;
  return v;
}

/**
 * League rows: every company (the player plus AI rivals if any) sorted by company value.
 * @param {any} state
 * @returns {Array<{name:string,value:number,rating:number,title:string,player:boolean,bankrupt:boolean}>}
 */
export function leagueRows(state) {
  const cos = [];
  if (state && state.company) cos.push({ c: state.company, player: true });
  for (const c of (state && state.companies) || []) if (c && c !== state.company) cos.push({ c, player: false });
  return cos.map(({ c, player }) => {
    const p = performanceTitle(c.performanceIndex);
    const value = player ? liveCompanyValue(state, c) : (c.companyValue || 0);
    return { name: c.name || 'Company', value, rating: p.rating, title: p.title, player, bankrupt: !!c.bankrupt };
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Theme colour from a CSS variable with a fallback (canvas cannot read var()). */
function themeColor(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

/**
 * Draw a line chart on a canvas (axes, grid, month labels, value labels, legend).
 * @param {HTMLCanvasElement} canvas
 * @param {{labels:string[], series:Array<{name:string,color:string,values:number[]}>, fmt?:(v:number)=>string, w?:number, h?:number}} o
 */
export function drawChart(canvas, o) {
  const w = o.w || 500, h = o.h || 200;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const fmt = o.fmt || ((v) => money(v));
  const muted = themeColor('--muted', '#94a3b8');
  const text = themeColor('--text', '#e2e8f0');
  const all = o.series.flatMap((s) => s.values);
  if (!all.length) {
    ctx.fillStyle = muted; ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No data yet: a point is recorded at each month end.', w / 2, h / 2);
    return;
  }
  const padL = 64, padR = 12, padT = 26, padB = 26; // padT leaves a row for the legend
  const pw = w - padL - padR, ph = h - padT - padB;
  const sc = niceScale(all, 4);
  const yOf = (v) => padT + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;
  for (let v = sc.min; v <= sc.max + 1e-9; v += sc.step) {
    const y = Math.round(yOf(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(fmt(v), padL - 6, y);
  }
  const n = o.labels.length;
  const xOf = (i) => (n <= 1 ? padL + pw / 2 : padL + (i / (n - 1)) * pw);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / 8));
  o.labels.forEach((lab, i) => { if (i % every === 0 || i === n - 1) ctx.fillText(lab, xOf(i), h - padB + 6); });
  if (sc.min < 0 && sc.max > 0) { ctx.strokeStyle = 'rgba(148,163,184,0.4)'; const y0 = Math.round(yOf(0)) + 0.5; ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(w - padR, y0); ctx.stroke(); }
  for (const s of o.series) {
    if (!s.values.length) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
    s.values.forEach((v, i) => { const x = xOf(i), y = yOf(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    const last = s.values.length - 1;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(xOf(last), yOf(s.values[last]), 3, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = text;
    const ly = yOf(s.values[last]);
    // keep the value label inside the plot: below the point when it would reach the legend row
    if (ly - 17 < padT) { ctx.textBaseline = 'top'; ctx.fillText(fmt(s.values[last]), Math.min(xOf(last), w - padR), ly + 5); }
    else { ctx.textBaseline = 'bottom'; ctx.fillText(fmt(s.values[last]), Math.min(xOf(last), w - padR), ly - 5); }
  }
  // legend
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  let lx = padL;
  for (const s of o.series) {
    ctx.fillStyle = s.color; ctx.fillRect(lx, 6, 10, 3);
    ctx.fillStyle = text; ctx.fillText(s.name, lx + 14, 2);
    lx += 14 + ctx.measureText(s.name).width + 14;
  }
}

/** Colours for the chart series (theme-aware). */
function palette() {
  return { accent: themeColor('--accent', '#38bdf8'), good: themeColor('--good', '#4ade80'), bad: themeColor('--bad', '#f87171'), warn: themeColor('--warn', '#fbbf24') };
}

/**
 * @param {import('../app.js').App} app
 */
export function openGraphs(app) {
  const state = { tab: 'value' };
  return app.wm.open('graphs', {
    title: 'Company graphs',
    width: 560,
    build(body) {
      const tabs = el('div.btn-row', { style: { marginTop: '0' } });
      const tabBtns = {};
      for (const [key, label] of GRAPH_TABS) {
        tabBtns[key] = el('button.btn.sm', { type: 'button', text: label, onclick: () => { state.tab = key; refresh(); } });
        tabs.appendChild(tabBtns[key]);
      }
      const summary = el('div.kv-grid');
      const canvas = el('canvas', { style: { maxWidth: '100%', margin: '4px 0' } });
      const table = el('div.list.scroll.table', { style: { maxHeight: '240px' } });
      body.append(tabs, summary, canvas, table);
      const sumLabel = el('span.kv-label'), sumValue = el('span.kv-value.mono');
      summary.append(sumLabel, sumValue);

      const refresh = () => {
        for (const k of Object.keys(tabBtns)) tabBtns[k].classList.toggle('active', k === state.tab);
        const c = app.game.state.company;
        const p = palette();
        const onLeague = state.tab === 'league';
        canvas.hidden = onLeague;
        table.hidden = !onLeague;
        if (state.tab === 'value') {
          const vals = chronological(c.companyValueHistory);
          setText(sumLabel, 'Company value now');
          setText(sumValue, money(liveCompanyValue(app.game.state, c)));
          drawChart(canvas, { labels: monthLabels(vals.length), series: [{ name: 'Company value', color: p.accent, values: vals }] });
        } else if (state.tab === 'finance') {
          const s = ledgerSeries(c);
          const net = s.income.map((v, i) => v - s.expenses[i]);
          setText(sumLabel, 'Net this month');
          setText(sumValue, money(net[net.length - 1] || 0));
          drawChart(canvas, { labels: s.labels, series: [
            { name: 'Income', color: p.good, values: s.income },
            { name: 'Expenses', color: p.bad, values: s.expenses },
          ] });
        } else if (state.tab === 'cargo') {
          const vals = chronological(c.cargoUnitsDeliveredHistory);
          setText(sumLabel, 'Units delivered (last month)');
          setText(sumValue, num(vals[vals.length - 1] || 0));
          drawChart(canvas, { labels: monthLabels(vals.length), fmt: (v) => num(Math.round(v)), series: [{ name: 'Units', color: p.warn, values: vals }] });
        } else if (state.tab === 'performance') {
          const vals = chronological(c.performanceIndexHistory);
          const pt = performanceTitle(c.performanceIndex);
          setText(sumLabel, 'Performance title');
          setText(sumValue, `${pt.title} (${Math.round(c.performanceIndex || 0)})`);
          drawChart(canvas, { labels: monthLabels(vals.length), fmt: (v) => String(Math.round(v)), series: [{ name: 'Performance', color: p.accent, values: vals }] });
        } else {
          setText(sumLabel, 'Companies');
          const rows = leagueRows(app.game.state);
          setText(sumValue, String(rows.length));
          listRows(table, rows);
        }
      };
      refresh();
      return refresh;
    },
  });
}

/** Month axis labels for n points (newest = "Now"). */
function monthLabels(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i === n - 1 ? 'Now' : `-${n - 1 - i}`);
  return out;
}

/** Fill the league table. */
function listRows(table, rows) {
  table.replaceChildren();
  const head = el('div.table-head', { style: { gridTemplateColumns: '2fr 1.2fr 1.4fr' } },
    el('span', { text: 'Company' }), el('span', { text: 'Value' }), el('span', { text: 'Rating' }));
  table.appendChild(head);
  if (!rows.length) { table.appendChild(el('div.muted', { text: 'No companies' })); return; }
  rows.forEach((r, i) => {
    table.appendChild(el('div.table-row', { style: { gridTemplateColumns: '2fr 1.2fr 1.4fr' } },
      el('span.name', { text: `${i + 1}. ${r.name}${r.player ? ' (you)' : ''}${r.bankrupt ? ' — bankrupt' : ''}` }),
      el('span.mono.num', { text: money(r.value) }),
      el('span', { text: `${r.title} (${r.rating})` })));
  });
}
