/**
 * Company HQ tool (T31, OpenTTD CMD_BUILD_OBJECT OBJECT_HQ): click-to-place 2x2 HQ with top-left tile at the
 * hover tile. Hover shows the price or the refusal reason; building again relocates the HQ.
 */
import { createPlacementTool } from './placement.js';
import { money } from '../format.js';

/** @param {import('../app.js').App} app */
export function createHQTool(app) {
  return createPlacementTool(app, {
    id: 'hq',
    label: 'Company HQ',
    hint: () => {
      const hq = app.game.state.company.hq;
      const cost = app.game.estimateHQ(0, 0).cost;
      const what = hq ? 'Click a flat 2x2 site to relocate the HQ' : 'Click a flat 2x2 site to build the company HQ';
      return `${what} (${money(cost)}; the old HQ is removed). Click an HQ to open its window. Esc cancels.`;
    },
    command: (game, x, y, opts) => game.buildHQ(x, y, opts),
    footprint: (x, y) => [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }],
  });
}
