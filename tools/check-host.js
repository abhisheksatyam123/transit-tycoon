#!/usr/bin/env bun
/**
 * Smoke-check a running host of the web build (dev server or dist host).
 * Usage: bun tools/check-host.js [http://host:port]   (default: this host's Tailscale IP :8080)
 * Checks: index 200, /healthz, gzip on JS, ETag -> 304, immutable hashed chunks, cache policy, an atlas asset.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
let base = process.argv[2];
if (!base) {
  let ip = '';
  try { ip = execSync('tailscale ip -4', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0]; } catch { /* no tailscale */ }
  base = `http://${ip || '127.0.0.1'}:${process.env.PORT || 8080}`;
}
base = base.replace(/\/$/, '');
let fails = 0;
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`PASS  ${label}${extra ? '  (' + extra + ')' : ''}`);
  else { fails++; console.log(`FAIL  ${label}${extra ? '  (' + extra + ')' : ''}`); }
};
const head = async (path, headers = {}) => (await fetch(base + path, { method: 'HEAD', headers })).headers;
const headRes = (path, headers = {}) => fetch(base + path, { method: 'HEAD', headers });
const get = async (path) => fetch(base + path);

const html = await get('/');
ok(html.status === 200, 'GET / is 200', String(html.status));
ok(/text\/html/.test(html.headers.get('content-type') || ''), 'index content-type html');
const h = await head('/');
ok((h.get('cache-control') || '') === 'no-cache', 'index revalidates (no-cache)', h.get('cache-control') || 'missing');

const hz = await get('/healthz');
const hzj = hz.status === 200 ? await hz.json().catch(() => null) : null;
ok(!!hzj?.ok, 'GET /healthz ok', hzj?.build ? `commit ${hzj.build.commit}` : 'no build stamp');

const js = await get('/js/main.js');
ok(js.status === 200, 'GET /js/main.js is 200', String(js.status));
ok(/javascript/.test(js.headers.get('content-type') || ''), 'JS content-type');
const etag = js.headers.get('etag');
ok(!!etag, 'ETag present', etag || 'missing');
const jsGz = await get('/js/main.js');
await jsGz.arrayBuffer();
const gzHead = await head('/js/main.js', { 'accept-encoding': 'gzip' });
ok(gzHead.get('content-encoding') === 'gzip', 'gzip offered', gzHead.get('content-encoding') || 'none');
if (etag) {
  const r = await fetch(base + '/js/main.js', { headers: { 'if-none-match': etag } });
  ok(r.status === 304, 'If-None-Match -> 304', String(r.status));
}

// hashed chunk (from index.html) must be immutable
let chunk = '';
try {
  const idx = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
  chunk = (idx.match(/js\/chunk-[A-Za-z0-9_-]+\.js/) || [''])[0];
} catch { /* dist may be absent (dev server) */ }
if (chunk) {
  const chRes = await headRes('/' + chunk);
  const cc = chRes.headers.get('cache-control') || '';
  ok(chRes.status === 200 && /immutable/.test(cc), 'hashed chunk immutable', `${chunk} ${chRes.status} ${cc}`);
} else {
  console.log('SKIP  hashed chunk (no dist/index.html)');
}

const png = await headRes('/assets/opengfx/atlas0.png');
ok(png.status === 200 && /image\/png/.test(png.headers.get('content-type') || ''), 'OpenGFX atlas 200 png', `${png.status} ${png.headers.get('cache-control')}`);

console.log(fails ? `\n${fails} check(s) failed for ${base}` : `\nall checks passed for ${base}`);
process.exit(fails ? 1 : 0);
