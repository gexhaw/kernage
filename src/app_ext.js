/* ======================= v3: COMPONENTS ======================= */
function dependents(k) { return font.order.filter(x => { const g = font.glyphs[x]; return g && g.refs && g.refs.some(r => r.k === k); }); }
function refContours(r, ri) { const src = font.glyphs[r.k]; if (!src) return []; return src.contours.map(c => { const cc = L.shiftC([c], r.x, r.y)[0]; const kk = c[0] && c[0].k; cc.forEach(n => { n.r = r.k; n.ri = ri; if (kk) n.k = kk; }); return cc; }); }
function bakeRefs(g) {
  const own = g.contours.filter(c => !L.isComp(c)); if (!g.refs || !g.refs.length) { delete g.refs; g.contours = own; return; }
  let comps = []; g.refs.forEach((r, ri) => { comps = comps.concat(refContours(r, ri)); }); g.contours = own.concat(comps);
}
function propagate(k, seen) {
  seen = seen || new Set([k]);
  for (const d of dependents(k)) { if (seen.has(d)) continue; seen.add(d); bakeRefs(font.glyphs[d]); touch(d); propagate(d, seen); }
}
function reaches(from, target, seen) { seen = seen || new Set(); if (from === target) return true; if (seen.has(from)) return false; seen.add(from); const g = font.glyphs[from]; return !!(g && g.refs && g.refs.some(r => reaches(r.k, target, seen))); }
function decomposeRefsTo(k) {
  for (const d of dependents(k)) { const g = font.glyphs[d], keep = []; g.refs.forEach((r, ri) => { if (r.k === k) g.contours = g.contours.filter(c => !L.isComp(c)).concat(refContours(r, ri).map(L.cloneC), g.contours.filter(L.isComp)); else keep.push(r); }); g.refs = keep; bakeRefs(g); touch(d); }
}
function selectAllOwn() { ed.sel = new Set(); curG().contours.forEach((c, ci) => { if (!L.isComp(c)) c.forEach((_, ni) => ed.sel.add(ci + ',' + ni)); }); }
function renderRefs(g) {
  const box = $('#refList'); box.textContent = ''; (g.refs || []).forEach((r, ri) => {
    const row = document.createElement('div'); row.className = 'refrow';
    const b = document.createElement('b'); b.textContent = show(r.k);
    const mk = (v, axis) => { const i = document.createElement('input'); i.type = 'number'; i.value = Math.round(v); i.title = axis; i.setAttribute('aria-label', T('Сдвиг {0}', axis)); i.addEventListener('change', () => { const nv = parseFloat(i.value); if (!isFinite(nv)) return; pushUndo(); r[axis === 'X' ? 'x' : 'y'] = Math.round(nv); bakeRefs(g); changed(); }); return i; };
    const open = mkBtn(T('Открыть'), () => { openGlyph(r.k); }), dec = mkBtn(T('Разобрать'), () => { pushUndo(); const own = g.contours.filter(c => !L.isComp(c)).concat(refContours(r, ri).map(L.cloneC)); g.refs.splice(ri, 1); g.contours = own.concat(g.contours.filter(L.isComp)); bakeRefs(g); ed.sel.clear(); changed(); toast(T('Компонент разобран на обычные контуры')); });
    const del = mkBtn('×', () => { pushUndo(); g.refs.splice(ri, 1); bakeRefs(g); ed.sel.clear(); changed(); }); del.title = T('Убрать компонент'); del.setAttribute('aria-label', T('Убрать компонент'));
    row.append(b, mk(r.x, 'X'), mk(r.y, 'Y'), open, dec, del); box.appendChild(row);
  });
  const used = dependents(cur), u = $('#refUsed'); u.hidden = !used.length; if (used.length) u.textContent = T('Используется как компонент в: {0}', used.map(show).join(' '));
}
$('#bAddRef').addEventListener('click', () => {
  const k = resolveKey($('#refIn').value), g = curG(); if (!k || !font.glyphs[k]) { toast(T('Такого глифа нет')); return; }
  if (reaches(k, cur)) { toast(T('Нельзя: получится цикл — глифы ссылаются друг на друга')); return; }
  if (!font.glyphs[k].contours.length) { toast(T('В этом глифе нет контуров')); return; }
  pushUndo(); g.refs = (g.refs || []).concat({ k, x: 0, y: 0 }); bakeRefs(g); ed.sel.clear(); changed(); $('#refIn').value = ''; toast(T('Компонент {0} вставлен. Перетащите его или задайте сдвиг', show(k)));
});
$('#refIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#bAddRef').click(); });
function startRefDrag(ci, fx, fy) {
  const g = curG(), n0 = g.contours[ci][0], ri = n0.ri != null ? n0.ri : (g.refs || []).findIndex(r => r.k === n0.r), r = g.refs && g.refs[ri]; if (!r) return;
  pushUndo(); ed.sel.clear(); ed.drag = { type: 'ref', ri, start: [fx, fy], ox: r.x, oy: r.y, moved: false, undo: true };
}
function moveRefDrag(fx, fy, shift) {
  const dr = ed.drag, g = curG(), r = g.refs && g.refs[dr.ri]; if (!r) return; let dx = fx - dr.start[0], dy = fy - dr.start[1]; if (shift) [dx, dy] = angleSnapV(dx, dy);
  const nx = snapV(dr.ox + dx), ny = snapV(dr.oy + dy); if (nx === r.x && ny === r.y) return; r.x = nx; r.y = ny; dr.moved = true; bakeRefs(g); edDraw();
}
function endRefDrag(dr) { if (!dr.moved) { dropUndo(); edDraw(); return; } changed(); }

