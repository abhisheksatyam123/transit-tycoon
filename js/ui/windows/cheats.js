/**
 * Cheats window (OpenTTD cheat_gui.cpp / OpenLoco Cheats.cpp):
 * +10M money, clear debt, acquire company, change year, switch company, magic bulldozer, cheat flags.
 * Opened from Settings or Ctrl+Alt+C (hidden hotkey, as in OpenTTD). Using any cheat marks the game cheated
 * (state.cheated, lazy) and the company window shows it. Build while paused needs no toggle (TT never gates it).
 */
import { el } from '../dom.js';
import { money } from '../format.js';
import { moneyCheat, clearDebtCheat, acquireCompanyCheat, changeYearCheat, setMagicBulldozer, magicBulldozer, isCheated, MONEY_CHEAT_AMOUNT, setCheatFlag, cheatFlag, activeCompanyId } from '../../simulation/cheats.js';

/** @param {import('../app.js').App} app */
export function openCheats(app) {
  return app.wm.open('cheats', {
    title: 'Cheats',
    width: 340,
    build(body) {
      const state = () => app.game.state;
      const note = el('p.muted.small', { text: 'Cheats mark this game as cheated (shown in the Companies window). Nothing changes unless you use one.' });
      const moneyLine = el('p', { text: '' });
      const loanLine = el('p', { text: '' });
      const yearIn = /** @type {HTMLInputElement} */ (el('input.input', { type: 'number', 'aria-label': 'New year', value: String(state().date.year) }));
      const yearMsg = el('p.muted.small', { text: '' });
      const bull = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Magic bulldozer' }));
      const ratingBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Station ratings fixed at 100%' }));
      const jetBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'No jet crash' }));
      const crossBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Crossing tunnels' }));
      const prodBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Modify industry production' }));
      const status = el('p.muted.small', { text: '' });
      const cheatedLine = el('p.small', { text: '' });
      const switchSel = /** @type {HTMLSelectElement} */ (el('select.input', { 'aria-label': 'Switch company' }));
      const acquireSel = /** @type {HTMLSelectElement} */ (el('select.input', { 'aria-label': 'Acquire rival company' }));

      const rebuildLists = () => {
        const rivals = state().rivals || [];
        switchSel.replaceChildren(...[
          Object.assign(el('option', { value: '0', text: 'Company 1 (Player)' }), { }),
          ...rivals.map((r) => Object.assign(el('option', { value: String(r.id), text: `Rival ${r.id}: ${r.name || 'Competitor'}` }), {})),
        ]);
        switchSel.value = String(activeCompanyId(state()) || 0);

        const activeRivals = rivals.filter((r) => !r.bankrupt);
        acquireSel.replaceChildren(...[
          Object.assign(el('option', { value: '', text: activeRivals.length ? '-- Select rival --' : 'No rivals' }), {}),
          ...activeRivals.map((r) => Object.assign(el('option', { value: String(r.id), text: `Rival ${r.id}: ${r.name || 'Competitor'}` }), {})),
        ]);
      };

      switchSel.addEventListener('change', () => {
        const id = Number(switchSel.value) || 0;
        const r = app.game.switchCompany(id || null);
        status.textContent = r.ok ? (id ? 'Now controlling company ' + id + '.' : 'Back to player company.') : r.error;
        app.wm.updateAll();
        refresh();
      });

      const refresh = () => {
        const s = state();
        moneyLine.textContent = 'Company money: ' + money(s.company.money);
        loanLine.textContent = 'Company loan: ' + money(s.company.loan || 0);
        bull.checked = magicBulldozer(s);
        ratingBox.checked = cheatFlag(s, 'stationRating');
        jetBox.checked = cheatFlag(s, 'noJetCrash');
        crossBox.checked = cheatFlag(s, 'crossingTunnels');
        prodBox.checked = cheatFlag(s, 'setupProd');
        cheatedLine.textContent = isCheated(s) ? 'This game is marked as cheated.' : 'No cheat used in this game.';
        rebuildLists();
      };

      const plus = el('button.btn', { type: 'button', text: '+ ' + money(MONEY_CHEAT_AMOUNT), title: 'Add 10,000,000 to the company bank balance (OpenLoco addCash)' });
      plus.addEventListener('click', () => {
        const r = app.game.addCash(MONEY_CHEAT_AMOUNT);
        status.textContent = r.ok ? 'Added ' + money(MONEY_CHEAT_AMOUNT) + '.' : r.error;
        refresh();
      });

      const clearDebtBtn = el('button.btn', { type: 'button', text: 'Clear debt', title: 'Clear company loan/debt to 0 (OpenLoco clearLoan)' });
      clearDebtBtn.addEventListener('click', () => {
        const r = app.game.clearDebt();
        status.textContent = r.ok ? 'Loan cleared to 0.' : r.error;
        refresh();
      });

      const acquireBtn = el('button.btn', { type: 'button', text: 'Acquire', title: 'Acquire all assets of selected rival company (OpenLoco acquireAssets)' });
      acquireBtn.addEventListener('click', () => {
        const val = acquireSel.value;
        if (!val) { status.textContent = 'Please select a rival company to acquire.'; return; }
        const r = app.game.acquireCompany(Number(val));
        status.textContent = r.ok ? `Acquired rival company ${val}.` : r.error;
        app.wm.updateAll();
        refresh();
      });

      const setYear = el('button.btn', { type: 'button', text: 'Set year', title: 'Change the calendar year (clamped to the valid range)' });
      setYear.addEventListener('click', () => {
        const r = changeYearCheat(state(), Number(yearIn.value));
        if (!r.ok) { yearMsg.textContent = r.error; return; }
        yearIn.value = String(r.year);
        yearMsg.textContent = r.clamped ? 'Clamped to ' + r.year + '.' : 'Year is ' + r.year + '.';
        refresh();
      });

      bull.addEventListener('change', () => {
        setMagicBulldozer(state(), bull.checked);
        status.textContent = bull.checked ? 'Magic bulldozer on: demolish works on town houses, industries and objects.' : 'Magic bulldozer off.';
        refresh();
      });

      ratingBox.addEventListener('change', () => {
        setCheatFlag(state(), 'stationRating', ratingBox.checked);
        status.textContent = ratingBox.checked ? 'Station ratings are fixed at 100% for your stations.' : 'Station ratings back to normal.';
        refresh();
      });
      jetBox.addEventListener('change', () => {
        setCheatFlag(state(), 'noJetCrash', jetBox.checked);
        status.textContent = jetBox.checked ? 'Jets at short-strip airports will not crash.' : 'Jet crash rule back to normal.';
        refresh();
      });
      prodBox.addEventListener('change', () => {
        setCheatFlag(state(), 'setupProd', prodBox.checked);
        status.textContent = prodBox.checked ? 'Modify industry production on: production targets can be edited.' : 'Modify industry production off.';
        refresh();
      });
      crossBox.addEventListener('change', () => {
        setCheatFlag(state(), 'crossingTunnels', crossBox.checked);
        status.textContent = crossBox.checked ? 'Tunnels may cross each other underground.' : 'Crossing tunnels off.';
        refresh();
      });

      // OpenTTD CmdTownRating cheat helper: max out player ratings in all towns.
      const excellentBtn = el('button.btn', { type: 'button', text: 'Excellent town ratings', title: 'Set your rating to Excellent (+1000) in every town (marks game cheated)' });
      excellentBtn.addEventListener('click', () => {
        const g = app.game;
        const towns = g.state.towns || [];
        let n = 0;
        for (const t of towns) {
          const r = g.setTownRating(t.id, null, 1000);
          if (r.ok) n++;
        }
        // Ensure the game is marked cheated (setTownRating is a direct command; mark explicitly).
        if (towns.length) g.state.cheated = true;
        status.textContent = 'Set player rating to Excellent in ' + n + ' town' + (n === 1 ? '' : 's') + '.';
        refresh();
      });

      body.append(
        note,
        el('div.set-row', null, plus, moneyLine),
        el('div.set-row', null, clearDebtBtn, loanLine),
        el('div.set-row', null, el('label', { text: 'Acquire company ' }), acquireSel, acquireBtn),
        el('div.set-row', null, el('label', { text: 'Year ' }), yearIn, setYear, yearMsg),
        el('div.set-row', null, el('label', { text: 'Switch company ' }), switchSel, el('span.set-help.muted', { text: 'Control a rival company (OpenTTD switch_company cheat).' })),
        el('div.set-row', null, el('label', null, bull, el('span', { text: ' Magic bulldozer' })), el('span.set-help.muted', { text: 'Demolish anything, incl. town buildings and industries.' })),
        el('div.set-row', null, el('label', null, ratingBox, el('span', { text: ' Station ratings 100%' })), el('span.set-help.muted', { text: 'Your stations always rate 100% (OpenTTD station_rating cheat).' })),
        el('div.set-row', null, el('label', null, prodBox, el('span', { text: ' Modify industry production' })), el('span.set-help.muted', { text: 'Allow editing industry production targets (OpenTTD setup_prod cheat).' })),
        el('div.set-row', null, el('label', null, jetBox, el('span', { text: ' No jet crash' })), el('span.set-help.muted', { text: 'Jets landing at short-strip airports never crash (OpenTTD no_jetcrash).' })),
        el('div.set-row', null, el('label', null, crossBox, el('span', { text: ' Crossing tunnels' })), el('span.set-help.muted', { text: 'Allow tunnels to cross each other (OpenTTD crossing_tunnels).' })),
        el('div.set-row', null, excellentBtn, el('span.set-help.muted', { text: 'Your rating becomes Excellent (+1000) in all towns.' })),
        status, cheatedLine,
      );
      refresh();
      return () => { refresh(); };
    },
  });
}
