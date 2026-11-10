#!/usr/bin/env python3
"""Export tests: builds OTF, hinted TTF, WOFF, variable and colour fonts from the sample project inside headless Chromium,
then checks them with OTS (the sanitizer Chrome and Firefox use), fontTools, HarfBuzz (the shaper in Chrome, Firefox, Android)
and FreeType (the rasterizer on Android/Linux, running the TrueType hinting bytecode)."""
import base64, os, sys, tempfile
import ots, uharfbuzz as hb, freetype
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(R, 'dist', 'kernage_test.html')
OUT = tempfile.mkdtemp(prefix='kernage-test-')
fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

JS = r'''async () => {
  const L = window.Litera, id = localStorage.getItem('litera.cur'), f = JSON.parse(localStorage.getItem('litera.p.' + id));
  f.kgroups = L.autoGroups(f); L.collapseKerning(f); const flat = L.flatKerning(f);
  L.autoAnchors(f, null, true); const comb = L.makeCombining(f);
  f.glyphs['alt:a:ss01'] = { u: null, name: 'a.ss01', adv: f.glyphs.o.adv, contours: L.shiftC(f.glyphs.o.contours, 0, 0) }; f.order.push('alt:a:ss01');
  f.calt = 'f [a] > a.ss01\nbroken line';
  f.glyphs.O.contours.forEach(c => c.forEach(n => n.k = 2));
  const o = { kerning: flat, kerningRaw: f.kerning, kgroups: f.kgroups };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
  const plan = L.colorPlan(f), fc = Object.assign({}, f, { glyphs: Object.assign({}, f.glyphs, plan.extra), order: f.order.concat(Object.keys(plan.extra)) });
  const oc = Object.assign({}, o, { extraTables: index => { const bases = []; for (const k in plan.map) { if (index[k] == null) continue; const layers = plan.map[k].map(l => ({ gid: index[l.key], pal: l.pal })).filter(l => l.gid != null); if (layers.length) bases.push({ gid: index[k], layers }); } return [{ tag: 'COLR', data: L.makeCOLR(bases) }, { tag: 'CPAL', data: L.makeCPAL(f.palette) }]; } });
  const color = L.buildFont(fc, oc);
  const otf = L.buildFont(f, o), ttf = L.buildTTF(f, Object.assign({ hint: true }, o)), vf = L.buildVarTTF(f, o);
  const woff = await L.toWOFF(otf.buffer);
    const pairs = {}; let n = 0; for (const k in flat) if (n++ % 61 === 0) pairs[k] = flat[k];
  return { otf: b64(otf.buffer), ttf: b64(ttf.buffer), vf: b64(vf.buffer), woff: b64(woff), color: b64(color.buffer), pairs, comb, calt: otf.caltErrors };
}'''

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(PAGE); pg.wait_for_timeout(2000)
    r = pg.evaluate(JS); b.close()
check(not errs, 'no page errors ' + str(errs[:2]))
files = {}
for k in ('otf', 'ttf', 'vf', 'woff', 'color'):
    fn = os.path.join(OUT, 'test.' + k); open(fn, 'wb').write(base64.b64decode(r[k])); files[k] = fn
    res = ots.sanitize(fn, os.devnull, capture_output=True)
    check(res.returncode == 0, f'OTS accepts .{k} ({os.path.getsize(fn)} bytes) {res.stderr.decode()[:200]}')

def shape(path, text, feats=None):
    face = hb.Face(hb.Blob.from_file_path(path)); font = hb.Font(face); buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(font, buf, feats or {})
    return [(font.glyph_to_string(i.codepoint), q.x_advance, q.x_offset, q.y_offset) for i, q in zip(buf.glyph_infos, buf.glyph_positions)]

# kerning: HarfBuzz advance of the left glyph = advance + kerning value, in OTF and TTF
t = TTFont(files['otf']); cmap = t.getBestCmap(); hm = t['hmtx']; bad = tot = 0
for k, v in r['pairs'].items():
    l, rr = k.split('\t')
    if len(l) > 1 or len(rr) > 1 or ord(l) not in cmap or ord(rr) not in cmap: continue
    for fn in (files['otf'], files['ttf']):
        tot += 1; bad += shape(fn, l + rr)[0][1] != hm[cmap[ord(l)]][0] + v
