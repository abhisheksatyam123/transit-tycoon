/**
 * Main toolbar: speed controls, build tools, window buttons, sound toggle.
 * The most used items are always visible; the rest sit in flyout groups (OpenTTD-style) so the
 * toolbar stays one row on desktop widths.
 */
import { hotkeyTitle, currentOverrides, effectiveKeys, onHotkeysChanged, keyLabel } from './hotkeys.js';
import { el } from './dom.js';
import { openTitleMenu } from './titleMenu.js';
import { icon } from './icons.js';
import { scanIssues } from './diagCache.js';
import { isMuted, setMuted, play, unlockAudio } from '../audio/sfx.js';
import { screenshotCanvas, giantScreenshot } from './screenshot.js';

/** Build tool buttons: [toolId, label, icon, shortcut]. */
export const TOOL_BUTTONS = [
  ['rail', 'Rail', 'rail', '1'],
  ['road', 'Road', 'road', '2'],
  ['station', 'Station', 'station', '3'],
  ['busStop', 'Bus Stop', 'bus', '4'],
  ['truckStop', 'Truck Stop', 'truck', '5'],
  ['tramStop', 'Tram Stop', 'bus', ''],
  ['railDepot', 'Rail Depot', 'railDepot', '6'],
  ['roadDepot', 'Road Depot', 'roadDepot', '7'],
  ['demolish', 'Demolish', 'demolish', '8'],
  ['electrify', 'Electrify', 'electrify', ''],
  ['query', 'Query', 'query', '9'],
  ['signal', 'Signal', 'signal', ''],
  ['airport', 'Airport', 'airport', '0'],
  ['smallAirport', 'Small airport', 'airport', ''],
  ['heliport', 'Heliport', 'airport', ''],
  ['terraform', 'Terraform', 'terraform', 'Z'],
  ['plant', 'Plant trees', 'plant', 'Y'],
  ['foundTown', 'Found town', 'foundTown', ''],
  ['fundIndustry', 'Fund industry', 'fundIndustry', ''],
  ['hq', 'Company HQ', 'hq', ''],
  ['objects', 'Objects', 'objects', ''],
  ['oneWay', 'One-way road', 'oneWay', ''],
  ['tram', 'Tram track', 'road', ''],
  ['dock', 'Dock', 'dock', ''],
  ['shipDepot', 'Ship Depot', 'shipDepot', ''],
  ['buoy', 'Buoy', 'buoy', ''],
  ['canal', 'Canal', 'canal', ''],
  ['lock', 'Lock', 'lock', ''],
];

/** Window buttons: [windowName, label, icon, shortcut]. */
export const WINDOW_BUTTONS = [
  ['vehicles', 'Vehicles', 'vehicles', 'V'],
  ['finances', 'Finances', 'finances', 'F'],
  ['towns', 'Towns', 'towns', 'T'],
  ['stations', 'Stations', 'stations', 'B'],
  ['depots', 'Depots', 'depots', ''],
  ['map', 'Map', 'map', 'P'],
  ['graphs', 'Graphs', 'graphs', 'E'],
  ['industries', 'Industries', 'industries', 'I'],
  ['news', 'News', 'news', 'N'],
  ['traffic', 'Traffic', 'traffic', 'X'],
  ['goals', 'Goals', 'goals', 'O'],
  ['extraViewport', 'Extra viewport', 'extra', ''],
  ['subsidies', 'Subsidies', 'subsidies', ''],
  ['metro', 'Metro', 'metro', 'U'],
  ['issues', 'Issues', 'issues', 'G'],
  ['settings', 'Settings', 'settings', ''],
  ['save', 'Save', 'save', ''],
  ['load', 'Load', 'load', 'L'],
  ['newGame', 'New Game', 'newGame', ''],
  ['help', 'Help', 'help', 'H'],
];

