/**
 * Vehicle list window: every vehicle with state and profit this/last year.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { listOrEmpty } from './common.js';

/** Human label + css class for a vehicle state. */
export const STATE_LABEL = {
  depot: 'In depot', running: 'Running', loading: 'Loading', stopped: 'Stopped', broken: 'Broken down', lost: 'Lost',
};

/**
 * @param {import('../app.js').App} app
 */
export function openVehicleList(app) {
  return app.wm.open('vehicles', {
    title: 'Vehicles',
    width: 440,
    build(body) {
      const summary = el('div.muted');
      const head = el('div.table-head', null, el('span', { text: 'Vehicle' }), el('span', { text: 'State' }), el('span', { text: 'This year' }), el('span', { text: 'Last year' }), el('span'));
      const list = el('div.list.scroll.table');
      body.append(summary, head, list);
      return () => {
        const vs = app.game.state.vehicles;
        let p = 0;
        for (const v of vs) p += v.profitThisYear || 0;
        setText(summary, `${vs.length} vehicle(s) · profit this year ${money(p)}`);
        listOrEmpty(list, vs, (v) => v.id,
          (v) => el('div.table-row', null,
            el('button.link', { type: 'button', onclick: () => app.open('vehicle', v.id) }),
            el('span.state'), el('span.mono.num'), el('span.mono.num'),
            el('button.btn.sm', { type: 'button', text: 'Follow', title: 'Follow with camera', onclick: () => { app.follow(v.id); } })),
          (row, v) => {
            const c = row.children;
            setText(c[0], v.name);
            setText(c[1], STATE_LABEL[v.state] || v.state);
            c[1].className = 'state st-' + v.state;
            setText(c[2], money(v.profitThisYear));
            c[2].classList.toggle('neg', v.profitThisYear < 0);
            setText(c[3], money(v.profitLastYear));
            c[3].classList.toggle('neg', v.profitLastYear < 0);
          }, 'No vehicles yet — build a depot and buy one');
      };
    },
  });
}
