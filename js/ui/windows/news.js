/**
 * News history window (newest first). Click an item with a location to jump there.
 * Filter by category; Clear hides the current items from this view only (the simulation keeps the
 * full history, as OpenTTD does); "Message settings" sets Off / Summary / Full per category.
 */
import { el, setText } from '../dom.js';
import { localizeMoneyText } from '../newsMoney.js';
import { currentCurrency } from '../units.js';
import { listOrEmpty } from './common.js';
import { NEWS_CATEGORIES, newsCategoryOf } from '../../simulation/news.js';
import { loadNewsPrefs, saveNewsPrefs, newsLevel, NEWS_LEVELS, NEWS_LEVEL_LABEL } from '../newsPrefs.js';

/**
 * @param {import('../app.js').App} app
 */
export function openNews(app) {
  return app.wm.open('news', {
    title: 'News',
    width: 380,
    build(body) {
      // UI-only state: how many items were already in the history when Clear was pressed
      let clearedAfter = null; // the newest item at Clear time (object identity survives history trimming)
      let filter = 'all';
      const select = el('select.input', { 'aria-label': 'Filter news by category', title: 'Show only this category' },
        el('option', { value: 'all', text: 'All categories' }),
        ...NEWS_CATEGORIES.map((c) => el('option', { value: c.id, text: c.label })));
      select.addEventListener('change', () => { filter = select.value; refreshNow(); });
      const clearBtn = el('button.btn.sm', { type: 'button', text: 'Clear', title: 'Hide the current items from this list (history is kept)',
        onclick: () => { const all = app.game.state.news; clearedAfter = all.length ? all[all.length - 1] : null; refreshNow(); } });
      const settingsBtn = el('button.btn.sm', { type: 'button', text: 'Message settings', title: 'Choose Off / Summary / Full for each news category',
        onclick: () => openNewsSettings(app) });
      const bar = el('div.btn-row', null, select, clearBtn, settingsBtn);
      const list = el('div.list.scroll.news-list');
      body.append(bar, list);
      let refreshNow = () => {};
      const update = () => {
        const all = app.game.state.news;
        const prefs = loadNewsPrefs();
        const cut = clearedAfter ? all.indexOf(clearedAfter) : -1; // -1 = already trimmed away: all items are newer
        const start = clearedAfter && cut < 0 ? 0 : cut + 1;
        const shown = all.map((n, i) => ({ n, i }))
          .filter(({ i, n }) => i >= start && (filter === 'all' || newsCategoryOf(n) === filter))
          .reverse();
        listOrEmpty(list, shown, (it) => it.i + ':' + it.n.text,
          (it) => el('button.news-item.' + (it.n.kind || 'info'), { type: 'button', disabled: typeof it.n.x !== 'number',
            onclick: () => { if (typeof it.n.x === 'number') app.centerOn(it.n.x, it.n.y); } },
          el('span.mono.news-date'), el('span.news-text')),
          (row, it) => {
            setText(row.firstChild, it.n.dateStr || '');
            setText(row.lastChild, localizeMoneyText(it.n.text, currentCurrency()));
            const lvl = newsLevel(prefs, newsCategoryOf(it.n));
            row.classList.toggle('news-off', lvl === 'off');
            row.title = `${NEWS_CATEGORIES.find((c) => c.id === newsCategoryOf(it.n))?.label || ''} (${NEWS_LEVEL_LABEL[lvl]})`;
          }, filter === 'all' ? 'No news yet' : 'No news in this category');
      };
      refreshNow = update;
      return update;
    },
  });
}

/**
 * Message settings: one row per category with an Off / Summary / Full selector.
 * @param {import('../app.js').App} app
 */
function openNewsSettings(app) {
  return app.wm.open('newsSettings', {
    title: 'Message settings',
    width: 420,
    build(body) {
      const note = el('div.muted.small', { text: 'Off: not shown (kept in the News history). Summary: ticker line and sound. Full: also a pop-up message.' });
      const rows = NEWS_CATEGORIES.map((c) => {
        const sel = el('select.input', { 'aria-label': c.label, title: c.label },
          ...NEWS_LEVELS.map((l) => el('option', { value: l, text: NEWS_LEVEL_LABEL[l] })));
        sel.addEventListener('change', () => {
          const prefs = { ...loadNewsPrefs(), [c.id]: sel.value };
          saveNewsPrefs(prefs);
        });
        return { c, sel, row: el('div.btn-row', null, el('span', { text: c.label, style: { flex: '1' } }), sel) };
      });
      const resetBtn = el('button.btn.sm', { type: 'button', text: 'Reset to Summary', onclick: () => {
        saveNewsPrefs({});
        for (const r of rows) r.sel.value = 'summary';
      } });
      body.append(note, ...rows.map((r) => r.row), el('div.btn-row', null, resetBtn));
      return () => {
        const prefs = loadNewsPrefs();
        for (const r of rows) if (r.sel.value !== newsLevel(prefs, r.c.id)) r.sel.value = newsLevel(prefs, r.c.id);
      };
    },
  });
}
