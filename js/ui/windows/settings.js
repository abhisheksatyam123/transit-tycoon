/**
 * Settings window (OpenTTD Settings / OpenLoco Options), grouped like OpenTTD settings_gui.cpp.
 * Game settings are stored in the game state; the Interface group holds browser-only preferences.
 * Search filters rows by label/help text; a dot marks values that differ from the default.
 */
import { el } from '../dom.js';
import { allSettings, setSetting, getSetting, roadSideLocked, DEFAULT_SETTINGS } from '../../simulation/settings.js';
import { SETTING_GROUPS, SETTING_META, PREF_META, isChanged, matchesQuery } from '../settingsGroups.js';
import { isMuted, setMuted } from '../../audio/sfx.js';
import { savedGfxMode, togglePack } from '../../renderer/pack/index.js';
import { isFxOn, setFxOn } from '../../renderer/vehicleFx.js';
import { loadLabelPrefs, setLabelPref } from '../../renderer/labels.js';
import { loadGamePrefs, setPauseOnNewGame } from '../gamePrefs.js';
import { loadAutosavePrefs, setAutosaveInterval } from '../autosavePrefs.js';
import { loadTransparency, setTransparency } from '../../renderer/transparency.js';
import { CURRENCIES, SPEED_UNITS } from '../../simulation/currency.js';
import { loadUnits, setUnits, DATE_FORMATS } from '../units.js';
import { UI_SCALES, loadA11y, setA11y, applyA11y } from '../a11yPrefs.js';
import { saveNewGameSetting } from '../newGamePrefs.js';
import { logger, LEVELS } from '../logger.js';

/**
 * @param {import('../app.js').App} app
 */
