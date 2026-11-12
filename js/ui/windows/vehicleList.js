/**
 * Vehicle list window: every vehicle with state and profit this/last year.
 * Sort by name / number, profit this year, profit last year, age, reliability; filter by kind.
 * Sort and filter live on the window instance (not saved). OpenLoco VehicleList / OpenTTD vehicle_gui.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { listOrEmpty } from './common.js';
import { hasTimetable } from '../../simulation/orders.js';
import { openPrompt } from '../prompt.js';
import { groupList } from '../../simulation/cmdGroup.js';
import { getSetting } from '../../simulation/settings.js';
import { COMPANY_COLOURS } from '../../simulation/companyColour.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';
import { wagonList } from '../../simulation/consist.js';
import { cargoName } from '../cargo.js';
import { bucketVehicles, sortBuckets, groupStatistics, groupKindLabel, GROUP_BY, BUCKET_SORTS } from '../vehicleGroupRows.js';

/** Human label + css class for a vehicle state. */
export const STATE_LABEL = {
  depot: 'In depot', running: 'Running', loading: 'Loading', stopped: 'Stopped', broken: 'Broken down', lost: 'Lost',
};

/** Sort keys: [key, label]. */
export const VEHICLE_SORTS = [
  ['name', 'Name'], ['profitThisYear', 'Profit this year'], ['profitLastYear', 'Profit last year'],
  ['age', 'Age'], ['reliability', 'Reliability'], ['lateDays', 'Lateness'],
  ['maxSpeed', 'Max speed'], ['value', 'Value'], ['model', 'Model'], ['length', 'Length (wagons)'],
  ['cargo', 'Cargo'], ['timeToLive', 'Time to live'],
  ['number', 'Number'], ['capacity', 'Total capacity'], // OpenTTD vehicle_gui.cpp ADI sorts (vehicle number, total capacity); appended so existing indices are unchanged
];

/** Tooltip for the group protect checkbox, matching the active autoreplace protection semantics (settings.js autoreplaceProtectOttd). */
function protectTitle(ottd) {
  return ottd
    ? 'Protect this group from autoreplace (OpenTTD ReplaceProtection): blocks only the company-wide rule; the group\'s own rule and autorenew still run'
    : 'Protect this group from autoreplace (TT default): blocks the group\'s own rule, the company rule and autorenew; the vehicles keep as-is';
}

/** True when the vehicle runs to a timetable (any order with a wait or travel time). */
export function hasVehicleTimetable(v) {
  return Array.isArray(v.orders) && v.orders.some((o) => hasTimetable(o));
}

/**
 * Label of the late column: '' for vehicles without a timetable, else 'on time', '+N d' (late), '−N d' (early).
 * @param {any} v
 */
export function lateLabel(v) {
  if (!hasVehicleTimetable(v)) return '';
  const d = Number(v.lateDays) || 0;
  if (!d) return 'on time';
  return d > 0 ? `+${d} d` : `${d} d`;
}

/** Kind filters: [value, label]. */
export const VEHICLE_FILTERS = [['all', 'All'], ['train', 'Trains'], ['road', 'Road'], ['aircraft', 'Aircraft'], ['ship', 'Ships']];

/** Model record of a vehicle (undefined for unknown ids). */
function modelOf(v) {
  return MODEL_BY_ID[v.modelId];
}

/** Cargo ids a vehicle carries: its own cargo plus every wagon's (OpenTTD: any part matches). */
export function vehicleCargos(v) {
  const set = new Set();
  if (v.cargoId) set.add(v.cargoId);
  for (const w of wagonList(v)) if (w && w.cargoId) set.add(w.cargoId);
  return set;
}

/**
 * Cargo filter: 'all' (no filter) or a cargo id; matches when any part of the vehicle carries that cargo.
 * @param {any} v
 * @param {string} [cargo]
 */
export function inCargo(v, cargo) {
  if (cargo === undefined || cargo === 'all') return true;
  return vehicleCargos(v).has(cargo);
}

