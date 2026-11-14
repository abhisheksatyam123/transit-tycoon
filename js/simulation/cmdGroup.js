/**
 * Vehicle groups (OpenTTD group_cmd.cpp, simplified). Groups live in `state.company.groups`
 * ([{id, name}]) and are stored lazily: the key is absent while no group exists. A vehicle's
 * `groupId` is absent while it is ungrouped. Groups have no gameplay effect; they only organise
 * the vehicle list (filter, per-group totals) and the vehicle window.
 */
import { validateName } from './cmdRename.js';
import { findVehicle } from './state.js';
import { COMPANY_COLOURS } from './companyColour.js';
import { getSetting } from './settings.js';

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

/** Vehicle kinds a group may be restricted to (group.kind; strictGroupKind). 'road' covers bus/truck/tram. */
const GROUP_KINDS = ['train', 'road', 'aircraft', 'ship'];

/** Per-type groups are enforced only while the strictGroupKind setting is on (default off). */
function strictKind(state) {
  return getSetting(state, 'strictGroupKind') === true;
}

/** Kind of a vehicle for a group kind (undefined when the kind is not one of GROUP_KINDS). */
function vehicleKind(v) {
  return v && GROUP_KINDS.includes(v.kind) ? v.kind : undefined;
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
  // Nested groups (OpenTTD group_cmd.cpp CmdCreateGroup parent_group): lazy parentId, absent = top level.
  const parentId = opts.parentId == null ? null : opts.parentId;
  const parent = parentId == null ? null : findGroup(state, parentId);
  if (parentId != null && !parent) return { ok: false, error: 'Unknown parent group' };
  // Per-type groups: kind is written only while strictGroupKind is on (absent = legacy mixed group).
  let kind;
  if (strictKind(state)) {
    kind = opts.kind != null ? opts.kind : (parent ? parent.kind : undefined);
    if (kind != null && !GROUP_KINDS.includes(kind)) return { ok: false, error: 'Unknown vehicle type' };
    if (parent && parent.kind != null && kind != null && parent.kind !== kind) {
      return { ok: false, error: 'Parent group is for a different vehicle type' };
    }
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  const group = { id: nextGroupId(list), name: r.name };
  if (parentId != null) group.parentId = parentId;
  if (kind != null) group.kind = kind;
  if (!state.company.groups) state.company.groups = [];
  state.company.groups.push(group);
  // D21 copy-at-creation (opt-in): freeze the company keep-length value into the new group (OpenTTD group_cmd.cpp:371).
  // Off (default): nothing is written, the group keeps following the company setting.
  if (getSetting(state, 'groupCopyKeepLength') === true) {
    state.company.groupReplaceWagonRemoval ??= {};
    state.company.groupReplaceWagonRemoval[group.id] = getSetting(state, 'renewKeepLength') === true;
  }
  return { ok: true, cost: 0, group };
}

/**
 * Move a group under another group (OpenTTD group_cmd.cpp CmdAlterGroup reparent); parentId null = top level.
 * Rejects an unknown parent, the group itself and a cycle (walk up, max depth = group count), and with
 * strictGroupKind on a parent of another vehicle type. `group.parentId` is lazy (absent = top level).
 * Bumps company.groupColourRev: group livery inherits through the parent chain (renderer/groupLivery.js).
 * @returns {{ok:true,cost:0}|{ok:false,error:string}}
 */
export function alterGroupParent(ctx, id, parentId, opts = {}) {
  const { state } = ctx;
  const g = findGroup(state, id);
  if (!g) return { ok: false, error: 'Unknown group' };
  const pid = parentId == null ? null : parentId;
  if (pid === id) return { ok: false, error: 'A group cannot be its own parent' };
  let parent = null;
  if (pid != null) {
    parent = findGroup(state, pid);
    if (!parent) return { ok: false, error: 'Unknown parent group' };
    // Cycle check: walk up from the new parent; reaching g means g would contain itself.
    const list = groupList(state);
    let cur = parent, steps = 0;
    while (cur && steps++ <= list.length) {
      if (cur.id === id) return { ok: false, error: 'Cannot move a group under itself' };
      cur = cur.parentId == null ? null : findGroup(state, cur.parentId);
    }
    if (strictKind(state) && g.kind != null && parent.kind != null && g.kind !== parent.kind) {
      return { ok: false, error: 'Parent group is for a different vehicle type' };
    }
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  if ((g.parentId ?? null) === pid) return { ok: true, cost: 0 };
  if (pid == null) delete g.parentId;
  else g.parentId = pid;
  state.company.groupColourRev = (state.company.groupColourRev || 0) + 1;
  return { ok: true, cost: 0 };
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
  // Children move up to the deleted group's parent (OpenTTD group_cmd.cpp delete: re-link).
  let relinked = false;
  for (const child of groupList(state)) {
    if (child === g || child.parentId !== id) continue;
    if (g.parentId == null) delete child.parentId;
    else child.parentId = g.parentId;
    relinked = true;
  }
  if (relinked) state.company.groupColourRev = (state.company.groupColourRev || 0) + 1;
  for (const v of state.vehicles) if (v.groupId === id) delete v.groupId;
  state.company.groups = groupList(state).filter((x) => x !== g);
  if (!state.company.groups.length) delete state.company.groups;
  // drop the group's lazy autoreplace rules and replace-when-old overrides too (keys removed when empty)
  if (state.company.groupAutoreplace) {
    delete state.company.groupAutoreplace[id];
    if (!Object.keys(state.company.groupAutoreplace).length) delete state.company.groupAutoreplace;
  }
  if (state.company.groupAutoreplaceWhenOld) {
    delete state.company.groupAutoreplaceWhenOld[id];
    if (!Object.keys(state.company.groupAutoreplaceWhenOld).length) delete state.company.groupAutoreplaceWhenOld;
  }
  // keep-length flag (D2): drop the group's override, key removed when empty
  if (state.company.groupReplaceWagonRemoval) {
    delete state.company.groupReplaceWagonRemoval[id];
    if (!Object.keys(state.company.groupReplaceWagonRemoval).length) delete state.company.groupReplaceWagonRemoval;
  }
  // D21 per-group autorenew: drop the group's override, key removed when empty
  if (state.company.groupAutorenew) {
    delete state.company.groupAutorenew[id];
    if (!Object.keys(state.company.groupAutorenew).length) delete state.company.groupAutorenew;
  }
  return { ok: true, cost: 0 };
}

/** Put a vehicle into a group, or take it out of its group (groupId null). */
export function addVehicleToGroup(ctx, vehicleId, groupId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, vehicleId);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  const target = groupId == null ? null : findGroup(state, groupId);
  if (groupId != null && !target) return { ok: false, error: 'Unknown group' };
  // Per-type groups (strictGroupKind on): a typed group accepts only its own kind; an untyped one takes the first kind.
  if (strictKind(state) && target && target.kind != null && target.kind !== vehicleKind(v)) {
    return { ok: false, error: 'Group is for a different vehicle type' };
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (groupId == null) delete v.groupId;
  else {
    if (strictKind(state) && target.kind == null) {
      const k = vehicleKind(v);
      if (k) target.kind = k;
    }
    v.groupId = groupId;
  }
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
  const target = groupId == null ? null : findGroup(state, groupId);
  if (groupId != null && !target) return { ok: false, error: 'Unknown group' };
  const members = state.vehicles.filter((w) => w.orderGroup === v.orderGroup);
  // Per-type groups: every member must fit the target kind (or the members must share one kind).
  if (strictKind(state) && target) {
    const k = target.kind != null ? target.kind : vehicleKind(v);
    if (members.some((w) => vehicleKind(w) !== k)) return { ok: false, error: 'Group is for a different vehicle type' };
  }
  if (opts.dryRun) return { ok: true, cost: 0, count: members.length };
  if (strictKind(state) && target && target.kind == null) {
    const k = vehicleKind(v);
    if (k) target.kind = k;
  }
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
export function setGroupFlag(ctx, id, flag, value, opts={}) {
  const {state}=ctx;
  if (((opts&&opts.owner)??null)!==null) return {ok:false,error:'Owned by a rival company'};
  const g=findGroup(state,id);
  if(!g) return {ok:false,error:'Unknown group'};
  if(flag!=='replaceProtect'&&flag!=='replaceProtection') return {ok:false,error:'Unknown flag'};
  if(opts.dryRun) return {ok:true,cost:0,flag,value:!!value};
  if(value) g.replaceProtect=true; else delete g.replaceProtect;
  return {ok:true,cost:0,flag,value:!!value};
}
/**
 * D21 per-group autorenew (opt-in, groupAutorenew setting). value true/false = the group's own autorenew; null removes
 * the entry so the group follows the company `autorenew` setting again. Stored lazily in company.groupAutorenew
 * ({[groupId]: bool}); the key is absent while unset. Player-only: a rival owner is refused. Requires groupAutorenew on.
 * @returns {{ok:true,cost:0,value:(boolean|null)}|{ok:false,error:string}}
 */
export function setGroupAutorenew(ctx, id, value, opts = {}) {
  const { state } = ctx;
  if (((opts && opts.owner) ?? null) !== null) return { ok: false, error: 'Owned by a rival company' };
  const g = findGroup(state, id);
  if (!g) return { ok: false, error: 'Unknown group' };
  if (value != null && typeof value !== 'boolean') return { ok: false, error: 'Autorenew value must be true, false or null' };
  if (getSetting(state, 'groupAutorenew') !== true) return { ok: false, error: 'Per-group autorenew is off (groupAutorenew setting)' };
  if (opts.dryRun) return { ok: true, cost: 0, value: value ?? null };
  if (value == null) {
    if (state.company.groupAutorenew) {
      delete state.company.groupAutorenew[id];
      if (!Object.keys(state.company.groupAutorenew).length) delete state.company.groupAutorenew;
    }
  } else {
    state.company.groupAutorenew ??= {};
    state.company.groupAutorenew[id] = value;
  }
  return { ok: true, cost: 0, value: value ?? null };
}
function groupHasFlag(g,flag){
  if(flag==='replaceProtect'||flag==='replaceProtection') return !!(g&&g.replaceProtect);
  return false;
}
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
const TYPE_COLOUR_KEYS = ['rail', 'road', 'tram', 'air', 'ship'];

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

/**
 * Per-vehicle paint (OpenLoco Window/Vehicle.cpp kPaintBrush + kPaintColourPrimary): one vehicle is drawn in
 * `colour` ('#rrggbb'), overriding group > type > company colours. A train is one vehicle object, so the whole
 * consist takes the paint. `colour` null/'' clears it (back to the group/type/company colour).
 * Stored lazily: `v.colour` is absent while unset. Player-only: a rival's vehicle is refused.
 * @returns {{ok:true,cost:0}|{ok:false,error:string}}
 */
export function setVehicleColour(ctx, vehicleId, colour, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, vehicleId);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.ownerId != null || ((opts && opts.owner) ?? null) !== null) return { ok: false, error: 'Owned by a rival company' };
  let hex = null;
  if (colour != null && colour !== '') {
    hex = String(colour).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return { ok: false, error: 'Colour must be #rrggbb' };
  }
  if (opts && opts.dryRun) return { ok: true, cost: 0 };
  if ((v.colour || null) === hex) return { ok: true, cost: 0 };
  if (hex == null) delete v.colour;
  else v.colour = hex;
  return { ok: true, cost: 0 };
}
