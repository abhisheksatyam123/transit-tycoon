/**
 * Buy Vehicle window. Rail depot: engine + wagon model + wagon count + cargo.
 * Road depot: bus/truck model + cargo. Calls game.buyVehicle(depotId, {...}).
 * Cargo filter + sort (buyFilter.js, OpenTTD build_vehicle_gui.cpp): the filter narrows the carrier
 * models (wagons / road / air / ship) to those that can carry the chosen cargo; the sort reorders
 * every model list (name, cost, speed, capacity, running cost, intro date; asc/desc). With filter All
 * and sort Default the lists are exactly the old ones, so the smart default selection is unchanged.
 */
import { el, setText, clear } from '../dom.js';
import { longestPlatform, maxTrainLengthTiles } from '../../simulation/platformLength.js';
import { getSetting } from '../../simulation/settings.js';
import { money, num, kmhText } from '../format.js';
import { cargoName } from '../cargo.js';
import { chooseBuyDefaults } from '../buyDefaults.js';
import { isEngineHidden, setEngineHidden } from '../../simulation/cmdEngineVisibility.js';
import { engineDisplayName } from '../../simulation/cmdRename.js';
import { modelTractiveKn } from '../../simulation/vehicleSpec.js';
import { openRename } from '../rename.js';
import { BUY_SORTERS, BUY_FILTER_ALL, loadBuySort, saveBuySort, sortModels, cargoFilterOptions, filterModelsByCargo } from '../buyFilter.js';

/**
 * Fill a <select> of models (keeps the current value when that model is still listed).
 * @param {HTMLSelectElement} s
 * @param {any[]} models already filtered and sorted
 */
function fillModels(s, models, state) {
  const prev = s.value;
  clear(s);
  for (const m of models) s.appendChild(el('option', { value: m.id, text: `${engineDisplayName(state, m)}${m.traction === 'electric' ? ' (electric)' : ''}${m.hidden ? ' [hidden]' : ''} — ${money(m.cost)}` }));
  if (models.some((m) => m.id === prev)) s.value = prev;
}

/**
 * Fill a cargo select from a model's cargos.
 * @param {HTMLSelectElement} sel
 * @param {any} model
 */
function fillCargo(sel, model) {
  const prev = sel.value;
  clear(sel);
  const cargos = (model && model.cargos) || [];
  for (const c of cargos) sel.appendChild(el('option', { value: c, text: cargoName(c) }));
  if (cargos.includes(prev)) sel.value = prev;
  sel.disabled = cargos.length <= 1;
}

/**
 * Labeled form row.
 * @param {string} label
 * @param {HTMLElement} input
 * @returns {HTMLElement}
 */
function field(label, input) {
  return el('label.field', null, el('span.field-label', { text: label }), input);
}

/**
 * Model stats line.
 * @param {any} m
 * @returns {string}
 */
function stats(m) {
  if (!m) return '';
  const parts = [];
  if (m.speed) parts.push(kmhText(m.speed));
  if (m.capacity) parts.push(`cap ${num(m.capacity)}`);
  if (m.parts) parts.push(`${m.parts.length} parts`);
  if (m.power) parts.push(`${num(m.power)} hp`);
  const te = modelTractiveKn(m);
  if (te != null) parts.push(`${te} kN`);
  parts.push(`run ${money(m.running)}/yr`);
  if (m.reliability) parts.push(`rel ${Math.round(m.reliability * 100)}%`);
  parts.push(`since ${m.introYear}`);
  return parts.join(' · ');
}

/**
 * @param {import('../app.js').App} app
 * @param {number} depotId
 */
/** platformLength setting: warning when a train of `vehicles` engine+wagon slots exceeds the longest rail platform. */
function platformNote(state, vehicles) {
  if (!getSetting(state, 'platformLength')) return '';
  const plat = longestPlatform(state);
  return plat && (vehicles * 0.5) > plat + 1e-9 ? 'Train longer than platform' : '';
}

