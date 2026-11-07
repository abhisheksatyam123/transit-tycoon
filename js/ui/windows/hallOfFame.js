/**
 * Hall of fame (OpenTTD highscore_gui.cpp): the top-10 table per scenario, from this browser's
 * localStorage (see ../highscore.js). Opened from the main menu; no game state involved.
 */
import { el } from '../dom.js';
import { date, money } from '../format.js';
import { loadHighScores, reasonLabel, scenarioKey } from '../highscore.js';
import { scenarioTitle } from '../loading.js';

/**
 * @param {import('../app.js').App} app
 */
export function openHallOfFame(app) {
  return app.wm.open('hallOfFame', {
    title: 'Hall of fame',
    width: 520,
    build(body) {
      const all = loadHighScores();
      const current = app.game && app.game.state ? scenarioKey(app.game.state) : null;
      const keys = Object.keys(all).filter((k) => all[k].length);
      if (!keys.length) {
        body.appendChild(el('p.muted', { text: 'No finished games yet. Win or lose a scenario objective, or go bankrupt, and the result is recorded here.' }));
        return;
      }
      // the current game's scenario first, then the rest in name order
      keys.sort((a, b) => (a === current ? -1 : b === current ? 1 : a.localeCompare(b)));
      const tabs = el('div.btn-row');
      const host = el('div');
      const show = (key) => {
        host.replaceChildren();
        const table = el('table', { role: 'table' },
          el('thead', null, el('tr', null, ...['#', 'Company', 'Score', 'Value', 'Date', 'Result'].map((h) => el('th', { text: h })))));
        const tb = el('tbody');
        all[key].forEach((e, i) => {
          tb.appendChild(el('tr', null,
            el('td', { text: String(i + 1) }), el('td', { text: e.name }),
            el('td.mono', { text: String(e.score) }), el('td.mono', { text: money(e.value) }),
            el('td', { text: date(e.date) }), el('td', { text: reasonLabel(e.reason) })));
        });
        table.appendChild(tb);
        host.append(el('h3', { text: key === 'random' ? 'Random maps' : scenarioTitle(key) }), table);
      };
      for (const k of keys) {
        tabs.appendChild(el('button.btn', { type: 'button', text: k === 'random' ? 'Random maps' : scenarioTitle(k), onclick: () => show(k) }));
      }
      body.append(tabs, host);
      show(keys[0]);
    },
  });
}
