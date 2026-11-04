/**
 * Save / Load windows: localStorage slots 1-3 (+ autosave when loading), JSON export/import.
 */
import { el, setText } from '../dom.js';
import { saveToSlot, loadSlotData, slotMeta, exportToFile, importFromFile } from '../storage.js';
import { date, money } from '../format.js';

const SLOTS = ['1', '2', '3'];

/**
 * Description of a slot's contents.
 * @param {string} slot
 * @returns {string}
 */
function describe(slot) {
  const m = slotMeta(slot);
  if (!m) return 'Empty';
  const when = new Date(m.savedAt).toLocaleString();
  return `${date(m.date)} · ${money(m.money)} · saved ${when}`;
}

/**
 * @param {import('../app.js').App} app
 */
export function openSave(app) {
  return app.wm.open('save', {
    title: 'Save Game',
    width: 380,
    build(body) {
      SLOTS.forEach((slot) => {
        const d = el('span.muted.small');
        const b = el('button.btn', { type: 'button', text: `Slot ${slot}`, onclick: () => {
          const r = saveToSlot(slot, app.game);
          if (app.exec(r, { quiet: true, sound: 'click' })) app.toast(`Saved to slot ${slot}`, 'good');
          setText(d, describe(slot));
        } });
        setText(d, describe(slot));
        body.appendChild(el('div.slot-row', null, b, d));
      });
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Export JSON file', onclick: () => exportToFile(app.game) })));
    },
  });
}

/**
 * @param {import('../app.js').App} app
 */
export function openLoad(app) {
  return app.wm.open('load', {
    title: 'Load Game',
    width: 380,
    build(body, win) {
      for (const slot of ['autosave', ...SLOTS]) {
        const meta = slotMeta(slot);
        const b = el('button.btn', { type: 'button', text: slot === 'autosave' ? 'Autosave' : `Slot ${slot}`, disabled: !meta, onclick: () => {
          const d = loadSlotData(slot);
          if (d && app.loadFromString(d)) win.close();
        } });
        body.appendChild(el('div.slot-row', null, b, el('span.muted.small', { text: describe(slot) })));
      }
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Import JSON file…', onclick: async () => {
        const text = await importFromFile();
        if (text && app.loadFromString(text)) win.close();
      } })));
    },
  });
}
