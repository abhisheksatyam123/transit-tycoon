/**
 * Tile / Query info window: shows game.tileInfo(x,y).lines plus links to the
 * town / industry / station / depot found on that tile.
 */
import { el, clear } from '../dom.js';

/**
 * @param {import('../app.js').App} app
 * @param {{x:number,y:number}} pos
 */
export function openTileInfo(app, pos) {
  app.wm.close('tileInfo');
  return app.wm.open('tileInfo', {
    title: `Tile ${pos.x}, ${pos.y}`,
    width: 300,
    build(body) {
      const lines = el('div.info-lines');
      const links = el('div.btn-row');
      body.append(lines, links);
      let sig = '';
      return () => {
        const info = app.game.tileInfo(pos.x, pos.y);
        const s = JSON.stringify(info.lines) + (info.station ? info.station.id : '') + (info.depot ? info.depot.id : '');
        if (s === sig) return;
        sig = s;
        clear(lines);
        for (const l of info.lines || []) lines.appendChild(el('div.info-line', { text: l }));
        clear(links);
        if (info.town) links.appendChild(el('button.btn', { type: 'button', text: 'Town: ' + info.town.name, onclick: () => app.open('town', info.town.id) }));
        if (info.industry) links.appendChild(el('button.btn', { type: 'button', text: info.industry.name, onclick: () => app.open('industry', info.industry.id) }));
        if (info.station) links.appendChild(el('button.btn', { type: 'button', text: 'Station: ' + info.station.name, onclick: () => app.open('station', info.station.id) }));
        if (info.depot) links.appendChild(el('button.btn', { type: 'button', text: 'Open depot', onclick: () => app.open('depot', info.depot.id) }));
      };
    },
  }, { x: 12, y: 12 });
}
