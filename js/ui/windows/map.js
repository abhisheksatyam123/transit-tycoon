/**
 * Full map window (gap #13; OpenTTD smallmap_gui.cpp / OpenLoco MapWindow.cpp). A resizable top-down
 * map with mode buttons: Terrain (contour shading), Industries (legend per type), Routes (rail, road,
 * stations, depots), Vehicles (live dots by kind), Towns (names). The per-tile base image is cached
 * per mode and rebuilt only when its map-change signature changes; the live layer (vehicles, viewport, labels) is
 * drawn on each window refresh (~4 fps). Click or drag on the map to centre the main view.
 */
import { el, setText } from '../dom.js';
import { toggleLinkOverlay } from '../linkLegend.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { HALF_W, screenToTileFloat } from '../../renderer/iso.js';
import { MINIMAP } from '../../renderer/palette.js';
import { playerColourOf } from '../../simulation/companyColour.js';

export const MAP_MODES = [
  ['terrain', 'Terrain'],
  ['industries', 'Industries'],
  ['routes', 'Routes'],
  ['vehicles', 'Vehicles'],
  ['towns', 'Towns'],
  ['owners', 'Owners'],
  ['vegetation', 'Vegetation'],
];

/** OTTD smallmap owner colours for non-company owners (towns; unowned land is the terrain tint). */
export const TOWN_OWNER_COLOR = '#f0abfc';

/** OTTD _vegetation_clear_bits, one colour per clear type (rough = rock, trees = forest, fields = farm fields). */
export const VEGETATION_COLORS = {
  grass: '#4f8a33', rough: '#8c7a55', trees: '#2f5e22', fields: '#c9c25a',
  desert: '#cdb46b', snow: '#e5ecf2', water: '#2a5f93', buildings: '#c0392b',
};

/** Vehicle dot colours by kind. */
export const VEHICLE_COLORS = { train: '#f8fafc', road: '#facc15', aircraft: '#a78bfa' };

/** Legacy cache-age constant (kept for tests/API compatibility): base images are now invalidated by map signature, not by age. */
export const BASE_TTL_MS = 3000;

/**
 * Scale and offset that fit a map of mw x mh tiles into a cw x ch canvas, centred. Pure.
 * @returns {{s:number, ox:number, oy:number}}
 */
export function mapLayout(cw, ch, mw, mh) {
  const s = Math.max(0.01, Math.min(cw / Math.max(1, mw), ch / Math.max(1, mh)));
  return { s, ox: (cw - mw * s) / 2, oy: (ch - mh * s) / 2 };
}

/**
 * Canvas pixel -> tile index (floor), or null outside the map. Pure.
 * @returns {{x:number,y:number}|null}
 */
export function pixelToTile(px, py, layout, mw, mh) {
  const x = Math.floor((px - layout.ox) / layout.s);
  const y = Math.floor((py - layout.oy) / layout.s);
  if (x < 0 || y < 0 || x >= mw || y >= mh) return null;
  return { x, y };
}

/** #rrggbb -> [r,g,b]. */
export function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken/lighten an [r,g,b] by factor f (1 = unchanged). Pure. */
function shade(rgb, f) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
}

/** Contour shading factor from a tile height (flat ground = 1). Pure. */
export function contourFactor(height) {
  return Math.max(0.6, Math.min(1.35, 0.8 + (Number(height) || 0) * 0.07));
}

/**
 * Base colour of one tile for a mode, as [r,g,b]. Pure. `industryColors` maps industry id -> hex.
 * @param {any} t tile
 * @param {string} mode terrain|industries|routes|vehicles|towns
 * @param {Map<number,string>} [industryColors]
 */
