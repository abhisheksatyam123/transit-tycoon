/**
 * Keyboard shortcuts window (OpenTTD-style hotkey editor). Lists every rebindable action and the fixed
 * keys. Click a key cell, then press the new key. A key already used shows the conflict with Swap / Cancel.
 * Overrides are stored in this browser ('tt.hotkeys'); nothing here touches the simulation.
 */
import { el } from '../dom.js';
import {
  HOTKEY_ACTIONS, READ_ONLY_HOTKEYS, effectiveKeys, currentOverrides, setOverrides, defaultKeys,
  keyFromEvent, keyLabel, findConflict, actionLabel, bindProblem, bindKey, resetOverrides, captureKeydown,
} from '../hotkeys.js';

/**
 * @param {import('../app.js').App} app
 */
export function openHotkeys(app) {
  /** Detach the capture listener; set by build(), called on close so no keydown listener outlives the window. */
  let detachCapture = () => {};
  return app.wm.open('hotkeys', {
    title: 'Keyboard shortcuts',
    width: 460,
    className: 'hotkeys',
    onClose: () => detachCapture(),
    build(body) {
      /** @type {{id:string, cell:HTMLButtonElement, row:HTMLElement, label:string, group:string}[]} */
      const rows = [];
      let capturing = null; // action id waiting for a key
      /** @type {{id:string, key:string, other:string}|null} */
      let pending = null; // conflict awaiting Swap / Cancel
      let overrides = { ...currentOverrides() };

      const status = el('p.muted.small', { role: 'status', 'aria-live': 'polite' });
      const conflict = el('div.hk-conflict');
      conflict.hidden = true;
      const search = /** @type {HTMLInputElement} */ (el('input.input', { type: 'search', placeholder: 'Search shortcuts', 'aria-label': 'Search shortcuts' }));
      const table = el('div.hk-table');

      const keysNow = () => effectiveKeys(overrides);

      /** Keydown capture: while a row waits for a key, take the next key (before the game sees it). */
      const onKey = (e) => {
        if (!capturing) return;
        if (!body.isConnected) { stopCapture(); return; } // window closed mid-capture
        e.stopPropagation();
        e.preventDefault();
        if (e.key === 'Escape') { stopCapture(); status.textContent = 'Cancelled.'; return; }
        const k = keyFromEvent(e);
        if (!k) return; // modifier alone: keep waiting
        const id = capturing;
        stopCapture();
        const problem = bindProblem(k);
        if (problem) { status.textContent = problem; return; }
        const other = findConflict(keysNow(), id, k);
        if (other) {
          pending = { id, key: k, other };
          showConflict();
          return;
        }
        commit(id, k, false);
      };
      const startCapture = (id) => {
        pending = null;
        conflict.hidden = true;
        capturing = id;
        status.textContent = `Press a key for "${actionLabel(id)}" (Esc cancels). Ctrl/Alt/Shift combinations are allowed.`;
        detachCapture();
        detachCapture = captureKeydown(document, onKey);
        refresh();
      };
      function stopCapture() {
        capturing = null;
        detachCapture();
        detachCapture = () => {};
        refresh();
      }
      const commit = (id, key, swap) => {
        const r = bindKey(overrides, id, key, { swap });
        overrides = r.overrides;
        setOverrides(overrides);
        pending = null;
        conflict.hidden = true;
        status.textContent = swap
          ? `"${actionLabel(id)}" is now ${keyLabel(key)}; "${actionLabel(r.displaced)}" took the old key.`
          : `"${actionLabel(id)}" is now ${keyLabel(key)}.`;
        refresh();
      };
      const showConflict = () => {
        const p = pending;
        conflict.replaceChildren(
          el('span', { text: `${keyLabel(p.key)} is already used by "${actionLabel(p.other)}". ` }),
          el('button.btn', { type: 'button', text: 'Swap', title: 'Give the old key of this action to the other action', onclick: () => commit(p.id, p.key, true) }),
          el('button.btn', { type: 'button', text: 'Cancel', onclick: () => { pending = null; conflict.hidden = true; status.textContent = 'Cancelled.'; } }),
        );
        conflict.hidden = false;
        status.textContent = '';
      };

      for (const a of HOTKEY_ACTIONS) {
        const cell = /** @type {HTMLButtonElement} */ (el('button.btn.hk-key', { type: 'button', 'aria-label': `Key for ${a.label}`, title: 'Click, then press a key' }));
        cell.addEventListener('click', () => startCapture(a.id));
        const row = el('div.hk-row', { dataset: { action: a.id } }, el('span.hk-label', { text: a.label }), cell);
        rows.push({ id: a.id, cell, row, label: a.label, group: a.group });
      }
      /** Fixed keys: plain text rows. */
      const fixed = READ_ONLY_HOTKEYS.map((f) => ({
        label: f.label, group: f.group, row: el('div.hk-row.hk-fixed', { title: 'Not rebindable' }, el('span.hk-label', { text: f.label }), el('span.kbd', { text: f.keys })),
      }));

      /** Group order follows the table, with the fixed keys after each group. */
      const groupOrder = [...new Set([...HOTKEY_ACTIONS.map((a) => a.group), ...READ_ONLY_HOTKEYS.map((f) => f.group)])];
      const groupEls = [];
      for (const g of groupOrder) {
        const det = el('details.hk-group', { open: true, dataset: { group: g } }, el('summary', { text: g }));
        for (const r of rows) if (r.group === g) det.appendChild(r.row);
        for (const f of fixed) if (f.group === g) det.appendChild(f.row);
        table.appendChild(det);
        groupEls.push(det);
      }
      const noMatch = el('p.muted.small', { text: 'No shortcuts match.' });
      noMatch.hidden = true;

      const refresh = () => {
        const keys = keysNow();
        const defs = defaultKeys();
        for (const r of rows) {
          r.cell.textContent = capturing === r.id ? 'Press a key…' : (keys[r.id] ? keyLabel(keys[r.id]) : '—');
          r.cell.classList.toggle('capturing', capturing === r.id);
          r.cell.classList.toggle('changed', keys[r.id] !== defs[r.id]);
          r.cell.title = keys[r.id] !== defs[r.id] ? `Default: ${keyLabel(defs[r.id]) || 'none'}` : 'Click, then press a key';
        }
      };

      search.addEventListener('input', () => applyFilter());
      const applyFilter = () => {
        const q = search.value.trim().toLowerCase();
        let any = false;
        for (const det of groupEls) {
          let shown = 0;
          for (const row of det.querySelectorAll('.hk-row')) {
            const text = row.textContent.toLowerCase();
            const ok = !q || text.includes(q) || det.dataset.group.toLowerCase().includes(q);
            row.hidden = !ok;
            if (ok) shown++;
          }
          det.hidden = shown === 0;
          if (q) det.open = true;
          any = any || shown > 0;
        }
        noMatch.hidden = any;
      };

      const reset = el('button.btn', { type: 'button', text: 'Reset to defaults', title: 'Restore every shortcut to its default key' });
      reset.addEventListener('click', () => {
        stopCapture();
        overrides = resetOverrides();
        setOverrides(overrides);
        pending = null;
        conflict.hidden = true;
        status.textContent = 'All shortcuts reset to defaults.';
        refresh();
      });

      body.append(
        el('p.muted.small', { text: 'Click a key, then press the new one. Stored in this browser. Text fields are never affected.' }),
        search, conflict, status, table, noMatch,
        el('div.set-foot', null, reset),
      );
      refresh();
    },
  });
}
