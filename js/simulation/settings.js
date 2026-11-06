/**
 * Game settings (difficulty / gameplay options), stored in state.settings.
 * Random-world games do not create state.settings (so day-0 hashes are unchanged); read options with getSetting(),
 * which falls back to DEFAULT_SETTINGS. The Settings window and scenarios write values with setSetting().
 */

/** Defaults; adding a key here must keep current behaviour for existing games. */
export const DEFAULT_SETTINGS = {
  /** monthly inflation of costs and cargo payments (OpenLoco Economy::updateMonthly) */
  inflation: true,
  /** cargo payment rate in percent of the OpenLoco formula (Moscow scenario uses less: busy prebuilt network) */
  cargoPaymentPercent: 100,
  /** vehicle breakdowns: 'none' | 'reduced' | 'normal' */
  breakdowns: 'normal',
  /** subsidies offered monthly */
  subsidies: true,
  /**
   * default service interval in days for NEW vehicles (0 = off). Only read when a vehicle is bought, so
   * the default can change without touching existing vehicles. Kept at 0 so existing games are unchanged.
   */
  serviceIntervalDays: 0,
  /** autorenew (OpenTTD/OpenLoco autoreplace by age): a vehicle past its max age that is stopped in a depot is replaced by a new one of the same model (price minus resale). Off by default. */
  autorenew: false,
  /** tree growth: forest tiles occasionally spread to adjacent free grass once a month (treeGrowth.js). Off by default. */
  treeGrowth: false,
  /** gradients: uphill slopes slow ground vehicles (weight * steepness), downhill gives a small bonus (vehicleMotion.gradeMph). Off by default: changes deterministic results. */
  gradients: false,
};

/** Read a setting (state.settings value or the default). */
export function getSetting(state, key) {
  const s = state && state.settings;
  if (s && Object.prototype.hasOwnProperty.call(s, key)) return s[key];
  return DEFAULT_SETTINGS[key];
}

/** Write a setting (creates state.settings lazily). */
export function setSetting(state, key, value) {
  if (!state.settings) state.settings = {};
  state.settings[key] = value;
}

/** All settings merged with defaults (for UI). */
export function allSettings(state) {
  return { ...DEFAULT_SETTINGS, ...(state && state.settings) };
}
