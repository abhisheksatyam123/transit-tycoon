/**
 * Autoreplace window (OpenTTD autoreplace_gui, simplified): one row per model the company (or the selected vehicle
 * group) runs, with the number of vehicles, a select of compatible purchasable replacement models and \"Stop replacing\".
 * Rules apply when a vehicle of that model is stopped in a depot (simulation/autorenew.js). The scope selector switches
 * between the company-wide rule table and a group's own rules (group rule wins for that group's vehicles).
 * Two sections: the vehicles themselves (engines, buses, trucks...) and the wagons carried by trains. Wagon rules use
 * the same storage and commands, keyed by the wagon model id (see simulation/autoreplace.js).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty, heading } from './common.js';
import { kmhText } from '../format.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';
import { replacementCandidates, isReplaceWhenOld, autoreplaceWhenOldState, keepLengthState } from '../../simulation/autoreplace.js';
import { wagonList } from '../../simulation/consist.js';
import { getSetting, setSetting } from '../../simulation/settings.js';

/**
 * Vehicle and wagon counts per model for the vehicles in scope (player vehicles; `groupId` null = all of them).
 * A train counts once under its engine model and once per wagon under the wagon model (wagonList, so mixed consists
 * are split). Pure: no DOM, no state writes.
 * @param {Array<object>} vehicles
 * @param {number|null} groupId
 * @returns {{engines: Record<string, number>, wagons: Record<string, number>}}
 */
export function autoreplaceCounts(vehicles, groupId = null) {
  const engines = {};
  const wagons = {};
  for (const v of vehicles) {
    if (v.ownerId != null || (groupId != null && v.groupId !== groupId)) continue;
    engines[v.modelId] = (engines[v.modelId] || 0) + 1;
    if (v.kind === 'train') for (const w of wagonList(v)) wagons[w.modelId] = (wagons[w.modelId] || 0) + 1;
  }
  return { engines, wagons };
}

/** Wagon models (kind 'wagon') that appear in a wagon counts map, sorted by name. */
export function wagonRowModels(wagons) {
  return Object.keys(wagons).map((id) => MODEL_BY_ID[id]).filter((m) => m && m.kind === 'wagon')
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One autoreplace row (static DOM; text and select options are filled by updateRow). Shared by both sections. */
function createRow(m, app) {
  const sel = el('select.input', { 'aria-label': `Replace ${m.name} with` });
  const cb = el('input', { type: 'checkbox', 'aria-label': `Replace ${m.name} only when old`,
    title: 'Replace only when old (off: replace at any age, the default)' });
  const cbLabel = el('label.muted', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
    title: 'Replace only when old' }, cb, 'when old');
  // Group scope: tri-state select (inherit the company flag / force on / force off) instead of the company checkbox.
  const wo = el('select.input', { 'aria-label': `When old for ${m.name}`, title: 'Replace only when old' });
  const woLabel = el('label.muted', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, wo);
  const row = el('div.table-row', null,
    el('span', null, el('span.name'), el('div.muted.small', { style: { fontSize: '0.85em' } })), el('span.mono.num'), el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, sel, cbLabel, woLabel),
    el('button.btn.sm', { type: 'button', text: 'Stop', title: 'Stop replacing this model',
      onclick: () => app.exec(row._setRule(m.id, null), { sound: 'click' }) }));
  row._sel = sel;
  row._cb = cb;
  row._cbLabel = cbLabel;
  row._wo = wo;
  row._woLabel = woLabel;
  row._name = row.children[0].children[0];
  row._hint = row.children[0].children[1];
  return row;
}

/**
 * @param {import('../app.js').App} app
 * @param {string} [modelId] optional model to focus (unused for layout, kept for vehicle-window links)
 */
