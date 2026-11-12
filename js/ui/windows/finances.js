/**
 * Finances window: monthly ledger by type over the last 12 months, loan controls.
 */
import { el, setText, clear } from '../dom.js';
import { money, monthName } from '../format.js';
import { kvGrid } from './common.js';
import { openRename } from '../rename.js';
import { openCompanyInfrastructure } from './companyInfrastructure.js';
import { getSetting } from '../../simulation/settings.js';
import { maxLoanCap, REVENUE_KINDS } from '../../simulation/economy.js';

const LOAN_STEP = 10000;
const TYPE_LABEL = { construction: 'Construction', vehicles: 'New vehicles', running: 'Running costs', income: 'Income', interest: 'Loan interest', property: 'Property upkeep', infrastructure: 'Infrastructure maintenance' };
const KIND_LABEL = { train: 'Train', tram: 'Tram', bus: 'Bus', truck: 'Truck', ship: 'Ship', aircraft: 'Aircraft' };

/** View periods offered above the ledger; Monthly is the default (the existing 12-month view). */
export const FINANCE_PERIODS = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];
export const DEFAULT_FINANCE_PERIOD = 'monthly';
const QUARTER_COLUMNS = 8;
const YEAR_COLUMNS = 4;

/** Yearly loan interest shown in the window: the live loanInterestRate setting as a percent (default 5%). */
export function interestLabel(state) {
  return `${Number(getSetting(state, 'loanInterestRate'))}%`;
}

/** Own value (OpenTTD company_gui.cpp ~371-379): bank balance minus loan. */
export function ownValue(company) {
  return company.money - company.loan;
}

/** Borrow amount for "Max borrow": loan up to cap (default company.maxLoan; pass maxLoanCap(state, company) for the live limit), in whole LOAN_STEP increments (borrow() rounds up). */
export function maxBorrowAmount(company, cap = company.maxLoan) {
  return Math.max(0, Math.floor((cap - company.loan) / LOAN_STEP) * LOAN_STEP);
}

/** Repay amount for "Max repay": the whole loan when cash covers it, else as far as cash allows in LOAN_STEP increments. */
export function maxRepayAmount(company) {
  if (company.money >= company.loan) return company.loan;
  return Math.max(0, Math.floor(company.money / LOAN_STEP) * LOAN_STEP);
}

/**
 * Category subtotals of one ledger month (OpenTTD company_gui.cpp _expenses_list_revenue / _operating_costs /
 * _capital_costs). Revenue = income; operating = running costs, loan interest, property and infrastructure upkeep
 * (OpenTTD charges infrastructure maintenance as ExpensesType::Property, economy.cpp:650); capital = construction and
 * new vehicles. Values are in the table's own sign convention: expenses positive, as stored in byType.
 */
export function categoryTotals(byType) {
  const b = byType || {};
  const v = (t) => Number(b[t] || 0);
  return {
    revenue: v('income'),
    operating: v('running') + v('interest') + v('property') + v('infrastructure'),
    capital: v('construction') + v('vehicles'),
  };
}

/** Calendar quarter of a 0-based month index: Jan-Mar = 1 ... Oct-Dec = 4 (aligned with gameLoop's Jan/Apr/Jul/Oct). */
export function quarterOf(month) {
  const m = Math.trunc(Number(month) || 0);
  return Math.floor(Math.max(0, Math.min(11, m)) / 3) + 1;
}

/**
 * Bucket monthly ledger entries (oldest first, `{year, month, income, expenses, byType}`) into calendar
 * quarters. Values are summed as stored (expenses positive, income positive). A bucket with fewer than three
 * months, or containing the in-progress month (`current: true`), is marked partial. Pure: the input is not mutated.
 */
export function groupQuarters(entries) {
  const buckets = new Map();
  for (const e of entries || []) {
    if (!e) continue;
    const year = Number(e.year) || 0;
    const quarter = quarterOf(e.month);
    const key = `${year}-${quarter}`;
    let b = buckets.get(key);
    if (!b) { b = { year, quarter, income: 0, expenses: 0, byType: {}, months: 0, partial: false }; buckets.set(key, b); }
    b.income += Number(e.income) || 0;
    b.expenses += Number(e.expenses) || 0;
    for (const [k, v] of Object.entries(e.byType || {})) {
      const n = Number(v) || 0;
      if (n) b.byType[k] = (b.byType[k] || 0) + n;
    }
    // sparse per-vehicle-type revenue (D7 Phase 2): only months written after a delivery carry it
    if (e.byKind) {
      b.byKind ||= {};
      for (const [k, v] of Object.entries(e.byKind)) {
        const n = Number(v) || 0;
        if (n) b.byKind[k] = (b.byKind[k] || 0) + n;
      }
    }
    b.months++;
    if (e.current) b.current = true;
  }
  const out = [...buckets.values()].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  for (const b of out) b.partial = b.months < 3 || !!b.current;
  return out;
}