/** Distinct cargo ids carried by any vehicle, sorted (for the cargo dropdown). */
export function vehicleCargoOptions(vehicles) {
  const set = new Set();
  for (const v of vehicles) for (const c of vehicleCargos(v)) set.add(c);
  return [...set].sort();
}

/** Reliability as a 0..1 fraction (older saves store percent). */
function relFraction(v) {
  const r = Number(v.reliability) || 0;
  return r <= 1 ? r : r / 100;
}

/**
 * Group filter value: 'all' (no filter), 'none' (ungrouped) or a group id (number).
 * @param {any} v
 * @param {any} group
 */
export function inGroup(v, group) {
  if (group === undefined || group === 'all') return true;
  if (group === 'none') return v.groupId == null;
  return v.groupId === group;
}

/** Nested group depth (0 = top level). Cycle-safe: stops after group count steps. */
export function groupDepth(groups, g) {
  let depth = 0, cur = g;
  while (cur && cur.parentId != null && depth < groups.length) {
    cur = groups.find((x) => x.id === cur.parentId);
    depth++;
  }
  return depth;
}

/** True when `descId` is `id` or a descendant of it (an invalid parent for `id`). */
export function isGroupDescendant(groups, id, descId) {
  let cur = groups.find((g) => g.id === descId) || null;
  for (let steps = 0; cur && steps <= groups.length; steps++) {
    if (cur.id === id) return true;
    cur = cur.parentId == null ? null : groups.find((g) => g.id === cur.parentId);
  }
  return false;
}

/** Sort keys compared as strings (the rest are numeric). */
const STRING_SORTS = new Set(['name', 'model', 'cargo']);

/** Sort-key value per vehicle, computed once per call (cheap comparator). Strings for name/model/cargo. */
function sortKey(v, sort) {
  switch (sort) {
    case 'profitThisYear': return Number(v.profitThisYear) || 0;
    case 'profitLastYear': return Number(v.profitLastYear) || 0;
    case 'age': return Number(v.age) || 0;
    case 'reliability': return relFraction(v);
    case 'lateDays': return Number(v.lateDays) || 0;
    case 'maxSpeed': return Number(modelOf(v) && modelOf(v).speed) || 0;
    case 'value': return Number(v.value) || 0;
    case 'model': return String((modelOf(v) && modelOf(v).name) || v.modelId || '');
    case 'length': return Number(v.wagons) || 0;
    case 'cargo': return [...vehicleCargos(v)].sort().join(',');
    case 'timeToLive': return (Number(v.maxAge) || 0) - (Number(v.age) || 0);
    case 'number': return Number(v.unitNumber) || 0; // displayed unit number (ties break on id in sortVehicles)
    case 'capacity': return Number(v.capacity) || (modelOf(v) && Number(modelOf(v).capacity)) || 0; // total capacity of all parts
    default: return String(v.name || ''); // name: string compare
  }
}

/**
 * Filter then sort vehicles. Pure: does not mutate the input. Keys are computed once per vehicle;
 * ties break on unit number then id (stable, deterministic).
 * @param {any[]} vehicles
 * @param {{sort?:string, dir?:number, filter?:string, group?:any, cargo?:string}} opts dir: 1 ascending, -1 descending
 * @returns {any[]}
 */
export function sortVehicles(vehicles, opts = {}) {
  const { sort = 'name', dir = 1, filter = 'all', group = 'all', cargo = 'all' } = opts;
  const sign = dir < 0 ? -1 : 1;
  const rows = [];
  for (const v of vehicles) {
    if ((filter === 'all' || v.kind === filter) && inGroup(v, group) && inCargo(v, cargo)) {
      rows.push({ v, k: sortKey(v, sort), u: Number(v.unitNumber) || 0, id: v.id });
    }
  }
  const isStr = STRING_SORTS.has(sort);
  rows.sort((a, b) => {
    let c = isStr ? String(a.k).localeCompare(String(b.k), undefined, { numeric: true }) : a.k - b.k;
    if (c === 0) c = a.u - b.u || a.id - b.id;
    return c * sign;
  });
  return rows.map((r) => r.v);
}

