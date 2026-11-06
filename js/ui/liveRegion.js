/**
 * Polite screen-reader live region (visually hidden) for transient announcements:
 * the selected build tool and new news ticker items.
 */
let node = null;

/**
 * Announce a short message to assistive technology without moving focus.
 * @param {string} msg
 */
export function announce(msg) {
  if (!node) {
    node = document.createElement('div');
    node.id = 'sr-live';
    node.className = 'sr-only';
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = msg;
}