export function tileRgb(t, mode, industryColors, ext) {
  const b = t.building;
  const base = MINIMAP[t.terrain] || MINIMAP.grass;
  if (mode === 'owners') return ownerRgb(t, ext);
  if (mode === 'vegetation') return vegetationRgb(t);
  if (mode === 'terrain') {
    let rgb;
    if (b && b.type === 'landmark') rgb = hexToRgb(MINIMAP.landmark);
    else if (b && b.type === 'station') rgb = hexToRgb(MINIMAP.station);
    else if (b && b.type === 'depot') rgb = hexToRgb(MINIMAP.depot);
    else if (b) rgb = hexToRgb(MINIMAP.house);
    else if (t.rail) rgb = hexToRgb(MINIMAP.rail);
    else if (t.road) rgb = hexToRgb(t.avenue === 1 ? MINIMAP.avenue : t.avenue === 2 ? MINIMAP.avenue2 : MINIMAP.road);
    else rgb = hexToRgb(base);
    return shade(rgb, contourFactor(t.height));
  }
  if (mode === 'industries') {
    if (b && b.type === 'industry') return hexToRgb((industryColors && industryColors.get(b.industryId)) || MINIMAP.industry);
    return shade(hexToRgb(base), 0.45);
  }
  if (mode === 'routes') {
    if (b && b.type === 'station') return hexToRgb(MINIMAP.station);
    if (b && b.type === 'depot') return hexToRgb(MINIMAP.depot);
    if (t.rail) return hexToRgb(MINIMAP.rail);
    if (t.road) return hexToRgb(MINIMAP.road);
    return shade(hexToRgb(base), 0.4);
  }
  if (mode === 'towns') {
    if (b && b.type === 'house') return hexToRgb(MINIMAP.house);
    if (b && b.type === 'landmark') return hexToRgb(MINIMAP.landmark);
    if (b) return hexToRgb(MINIMAP.house);
    return shade(hexToRgb(base), 0.4);
  }
  // vehicles: faded terrain, vehicles are drawn live
  return shade(hexToRgb(base), 0.35);
}

/**
 * Vegetation colour of one tile (OTTD vegetation layer). Pure. Buildings and fields win over the
 * ground type; roads and rails show as buildings (OTTD draws them over the clear type).
 */
export function vegetationRgb(t) {
  const b = t.building;
  if ((b && b.type) || t.rail || t.road) return hexToRgb(VEGETATION_COLORS.buildings);
  if (t.field !== undefined) return hexToRgb(VEGETATION_COLORS.fields);
  switch (t.terrain) {
    case 'forest': return hexToRgb(VEGETATION_COLORS.trees);
    case 'rock': return hexToRgb(VEGETATION_COLORS.rough);
    case 'desert': return hexToRgb(VEGETATION_COLORS.desert);
    case 'snow': return hexToRgb(VEGETATION_COLORS.snow);
    case 'water': return hexToRgb(VEGETATION_COLORS.water);
    default: return hexToRgb(VEGETATION_COLORS.grass);
  }
}

/**
 * Owner colour of one tile (OTTD owner layer). Pure. `ext` = {playerHex, rivals: Map<id,hex>,
 * stationOwner: Map<stationId, ownerId|null>}. Player (company) tiles use the player colour, AI tiles
 * their rival colour, towns TOWN_OWNER_COLOR, and unowned land the dimmed terrain tint.
 */
export function ownerRgb(t, ext) {
  const e = ext || {};
  const rivalHex = (id) => (e.rivals && e.rivals.get(id)) || '#888888';
  const b = t.building;
  if (b && b.type === 'station' && e.stationOwner && e.stationOwner.has(b.stationId)) {
    const o = e.stationOwner.get(b.stationId);
    return hexToRgb(o == null ? (e.playerHex || '#f5b300') : rivalHex(o));
  }
  if (t.owner === 'rival') return hexToRgb(t.rivalId != null ? rivalHex(t.rivalId) : '#888888');
  if (t.owner === 'company') return hexToRgb(e.playerHex || '#f5b300');
  if (t.owner === 'town' || (b && b.type === 'house')) return hexToRgb(TOWN_OWNER_COLOR);
  return shade(hexToRgb(MINIMAP[t.terrain] || MINIMAP.grass), 0.4);
}

/**
 * Industry legend: [{id, name, color}] for the types present, in config order. Pure.
 * @param {any[]} industries
 */
export function industryLegend(industries) {
  const seen = new Set();
  for (const i of industries || []) seen.add(i.typeId);
  return Object.values(INDUSTRY_BY_ID)
    .filter((t) => seen.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, color: t.color || '#888' }));
}

/** Viewport diamond corners in tile coordinates, from the camera's world rect. Pure. */
export function viewportTiles(rect) {
  const pts = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  return pts.map(([sx, sy]) => screenToTileFloat(sx, sy));
}

/** Packed ABGR colour for ImageData. */
function pack(rgb) { return (0xff << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]; }

/** Numeric code for a terrain name (cheap per-tile signature hashing). */
function terrainCode(name) {
  switch (name) {
    case 'grass': return 1;
    case 'rough': return 2;
    case 'trees': return 3;
    case 'forest': return 3;
    case 'fields': return 4;
    case 'desert': return 5;
    case 'snow': return 6;
    case 'water': return 7;
    case 'rock': return 8;
    default: return 0;
  }
}

