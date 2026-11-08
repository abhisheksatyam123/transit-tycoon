import { describe, test, expect } from 'bun:test';
import { FileLogger, MemoryStore, formatLine, parseLevel, logFileFor, LEVELS } from '../js/ui/logger.js';

describe('logger helpers', () => {
  test('formatLine includes ts, level, category, message', () => {
    const line = formatLine({ ts: new Date('2026-11-08T12:00:00.000Z'), level: 'warn', category: 'boot', message: 'hi' });
    expect(line).toContain('2026-11-08T12:00:00.000Z');
    expect(line).toContain('[WARN ]');
    expect(line).toContain('[boot] hi');
  });
  test('parseLevel names/numbers and rejects invalid', () => {
    expect(parseLevel('debug')).toBe(LEVELS.debug);
    expect(parseLevel('ERROR')).toBe(LEVELS.error);
    expect(parseLevel('off')).toBe(LEVELS.off);
    expect(parseLevel(2)).toBe(LEVELS.warn);
    expect(parseLevel('nope')).toBeNull();
    expect(parseLevel(null)).toBeNull();
  });
  test('logFileFor date naming', () => {
    expect(logFileFor(new Date('2026-01-02T00:00:00Z'))).toBe('tt-2026-01-02.log');
  });
});

function makeLogger(level) {
  const l = new FileLogger();
  l.store = new MemoryStore();
  l.disable();
  if (level) l.setLevel(level);
  return l;
}

describe('FileLogger gating', () => {
  test('disabled by default: nothing buffered', () => {
    const l = makeLogger();
    expect(l.status().enabled).toBe(false);
    expect(l.info('test', 'x')).toBe(false);
    expect(l.entries()).toHaveLength(0);
  });
  test('enable buffers and flush writes to MemoryStore', async () => {
    const l = makeLogger('debug');
    l.enable();
    l.info('test', 'hello');
    l.warn('test', 'oops');
    expect(l.entries()).toHaveLength(3); // + enabled line
    const n = await l.flush();
    expect(n).toBeGreaterThan(0);
    const files = await l.list();
    expect(files).toHaveLength(1);
    const lines = await l.read(files[0]);
    expect(lines.some((x) => x.includes('hello'))).toBe(true);
    expect(lines.some((x) => x.includes('oops'))).toBe(true);
  });
  test('level filtering', () => {
    const l = makeLogger('warn');
    l.enable();
    const before = l.entries().length;
    expect(l.debug('t', 'd')).toBe(false);
    expect(l.info('t', 'i')).toBe(false);
    expect(l.warn('t', 'w')).toBe(true);
    expect(l.error('t', 'e')).toBe(true);
    expect(l.entries().length).toBe(before + 2);
  });
  test('disable stops buffering; setLevel(off) blocks all', async () => {
    const l = makeLogger('debug');
    l.enable();
    l.disable();
    expect(l.info('t', 'x')).toBe(false);
    l.setLevel('off');
    l.enable(); // level off -> promoted to info
    expect(l.status().level).toBe('info');
  });
  test('status shape and clear', async () => {
    const l = makeLogger('debug');
    l.enable(); l.info('t', 'x'); await l.flush();
    const s = l.status();
    expect(s.enabled).toBe(true); expect(s.file).toMatch(/^tt-.*\.log$/);
    expect(s.store).toBe('MemoryStore'); expect(s.buffered).toBe(0);
    await l.clear({ files: true });
    expect(await l.list()).toHaveLength(0);
  });
  test('read/tail', async () => {
    const l = makeLogger('debug');
    l.enable(); l.info('t', 'a'); l.info('t', 'b'); await l.flush();
    l.info('t', 'c');
    const tail = await l.tail(2);
    expect(tail).toHaveLength(2);
    expect(tail[1]).toContain('[t] c');
  });
  test('initFromUrl via enable gating', async () => {
    const l = makeLogger();
    const on = l.initFromUrl('?log=1&logLevel=debug&logFile=custom.log');
    expect(on).toBe(true);
    expect(l.status().file).toBe('custom.log');
    expect(l.debug('t', 'd')).toBe(true);
    l.disable();
    const off = l.initFromUrl('?foo=1');
    expect(off).toBe(false);
    expect(l.status().enabled).toBe(false);
  });
});
