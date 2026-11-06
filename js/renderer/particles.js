/**
 * Particle system with a fixed-size pool (no allocations per frame).
 * Kinds: 0 light smoke (steam/chimney), 1 dark smoke (diesel, industry, breakdown), 2 electric spark
 * (short, falling), 3 ship wake (flat ring, no drift), 4 faint road exhaust (small, light).
 */

const MAX = 600;
export const KIND_SMOKE = 0;
export const KIND_DARK = 1;
export const KIND_SPARK = 2;
export const KIND_WAKE = 3;
export const KIND_EXHAUST = 4;

export class Smoke {
  constructor() {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.count = 0;
    this.seed = 12345;
  }

  /** @returns {number} pseudo-random [0,1) (cosmetic only) */
  rnd() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** Add one particle of `kind` at world-screen position, with explicit life (seconds). */
  add(wx, wy, size, kind, life) {
    if (this.count >= MAX) return false;
    const i = this.count++;
    this.x[i] = wx + (this.rnd() - 0.5) * 2;
    this.y[i] = wy;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    if (kind === KIND_SPARK) { // sparks scatter sideways and fall
      this.vx[i] = (this.rnd() - 0.5) * 30;
      this.vy[i] = -18 - this.rnd() * 14;
    } else if (kind === KIND_WAKE) {
      this.vx[i] = 0; this.vy[i] = 0;
    } else {
      this.vx[i] = 4 + this.rnd() * 4;
      this.vy[i] = -10 - this.rnd() * 6;
    }
    return true;
  }

  /**
   * Emit one smoke puff (kept for existing callers: steam, chimneys).
   * @param {number} wx
   * @param {number} wy
   * @param {number} [size]
   * @param {boolean} [dark]
   */
  emit(wx, wy, size = 3, dark = false) {
    return this.add(wx, wy, size, dark ? KIND_DARK : KIND_SMOKE, 1.6 + this.rnd() * 1.2);
  }

  /**
   * Advance and draw (context in world space).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt seconds
   */
  draw(ctx, dt) {
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      const t = age / this.life[i];
      const k = this.kind[i];
      const x = this.x[i] + this.vx[i] * dt, y = this.y[i] + this.vy[i] * dt;
      if (k === KIND_WAKE) {
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.ellipse(x, y, this.size[i] * (1 + t * 3), this.size[i] * (0.5 + t), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (k === KIND_SPARK) {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = t < 0.5 ? '#f5faff' : '#7dd3fc'; // blue-white arc, cooling
        ctx.beginPath();
        ctx.arc(x, y, this.size[i] * 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = (k === KIND_EXHAUST ? 0.45 : 0.8) * (1 - t);
        ctx.fillStyle = k === KIND_DARK ? '#3a3a3a' : k === KIND_EXHAUST ? '#9ca3af' : '#e5e7eb';
        ctx.beginPath();
        ctx.arc(x, y, this.size[i] * (1 + t * 3.5), 0, Math.PI * 2);
        ctx.fill();
      }
      this.x[w] = x; this.y[w] = y;
      this.vx[w] = this.vx[i];
      this.vy[w] = k === KIND_SPARK ? this.vy[i] + 60 * dt : this.vy[i] * 0.995; // sparks fall under gravity
      this.age[w] = age; this.life[w] = this.life[i]; this.size[w] = this.size[i]; this.kind[w] = k;
      w++;
    }
    this.count = w;
    ctx.globalAlpha = 1;
  }
}
