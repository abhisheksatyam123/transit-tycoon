/**
 * New Game window: seed, map size, town count, start year; "Continue" resumes the autosave.
 */
import { el } from '../dom.js';
import { loadSlotData, slotMeta } from '../storage.js';
import { date, money } from '../format.js';
import { OBJECTIVE_TYPES } from '../../simulation/objective.js';
import { mapgenOptions } from '../../simulation/game.js';
import { greyscaleFromPixels, heightsForMap, HEIGHTMAP_ROTATIONS } from '../../simulation/heightmap.js';
import { loadNewGameSettings, newGameMapgenSelection, saveNewGameMapgen, saveNewGameSetting } from '../newGamePrefs.js';
import { DEFAULT_SETTINGS } from '../../simulation/settings.js';
import { COMPANY_COLOURS, DEFAULT_PLAYER_COLOUR } from '../../simulation/companyColour.js';
import { logger } from '../logger.js';

/**
 * Labeled form field.
 * @param {string} label
 * @param {HTMLElement} input
 * @returns {HTMLElement}
 */
export function field(label, input) {
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
    if (!logger.info('newGame', 'Scenarios unavailable; using random world only', err)) console.info('Scenarios unavailable; using random world only', err);
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
      const remembered = loadNewGameSettings();
      // company colour (OpenTTD company colour): '' = default yellow; applied after the game is created (app.newGame)
      const colourSel = /** @type {HTMLSelectElement} */ (el('select.input', null, el('option', { value: '', text: 'Default (yellow)' }),
        ...COMPANY_COLOURS.filter((c) => c.hex !== DEFAULT_PLAYER_COLOUR).map((c) => el('option', { value: c.hex, text: c.name }))));
      const ai = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: '0', text: 'None (default)' }), el('option', { value: '1', text: '1 rival' }), el('option', { value: '2', text: '2 rivals' }), el('option', { value: '3', text: '3 rivals' })));
      const farms = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Off (default)' }), el('option', { value: 'on', text: 'On' })));
      const eras = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'default', text: 'Off (default)' }), el('option', { value: 'on', text: 'On' })));
      const traffic = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'on', text: 'On (default)' }), el('option', { value: 'off', text: 'Off' })));
      const largeHouses = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', checked: !!remembered.largeHouses, 'aria-label': 'Large houses' }));
      // Initial values follow the remembered Settings-window choices (carried over on start)
      extra.value = remembered.extraIndustries ? 'on' : 'default';
      farms.value = remembered.farmFields ? 'on' : 'default';
      eras.value = remembered.buildingEras ? 'on' : 'default';
      ai.value = String(remembered.aiCompanies || 0);
      // T34 map generator options (OpenTTD genworld): default values reproduce the classic map
      const sel = (opts) => /** @type {HTMLSelectElement} */ (el('select.input', null, ...opts.map(([v, t]) => el('option', { value: v, text: t }))));
      const mgTerrain = sel([['normal', 'Normal (default)'], ['flat', 'Flat'], ['hilly', 'Hilly'], ['mountainous', 'Mountainous']]);
      const mgSea = sel([['medium', 'Medium (default)'], ['none', 'None'], ['low', 'Low'], ['high', 'High']]);
      const mgRivers = sel([['none', 'None (default)'], ['few', 'Few'], ['many', 'Many'], ['flowing', 'Flowing (on slopes)']]);
      const mgCliffs = sel([['off', 'Off (default)'], ['on', 'On (steep cliffs with rock)']]);
      const mgLakes = sel([['off', 'Off (default)'], ['few', 'Few'], ['many', 'Many']]);
      const mgMountain = sel([['off', 'Off (default)'], ['on', 'On (rock around peaks)']]);
      const mgVariety = sel([['0', 'None (default)'], ['1', 'Very low'], ['2', 'Low'], ['3', 'Medium'], ['4', 'High'], ['5', 'Very high']]);
      const mgSmooth = sel([['normal', 'Normal (default)'], ['smooth', 'Smooth'], ['rough', 'Rough']]);
      const mgTowns = sel([['normal', 'Normal (default)'], ['low', 'Low'], ['high', 'High']]);
      const mgLayout = sel([['mixed', 'Mixed (default)'], ['original', 'Original'], ['better', 'Better roads'], ['2x2', '2x2 grid'], ['3x3', '3x3 grid'], ['random', 'Random']]);
      const mgInd = sel([['normal', 'Normal (default)'], ['low', 'Low'], ['high', 'High']]);
      const mgClimate = sel([['temperate', 'Temperate (default)'], ['arctic', 'Sub-arctic (snow above the snow line)'], ['tropic', 'Sub-tropical (desert and rainforest)'], ['toyland', 'Toyland (candy ground and toy houses)']]);
      const mgSnow = sel([['5', 'Medium (default)'], ['3', 'Low'], ['7', 'High']]);
      // Opt-in heightmap rotation (U5): only affects an imported heightmap; None keeps the historic import.
      const ROTATION_LABELS = { none: 'None (default)', rot90: '90° clockwise', rot180: '180°', rot270: '270° clockwise', flipX: 'Mirror left-right', flipY: 'Mirror top-bottom', transpose: 'Transpose (main diagonal)', antiTranspose: 'Anti-transpose' };
      const mgHeightmapRot = sel(HEIGHTMAP_ROTATIONS.map((v) => [v, ROTATION_LABELS[v]]));
      const mgBorders = sel([['none', 'None (default)'], ['all', 'All edges (water ring)'], ['random', 'Random (from seed)'],
        ['north', 'North edge'], ['east', 'East edge'], ['south', 'South edge'], ['west', 'West edge']]);
      // Start from the remembered mapgen choices (last New Game); the Settings-window town layout
      // setting wins for new games. With nothing stored these are exactly the defaults above.
      const mgInit = newGameMapgenSelection(remembered);
      mgTerrain.value = mgInit.terrain;
      mgSea.value = mgInit.seaLevel;
      mgRivers.value = mgInit.rivers;
      mgCliffs.value = mgInit.cliffs;
      mgLakes.value = mgInit.lakes;
      mgMountain.value = mgInit.mountainStyle;
      mgSmooth.value = mgInit.smoothness;
      mgVariety.value = String(mgInit.variety);
      mgTowns.value = mgInit.townDensity;
      mgLayout.value = mgInit.townLayout;
      mgInd.value = mgInit.industryDensity;
      mgClimate.value = mgInit.climate;
      mgSnow.value = String(mgInit.snowLine);
      mgHeightmapRot.value = mgInit.heightmapRotation ?? 'none';
      mgBorders.value = mgInit.waterBorders;
      // Heightmap import (OpenTTD heightmap.cpp rules, see simulation/heightmap.js): decoded once on pick
      /** @type {{grey:Uint8Array,w:number,h:number,name:string}|null} */
      let hm = null;
      const hmFile = /** @type {HTMLInputElement} */ (el('input', { type: 'file', accept: 'image/png,image/jpeg', 'aria-label': 'Heightmap image' }));
      const hmInfo = el('span.muted', { text: 'none' });
      const hmClear = el('button.btn.sm', { type: 'button', text: 'Clear', onclick: () => { hm = null; hmFile.value = ''; hmInfo.textContent = 'none'; } });
      hmFile.addEventListener('change', async () => {
        const f = hmFile.files && hmFile.files[0];
        if (!f) return;
        hmInfo.textContent = 'reading…';
        try {
          const bmp = await createImageBitmap(f);
          const w = bmp.width, h = bmp.height;
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(bmp, 0, 0);
          const px = cx.getImageData(0, 0, w, h).data;
          bmp.close && bmp.close();
          hm = { grey: greyscaleFromPixels(px, w, h, 4), w, h, name: f.name };
          hmInfo.textContent = `${f.name} (${w}×${h})`;
        } catch (err) {
          if (!logger.warn('newGame', 'Heightmap unreadable', err)) console.warn('Heightmap unreadable', err);
          hm = null;
          hmInfo.textContent = 'could not read this image';
        }
      });
      const hmField = el('div.field', null, el('span.field-label', { text: 'Heightmap' }),
        el('span.inline', null, hmFile, hmClear, mgHeightmapRot), hmInfo);
      const adv = el('details.newgame-adv', null, el('summary', { text: 'Scenario options' }),
        field('Objective', objType), field('Target', objTarget), field('Years', objYears),
        field('Max loan', maxLoan), field('Inflation', infl), field('Payment %', pay), field('Breakdowns', brk),
        field('Extra industries', extra), field('Farm fields', farms), field('Building eras', eras), field('Town traffic', traffic), field('AI competitors', ai), field('Company colour', colourSel),
        el('label.field', null, el('span.field-label', { text: 'Large houses' }), largeHouses),
        field('Terrain', mgTerrain), field('Sea level', mgSea), field('Rivers', mgRivers), field('Cliffs', mgCliffs), field('Lakes', mgLakes), field('Mountain style', mgMountain), field('Smoothness', mgSmooth), field('Variety distribution', mgVariety),
        field('Town density', mgTowns), field('Town roads', mgLayout), field('Industry density', mgInd),
        field('Climate', mgClimate), field('Snow line', mgSnow), field('Water borders', mgBorders));
      body.append(
        field('Scenario', scenario),
        desc,
        field('Seed', el('span.inline', null, seed, dice)),
        field('Map size', size),
        hmField,
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
        else if (remembered.extraIndustries) settings.extraIndustries = false; // explicit off overrides a remembered on
        if (farms.value === 'on') settings.farmFields = true; // T29 opt-in
        else if (remembered.farmFields) settings.farmFields = false;
        if (eras.value === 'on') settings.buildingEras = true; // gap #31b opt-in
        else if (remembered.buildingEras) settings.buildingEras = false;
        if (traffic.value === 'off') settings.townTraffic = false; // explicit off at new-game; default on unchanged
        if (largeHouses.checked) settings.largeHouses = true; // remembered via Settings; unticking overrides a remembered on
        else if (remembered.largeHouses) settings.largeHouses = false;
        if (Number(ai.value) > 0) settings.aiCompanies = Number(ai.value); // gap #25: only when > 0
        else if (remembered.aiCompanies) settings.aiCompanies = 0;
        if (colourSel.value) opts.companyColour = colourSel.value; // stripped in app.newGame (keeps the Moscow snapshot path)
        if (Object.keys(settings).length) opts.settings = settings;
        // T34: only non-default map options are passed (see mapgenOptions in game.js)
        // only when non-default: any extra key makes the default Moscow game skip its day-0 snapshot
        const mgChoice = { terrain: mgTerrain.value, seaLevel: mgSea.value, rivers: mgRivers.value, cliffs: mgCliffs.value, lakes: mgLakes.value, mountainStyle: mgMountain.value, smoothness: mgSmooth.value, variety: Number(mgVariety.value), townDensity: mgTowns.value, townLayout: mgLayout.value, industryDensity: mgInd.value, climate: mgClimate.value, snowLine: Number(mgSnow.value), heightmapRotation: mgHeightmapRot.value, waterBorders: mgBorders.value };
        // Remember the dialog choices for the next New Game (browser only, not in the save).
        saveNewGameMapgen(mgChoice);
        // The town-layout choice is also the Settings-window new-game value. Leave storage untouched
        // when no preference exists and the default is used (defaults must stay unchanged).
        if (mgChoice.townLayout !== DEFAULT_SETTINGS.townLayout || remembered.townLayout !== undefined) saveNewGameSetting('townLayout', mgChoice.townLayout);
        const mg = mapgenOptions(mgChoice);
        if (Object.keys(mg).length) opts.mapgen = mg;
        // heightmap: sized to the chosen map (only when an image was picked, so default games are unchanged)
        if (hm) opts.heightmap = heightsForMap(hm.grey, hm.w, hm.h, s, s);
        win.close();
        app.newGame(opts);
      });
      const row = el('div.btn-row', null, start);
      const meta = slotMeta('autosave');
      if (meta) {
        row.appendChild(el('button.btn', { type: 'button', text: `Continue (${date(meta.date)}, ${money(meta.money)})`, onclick: async () => {
          const d = loadSlotData('autosave');
          if (d && await app.loadFromString(d)) win.close();
        } }));
      }
      body.appendChild(row);
    },
  });
}
