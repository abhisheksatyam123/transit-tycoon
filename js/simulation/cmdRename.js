/**
 * Rename commands (OpenTTD CMD_RENAME_STATION / _VEHICLE / _TOWN / _COMPANY).
 * Only the existing `name` field changes; ids are never derived from names, so orders, lists and
 * saves keep referring to the entity by id. Depots get a lazy `name` (renameDepot; blank = default).
 *
 * Rules (validateName): trimmed, 1..32 characters (code points), no control characters.
 * Stations, towns and vehicles must be unique among their own kind (case-insensitive, like
 * OpenTTD IsUniqueStationName); the entity being renamed is excluded from the check.
 * The company name only has the length/character rules (there is one company).
 */
import { findStation, findTown, findVehicle, findDepot } from './state.js';
import { ownerMismatch, RIVAL_OWNED } from './owner.js';
import { MODEL_BY_ID } from '../config/vehicles.js';

export const MAX_NAME_LENGTH = 32;

/**
 * Validate and normalise a requested name.
 * @param {unknown} raw
 * @returns {{ok:true,name:string}|{ok:false,error:string}}
 */
export function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Name must be text' };
  const name = raw.trim();
  if (!name) return { ok: false, error: 'Name cannot be empty' };
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, error: `Name is longer than ${MAX_NAME_LENGTH} characters` };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: 'Name contains control characters' };
  return { ok: true, name };
}

/** True when no other entity in `list` already has this name (case-insensitive). */
function isUnique(list, name, selfId) {
  const low = name.toLowerCase();
  return !list.some((e) => e.id !== selfId && String(e.name || '').toLowerCase() === low);
}

/** Shared body: validate, check uniqueness, store (unless dryRun). */
function renameWith(entity, raw, list, uniqueError, opts) {
  const r = validateName(raw);
  if (!r.ok) return r;
  if (list && !isUnique(list, r.name, entity.id)) return { ok: false, error: uniqueError };
  if (opts.dryRun) return { ok: true, cost: 0, name: r.name };
  entity.name = r.name;
  return { ok: true, cost: 0, name: r.name };
}

/** Rename a station (name must be unique among stations). */
export function renameStation(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const st = findStation(state, id);
  if (!st) return { ok: false, error: 'Unknown station' };
  return renameWith(st, name, state.stations, 'A station with this name already exists', opts);
}

/** Rename a vehicle (name must be unique among vehicles). */
export function renameVehicle(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  return renameWith(v, name, state.vehicles, 'A vehicle with this name already exists', opts);
}

/** Rename a town (name must be unique among towns). */
export function renameTown(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const t = findTown(state, id);
  if (!t) return { ok: false, error: 'Unknown town' };
  return renameWith(t, name, state.towns, 'A town with this name already exists', opts);
}

/** Rename the company (no uniqueness rule: single company). */
export function renameCompany(ctx, name, opts = {}) {
  const { state } = ctx;
  return renameWith(state.company, name, null, '', opts);
}

/** Default label of a depot (no name set): "Depot at x,y" (the pre-rename wording used by orders/vehicle views). */
export function depotDefaultName(d) {
  return `Depot at ${d.x},${d.y}`;
}

/** Display name of a depot: the player's name if set, else the default label. */
export function depotDisplayName(d) {
  return (d && d.name) || depotDefaultName(d);
}

/**
 * Rename a depot (OpenTTD CmdRenameDepot). Owner-checked (rival depots refused). Depots have no name
 * until renamed: the `name` field is lazy. An empty (blank) name resets to the default label by
 * deleting the field. Otherwise the same rules as stations apply (length / characters, unique
 * among depots, case-insensitive, the depot itself excluded).
 */
export function renameDepot(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const d = findDepot(state, id);
  if (!d) return { ok: false, error: 'Unknown depot' };
  if (ownerMismatch(d, opts)) return { ok: false, error: RIVAL_OWNED };
  if (typeof name === 'string' && !name.trim()) {
    if (!opts.dryRun) delete d.name;
    return { ok: true, cost: 0, name: depotDefaultName(d) };
  }
  return renameWith(d, name, state.depots, 'A depot with this name already exists', opts);
}

/**
 * Display name of an engine (vehicle model): the player's name from the lazy `state.engineNames`
 * map ({modelId: name}) if set, else the model's own name. `model` is any object with `id` and `name`.
 */
export function engineDisplayName(state, model) {
  if (!model) return '';
  const custom = state && state.engineNames && state.engineNames[model.id];
  return custom || model.name;
}

/**
 * Rename an engine model (OpenTTD CmdRenameEngine). `state.engineNames` is lazy: absent until an
 * engine is renamed, deleted again when empty. A blank name removes that model's entry (back to the
 * model's own name). Otherwise: trimmed, 1..32 characters, no control characters (no uniqueness rule,
 * as in OpenTTD). Unknown model ids are refused.
 */
export function renameEngine(ctx, modelId, name, opts = {}) {
  const { state } = ctx;
  const model = MODEL_BY_ID[modelId];
  if (!model) return { ok: false, error: 'Unknown engine model' };
  if (typeof name === 'string' && !name.trim()) {
    if (!opts.dryRun && state.engineNames) {
      delete state.engineNames[modelId];
      if (!Object.keys(state.engineNames).length) delete state.engineNames;
    }
    return { ok: true, cost: 0, name: model.name };
  }
  const r = validateName(name);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0, name: r.name };
  if (!state.engineNames) state.engineNames = {};
  state.engineNames[modelId] = r.name;
  return { ok: true, cost: 0, name: r.name };
}

/**
 * Rename the company president (OpenTTD CmdRenamePresident). Lazy `state.company.presidentName`;
 * blank resets to the default (field deleted). Same length / character rules as other names.
 */
export function renamePresident(ctx, name, opts = {}) {
  const { state } = ctx;
  const c = state.company;
  if (typeof name === 'string' && !name.trim()) {
    if (!opts.dryRun) delete c.presidentName;
    return { ok: true, cost: 0, name: '' };
  }
  const r = validateName(name);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0, name: r.name };
  c.presidentName = r.name;
  return { ok: true, cost: 0, name: r.name };
}

/** Shown when the president has no name yet (the default label). */
export const PRESIDENT_DEFAULT_NAME = 'Unnamed president';

/** Display name of the president: the player's name if set, else the default label. */
export function presidentDisplayName(state) {
  return (state && state.company && state.company.presidentName) || PRESIDENT_DEFAULT_NAME;
}