/** Tools shown as top-level buttons; every other tool lives in a flyout group. */
const TOP_TOOLS = ['rail', 'road', 'station', 'busStop', 'truckStop', 'tramStop', 'railDepot', 'roadDepot', 'demolish', 'query', 'signal'];
/** Windows shown as top-level buttons; the rest live in flyout groups. */
const TOP_WINDOWS = ['vehicles', 'finances', 'issues', 'settings', 'save', 'load', 'help', 'newGame'];

/**
 * Flyout groups: [groupId, label, groupIcon, members].
 * A member is a tool id (from TOOL_BUTTONS) or, with a `win:` prefix, a window name (from WINDOW_BUTTONS).
 */
export const TOOL_GROUPS = [
  ['rail', 'Rail+', 'electrify', ['electrify']],
  ['road', 'Road+', 'oneWay', ['oneWay', 'tram']],
  ['water', 'Water', 'dock', ['dock', 'shipDepot', 'buoy', 'canal', 'lock']],
  ['air', 'Air', 'airport', ['airport', 'smallAirport', 'heliport']],
  ['landscape', 'Landscape', 'terraform', ['terraform', 'plant', 'foundTown', 'fundIndustry', 'hq', 'objects']],
  ['lists', 'Lists', 'stations', ['win:towns', 'win:stations', 'win:depots', 'win:industries', 'win:map', 'win:metro']],
  ['stats', 'Stats', 'graphs', ['win:graphs', 'win:traffic', 'win:goals', 'win:subsidies', 'win:news']],
  ['shots', 'Screenshot', 'camera', ['shot', 'shotMap', 'win:extraViewport']],
];

/** Screenshot flyout items (not windows): [id, label, icon, shortcut]; handled in createToolbar. */
export const SHOT_ITEMS = {
  shot: ['Screenshot (map view)', 'camera', '.'],
  shotMap: ['Whole-map screenshot', 'camera', ''],
};

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
 * Flyout item (icon + label + shortcut) for a group's dropdown panel.
 * @param {string} iconName
 * @param {string} label
 * @param {string} key
 * @param {()=>void} onClick
 * @returns {HTMLButtonElement}
 */
function flyItem(iconName, label, key, onClick) {
  return /** @type {HTMLButtonElement} */ (el('button.tb-fly-item', { type: 'button', title: key ? `${label} (${key})` : label, onclick: onClick },
    icon(iconName), el('span.tb-fly-label', { text: label }), key ? el('kbd', { text: key }) : null));
}

/**
 * Render the toolbar into its container.
 * @param {HTMLElement} root
 * @param {import('./app.js').App} app
 * @returns {{refresh:()=>void, toggleSound:()=>void}}
 */
