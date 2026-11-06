/**
 * Settings window (OpenTTD Settings / OpenLoco Options): gameplay options stored in the game state.
 */
import { el } from '../dom.js';
import { allSettings, setSetting } from '../../simulation/settings.js';

/**
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [hint]
 */
function row(label, control, hint) {
  return el('label.field', hint ? { title: hint } : null, el('span.field-label', { text: label }), control);
}

/**
 * @param {import('../app.js').App} app
 */
export function openSettings(app) {
  return app.wm.open('settings', {
    title: 'Settings',
    width: 360,
    build(body) {
      const state = () => app.game.state;
      const check = (key) => {
        const i = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
        i.addEventListener('change', () => setSetting(state(), key, i.checked));
        return i;
      };
      const inflation = check('inflation');
      const subsidies = check('subsidies');
      const payment = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '10', max: '300', step: '5' }));
      payment.addEventListener('change', () => {
        const v = Math.max(10, Math.min(300, Math.round(Number(payment.value)) || 100));
        payment.value = String(v);
        setSetting(state(), 'cargoPaymentPercent', v);
      });
      const breakdowns = /** @type {HTMLSelectElement} */ (el('select.input', null,
        el('option', { value: 'none', text: 'None' }),
        el('option', { value: 'reduced', text: 'Reduced' }),
        el('option', { value: 'normal', text: 'Normal' })));
      breakdowns.addEventListener('change', () => setSetting(state(), 'breakdowns', breakdowns.value));
      const serviceDays = /** @type {HTMLInputElement} */ (el('input.input.mono', { type: 'number', min: '0', max: '730', step: '1' }));
      serviceDays.addEventListener('change', () => {
        const v = Math.max(0, Math.min(730, Math.round(Number(serviceDays.value)) || 0));
        serviceDays.value = String(v);
        setSetting(state(), 'serviceIntervalDays', v);
      });
      body.append(
        row('Inflation', inflation, 'Costs and cargo payments rise every month'),
        row('Cargo payment %', payment, 'Percent of the standard cargo payment rate'),
        row('Breakdowns', breakdowns),
        row('Subsidies', subsidies, 'Offer subsidies every month'),
        row('Service interval (days)', serviceDays, 'New vehicles service at the nearest depot every N days (0 = off). Existing vehicles keep theirs; change them in the vehicle window'),
        el('p.muted.small', { text: 'Settings are saved with the game.' }));
      let sig = '';
      return () => {
        const s = allSettings(state());
        const k = JSON.stringify(s);
        if (k === sig) return;
        sig = k;
        inflation.checked = !!s.inflation;
        subsidies.checked = !!s.subsidies;
        if (document.activeElement !== payment) payment.value = String(s.cargoPaymentPercent);
        if (document.activeElement !== serviceDays) serviceDays.value = String(s.serviceIntervalDays || 0);
        breakdowns.value = s.breakdowns;
      };
    },
  });
}
