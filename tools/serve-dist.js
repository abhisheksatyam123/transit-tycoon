#!/usr/bin/env bun
/** Serve dist/ (from `bun run build:web`) on PORT (default 5174) for a local check of the bundled build. */
import { join, normalize, extname } from 'node:path';
const ROOT = join(import.meta.dir, '..', 'dist');
const gz = new Map();
const PORT = Number(process.env.PORT) || 5174;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
Bun.serve({
  port: PORT,
  hostname: process.env.TT_HOST || '0.0.0.0',
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    const f = Bun.file(full);
    if (!(await f.exists())) return new Response('Not found', { status: 404 });
    // gzip text like a real static host (CDNs/nginx compress .js/.css/.json/.html; PNG is already compressed)
    const type = MIME[extname(full)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
    if (/\.(js|css|json|html)$/.test(full) && /\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
      const key = full + ':' + f.lastModified;
      if (!gz.has(key)) gz.set(key, Bun.gzipSync(new Uint8Array(await f.arrayBuffer()), { level: 6 }));
      return new Response(gz.get(key), { headers: { ...headers, 'Content-Encoding': 'gzip' } });
    }
    return new Response(f, { headers });
  },
});
console.log(`serving dist/ on http://localhost:${PORT}`);
