#!/usr/bin/env python3
"""Step 1 of the picture tour: screenshot the built app (dist/kernage_test.html) into build/tour/*.png."""
import os
from playwright.sync_api import sync_playwright
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(R,'build','tour')+'/'; os.makedirs(OUT,exist_ok=True)
def fresh(b, w=1280, h=800, mob=False, dark=False):
    ctx=b.new_context(viewport={'width':w,'height':h},has_touch=mob,is_mobile=mob,device_scale_factor=2 if mob else 1.5, color_scheme='dark' if dark else 'light')
    pg=ctx.new_page(); pg.add_init_script("localStorage.setItem('litera.lang','en');localStorage.setItem('litera.onb','1')")
    pg.goto('file://'+os.path.join(R,'dist','kernage_test.html')); pg.wait_for_timeout(1500); return ctx,pg
def tab(pg,t): pg.click(f'nav.tabs button[data-tab={t}]'); pg.wait_for_timeout(600)
def glyph(pg,k): pg.fill('#jump',k); pg.press('#jump','Enter'); pg.wait_for_timeout(400)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=fresh(b)
    # 1 draw: editor 'R' select all nodes
    tab(pg,'editor'); glyph(pg,'R'); pg.click('#cv',position={'x':10,'y':10}); pg.keyboard.press('Control+a'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'draw.png',clip={'x':0,'y':56,'width':900,'height':562})
    # 2 grid
    tab(pg,'glyphs'); pg.screenshot(path=OUT+'grid.png',clip={'x':0,'y':56,'width':1000,'height':625})
    # 3 anchors: auto anchors on 'a' then show á composite? show a with anchors
    tab(pg,'editor'); glyph(pg,'a'); pg.click('#bAnchAuto'); pg.wait_for_timeout(300); pg.click('#cv',position={'x':10,'y':10}); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('#anchList').closest('details').open=true; document.querySelector('#anchList').scrollIntoView()")
    pg.screenshot(path=OUT+'anchors.png',clip={'x':250,'y':56,'width':1030,'height':644})
    # 4 layers: Bold master of n
    glyph(pg,'n'); pg.click('#layerSeg button[data-layer=mB]'); pg.wait_for_timeout(400); pg.evaluate("document.querySelector('#layerBox').scrollIntoView()")
    pg.screenshot(path=OUT+'layers.png',clip={'x':250,'y':56,'width':1030,'height':644}); pg.click('#layerSeg button[data-layer=main]')
    # 5 kerning
    tab(pg,'kern'); pg.click('#bAutoKern'); pg.wait_for_timeout(2500); pg.screenshot(path=OUT+'kern.png',clip={'x':0,'y':56,'width':1030,'height':644})
    # 6 fx
    tab(pg,'fx'); pg.uncheck('#fxPts') if pg.is_checked('#fxPts') else None; pg.select_option('#fxPreset', index=2); pg.wait_for_timeout(1500); pg.screenshot(path=OUT+'fx.png',clip={'x':0,'y':56,'width':1000,'height':625})
    # back fx off for others
    pg.select_option('#fxPreset', index=4); pg.wait_for_timeout(1200); pg.screenshot(path=OUT+'fx2.png',clip={'x':0,'y':56,'width':1000,'height':625})
    pg.click('#fxReset'); pg.wait_for_timeout(500)
    # 7 preview with weight
    tab(pg,'font'); 
    if not pg.is_checked('#xVar'): pg.check('#xVar')
    tab(pg,'preview'); pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT+'preview.png',clip={'x':0,'y':56,'width':1190,'height':744})
    # 8 poster
    pg.click('#pvPoster'); pg.wait_for_timeout(1500); pg.locator('#mPoster .mbox').screenshot(path=OUT+'poster.png'); pg.keyboard.press('Escape')
    # 9 bulk
    tab(pg,'glyphs'); pg.click('#bSelMode'); 
    for k in 'ABCDEFG': pg.click(f'.gcard[data-k="{k}"]')
    pg.wait_for_timeout(300); pg.screenshot(path=OUT+'bulk.png',clip={'x':0,'y':56,'width':1190,'height':744}); pg.click('#bulkNone')
    # 10 export
    tab(pg,'font'); pg.evaluate("document.querySelector('#xOtf').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'export.png',clip={'x':0,'y':56,'width':1190,'height':744})
    # 11 OT modal
    tab(pg,'glyphs'); pg.click('#bOT'); pg.wait_for_timeout(300); pg.fill('#caltText','f [a] > a.ss01'); pg.locator('#mOT .mbox').screenshot(path=OUT+'ot.png'); pg.keyboard.press('Escape')
    ctx.close()
    # mobile
    for t,name in [('editor','m1'),('fx','m2'),('kern','m3')]:
        ctx,pg=fresh(b,390,844,True, dark=(name=='m2'))
        tab(pg,t)
        if t=='fx': pg.evaluate("document.querySelector('#fxPreset').value=document.querySelector('#fxPreset').options[2].value; document.querySelector('#fxPreset').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(1500)
        pg.screenshot(path=OUT+name+'.png'); ctx.close()
    b.close()
