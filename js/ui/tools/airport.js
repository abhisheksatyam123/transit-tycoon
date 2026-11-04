/** Airport tool: 6x4 footprint (runway along x, terminal/tower NE, hangar NW). Click to build. */
import { createPlacementTool } from './placement.js';

/** Footprint size (tiles). */
export const AIRPORT_W = 6;
export const AIRPORT_H = 4;

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createAirportTool(app) {
  return createPlacementTool(app, {
    id: 'airport', label: 'Airport', catchment: 6,
    hint: () => `Airport (${AIRPORT_W}×${AIRPORT_H}): runway E-W, hangar NW, terminal NE. Needs free land (houses are demolished).`,
    command: (g, x, y, opts) => g.buildAirport(x, y, { ...(opts || {}) }),
    footprint: (x, y) => {
      const out = [];
      for (let j = 0; j < AIRPORT_H; j++) for (let i = 0; i < AIRPORT_W; i++) out.push({ x: x + i, y: y + j });
      return out;
    },
  });
}
