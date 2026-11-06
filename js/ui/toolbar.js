/**
 * Main toolbar: speed controls, build tools, window buttons, sound toggle.
 */
import { el } from './dom.js';
import { icon } from './icons.js';
import { scanIssues } from './diagCache.js';
import { isMuted, setMuted, play, unlockAudio } from '../audio/sfx.js';

/** Build tool buttons: [toolId, label, icon, shortcut]. */
export const TOOL_BUTTONS = [
  ['rail', 'Rail', 'rail', '1'],
  ['road', 'Road', 'road', '2'],
  ['station', 'Station', 'station', '3'],
  ['busStop', 'Bus Stop', 'bus', '4'],
  ['truckStop', 'Truck Stop', 'truck', '5'],
  ['railDepot', 'Rail Depot', 'railDepot', '6'],
  ['roadDepot', 'Road Depot', 'roadDepot', '7'],
  ['demolish', 'Demolish', 'demolish', '8'],
  ['query', 'Query', 'query', '9'],
  ['airport', 'Airport', 'airport', '0'],
];

/** Window buttons: [windowName, label, icon, shortcut]. */
export const WINDOW_BUTTONS = [
  ['vehicles', 'Vehicles', 'vehicles', 'V'],
  ['finances', 'Finances', 'finances', 'F'],
  ['towns', 'Towns', 'towns', 'T'],
  ['industries', 'Industries', 'industries', 'I'],
  ['news', 'News', 'news', 'N'],
  ['traffic', 'Traffic', 'traffic', 'X'],
  ['goals', 'Goals', 'goals', 'O'],
  ['subsidies', 'Subsidies', 'subsidies', ''],
  ['metro', 'Metro', 'metro', 'U'],
  ['issues', 'Issues', 'issues', 'G'],
  ['settings', 'Settings', 'settings', ''],
  ['save', 'Save', 'save', ''],
  ['load', 'Load', 'load', 'L'],
  ['newGame', 'New Game', 'newGame', ''],
  ['help', 'Help', 'help', 'H'],
];

const SPEEDS = [[0, 'Pause', 'pause', 'Space'], [1, '1x', 'play1', ''], [2, '2x', 'play2', ''], [4, '4x', 'play4', '']];

/**
 * Toolbar button element.
 * @param {string} iconName
 * @param {string} label
 * @param {string} title
 * @param {()=>void} onClick
 * @returns {HTMLButtonElement}
 */
function tbButton(iconName, label, title, onClick) {
  return /** @type {HTMLButtonElement} */ (el('button.tb-btn.hud-btn', { type: 'button', title, 'aria-label': label, onclick: onClick },
    icon(iconName), el('span.tb-label', { text: label })));
}

/**
 * Render the toolbar into its container.
 * @param {HTMLElement} root
 * @param {import('./app.js').App} app
 * @returns {{refresh:()=>void}}
 */
