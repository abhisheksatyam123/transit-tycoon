/**
 * "Last message" cycling (OpenTTD news_gui.cpp ShowLastNewsMessage): the first use shows the newest
 * visible news item, each further use steps to the next older one, and past the oldest it wraps to the
 * newest. Pure so it can be unit-tested. UI-only: the cursor is kept in the browser, never in the save.
 */

/**
 * @param {any[]} news state.news, oldest first
 * @param {any} cur the item shown last (object identity), or null
 * @param {(item:any)=>boolean} isVisible false for items the player set to Off
 * @returns {any} the next item to show, or null when there is nothing visible
 */
export function nextLastNews(news, cur, isVisible) {
  if (!news || !news.length) return null;
  const idx = cur ? news.indexOf(cur) : -1; // -1 (none / deleted by the history cap): start from the newest
  for (let j = (idx < 0 ? news.length : idx) - 1; j >= 0; j--) if (isVisible(news[j])) return news[j];
  for (let j = news.length - 1; j >= 0; j--) if (isVisible(news[j])) return news[j]; // wrap to the newest
  return null;
}
