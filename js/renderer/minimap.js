/**
 * Minimap: isometric overview of the map (terrain, water, towns, industries, rail, road),
 * vehicle dots, and the camera viewport rectangle. Click/drag to move the camera.
 */
import { collectLinks, linkColour, linkWidth } from './layers/linkOverlay.js';
import { MINIMAP } from './palette.js';
import { HALF_W } from './iso.js';
import { metroData } from './layers/metro.js';

/**
 * Parse #rrggbb into packed ABGR (little-endian ImageData uint32).
 * @param {string} hex
 * @returns {number}
 */
function packColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
}

const PACKED = Object.fromEntries(Object.entries(MINIMAP).map(([k, v]) => [k, packColor(v)]));

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./renderer.js').Renderer} renderer
   */
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    this.renderer = renderer;
    this.base = document.createElement('canvas');
    this.lastBase = -Infinity;
    this.dragging = false;
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; canvas.setPointerCapture(e.pointerId); this.jump(e); });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.jump(e); });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Scale/offset of the iso projection into the minimap canvas. */
  layout() {
    const m = this.renderer.game.state.map;
    const cw = this.canvas.width, ch = this.canvas.height;
    const s = Math.min(cw / (m.width + m.height), (ch * 2) / (m.width + m.height));
    const ox = cw / 2 - ((m.width - m.height) * s) / 2;
    const oy = ch / 2 - ((m.width + m.height) * s) / 4;
    return { s, ox, oy, m };
  }

  /**
   * Move the camera to the clicked map point.
   * @param {PointerEvent} e
   */
  jump(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) * this.canvas.width) / rect.width;
    const my = ((e.clientY - rect.top) * this.canvas.height) / rect.height;
    const { s, ox, oy } = this.layout();
    const a = (mx - ox) / s, b = (2 * (my - oy)) / s; // a = x - y, b = x + y
    this.renderer.camera.centerOn((a + b) / 2, (b - a) / 2);
  }

  /** Rebuild the per-tile colour image. */
  rebuildBase() {
    const state = this.renderer.game.state;
    const m = state.map;
    if (this.base.width !== m.width || this.base.height !== m.height) {
      this.base.width = m.width;
      this.base.height = m.height;
    }
    const bctx = /** @type {CanvasRenderingContext2D} */ (this.base.getContext('2d'));
    const img = bctx.createImageData(m.width, m.height);
    const px = new Uint32Array(img.data.buffer);
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i];
      const b = t.building;
      let c;
      if (b && b.type === 'landmark') c = PACKED.landmark;
      else if (b && b.type === 'station' && b.kind === 'airport') c = b.part === 'runway' || b.part === 'runwayDep' ? PACKED.runway : PACKED.apron;
      else if (b && b.type === 'depot' && b.kind === 'air') c = PACKED.apron;
      else if (b) c = PACKED[b.type] || PACKED.house;
      else if (t.rail) c = PACKED.rail;
      else if (t.road) c = t.avenue === 1 ? PACKED.avenue : t.avenue === 2 ? PACKED.avenue2 : PACKED.road;
      else c = PACKED[t.terrain] || PACKED.grass;
      px[i] = c;
    }
    bctx.putImageData(img, 0, 0);
  }

  /**
   * Draw the minimap. Base terrain is refreshed at most every second.
   * @param {number} now ms timestamp
   */
  draw(now) {
    if (now - this.lastBase > 1000) {
      this.rebuildBase();
      this.lastBase = now;
      this._key = null; // base terrain changed: repaint
    }
    const { ctx, canvas } = this;
    const { s, ox, oy } = this.layout();
    // PF2: skip the repaint when everything it shows is unchanged (paused sim, still camera). The key
    // covers the sim tick, camera, canvas size and the overlay flags; the base is rebuilt above.
    const R = this.renderer, cam = R.camera, st = R.game.state;
    const key = [st.tick, cam.x, cam.y, cam.zoom, cam.viewW, cam.viewH, canvas.width, canvas.height,
      R.showMetro ? 1 : 0, R.showLinks ? 1 : 0, R.linkCargos, this.base.width].join('|');
    // the key misses edits made while paused (tick unchanged): repaint at least every 250 ms
    if (key === this._key && st === this._state && now - this._paintT < 250) return;
    this._key = key; this._state = st; this._paintT = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, s / 2, -s, s / 2, ox, oy);
    ctx.drawImage(this.base, -0.5, -0.5);
    // metro lines (tunnel tiles) when the metro overlay is on
    if (this.renderer.showMetro) {
      const state = this.renderer.game.state, m = state.map;
      const md = metroData(state);
      if (md) {
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.9;
        for (const e of md.edges) {
          ctx.strokeStyle = e.color;
          ctx.beginPath();
          ctx.moveTo(e.a % m.width + 0.5, Math.floor(e.a / m.width) + 0.5);
          ctx.lineTo(e.b % m.width + 0.5, Math.floor(e.b / m.width) + 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    // link graph overlay (hotkey ,): one line per link between station tiles, usage colours
    if (this.renderer.showLinks) {
      const state = this.renderer.game.state, m = state.map;
      const pos = new Map();
      for (const st of state.stations || []) pos.set(st.id, st);
      ctx.lineCap = 'round';
      for (const l of collectLinks(state, { cargos: this.renderer.linkCargos })) {
        const p = pos.get(l.a), q = pos.get(l.b);
        if (!p || !q) continue;
        ctx.strokeStyle = linkColour(l.usage);
        ctx.lineWidth = Math.max(1, linkWidth(l.cap) * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.x + 0.5, p.y + 0.5);
        ctx.lineTo(q.x + 0.5, q.y + 0.5);
        ctx.stroke();
      }
    }
    // vehicles
    ctx.fillStyle = MINIMAP.vehicle;
    for (const v of this.renderer.game.state.vehicles) {
      if (v.state === 'depot') continue;
      ctx.fillRect(v.tx - 0.5, v.ty - 0.5, 1.2, 1.2);
    }
    // viewport rectangle: world-screen -> minimap is a uniform scale k = s / HALF_W
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = this.renderer.camera.worldRect(0);
    const k = s / HALF_W;
    ctx.strokeStyle = MINIMAP.viewport;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox + r.x0 * k) + 0.5, Math.round(oy + r.y0 * k) + 0.5, Math.round((r.x1 - r.x0) * k), Math.round((r.y1 - r.y0) * k));
  }
}
