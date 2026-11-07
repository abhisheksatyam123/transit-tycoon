/**
 * Build trees window (OpenTTD tree_gui.cpp BuildTreesWindow): tree-type buttons (Random + the species of
 * the current climate) and the planting mode (Normal / Forest small / Forest large). Opened by the Plant trees tool.
 */
import { el, setText } from '../dom.js';
import { plantOptions, setPlantOptions, PLANT_MODE_LABEL, treeTypeChoices } from '../tools/plantOptions.js';

const MODES = ['normal', 'forestSmall', 'forestLarge'];

/** Open (or focus) the tree picker. Refreshes the pressed buttons on each update tick. */
export function openPlantTrees(app) {
  return app.wm.open('plantTrees', {
    title: 'Build trees',
    width: 260,
    build(body) {
      const typeRow = el('div.btn-row');
      const modeRow = el('div.btn-row');
      const note = el('div.muted.small');
      const types = treeTypeChoices(app.game.state);
      const typeBtns = types.map((t) => el('button.btn', {
        type: 'button', text: t === undefined ? 'Random' : String(t + 1),
        title: t === undefined ? 'Random tree type' : `Tree type ${t + 1}`,
        onclick: () => { setPlantOptions(app, { tree: t }); sync(); },
      }));
      const modeBtns = MODES.map((m) => el('button.btn', {
        type: 'button', text: PLANT_MODE_LABEL[m],
        onclick: () => { setPlantOptions(app, { mode: m }); sync(); app.ui?.updateHint?.(); },
      }));
      typeRow.append(...typeBtns);
      modeRow.append(...modeBtns);
      body.append(el('div.muted.small', { text: 'Tree type' }), typeRow, el('div.muted.small', { text: 'Planting mode' }), modeRow, note);
      const sync = () => {
        const o = plantOptions(app);
        types.forEach((t, i) => typeBtns[i].classList.toggle('active', o.tree === t));
        MODES.forEach((m, i) => modeBtns[i].classList.toggle('active', o.mode === m));
        setText(note, o.mode === 'normal' ? 'Normal: drag an area over grass.' : 'Forest: click a tile to scatter trees around it.');
      };
      sync();
      return sync;
    },
  });
}
