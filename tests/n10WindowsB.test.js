/**
 * N10-B window fixes: league table keyed patch + signatures, map invalidation/observer cleanup,
 * issue/story refresh gates, waypoint order picker, single-click guard and transfer-credit clearing.
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  leagueSignature, renderLeagueRows, cargoLegendKey, chartDataKey,
} from '../js/ui/windows/graphs.js';
import { mapChangeSignature, observeResize } from '../js/ui/windows/map.js';
import { issueListSignature } from '../js/ui/windows/issues.js';
import { storySignature, makeCompletedGoalReader } from '../js/ui/windows/storyBook.js';
import { stationUsableBy } from '../js/ui/windows/orders.js';
import { singleClick } from '../js/ui/windows/common.js';
import { transferCreditsText } from '../js/ui/windows/vehicleDetail.js';

/** Tiny element good enough for the keyed league table (no jsdom in the repo). */
class FakeNode {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this._text = '';
    const self = this;
    this.classList = {
      contains: (c) => self.className.split(/\s+/).includes(c),
      add: (c) => { if (!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); },
      remove: (c) => { self.className = self.className.split(/\s+/).filter((x) => x !== c).join(' '); },
      toggle: (c, on) => { const v = on === undefined ? !self.classList.contains(c) : !!on; if (v) self.classList.add(c); else self.classList.remove(c); },
    };
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const a = this.parentNode.children;
    return a[a.indexOf(this) + 1] || null;
  }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute() {}
  addEventListener() {}
  set textContent(v) { this._text = String(v); for (const c of this.children) c.parentNode = null; this.children = []; }
  get textContent() { return this._text; }
}

beforeEach(() => {
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (t) => new FakeNode(t),
    createTextNode: (t) => { const n = new FakeNode('#text'); n.textContent = t; return n; },
  };
});
afterEach(() => {
  delete globalThis.Node;
  delete globalThis.document;
});

const rows = () => [
  { name: 'Me', value: 500, rating: 4, title: 'Traffic Manager', player: true, rival: false, bankrupt: false, profit: null, vehicles: null },
  { name: 'AI', value: 900, rating: 2, title: 'Engineer', player: false, rival: true, bankrupt: false, profit: 12, vehicles: 3 },
];

describe('N10-B league table', () => {
  test('signature changes with company value/profit but not with a fresh array of equal rows', () => {
    expect(leagueSignature(rows())).toBe(leagueSignature(rows()));
    const changed = rows();
    changed[1].profit = 99;
    expect(leagueSignature(changed)).not.toBe(leagueSignature(rows()));
  });

  test('keyed render keeps the row element and scroll position', () => {
    const table = new FakeNode('div');
    renderLeagueRows(table, rows());
    expect(table.children[0].classList.contains('table-head')).toBe(true);
    const aiRow = table.children[2];
    table.scrollTop = 120;

    const changed = rows();
    changed[1].value = 1500;
    renderLeagueRows(table, changed);

    expect(table.children.filter((c) => c.classList.contains('table-head')).length).toBe(1);
    expect(table.children[2]).toBe(aiRow);
    expect(table.scrollTop).toBe(120);
    expect(aiRow.children[1].textContent).toContain('1,500');
  });
});

describe('N10-B graph refresh keys', () => {
  test('cargo legend key changes when the cargo set grows', () => {
    const base = [{ id: 'PASS', name: 'Passengers', color: '#fff' }];
    expect(cargoLegendKey(base)).toBe(cargoLegendKey([...base]));
    expect(cargoLegendKey([...base, { id: 'COAL', name: 'Coal', color: '#333' }])).not.toBe(cargoLegendKey(base));
  });

  test('chart data key tracks month and settings (paused repaint gate)', () => {
    const a = chartDataKey({ date: { year: 1, month: 2 }, settings: { cargoAgingRate: 100 } });
    expect(chartDataKey({ date: { year: 1, month: 2 }, settings: { cargoAgingRate: 100 } })).toBe(a);
    expect(chartDataKey({ date: { year: 1, month: 3 }, settings: { cargoAgingRate: 100 } })).not.toBe(a);
    expect(chartDataKey({ date: { year: 1, month: 2 }, settings: { cargoAgingRate: 50 } })).not.toBe(a);
  });
});

