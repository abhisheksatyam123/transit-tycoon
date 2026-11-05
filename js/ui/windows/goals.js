/**
 * Goals window: the staged objectives of a scenario game, with progress bars and rewards.
 */
import { el, setText, clear } from '../dom.js';
import { money } from '../format.js';

/**
 * @param {import('../app.js').App} app
 */
export function openGoals(app) {
  return app.wm.open('goals', {
    title: 'Goals',
    width: 460,
    build(body) {
      const head = el('p.lead');
      const list = el('div.goal-list');
      body.append(head, list);
      let sig = '';
      return () => {
        const snap = app.game.goals();
        if (!snap.total || !snap.goals.length) {
          setText(head, 'Goals are set for scenario maps (e.g. Moscow). This is a random world: play freely.');
          clear(list);
          return;
        }
        const s = JSON.stringify(snap.goals.map((g) => [g.done, g.active, g.v, g.t]));
        if (s === sig) return;
        sig = s;
        setText(head, `${snap.completed} of ${snap.total} goals complete.`);
        clear(list);
        for (const g of snap.goals) {
          const pct = g.done ? 100 : Math.min(100, Math.round((g.v / g.t) * 100));
          const status = g.done ? 'Done' : g.active ? `${pct}%` : 'Locked';
          list.appendChild(el('div.goal-row' + (g.done ? '.done' : g.active ? '.active' : '.locked'), null,
            el('div.goal-head', null,
              el('b', { text: (g.done ? '✔ ' : '') + g.title }),
              el('span.mono.goal-reward', { text: (g.done ? 'paid ' : 'reward ') + money(g.reward) })),
            el('div.muted.small', { text: g.desc }),
            el('div.bar', null, el('div.bar-fill', { style: { width: pct + '%' } })),
            el('div.small.mono', { text: g.done ? 'Complete' : g.active ? `${status}  (${Math.round(Math.min(g.v, g.t))} / ${g.t})` : 'Locked until the previous goal is done' })));
        }
      };
    },
  });
}
