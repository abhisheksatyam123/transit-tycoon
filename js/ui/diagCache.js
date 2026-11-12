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
    const n = typeof i.count === 'number' && i.count > 0 ? i.count : 1;
    if (i.severity in out) out[i.severity] += n;
    out.byCategory[i.category] = (out.byCategory[i.category] || 0) + n;
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

/** Minimum gap between two scans triggered by player commands (ms). */
export const COMMAND_SCAN_GAP_MS = 1000;
/** Set by touchIssues(): the cached scan no longer reflects the world. */
let dirty = false;
/** @type {ReturnType<typeof setTimeout>|null} trailing timer after a command */
let trailing = null;

/**
 * Mark the cached scan stale after a command that changed orders, vehicles, stations or track.
 * The next scanIssues() rescans, but never more than once per COMMAND_SCAN_GAP_MS; a trailing
 * timer makes sure a window that is not being redrawn still picks the change up.
 * @param {any} game
 */
export function touchIssues(game) {
  if (!cache || cache.game !== game) return;
  dirty = true;
  if (job && job.game === game) job.touched = true;
  if (trailing === null) {
    trailing = setTimeout(() => {
      trailing = null;
      if (dirty) scheduleIdleScan(game);
    }, COMMAND_SCAN_GAP_MS);
  }
}

/** Whether the cached scan can still be served for this game. */
function isFresh(game) {
  if (!cache || cache.game !== game) return false;
  if (dirty) return false;
  return cache.month === monthKey(game) && Date.now() - cache.at < MAX_AGE_MS;
}

/** Run a scan now and store it. @returns {object} the new cache entry */
function runScan(game) {
  let issues = null, error = null;
  try {
    issues = mod.runDiagnostics(game) || [];
    if (typeof mod.dedupIssues === 'function') issues = mod.dedupIssues(issues);
  } catch (err) {
    error = 'Diagnostics failed: ' + (err && err.message ? err.message : String(err));
  }
  let summary = null;
  if (issues) {
    try {
      summary = typeof mod.summarizeIssues === 'function' ? mod.summarizeIssues(issues) : countIssues(issues);
    } catch { summary = countIssues(issues); /* detailed scan failed: fall back to issue count */ }
  }
  cache = { game, at: Date.now(), month: monthKey(game), issues, error, summary, available: true };
  dirty = false;
  return cache;
}

/** In-flight incremental idle scan: one diagnostics stage per idle slice (W7f). @type {{game:any, stages:any[], i:number, acc:any[], touched:boolean}|null} */
let job = null;

/** Queue the next stage on idle time (requestIdleCallback, setTimeout fallback). */
function queueStep() {
  if (pending !== null) return;
  if (typeof requestIdleCallback === 'function') pending = requestIdleCallback(stepJob, { timeout: 2000 });
  else pending = setTimeout(stepJob, 0);
}

/** Run one stage of the idle scan; publish the cache after the last one. */
function stepJob() {
  pending = null;
  const j = job;
  if (!j) return;
  if (j.i < j.stages.length) {
    try { j.acc.push(...j.stages[j.i](j.game)); } catch (err) { job = null; cacheError(j.game, err); return; }
    j.i++;
  }
  if (j.i < j.stages.length) { queueStep(); return; }
  job = null;
  if (j.touched) { scheduleIdleScan(j.game); return; } // a command changed the world mid-scan: scan again
  if (!isFresh(j.game)) publish(j.game, j.acc);
}

/** Store a failed scan in the cache (same shape as runScan). */
function cacheError(game, err) {
  cache = { game, at: Date.now(), month: monthKey(game), issues: null, error: 'Diagnostics failed: ' + (err && err.message ? err.message : String(err)), summary: null, available: true };
  dirty = false;
}

/** Store issues as the cache (same shape as runScan). */
function publish(game, issues) {
  if (mod && typeof mod.dedupIssues === 'function') issues = mod.dedupIssues(issues);
  let summary = null;
  try {
    summary = typeof mod.summarizeIssues === 'function' ? mod.summarizeIssues(issues) : countIssues(issues);
  } catch { summary = countIssues(issues); }
  cache = { game, at: Date.now(), month: monthKey(game), issues, error: null, summary, available: true };
  dirty = false;
}

/** Schedule a background rescan on idle time, split into per-stage slices (never one long task). */
function scheduleIdleScan(game) {
  if (job && job.game !== game) job = null; // a different game: drop the stale job
  if (job) return;
  if (mod && typeof mod.diagStages === 'function') {
    job = { game, stages: mod.diagStages(), i: 0, acc: [], touched: false };
    queueStep();
    return;
  }
  if (pending !== null) return;
  const go = () => { pending = null; if (!isFresh(game) && mod && typeof mod.runDiagnostics === 'function') runScan(game); };
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
  // a command changed the world: rescan now if the last scan is old enough, else on idle
  if (dirty && cache && cache.game === game && Date.now() - cache.at >= COMMAND_SCAN_GAP_MS) return runScan(game);
  scheduleIdleScan(game);
  if (cache && cache.game === game) return cache;
  // first scan still running: show an empty result now (never a stuck "Scanning…"); the scan fills it in on idle
  return { issues: [], error: null, summary: countIssues([]), available: true, scanning: true, at: null };
}
