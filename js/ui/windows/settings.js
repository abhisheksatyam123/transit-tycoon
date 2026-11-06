/**
 * Settings window (OpenTTD Settings / OpenLoco Options), grouped like OpenTTD settings_gui.cpp.
 * Game settings are stored in the game state; the Interface group holds browser-only preferences.
 * Search filters rows by label/help text; a dot marks values that differ from the default.
 */
import { el } from '../dom.js';
import { allSettings, setSetting, DEFAULT_SETTINGS } from '../../simulation/settings.js';
import { SETTING_GROUPS, SETTING_META, PREF_META, isChanged, matchesQuery } from '../settingsGroups.js';
import { isMuted, setMuted } from '../../audio/sfx.js';
import { savedGfxMode, togglePack } from '../../renderer/pack/index.js';
import { isFxOn, setFxOn } from '../../renderer/vehicleFx.js';

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

      /** Build one game-setting control. */
      const control = (m) => {
        if (m.type === 'check') {
          const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
          i.addEventListener('change', () => setSetting(state(), m.key, i.checked));
          return { node: i, sync: (s) => { i.checked = !!s[m.key]; } };
        }
        if (m.type === 'select') {
          const sel = /** @type {HTMLSelectElement} */ (el('select.input', null, ...m.options.map(([v, t]) => el('option', { value: v, text: t }))));
          sel.addEventListener('change', () => setSetting(state(), m.key, m.key === 'aiCompanies' ? Number(sel.value) : sel.value));
          return { node: sel, sync: (s) => { if (document.activeElement !== sel) sel.value = String(s[m.key]); } };
        }
        const n = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: String(m.min), max: String(m.max), step: '1' }));
        n.addEventListener('change', () => {
          const v = Math.max(m.min, Math.min(m.max, Math.round(Number(n.value)) || 0));
          n.value = String(v);
          setSetting(state(), m.key, v);
        });
        return { node: n, sync: (s) => { if (document.activeElement !== n) n.value = String(s[m.key] || 0); } };
      };

      for (const g of SETTING_GROUPS) {
        const inner = [];
        if (g.id === 'interface') {
          for (const p of PREF_META) {
            const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
            if (p.id === 'sound') i.addEventListener('change', () => { setMuted(!i.checked); app.ui.refreshToolbar?.(); });
            else if (p.id === 'fx') i.addEventListener('change', () => { setFxOn(i.checked); });
            else i.addEventListener('change', () => { togglePack(app.renderer); });
            const row = el('div.set-row', null, el('label.set-line', { title: p.help }, i, el('span.set-label', { text: p.label })), el('span.set-help.muted', { text: p.help }));
            const item = { label: p.label, help: p.help, group: g.id };
            rows.push({ item, row, pref: true, sync: () => {
              i.checked = p.id === 'sound' ? !isMuted() : p.id === 'fx' ? isFxOn() : savedGfxMode() === 'ogfx';
            } });
            inner.push(row);
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
