/**
 * Read-only cargo metadata helpers for the UI (names, colours) from the core data table.
 */
import { CARGOS } from '../config/cargos.js';

/** @type {Record<string, {id:string,name:string,color:string,unit:string}>} */
const BY_ID = {};
for (const c of CARGOS) BY_ID[c.id] = c;

/** All cargo records in table order. */

/**
 * Display name of a cargo id.
 * @param {string} id
 * @returns {string}
 */
export function cargoName(id) {
  return (BY_ID[id] && BY_ID[id].name) || id || '—';
}

/**
 * Colour of a cargo id.
 * @param {string} id
 * @returns {string}
 */
export function cargoColor(id) {
  return (BY_ID[id] && BY_ID[id].color) || '#94a3b8';
}

/**
 * Unit of a cargo id (e.g. 'tonnes').
 * @param {string} id
 * @returns {string}
 */

/**
 * Map of id -> colour (for sprite tinting).
 * @returns {Record<string,string>}
 */
export function cargoColorMap() {
  const m = {};
  for (const c of CARGOS) m[c.id] = c.color;
  return m;
}

/**
 * Small coloured swatch + name element HTML-safe text pieces.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function cargoChip(id) {
  const s = document.createElement('span');
  s.className = 'cargo-chip';
  const dot = document.createElement('i');
  dot.style.background = cargoColor(id);
  s.appendChild(dot);
  s.appendChild(document.createTextNode(cargoName(id)));
  return s;
}
