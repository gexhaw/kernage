/* ======================= v4: LAYERS & MASTERS ======================= */
ed.layer = 'main';
function layerOf(g) {
  if (!g || !ed.layer || ed.layer === 'main') return g;
  let o = g[ed.layer];
  if (!o || Object.getPrototypeOf(o) !== g) {
    let src = o; if (!src && ed.layer !== 'bg' && g.contours.length && !g.contours.every(L.isComp)) { src = autoMasterOf(g, ed.layer); if (g === font.glyphs[cur]) setTimeout(() => touch(cur), 0); }
    src = src || { contours: [], adv: g.adv }; o = Object.create(g); o.contours = src.contours || []; o.adv = src.adv == null ? g.adv : src.adv; g[ed.layer] = o; }
  return o;
}
const ukey = () => ed.layer && ed.layer !== 'main' ? cur + '|' + ed.layer : cur;
function setLayer(l) {
  endPen(); ed.layer = l; ed.sel.clear(); $$('#layerSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === l)));
  if (l === 'mL' || l === 'mB') { const g = font.glyphs[cur]; if (!g[l] || !(g[l].contours || []).length) makeAutoMaster(g, l, true); }
  edDraw(); refreshPanel();
}
$$('#layerSeg button').forEach(b => b.addEventListener('click', () => setLayer(b.dataset.layer)));
function autoMasterOf(g, l) { const o = varOpts(), w = l === 'mL' ? o.light : o.bold, m = L.masterOf({ contours: g.contours.map(L.cloneC), adv: g.adv }, w, 0.55, true); m.contours.forEach(L.roundC); return { contours: m.contours, adv: Math.round(m.adv) }; }
function makeAutoMaster(g, l, silent) {
  if (!g.contours.length) return; const m = autoMasterOf(g, l); const lo = layerOf(g); lo.contours = m.contours; lo.adv = m.adv; touch(cur); if (!silent) toast(T('Мастер создан из основного рисунка — теперь его можно править'));
}
function drawUnderLayer(g) {
  const base = font.glyphs[cur]; if (!base) return;
  if (ed.layer === 'main') { const bgc = base.bg && base.bg.contours; if (bgc && bgc.length) { cx.fillStyle = COL.guide; cx.globalAlpha = .35; cx.fill(glyphPath({ contours: bgc }, toS)); cx.globalAlpha = 1; } return; }
  if (!base.contours.length) return; const p = glyphPath(base, toS); cx.strokeStyle = COL.mute; cx.globalAlpha = .55; cx.lineWidth = 1; cx.setLineDash([3, 3]); cx.stroke(p); cx.setLineDash([]); cx.globalAlpha = 1;
}
function renderLayerUI() {
  const box = $('#layerBox'), l = ed.layer, g = font.glyphs[cur]; box.hidden = l === 'main';
  const refBox = $('#refList') && $('#refList').closest('details'); if (refBox) refBox.hidden = l !== 'main';
  if (l === 'main') return;
  const lo = layerOf(g), info = $('#layerInfo');
  if (l === 'bg') { info.textContent = T('Фон виден под основным рисунком. Держите здесь эскиз или запасной вариант формы и меняйте их местами.'); $('#bLayerAuto').hidden = true; $('#bLayerSwap').hidden = false; }
  else { const c = L.compatible(g.contours, lo.contours); $('#bLayerAuto').hidden = false; $('#bLayerSwap').hidden = true;
    info.textContent = !lo.contours.length ? T('Мастер пуст — создайте его автоматически или скопируйте основной') : c.ok ? T('Совместим с основным: попадёт в вариативный шрифт') : T('Несовместим с основным ({0}) — при экспорте будет использован автоматический мастер', c.why[0] === 'contours' ? T('контуров {0} и {1}', c.why[2], c.why[1]) : c.why[0] === 'nodes' ? T('в контуре {0} точек {1} и {2}', c.why[1], c.why[3], c.why[2]) : T('в контуре {0} другой тип сегмента {1}', c.why[1], c.why[2]));
    info.style.color = lo.contours.length && !c.ok ? 'var(--neg)' : '';
  }
}
$('#bLayerFromMain').addEventListener('click', () => { const g = font.glyphs[cur], lo = layerOf(g); pushUndo(); lo.contours = g.contours.map(L.cloneC); lo.adv = g.adv; changed(); });
$('#bLayerSwap').addEventListener('click', () => { const g = font.glyphs[cur], lo = layerOf(g); const a = g.contours, b = lo.contours; g.contours = b.map(L.cloneC); lo.contours = a.filter(c => !L.isComp(c)).map(L.cloneC); delete g.refs; undo.s(cur).u.length = 0; touch(cur); propagate(cur); edDraw(); refreshPanel(); toast(T('Основной рисунок и фон поменялись местами')); });
$('#bLayerAuto').addEventListener('click', () => { pushUndo(); makeAutoMaster(font.glyphs[cur], ed.layer); changed(); });
$('#bLayerClear').addEventListener('click', () => { pushUndo(); curG().contours = []; changed(); });

/* ======================= v4: ANCHORS ======================= */
function hitAnchor(sx, sy) { if (ed.layer !== 'main') return null; const A = font.glyphs[cur].anchors; if (!A) return null; let best = null, bd = 10; for (const n in A) { const p = toS(A[n][0], A[n][1]), d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = n; } } return best; }
function startAnchorDrag(name, fx, fy) { const A = font.glyphs[cur].anchors; pushUndoAnch(); ed.drag = { type: 'anchor', name, start: [fx, fy], o: A[name].slice(), moved: false }; }
function moveAnchorDrag(fx, fy, shift) { const dr = ed.drag, A = font.glyphs[cur].anchors; let dx = fx - dr.start[0], dy = fy - dr.start[1]; if (shift) [dx, dy] = angleSnapV(dx, dy); A[dr.name] = [snapV(dr.o[0] + dx), snapV(dr.o[1] + dy)]; dr.moved = true; edDraw(); }
function endAnchorDrag(dr) { if (!dr.moved) dropUndo(); if (dr.moved) { touch(cur); fontDirty = true; renderAnchors(); } edDraw(); }
function pushUndoAnch() { pushUndo(); }
function drawAnchors() {
  if (ed.layer !== 'main') return; const A = font.glyphs[cur].anchors; if (!A) return;
  cx.font = "10px 'IBM Plex Mono', monospace"; cx.textBaseline = 'bottom';
  for (const n in A) { const p = toS(A[n][0], A[n][1]), r = 6, mark = n[0] === '_'; cx.fillStyle = mark ? COL.neg : COL.accent; cx.beginPath(); cx.moveTo(p[0], p[1] - r); cx.lineTo(p[0] + r, p[1]); cx.lineTo(p[0], p[1] + r); cx.lineTo(p[0] - r, p[1]); cx.closePath(); cx.globalAlpha = .9; cx.fill(); cx.globalAlpha = 1; cx.fillText(n, p[0] + 8, p[1] - 4); }
}
function renderAnchors() {
  const box = $('#anchList'); if (!box) return; box.textContent = ''; const g = font.glyphs[cur], A = g.anchors || {};
  for (const n of Object.keys(A).sort()) {
    const row = document.createElement('div'); row.className = 'anrow'; const b = document.createElement('b'); b.textContent = n;
    const mk = i => { const inp = document.createElement('input'); inp.type = 'number'; inp.value = Math.round(A[n][i]); inp.setAttribute('aria-label', n + (i ? ' Y' : ' X')); inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isFinite(v)) return; pushUndo(); A[n][i] = Math.round(v); touch(cur); fontDirty = true; edDraw(); }); return inp; };
    const del = mkBtn('×', () => { pushUndo(); delete A[n]; if (!Object.keys(A).length) delete g.anchors; touch(cur); fontDirty = true; renderAnchors(); edDraw(); }); del.title = T('Удалить якорь'); del.setAttribute('aria-label', T('Удалить якорь'));
    row.append(b, mk(0), mk(1), del); box.appendChild(row);
  }
}
$('#bAnchAdd').addEventListener('click', () => { pushUndo(); const g = font.glyphs[cur], n = $('#anchName').value, bb = L.bounds(g.contours) || { x0: 0, x1: g.adv, y0: 0, y1: font.info.capHeight }; g.anchors = g.anchors || {}; const cxm = Math.round((bb.x0 + bb.x1) / 2); g.anchors[n] = n.includes('bottom') ? [cxm, n[0] === '_' ? bb.y1 : bb.y0] : [cxm, n[0] === '_' ? bb.y0 : bb.y1 + 50]; touch(cur); fontDirty = true; renderAnchors(); edDraw(); });
$('#bAnchAuto').addEventListener('click', () => { const a = L.autoAnchorsFor(font, cur); if (!a) { toast(T('Для этого глифа якоря не нужны')); return; } pushUndo(); font.glyphs[cur].anchors = a; touch(cur); fontDirty = true; renderAnchors(); edDraw(); toast(T('Якоря расставлены')); });
$('#bAnchAll').addEventListener('click', () => { const n = L.autoAnchors(font, null, false); fontDirty = true; touch(); toast(T('Якоря расставлены у глифов: {0}', n)); });
$('#bCombMake').addEventListener('click', () => { L.autoAnchors(font, null, false); const m = L.makeCombining(font); m.forEach(k => { dirtyCards.add(k); gver[k] = (gver[k] || 0) + 1; }); buildGrid(); touch(); fontDirty = true; toast(m.length ? T('Создано комбинируемых знаков: {0}. Теперь a + ́ даёт á в любом сочетании', m.length) : T('Комбинируемые знаки уже есть или не нарисованы надстрочные знаки')); });

