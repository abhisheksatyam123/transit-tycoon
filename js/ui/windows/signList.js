/**
 * Sign list window (OpenTTD signs_gui.cpp): all signs sorted by text, with a text filter. Click a row to
 * centre the main view on the sign; Rename opens the sign prompt; Delete removes the sign via the
 * existing deleteSign command. Filter and sort direction are window UI state only.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { filterSigns, makeSortMemo } from './listSort.js';
import { openSignPrompt } from '../tools/sign.js';

/**
 * @param {import('../app.js').App} app
 */
export function openSignList(app) {
  const state = { sort: 'text', dir: 1, filter: '' };
  return app.wm.open('signs', {
    title: 'Signs',
    width: 340,
    build(body) {
      const total = el('div.muted');
      const filterIn = /** @type {HTMLInputElement} */ (el('input.input', { type: 'search', placeholder: 'Filter signs…', 'aria-label': 'Filter signs', title: 'Filter by text' }));
      const dirBtn = /** @type {HTMLButtonElement} */ (el('button.btn.sm', { type: 'button', title: 'Toggle ascending / descending' }));
      const paintDir = () => { dirBtn.textContent = state.dir < 0 ? 'Z→A' : 'A→Z'; };
      paintDir();
      filterIn.oninput = () => { state.filter = filterIn.value; app.wm.updateAll(); };
      dirBtn.onclick = () => { state.dir = -state.dir; paintDir(); app.wm.updateAll(); };
      const bar = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } }, filterIn, dirBtn);
      const list = el('div.list.scroll');
      const memo = makeSortMemo((xs) => filterSigns(xs, state), (s) => [s.text || '']);
      body.append(bar, total, list);
      return () => {
        const all = app.game.state.signs || [];
        const sigFilter = state.filter.trim().toLowerCase();
        const shown = memo(all, `${state.dir}:${sigFilter}`);
        setText(total, sigFilter ? `${shown.length} of ${all.length} signs` : `${all.length} signs`);
        listOrEmpty(list, shown, (s) => s.id,
          () => {
            const jump = el('button.list-row.sign-jump', { type: 'button', title: 'Jump to sign' }, el('span.name'));
            const move = el('button.btn.sm', { type: 'button', text: 'Move to center', title: 'Move sign to viewport center' });
            const rename = el('button.btn.sm', { type: 'button', text: 'Rename', title: 'Edit the sign text (empty deletes)' });
            const del = el('button.btn.sm.danger', { type: 'button', text: 'Delete', title: 'Delete this sign' });
            return el('div.sign-row', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, jump, move, rename, del);
          },
          (row, s) => {
            const [jump, move, rename, del] = row.children;
            setText(jump.firstChild, s.text);
            // handlers are reassigned on every update: rows are reused across refreshes
            jump.onclick = () => app.centerOn(s.x, s.y);
            move.onclick = () => {
              const target = app.camera.centerTile();
              if (app.exec(app.game.moveSign(s.id, target.x, target.y), { sound: 'click' })) {
                app.wm.updateAll();
              }
            };
            rename.onclick = () => openSignPrompt(app, { id: s.id, x: s.x, y: s.y });
            del.onclick = () => { app.exec(app.game.deleteSign(s.id), { sound: 'click' }); app.wm.updateAll(); };
          }, sigFilter ? 'No signs match the filter' : 'No signs yet — place one with the Sign tool');
      };
    },
  });
}
