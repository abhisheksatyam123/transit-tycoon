/**
 * Status bar: date, money (red when negative), loan, company value, latest news ticker
 * (click jumps to its location), and the current tool hint.
 */
import { newsLevel, loadNewsPrefs } from './newsPrefs.js';
import { announce } from './liveRegion.js';
import { newsCategoryOf } from '../simulation/news.js';
import { localizeMoneyText } from './newsMoney.js';
import { currentCurrency } from './units.js';
import { el, setText } from './dom.js';
import { money, date } from './format.js';

/**
 * Company value estimate: money - loan + vehicle values.
 * @param {any} state
 * @returns {number}
 */
export function companyValue(state) {
  let v = state.company.money - state.company.loan;
  for (const veh of state.vehicles) v += veh.value || 0;
  return v;
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
    if (shownNews && typeof shownNews.x === 'number') app.centerOn(shownNews.x, shownNews.y);
    else app.open('news');
  });

  const update = () => {
    const s = app.game.state;
    setText(dateEl, date(s.date));
    setText(moneyEl, money(s.company.money));
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
