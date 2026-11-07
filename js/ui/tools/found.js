/**
 * Found town (K) and fund industry (Q) tools (OpenTTD CMD_FOUND_TOWN / CMD_BUILD_INDUSTRY).
 * Both are click-to-place tools built on createPlacementTool: hover shows a green/red preview with the
 * inflated price (or the refusal reason); click commits through game.foundTown / game.fundIndustry.
 * Fund industry places the type chosen in the Fund industry window (windows/fundIndustry.js); with no
 * type chosen the window opens.
 */
import { createPlacementTool } from './placement.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { money } from '../format.js';
import { costText } from '../editorCost.js';
import { isRawIndustry, rawIndustryMode } from '../../simulation/cmdFound.js';

/** @param {import('../app.js').App} app */
export function createFoundTownTool(app) {
  return createPlacementTool(app, {
    id: 'foundTown',
    label: 'Found town',
    hint: () => `Click a flat, dry tile to found a town (${costText(app.game, app.game.estimateFound('town', 0, 0).cost)}). Towns must be 8+ tiles apart. Esc cancels.`,
    command: (game, x, y, opts) => game.foundTown(x, y, opts),
    footprint: (x, y) => [{ x, y }],
  });
}

/**
 * Fund industry tool: the type comes from the tool's `typeId` (set by the Fund industry window).
 * @param {import('../app.js').App} app
 */
export function createFundIndustryTool(app) {
  const tool = createPlacementTool(app, {
    id: 'fundIndustry',
    label: 'Fund industry',
    hint: () => {
      const type = tool.typeId && INDUSTRY_BY_ID[tool.typeId];
      if (!type) return 'Pick an industry type in the Fund industry window (opens on click). Esc cancels.';
      const cost = app.game.estimateFound('industry', 0, 0, type.id).cost;
      if (isRawIndustry(type) && rawIndustryMode(app.game.state) === 'prospect') return `Prospecting ${type.name} costs ${costText(app.game, cost)}; the site is random. Esc cancels.`;
      return `Click a site for a new ${type.name} (${type.w}x${type.h}, ${costText(app.game, cost)}). Needs flat land and 8+ tiles from towns. Esc cancels.`;
    },
    command: (game, x, y, opts) => {
      if (!tool.typeId) return { ok: false, error: 'Choose an industry type first' };
      return game.fundIndustry(tool.typeId, x, y, opts);
    },
    footprint: (x, y) => {
      const type = tool.typeId && INDUSTRY_BY_ID[tool.typeId];
      const w = type ? type.w : 1, h = type ? type.h : 1;
      const out = [];
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push({ x: xx, y: yy });
      return out;
    },
  });
  tool.typeId = null;
  const origUp = tool.up;
  // no type yet: a click opens the picker instead of trying to place
  tool.up = (t) => {
    if (!tool.typeId) { app.open('fundIndustry'); return; }
    origUp(t);
  };
  return tool;
}