/* ---------- editor layers: components, colours, overshoot, knife ---------- */
function drawEdLayers(g) {
  const comps = g.contours.filter(L.isComp), pal = font.palette || [];
  const colored = g.contours.filter(c => !L.isComp(c) && c[0] && c[0].k && pal[c[0].k - 1]);
  for (const c of colored) { cx.fillStyle = pal[c[0].k - 1]; cx.globalAlpha = ed.fill ? 1 : .45; cx.fill(glyphPath({ contours: [c] }, toS)); }
  cx.globalAlpha = 1;
  if (comps.length) { const p = glyphPath({ contours: comps }, toS); cx.fillStyle = COL.accent; cx.globalAlpha = ed.fill ? .55 : .18; cx.fill(p); cx.globalAlpha = 1; if (!ed.fill) { cx.strokeStyle = COL.accent; cx.lineWidth = 1.25; cx.setLineDash([5, 3]); cx.stroke(p); cx.setLineDash([]); } }
}
function drawOvershootZones() {
  const I = font.info, ov = I.overshoot || 0; if (ov <= 0 || ov * ed.scale < 1.5) return; cx.fillStyle = COL.neg; cx.globalAlpha = .07;
  for (const [y0, y1] of [[I.capHeight, I.capHeight + ov], [I.xHeight, I.xHeight + ov], [-ov, 0]]) { const a = toS(0, y1)[1], b = toS(0, y0)[1]; cx.fillRect(0, a, ed.w, b - a); }
  cx.globalAlpha = 1;
}
function fillGlyph(ctx, g, tx, ink) {
  const pal = font.palette || [], groups = new Map();
  for (const c of g.contours) { const k = c[0] && c[0].k && pal[c[0].k - 1] ? c[0].k : 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  if (groups.size <= 1 && groups.has(0)) { ctx.fillStyle = ink; ctx.fill(glyphPath(g, tx)); return; }
  for (const [k, cs] of [...groups].sort((a, b) => a[0] - b[0])) { ctx.fillStyle = k ? pal[k - 1] : ink; ctx.fill(glyphPath({ contours: cs }, tx)); }
}
function angleSnapV(dx, dy) { const st = (+$('#angStep').value || 45) * Math.PI / 180, ang = Math.round(Math.atan2(dy, dx) / st) * st, l = dx * Math.cos(ang) + dy * Math.sin(ang); return [Math.cos(ang) * l, Math.sin(ang) * l]; }
$('#angStep').value = lsGet('litera.ang') || '45';
$('#angStep').addEventListener('change', e => lsSet('litera.ang', e.target.value));
function drawKnife() { const k = ed.knife, a = toS(...k.a), b = toS(...k.b); cx.strokeStyle = COL.neg; cx.lineWidth = 1.5; cx.setLineDash([6, 4]); cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); cx.setLineDash([]); for (const p of [a, b]) { cx.fillStyle = COL.neg; cx.beginPath(); cx.arc(p[0], p[1], 3, 0, 7); cx.fill(); } }
function applyKnife() {
  const k = ed.knife; ed.knife = null; if (!k || Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]) * ed.scale < 6) { edDraw(); return; }
  const g = curG(), comps = g.contours.filter(L.isComp), own = g.contours.filter(c => !L.isComp(c)), r = L.knife(own, k.a, k.b);
  if (!r.cuts) { toast(T('Нож должен пройти через контур насквозь')); edDraw(); return; }
  pushUndo(); g.contours = r.contours.concat(comps); ed.sel.clear(); changed(); buzz(10); toast(T('Разрезано: {0}', r.cuts));
}
function syncWH(s) {
  const on = s.length > 1, setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  if (on) { const ns = s.map(([ci, ni]) => node(ci, ni)), xs = ns.map(n => n.x), ys = ns.map(n => n.y); setv('#pW', Math.round(Math.max(...xs) - Math.min(...xs))); setv('#pH', Math.round(Math.max(...ys) - Math.min(...ys))); } else { setv('#pW', ''); setv('#pH', ''); }
  $('#pW').disabled = $('#pH').disabled = !on;
}
function scaleSel(axis, v) {
  const s = selList(); if (s.length < 2 || !(v > 0)) return; const ns = s.map(([ci, ni]) => node(ci, ni)), vals = ns.map(n => axis === 'x' ? n.x : n.y), a = Math.min(...vals), w = Math.max(...vals) - a; if (w < 1) { toast(T('У выделения нулевой размер по этой оси')); return; }
  pushUndo(); const k = v / w, f = q => a + (q - a) * k;
  for (const n of ns) { if (axis === 'x') { n.x = Math.round(f(n.x)); if (n.i) n.i = [Math.round(f(n.i[0])), n.i[1]]; if (n.o) n.o = [Math.round(f(n.o[0])), n.o[1]]; } else { n.y = Math.round(f(n.y)); if (n.i) n.i = [n.i[0], Math.round(f(n.i[1]))]; if (n.o) n.o = [n.o[0], Math.round(f(n.o[1]))]; } }
  changed();
}
numIn('#pW', v => scaleSel('x', v)); numIn('#pH', v => scaleSel('y', v));