export function openAutoreplace(app) {
  return app.wm.open('autoreplace', {
    title: 'Autoreplace',
    width: 460,
    build(body) {
      const summary = el('div.muted', { text: 'Vehicles stopped in a depot are replaced by the model you choose here. Group rules apply to that group only and win over the company rule.' });
      const scope = el('select.input', { 'aria-label': 'Autoreplace rule scope' });
      const scopeRow = el('label.muted', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, 'Rules for ', scope);
      // Keep train length (D1/D2): company scope edits the setting, group scope edits the lazy tri-state group flag.
      const keepCb = el('input', { type: 'checkbox', 'aria-label': 'Keep train length when replacing',
        title: 'Sell the wagons that would make the replacement longer than the old train' });
      const keepCbLabel = el('label.muted', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, keepCb, 'Keep train length');
      const keepSel = el('select.input', { 'aria-label': 'Keep train length for this group',
        title: 'Sell the wagons that would make the replacement longer than the old train' });
      const keepSelLabel = el('label.muted', { style: { display: 'none', alignItems: 'center', gap: '4px' } }, 'Keep train length ', keepSel);
      const keepRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0' } }, keepCbLabel, keepSelLabel);
      const list = el('div.list.scroll.table');
      const wagonHead = heading('Train wagons');
      const wagonHint = el('div.muted.small', { text: 'Replacing a wagon keeps the wagon count of the train and swaps only its wagon model. A wagon rule alone makes a train eligible; the engine stays.' });
      const wagonListEl = el('div.list.scroll.table');
      body.append(summary, scopeRow, keepRow, heading('Vehicles'), list, wagonHead, wagonHint, wagonListEl);
      // Scope options: company, then every vehicle group. Rebuilt here (not in refresh) so a selection survives refreshes.
      const refreshScope = () => {
        const groups = app.game.state.company.groups || [];
        const keep = scope.value;
        scope.replaceChildren(el('option', { value: '', text: 'Company (all vehicles)' }),
          ...groups.map((grp) => el('option', { value: String(grp.id), text: grp.name })));
        scope.value = groups.some((grp) => String(grp.id) === keep) ? keep : '';
      };
      const refresh = () => {
        const g = app.game;
        const company = g.state.company;
        const year = g.state.date.year;
        const gid = scope.value === '' ? null : Number(scope.value);
        // Keep-length control: a plain checkbox at company scope, a tri-state (inherit/on/off) at group scope.
        const ks = keepLengthState(g.state, gid);
        const groupScope = gid != null;
        keepCbLabel.style.display = groupScope ? 'none' : '';
        keepSelLabel.style.display = groupScope ? '' : 'none';
        if (groupScope) {
          keepSel.replaceChildren(
            el('option', { value: '', text: `inherit company (${ks.company ? 'on' : 'off'})` }),
            el('option', { value: 'on', text: 'on' }),
            el('option', { value: 'off', text: 'off' }));
          keepSel.value = ks.inherited ? '' : (ks.value ? 'on' : 'off');
          keepSel.onchange = () => {
            const value = keepSel.value === '' ? null : keepSel.value === 'on';
            app.exec(g.setGroupKeepLength(gid, value), { sound: 'click' });
            refresh();
          };
        } else {
          keepCb.checked = ks.value;
          keepCb.onchange = () => { setSetting(g.state, 'renewKeepLength', keepCb.checked); refresh(); };
        }
        const { engines: counts, wagons: wagonCounts } = autoreplaceCounts(g.state.vehicles, gid);
        const rules = gid == null ? (company.autoreplace || {})
          : ((company.groupAutoreplace && company.groupAutoreplace[gid]) || {});
        const setRule = (modelId, newModelId) => (gid == null
          ? g.setAutoreplace(modelId, newModelId)
          : g.setGroupAutoreplace(gid, modelId, newModelId));
        // Human-readable effective rule for one model (mirrors autoreplaceTarget's precedence; display only).
        const effectiveHint = (modelId) => {
          const own = rules[modelId];
          if (gid == null) return own ? `Company rule → ${MODEL_BY_ID[own]?.name || own}` : 'No company rule';
          const grp = (company.groups || []).find((x) => x.id === gid);
          const protectedGroup = !!(grp && grp.replaceProtect);
          const ottd = getSetting(g.state, 'autoreplaceProtectOttd') === true;
          if (protectedGroup && !ottd) return 'Blocked by group protection (no replacement, incl. company rule)';
          if (own) return `Group rule applies → ${MODEL_BY_ID[own]?.name || own}`;
          if (protectedGroup) return 'Company rule blocked by group protection';
          const co = (company.autoreplace || {})[modelId];
          return co ? `Company rule applies (inherited) → ${MODEL_BY_ID[co]?.name || co}` : 'No group or company rule';
        };
        // One section: rows for `models`, counts from `countMap`, rules shared by engines and wagons.
        const fillSection = (container, models, countMap, emptyText) => {
          listOrEmpty(container, models, (m) => m.id,
            (m) => createRow(m, app),
            (row, m) => {
              const c = row.children;
              setText(row._name, m.name);
              setText(row._hint, effectiveHint(m.id));
              setText(c[1], `×${countMap[m.id]}`);
              const sel = row._sel;
              row._setRule = setRule;
              const cands = replacementCandidates(m.id, year, getSetting(g.state, 'neverExpireVehicles'));
              sel.onchange = () => {
                if (sel.value) app.exec(setRule(m.id, sel.value), { sound: 'click' });
                refresh();
              };
              const cur = rules[m.id] || '';
              sel.replaceChildren(el('option', { value: '', text: '— keep (no rule) —' }),
                ...cands.map((c2) => el('option', { value: c2.id, text: `${c2.name} (${kmhText(c2.speed)})` })));
              sel.value = cur;
              const cb = row._cb;
              const wo = row._wo;
              const groupScope = gid != null;
              // Company scope shows the plain checkbox; group scope shows the tri-state (inherited / on / off).
              row._cbLabel.style.display = groupScope ? 'none' : '';
              row._woLabel.style.display = groupScope ? '' : 'none';
              if (groupScope) {
                const st = autoreplaceWhenOldState(g.state, gid, m.id);
                wo.replaceChildren(
                  el('option', { value: '', text: `inherit company (${st.company ? 'on' : 'off'})` }),
                  el('option', { value: 'on', text: 'when old: on' }),
                  el('option', { value: 'off', text: 'when old: off' }));
                wo.value = st.inherited ? '' : (st.value ? 'on' : 'off');
                wo.disabled = !cur;
                wo.onchange = () => {
                  const v = wo.value === '' ? null : wo.value === 'on';
                  app.exec(g.setGroupAutoreplaceWhenOld(gid, m.id, v), { sound: 'click' });
                  refresh();
                };
              } else {
                cb.checked = isReplaceWhenOld(g.state, m.id);
                cb.disabled = !cur;
                cb.onchange = () => app.exec(g.setAutoreplaceWhenOld(m.id, cb.checked), { sound: 'click' });
              }
              c[3].disabled = !cur;
            }, emptyText);
        };
        const models = Object.keys(counts).map((id) => MODEL_BY_ID[id]).filter(Boolean)
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
        fillSection(list, models, counts, gid == null ? 'No vehicles yet — buy one first' : 'No vehicles in this group');
        fillSection(wagonListEl, wagonRowModels(wagonCounts), wagonCounts,
          gid == null ? 'No train wagons yet' : 'No train wagons in this group');
      };
      refreshScope();
      scope.onchange = () => refresh();
      refresh();
      return refresh;
    },
  });
}
