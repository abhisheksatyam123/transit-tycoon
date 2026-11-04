/**
 * Traffic Monitor window: live KPIs, 90-day history chart, congested roads, per-town table,
 * and renderer toggles (traffic heatmap, cars). Refresh is cheap: it reads cached stats.
 */
import { el, setText, clear } from '../dom.js';
import { num, pct } from '../format.js';
import { kvGrid, heading } from './common.js';

const C_ACTIVE = '#38bdf8', C_FAILED = '#f87171';

/**
 * Draw a two-series line chart onto a canvas.
 * @param {HTMLCanvasElement} cv
 * @param {{active:number,failed:number}[]} hist
 */
function drawHistory(cv, hist) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,23,38,0.8)';
  ctx.fillRect(0, 0, W, H);
  if (!hist.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText('No history yet', 8, H / 2 + 4);
    return;
  }
  let max = 1;
  for (const h of hist) max = Math.max(max, h.active || 0, h.failed || 0);
  const n = hist.length;
  const xOf = (i) => (n <= 1 ? W : (i / (n - 1)) * (W - 4)) + 2;
  const yOf = (v) => H - 4 - ((v || 0) / max) * (H - 8);
  const line = (key, color) => {
    ctx.beginPath();
    hist.forEach((h, i) => (i ? ctx.lineTo(xOf(i), yOf(h[key])) : ctx.moveTo(xOf(i), yOf(h[key]))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  line('active', C_ACTIVE);
  line('failed', C_FAILED);
}

/**
 * @param {import('../app.js').App} app
 */
export function openTraffic(app) {
  return app.wm.open('traffic', {
    title: 'Traffic Monitor',
    width: 420,
    build(body) {
      const na = el('div.empty', { text: 'Traffic not available' });
      const get = () => {
        const g = app.game;
        if (!g || typeof g.trafficStats !== 'function') return null;
        try { return g.trafficStats(); } catch { return null; }
      };
      const kpiLabels = ['Active cars', 'Trips today', 'Trips total', 'Failed today', 'Failed total', 'Aborted (stuck)', 'Suppressed (no room)', 'Avg speed', 'Avg trip (days)', 'Congested tiles'];
      const set = kvGrid(body, kpiLabels);

      const cv = /** @type {HTMLCanvasElement} */ (el('canvas', { width: 380, height: 90, style: { width: '100%', height: '90px' } }));
      const legend = el('div.chips.small', null,
        el('span', null, el('i', { style: { display: 'inline-block', width: '9px', height: '9px', background: C_ACTIVE, marginRight: '4px' } }), 'Active cars'),
        el('span', null, el('i', { style: { display: 'inline-block', width: '9px', height: '9px', background: C_FAILED, marginRight: '4px' } }), 'Failed trips (90 days)'));

      const toggles = el('div.btn-row');
      const cbHeat = el('input', { type: 'checkbox' });
      const cbCars = el('input', { type: 'checkbox' });
      toggles.append(
        el('label.small', null, cbHeat, ' Show traffic heatmap'),
        el('label.small', null, cbCars, ' Show cars'));
      cbHeat.addEventListener('change', () => { if (app.renderer && app.renderer.overlay) app.renderer.overlay.trafficHeat = cbHeat.checked; });
      cbCars.addEventListener('change', () => { if (app.renderer && app.renderer.overlay) app.renderer.overlay.trafficCars = cbCars.checked; });

      const congList = el('div.list');
      const townWrap = el('div.table-wrap');
      body.append(na, toggles, cv, legend, heading('Top congested roads'), congList, heading('Towns'), townWrap);
      let sig = '';

      return () => {
        const st = get();
        na.style.display = st ? 'none' : '';
        if (!st) { setText(na, 'Traffic not available'); return; }
        const s = st.stats || st;
        const ratio = typeof st.avgSpeedRatio === 'number' ? st.avgSpeedRatio : (s.avgSpeedRatio || 0);
        const ticks = st.avgTripTicks ?? s.avgTripTicks ?? 0;
        set['Active cars'](num(st.active ?? s.active ?? 0));
        set['Trips today'](num(st.tripsToday ?? 0));
        set['Trips total'](num(st.tripsTotal ?? 0));
        set['Failed today'](num(st.failedToday ?? 0));
        set['Failed total'](num(st.failedTotal ?? 0));
        set['Aborted (stuck)'](num(st.abortedTotal ?? 0));
        set['Suppressed (no room)'](num(st.suppressedTotal ?? 0));
        set['Avg speed'](pct(ratio, true));
        set['Avg trip (days)'](((ticks || 0) / 30).toFixed(1));
        set['Congested tiles'](num(st.congestedTiles ?? s.congestedTiles ?? 0));
        cbHeat.checked = !!(app.renderer && app.renderer.overlay && app.renderer.overlay.trafficHeat);
        cbCars.checked = !(app.renderer && app.renderer.overlay) || app.renderer.overlay.trafficCars !== false;

        const hist = (st.history || s.history || []).slice(-90);
        const hs = JSON.stringify(hist.map((h) => [h.active, h.failed]));
        if (hs !== sig) {
          sig = hs;
          drawHistory(cv, hist);
        }
        clear(congList);
        const top = st.topCongested || [];
        if (!top.length) congList.append(el('div.empty', { text: 'No congestion' }));
        for (const r of top) {
          congList.append(el('button.list-row', {
            type: 'button', title: 'Centre view on this road',
            onclick: () => app.centerOn(r.x, r.y),
          }, el('span.name', { text: `(${r.x}, ${r.y})` }), el('span.mono.num', { text: `${Math.round(100 * (r.jam || 0))}% jam · ${Number(r.load).toFixed(1)} cars` })));
        }

        const towns = (st.perTown || []).slice().sort((a, b) => b.population - a.population);
        clear(townWrap);
        if (!towns.length) { townWrap.append(el('div.empty', { text: 'No towns' })); return; }
        const table = el('div.table-head', null, el('span', { text: 'Town' }), el('span.num', { text: 'Pop' }), el('span.num', { text: 'Trips' }), el('span.num', { text: 'Failed' }), el('span.num', { text: 'Stuck/Active' }));
        townWrap.append(table);
        for (const t of towns) {
          const row = el('div.table-row' + (t.failed > 0 ? '.warn-row' : ''), { title: t.failed > 0 ? 'Some trips have no route' : '' },
            el('span', { text: t.name }), el('span.num.mono', { text: num(t.population) }),
            el('span.num.mono', { text: num(t.trips) }), el('span.num.mono', { text: num(t.failed) }),
            el('span.num.mono', { text: `${num(t.aborted)} / ${num(t.active)}` }));
          townWrap.append(row);
        }
      };
    },
  });
}
