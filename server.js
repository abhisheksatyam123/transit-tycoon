/**
 * Minimal static file server for Transit Tycoon JS (dev only).
 * Usage: `bun server.js` (PORT env overrides the default 5173;
 * TT_HOST env binds a specific interface, default 0.0.0.0 = all interfaces; e.g. TT_HOST=100.105.86.72 for Tailscale-only).
 */
import { join, normalize, extname } from 'node:path';

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT) || 5173;
/** Bind address: TT_HOST env, default 0.0.0.0 (localhost + LAN/Tailscale). */
const HOST = process.env.TT_HOST || '0.0.0.0';

/** @type {Record<string,string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolve a URL path to a file inside ROOT (prevents path traversal).
 * @param {string} pathname
 * @returns {string|null}
 */
export function resolvePath(pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

/** Text types worth compressing (images are already compressed). */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.md', '.txt']);
/** gzip cache: path -> { etag, body } (rebuilt when the file changes). */
const gzCache = new Map();

/** gzip a file once per version. */
async function gzipped(path, file, etag) {
  const hit = gzCache.get(path);
  if (hit && hit.etag === etag) return hit.body;
  const body = Bun.gzipSync(new Uint8Array(await file.arrayBuffer()), { level: 6 });
  gzCache.set(path, { etag, body });
  return body;
}

const server = Bun.serve({
  port: PORT,
  // TT_HOST, not HOST: conda (and some toolchains) export HOST=<target triple>, which made listen fail with EAGAIN
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    const path = resolvePath(url.pathname);
    if (!path) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
    // ETag from size + mtime: reloads revalidate with 304 instead of re-downloading (matters over LAN/Tailscale)
    const etag = `"${file.size.toString(36)}-${Math.floor(file.lastModified).toString(36)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding' };
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    if (COMPRESSIBLE.has(extname(path).toLowerCase()) && file.size > 1024 && /\bgzip\b/.test(req.headers.get('accept-encoding') || '')) {
      return new Response(await gzipped(path, file, etag), { headers: { ...headers, 'Content-Encoding': 'gzip' } });
    }
    return new Response(file, { headers });
  },
});

const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
console.log(`Transit Tycoon dev server: http://${shownHost}:${server.port}`);
