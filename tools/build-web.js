#!/usr/bin/env bun
/**
 * Production web build (PF4): bundles the browser entry (js/main.js + the save worker) into dist/,
 * code-splits it, minifies it, and copies index.html, css/ and assets/ next to it.
 * Serve the dist/ folder as the site root (static host or `bun tools/serve-dist.js`).
 * Dev path is unchanged: `bun server.js` still serves the unbundled js/ modules.
 *
 * Usage: bun tools/build-web.js [--out dist]
 */
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const outArg = process.argv.indexOf('--out');
const OUT = join(ROOT, outArg > 0 ? process.argv[outArg + 1] : 'dist');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'js'), { recursive: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, 'js/main.js'), join(ROOT, 'js/ui/saveWorker.js')],
  outdir: join(OUT, 'js'),
  root: join(ROOT, 'js'),
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  sourcemap: 'none',
  naming: { entry: '[name].js', chunk: 'chunk-[hash].js', asset: 'asset-[hash].[ext]' },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const chunks = result.outputs.filter((o) => o.kind === 'chunk').map((o) => relative(OUT, o.path).split('\\').join('/'));
const entry = result.outputs.find((o) => o.kind === 'entry-point' && o.path.endsWith('main.js'));
const entryRel = relative(OUT, entry.path).split('\\').join('/');

// index.html: the dev page loads js/main.js as a module; the build loads the bundled entry and preloads the
// split chunks and the first-frame assets (the OpenGFX atlas + its manifest) so they download in parallel.
const preloads = [
  ...chunks.map((c) => `  <link rel="modulepreload" href="${c}">`),
  '  <link rel="preload" href="assets/opengfx/manifest.json" as="fetch" type="application/json" crossorigin>',
  '  <link rel="preload" href="assets/opengfx/atlas0.png" as="image">',
].join('\n');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace('<script type="module" src="js/main.js"></script>', `<script type="module" src="${entryRel}"></script>`)
  .replace('</head>', `${preloads}\n</head>`);
writeFileSync(join(OUT, 'index.html'), html);

cpSync(join(ROOT, 'css'), join(OUT, 'css'), { recursive: true });
cpSync(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });

let bytes = 0;
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : (bytes += statSync(p).size); } };
walk(OUT);
console.log(`built ${relative(ROOT, OUT)}/: entry ${entryRel}, ${chunks.length} chunks, ${(bytes / 1048576).toFixed(1)} MB total`);
