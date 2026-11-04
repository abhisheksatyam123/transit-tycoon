/**
 * Seeded deterministic RNG (mulberry32). The 32-bit state lives in a host
 * object (normally `game.state.rngState`) so that save/load is deterministic.
 */

/**
 * Hash a seed (number or string) into a 32-bit unsigned integer.
 * @param {number|string} seed
 * @returns {number}
 */
export function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Create an RNG bound to `holder[key]` (state read/written on every call).
 * @param {object} holder object storing the state
 * @param {string} [key='rngState']
 */
export function createRng(holder, key = 'rngState') {
  const next = () => {
    let t = (holder[key] = (holder[key] + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** float in [0,1) */
    next,
    /** integer in [a,b] inclusive */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    /** random element of array */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** true with probability p */
    chance: (p) => next() < p,
    /** float in [a,b) */
    range: (a, b) => a + next() * (b - a),
  };
}

/**
 * Standalone RNG with its own state (convenience for tests / generation).
 * @param {number|string} seed
 */
export function makeRng(seed) {
  const holder = { rngState: hashSeed(seed) };
  const rng = createRng(holder);
  rng.holder = holder;
  return rng;
}
