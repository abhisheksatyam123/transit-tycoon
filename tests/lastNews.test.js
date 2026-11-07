import { test, expect, describe } from 'bun:test';
import { nextLastNews } from '../js/ui/lastNews.js';

describe('last news cycling (OpenTTD ShowLastNewsMessage)', () => {
  const all = (x) => true;
  test('empty list -> null', () => {
    expect(nextLastNews([], null, all)).toBeNull();
    expect(nextLastNews(undefined, null, all)).toBeNull();
  });
  test('first use shows the newest; repeats step older; wraps to newest', () => {
    const n = [{ t: 1 }, { t: 2 }, { t: 3 }];
    const a = nextLastNews(n, null, all);
    expect(a).toBe(n[2]);
    const b = nextLastNews(n, a, all);
    expect(b).toBe(n[1]);
    const c = nextLastNews(n, b, all);
    expect(c).toBe(n[0]);
    expect(nextLastNews(n, c, all)).toBe(n[2]);
  });
  test('skips hidden (Off) items', () => {
    const n = [{ t: 1 }, { t: 2, off: true }, { t: 3 }];
    const vis = (it) => !it.off;
    const a = nextLastNews(n, null, vis);
    expect(a).toBe(n[2]);
    expect(nextLastNews(n, a, vis)).toBe(n[0]);
  });
  test('cursor item dropped by the history cap restarts at newest', () => {
    const gone = { t: 0 };
    const n = [{ t: 1 }, { t: 2 }];
    expect(nextLastNews(n, gone, all)).toBe(n[1]);
  });
  test('nothing visible -> null', () => {
    expect(nextLastNews([{ t: 1 }], null, () => false)).toBeNull();
  });
});
