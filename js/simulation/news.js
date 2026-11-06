/**
 * News feed helpers.
 *
 * Every item carries a category (OpenTTD NewsType, Message Settings). The category is stored as a
 * NON-enumerable property so it is not serialized: the save/world hash is unchanged by categories and
 * old saves load with uncategorised items (newsCategoryOf -> 'general').
 */
import { MAX_NEWS } from './constants.js';
import { formatDate } from './date.js';
import { MESSAGE_KINDS, absoluteDay } from './loco/messageManager.js';

/** News categories (OpenTTD NewsType order, news_type.h). `label` is for the Message settings window. */
export const NEWS_CATEGORIES = [
  { id: 'arrival', label: 'Arrival of first vehicle' },
  { id: 'accident', label: 'Accidents and disasters' },
  { id: 'company', label: 'Company information' },
  { id: 'industryOpen', label: 'Opening of industries' },
  { id: 'industryClose', label: 'Closing of industries' },
  { id: 'economy', label: 'Economy changes' },
  { id: 'production', label: 'Production changes' },
  { id: 'advice', label: 'Vehicle advice and info' },
  { id: 'newVehicle', label: 'New vehicles' },
  { id: 'acceptance', label: 'Acceptance changes' },
  { id: 'subsidy', label: 'Subsidies' },
  { id: 'general', label: 'General information' },
];

export const NEWS_CATEGORY_IDS = NEWS_CATEGORIES.map((c) => c.id);

/**
 * Append a news item to state.news (capped) and return it.
 * @param {object} state
 * @param {string} text
 * @param {'info'|'good'|'bad'} [kind]
 * @param {number} [x]
 * @param {number} [y]
 * @param {string} [cat] news category id (NEWS_CATEGORY_IDS); default 'general'
 */
export function pushNews(state, text, kind = 'info', x, y, cat = 'general') {
  const item = { tick: state.tick, dateStr: formatDate(state.date), text, kind,
    date: absoluteDay(state.date), duration: (MESSAGE_KINDS[kind] || MESSAGE_KINDS.info).duration };
  if (x !== undefined && y !== undefined) { item.x = x; item.y = y; }
  Object.defineProperty(item, 'cat', { value: cat, enumerable: false, writable: true, configurable: true });
  state.news.push(item);
  if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
  return item;
}

/** Category of a news item ('general' for items without one, e.g. loaded from an old save). */
export function newsCategoryOf(item) {
  const c = item && item.cat;
  return NEWS_CATEGORY_IDS.includes(c) ? c : 'general';
}

/**
 * Push news and emit a 'news' event through the context ({state, emit}).
 * @returns {object} news item
 */
export function notify(ctx, text, kind = 'info', x, y, cat = 'general') {
  const item = pushNews(ctx.state, text, kind, x, y, cat);
  if (ctx.emit) ctx.emit('news', item);
  return item;
}