/** Numeric code for a building type. */
function buildingCode(type) {
  switch (type) {
    case 'station': return 1;
    case 'depot': return 2;
    case 'house': return 3;
    case 'industry': return 4;
    case 'landmark': return 5;
    case 'hq': return 6;
    default: return 7;
  }
}

/**
 * Observe an element's size and return a disposer. Kept as a helper so the window's onClose
 * disconnect can be tested without a full canvas; falls back to a no-op when ResizeObserver is absent.
 * @param {HTMLElement} target
 * @param {()=>void} onResize
 * @returns {()=>void}
 */
export function observeResize(target, onResize) {
  if (typeof ResizeObserver !== 'function') return () => {};
  const ro = new ResizeObserver(onResize);
  ro.observe(target);
  return () => ro.disconnect();
}

/** Mix a string into an FNV-1a hash. */
function hashString(h, str) {
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h;
}

/**
 * Cheap change signature of everything the base image depends on: one pass over the tiles plus
 * the legend data for industries/owners. Pure. Used instead of an age timer so a large map is
 * only re-rasterised when something visible actually changed.
 */
export function mapChangeSignature(state, mode) {
  const m = state.map;
  const tiles = m.tiles || [];
  let h = 0x811c9dc5 ^ String(mode || '').length;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const b = t.building;
    let v = terrainCode(t.terrain);
    v = (Math.imul(v, 31) + ((t.height | 0) + 64)) | 0;
    v = (Math.imul(v, 31) + (t.rail ? 1 : 0) + (t.road ? 2 : 0) + (t.avenue != null ? (t.avenue | 0) + 4 : 0)) | 0;
    v = (Math.imul(v, 31) + (t.field !== undefined ? (t.field | 0) + 1 : 0)) | 0;
    v = (Math.imul(v, 31) + (t.owner === 'rival' ? 1 : t.owner === 'company' ? 2 : t.owner === 'town' ? 3 : 0)) | 0;
    v = (Math.imul(v, 31) + ((t.rivalId | 0) + 1)) | 0;
    v = (Math.imul(v, 31) + (b ? buildingCode(b.type) : 0)) | 0;
    if (b) {
      v = (Math.imul(v, 31) + ((b.industryId | 0) + 1)) | 0;
      v = (Math.imul(v, 31) + ((b.stationId | 0) + 1)) | 0;
    }
    h ^= v;
    h = Math.imul(h, 16777619);
  }
  if (mode === 'industries') {
    for (const ind of state.industries || []) {
      h = hashString(h, `${ind.id}:${ind.typeId || ''}`);
    }
  } else if (mode === 'owners') {
    h = hashString(h, playerColourOf(state));
    for (const r of state.rivals || []) h = hashString(h, `${r.id}:${r.colour || ''}`);
    for (const st of state.stations || []) h = hashString(h, `${st.id}:${st.ownerId == null ? -1 : st.ownerId}`);
  }
  return h >>> 0;
}

/** Build the per-tile image for one mode (one pixel per tile). */
function buildBase(state, mode) {
  const m = state.map;
  const cv = document.createElement('canvas');
  cv.width = m.width; cv.height = m.height;
  const bctx = cv.getContext('2d');
  const img = bctx.createImageData(m.width, m.height);
  const px = new Uint32Array(img.data.buffer);
  let ind = null;
  if (mode === 'industries') {
    ind = new Map();
    for (const i of state.industries || []) {
      const t = INDUSTRY_BY_ID[i.typeId];
      if (t) ind.set(i.id, t.color || '#888');
    }
  }
  let ext = null;
  if (mode === 'owners') {
    const rivals = new Map();
    for (const r of state.rivals || []) rivals.set(r.id, r.colour || '#888888');
    const stationOwner = new Map();
    for (const st of state.stations || []) stationOwner.set(st.id, st.ownerId ?? null);
    ext = { playerHex: playerColourOf(state), rivals, stationOwner };
  }
  for (let i = 0; i < m.tiles.length; i++) px[i] = pack(tileRgb(m.tiles[i], mode, ind, ext));
  bctx.putImageData(img, 0, 0);
  return { cv, built: performance.now(), game: state.map };
}

/**
 * Open the map window.
 * @param {import('../app.js').App} app
 */