/* ======================= v4: CALT ======================= */
function caltCheck() {
  const r = L.parseCalt(font.calt || '', font), st = $('#caltStat'); if (!st) return;
  const why = { syntax: T('нет стрелки >'), target: T('нет буквы в [скобках]'), glyph: T('нет глифа'), alt: T('нет альтернативы') };
  st.textContent = !(font.calt || '').trim() ? '' : r.errors.length ? r.errors.map(e => T('Строка {0}: {1}', e[0], why[e[1]] + (e[2] ? ' ' + e[2] : ''))).join(' · ') : T('Правил: {0}, всё в порядке', r.rules.length);
  st.style.color = r.errors.length ? 'var(--neg)' : '';
}
$('#caltText').addEventListener('input', e => { font.calt = e.target.value; touch(); fontDirty = true; caltCheck(); });
$('#bOT').addEventListener('click', () => { $('#caltText').value = font.calt || ''; caltCheck(); });

/* ======================= v4: METRIC FORMULAS ======================= */
function evalMF(expr, side) {
  const m = String(expr || '').trim().match(/^=\s*(\|)?\s*(-?\d+(?:\.\d+)?|\S)\s*(?:([+\-*/])\s*(-?\d+(?:\.\d+)?))?\s*$/u); if (!m) return null;
  let v; if (/^-?\d/.test(m[2]) && !font.glyphs[m[2]]) v = parseFloat(m[2]); else { const rg = font.glyphs[m[2]]; if (!rg) return null; const bb = L.bounds(rg.contours); if (!bb) return null; const s = m[1] ? (side === 'l' ? 'r' : 'l') : side; v = s === 'l' ? bb.x0 : rg.adv - bb.x1; }
  if (m[3]) { const k = parseFloat(m[4]); v = m[3] === '+' ? v + k : m[3] === '-' ? v - k : m[3] === '*' ? v * k : (k ? v / k : v); }
  return Math.round(v);
}
const mfRef = e => { const m = String(e || '').match(/^=\s*\|?\s*(\S)/u); return m ? m[1] : null; };
function applyMF(k) {
  const g = font.glyphs[k]; if (!g || !g.mf || !g.contours.length) return false; let ch = false;
  const l = g.mf.l ? evalMF(g.mf.l, 'l') : null; if (l != null) { const bb = L.bounds(g.contours), d = l - Math.round(bb.x0); if (d) { L.translate(g.contours, d, 0); if (g.refs) g.refs.forEach(r => r.x += d); g.adv += d; ch = true; } }
  const r = g.mf.r ? evalMF(g.mf.r, 'r') : null; if (r != null) { const bb = L.bounds(g.contours), na = Math.round(bb.x1 + r); if (na !== g.adv) { g.adv = na; ch = true; } }
  return ch;
}
function mfDependents(k) { return font.order.filter(x => { const g = font.glyphs[x]; return g && g.mf && (mfRef(g.mf.l) === k || mfRef(g.mf.r) === k); }); }
function syncFormulas() { const g = font.glyphs[cur], f = g.mf || {}; for (const [id, s] of [['#pLsbF', 'l'], ['#pRsbF', 'r']]) { const el = $(id); if (document.activeElement !== el) el.value = f[s] || ''; el.disabled = ed.layer !== 'main'; const ok = !f[s] || evalMF(f[s], s) != null; el.style.borderColor = ok ? '' : 'var(--neg)'; } }
for (const [id, s] of [['#pLsbF', 'l'], ['#pRsbF', 'r']]) $(id).addEventListener('change', e => {
  const g = font.glyphs[cur], v = e.target.value.trim(); g.mf = g.mf || {}; if (v && !v.startsWith('=')) e.target.value = '=' + v;
  if (e.target.value.trim()) g.mf[s] = e.target.value.trim(); else delete g.mf[s]; if (!g.mf.l && !g.mf.r) delete g.mf;
  if (g.mf && g.mf[s] && evalMF(g.mf[s], s) == null) { toast(T('Формула не распознана: пример =O, =|H или =O+10')); syncFormulas(); return; }
  pushUndo(); applyMF(cur); changed();
});
const _propagateRefs = propagate;
propagate = function (k, seen) { seen = seen || new Set([k]); _propagateRefs(k, seen); for (const d of mfDependents(k)) { if (seen.has(d)) continue; seen.add(d); if (applyMF(d)) { touch(d); propagate(d, seen); } } };

