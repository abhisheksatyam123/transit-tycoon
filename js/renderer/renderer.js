import { groupColourMap, typeColourMap, vehicleColourOverride } from './groupLivery.js';
import { shipPassable } from '../simulation/shipPath.js';
import { drawLandBridgeDeck } from './sprites/landBridge.js';
import { drawAqueductDeck } from './sprites/aqueduct.js';
import { drawDeckBack, drawDeckFront } from './pack/bridgeDeck.js';
import { packActive } from './pack/state.js';
/**
 * Renderer: draws the visible part of the map each frame in painter's order.
 * For each diagonal d = x + y (back to front): ground + transport (+ underlays) of every tile
 * on the diagonal, then vehicle segments in that diagonal bucket, then static objects.
 * Reads game.state only; never mutates it.
 */
import { HALF_W, HALF_H, HEIGHT_STEP, pickTileQuad } from './iso.js';
import { Camera } from './camera.js';
import { drawObject, drawSegment } from './layers/objects.js';
import { lm3dFronts, lm3dOverlayBuckets, drawLm3dGround, drawLm3dObjects } from './sprites/lm3d.js';
import { drawAircraftLayer, pruneAir } from './layers/air.js';
import { groundedAirOffset } from './layers/airGround.js';
import { drawDisasters } from './layers/disasters.js'; // disasters setting (procedural sprites)
import { drawCar, drawTrafficHeat, interpolateCars } from './layers/traffic.js';
import { drawMetroOverlay } from './layers/metro.js';
import { createOverlayState, drawOverlays, drawUnderlays, tileDiamond, drawLabel, FloatingTexts } from './layers/overlays.js';
import { OVERLAY, setPlayerColour } from './palette.js';
import { roadSideSign } from '../config/traffic.js';
import { getSetting } from '../simulation/settings.js';
import { Smoke } from './particles.js';
import { drawBubbles } from './bubbles.js';
import { VehicleFx } from './vehicleFx.js';
import { SMOKE } from './sprites/buildings.js';
import { P } from './sprites/shapes.js';
import { setSpriteLod } from './sprites/canvas.js';
import { invalidateNet } from './net/index.js';
import { GroundCache } from './groundCache.js';
import { setArcticClimate } from './pack/arctic.js';
import { ensureClimatePack } from './pack/index.js';
import { setTropicClimate } from './pack/tropic.js';
import { setToylandClimate, toylandState, drawToylandIndustryGround } from './pack/toyland.js';
import { industryAnimState } from './pack/industries.js';
import { isArctic, snowLineOf, isTropic, isToyland } from '../simulation/climate.js';
import { Heights } from './heights.js';
import { setPoseMap } from './net/pose.js';
import { setOverlayHeights } from './layers/overlays.js';
import { drawSignalPost } from './layers/signals.js';
import { drawCatenary, drawTramWires } from './layers/catenary.js';
import { drawOneWayArrow } from './layers/oneway.js';
import { drawTunnelPortal } from './layers/transport.js';
import { drawLabels } from './layers/labels.js';
import { loadTransparency, tileTransparency, TRANSPARENT_ALPHA } from './transparency.js';
import { drawLinkOverlay } from './layers/linkOverlay.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {any} game Game instance (contract API)
   * @param {{secondary?:boolean}} [opts] secondary: an extra viewport or a whole-map export pass;
   *   it does not take the window.__renderer debug handle
   */
  constructor(canvas, game, opts = {}) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
    this.camera = new Camera();
    this.overlay = createOverlayState();
    this.floating = new FloatingTexts();
    this.smoke = new Smoke();
    /** vehicle effects by type (vehicleFx.js); render-only */
    this.vfx = new VehicleFx();
    this.frame = 0;
    this.dpr = 1;
    /** true: canvas size and camera viewport are set by the caller (see screenshot.js) */
    this.fixedView = !!opts.fixedView;
    /** heights owned by another (main) renderer; null = this renderer builds its own */
    this._sharedHeights = opts.heights || null;
    /** metro schematic overlay (key J); tunnel trains are shown only while on */
    this.showMetro = false;
    /** link graph overlay (hotkey c); per-cargo filter, lazily filled by the legend */
    this.showLinks = false;
    this.linkCargos = null;
    /** screen-space hit rects of the name signs from the last frame (see layers/labels.js) */
    this.labelHits = [];
    /** OpenGFX pack drawing active (see pack/index.js); false = procedural */
    this.packOn = false;
    /** @type {Map<number, any>} */
    this.industryMap = new Map();
    this._indLen = -1;
    /** bound lookup passed to the object layer (created once, not per tile) */
    this.industryLookup = (id) => this.industryById(id);
    /** @type {Uint8Array} 1 = catchment, 2 = selection */
    this.mask = new Uint8Array(0);
    this._maskSrcC = null;
    this._maskSrcS = null;
    /** @type {any[][]} vehicle segments bucketed by diagonal */
    this.buckets = [];
    /** @type {{x:number,y:number,id:number}[]} screen positions of segments (for picking) */
    this.segScreen = [];
    /** @type {any[][]} traffic cars bucketed by diagonal */
    this.carBuckets = [];
    /** @type {any[]} aircraft segments (drawn after the map pass) */
    this.airSegs = [];
    this.setGame(game);
    // debug handle for e2e tests (same role as window.__game)
    if (typeof window !== 'undefined' && !opts.secondary) window.__renderer = this;
  }

  /**
   * Use another renderer's terrain heights (the main view's, kept in sync after terraform), so a
   * secondary renderer does not keep its own copy. Survives later setGame calls (until the owner's
   * heights object is replaced by a new game: call again).
   * @param {Renderer} main
   */
  shareHeights(main) {
    this._sharedHeights = main.heights;
    this.heights = main.heights;
    if (this.ground) this.ground.reset(this.game.state.map, this.heights);
  }

  /**
   * Attach a (new) game.
   * @param {any} game
   */
  setGame(game) {
    this.game = game;
    const m = game.state.map;
    this.camera.setMap(m.width, m.height);
    this.mask = new Uint8Array(m.width * m.height);
    this._maskSrcC = this._maskSrcS = null;
    this._indLen = -1;
    this.buckets = [];
    this.heights = this._sharedHeights || new Heights(m);
    setOverlayHeights(this.heights);
    if (!this.ground) this.ground = new GroundCache();
    this.ground.reset(m, this.heights);
    // sub-arctic climate (opt-in): snow line and flag for the ground drawing; temperate games leave it off
    setArcticClimate(isArctic(game.state), snowLineOf(game.state));
    // sub-tropical climate (opt-in): desert ground and sub-tropical trees; temperate games leave it off
    setTropicClimate(isTropic(game.state), m);
    // toyland climate (opt-in): toyland ground, trees and houses; other games leave it off
    setToylandClimate(isToyland(game.state), m);
    // the climate's own ground pack (arctic / tropic / toyland) loads on demand; temperate loads none
    ensureClimatePack(isArctic(game.state) ? 'arctic' : isTropic(game.state) ? 'tropic' : isToyland(game.state) ? 'toyland' : null);
    this.carBuckets = [];
    for (let i = 0; i < m.width + m.height; i++) { this.buckets.push([]); this.carBuckets.push([]); }
  }

  /** Resize backing store to the element's CSS size × devicePixelRatio. */
  resize() {
    if (this.fixedView) return; // whole-map export: the caller sets canvas size and camera
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 600;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.camera.setViewport(w, h);
  }

  /**
   * Height of a tile, or -1 when out of bounds.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  heightAt(x, y) {
    const m = this.game.state.map;
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return -1;
    return m.tiles[y * m.width + x].height;
  }

  /**
   * Tile under a viewport point (CSS px). May be out of bounds.
   * @param {number} px
   * @param {number} py
   * @returns {{x:number,y:number}}
   */
  pickTile(px, py) {
    const w = this.camera.screenToWorld(px, py);
    const m = this.game.state.map;
    return pickTileQuad(w.x, w.y, (x, y) => (x < 0 || y < 0 || x >= m.width || y >= m.height ? null : this.heights.tileCorners(x, y)));
  }

  /**
   * Vehicle id under a viewport point (from last frame), or null.
   * @param {number} px
   * @param {number} py
   * @returns {number|null}
   */
  pickVehicle(px, py) {
    let best = null, bestD = 14 * 14;
    for (const s of this.segScreen) {
      const dx = s.x - px, dy = s.y - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s.id; }
    }
    return best;
  }

  /**
   * World-screen position of a float tile coordinate (integer = tile centre), heights interpolated.
   * @param {number} fx
   * @param {number} fy
   * @returns {{x:number,y:number}}
   */
  tileCenterScreen(fx, fy) {
    const h = this.heights.surfaceH(fx, fy);
    return { x: (fx - fy) * HALF_W, y: (fx + fy) * HALF_H - h * HEIGHT_STEP };
  }

  /**
   * Add floating income text at tile.
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {string} [color]
   */
  addFloatingText(x, y, text, color = '#4ade80') {
    const p = this.tileCenterScreen(x, y);
    this.floating.add(p.x, p.y, text, color);
  }

  /** Force cached ground chunks to be re-validated (call after build commands). */
  /** Switch between OpenGFX and procedural graphics (rebuilds the ground cache). */
  setPackEnabled(on) {
    this.packOn = !!on;
    this.invalidateGround();
  }

  invalidateGround() {
    if (this.ground) this.ground.invalidate();
    if (this.game) invalidateNet(this.game.state.map);
  }

  /** Refresh catchment/selection mask when overlay arrays change. */
  updateMask() {
    const o = this.overlay;
    if (o.catchment === this._maskSrcC && o.selection === this._maskSrcS) return;
    this._maskSrcC = o.catchment;
    this._maskSrcS = o.selection;
    const m = this.game.state.map;
    this.mask.fill(0);
    const put = (list, bit) => {
      if (!list) return;
      for (const t of list) if (t.x >= 0 && t.y >= 0 && t.x < m.width && t.y < m.height) this.mask[t.y * m.width + t.x] |= bit;
    };
    put(o.catchment, 1);
    put(o.selection, 2);
  }

  /** @param {number} id */
  industryById(id) {
    const inds = this.game.state.industries;
    if (inds.length !== this._indLen) {
      this.industryMap.clear();
      for (const ind of inds) this.industryMap.set(ind.id, ind);
      this._indLen = inds.length;
    }
    return this.industryMap.get(id);
  }

  /** Bucket vehicle segments by diagonal (x+y). */
  collectVehicles() {
    setPlayerColour(this.game.state.company && this.game.state.company.colour); // cheap no-op unless changed
    const b = this.buckets;
    for (let i = 0; i < b.length; i++) b[i].length = 0;
    this.airSegs.length = 0;
    const game = this.game;
    const last = b.length - 1;
    const gmap = groupColourMap(game.state); // group livery (cmdGroup setGroupColour): null when no group has a colour
    const tmap = typeColourMap(game.state); // per-type colour scheme (cmdGroup setTypeColour): null when no type has a colour
    const tiles = game.state.map.tiles, W = game.state.map.width;
    // visible tile range plus a margin (tail wagons trail their head tile)
    const vr = this.camera.visibleTileRange();
    const M = 24; // long trains: tail wagons trail the head tile by many tiles
    const cull = { x0: vr.x0 - M, x1: vr.x1 + M, y0: vr.y0 - M, y1: vr.y1 + M };
    for (const v of game.state.vehicles) {
      if (v.state === 'depot') continue;
      // PF2: a ground vehicle far outside the view cannot be drawn or picked; skip its segment work.
      // Aircraft are never culled (pruneAir and their own pass need them).
      if (cull && v.kind !== 'aircraft' && (v.tx < cull.x0 || v.tx > cull.x1 || v.ty < cull.y0 || v.ty > cull.y1)) continue;
      let segs;
      try { segs = game.getVehicleSegments(v); } catch { continue; }
      if (!segs) continue;
      for (const s of segs) {
        if (!this.showMetro || !v.metroLine) {
          const tt = tiles[Math.round(s.y) * W + Math.round(s.x)];
          if (tt && tt.tunnel) continue; // underground: metro overlay shows metro trains only; player tunnels are always hidden
        }
        s._vid = v.id;
        s._info = v;
        // group livery: only player vehicles in a coloured group; one Map lookup, and only for grouped vehicles
        // precedence: vehicle paint > group colour > type colour > company colour (rivals always carry their own livery, not here)
        // per-vehicle paint (cmdGroup setVehicleColour) wins over all: one property check, then the group/type lookup
        s._gc = (v.colour && v.ownerId == null) ? v.colour : (tmap || gmap ? vehicleColourOverride(v, gmap, tmap) : undefined);
        if (s.part === 'aircraft') {
          s._model = v.modelId;
          s._alt = s.alt !== undefined ? s.alt : (v.alt || 0);
          if (v.ftaGroundEnd != null) groundedAirOffset(game.state, v, s); // display-only tile sub-offset (airportDisplay.js)
          this.airSegs.push(s);
          continue;
        }
        const d = Math.max(0, Math.min(last, Math.ceil(s.x + s.y - 0.001)));
        s._run = v.state === 'running';
        b[d].push(s);
      }
    }
  }

  /** Bucket traffic cars by diagonal (x+y); reuses the bucket arrays. */
  collectCars() {
    const b = this.carBuckets;
    for (let i = 0; i < b.length; i++) b[i].length = 0;
    if (typeof this.game.trafficCars !== 'function') return;
    const raw = this.game.trafficCars();
    if (!raw || !raw.length) return;
    const cars = interpolateCars(raw, this.game.state.tick, performance.now());
    const last = b.length - 1;
    for (const car of cars) {
      const d = Math.max(0, Math.min(last, Math.ceil(car.fx + car.fy - 0.001)));
      b[d].push(car);
    }
  }

  /**
   * Draw a frame.
   * @param {number} dt seconds since last frame
   */
  render(dt) {
    this.resize();
    this.frame++;
    toylandState.animFrame = this.frame; // TY5 industry animation phase (pack/toyland.js toylandAnimKids)
    industryAnimState.frame = this.frame; // IA3 temperate industry animation phase (pack/industries.js)
    const { ctx, camera: cam } = this;
    const state = this.game.state;
    const map = state.map;
    setPoseMap(map);
    roadSideSign.value = getSetting(state, 'roadSide') === 'left' ? -1 : 1; // once per frame (road driving side)
    this.vfx.smokeAmount = Number(getSetting(state, 'smokeAmount')) || 0; // OTTD smoke_amount (render-only)
    setOverlayHeights(this.heights); // module-level: another renderer may have set its own
    const W = map.width;
    const tiles = map.tiles;
    const z = cam.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(z, 0, 0, z, (cam.viewW / 2 - cam.x * cam.zoom) * this.dpr, (cam.viewH / 2 - cam.y * cam.zoom) * this.dpr);
    ctx.imageSmoothingEnabled = true;
    setSpriteLod(z);

    this.collectVehicles();
    this.segScreen.length = 0;
    const r = cam.worldRect(HALF_W * 2);
    const range = cam.visibleTileRange();
    const smokeOn = (this.frame & 7) === 0;
    const selV = this.overlay.selectedVehicleId;
    this.vfx.begin(tiles, W, this.frame);

    // ground + transport come from cached chunks (below everything else)
    this.ground.setBarred(this.game && this.game.ctx ? this.game.ctx.barred || null : null); // level crossing barriers (levelCrossing.js)
    this.ground.draw(ctx, range, z, (this.frame & 31) === 0);
    drawUnderlays(ctx, map, this.overlay);
    // baked landmark ensembles: flat ground first (under every object); objects in painter's order.
    // Generic overlays draw in tile order; stamped (geographically accurate) fronts draw after
    // overlays on the same tile so major monuments stay prominent.
    const lm3dOverlays = lm3dOverlayBuckets(map);
    // one shared water test for the whole frame (was a new closure per object tile); reads its tile from wx/wy
    let wx = 0, wy = 0;
    const fieldAt = (dx, dy) => { const nx = wx + dx, ny = wy + dy; return nx >= 0 && ny >= 0 && nx < W && ny < map.height && map.tiles[ny * W + nx].field !== undefined; };
    const waterAt = (dx, dy) => { const nx = wx + dx, ny = wy + dy; return nx >= 0 && ny >= 0 && nx < W && ny < map.height && shipPassable(map, ny * W + nx); };
    const lmFronts = lm3dFronts(map), lmLate = [];
    for (const f of lmFronts) {
      const p = { x: (f.x - f.y) * HALF_W, y: (f.x + f.y) * HALF_H - this.heights.centerH(f.x, f.y) * HEIGHT_STEP };
      drawLm3dGround(ctx, f.id, f.x, f.y, p.x, p.y, r);
      if (f.x < range.x0 || f.x > range.x1 || f.y < range.y0 || f.y > range.y1) lmLate.push([f, p]);
    }
    if (this.overlay.trafficHeat) drawTrafficHeat(ctx, this.game, this.heights, range);

    const tr = loadTransparency(); // null when every transparency toggle is off (renderer/transparency.js)
    const showCars = this.overlay.trafficCars !== false;
    if (showCars) this.collectCars();

    // TY: toyland industry ground is the lowest layer: draw it for every visible industry tile first, so the
    // buildings of the object pass below are never painted over by the ground of a later diagonal (OTTD)
    toylandState.groundDone = false;
    if (toylandState.on) {
      for (let d = range.x0 + range.y0; d <= range.x1 + range.y1; d++) {
        const xa = Math.max(range.x0, d - range.y1), xb = Math.min(range.x1, d - range.y0);
        for (let x = xa; x <= xb; x++) {
          const y = d - x;
          const tile = tiles[y * W + x];
          const b = tile.building;
          if (!b || b.type !== 'industry' || b.lm3d) continue;
          const sx = (x - y) * HALF_W;
          const sy = (x + y) * HALF_H - this.heights.centerH(x, y) * HEIGHT_STEP;
          if (sx < r.x0 || sx > r.x1 || sy < r.y0 - 20 || sy > r.y1 + 160) continue;
          const ind = this.industryLookup(b.industryId);
          if (ind) drawToylandIndustryGround(ctx, ind, x, y, sx, sy - HALF_H);
        }
      }
    }
    toylandState.groundDone = toylandState.on;
    for (let d = range.x0 + range.y0; d <= range.x1 + range.y1; d++) {
      const xa = Math.max(range.x0, d - range.y1), xb = Math.min(range.x1, d - range.y0);
      // OpenGFX bridge decks: back (deck + pillars) under the vehicles of this diagonal (OTTD DrawBridgeMiddle)
      if (packActive()) for (let x = xa; x <= xb; x++) {
        const t = tiles[(d - x) * W + x];
        const dsx = (2 * x - d) * HALF_W;
        if (t && t.bridgeDeck !== undefined && !(dsx < r.x0 - 64 || dsx > r.x1 + 64)) drawDeckBack(ctx, t, dsx, d * HALF_H, this.heights.tileCorners(x, d - x));
      }
      // vehicles on this diagonal
      const bucket = this.buckets[d];
      if (bucket && bucket.length) {
        for (const s of bucket) {
          const p = this.tileCenterScreen(s.x, s.y);
          if (p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1 + 140) continue;
          drawSegment(ctx, s, p.x, p.y, s._vid === selV);
          const scr = cam.worldToScreen(p.x, p.y - 6);
          this.segScreen.push({ x: scr.x, y: scr.y, id: s._vid });
          this.vfx.segment(this.smoke, s, p.x, p.y, smokeOn);
        }
      }
      // road traffic on this diagonal
      if (showCars) {
        const cb = this.carBuckets[d];
        for (let i = 0; i < cb.length; i++) {
          const car = cb[i];
          const p = this.tileCenterScreen(car.fx, car.fy);
          if (p.x < r.x0 || p.x > r.x1 || p.y < r.y0 || p.y > r.y1 + 140) continue;
          drawCar(ctx, car, p.x, p.y);
        }
      }
      // static objects
      for (let x = xa; x <= xb; x++) {
        const y = d - x;
        const sx = (x - y) * HALF_W;
        const tile = tiles[y * W + x];
        const lb = tile.building;
        const overlays = lm3dOverlays.size ? lm3dOverlays.get(y * W + x) : undefined;
        wx = x; wy = y;
        const sy = (x + y) * HALF_H - this.heights.centerH(x, y) * HEIGHT_STEP;
        if (lb && lb.lm3d) { // ensemble sprites are wide: never culled by their front tile position
          if (overlays && sy >= r.y0 - 220 && sy <= r.y1 + 160) for (const o of overlays) drawLm3dObjects(ctx, o.id, x, y, sx, sy, r);
          if (lb.front) drawLm3dObjects(ctx, lb.id, x, y, sx, sy, r);
          continue;
        }
        if (!(sx < r.x0 || sx > r.x1) && sy >= r.y0 - 20 && sy <= r.y1 + 160 && (tile.building || tile.object || tile.terrain === 'forest' || tile.field !== undefined)) {
          // transparency toggles (UI only): hidden trees skip the draw, faded objects use globalAlpha; tr null = unchanged
          const ta = tr ? tileTransparency(tile, tr) : 1;
          let piece = null;
          if (ta !== 0) {
            if (ta !== 1) ctx.globalAlpha = ta;
            piece = drawObject(ctx, tile, x, y, sx, sy, this.industryLookup, waterAt, fieldAt);
            if (ta !== 1) ctx.globalAlpha = 1;
          }
          if (piece && smokeOn && SMOKE[piece] && ((x * 7 + y * 3 + (this.frame >> 3)) % 3 === 0)) {
            const [ou, ov, oz] = SMOKE[piece];
            const [px, py] = P(ou, ov, oz);
            this.smoke.emit(sx + px, sy + py, 3, piece === 'chimney' || piece === 'blast');
          }
        }
        if (tile.oneWay && !tile.building && sy >= r.y0 - 40 && sy <= r.y1 + 40 && !(sx < r.x0 || sx > r.x1)) drawOneWayArrow(ctx, sx, sy, tile.oneWay, tile.road | 0);
        if (tile.bridgeDeck !== undefined && sy >= r.y0 - 100 && sy <= r.y1 + 100 && !(sx < r.x0 - 64 || sx > r.x1 + 64)) {
          const fb = tr && tr.bridges ? TRANSPARENT_ALPHA : 1; // transparency toggle (UI only)
          if (fb !== 1) ctx.globalAlpha = fb;
          if (packActive()) drawDeckFront(ctx, tile, sx, (x + y) * HALF_H);
          else drawLandBridgeDeck(ctx, tile, sx, sy, this.heights, map, x, y);
          if (fb !== 1) ctx.globalAlpha = 1;
        }
        if (tile.aqueduct && tile.aqueduct.role === 'deck' && sy >= r.y0 - 100 && sy <= r.y1 + 100 && !(sx < r.x0 - 64 || sx > r.x1 + 64)) drawAqueductDeck(ctx, tile, sx, sy, this.heights, x, y);
        if (tile.tunnelPortal && sy >= r.y0 - 60 && sy <= r.y1 + 60 && !(sx < r.x0 - 64 || sx > r.x1 + 64)) drawTunnelPortal(ctx, tile, sx, (x + y) * HALF_H, this.heights.tileCorners(x, y), map, x, y);
        if (tile.elec && tile.rail && !tile.building && sy >= r.y0 - 40 && sy <= r.y1 + 40 && !(sx < r.x0 || sx > r.x1)) drawCatenary(ctx, tile, x + 1 < W ? map.tiles[y * W + x + 1] : null, y + 1 < map.height ? map.tiles[(y + 1) * W + x] : null, sx, sy);
        if (tile.tram && !tile.rail && (!tile.building || (tile.building.type === 'station' && tile.building.kind === 'tram')) && sy >= r.y0 - 40 && sy <= r.y1 + 40 && !(sx < r.x0 || sx > r.x1)) drawTramWires(ctx, tile, sx, sy, this.heights.tileCorners(x, y));
        if (tile.signal && !tile.building && sy >= r.y0 - 40 && sy <= r.y1 + 40 && !(sx < r.x0 || sx > r.x1)) {
          const fa = tr && tr.signs ? TRANSPARENT_ALPHA : 1; // signs toggle (UI only): fade the signal post
          if (fa !== 1) ctx.globalAlpha = fa;
          drawSignalPost(ctx, sx, sy, !!(state.resv && state.resv[y * W + x] !== undefined), typeof tile.signal === 'object' ? tile.signal.type : 'block', typeof tile.signal === 'object' ? tile.signal.dir : 0);
          if (fa !== 1) ctx.globalAlpha = 1;
        }
        if (overlays && sy >= r.y0 - 220 && sy <= r.y1 + 160) for (const o of overlays) drawLm3dObjects(ctx, o.id, x, y, sx, sy, r);
      }
    }

    toylandState.groundDone = false;
    for (const [f, p] of lmLate) drawLm3dObjects(ctx, f.id, f.x, f.y, p.x, p.y, r);
    if (this.showMetro) drawMetroOverlay(ctx, this, range);
    // aircraft: above the whole map pass (shadow on the ground, body lifted by altitude)
    if (this.airSegs.length) {
      const seen = new Set();
      for (const s of this.airSegs) seen.add(s._vid);
      pruneAir(seen);
      drawAircraftLayer(ctx, this.airSegs, (x, y) => this.tileCenterScreen(x, y), selV);
      for (const s of this.airSegs) {
        const p = this.tileCenterScreen(s.x, s.y);
        const scr = cam.worldToScreen(p.x, p.y - (s._alt || 0) * 60 - 6);
        this.segScreen.push({ x: scr.x, y: scr.y, id: s._vid });
      }
    }

    if (this.game.state.disasters) drawDisasters(ctx, this.game.state, (x, y) => this.tileCenterScreen(x, y), this.frame); // disasters setting: nothing when idle
    this.smoke.draw(ctx, dt);
    // IA5 bubble generator effect (render-only, OTTD EV_BUBBLE): toyland view only
    drawBubbles(ctx, toylandState.on ? toylandState.pack : null, dt);
    drawOverlays(ctx, map, this.overlay);
    // screen-space labels and floating texts: last, always above landmarks/vehicles
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.showLinks) drawLinkOverlay(ctx, this, cam);
    this.floating.draw(ctx, dt, cam);
    // town/station name signs (screen space); the hit list feeds click-to-open in input.js
    drawLabels(ctx, this, cam);
    const pv = this.overlay.preview;
    if (pv && pv.label && pv.tiles.length) {
      const t = pv.tiles[pv.tiles.length - 1];
      const h = Math.max(0, this.heights.centerH(t.x, t.y));
      const s = cam.worldToScreen((t.x - t.y) * HALF_W, (t.x + t.y) * HALF_H - h * HEIGHT_STEP);
      drawLabel(ctx, s.x, s.y, pv.label, pv.ok);
    }
  }
}
