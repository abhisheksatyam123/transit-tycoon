/**
 * Goals window: the staged objectives of a scenario game, with progress bars and rewards.
 */
import { el, setText, clear } from '../dom.js';
import { money } from '../format.js';
import { OBJECTIVE_TYPES, describeObjective, monthsElapsed } from '../../simulation/objective.js';

/**
 * @param {import('../app.js').App} app
 */
export function openGoals(app) {
  return app.wm.open('goals', {
    title: 'Goals',
    width: 460,
    build(body) {
      const objBox = el('div.goal-row.active');
      const head = el('p.lead');
      const list = el('div.goal-list');
      body.append(objBox, head, list);
      let sig = '';
      let objSig = '';
      const updateObjective = () => {
        const st = app.game.state;
        const o = st.objective;
        const k = o ? JSON.stringify([o.status, Math.round(o.progress), monthsElapsed(st, o)]) : '';
        if (k === objSig) return;
        objSig = k;
        clear(objBox);
        objBox.style.display = o ? '' : 'none';
        if (!o) return;
        const def = OBJECTIVE_TYPES[o.type];
        const fmt = (n) => (def.unit === 'money' ? money(n) : Math.round(n).toLocaleString('en-US'));
        const pct = Math.max(0, Math.min(100, Math.round((o.progress / o.target) * 100)));
        const left = o.timeLimitYears ? Math.max(0, o.timeLimitYears * 12 - monthsElapsed(st, o)) : null;
        objBox.append(
          el('div.goal-head', null, el('b', { text: 'Objective: ' + def.label }),
            el('span.mono.goal-reward', { text: o.status === 'won' ? 'ACHIEVED' : o.status === 'lost' ? 'FAILED' : left === null ? 'no limit' : `${Math.floor(left / 12)}y ${left % 12}m left` })),
          el('div.muted.small', { text: describeObjective(o) }),
          el('div.bar', null, el('div.bar-fill', { style: { width: pct + '%' } })),
          el('div.small.mono', { text: `${fmt(o.progress)} / ${fmt(o.target)}  (${pct}%)` }));
      };
      return () => {
        updateObjective();
        const snap = app.game.goals();
        if (!snap.total || !snap.goals.length) {
          setText(head, 'Goals are set for scenario maps (e.g. Moscow). This is a random world: play freely.');
          clear(list);
          return;
        }
        if (snap.goals[0].hint !== undefined) { // random-world tutorial list
          const rk = JSON.stringify(snap.goals.map((g) => [g.done, g.active, Math.round(g.v), g.t]));
          if (rk === sig) return;
          sig = rk;
          setText(head, `${snap.completed} of ${snap.total} steps complete. Goal completions are announced in the news.`);
          clear(list);
          for (const g of snap.goals) {
            const fmt = (n) => (g.unit === '$' ? money(n) : Math.round(Math.min(n, g.t)).toLocaleString('en-US'));
            const pct = g.done ? 100 : Math.min(100, Math.round((g.v / g.t) * 100));
            const prog = g.done ? 'Complete' : `${fmt(g.v)} / ${fmt(g.t)}${g.unit && g.unit !== '$' ? ' ' + g.unit : ''}`;
            list.appendChild(el('div.goal-row' + (g.done ? '.done' : g.active ? '.active' : '.locked'), null,
              el('div.goal-head', null, el('b', { text: (g.done ? '✔ ' : '') + g.title })),
              el('div.muted.small', { text: g.hint }),
              el('div.bar', null, el('div.bar-fill', { style: { width: pct + '%' } })),
              el('div.small.mono', { text: g.done ? 'Done' : g.active ? prog : 'Locked until the previous step is done' })));
          }
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
