/**
 * Story book window: static story pages unlocked by goal completion.
 * Progress persisted in localStorage 'tt-story-v1' only (not game state).
 */
import { el, setText, clear } from '../dom.js';

const LS_KEY = 'tt-story-v1';

const STORY_PAGES = [
  { id: 'ch1', title: 'Chapter 1: First Tracks', text: 'A small town waits for its first train. Lay tracks, build a station, and carry people and goods to grow it.', unlock: 0 },
  { id: 'ch2', title: 'Chapter 2: The Network Grows', text: 'One station is not enough. Connect a second town and watch passengers and cargo flow between them.', unlock: 1 },
  { id: 'ch3', title: 'Chapter 3: Money Matters', text: 'Routes earn money, but upkeep costs too. Balance your finances and keep the company in the black.', unlock: 2 },
  { id: 'ch4', title: 'Chapter 4: Industry Joins In', text: 'Factories need coal, timber and steel. Link industries into a supply chain and multiply your profits.', unlock: 3 },
  { id: 'ch5', title: 'Chapter 5: The Grand Objective', text: 'Every tycoon has a goal. Complete the final objectives to see your name in the Hall of Fame.', unlock: 4 },
];

function loadStoryProgress() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') return p; }
  } catch (_) {}
  const p = { read: {}, current: STORY_PAGES[0].id };
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (_) {}
  return p;
}
function saveStoryProgress(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (_) {} }

/** Number of completed goals, best-effort from the game. */
function completedGoalCount(app) {
  try {
    const snap = app?.game?.goals?.();
    if (snap && typeof snap.completed === 'number') return snap.completed;
    const st = app?.game?.state;
    if (Array.isArray(st?.goals)) return st.goals.filter((g) => g.done).length;
    if (st?.objective?.status === 'won') return 99;
  } catch (_) {}
  return 0;
}

/**
 * Cheap signature of the goal state (tick / objective / done flags). The full goals snapshot is only
 * rebuilt when this changes, so a paused game does not call it every 250 ms.
 */
export function storySignature(app) {
  const st = app?.game?.state;
  const done = Array.isArray(st?.goals) ? st.goals.map((g) => (g && g.done ? '1' : '0')).join('') : '';
  return `${st?.tick ?? 0}|${st?.objective?.status || ''}|${done}`;
}

/**
 * Cached completed-goal reader: the full goals snapshot is only taken when storySignature changes.
 * Exported so the 250 ms refresh gate is testable without a DOM.
 */
export function makeCompletedGoalReader(app) {
  let sig = '', completed = 0;
  return () => {
    const next = storySignature(app);
    if (next !== sig) {
      sig = next;
      completed = completedGoalCount(app);
    }
    return completed;
  };
}

export function openStoryBook(app) {
  return app.wm.open('storyBook', {
    title: 'Story Book',
    width: 520,
    build(body) {
      const progress = loadStoryProgress();
      const list = el('div.story-list');
      const head = el('h3.story-title');
      const text = el('p.story-text');
      const status = el('p.small.muted');
      const done = el('button.btn', { type: 'button', text: 'Mark chapter read' });
      body.append(el('div.story-wrap', null, list, el('div.story-page', null, head, text, status, done)));
      const readCompleted = makeCompletedGoalReader(app);
      let sig = '';
      const render = () => {
        const completed = readCompleted();
        const unlocked = STORY_PAGES.map((p) => completed >= p.unlock);
        const cur = progress.current || STORY_PAGES[0].id;
        const page = STORY_PAGES.find((p) => p.id === cur) || STORY_PAGES[0];
        const isUnlocked = unlocked[STORY_PAGES.indexOf(page)];
        const k = JSON.stringify([completed, cur, isUnlocked, Object.keys(progress.read || {}).length]);
        if (k === sig) return;
        sig = k;
        clear(list);
        STORY_PAGES.forEach((p, i) => {
          const u = unlocked[i];
          const read = Boolean(progress.read?.[p.id]);
          list.appendChild(el('button.btn.story-item' + (p.id === cur ? '.active' : '') + (u ? '' : '.locked'), {
            type: 'button', disabled: u ? null : true,
            text: (u ? (read ? '✔ ' : '') + p.title : '🔒 ' + p.title),
            onclick: () => { progress.current = p.id; saveStoryProgress(progress); sig = ''; render(); },
          }));
        });
        setText(head, page.title);
        setText(text, isUnlocked ? page.text : 'Locked. Complete more goals to unlock this chapter.');
        setText(status, isUnlocked ? `${completed} goal(s) complete. ${Object.keys(progress.read || {}).length} chapter(s) read.` : `Requires ${page.unlock} completed goal(s) — you have ${completed}.`);
        done.style.display = isUnlocked ? '' : 'none';
        done.onclick = () => { progress.read = progress.read || {}; progress.read[page.id] = true; saveStoryProgress(progress); sig = ''; render(); };
      };
      render();
      return render;
    },
  });
}
