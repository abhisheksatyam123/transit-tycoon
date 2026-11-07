/**
 * Sign tool (OpenTTD signs: place a text sign; click an existing sign to edit it). Clicking an empty
 * tile opens the shared text prompt and places a sign there; clicking a sign label edits it (empty text
 * deletes it). Clicking a sign with no tool does the same (see input.js).
 */
import { openPrompt } from '../prompt.js';
import { SIGN_MAX_LENGTH, signAt } from '../../simulation/cmdSign.js';

/**
 * Prompt to create (x,y) or edit the sign with `id`. Empty text on a new sign just closes.
 * @param {import('../app.js').App} app
 * @param {{id?:number|null, x:number, y:number, text?:string}} target
 */
export function openSignPrompt(app, target) {
  const g = app.game;
  const existing = target.id != null ? (g.state.signs || []).find((s) => s.id === target.id) : null;
  return openPrompt({
    title: existing ? 'Edit sign' : 'Place sign',
    label: 'Sign text (empty deletes)',
    value: existing ? existing.text : '',
    maxLength: SIGN_MAX_LENGTH,
    okText: existing ? 'OK' : 'Place',
    onSubmit: (text) => {
      const trimmed = text.trim();
      if (!existing && !trimmed) return { ok: true };
      const r = existing ? g.editSign(existing.id, text) : g.placeSign(target.x, target.y, text);
      if (r && r.ok) app.wm.updateAll();
      return r;
    },
  });
}

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createSignTool(app) {
  return {
    id: 'sign',
    label: 'Sign',
    hint: 'Click a tile to place a text sign, or click an existing sign to edit it (empty text deletes). Esc cancels.',
    move(t) { app.renderer.overlay.preview = null; void t; },
    down() {},
    up(t) {
      // one sign per tile: clicking a tile that holds a sign edits it, else places a new one
      const sg = signAt(app.game.state, t.x, t.y);
      openSignPrompt(app, { id: sg ? sg.id : null, x: t.x, y: t.y });
    },
    cancel() {},
  };
}
