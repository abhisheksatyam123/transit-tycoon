/**
 * Link graph overlay (OpenTTD linkgraph_gui.cpp LinkGraphOverlay, simplified). One line per link between two
 * station signs, coloured by usage (green -> yellow -> red, OTTD LINK_COLOURS), width 1..4 px by capacity.
 *
 * - cargodist on: the links are the cargodist edges (state.cargoDist[PASS|MAIL].edges). capacity = seats offered
 *   last month (edge.cap); usage = seats departed this month / capacity (edge.used / edge.cap, capped at 1).
 * - cargodist off: the links are consecutive order pairs of the vehicles. capacity = seats of the vehicles on that
 *   pair; usage = their current load / capacity (live fill, the proxy for cargo moved).
 *
 * collectLinks is pure (no DOM, no canvas) so it is unit-tested; drawLinkOverlay is screen-space and runs after the
 * world, below the station name signs.
 */
import { cargodistOn, CD_CARGOS } from '../../simulation/cargodist.js';

/** Usage colour stops (OTTD LINK_COLOURS: unused green, half used yellow, full red). */
export const LINK_COLOURS = [[0, [34, 197, 94]], [0.5, [250, 204, 21]], [1, [239, 68, 68]]];

/**
 * @param {number} usage 0..1 (values outside are clamped)
 * @returns {string} css rgb colour
 */
export function linkColour(usage) {
  const u = Math.max(0, Math.min(1, Number.isFinite(usage) ? usage : 0));
  for (let i = 1; i < LINK_COLOURS.length; i++) {
    const [t1, c1] = LINK_COLOURS[i];
    const [t0, c0] = LINK_COLOURS[i - 1];
    if (u <= t1) {
      const f = (u - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  const last = LINK_COLOURS[LINK_COLOURS.length - 1][1];
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}

/** Line width in px from capacity (seats per month): 1 + cap/60, clamped to 1..4. */
export function linkWidth(cap) {
  return Math.max(1, Math.min(4, 1 + Math.floor((cap || 0) / 60)));
}

/**
 * Collect the links to draw.
 * @param {any} state game state
 * @param {{cargos?: Record<string, boolean>}} [opts] cargo filter (missing cargo = shown)
 * @returns {{cargoId:string, a:number, b:number, cap:number, used:number, usage:number, source:'graph'|'orders'}[]}
 */
export function collectLinks(state, opts = {}) {
  const on = (c) => !opts.cargos || opts.cargos[c] !== false;
  const out = [];
  if (cargodistOn(state)) {
    for (const c of CD_CARGOS) {
      const g = state.cargoDist && state.cargoDist[c];
      if (!g || !g.edges || !on(c)) continue;
      for (const e of Object.values(g.edges)) {
        const cap = e.cap || 0, used = e.used || 0;
        out.push({ cargoId: c, a: e.a, b: e.b, cap, used, usage: cap > 0 ? Math.min(1, used / cap) : 0, source: 'graph' });
      }
    }
    return out;
  }
  // orders fallback: one aggregated link per (cargo, from, to) over all vehicles' consecutive order stops
  const byKey = new Map();
  for (const v of state.vehicles || []) {
    const os = v.orders || [];
    const n = os.length;
    if (n < 2 || !v.cargoId || !on(v.cargoId)) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = os[i].stationId, b = os[j].stationId;
      if (a == null || b == null || a === b) continue;
      const k = v.cargoId + ':' + a + '>' + b;
      let l = byKey.get(k);
      if (!l) { l = { cargoId: v.cargoId, a, b, cap: 0, used: 0, usage: 0, source: 'orders' }; byKey.set(k, l); }
      l.cap += v.capacity || 0;
      // a vehicle heading to stop j has just left stop i: its load is on that link
      if (v.orderIndex % n === j && v.load) l.used += v.load.amount || 0;
    }
  }
  for (const l of byKey.values()) {
    l.usage = l.cap > 0 ? Math.min(1, l.used / l.cap) : 0;
    out.push(l);
  }
  return out;
}

/**
 * Draw the link overlay on the main view (screen space, CSS-px transform set by the caller).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} renderer
 * @param {{zoom:number, worldToScreen:Function}} cam
 */
export function drawLinkOverlay(ctx, renderer, cam) {
  const state = renderer.game.state;
  const links = collectLinks(state, { cargos: renderer.linkCargos });
  if (!links.length) return;
  const stations = new Map();
  for (const st of state.stations || []) {
    const c = renderer.tileCenterScreen(st.x, st.y);
    stations.set(st.id, cam.worldToScreen(c.x, c.y));
  }
  ctx.save();
  ctx.lineCap = 'round';
  // draw the thick lines first, then the dots on top
  for (const l of links) {
    const p = stations.get(l.a), q = stations.get(l.b);
    if (!p || !q) continue;
    // offset the two directions of a pair sideways so they do not sit on one line
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = l.a < l.b ? 2 : -2;
    const ox = (-dy / len) * off, oy = (dx / len) * off;
    ctx.beginPath();
    ctx.moveTo(p.x + ox, p.y + oy);
    ctx.lineTo(q.x + ox, q.y + oy);
    ctx.strokeStyle = linkColour(l.usage);
    ctx.lineWidth = linkWidth(l.cap);
    ctx.globalAlpha = 0.85;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of stations.values()) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  }
  ctx.restore();
}
