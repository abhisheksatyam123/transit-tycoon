/**
 * Status bar: date, money (red when negative), loan, company value, latest news ticker
 * (click jumps to its location), and the current tool hint.
 */
import { newsLevel, loadNewsPrefs } from './newsPrefs.js';
import { sharesValue } from '../simulation/shares.js';
import { announce } from './liveRegion.js';
import { newsCategoryOf } from '../simulation/news.js';
import { localizeMoneyText } from './newsMoney.js';
import { currentCurrency } from './units.js';
import { el, setText } from './dom.js';
import { money, date } from './format.js';
import { calculateCompanyValue } from '../simulation/loco/company.js';
import { getSetting } from '../simulation/settings.js';
import { calendarDateOf } from '../simulation/calendarClock.js';

/**
 * Live company value with the same formula as the monthly history (OpenLoco calculateCompanyValue:
 * cash - loan + 8 x recent profit + value of each of the player's vehicles), so the status bar,
 * the graphs and the league agree. Rival vehicles (ownerId) are excluded.
 * @param {any} state
 * @returns {number}
 */
export function companyValue(state) {
  const c = state.company;
  if (!c || typeof c.money !== 'number') return (c && c.companyValue) || 0;
  const cv = calculateCompanyValue(c, state.vehicles.filter((v) => v.ownerId == null));
  // shares are added before the >= 0 clamp, so a negative company with shares shows its true total
  return Math.max(0, (cv.rawValue ?? 0) + sharesValue(state));
}

/**
 * @param {HTMLElement} root
 * @param {import('./app.js').App} app
 * @returns {{update:()=>void, flashNews:(n:any)=>void}}
 */
export function createStatusbar(root, app) {
  const dateEl = el('span.sb-value.mono');
  const moneyEl = el('span.sb-value.mono');
  const loanEl = el('span.sb-value.mono');
  const valueEl = el('span.sb-value.mono');
  const newsEl = el('button.sb-news', { type: 'button', title: 'Latest news (click to jump to location)' });
  const item = (label, v, cls) => el('div.sb-item' + (cls ? '.' + cls : ''), null, el('span.sb-label', { text: label }), v);
  root.appendChild(item('Date', dateEl));
  root.appendChild(el('div.metric-divider'));
  root.appendChild(item('Money', moneyEl));
  root.appendChild(el('div.metric-divider'));
  root.appendChild(item('Loan', loanEl, 'sb-optional'));
  root.appendChild(el('div.metric-divider.sb-optional'));
  root.appendChild(item('Value', valueEl, 'sb-optional'));
  root.appendChild(el('div.metric-divider'));
  root.appendChild(newsEl);

  /** @type {any} */
  let shownNews = null;
  let newsSeen = false; // the first ticker value at startup is not announced
  newsEl.addEventListener('click', () => {
    // reopen the ticker item as the news popup (and start the 'last message' cycle from it)
    if (shownNews) { app.lastNewsItem = shownNews; app.showNewsPopup(shownNews); }
    else app.open('news');
  });

  const update = () => {
    const s = app.game.state;
    setText(dateEl, date(calendarDateOf(s))); // opt-in calendar clock (timekeepingUnits); off = state.date
    setText(moneyEl, getSetting(s, 'infiniteMoney') === true ? '∞' : money(s.company.money));
    moneyEl.classList.toggle('neg', s.company.money < 0);
    setText(loanEl, money(s.company.loan));
    setText(valueEl, money(companyValue(s)));
    // ticker shows the newest item whose category is not Off (Message settings); history keeps all
    const prefs = loadNewsPrefs();
    let latest = null;
    for (let i = s.news.length - 1; i >= 0; i--) {
      if (newsLevel(prefs, newsCategoryOf(s.news[i])) !== 'off') { latest = s.news[i]; break; }
    }
    if (latest !== shownNews) {
      shownNews = latest;
      newsEl.textContent = '';
      if (latest) {
        newsEl.appendChild(el('span.sb-news-date.mono', { text: latest.dateStr || '' }));
        const text = localizeMoneyText(latest.text, currentCurrency());
        newsEl.appendChild(el('span.sb-news-text.' + (latest.kind || 'info'), { text }));
        if (newsSeen) announce(`News: ${latest.dateStr ? latest.dateStr + ': ' : ''}${text}`);
      }
      newsSeen = true;
    }
  };

  const flashNews = () => {
    newsEl.classList.remove('flash');
    void newsEl.offsetWidth;
    newsEl.classList.add('flash');
  };

  update();
  return { update, flashNews };
}