export function openMap(app) {
  const st = { mode: 'terrain', cache: new Map(), drag: false };
  let disconnectObserver = null;
  return app.wm.open('map', {
    title: 'Map',
    width: 620,
    className: 'map-win',
    onClose: () => { if (disconnectObserver) disconnectObserver(); },
    build(body) {
      const modeSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Map mode', title: 'Map mode' },
        MAP_MODES.map(([v, l]) => el('option', { value: v, text: l })));
      modeSel.value = st.mode;
      modeSel.onchange = () => { st.mode = modeSel.value; refresh(); };
      const info = el('span.muted', { style: { marginLeft: 'auto' } });
      // link graph overlay: same state as the ',' hotkey and the toolbar item (toggleLinkOverlay)
      const linkCb = el('input', { type: 'checkbox', 'data-link-map-cb': '1' });
      linkCb.checked = !!app.renderer.showLinks;
      linkCb.onchange = () => { if (!!linkCb.checked !== !!app.renderer.showLinks) toggleLinkOverlay(app.renderer); };
      const linkLbl = el('label', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center', fontSize: '12px' } }, linkCb, el('span', { text: 'Link graph' }));
      const top = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, el('span.muted', { text: 'Mode' }), modeSel, linkLbl, info);
      const legend = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px' } });
      const wrap = el('div.map-frame', { style: { resize: 'both', overflow: 'hidden', width: '580px', height: '380px', minWidth: '260px', minHeight: '180px', maxWidth: '100%', border: '1px solid var(--panel-border)', borderRadius: '6px', background: '#05070c', position: 'relative' } });
      const canvas = el('canvas', { style: { display: 'block', width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' } });
      wrap.appendChild(canvas);
      body.append(top, legend, wrap);
      const ctx = canvas.getContext('2d');

      /** @type {{s:number,ox:number,oy:number}|null} */
      let lay = null;
      const toTile = (e) => {
        const r = canvas.getBoundingClientRect();
        const dpr = canvas.width / Math.max(1, r.width);
        const m = app.game.state.map;
        if (!lay) return null;
        // clicks in the margin around the map centre on the nearest edge tile
        const px = Math.min(m.width - 1e-6, Math.max(0, ((e.clientX - r.left) * dpr - lay.ox) / lay.s));
        const py = Math.min(m.height - 1e-6, Math.max(0, ((e.clientY - r.top) * dpr - lay.oy) / lay.s));
        return { x: Math.floor(px), y: Math.floor(py) };
      };
      const jump = (e) => { const t = toTile(e); if (t) app.centerOn(t.x + 0.5, t.y + 0.5); };
      canvas.addEventListener('pointerdown', (e) => { st.drag = true; canvas.setPointerCapture(e.pointerId); jump(e); });
      canvas.addEventListener('pointermove', (e) => { if (st.drag) jump(e); });
      canvas.addEventListener('pointerup', () => { st.drag = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      let legendSig = '';
      disconnectObserver = observeResize(wrap, () => refresh());

      const refresh = () => {
        const state = app.game.state;
        const m = state.map;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const cw = Math.max(1, Math.round(wrap.clientWidth * dpr)), ch = Math.max(1, Math.round(wrap.clientHeight * dpr));
        if (canvas.width !== cw) canvas.width = cw;
        if (canvas.height !== ch) canvas.height = ch;
        // base image: rebuilt only when the visible map data changes (no age timer at large maps)
        let entry = st.cache.get(st.mode);
        const mapSig = mapChangeSignature(state, st.mode);
        if (!entry || entry.game !== state.map || entry.sig !== mapSig) {
          entry = buildBase(state, st.mode);
          entry.sig = mapSig;
          st.cache.set(st.mode, entry);
        }
        lay = mapLayout(cw, ch, m.width, m.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#05070c';
        ctx.fillRect(0, 0, cw, ch);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(entry.cv, lay.ox, lay.oy, m.width * lay.s, m.height * lay.s);
        // live layer
        const { s, ox, oy } = lay;
        ctx.save();
        ctx.translate(ox, oy); ctx.scale(s, s);
        if (st.mode === 'vehicles' || st.mode === 'routes') {
          // tile units, but at least 3 px (vehicles) / 2 px (routes) so dots stay visible on big maps
          const dot = Math.max(st.mode === 'vehicles' ? 1.4 : 0.9, (st.mode === 'vehicles' ? 3 : 2) / s);
          for (const v of state.vehicles) {
            if (v.state === 'depot') continue;
            ctx.fillStyle = VEHICLE_COLORS[v.kind] || '#ffffff';
            ctx.fillRect(v.tx, v.ty, dot, dot);
          }
        }
        if (st.mode === 'industries') {
          // one marker per industry (>= 5 px): a 1-px tile footprint vanishes when the map is scaled down
          const mk = Math.max(2, 5 / s);
          ctx.lineWidth = 1 / s;
          ctx.strokeStyle = '#05070c';
          for (const i of state.industries || []) {
            const t = INDUSTRY_BY_ID[i.typeId];
            ctx.fillStyle = (t && t.color) || MINIMAP.industry;
            ctx.fillRect(i.x - mk / 2, i.y - mk / 2, mk, mk);
            ctx.strokeRect(i.x - mk / 2, i.y - mk / 2, mk, mk);
          }
        }
        // viewport diamond
        const r = app.renderer.camera.worldRect(0);
        const corners = viewportTiles(r);
        ctx.beginPath();
        corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.lineWidth = 1 / s;
        ctx.strokeStyle = MINIMAP.viewport;
        ctx.stroke();
        ctx.restore();
        // town labels (towns mode)
        if (st.mode === 'towns') {
          ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(5,7,12,0.85)';
          ctx.fillStyle = '#e2e8f0';
          for (const t of state.towns) {
            const x = ox + (t.x + 0.5) * s, y = oy + (t.y + 0.5) * s;
            ctx.strokeText(t.name, x, y - 3);
            ctx.fillText(t.name, x, y - 3);
          }
        }
        // legend + info
        const sig = st.mode === 'industries' ? industryLegend(state.industries).map((l) => l.id).join(',')
          : st.mode === 'owners' ? `owners:${playerColourOf(state)}:${(state.rivals || []).map((r) => r.id + r.colour).join(',')}` : st.mode;
        if (sig !== legendSig) {
          legendSig = sig;
          legend.replaceChildren();
          if (st.mode === 'industries') {
            for (const l of industryLegend(state.industries)) {
              legend.appendChild(el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
                el('i', { style: { width: '10px', height: '10px', borderRadius: '2px', background: l.color, display: 'inline-block' } }), el('span.muted', { text: l.name })));
            }
          } else if (st.mode === 'vehicles') {
            for (const [k, label] of [['train', 'Train'], ['road', 'Road'], ['aircraft', 'Aircraft']]) {
              legend.appendChild(el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
                el('i', { style: { width: '8px', height: '8px', borderRadius: '50%', background: VEHICLE_COLORS[k], display: 'inline-block' } }), el('span.muted', { text: label })));
            }
          } else if (st.mode === 'owners') {
            const rows = [[playerColourOf(state), 'You'], ...(state.rivals || []).map((r) => [r.colour || '#888', r.name || 'AI']), [TOWN_OWNER_COLOR, 'Town']];
            for (const [c, label] of rows) {
              legend.appendChild(el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
                el('i', { style: { width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' } }), el('span.muted', { text: label })));
            }
          } else if (st.mode === 'vegetation') {
            for (const [c, label] of [[VEGETATION_COLORS.grass, 'Grass'], [VEGETATION_COLORS.rough, 'Rough'], [VEGETATION_COLORS.trees, 'Trees'], [VEGETATION_COLORS.fields, 'Fields'], [VEGETATION_COLORS.desert, 'Desert'], [VEGETATION_COLORS.snow, 'Snow'], [VEGETATION_COLORS.water, 'Water'], [VEGETATION_COLORS.buildings, 'Buildings']]) {
              legend.appendChild(el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
                el('i', { style: { width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' } }), el('span.muted', { text: label })));
            }
          } else if (st.mode === 'routes') {
            for (const [c, label] of [[MINIMAP.rail, 'Rail'], [MINIMAP.road, 'Road'], [MINIMAP.station, 'Station'], [MINIMAP.depot, 'Depot']]) {
              legend.appendChild(el('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
                el('i', { style: { width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' } }), el('span.muted', { text: label })));
            }
          }
        }
        const live = st.mode === 'vehicles' ? state.vehicles.filter((v) => v.state !== 'depot').length : state.vehicles.length;
        setText(info, `${m.width}×${m.height} · ${state.stations.length} stations · ${live} vehicles · click to centre`);
      };
      refresh();
      return refresh;
    },
  });
}
