/**
 * New Game window: seed, map size, town count, start year; "Continue" resumes the autosave.
 */
import { el } from '../dom.js';
import { loadSlotData, slotMeta } from '../storage.js';
import { date, money } from '../format.js';
import { OBJECTIVE_TYPES } from '../../simulation/objective.js';
import { mapgenOptions } from '../../simulation/game.js';

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
      const objType = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Scenario default' }),
        el('option', { value: 'none', text: 'None' }),
        ...Object.entries(OBJECTIVE_TYPES).map(([id, d]) => el('option', { value: id, text: d.label }))));
      const objTarget = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '1', placeholder: 'default' }));
      const objYears = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '0', max: '100', value: '10', title: '0 = no time limit' }));
      const maxLoan = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '0', step: '10000', placeholder: 'default' }));
      const infl = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Default (on)' }), el('option', { value: 'off', text: 'Off' })));
      const pay = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '10', max: '300', step: '5', placeholder: 'default' }));
      const brk = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Default (normal)' }), el('option', { value: 'reduced', text: 'Reduced' }), el('option', { value: 'none', text: 'None' })));
      const extra = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Off (default)' }), el('option', { value: 'on', text: 'On' })));
      const ai = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: '0', text: 'None (default)' }), el('option', { value: '1', text: '1 rival' }), el('option', { value: '2', text: '2 rivals' }), el('option', { value: '3', text: '3 rivals' })));
      const farms = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Off (default)' }), el('option', { value: 'on', text: 'On' })));
      const eras = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Off (default)' }), el('option', { value: 'on', text: 'On' })));
      // T34 map generator options (OpenTTD genworld): default values reproduce the classic map
      const sel = (opts) => /** @type {HTMLSelectElement} */ (el('select.input', null, ...opts.map(([v, t]) => el('option', { value: v, text: t }))));
      const mgTerrain = sel([['normal', 'Normal (default)'], ['flat', 'Flat'], ['hilly', 'Hilly'], ['mountainous', 'Mountainous']]);
      const mgSea = sel([['medium', 'Medium (default)'], ['none', 'None'], ['low', 'Low'], ['high', 'High']]);
      const mgRivers = sel([['none', 'None (default)'], ['few', 'Few'], ['many', 'Many'], ['flowing', 'Flowing (on slopes)']]);
      const mgSmooth = sel([['normal', 'Normal (default)'], ['smooth', 'Smooth'], ['rough', 'Rough']]);
      const mgTowns = sel([['normal', 'Normal (default)'], ['low', 'Low'], ['high', 'High']]);
      const mgInd = sel([['normal', 'Normal (default)'], ['low', 'Low'], ['high', 'High']]);
      const adv = el('details.newgame-adv', null, el('summary', { text: 'Scenario options' }),
        field('Objective', objType), field('Target', objTarget), field('Years', objYears),
        field('Max loan', maxLoan), field('Inflation', infl), field('Payment %', pay), field('Breakdowns', brk),
        field('Extra industries', extra), field('Farm fields', farms), field('Building eras', eras), field('AI competitors', ai),
        field('Terrain', mgTerrain), field('Sea level', mgSea), field('Rivers', mgRivers), field('Smoothness', mgSmooth),
        field('Town density', mgTowns), field('Industry density', mgInd));
      body.append(
        field('Scenario', scenario),
        desc,
        field('Seed', el('span.inline', null, seed, dice)),
        field('Map size', size),
        field('Towns', towns),
        field('Start year', year),
        adv);
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
        // Only explicit choices are passed, so default games stay identical.
        if (objType.value === 'none') opts.objective = { type: 'none' };
        else if (objType.value !== 'default') opts.objective = { type: objType.value, target: Number(objTarget.value) || undefined, timeLimitYears: Number(objYears.value) || 0 };
        else if (objTarget.value && sc && sc.defaults && sc.defaults.objective) opts.objective = { ...sc.defaults.objective, target: Number(objTarget.value) };
        if (Number(maxLoan.value) > 0) opts.maxLoan = Number(maxLoan.value);
        const settings = {};
        if (infl.value === 'off') settings.inflation = false;
        if (Number(pay.value) > 0) settings.cargoPaymentPercent = Number(pay.value);
        if (brk.value !== 'default') settings.breakdowns = brk.value;
        if (extra.value === 'on') settings.extraIndustries = true; // T29 opt-in
        if (farms.value === 'on') settings.farmFields = true; // T29 opt-in
        if (eras.value === 'on') settings.buildingEras = true; // gap #31b opt-in
        if (Number(ai.value) > 0) settings.aiCompanies = Number(ai.value); // gap #25: only when > 0
        if (Object.keys(settings).length) opts.settings = settings;
        // T34: only non-default map options are passed (see mapgenOptions in game.js)
        // only when non-default: any extra key makes the default Moscow game skip its day-0 snapshot
        const mg = mapgenOptions({ terrain: mgTerrain.value, seaLevel: mgSea.value, rivers: mgRivers.value, smoothness: mgSmooth.value, townDensity: mgTowns.value, industryDensity: mgInd.value });
        if (Object.keys(mg).length) opts.mapgen = mg;
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
