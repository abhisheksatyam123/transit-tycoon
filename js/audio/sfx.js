/**
 * Synthesised sound effects (Web Audio API, no audio files).
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy).
 * Mute state persists in localStorage under 'tt.muted'.
 * Master volume (0..100, default 100) persists under 'tt.sfxVolume'. Gain = MASTER_GAIN * volume / 100,
 * so the default is exactly the original 0.35 gain.
 */

const MUTE_KEY = 'tt.muted';
const VOLUME_KEY = 'tt.sfxVolume';
/** Master gain at full volume (the original fixed level). */
export const MASTER_GAIN = 0.35;
export const SFX_VOLUME_DEFAULT = 100;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;
let muted = readMuted();
let volume = readVolume();
/** @type {Record<string, number>} last play time per sound (rate limiting) */
const lastPlayed = {};

/** @returns {boolean} */
function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** @returns {number} saved volume 0..100 (integer); invalid or missing -> default 100 */
function readVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null || raw.trim() === '') return SFX_VOLUME_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) ? clampVolume(n) : SFX_VOLUME_DEFAULT;
  } catch { return SFX_VOLUME_DEFAULT; }
}

/**
 * Clamp and round a volume to an integer 0..100.
 * @param {number} v
 * @returns {number}
 */
export function clampVolume(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return SFX_VOLUME_DEFAULT;
  return Math.max(0, Math.min(100, n));
}

/**
 * Pure master gain: 0 when muted, else MASTER_GAIN scaled by volume/100 (volume 100 -> exactly 0.35).
 * @param {number} volume 0..100
 * @param {boolean} isMuted
 * @returns {number}
 */
export function effectiveGain(volume, isMuted) {
  if (isMuted) return 0;
  return MASTER_GAIN * (clampVolume(volume) / 100);
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
    master.gain.value = effectiveGain(volume, muted);
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

/**
 * Install the gesture listeners that unlock audio, and keep the unlock armed across tab/window switches.
 * Browsers may suspend the context again when the page is hidden or loses focus, so visibilitychange and
 * window focus call unlockAudio() (which resumes a suspended context) and re-arm the one-shot gestures.
 */
export function installAudioUnlock() {
  let armed = false;
  const h = () => {
    armed = false;
    unlockAudio();
    window.removeEventListener('pointerdown', h);
    window.removeEventListener('keydown', h);
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', h);
  };
  const rearm = () => { unlockAudio(); arm(); };
  arm();
  if (typeof document !== 'undefined') {
    window.addEventListener('visibilitychange', () => { if (!document.hidden) rearm(); });
  }
  window.addEventListener('focus', rearm);
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
  if (master && ctx) master.gain.setTargetAtTime(effectiveGain(volume, muted), ctx.currentTime, 0.02);
}

/** @returns {number} master sound-effects volume 0..100 */
export function getSfxVolume() {
  return volume;
}

/**
 * Set the sound-effects volume (persisted, applied at once). Mute still silences everything.
 * @param {number} v 0..100
 */
export function setSfxVolume(v) {
  volume = clampVolume(v);
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(effectiveGain(volume, muted), ctx.currentTime, 0.02);
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
  depart_train: () => { noise(0.05, 500, 0.35); tone('triangle', 90, 70, 0.07, 0.22); noise(0.05, 500, 0.3, 0.12); tone('triangle', 95, 75, 0.07, 0.2, 0.14); },
  depart_road: () => { tone('sawtooth', 70, 60, 0.18, 0.1); noise(0.12, 300, 0.12); },
  ding: () => { tone('sine', 1568, 1568, 0.4, 0.12); tone('sine', 2093, 2093, 0.5, 0.08, 0.04); },
  crossing: () => { tone('square', 1000, 1000, 0.1, 0.08); tone('square', 1000, 1000, 0.1, 0.08, 0.16); tone('square', 1000, 1000, 0.1, 0.08, 0.32); },
  news: () => { tone('sine', 660, 660, 0.1, 0.15); tone('sine', 880, 880, 0.1, 0.15, 0.11); tone('sine', 990, 990, 0.16, 0.15, 0.22); },
};

/**
 * Play a named sound effect (rate-limited per sound to avoid stacking).
 * @param {'build'|'demolish'|'income'|'error'|'click'|'horn'|'news'} name
 */
export function play(name) {
  if (muted || !ctx) return;
  if (ctx.state !== 'running') {
    // a suspended context (tab in the background, autoplay policy) resumes on the next call; drop this sound
    if (typeof ctx.resume === 'function') { try { ctx.resume().catch(() => {}); } catch { /* ignore */ } }
    return;
  }
  const now = performance.now();
  if (lastPlayed[name] && now - lastPlayed[name] < 70) return;
  lastPlayed[name] = now;
  const fn = SOUNDS[name];
  if (fn) {
    try { fn(); } catch { /* ignore audio errors */ }
  }
}

/** Vehicle-sound budget: at most this many vehicle sounds per second across all vehicles. */
const VEH_PER_SEC = 4;
/** @type {number[]} timestamps (ms) of recent vehicle sounds */
const vehStamps = [];

/**
 * Play a vehicle sound (departure, arrival ding) under a global budget of VEH_PER_SEC per second so that
 * many vehicles don't spam. Callers only pass on-screen events (renderer / arrival events).
 * @param {'depart_train'|'depart_road'|'ding'} name
 */
export function playVehicle(name) {
  if (muted || !ctx) return;
  if (ctx.state !== 'running') {
    if (typeof ctx.resume === 'function') { try { ctx.resume().catch(() => {}); } catch { /* ignore */ } }
    return;
  }
  const now = performance.now();
  while (vehStamps.length && now - vehStamps[0] > 1000) vehStamps.shift();
  if (vehStamps.length >= VEH_PER_SEC) return;
  if (lastPlayed[name] && now - lastPlayed[name] < 250) return;
  vehStamps.push(now);
  lastPlayed[name] = now;
  const fn = SOUNDS[name];
  if (fn) { try { fn(); } catch { /* ignore audio errors */ } }
}
