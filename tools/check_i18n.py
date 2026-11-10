#!/usr/bin/env python3
"""List interface strings (T('…') calls and translatable template text) that have no English/Spanish translation in src/i18n.json."""
import json, os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = ''.join(open(os.path.join(R, 'src', f), encoding='utf-8').read() + '\n' for f in ('app.js', 'app_ext.js', 'app_ext2.js'))
tpl = open(os.path.join(R, 'src', 'template.html'), encoding='utf-8').read()
keys = set(re.findall(r"\bT\('((?:[^'\\]|\\.)+)'", src)) | set(re.findall(r'\bT\("((?:[^"\\]|\\.)+)"', src))
body = re.sub(r'<(script|style)[^>]*>[\s\S]*?</\1>', '', tpl)
for m in re.finditer(r'>([^<>]*[А-Яа-яЁё][^<>]*)<', body): keys.add(' '.join(m.group(1).split()))
for m in re.finditer(r'(?:title|aria-label|placeholder)="([^"]*[А-Яа-яЁё][^"]*)"', body): keys.add(m.group(1))
d = json.load(open(os.path.join(R, 'src', 'i18n.json'), encoding='utf-8'))
IGNORE = {'Атака Тогда Гора Ягоды', 'ТАРАКАН ГОРА ПАРК ГАЛА'}  # Cyrillic kerning test strings, intentionally untranslated
miss = sorted(k for k in keys if k.strip() and k not in d and k not in IGNORE)
print(len(keys), 'strings,', len(miss), 'missing'); [print('  ', k) for k in miss]
sys.exit(1 if miss else 0)