/* ---------- palette ---------- */
let palActive = 1;
function renderPalette() {
  const box = $('#palRow'); if (!box) return; box.textContent = ''; const pal = font.palette, sc = selContours(), g = curG();
  const curK = sc.length ? (g.contours[sc[0]][0].k || 0) : -1;
  const sw = (k, col, label) => { const b = document.createElement('button'); b.type = 'button'; if (col) b.style.background = col; else b.textContent = '—'; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(k === curK)); b.addEventListener('click', () => { if (k) palActive = k; applyColor(k); }); return b; };
  box.appendChild(sw(0, null, T('Без цвета (цвет текста)')));
  pal.forEach((c, i) => box.appendChild(sw(i + 1, c, T('Цвет {0}', i + 1))));
  if (pal.length < 8) { const add = document.createElement('button'); add.type = 'button'; add.textContent = '+'; add.title = T('Добавить цвет'); add.setAttribute('aria-label', T('Добавить цвет')); add.addEventListener('click', () => { const h = Math.floor(Math.random() * 360); const c = hsl2hex(h, 70, 52); font.palette.push(c); palActive = font.palette.length; touch(); renderPalette(); }); box.appendChild(add); }
  const ce = document.createElement('input'); ce.type = 'color'; ce.title = T('Изменить выбранный цвет палитры'); ce.setAttribute('aria-label', T('Изменить выбранный цвет палитры')); ce.value = pal[palActive - 1] || '#E0464E';
  ce.addEventListener('input', () => { if (!pal[palActive - 1]) return; pal[palActive - 1] = ce.value; for (const k of font.order) if (font.glyphs[k].contours.some(c => c[0] && c[0].k === palActive)) dirtyCards.add(k); touch(); edDraw(); renderPalette(); });
  box.appendChild(ce);
}
function hsl2hex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); }
function applyColor(k) {
  const sc = selContours().filter(ci => !L.isComp(curG().contours[ci])); if (!sc.length) { toast(T('Сначала выделите контуры')); renderPalette(); return; }
  pushUndo(); for (const ci of sc) for (const n of curG().contours[ci]) { if (k) n.k = k; else delete n.k; } changed(); renderPalette();
}
function colorBuild(f, opts) {
  if (!$('#xColor').checked) return { font: f, opts };
  const plan = L.colorPlan(f); if (!plan.has) return { font: f, opts };
  const f2 = Object.assign({}, f, { glyphs: Object.assign({}, f.glyphs, plan.extra), order: f.order.concat(Object.keys(plan.extra)) }), tr = opts.transform;
  const o2 = Object.assign({}, opts, {
    transform: tr ? (k, g) => { if (!g._base) return tr(k, g); try { return FXE.process({ contours: g.contours, adv: g.adv, u: f.glyphs[g._base].u }, f.fx.p, f.info, f.fx.seed, 0); } catch (e) { return g; } } : null,
    extraTables: index => { const bases = []; for (const k in plan.map) { if (index[k] == null) continue; const layers = plan.map[k].map(l => ({ gid: index[l.key], pal: l.pal })).filter(l => l.gid != null); if (layers.length > 1 || (layers.length === 1 && layers[0].pal !== 0xFFFF)) bases.push({ gid: index[k], layers }); } return bases.length ? [{ tag: 'COLR', data: L.makeCOLR(bases) }, { tag: 'CPAL', data: L.makeCPAL(f.palette) }] : []; }
  });
  return { font: f2, opts: o2 };
}

/* ---------- overshoot ---------- */
$('#bOvershoot').addEventListener('click', () => {
  const info = L.overshootInfo(font, cur); if (!info) { toast(T('У этой буквы нет круглых краёв у линий — свес не нужен')); return; }
  if ((!info.top || info.top.ok) && (!info.bottom || info.bottom.ok)) { toast(T('Свесы уже в порядке')); return; }
  pushUndo(); if (!L.fixOvershoot(curG(), info)) { dropUndo(); return; } changed(); toast(T('Свес добавлен: {0} ед.', info.ov));
});
let overBad = [];
$('#bOverCheck').addEventListener('click', () => {
  overBad = []; for (const k of font.order) { if (L.isSpecial(k) || font.glyphs[k].comp || !/[\p{L}\p{N}]/u.test(k)) continue; const info = L.overshootInfo(font, k); if (info && ((info.top && !info.top.ok) || (info.bottom && !info.bottom.ok))) overBad.push([k, info]); }
  const out = $('#overOut'); out.hidden = false; out.textContent = overBad.length ? T('Без свеса или со слишком большим свесом: {0}', overBad.map(x => show(x[0])).join(' ')) : T('Свесы в порядке у всех круглых букв');
  $('#bOverFix').hidden = !overBad.length;
});
$('#bOverFix').addEventListener('click', () => {
  let n = 0; for (const [k, info] of overBad) { const g = font.glyphs[k], s = undo.s(k); s.u.push(snapshot(g)); s.r.length = 0; if (L.fixOvershoot(g, info)) { n++; touch(k); propagate(k); } }
  overBad = []; $('#bOverFix').hidden = true; $('#overOut').textContent = T('Исправлено глифов: {0}', n); toast(T('Исправлено глифов: {0}', n));
});

