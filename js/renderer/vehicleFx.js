/**
 * Vehicle effects and sounds (render-only; never changes the simulation).
 * Effects by vehicle type: steam (white puffs), diesel (dark puffs while moving), electric (sparks under
 * catenary), road buses/trucks (faint exhaust), ships (wake), broken-down vehicles (black smoke).
 * Only segments already on screen reach here (renderer culls first), and no smoke is drawn in tunnels
 * (renderer skips underground segments) or in depots (no segments). Particle emission is capped per frame.
 * Sounds: departure (train chuff / road engine) and arrival 'ding' go through sfx.playVehicle (rate-limited).
 * Preference 'tt.fx' (localStorage, default on) = "Vehicle effects" in Settings > Interface.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { playVehicle } from '../audio/sfx.js';
import { loadA11y } from '../ui/a11yPrefs.js';
import { KIND_SMOKE, KIND_DARK, KIND_SPARK, KIND_WAKE, KIND_EXHAUST } from './particles.js';

const FX_KEY = 'tt.fx';
/** @type {boolean} */
let fxOn = readFx();

/** @returns {boolean} */
function readFx() {
  try { return localStorage.getItem(FX_KEY) !== '0'; } catch { return true; }
}
/** @returns {boolean} whether vehicle particles are drawn */
export function isFxOn() { return fxOn; }
/** @param {boolean} v */
export function setFxOn(v) {
  fxOn = !!v;
  try { localStorage.setItem(FX_KEY, fxOn ? '1' : '0'); } catch { /* ignore */ }
}

/** max particle emissions per frame from vehicles (keeps frame time flat on busy maps) */
const EMIT_BUDGET = 60;

export class VehicleFx {
  constructor() {
    /** @type {Map<number, {state:string, frame:number}>} last seen state per vehicle id */
    this.seen = new Map();
    this.budget = EMIT_BUDGET;
    this.tiles = null;
    this.W = 0;
    this.frame = 0;
  }

  /**
   * Call once per frame before the segment loop.
   * @param {any[]} tiles
   * @param {number} W
   * @param {number} frame
   */
  begin(tiles, W, frame) {
    this.tiles = tiles; this.W = W; this.frame = frame;
    this.budget = EMIT_BUDGET;
    if ((frame & 255) === 0) { // prune vehicles not seen for a while
      for (const [id, r] of this.seen) if (r.frame < frame - 300) this.seen.delete(id);
    }
  }

  /**
   * Effects and departure sound for one on-screen segment.
   * @param {import('./particles.js').Smoke} smoke
   * @param {any} s segment (part, _run, _info, x, y)
   * @param {number} px screen-space tile centre x (world)
   * @param {number} py
   * @param {boolean} smokeOn emission tick (every 8th frame)
   */
  segment(smoke, s, px, py, smokeOn) {
    const v = s._info;
    if (!v) return;
    const rec = this.seen.get(v.id);
    const fresh = !rec || rec.frame !== this.frame; // first segment of this vehicle this frame
    if (fresh) {
      if (rec && this.frame - rec.frame < 16 && (rec.state === 'loading' || rec.state === 'stopped') && v.state === 'running') {
        playVehicle(v.kind === 'train' ? 'depart_train' : 'depart_road');
      }
      this.seen.set(v.id, { state: v.state, frame: this.frame });
    }
    if (!fxOn || !smokeOn || this.budget <= 0 || loadA11y().reduceMotion) return;
    const model = MODEL_BY_ID[v.modelId];
    const moving = s._run && v.speed > 0;
    const r = smoke.rnd();
    if (v.state === 'broken') { // breakdown: black smoke
      if (r < 0.7) this.emit(smoke, px, py - (s.part === 'loco' ? 14 : 8), 3, KIND_DARK, 2.2);
      return;
    }
    if (s.part === 'loco') {
      const steam = !!model && /Steam/.test(model.name);
      if (steam) {
        if (s._run) this.emit(smoke, px, py - 14, 2, KIND_SMOKE, 1.8);
      } else if (model && model.traction === 'electric') {
        if (moving && r < 0.35 && this.elecAt(s)) this.emit(smoke, px, py - 16, 1.2, KIND_SPARK, 0.35);
      } else if (moving && r < 0.5) { // diesel
        this.emit(smoke, px, py - 14, 1.6, KIND_DARK, 1.4);
      }
    } else if (s.part === 'bus' || s.part === 'truck') {
      if (moving && r < 0.25) this.emit(smoke, px, py - 3, 1.2, KIND_EXHAUST, 1.2);
    } else if (s.part === 'ship') {
      if (moving && r < 0.6) this.emit(smoke, px, py, 2.2, KIND_WAKE, 1.0);
    }
  }

  /** @returns {boolean} the segment's tile is electrified (catenary above) */
  elecAt(s) {
    const t = this.tiles && this.tiles[Math.round(s.y) * this.W + Math.round(s.x)];
    return !!(t && t.elec);
  }

  /**
   * @returns {boolean} true when the particle was added
   */
  emit(smoke, x, y, size, kind, life) {
    if (!smoke.add(x, y, size, kind, life)) return false;
    this.budget--;
    return true;
  }
}