/* ======================= v4: BULK OPERATIONS ======================= */
const gSel = new Set(); let selMode = false;
function bulkClick(e, card) {
  if (!(selMode || e.ctrlKey || e.metaKey || e.shiftKey)) return false;
  const k = card.dataset.k; if (gSel.has(k)) gSel.delete(k); else gSel.add(k); syncBulk(); buzz(5); return true;
}
function syncBulk() {
  $$('#grid .gcard').forEach(c => c.classList.toggle('sel', gSel.has(c.dataset.k)));
  $('#bulk').hidden = !gSel.size && !selMode; $('#bulkN').textContent = T('Выбрано: {0}', gSel.size);
}
$('#bSelMode').addEventListener('click', () => { selMode = !selMode; $('#bSelMode').setAttribute('aria-pressed', String(selMode)); if (!selMode && !gSel.size) $('#bulk').hidden = true; syncBulk(); });
$('#bulkAll').addEventListener('click', () => { $$('#grid .gcard').forEach(c => { if (!c.hidden) gSel.add(c.dataset.k); }); syncBulk(); });
$('#bulkNone').addEventListener('click', () => { gSel.clear(); selMode = false; $('#bSelMode').setAttribute('aria-pressed', 'false'); syncBulk(); });
function bulkApply(fn, msg) {
  const keys = [...gSel].filter(k => font.glyphs[k]); if (!keys.length) { toast(T('Сначала выберите глифы')); return; }
  let n = 0; for (const k of keys) { const g = font.glyphs[k], s = undo.s(k); s.u.push(snapshot(g)); s.r.length = 0; if (fn(g, k) !== false) { n++; touch(k); propagate(k); } else s.u.pop(); }
  fxCache.clear(); toast(T(msg, n));
}
$('#bkMove').addEventListener('click', () => { const dx = +$('#bkDx').value || 0, dy = +$('#bkDy').value || 0; if (!dx && !dy) return; bulkApply(g => { if (!g.contours.length) return false; L.translate(g.contours.filter(c => !L.isComp(c)), dx, dy); }, 'Сдвинуто глифов: {0}'); });
$('#bkScale').addEventListener('click', () => { const s = (+$('#bkSc').value || 100) / 100; if (s === 1 || s <= 0) return; bulkApply(g => { if (!g.contours.length) return false; const own = g.contours.filter(c => !L.isComp(c)); for (const c of own) for (const n of c) { n.x = Math.round(n.x * s); n.y = Math.round(n.y * s); if (n.i) n.i = [Math.round(n.i[0] * s), Math.round(n.i[1] * s)]; if (n.o) n.o = [Math.round(n.o[0] * s), Math.round(n.o[1] * s)]; } g.adv = Math.round(g.adv * s); }, 'Отмасштабировано глифов: {0}'); });
$('#bkSide').addEventListener('click', () => { const lv = $('#bkL').value, rv = $('#bkR').value; if (lv === '' && rv === '') return; bulkApply(g => { const bb = L.bounds(g.contours); if (!bb) return false; if (lv !== '') { const d = Math.round(+lv - bb.x0); L.translate(g.contours, d, 0); if (g.refs) g.refs.forEach(r => r.x += d); g.adv += d; } if (rv !== '') { const b2 = L.bounds(g.contours); g.adv = Math.round(b2.x1 + +rv); } }, 'Отступы заданы глифам: {0}'); });
$('#bkMark').addEventListener('change', e => { const v = e.target.value; if (v === '') return; for (const k of gSel) { const g = font.glyphs[k]; if (!g) continue; if (v === '0') delete g.mark; else g.mark = +v; dirtyCards.add(k); } e.target.value = ''; touch(); drawAllCards(); applyFilter(); toast(T('Метка задана')); });
$('#bkAnch').addEventListener('click', () => { const n = L.autoAnchors(font, [...gSel], true); fontDirty = true; touch(); toast(T('Якоря расставлены у глифов: {0}', n)); });

