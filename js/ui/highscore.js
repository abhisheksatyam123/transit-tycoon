/**
 * Hall of fame (OpenTTD highscore.cpp / highscore_gui.cpp): top-10 table per scenario, kept in this browser
 * (localStorage 'tt.highscores' = {[scenario]: entry[]}), never in the save or the simulation.
 * Score = the company performance index (TT's performance rating, 0..1000); ties go to company value.
 * Recorded once per game (in-memory guard, never in the save) when the objective is won/lost or the company goes bankrupt.
 */
const HIGHSCORE_KEY = 'tt.highscores';
export const HIGHSCORE_MAX = 10;

/** Scenario key for the table: the scenario id, or 'random' for a generated map. */
export function scenarioKey(state) {
  return state && state.scenario ? String(state.scenario) : 'random';
}

/** Order: higher score first, then higher company value, then earlier save time. */
export function compareEntries(a, b) {
  return (b.score - a.score) || (b.value - a.value) || (a.savedAt - b.savedAt);
}

/**
 * Insert an entry into a table (pure). Returns the new table (max HIGHSCORE_MAX) and the 1-based rank
 * (0 when the entry did not make the table).
 * @param {any[]} table
 * @param {{name:string,score:number,value:number,date:{year:number,month:number,day?:number}|string,scenario:string,reason:string,savedAt:number}} entry
 */
export function insertHighScore(table, entry) {
  const list = Array.isArray(table) ? table.slice() : [];
  list.push(entry);
  list.sort(compareEntries);
  const kept = list.slice(0, HIGHSCORE_MAX);
  const rank = kept.indexOf(entry) + 1;
  return { table: kept, rank };
}

/**
 * Build an entry from a game state (pure).
 * @param {any} state
 * @param {'won'|'lost'|'bankrupt'} reason
 * @param {number} [now]
 */
export function makeHighScoreEntry(state, reason, now = Date.now()) {
  const c = state.company || {};
  const d = state.date || {};
  return {
    name: String(c.name || 'Player'),
    score: Math.round(Number(c.performanceIndex) || 0),
    value: Math.round(Number(c.companyValue) || 0),
    date: { year: d.year || 0, month: d.month || 0, day: d.day || 1 },
    scenario: scenarioKey(state),
    reason,
    savedAt: now,
  };
}

/** @param {string|null|undefined} raw @returns {Record<string, any[]>} */
export function parseHighScores(raw) {
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) out[k] = v.filter((e) => e && typeof e === 'object').slice(0, HIGHSCORE_MAX);
  }
  return out;
}

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** @returns {Record<string, any[]>} */
export function loadHighScores() {
  const s = storage();
  try { return parseHighScores(s ? s.getItem(HIGHSCORE_KEY) : null); } catch { return {}; }
}

/** Record a finished game for its scenario. Returns the rank (0 = not in top 10). */
function recordHighScore(state, reason, now = Date.now()) {
  const all = loadHighScores();
  const key = scenarioKey(state);
  const r = insertHighScore(all[key], makeHighScoreEntry(state, reason, now));
  all[key] = r.table;
  const s = storage();
  try { if (s) s.setItem(HIGHSCORE_KEY, JSON.stringify(all)); } catch { /* quota / private mode: keep in memory only */ }
  return r.rank;
}

const recorded = new WeakSet();

/** Game-end hook: record once per game state (in-memory guard only). Skips the scenario editor. */
export function recordGameEnd(state, reason, now = Date.now()) {
  if (!state || state.editor || recorded.has(state)) return 0;
  recorded.add(state);
  return recordHighScore(state, reason, now);
}

/** Display text for a finished-game reason. */
export function reasonLabel(reason) {
  return reason === 'won' ? 'Objective won' : reason === 'lost' ? 'Objective failed' : reason === 'bankrupt' ? 'Bankrupt' : String(reason);
}
