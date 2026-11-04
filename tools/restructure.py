# One-off: move src/* into the existing-project layout (js/{config,simulation,renderer,input,ui,audio}, css/)
# and rewrite relative imports.
import os, re, shutil
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def mapped(rel):
    rules = [('src/core/data/', 'js/config/'), ('src/core/', 'js/simulation/'), ('src/render/', 'js/renderer/'),
             ('src/ui/input.js', 'js/input/input.js'), ('src/ui/', 'js/ui/'), ('src/audio/', 'js/audio/'),
             ('src/main.js', 'js/main.js'), ('styles/', 'css/')]
    for a, b in rules:
        if rel.startswith(a): return b + rel[len(a):]
    return rel
files = []
for d, _, fs in os.walk(root):
    if 'node_modules' in d or '/.' in d: continue
    for f in fs: files.append(os.path.relpath(os.path.join(d, f), root))
moves = {f: mapped(f) for f in files}
imp = re.compile(r"""((?:import|export)\s[^'"]*?from\s*|import\s*\(?\s*)(['"])(\.{1,2}/[^'"]+)\2""")
for old, new in moves.items():
    if not old.endswith('.js'): continue
    src = open(os.path.join(root, old)).read()
    def fix(m):
        tgt_old = os.path.normpath(os.path.join(os.path.dirname(old), m.group(3)))
        tgt_new = moves.get(tgt_old, tgt_old)
        rel = os.path.relpath(tgt_new, os.path.dirname(new) or '.')
        if not rel.startswith('.'): rel = './' + rel
        return m.group(1) + m.group(2) + rel + m.group(2)
    out = imp.sub(fix, src)
    if out != src: open(os.path.join(root, old), 'w').write(out)
for old, new in moves.items():
    if old != new:
        os.makedirs(os.path.join(root, os.path.dirname(new)), exist_ok=True)
        shutil.move(os.path.join(root, old), os.path.join(root, new))
for d, _, _ in sorted(os.walk(os.path.join(root, 'src')), reverse=True): os.rmdir(d)
if os.path.isdir(os.path.join(root, 'styles')): os.rmdir(os.path.join(root, 'styles'))
h = os.path.join(root, 'index.html'); s = open(h).read()
s = s.replace('src/main.js', 'js/main.js').replace('styles/', 'css/'); open(h, 'w').write(s)
print('moved', sum(1 for o, n in moves.items() if o != n))
