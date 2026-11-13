/**
 * Objects tool (gap #31b, OpenTTD CMD_BUILD_OBJECT): click-to-place Transmitter (1x1), Lighthouse (1x1, coast),
 * Owned land (1x1, stops towns building there) or the Company HQ (2x2). Press J to cycle the kind; the hint
 * names the current kind and its price. Hover shows the price or the refusal reason.
 */
import { createPlacementTool } from './placement.js';
import { money } from '../format.js';
import { costText } from '../editorCost.js';
import { OBJECT_TYPES } from '../../simulation/cmdObject.js';

/** Kinds in cycle order: the three cmdObject types, then the HQ. */
const OBJECT_KINDS = [...OBJECT_TYPES, 'hq'];
const LABEL = { transmitter: 'Transmitter', lighthouse: 'Lighthouse', owned: 'Owned land', hq: 'Company HQ' };

/** @param {import('../app.js').App} app */
export function createObjectsTool(app) {
  let kind = 'transmitter';
  const price = () => (kind === 'hq' ? app.game.estimateHQ(0, 0).cost : app.game.estimateObject(kind, 0, 0).cost);
  const tool = createPlacementTool(app, {
    id: 'objects',
    label: 'Objects',
    hint: () => `Objects: ${LABEL[kind]} (${costText(app.game, price())}). Click a site to build; J cycles kind (Transmitter, Lighthouse, Owned land, HQ). Esc cancels.`,
    command: (game, x, y, opts) => (kind === 'hq' ? game.buildHQ(x, y, opts) : game.buildObject(kind, x, y, opts)),
    footprint: (x, y) => (kind === 'hq'
      ? [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]
      : [{ x, y }]),
    key: (e) => {
      if (e.key !== 'j' && e.key !== 'J') return false;
      kind = OBJECT_KINDS[(OBJECT_KINDS.indexOf(kind) + 1) % OBJECT_KINDS.length];
      return true;
    },
  });
  // Keep the tool's live hint accessor (createPlacementTool defines it as a getter): spreading the object
  // would snapshot it, freezing the hint and the dry-run footprint after J. Add `kind` to the same object.
  Object.defineProperty(tool, 'kind', { get: () => kind, configurable: true });
  return tool;
}