/**
 * @param {import('../app.js').App} app
 */
export function openVehicleList(app) {
  /** Window-instance state. */
  // by: group-by mode (none / shared / group); bsort: bucket sort key while grouped; open: expanded bucket keys
  const state = { sort: 'name', dir: 1, filter: 'all', group: 'all', cargo: 'all', by: 'none', bsort: 'total', open: new Set() };
  return app.wm.open('vehicles', {
    title: 'Vehicles',
    width: 440,
    build(body) {
      const summary = el('div.muted');
      const sortSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Sort vehicles', title: 'Sort' },
        VEHICLE_SORTS.map(([k, l]) => el('option', { value: k, text: l })));
      const filterSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Filter by kind', title: 'Kind filter' },
        VEHICLE_FILTERS.map(([v, l]) => el('option', { value: v, text: l })));
      const dirBtn = el('button.btn.sm', { type: 'button', title: 'Toggle ascending / descending' });
      // cargo filter (OpenTTD vehicle_gui.cpp cargo dropdown): All cargo, or a cargo any part of the vehicle carries
      const cargoFilterSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Filter by cargo', title: 'Cargo filter' });
      const cargoKey = { sig: null };
      const cargoOptions = (vs) => {
        const opts = vehicleCargoOptions(vs);
        const sig = opts.join('|');
        if (cargoKey.sig === sig) return;
        cargoKey.sig = sig;
        cargoFilterSel.replaceChildren(el('option', { value: 'all', text: 'All cargo' }),
          ...opts.map((c) => el('option', { value: c, text: cargoName(c) })));
      };
      // group filter: All / Ungrouped / one option per group (count and profit of its vehicles)
      const groupSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Filter by group', title: 'Group filter' });
      const groupOpt = (value) => (value === 'all' || value === 'none' ? String(value) : `g:${value}`);
      const groupValue = (val) => (val === 'all' || val === 'none' ? val : Number(String(val).slice(2)));
      groupSel.onchange = () => { state.group = groupValue(groupSel.value); refresh(); };
      const renameGroupBtn = el('button.btn.sm', { type: 'button', text: 'Rename group…', title: 'Rename the group shown by the filter', onclick: () => {
        const g = groupList(app.game.state).find((x) => x.id === state.group);
        if (!g) return;
        openPrompt({ title: 'Rename group', label: 'Name', value: g.name, onSubmit: (text) => {
          const r = app.game.renameGroup(g.id, text);
          if (r && r.ok) app.wm.updateAll();
          return r;
        } });
      } });
      const deleteGroupBtn = el('button.btn.sm.danger', { type: 'button', text: 'Delete group', title: 'Delete the group shown by the filter (its vehicles become ungrouped)', onclick: () => {
        if (typeof state.group !== 'number') return;
        app.exec(app.game.deleteGroup(state.group), { sound: 'click' });
        state.group = 'all';
        refresh();
      } });
      const newGroupBtn = el('button.btn.sm', { type: 'button', text: 'New group…', title: 'Create an empty vehicle group', onclick: () => {
        openPrompt({ title: 'New group', label: 'Name', value: '', onSubmit: (text) => {
          // per-type groups (strictGroupKind): a group created from a kind filter takes that kind
          const opts = {};
          if (getSetting(app.game.state, 'strictGroupKind') === true && ['train', 'road', 'aircraft', 'ship'].includes(state.filter)) opts.kind = state.filter;
          const r = app.game.createGroup(text, opts);
          if (r && r.ok) { state.group = r.group ? r.group.id : state.group; app.wm.updateAll(); }
          return r;
        } });
      } });
      // group livery (OpenTTD CmdSetGroupLivery): the 16 company colours (same swatches as the company chooser) plus
      // 'Company colour' (reset). Shown only while a group is selected; the swatches are rebuilt on group change only.
      const livery = el('div.group-livery', { style: { display: 'none', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } });
      const liveryKey = { sig: null };
      const liveryRow = (g) => {
        const sig = g.id + '|' + (g.colour || '');
        if (liveryKey.sig === sig) return;
        liveryKey.sig = sig;
        const setCol = (hex) => { app.exec(app.game.setGroupColour(g.id, hex), { sound: 'click' }); app.wm.updateAll(); };
        const reset = el('button.btn.sm', { type: 'button', text: 'Company colour', title: 'Draw this group in the company colour', disabled: !g.colour, onclick: () => setCol(null) });
        livery.replaceChildren(el('span.muted', { text: 'Group colour' }), ...COMPANY_COLOURS.map((c) => el('button.colour-swatch', { type: 'button',
          title: c.name, 'aria-label': 'Group colour ' + c.name, 'aria-pressed': String(c.hex === g.colour),
          style: { background: c.hex, width: '20px', height: '20px', margin: '2px', border: c.hex === g.colour ? '2px solid #fff' : '1px solid #0008', outline: c.hex === g.colour ? '2px solid #000' : 'none' },
          onclick: () => setCol(c.hex) })), reset);
      };
      const bySel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Group by', title: 'Group the list into rows' },
        GROUP_BY.map(([k, l]) => el('option', { value: k, text: l })));
      bySel.onchange = () => { state.by = bySel.value; state.open.clear(); state.dir = 1; refresh(); };
      const protectCb = el('input', { type: 'checkbox', title: protectTitle(false), onchange: () => { if (typeof state.group !== 'number') return; app.exec(app.game.setGroupFlag(state.group, 'replaceProtect', protectCb.checked)); refresh(); } });
      const protectLabel = el('label.muted', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' }, title: protectTitle(false) }, protectCb, el('span', { text: 'Protect from autoreplace' }));
      // selected group details (OpenTTD group_gui.cpp WID_GL_INFO): read-only sums over the group's listed vehicles.
      const gStatsValue = [0, 1, 2, 3].map(() => el('span.kv-value.mono'));
      const gStats = el('div.kv-grid', { style: { display: 'none' } },
        el('span.kv-label', { text: 'Profit this year' }), gStatsValue[0],
        el('span.kv-label', { text: 'Profit last year' }), gStatsValue[1],
        el('span.kv-label', { text: 'Current usage' }), gStatsValue[2],
        el('span.kv-label', { text: 'Vehicles' }), gStatsValue[3]);
      // nested groups: parent selector for the group shown by the filter (self/descendants excluded)
      const parentSel = el('select.input', { style: { width: 'auto', display: 'none' }, 'aria-label': 'Parent group', title: 'Parent group (nested groups)' });
      const parentLabel = el('span.muted', { text: 'Parent', style: { display: 'none' } });
      parentSel.onchange = () => {
        if (typeof state.group !== 'number') return;
        const pid = parentSel.value === 'none' ? null : Number(parentSel.value);
        app.exec(app.game.alterGroupParent(state.group, pid), { sound: 'click' });
        refresh();
      };
      const groupControls = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        el('span.muted', { text: 'Group by' }), bySel, el('span.muted', { text: 'Group' }), groupSel, newGroupBtn, renameGroupBtn, deleteGroupBtn, parentLabel, parentSel, protectLabel);
      // group-by dropdown (OpenTTD vehicle_gui.cpp GB_NONE / GB_SHARED_ORDERS / GB_GROUP). Grouped: the sort box sorts buckets.
      const sortKeyed = { sig: null };
      const sortOptions = (grouped) => {
        const sig = grouped ? 'b' : 's';
        if (sortKeyed.sig === sig) return;
        sortKeyed.sig = sig;
        sortSel.replaceChildren(...(grouped ? BUCKET_SORTS : VEHICLE_SORTS).map(([k, l]) => el('option', { value: k, text: l })));
      };
      sortSel.onchange = () => { if (state.by === 'none') state.sort = sortSel.value; else state.bsort = sortSel.value; state.dir = 1; refresh(); };
      filterSel.onchange = () => { state.filter = filterSel.value; refresh(); };
      cargoFilterSel.onchange = () => { state.cargo = cargoFilterSel.value; refresh(); };
      dirBtn.onclick = () => { state.dir = -state.dir; refresh(); };
      // mass start/stop act on the vehicles the current kind filter shows (gap #40)
      const massBtn = (label, start) => el('button.btn.sm', { type: 'button', text: label, title: `${label} the vehicles shown by the filter`, onclick: () => {
        const ids = sortVehicles(app.game.state.vehicles.filter((v) => v.ownerId == null), state).map((v) => v.id);
        const r = app.game.massStartStop(ids, start);
        if (app.exec(r, { sound: start ? 'horn' : 'click' }) && r.count) app.toast(`${start ? 'Started' : 'Stopped'} ${r.count} vehicle${r.count === 1 ? '' : 's'}`, 'good');
        refresh();
      } });
      // OpenTTD ADI_SERVICE / ADI_DEPOT: mass send of the shown vehicles (already-heading ones are skipped)
      const massDepotBtn = (label, service) => el('button.btn.sm', { type: 'button', text: label, title: service ? 'Send the vehicles shown by the filter to a depot for servicing, then they continue their orders' : 'Send the vehicles shown by the filter to the nearest depot and stop them there', onclick: () => {
        const ids = sortVehicles(app.game.state.vehicles.filter((v) => v.ownerId == null), state).map((v) => v.id);
        const r = app.game.massSendToDepot(ids, service);
        if (app.exec(r, { sound: 'click' }) && r.count) app.toast(`${service ? 'Sent for servicing' : 'Sent to depot'}: ${r.count} vehicle${r.count === 1 ? '' : 's'}`, 'good');
        refresh();
      } });
      const controls = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        el('span.muted', { text: 'Sort' }), sortSel, dirBtn, el('span.muted', { text: 'Show' }), filterSel, el('span.muted', { text: 'Cargo' }), cargoFilterSel,
        massBtn('Start all', true), massBtn('Stop all', false),
        massDepotBtn('Send for servicing', true), massDepotBtn('Send to depot', false),
        el('button.btn.sm', { type: 'button', text: 'Autoreplace…', title: 'Replace models with newer ones when stopped in a depot', onclick: () => app.open('autoreplace') }));
      const headSpans = [0, 1, 2, 3, 4, 5].map(() => el('span'));
      const head = el('div.table-head', null, ...headSpans);
      const HEAD_VEH = ['Vehicle', 'State', 'This year', 'Last year', 'Late', ''];
      // last two columns: OpenTTD group stats shown per group (profit last year, current usage / load percent)
      const HEAD_BUCKET = ['Group', '', 'Total this year', 'Average this year', 'Total last year', 'Usage'];
      const headKey = { mode: null };
      const setHead = (mode) => {
        if (headKey.mode === mode) return;
        headKey.mode = mode;
        const labels = mode === 'bucket' ? HEAD_BUCKET : HEAD_VEH;
        headSpans.forEach((sp, i) => setText(sp, labels[i]));
      };
      // grouped list rows: a bucket row (toggles its members) or a member vehicle row. Keys are prefixed so a row never changes kind.
      const createRow = (item) => {
        if (item.kind === 'bucket') {
          return el('div.table-row.group-row', { style: { cursor: 'pointer' }, onclick: () => {
            if (state.open.has(item.b.key)) state.open.delete(item.b.key); else state.open.add(item.b.key);
            refresh();
          } }, el('span.bucket-label'), el('span.mono.num'), el('span.mono.num'), el('span.mono.num'), el('span.mono.num'), el('span.mono.num'));
        }
        return el('div.table-row.group-member', { style: { paddingLeft: '18px' } },
          el('button.link', { type: 'button', onclick: () => app.open('vehicle', item.v.id) }),
          el('span.state'), el('span.mono.num'), el('span.mono.num'), el('span.mono.num.late'),
          el('button.btn.sm', { type: 'button', text: 'Follow', title: 'Follow with camera', onclick: () => { app.follow(item.v.id); } }));
      };
      const updateRow = (row, item) => {
        const c = row.children;
        if (item.kind === 'bucket') {
          const b = item.b;
          row.classList.toggle('open', state.open.has(b.key));
          setText(c[0], (state.open.has(b.key) ? '▾ ' : '▸ ') + b.label);
          setText(c[1], `${b.count} vehicle${b.count === 1 ? '' : 's'}`);
          c[1].title = groupKindLabel(b.counts); // per-type breakdown: "5 (3 train, 2 road)"
          setText(c[2], money(b.total));
          c[2].classList.toggle('neg', b.total < 0);
          setText(c[3], money(b.avg));
          c[3].classList.toggle('neg', b.avg < 0);
          setText(c[4], money(b.last));
          c[4].classList.toggle('neg', b.last < 0);
          setText(c[5], `${b.usage}%`);
          return;
        }
        const v = item.v;
        setText(c[0], v.name);
        setText(c[1], STATE_LABEL[v.state] || v.state);
        c[1].className = 'state st-' + v.state;
        setText(c[2], money(v.profitThisYear));
        c[2].classList.toggle('neg', v.profitThisYear < 0);
        setText(c[3], money(v.profitLastYear));
        c[3].classList.toggle('neg', v.profitLastYear < 0);
        setText(c[4], lateLabel(v));
        c[4].classList.toggle('neg', hasVehicleTimetable(v) && (Number(v.lateDays) || 0) > 0);
      };
      const list = el('div.list.scroll.table');
      body.append(summary, groupControls, livery, gStats, controls, head, list);
      const refresh = () => {
        const grouped = state.by !== 'none';
        sortOptions(grouped);
        sortSel.value = grouped ? state.bsort : state.sort;
        bySel.value = state.by;
        filterSel.value = state.filter;
        cargoOptions(app.game.state.vehicles.filter((v) => v.ownerId == null));
        if (state.cargo !== 'all' && !Array.from(cargoFilterSel.options).some((o) => o.value === state.cargo)) state.cargo = 'all';
        cargoFilterSel.value = state.cargo;
        setText(dirBtn, state.dir < 0 ? '▼' : '▲');
        const all = app.game.state.vehicles.filter((v) => v.ownerId == null); // player's vehicles only: rivals are not listed (gap #25)
        let p = 0;
        for (const v of all) p += v.profitThisYear || 0;
        // rebuild the group options (labels hold counts and profit); keep the selection valid
        const groups = groupList(app.game.state);
        if (state.group !== 'all' && state.group !== 'none' && !groups.some((g) => g.id === state.group)) state.group = 'all';
        const optLabel = (sel, label) => {
          const members = all.filter((v) => inGroup(v, sel));
          const ty = members.reduce((a, v) => a + (v.profitThisYear || 0), 0);
          const ly = members.reduce((a, v) => a + (v.profitLastYear || 0), 0);
          return `${label} (${members.length}) · ${money(ty)} / ${money(ly)}`;
        };
        const opts = [['all', optLabel('all', 'All vehicles')], ['none', optLabel('none', 'Ungrouped')],
          ...groups.map((g) => [g.id, optLabel(g.id, '\u00a0\u00a0'.repeat(groupDepth(groups, g)) + g.name)])];
        const sig = opts.map(([k, l]) => `${groupOpt(k)}=${l}`).join('|');
        if (groupSel.dataset.sig !== sig) {
          groupSel.dataset.sig = sig;
          groupSel.replaceChildren(...opts.map(([k, l]) => el('option', { value: groupOpt(k), text: l })));
        }
        groupSel.value = groupOpt(state.group);
        const hasGroup = typeof state.group === 'number';
        renameGroupBtn.disabled = !hasGroup;
        deleteGroupBtn.disabled = !hasGroup;
        const selG = hasGroup ? groupList(app.game.state).find((x) => x.id === state.group) : null;
        // parent selector: every group except selG and its descendants (a cycle); '— top level —' clears parentId
        parentLabel.style.display = selG ? 'inline-flex' : 'none';
        parentSel.style.display = selG ? '' : 'none';
        if (selG) {
          const choices = groups.filter((g) => !isGroupDescendant(groups, selG.id, g.id));
          const psig = choices.map((g) => `${g.id}:${g.name}`).join('|');
          if (parentSel.dataset.sig !== psig) {
            parentSel.dataset.sig = psig;
            parentSel.replaceChildren(el('option', { value: 'none', text: '— top level —' }),
              ...choices.map((g) => el('option', { value: String(g.id), text: '\u00a0\u00a0'.repeat(groupDepth(groups, g)) + g.name })));
          }
          parentSel.value = selG.parentId == null ? 'none' : String(selG.parentId);
        }
        livery.style.display = selG ? 'flex' : 'none';
        protectCb.checked = !!(selG && selG.replaceProtect);
        // The tooltip describes the active semantics (autoreplaceProtectOttd, default off = TT behaviour).
        const protectOttd = getSetting(app.game.state, 'autoreplaceProtectOttd') === true;
        const pt = protectTitle(protectOttd);
        if (protectCb.title !== pt) { protectCb.title = pt; protectLabel.title = pt; }
        protectLabel.style.display = selG ? 'inline-flex' : 'none';
        if (selG) liveryRow(selG);
        gStats.style.display = hasGroup ? 'grid' : 'none';
        if (hasGroup) {
          const statsVehicles = all.filter((v) => inGroup(v, state.group)
            && (state.filter === 'all' || v.kind === state.filter) && inCargo(v, state.cargo));
          const st = groupStatistics(statsVehicles);
          setText(gStatsValue[0], money(st.profitThisYear));
          gStatsValue[0].classList.toggle('neg', st.profitThisYear < 0);
          setText(gStatsValue[1], money(st.profitLastYear));
          gStatsValue[1].classList.toggle('neg', st.profitLastYear < 0);
          setText(gStatsValue[2], `${st.occupancy}%`);
          gStatsValue[2].classList.toggle('neg', false);
          setText(gStatsValue[3], groupKindLabel(st.counts));
        }
        // grouped view gets its own column tracks (css .grouped) so bucket rows line up with the bucket header
        head.classList.toggle('grouped', grouped);
        list.classList.toggle('grouped', grouped);
        if (!grouped) {
          setHead('veh');
          const vs = sortVehicles(all, state);
          setText(summary, `${vs.length} of ${all.length} vehicle(s) · profit this year ${money(p)}`);
          listOrEmpty(list, vs, (v) => 'v:' + v.id, (v) => createRow({ kind: 'veh', v }), (row, v) => updateRow(row, { kind: 'veh', v }),
            'No vehicles yet — build a depot and buy one');
        } else {
          // one pass over the filtered vehicles (name order, so the first member labels a shared-orders bucket), then buckets
          const vs = sortVehicles(all, { ...state, sort: 'name', dir: 1 });
          const buckets = sortBuckets(bucketVehicles(vs, { by: state.by, groups }), { sort: state.bsort, dir: state.dir });
          // nested groups: indent a group bucket by its depth in the parent chain
          if (state.by === 'group') for (const b of buckets) {
            if (!String(b.key).startsWith('g:')) continue;
            const g = groups.find((x) => x.id === Number(String(b.key).slice(2)));
            if (g) b.label = '  '.repeat(groupDepth(groups, g)) + b.label;
          }
          const items = [];
          for (const b of buckets) {
            items.push({ kind: 'bucket', key: 'b:' + b.key, b });
            if (state.open.has(b.key)) for (const v of b.vehicles) items.push({ kind: 'veh', key: 'v:' + v.id, v });
          }
          setHead('bucket');
          setText(summary, `${buckets.length} group(s) of ${vs.length} vehicle(s) · profit this year ${money(p)}`);
          listOrEmpty(list, items, (it) => it.key, createRow, updateRow, 'No vehicles yet — build a depot and buy one');
        }
      };
      refresh();
      return refresh;
    },
  });
}
