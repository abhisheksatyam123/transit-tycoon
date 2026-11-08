/**
 * File-backed logger (OPFS), controlled from the browser console or URL params.
 *
 * Default: DISABLED (silent, no console output from the logger, and the 3
 * wired error sites keep their legacy `console.*` fallback path). Turn it on
 * with either of:
 *   - URL params: `?log=1[&logLevel=debug|info|warn|error][&logFile=NAME]`
 *   - Console:    `window.__ttLog.enable()` / `.setLevel('debug')` /
 *                 `.download()` / `.read()` / `.clear()` / `.status()`
 *
 * When enabled, entries go to the Origin Private File System:
 *   <opfs>/logs/tt-YYYY-MM-DD.log        (one file per day)
 * Buffer is kept in memory, flushed to OPFS every 1s, on hidden tab, and on
 * `beforeunload`. Nothing is written to `console` while enabled, except
 * errors from the logger itself (which have nowhere else to go).
 *
 * Storage backend is injectable so the same module works under `bun test`
 * (in-memory backend) and in non-secure contexts without OPFS.
 *
 * Log line format (one per line):
 *   <ISO8601> [<LEVEL>] [category] message {jsonExtras?}
 */

export const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 };
export const LOG_DIR = 'logs';
export const MAX_ENTRIES = 2000;
export const FLUSH_MS = 1000;
const MAX_OPFS_BYTES = 10 * 1024 * 1024; // 10 MiB across all log files

/** @returns {string} today's file name, e.g. `tt-2026-11-08.log` */
export function logFileFor(date = new Date()) {
  return `tt-${date.toISOString().slice(0, 10)}.log`;
}

/** Parse a level name / number into a LEVELS value, or null when invalid. */
export function parseLevel(level) {
  if (typeof level === 'number' && Number.isFinite(level)) return Math.max(0, Math.min(4, Math.floor(level)));
  if (typeof level === 'string') {
    const k = level.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LEVELS, k)) return LEVELS[k];
  }
  return null;
}

function errorText(err) {
  if (!err) return String(err);
  if (typeof err === 'string') return err;
  if (err && err.stack) return err.stack.split('\n')[0];
  return String(err && err.message ? err.message : err);
}

function safeJson(v) {
  if (v === undefined) return '';
  try {
    const s = JSON.stringify(v);
    return s === undefined ? '' : ' ' + s;
  } catch { return ' [unserialisable]'; /* log line must never throw */ }
}

/** Build one log line. Pure (tested). */
export function formatLine({ ts = new Date(), level = 'info', category = 'app', message = '' } = {}) {
  const t = ts instanceof Date ? ts : new Date(ts);
  const lvl = String(level).toUpperCase().padEnd(5);
  return `${t.toISOString()} [${lvl}] [${category}] ${message}`;
}

/* ------------------------------------------------------------------ */
/* Storage backends                                                    */
/* ------------------------------------------------------------------ */

/**
 * In-memory backend (tests / non-browser / OPFS unavailable).
 * Stores one string per file name, mimicking the OPFS layout.
 */
export class MemoryStore {
  constructor() { /** @type {Map<string,string>} */ this.files = new Map(); }
  async list() { return [...this.files.keys()].sort(); }
  async read(name) { return this.files.get(name) || ''; }
  async append(name, text) { this.files.set(name, (this.files.get(name) || '') + text); }
  async write(name, text) { this.files.set(name, text); }
  async remove(name) { this.files.delete(name); }
  size() { let n = 0; for (const v of this.files.values()) n += v.length; return n; }
}

/**
 * OPFS backend: `navigator.storage.getDirectory()` -> `logs/` subdir.
 * Guarded: every method no-ops / throws only when OPFS is unavailable.
 */
