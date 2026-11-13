/** N10: importFromFile() always settles: cancel event, legacy focus fallback, and the success path. */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { importFromFile } from '../js/ui/storage.js';

class FakeInput {
  constructor() { this.listeners = {}; this.files = null; this.clicked = false; this.type = ''; this.accept = ''; }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  click() { this.clicked = true; }
  fire(type) { for (const fn of [...(this.listeners[type] || [])]) fn({ type }); }
}

let created;
beforeEach(() => {
  created = [];
  globalThis.document = { createElement: (tag) => { const input = new FakeInput(); input.tag = tag; created.push(input); return input; } };
  globalThis.window = {
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    fire(type) { for (const fn of [...(this.listeners[type] || [])]) fn({ type }); },
  };
});
afterEach(() => { delete globalThis.document; delete globalThis.window; });

describe('importFromFile settles on every picker outcome', () => {
  test('a cancel event resolves null', async () => {
    const p = importFromFile();
    const input = created[0];
    expect(input.clicked).toBe(true);
    input.fire('cancel');
    expect(await p).toBeNull();
  });

  test('a change with no file resolves null', async () => {
    const p = importFromFile();
    created[0].files = [];
    created[0].fire('change');
    expect(await p).toBeNull();
  });

  test('a chosen file resolves its text', async () => {
    const p = importFromFile();
    created[0].files = [{ text: () => Promise.resolve('{"seed":1}') }];
    created[0].fire('change');
    expect(await p).toBe('{"seed":1}');
  });

  test('returning focus without a change resolves null (legacy picker fallback)', async () => {
    const p = importFromFile();
    globalThis.window.fire('focus');
    expect(await p).toBeNull();
  }, 5000);

  test('focus after a selected file does not override the text', async () => {
    const p = importFromFile();
    const input = created[0];
    input.files = [{ text: () => Promise.resolve('text') }];
    input.fire('change');
    globalThis.window.fire('focus');
    expect(await p).toBe('text');
  });
});
