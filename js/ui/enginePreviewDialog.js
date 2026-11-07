/**
 * Engine preview offer (OpenTTD engine_gui.cpp EnginePreviewWindow): "Message from vehicle manufacturer".
 * Yes = a year's exclusive use of the model; No = declined (the next company is asked, else public).
 * The dialog stays until answered (Escape does nothing). Pure UI: the simulation owns the state.
 */
import { el } from './dom.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { pendingPlayerOffer } from '../simulation/enginePreview.js';

const TYPE_WORD = { engine: 'train', bus: 'bus', aircraft: 'aircraft', ship: 'ship', tram: 'tram', truck: 'truck', road: 'truck' };

/**
 * Show the offer for `modelId` unless one is already open.
 * @param {any} app App (app.game)
 * @param {string} modelId
 */
export function openEnginePreviewDialog(app, modelId) {
  if (document.querySelector('.engine-preview-backdrop')) return;
  const m = MODEL_BY_ID[modelId];
  if (!m) return;
  const type = TYPE_WORD[m.kind] || 'vehicle';
  const backdrop = el('div.prompt-backdrop.engine-preview-backdrop');
  const yes = el('button.btn.primary', { type: 'button', text: 'Yes' });
  const no = el('button.btn', { type: 'button', text: 'No' });
  const dialog = el('section.prompt.engine-preview', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Message from vehicle manufacturer', 'data-model': modelId },
    el('div.win-header', null, el('span.win-title', { text: 'Message from vehicle manufacturer' })),
    el('div.prompt-body', null,
      el('p', { text: `We have just designed a new ${type}: ${m.name} (${m.speed} km/h). Would you be interested in a year's exclusive use of this vehicle, so we can see how it performs before making it universally available?` }),
      el('div.btn-row', null, no, yes)));
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  const answer = (accept) => {
    const r = app.game.answerEnginePreview(modelId, accept);
    backdrop.remove();
    if (r && r.ok === false && app.toast) app.toast(r.error || 'Not possible', 'error', true);
    if (accept && app.toast) app.toast(`Exclusive use of ${m.name} for one year`, 'good', false, 5000);
    if (app.ui && app.ui.refreshToolbar) app.ui.refreshToolbar();
  };
  yes.addEventListener('click', () => answer(true));
  no.addEventListener('click', () => answer(false));
  yes.focus();
}

/** Remove an open offer (timed out or answered elsewhere). */
export function closeEnginePreviewDialog() {
  const old = document.querySelector('.engine-preview-backdrop');
  if (old) old.remove();
}

/** On a game (re)start or load: re-open a player offer that is still waiting. */
export function showPendingEnginePreview(app) {
  const id = pendingPlayerOffer(app.game && app.game.state);
  if (id) openEnginePreviewDialog(app, id);
}
