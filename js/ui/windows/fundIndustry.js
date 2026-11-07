/**
 * Fund industry picker: choose an industry type, then click a site on the map (Fund industry tool, Q).
 * Each row shows the inflation-adjusted price. Picking a type activates the tool.
 */
import { el } from '../dom.js';
import { money } from '../format.js';
import { EXTRA_INDUSTRY_TYPES } from '../../config/industries.js';
import { getSetting } from '../../simulation/settings.js';
import { bankAvailable, industryTypesFor } from '../../simulation/industries.js';
import { isToyland } from '../../simulation/climate.js';
import { rawIndustryMode, isRawIndustry } from '../../simulation/cmdFound.js';

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
      const toyland = isToyland(app.game.state); // TY2: toyland games offer their own set only
      const chains = !toyland && getSetting(app.game.state, 'extraIndustries') ? EXTRA_INDUSTRY_TYPES.filter((t) => t.placement !== 'inTown') : [];
      const extra = toyland ? [] : [...(bankAvailable(app.game.state) ? EXTRA_INDUSTRY_TYPES.filter((t) => t.placement === 'inTown') : []), ...chains];
      const mode = rawIndustryMode(app.game.state);
      for (const type of [...industryTypesFor(app.game.state), ...extra]) {
        const raw = isRawIndustry(type);
        // OpenTTD raw_industry_construction: 'none' hides raw industries; 'prospect' swaps the Fund label for Prospect (no site click)
        if (raw && mode === 'none') continue;
        const prospect = raw && mode === 'prospect';
        const price = app.game.estimateFound('industry', 0, 0, type.id).cost;
        list.append(el('button.list-row', {
          type: 'button', title: prospect ? `${type.name}: prospect (random site, chance)` : `${type.name}: ${type.w}x${type.h} tiles`,
          onclick: () => {
            if (prospect) {
              const r = app.game.fundIndustry(type.id, 0, 0);
              if (!r.ok) app.toast?.(r.error, 'error'); // success/failure arrive as news (pushNews, toast per news level)
              app.ui?.updateHint?.();
              return;
            }
            app.tools.fundIndustry.typeId = type.id;
            // app.setTool toggles an already active tool off, so only switch to it when it is not active yet
            if (app.tool !== app.tools.fundIndustry) app.setTool('fundIndustry');
            app.ui?.updateHint?.();
          },
        }, el('i.swatch', { style: { background: type.color || '#888' } }), el('span.name', { text: prospect ? `Prospect ${type.name}` : type.name }), el('span.mono.num', { text: money(price) })));
      }
      return () => {};
    },
  });
}