export function openBuyVehicle(app, depotId) {
  const depot = app.findDepot(depotId);
  if (!depot) return null;
  const rail = depot.kind === 'rail';
  const air = depot.kind === 'air';
  const ship = depot.kind === 'ship';
  return app.wm.open('buy:' + depotId, {
    title: rail ? 'Buy Train' : air ? 'Buy Aircraft' : ship ? 'Buy Ship' : 'Buy Road Vehicle',
    width: 360,
    build(body, win) {
      const g = app.game;
      const byId = {};
      const engines = rail ? g.listModels('engine') : [];
      const wagons = rail ? g.listModels('wagon') : [];
      const roadModels = rail ? [] : air ? g.listModels('aircraft') : ship ? g.listModels('ship') : g.listModels('road');
      for (const m of [...engines, ...wagons, ...roadModels]) byId[m.id] = m;
      // the filter applies to the carrier models (wagons, or the road/air/ship model); engines pull any wagon
      const carriers = rail ? wagons : roadModels;
      let sort = loadBuySort();
      let filter = BUY_FILTER_ALL;
      const sortList = (list) => sortModels(list, sort.key, sort.dir);
      const visibleCarriers = () => sortList(filterModelsByCargo(carriers, filter));
      const cargoSel = /** @type {HTMLSelectElement} */ (el('select.input'));
      const total = el('div.total.mono');
      const statA = el('div.muted.small');
      const statB = el('div.muted.small');

      // cargo filter + sort controls (UI only; the sort is remembered in localStorage, never in the save)
      const filterSel = /** @type {HTMLSelectElement} */ (el('select.input', { 'aria-label': 'Filter by cargo' }));
      filterSel.appendChild(el('option', { value: BUY_FILTER_ALL, text: 'All cargo' }));
      for (const c of cargoFilterOptions(carriers)) filterSel.appendChild(el('option', { value: c, text: cargoName(c) }));
      const sortSel = /** @type {HTMLSelectElement} */ (el('select.input', { 'aria-label': 'Sort models by' }));
      for (const [key, label] of BUY_SORTERS) sortSel.appendChild(el('option', { value: key, text: label }));
      sortSel.value = sort.key;
      const dirBtn = el('button.btn', { type: 'button', 'aria-label': 'Sort direction' });
      const paintDir = () => { setText(dirBtn, sort.dir === 1 ? 'Asc ▲' : 'Desc ▼'); };
      paintDir();
      const controls = [field('Cargo filter', filterSel), field('Sort by', el('span.range-wrap', null, sortSel, dirBtn))];
      // Hide / Unhide engine (OpenTTD build_vehicle_gui: hidden engines leave the list). The company's hidden list
      // is game state (cmdEngineVisibility.js); the "Show hidden" toggle is UI only (not saved). Hidden engines
      // stay buyable by AI and autoreplace.
      let showHidden = false;
      const hideBtn = el('button.btn', { type: 'button' });
      const showHiddenBox = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': 'Show hidden engines' }));
      const primarySel = () => (rail ? engineSel : roadSel);
      // hidden engines are dropped from the primary list unless "Show hidden" is on (then tagged [hidden])
      const primaryList = (list) => {
        const out = [];
        for (const m of list) {
          const hidden = isEngineHidden(g.state, m.id);
          if (hidden && !showHidden) continue;
          out.push(hidden ? { ...m, hidden: true } : m);
        }
        return out;
      };
      const paintHide = () => {
        const m = primarySel() && byId[primarySel().value];
        const hidden = !!m && isEngineHidden(g.state, m.id);
        setText(hideBtn, hidden ? 'Unhide engine' : 'Hide engine');
        hideBtn.disabled = !m;
        hideBtn.title = hidden ? 'Show this model in the list again' : 'Hide this model from the list (it stays buyable by AI and autoreplace)';
      };
      // Rename… the selected engine (OpenTTD CmdRenameEngine; blank name restores the model's own name)
      const renameBtn = el('button.btn', { type: 'button', text: 'Rename…', title: 'Give this engine a name of your own' });
      renameBtn.addEventListener('click', () => { const m = primarySel() && byId[primarySel().value]; if (m) openRename(app, 'engine', m.id, () => relist()); });
      hideBtn.addEventListener('click', () => {
        const m = primarySel() && byId[primarySel().value];
        if (!m) return;
        const hidden = isEngineHidden(g.state, m.id);
        app.exec(g.setEngineHidden(m.id, !hidden), { sound: 'click' });
        relist();
        onModel();
        paintHide();
      });
      showHiddenBox.addEventListener('change', () => { showHidden = showHiddenBox.checked; relist(); onModel(); paintHide(); });
      controls.push(el('div.btn-row', null, hideBtn, renameBtn, el('label.muted.small', null, showHiddenBox, ' Show hidden')));

      let engineSel = null, wagonSel = null, roadSel = null, countIn = null, countOut = null;
      if (rail) {
        engineSel = /** @type {HTMLSelectElement} */ (el('select.input'));
        fillModels(engineSel, primaryList(sortList(engines)), g.state);
        wagonSel = /** @type {HTMLSelectElement} */ (el('select.input'));
        fillModels(wagonSel, visibleCarriers(), g.state);
        const lengthLimitWagons = Math.max(0, Math.floor((maxTrainLengthTiles(g.state) / 0.5) - 1 + 1e-9));
        const maxWagonsLimit = Math.min(getSetting(g.state, 'maxTrainWagons'), lengthLimitWagons);
        const defaultWagons = Math.min(4, Math.max(1, maxWagonsLimit));
        countIn = /** @type {HTMLInputElement} */ (el('input.input', { type: 'range', min: '1', max: String(Math.max(1, maxWagonsLimit)), value: String(defaultWagons) }));
        countOut = el('span.mono', { text: String(defaultWagons) });
        body.append(...controls, field('Engine', engineSel), statA, field('Wagon', wagonSel), statB,
          field('Wagons', el('span.range-wrap', null, countIn, countOut)), field('Cargo', cargoSel));
      } else {
        roadSel = /** @type {HTMLSelectElement} */ (el('select.input'));
        fillModels(roadSel, primaryList(visibleCarriers()), g.state);
        body.append(...controls, field('Model', roadSel), statA, field('Cargo', cargoSel));
      }
      const buyBtn = el('button.btn.primary', { type: 'button', text: 'Buy' });
      // F14: Buy is disabled (with the reason) while the total costs more than the company's cash
      const reason = el('div.muted.small.buy-reason');
      const platNote = el('div.muted.small.plat-warn');
      body.append(total, reason, platNote, el('div.btn-row', null, buyBtn));
      const updateBuy = (cost) => {
        const short = !g.state.editor && cost > g.state.company.money;
        buyBtn.disabled = short;
        const why = short ? `Not enough money: costs ${money(cost)}, you have ${money(g.state.company.money)}` : '';
        setText(reason, why);
        buyBtn.title = why;
      };

      const current = () => (rail ? byId[wagonSel.value] : byId[roadSel.value]);
      const recompute = () => {
        if (rail) {
          const e = byId[engineSel.value], w = byId[wagonSel.value];
          const n = Number(countIn.value);
          setText(countOut, String(n));
          setText(statA, stats(e));
          setText(statB, w ? `${stats(w)} · total cap ${num((w.capacity || 0) * n)}` : '');
          const cost = (e ? e.cost : 0) + (w ? w.cost * n : 0);
          setText(total, 'Cost: ' + money(cost));
          setText(platNote, platformNote(g.state, n + 1));
          updateBuy(cost);
        } else {
          const m = byId[roadSel.value];
          setText(statA, stats(m));
          setText(total, 'Cost: ' + money(m ? m.cost : 0));
          updateBuy(m ? m.cost : 0);
        }
      };
      // Default wagon: the first freight wagon (a Passenger Coach default makes a train that cannot carry coal/ore/grain).
      if (rail && wagonSel) {
        const freight = wagons.find((m) => m.id === 'wag_hopper') || wagons.find((m) => !(m.cargos || []).includes('PASS'));
        if (freight && wagonSel.querySelector(`option[value="${freight.id}"]`)) wagonSel.value = freight.id;
      }
      // F10: road depot next to truck stops serving freight preselects that model + cargo (else a Passenger bus).
      let smart = null;
      if (!rail && !air && !ship && roadSel) smart = chooseBuyDefaults(g.state, depot);
      if (smart && smart.modelId && roadSel.querySelector(`option[value="${smart.modelId}"]`)) roadSel.value = smart.modelId;
      const onModel = () => { fillCargo(cargoSel, current()); recompute(); paintHide(); };
      for (const s of [engineSel, wagonSel, roadSel, countIn]) if (s) s.addEventListener('input', onModel);
      onModel();
      if (smart && smart.cargo && [...cargoSel.options].some((o) => o.value === smart.cargo)) cargoSel.value = smart.cargo;
      if (rail && !engines.length) setText(total, 'No engines available yet');

      // filter / sort changes re-list the carrier (and engine) models, keeping the selection when it is still listed
      const relist = () => {
        if (rail) { fillModels(engineSel, primaryList(sortList(engines)), g.state); fillModels(wagonSel, visibleCarriers(), g.state); }
        else fillModels(roadSel, primaryList(visibleCarriers()), g.state);
      };
      filterSel.addEventListener('change', () => {
        filter = filterSel.value;
        relist();
        onModel();
        // picking a cargo selects a model that carries it, and that cargo
        if (filter && !(current() && (current().cargos || []).includes(filter))) {
          const first = visibleCarriers()[0];
          if (first) { if (rail) wagonSel.value = first.id; else roadSel.value = first.id; }
          onModel();
        }
        if (filter && [...cargoSel.options].some((o) => o.value === filter)) cargoSel.value = filter;
        recompute();
      });
      sortSel.addEventListener('change', () => { sort = { ...sort, key: sortSel.value }; saveBuySort(sort); relist(); onModel(); });
      dirBtn.addEventListener('click', () => { sort = { ...sort, dir: sort.dir === 1 ? -1 : 1 }; saveBuySort(sort); paintDir(); relist(); onModel(); });

      buyBtn.addEventListener('click', () => {
        const spec = rail
          ? { modelId: engineSel.value, wagonModelId: wagonSel.value, wagons: Number(countIn.value), cargoId: cargoSel.value }
          : { modelId: roadSel.value, cargoId: cargoSel.value };
        const res = g.buyVehicle(depotId, spec);
        if (app.exec(res, { sound: 'build', x: depot.x, y: depot.y })) {
          app.toast(`Bought ${res.vehicle ? res.vehicle.name : 'vehicle'} — set its orders, then Start`, 'good');
          if (res.vehicle) app.open('orders', res.vehicle.id);
          win.close();
        }
      });
      // F14: re-check affordability on each refresh tick, so Buy follows the company's cash
      return () => recompute();
    },
  });
}