export function openSettings(app) {
  return app.wm.open('settings', {
    title: 'Settings',
    width: 380,
    build(body) {
      const state = () => app.game.state;
      const titles = Object.fromEntries(SETTING_GROUPS.map((g) => [g.id, g.title]));
      /** @type {{item:any, row:HTMLElement, sync:(s:any)=>void}[]} */
      const rows = [];
      /** @type {HTMLElement[]} */
      const groupEls = [];

      const search = /** @type {HTMLInputElement} */ (el('input.input', { type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings' }));
      const noMatch = el('p.muted.small', { text: 'No settings match.' });
      noMatch.hidden = true;

      /** Select settings whose stored value is a number (the option values are strings in the DOM). */
      /** Build one game-setting control. */
      const control = (m) => {
        if (m.type === 'check') {
          const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
          i.addEventListener('change', () => { setSetting(state(), m.key, i.checked); if (m.newGame) saveNewGameSetting(m.key, i.checked); });
          return { node: i, sync: (s) => { i.checked = !!s[m.key]; } };
        }
        if (m.type === 'select') {
          const sel = /** @type {HTMLSelectElement} */ (el('select.input', null, ...m.options.map(([v, t]) => el('option', { value: v, text: t }))));
          sel.addEventListener('change', () => {
            if (m.key === 'roadSide' && roadSideLocked(state())) { sel.value = String(getSetting(state(), m.key)); return; }
            const v = typeof DEFAULT_SETTINGS[m.key] === 'number' ? Number(sel.value) : sel.value; setSetting(state(), m.key, v); if (m.newGame) saveNewGameSetting(m.key, v); // numeric settings stay numbers
          });
          return { node: sel, sync: (s) => { if (document.activeElement !== sel) sel.value = String(s[m.key]); if (m.key === 'roadSide') sel.disabled = roadSideLocked(state()); } };
        }
        const n = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: String(m.min), max: String(m.max), step: '1' }));
        n.addEventListener('change', () => {
          const v = Math.max(m.min, Math.min(m.max, Math.round(Number(n.value)) || 0));
          n.value = String(v);
          setSetting(state(), m.key, v);
 
          if (m.newGame) saveNewGameSetting(m.key, v);
        });
        return { node: n, sync: (s) => { if (document.activeElement !== n) n.value = String(s[m.key] || 0); } };
      };

      for (const g of SETTING_GROUPS) {
        const inner = [];
        if (g.id === 'interface') {
          // Units: display-only selects (localStorage 'tt.units'); applied on the next window refresh tick.
          const unitSel = (id, label, help, options, key) => {
            const sel = /** @type {HTMLSelectElement} */ (el('select.input', null, ...options.map(([v, t]) => el('option', { value: v, text: t }))));
            sel.addEventListener('change', () => { setUnits({ [key]: sel.value }); });
            const row = el('div.set-row', null, el('label.set-line', { title: help }, sel, el('span.set-label', { text: label })), el('span.set-help.muted', { text: help }));
            const item = { label, help, group: g.id };
            rows.push({ item, row, pref: true, sync: () => { if (document.activeElement !== sel) sel.value = loadUnits()[key]; } });
            inner.push(row);
          };
          {
            // Autosave interval (OpenTTD gui.autosave_interval, NotInSave): browser pref 'tt.autosave'.
            const opts = [[0, 'Off'], [1, 'Every month'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Every 12 months']];
            const sel = /** @type {HTMLSelectElement} */ (el('select.input', null, ...opts.map(([v, t]) => el('option', { value: String(v), text: t }))));
            sel.addEventListener('change', () => { setAutosaveInterval(Number(sel.value)); });
            const help = 'Saves the game into Autosave 1-3 (oldest replaced) every N game months, while playing. Stored in this browser.';
            const row = el('div.set-row', null, el('label.set-line', { title: help }, sel, el('span.set-label', { text: 'Autosave' })), el('span.set-help.muted', { text: help }));
            rows.push({ item: { label: 'Autosave', help, group: g.id }, row, pref: true, sync: () => { if (document.activeElement !== sel) sel.value = String(loadAutosavePrefs().interval); } });
            inner.push(row);
          }
          unitSel('currency', 'Currency', 'Money display only: $, £, €, ¥ or roubles. Simulation values are unchanged.',
            Object.values(CURRENCIES).map((c) => [c.id, c.name]), 'currency');
          unitSel('speed', 'Speed units', 'Vehicle speeds in km/h or mph. Display only.',
            Object.values(SPEED_UNITS).map((u) => [u.id, u.name]), 'speed');
          unitSel('dateFormat', 'Date format', 'Date display order: Day-Month-Year, Month-Day-Year, or Year-Month-Day. Display only.', Object.entries(DATE_FORMATS).map(([k, v]) => [k, v]), 'dateFormat');
          // Accessibility (localStorage 'tt.a11y'): UI scale, high contrast, reduced motion. Applied at once.
          const scaleSel = /** @type {HTMLSelectElement} */ (el('select.input', null, ...UI_SCALES.map((v) => el('option', { value: String(v), text: v + '%' }))));
          scaleSel.addEventListener('change', () => { setA11y({ uiScale: Number(scaleSel.value) }); applyA11y(); });
          const scaleRow = el('div.set-row', null, el('label.set-line', { title: 'Size of the toolbar, status bar and windows (75-200%). The map is not scaled.' }, scaleSel, el('span.set-label', { text: 'UI scale' })), el('span.set-help.muted', { text: 'Toolbar, status bar and windows. The map is not scaled. 100% = default.' }));
          rows.push({ item: { label: 'UI scale', help: '', group: g.id }, row: scaleRow, pref: true, sync: () => { if (document.activeElement !== scaleSel) scaleSel.value = String(loadA11y().uiScale); } });
          inner.push(scaleRow);
          for (const [key, label, help] of [
            ['highContrast', 'High contrast', 'Opaque panels, white text and borders, stronger focus rings.'],
            ['reduceMotion', 'Reduce motion', 'No UI transitions, and no vehicle smoke/sparks/wakes. Also follows the OS reduced-motion setting.'],
          ]) {
            const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
            i.addEventListener('change', () => { setA11y({ [key]: i.checked }); applyA11y(); });
            const row = el('div.set-row', null, el('label.set-line', { title: help }, i, el('span.set-label', { text: label })), el('span.set-help.muted', { text: help }));
            rows.push({ item: { label, help, group: g.id }, row, pref: true, sync: () => { i.checked = !!loadA11y()[key]; } });
            inner.push(row);
          }
          for (const p of PREF_META) {
            const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
            if (p.id === 'sound') i.addEventListener('change', () => { setMuted(!i.checked); app.ui.refreshToolbar?.(); });
            else if (p.id === 'fx') i.addEventListener('change', () => { setFxOn(i.checked); });
            else if (p.id.startsWith('tr:')) {
              const tid = p.id.slice(3);
              i.addEventListener('change', () => { setTransparency(tid, i.checked); app.renderer.invalidateGround(); });
            } else if (p.id === 'pauseOnNewGame') {
              i.addEventListener('change', () => { setPauseOnNewGame(i.checked); });
            } else if (p.id === 'townLabels' || p.id === 'stationLabels') {
              const key = p.id === 'townLabels' ? 'towns' : 'stations';
              i.addEventListener('change', () => { setLabelPref(key, i.checked); });
            } else i.addEventListener('change', () => { togglePack(app.renderer); });
            const row = el('div.set-row', null, el('label.set-line', { title: p.help }, i, el('span.set-label', { text: p.label })), el('span.set-help.muted', { text: p.help }));
            const item = { label: p.label, help: p.help, group: g.id };
            rows.push({ item, row, pref: true, sync: () => {
              if (p.id === 'townLabels') i.checked = loadLabelPrefs().towns;
              else if (p.id === 'stationLabels') i.checked = loadLabelPrefs().stations;
              else if (p.id === 'pauseOnNewGame') i.checked = loadGamePrefs().pauseOnNewGame;
              else if (p.id.startsWith('tr:')) i.checked = !!(loadTransparency() || {})[p.id.slice(3)];
              else i.checked = p.id === 'sound' ? !isMuted() : p.id === 'fx' ? isFxOn() : savedGfxMode() === 'ogfx';
            } });
            inner.push(row);
          }
        }
        if (g.id === 'interface') {
          const hk = el('button.btn', { type: 'button', text: 'Keyboard shortcuts…', title: 'View and change the keyboard shortcuts' });
          hk.addEventListener('click', () => app.open('hotkeys'));
          inner.push(el('div.set-row', null, hk, el('span.set-help.muted', { text: 'Rebind keys for windows and build tools. Stored in this browser.' })));
          const ch = el('button.btn', { type: 'button', text: 'Cheats…', title: 'Cheats window (Ctrl+Alt+C)' });
          ch.addEventListener('click', () => app.open('cheats'));
          inner.push(el('div.set-row', null, ch, el('span.set-help.muted', { text: 'Money, change year, magic bulldozer. Marks the game as cheated. Hidden hotkey: Ctrl+Alt+C.' })));
          // Logging (OPFS file log; default off) — enable/level + status inline
          {
            const logCheck = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
            logCheck.addEventListener('change', () => { if (logCheck.checked) logger.enable(); else logger.disable(); });
            const logLevelSel = /** @type {HTMLSelectElement} */ (el('select.input', { style: { width: 'auto' }, 'aria-label': 'Log level', title: 'Minimum level written to the log file' }));
            for (const lv of ['debug', 'info', 'warn', 'error', 'off']) logLevelSel.append(el('option', { value: lv, text: lv }));
            logLevelSel.addEventListener('change', () => logger.setLevel(logLevelSel.value));
            const logStatus = el('span.muted.small', { text: '' });
            const refreshLogStatus = () => {
              const st = logger.status();
              logStatus.textContent = st.enabled ? `enabled · ${st.level} · ${st.file} · buffered ${st.buffered} flushed ${st.flushed} · ${st.store}` : 'disabled';
              if (document.activeElement !== logCheck) logCheck.checked = st.enabled;
              if (document.activeElement !== logLevelSel) logLevelSel.value = st.level;
            };
            const logRow = el('div.set-row', null,
              el('label.set-line', { title: 'Write warnings/errors (and debug when level=debug) to an OPFS file log instead of console. Also enable via ?log=1&logLevel=debug.' }, logCheck, el('span.set-label', { text: 'File logging' }), logLevelSel, logStatus));
            rows.push({ item: { label: 'File logging', help: 'OPFS file log; also ?log=1&logLevel=debug', group: g.id }, row: logRow, pref: true, sync: refreshLogStatus });
            inner.push(logRow);
            const openRow = el('div.set-row', null,
              el('button.btn.sm', { type: 'button', text: 'View log', title: 'Open the log file contents in a window' }),
              el('span.set-help.muted', { text: 'Needs logging enabled. Shows the last 100 lines from the OPFS file.' }));
            const noop = () => {};
            rows.push({ item: { label: 'View log', help: '', group: g.id }, row: openRow, pref: true, sync: noop });
            const viewBtn = openRow.querySelector('button');
            viewBtn.addEventListener('click', async () => {
              if (!logger.enabled) { logStatus.textContent = 'disabled — enable file logging first'; return; }
              const lines = await logger.tail(100);
              openRow.querySelector('button').disabled = true;
              setTimeout(() => { openRow.querySelector('button').disabled = false; }, 0);
              const w = app.wm.open('logger', { title: 'Log file', width: 560, build: (b2) => {
                b2.append(el('p.muted.small', { text: `${logger.status().file} · ${lines.length} lines (newest last). Use __ttLog.read()/tail()/download() in console for full control.` }));
                const pre = el('pre.mono', { style: 'white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto;font-size:11px;line-height:1.4;' });
                pre.textContent = lines.join('') || '(empty)';
                b2.append(pre);
              }});
              w?.update?.();
            });
            inner.push(openRow);
          }
        }
        for (const m of SETTING_META.filter((x) => x.group === g.id)) {
          const c = control(m);
          const dot = el('span.set-dot', { title: 'Differs from default' });
          const label = el('span.set-label', { text: m.label + (m.newGame ? ' (new games)' : '') }, dot);
          const row = el('div.set-row', null, el('label.set-line', { title: m.help }, c.node, label), el('span.set-help.muted', { text: m.help }));
          rows.push({ item: { label: m.label, help: m.help, group: g.id }, row, sync: (s) => {
            c.sync(s);
            const changed = isChanged(m.key, s[m.key], DEFAULT_SETTINGS);
            dot.hidden = !changed;
            label.classList.toggle('set-changed', changed);
          } });
          inner.push(row);
        }
        const det = /** @type {HTMLDetailsElement} */ (el('details.set-group', { open: true }, el('summary', { text: g.title }), el('p.muted.small', { text: g.help }), ...inner));
        det.dataset.group = g.id;
        groupEls.push(det);
      }

      /** @type {string} */
      let sig = '';
      const reset = el('button.btn', { text: 'Reset to defaults', title: 'Restore all game settings to their defaults (UI preferences are kept)' });
      reset.addEventListener('click', () => {
        const st = state();
        if (!st.settings) return;
        for (const k of Object.keys(DEFAULT_SETTINGS)) if (st.settings[k] !== DEFAULT_SETTINGS[k]) setSetting(st, k, DEFAULT_SETTINGS[k]);
        sig = '';
        sync();
      });

      search.addEventListener('input', () => applyFilter());
      const applyFilter = () => {
        const q = search.value;
        let any = false;
        for (const det of groupEls) {
          let shown = 0;
          for (const r of rows) {
            if (r.row.parentElement !== det) continue;
            const ok = matchesQuery(r.item, q, titles);
            r.row.hidden = !ok;
            if (ok) shown++;
          }
          const groupHit = !!q.trim() && matchesQuery({ label: '', help: '', group: det.dataset.group }, q, titles);
          det.hidden = shown === 0 && !groupHit;
          if (q.trim()) det.open = true;
          any = any || !det.hidden;
        }
        noMatch.hidden = any;
      };

      body.append(
        search,
        ...groupEls,
        noMatch,
        el('div.set-foot', null, reset),
        el('p.muted.small', { text: 'Game settings are saved with the game. Interface options are saved in this browser. Dot = differs from default.' }));

      // move each row into its group (rows were built before their group element existed)
      for (const det of groupEls) for (const r of rows) if (r.item.group === det.dataset.group) det.append(r.row);

      const sync = () => {
        const s = allSettings(state());
        const k = JSON.stringify(s);
        const changedGame = Object.keys(DEFAULT_SETTINGS).some((key) => isChanged(key, s[key], DEFAULT_SETTINGS));
        reset.disabled = !changedGame;
        if (k === sig) { for (const r of rows) if (r.pref) r.sync(s); return; }
        sig = k;
        for (const r of rows) r.sync(s);
      };
      return () => sync();
    },
  });
}
