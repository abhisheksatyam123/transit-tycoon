/**
 * One-way road tool (T42): click a straight road tile to cycle two-way -> one-way -> the other
 * one-way -> two-way. The hint shows the hovered tile's current state, or why it is refused.
 */
import { createPlacementTool } from './placement.js';
import { oneWayLabel, oneWayRefusal } from '../../simulation/cmdOneWay.js';

/** @param {import('../app.js').App} app */
export function createOneWayTool(app) {
  let hover = null;
  const tool = createPlacementTool(app, {
    id: 'oneWay',
    label: 'One-way road',
    hint: () => {
      if (!hover) return 'Click a straight road tile to cycle its traffic direction. Esc cancels.';
      const s = app.game.state;
      const err = oneWayRefusal(s, hover.x, hover.y);
      if (err) return `${err}.`;
      const v = s.map.tiles[hover.y * s.map.width + hover.x].oneWay | 0;
      return `${oneWayLabel(v)}: click to cycle.`;
    },
    command: (game, x, y, opts) => game.toggleOneWay(x, y, opts),
    footprint: (x, y) => [{ x, y }],
  });
  const move = tool.move;
  tool.move = (t) => { hover = t; move(t); };
  return tool;
}
