#!/usr/bin/env bun
/**
 * Serve dist/ (from `bun run build:web`) on PORT (default 5174) for a local/tailnet check of the bundled build.
 * Sends ETag (size + mtime) so reloads revalidate with 304, gzips text on the fly, and marks the hashed
 * code-split chunks immutable. Env: PORT, TT_HOST (bind address; default 0.0.0.0).
 */
import { join, normalize, extname } from 'node:path';
import { statSync, readFileSync } from 'node:fs';
const ROOT = join(import.meta.dir, '..', 'dist');
const gz = new Map();
const PORT = Number(process.env.PORT) || 5174;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const GZIP = /\.(js|css|json|html|svg|md|txt)$/;

/** Cache policy: hashed chunks immutable, images a day, everything else revalidate. */
function cacheControl(p) {
  if (/\/js\/chunk-[A-Za-z0-9_-]+\.js$/.test(p)) return 'public, max-age=31536000, immutable';
  if (/\.(png|svg|ico)$/.test(p)) return 'public, max-age=86400';
  return 'no-cache';
}

/** Weak ETag from size + mtime (ms); stable across restarts, changes on every rebuild. */
function etagOf(full, st) { return `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`; }

Bun.serve({
  port: PORT,
  hostname: process.env.TT_HOST || '0.0.0.0',
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/healthz') {
      let build = null;
      try { build = JSON.parse(readFileSync(join(ROOT, 'build.json'), 'utf8')); } catch { /* no stamp */ }
      return Response.json({ ok: true, build, uptimeS: Math.round(process.uptime()) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (p === '/' || p === '') p = '/index.html';
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    let st;
    try { st = statSync(full); } catch { return new Response('Not found', { status: 404 }); }
    if (!st.isFile()) return new Response('Not found', { status: 404 });
    const f = Bun.file(full);
    const etag = etagOf(full, st);
    const headers = { 'Content-Type': MIME[extname(full)] || 'application/octet-stream', 'Cache-Control': cacheControl(p), ETag: etag, Vary: 'Accept-Encoding' };
    const inm = req.headers.get('if-none-match');
    if (inm && (inm === etag || inm.split(',').some((t) => t.trim() === etag))) {
      return new Response(null, { status: 304, headers });
    }
    if (GZIP.test(full) && /\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
      const key = full + ':' + st.mtimeMs;
      if (!gz.has(key)) gz.set(key, Bun.gzipSync(new Uint8Array(await f.arrayBuffer()), { level: 6 }));
      return new Response(gz.get(key), { headers: { ...headers, 'Content-Encoding': 'gzip' } });
    }
    return new Response(f, { headers });
  },
});
console.log(`serving dist/ on http://${process.env.TT_HOST || '0.0.0.0'}:${PORT}`);
