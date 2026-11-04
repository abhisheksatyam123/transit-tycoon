/**
 * Industry window: production, transported share, stock, accepted cargo.
 */
import { el, setText } from '../dom.js';
import { cargoChip } from '../cargo.js';
import { num } from '../format.js';
import { heading, listOrEmpty } from './common.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';

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
      body.append(heading('Production last month (transported)'), prod, heading('Accepts'), acc, heading('Stock'), stock,
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
        const st = ind.stock || {};
        const items = Object.keys(st).filter((k) => st[k] > 0).map((c) => ({ c, n: st[c] }));
        listOrEmpty(stock, items, (r) => r.c,
          (r) => el('div.cargo-row', null, cargoChip(r.c), el('span.mono.num')),
          (row, r) => setText(row.lastChild, num(r.n)), 'Empty');
      };
    },
  });
}
