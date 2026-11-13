/**
 * Smooth network renderer switch (Locomotion/OpenLoco-style continuous road and rail).
 * Enabled unless localStorage 'tt.net' === '0'.
 */
function saved() {
  try { return typeof localStorage === 'undefined' || localStorage.getItem('tt.net') !== '0'; } catch { return true; }
}
const netState = { enabled: saved() };
/** @returns {boolean} */
export function netActive() { return netState.enabled; }
/** @param {boolean} on */
export function setNetActive(on) {
  netState.enabled = !!on;
  try { localStorage.setItem('tt.net', on ? '1' : '0'); } catch { /* ignore */ }
}