/**
 * One year of `company.expenditures` in the ledger's byType shape: signed expenditure amounts are flipped for
 * display (income stays positive, costs become positive expenses). Missing/zero keys are omitted.
 */
function expenditureByType(exp) {
  const out = {};
  for (const [k, v] of Object.entries(exp || {})) {
    const n = Number(v) || 0;
    if (!n) continue;
    out[k] = k === 'income' ? n : -n;
  }
  return out;
}

/**
 * Yearly columns from `company.expenditures` (index 0 = current year, oldest last). Returns oldest-first
 * `{label, title, year, income, expenses, byType}` columns; the newest is labelled "This year". `expenses`
 * follows the ledger convention (positive cost total), so `income - expenses` is the year's net.
 */
export function yearColumns(expenditures, currentYear, max = YEAR_COLUMNS) {
  const exps = Array.isArray(expenditures) && expenditures.length ? expenditures : [{}];
  const n = Math.max(1, Math.min(exps.length, max));
  const base = Number(currentYear);
  const year = Number.isFinite(base) ? base : 0;
  const cols = [];
  for (let i = n - 1; i >= 0; i--) {
    const byType = expenditureByType(exps[i]);
    const income = Number(byType.income) || 0;
    let expenses = 0;
    for (const [k, v] of Object.entries(byType)) if (k !== 'income') expenses += Number(v) || 0;
    const y = year - i;
    cols.push({ label: i === 0 ? 'This year' : String(y), title: i === 0 ? `Current year (${y})` : String(y), year: y, income, expenses, byType });
  }
  return cols;
}

/**
 * @param {import('../app.js').App} app
 */
