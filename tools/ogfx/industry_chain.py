# T-IA: extracts OpenTTD layouts (src/table/build_industry.h) and tile sprite pairs (src/table/industry_land.h)
# for bank, printing works, food processing, paper mill. Prints JS snippets for js/renderer/pack/ottd_tables.js.
# Usage: python3 tools/ogfx/industry_chain.py <openttd/src dir>
import re, sys
root = sys.argv[1] if len(sys.argv) > 1 else '/home/abhi/project/city_sim/scratchpad/openttd/src'
bi = open(root + '/table/build_industry.h').read()
# layout name -> OTTD family key
FAM = {'bank': 'bank', 'printing_works': 'printing_works', 'food_process': 'food_plant', 'paper_mill': 'paper_mill'}
out_layouts = {}
for name, key in [('bank', 'bank'), ('printing_works', 'printing_works'), ('food_process', 'food_plant'), ('paper_mill', 'paper_mill')]:
    variants = []
    for m in re.finditer(r'static const IndustryTileLayout _tile_table_%s_(\d+) \{(.*?)\};' % name, bi, re.S):
        ents = re.findall(r'\{\{(\d+), (\d+)\}, (\d+)\}', m.group(2))
        variants.append([(int(x), int(y), int(g)) for x, y, g in ents])
    out_layouts[key] = variants
ld = open(root + '/table/industry_land.h').read()
body = ld[ld.index('_industry_draw_tile_data['):]
body = body[body.index('{') + 1:]
lines = [l.strip() for l in body.split('\n') if l.strip().startswith('M(')]
ents = []
for l in lines:
    inner = l[2:l.rindex(')')]
    ents.append([x.strip() for x in re.split(r',(?![^(]*\))', inner)])
def val(s):
    s = re.sub(r'\|.*', '', s).strip()
    return 0 if s == '0' else int(re.match(r'(0x[0-9a-fA-F]+|\d+)', s).group(1), 0)
gfxs = sorted({g for v in out_layouts.values() for var in v for (_, _, g) in var})
print('// LAYOUTS (OpenTTD build_industry.h, [X,Y,gfx])')
for key, vs in out_layouts.items():
    print('  %s: [' % key)
    for v in vs:
        print('    [' + ', '.join('[%d,%d,%d]' % e for e in v) + '],')
    print('  ],')
print('// GFX (gfx: [ground, building, dx, dy], stage 3 = completed)')
for g in gfxs:
    e = ents[g * 4 + 3]
    print('  %d: [%d, %d, %d, %d],' % (g, val(e[0]), val(e[2]), int(e[4]), int(e[5])))
