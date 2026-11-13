// N10 input/tool/audio/pack fixes: direct convert drags, mode-change drag reset, objects hint accessor,
// cancelled-mid-drag clicks, Ctrl signal preview, audio context resume and climate-pack retry.
import { test, expect, describe, afterEach } from 'bun:test';
import { createRoadTool } from '../js/ui/tools/road.js';
import { createTramTool } from '../js/ui/tools/tram.js';
import { createElectrifyTool } from '../js/ui/tools/electrify.js';
import { createObjectsTool } from '../js/ui/tools/objects.js';
import { createSignalTool } from '../js/ui/tools/signal.js';
import { createDepotTool } from '../js/ui/tools/depot.js';
import { setupInput } from '../js/input/input.js';
import { unlockAudio, play } from '../js/audio/sfx.js';

/** Stub game/app for the line tools: records which command ran. */
function lineApp() {
  const calls = [];
  const game = {
    state: { date: { year: 2020 }, map: { width: 32, height: 32, tiles: [] } },
    buildRoad: (...a) => { calls.push({ fn: 'buildRoad', a }); return { ok: true, cost: 100 }; },
    buildRoadPath: (...a) => { calls.push({ fn: 'buildRoadPath', a }); return { ok: true, cost: 100 }; },
    buildTram: (...a) => { calls.push({ fn: 'buildTram', a }); return { ok: true, cost: 100 }; },
    convertRoad: (...a) => { calls.push({ fn: 'convertRoad', a }); return { ok: true, cost: 100 }; },
    convertRail: (...a) => { calls.push({ fn: 'convertRail', a }); return { ok: true, cost: 100 }; },
  };
  const app = {
    game, railSelector: 'rail',
    renderer: { overlay: {} }, ui: { updateHint() {} }, toast() {}, exec() {},
  };
  return { app, calls };
}

describe('road/tram convert mode is direct for every drag shape', () => {
  test('diagonal + convert calls convertRoad, never buildRoadPath', () => {
    const { app, calls } = lineApp();
    const tool = createRoadTool(app);
    tool.key({ key: 'c' }); // L -> Diagonal
    tool.key({ key: 'x' }); // build -> convert
    tool.down({ x: 0, y: 0 });
    tool.move({ x: 3, y: 3 });
    expect(app.renderer.overlay.preview.tiles.length).toBe(16); // rectangle, not the 4-tile diagonal path
    tool.up({ x: 3, y: 3 });
    const fns = calls.map((c) => c.fn);
    expect(fns).toContain('convertRoad');
    expect(fns).not.toContain('buildRoadPath');
    expect(fns).not.toContain('buildRoad');
  });

  test('default L shape still uses buildRoad', () => {
    const { app, calls } = lineApp();
    const tool = createRoadTool(app);
    tool.down({ x: 0, y: 0 });
    tool.up({ x: 3, y: 0 });
    expect(calls.some((c) => c.fn === 'buildRoad')).toBe(true);
    expect(calls.some((c) => c.fn === 'buildRoadPath')).toBe(false);
  });

  test('tram convert (diagonal) calls convertRoad to road', () => {
    const { app, calls } = lineApp();
    const tool = createTramTool(app);
    tool.key({ key: 'c' });
    tool.key({ key: 'x' });
    tool.down({ x: 0, y: 0 });
    tool.up({ x: 2, y: 2 });
    const conv = calls.filter((c) => c.fn === 'convertRoad');
    expect(conv.length).toBeGreaterThan(0);
    expect(conv.every((c) => c.a[4] && c.a[4].to === 'road')).toBe(true);
    expect(calls.some((c) => c.fn === 'buildRoadPath')).toBe(false);
  });
});

describe('X mode switch resets a mid-drag preview', () => {
  for (const [name, make] of [['road', createRoadTool], ['tram', createTramTool], ['electrify', createElectrifyTool]]) {
    test(`${name}: release after X does not build`, () => {
      const { app, calls } = lineApp();
      const tool = make(app);
      tool.down({ x: 0, y: 0 });
      const before = calls.length;
      tool.key({ key: 'x' });
      tool.up({ x: 2, y: 0 });
      expect(calls.length).toBe(before);
      expect(app.renderer.overlay.preview == null).toBe(true);
    });
  }
});