describe('N10-B map invalidation', () => {
  test('map-change signature notices tile edits but is stable otherwise', () => {
    const state = { map: { tiles: [{ terrain: 'grass', height: 0 }] }, industries: [], rivals: [], stations: [] };
    const a = mapChangeSignature(state, 'terrain');
    expect(mapChangeSignature(state, 'terrain')).toBe(a);
    state.map.tiles[0].rail = 1;
    expect(mapChangeSignature(state, 'terrain')).not.toBe(a);
  });

  test('observer disposer disconnects the ResizeObserver', () => {
    const seen = { observed: [], disconnected: 0 };
    const prev = globalThis.ResizeObserver;
    class SpyObserver {
      constructor(cb) { this.cb = cb; }
      observe(t) { seen.observed.push(t); }
      disconnect() { seen.disconnected++; }
    }
    globalThis.ResizeObserver = SpyObserver;
    try {
      const target = {};
      const dispose = observeResize(target, () => {});
      expect(seen.observed[0]).toBe(target);
      dispose();
      expect(seen.disconnected).toBe(1);
    } finally {
      if (prev === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prev;
    }
  });
});

describe('N10-B issue story and picker gates', () => {
  test('issue signature includes message text', () => {
    const sum = { error: 0, warn: 1, info: 0 };
    const a = issueListSignature([{ id: 7, severity: 'warn', message: 'Old wording' }], sum, null, null, false);
    const b = issueListSignature([{ id: 7, severity: 'warn', message: 'New wording' }], sum, null, null, false);
    expect(b).not.toBe(a);
    expect(issueListSignature([{ id: 7, severity: 'warn', message: 'Old wording' }], sum, null, null, false)).toBe(a);
  });

  test('story signature/reader calls the full goals snapshot only when its cheap key changes', () => {
    let calls = 0;
    const app = {
      game: {
        state: { tick: 5, goals: [{ done: true }, { done: false }], objective: { status: 'active' } },
        goals: () => { calls++; return { completed: 1 }; },
      },
    };
    expect(storySignature(app)).toBe(storySignature(app));
    const read = makeCompletedGoalReader(app);
    expect(read()).toBe(1);
    expect(read()).toBe(1);
    expect(calls).toBe(1);
    app.game.state.tick = 6;
    expect(read()).toBe(1);
    expect(calls).toBe(2);
  });

  test('waypoint picker accepts rail/road waypoints only for the matching vehicle kind', () => {
    const train = { kind: 'train', roadType: null, cargoId: 'COAL' };
    const bus = { kind: 'road', roadType: 'road', cargoId: 'PASS' };
    const tram = { kind: 'road', roadType: 'tram', cargoId: 'PASS' };
    const railWp = { kinds: {}, tiles: [{ kind: 'waypoint' }] };
    const roadWp = { kinds: {}, tiles: [{ kind: 'waypoint', road: true }] };
    const railStop = { kinds: { rail: true }, tiles: [{ kind: 'rail' }] };
    expect(stationUsableBy(train, railWp)).toBe(true);
    expect(stationUsableBy(train, roadWp)).toBe(false);
    expect(stationUsableBy(train, railStop)).toBe(true);
    expect(stationUsableBy(bus, roadWp)).toBe(true);
    expect(stationUsableBy(bus, railWp)).toBe(false);
    expect(stationUsableBy(tram, roadWp)).toBe(false);
  });
});

describe('N10-B click and transfer-credit details', () => {
  test('singleClick ignores the second click of a double-click', () => {
    let opens = 0;
    const h = singleClick(() => { opens++; });
    h({ detail: 1 });
    h({ detail: 2 });
    expect(opens).toBe(1);
    h({ detail: 0 }); // keyboard activation still works
    expect(opens).toBe(2);
  });

  test('transfer credits line clears when the amount reaches zero', () => {
    expect(transferCreditsText({ transferCredits: 0 })).toBe('—');
    expect(transferCreditsText({})).toBe('—');
    expect(transferCreditsText({ transferCredits: 1200 })).toContain('virtual');
  });
});
