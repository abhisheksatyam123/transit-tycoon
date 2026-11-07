/**
 * UI-only setting for drag signals (OpenTTD drag_signals_density): signal every N tiles along a dragged run.
 * Stored in localStorage 'tt.signalSpacing'; never part of game state or the save hash. Default 4.
 */
import { clampSignalSpacing } from '../simulation/signalRun.js';

const KEY = 'tt.signalSpacing';
export const DEFAULT_SIGNAL_SPACING = 4;

/** Current drag signal spacing (1..16 tiles). */
export function getSignalSpacing() {
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { raw = null; }
  return raw == null ? DEFAULT_SIGNAL_SPACING : clampSignalSpacing(raw);
}

/** Set the drag signal spacing (clamped). Returns the stored value. */
export function setSignalSpacing(v) {
  const n = clampSignalSpacing(v);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(n)); } catch { /* private mode */ }
  return n;
}
