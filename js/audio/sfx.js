/**
 * Synthesised sound effects (Web Audio API, no audio files).
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy).
 * Mute state persists in localStorage under 'tt.muted'.
 */

const MUTE_KEY = 'tt.muted';

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;
let muted = readMuted();
/** @type {Record<string, number>} last play time per sound (rate limiting) */
const lastPlayed = {};

/** @returns {boolean} */
function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** Create the AudioContext if allowed. Call from a user gesture handler. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

/** Install one-shot listeners that unlock audio on the first gesture. */
export function installAudioUnlock() {
  const h = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', h);
    window.removeEventListener('keydown', h);
  };
  window.addEventListener('pointerdown', h);
  window.addEventListener('keydown', h);
}

/** @returns {boolean} */
export function isMuted() {
  return muted;
}

/**
 * Set mute state (persisted).
 * @param {boolean} m
 */
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.35, ctx.currentTime, 0.02);
}

/**
 * Oscillator tone with an envelope.
 * @param {OscillatorType} type
 * @param {number} f0 start frequency
 * @param {number} f1 end frequency
 * @param {number} dur seconds
 * @param {number} vol peak gain
 * @param {number} [delay] seconds
 */
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/**
 * Filtered noise burst.
 * @param {number} dur
 * @param {number} freq filter frequency
 * @param {number} vol
 * @param {number} [delay]
 */
function noise(dur, freq, vol, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** @type {Record<string, ()=>void>} */
const SOUNDS = {
  click: () => tone('square', 900, 700, 0.04, 0.08),
  build: () => { noise(0.08, 1800, 0.5); tone('triangle', 220, 160, 0.09, 0.25); noise(0.06, 1400, 0.35, 0.09); },
  demolish: () => { noise(0.35, 600, 0.8); tone('sawtooth', 120, 40, 0.3, 0.2); },
  income: () => { tone('sine', 1320, 1320, 0.08, 0.18); tone('sine', 1760, 1760, 0.12, 0.16, 0.07); },
  error: () => { tone('square', 220, 180, 0.12, 0.15); tone('square', 160, 140, 0.16, 0.15, 0.12); },
  horn: () => { tone('sawtooth', 330, 320, 0.35, 0.12); tone('sawtooth', 415, 405, 0.35, 0.1); },
  news: () => { tone('sine', 660, 660, 0.1, 0.15); tone('sine', 880, 880, 0.1, 0.15, 0.11); tone('sine', 990, 990, 0.16, 0.15, 0.22); },
};

/**
 * Play a named sound effect (rate-limited per sound to avoid stacking).
 * @param {'build'|'demolish'|'income'|'error'|'click'|'horn'|'news'} name
 */
export function play(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (lastPlayed[name] && now - lastPlayed[name] < 70) return;
  lastPlayed[name] = now;
  const fn = SOUNDS[name];
  if (fn) {
    try { fn(); } catch { /* ignore audio errors */ }
  }
}