export class OpfsStore {
  async _dir() { return (await navigator.storage.getDirectory()).getDirectoryHandle(LOG_DIR, { create: true }); }
  async list() {
    const dir = await this._dir();
    const out = [];
    // eslint-disable-next-line no-restricted-syntax -- FileSystemDirectoryHandle iteration
    for await (const name of dir.keys()) if (name.startsWith('tt-') && name.endsWith('.log')) out.push(name);
    return out.sort();
  }
  async read(name) {
    const dir = await this._dir();
    try { const fh = await dir.getFileHandle(name); return await (await fh.getFile()).text(); } catch { return ''; }
  }
  async append(name, text) {
    const dir = await this._dir();
    const fh = await dir.getFileHandle(name, { create: true });
    const wh = await fh.createWritable({ keepExistingData: true });
    await wh.seek('end');
    await wh.write(text);
    await wh.close();
  }
  async write(name, text) {
    const dir = await this._dir();
    const fh = await dir.getFileHandle(name, { create: true });
    const wh = await fh.createWritable();
    await wh.write(text);
    await wh.close();
  }
  async remove(name) {
    const dir = await this._dir();
    try { await dir.removeEntry(name); } catch { /* missing */ }
  }
  async size() {
    const dir = await this._dir();
    let n = 0;
    try {
      for await (const name of dir.keys()) {
        if (!name.startsWith('tt-')) continue;
        const fh = await dir.getFileHandle(name);
        n += (await fh.getFile()).size;
      }
    } catch { /* partial */ }
    return n;
  }
}

/** Pick the default store: OPFS in a secure browsing context, else memory. */
export function defaultStore() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') return new OpfsStore();
  } catch { /* fall through */ }
  return new MemoryStore();
}

/* ------------------------------------------------------------------ */
/* Logger singleton                                                    */
/* ------------------------------------------------------------------ */

export class FileLogger {
  constructor() {
    this.store = defaultStore();
    this.enabled = false;
    this.level = LEVELS.info;
    this.buffer = []; // pending lines (strings)
    this.flushed = 0; // lines written to the store this session
    /** @type {string|null} pinned file name (`?logFile=`); null = today's file */
    this.fileName = null;
    this._timer = null;
    this._unloadBound = false;
    this.counter = { debug: 0, info: 0, warn: 0, error: 0 };
  }

  /** Active file name (`?logFile=` pin or today's). */
  currentFile() { return this.fileName || logFileFor(); }

  /**
   * Parse logger URL params (`?log=1&logLevel=debug&logFile=NAME`).
   * Returns true when logging was enabled by the URL.
   */
  initFromUrl(search = '') {
    try {
      const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      if (q.has('logFile')) this.fileName = (q.get('logFile') || '').trim() || null;
      if (!(q.get('log') === '1' || q.get('log') === 'true')) return false;
      const lvl = parseLevel(q.get('logLevel') || 'info');
      this.enable(lvl ?? LEVELS.info);
      return true;
    } catch { return false; }
  }

  /** Enable file logging at the given level (default: current). */
  enable(level) {
    if (level !== undefined) {
      const l = parseLevel(level);
      if (l === null) throw new Error(`Invalid log level: ${level} (use debug|info|warn|error|off)`);
      this.level = l;
    }
    if (this.level === LEVELS.off) this.level = LEVELS.info;
    this.enabled = true;
    this._startTimer();
    this._bindUnload();
    this.info('logger', `file logging enabled (level=${['debug','info','warn','error'][this.level]}, file=${this.currentFile()})`);
    return this.status();
  }

  /** Disable file logging; buffered lines stay in memory until `flush()`. */
  disable() {
    this.enabled = false;
    this._stopTimer();
    return this.status();
  }

  /** Change the level while keeping the enabled state. */
  setLevel(level) {
    const l = parseLevel(level);
    if (l === null) throw new Error(`Invalid log level: ${level} (use debug|info|warn|error|off)`);
    this.level = l;
    return this.status();
  }

  status() {
    return {
      enabled: this.enabled,
      level: ['debug', 'info', 'warn', 'error', 'off'][this.level],
      file: this.currentFile(),
      buffered: this.buffer.length,
      flushed: this.flushed,
      counters: { ...this.counter },
      store: this.store.constructor.name,
    };
  }

  /** In-memory buffered entries (not yet flushed). */
  entries() { return [...this.buffer]; }

  /** Write buffered lines to the store (no-op when empty). */
  async flush() {
    if (!this.buffer.length) return 0;
    const chunk = this.buffer.join('');
    this.buffer = [];
    try {
      await this.store.append(this.currentFile(), chunk);
      this.flushed += chunk.split('\n').filter(Boolean).length;
      await this._rotate();
    } catch (err) {
      // No console spike: keep the chunk for a later flush, flag it in-memory.
      this.buffer.unshift(chunk);
      this._lastFlushError = err;
      return 0;
    }
    return chunk.length;
  }