describe('objects tool hint stays live after J', () => {
  test('hint and kind change when J is pressed', () => {
    const app = {
      game: { estimateObject: () => ({ cost: 100 }), estimateHQ: () => ({ cost: 200 }) },
      renderer: { overlay: {} }, ui: { updateHint() {} }, exec() {}, toast() {},
    };
    const tool = createObjectsTool(app);
    expect(tool.hint).toContain('Transmitter');
    expect(tool.kind).toBe('transmitter');
    expect(tool.key({ key: 'j' })).toBe(true);
    expect(tool.kind).toBe('lighthouse');
    expect(tool.hint).toContain('Lighthouse');
  });
});

describe('signal Ctrl+drag previews removal', () => {
  test('move with ctrl asks buildSignalRun for remove', () => {
    const runs = [];
    const app = {
      game: {
        state: { map: { width: 16, height: 16, tiles: [] } },
        buildSignalRun: (tiles, opts) => { runs.push(opts); return { ok: true, cost: 10, tiles: 2 }; },
        buildSignal: () => ({ ok: true, cost: 10 }),
      },
      renderer: { overlay: {} }, ui: { updateHint() {} }, exec() {}, toast() {},
    };
    const tool = createSignalTool(app);
    tool.down({ x: 0, y: 0 });
    tool.move({ x: 2, y: 0 });
    expect(runs[runs.length - 1].remove).toBe(false);
    tool.move({ x: 2, y: 0, ctrl: true });
    expect(runs[runs.length - 1].remove).toBe(true);
  });
});

describe('input: cancelled drags and blur', () => {
  class FakeTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    removeEventListener(type, fn) { const a = this.listeners.get(type) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    dispatch(type, init = {}) {
      const ev = { type, target: this, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, button: 0,
        pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...init };
      for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
      return ev;
    }
    focus() {}
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0 }; }
  }
  function inputApp(tool) {
    const calls = { open: 0, inspect: 0, pan: 0, exec: 0 };
    const app = {
      game: { inBounds: () => true, state: { map: { width: 64, height: 64, tiles: [] } } },
      toasts: { setCursor() {} },
      renderer: { pickTile: () => ({ x: 1, y: 1 }), pickVehicle: () => null, labelHits: [], overlay: {},
        camera: { pan() { calls.pan++; } } },
      follow() {}, open() { calls.open++; }, inspectTile() { calls.inspect++; }, exec() { calls.exec++; },
      wm: { closeTop: () => true }, selectStation() {},
      tool,
      setTool(t) { if (this.tool) this.tool.cancel(); this.tool = t; },
    };
    return { app, calls };
  }
  afterEach(() => { delete globalThis.window; });

  test('Escape mid-drag then pointerup does not inspect/open a window', () => {
    const events = [];
    const tool = { move() {}, down() {}, up() { events.push('up'); }, cancel() { events.push('cancel'); } };
    const { app, calls } = inputApp(tool);
    globalThis.window = new FakeTarget();
    const canvas = new FakeTarget();
    setupInput(app, canvas, {});
    canvas.dispatch('pointerdown', { button: 0, clientX: 5, clientY: 5 });
    expect(app.tool).toBe(tool);
    globalThis.window.dispatch('keydown', { key: 'Escape' });
    expect(app.tool).toBe(null);
    expect(events).toContain('cancel');
    canvas.dispatch('pointerup', { button: 0, clientX: 5, clientY: 5 });
    expect(calls.open).toBe(0);
    expect(calls.inspect).toBe(0);
  });

  test('right-click cancel mid-drag also swallows the release', () => {
    const tool = { move() {}, down() {}, up() {}, cancel() {} };
    const { app, calls } = inputApp(tool);
    globalThis.window = new FakeTarget();
    const canvas = new FakeTarget();
    setupInput(app, canvas, {});
    canvas.dispatch('pointerdown', { button: 0, clientX: 5, clientY: 5 });
    canvas.dispatch('pointerdown', { button: 2, clientX: 5, clientY: 5 });
    expect(app.tool).toBe(null);
    canvas.dispatch('pointerup', { button: 0, clientX: 5, clientY: 5 });
    expect(calls.open).toBe(0);
    expect(calls.inspect).toBe(0);
  });

  test('blur mid-pan stops panning and cancels the tool', () => {
    const tool = { move() {}, down() {}, up() {}, cancel() {} };
    const { app, calls } = inputApp(tool);
    globalThis.window = new FakeTarget();
    const canvas = new FakeTarget();
    setupInput(app, canvas, {});
    canvas.dispatch('pointerdown', { button: 1, clientX: 10, clientY: 10 });
    globalThis.window.dispatch('blur');
    expect(app.tool).toBe(null);
    canvas.dispatch('pointermove', { clientX: 80, clientY: 80 });
    expect(calls.pan).toBe(0);
  });

  test('pointermove forwards ctrl to the tool (signal preview)', () => {
    const moves = [];
    const tool = { move(t) { moves.push(t); }, down() {}, up() {}, cancel() {} };
    const { app } = inputApp(tool);
    globalThis.window = new FakeTarget();
    const canvas = new FakeTarget();
    setupInput(app, canvas, {});
    canvas.dispatch('pointermove', { clientX: 5, clientY: 5, ctrlKey: true });
    expect(moves.length).toBe(1);
    expect(moves[0].ctrl).toBe(true);
    canvas.dispatch('pointermove', { clientX: 5, clientY: 5, ctrlKey: false });
    expect(moves.length).toBe(2);
    expect(moves[1].ctrl).toBe(false);
  });
});

