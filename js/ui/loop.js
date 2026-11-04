/**
 * Fixed-step game loop: requestAnimationFrame drives rendering; the simulation advances in
 * fixed ticks (BASE_TPS at 1x, multiplied by speed), capped per frame to avoid spirals.
 */

export const BASE_TPS = 30;
const MAX_STEPS_PER_FRAME = 40;

/**
 * Start the loop.
 * @param {{getGame:()=>any, getSpeed:()=>number, frame:(dt:number, now:number)=>void, onError?:(e:any)=>void}} o
 * @returns {{stop:()=>void, stats:{fps:number, tps:number}}}
 */
export function startLoop(o) {
  let acc = 0;
  let last = performance.now();
  let running = true;
  let frames = 0, ticks = 0, statT = last;
  const stats = { fps: 0, tps: 0 };
  let errored = false;

  const tick = (now) => {
    if (!running) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const speed = o.getSpeed();
    if (speed > 0) {
      acc += dt * BASE_TPS * speed;
      let steps = Math.floor(acc);
      if (steps > MAX_STEPS_PER_FRAME) { steps = MAX_STEPS_PER_FRAME; acc = 0; } else acc -= steps;
      const game = o.getGame();
      try {
        for (let i = 0; i < steps; i++) game.step();
        ticks += steps;
      } catch (err) {
        if (!errored && o.onError) o.onError(err);
        errored = true;
      }
    } else acc = 0;
    o.frame(dt, now);
    frames++;
    if (now - statT >= 1000) {
      stats.fps = Math.round((frames * 1000) / (now - statT));
      stats.tps = Math.round((ticks * 1000) / (now - statT));
      frames = 0; ticks = 0; statT = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { stop: () => { running = false; }, stats };
}
