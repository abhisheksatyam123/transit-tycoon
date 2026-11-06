/**
 * Buy Vehicle window. Rail depot: engine + wagon model + wagon count + cargo.
 * Road depot: bus/truck model + cargo. Calls game.buyVehicle(depotId, {...}).
 */
import { el, setText, clear } from '../dom.js';
import { money, num } from '../format.js';
import { cargoName } from '../cargo.js';

/**
 * Build a <select> of models.
 * @param {any[]} models
 * @returns {HTMLSelectElement}
 */
function modelSelect(models) {
  const s = /** @type {HTMLSelectElement} */ (el('select.input'));
  for (const m of models) s.appendChild(el('option', { value: m.id, text: `${m.name} — ${money(m.cost)}` }));
  return s;
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
  if (m.speed) parts.push(`${m.speed} km/h`);
  if (m.capacity) parts.push(`cap ${num(m.capacity)}`);
  if (m.power) parts.push(`${num(m.power)} hp`);
  parts.push(`run ${money(m.running)}/yr`);
  if (m.reliability) parts.push(`rel ${Math.round(m.reliability * 100)}%`);
  parts.push(`since ${m.introYear}`);
  return parts.join(' · ');
}

/**
 * @param {import('../app.js').App} app
 * @param {number} depotId
 */
export function openBuyVehicle(app, depotId) {
  const depot = app.findDepot(depotId);
  if (!depot) return null;
  const rail = depot.kind === 'rail';
  const air = depot.kind === 'air';
  return app.wm.open('buy:' + depotId, {
    title: rail ? 'Buy Train' : air ? 'Buy Aircraft' : 'Buy Road Vehicle',
    width: 360,
    build(body, win) {
      const g = app.game;
      const byId = {};
      const engines = rail ? g.listModels('engine') : [];
      const wagons = rail ? g.listModels('wagon') : [];
      const roadModels = rail ? [] : air ? g.listModels('aircraft') : g.listModels('road');
      for (const m of [...engines, ...wagons, ...roadModels]) byId[m.id] = m;
      const cargoSel = /** @type {HTMLSelectElement} */ (el('select.input'));
      const total = el('div.total.mono');
      const statA = el('div.muted.small');
      const statB = el('div.muted.small');
      let engineSel = null, wagonSel = null, roadSel = null, countIn = null, countOut = null;
      if (rail) {
        engineSel = modelSelect(engines);
        wagonSel = modelSelect(wagons);
        countIn = /** @type {HTMLInputElement} */ (el('input.input', { type: 'range', min: '1', max: '12', value: '4' }));
        countOut = el('span.mono', { text: '4' });
        body.append(field('Engine', engineSel), statA, field('Wagon', wagonSel), statB,
          field('Wagons', el('span.range-wrap', null, countIn, countOut)), field('Cargo', cargoSel));
      } else {
        roadSel = modelSelect(roadModels);
        body.append(field('Model', roadSel), statA, field('Cargo', cargoSel));
      }
      const buyBtn = el('button.btn.primary', { type: 'button', text: 'Buy' });
      body.append(total, el('div.btn-row', null, buyBtn));

      const current = () => (rail ? byId[wagonSel.value] : byId[roadSel.value]);
      const recompute = () => {
        if (rail) {
          const e = byId[engineSel.value], w = byId[wagonSel.value];
          const n = Number(countIn.value);
          setText(countOut, String(n));
          setText(statA, stats(e));
          setText(statB, w ? `${stats(w)} · total cap ${num((w.capacity || 0) * n)}` : '');
          setText(total, 'Cost: ' + money((e ? e.cost : 0) + (w ? w.cost * n : 0)));
        } else {
          const m = byId[roadSel.value];
          setText(statA, stats(m));
          setText(total, 'Cost: ' + money(m ? m.cost : 0));
        }
      };
      // Default wagon: the first freight wagon (a Passenger Coach default makes a train that cannot carry coal/ore/grain).
      if (rail && wagonSel) {
        const freight = wagons.find((m) => m.id === 'wag_hopper') || wagons.find((m) => !(m.cargos || []).includes('PASS'));
        if (freight) wagonSel.value = freight.id;
      }
      const onModel = () => { fillCargo(cargoSel, current()); recompute(); };
      for (const s of [engineSel, wagonSel, roadSel, countIn]) if (s) s.addEventListener('input', onModel);
      onModel();
      if (rail && !engines.length) setText(total, 'No engines available yet');

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
    },
  });
}
