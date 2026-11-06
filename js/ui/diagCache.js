/**
 * Cached access to the diagnostics module (T11). The module is loaded lazily with a
 * dynamic import so the UI still works (showing "not available") if it is missing.
 */

/** @type {any} undefined = not tried yet, null = unavailable */
let mod;
/** @type {Promise<any>|null} */
let loading = null;
/** @type {{game:any, at:number, month:number, issues:any[]|null, error:string|null, summary:any, available:boolean}|null} */
let cache = null;
/** @deprecated kept for compatibility; see MAX_AGE_MS. */
export const SCAN_INTERVAL_MS = 2000;

/** Load the diagnostics module once. @returns {Promise<any>} */
function loadModule() {
  if (mod !== undefined) return Promise.resolve(mod);
  if (!loading) {
    loading = import('../simulation/diagnostics.js')
      .then((m) => (mod = m))
      .catch(() => (mod = null));
  }
  return loading;
}

/**
 * Summarise issues by severity (defensive: falls back to counting locally).
 * @param {any[]} issues
 * @returns {{error:number,warn:number,info:number,byCategory:Record<string,number>}}
 */
export function countIssues(issues) {
  const out = { error: 0, warn: 0, info: 0, byCategory: /** @type {Record<string,number>} */ ({}) };
  for (const i of issues) {
    if (i.severity in out) out[i.severity]++;
    out.byCategory[i.category] = (out.byCategory[i.category] || 0) + 1;
  }
  return out;
}

/** Real-time staleness limit for the cached scan (ms), in addition to the game-month rule. */
export const MAX_AGE_MS = 30000;
/** @type {ReturnType<typeof setTimeout>|number|null} pending idle rescan */
let pending = null;

/** Month key of a game: a scan is due when this changes. */
function monthKey(game) {
  const d = game && game.state && game.state.date;
  return d ? d.year * 12 + d.month : -1;
}

/** Whether the cached scan can still be served for this game. */
function isFresh(game) {
  if (!cache || cache.game !== game) return false;
  return cache.month === monthKey(game) && Date.now() - cache.at < MAX_AGE_MS;
}

/** Run a scan now and store it. @returns {object} the new cache entry */
function runScan(game) {
  let issues = null, error = null;
  try {
    issues = mod.runDiagnostics(game) || [];
  } catch (err) {
    error = 'Diagnostics failed: ' + (err && err.message ? err.message : String(err));
  }
  let summary = null;
  if (issues) {
    try {
      summary = typeof mod.summarizeIssues === 'function' ? mod.summarizeIssues(issues) : countIssues(issues);
    } catch { summary = countIssues(issues); }
  }
  cache = { game, at: Date.now(), month: monthKey(game), issues, error, summary, available: true };
  return cache;
}

/** Schedule one background rescan on idle time (requestIdleCallback, setTimeout fallback). */
function scheduleIdleScan(game) {
  if (pending !== null) return;
  const go = () => {
    pending = null;
    if (!isFresh(game) && mod && typeof mod.runDiagnostics === 'function') runScan(game);
  };
  if (typeof requestIdleCallback === 'function') pending = requestIdleCallback(go, { timeout: 2000 });
  else pending = setTimeout(go, 0);
}

/**
 * Get the latest issues. The scan is cached until the game month changes or
 * MAX_AGE_MS passes; a stale or missing cache is served as-is while a rescan runs
 * on idle time (never inside the caller's frame). Pass force=true to scan synchronously.
 * @param {any} game
 * @param {boolean} [force]
 * @returns {{issues:any[]|null, error:string|null, summary:any, available:boolean}}
 */
export function scanIssues(game, force = false) {
  if (mod === undefined) { loadModule(); }
  if (!mod || typeof mod.runDiagnostics !== 'function') {
    if (mod === null) return { issues: null, error: 'Diagnostics not available', summary: null, available: false };
    return { issues: null, error: 'Loading…', summary: null, available: true };
  }
  if (force) return runScan(game);
  if (isFresh(game)) return cache;
  scheduleIdleScan(game);
  if (cache && cache.game === game) return cache;
  // first scan still running: show an empty result now (never a stuck "Scanning…"); the scan fills it in on idle
  return { issues: [], error: null, summary: countIssues([]), available: true, scanning: true, at: null };
}
