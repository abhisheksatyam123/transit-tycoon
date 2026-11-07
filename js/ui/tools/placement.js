/**
 * Factory for click-to-place tools (stations, stops, depots). Hovering shows a dry-run
 * preview (green/red with cost) plus the catchment area for stations.
 */
import { money } from '../format.js';
import { costText } from '../editorCost.js';
import { catchmentAround } from './geometry.js';
import { adjacentOwn, joinChoices, openJoinPicker } from './joinPicker.js';
import { tileAcceptance } from '../../simulation/stations.js';
import { ACCEPT_THRESHOLD } from '../../simulation/constants.js';
import { CARGO_BY_ID } from '../../config/cargos.js';
import { refusalLabel, priceWhenRefused, NOT_ENOUGH_MONEY } from './refusal.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';

/** Industries this near a new stop (Chebyshev tiles) are named in the catchment toast. */
const NEAR_INDUSTRY_TILES = 6;

/**
 * UI-only catchment check after a station-type build. Returns the toast text when the catchment of `tiles`
 * covers no house or industry that accepts or produces cargo, else null.
 */
export function catchmentWarning(state, tiles, radius) {
  const m = state.map;
  for (const p of catchmentAround(tiles, radius, m.width, m.height)) {
    const b = m.tiles[p.y * m.width + p.x].building;
    if (!b) continue;
    if (b.type === 'house') return null;
    if (b.type === 'industry') {
      const ind = state.industries.find((i) => i.id === b.industryId);
      const type = ind && INDUSTRY_BY_ID[ind.typeId];
      if (type && (type.produces.length || type.accepts.length)) return null;
    }
  }
  const stop = 'Station catchment covers no industry - it will not supply or accept cargo';
  const x0 = Math.min(...tiles.map((t) => t.x)), x1 = Math.max(...tiles.map((t) => t.x));
  const y0 = Math.min(...tiles.map((t) => t.y)), y1 = Math.max(...tiles.map((t) => t.y));
  let near = null, nearGap = Infinity;
  for (const ind of state.industries) {
    const type = INDUSTRY_BY_ID[ind.typeId];
    if (!type || !(type.produces.length || type.accepts.length)) continue;
    // Chebyshev gap between the stop footprint box and the industry box (0 = touching/overlapping)
    const gx = Math.max(0, ind.x - x1, x0 - (ind.x + ind.w - 1));
    const gy = Math.max(0, ind.y - y1, y0 - (ind.y + ind.h - 1));
    const gap = Math.max(gx, gy);
    if (gap > radius && gap <= NEAR_INDUSTRY_TILES && gap < nearGap) { near = ind; nearGap = gap; }
  }
  return near ? `${near.name} is outside the catchment (${nearGap} tiles away; radius ${radius})` : stop;
}

/**
 * @typedef {Object} PlacementOptions
 * @property {string} id
 * @property {string} label
 * @property {()=>string} hint dynamic hint text (shows rotation/length)
 * @property {(game:any,x:number,y:number,opts?:any)=>any} command
 * @property {(x:number,y:number)=>{x:number,y:number}[]} footprint
 * @property {number} [catchment] radius to preview, if a station
 * @property {(e:KeyboardEvent)=>boolean} [key] handle tool keys; return true if consumed
 * @property {'rail'|'bus'|'truck'|'tram'} [joinKind] station kind; enables Ctrl+click distant join
 */

/**
 * @param {import('../app.js').App} app
 * @param {PlacementOptions} o
 * @returns {import('./index.js').Tool}
 */
export function createPlacementTool(app, o) {
  let hover = null;
  let lastKey = '';
  let last = { ok: false, label: '' };
  // F13: cargos the hovered catchment would accept (stations only), shown in the tool hint
  let accepts = '';

  /** Cargo names a station placed at these tiles would accept (catchment-based, same rule as the sim). */
  const acceptsText = (tiles, radius) => {
    const state = app.game.state;
    const m = state.map;
    const sum = {};
    for (const p of catchmentAround(tiles, radius, m.width, m.height)) {
      for (const [c, v] of Object.entries(tileAcceptance(state, p.x, p.y))) sum[c] = (sum[c] || 0) + v;
    }
    const names = Object.keys(sum).filter((c) => sum[c] >= ACCEPT_THRESHOLD)
      .map((c) => (CARGO_BY_ID[c] ? CARGO_BY_ID[c].name : c));
    return names.length ? `Accepts: ${names.sort().join(', ')}` : 'Accepts: nothing';
  };

  const refresh = () => {
    if (!hover) return;
    const ov = app.renderer.overlay;
    const key = `${hover.x},${hover.y},${o.hint()}`;
    if (key === lastKey && ov.preview) return;
    lastKey = key;
    const res = o.command(app.game, hover.x, hover.y, { dryRun: true });
    // F14: a refused build shows its reason; an unaffordable one also shows the price and the balance
    const run = (extra) => o.command(app.game, hover.x, hover.y, { ...extra, dryRun: true });
    last = res && res.ok ? { ok: true, label: costText(app.game, res.cost || 0) }
      : { ok: false, label: refusalLabel(res && res.error, res && res.error === NOT_ENOUGH_MONEY ? priceWhenRefused(app.game, run) : null, app.game.state.company.money) };
    const tiles = o.footprint(hover.x, hover.y);
    ov.preview = { tiles, ok: last.ok, label: last.label };
    if (o.catchment) {
      const m = app.game.state.map;
      ov.catchment = catchmentAround(tiles, o.catchment, m.width, m.height);
      const next = acceptsText(tiles, o.catchment);
      if (next !== accepts) { accepts = next; app.ui.updateHint(); }
    }
  };

  return {
    id: o.id,
    label: o.label,
    get hint() { return accepts ? `${o.hint()} ${accepts}.` : o.hint(); },
    move(t) { hover = t; refresh(); },
    down() {},
    up(t) {
      lastKey = '';
      const run = (joinStationId) => {
        const opts = {};
        if (t.plan) opts.plan = t.plan;
        if (joinStationId != null) opts.joinStationId = joinStationId;
        let res = o.command(app.game, t.x, t.y, opts);
        // F14: a refused click toasts the same wording as the hover preview (cost + balance for money)
        if (res && !res.ok && res.error === NOT_ENOUGH_MONEY) {
          const cost = priceWhenRefused(app.game, (extra) => o.command(app.game, t.x, t.y, { ...opts, ...extra }));
          res = { ...res, error: refusalLabel(res.error, cost, app.game.state.company.money) };
        }
        app.exec(res, { x: t.x, y: t.y, sound: 'build' });
        if (res && res.ok && o.catchment) {
          const warn = catchmentWarning(app.game.state, o.footprint(t.x, t.y), o.catchment);
          if (warn) app.toast(warn, 'warn');
        }
      };
      // OpenTTD distant join: Ctrl+click on a spot with no adjacent station of ours opens a picker.
      const choices = o.joinKind && t.ctrl && !adjacentOwn(app.game.state, o.footprint(t.x, t.y))
        ? joinChoices(app.game.state, o.joinKind, o.footprint(t.x, t.y)) : [];
      if (choices.length) openJoinPicker(app, { x: t.cx, y: t.cy, choices, onPick: run });
      else run(null);
      hover = t;
      refresh();
    },
    key(e) {
      if (!o.key) return false;
      const used = o.key(e);
      if (used) { lastKey = ''; refresh(); app.ui.updateHint(); }
      return used;
    },
    cancel() {
      hover = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
      app.renderer.overlay.catchment = null;
      if (accepts) { accepts = ''; app.ui.updateHint(); }
    },
  };
}