/* ======================= v4: ILLUSTRATED TOUR ======================= */
const TOUR = [
  ['draw', 'Рисуйте буквы', 'Перо, кисть с нажимом, прямоугольник, эллипс, ластик и нож. Тяните точки и ручки, Shift привязывает к 15°, 45° и 90°. Можно обвести фото эскиза.', 'editor'],
  ['grid', 'Весь шрифт на одном экране', 'Латиница, кириллица, цифры и знаки в одной сетке. Фильтры, поиск и цветные метки статуса. Нажмите на карточку, чтобы открыть букву в редакторе.', 'glyphs'],
  ['anchors', 'Якоря и диакритика', 'Якоря top и bottom показывают, куда садятся знаки. Kernage расставляет их сам, собирает á, ё и ç, а в готовом шрифте знаки встают на любую букву.', 'editor'],
  ['layers', 'Слои и мастера толщины', 'Фон — для эскиза или запасного варианта. Мастера Light и Bold — для вариативного шрифта: создайте их автоматически и доведите руками.', 'editor'],
  ['kern', 'Кернинг', 'Автокернинг за секунду, группы, поиск проблемных пар и тестовые слова с выбранной парой. Пару можно подвинуть прямо мышью или пальцем.', 'kern'],
  ['fx', 'Разрушение', '34 эффекта: волна, плавление, сыр, решётка, пиксели и другие. Готовые и свои пресеты, анимация в GIF или видео.', 'fx'],
  ['preview', 'Предпросмотр', 'Живой текст собранным шрифтом, водопад кеглей, лигатуры, стилистические наборы и ползунок толщины вариативного шрифта.', 'preview'],
  ['poster', 'Постеры', 'Большая буква, алфавит или образец шрифта в размере поста, сторис, обложки или A4 — сразу в PNG.', 'poster'],
  ['bulk', 'Массовые правки', 'Кнопка «Выбрать» или Ctrl/⌘ + клик: сдвиг, масштаб, отступы, метки и якоря для многих глифов сразу. Формулы отступов вроде =O держат буквы согласованными.', 'glyphs'],
  ['ot', 'Возможности OpenType', 'Лигатуры, альтернативы, табличные цифры, капитель, комбинируемые знаки и контекстные замены простыми правилами.', 'ot'],
  ['export', 'Экспорт', 'OTF, TTF с хинтингом, WOFF, вариативный и цветной шрифт, UFO для Glyphs и FontLab, веб-набор с CSS.', 'font'],
  ['mobile', 'И на телефоне', 'Щипок для масштаба, лупа под пальцем, жесты отмены, работа без интернета и установка как приложение.', null],
];
let tourI = 0;
function tourShow(i) {
  const TI = window.LITERA_TOUR || {}; tourI = Math.max(0, Math.min(TOUR.length - 1, i)); const [img, h, p, go] = TOUR[tourI];
  const el = $('#tourImg'); el.src = TI[img] || ''; el.alt = T(h); $('#tourH').textContent = T(h); $('#tourP').textContent = T(p);
  $('#tourN').textContent = (tourI + 1) + ' / ' + TOUR.length; $('#tourPrev').disabled = tourI === 0; $('#tourNext').disabled = tourI === TOUR.length - 1;
  $('#tourTry').hidden = !go; $('#tourNext2').textContent = tourI === TOUR.length - 1 ? T('Начать') : T('Дальше');
  $$('#tourDots button').forEach((b, j) => b.setAttribute('aria-current', String(j === tourI)));
}
function openTour(i) {
  const d = $('#tourDots'); if (!d.children.length) TOUR.forEach((t, j) => { const b = document.createElement('button'); b.setAttribute('aria-label', T(t[1])); b.addEventListener('click', () => tourShow(j)); d.appendChild(b); });
  openModal('mTour'); tourShow(i || 0);
}
function tourKey(e) { if (e.key === 'ArrowRight') { tourShow(tourI + 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { tourShow(tourI - 1); e.preventDefault(); } }
$('#tourPrev').addEventListener('click', () => tourShow(tourI - 1));
$('#tourNext').addEventListener('click', () => tourShow(tourI + 1));
$('#tourNext2').addEventListener('click', () => { if (tourI === TOUR.length - 1) closeModal($('#mTour')); else tourShow(tourI + 1); });
$('#tourTry').addEventListener('click', () => {
  const go = TOUR[tourI][3]; closeModal($('#mTour')); if (!go) return;
  if (go === 'poster') { setTab('preview'); setTimeout(() => $('#pvPoster').click(), 50); }
  else if (go === 'ot') { setTab('glyphs'); $('#bOT').click(); }
  else setTab(go);
});
{ let sx = null, sy = 0; const f = $('#tourFig');
  f.addEventListener('pointerdown', e => { if (e.target.closest('.tnav')) return; sx = e.clientX; sy = e.clientY; });
  f.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) tourShow(tourI + (dx < 0 ? 1 : -1)); else if (Math.abs(dx) < 8) tourShow(tourI + 1); });
  f.addEventListener('pointercancel', () => { sx = null; }); }
$('#onbTour').addEventListener('click', () => openTour(0));
$('#helpTour').addEventListener('click', () => { closeModal($('#mHelp')); openTour(0); });
