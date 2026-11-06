/**
 * Building eras (gap #31b): residential house types are period-appropriate. Years come from
 * OpenTTD src/table/town_land.h (_original_house_specs, MS(min_year, max_year, ...)); the ids are the
 * OpenTTD house ids that have stage-3 OpenGFX sprites (js/renderer/pack/ottd_tables.js). GPL-2.0 data.
 * Only used when the `buildingEras` setting is on; default games never read this table.
 */
import { getSetting } from './settings.js';

/** OpenTTD MAX_YEAR stand-in: "no maximum". */
const NO_MAX = 9999;

/**
 * @typedef {{id:number, min:number, max:number, levels:number[], name:string}} EraHouse
 * min/max = OpenTTD min_year/max_year (0 = from the start, NO_MAX = still built).
 * levels = town house levels (1 small .. 4 tall) the type may fill.
 */
export const ERA_HOUSES = [
  { id: 25, min: 0, max: 1952, levels: [1], name: 'Cottages' },
  { id: 6, min: 0, max: NO_MAX, levels: [1, 2], name: 'Town houses' },
  { id: 26, min: 1931, max: NO_MAX, levels: [1, 2], name: 'Houses' },
  { id: 27, min: 1935, max: NO_MAX, levels: [2, 3], name: 'Flats' },
  { id: 14, min: 1930, max: 1960, levels: [2], name: 'Shops and offices 1' },
  { id: 15, min: 1930, max: 1960, levels: [2], name: 'Shops and offices 1' },
  { id: 16, min: 1930, max: 1960, levels: [2], name: 'Shops and offices 1' },
  { id: 29, min: 0, max: 1955, levels: [2, 3], name: 'Shops and offices 2' },
  { id: 13, min: 1951, max: NO_MAX, levels: [2, 3], name: 'Office block 2' },
  { id: 1, min: 1957, max: NO_MAX, levels: [3, 4], name: 'Office block 1' },
  { id: 28, min: 1963, max: NO_MAX, levels: [3, 4], name: 'Tall office block 2' },
  { id: 0, min: 1963, max: NO_MAX, levels: [4], name: 'Tall office block 1' },
  { id: 2, min: 1968, max: NO_MAX, levels: [2, 3], name: 'Small block of flats' },
  { id: 30, min: 1973, max: NO_MAX, levels: [3, 4], name: 'Shops and offices 3' },
  { id: 4, min: 1975, max: NO_MAX, levels: [4], name: 'Large office block' },
  { id: 19, min: 1985, max: NO_MAX, levels: [3, 4], name: 'Office block 3' },
];

/** True if OpenTTD allows building house type `h` in `year`. */
export function houseAllowedInYear(h, year) {
  return year >= h.min && year <= h.max;
}

/** Era house by id, or undefined. */
export function eraHouse(id) {
  return ERA_HOUSES.find((h) => h.id === id);
}

/** Is the `buildingEras` setting on for this state? */
export function erasEnabled(state) {
  return getSetting(state, 'buildingEras') === true;
}

/**
 * Candidate house types for a level in `year`. Looks at the level first, then the neighbouring
 * levels (nearest first) so a tall-town tile in 1950 still gets the best period type.
 * @returns {EraHouse[]}
 */
export function eraCandidates(level, year) {
  const want = Math.max(1, Math.min(4, level | 0 || 1));
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const lv = want + d;
    if (lv < 1 || lv > 4) continue;
    const c = ERA_HOUSES.filter((h) => h.levels.includes(lv) && houseAllowedInYear(h, year));
    if (c.length) return c;
  }
  return [];
}

/**
 * Pick a period-appropriate house id for a level and year. Uses the rng only when there is a
 * candidate, so the sequence is fixed for a given state.
 * @param {{int:(a:number,b:number)=>number}} rng
 * @returns {number|null} OpenTTD house id
 */
export function pickEraHouse(rng, level, year) {
  const c = eraCandidates(level, year);
  if (!c.length) return null;
  return c[rng.int(0, c.length - 1)].id;
}
