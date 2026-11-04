/**
 * Finances window: monthly ledger by type over the last 12 months, loan controls.
 */
import { el, setText, clear } from '../dom.js';
import { money, monthName } from '../format.js';
import { kvGrid } from './common.js';

const LOAN_STEP = 10000;
const TYPE_LABEL = { construction: 'Construction', vehicles: 'New vehicles', running: 'Running costs', income: 'Income', interest: 'Loan interest', property: 'Property upkeep' };

/**
 * @param {import('../app.js').App} app
 */
export function openFinances(app) {
  return app.wm.open('finances', {
    title: 'Finances',
    width: 620,
    build(body) {
      const set = kvGrid(body, ['Bank balance', 'Loan', 'Max loan', 'Interest (yearly)']);
      body.appendChild(el('div.btn-row', null,
        el('button.btn', { type: 'button', text: `Borrow ${money(LOAN_STEP)}`, onclick: () => app.exec(app.game.borrow(LOAN_STEP), { sound: 'income' }) }),
        el('button.btn', { type: 'button', text: `Repay ${money(LOAN_STEP)}`, onclick: () => app.exec(app.game.repay(LOAN_STEP), { sound: 'click' }) })));
      const tableWrap = el('div.table-wrap');
      body.appendChild(tableWrap);
      let sig = '';
      return () => {
        const c = app.game.state.company;
        set['Bank balance'](money(c.money));
        set['Loan'](money(c.loan));
        set['Max loan'](money(c.maxLoan));
        set['Interest (yearly)']('5%');
        const hist = (c.ledger.history || []).slice(-11);
        const cols = [...hist.map((h) => ({ label: `${monthName(h.month)} ${String(h.year).slice(2)}`, h })), { label: 'This month', h: c.ledger.current }];
        const s = JSON.stringify(cols.map((x) => [x.h.income, x.h.expenses, x.h.byType]));
        if (s === sig) return;
        sig = s;
        const types = new Set(Object.keys(TYPE_LABEL));
        for (const col of cols) for (const k of Object.keys(col.h.byType || {})) types.add(k);
        const table = el('table.ledger');
        table.appendChild(el('tr', null, el('th', { text: '' }), cols.map((col) => el('th', { text: col.label }))));
        for (const t of types) {
          table.appendChild(el('tr', null, el('td.lbl', { text: TYPE_LABEL[t] || t }),
            cols.map((col) => {
              const v = (col.h.byType || {})[t] || 0;
              const signed = t === 'income' ? v : -v;
              return el('td.mono' + (signed < 0 ? '.neg' : signed > 0 ? '.pos' : ''), { text: v ? money(signed) : '—' });
            })));
        }
        table.appendChild(el('tr.total', null, el('td.lbl', { text: 'Net' }), cols.map((col) => {
          const n = (col.h.income || 0) - (col.h.expenses || 0);
          return el('td.mono' + (n < 0 ? '.neg' : '.pos'), { text: money(n) });
        })));
        const scroll = tableWrap.scrollLeft;
        clear(tableWrap);
        tableWrap.appendChild(table);
        tableWrap.scrollLeft = scroll || tableWrap.scrollWidth;
      };
    },
  });
}
