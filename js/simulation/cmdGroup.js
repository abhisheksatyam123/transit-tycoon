/**
 * Vehicle groups (OpenTTD group_cmd.cpp, simplified). Groups live in `state.company.groups`
 * ([{id, name}]) and are stored lazily: the key is absent while no group exists. A vehicle's
 * `groupId` is absent while it is ungrouped. Groups have no gameplay effect; they only organise
 * the vehicle list (filter, per-group totals) and the vehicle window.
 */
import { validateName } from './cmdRename.js';
import { findVehicle } from './state.js';
import { COMPANY_COLOURS } from './companyColour.js';

/** The company's group list (may be empty; not created until needed). */
export function groupList(state) {
  return state.company.groups || [];
}

/** Next group id: max existing id + 1 (deterministic, no global counter). */
function nextGroupId(list) {
  let max = 0;
  for (const g of list) if (g.id > max) max = g.id;
  return max + 1;
}

function isUniqueGroupName(list, name, selfId) {
  const low = name.toLowerCase();
  return !list.some((g) => g.id !== selfId && String(g.name).toLowerCase() === low);
}

function findGroup(state, id) {
  return groupList(state).find((g) => g.id === id) || null;
}

/**
 * Create a group with the given name.
 * @returns {{ok:true,cost:0,group?:{id:number,name:string}}|{ok:false,error:string}}
 */
export function createGroup(ctx, name, opts = {}) {
  const { state } = ctx;
  const r = validateName(name);
  if (!r.ok) return r;
  const list = groupList(state);
  if (!isUniqueGroupName(list, r.name, null)) return { ok: false, error: 'A group with this name already exists' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  const group = { id: nextGroupId(list), name: r.name };
  if (!state.company.groups) state.company.groups = [];
  state.company.groups.push(group);
  return { ok: true, cost: 0, group };
}

/** Rename a group (name must stay unique among groups). */
export function renameGroup(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const g = findGroup(state, id);
  if (!g) return { ok: false, error: 'Unknown group' };
  const r = validateName(name);
  if (!r.ok) return r;
  if (!isUniqueGroupName(groupList(state), r.name, id)) return { ok: false, error: 'A group with this name already exists' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  g.name = r.name;
  return { ok: true, cost: 0, name: r.name };
}

/** Delete a group; its vehicles become ungrouped. The key is removed when no group is left. */
export function deleteGroup(ctx, id, opts = {}) {
  const { state } = ctx;
  const g = findGroup(state, id);
  if (!g) return { ok: false, error: 'Unknown group' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  for (const v of state.vehicles) if (v.groupId === id) delete v.groupId;
  state.company.groups = groupList(state).filter((x) => x !== g);
  if (!state.company.groups.length) delete state.company.groups;
  return { ok: true, cost: 0 };
}

/** Put a vehicle into a group, or take it out of its group (groupId null). */
export function addVehicleToGroup(ctx, vehicleId, groupId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, vehicleId);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (groupId != null && !findGroup(state, groupId)) return { ok: false, error: 'Unknown group' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (groupId == null) delete v.groupId;
  else v.groupId = groupId;
  return { ok: true, cost: 0 };
}

/**
 * Put every vehicle that shares v's order list (including v) into a group.
 * The vehicle must have an order group (shared orders).
 */
export function addSharedVehiclesToGroup(ctx, vehicleId, groupId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, vehicleId);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.orderGroup == null) return { ok: false, error: 'Vehicle does not share orders' };
  if (groupId != null && !findGroup(state, groupId)) return { ok: false, error: 'Unknown group' };
  const members = state.vehicles.filter((w) => w.orderGroup === v.orderGroup);
  if (opts.dryRun) return { ok: true, cost: 0, count: members.length };
  for (const w of members) {
    if (groupId == null) delete w.groupId;
    else w.groupId = groupId;
  }
  return { ok: true, cost: 0, count: members.length };
}

/**
 * Group livery (OpenTTD CmdSetGroupLivery, simplified to the primary colour): the vehicles of the group are
 * drawn in `colour` instead of the company colour. `colour` is one of COMPANY_COLOURS' hex values, or null to
 * reset to the company colour. Stored lazily: `group.colour` is absent while unset; `company.groupColourRev`
 * bumps on each change so the renderer's lookup cache (renderer/groupLivery.js) rebuilds.
 * Player-only (groups belong to the player company): a rival owner is refused.
 * @returns {{ok:true,cost:0}|{ok:false,error:string}}
 */
export function setGroupColour(ctx, id, colour, opts = {}) {
  const { state } = ctx;
  if (((opts && opts.owner) ?? null) !== null) return { ok: false, error: 'Owned by a rival company' };
  const g = findGroup(state, id);
  if (!g) return { ok: false, error: 'Unknown group' };
  let hex = null;
  if (colour != null) {
    hex = String(colour).toLowerCase();
    if (!COMPANY_COLOURS.some((c) => c.hex === hex)) return { ok: false, error: 'Unknown company colour' };
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  if ((g.colour || null) === hex) return { ok: true, cost: 0 };
  if (hex == null) delete g.colour;
  else g.colour = hex;
  state.company.groupColourRev = (state.company.groupColourRev || 0) + 1;
  return { ok: true, cost: 0 };
}

/** Per-vehicle-type colour scheme keys (the renderer maps a vehicle to one of these: groupLivery.js typeOfVehicle). */
export const TYPE_COLOUR_KEYS = ['rail', 'road', 'tram', 'air', 'ship'];

/**
 * Per-vehicle-type colour scheme (OpenLoco CompanyWindow colour scheme / OpenTTD livery, simplified): the
 * vehicles of `type` are drawn in `colour` instead of the company colour (group colour still wins). `type` is one
 * of TYPE_COLOUR_KEYS; `colour` is '#rrggbb' (any colour), or null/'' to reset to the company colour.
 * Stored lazily in `company.typeColours` ({type: hex}); the key is deleted while empty. `company.typeColourRev`
 * bumps on each change so the renderer's lookup cache (renderer/groupLivery.js) rebuilds.
 * Player-only: a rival owner is refused.
 * @returns {{ok:true,cost:0}|{ok:false,error:string}}
 */
export function setTypeColour(ctx, type, colour, opts = {}) {
  const { state } = ctx;
  if (((opts && opts.owner) ?? null) !== null) return { ok: false, error: 'Owned by a rival company' };
  if (!TYPE_COLOUR_KEYS.includes(type)) return { ok: false, error: 'Unknown vehicle type' };
  let hex = null;
  if (colour != null && colour !== '') {
    hex = String(colour).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return { ok: false, error: 'Colour must be #rrggbb' };
  }
  if (opts && opts.dryRun) return { ok: true, cost: 0 };
  const co = state.company;
  const cur = co.typeColours && co.typeColours[type];
  if ((cur || null) === hex) return { ok: true, cost: 0 };
  if (hex == null) {
    delete co.typeColours[type];
    if (Object.keys(co.typeColours).length === 0) delete co.typeColours;
  } else {
    co.typeColours = co.typeColours || {};
    co.typeColours[type] = hex;
  }
  co.typeColourRev = (co.typeColourRev || 0) + 1;
  return { ok: true, cost: 0 };
}