/* ======================= v3: KERNING ======================= */
function kernWordsSync() {
  if (!$('#kWords').checked) return; const key = kern.l + '\t' + kern.r; if (kern.wf === key) return; kern.wf = key;
  const ws = L.wordsFor(kern.l, kern.r, 6).filter(w => [...w].every(c => font.glyphs[c] || c === ' '));
  kern.test = ws.length ? ws.join(' ') : (ctxFor(kern.l, 'l') + kern.l + kern.r + ctxFor(kern.r, 'r')); $('#ktest').value = kern.test;
}
$('#kWords').addEventListener('change', e => { lsSet('litera.kwords', e.target.checked ? '1' : '0'); kern.wf = ''; if (!e.target.checked) { kern.test = lsGet('litera.ktest') || kern.test; $('#ktest').value = kern.test; } drawKern(); });
$('#kWords').checked = lsGet('litera.kwords') === '1';
let probRows = [];
function renderProblems() {
  const box = $('#probList'); box.textContent = '';
  for (const p of probRows) {
    const b = document.createElement('div'); b.className = 'prob'; b.tabIndex = 0;
    const lab = document.createElement('b'); lab.textContent = show(p.l) + show(p.r); const d = document.createElement('span'); d.className = 'd'; d.textContent = T('сейчас {0} → расчёт {1}', p.cur, p.sug);
    const ap = mkBtn(T('Применить'), ev => { ev.stopPropagation(); kPush(); setKern(p.l, p.r, p.sug); probRows = probRows.filter(x => x !== p); renderProblems(); renderKernList(); drawKern(); });
    b.append(lab, d, ap); b.addEventListener('click', () => { kern.l = p.l; kern.r = p.r; drawKern(); highlightRow(); }); box.appendChild(b);
  }
  $('#bProbAll').hidden = !probRows.length;
}
$('#bProblems').addEventListener('click', () => {
  const chars = scopeChars().filter(c => font.glyphs[c] && font.glyphs[c].contours.length); if (chars.length < 2) { toast(T('В охвате нет нарисованных глифов')); return; }
  const t0 = performance.now(); probRows = L.problemPairs(font, chars, { strength: +$('#aStr').value / 100, depth: +$('#aDep').value, minDist: +$('#aMin').value, threshold: +$('#aThr').value }, 60);
  renderProblems(); toast(probRows.length ? T('Найдено пар с расхождением: {0} ({1} мс)', probRows.length, Math.round(performance.now() - t0)) : T('Кернинг совпадает с расчётом'));
});
$('#bProbAll').addEventListener('click', () => { if (!probRows.length) return; kPush(); for (const p of probRows) setKern(p.l, p.r, p.sug); const n = probRows.length; probRows = []; renderProblems(); renderKernList(); drawKern(); toast(T('Применено пар: {0}', n)); });

/* ======================= v3: OPENTYPE FEATURES ======================= */
function otStat() { const n = f => font.order.filter(k => k.endsWith(':' + f)).length; $('#otStat').textContent = T('Сейчас: табличных цифр {0}, капители {1}, лигатур {2}', n('tnum'), n('smcp'), font.order.filter(k => k.startsWith('liga:')).length); }
$('#bOT').addEventListener('click', () => { otStat(); openModal('mOT'); });
$('#bTnum').addEventListener('click', () => { const m = L.makeTnum(font); m.forEach(k => { dirtyCards.add(k); gver[k] = (gver[k] || 0) + 1; }); buildGrid(); touch(); otStat(); toast(m.length ? T('Создано табличных цифр: {0}', m.length) : T('Сначала нарисуйте цифры')); });
$('#bSmcp').addEventListener('click', () => { const m = L.makeSmcp(font); m.forEach(k => { dirtyCards.add(k); gver[k] = (gver[k] || 0) + 1; }); buildGrid(); touch(); otStat(); toast(m.length ? T('Создано капительных букв: {0}', m.length) : T('Сначала нарисуйте прописные буквы')); });

