/**
 * Cheats window (OpenTTD cheat_gui.cpp, subset): +10M money, change year (clamped), magic bulldozer.
 * Opened from Settings or Ctrl+Alt+C (hidden hotkey, as in OpenTTD). Using any cheat marks the game cheated
 * (state.cheated, lazy) and the company window shows it. Build while paused needs no toggle (TT never gates it).
 */
import { el } from '../dom.js';
import { money } from '../format.js';
import { moneyCheat, changeYearCheat, setMagicBulldozer, magicBulldozer, isCheated, MONEY_CHEAT_AMOUNT, setCheatFlag, cheatFlag } from '../../simulation/cheats.js';

/** @param {import('../app.js').App} app */
export function openCheats(app) {
  return app.wm.open('cheats', {
    title: 'Cheats',
    width: 340,
    build(body) {
      const state = () => app.game.state;
      const note = el('p.muted.small', { text: 'Cheats mark this game as cheated (shown in the Companies window). Nothing changes unless you use one.' });
      const moneyLine = el('p', { text: '' });
      const yearIn = /** @type {HTMLInputElement} */ (el('input.input', { type: 'number', 'aria-label': 'New year', value: String(state().date.year) }));
      const yearMsg = el('p.muted.small', { text: '' });
      const bull = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Magic bulldozer' }));
      const ratingBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Station ratings fixed at 100%' }));
      const jetBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'No jet crash' }));
      const status = el('p.muted.small', { text: '' });
      const cheatedLine = el('p.small', { text: '' });

      const refresh = () => {
        const s = state();
        moneyLine.textContent = 'Company money: ' + money(s.company.money);
        bull.checked = magicBulldozer(s);
        ratingBox.checked = cheatFlag(s, 'stationRating');
        jetBox.checked = cheatFlag(s, 'noJetCrash');
        cheatedLine.textContent = isCheated(s) ? 'This game is marked as cheated.' : 'No cheat used in this game.';
      };

      const plus = el('button.btn', { type: 'button', text: '+ ' + money(MONEY_CHEAT_AMOUNT), title: 'Add 10,000,000 to the company bank balance' });
      plus.addEventListener('click', () => {
        const r = moneyCheat(state(), MONEY_CHEAT_AMOUNT);
        status.textContent = r.ok ? 'Added ' + money(MONEY_CHEAT_AMOUNT) + '.' : r.error;
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

      body.append(
        note,
        el('div.set-row', null, plus, moneyLine),
        el('div.set-row', null, el('label', { text: 'Year ' }), yearIn, setYear, yearMsg),
        el('div.set-row', null, el('label', null, bull, el('span', { text: ' Magic bulldozer' })), el('span.set-help.muted', { text: 'Demolish anything, incl. town buildings and industries.' })),
        el('div.set-row', null, el('label', null, ratingBox, el('span', { text: ' Station ratings 100%' })), el('span.set-help.muted', { text: 'Your stations always rate 100% (OpenTTD station_rating cheat).' })),
        el('div.set-row', null, el('label', null, jetBox, el('span', { text: ' No jet crash' })), el('span.set-help.muted', { text: 'Jets landing at short-strip airports never crash (OpenTTD no_jetcrash).' })),
        status, cheatedLine,
      );
      refresh();
      return () => { refresh(); };
    },
  });
}
