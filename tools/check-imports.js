// Verifies every .js file parses (syntax) and every relative ES import resolves to a file that exports the imported names.
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
const root = resolve(import.meta.dir, '..');
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (f === 'node_modules' || f.startsWith('.')) continue; statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } })(root);
const exportsOf = (p) => { const s = readFileSync(p, 'utf8'); const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); });
  return names; };
let bad = 0;
const transpiler = typeof Bun !== 'undefined' ? new Bun.Transpiler({ loader: 'js' }) : null;
for (const f of files) { const s = readFileSync(f, 'utf8');
  if (transpiler) { try { transpiler.scan(s); } catch (e) { console.log(`SYNTAX ${relative(root, f)}: ${String(e && e.message || e).split('\n')[0]}`); bad++; } }
  for (const m of s.matchAll(/import\s+(?:([^'";]*?)\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[2]); const rf = relative(root, f);
    if (!existsSync(target)) { console.log(`MISSING FILE ${rf} -> ${m[2]}`); bad++; continue; }
    const spec = m[1] || ''; const brace = spec.match(/\{([\s\S]*)\}/); if (!brace) continue;
    const ex = exportsOf(target);
    for (const part of brace[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n && !ex.has(n)) { console.log(`MISSING EXPORT ${rf}: '${n}' from ${m[2]}`); bad++; } } } }
console.log(bad ? `${bad} problems` : `OK: ${files.length} files`); process.exit(bad ? 1 : 0);
