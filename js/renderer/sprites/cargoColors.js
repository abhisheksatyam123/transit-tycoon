/** Cargo colour lookup for load indicators (set from core data by vehicles.js). */
let colors = {};

/** @param {Record<string,string>} map */
export function setCargoColorMap(map) { colors = map || {}; }

/** @param {string} cargo @returns {string} */
export function cargoColor(cargo) { return colors[cargo] || '#9ca3af'; }