export function createToolbar(root, app) {
  /** @type {[HTMLElement, string, string][]} buttons whose title shows a hotkey: [button, label, action id] */
  const titled = [];
  /** Title = label + the current (possibly rebound) key from the Keyboard shortcuts window. */
  const retitle = () => {
    const keys = effectiveKeys(currentOverrides());
    for (const [b, label, id] of titled) {
      b.title = hotkeyTitle(label, id, keys);
      const kbd = b.querySelector('kbd'); // flyout items show the key as a <kbd>
      if (kbd && keys[id]) kbd.textContent = keyLabel(keys[id]);
    }
  };
  onHotkeysChanged(retitle);
  const speedBtns = SPEEDS.map(([s, label, ic, key]) => {
    const b = tbButton(ic, label, `${label === 'Pause' ? 'Pause' : 'Speed ' + label}${key ? ' (' + key + ')' : ''}`, () => app.setSpeed(/** @type {number} */ (s)));
    if (label === 'Pause') titled.push([b, 'Pause', 'pause']);
    b.dataset.speed = String(s);
    return b;
  });
  const toolInfo = new Map(TOOL_BUTTONS.map((t) => [t[0], t]));
  /** Screenshot flyout actions: the map view PNG, or the whole map (giant screenshot) with a toast. */
  const shotAction = (id) => {
    play('click');
    if (id === 'shot') {
      screenshotCanvas(app.renderer).then((name) => app.toast(`Saved ${name}`, 'good'), (e) => app.toast('Screenshot failed: ' + (e && e.message ? e.message : e), 'error'));
      return;
    }
    app.toast('Rendering whole-map screenshot…', 'info', false, 60000);
    giantScreenshot(app.game, app.renderer).then(
      (r) => app.toast(`Saved ${r.name} (${r.width}×${r.height}, zoom ${r.zoom})`, 'good', false, 6000),
      (e) => app.toast('Whole-map screenshot failed: ' + (e && e.message ? e.message : e), 'error'));
  };
  const winInfo = new Map(WINDOW_BUTTONS.map((w) => [w[0], w]));

  // ---- top-level tool and window buttons ----
  const toolBtns = TOP_TOOLS.filter((id) => toolInfo.has(id)).map((id) => {
    const [, label, ic, key] = /** @type {any} */ (toolInfo.get(id));
    const b = tbButton(ic, label, key ? `${label} (${key})` : label, () => { play('click'); app.setTool(id); });
    b.dataset.tool = id;
    if (key) titled.push([b, label, 'tool:' + id]);
    return b;
  });
  const winBtns = TOP_WINDOWS.map((name) => {
    const [, label, ic, key] = /** @type {any} */ (winInfo.get(name));
    const b = tbButton(ic, label, key ? `${label} (${key})` : label, () => app.open(name));
    b.dataset.win = name;
    if (key) titled.push([b, label, 'win:' + name]);
    return b;
  });
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
  const toggleSound = () => {
    unlockAudio();
    setMuted(!isMuted());
    sound.replaceChild(icon(isMuted() ? 'soundOff' : 'soundOn'), sound.firstChild);
    sound.classList.toggle('muted', isMuted());
    play('click');
  };
  const sound = tbButton(isMuted() ? 'soundOff' : 'soundOn', 'Sound', 'Toggle sound (M)', () => toggleSound());
  titled.push([sound, 'Toggle sound', 'sound']);
  sound.classList.toggle('muted', isMuted());

  // ---- flyout groups: each group = a toolbar button (with a caret) + a panel appended to <body> ----
  // (#toolbar scrolls horizontally, so the panel must be position:fixed outside it.)
  /** @type {{id:string, btn:HTMLButtonElement, panel:HTMLElement, icon:string, shown:string, items:HTMLButtonElement[], tools:string[]}[]} */
  const groups = [];
  let openGroup = null;
  const closeFlyouts = () => {
    if (!openGroup) return;
    openGroup.panel.classList.remove('open');
    openGroup.btn.setAttribute('aria-expanded', 'false');
    openGroup = null;
  };
  /** Place the panel under its button, clamped to the viewport (flips above when there is no room below). */
  const placePanel = (g) => {
    const r = g.btn.getBoundingClientRect();
    const p = g.panel;
    p.classList.add('open');
    const w = p.offsetWidth, h = p.offsetHeight;
    const vw = window.innerWidth || 800, vh = window.innerHeight || 600;
    const left = Math.max(4, Math.min(r.left, vw - w - 4));
    const top = r.bottom + 4 + h > vh ? Math.max(4, r.top - h - 4) : r.bottom + 4;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  };
  for (const [gid, label, gicon, members0] of TOOL_GROUPS) {
    const members = members0.filter((m) => m.startsWith('win:') || toolInfo.has(m) || SHOT_ITEMS[m]);
    if (!members.length) continue;
    const items = [];
    const toolIds = [];
    const panelItems = members.map((m) => {
      if (m.startsWith('win:')) {
        const name = m.slice(4);
        const [, wl, wi, wk] = /** @type {any} */ (winInfo.get(name));
        const b = flyItem(wi, wl, wk, () => { closeFlyouts(); app.open(name); });
        b.dataset.win = name;
        if (wk) titled.push([b, wl, 'win:' + name]);
        items.push(b);
        return b;
      }
      if (SHOT_ITEMS[m]) {
        const [sl, si, sk] = SHOT_ITEMS[m];
        const b = flyItem(si, sl, sk, () => { closeFlyouts(); shotAction(m); });
        b.dataset.shot = m;
        if (sk) titled.push([b, sl, 'screenshot']);
        items.push(b);
        return b;
      }
      const [, tl, ti, tk] = /** @type {any} */ (toolInfo.get(m));
      toolIds.push(m);
      const b = flyItem(ti, tl, tk, () => { closeFlyouts(); play('click'); app.setTool(m); });
      b.dataset.tool = m;
      if (tk) titled.push([b, tl, 'tool:' + m]);
      items.push(b);
      return b;
    });
    const panel = el('div.tb-flyout', { role: 'menu', 'data-group': gid, 'aria-label': label }, panelItems);
    document.body.appendChild(panel);
    /** @type {any} */
    const g = { id: gid, btn: null, panel, icon: gicon, shown: gicon, items, tools: toolIds };
    const btn = tbButton(gicon, label, `${label} ▾`, () => {
      if (openGroup === g) { closeFlyouts(); return; }
      closeFlyouts();
      openGroup = g;
      btn.setAttribute('aria-expanded', 'true');
      placePanel(g);
    });
    btn.classList.add('tb-grp');
    btn.dataset.group = gid;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(el('span.tb-caret', { text: '▾' }));
    g.btn = btn;
    groups.push(g);
  }
  const groupBtn = (id) => { const g = groups.find((x) => x.id === id); return g ? g.btn : null; };
  // Dismiss on outside click / Escape / resize.
  document.addEventListener('pointerdown', (e) => {
    if (!openGroup) return;
    const t = /** @type {Node} */ (e.target);
    if (openGroup.panel.contains(t) || openGroup.btn.contains(t)) return;
    closeFlyouts();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlyouts(); });
  window.addEventListener('resize', closeFlyouts);

  const sep = () => el('div.tb-sep');
  const cat = (...xs) => xs.flat().filter(Boolean);

  // Main menu entry: the "TT" logo button (always visible, also on phones where the brand text hides)
  root.appendChild(el('button.tb-menu-btn', { type: 'button', text: 'TT', title: 'Main menu (title screen)', 'aria-label': 'Main menu', onclick: () => openTitleMenu(app) }));
  root.appendChild(el('div.tb-brand', null, el('span.tb-name', { text: 'Transit Tycoon' })));
  root.appendChild(el('div.tb-group', { 'aria-label': 'Speed' }, speedBtns));
  root.appendChild(sep());
  root.appendChild(el('div.tb-group', { 'aria-label': 'Build tools' }, cat(toolBtns, groupBtn('rail'), groupBtn('road'), groupBtn('water'), groupBtn('air'), groupBtn('landscape'))));
  root.appendChild(sep());
  root.appendChild(el('div.tb-group', { 'aria-label': 'Windows' }, cat(winBtns.slice(0, 2), groupBtn('lists'), groupBtn('stats'), groupBtn('shots'), winBtns.slice(2), sound)));

  const refresh = () => {
    for (const b of speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === app.speed);
    const cur = app.tool ? app.tool.id : null;
    for (const b of toolBtns) b.classList.toggle('active', !!cur && cur === b.dataset.tool);
    for (const g of groups) {
      const inGroup = !!cur && g.tools.includes(cur);
      g.btn.classList.toggle('active', inGroup);
      for (const b of g.items) b.classList.toggle('active', !!cur && b.dataset.tool === cur);
      // while a tool from this group is active, show that tool's icon on the group button
      const want = inGroup ? toolInfo.get(cur)[2] : g.icon;
      if (g.shown !== want) {
        g.btn.replaceChild(icon(want), g.btn.firstChild);
        g.shown = want;
      }
    }
  };
  refresh();
  fitToolbar(root);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitToolbar(root)).observe(root);
  else window.addEventListener('resize', () => fitToolbar(root));
  retitle();
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
 * then tight icons wrapped onto up to 2 rows (3-4 on tall portrait screens, none on short landscape screens),
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
  const maxRows = h < 500 ? 1 : h < 700 ? 2 : h < 800 ? 3 : 4;
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
