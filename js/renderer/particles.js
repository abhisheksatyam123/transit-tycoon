/**
 * Smoke particle system with a fixed-size pool (no allocations per frame).
 */

const MAX = 400;

export class Smoke {
  constructor() {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.dark = new Uint8Array(MAX);
    this.count = 0;
    this.seed = 12345;
  }

  /** @returns {number} pseudo-random [0,1) (cosmetic only) */
  rnd() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Emit one puff at world-screen position.
   * @param {number} wx
   * @param {number} wy
   * @param {number} [size]
   * @param {boolean} [dark]
   */
  emit(wx, wy, size = 3, dark = false) {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.x[i] = wx + (this.rnd() - 0.5) * 2;
    this.y[i] = wy;
    this.vx[i] = 4 + this.rnd() * 4;
    this.vy[i] = -10 - this.rnd() * 6;
    this.age[i] = 0;
    this.life[i] = 1.6 + this.rnd() * 1.2;
    this.size[i] = size;
    this.dark[i] = dark ? 1 : 0;
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
      const x = this.x[i] + this.vx[i] * dt, y = this.y[i] + this.vy[i] * dt;
      ctx.globalAlpha = 0.45 * (1 - t);
      ctx.fillStyle = this.dark[i] ? '#3a3a3a' : '#e5e7eb';
      ctx.beginPath();
      ctx.arc(x, y, this.size[i] * (1 + t * 2.5), 0, Math.PI * 2);
      ctx.fill();
      this.x[w] = x; this.y[w] = y; this.vx[w] = this.vx[i]; this.vy[w] = this.vy[i] * 0.995;
      this.age[w] = age; this.life[w] = this.life[i]; this.size[w] = this.size[i]; this.dark[w] = this.dark[i];
      w++;
    }
    this.count = w;
    ctx.globalAlpha = 1;
  }
}