export function openFinances(app) {
  return app.wm.open('finances', {
    title: 'Finances',
    width: 620,
    build(body, win) {
      const set = kvGrid(body, ['Bank balance', 'Loan', 'Own value', 'Max loan', 'Interest (yearly)']);
      body.appendChild(el('div.btn-row', null,
        el('button.btn', { type: 'button', text: `Borrow ${money(LOAN_STEP)}`, onclick: () => app.exec(app.game.borrow(LOAN_STEP), { sound: 'income' }) }),
        el('button.btn', { type: 'button', text: `Repay ${money(LOAN_STEP)}`, onclick: () => app.exec(app.game.repay(LOAN_STEP), { sound: 'click' }) }),
        el('button.btn', { type: 'button', text: 'Max borrow', onclick: () => app.exec(app.game.borrow(maxBorrowAmount(app.game.state.company, maxLoanCap(app.game.state, app.game.state.company))), { sound: 'income' }) }),
        el('button.btn', { type: 'button', text: 'Max repay', onclick: () => app.exec(app.game.repay(maxRepayAmount(app.game.state.company)), { sound: 'click' }) }),
        el('button.btn', { type: 'button', text: 'Rename company…', onclick: () => openRename(app, 'company') }),
        el('button.btn', { type: 'button', title: 'Owned infrastructure and its monthly maintenance (OpenTTD Infrastructure button)', text: 'Infrastructure', onclick: () => openCompanyInfrastructure(app) })));
      const autoBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
      autoBox.addEventListener('change', () => { app.exec(app.game.setLoanAutopay(autoBox.checked), { sound: 'click' }); });
      body.appendChild(el('div.btn-row', null, el('label.small', { title: 'Repay the loan from cash every day while cash is positive' }, autoBox, ' Loan autopay')));
      let period = DEFAULT_FINANCE_PERIOD;
      let sig = '';
      const tabs = el('div.btn-row', { style: { marginTop: '0' } });
      const tabBtns = {};
      for (const [key, label] of FINANCE_PERIODS) {
        tabBtns[key] = el('button.btn.sm', { type: 'button', text: label, onclick: () => {
          if (period === key) return;
          period = key;
          sig = '';
          refresh();
        } });
        tabs.appendChild(tabBtns[key]);
      }
      body.appendChild(tabs);
      const tableWrap = el('div.table-wrap');
      body.appendChild(tableWrap);
      const refresh = () => {
        for (const k of Object.keys(tabBtns)) tabBtns[k].classList.toggle('active', k === period);
        const c = app.game.state.company;
        win.setTitle(c.name ? `Finances · ${c.name}` : 'Finances');
        set['Bank balance'](money(c.money));
        set['Loan'](money(c.loan));
        set['Own value'](money(ownValue(c)));
        set['Max loan'](money(maxLoanCap(app.game.state, c)));
        set['Interest (yearly)'](interestLabel(app.game.state));
        autoBox.checked = !!c.autopayLoan;
        let cols;
        if (period === 'quarterly') {
          // history has only completed months; append the in-progress month so the current quarter is included
          const date = app.game.state.date;
          const entries = [...(c.ledger.history || []), { ...c.ledger.current, year: date.year, month: date.month, current: true }];
          const quarters = groupQuarters(entries).slice(-QUARTER_COLUMNS);
          cols = quarters.map((q) => ({
            label: `Q${q.quarter} ${String(q.year).slice(2)}${q.partial ? '*' : ''}`,
            title: q.partial ? 'Partial quarter: not all months recorded' : '',
            h: q,
          }));
        } else if (period === 'yearly') {
          cols = yearColumns(c.expenditures, app.game.state.date.year);
        } else {
          const hist = (c.ledger.history || []).slice(-11);
          cols = [...hist.map((h) => ({ label: `${monthName(h.month)} ${String(h.year).slice(2)}`, h })), { label: 'This month', h: c.ledger.current }];
        }
        const s = period + '|' + JSON.stringify(cols.map((x) => [x.label, x.h.income, x.h.expenses, x.h.byType, x.h.byKind]));
        if (s === sig) return;
        sig = s;
        const types = new Set(Object.keys(TYPE_LABEL));
        for (const col of cols) for (const k of Object.keys(col.h.byType || {})) types.add(k);
        const table = el('table.ledger');
        const cats = cols.map((col) => categoryTotals(col.h.byType));
        table.appendChild(el('tr', null, el('th', { text: '' }), cols.map((col) => el('th', { text: col.label, title: col.title }))));
        for (const t of types) {
          // infrastructure maintenance row only once a month was charged (setting on): default games keep their table
          if (t === 'infrastructure' && cols.every((col) => !(col.h.byType || {})[t])) continue;
          table.appendChild(el('tr', null, el('td.lbl', { text: TYPE_LABEL[t] || t }),
            cols.map((col) => {
              const v = (col.h.byType || {})[t] || 0;
              const signed = t === 'income' ? v : -v;
              return el('td.mono' + (signed < 0 ? '.neg' : signed > 0 ? '.pos' : ''), { text: v ? money(signed) : '—' });
            })));
        }
        // category subtotals (OpenTTD Revenue / Operating Expenses / Capital Expenses totals), same signs as the rows above
        const subtotals = [['Total revenue', (k) => k.revenue], ['Total operating expenses', (k) => -k.operating], ['Total capital expenses', (k) => -k.capital]];
        for (const [label, pick] of subtotals) {
          table.appendChild(el('tr', null, el('td.lbl', { text: label }), cats.map((k) => {
            const v = pick(k);
            return el('td.mono' + (v < 0 ? '.neg' : v > 0 ? '.pos' : ''), { text: v ? money(v) : '—' });
          })));
        }
        // D7 Phase 2: per-vehicle-type revenue, shown only when the displayed columns carry a byKind breakdown.
        // Old months (or yearly columns, which come from expenditures) show nothing here; their revenue is the
        // "Unattributed" row when some other column has a breakdown.
        const kindCols = cols.map((col) => col.h.byKind || {});
        if (kindCols.some((b) => Object.keys(b).length)) {
          const kindCell = (v) => el('td.mono' + (v > 0 ? '.pos' : ''), { text: v ? money(v) : '—' });
          table.appendChild(el('tr.kind-head', null, el('th', { text: 'Revenue by vehicle type', colspan: cols.length + 1 })));
          for (const k of REVENUE_KINDS) {
            table.appendChild(el('tr', null, el('td.lbl', { text: KIND_LABEL[k] }), kindCols.map((b) => kindCell(Number(b[k]) || 0))));
          }
          const unattributed = cols.map((col, i) => {
            const sum = Object.values(kindCols[i]).reduce((a, v) => a + (Number(v) || 0), 0);
            return (Number(col.h.income) || 0) - sum;
          });
          if (unattributed.some((v) => v)) {
            table.appendChild(el('tr', null, el('td.lbl', { title: 'Revenue from months without a vehicle-type breakdown (old saves or non-delivery income)' }, 'Unattributed'),
              unattributed.map(kindCell)));
          }
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
      return refresh;
    },
  });
}
