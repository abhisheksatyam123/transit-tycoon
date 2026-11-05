/**
 * Subsidies window: open offers and awarded subsidies. Double-click a row to centre the view on its source.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { CARGO_BY_ID } from '../../config/cargos.js';
import { endpointName, endpointPos } from '../../simulation/subsidies.js';

/**
 * @param {import('../app.js').App} app
 */
export function openSubsidies(app) {
  return app.wm.open('subsidies', {
    title: 'Subsidies',
    width: 420,
    build(body) {
      const list = el('div.list.scroll');
      body.append(list);
      return () => {
        const state = app.game.state;
        const sub = state.subsidies || { offers: [], awarded: [] };
        const rows = [
          ...sub.offers.map((s) => ({ key: `o${s.id}`, s, months: s.expiresMonths, awarded: false })),
          ...sub.awarded.map((s) => ({ key: `a${s.id}`, s, months: s.remainingMonths, awarded: true })),
        ];
        listOrEmpty(list, rows, (r) => r.key,
          () => el('button.list-row', { type: 'button' }, el('span.name'), el('span.mono.num')),
          (row, r) => {
            const s = r.s;
            const c = CARGO_BY_ID[s.cargoId];
            row.title = 'Double-click: center view on the source';
            row.ondblclick = () => { const p = endpointPos(state, s.src); if (p) app.centerOn(p.x, p.y); };
            setText(row.children[0], `${c ? c.name : s.cargoId}: ${endpointName(state, s.src)} → ${endpointName(state, s.dst)}`);
            setText(row.children[1], r.awarded ? `x${s.multiplier} · ${r.months} mo` : `offer · ${r.months} mo`);
          });
      };
    },
  });
}
