#!/usr/bin/env bun
/**
 * Generates js/renderer/pack/toyland_table.js from OpenTTD sources (GPL-2.0):
 *  - src/table/town_land.h: 1x1 houses with HouseZone::ClimateToyland (stage-3 [ground, building, dx, dy] per TileHash2Bit)
 *  - src/table/tree_land.h: _tree_layout_sprite rows 128..163 (TREE_TOYLAND = 0x20, 9 tree types, 4 rows each)
 * Usage: bun tools/ogfx/gen_toyland_table.js [--ottd <openttd src dir>]
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const OTTD = resolve(args.includes('--ottd') ? args[args.indexOf('--ottd') + 1] : join(here, '../../../scratchpad/openttd/src'));
const OUT = resolve(join(here, '../../js/renderer/pack/toyland_table.js'));
const th = readFileSync(join(OTTD, 'table/town_land.h'), 'utf8');
const sp = readFileSync(join(OTTD, 'table/sprites.h'), 'utf8');
const tl = readFileSync(join(OTTD, 'table/tree_land.h'), 'utf8');
const bi = readFileSync(join(OTTD, 'table/build_industry.h'), 'utf8');
const il = readFileSync(join(OTTD, 'table/industry_land.h'), 'utf8');

const names = new Map();
for (const m of sp.matchAll(/SpriteID\s+(\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)\s*;/g)) names.set(m[1], Number(m[2]));
const val = (t) => {
  t = t.trim();
  if (/^0x/.test(t)) return parseInt(t, 16);
  if (/^\d+$/.test(t)) return +t;
  if (!names.has(t)) throw new Error(`unknown sprite ${t}`);
  return names.get(t);
};

// houses
const a = th.indexOf('_town_draw_tile_data[] = {');
const draws = th.slice(a, th.indexOf('\n};', a)).split('\n').filter((l) => /^\tM\(/.test(l)).map((l) => {
  const f = l.slice(l.indexOf('(') + 1, l.lastIndexOf(')')).split(',').map((s) => s.trim());
  return { s1: val(f[0]), s2: val(f[2]), dx: +f[4], dy: +f[5] };
});
const c = th.indexOf('_original_house_specs[] = {');
const body = th.slice(c, th.indexOf('static_assert(lengthof(_original_house_specs)', c));
const specs = body.split(/\n\tMS\(/).slice(1).map((p, id) => {
  const zm = /HouseZones\(\{([^}]*)\}\)/.exec(p);
  const zones = zm ? zm[1].replace(/HouseZone::/g, '').split(',').map((s) => s.trim()) : [];
  const m = /MS\(\s*(\d+),\s*[^,]+,\s*(\d+),/.exec('MS(' + p);
  return { id, zones, minYear: +m[1], pop: +m[2], size1: /Size1x1/.test(p) };
});
const houses = [];
for (const s of specs) {
  if (!s.zones.includes('ClimateToyland') || !s.size1) continue;
  const pairs = [0, 1, 2, 3].map((v) => {
    const d = draws[s.id * 16 + v * 4 + 3];
    return [d.s1, d.s2, d.dx, d.dy];
  });
  houses.push({ id: s.id, minYear: s.minYear, pop: s.pop, pairs });
}

// trees: rows 128..163 (TREE_TOYLAND << 2, 9 types)
const ti = tl.indexOf('_tree_layout_sprite');
const tbody = tl.slice(ti, tl.indexOf('};', ti));
const cells = [...tbody.matchAll(/\{\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*[A-Z_]+\s*\}/g)].map((m) => val(m[1]));
if (cells.length !== 196 * 4) throw new Error(`tree cells ${cells.length}`);
const rows = [];
for (let r = 0; r < 196; r++) rows.push(cells.slice(r * 4, r * 4 + 4));
const TREE_ROW0 = 0x20 << 2;
const trees = rows.slice(TREE_ROW0, TREE_ROW0 + 36);

// toyland industries (table/build_industry.h _tile_table_<family>_<variant>, OpenTTD X/Y offsets) and their stage-3
// draw data (table/industry_land.h _industry_draw_tile_data, gfx << 2 | 3). Our typeId -> OpenTTD family.
const TOY_FAMILY = {
  cotton_candy_forest: 'cotton_candy', sweet_factory: 'candy_factory', battery_farm: 'battery_farm',
  cola_wells: 'cola_wells', toy_shop: 'toy_shop', toy_factory: 'toy_factory', plastic_fountains: 'plastic_fountain',
  fizzy_drink_factory: 'fizzy_drink', bubble_generator: 'bubble_generator', toffee_quarry: 'toffee_quarry', sugar_mine: 'sugar_mine',
};
const layouts = {};
for (const [typeId, fam] of Object.entries(TOY_FAMILY)) {
  const vars = [];
  const re = new RegExp(`static const IndustryTileLayout _tile_table_${fam}_(\\d+) \\{`, 'g');
  let m;
  while ((m = re.exec(bi))) {
    const body = bi.slice(m.index, bi.indexOf('};', m.index));
    const ents = [...body.matchAll(/\{\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}\s*,\s*(\d+)\s*\}/g)].map((e) => [+e[1], +e[2], +e[3]]);
    vars.push(ents);
  }
  if (!vars.length) throw new Error(`no layout for ${fam}`);
  layouts[typeId] = vars;
}
const da = il.indexOf('_industry_draw_tile_data[');
const dbody = il.slice(il.indexOf('{', da) + 1, il.indexOf('\n};', da));
const drows = dbody.split('\n').filter((l) => /^\s*M\(/.test(l)).map((l) => l.slice(l.indexOf('(') + 1, l.lastIndexOf(')')).split(',').map((s) => s.trim()));
const usedGfx = new Set();
for (const vs of Object.values(layouts)) for (const v of vs) for (const e of v) usedGfx.add(e[2]);
const gfx = {};
for (const g of [...usedGfx].sort((a, b) => a - b)) {
  const r = drows[g * 4 + 3];
  if (!r) throw new Error(`no draw data for gfx ${g}`);
  gfx[g] = [val(r[0]) & 0x3fff, val(r[2]) & 0x3fff, +r[4], +r[5]];
}
const fmt = (r) => `[${r.join(', ')}]`;
writeFileSync(OUT, `// Generated by tools/ogfx/gen_toyland_table.js from OpenTTD src/table/town_land.h (_original_house_specs,
// _town_draw_tile_data), src/table/tree_land.h (_tree_layout_sprite rows 128..163) and sprites.h; GPL-2.0.
// Toyland (HouseZone::ClimateToyland) 1x1 houses: OpenTTD house id, min year, population, stage-3 [ground, building, dx, dy]
// per TileHash2Bit. Ids are OpenGFX base sprite ids. TOYLAND_TREE_ROWS: 9 tree types x 4 layout rows (base atlas ids).
export const TOYLAND_HOUSES = [
${houses.map((h) => `  { id: ${h.id}, minYear: ${h.minYear}, pop: ${h.pop}, pairs: [${h.pairs.map((p) => `[${p.join(', ')}]`).join(', ')}] },`).join('\n')}
];

export const TOYLAND_TREE_ROWS = [
${trees.map((r) => `  ${fmt(r)},`).join('\n')}
];
`);
const lay = Object.entries(layouts).map(([t, vs]) => `  ${t}: [\n${vs.map((v) => `    [${v.map((e) => `[${e.join(', ')}]`).join(', ')}],`).join('\n')}\n  ],`).join('\n');
const gfxTxt = Object.entries(gfx).map(([g, r]) => `  ${g}: [${r.join(', ')}],`).join('\n');
appendFileSync(OUT, `\n/** Toyland industry layouts (OpenTTD X/Y offsets, gfx ids) per industry type; variants as in build_industry.h. */\nexport const TOYLAND_INDUSTRY_LAYOUTS = {\n${lay}\n};\n\n/** Toyland industry stage-3 tile draws: gfx -> [ground, building, dx, dy] (OpenGFX base ids, OpenTTD sub-tile offsets). */\nexport const TOYLAND_INDUSTRY_GFX = {\n${gfxTxt}\n};\n`);
console.log(`toyland houses ${houses.length}, tree rows ${trees.length}, industries ${Object.keys(layouts).length}, gfx ${Object.keys(gfx).length} -> ${OUT}`);

// TY3: special draw procs (industry_cmd.cpp _industry_draw_tile_procs, 1-based draw_proc: 1 sugar mine, 2 toffee quarry,
// 3 bubble generator, 4 toy factory). Only the completed stage (stage 3) is drawn. Each entry lists child sprites as
// [spriteId, screenX, screenY] at frame 0 of the OTTD animation (industry_land.h tables; 255 = no drawing).
const SPRID = (n) => { const v = names.get(n); if (v === undefined) throw new Error('sprite name ' + n); return v; };
const procOf = (g) => drows[g * 4 + 3] ? Number(drows[g * 4 + 3][9]) : 0;
const arrBody = (name) => { const a = il.indexOf(name); return il.slice(il.indexOf('{', a) + 1, il.indexOf('};', a)); };
const sp1 = [...il.slice(il.indexOf('_draw_industry_spec1[96]'), il.indexOf('};', il.indexOf('_draw_industry_spec1[96]'))).matchAll(/\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/g)][0].slice(1).map(Number);
const pileAt = [...arrBody('_drawtile_proc1[5]').matchAll(/\{\s*(\d+)\s*,\s*(\d+)\s*\}/g)].map((m) => [+m[1], +m[2]]);
const toffee0 = Number(arrBody('_industry_anim_offs_toffee[]').match(/\d+/)[0]);
const bubble0 = Number(arrBody('_industry_anim_offs_bubbles[]').match(/\d+/)[0]);
const md0 = [...arrBody('_industry_anim_offs_toys[]').matchAll(/MD\(\s*(\d+),\s*(\d+),\s*(\d+)\)/g)][0].slice(1).map(Number);
const children = {};
for (const g of Object.keys(gfx).map(Number)) {
  const proc = procOf(g);
  if (!proc) continue;
  const kids = [];
  if (proc === 1) { // sugar mine: sieve frame 0 at x, cloud / pile when set
    const [x, i1, i2, i3] = sp1;
    kids.push([SPRID('SPR_IT_SUGAR_MINE_SIEVE') + i1, x, 0]);
    if (i2) kids.push([SPRID('SPR_IT_SUGAR_MINE_CLOUDS') + i2 - 1, 8, 41]);
    if (i3) kids.push([SPRID('SPR_IT_SUGAR_MINE_PILE') + i3 - 1, pileAt[i3 - 1][0], pileAt[i3 - 1][1]]);
  } else if (proc === 2) { // toffee quarry: shovel moves with the animation offset (0xFF = 0), toffee fixed
    const x = toffee0 === 0xff ? 0 : toffee0;
    kids.push([SPRID('SPR_IT_TOFFEE_QUARRY_SHOVEL'), 22 - x, 24 + x], [SPRID('SPR_IT_TOFFEE_QUARRY_TOFFEE'), 6, 14]);
  } else if (proc === 3) { // bubble generator: bubble at the animation height, spring fixed
    kids.push([SPRID('SPR_IT_BUBBLE_GENERATOR_BUBBLE'), 5, bubble0], [SPRID('SPR_IT_BUBBLE_GENERATOR_SPRING'), 3, 67]);
  } else { // toy factory: clay / robot skipped when 255; stamp and holder fixed
    // MD(img1, img2, img3) = {x: 50 - img1 * 2, image_1: img1, image_2: img2, image_3: img3} (255 = not drawn)
    const [i1, i2, i3] = md0;
    if (i1 !== 255) kids.push([SPRID('SPR_IT_TOY_FACTORY_CLAY'), 50 - i1 * 2, 96 + i1]);
    if (i2 !== 255) kids.push([SPRID('SPR_IT_TOY_FACTORY_ROBOT'), 16 - i2 * 2, 100 + i2]);
    kids.push([SPRID('SPR_IT_TOY_FACTORY_STAMP'), 7, i3], [SPRID('SPR_IT_TOY_FACTORY_STAMP_HOLDER'), 0, 42]);
  }
  children[g] = kids;
}
const kidTxt = Object.entries(children).map(([g, k]) => `  ${g}: [${k.map((c) => `[${c.join(', ')}]`).join(', ')}],`).join('\n');
appendFileSync(OUT, `\n/** TY3 special draw procs (frame 0): gfx -> [spriteId, screenX, screenY] child sprites (industry_cmd.cpp). */\nexport const TOYLAND_INDUSTRY_CHILDREN = {\n${kidTxt}\n};\n`);
console.log(`toyland special-proc gfx ${Object.keys(children).length}`);
