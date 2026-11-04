/**
 * Minimal static file server for Transit Tycoon JS (dev only).
 * Usage: `bun server.js` (PORT env overrides the default 5173).
 */
import { join, normalize, extname } from 'node:path';

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT) || 5173;

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

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = resolvePath(url.pathname);
    if (!path) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
    return new Response(file, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
  },
});

console.log(`Transit Tycoon dev server: http://localhost:${server.port}`);
