/**
 * Cached access to the diagnostics module (T11). The module is loaded lazily with a
 * dynamic import so the UI still works (showing "not available") if it is missing.
 */

/** @type {any} undefined = not tried yet, null = unavailable */
let mod;
/** @type {Promise<any>|null} */
let loading = null;
/** @type {{game:any, at:number, issues:any[]|null, error:string|null, summary:any}|null} */
let cache = null;
/** Minimum interval between real scans (ms). */
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

/**
 * Get the latest issues, rescanning at most once per SCAN_INTERVAL_MS unless forced.
 * Synchronous when the module is already loaded; otherwise returns null until loaded.
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
  const now = Date.now();
  const fresh = cache && cache.game === game && now - cache.at < SCAN_INTERVAL_MS;
  if (!force && fresh) return cache;
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
  cache = { game, at: now, issues, error, summary, available: true };
  return cache;
}
