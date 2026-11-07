/**
 * Hide / unhide engines in the build-vehicle window (OpenTTD engine.cpp CmdSetVehicleVisibility, per company).
 * Stored lazily as company.hiddenEngines = [modelId, ...] (absent until something is hidden; removed again
 * when the last one is unhidden), so saves without hidden engines serialize exactly as before.
 * It only affects the buy list UI: hidden engines stay buyable by the player's commands, AI and autoreplace.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { companyById } from './owner.js';

/** The company record that owns the hidden list (player = state.company; rivals by opts.owner). */
function companyFor(state, opts = {}) {
  return companyById(state, opts.owner ?? null);
}

/** True when the model id is hidden for this company (default player). */
export function isEngineHidden(state, modelId, opts = {}) {
  const c = companyFor(state, opts);
  return !!(c && c.hiddenEngines && c.hiddenEngines.includes(modelId));
}

/**
 * Hide (hidden = true) or unhide (false) one engine model for a company.
 * @returns {{ok:true,cost:number,hidden:boolean}|{ok:false,error:string}}
 */
export function setEngineHidden(ctx, modelId, hidden, opts = {}) {
  const { state } = ctx;
  const c = companyFor(state, opts);
  if (!c) return { ok: false, error: 'No such company' };
  if (typeof modelId !== 'string' || !MODEL_BY_ID[modelId]) return { ok: false, error: 'Unknown vehicle model' };
  const want = !!hidden;
  const list = c.hiddenEngines || [];
  const has = list.includes(modelId);
  if (opts.dryRun) return { ok: true, cost: 0, hidden: want };
  if (want && !has) {
    c.hiddenEngines = [...list, modelId];
  } else if (!want && has) {
    const next = list.filter((id) => id !== modelId);
    if (next.length) c.hiddenEngines = next;
    else delete c.hiddenEngines; // back to the absent (lazy) form
  }
  return { ok: true, cost: 0, hidden: want };
}
