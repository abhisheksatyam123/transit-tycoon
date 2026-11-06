/**
 * Fund industry picker: choose an industry type, then click a site on the map (Fund industry tool, Q).
 * Each row shows the inflation-adjusted price. Picking a type activates the tool.
 */
import { el } from '../dom.js';
import { money } from '../format.js';
import { INDUSTRY_TYPES, EXTRA_INDUSTRY_TYPES } from '../../config/industries.js';
import { getSetting } from '../../simulation/settings.js';
import { bankAvailable } from '../../simulation/industries.js';

/** @param {import('../app.js').App} app */
export function openFundIndustry(app) {
  return app.wm.open('fundIndustry', {
    title: 'Fund industry',
    width: 300,
    build(body) {
      const list = el('div.list.scroll');
      body.append(list);
      const hint = el('div.muted', { text: 'Choose a type, then click a site on the map (flat land, 8+ tiles from towns).' });
      body.prepend(hint);
      // T29: the bank (OpenTTD temperate) is offered only when a town of 1200+ people exists
      // T-IN: chain industries (quarry, paper mill, ...) are offered when extraIndustries is on; the bank as before
      const chains = getSetting(app.game.state, 'extraIndustries') ? EXTRA_INDUSTRY_TYPES.filter((t) => t.placement !== 'inTown') : [];
      const extra = [...(bankAvailable(app.game.state) ? EXTRA_INDUSTRY_TYPES.filter((t) => t.placement === 'inTown') : []), ...chains];
      for (const type of [...INDUSTRY_TYPES, ...extra]) {
        const price = app.game.estimateFound('industry', 0, 0, type.id).cost;
        list.append(el('button.list-row', {
          type: 'button', title: `${type.name}: ${type.w}x${type.h} tiles`,
          onclick: () => {
            app.tools.fundIndustry.typeId = type.id;
            // app.setTool toggles an already active tool off, so only switch to it when it is not active yet
            if (app.tool !== app.tools.fundIndustry) app.setTool('fundIndustry');
            app.ui?.updateHint?.();
          },
        }, el('i.swatch', { style: { background: type.color || '#888' } }), el('span.name', { text: type.name }), el('span.mono.num', { text: money(price) })));
      }
      return () => {};
    },
  });
}
