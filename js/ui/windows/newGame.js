/**
 * New Game window: seed, map size, town count, start year; "Continue" resumes the autosave.
 */
import { el } from '../dom.js';
import { loadSlotData, slotMeta } from '../storage.js';
import { date, money } from '../format.js';

/**
 * Labeled form field.
 * @param {string} label
 * @param {HTMLElement} input
 * @returns {HTMLElement}
 */
function field(label, input) {
  return el('label.field', null, el('span.field-label', { text: label }), input);
}

/** Fallback list when the scenarios module is missing. */
const FALLBACK_SCENARIOS = [{ id: 'random', name: 'Random world', description: 'A procedurally generated world.', defaults: {} }];

/**
 * Load the scenario catalogue; never throws.
 * @returns {Promise<Array<{id:string,name:string,description?:string,defaults?:any}>>}
 */
async function loadScenarios() {
  try {
    const mod = await import('../../simulation/scenarios/index.js');
    if (Array.isArray(mod.SCENARIOS) && mod.SCENARIOS.length) return mod.SCENARIOS;
  } catch (err) {
    console.info('Scenarios unavailable; using random world only', err);
  }
  return FALLBACK_SCENARIOS;
}

/**
 * @param {import('../app.js').App} app
 */
export function openNewGame(app) {
  return app.wm.open('newGame', {
    title: 'New Game',
    width: 320,
    build(body, win) {
      const seed = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', value: String(Math.floor(Math.random() * 1e6)) }));
      const size = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: '64', text: '64 × 64 (small)' }),
        el('option', { value: '96', text: '96 × 96 (medium)', selected: true }),
        el('option', { value: '128', text: '128 × 128 (large)' }),
        el('option', { value: '160', text: '160 × 160 (huge)' }),
        el('option', { value: '192', text: '192 × 192 (huge)' })));
      size.value = '96';
      const scenario = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'random', text: 'Random world' })));
      const desc = el('div.scenario-desc', { text: '' });
      const SIZE_IDS = ['64', '96', '128', '160', '192'];
      /** @type {Array<{id:string,name:string,description?:string,defaults?:any}>} */
      let catalogue = FALLBACK_SCENARIOS;
      const showScenario = () => {
        const sc = catalogue.find((c) => c.id === scenario.value) || catalogue[0];
        desc.textContent = (sc && sc.description) || '';
        const d = sc && sc.defaults ? sc.defaults : {};
        if (d.width && SIZE_IDS.includes(String(d.width))) size.value = String(d.width);
      };
      scenario.addEventListener('change', showScenario);
      loadScenarios().then((list) => {
        catalogue = list;
        scenario.textContent = '';
        for (const c of list) scenario.appendChild(el('option', { value: c.id, text: c.name }));
        scenario.value = list.some((c) => c.id === 'metropolis') ? 'metropolis' : list[0].id;
        showScenario();
      });
      const towns = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '1', max: '30', value: '8' }));
      const year = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '1920', max: '2050', value: '1950' }));
      const dice = el('button.btn.sm', { type: 'button', text: '🎲', title: 'Random seed', onclick: () => { seed.value = String(Math.floor(Math.random() * 1e6)); } });
      body.append(
        field('Scenario', scenario),
        desc,
        field('Seed', el('span.inline', null, seed, dice)),
        field('Map size', size),
        field('Towns', towns),
        field('Start year', year));
      const start = el('button.btn.primary', { type: 'button', text: 'Start new game' });
      start.addEventListener('click', () => {
        const sc = catalogue.find((c) => c.id === scenario.value) || catalogue[0];
        const s = Number(size.value);
        const t = Math.max(1, Math.min(30, Number(towns.value) || 8));
        const opts = {
          seed: Number(seed.value) || 1,
          width: s, height: s,
          townCount: t,
          industryCount: Math.round(18 * (s * s) / (96 * 96)),
          startYear: Math.max(1920, Math.min(2050, Number(year.value) || 1950)),
        };
        if (sc && sc.id !== 'random') opts.scenario = sc.id;
        win.close();
        app.newGame(opts);
      });
      const row = el('div.btn-row', null, start);
      const meta = slotMeta('autosave');
      if (meta) {
        row.appendChild(el('button.btn', { type: 'button', text: `Continue (${date(meta.date)}, ${money(meta.money)})`, onclick: () => {
          const d = loadSlotData('autosave');
          if (d && app.loadFromString(d)) win.close();
        } }));
      }
      body.appendChild(row);
    },
  });
}
