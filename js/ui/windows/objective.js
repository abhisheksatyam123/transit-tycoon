/**
 * Objective result dialog: shown when the scenario objective is won or lost.
 */
import { el } from '../dom.js';
import { describeObjective } from '../../simulation/objective.js';

/**
 * @param {import('../app.js').App} app
 */
export function openObjective(app) {
  const obj = app.game.state.objective;
  return app.wm.open('objective', {
    title: obj && obj.status === 'won' ? 'Objective achieved' : 'Objective failed',
    width: 340,
    build(body, win) {
      if (!obj) { body.append(el('p', { text: 'No objective.' })); return null; }
      const won = obj.status === 'won';
      body.append(
        el('p.lead', { text: won ? 'Congratulations! You completed the scenario objective.' : 'You did not reach the objective in time.' }),
        el('p.muted', { text: describeObjective(obj) }),
        el('div.btn-row', null,
          el('button.btn.primary', { type: 'button', text: 'Continue playing', onclick: () => win.close() }),
          el('button.btn', { type: 'button', text: 'New game', onclick: () => { win.close(); app.open('newGame'); } })));
      return null;
    },
  });
}
