/**
 * Fixed (non-rebindable) keyboard shortcuts: window and camera keys that OpenTTD keeps global and that
 * the hotkey editor only lists. UI-only: nothing here touches the simulation.
 *
 * The keys are handled by input.js after the active tool's own keys (so Terraform / line-drag keep C)
 * and never while a text field has focus. The hotkey table in ui/hotkeys.js shows them as read-only.
 */

/** Tool ids whose key() consumes C (Terraform: cycle mode; rail/road/tram line drag: cycle shape). */
export const C_SHADOWING_TOOLS = new Set(['terraform', 'rail', 'road', 'tram']);

/**
 * @typedef {{key:string, action:string, label:string, group:string, ottd:string}} FixedShortcut
 */

/** @type {FixedShortcut[]} */
export const FIXED_SHORTCUTS = [
  // OpenTTD main_gui.cpp hotkeys "delete_windows" (window.cpp CloseWindowByClass-ish sweep) and
  // window.cpp ~3409: Delete closes all non-vital windows.
  { key: 'delete', action: 'closeAll', label: 'Close all windows', group: 'Windows', ottd: 'src/main_gui.cpp:487, src/window.cpp:3409' },
  // OpenTTD main_gui.cpp ~483: 'C' centres the view on the tile under the cursor.
  { key: 'c', action: 'center', label: 'Centre view on the tile under the cursor', group: 'Camera', ottd: 'src/main_gui.cpp:483' },
  // OpenTTD toolbar_gui.cpp ~2144-2175 (main toolbar hotkeys).
  { key: 'f1', action: 'pause', label: 'Pause / resume (fixed)', group: 'Game', ottd: 'src/toolbar_gui.cpp:2145' },
  { key: 'f2', action: 'settings', label: 'Game settings', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2147' },
  { key: 'f3', action: 'save', label: 'Save game', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2148' },
  { key: 'f4', action: 'map', label: 'Map', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2150' },
  { key: 'f7', action: 'stations', label: 'Station list', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2153' },
  { key: 'f8', action: 'finances', label: 'Finances', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2154' },
  { key: 'f9', action: 'companies', label: 'Company list', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2155' },
  { key: 'f10', action: 'graphs', label: 'Graphs', group: 'Windows', ottd: 'src/toolbar_gui.cpp:2158' },
];

/** True when the key event comes from a text field, where keys must keep their normal editing meaning. */
export function isTypingTarget(target) {
  const tag = target && target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Fixed shortcut for a normalised (lower-case) key, or null.
 * @param {string} key
 * @returns {FixedShortcut|null}
 */
export function fixedShortcutFor(key) {
  return FIXED_SHORTCUTS.find((s) => s.key === key) || null;
}

/**
 * Centre the camera on the tile under the mouse cursor. OpenTTD uses the cursor tile; TT tracks it as
 * the hover tile from the last pointer move (cleared when the pointer leaves the map).
 * @param {any} app
 * @returns {boolean} true when a tile was found and centred
 */
export function centerOnCursor(app) {
  const t = app.renderer && app.renderer.overlay && app.renderer.overlay.hover;
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return false;
  app.centerOn(t.x, t.y);
  return true;
}

/**
 * Run the fixed shortcut for `key` if it applies.
 * @param {any} app
 * @param {string} key normalised (lower-case) KeyboardEvent.key
 * @param {{target?: any}} [opt] the event target (text fields are ignored)
 * @returns {boolean} true when the key was handled
 */
export function runFixedShortcut(app, key, opt = {}) {
  if (!app || !key) return false;
  if (isTypingTarget(opt.target)) return false;
  const s = fixedShortcutFor(key);
  if (!s) return false;
  switch (s.action) {
    case 'closeAll':
      if (!app.wm || typeof app.wm.closeAll !== 'function') return false;
      app.wm.closeAll();
      return true;
    case 'center':
      if (app.tool && C_SHADOWING_TOOLS.has(app.tool.id)) return false; // the active tool owns C
      return centerOnCursor(app);
    case 'pause':
      if (typeof app.togglePause !== 'function') return false;
      app.togglePause();
      return true;
    default:
      if (typeof app.open !== 'function') return false;
      app.open(s.action);
      return true;
  }
}
