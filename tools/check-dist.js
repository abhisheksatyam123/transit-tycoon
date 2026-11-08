#!/usr/bin/env bun
/**
 * check-dist (PF4): Validates production build artifacts in dist/.
 * Verifies dist exists, entry points, chunks, assets, and index.html structure.
 * Fast check (< 50ms) for CI or deployment pipelines.
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const outArg = process.argv.indexOf('--out');
const DIST = join(ROOT, outArg > 0 ? process.argv[outArg + 1] : 'dist');

if (!existsSync(DIST)) {
  console.error(`check:dist FAIL: directory not found: ${DIST}`);
  console.error('Run "bun run build:web" first.');
  process.exit(1);
}

const requiredFiles = [
  'index.html',
  'js/main.js',
  'js/saveWorker.js',
  'css/main.css',
  'css/windows.css',
  'assets/opengfx/manifest.json',
  'assets/opengfx/atlas0.png',
];

const missing = [];
for (const rel of requiredFiles) {
  const p = join(DIST, rel);
  if (!existsSync(p)) {
    missing.push(rel);
  } else if (statSync(p).size === 0) {
    missing.push(`${rel} (empty file)`);
  }
}

if (missing.length > 0) {
  console.error(`check:dist FAIL: missing or empty required files:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// Check index.html references
const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');

if (!indexHtml.includes('<script type="module" src="js/main.js">') && !indexHtml.includes('src="js/main.js"')) {
  console.error('check:dist FAIL: index.html does not reference bundled entry js/main.js');
  process.exit(1);
}

if (!existsSync(join(DIST, 'assets/opengfx/manifest.json'))) {
  console.error('check:dist FAIL: OpenGFX manifest missing');
  process.exit(1);
}

// Verify JS chunks
const jsFiles = readdirSync(join(DIST, 'js'));
const chunks = jsFiles.filter(f => f.startsWith('chunk-') && f.endsWith('.js'));
if (chunks.length === 0) {
  console.warn('check:dist WARN: no code-split chunks found in dist/js');
}

// Read OpenGFX manifest and check atlas files
try {
  const manifest = JSON.parse(readFileSync(join(DIST, 'assets/opengfx/manifest.json'), 'utf8'));
  if (!manifest.atlases || manifest.atlases.length === 0) {
    console.error('check:dist FAIL: manifest.json has no atlases');
    process.exit(1);
  }
  for (const atlas of manifest.atlases) {
    const atlasPath = join(DIST, 'assets/opengfx', atlas.file);
    if (!existsSync(atlasPath)) {
      console.error(`check:dist FAIL: atlas file missing: assets/opengfx/${atlas.file}`);
      process.exit(1);
    }
  }
} catch (err) {
  console.error(`check:dist FAIL: invalid manifest.json: ${err.message}`);
  process.exit(1);
}

let totalBytes = 0;
let fileCount = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      walk(p);
    } else {
      totalBytes += s.size;
      fileCount++;
    }
  }
}
walk(DIST);

console.log(`OK: dist verified (${fileCount} files, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB, ${chunks.length} chunks)`);