  /** Read a log file (default: today's) from the store. */
  async read(name, { offset = 0, limit = 500 } = {}) {
    const text = await this.store.read(name || this.currentFile());
    if (!text) return [];
    const lines = text.split('\n').filter(Boolean);
    return lines.slice(offset, offset + limit);
  }

  /** Read the in-memory buffer + the stored file, tail-first convenience. */
  async tail(limit = 50) {
    const stored = await this.read(this.currentFile(), { offset: 0, limit: Infinity });
    return [...stored, ...this.buffer].slice(-limit);
  }

  /** List stored log files. */
  async list() { return this.store.list(); }

  /** Clear the in-memory buffer and (optionally) the stored files. */
  async clear({ files = false } = {}) {
    this.buffer = [];
    if (files) { for (const name of await this.store.list()) await this.store.remove(name); }
    return this.status();
  }

  /** Download the current log file (browser only; no-op in Node). */
  download() {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
    const blob = new Blob([this.buffer.join('')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = this.currentFile();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return this.currentFile();
  }

  /* -------- emission -------- */

  _emit(level, category, message, extra) {
    const lvlNum = LEVELS[level];
    if (!this.enabled || lvlNum < this.level) return false;
    const line = formatLine({ level, category, message, extra }) + safeJson(extra) + '\n';
    if (this.buffer.length >= MAX_ENTRIES) this.buffer.shift();
    this.buffer.push(line);
    this.counter[level] = (this.counter[level] || 0) + 1;
    if (this.buffer.length >= MAX_ENTRIES) void this.flush();
    return true;
  }

  debug(category, message, extra) { return this._emit('debug', category, message, extra); }
  info(category, message, extra) { return this._emit('info', category, message, extra); }
  warn(category, message, extra) { return this._emit('warn', category, message, extra); }
  error(category, message, extra) { return this._emit('error', category, message, extra); }

  /** Wire global error / rejection capture into the file log. */
  captureGlobalErrors(target = globalThis) {
    if (!target || typeof target.addEventListener !== 'function' || target.__ttLogCapture) return;
    target.__ttLogCapture = true;
    target.addEventListener('error', (ev) => {
      this.error('global', `uncaught: ${ev.message || 'error'}`, { filename: ev.filename, line: ev.lineno, col: ev.colno });
    });
    target.addEventListener('unhandledrejection', (ev) => {
      this.error('global', `unhandled rejection: ${errorText(ev.reason)}`);
    });
  }

  /* -------- internals -------- */

  _startTimer() {
    if (this._timer) return;
    const set = typeof setInterval === 'function' ? setInterval : null;
    if (!set) return;
    this._timer = set(() => { if (this.buffer.length) void this.flush(); }, FLUSH_MS);
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref();
  }
  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _bindUnload() {
    if (this._unloadBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this._unloadBound = true;
    window.addEventListener('beforeunload', () => { if (this.buffer.length) void this.flush(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.buffer.length) void this.flush();
    });
  }

  async _rotate() {
    try {
      if (await this.store.size() <= MAX_OPFS_BYTES) return;
      const files = await this.store.list();
      for (const name of files.slice(0, Math.max(0, files.length - 7))) await this.store.remove(name);
    } catch { /* best effort */ }
  }
}

/** Shared singleton. */
export const logger = new FileLogger();

/** Install the console handle (`window.__ttLog`). Safe when called early. */
export function installConsoleHandle(target = globalThis) {
  if (!target) return logger;
  target.__ttLog = {
    enable: (level) => logger.enable(level),
    disable: () => logger.disable(),
    setLevel: (level) => logger.setLevel(level),
    status: () => logger.status(),
    flush: () => logger.flush(),
    read: (name, opts) => logger.read(name, opts),
    tail: (limit) => logger.tail(limit),
    list: () => logger.list(),
    clear: (opts) => logger.clear(opts),
    download: () => logger.download(),
    entries: () => logger.entries(),
    help: () => 'logger: enable(level?) | disable() | setLevel(l) | status() | flush() | read(name?) | tail(n) | list() | clear({files}) | download()',
  };
  return logger;
}

/** One-shot init: URL params + console handle + global error capture. */
export function initLogger(search = '') {
  const s = search || (typeof location !== 'undefined' ? location.search : '');
  logger.initFromUrl(s);
  installConsoleHandle();
  logger.captureGlobalErrors();
  return logger;
}
