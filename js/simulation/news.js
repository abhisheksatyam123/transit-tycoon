/**
 * News feed helpers.
 */
import { MAX_NEWS } from './constants.js';
import { formatDate } from './date.js';
import { MESSAGE_KINDS, absoluteDay } from './loco/messageManager.js';

/**
 * Append a news item to state.news (capped) and return it.
 * @param {object} state
 * @param {string} text
 * @param {'info'|'good'|'bad'} [kind]
 * @param {number} [x]
 * @param {number} [y]
 */
export function pushNews(state, text, kind = 'info', x, y) {
  const item = { tick: state.tick, dateStr: formatDate(state.date), text, kind,
    date: absoluteDay(state.date), duration: (MESSAGE_KINDS[kind] || MESSAGE_KINDS.info).duration };
  if (x !== undefined && y !== undefined) { item.x = x; item.y = y; }
  state.news.push(item);
  if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
  return item;
}

/**
 * Push news and emit a 'news' event through the context ({state, emit}).
 * @returns {object} news item
 */
export function notify(ctx, text, kind = 'info', x, y) {
  const item = pushNews(ctx.state, text, kind, x, y);
  if (ctx.emit) ctx.emit('news', item);
  return item;
}
