/**
 * Save-game storage in localStorage (slots '1'..'3' and 'autosave') + JSON file export/import.
 * Each slot stores {meta:{date,money,savedAt,seed}, data:string(serialized game)}.
 */

import { compress, decompress } from './lz.js';

const PREFIX = 'tt.save.';
const ZPREFIX = 'Z1:';

/** Decode a raw slot value (compressed 'Z1:' or legacy plain JSON). */
function decodeRaw(raw) {
  return JSON.parse(raw.startsWith(ZPREFIX) ? decompress(raw.slice(ZPREFIX.length)) : raw);
}

/**
 * Write a slot.
 * @param {string} slot
 * @param {any} game Game instance
 * @returns {{ok:boolean,quota?:boolean,error?:string}}
 */
export function saveToSlot(slot, game) {
  try {
    const s = game.state;
    const meta = { date: s.date, money: s.company.money, savedAt: Date.now(), seed: s.seed };
    const packed = ZPREFIX + compress(JSON.stringify({ meta, data: game.serialize() }));
    localStorage.setItem(PREFIX + slot, packed);
    // small meta copy so the slot list never decompresses big saves
    try { localStorage.setItem(PREFIX + slot + ':meta', JSON.stringify(meta)); } catch { /* ignore */ }
    return { ok: true };
  } catch (err) {
    const quota = !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
    return { ok: false, quota, error: quota ? 'Save too large for browser storage' : 'Save failed: ' + (err && err.message ? err.message : err) };
  }
}

/**
 * Read a slot's serialized game string.
 * @param {string} slot
 * @returns {string|null}
 */
export function loadSlotData(slot) {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    return decodeRaw(raw).data || null;
  } catch {
    return null;
  }
}

/**
 * Slot metadata (or null when empty).
 * @param {string} slot
 * @returns {{date:any,money:number,savedAt:number,seed:number}|null}
 */
export function slotMeta(slot) {
  try {
    const small = localStorage.getItem(PREFIX + slot + ':meta');
    if (small) return JSON.parse(small);
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    return decodeRaw(raw).meta || null;
  } catch {
    return null;
  }
}

/**
 * Delete a slot.
 * @param {string} slot
 */
export function deleteSlot(slot) {
  try { localStorage.removeItem(PREFIX + slot); localStorage.removeItem(PREFIX + slot + ':meta'); } catch { /* ignore */ }
}

/**
 * Trigger a download of the serialized game as a JSON file.
 * @param {any} game
 */
export function exportToFile(game) {
  const blob = new Blob([game.serialize()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = game.state.date;
  a.href = url;
  a.download = `transit-tycoon-${d.year}-${String(d.month + 1).padStart(2, '0')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask the user for a JSON file and resolve with its text.
 * @returns {Promise<string|null>}
 */
export function importFromFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    });
    input.click();
  });
}
