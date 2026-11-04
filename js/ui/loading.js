/**
 * Full-screen "busy" overlay shown while a large world is generated (blocking Game.create).
 * Callers must yield one frame (see `runWithLoading`) so the overlay actually paints first.
 */

/** @type {HTMLElement|null} */
let overlayEl = null;

/**
 * Show the centred dark-glass loading overlay.
 * @param {string} text
 */
export function showLoading(text) {
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'loading-overlay';
    overlayEl.setAttribute('role', 'status');
    overlayEl.innerHTML = '<div class="loading-card"><div class="loading-spin"></div><div class="loading-text"></div></div>';
    document.body.appendChild(overlayEl);
  }
  const t = overlayEl.querySelector('.loading-text');
  if (t) t.textContent = text;
  overlayEl.hidden = false;
}

/** Hide the overlay (no-op when never shown). */
export function hideLoading() {
  if (overlayEl) overlayEl.hidden = true;
}

/**
 * Show the overlay, wait two frames so it paints, run the blocking `fn`, then hide it.
 * @template T
 * @param {string} text
 * @param {() => T} fn
 * @returns {Promise<T>}
 */
export function runWithLoading(text, fn) {
  showLoading(text);
  return new Promise((resolve, reject) => {
    const go = () => {
      try { resolve(fn()); } catch (err) { reject(err); } finally { hideLoading(); }
    };
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go, 0)));
  });
}

/**
 * Human label for a scenario being built.
 * @param {string} id
 * @returns {string}
 */
export function buildingLabel(id) {
  return id ? `Building ${scenarioTitle(id)}…` : 'Generating world…';
}

/**
 * Short display title for a scenario id (generic fallback: capitalised id).
 * @param {string} id
 * @returns {string}
 */
export function scenarioTitle(id) {
  const known = { metropolis: 'Metropolis', moscow: 'Moscow' };
  if (known[id]) return known[id];
  return String(id).charAt(0).toUpperCase() + String(id).slice(1);
}
