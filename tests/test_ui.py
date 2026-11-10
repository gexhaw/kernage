#!/usr/bin/env python3
"""UI tests in headless Chromium (desktop 1440×900 and phone 390×844): every tab opens without script errors and
without horizontal overflow, v4 features work through the interface, and the ZIP from "Download font" holds valid fonts."""
import io, os, sys, zipfile, tempfile, ots
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(R, 'dist', 'kernage_test.html')
fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)
proj = lambda pg: (pg.wait_for_timeout(900), pg.evaluate("(()=>{const id=localStorage.getItem('litera.cur');return JSON.parse(localStorage.getItem('litera.p.'+id))})()"))[1]
OVER = "(()=>{const o=[];for(const v of document.querySelectorAll('.view:not([hidden])'))if(v.scrollWidth>v.clientWidth+2)o.push(v.id);if(document.documentElement.scrollWidth>innerWidth+1)o.push('page');return o})()"

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, mob in [('desktop', {'width': 1440, 'height': 900}, False), ('phone', {'width': 390, 'height': 844}, True)]:
        print(name)
        for lang in ('en', 'ru', 'es'):
            ctx = b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            pg.add_init_script(f"localStorage.setItem('litera.lang','{lang}')"); pg.goto(PAGE); pg.wait_for_timeout(1500)
            over = []
            for t in ('glyphs', 'editor', 'kern', 'fx', 'preview', 'font'):
                pg.click(f'nav.tabs button[data-tab={t}]'); pg.wait_for_timeout(400); over += [t + ':' + x for x in pg.evaluate(OVER)]
            check(not errs and not over, f'{lang}: all tabs open, no errors {errs[:1]}, no overflow {over[:3]}')
            ctx.close()
    # feature walk-through (desktop)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.add_init_script("localStorage.setItem('litera.lang','en')")
    pg.goto(PAGE); pg.wait_for_timeout(1500)
    pg.click('#onbTour'); pg.keyboard.press('ArrowRight'); n = pg.inner_text('#tourN'); src = pg.get_attribute('#tourImg', 'src') or ''
    check(n.startswith('2 /') and src.startswith('data:image/webp'), f'picture tour opens and pages ({n})'); pg.keyboard.press('Escape')
    pg.click('nav.tabs button[data-tab=glyphs]'); pg.fill('#gsearch', 'n'); pg.click('.gcard[data-k="n"]'); pg.wait_for_timeout(300)
    pg.fill('#pLsbF', '=H'); pg.press('#pLsbF', 'Enter'); P = proj(pg)
    lsb = lambda g: min(n['x'] for c in g['contours'] for n in c)
    check(lsb(P['glyphs']['n']) == lsb(P['glyphs']['H']), 'metric formula =H sets the left sidebearing of n')
    pg.fill('#jump', 'H'); pg.press('#jump', 'Enter'); pg.fill('#pLsb', str(lsb(P['glyphs']['H']) + 20)); pg.press('#pLsb', 'Enter'); P = proj(pg)
    check(lsb(P['glyphs']['n']) == lsb(P['glyphs']['H']), 'changing H updates n through the formula')
    pg.fill('#jump', 'a'); pg.press('#jump', 'Enter'); pg.click('#bAnchAuto'); P = proj(pg)
    check(set(P['glyphs']['a'].get('anchors', {})) >= {'top', 'bottom'}, 'auto anchors on a')
    pg.click('#layerSeg button[data-layer=mB]'); pg.wait_for_timeout(300); P = proj(pg)
    check(len(P['glyphs']['a'].get('mB', {}).get('contours', [])) == len(P['glyphs']['a']['contours']), 'Bold master generated for a')
    pg.click('#layerSeg button[data-layer=main]')
    pg.click('nav.tabs button[data-tab=glyphs]'); pg.fill('#gsearch', ''); pg.click('#bOT'); pg.click('#bCombMake'); pg.fill('#caltText', 'f [a] > b'); pg.wait_for_timeout(200)
    check('1' in pg.inner_text('#caltStat'), 'calt rule accepted: ' + pg.inner_text('#caltStat')); pg.keyboard.press('Escape')
    pg.click('#bSelMode'); pg.click('.gcard[data-k="A"]'); pg.click('.gcard[data-k="B"]'); P0 = proj(pg)
    pg.fill('#bkDy', '10'); pg.click('#bkMove'); P = proj(pg)
    dy = min(n['y'] for c in P['glyphs']['B']['contours'] for n in c) - min(n['y'] for c in P0['glyphs']['B']['contours'] for n in c)
    check(dy == 10, 'bulk move shifts selected glyphs'); pg.click('#bulkNone')
    pg.click('nav.tabs button[data-tab=font]')
    for i in ('#xOtf', '#xTtf', '#xWoff', '#xHint', '#xVar', '#xColor'):
        if not pg.is_checked(i): pg.check(i)
    with pg.expect_download(timeout=60000) as d: pg.click('#bExport2')
    z = zipfile.ZipFile(io.BytesIO(open(d.value.path(), 'rb').read())); tmp = tempfile.mkdtemp(); okf = []
    for nm in z.namelist():
        if nm.rsplit('.', 1)[-1] in ('otf', 'ttf', 'woff'):
            fn = os.path.join(tmp, os.path.basename(nm)); open(fn, 'wb').write(z.read(nm)); okf.append((nm, ots.sanitize(fn, os.devnull, capture_output=True).returncode == 0))
    check(len(okf) >= 4 and all(o for _, o in okf), f'downloaded ZIP: {len(okf)} fonts, OTS {"all valid" if all(o for _, o in okf) else okf}')
    check(not errs, f'no script errors during the walk-through {errs[:2]}')
    b.close()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED'))
sys.exit(1 if fails else 0)
