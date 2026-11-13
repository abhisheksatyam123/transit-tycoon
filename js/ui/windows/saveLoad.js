/**
 * Save / Load windows: localStorage slots 1-3 (+ autosave when loading), JSON export/import.
 */
import { el, setText } from '../dom.js';
import { saveToSlot, readSlot, slotPresence, slotMeta, deleteSlot, exportToFile, importFromFile } from '../storage.js';
import { unlockAutosaveSlot } from '../autosaveGuard.js';
import { date, money } from '../format.js';
import { AUTOSAVE_SLOTS, autosaveLabel } from '../autosavePrefs.js';
import { confirmDiscardGame, confirmOverwriteSlot } from '../discardGuard.js';

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
 * OpenTTD SaveLoadWindow: the game is paused while the save/load dialog is open (PauseMode::SaveLoad) and
 * resumes at the previous speed when it closes (unless the player changed the speed meanwhile).
 * @param {import('../app.js').App} app
 */
function pauseWhileOpen(app) {
  let resume = 0;
  return {
    pause() { if (app.speed > 0) { resume = app.speed; app.setSpeed(0); } },
    onClose() { if (resume && app.speed === 0) app.setSpeed(resume); resume = 0; },
  };
}

/**
 * @param {import('../app.js').App} app
 */
export function openSave(app) {
  const p = pauseWhileOpen(app);
  return app.wm.open('save', {
    title: 'Save Game',
    width: 380,
    onClose: p.onClose,
    build(body) {
      p.pause();
      SLOTS.forEach((slot) => {
        const d = el('span.muted.small');
        const save = el('button.btn', { type: 'button', text: `Slot ${slot}`, onclick: () => {
          if (slotMeta(slot) && !confirmOverwriteSlot(slot)) return; // an occupied slot is never replaced silently
          const r = saveToSlot(slot, app.game);
          if (app.exec(r, { quiet: true, sound: 'click' })) {
            unlockAutosaveSlot(); // an explicit manual save is allowed to re-enable autosave writes
            app.toast(`Saved to slot ${slot}`, 'good');
            app.wm.close('save'); // OpenTTD closes the save dialog after a successful save
            return;
          }
          setText(d, describe(slot));
        } });
        const del = el('button.btn', { type: 'button', text: 'Delete', disabled: !slotMeta(slot), title: 'Delete this save slot', onclick: () => {
          if (!slotMeta(slot)) return;
          if (!confirm(`Delete save slot ${slot}?`)) return;
          deleteSlot(slot);
          setText(d, describe(slot));
          del.disabled = true;
        } });
        setText(d, describe(slot));
        body.appendChild(el('div.slot-row', null, save, del, d));
      });
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Export JSON file', onclick: () => exportToFile(app.game) })));
    },
  });
}

/**
 * @param {import('../app.js').App} app
 */
export function openLoad(app) {
  const p = pauseWhileOpen(app);
  return app.wm.open('load', {
    title: 'Load Game',
    width: 380,
    onClose: p.onClose,
    build(body, win) {
      p.pause();
      for (const slot of ['autosave', ...AUTOSAVE_SLOTS, ...SLOTS]) {
        // cheap presence check only: decoding every payload here blocks the main thread on large saves
        const presence = slotPresence(slot);
        const meta = presence.meta;
        const corrupt = presence.state === 'meta-only';
        const isManual = SLOTS.includes(slot);
        const text = slot === 'autosave' ? 'Autosave' : AUTOSAVE_SLOTS.includes(slot) ? autosaveLabel(slot) : `Slot ${slot}`;
        const load = el('button.btn', { type: 'button', text, disabled: presence.state === 'empty', onclick: async () => {
          if (!confirmDiscardGame(app.game)) return;
          // read fresh: an autosave may have been written after this window opened (pause saves run in idle time)
          const fresh = readSlot(slot);
          if (fresh.status !== 'ok') {
            // meta exists but the payload is missing/unreadable: say so instead of doing nothing
            const label = slot === 'autosave' ? 'Autosave' : `Save slot ${slot}`;
            app.toast(`${label} is corrupt`, 'error', true);
            return;
          }
          if (await app.loadFromString(fresh.data)) win.close();
        } });
        const desc = el('span.muted.small', { text: corrupt ? 'Corrupt save — delete it or save over it' : describe(slot) });
        const row = el('div.slot-row', null, load);
        if (isManual || corrupt) { // a corrupt autosave/ring slot can be cleared too (it would otherwise repeat each boot)
          const del = el('button.btn', { type: 'button', text: 'Delete', disabled: !meta, title: 'Delete this save slot', onclick: () => {
            if (!slotMeta(slot)) return;
            if (!confirm(`Delete save slot ${slot}?`)) return;
            deleteSlot(slot);
            load.disabled = true;
            del.disabled = true;
            setText(desc, describe(slot));
          } });
          row.appendChild(del);
        }
        row.appendChild(desc);
        body.appendChild(row);
      }
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Import JSON file…', onclick: async () => {
        if (!confirmDiscardGame(app.game)) return;
        const text = await importFromFile();
        if (text && await app.loadFromString(text)) win.close();
      } })));
    },
  });
}