export function createToolbar(root, app) {
  const speedBtns = SPEEDS.map(([s, label, ic, key]) => {
    const b = tbButton(ic, label, `${label === 'Pause' ? 'Pause' : 'Speed ' + label}${key ? ' (' + key + ')' : ''}`, () => app.setSpeed(/** @type {number} */ (s)));
    b.dataset.speed = String(s);
    return b;
  });
  const toolBtns = TOOL_BUTTONS.map(([id, label, ic, key]) => {
    const b = tbButton(ic, label, `${label} (${key})`, () => { play('click'); app.setTool(id); });
    b.dataset.tool = id;
    return b;
  });
  const winBtns = WINDOW_BUTTONS.map(([name, label, ic, key]) =>
    tbButton(ic, label, key ? `${label} (${key})` : label, () => app.open(name)));
  winBtns.forEach((b, i) => { b.dataset.win = WINDOW_BUTTONS[i][0]; });
  const issuesBtn = winBtns.find((b) => b.dataset.win === 'issues');
  const badge = el('span.tb-badge', { title: 'Errors + warnings' });
  if (issuesBtn) issuesBtn.appendChild(badge);
  /** Update the Issues badge from the cached diagnostics (at most every 3 s). */
  const updateBadge = () => {
    if (!issuesBtn) return;
    const r = scanIssues(app.game);
    const sum = r.summary;
    const n = sum ? (sum.error || 0) + (sum.warn || 0) : 0;
    badge.textContent = n ? String(n) : '';
    badge.classList.toggle('err', !!(sum && sum.error));
    badge.classList.toggle('warn', !!(sum && !sum.error && sum.warn));
  };
  setInterval(updateBadge, 3000);
  /** Open the result dialog when the objective changes from active to won/lost while playing. */
  const seen = new WeakMap();
  setInterval(() => {
    const o = app.game && app.game.state.objective;
    if (!o) return;
    if (!seen.has(o)) { seen.set(o, o.status); return; }
    if (seen.get(o) === 'active' && o.status !== 'active') { seen.set(o, o.status); app.open('objective'); }
  }, 1000);
  setTimeout(updateBadge, 500);
  const sound = tbButton(isMuted() ? 'soundOff' : 'soundOn', 'Sound', 'Toggle sound (M)', () => toggleSound());
  const toggleSound = () => {
    unlockAudio();
    setMuted(!isMuted());
    sound.replaceChild(icon(isMuted() ? 'soundOff' : 'soundOn'), sound.firstChild);
    sound.classList.toggle('muted', isMuted());
    play('click');
  };
  sound.classList.toggle('muted', isMuted());

  root.appendChild(el('div.tb-brand', null, el('span.tb-logo', { text: 'TT' }), el('span.tb-name', { text: 'Transit Tycoon' })));
  root.appendChild(el('div.tb-group', { 'aria-label': 'Speed' }, speedBtns));
  root.appendChild(el('div.tb-sep'));
  root.appendChild(el('div.tb-group', { 'aria-label': 'Build tools' }, toolBtns));
  root.appendChild(el('div.tb-sep'));
  root.appendChild(el('div.tb-group', { 'aria-label': 'Windows' }, winBtns, sound));

  const refresh = () => {
    for (const b of speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === app.speed);
    for (const b of toolBtns) b.classList.toggle('active', !!app.tool && app.tool.id === b.dataset.tool);
  };
  refresh();
  fitToolbar(root);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitToolbar(root)).observe(root);
  else window.addEventListener('resize', () => fitToolbar(root));
  return { refresh, toggleSound };
}

/** Density levels tried in order until every button fits (CSS: #toolbar.tb-fit-N). */
const FIT_LEVELS = ['tb-fit-0', 'tb-fit-1', 'tb-fit-2', 'tb-fit-3'];
/** Wrapped level (tight icons on several rows) for tablets/phones. */
const WRAP_LEVEL = 'tb-fit-4';
/** Height of one wrapped toolbar row in px (button 34 + row gap 3). */
const WRAP_ROW_PX = 37;

/**
 * Pick the roomiest toolbar density whose content fits the width (labels, small labels, icons, tight icons),
 * then tight icons wrapped onto up to 2 rows (3 on tall portrait screens, none on short landscape screens),
 * first keeping button groups together, then with groups dissolved (phones).
 * If even that does not fit, the single tight row scrolls horizontally.
 * @param {HTMLElement} root
 */
function fitToolbar(root) {
  const all = [...FIT_LEVELS, WRAP_LEVEL];
  for (const cls of FIT_LEVELS) {
    root.classList.remove(...all, 'tb-flat');
    root.classList.add(cls);
    if (root.scrollWidth <= root.clientWidth + 1) return;
  }
  const h = window.innerHeight || 800;
  const maxRows = h < 500 ? 1 : h < 700 ? 2 : 3;
  if (maxRows < 2) return;
  const fits = () => root.scrollHeight <= maxRows * WRAP_ROW_PX + 8 && root.scrollWidth <= root.clientWidth + 1;
  root.classList.remove(...all, 'tb-flat');
  root.classList.add(WRAP_LEVEL);
  if (fits()) return;
  root.classList.add('tb-flat');
  if (fits()) return;
  root.classList.remove(WRAP_LEVEL, 'tb-flat');
  root.classList.add('tb-fit-3');
}
