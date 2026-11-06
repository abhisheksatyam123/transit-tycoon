/**
 * City Issues window: diagnostics summary with severity/category filters. Scans are
 * cached (see diagCache.js). Clicking a row focuses the tile or opens the related window.
 */
import { el, setText, clear } from '../dom.js';
import { scanIssues } from '../diagCache.js';

const SEVERITIES = ['error', 'warn', 'info'];
const SEV_LABEL = { error: 'Errors', warn: 'Warnings', info: 'Info' };
const SEV_COLOR = { error: '#f87171', warn: '#fbbf24', info: '#38bdf8' };
const CATEGORIES = ['network', 'traffic', 'vehicle', 'station', 'finance', 'town', 'invariant'];

/**
 * Handle a click on an issue: centre/select the tile and open related windows.
 * @param {import('../app.js').App} app
 * @param {any} i issue
 */
export function focusIssue(app, i) {
  if (typeof i.x === 'number' && typeof i.y === 'number') {
    app.renderer.overlay.selection = [{ x: i.x, y: i.y }];
    app.centerOn(i.x, i.y);
  }
  if (typeof i.vehicleId === 'number') app.open('vehicle', i.vehicleId);
  else if (typeof i.stationId === 'number') app.open('station', i.stationId);
  else if (typeof i.townId === 'number') app.open('town', i.townId);
}

/**
 * @param {import('../app.js').App} app
 */
export function openIssues(app) {
  return app.wm.open('issues', {
    title: 'City Issues',
    width: 400,
    build(body) {
      let sevFilter = null, catFilter = null, lastSig = '';
      const chips = el('div.chips');
      const sevBtns = el('div.btn-row');
      const catBtns = el('div.btn-row');
      const status = el('div.muted.small');
      const list = el('div.list.scroll');
      const rescan = el('button.btn.sm', { type: 'button', text: 'Re-scan', onclick: () => { scanIssues(app.game, true); lastSig = ''; refresh(); } });
      body.append(el('div.btn-row', null, rescan, status), chips, heading2('Severity'), sevBtns, heading2('Category'), catBtns, list);

      const mkFilter = (host, label, value, color, onSet) => {
        const b = el('button.btn.sm', { type: 'button', text: label, onclick: () => { onSet(); lastSig = ''; refresh(); } });
        if (color) b.style.color = color;
        b.dataset.value = value;
        host.append(b);
        return b;
      };
      const sevEls = [mkFilter(sevBtns, 'All', '', null, () => { sevFilter = null; })];
      for (const s of SEVERITIES) sevEls.push(mkFilter(sevBtns, SEV_LABEL[s], s, SEV_COLOR[s], () => { sevFilter = s; }));
      const catEls = [mkFilter(catBtns, 'All', '', null, () => { catFilter = null; })];
      for (const c of CATEGORIES) catEls.push(mkFilter(catBtns, c, c, null, () => { catFilter = c; }));

      /** Repaint filter button active state. */
      const paintFilters = () => {
        for (const b of sevEls) b.classList.toggle('active', (b.dataset.value || null) === sevFilter);
        for (const b of catEls) b.classList.toggle('active', (b.dataset.value || null) === catFilter);
      };

      const refresh = () => {
        const r = scanIssues(app.game);
        if (!r.available) { setText(status, r.error); clear(list); list.append(el('div.empty', { text: 'Diagnostics not available' })); return; }
        if (!r.issues) { setText(status, r.error || 'No issues found so far · scanning…'); return; }
        const issues = r.issues;
        const sum = r.summary || { error: 0, warn: 0, info: 0 };
        const sig = JSON.stringify([issues.length, sum.error, sum.warn, sum.info, sevFilter, catFilter, !!r.scanning, issues.map((i) => i.id).join('|')]);
        paintFilters();
        if (sig === lastSig) return;
        lastSig = sig;
        setText(status, r.error ? r.error : `${issues.length} issue(s)` + (r.scanning ? ' · scanning…' : r.at ? ` · scanned ${new Date(r.at).toLocaleTimeString()}` : ''));
        clear(chips);
        for (const s of SEVERITIES) {
          chips.append(el('span.chip', { style: { color: SEV_COLOR[s], borderColor: SEV_COLOR[s] } }, `${SEV_LABEL[s]}: ${sum[s] || 0}`));
        }
        clear(list);
        const shown = issues.filter((i) => (!sevFilter || i.severity === sevFilter) && (!catFilter || i.category === catFilter));
        if (!shown.length) { list.append(el('div.empty', { text: issues.length ? 'No issues match this filter' : r.scanning ? 'No issues found so far' : 'No issues found' })); return; }
        for (const i of shown.slice(0, 300)) {
          const clickable = typeof i.x === 'number' || typeof i.vehicleId === 'number' || typeof i.stationId === 'number' || typeof i.townId === 'number';
          list.append(el('button.list-row.issue-row', {
            type: 'button', disabled: !clickable, title: clickable ? 'Click to locate' : '',
            onclick: () => focusIssue(app, i),
          }, el('span.sev-dot', { style: { background: SEV_COLOR[i.severity] || '#94a3b8' } }),
          el('span.cat.mono', { text: i.category }), el('span.name', { text: i.message })));
        }
        if (shown.length > 300) list.append(el('div.muted.small', { text: `…and ${shown.length - 300} more` }));
      };
      return refresh;
    },
  });
}

/**
 * Small inline heading.
 * @param {string} t
 */
function heading2(t) {
  return el('div.win-h', { text: t });
}
