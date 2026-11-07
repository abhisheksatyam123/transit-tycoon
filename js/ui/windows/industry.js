/**
 * Industry window: production, transported share, stock, accepted cargo.
 */
import { el, setText } from '../dom.js';
import { cargoChip } from '../cargo.js';
import { num } from '../format.js';
import { heading, listOrEmpty } from './common.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { CARGO_BY_ID } from '../../config/cargos.js';
import { drawChart, chronological } from './graphs.js';
import { monthName } from '../format.js';

/**
 * Production-history series for the industry graph (OTTD industry_gui production chart). Pure.
 * `hist` is ind.hist (lazy tuples [monthIndex, p0, t0, p1, t1]); `cargos` the produced cargo ids.
 * Returns the month labels (oldest first) and, per cargo, a produced and a transported series.
 * @returns {{labels:string[], series:Array<{name:string,color:string,values:number[]}>}}
 */
export function industryHistorySeries(hist, cargos, max = 24) {
  const rows = Array.isArray(hist) ? hist.slice(-max) : [];
  const labels = rows.map((r) => `${monthName(r[0] % 12).slice(0, 3)} ${Math.floor(r[0] / 12)}`);
  const series = [];
  (cargos || []).forEach((c, i) => {
    const name = (CARGO_BY_ID[c] && CARGO_BY_ID[c].name) || c;
    const color = (CARGO_BY_ID[c] && CARGO_BY_ID[c].color) || '#9ca3af';
    series.push({ name: `${name} produced`, color, values: rows.map((r) => Number(r[1 + i * 2]) || 0) });
    series.push({ name: `${name} transported`, color, values: rows.map((r) => Number(r[2 + i * 2]) || 0), dashed: true });
  });
  return { labels, series };
}

/**
 * @param {import('../app.js').App} app
 * @param {number} id industry id
 */
export function openIndustry(app, id) {
  return app.wm.open('industry:' + id, {
    title: 'Industry',
    width: 320,
    build(body, win) {
      const prod = el('div.list');
      const acc = el('div.chips');
      const stock = el('div.list');
      const graphCanvas = el('canvas', { style: { maxWidth: '100%', margin: '4px 0' }, 'aria-label': 'Production history' });
      const graphLegend = el('div.small', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 10px' } });
      const graphNote = el('div.muted.small', { text: 'Production history (last 24 months): solid = produced, dashed = transported.' });
      let graphSig = '';
      body.append(heading('Production last month (transported)'), prod, heading('History'), graphNote, graphCanvas, graphLegend, heading('Accepts'), acc, heading('Stock'), stock,
        el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Center view', onclick: () => {
          const i = app.findIndustry(id);
          if (i) app.centerOn(i.x + (i.w || 1) / 2, i.y + (i.h || 1) / 2);
        } })));
      let accDone = false;
      return () => {
        const ind = app.findIndustry(id);
        if (!ind) { win.close(); return; }
        win.setTitle(ind.name);
        const type = INDUSTRY_BY_ID[ind.typeId] || { produces: [], accepts: [] };
        const produces = type.produces.length ? type.produces : Object.keys(ind.production || {});
        listOrEmpty(prod, produces.map((c) => ({ c })), (r) => r.c,
          (r) => el('div.cargo-row', null, cargoChip(r.c), el('span.mono.num')),
          (row, r) => {
            const made = (ind.producedLastMonth || {})[r.c] || 0;
            const moved = (ind.transportedLastMonth || {})[r.c] || 0;
            const pct = made > 0 ? Math.round((moved / made) * 100) : 0;
            setText(row.lastChild, `${num(made)} (${pct}% transported)`);
          }, 'Produces only from delivered cargo');
        if (!accDone) {
          accDone = true;
          if (!type.accepts.length) acc.appendChild(el('span.empty', { text: 'Nothing' }));
          for (const c of type.accepts) acc.appendChild(cargoChip(c));
        }
        // graph: redraw only when a month end added an entry (cheap at ~4 fps refresh)
        const hist = ind.hist || [];
        const sig = `${hist.length}:${hist.length ? hist[hist.length - 1][0] : ''}`;
        if (sig !== graphSig) {
          graphSig = sig;
          const cargos = type.produces && type.produces.length ? type.produces.slice(0, 2) : produces.slice(0, 2);
          const g = industryHistorySeries(hist, cargos, 24);
          drawChart(graphCanvas, { w: 300, h: 150, labels: g.labels, fmt: (v) => num(v), plain: true, series: g.series });
          graphLegend.replaceChildren(...g.series.map((s) => el('span', null, el('span', { style: { display: 'inline-block', width: '10px', height: '3px', background: s.color, marginRight: '4px', verticalAlign: 'middle', opacity: s.dashed ? 0.6 : 1 } }), s.name)));
        }
        const st = ind.stock || {};
        const items = Object.keys(st).filter((k) => st[k] > 0).map((c) => ({ c, n: st[c] }));
        listOrEmpty(stock, items, (r) => r.c,
          (r) => el('div.cargo-row', null, cargoChip(r.c), el('span.mono.num')),
          (row, r) => setText(row.lastChild, num(r.n)), 'Empty');
      };
    },
  });
}
