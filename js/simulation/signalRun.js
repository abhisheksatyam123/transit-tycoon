/**
 * Drag signals (OpenTTD CMD_BUILD_SIGNALS drag with signal density, autofill along a run).
 *
 * A run is a list of 4-connected rail tiles in drag order (start first). Build mode places a signal on every
 * `spacing`-th tile counted from the start; a tile that already carries a signal counts as a signal (the spacing
 * restarts there). The run stops at the first tile that cannot take a signal (junction, station, depot, bridge,
 * tunnel, gap): like OTTD autofill it never signals beyond a junction or station. Remove mode deletes every signal
 * on the run. UI-only spacing: the caller passes `spacing`; it is never stored in game state.
 */
import { signalRefusal, buildSignal, removeSignal } from './signals.js';
import { checkMoney } from './trackRules.js';

/** Clamp a spacing value to the supported range (1..16 tiles); non-numbers give the OTTD default 4. */
export function clampSignalSpacing(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 4;
  return Math.min(16, Math.max(1, n));
}

/**
 * Plan a build run without changing state.
 * @param {object} state game state (map)
 * @param {{x:number,y:number}[]} tiles run in drag order
 * @param {number} [spacing=4]
 * @returns {{positions:{x:number,y:number}[], stopped:{x:number,y:number,error:string}|null}}
 */
export function planSignalRun(state, tiles, spacing = 4) {
  const every = clampSignalSpacing(spacing);
  const positions = [];
  let since = 0; // tiles since the last signal (or run start / existing signal)
  for (const p of tiles) {
    const t = state.map.tiles[p.y * state.map.width + p.x];
    if (t && t.signal) { since = 1; continue; } // existing signal acts as the anchor
    const err = signalRefusal(state, p.x, p.y);
    if (err) return { positions, stopped: { x: p.x, y: p.y, error: err } };
    if (since % every === 0) positions.push({ x: p.x, y: p.y });
    since++;
  }
  return { positions, stopped: null };
}

/**
 * Build or remove signals along a run. Cost is the sum of the per-tile prices (same as single clicks);
 * dryRun prices and checks money for the whole run without changing state.
 * @param {{state:object}} ctx game context
 * @param {{x:number,y:number}[]} tiles
 * @param {{spacing?:number, remove?:boolean, type?:string, dryRun?:boolean}} [opts]
 */
export function buildSignalRun(ctx, tiles, opts = {}) {
  const { state } = ctx;
  if (!tiles || !tiles.length) return { ok: false, error: 'Nothing to do' };
  if (opts.remove) {
    const targets = tiles.filter((p) => state.map.tiles[p.y * state.map.width + p.x]?.signal);
    if (!targets.length) return { ok: false, error: 'No signals on this run' };
    return runEach(ctx, targets, (p, o) => removeSignal(ctx, p.x, p.y, o), opts);
  }
  const plan = planSignalRun(state, tiles, opts.spacing);
  if (!plan.positions.length) {
    return { ok: false, error: plan.stopped ? plan.stopped.error : 'No signal position on this run' };
  }
  return runEach(ctx, plan.positions, (p, o) => buildSignal(ctx, p.x, p.y, { ...o, type: opts.type || 'block' }), opts);
}

/** Price (dry run) every tile first; commit only if the total is affordable. */
function runEach(ctx, targets, fn, opts) {
  let cost = 0;
  for (const p of targets) {
    const r = fn(p, { dryRun: true });
    if (!r.ok) return { ok: false, error: r.error };
    cost += r.cost || 0;
  }
  const money = checkMoney(ctx.state, cost); // the whole run must be affordable, not each tile alone
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: targets.length, positions: targets };
  for (const p of targets) {
    const r = fn(p, {});
    if (!r.ok) return { ok: false, error: r.error, cost, tiles: 0 };
  }
  return { ok: true, cost, tiles: targets.length, positions: targets };
}
