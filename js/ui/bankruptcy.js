/**
 * Bankruptcy UI (gap #36): "In trouble" warnings at 3 and 6 months in the red, and the game-over
 * window once the company is declared bankrupt (OpenTTD CompanyWindow "in trouble" / OpenLoco
 * Company.cpp). Pure UI: it only reads company state after each month; the simulation (companyManager)
 * still owns the counters and the bankrupt flag.
 */
import { el } from './dom.js';
import { kvGrid } from './windows/common.js';
import { money } from './format.js';
import { LOAN_STEP } from '../simulation/constants.js';

/** Remembers the last stage shown per company record (a new game/load makes a new record). */
const shown = new WeakMap();

/**
 * Which dialog (if any) the company's current state calls for.
 * @param {any} c company record
 * @returns {'bankrupt'|'warn3'|'warn6'|null}
 */
export function bankruptcyStage(c) {
  if (!c) return null;
  if (c.bankrupt) return 'bankrupt';
  if (c.numMonthsInTheRed === 3) return 'warn3';
  if (c.numMonthsInTheRed === 6) return 'warn6';
  return null;
}

/** Months left before bankruptcy at a warning stage (9 months in the red = bankrupt). */
export function monthsUntilBankrupt(months) {
  return Math.max(0, 9 - (months || 0));
}

/**
 * Check the company after a month and open the matching dialog once per stage.
 * Returns the stage that was opened, or null.
 * @param {import('./app.js').App} app
 * @returns {string|null}
 */
export function checkBankruptcy(app) {
  const c = app.game && app.game.state && app.game.state.company;
  if (!c) return null;
  if (!c.bankrupt && !(c.numMonthsInTheRed > 0)) { shown.delete(c); return null; }
  const stage = bankruptcyStage(c);
  if (!stage || shown.get(c) === stage) return null;
  shown.set(c, stage);
  if (stage === 'bankrupt') openGameOver(app);
  else openTrouble(app, stage);
  return stage;
}

/**
 * "In trouble" warning window.
 * @param {import('./app.js').App} app
 * @param {'warn3'|'warn6'} stage
 */
export function openTrouble(app, stage) {
  const months = stage === 'warn3' ? 3 : 6;
  return app.wm.open('bankruptWarning', {
    title: 'In trouble!',
    width: 380,
    className: 'trouble',
    build(body, win) {
      const c = app.game.state.company;
      body.appendChild(el('p.lead', { text: `${c.name} has been in the red for ${months} months.` }));
      body.appendChild(el('p.muted', {
        text: `If the balance stays below zero for ${monthsUntilBankrupt(months)} more months the company goes bankrupt and every vehicle is stopped.`,
      }));
      const set = kvGrid(body, ['Bank balance', 'Loan', 'Months in the red']);
      body.appendChild(el('h4.win-h', { text: 'How to recover' }));
      body.appendChild(el('ul.hint-list', null,
        el('li', { text: 'Repay part of the loan (interest is charged monthly).' }),
        el('li', { text: 'Sell vehicles that lose money (Vehicles window → Sell).' }),
        el('li', { text: 'Fix routes that run empty: check Finances and the Issues list.' })));
      const repay = el('button.btn.primary', { type: 'button', text: `Repay ${money(LOAN_STEP)}` });
      repay.onclick = () => { app.exec(app.game.repay(LOAN_STEP), { sound: 'click' }); refresh(); };
      body.appendChild(el('div.btn-row', null,
        repay,
        el('button.btn', { type: 'button', text: 'Finances', onclick: () => app.open('finances') }),
        el('button.btn', { type: 'button', text: 'Vehicles', onclick: () => app.open('vehicles') }),
        el('button.btn', { type: 'button', text: 'OK', onclick: () => win.close() })));
      const refresh = () => {
        const cc = app.game.state.company;
        set['Bank balance'](money(cc.money));
        set['Loan'](money(cc.loan));
        set['Months in the red'](String(cc.numMonthsInTheRed));
        repay.disabled = !(cc.loan > 0);
      };
      refresh();
      return refresh;
    },
  });
}

/**
 * Game-over window: the company is bankrupt; offer a new game or a load.
 * @param {import('./app.js').App} app
 */
export function openGameOver(app) {
  return app.wm.open('gameOver', {
    title: 'Bankrupt',
    width: 360,
    className: 'trouble',
    build(body, win) {
      const c = app.game.state.company;
      body.appendChild(el('p.lead', { text: `${c.name} has been declared bankrupt.` }));
      body.appendChild(el('p.muted', { text: `After ${c.numMonthsInTheRed} months in the red the company is closed. Its vehicles have been stopped.` }));
      const grid = el('div.kv-grid');
      grid.append(el('span.kv-label', { text: 'Bank balance' }), el('span.kv-value.mono', { text: money(c.money) }));
      grid.append(el('span.kv-label', { text: 'Loan' }), el('span.kv-value.mono', { text: money(c.loan) }));
      body.appendChild(grid);
      body.appendChild(el('div.btn-row', null,
        el('button.btn.primary', { type: 'button', text: 'New game', onclick: () => { win.close(); app.open('newGame'); } }),
        el('button.btn', { type: 'button', text: 'Load game', onclick: () => { win.close(); app.open('load'); } }),
        el('button.btn', { type: 'button', text: 'Keep watching', onclick: () => win.close() })));
    },
  });
}
