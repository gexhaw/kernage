#!/usr/bin/env python3
"""Build Kernage: src/ + assets/ + vendor/ -> dist/kernage.html (single file), dist/kernage_test.html, dist/kernage-pwa.zip.
Usage: python3 tools/build.py   (needs Python 3.8+ and Node.js 16+; no network)"""
import json, os, shutil, subprocess, sys, zipfile
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(R, *a)
rd = lambda f: open(p(f), encoding='utf-8').read()

def i18n_js():
    d = json.loads(rd('src/i18n.json'))
    return 'window.LITERA_I18N = ' + json.dumps(d, ensure_ascii=False) + ';\n'

def build():
    t = rd('src/template.html')
    app = rd('src/app.js').replace('/*EXT*/', rd('src/app_ext.js') + '\n' + rd('src/app_ext2.js'))
    parts = [('/*FONTS*/', rd('assets/fonts.css')), ('/*OTLIB*/', rd('vendor/opentype.min.js')), ('/*PCLIB*/', rd('vendor/polygon-clipping.umd.min.js')),
             ('/*CORE*/', rd('src/core.js')), ('/*CORE2*/', rd('src/core2.js')), ('/*CORE3*/', rd('src/core3.js')), ('/*CORE4*/', rd('src/core4.js')), ('/*BROTLI*/', rd('vendor/brotli.min.js')), ('/*CORE5*/', rd('src/core5.js')),
             ('/*FX*/', rd('src/fx.js')), ('/*I18N*/', i18n_js()), ('/*TOUR*/', rd('assets/tour.js')), ('/*APP*/', app)]
    for k, v in parts:
        assert k in t, 'placeholder missing: ' + k
        t = t.replace(k, v.replace('</script', '<\\/script'), 1)
    os.makedirs(p('dist'), exist_ok=True)
    pre, post = p('dist', '_pre.html'), p('dist', '_post.html')
    open(pre, 'w', encoding='utf-8').write(t)
    subprocess.run(['node', p('tools', 'wrapjs.js'), pre, post], check=True)   # short lines + syntax check of every <script>
    t = open(post, encoding='utf-8').read(); os.remove(pre); os.remove(post)
    open(p('dist', 'kernage.html'), 'w', encoding='utf-8').write(t)
    sk = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'
    open(p('dist', 'kernage_test.html'), 'w', encoding='utf-8').write(sk + t + '</body></html>')
    # PWA kit
    pw = p('dist', 'kernage-pwa'); os.makedirs(pw, exist_ok=True)
    head = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="theme-color" content="#2D43D2"><meta name="description" content="Kernage — font editor in the browser. Works offline.">'
            '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">'
            '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><script>window.LITERA_PWA=true</script>'
            '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>')
    open(os.path.join(pw, 'index.html'), 'w', encoding='utf-8').write(head + t + '</body></html>')
    for f in os.listdir(p('assets', 'pwa')): shutil.copy(p('assets', 'pwa', f), os.path.join(pw, f))
    with zipfile.ZipFile(p('dist', 'kernage-pwa.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(pw)): z.write(os.path.join(pw, f), 'kernage/' + f)
    print('dist/kernage.html', len(t.encode()), 'bytes')

if __name__ == '__main__':
    build()
