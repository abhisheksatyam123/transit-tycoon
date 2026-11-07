/**
 * Game settings (difficulty / gameplay options), stored in state.settings.
 * Random-world games do not create state.settings (so day-0 hashes are unchanged); read options with getSetting(),
 * which falls back to DEFAULT_SETTINGS. The Settings window and scenarios write values with setSetting().
 */

/** Defaults; adding a key here must keep current behaviour for existing games. */
export const DEFAULT_SETTINGS = {
  /** monthly inflation of costs and cargo payments (OpenLoco Economy::updateMonthly) */
  /** building eras (gap #31b): towns build period-appropriate houses by year. Off = unchanged. */
  buildingEras: false,
  /** multi-tile houses (OpenTTD 1x2 / 2x2 temperate houses, largeHouses.js): towns may build them. Off = unchanged. */
  largeHouses: false,
  inflation: true,
  /** loan interest rate in OpenLoco units (percent per year, charged monthly as loan*rate/1200; World/Company.cpp:724). Editor default 10 in OL; 5 here keeps existing games unchanged. */
  loanInterestRate: 5,
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
  /** pathCosts: OpenTTD YAPF-like rail pathfinder costs (slopes, curves, station bypass, occupied blocks, red signals). Off by default: preserves determinism. */
  pathCosts: false,
  /** tree growth: forest tiles occasionally spread to adjacent free grass once a month (treeGrowth.js). Off by default. */
  treeGrowth: false,
  /** gradients: uphill slopes slow ground vehicles (weight * steepness), downhill gives a small bonus (vehicleMotion.gradeMph). Off by default: changes deterministic results. */
  gradients: false,
  /** roadOvertaking: OpenTTD road vehicle overtaking (roadOvertake.js): a faster road vehicle passes a slower one on a straight plain road when the opposite lane is free. Trams never. Off by default: changes results. */
  roadOvertaking: false,
  /** exclusive engine preview (OpenTTD engine.cpp): a new model is first offered to one company for a year. Off = unchanged. */
  enginePreview: false,
  /** shares: OpenTTD company shares (4 x 25%) in rival companies; the 4th share takes the company over (shares.js). Off by default. */
  shares: false,
  /** T29 OpenTTD temperate bank (produces/accepts Valuables) placed in towns of 1200+ people by the map generator. Off by default. */
  extraIndustries: false,
  /** T29 OpenLoco farm fields: farms plant field tiles around themselves and production scales with them. Off by default. */
  farmFields: false,
  /** gap #25 AI competitor companies (0..3 rivals, bus routes). 0 = none: nothing runs, no state is created. */
  aiCompanies: 0,
  /** economy recessions (OpenTTD fluct): cargo and passengers halved for ~a year, every 1-3 years. Off by default. */
  economyRecessions: false,
  /** disasters (OpenTTD difficulty.disasters): a zeppelin crashes on an airport runway and blocks landings for a while; a small UFO destroys a road vehicle. Off by default. */
  disasters: false,
  /** plane crashes on landing (OpenTTD plane_crashes): 'off' | 'reduced' | 'normal'. Off by default. */
  planeCrashes: 'off',
  /** cargo distribution for passengers and mail (OpenTTD cargodist, simplified): 'off' | 'asymmetric' | 'symmetric'. Off by default. */
  cargodist: 'off',
  /** timetable separation: vehicles on a complete timetable with shared orders depart at their evenly spaced slots. Off by default. */
  timetableSeparation: false,
  /** freight distribution (OpenTTD linkgraph distribution_default for cargo other than pax/mail): 'manual' (default, classic) | 'asymmetric' (acceptance-weighted destinations, no return demand) */
  freightDistribution: 'manual',
  /** capacity-constrained routing (OpenTTD MCF, simplified) for the cargodist link graphs. Off by default. */
  cargodistMcf: false,
  /** link graph schedule in months (OpenTTD linkgraph.recalc_interval; OTTD default 8 days). 1 = rebuild monthly (current). */
  linkgraphRecalcInterval: 1,
  /** months a link graph job runs before its routing is applied (OpenTTD linkgraph.recalc_time). 0 = applied at once (current). */
  linkgraphRecalcTime: 0,
  /** pax distribution: 'follow' (= cargodist setting) | 'manual' | 'asymmetric' | 'symmetric' (OpenTTD distribution_pax). */
  linkgraphDistributionPax: 'follow',
  /** mail distribution (OpenTTD distribution_mail). */
  linkgraphDistributionMail: 'follow',
  /** accuracy of the MCF: augmenting paths per demand pair = accuracy / 2 (OpenTTD linkgraph.accuracy, default 16 = 8 paths). */
  linkgraphAccuracy: 16,
  /** distance effect on demand, percent (OpenTTD linkgraph.demand_distance). 0 = distance ignored (current); OTTD default 100. */
  linkgraphDemandDistance: 0,
  /** effect of supply on symmetric demand, percent (OpenTTD linkgraph.demand_size). 100 = current; 0 = all destinations equal. */
  linkgraphDemandSize: 100,
  /** percent of capacity the first MCF pass saturates (OpenTTD short_path_saturation). 100 = current; OTTD default 80. */
  linkgraphShortPathSaturation: 100,
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
