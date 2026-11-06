/**
 * Scenario editor (OpenTTD scenario editor, basic). A game with `state.editor` set is an editor map:
 * time is paused, terraform / trees / towns / industries / canals / objects cost nothing, and the
 * toolbar offers only the landscape tools. `playScenario` turns it into a normal game with a fresh
 * company. Normal games never have `state.editor` (lazy field).
 */
import { createCompany } from './economy.js';

export const EDITOR_START_MIN = 1950;
export const EDITOR_START_MAX = 2050;

/** Tools usable in the scenario editor (toolbar and keyboard). */
export const EDITOR_TOOLS = Object.freeze(['terraform', 'plant', 'foundTown', 'fundIndustry', 'objects', 'demolish', 'canal', 'lock']);

/** True for an editor map (lazy `state.editor`). */
export function isEditor(state) {
  return !!(state && state.editor);
}

/**
 * Cost charged for an editor-capable construction: free while editing.
 * @param {object} state
 * @param {number} cost
 * @returns {number}
 */
export function constructionCharge(state, cost) {
  return state && state.editor ? 0 : cost;
}

/**
 * Set the start year of an editor map (also moves the calendar to Jan 1 of that year).
 * @param {object} state
 * @param {number} year
 * @returns {{ok:true, year:number}|{ok:false, error:string}}
 */
export function setEditorStartYear(state, year) {
  if (!isEditor(state)) return { ok: false, error: 'not in the scenario editor' };
  const y = Math.round(Number(year));
  if (!Number.isFinite(y) || y < EDITOR_START_MIN || y > EDITOR_START_MAX) {
    return { ok: false, error: `start year must be ${EDITOR_START_MIN}..${EDITOR_START_MAX}` };
  }
  state.editor.startYear = y;
  state.date = { year: y, month: 0, day: 1 };
  return { ok: true, year: y };
}

/**
 * Play the scenario: leave editor mode, start a fresh company (normal money and loan) on Jan 1 of the start year.
 * Mutates `state`; the caller unpauses. Idempotent for non-editor states (returns ok:false).
 * @param {object} state
 * @returns {{ok:true, year:number}|{ok:false, error:string}}
 */
export function playScenario(state) {
  if (!isEditor(state)) return { ok: false, error: 'not in the scenario editor' };
  const year = Math.min(EDITOR_START_MAX, Math.max(EDITOR_START_MIN, Math.round(Number(state.editor.startYear) || state.date.year)));
  delete state.editor;
  state.company = createCompany(state.company && state.company.name);
  state.date = { year, month: 0, day: 1 };
  return { ok: true, year };
}

