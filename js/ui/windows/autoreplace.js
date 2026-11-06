/**
 * Autoreplace window (OpenTTD autoreplace_gui, simplified): one row per model the company runs, with the number of
 * vehicles, a select of compatible purchasable replacement models and "Stop replacing". Rules apply when a vehicle
 * of that model is stopped in a depot (simulation/autorenew.js).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { kmhText } from '../format.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';
import { replacementCandidates } from '../../simulation/autoreplace.js';

/**
 * @param {import('../app.js').App} app
 * @param {string} [modelId] optional model to focus (unused for layout, kept for vehicle-window links)
 */
export function openAutoreplace(app) {
  return app.wm.open('autoreplace', {
    title: 'Autoreplace',
    width: 460,
    build(body) {
      const summary = el('div.muted', { text: 'Vehicles stopped in a depot are replaced by the model you choose here.' });
      const list = el('div.list.scroll.table');
      body.append(summary, list);
      const refresh = () => {
        const g = app.game;
        const year = g.state.date.year;
        const counts = {};
        for (const v of g.state.vehicles) if (v.ownerId == null) counts[v.modelId] = (counts[v.modelId] || 0) + 1;
        const rules = g.state.company.autoreplace || {};
        const models = Object.keys(counts).map((id) => MODEL_BY_ID[id]).filter(Boolean)
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
        listOrEmpty(list, models, (m) => m.id,
          (m) => {
            const sel = el('select.input', { 'aria-label': `Replace ${m.name} with` });
            const row = el('div.table-row', null,
              el('span'), el('span.mono.num'), sel,
              el('button.btn.sm', { type: 'button', text: 'Stop', title: 'Stop replacing this model',
                onclick: () => app.exec(g.setAutoreplace(m.id, null), { sound: 'click' }) }));
            row._sel = sel;
            return row;
          },
          (row, m) => {
            const c = row.children;
            setText(c[0], m.name);
            setText(c[1], `×${counts[m.id]}`);
            const sel = row._sel;
            const cands = replacementCandidates(m.id, year);
            sel.onchange = () => {
              if (sel.value) app.exec(g.setAutoreplace(m.id, sel.value), { sound: 'click' });
              refresh();
            };
            const cur = rules[m.id] || '';
            sel.replaceChildren(el('option', { value: '', text: '— keep (no rule) —' }),
              ...cands.map((c2) => el('option', { value: c2.id, text: `${c2.name} (${kmhText(c2.speed)})` })));
            sel.value = cur;
            c[3].disabled = !cur;
          }, 'No vehicles yet — buy one first');
      };
      refresh();
      return refresh;
    },
  });
}
