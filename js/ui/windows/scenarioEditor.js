/**
 * Scenario editor UI: the setup dialog (map size, seed, terrain, empty flat map, start year), the editor
 * window (set start year, save, play) and the "Scenario editor" banner. Logic lives in simulation/scenarioEditor.js.
 */
import { el } from '../dom.js';
import { field } from './newGame.js';
import { exportToFile } from '../storage.js';
import { money } from '../format.js';
import { mapgenOptions } from '../../simulation/game.js';
import { EDITOR_START_MIN, EDITOR_START_MAX, setEditorStartYear } from '../../simulation/scenarioEditor.js';

const sel = (opts) => /** @type {HTMLSelectElement} */ (el('select.input', null, ...opts.map(([v, t]) => el('option', { value: v, text: t }))));

/**
 * Setup dialog: starts an editor map (no company activity; the map is paused until Play).
 * @param {import('../app.js').App} app
 */
export function openScenarioSetup(app) {
  return app.wm.open('scenarioSetup', {
    title: 'Scenario editor: new map',
    width: 320,
    build(body, win) {
      const seed = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', value: String(Math.floor(Math.random() * 1e6)) }));
      const size = sel([['64', '64 × 64 (small)'], ['96', '96 × 96 (medium)'], ['128', '128 × 128 (large)'], ['160', '160 × 160 (huge)']]);
      size.value = '96';
      const empty = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
      const terrain = sel([['normal', 'Normal (default)'], ['flat', 'Flat'], ['hilly', 'Hilly'], ['mountainous', 'Mountainous']]);
      const sea = sel([['medium', 'Medium (default)'], ['none', 'None'], ['low', 'Low'], ['high', 'High']]);
      const year = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: String(EDITOR_START_MIN), max: String(EDITOR_START_MAX), value: '1950' }));
      const sync = () => { terrain.disabled = sea.disabled = empty.checked; };
      empty.addEventListener('change', sync);
      body.append(
        el('p.muted.small', { text: 'Empty map: flat grassland, no towns or industries. Editing is free; time stays paused until you press Play.' }),
        field('Seed', el('span.inline', null, seed, el('button.btn.sm', { type: 'button', text: '🎲', title: 'Random seed', onclick: () => { seed.value = String(Math.floor(Math.random() * 1e6)); } }))),
        field('Map size', size),
        field('Empty flat map', el('label.inline', null, empty, el('span.muted', { text: ' no terrain generation' }))),
        field('Terrain', terrain),
        field('Sea level', sea),
        field('Start year', year),
        el('div.btn-row', null, el('button.btn.primary', {
          type: 'button', text: 'Create scenario map',
          onclick: () => {
            const y = Math.round(Number(year.value));
            if (!Number.isFinite(y) || y < EDITOR_START_MIN || y > EDITOR_START_MAX) { app.toast(`Start year must be ${EDITOR_START_MIN}..${EDITOR_START_MAX}`, 'error'); return; }
            const s = Number(size.value);
            const opts = { editor: true, seed: Number(seed.value) || 1, width: s, height: s, startYear: y, townCount: 0, industryCount: 0, emptyFlat: empty.checked };
            if (!empty.checked) {
              const mg = mapgenOptions({ terrain: terrain.value, seaLevel: sea.value });
              if (Object.keys(mg).length) opts.mapgen = mg;
            }
            win.close();
            app.newGame(opts).then(() => openScenarioEditor(app));
          },
        })),
      );
    },
  });
}

/**
 * Editor window for the running editor map: start year, save, play.
 * @param {import('../app.js').App} app
 */
export function openScenarioEditor(app) {
  return app.wm.open('scenarioEditor', {
    title: 'Scenario editor',
    width: 300,
    build(body) {
      const st = app.game.state;
      const year = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: String(EDITOR_START_MIN), max: String(EDITOR_START_MAX), value: String(st.editor.startYear) }));
      const info = el('p.muted.small', { text: '' });
      const refreshInfo = () => {
        const s = app.game.state;
        info.textContent = `Start year ${s.editor.startYear} · company funds ${money(s.company.money)} (editing does not cost money)`;
      };
      refreshInfo();
      body.append(
        info,
        field('Start year', el('span.inline', null, year, el('button.btn.sm', {
          type: 'button', text: 'Set',
          onclick: () => {
            const res = setEditorStartYear(app.game.state, year.value);
            if (!res.ok) { app.toast(res.error, 'error'); return; }
            app.toast(`Start year set to ${res.year}`, 'good');
            refreshInfo();
          },
        }))),
        el('div.btn-row', null,
          el('button.btn', { type: 'button', text: 'Save scenario file', title: 'Download the scenario as JSON', onclick: () => exportToFile(app.game) }),
          el('button.btn', { type: 'button', text: 'Save to slot', onclick: () => app.open('save') })),
        el('div.btn-row', null,
          el('button.btn.primary', {
            type: 'button', text: 'Play scenario', title: 'Start a company on Jan 1 of the start year and unpause',
            onclick: () => playEditor(app),
          })),
      );
    },
  });
}

/**
 * Leave editor mode: the company starts with normal money, the calendar moves to the start year, time runs.
 * @param {import('../app.js').App} app
 */
export function playEditor(app) {
  const r = app.game.playScenario();
  if (!r.ok) { app.toast(r.error, 'error'); return; }
  app.wm.closeAll();
  app.toast(`Scenario started in ${r.year}: company funds ${money(app.game.state.company.money)}`, 'good');
  app.setGame(app.game); // refresh toolbar, banner and window state for play mode
  app.setSpeed(1);
  syncEditorBanner(app.game);
}

/**
 * Show or hide the banner and toolbar tools for the current game (called from the toolbar refresh).
 * @param {any} game
 */
export function syncEditorBanner(game) {
  let b = document.getElementById('editor-banner');
  const on = !!(game && game.state && game.state.editor);
  if (!on) { if (b) b.remove(); return; }
  if (!b) {
    b = el('div.editor-banner', { id: 'editor-banner', role: 'status' }, el('span', { text: 'Scenario editor · time paused · editing is free' }));
    document.body.appendChild(b);
  }
}
