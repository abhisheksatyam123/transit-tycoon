/**
 * Link graph overlay controls shared by the hotkey (',' in js/ui/hotkeys.js), the toolbar flyout and the Map window
 * checkbox, plus the legend panel (OpenTTD LinkGraphLegendWindow, simplified). The panel sits directly above the
 * minimap (measured from #minimap-wrap, re-placed every frame), lists only the cargos that appear in the current
 * links (Passengers and Mail always), and shows the usage colour scale.
 */
import { el } from './dom.js';
import { LINK_COLOURS, collectLinks } from '../renderer/layers/linkOverlay.js';
import { CARGO_BY_ID } from '../config/cargos.js';

/** Cargos that always get a toggle (cargodist applies to them). */
const ALWAYS = ['PASS', 'MAIL'];

/**
 * Flip the link overlay (single source of truth for hotkey, toolbar and Map window).
 * @param {any} renderer
 * @returns {boolean} new state
 */
export function toggleLinkOverlay(renderer) {
  renderer.showLinks = !renderer.showLinks;
  syncLinkLegend(renderer);
  return renderer.showLinks;
}

/** Legend element (created once, appended to body). */
function linkLegend() {
  let box = document.getElementById('linkLegend');
  if (box) return box;
  box = el('div', { id: 'linkLegend', role: 'region', 'aria-label': 'Link graph legend', style: {
    position: 'fixed', zIndex: '40', background: 'rgba(10,15,26,0.92)', color: '#e2e8f0',
    border: '1px solid #334155', borderRadius: '6px', padding: '8px 10px', fontSize: '12px',
    minWidth: '170px', display: 'none' } });
  document.body.appendChild(box);
  return box;
}

/**
 * Position the legend directly above the minimap wrapper (right-aligned to it). Falls back to the bottom-right
 * corner when the minimap is not in the DOM. Keeps the panel inside the viewport.
 */
export function placeLinkLegend(box) {
  const wrap = document.getElementById('minimap-wrap');
  const vw = window.innerWidth || 1400, vh = window.innerHeight || 860;
  const r = wrap ? wrap.getBoundingClientRect() : { left: vw - 220, right: vw - 10, top: vh - 130 };
  const h = box.offsetHeight || 200;
  const top = Math.max(4, r.top - 8 - h);
  const right = Math.max(4, vw - r.right);
  box.style.top = top + 'px';
  box.style.right = right + 'px';
  box.style.bottom = 'auto';
  box.style.left = 'auto';
}

/** Cargo ids to list now: PASS and MAIL plus any other cargo present in the links. */
export function linkCargoIds(state) {
  const ids = new Set(ALWAYS);
  for (const l of collectLinks(state)) ids.add(l.cargoId);
  return [...ids];
}

/** Show/hide the legend, rebuild its rows when the cargo set changes, and place it. */
export function syncLinkLegend(renderer, state = renderer.game && renderer.game.state) {
  const box = linkLegend();
  box.style.display = renderer.showLinks ? 'block' : 'none';
  document.querySelectorAll('[data-toggle="linkOverlay"]').forEach((b) => {
    b.setAttribute('aria-checked', String(!!renderer.showLinks));
    b.classList.toggle('active', !!renderer.showLinks);
  });
  const cw = document.querySelector('[data-link-map-cb]');
  if (cw) cw.checked = !!renderer.showLinks;
  if (!renderer.showLinks) return;
  const ids = state ? linkCargoIds(state) : ALWAYS;
  const sig = ids.join(',');
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    const cargos = renderer.linkCargos || {};
    box.replaceChildren(
      el('div', { style: { fontWeight: '600', marginBottom: '4px' }, text: 'Link graph' }),
      ...ids.map((id) => {
        const cb = el('input', { type: 'checkbox', onchange: (e) => {
          renderer.linkCargos = { ...(renderer.linkCargos || {}), [id]: e.target.checked };
        } });
        cb.checked = cargos[id] !== false; // el() skips false props, so set it here
        return el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, cb,
          (CARGO_BY_ID[id] && CARGO_BY_ID[id].name) || id);
      }),
      el('div', { style: { marginTop: '6px', fontSize: '11px', color: '#94a3b8' }, text: 'Usage (capacity used)' }),
      el('div', { style: { height: '8px', borderRadius: '3px', marginTop: '3px', background:
        `linear-gradient(to right, ${LINK_COLOURS.map(([t, c]) => `rgb(${c.join(',')}) ${Math.round(t * 100)}%`).join(', ')})` } }),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' } },
        el('span', { text: '0%' }), el('span', { text: '50%' }), el('span', { text: '100%' })),
      el('div', { style: { marginTop: '4px', fontSize: '10px', color: '#94a3b8' }, text: 'Width = capacity' }));
  }
  placeLinkLegend(box);
}