check(tot > 100 and bad == 0, f'kerning matches in HarfBuzz ({tot} pairs, {bad} wrong)')
# mark positioning: combining acute is moved over the base, stacked marks go higher
s1 = shape(files['otf'], 'x\u0301'); s2 = shape(files['otf'], 'n\u0308\u0301')
check(len(r['comb']) > 0, f'combining marks created: {len(r["comb"])}')
check(len(s1) == 2 and s1[1][1] == 0 and s1[1][2] != 0, f'mark attaches to base: {s1}')
check(len(s2) == 3 and s2[2][3] > s2[1][3], f'mkmk stacks marks: {s2}')
# calt
check(shape(files['otf'], 'fa')[1][0] == 'a.ss01', 'calt replaces a after f')
check(shape(files['otf'], 'ba')[1][0] == 'a', 'calt keeps a after b')
check(shape(files['otf'], 'fa', {'calt': False})[1][0] == 'a', 'calt can be switched off')
check(len(r['calt']) == 1, f'calt reports the broken rule: {r["calt"]}')
# TrueType hinting
tt = TTFont(files['ttf'])
check(all(x in tt for x in ('cvt ', 'prep', 'gasp')), 'TTF has cvt/prep/gasp')
g = tt['glyf']['H']; check(bool(getattr(g, 'program', None)) and len(g.program.getBytecode()) > 0, 'H carries hinting instructions')
face = freetype.Face(files['ttf']); okr = 0
for size in (9, 11, 13, 16):
    face.set_pixel_sizes(0, size)
    for ch in 'HOnoaeg':
        face.load_char(ch, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_MONO); bm = face.glyph.bitmap; okr += bm.rows > 0 and bm.width > 0
check(okr == 28, f'FreeType runs the hints and rasterizes 7 glyphs at 4 sizes ({okr}/28)')
face.set_pixel_sizes(0, 12); face.load_char('H', freetype.FT_LOAD_DEFAULT); top = face.glyph.metrics.horiBearingY / 64
face.load_char('E', freetype.FT_LOAD_DEFAULT); check(top == face.glyph.metrics.horiBearingY / 64, f'cap height snaps to the same pixel for H and E at 12px ({top}px)')
# variable font
v = TTFont(files['vf']); ax = v['fvar'].axes[0]
check(ax.axisTag == 'wght' and ax.minValue < ax.defaultValue < ax.maxValue, f'VF wght axis {ax.minValue}..{ax.defaultValue}..{ax.maxValue}')
check('gvar' in v and 'STAT' in v and len(v['fvar'].instances) >= 3, 'VF has gvar, STAT and named instances')
# colour layers
o = TTFont(files['color']); check('COLR' in o and o['COLR'].ColorLayers.get('O') and 'CPAL' in o, 'colour font: COLR/CPAL present and O has a colour layer')
# import: the exported fonts come back with the same outlines and kerning, also from WOFF2
tw = TTFont(files['ttf']); tw.flavor = 'woff2'; files['woff2'] = os.path.join(OUT, 'test.woff2'); tw.save(files['woff2'])
IMP = r'''b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  const f = window.Litera.importOT(u.buffer); return { order: f.order, glyphs: f.glyphs, flat: window.Litera.flatKerning(f), stats: f.__stats }; }'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.goto(PAGE); pg.wait_for_timeout(1500)
    imp = {k: pg.evaluate(IMP, base64.b64encode(open(files[k], 'rb').read()).decode()) for k in ('ttf', 'woff2', 'otf')}
    b.close()
check(imp['woff2']['stats']['woff2'] and imp['woff2']['order'] == imp['ttf']['order'] and all(imp['woff2']['glyphs'][k] == imp['ttf']['glyphs'][k] for k in imp['ttf']['order']), 'WOFF2 import gives the same outlines as TTF')
check(imp['woff2']['flat'] == imp['ttf']['flat'], 'WOFF2 import gives the same kerning as TTF')
check(imp['otf']['stats']['alts'] >= 1 and imp['otf']['stats']['ligas'] >= 1, f"alternates and ligatures come back from GSUB: {imp['otf']['stats']}")
want = {k: v for k, v in r['pairs'].items()}; got = imp['otf']['flat']; miss = [k for k, v in want.items() if '\t' in k and got.get(k, 0) != v and all(len(x) == 1 for x in k.split('\t'))]
check(not miss, f'kerning comes back from GPOS ({len(want)} sampled pairs, {len(miss)} differ {miss[:3]})')
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED'), '· fonts in', OUT)
sys.exit(1 if fails else 0)
