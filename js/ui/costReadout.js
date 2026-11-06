/**
 * Construction cost readout (T43, gap #23): a small persistent line under the tool hint while a build tool
 * hovers or drags. It reads the dry-run result the tool already publishes as overlay.preview (ok + label) and
 * shows the cost, the balance after building, or the refusal reason in red. No tool command logic is touched.
 */
import { money } from './format.js';

/**
 * Parse a money label produced by format.money ("$1,234", "-$12"). Returns null for anything else
 * (e.g. an error message), so the readout never shows a wrong number.
 * @param {string} s
 * @returns {number|null}
 */
export function parseMoneyLabel(s) {
  const m = /^(-?)\$([\d,]+)$/.exec(String(s || '').trim());
  if (!m) return null;
  const v = Number(m[2].replace(/,/g, ''));
  return m[1] ? -v : v;
}

/**
 * Pure formatter for the readout.
 * @param {{ok:boolean,label:string}} preview overlay preview (label = money string when ok, else reason)
 * @param {number} balance company money now
 * @returns {{text:string,tone:'good'|'bad'|'neutral'}}
 */
export function formatCostReadout(preview, balance) {
  if (!preview.ok) return { text: `Not possible: ${preview.label || 'refused'}`, tone: 'bad' };
  const cost = parseMoneyLabel(preview.label);
  if (cost === null) return { text: `Cost ${preview.label}`, tone: 'neutral' };
  const after = Math.round(balance) - cost;
  return { text: `Cost ${money(cost)} · Balance after ${money(after)}`, tone: after < 0 ? 'bad' : 'good' };
}

/** @type {HTMLElement|null} */
let node = null;
let lastText = '';

/**
 * Called every frame from main.js. Creates the element once (next to #tool-hint) and updates it only when the text changes.
 * @param {import('../app.js').App} app
 */
export function updateCostReadout(app) {
  const pv = app.renderer && app.renderer.overlay && app.renderer.overlay.preview;
  const show = !!(app.tool && pv && pv.label && pv.tiles && pv.tiles.length);
  if (!node) {
    const hint = document.getElementById('tool-hint');
    if (!hint || !hint.parentElement) return;
    node = document.createElement('div');
    node.id = 'cost-readout';
    node.setAttribute('role', 'status');
    node.hidden = true;
    hint.insertAdjacentElement('afterend', node);
  }
  if (!show) {
    if (!node.hidden) { node.hidden = true; lastText = ''; }
    return;
  }
  const f = formatCostReadout(pv, app.game.state.company.money);
  const key = f.tone + '|' + f.text;
  if (key === lastText) { node.hidden = false; return; }
  lastText = key;
  node.hidden = false;
  node.textContent = f.text;
  node.dataset.tone = f.tone;
}
