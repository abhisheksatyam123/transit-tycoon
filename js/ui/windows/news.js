/**
 * News history window (newest first). Click an item with a location to jump there.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';

/**
 * @param {import('../app.js').App} app
 */
export function openNews(app) {
  return app.wm.open('news', {
    title: 'News',
    width: 380,
    build(body) {
      const list = el('div.list.scroll.news-list');
      body.append(list);
      return () => {
        const news = app.game.state.news.slice().reverse();
        listOrEmpty(list, news, (n) => n.tick + ':' + n.text,
          (n) => el('button.news-item.' + (n.kind || 'info'), { type: 'button', disabled: typeof n.x !== 'number',
            onclick: () => { if (typeof n.x === 'number') app.centerOn(n.x, n.y); } },
          el('span.mono.news-date'), el('span.news-text')),
          (row, n) => { setText(row.firstChild, n.dateStr || ''); setText(row.lastChild, n.text); }, 'No news yet');
      };
    },
  });
}
