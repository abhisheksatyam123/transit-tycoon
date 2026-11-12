/**
 * Airport tools: City (6x4, the original), Small (4x3, from 1930, small planes only) and Heliport
 * (1x1 helipad, from 1963, helicopters only). Click to build; the footprint preview shows the cost.
 */
import { createPlacementTool } from './placement.js';
import { AIRPORT_TYPES, airportType } from '../../simulation/airportTypes.js';

/** Footprint size (tiles) of the City airport (kept for existing callers). */

/** Tool ids for the airport types. */
export const AIRPORT_TOOL_TYPE = {
  airport: 'city', smallAirport: 'small', heliport: 'heliport', commuterAirport: 'commuter',
  metroAirport: 'metropolitan', intlAirport: 'international', helidepot: 'helidepot', helistation: 'helistation',
};

/**
 * @param {import('../app.js').App} app
 * @param {string} [typeId] airport type ('city' | 'small' | 'heliport')
 * @returns {import('./index.js').Tool}
 */
export function createAirportTool(app, typeId = 'city') {
  const t = airportType(typeId);
  const id = Object.keys(AIRPORT_TOOL_TYPE).find((k) => AIRPORT_TOOL_TYPE[k] === typeId) || 'airport';
  const hints = {
    city: `Airport (${t.w}×${t.h}): runway E-W, hangar NW, terminal NE. Needs free land (houses are demolished).`,
    small: `Small airport (${t.w}×${t.h}, from ${t.introYear}): short runway, small planes only. Helicopters too.`,
    heliport: 'Heliport (1×1, from 1963): helicopters only. Planes cannot use it.',
    commuter: `Commuter airport (${t.w}×${t.h}, from ${t.introYear}): short strip, small planes and helicopters.`,
    metropolitan: `Metropolitan airport (${t.w}×${t.h}, from ${t.introYear}): large airport, all planes and helicopters.`,
    international: `International airport (${t.w}×${t.h}, from ${t.introYear}): largest airport, widest catchment.`,
    helidepot: `Helidepot (${t.w}×${t.h}, from ${t.introYear}): helicopters only, with a hangar.`,
    helistation: `Helistation (${t.w}×${t.h}, from ${t.introYear}): helicopters only, two helipads and a hangar.`,
  };
  return createPlacementTool(app, {
    id, label: t.name, catchment: t.catchment,
    hint: () => hints[typeId],
    command: (g, x, y, opts) => g.buildAirport(x, y, { ...(opts || {}), type: typeId }),
    footprint: (x, y) => {
      const out = [];
      for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++) out.push({ x: x + i, y: y + j });
      return out;
    },
  });
}