/* ======================= v3: MY FX PRESETS ======================= */
function myPresets() { try { const o = JSON.parse(lsGet('litera.fxpresets') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function saveMyPresets(o) { lsSet('litera.fxpresets', JSON.stringify(o)); }
function fxDiff() { const d = FXE.defaults(), P = fxP(), o = {}; for (const k in P) if (Math.abs((P[k] || 0) - (d[k] || 0)) > 1e-9) o[k] = P[k]; return o; }
function applyMyPreset(nm) { const pr = myPresets()[nm]; if (!pr) return; font.fx.p = Object.assign(FXE.defaults(), pr.p || {}); if (pr.s) font.fx.seed = pr.s; syncFxPanel(); fxChanged(); blip(.6); }
const b64u = { enc(s) { const b = new TextEncoder().encode(s); let bin = ''; for (const x of b) bin += String.fromCharCode(x); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, dec(s) { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); } };
$('#fxPSave').addEventListener('click', () => {
  const d = fxDiff(); if (!Object.keys(d).length) { toast(T('Сначала включите хотя бы один эффект')); return; }
  const my = myPresets(), nm = ($('#fxPName').value.trim() || T('Мой пресет {0}', Object.keys(my).length + 1)).slice(0, 40); my[nm] = { p: d, s: font.fx.seed }; saveMyPresets(my); buildFxPresets(); $('#fxPreset').value = 'my:' + nm; $('#fxPName').value = ''; toast(T('Пресет «{0}» сохранён', nm));
});
$('#fxPDel').addEventListener('click', () => { const v = $('#fxPreset').value; if (!v.startsWith('my:')) { toast(T('Выберите свой пресет в списке')); return; } const my = myPresets(); delete my[v.slice(3)]; saveMyPresets(my); $('#fxPreset').value = ''; buildFxPresets(); toast(T('Пресет удалён')); });
$('#fxPCopy').addEventListener('click', async () => {
  const d = fxDiff(); if (!Object.keys(d).length) { toast(T('Сначала включите хотя бы один эффект')); return; }
  const v = $('#fxPreset').value, code = 'LFX1:' + b64u.enc(JSON.stringify({ n: v.startsWith('my:') ? v.slice(3) : (v ? T(v) : ''), p: d, s: font.fx.seed })), inp = $('#fxCode');
  inp.hidden = false; inp.value = code; inp.select();
  try { await navigator.clipboard.writeText(code); toast(T('Код пресета скопирован. Отправьте его — его можно вставить кнопкой «Вставить код»')); } catch (e) { toast(T('Скопируйте код из поля')); }
});
$('#fxPPaste').addEventListener('click', async () => { const inp = $('#fxCode'); inp.hidden = false; inp.value = ''; try { const t = await navigator.clipboard.readText(); if (t && t.startsWith('LFX1:')) { inp.value = t; return useCode(t); } } catch (e) { } inp.focus(); toast(T('Вставьте код пресета в поле и нажмите Enter')); });
function useCode(t) {
  try { const o = JSON.parse(b64u.dec(t.trim().replace(/^LFX1:/, ''))), clean = {}; const d = FXE.defaults(); for (const k in o.p || {}) if (k in d && isFinite(+o.p[k])) clean[k] = +o.p[k]; if (!Object.keys(clean).length) throw new Error('empty');
    const my = myPresets(), nm = (String(o.n || '').slice(0, 40) || T('Пресет из кода')); my[nm] = { p: clean, s: +o.s || font.fx.seed }; saveMyPresets(my); buildFxPresets(); $('#fxPreset').value = 'my:' + nm; applyMyPreset(nm); $('#fxCode').hidden = true; toast(T('Пресет «{0}» добавлен', nm));
  } catch (e) { toast(T('Код не распознан')); }
}
$('#fxCode').addEventListener('keydown', e => { if (e.key === 'Enter') useCode(e.target.value); });

/* ======================= v3: ANIMATED EXPORT ======================= */
async function exportAnim(fmt) {
  const P = fxP(); if (!FXE.isActive(P)) { toast(T('Включите хотя бы один эффект — анимация показывает, как он нарастает')); return; }
  const D = FXE.defaults(), text = fxs.mode === 'phrase' ? (fxs.phrase || ' ') : (L.isSpecial(fxs.cur) ? ghostText(fxs.cur) : fxs.cur), lines = text.split('\n'), I = font.info, NF = 40, gif = fmt === 'gif';
  const frameOuts = t => { const Pt = {}; for (const k in P) Pt[k] = typeof P[k] === 'number' ? D[k] + (P[k] - D[k]) * t : P[k]; const cache = {}; return ch => { if (cache[ch]) return cache[ch]; const g = font.glyphs[ch]; if (!g) return null; let o; try { o = g.fxSkip ? g : FXE.process(g, Pt, I, font.fx.seed, 0); } catch (e) { o = g; } return (cache[ch] = o); }; };
  const lay = (get, s) => { let x = 0, prev = null; const it = []; for (const ch of shape(s)) { const o = get(ch); if (!o) { x += I.upm * 0.3; prev = null; continue; } if (prev) x += kv(prev, ch); it.push({ x, o }); x += o.adv; prev = ch; } return { it, w: x }; };
  const lh = (I.ascender - I.descender) * 1.12, W0 = Math.max(1, ...lines.map(l => Math.max(lay(frameOuts(0), l).w, lay(frameOuts(1), l).w)));
  const portrait = lines.length > 1 || W0 < lh * 1.6, Wc = gif ? (portrait ? 720 : 960) : (portrait ? 1080 : 1920), Hc = gif ? (portrait ? 720 : 540) : (portrait ? 1080 : 1080);
  const sc = Math.min((Wc * 0.84) / W0, (Hc * 0.8) / (lh * lines.length)), c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d', { willReadFrequently: gif });
  const ink = '#111111', paper = '#ffffff', frames = [];
  for (let i = 0; i < NF; i++) {
    const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF), get = frameOuts(t); x.fillStyle = paper; x.fillRect(0, 0, Wc, Hc); x.fillStyle = ink;
    lines.forEach((ln, li) => { const l = lay(get, ln), ox = (Wc - l.w * sc) / 2, base = (Hc - lh * lines.length * sc) / 2 + (li * lh + I.ascender + (lh - (I.ascender - I.descender)) / 2) * sc; for (const it of l.it) x.fill(glyphPath(it.o, (a, b) => [ox + (it.x + a) * sc, base - b * sc])); });
    if (gif) { const d = x.getImageData(0, 0, Wc, Hc).data, idx = new Uint8Array(Wc * Hc); for (let p = 0; p < Wc * Hc; p++) { const lum = d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114; idx[p] = Math.max(0, Math.min(255, Math.round((255 - lum) / (255 - 17) * 255))); } frames.push(idx); }
    else frames.push(await createImageBitmap(c));
    if (i % 4 === 0) { toast(T('Кадр {0} из {1}', i + 1, NF)); await new Promise(r => setTimeout(r, 0)); }
  }
  const b = baseName();
  if (gif) { const pal = []; for (let i = 0; i < 256; i++) { const k = i / 255; pal.push([Math.round(255 + (17 - 255) * k), Math.round(255 + (17 - 255) * k), Math.round(255 + (17 - 255) * k)]); } return saveFile(b + '-anim.gif', new Blob([L.gifEncode(frames, Wc, Hc, pal, 4)], { type: 'image/gif' })); }
  if (!window.MediaRecorder || !c.captureStream) { toast(T('Браузер не умеет записывать видео — сохраните GIF')); return; }
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  const stream = c.captureStream(25), rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  toast(T('Записываю видео…')); rec.start(200);
  for (let loop = 0; loop < 3; loop++) for (const f of frames) { x.drawImage(f, 0, 0); await new Promise(r => setTimeout(r, 40)); }
  rec.stop(); await done; frames.forEach(f => f.close && f.close());
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0], ext = type.includes('mp4') ? 'mp4' : 'webm';
  return saveFile(b + '-anim.' + ext, new Blob(chunks, { type }));
}

/* ======================= v3: POSTER ======================= */
async function ensureLive() { if (liveFace && !fontDirty) return true; await rebuildLive(); return !!liveFace; }
async function renderPoster() {
  const [W, H] = $('#poSize').value.split('x').map(Number), c = $('#poCv'); c.width = W; c.height = H; const x = c.getContext('2d');
  const ink = $('#poInk').value, bg = $('#poBg').value, acc = $('#poAcc').value, fam = liveFace ? `'${liveFace.family}', 'Golos Text', sans-serif` : `'Golos Text', sans-serif`, mono = `'IBM Plex Mono', monospace`, I = font.info;
  const txt = $('#poText').value.trim() || font.info.familyName, F = (s, f) => `${Math.round(s)}px ${f || fam}`, m = Math.min(W, H), pad = m * 0.07;
  x.fillStyle = bg; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic'; x.fillStyle = ink;
  const fit = (s, maxW, maxS, f) => { let sz = maxS; x.font = F(sz, f); const w = x.measureText(s).width; if (w > maxW) sz = sz * maxW / w; return sz; };
  const drawn = font.order.filter(k => !L.isSpecial(k) && k !== ' ' && font.glyphs[k].contours.length);
  const label = (s, X, Y, al) => { x.font = F(m * 0.022, mono); x.fillStyle = ink; x.globalAlpha = .7; x.textAlign = al || 'left'; x.fillText(s, X, Y); x.globalAlpha = 1; x.textAlign = 'left'; };
  const wrapText = (s, X, Y, maxW, size, lhK) => { x.font = F(size); let line = '', y = Y; for (const w of s.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (line && x.measureText(t).width > maxW) { x.fillText(line, X, y); y += size * lhK; line = w; } else line = t; } if (line) { x.fillText(line, X, y); y += size * lhK; } return y; };
  const tpl = $('#poTpl').value, meta = `${I.familyName} ${I.styleName}`.trim();
  x.fillStyle = acc; x.fillRect(pad, pad, m * 0.06, m * 0.012); x.fillStyle = ink;
  label(meta.toUpperCase(), pad, pad + m * 0.06); label(T('{0} глифов', drawn.length), W - pad, pad + m * 0.06, 'right');
  if (tpl === 'big') {
    const ch = [...txt][0] || 'A', s = Math.min(H * 0.62, W * 0.9) ; x.font = F(s); const w = x.measureText(ch).width, sz = w > W - pad * 2 ? s * (W - pad * 2) / w : s; x.font = F(sz); x.textAlign = 'center'; x.fillText(ch, W / 2, H * 0.64); x.textAlign = 'left';
    x.fillStyle = acc; x.fillRect(pad, H * 0.71, W - pad * 2, Math.max(2, m * 0.004)); x.fillStyle = ink;
    const rows = [drawn.filter(k => /\p{Lu}/u.test(k)).slice(0, 26).join(''), drawn.filter(k => /\p{Ll}/u.test(k)).slice(0, 26).join(''), drawn.filter(k => /\d/.test(k)).join('') + ' ' + drawn.filter(k => /[^\p{L}\p{N}]/u.test(k)).slice(0, 12).join('')].filter(r => r.trim());
    let y = H * 0.71 + m * 0.09; for (const r of rows) { const sz2 = fit(r, W - pad * 2, m * 0.06); x.font = F(sz2); x.fillText(r, pad, y); y += Math.max(sz2 * 1.3, m * 0.05); }
  } else if (tpl === 'alpha') {
    const set = drawn.filter(k => /\p{L}/u.test(k)).slice(0, 36), cols = W > H ? 9 : 6, rowsN = Math.ceil(set.length / cols), top = pad + m * 0.12, cw = (W - pad * 2) / cols, chh = Math.min((H - top - pad * 1.5) / Math.max(1, rowsN), cw * 1.15), size = chh * 0.72;
    x.font = F(size); x.textAlign = 'center'; set.forEach((ch, i) => { const cx2 = pad + cw * (i % cols) + cw / 2, cy = top + chh * Math.floor(i / cols) + chh * 0.8; x.fillText(ch, cx2, cy); }); x.textAlign = 'left';
    label(txt, pad, H - pad * 0.6);
  } else if (tpl === 'word') {
    const sz = fit(txt, W - pad * 2, H * 0.32); x.font = F(sz); x.fillText(txt, pad, pad + m * 0.12 + sz * 0.9);
    x.fillStyle = acc; x.fillRect(pad, pad + m * 0.16 + sz, W * 0.3, Math.max(3, m * 0.006)); x.fillStyle = ink;
    wrapText((PRESETS[0] || '').replace(/\n/g, ' '), pad, pad + m * 0.26 + sz, W - pad * 2, m * 0.045, 1.3);
  } else {
    const sz = fit(I.familyName, W - pad * 2, H * 0.22); x.font = F(sz); x.fillText(I.familyName, pad, pad + m * 0.1 + sz * 0.85);
    let y = pad + m * 0.18 + sz; const line = (PRESETS[0] || '').split('\n')[0];
    for (const k of [0.11, 0.08, 0.06, 0.045, 0.034, 0.026]) { const s2 = m * k; if (y + s2 > H - pad) break; x.font = F(s2); let t2 = line; while (t2.length > 3 && x.measureText(t2).width > W - pad * 2) t2 = t2.slice(0, -2); x.fillText(t2, pad, y + s2); y += s2 * 1.35; }
    label(`${Math.round(m * 0.11)} / ${Math.round(m * 0.026)} px`, W - pad, H - pad * 0.6, 'right');
  }
}
let posterT; const posterLater = () => { clearTimeout(posterT); posterT = setTimeout(renderPoster, 80); };
$('#pvPoster').addEventListener('click', async () => { if (!$('#poText').value) $('#poText').value = font.info.familyName; openModal('mPoster'); if (!(await ensureLive())) { toast(T('Шрифт ещё собирается, попробуйте через секунду')); } await document.fonts.ready; renderPoster(); });
for (const id of ['#poTpl', '#poSize', '#poText', '#poInk', '#poBg', '#poAcc']) $(id).addEventListener('input', posterLater);
$('#poSave').addEventListener('click', () => { renderPoster(); $('#poCv').toBlob(b => { if (b) saveFile(baseName() + '-poster.png', b); else toast(T('Не удалось создать изображение')); }, 'image/png'); });

/* ======================= v3: VARIABLE FONT OPTIONS ======================= */
const varOn = () => $('#xVar').checked;
function varOpts() { const l = Math.min(-2, Math.max(-120, +$('#vLight').value || -24)), b = Math.max(2, Math.min(200, +$('#vBold').value || 40)); return { light: l, bold: b }; }
$('#xVar').checked = lsGet('litera.xvar') === '1'; $('#varRow').hidden = !varOn();
$('#xVar').addEventListener('change', () => { lsSet('litera.xvar', varOn() ? '1' : '0'); $('#varRow').hidden = !varOn(); fontDirty = true; if (tab === 'preview') schedulePreview(true); });
for (const id of ['#vLight', '#vBold']) $(id).addEventListener('change', () => { fontDirty = true; });
$('#xColor').addEventListener('change', () => { fontDirty = true; });
$('#pvWght').addEventListener('input', applyPreview);

/* ======================= v3: SHARE & LINKS ======================= */
async function deflate(str) { const cs = new CompressionStream('deflate-raw'); return new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer()); }
async function inflate(u8) { const ds = new DecompressionStream('deflate-raw'); return await new Response(new Blob([u8]).stream().pipeThrough(ds)).text(); }
const u8b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64u8 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
$('#bShare').addEventListener('click', async () => {
  const name = baseName() + '.kernage.json', blob = new Blob([JSON.stringify(font)], { type: 'application/json' });
  try { const file = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: font.info.familyName }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  await saveFile(name, blob); toast(T('Отправьте файл .json — его открывают в Kernage кнопкой «Открыть файл»'));
});
$('#bLink').addEventListener('click', async () => {
  if (!/^https?:$/.test(location.protocol) || !window.CompressionStream) { toast(T('Ссылки работают, когда Kernage открыт с сайта. Сейчас используйте «Поделиться проектом»')); return; }
  const code = u8b64(await deflate(JSON.stringify(font))), url = location.href.split('#')[0] + '#p=' + code;
  try { await navigator.clipboard.writeText(url); toast(code.length > 60000 ? T('Ссылка скопирована, но она длинная ({0} КБ): мессенджеры могут её обрезать', Math.round(url.length / 1024)) : T('Ссылка на проект скопирована')); } catch (e) { toast(T('Не удалось скопировать ссылку')); }
});
async function checkHashProject() {
  if (!location.hash.startsWith('#p=') || !window.DecompressionStream) return;
  try { const o = JSON.parse(await inflate(b64u8(location.hash.slice(3)))); if (!o || !o.glyphs) throw new Error('bad'); newProject(o, T('Открыт проект из ссылки: {0}', (o.info && o.info.familyName) || '')); setTab('glyphs'); }
  catch (e) { toast(T('Ссылка на проект повреждена')); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
}
$('#fUfoDir').addEventListener('change', async e => {
  const list = [...e.target.files]; e.target.value = ''; if (!list.length) return; const files = {};
  try { for (const f of list) { const p = f.webkitRelativePath || f.name; if (/\.(plist|glif|fea)$/i.test(p)) files[p] = new Uint8Array(await f.arrayBuffer()); } newProject(L.importUFO(files)); toast(T('Открыт: ') + font.info.familyName); setTab('glyphs'); }
  catch (err) { toast(T('Не удалось открыть файл: ') + (err.message || err)); }
});

/* ======================= v3: VERSION HISTORY ======================= */
let vdb = null, lastAuto = Date.now(), autoDirty = false;
function vOpen() { if (vdb) return vdb; vdb = new Promise((res, rej) => { try { const r = indexedDB.open('litera', 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }).createIndex('pid', 'pid'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); return vdb; }
function vTx(mode, fn) { return vOpen().then(db => new Promise((res, rej) => { const tx = db.transaction('versions', mode), st = tx.objectStore('versions'); let out; Promise.resolve(fn(st, v => { out = v; })).catch(rej); tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); })); }
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function saveVersion(name, auto) {
  if (!projId) save(); const json = JSON.stringify(font); let data = json, z = false;
  if (window.CompressionStream) { try { const cs = new CompressionStream('gzip'); data = await new Response(new Blob([json]).stream().pipeThrough(cs)).blob(); z = true; } catch (e) { data = json; } }
  const rec = { pid: projId, t: Date.now(), name, auto: !!auto, z, data, n: font.order.filter(k => font.glyphs[k].contours.length).length };
  await vTx('readwrite', st => { st.add(rec); });
  if (auto) { const all = await listVersions(); const autos = all.filter(v => v.auto); if (autos.length > 20) await vTx('readwrite', st => { autos.slice(20).forEach(v => st.delete(v.id)); }); }
}
async function listVersions() { return (await vTx('readonly', (st, put) => req(st.index('pid').getAll(projId)).then(put))) .sort((a, b) => b.t - a.t); }
async function renderVersions() {
  const box = $('#vlist'); if (!box) return;
  try { const list = await listVersions(); box.textContent = '';
    if (!list.length) { const p = document.createElement('p'); p.className = 'hint'; p.style.margin = '0'; p.textContent = T('Версий пока нет'); box.appendChild(p); return; }
    for (const v of list) { const row = document.createElement('div'); row.className = 'vrow'; const info = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small'); b.textContent = v.name || T('Версия'); sm.textContent = new Date(v.t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + T('{0} глифов', v.n || 0); info.append(b, sm); const del = mkBtn(T('Удалить')); armed(del, () => vTx('readwrite', st => { st.delete(v.id); }).then(renderVersions)); row.append(info, mkBtn(T('Вернуть'), () => restoreVersion(v)), del); box.appendChild(row); }
  } catch (e) { box.textContent = ''; const p = document.createElement('p'); p.className = 'hint'; p.textContent = T('История версий недоступна в этом браузере'); box.appendChild(p); }
}
async function restoreVersion(v) {
  try { let json = v.data; if (v.z) { const ds = new DecompressionStream('gzip'); json = await new Response(v.data.stream().pipeThrough(ds)).text(); } const o = JSON.parse(json);
    await saveVersion(T('До восстановления'), false); setFont(o); save(); renderVersions(); toast(T('Восстановлена версия «{0}»', v.name || ''));
  } catch (e) { toast(T('Не удалось восстановить версию')); }
}
$('#bVerSave').addEventListener('click', async () => { const nm = $('#verName').value.trim() || T('Версия от {0}', new Date().toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })); try { await saveVersion(nm, false); $('#verName').value = ''; renderVersions(); toast(T('Версия сохранена')); } catch (e) { toast(T('История версий недоступна в этом браузере')); } });
function autoVersion() { autoDirty = true; if (Date.now() - lastAuto < 10 * 60 * 1000) return; lastAuto = Date.now(); autoDirty = false; saveVersion(T('Автосохранение'), true).catch(() => { }); }

/* ======================= v3: PWA INSTALL ======================= */
let installEv = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; $('#bInstall').hidden = false; });
$('#bInstall').addEventListener('click', async () => { if (!installEv) return; installEv.prompt(); try { await installEv.userChoice; } catch (e) { } installEv = null; $('#bInstall').hidden = true; });
window.addEventListener('appinstalled', () => { $('#bInstall').hidden = true; toast(T('Kernage установлен как приложение')); });
if (window.LITERA_PWA && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
setTimeout(checkHashProject, 0);
