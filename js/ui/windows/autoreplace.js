/**
 * Autoreplace window (OpenTTD autoreplace_gui, simplified): one row per model the company (or the selected vehicle
 * group) runs, with the number of vehicles, a select of compatible purchasable replacement models and "Stop replacing".
 * Rules apply when a vehicle of that model is stopped in a depot (simulation/autorenew.js). The scope selector switches
 * between the company-wide rule table and a group's own rules (group rule wins for that group's vehicles).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { kmhText } from '../format.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';
import { replacementCandidates, isReplaceWhenOld, autoreplaceWhenOldState } from '../../simulation/autoreplace.js';
import { getSetting } from '../../simulation/settings.js';

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
      const list = el('div.list.scroll.table');
      body.append(summary, scopeRow, list);
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
        const inScope = (v) => v.ownerId == null && (gid == null || v.groupId === gid);
        const counts = {};
        for (const v of g.state.vehicles) if (inScope(v)) counts[v.modelId] = (counts[v.modelId] || 0) + 1;
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
        const models = Object.keys(counts).map((id) => MODEL_BY_ID[id]).filter(Boolean)
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
        listOrEmpty(list, models, (m) => m.id,
          (m) => {
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
                onclick: () => app.exec(setRule(m.id, null), { sound: 'click' }) }));
            row._sel = sel;
            row._cb = cb;
            row._cbLabel = cbLabel;
            row._wo = wo;
            row._woLabel = woLabel;
            row._name = row.children[0].children[0];
            row._hint = row.children[0].children[1];
            return row;
          },
          (row, m) => {
            const c = row.children;
            setText(row._name, m.name);
            setText(row._hint, effectiveHint(m.id));
            setText(c[1], `×${counts[m.id]}`);
            const sel = row._sel;
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
          }, gid == null ? 'No vehicles yet — buy one first' : 'No vehicles in this group');
      };
      refreshScope();
      scope.onchange = () => refresh();
      refresh();
      return refresh;
    },
  });
}
