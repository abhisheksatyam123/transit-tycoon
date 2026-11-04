/**
 * OpenGFX pnml reader. Expands `base_graphics sprN(ID, "file") { ... }` blocks, including
 * `tmpl_*()` template calls (templates are collected from every .pnml/.nml under sprites/).
 * Each rectangle inside a block gets the next consecutive sprite id, as in the NML compiler.
 * Arithmetic in template arguments is evaluated after substituting parameters (digits/+-*() only).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Remove // and block comments (keeps strings intact enough for OpenGFX sources). */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"])\/\/[^\n]*/g, '$1');
}

/** Recursively list files with the given extensions. */
function listFiles(dir, exts, out = []) {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listFiles(p, exts, out);
    else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
}

/** Split "a, b+1, c" at top-level commas. */
function splitArgs(s) {
  return s.split(',').map((a) => a.trim()).filter((a) => a.length);
}

/** Evaluate a numeric expression with environment params. */
function evalExpr(expr, env) {
  let s = expr.trim().replace(/[A-Za-z_]\w*/g, (id) => {
    if (!(id in env)) throw new Error(`unknown identifier ${id} in "${expr}"`);
    return `(${env[id]})`;
  });
  if (!/^[\d\s+\-*()]+$/.test(s)) throw new Error(`bad expr "${expr}"`);
  return Function(`"use strict"; return (${s});`)();
}

/** Find the index of the brace closing the one at `open`. */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced braces');
}

/** Collect `template name(params) { body }` definitions. */
function collectTemplates(text, tmpls) {
  const re = /template\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(text, open);
    if (!tmpls.has(m[1])) tmpls.set(m[1], { params: splitArgs(m[2]), body: text.slice(open + 1, close) });
  }
}

/**
 * Turn a body (rectangles and tmpl calls) into a flat list of rect objects in the given env.
 * @returns {Array<{x,y,w,h,xo,yo,file?}>}
 */
function expandBody(body, env, tmpls, depth = 0) {
  const out = [];
  const re = /\[([^\]]*)\]|(\w+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      const f = m[1].split(',').map((a) => a.trim());
      try {
        const nums = f.slice(0, 6).map((e) => evalExpr(e, env));
        out.push({ x: nums[0], y: nums[1], w: nums[2], h: nums[3], xo: nums[4], yo: nums[5] });
      } catch { /* rectangle depends on unknown params: skip */ }
    } else if (tmpls.has(m[2]) && depth < 8) {
      const t = tmpls.get(m[2]);
      const args = splitArgs(m[3]);
      const e2 = {};
      t.params.forEach((p, i) => {
        const a = args[i];
        if (a === undefined) e2[p] = 0;
        else { try { e2[p] = evalExpr(a, env); } catch { e2[p] = 0; } }
      });
      out.push(...expandBody(t.body, e2, tmpls, depth + 1));
    }
  }
  return out;
}

/**
 * Read every explicit base sprite definition under srcRoot/sprites.
 * @param {string} srcRoot OpenGFX checkout root (contains sprites/)
 * @returns {Map<number,{file:string,x:number,y:number,w:number,h:number,xo:number,yo:number}>}
 */
export function readSpriteDefs(srcRoot) {
  const files = listFiles(join(srcRoot, 'sprites'), ['.pnml', '.nml']).map((f) => ({ f, t: stripComments(readFileSync(f, 'utf8')) }));
  const tmpls = new Map();
  for (const { t } of files) collectTemplates(t, tmpls);
  const map = new Map();
  for (const { f, t } of files) {
    if (!relative(join(srcRoot, 'sprites'), f).startsWith('base')) continue;
    const re = /base_graphics\s+\w+\(\s*(\d+)\s*,\s*"([^"]+)"\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(t))) {
      const id = +m[1];
      const open = m.index + m[0].length - 1;
      const body = t.slice(open + 1, matchBrace(t, open));
      const file = m[2];
      const rects = expandBody(body, {}, tmpls);
      rects.forEach((r, i) => { if (!map.has(id + i)) map.set(id + i, { ...r, file }); });
      re.lastIndex = matchBrace(t, open);
    }
  }
  return map;
}