describe('audio: suspended context resumes on play', () => {
  test('unlockAudio then play calls resume', () => {
    let resumes = 0;
    class MockAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; this.currentTime = 0; this.sampleRate = 8000; }
      createGain() {
        const g = { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
        g.connect = () => g;
        return g;
      }
      createOscillator() { return { frequency: {}, connect: () => ({ connect() {} }), start() {}, stop() {} }; }
      resume() { resumes++; this.state = 'running'; return Promise.resolve(); }
    }
    globalThis.window = { AudioContext: MockAudioContext };
    try {
      unlockAudio();
      play('click');
      expect(resumes).toBe(1);
    } finally { delete globalThis.window; }
  });
});

describe('climate pack: a null load is retried', () => {
  test('transient failure, then success on the next ensureClimatePack', async () => {
    const oldFetch = globalThis.fetch;
    let arctic = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/arctic/')) {
        arctic++;
        if (arctic === 1) return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ atlases: [], sprites: {}, groups: {} }) };
    };
    try {
      const { initPack, ensureClimatePack } = await import('../js/renderer/pack/index.js');
      await initPack({ setPackEnabled() {} });
      expect(await ensureClimatePack('arctic')).toBe(null);
      const second = await ensureClimatePack('arctic');
      expect(second).not.toBe(null);
      expect(arctic).toBe(2);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});

describe('rail depot disconnect wording', () => {
  test('rail depot names rail, not road', () => {
    const toasts = [];
    const tiles = Array.from({ length: 64 }, () => ({}));
    const app = {
      game: {
        state: { map: { width: 8, height: 8, tiles } },
        buildDepot: () => ({ ok: true, cost: 10, depotId: 1 }),
      },
      renderer: { overlay: {} }, ui: { updateHint() {} }, exec() {}, toast: (m) => toasts.push(m),
    };
    const tool = createDepotTool(app, 'rail');
    tool.up({ x: 3, y: 3 });
    expect(toasts.length).toBe(1);
    expect(toasts[0]).toContain('rail track');
    expect(toasts[0]).not.toContain('road');
  });
});
