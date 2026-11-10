(function () {
'use strict';
const L = window.Litera;
let LANG = 'ru';
const I18N = window.LITERA_I18N || {};
function T(s, ...a) { let r = s; if (LANG !== 'ru' && typeof s === 'string') { const e = I18N[s]; if (e) r = e[LANG === 'en' ? 0 : 1] || s; } if (a.length) r = String(r).replace(/\{(\d+)\}/g, (m, i) => a[+i] !== undefined ? a[+i] : m); return r; }
const LOC = () => ({ ru: 'ru-RU', en: 'en-US', es: 'es-ES' })[LANG];
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DPR = () => Math.min(3, window.devicePixelRatio || 1);
const STORE = 'litera.project.v1';
const hasOT = !!window.opentype;
if (!hasOT) $('#libwarn').hidden = false;

/* ---------- state & persistence ---------- */
let font, cur, tab = 'glyphs', fontDirty = true;
const dirtyCards = new Set();
const fxCache = new Map(), gver = {}, FXE = window.LiteraFX;
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
function normalize(f) {
  if (!f.info || typeof f.info !== 'object') f.info = {}; if (!f.glyphs || typeof f.glyphs !== 'object') f.glyphs = {}; if (!Array.isArray(f.order)) f.order = null; if (!f.kerning || typeof f.kerning !== 'object') f.kerning = {}; if (f.fx && typeof f.fx !== 'object') f.fx = null;
  f.info = Object.assign({ familyName: T('Без названия'), styleName: 'Regular', designer: '', version: '1.000', description: '', upm: 1000, ascender: 760, descender: -230, capHeight: 700, xHeight: 500, lineGap: 0, overshoot: 12 }, f.info || {}); if (!Array.isArray(f.palette)) f.palette = ['#E0464E', '#2D43D2', '#E3A008', '#22A06B']; f.palette = f.palette.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8);
  f.fx = Object.assign({ on: true, seed: 7, p: {} }, f.fx || {}); f.fx.p = Object.assign(FXE.defaults(), f.fx.p || {});
  if (f.kgroups && (typeof f.kgroups !== 'object' || !f.kgroups.L || !f.kgroups.R)) f.kgroups = Object.assign({ L: {}, R: {} }, typeof f.kgroups === 'object' ? f.kgroups : {}); f.glyphs = f.glyphs || {}; f.order = (f.order || Object.keys(f.glyphs)).filter(k => typeof k === 'string' && k && f.glyphs[k] && typeof f.glyphs[k] === 'object'); f.kerning = f.kerning || {};
  for (const k of f.order) { const g = f.glyphs[k]; g.contours = (Array.isArray(g.contours) ? g.contours : []).filter(c => Array.isArray(c)).map(c => c.filter(n => n && typeof n === 'object').map(n => { const o = { x: +n.x || 0, y: +n.y || 0, i: n.i || null, o: n.o || null, s: !!n.s }; if (typeof n.r === 'string' && n.r) { o.r = n.r; if (n.ri >= 0) o.ri = n.ri | 0; } if (n.k > 0 && n.k < 9) o.k = n.k | 0; return o; })); if (Array.isArray(g.refs)) { g.refs = g.refs.filter(r => r && typeof r.k === 'string' && f.glyphs[r.k]).map(r => ({ k: r.k, x: +r.x || 0, y: +r.y || 0 })); if (!g.refs.length) delete g.refs; } else delete g.refs; if (L.isSpecial(k)) g.u = null; else if (g.u == null) g.u = k.codePointAt(0); if (!g.name) g.name = L.glyphName(k); if (g.adv == null) g.adv = 500;
    const cc = a => (Array.isArray(a) ? a : []).filter(c => Array.isArray(c) && c.length).map(c => c.filter(n => n && typeof n === 'object').map(n => ({ x: +n.x || 0, y: +n.y || 0, i: n.i || null, o: n.o || null, s: !!n.s })));
    for (const l of ['bg', 'mL', 'mB']) { if (g[l] && typeof g[l] === 'object') { const c = cc(g[l].contours); if (c.length) g[l] = { contours: c, adv: +g[l].adv || g.adv }; else delete g[l]; } else delete g[l]; }
    if (g.anchors && typeof g.anchors === 'object') { const A = {}; for (const n in g.anchors) { const v = g.anchors[n]; if (Array.isArray(v) && isFinite(v[0]) && isFinite(v[1]) && /^_?[a-zA-Z][\w.]*$/.test(n)) A[n] = [+v[0], +v[1]]; } if (Object.keys(A).length) g.anchors = A; else delete g.anchors; } else delete g.anchors;
    if (g.mf && typeof g.mf === 'object') { const m = {}; for (const s of ['l', 'r']) if (typeof g.mf[s] === 'string' && g.mf[s].trim()) m[s] = g.mf[s].trim().slice(0, 40); if (m.l || m.r) g.mf = m; else delete g.mf; } else delete g.mf; }
  if (typeof f.calt !== 'string') delete f.calt;
  return f;
}
let saveT;
function touch(key, keepFx) { clearTimeout(saveT); saveT = setTimeout(save, 700); setSaveState('pending'); fontDirty = true; if (key) { dirtyCards.add(key); gver[key] = (gver[key] || 0) + 1; } else if (!keepFx) fxCache.clear(); if (tab === 'preview') schedulePreview(); }
function setFont(f) {
  fxCache.clear();
  font = normalize(f); cur = font.order.includes('A') ? 'A' : font.order[0]; undo.clear(); ed.sel.clear(); ed.pen = null;
  buildGrid(); fillInfo(); fontDirty = true; touch(); ed.needFit = true; kern.l = 'A'; kern.r = 'V'; kh.u.length = 0; kh.r.length = 0; syncKernInputs(); fillGroupsUI(); syncKUndo();
  if (tab === 'editor') { edDraw(); refreshPanel(); } if (tab === 'kern') { renderKernList(); drawKern(); }
}

/* ---------- colours from tokens ---------- */
const COL = {};
function readColors() { const cs = getComputedStyle(document.documentElement); for (const k of ['ink', 'mute', 'accent', 'neg', 'pos', 'guide', 'canvas', 'line', 'panel', 'grid', 'grid2', 'accent-soft', 'bg']) COL[k] = cs.getPropertyValue('--' + k).trim(); }
function themeChanged() { readColors(); drawAllCards(); if (tab === 'editor') edDraw(); if (tab === 'kern') drawKern(); if (tab === 'font') drawMetrics(); }
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- misc ui ---------- */
let toastT;
function toast(msg) { msg = T(msg); const t = $('#toast'); t.textContent = msg; t.hidden = false; requestAnimationFrame(() => t.classList.add('on')); clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.hidden = true, 250); }, 2600); }
function armed(btn, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; fn(); return; }
    btn.dataset.label = btn.textContent; btn.dataset.armed = '1'; btn.textContent = T('Нажмите ещё раз');
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  });
}
const hex = ch => L.isSpecial(ch) ? (L.specInfo(ch).kind === 'liga' ? 'liga' : L.specInfo(ch).feat) : 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const show = ch => ch === ' ' ? '␣' : L.isSpecial(ch) ? glyphLabel(ch) : ch;
function parseChar(v) {
  v = (v || '').trim(); if (!v) return null;
  const m = v.match(/^(?:u\+?|0x|\\u)([0-9a-f]{2,6})$/i); if (m) { const cp = parseInt(m[1], 16); if (cp > 0 && cp < 0x110000) return String.fromCodePoint(cp); }
  const arr = [...v]; return arr.length === 1 ? arr[0] : null;
}
const kv = (l, r) => L.kernValue(font, l, r);
function setKern(l, r, v) {
  v = Math.round(v); let key = l + '\t' + r;
  if (groupMode()) { const G = font.kgroups, gl = G.L[l], gr = G.R[r]; if (gl || gr) { key = (gl ? '@' + gl : l) + '\t' + (gr ? '@' + gr : r); delete font.kerning[l + '\t' + r]; } }
  if (!v) { delete font.kerning[key]; if (!L.GKRE.test(key) && L.kernValue(font, l, r)) font.kerning[key] = 0; } else font.kerning[key] = v;
  touch(null, true);
}

/* ---------- glyph drawing ---------- */
function glyphPath(g, tx, openIdx) {
  const p = new Path2D();
  g.contours.forEach((c, ci) => {
    if (!c.length) return;
    const a = tx(c[0].x, c[0].y); p.moveTo(a[0], a[1]);
    const n = ci === openIdx ? c.length - 1 : c.length;
    for (let i = 0; i < n; i++) { const s = L.segOf(c, i), e = tx(s.b[3][0], s.b[3][1]); if (s.curve) { const c1 = tx(s.b[1][0], s.b[1][1]), c2 = tx(s.b[2][0], s.b[2][1]); p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]); } else p.lineTo(e[0], e[1]); }
    if (ci !== openIdx) p.closePath();
  });
  return p;
}
function layoutText(text, kernOn) { return layoutKeys(shape(text), kernOn); }
function layoutKeys(keys, kernOn) {
  const out = []; let x = 0, prev = null;
  for (const ch of keys) { const g = font.glyphs[ch]; if (!g) { prev = null; out.push({ ch, g: null, x, adv: font.info.upm * 0.5 }); x += font.info.upm * 0.5; continue; } if (prev && kernOn) x += kv(prev, ch); out.push({ ch, g, x, adv: g.adv, k: prev ? kv(prev, ch) : 0 }); x += g.adv; prev = ch; }
  return { items: out, width: x };
}

/* ======================= GLYPH GRID ======================= */
let gFilter = 'all', gSearch = '';
const GROUPS = { ot: ch => L.isSpecial(ch), all: () => true, latin: ch => /[A-Za-z]/.test(ch), cyr: ch => L.isCyr(ch), digits: ch => /[0-9]/.test(ch), punct: ch => !/[\p{L}\p{N}]/u.test(ch), empty: (ch, g) => !g.contours.length && ch !== ' ' };
function buildGrid() {
  const grid = $('#grid'); grid.textContent = '';
  for (const k of font.order) {
    const b = document.createElement('button'); b.className = 'gcard'; b.dataset.k = k; b.title = hex(k) + ' · ' + font.glyphs[k].name;
    b.innerHTML = '<canvas></canvas><span class="gmeta"><b></b><i></i></span>';
    b.querySelector('b').textContent = show(k); b.querySelector('i').textContent = L.isSpecial(k) ? hex(k) : hex(k).slice(2);
    grid.appendChild(b);
  }
  applyFilter(); dirtyCards.clear(); drawAllCards();
}
function applyFilter() {
  const f = GROUPS[gFilter], q = gSearch.trim(), qc = parseChar(q);
  let shown = 0;
  for (const b of $('#grid').children) {
    const k = b.dataset.k, g = font.glyphs[k];
    let ok = f(k, g);
    if (ok && gMark) ok = gMark === 'none' ? !g.mark : String(g.mark || '') === gMark;
    if (ok && q) ok = qc ? k === qc || k.toLowerCase() === qc.toLowerCase() : g.name.toLowerCase().includes(q.toLowerCase());
    b.hidden = !ok; if (ok) shown++;
  }
  { const ge = $('#gempty'); ge.hidden = shown > 0; if (!shown) { const can = !!(qc && !font.glyphs[qc]), hid = !!(qc && font.glyphs[qc]), ba = $('#gemptyAdd'); ba.hidden = !(can || hid); ba.dataset.k = qc || ''; ba.dataset.mode = can ? 'add' : 'show'; if (can) ba.textContent = T('Добавить «{0}»', qc); else if (hid) ba.textContent = T('Показать «{0}» во всех группах', qc); $('#gemptyT').textContent = q ? T('Ничего не найдено по запросу «{0}»', q) : T('В этой группе нет глифов'); } }
  const drawn = font.order.filter(k => font.glyphs[k].contours.length).length;
  $('#gstat').textContent = T('Нарисовано {0} из {1} глифов · пар кернинга {2}', drawn, font.order.length, Object.keys(font.kerning).length) + (shown !== font.order.length ? T(' · показано {0}', shown) : '');
}
function drawCard(b) {
  const k = b.dataset.k, g = font.glyphs[k]; if (!g) return;
  const cv = b.querySelector('canvas'), s = 96, d = DPR();
  if (cv.width !== s * d) { cv.width = s * d; cv.height = s * d; }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, s, s);
  const I = font.info, sc = s * 0.7 / (I.ascender - I.descender), base = s * 0.16 + I.ascender * sc, x0 = (s - g.adv * sc) / 2;
  b.classList.toggle('empty', !g.contours.length && k !== ' '); b.classList.toggle('cur', k === cur); if (g.mark) b.dataset.mark = g.mark; else delete b.dataset.mark; b.classList.toggle('comp', !!g.comp);
  c.strokeStyle = COL.line; c.lineWidth = 1; c.beginPath(); c.moveTo(6, Math.round(base) + .5); c.lineTo(s - 6, Math.round(base) + .5); c.stroke();
  if (!g.contours.length) { if (k !== ' ') { c.fillStyle = COL.guide; c.font = `${Math.round(I.capHeight * sc * 1.38)}px 'Golos Text', sans-serif`; c.textAlign = 'center'; c.fillText(ghostText(k), s / 2, base); } return; }
  fillGlyph(c, g, (x, y) => [x0 + x * sc, base - y * sc], COL.ink);
}
function drawAllCards() { if (!font) return; for (const b of $('#grid').children) drawCard(b); }
function refreshGrid() {
  for (const k of dirtyCards) { const b = $('#grid').querySelector(`[data-k="${CSS.escape(k)}"]`); if (b) drawCard(b); }
  dirtyCards.clear();
  $$('.gcard.cur').forEach(b => { if (b.dataset.k !== cur) drawCard(b); });
  const cb = $('#grid').querySelector(`[data-k="${CSS.escape(cur)}"]`); if (cb) drawCard(cb);
  applyFilter();
}
$('#grid').addEventListener('click', e => { const b = e.target.closest('.gcard'); if (!b) return; if (bulkClick(e, b)) return; openGlyph(b.dataset.k); setTab('editor'); });
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; gFilter = b.dataset.f; $$('.chip').forEach(c => c.setAttribute('aria-pressed', c === b)); applyFilter(); });
$('#gsearch').addEventListener('input', e => { gSearch = e.target.value; applyFilter(); });
function addGlyph(ch) {
  if (!ch) { toast(T('Введите один символ или код вида U+0416')); return; }
  if (!font.glyphs[ch]) { font.glyphs[ch] = L.newGlyph(ch, 560); font.order.push(ch); buildGrid(); touch(ch); toast(T('Глиф {0} добавлен', show(ch))); }
  openGlyph(ch); setTab('editor');
}

/* ======================= EDITOR ======================= */
const cv = $('#cv'), cx = cv.getContext('2d');
const ed = { w: 0, h: 0, scale: .5, ox: 0, oy: 0, tool: 'select', sel: new Set(), drag: null, pen: null, fill: false, grid: true, snap: false, ghost: true, ctx: '', bg: null, bgOp: .35, bgSc: 1, bgX: 0, bgY: 0, space: false, needFit: true, hover: null, mouse: null, smart: true, guides: null, touch: false, multi: false, measure: null, bgMask: null };
const curG = () => layerOf(font.glyphs[cur]);
const toS = (x, y) => [ed.ox + x * ed.scale, ed.oy - y * ed.scale];
const toF = (sx, sy) => [(sx - ed.ox) / ed.scale, (ed.oy - sy) / ed.scale];
const undo = { st: {}, clear() { this.st = {}; }, s(k) { return this.st[k] || (this.st[k] = { u: [], r: [] }); } };
function snapshot(g) { return JSON.stringify({ adv: g.adv, contours: g.contours, refs: g.refs || null, anchors: Object.prototype.hasOwnProperty.call(g, 'anchors') ? g.anchors : null }); }
function pushUndo() { const s = undo.s(ukey()); s.u.push(snapshot(curG())); if (s.u.length > 200) s.u.shift(); s.r.length = 0; return true; }
function dropUndo() { undo.s(ukey()).u.pop(); }
function restore(json) { const g = curG(), o = JSON.parse(json); g.adv = o.adv; g.contours = o.contours; if (g === font.glyphs[cur]) { if (o.anchors) g.anchors = o.anchors; else delete g.anchors; } if (g !== font.glyphs[cur]) { /* layer: no refs */ } else if (o.refs && o.refs.length) g.refs = o.refs; else delete g.refs; ed.sel.clear(); ed.pen = null; }
function doUndo() { const s = undo.s(ukey()); if (!s.u.length) return; s.r.push(snapshot(curG())); restore(s.u.pop()); changed(); }
function doRedo() { const s = undo.s(ukey()); if (!s.r.length) return; s.u.push(snapshot(curG())); restore(s.r.pop()); changed(); }
function changed() { touch(cur); propagate(cur); edDraw(); refreshPanel(); }
function openGlyph(k) {
  if (!font.glyphs[k]) return;
  endPen(); const prev = cur; cur = k; ed.sel.clear(); ed.needFit = true; $('#chkOut').hidden = true; $('#bFixAll').hidden = true; dirtyCards.add(prev); dirtyCards.add(k);
  if (tab === 'editor') { edDraw(); refreshPanel(); }
}
function stepGlyph(d) { const i = font.order.indexOf(cur); const n = font.order.length; openGlyph(font.order[(i + d + n) % n]); }

function edResize() {
  const r = $('#cwrap').getBoundingClientRect(); if (!r.width || !r.height) return;
  const d = DPR(); ed.w = r.width; ed.h = r.height; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
}
function fitView() {
  const g = curG(), I = font.info, top = I.ascender + 80, bot = I.descender - 80;
  ed.scale = Math.min(ed.h * 0.92 / (top - bot), ed.w * 0.86 / Math.max(g.adv, 420));
  ed.ox = (ed.w - g.adv * ed.scale) / 2; ed.oy = (ed.h - (top - bot) * ed.scale) / 2 + top * ed.scale; ed.needFit = false;
}
new ResizeObserver(() => { if (tab !== 'editor') return; edResize(); ed.needFit = true; edDraw(); }).observe($('#cwrap'));

function selList() { return [...ed.sel].map(k => k.split(',').map(Number)).filter(([ci, ni]) => curG().contours[ci] && curG().contours[ci][ni]); }
function selContours() { return [...new Set(selList().map(a => a[0]))]; }
function node(ci, ni) { return curG().contours[ci][ni]; }

function edDraw() {
  if (!font || !ed.w) return;
  if (ed.needFit) fitView();
  const g = curG(), I = font.info, d = DPR(), W = ed.w, H = ed.h, sc = ed.scale;
  cx.setTransform(d, 0, 0, d, 0, 0); cx.fillStyle = COL.canvas; cx.fillRect(0, 0, W, H);
  // grid
  if (ed.grid) {
    const steps = [10, 20, 50, 100, 200]; let st = steps.find(s => s * sc >= 9) || 200;
    const [fx0, fy1] = toF(0, 0), [fx1, fy0] = toF(W, H);
    cx.lineWidth = 1;
    for (let x = Math.floor(fx0 / st) * st; x <= fx1; x += st) { const sx = Math.round(toS(x, 0)[0]) + .5; cx.strokeStyle = x % 100 === 0 ? COL.grid2 : COL.grid; cx.beginPath(); cx.moveTo(sx, 0); cx.lineTo(sx, H); cx.stroke(); }
    for (let y = Math.floor(fy0 / st) * st; y <= fy1; y += st) { const sy = Math.round(toS(0, y)[1]) + .5; cx.strokeStyle = y % 100 === 0 ? COL.grid2 : COL.grid; cx.beginPath(); cx.moveTo(0, sy); cx.lineTo(W, sy); cx.stroke(); }
  }
  // sketch underlay
  if (ed.bg) { const img = ed.bg, h = (I.ascender - I.descender) * ed.bgSc, w = img.width / img.height * h; const [sx, sy] = toS(ed.bgX, I.ascender + ed.bgY); cx.globalAlpha = ed.bgOp; cx.drawImage(img, sx, sy, w * sc, h * sc); if (ed.bgMask) { cx.globalAlpha = Math.min(.6, ed.bgOp + .15); cx.drawImage(ed.bgMask, sx, sy, w * sc, h * sc); } cx.globalAlpha = 1; }
  // metrics
  const lines = [[I.ascender, T('выносные')], [I.capHeight, T('прописные')], [I.xHeight, T('строчные')], [0, T('база')], [I.descender, T('нижние')]];
  cx.font = "10px 'IBM Plex Mono', monospace"; cx.textBaseline = 'bottom';
  for (const [y, nm] of lines) { const sy = Math.round(toS(0, y)[1]) + .5; cx.strokeStyle = y === 0 ? COL.mute : COL.guide; cx.lineWidth = 1; cx.setLineDash(y === 0 ? [] : [4, 4]); cx.beginPath(); cx.moveTo(0, sy); cx.lineTo(W, sy); cx.stroke(); cx.setLineDash([]); cx.fillStyle = COL.mute; cx.fillText(nm + ' ' + y, 8, sy - 3); }
  drawOvershootZones(); drawUnderLayer(g);
  // advance box
  const [ax0] = toS(0, 0), [ax1] = toS(g.adv, 0), [, ty] = toS(0, I.ascender), [, by] = toS(0, I.descender);
  cx.fillStyle = COL['accent-soft']; cx.globalAlpha = .45; cx.fillRect(ax0, ty, ax1 - ax0, by - ty); cx.globalAlpha = 1;
  cx.strokeStyle = COL.mute; cx.lineWidth = 1; for (const x of [ax0, ax1]) { cx.beginPath(); cx.moveTo(Math.round(x) + .5, ty - 10); cx.lineTo(Math.round(x) + .5, by + 10); cx.stroke(); }
  cx.fillStyle = COL.mute; cx.textBaseline = 'top'; cx.fillText(String(Math.round(g.adv)), ax1 - cx.measureText(String(Math.round(g.adv))).width - 4, by + 4);
  // ghost hint
  if (ed.ghost && cur !== ' ') { cx.fillStyle = COL.guide; cx.globalAlpha = g.contours.length ? .12 : .35; cx.font = `${Math.round(I.capHeight * 1.42 * sc)}px 'Golos Text', sans-serif`; cx.textBaseline = 'alphabetic'; const gt = ghostText(cur), tw = cx.measureText(gt).width; cx.fillText(gt, ax0 + (ax1 - ax0 - tw) / 2, toS(0, 0)[1]); cx.globalAlpha = 1; }
  // context glyphs
  if (ed.ctx) {
    const parts = ed.ctx.split('*'), left = [...(parts.length > 1 ? parts[0] : ed.ctx)], right = [...(parts.length > 1 ? parts.slice(1).join('') : ed.ctx)];
    cx.fillStyle = COL.ink; cx.globalAlpha = .28;
    let x = 0, nxt = cur;
    for (let i = left.length - 1; i >= 0; i--) { const gg = font.glyphs[left[i]]; if (!gg) continue; x -= gg.adv + kv(left[i], nxt); const ox = x; cx.fill(glyphPath(gg, (a, b) => toS(ox + a, b))); nxt = left[i]; }
    x = g.adv; let prv = cur;
    for (const ch of right) { const gg = font.glyphs[ch]; if (!gg) continue; x += kv(prv, ch); const ox = x; cx.fill(glyphPath(gg, (a, b) => toS(ox + a, b))); x += gg.adv; prv = ch; }
    cx.globalAlpha = 1;
  }
  // glyph
  const path = glyphPath(g, toS, ed.pen);
  if (ed.fill) { cx.fillStyle = COL.ink; cx.fill(path); }
  else { cx.fillStyle = COL.ink; cx.globalAlpha = .1; cx.fill(path); cx.globalAlpha = 1; cx.strokeStyle = COL.ink; cx.lineWidth = 1.25; cx.stroke(path); }
  drawEdLayers(g);
  // shape preview
  if (ed.drag && ed.drag.type === 'shape') { cx.strokeStyle = COL.accent; cx.lineWidth = 1.25; cx.setLineDash([5, 4]); cx.stroke(glyphPath({ contours: [shapeContour(ed.drag)] }, toS)); cx.setLineDash([]); }
  if (!ed.fill) drawNodes(g);
  // pen rubber
  if (ed.tool === 'pen' && ed.pen != null && ed.mouse && !ed.drag) { const c = g.contours[ed.pen], last = c[c.length - 1]; if (last) { const a = toS(last.x, last.y); cx.strokeStyle = COL.accent; cx.lineWidth = 1; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(ed.mouse[0], ed.mouse[1]); cx.stroke(); cx.setLineDash([]); } }
  // marquee
  if (ed.drag && ed.drag.type === 'marquee') { const [a, b] = [ed.drag.a, ed.drag.b]; cx.fillStyle = COL['accent-soft']; cx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); cx.strokeStyle = COL.accent; cx.lineWidth = 1; cx.strokeRect(a[0] + .5, a[1] + .5, b[0] - a[0], b[1] - a[1]); }
  drawExtras(g);
  if (ed.touch && ed.drag && ed.mouse && (ed.drag.type === 'nodes' || ed.drag.type === 'handle' || ed.drag.type === 'pen') && (ed.drag.armed || ed.drag.type === 'pen')) drawLoupe(ed.mouse);
  $('#stZoom').textContent = Math.round(sc * 100) + '%';
}
function drawNodes(g) {
  const sel = ed.sel;
  cx.lineWidth = 1;
  g.contours.forEach((c, ci) => {
    if (L.isComp(c)) return;
    c.forEach((n, ni) => {
      const p = toS(n.x, n.y);
      for (const h of [n.i, n.o]) if (h) { const q = toS(h[0], h[1]); cx.strokeStyle = COL.mute; cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(q[0], q[1]); cx.stroke(); cx.fillStyle = COL.canvas; cx.strokeStyle = COL.accent; cx.beginPath(); cx.arc(q[0], q[1], COARSE ? 4.6 : 3.2, 0, 7); cx.fill(); cx.stroke(); }
    });
  });
  g.contours.forEach((c, ci) => {
    if (L.isComp(c)) return;
    c.forEach((n, ni) => {
      const p = toS(n.x, n.y), on = sel.has(ci + ',' + ni), hv = ed.hover && ed.hover.ci === ci && ed.hover.ni === ni;
      cx.fillStyle = on ? COL.accent : COL.canvas; cx.strokeStyle = on || hv ? COL.accent : COL.ink; cx.lineWidth = hv ? 2 : 1.25;
      const nz = COARSE ? 1.45 : 1; cx.beginPath(); if (n.s) cx.arc(p[0], p[1], 4.2 * nz, 0, 7); else cx.rect(p[0] - 3.8 * nz, p[1] - 3.8 * nz, 7.6 * nz, 7.6 * nz); cx.fill(); cx.stroke();
    });
    if (c.length > 1 && ci !== ed.pen) { // direction marker on first node
      const s = L.segOf(c, 0), a = toS(c[0].x, c[0].y), t = L.bez(s.b, 0.02), q = toS(t[0], t[1]); let dx = q[0] - a[0], dy = q[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const bx = a[0] + dx * 10, by = a[1] + dy * 10; cx.fillStyle = COL.accent; cx.beginPath(); cx.moveTo(bx + dx * 5, by + dy * 5); cx.lineTo(bx - dy * 4, by + dx * 4); cx.lineTo(bx + dy * 4, by - dx * 4); cx.closePath(); cx.fill();
    }
  });
}
/* hit testing */
function hitNode(sx, sy) {
  const g = curG(); let best = null, bd = 8 * HR();
  g.contours.forEach((c, ci) => c.forEach((n, ni) => {
    if (n.r) return; const p = toS(n.x, n.y), d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = { ci, ni, part: 'node' }; }
  }));
  if (best) return best;
  bd = 7 * HR();
  g.contours.forEach((c, ci) => c.forEach((n, ni) => {
    if (n.r) return; for (const part of ['i', 'o']) if (n[part]) { const q = toS(n[part][0], n[part][1]), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd) { bd = d; best = { ci, ni, part }; } }
  }));
  return best;
}
function hitSegment(sx, sy) {
  const g = curG(); let best = null, bd = 7 * HR();
  g.contours.forEach((c, ci) => {
    if (c.length < 2 || L.isComp(c)) return; const n = ci === ed.pen ? c.length - 1 : c.length;
    for (let si = 0; si < n; si++) {
      const s = L.segOf(c, si); let prev = toS(...s.b[0]);
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, p = toS(...L.bez(s.b, t)), vx = p[0] - prev[0], vy = p[1] - prev[1], ll = vx * vx + vy * vy || 1;
        let u = ((sx - prev[0]) * vx + (sy - prev[1]) * vy) / ll; u = Math.max(0, Math.min(1, u));
        const d = Math.hypot(prev[0] + vx * u - sx, prev[1] + vy * u - sy);
        if (d < bd) { bd = d; best = { ci, si, t: (k - 1 + u) / 24 }; } prev = p;
      }
    }
  });
  return best;
}
function hitContour(fx, fy) {
  const g = curG(); let best = -1, ba = Infinity;
  g.contours.forEach((c, ci) => { const r = L.flatten(c, 8); if (r.length > 2 && L.pointInRing([fx, fy], r)) { const a = Math.abs(L.ringArea(r)); if (a < ba) { ba = a; best = ci; } } });
  return best;
}
function insertPoint(h) {
  const c = curG().contours[h.ci], a = c[h.si], b = c[(h.si + 1) % c.length], s = L.segOf(c, h.si), t = h.t, lp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  let nd;
  if (!s.curve) { const p = lp(s.b[0], s.b[3]); nd = L.N(Math.round(p[0]), Math.round(p[1])); }
  else { const [p0, p1, p2, p3] = s.b, p01 = lp(p0, p1), p12 = lp(p1, p2), p23 = lp(p2, p3), p012 = lp(p01, p12), p123 = lp(p12, p23), p = lp(p012, p123); a.o = p01; b.i = p23; nd = { x: p[0], y: p[1], i: p012, o: p123, s: true }; L.roundC([a, b, nd]); }
  c.splice(h.si + 1, 0, nd); ed.sel = new Set([h.ci + ',' + (h.si + 1)]);
}
function metricSnapY(y) { const I = font.info; for (const m of [0, I.xHeight, I.capHeight, I.ascender, I.descender]) if (Math.abs(y - m) * ed.scale < 6) return m; return y; }
function snapV(v) { return ed.snap ? Math.round(v / 10) * 10 : Math.round(v); }
function shapeContour(d) {
  let [x0, y0] = d.a, [x1, y1] = d.b;
  if (d.shift) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  if (d.tool === 'rect') return L.rectC(ax, ay, bx, by);
  return L.roundC(L.ellipseC((ax + bx) / 2, (ay + by) / 2, (bx - ax) / 2, (by - ay) / 2));
}
function endPen() {
  if (ed.pen == null) return; const g = font && curG(); if (g && g.contours[ed.pen] && g.contours[ed.pen].length < 2) g.contours.splice(ed.pen, 1);
  ed.pen = null; if (g) touch(cur);
}
function setTool(t) { if (t !== 'pen') endPen(); if (t !== 'measure') ed.measure = null; if (t !== 'knife') ed.knife = null; ed.tool = t; $$('.tool[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t)); cv.style.cursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : (t === 'brush' || t === 'erase') ? 'none' : 'crosshair'; edDraw(); }
$('#rail').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

const ptrs = new Map(); let pinch = null;
function loc(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const [sx, sy] = loc(e); ptrs.set(e.pointerId, [sx, sy]); ed.touch = e.pointerType === 'touch'; clearTimeout(lpT);
  if (ptrs.size >= 3) { if (pinch) pinch.tri = true; return; }
  if (ptrs.size === 2) { if (ed.drag && ed.drag.undo && !ed.drag.moved) dropUndo(); ed.drag = null; clearTimeout(lpT); const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], scale: ed.scale, ox: ed.ox, oy: ed.oy, t0: performance.now(), st: new Map([...ptrs].map(([id, p]) => [id, p.slice()])), moved: false }; return; }
  const [fx, fy] = toF(sx, sy), g = curG();
  if (e.button === 1 || ed.tool === 'hand' || ed.space) { ed.drag = { type: 'pan', sx, sy, ox: ed.ox, oy: ed.oy }; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  if (ed.tool === 'select') {
    const ah = hitAnchor(sx, sy); if (ah) { startAnchorDrag(ah, fx, fy); return; }
    const h = hitNode(sx, sy);
    if (h) {
      const k = h.ci + ',' + h.ni, n = node(h.ci, h.ni);
      if (e.altKey && h.part === 'node') { pushUndo(); toggleSmooth([[h.ci, h.ni]]); changed(); return; }
      if (h.part === 'node') { if (e.shiftKey || ed.multi) { ed.sel.has(k) ? ed.sel.delete(k) : ed.sel.add(k); } else if (!ed.sel.has(k)) ed.sel = new Set([k]); }
      pushUndo();
      ed.drag = { type: h.part === 'node' ? 'nodes' : 'handle', h, start: [fx, fy], moved: false, undo: true, orig: origOf(), pn: { x: n.x, y: n.y }, ss: [sx, sy], armed: !ed.touch };
      if (ed.touch && h.part === 'node') lpT = setTimeout(() => longPress(h), 480);
    } else {
      const ci = hitContour(fx, fy);
      if (ci >= 0 && L.isComp(curG().contours[ci])) { startRefDrag(ci, fx, fy); edDraw(); refreshPanel(); return; }
      if (ci >= 0) {
        const keys = curG().contours[ci].map((_, ni) => ci + ',' + ni);
        if (e.shiftKey || ed.multi) keys.forEach(k => ed.sel.add(k)); else if (!keys.every(k => ed.sel.has(k))) ed.sel = new Set(keys);
        pushUndo(); const n0 = curG().contours[ci][0];
        ed.drag = { type: 'nodes', start: [fx, fy], moved: false, undo: true, orig: origOf(), pn: { x: n0.x, y: n0.y }, ss: [sx, sy], armed: !ed.touch };
      } else { if (!e.shiftKey && !ed.multi) ed.sel.clear(); ed.drag = { type: 'marquee', a: [sx, sy], b: [sx, sy], base: new Set(ed.sel) }; }
    }
  } else if (ed.tool === 'pen') {
    if (ed.pen != null) {
      const c = g.contours[ed.pen], f0 = toS(c[0].x, c[0].y);
      if (c.length > 2 && Math.hypot(f0[0] - sx, f0[1] - sy) < 9 * HR()) { pushUndo(); ed.pen = null; ed.sel = new Set(); changed(); toast(T('Контур замкнут')); return; }
    } else {
      const sg = hitSegment(sx, sy); if (sg) { pushUndo(); insertPoint(sg); changed(); return; }
      pushUndo(); g.contours.push([]); ed.pen = g.contours.length - 1;
    }
    if (ed.pen != null && g.contours[ed.pen].length) pushUndo();
    const c = g.contours[ed.pen]; let px = snapV(fx), py = snapV(metricSnapY(fy)); [px, py] = smartSnap(px, py, guideSets(false));
    if (e.shiftKey && c.length) { const l = c[c.length - 1], v = angleSnapV(px - l.x, py - l.y); px = Math.round(l.x + v[0]); py = Math.round(l.y + v[1]); }
    c.push(L.N(px, py)); ed.sel = new Set([ed.pen + ',' + (c.length - 1)]);
    ed.drag = { type: 'pen', ci: ed.pen, ni: c.length - 1, start: [sx, sy], moved: false };
  } else if (ed.tool === 'brush' || ed.tool === 'erase') {
    ed.drag = { type: 'stroke', erase: ed.tool === 'erase', pts: [[fx, fy, brushR(e)]] };
  } else if (ed.tool === 'measure') {
    ed.measure = { a: [fx, fy], b: [fx, fy] }; ed.drag = { type: 'measure' };
  } else if (ed.tool === 'knife') {
    ed.knife = { a: [fx, fy], b: [fx, fy] }; ed.drag = { type: 'knife' };
  } else if (ed.tool === 'rect' || ed.tool === 'ellipse') {
    const p = [snapV(fx), snapV(metricSnapY(fy))]; ed.drag = { type: 'shape', tool: ed.tool, a: p, b: p, shift: e.shiftKey };
  }
  edDraw(); refreshPanel();
});
function origOf() { const m = new Map(); for (const [ci, ni] of selList()) { const n = node(ci, ni); m.set(ci + ',' + ni, { x: n.x, y: n.y, i: n.i && [...n.i], o: n.o && [...n.o] }); } return m; }
cv.addEventListener('pointermove', e => {
  const [sx, sy] = loc(e); ed.mouse = [sx, sy];
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [sx, sy]);
  const [fx, fy] = toF(sx, sy); $('#stPos').textContent = `x ${Math.round(fx)}  y ${Math.round(fy)}`;
  if (pinch && ptrs.has(e.pointerId) && pinch.st.has(e.pointerId) && Math.hypot(sx - pinch.st.get(e.pointerId)[0], sy - pinch.st.get(e.pointerId)[1]) > 14) pinch.moved = true;
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k = d / pinch.d; ed.scale = Math.max(.03, Math.min(8, pinch.scale * k)); const kk = ed.scale / pinch.scale; ed.ox = c[0] - (pinch.c[0] - pinch.ox) * kk; ed.oy = c[1] - (pinch.c[1] - pinch.oy) * kk; edDraw(); return; }
  const dr = ed.drag;
  if (!dr) { if (ed.tool === 'select') { const h = hitNode(sx, sy); const nh = h && h.part === 'node' ? h : null; if ((nh && (!ed.hover || ed.hover.ci !== nh.ci || ed.hover.ni !== nh.ni)) || (!nh && ed.hover)) { ed.hover = nh; edDraw(); } cv.style.cursor = h ? 'move' : hitContour(fx, fy) >= 0 ? 'move' : 'default'; } else if (ed.tool === 'pen' || ed.tool === 'brush' || ed.tool === 'erase') edDraw(); return; }
  const g = curG();
  if (dr.type === 'pan') { ed.ox = dr.ox + sx - dr.sx; ed.oy = dr.oy + sy - dr.sy; edDraw(); return; }
  if ((dr.type === 'nodes' || dr.type === 'handle') && !dr.armed) { if (Math.hypot(sx - dr.ss[0], sy - dr.ss[1]) < 8) return; dr.armed = true; clearTimeout(lpT); }
  if (dr.type === 'stroke') { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of (evs.length ? evs : [e])) { const [qx, qy] = toF(...loc(ev)), l = dr.pts[dr.pts.length - 1]; if (Math.hypot(qx - l[0], qy - l[1]) * ed.scale >= 2) dr.pts.push([qx, qy, brushR(ev)]); } edDraw(); return; }
  if (dr.type === 'measure') { ed.measure.b = e.shiftKey ? snapAngle(ed.measure.a, [fx, fy]) : [fx, fy]; edDraw(); return; }
  if (dr.type === 'knife') { ed.knife.b = e.shiftKey ? snapAngle(ed.knife.a, [fx, fy]) : [fx, fy]; edDraw(); return; }
  if (dr.type === 'ref') { moveRefDrag(fx, fy, e.shiftKey); return; }
  if (dr.type === 'anchor') { moveAnchorDrag(fx, fy, e.shiftKey); return; }
  if (dr.type === 'nodes') {
    let dx = fx - dr.start[0], dy = fy - dr.start[1];
    if (e.shiftKey) [dx, dy] = angleSnapV(dx, dy);
    let tx = snapV(dr.pn.x + dx), ty = snapV(metricSnapY(dr.pn.y + dy)); if (!dr.gs) dr.gs = guideSets(true); [tx, ty] = smartSnap(tx, ty, dr.gs); dx = tx - dr.pn.x; dy = ty - dr.pn.y;
    for (const [k, o] of dr.orig) { const [ci, ni] = k.split(',').map(Number), n = g.contours[ci][ni]; n.x = o.x + dx; n.y = o.y + dy; n.i = o.i && [o.i[0] + dx, o.i[1] + dy]; n.o = o.o && [o.o[0] + dx, o.o[1] + dy]; }
    dr.moved = dr.moved || dx !== 0 || dy !== 0; edDraw(); refreshPanel(true); return;
  }
  if (dr.type === 'handle') {
    const n = g.contours[dr.h.ci][dr.h.ni], p = dr.h.part, q = p === 'i' ? 'o' : 'i';
    let hx = snapV(fx), hy = snapV(fy);
    if (e.shiftKey) { const v = angleSnapV(hx - n.x, hy - n.y); hx = Math.round(n.x + v[0]); hy = Math.round(n.y + v[1]); }
    n[p] = [hx, hy]; if (e.altKey) n.s = false;
    if (n.s && n[q]) { const L0 = Math.hypot(n[q][0] - n.x, n[q][1] - n.y), vx = n.x - hx, vy = n.y - hy, l = Math.hypot(vx, vy) || 1; n[q] = [Math.round(n.x + vx / l * L0), Math.round(n.y + vy / l * L0)]; }
    dr.moved = true; edDraw(); return;
  }
  if (dr.type === 'marquee') {
    dr.b = [sx, sy]; const x0 = Math.min(dr.a[0], sx), x1 = Math.max(dr.a[0], sx), y0 = Math.min(dr.a[1], sy), y1 = Math.max(dr.a[1], sy);
    ed.sel = new Set(dr.base); g.contours.forEach((c, ci) => c.forEach((n, ni) => { if (n.r) return; const p = toS(n.x, n.y); if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) ed.sel.add(ci + ',' + ni); }));
    edDraw(); return;
  }
  if (dr.type === 'pen') {
    if (Math.hypot(sx - dr.start[0], sy - dr.start[1]) < 3 && !dr.moved) return;
    const n = g.contours[dr.ci][dr.ni], hx = snapV(fx), hy = snapV(fy); n.o = [hx, hy]; n.i = [2 * n.x - hx, 2 * n.y - hy]; n.s = true; dr.moved = true; edDraw(); return;
  }
  if (dr.type === 'shape') { dr.b = [snapV(fx), snapV(metricSnapY(fy))]; dr.shift = e.shiftKey; edDraw(); }
});
function pointerEnd(e) {
  ptrs.delete(e.pointerId); clearTimeout(lpT); if (pinch) { if (ptrs.size === 0) { if (e.type === 'pointerup' && !pinch.moved && performance.now() - pinch.t0 < 380) twoFingerTap(pinch); pinch = null; } return; }
  const dr = ed.drag; ed.drag = null; ed.guides = null; if (!dr) return;
  if (ed.touch && e.type === 'pointerup' && ed.tool === 'select' && (((dr.type === 'nodes' || dr.type === 'handle') && !dr.moved) || (dr.type === 'marquee' && Math.hypot(dr.b[0] - dr.a[0], dr.b[1] - dr.a[1]) < 8))) { const [tx0, ty0] = loc(e); if (checkDoubleTap(tx0, ty0, dr)) return; }
  if (dr.type === 'stroke') { finishStroke(dr); return; }
  if (dr.type === 'measure') { edDraw(); return; }
  if (dr.type === 'knife') { applyKnife(); return; }
  if (dr.type === 'ref') { endRefDrag(dr); return; }
  if (dr.type === 'anchor') { endAnchorDrag(dr); return; }
  if (dr.type === 'pan') { cv.style.cursor = ed.tool === 'hand' ? 'grab' : 'default'; return; }
  if ((dr.type === 'nodes' || dr.type === 'handle') && !dr.moved) { dropUndo(); edDraw(); refreshPanel(); return; }
  if (dr.type === 'shape') {
    if (Math.abs(dr.a[0] - dr.b[0]) < 4 || Math.abs(dr.a[1] - dr.b[1]) < 4) { edDraw(); return; }
    pushUndo(); const c = shapeContour(dr); curG().contours.push(c); const ci = curG().contours.length - 1; ed.sel = new Set(c.map((_, ni) => ci + ',' + ni));
  }
  if (dr.type === 'marquee') { edDraw(); refreshPanel(); return; }
  changed();
}
cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('pointerleave', () => { ed.mouse = null; if (ed.hover) { ed.hover = null; edDraw(); } });
cv.addEventListener('dblclick', e => {
  if (ed.tool !== 'select' || ed.touch) return; const [sx, sy] = loc(e);
  if (hitNode(sx, sy)) return; const sg = hitSegment(sx, sy); if (!sg) return; pushUndo(); insertPoint(sg); changed();
});
cv.addEventListener('wheel', e => {
  e.preventDefault(); const [sx, sy] = loc(e);
  const m = e.deltaMode === 1 ? 16 : 1, dY = e.deltaY * m, dX = e.deltaX * m;
  if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(dX) < 0.5)) {
    const k = Math.exp(-dY * (e.ctrlKey ? 0.01 : 0.0018)), ns = Math.max(.03, Math.min(8, ed.scale * k)), kk = ns / ed.scale;
    ed.ox = sx - (sx - ed.ox) * kk; ed.oy = sy - (sy - ed.oy) * kk; ed.scale = ns;
  } else { ed.ox -= e.shiftKey && !dX ? dY : dX; ed.oy -= e.shiftKey && !dX ? 0 : dY; }
  edDraw();
}, { passive: false });

/* node ops */
function targetKeys() { const s = selList(); if (s.length) return s; const out = []; curG().contours.forEach((c, ci) => { if (!L.isComp(c)) c.forEach((_, ni) => out.push([ci, ni])); }); return out; }
function toggleSmooth(list) {
  for (const [ci, ni] of list) { const n = node(ci, ni); n.s = !n.s; if (n.s && n.i && n.o) { const a = Math.atan2(n.o[1] - n.i[1], n.o[0] - n.i[0]), li = Math.hypot(n.i[0] - n.x, n.i[1] - n.y), lo = Math.hypot(n.o[0] - n.x, n.o[1] - n.y); n.i = [Math.round(n.x - Math.cos(a) * li), Math.round(n.y - Math.sin(a) * li)]; n.o = [Math.round(n.x + Math.cos(a) * lo), Math.round(n.y + Math.sin(a) * lo)]; } }
}
function deleteNodes() {
  const s = selList(); if (!s.length) return; pushUndo(); const g = curG(); const by = {};
  for (const [ci, ni] of s) (by[ci] = by[ci] || []).push(ni);
  const kill = [];
  for (const ci in by) { const c = g.contours[ci]; by[ci].sort((a, b) => b - a).forEach(ni => c.splice(ni, 1)); if (c.length < 2) kill.push(+ci); }
  kill.sort((a, b) => b - a).forEach(ci => g.contours.splice(ci, 1)); if (ed.pen != null && kill.includes(ed.pen)) ed.pen = null;
  ed.sel.clear(); changed();
}
function transform(fn, label) {
  const t = targetKeys(); if (!t.length) return; pushUndo();
  const g = curG(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [ci, ni] of t) { const n = g.contours[ci][ni]; x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const c = [(x0 + x1) / 2, (y0 + y1) / 2], f = p => fn(p, c);
  for (const [ci, ni] of t) { const n = g.contours[ci][ni]; [n.x, n.y] = f([n.x, n.y]); if (n.i) n.i = f(n.i); if (n.o) n.o = f(n.o); L.roundC([n]); }
  return t;
}
function flip(h) {
  const t = transform((p, c) => h ? [2 * c[0] - p[0], p[1]] : [p[0], 2 * c[1] - p[1]]); if (!t) return;
  const g = curG(), counts = {}; for (const [ci] of t) counts[ci] = (counts[ci] || 0) + 1;
  for (const ci in counts) if (counts[ci] === g.contours[ci].length) g.contours[ci] = L.reverseC(g.contours[ci]);
  ed.sel.clear(); changed();
}
function boolOp(op) {
  const g = curG(); const sc = new Set(selContours());
  if (op !== 'union' && !sc.size) { toast(T('Выделите контур, который нужно вычесть или пересечь')); return; }
  const comps = g.contours.filter(L.isComp), A = g.contours.filter((c, i) => !sc.has(i) && !L.isComp(c)), B = g.contours.filter((_, i) => sc.has(i));
  try { pushUndo(); const res = op === 'union' ? L.booleanOp('union', g.contours.filter(c => !L.isComp(c)), []) : L.booleanOp(op, A, B); g.contours = res.concat(comps); ed.sel.clear(); ed.pen = null; changed(); toast(T('Готово: {0} конт.', res.length)); }
  catch (err) { dropUndo(); toast(err.message || T('Операция не удалась')); }
}
let clip = null;
function copySel(cut) { const sc = selContours(); if (!sc.length) return; clip = sc.map(ci => L.cloneC(curG().contours[ci])); if (cut) { pushUndo(); curG().contours = curG().contours.filter((_, i) => !sc.includes(i)); ed.sel.clear(); changed(); } toast(cut ? T('Вырезано') : T('Скопировано: {0} конт.', clip.length)); }
function paste() { if (!clip) return; pushUndo(); const g = curG(), base = g.contours.length; clip.forEach(c => g.contours.push(L.cloneC(c))); ed.sel = new Set(); clip.forEach((c, k) => c.forEach((_, ni) => ed.sel.add((base + k) + ',' + ni))); changed(); }

/* side panel */
function refreshPanel(light) {
  if (!font) return; const g = curG();
  $('#curG').textContent = show(cur); $('#pBig').textContent = show(cur); $('#pUni').textContent = hex(cur);
  const bb = L.bounds(g.contours);
  const setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  setv('#pAdv', Math.round(g.adv)); setv('#pLsb', bb ? Math.round(bb.x0) : ''); setv('#pRsb', bb ? Math.round(g.adv - bb.x1) : '');
  if (!light) setv('#pName', g.name);
  const s = selList();
  if (s.length === 1) { const n = node(...s[0]); $('#lX').textContent = T('X точки'); $('#lY').textContent = T('Y точки'); setv('#pX', Math.round(n.x)); setv('#pY', Math.round(n.y)); }
  else if (s.length > 1) { let x0 = Infinity, y0 = Infinity; for (const [ci, ni] of s) { const n = node(ci, ni); x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); } $('#lX').textContent = T('X группы'); $('#lY').textContent = T('Y группы'); setv('#pX', Math.round(x0)); setv('#pY', Math.round(y0)); }
  else { $('#lX').textContent = 'X'; $('#lY').textContent = 'Y'; setv('#pX', ''); setv('#pY', ''); }
  $('#pX').disabled = $('#pY').disabled = !s.length; syncWH(s);
  $('#stSel').textContent = s.length ? T('выделено точек: {0}, контуров: {1}', s.length, selContours().length) : T('контуров: {0}', g.contours.length);
  refreshExtra(g);
}
function numIn(id, fn) { const el = $(id); el.addEventListener('change', () => { const v = parseFloat(el.value); if (!isFinite(v)) { refreshPanel(); return; } fn(v); }); el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); }); }
numIn('#pAdv', v => { pushUndo(); curG().adv = Math.max(0, Math.round(v)); changed(); });
numIn('#pLsb', v => { const g = curG(), bb = L.bounds(g.contours); if (!bb) return; pushUndo(); const d = Math.round(v - bb.x0); L.translate(g.contours, d, 0); g.adv += d; changed(); });
numIn('#pRsb', v => { const g = curG(), bb = L.bounds(g.contours); if (!bb) return; pushUndo(); g.adv = Math.round(bb.x1 + v); changed(); });
numIn('#pX', v => { const s = selList(); if (!s.length) return; let x0 = Infinity; for (const [ci, ni] of s) x0 = Math.min(x0, node(ci, ni).x); const d = Math.round(v - x0); moveSel(d, 0); });
numIn('#pY', v => { const s = selList(); if (!s.length) return; let y0 = Infinity; for (const [ci, ni] of s) y0 = Math.min(y0, node(ci, ni).y); const d = Math.round(v - y0); moveSel(0, d); });
function moveSel(dx, dy) { const s = selList(); if (!s.length) return; pushUndo(); for (const [ci, ni] of s) { const n = node(ci, ni); n.x += dx; n.y += dy; if (n.i) n.i = [n.i[0] + dx, n.i[1] + dy]; if (n.o) n.o = [n.o[0] + dx, n.o[1] + dy]; } changed(); }
$('#pName').addEventListener('change', e => { const v = e.target.value.trim().replace(/[^A-Za-z0-9._]/g, ''); if (v) { curG().name = v; touch(cur); } refreshPanel(); });
$('#bCenter').addEventListener('click', () => { const g = curG(), bb = L.bounds(g.contours); if (!bb) return; pushUndo(); const side = Math.round((g.adv - (bb.x1 - bb.x0)) / 2); L.translate(g.contours, Math.round(side - bb.x0), 0); changed(); });
$('#bMetricsFrom').addEventListener('click', () => {
  const ch = parseChar($('#mFrom').value), src = ch && font.glyphs[ch]; if (!src) { toast(T('Укажите глиф-образец, например H')); return; }
  const sb = L.bounds(src.contours), g = curG(), bb = L.bounds(g.contours); if (!sb || !bb) return; pushUndo();
  const lsb = Math.round(sb.x0), rsb = Math.round(src.adv - sb.x1); L.translate(g.contours, Math.round(lsb - bb.x0), 0); g.adv = Math.round(lsb + (bb.x1 - bb.x0) + rsb); changed();
});
$('#bSmooth').addEventListener('click', () => { const s = selList(); if (!s.length) return; pushUndo(); toggleSmooth(s); changed(); });
$('#bRetract').addEventListener('click', () => { const s = selList(); if (!s.length) return; pushUndo(); for (const [ci, ni] of s) { const n = node(ci, ni); n.i = n.o = null; n.s = false; } changed(); });
$('#bStart').addEventListener('click', () => { const s = selList(); if (s.length !== 1) { toast(T('Выделите одну точку')); return; } pushUndo(); const [ci, ni] = s[0], c = curG().contours[ci]; curG().contours[ci] = c.slice(ni).concat(c.slice(0, ni)); ed.sel = new Set([ci + ',0']); changed(); });
$('#bDelNodes').addEventListener('click', deleteNodes);
$('#bReverse').addEventListener('click', () => { const g = curG(), sc = selContours(), list = sc.length ? sc : g.contours.map((_, i) => i).filter(i => !L.isComp(g.contours[i])); pushUndo(); list.forEach(ci => g.contours[ci] = L.reverseC(g.contours[ci])); ed.sel.clear(); changed(); });
$('#bDirs').addEventListener('click', () => { pushUndo(); const g = curG(); g.contours = L.correctDirections(g.contours.filter(c => !L.isComp(c))).concat(g.contours.filter(L.isComp)); ed.sel.clear(); changed(); toast(T('Внешние контуры против часовой, внутренние по часовой')); });
$('#bRound').addEventListener('click', () => { pushUndo(); curG().contours.forEach(c => L.roundC(c)); curG().adv = Math.round(curG().adv); changed(); });
$('#bUnion').addEventListener('click', () => boolOp('union'));
$('#bSubtract').addEventListener('click', () => boolOp('difference'));
$('#bIntersect').addEventListener('click', () => boolOp('intersection'));
$('#bXor').addEventListener('click', () => boolOp('xor'));
$('#bFlipH').addEventListener('click', () => flip(true));
$('#bFlipV').addEventListener('click', () => flip(false));
$('#bRot').addEventListener('click', () => { const a = (parseFloat($('#tRot').value) || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a); if (transform((p, c) => [c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * si, c[1] + (p[0] - c[0]) * si + (p[1] - c[1]) * co])) changed(); });
$('#bScale').addEventListener('click', () => { const k = (parseFloat($('#tScale').value) || 100) / 100; if (transform((p, c) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k])) changed(); });
$('#bSkew').addEventListener('click', () => { const t = Math.tan((parseFloat($('#tSkew').value) || 0) * Math.PI / 180); if (transform(p => [p[0] + p[1] * t, p[1]])) changed(); });
$('#bCopyFrom').addEventListener('click', () => { const ch = parseChar($('#copyFrom').value), src = ch && font.glyphs[ch]; if (!src || !src.contours.length) { toast(T('В этом глифе нет контуров')); return; } pushUndo(); const g = curG(), base = g.contours.length; src.contours.forEach(c => g.contours.push(L.cloneC(c))); ed.sel = new Set(); src.contours.forEach((c, k) => c.forEach((_, ni) => ed.sel.add((base + k) + ',' + ni))); changed(); });
$('#bgFile').addEventListener('change', e => { loadSketch(e.target.files[0]); e.target.value = ''; });
$('#bBgClear').addEventListener('click', () => { ed.bg = null; ed.bgMask = null; edDraw(); });
for (const [id, key, k] of [['#bgOp', 'bgOp', .01], ['#bgSc', 'bgSc', .01], ['#bgX', 'bgX', 1], ['#bgY', 'bgY', 1]]) $(id).addEventListener('input', e => { ed[key] = +e.target.value * k; edDraw(); });
armed($('#bDelGlyph'), () => { if (font.order.length < 2) return; const k = cur, i = font.order.indexOf(k); decomposeRefsTo(k); font.order.splice(i, 1); delete font.glyphs[k]; for (const p in font.kerning) { const [a, b] = p.split('\t'); if (a === k || b === k) delete font.kerning[p]; } cur = font.order[Math.min(i, font.order.length - 1)]; buildGrid(); touch(); ed.needFit = true; edDraw(); refreshPanel(); toast(T('Глиф удалён')); });
$('#bPrev').addEventListener('click', () => stepGlyph(-1)); $('#bNext').addEventListener('click', () => stepGlyph(1));
$('#bUndo').addEventListener('click', doUndo); $('#bRedo').addEventListener('click', doRedo);
$('#bFit').addEventListener('click', () => { ed.needFit = true; edDraw(); });
$('#jump').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const ch = resolveKey(e.target.value); if (ch && font.glyphs[ch]) { openGlyph(ch); e.target.value = ''; e.target.blur(); } else toast(T('Такого глифа нет. Добавьте его на вкладке «Глифы»')); });
$('#ctxStr').addEventListener('input', e => { ed.ctx = e.target.value; lsSet('litera.ctx', ed.ctx); edDraw(); });
for (const [id, key] of [['#oFill', 'fill'], ['#oGrid', 'grid'], ['#oSnap', 'snap'], ['#oGhost', 'ghost']]) $(id).addEventListener('change', e => { ed[key] = e.target.checked; edDraw(); });

/* ======================= KERNING ======================= */
const kern = { l: 'A', r: 'V', drag: null, test: 'AVATAR WAVY Toyota LT Fly. Try', layout: null, sc: 1 };
const kcv = $('#kcv'), kctx = kcv.getContext('2d'), ktcv = $('#ktcv'), ktctx = ktcv.getContext('2d');
function sizeCanvas(c) { const r = c.parentElement.getBoundingClientRect(), d = DPR(); c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d)); return [r.width, r.height]; }
function kernResize() { sizeCanvas(kcv); sizeCanvas(ktcv); }
new ResizeObserver(() => { if (tab === 'kern') { kernResize(); drawKern(); } }).observe($('#kstage'));
function syncKernInputs() { $('#kL').value = show(kern.l); $('#kR').value = show(kern.r); const v = font ? kv(kern.l, kern.r) : 0; $('#kRange').value = v; const el = $('#kVal'); el.textContent = (v > 0 ? '+' : '') + v; el.className = 'kval ' + (v < 0 ? 'val n' : v > 0 ? 'val p' : ''); kernSrcLabel(); }
function ctxFor(ch, side) { const up = L.isUpperish(ch), cy = L.isCyr(ch); const H = cy ? 'Н' : 'H', O = cy ? 'О' : 'O', n = cy ? 'н' : 'n', o = cy ? 'о' : 'o'; const a = up ? H + O + H : n + o + n; const ok = [...a].every(c => font.glyphs[c] && font.glyphs[c].contours.length); const s = ok ? a : (up ? 'HOH' : 'non'); return side === 'l' ? s : [...s].reverse().join(''); }
function drawKern() {
  if (!font) return; const d = DPR(), W = kcv.width / d, H = kcv.height / d; if (!W) return;
  kernWordsSync(); syncKernInputs();
  const lc = ctxFor(kern.l, 'l'), rc = ctxFor(kern.r, 'r'), lay = layoutKeys([...lc, kern.l, kern.r, ...rc], true), I = font.info;
  const sc = Math.min(H * 0.74 / (I.ascender - I.descender), W * 0.9 / Math.max(lay.width, 1)); kern.sc = sc;
  const x0 = (W - lay.width * sc) / 2, base = (H - (I.ascender - I.descender) * sc) / 2 + I.ascender * sc;
  kctx.setTransform(d, 0, 0, d, 0, 0); kctx.fillStyle = COL.canvas; kctx.fillRect(0, 0, W, H);
  kctx.strokeStyle = COL.guide; kctx.lineWidth = 1; kctx.setLineDash([4, 4]); for (const y of [0, I.xHeight, I.capHeight]) { const sy = Math.round(base - y * sc) + .5; kctx.beginPath(); kctx.moveTo(0, sy); kctx.lineTo(W, sy); kctx.stroke(); } kctx.setLineDash([]);
  const li = [...lc].length;
  lay.items.forEach((it, i) => { if (!it.g) return; const pair = i === li || i === li + 1; kctx.fillStyle = pair ? COL.ink : COL.mute; kctx.globalAlpha = pair ? 1 : .45; kctx.fill(glyphPath(it.g, (x, y) => [x0 + (it.x + x) * sc, base - y * sc])); });
  kctx.globalAlpha = 1;
  const it = lay.items[li + 1]; if (it) {
    const v = kv(kern.l, kern.r), xb = x0 + it.x * sc, xa = x0 + (it.x - v) * sc, y = base + (-I.descender) * sc * .45;
    kctx.strokeStyle = v < 0 ? COL.neg : v > 0 ? COL.pos : COL.guide; kctx.fillStyle = kctx.strokeStyle; kctx.lineWidth = 2;
    kctx.beginPath(); kctx.moveTo(xa, y - 6); kctx.lineTo(xa, y); kctx.lineTo(xb, y); kctx.lineTo(xb, y - 6); kctx.stroke();
    kctx.font = "500 12px 'IBM Plex Mono', monospace"; kctx.textAlign = 'center'; kctx.textBaseline = 'top'; kctx.fillText((v > 0 ? '+' : '') + v, (xa + xb) / 2, y + 5); kctx.textAlign = 'left';
  }
  drawKernTest();
}
function drawKernTest() {
  const d = DPR(), W = ktcv.width / d, H = ktcv.height / d; if (!W) return;
  ktctx.setTransform(d, 0, 0, d, 0, 0); ktctx.fillStyle = COL.canvas; ktctx.fillRect(0, 0, W, H);
  const I = font.info, on = $('#kOn').checked, pad = 18, size = Math.min(72, Math.max(26, H / 3.2)), sc = size / I.upm, lh = size * 1.25;
  // wrap words
  const words = kern.test.split(/(\s+)/); const lines = []; let line = '';
  for (const w of words) { const t = line + w; if (line && layoutText(t, on).width * sc > W - pad * 2) { lines.push(line); line = w.trimStart(); } else line = t; }
  lines.push(line);
  kern.layout = [];
  lines.forEach((ln, li) => {
    const lay = layoutText(ln, on), base = pad + I.ascender * sc + li * lh;
    let prev = null;
    lay.items.forEach((it, i) => {
      if (it.g) { const sel = prev && prev.ch === kern.l && it.ch === kern.r; ktctx.fillStyle = COL.ink; ktctx.fill(glyphPath(it.g, (x, y) => [pad + (it.x + x) * sc, base - y * sc])); }
      if (prev && prev.g && it.g) {
        const v = kv(prev.ch, it.ch), xb = pad + it.x * sc, isSel = prev.ch === kern.l && it.ch === kern.r;
        if (v) { ktctx.fillStyle = v < 0 ? COL.neg : COL.pos; ktctx.fillRect(xb - Math.abs(v) * sc / 2, base + size * .22, Math.max(2, Math.abs(v) * sc), 3); }
        if (isSel) { ktctx.fillStyle = COL.accent; ktctx.fillRect(xb - 1, base - I.capHeight * sc - 6, 2, I.capHeight * sc + 8); }
        kern.layout.push({ x: xb, y0: base - I.ascender * sc, y1: base - I.descender * sc, l: prev.ch, r: it.ch });
      }
      prev = it;
    });
  });
}
$('#ktestw').addEventListener('click', e => {
  const r = ktcv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 40;
  for (const b of kern.layout || []) { if (y < b.y0 - 8 || y > b.y1 + 8) continue; const dd = Math.abs(b.x - x); if (dd < bd) { bd = dd; best = b; } }
  if (best) { kern.l = best.l; kern.r = best.r; drawKern(); highlightRow(); }
});
const kst = $('#kstage');
kst.addEventListener('pointerdown', e => { kst.setPointerCapture(e.pointerId); kPush(); kern.drag = { x: e.clientX, v: kv(kern.l, kern.r) }; });
kst.addEventListener('pointermove', e => { if (!kern.drag) return; const v = Math.round(kern.drag.v + (e.clientX - kern.drag.x) / kern.sc); setKern(kern.l, kern.r, v); drawKern(); });
kst.addEventListener('pointerup', () => { if (kern.drag) { kern.drag = null; renderKernList(); } });
kst.addEventListener('pointercancel', () => { kern.drag = null; });
function nudgeKern(dv) { kPush(); setKern(kern.l, kern.r, kv(kern.l, kern.r) + dv); drawKern(); renderKernList(); }
$$('[data-kd]').forEach(b => b.addEventListener('click', () => nudgeKern(+b.dataset.kd)));
$('#kRange').addEventListener('input', e => { if (!kRangeActive) { kPush(); kRangeActive = true; } setKern(kern.l, kern.r, +e.target.value); drawKern(); });
$('#kRange').addEventListener('change', () => { kRangeActive = false; renderKernList(); });
$('#bKernZero').addEventListener('click', () => { kPush(); setKern(kern.l, kern.r, 0); drawKern(); renderKernList(); });
for (const id of ['#kL', '#kR']) $(id).addEventListener('input', e => { const ch = parseChar(e.target.value); if (ch && font.glyphs[ch]) { kern[id === '#kL' ? 'l' : 'r'] = ch; drawKern(); highlightRow(); } });
$('#ktest').addEventListener('input', e => { kern.test = e.target.value; lsSet('litera.ktest', kern.test); drawKernTest(); });
$('#kpreset').addEventListener('change', e => { if (!e.target.value) return; kern.test = e.target.value; $('#ktest').value = kern.test; e.target.value = ''; lsSet('litera.ktest', kern.test); drawKernTest(); });
$('#kOn').addEventListener('change', drawKernTest);
function renderKernList() {
  if (!font) return; const q = $('#kfilter').value.trim(), sort = $('#ksort').value;
  let rows = Object.entries(font.kerning).map(([k, v]) => { const [l, r] = k.split('\t'); return { key: k, l, r, v, cl: l.replace('@', ''), cr: r.replace('@', '') }; });
  if (q) rows = rows.filter(o => { const p = o.cl + o.cr; return [...q].length === 1 ? (o.cl === q || o.cr === q) : p.includes(q); });
  if (sort === 'pair') rows.sort((a, b) => a.l.localeCompare(b.l) || a.r.localeCompare(b.r)); else if (sort === 'neg') rows.sort((a, b) => a.v - b.v); else rows.sort((a, b) => b.v - a.v);
  $('#kcount').textContent = rows.length + (q ? ' / ' + Object.keys(font.kerning).length : '');
  const box = $('#krows'); box.textContent = ''; const frag = document.createDocumentFragment();
  for (const o of rows.slice(0, 500)) {
    const b = document.createElement('div'); b.className = 'krow' + (L.GKRE.test(o.key) ? ' grp' : ''); b.dataset.l = o.cl; b.dataset.r = o.cr; b.dataset.key = o.key; b.tabIndex = 0;
    b.innerHTML = `<span class="pr"></span><span class="val ${o.v < 0 ? 'n' : o.v > 0 ? 'p' : ''}"></span><button class="x">×</button>`;
    const xb = b.querySelector('.x'); xb.title = T('Удалить пару'); xb.setAttribute('aria-label', T('Удалить пару'));
    b.querySelector('.pr').textContent = showKey(o.l) + showKey(o.r); b.querySelector('.val').textContent = (o.v > 0 ? '+' : '') + o.v;
    if (o.cl === kern.l && o.cr === kern.r) b.classList.add('on'); frag.appendChild(b);
  }
  if (rows.length > 500) { const p = document.createElement('p'); p.className = 'hint'; p.style.padding = '8px 12px'; p.textContent = T('Показаны первые 500. Уточните фильтр.'); frag.appendChild(p); }
  if (!rows.length) { const p = document.createElement('p'); p.className = 'hint'; p.style.padding = '12px'; p.textContent = q ? T('Нет пар по фильтру.') : T('Пар пока нет. Кликните между буквами в тестовой строке или запустите автокернинг.'); frag.appendChild(p); }
  box.appendChild(frag);
}
function highlightRow() { $$('.krow').forEach(r => r.classList.toggle('on', r.dataset.l === kern.l && r.dataset.r === kern.r)); }
$('#krows').addEventListener('click', e => { const row = e.target.closest('.krow'); if (!row) return; if (e.target.closest('.x')) { kPush(); delete font.kerning[row.dataset.key]; touch(null, true); renderKernList(); drawKern(); return; } kern.l = row.dataset.l; kern.r = row.dataset.r; drawKern(); highlightRow(); });
$('#krows').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.click(); });
$('#kfilter').addEventListener('input', renderKernList); $('#ksort').addEventListener('change', renderKernList);
armed($('#bKernClear'), () => { kPush(); font.kerning = {}; touch(); renderKernList(); drawKern(); toast(T('Кернинг очищен')); });
const bindRange = (id, out, fmt) => { const f = () => $(out).textContent = fmt($(id).value); $(id).addEventListener('input', f); f(); };
bindRange('#aStr', '#aStrV', v => v + '%'); bindRange('#aDep', '#aDepV', v => v); bindRange('#aMin', '#aMinV', v => v); bindRange('#aThr', '#aThrV', v => v);
bindRange('#sSb', '#sSbV', v => v); bindRange('#sStr', '#sStrV', v => v + '%');
function scopeChars() {
  const S = L.SETS, sc = $('#aScope').value, P = [...'.,:;!?«»()'];
  if (sc === 'latinU') return S.upper.concat(S.digits, P); if (sc === 'latin') return S.upper.concat(S.lower, S.digits, P);
  if (sc === 'cyr') return S.cyrU.concat(S.cyrL, P); if (sc === 'test') return [...new Set([...kern.test].filter(c => c !== ' '))];
  return font.order.filter(c => c !== ' ');
}
$('#bAutoKern').addEventListener('click', () => {
  const chars = scopeChars().filter(c => font.glyphs[c]), t0 = performance.now();
  const res = L.autoKern(font, chars, { strength: +$('#aStr').value / 100, depth: +$('#aDep').value, minDist: +$('#aMin').value, threshold: +$('#aThr').value });
  kPush(); const keep = $('#aKeep').checked, set = new Set(chars), G = ($('#aGroups').checked && font.kgroups) ? font.kgroups : null; let n = 0;
  if (!keep) for (const k in font.kerning) { const [l, r] = k.split('\t'); if (set.has(l.replace('@', '')) && set.has(r.replace('@', ''))) delete font.kerning[k]; }
  for (const k in res) {
    let key = k;
    if (G) { const [l, r] = k.split('\t'), gl = G.L[l], gr = G.R[r]; if ((gl && gl !== l) || (gr && gr !== r)) continue; key = (gl ? '@' + l : l) + '\t' + (gr ? '@' + r : r); }
    if (keep && font.kerning[key] != null) continue; font.kerning[key] = res[k]; n++;
  }
  touch(); renderKernList(); drawKern(); toast(T('Автокернинг: {0} пар за {1} мс', n, Math.round(performance.now() - t0)));
});
$('#bAutoSpace').addEventListener('click', () => {
  const chars = scopeChars().filter(c => font.glyphs[c] && font.glyphs[c].contours.length);
  const sp = L.autoSpace(font, chars, { sb: +$('#sSb').value, depth: +$('#aDep').value, strength: +$('#sStr').value / 100, min: 10 });
  L.applySpacing(font, sp); Object.keys(sp).forEach(k => dirtyCards.add(k)); touch(); drawKern(); toast(T('Отступы обновлены у {0} глифов', Object.keys(sp).length));
});

/* ======================= PREVIEW ======================= */
const PRESET_SETS = {
  ru: ['Съешь же ещё этих мягких французских булок, да выпей чаю.\nThe quick brown fox jumps over the lazy dog.\nSphinx of black quartz, judge my vow.', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'abcdefghijklmnopqrstuvwxyz\nабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'AVATAR TOYOTA WAVE LYNX\nTo Ty Vo We Ya P. F. T.\nТАРАКАН ГОРА Тогда Гаага', '0123456789 + − × = %\n«Kernage» — 2026! (сегодня?) № 47; 12:30'],
  en: ['The quick brown fox jumps over the lazy dog.\nSphinx of black quartz, judge my vow.\nPack my box with five dozen liquor jugs.', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nÀÁÂÄÅÇÈÉÊËÑÖÜ', 'abcdefghijklmnopqrstuvwxyz\nàáâäåçèéêëñöü', 'AVATAR TOYOTA WAVE LYNX\nTo Ty Vo We Ya P. F. T.\nWAVY YACHT Lt. Fly', '0123456789 + − × = %\n“Kernage” — 2026! (today?) № 47; 12:30'],
  es: ['El veloz murciélago hindú comía feliz cardillo y kiwi.\nLa cigüeña tocaba el saxofón detrás del palenque de paja.\nThe quick brown fox jumps over the lazy dog.', 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ\nÁÉÍÓÚÜ', 'abcdefghijklmnñopqrstuvwxyz\náéíóúü', 'AVATAR TOYOTA WAVE LYNX\nTo Ty Vo We Ya P. F. T.\nAVENIDA TÁVORA Tú, Ya voy', '0123456789 + − × = %\n«Kernage» — 2026! (¿hoy?) № 47; 12:30'],
};
let PRESETS = PRESET_SETS.ru;
const FX_PHRASES = { ru: 'Kernage ломает буквы', en: 'Kernage breaks letters', es: 'Kernage rompe letras' };
let liveFace = null, liveN = 0, buildT;
function schedulePreview(now) { clearTimeout(buildT); buildT = setTimeout(rebuildLive, now ? 0 : 450); }
async function rebuildLive() {
  if (!hasOT) { $('#liveStat').textContent = T('Сборка недоступна: библиотека не загрузилась'); $('#liveStat').className = 'livestat err'; return; }
  try {
    if (!font.order.some(k => font.glyphs[k].contours.length)) { $('#liveStat').textContent = T('Нарисуйте хотя бы один глиф, чтобы собрать шрифт'); $('#liveStat').className = 'livestat'; fontDirty = false; return; }
    $('#liveStat').textContent = T('Сборка…'); await new Promise(r => setTimeout(r, 20));
    await warmFx((i, n) => { $('#liveStat').textContent = T('Применяю эффекты: {0} из {1}', i, n); });
    const CO = colorBuild(font, { transform: fxTransform(), kerning: L.flatKerning(font), kerningRaw: font.kerning, kgroups: font.kgroups }), r = varOn() ? L.buildVarTTF(CO.font, Object.assign({}, CO.opts, varOpts())) : L.buildFont(CO.font, CO.opts); const name = 'LiteraLive' + (++liveN); const face = new FontFace(name, r.buffer); await face.load(); document.fonts.add(face); if (liveFace) document.fonts.delete(liveFace); liveFace = face;
    document.documentElement.style.setProperty('--live', `'${name}'`); fontDirty = false;
    const t = new Date(); $('#liveStat').textContent = T('Собрано: {0} глифов, {1} пар · {2}', r.glyphCount, r.pairCount, t.toLocaleTimeString(LOC())); $('#liveStat').className = 'livestat';
  } catch (e) { $('#liveStat').textContent = T('Ошибка сборки: ') + (e.message || e); $('#liveStat').className = 'livestat err'; }
}
function applyPreview() {
  const sz = +$('#pvSize').value, lh = +$('#pvLh').value / 100, tr = +$('#pvTr').value / 1000, kOn = $('#pvKern').checked;
  $('#pvSizeV').textContent = sz; $('#pvLhV').textContent = lh.toFixed(2); $('#pvTrV').textContent = (tr * 1000 | 0);
  const p = $('#proof'); p.style.fontSize = sz + 'px'; p.style.lineHeight = lh; p.style.letterSpacing = tr + 'em'; p.style.fontKerning = kOn ? 'normal' : 'none'; p.style.fontFeatureSettings = featStr(kOn);
  const vs = varOn() ? '"wght" ' + $('#pvWght').value : ''; $('#pvWghtF').hidden = !varOn(); $('#pvWghtV').textContent = $('#pvWght').value; p.style.fontVariationSettings = vs;
  for (const el of [$('#wf'), $('#chart')]) { el.style.fontKerning = kOn ? 'normal' : 'none'; el.style.fontFeatureSettings = featStr(kOn); el.style.fontVariationSettings = vs; }
}
function fillWaterfall() {
  const line = (PRESETS[+$('#pvPreset').value] || PRESETS[0]).split('\n')[0]; const wf = $('#wf'); wf.textContent = '';
  for (const s of [12, 16, 20, 28, 36, 48, 64, 96]) { const r = document.createElement('div'); r.innerHTML = `<span class="lbl mono">${s}px</span><span></span>`; r.lastChild.style.fontSize = s + 'px'; r.lastChild.textContent = line; wf.appendChild(r); }
  $('#chart').textContent = font.order.filter(k => font.glyphs[k].contours.length && !L.isSpecial(k)).join('') + (otSample() ? '  ' + otSample() : '');
}
['#pvSize', '#pvLh', '#pvTr', '#pvKern'].forEach(id => $(id).addEventListener('input', applyPreview));
$('#pvPreset').addEventListener('change', e => { $('#proof').textContent = PRESETS[+e.target.value]; fillWaterfall(); });

/* ======================= FONT INFO / IO ======================= */
const INFO = [['#iFamily', 'familyName'], ['#iStyle', 'styleName'], ['#iDesigner', 'designer'], ['#iVersion', 'version'], ['#iDesc', 'description'], ['#iUpm', 'upm', 1], ['#iAsc', 'ascender', 1], ['#iDesc2', 'descender', 1], ['#iCap', 'capHeight', 1], ['#iX', 'xHeight', 1], ['#iGap', 'lineGap', 1], ['#iOver', 'overshoot', 1]];
function fillInfo() {
  for (const [id, k] of INFO) $(id).value = font.info[k]; $('#fname').value = font.info.familyName; drawMetrics();
  const drawn = font.order.filter(k => font.glyphs[k].contours.length).length;
  const fxn = FXE.FX.filter(f => Math.abs(font.fx.p[f[0]] - f[6]) > 1e-9).length;
  $('#fstat').textContent = T('{0} {1}: {2} нарисованных глифов, {3} пар кернинга', font.info.familyName, font.info.styleName, drawn, Object.keys(font.kerning).length) + (fxn ? (font.fx.on ? T(', эффектов деструкции: {0} (войдут в файлы).', fxn) : T(', эффекты деструкции выключены для экспорта.')) : '.');
}
for (const [id, k, num] of INFO) $(id).addEventListener('change', e => {
  let v = e.target.value; if (num) { v = Math.round(parseFloat(v)); if (!isFinite(v)) { fillInfo(); return; } if (k === 'descender') v = Math.min(0, v); }
  else v = v.trim() || font.info[k]; font.info[k] = v; touch(); fillInfo(); ed.needFit = true; drawAllCards();
});
$('#fname').addEventListener('change', e => { const v = e.target.value.trim(); if (v) { font.info.familyName = v; touch(); } fillInfo(); });
function drawMetrics() {
  const c = $('#mcv'), d = DPR(), W = Math.max(240, Math.round(c.clientWidth || 320)), H = Math.round(W * 0.42); c.style.height = H + 'px'; c.width = W * d; c.height = H * d; const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = COL.canvas; x.fillRect(0, 0, W, H);
  const I = font.info, span = Math.max(1, I.ascender - I.descender);
  const word = [...'Hxg'].map(ch => font.glyphs[ch]).filter(Boolean), adv = word.reduce((a, g) => a + g.adv, 0);
  const sc = Math.min((H - 24) / span, adv ? (W * 0.56) / adv : Infinity), base = (H - span * sc) / 2 + I.ascender * sc;
  let px = W - adv * sc - 12;
  x.fillStyle = COL.ink; for (const g of word) { const ox = px; x.fill(glyphPath(g, (a, b) => [ox + a * sc, base - b * sc])); px += g.adv * sc; }
  x.font = "10px 'IBM Plex Mono', monospace"; x.textBaseline = 'bottom';
  const rows = [[I.ascender, T('выносные')], [I.capHeight, T('прописные')], [I.xHeight, T('строчные')], [0, T('база')], [I.descender, T('нижние')]].sort((p, q) => q[0] - p[0]);
  let prevY = -99, prevX = 6;
  for (const [y, nm] of rows) {
    const sy = Math.round(base - y * sc) + .5; x.strokeStyle = y === 0 ? COL.mute : COL.guide; x.setLineDash(y === 0 ? [] : [3, 3]); x.beginPath(); x.moveTo(0, sy); x.lineTo(W, sy); x.stroke(); x.setLineDash([]);
    const s = nm + ' ' + y, tw = x.measureText(s).width, close = sy - prevY < 12, lx = close ? prevX + 12 : 6;
    x.fillStyle = COL.canvas; x.fillRect(lx - 2, sy - 12, tw + 4, 11); x.fillStyle = COL.mute; x.fillText(s, lx, sy - 2);
    prevY = sy; prevX = lx + tw;
  }
}
let DL;
async function getDL() { if (DL !== undefined) return DL; try { DL = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null; } catch (e) { DL = null; } return DL; }
async function saveFile(name, blob) {
  const dl = await getDL();
  if (dl) { try { await dl.save({ filename: name, data: blob }); toast(T('Файл {0} сохранён', name)); } catch (e) { toast(e && e.code === 'declined' ? T('Сохранение отменено') : T('Не удалось сохранить: ') + ((e && (e.message || e.code)) || T('ошибка'))); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); toast(T('Скачивание: ') + name);
}
const baseName = () => ((font.info.familyName + '-' + font.info.styleName).replace(/[^\p{L}\p{N}_-]+/gu, '') || 'font');
async function exportFont() {
  if (!hasOT) { toast(T('Экспорт недоступен: библиотека шрифтов не загрузилась')); return; }
  endPen();
  if (!font.order.some(k => font.glyphs[k].contours.length)) { toast(T('В шрифте нет нарисованных глифов')); return; }
  try {
    await warmFx((i, n) => toast(T('Применяю эффекты: {0} из {1}', i, n)));
    const tr = fxTransform(), KF = L.flatKerning(font), CO = colorBuild(font, { transform: tr, kerning: KF, kerningRaw: font.kerning, kgroups: font.kgroups }), r = L.buildFont(CO.font, CO.opts), files = [], enc = new TextEncoder(), b = baseName(), web = $('#xWeb').checked;
    if ($('#xOtf').checked) files.push({ name: b + '.otf', data: new Uint8Array(r.buffer) });
    if ($('#xTtf').checked) files.push({ name: b + '.ttf', data: new Uint8Array(L.buildTTF(CO.font, Object.assign({}, CO.opts, { hint: $('#xHint').checked })).buffer) });
    if ($('#xVar').checked) { toast(T('Собираю вариативный шрифт…')); await new Promise(r2 => setTimeout(r2, 0)); files.push({ name: b.replace(/-[^-]*$/, '') + '-VF.ttf', data: new Uint8Array(L.buildVarTTF(CO.font, Object.assign({}, CO.opts, varOpts())).buffer) }); }
    if ($('#xUfo').checked) files.push(...L.exportUFO(font, b));
    if ($('#xSvg').checked) files.push({ name: b + '.svg', data: enc.encode(L.buildSVGFont(font, { transform: tr, kerning: KF }, FXE.pathD)) });
    if ($('#xWoff').checked || web) files.push({ name: b + '.woff', data: new Uint8Array(await L.toWOFF(r.buffer)) });
    if ($('#xJson').checked) files.push({ name: b + '.kernage.json', data: enc.encode(JSON.stringify(font)) });
    const famList = await familyFiles(tr, files, KF, web);
    if (web) webKit(files, b, b + '.woff', $('#xTtf').checked, famList);
    if (!files.length) { toast(T('Отметьте хотя бы один формат на вкладке «Шрифт»')); setTab('font'); return; }
    await saveFile(b + '.zip', L.makeZip(files));
  } catch (e) { toast(T('Ошибка экспорта: ') + (e.message || e)); }
}
$('#bExport').addEventListener('click', exportFont); $('#bExport2').addEventListener('click', exportFont);
$('#bSaveJson').addEventListener('click', () => saveFile(baseName() + '.kernage.json', new Blob([JSON.stringify(font)], { type: 'application/json' })));
$('#fOpen').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    if (/\.json$/i.test(f.name)) { const o = JSON.parse(await f.text()); if (!o.glyphs) throw new Error(T('это не проект Kernage')); newProject(o); }
    else if (/\.zip$/i.test(f.name)) { const fs = await L.readZip(await f.arrayBuffer()); if (!Object.keys(fs).some(p => /metainfo\.plist$/.test(p))) throw new Error(T('в архиве нет UFO')); newProject(L.importUFO(fs)); }
    else if (/\.glyphs$/i.test(f.name)) newProject(L.importGlyphs(await f.text()));
    else { if (!hasOT) throw new Error(T('библиотека шрифтов не загрузилась')); toast(T('Открываю {0}…', f.name)); await new Promise(r => setTimeout(r, 40)); const nf = L.importOT(await f.arrayBuffer()), st = nf.__stats || {}; newProject(nf); setTab('glyphs'); toast(T('Открыт: {0} — глифов {1}, альтернатив {2}, лигатур {3}, пар кернинга {4}', f.name, nf.order.length, st.alts || 0, st.ligas || 0, st.kern || 0)); return; }
    toast(T('Открыт: ') + f.name); setTab('glyphs');
  } catch (err) { toast(T('Не удалось открыть файл: ') + (err.message || err)); }
});

/* ======================= TABS & KEYS ======================= */
function setTab(t) {
  closeSheets();
  if (t !== 'editor') endPen();
  tab = t; $$('.view').forEach(v => v.hidden = v.id !== 'v-' + t); $$('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  lsSet('litera.tab', t);
  if (t === 'glyphs') refreshGrid();
  if (t === 'editor') { edResize(); edDraw(); refreshPanel(); }
  if (t === 'kern') { kernResize(); renderKernList(); drawKern(); fillGroupsUI(); syncKUndo(); }
  if (t === 'preview') { renderPvFeat(); if (fontDirty || !liveFace) schedulePreview(true); applyPreview(); fillWaterfall(); }
  if (t === 'font') { fillInfo(); renderProjects(); renderVersions(); }
  if (t === 'fx') enterFx();
}
$$('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
function typing(e) { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
window.addEventListener('keydown', e => {
  if (typing(e)) return; const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (k === '?') { openModal('mHelp'); return; }
  if (tab === 'fx') {
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); fxStep(k === 'ArrowLeft' ? -1 : 1); }
    else if (k === 'r' || k === 'к') fxRandomize();
    return;
  }
  if (tab === 'kern') {
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? kRedo() : kUndo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); kRedo(); return; }
    if (k === '[' || k === ']' || k === 'х' || k === 'ъ') { stepPair(k === '[' || k === 'х' ? -1 : 1); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); nudgeKern((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 10)); }
    return;
  }
  if (tab !== 'editor') return;
  if (k === ' ') { if (!ed.space) { ed.space = true; cv.style.cursor = 'grab'; } e.preventDefault(); return; }
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (mod && k.toLowerCase() === 'a') { e.preventDefault(); selectAllOwn(); edDraw(); refreshPanel(); return; }
  if (mod && k.toLowerCase() === 'c') { copySel(false); return; }
  if (mod && k.toLowerCase() === 'x') { copySel(true); return; }
  if (mod && k.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
  if (mod && (k.toLowerCase() === 'd' || k.toLowerCase() === 'в')) { e.preventDefault(); dupSel(); return; }
  if (mod) return;
  if (k.startsWith('Arrow')) { e.preventDefault(); const st = e.shiftKey ? 10 : 1; moveSel(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? st : k === 'ArrowDown' ? -st : 0); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteNodes(); return; }
  if (k === 'Escape' || k === 'Enter') { if (ed.pen != null) endPen(); else ed.sel.clear(); edDraw(); refreshPanel(); return; }
  const map = { v: 'select', p: 'pen', r: 'rect', e: 'ellipse', h: 'hand', b: 'brush', x: 'erase', m: 'measure', k: 'knife', м: 'select', з: 'pen', к: 'rect', у: 'ellipse', р: 'hand', и: 'brush', ч: 'erase', ь: 'measure', л: 'knife' };
  if (map[k.toLowerCase()]) { setTool(map[k.toLowerCase()]); return; }
  if (k === 'f' || k === 'а') { ed.needFit = true; edDraw(); return; }
  if (k === '[' || k === 'х') { stepGlyph(-1); return; } if (k === ']' || k === 'ъ') { stepGlyph(1); return; }
});
window.addEventListener('keyup', e => { if (e.key === ' ') { ed.space = false; cv.style.cursor = ed.tool === 'hand' ? 'grab' : 'default'; } });

/* ======================= DESTRUCTION ======================= */
const fxs = { mode: 'glyph', cur: 'R', phrase: FX_PHRASES.ru, zoom: 1, pts: true, tech: false, outline: false, onion: false, anim: false, sound: false, phase: 0, sig: '', hits: [], last: 0 };
const fxcv = $('#fxcv'), fxc = fxcv.getContext('2d');
let fxRaf = 0, fxQ = [], fxPump = 0, AC = null, lastBlip = 0;
const fxP = () => font.fx.p;
const fxSig = () => JSON.stringify(font.fx.p) + '|' + font.fx.seed;
function fxOut(k, ph) {
  const g = font.glyphs[k]; if (!g) return null; if (g.fxSkip) return { contours: g.contours, adv: g.adv }; ph = ph || 0;
  const sig = fxs.sig + '|' + (gver[k] || 0) + '|' + ph.toFixed(3), c = fxCache.get(k);
  if (c && c.sig === sig) return c.out;
  let out; try { out = FXE.process(g, font.fx.p, font.info, font.fx.seed, ph); } catch (e) { out = { contours: g.contours, adv: g.adv }; }
  fxCache.set(k, { sig, out }); return out;
}
function fxCached(k, ph) { const g = font.glyphs[k]; if (!g) return null; if (g.fxSkip) return { contours: g.contours, adv: g.adv }; const c = fxCache.get(k); return c && c.sig === fxs.sig + '|' + (gver[k] || 0) + '|' + (ph || 0).toFixed(3) ? c.out : null; }
function fxOutB(k, ph) { const c = fxCached(k, ph); if (c) return c; if (performance.now() < (fxs.budgetEnd || 0)) return fxOut(k, ph); fxs.pending = true; const g = font.glyphs[k]; return { contours: g.contours, adv: g.adv, pending: true }; }
async function warmFx(report) {
  if (!fxTransform()) return; const keys = font.order.filter(k => font.glyphs[k] && font.glyphs[k].contours.length); let t0 = performance.now(), i = 0;
  for (const k of keys) { if (!fxCached(k, 0)) fxOut(k, 0); i++; if (performance.now() - t0 > 40) { if (report) report(i, keys.length); await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); } }
}
function fxTransform() { return (font.fx && font.fx.on && FXE.isActive(font.fx.p)) ? ((k) => fxOut(k, 0)) : null; }
function blip(v) {
  if (!fxs.sound) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime; if (t - lastBlip < 0.035) return; lastBlip = t; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = 140 + v * 980; g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.08); } catch (e) { }
}
const fmtFx = (f, v) => f[5] >= 1 ? Math.round(v) + f[7] : (+v).toFixed(2) + (f[7] === '×' ? '×' : '');
function buildFxPanel() {
  const box = $('#fxTiers'); box.textContent = '';
  FXE.TIERS.forEach((t, ti) => {
    const d = document.createElement('details'); d.open = true;
    d.innerHTML = `<summary><h2></h2><span class="fxcount mono" data-tier="${ti}"></span></summary><div class="sbody fxlist"></div>`;
    d.querySelector('h2').textContent = T(t); const list = d.querySelector('.fxlist');
    for (const f of FXE.FX.filter(f => f[2] === ti)) {
      const [id, lab, , mn, mx, st, , , tip] = f, row = document.createElement('div');
      row.className = 'fxrow'; row.dataset.id = id; row.title = T(tip) + T('. Двойной клик по названию сбрасывает значение');
      row.innerHTML = `<div class="fxl"><span></span><output></output></div><input type="range" min="${mn}" max="${mx}" step="${st}" id="fx_${id}">`;
      row.querySelector('span').textContent = T(lab); row.querySelector('input').setAttribute('aria-label', T(lab)); list.appendChild(row);
    }
    box.appendChild(d);
  });
  syncFxPanel();
}
function syncFxPanel() {
  const P = fxP(), cnt = [0, 0, 0];
  for (const f of FXE.FX) { const row = $(`.fxrow[data-id="${f[0]}"]`); if (!row) continue; const on = Math.abs(P[f[0]] - f[6]) > 1e-9; row.querySelector('input').value = P[f[0]]; row.querySelector('output').textContent = fmtFx(f, P[f[0]]); row.classList.toggle('on', on); if (on) cnt[f[2]]++; }
  $$('.fxcount').forEach(el => { const n = cnt[+el.dataset.tier]; el.textContent = n ? n + T(' вкл.') : ''; });
  $('#fxSeed').value = font.fx.seed; $('#fxOn').checked = font.fx.on;
}
function fxChanged() { fxs.sig = fxSig(); fontDirty = true; touch(null, true); scheduleFxDraw(); queueThumbs(); }
$('#fxTiers').addEventListener('input', e => {
  const row = e.target.closest('.fxrow'); if (!row) return; const f = FXE.FX.find(x => x[0] === row.dataset.id), v = +e.target.value;
  fxP()[f[0]] = v; row.querySelector('output').textContent = fmtFx(f, v); row.classList.toggle('on', Math.abs(v - f[6]) > 1e-9);
  blip((v - f[3]) / (f[4] - f[3])); fxs.sig = fxSig(); scheduleFxDraw(); clearTimeout(fxs.qT); fxs.qT = setTimeout(() => { fxChanged(); syncFxPanel(); }, 160);
});
$('#fxTiers').addEventListener('dblclick', e => { const l = e.target.closest('.fxl'); if (!l) return; const id = l.parentElement.dataset.id, f = FXE.FX.find(x => x[0] === id); fxP()[id] = f[6]; syncFxPanel(); fxChanged(); });
function scheduleFxDraw() { if (!fxRaf) fxRaf = requestAnimationFrame(() => { fxRaf = 0; drawFx(); }); }
function layoutFx(text, ph) {
  const items = []; let x = 0, prev = null;
  for (const ch of shape(text)) { const g = font.glyphs[ch]; if (!g) { x += font.info.upm * 0.3; prev = null; continue; } const out = fxOutB(ch, ph); if (prev) x += kv(prev, ch); items.push({ ch, x, out }); x += out.adv; prev = ch; }
  return { items, width: x };
}
function drawGlyphFx(ctx, out, orig, tx, sc, opt) {
  const p = glyphPath(out, tx);
  if (opt.onion && orig) { ctx.strokeStyle = COL.accent; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(glyphPath(orig, tx)); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  if (opt.outline) { ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2; ctx.stroke(p); } else { ctx.fillStyle = opt.sel ? COL.accent : COL.ink; ctx.fill(p); }
  if (opt.pts) {
    const r = Math.max(1.4, Math.min(3.6, sc * 6));
    for (const c of out.contours) for (const n of c) {
      const q = tx(n.x, n.y);
      if (r > 2.2) for (const h of [n.i, n.o]) if (h) { const hh = tx(h[0], h[1]); ctx.strokeStyle = COL.mute; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(hh[0], hh[1]); ctx.stroke(); ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(hh[0], hh[1], r * .55, 0, 7); ctx.fill(); }
      ctx.fillStyle = COL.canvas; ctx.strokeStyle = opt.outline ? COL.accent : COL.neg; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(q[0] - r, q[1] - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    }
  }
}
function drawFx() {
  if (tab !== 'fx' || !font) return;
  fxs.budgetEnd = performance.now() + 45; fxs.pending = false;
  const d = DPR(), r = $('#fxStage').getBoundingClientRect(); if (!r.width || !r.height) return;
  if (fxcv.width !== Math.round(r.width * d) || fxcv.height !== Math.round(r.height * d)) { fxcv.width = Math.round(r.width * d); fxcv.height = Math.round(r.height * d); }
  const W = r.width, H = r.height, I = font.info, ph = fxs.anim ? fxs.phase : 0, t0 = performance.now();
  fxc.setTransform(d, 0, 0, d, 0, 0); fxc.fillStyle = COL.canvas; fxc.fillRect(0, 0, W, H);
  fxs.hits = [];
  const metric = (y, nm, x0, x1, tx) => { const sy = Math.round(tx(0, y)[1]) + .5; fxc.strokeStyle = y === 0 ? COL.mute : COL.guide; fxc.lineWidth = 1; fxc.setLineDash(y === 0 ? [] : [3, 4]); fxc.beginPath(); fxc.moveTo(x0, sy); fxc.lineTo(x1, sy); fxc.stroke(); fxc.setLineDash([]); if (fxs.tech) { fxc.fillStyle = COL.mute; fxc.font = "10px 'IBM Plex Mono', monospace"; fxc.textBaseline = 'bottom'; fxc.fillText(nm + ' ' + y, x0 + 6, sy - 2); } };
  let np = 0, nc = 0;
  if (fxs.mode === 'glyph') {
    const g = font.glyphs[fxs.cur]; if (!g) return; const out = fxOut(fxs.cur, ph);
    const top = I.ascender + 100, bot = I.descender - 100, sc = Math.min(H * 0.88 / (top - bot), W * 0.78 / Math.max(out.adv, g.adv, 420)) * fxs.zoom;
    const ox = (W - out.adv * sc) / 2, oy = (H - (top - bot) * sc) / 2 + top * sc, tx = (x, y) => [ox + x * sc, oy - y * sc];
    for (const [y, nm] of [[I.ascender, T('выносные')], [I.capHeight, T('прописные')], [I.xHeight, T('строчные')], [0, T('база')], [I.descender, T('нижние')]]) metric(y, nm, 0, W, tx);
    if (fxs.tech) { fxc.strokeStyle = COL.mute; fxc.setLineDash([2, 3]); for (const x of [0, out.adv]) { const sx = Math.round(tx(x, 0)[0]) + .5; fxc.beginPath(); fxc.moveTo(sx, tx(0, I.ascender)[1]); fxc.lineTo(sx, tx(0, I.descender)[1]); fxc.stroke(); } fxc.setLineDash([]); const bb = L.bounds(out.contours); if (bb) { const a = tx(bb.x0, bb.y1), b = tx(bb.x1, bb.y0); fxc.strokeStyle = COL.accent; fxc.strokeRect(a[0] + .5, a[1] + .5, b[0] - a[0], b[1] - a[1]); } }
    drawGlyphFx(fxc, out, g, tx, sc, { pts: fxs.pts, outline: fxs.outline, onion: fxs.onion });
    for (const c of out.contours) { np += c.length; nc++; }
    $('#fxCur').textContent = show(fxs.cur);
    if (fxs.tech) { fxc.fillStyle = COL.mute; fxc.font = "11px 'IBM Plex Mono', monospace"; fxc.textBaseline = 'top'; const bb = L.bounds(out.contours); fxc.fillText(T('{0}  {1}  ширина {2}  (было {3})', hex(fxs.cur), g.name, out.adv, Math.round(g.adv)) + (bb ? T('  рамка {0},{1} → {2},{3}', Math.round(bb.x0), Math.round(bb.y0), Math.round(bb.x1), Math.round(bb.y1)) : ''), 12, 10); }
  } else {
    const lh = (I.ascender - I.descender) * 1.12, words = [];
    (fxs.phrase || ' ').split('\n').forEach((para, pi) => { if (pi) words.push('\n'); para.split(/\s+/).filter(Boolean).forEach(w => words.push(w)); });
    const wrap = target => { const out = []; let cur = ''; for (const w of words) { if (w === '\n') { out.push(cur); cur = ''; continue; } const t = cur ? cur + ' ' + w : w; if (cur && layoutFx(t, ph).width > target) { out.push(cur); cur = w; } else cur = t; } out.push(cur); return out.map(t => layoutFx(t, ph)); };
    const full = layoutFx((fxs.phrase || ' ').replace(/\s+/g, ' '), ph).width; let best = null;
    for (let n = 1; n <= 6; n++) { const ls = wrap(full / n * 1.08), mw = Math.max(1, ...ls.map(l => l.width)), s0 = Math.min((W - 48) / mw, (H - 40) / (lh * ls.length)); if (!best || s0 > best.s0 * 1.02) best = { ls, s0 }; }
    const lines = best.ls, sc = best.s0 * fxs.zoom, totalH = lh * lines.length * sc;
    lines.forEach((ln, li) => {
      const ox = (W - ln.width * sc) / 2, base = (H - totalH) / 2 + (li * lh + I.ascender + (lh - (I.ascender - I.descender)) / 2) * sc, tx0 = (x, y) => [ox + x * sc, base - y * sc];
      if (li === 0 || fxs.tech) for (const [y, nm] of [[I.capHeight, T('прописные')], [I.xHeight, T('строчные')], [0, T('база')]]) if (fxs.tech || y === 0) metric(y, nm, ox - 16, ox + ln.width * sc + 16, tx0);
      for (const it of ln.items) {
        const tx = (x, y) => [ox + (it.x + x) * sc, base - y * sc];
        if (it.out.pending) fxc.globalAlpha = .25; drawGlyphFx(fxc, it.out, font.glyphs[it.ch], tx, sc, { pts: fxs.pts && sc * I.capHeight > 90, outline: fxs.outline, onion: fxs.onion, sel: false }); fxc.globalAlpha = 1;
        for (const c of it.out.contours) { np += c.length; nc++; }
        fxs.hits.push({ ch: it.ch, x0: ox + it.x * sc, x1: ox + (it.x + it.out.adv) * sc, y0: base - I.ascender * sc, y1: base - I.descender * sc });
        if (it.ch === fxs.cur && fxs.tech) { fxc.fillStyle = COL.accent; fxc.fillRect(ox + it.x * sc, base + 6, it.out.adv * sc, 2); }
      }
    });
  }
  if (fxs.pending && !fxs.anim) scheduleFxDraw();
  const ms = Math.round(performance.now() - t0);
  $('#fxStat').textContent = T('точек {0} · контуров {1}', np, nc) + (fxs.tech ? T(' · {0} мс', ms) : '');
  $('#fxZoom').textContent = fxs.zoom.toFixed(2) + '×';
}
new ResizeObserver(() => { if (tab === 'fx') scheduleFxDraw(); }).observe($('#fxStage'));
function buildFxGrid() {
  const box = $('#fxGrid'); box.textContent = '';
  for (const k of font.order) { const g = font.glyphs[k]; if (!g.contours.length) continue; const b = document.createElement('button'); b.className = 'fxcell'; b.dataset.k = k; b.title = show(k) + ' ' + hex(k); b.innerHTML = '<canvas></canvas>'; box.appendChild(b); }
  queueThumbs();
}
function queueThumbs() { const cells = [...$('#fxGrid').children]; const i = cells.findIndex(c => c.dataset.k === fxs.cur); fxQ = i > 0 ? cells.slice(i).concat(cells.slice(0, i)) : cells; if (!fxPump) fxPump = requestAnimationFrame(pumpThumbs); }
function pumpThumbs() { fxPump = 0; if (tab !== 'fx') return; const t0 = performance.now(); while (fxQ.length && performance.now() - t0 < 12) drawFxCell(fxQ.shift()); if (fxQ.length) fxPump = requestAnimationFrame(pumpThumbs); }
function drawFxCell(b) {
  const k = b.dataset.k, g = font.glyphs[k]; if (!g) return; const out = fxOut(k, 0), cv = b.querySelector('canvas'), s = 72, d = DPR();
  if (cv.width !== s * d) { cv.width = s * d; cv.height = s * d; }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, s, s);
  const I = font.info, sc = s * 0.62 / (I.ascender - I.descender), base = s * 0.2 + I.ascender * sc, x0 = (s - out.adv * sc) / 2;
  c.fillStyle = COL.ink; c.fill(glyphPath(out, (x, y) => [x0 + x * sc, base - y * sc]));
  b.classList.toggle('cur', k === fxs.cur);
}
function fxSelect(k, toGlyph) { if (!font.glyphs[k]) return; fxs.cur = k; if (toGlyph) setFxMode('glyph'); $$('.fxcell.cur').forEach(b => b.classList.remove('cur')); const b = $('#fxGrid').querySelector(`[data-k="${CSS.escape(k)}"]`); if (b) { b.classList.add('cur'); b.scrollIntoView({ block: 'nearest' }); } scheduleFxDraw(); }
function fxStep(dir) { const keys = font.order.filter(k => font.glyphs[k].contours.length); const i = keys.indexOf(fxs.cur); fxSelect(keys[(i + dir + keys.length) % keys.length], false); }
function setFxMode(m) { fxs.mode = m; $$('[data-fm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.fm === m)); $('#fxPhrase').hidden = m !== 'phrase'; $('#fxGlyphNav').hidden = m !== 'glyph'; scheduleFxDraw(); }
$('#fxGrid').addEventListener('click', e => { const b = e.target.closest('.fxcell'); if (b) fxSelect(b.dataset.k, true); });
$$('[data-fm]').forEach(b => b.addEventListener('click', () => setFxMode(b.dataset.fm)));
$('#fxPhrase').addEventListener('input', e => { fxs.phrase = e.target.value; lsSet('litera.fxphrase', fxs.phrase); scheduleFxDraw(); });
$('#fxPrev').addEventListener('click', () => fxStep(-1)); $('#fxNext').addEventListener('click', () => fxStep(1));
$('#fxStage').addEventListener('click', e => {
  if (fxs.mode !== 'phrase') return; const r = fxcv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const h = fxs.hits.find(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1); if (h) { fxSelect(h.ch, false); toast(T('Глиф {0} выбран. Двойной клик откроет его крупно', show(h.ch))); }
});
$('#fxStage').addEventListener('dblclick', () => { if (performance.now() - (fxs.tt || 0) < 700) return; if (fxs.mode === 'phrase') setFxMode('glyph'); else setFxMode('phrase'); });
$('#fxStage').addEventListener('wheel', e => { e.preventDefault(); fxs.zoom = Math.max(.2, Math.min(6, fxs.zoom * Math.exp(-e.deltaY * 0.0015))); scheduleFxDraw(); }, { passive: false });
for (const [id, key] of [['#fxPts', 'pts'], ['#fxTech', 'tech'], ['#fxOutline', 'outline'], ['#fxOnion', 'onion'], ['#fxSound', 'sound']]) $(id).addEventListener('change', e => { fxs[key] = e.target.checked; if (key === 'sound' && fxs.sound) blip(.5); scheduleFxDraw(); });
$('#fxZoomIn').addEventListener('click', () => { fxs.zoom = Math.min(6, fxs.zoom * 1.25); scheduleFxDraw(); });
$('#fxZoomOut').addEventListener('click', () => { fxs.zoom = Math.max(.2, fxs.zoom / 1.25); scheduleFxDraw(); });
$('#fxZoom').addEventListener('click', () => { fxs.zoom = 1; scheduleFxDraw(); });
$('#fxAnim').addEventListener('change', e => { fxs.anim = e.target.checked; if (fxs.anim) { fxs.last = performance.now(); requestAnimationFrame(animFx); } else scheduleFxDraw(); });
function animFx(t) { if (!fxs.anim || tab !== 'fx') return; fxs.phase += Math.min(0.1, (t - fxs.last) / 1000) * 2.2; fxs.last = t; drawFx(); requestAnimationFrame(animFx); }
$('#fxSeed').addEventListener('change', e => { const v = parseInt(e.target.value, 10); if (isFinite(v)) { font.fx.seed = v; fxChanged(); } syncFxPanel(); });
$('#fxDice').addEventListener('click', () => { font.fx.seed = 1 + Math.floor(Math.random() * 9999); syncFxPanel(); fxChanged(); blip(Math.random()); });
$('#fxOn').addEventListener('change', e => { font.fx.on = e.target.checked; fontDirty = true; touch(null, true); toast(font.fx.on ? T('Эффекты войдут в экспорт и просмотр') : T('Экспорт и просмотр без эффектов')); });
function fxRandomize() {
  const P = FXE.defaults(), pool = FXE.FX.filter(f => !['tracking', 'flip'].includes(f[0])), n = 2 + Math.floor(Math.random() * 4), used = new Set();
  while (used.size < n) {
    const f = pool[Math.floor(Math.random() * pool.length)]; if (used.has(f[0])) continue; used.add(f[0]);
    const [id, , tier, mn, mx, st] = f; let v;
    if (id === 'sx' || id === 'sy') v = 0.6 + Math.random() * 1.1;
    else { const amt = (tier === 2 ? 0.2 : 0.12) + Math.random() * 0.5; v = mn < 0 ? (Math.random() < .5 ? -1 : 1) * amt * Math.min(-mn, mx) : mn + amt * (mx - mn); }
    P[id] = +(Math.round(v / st) * st).toFixed(4);
  }
  if (used.has('pixel') && used.has('halftone')) P.halftone = 0;
  font.fx.p = P; font.fx.seed = 1 + Math.floor(Math.random() * 9999); $('#fxPreset').value = ''; syncFxPanel(); fxChanged(); blip(Math.random());
  toast(T('Случайно: ') + [...used].map(id => T(FXE.FX.find(f => f[0] === id)[1]).toLowerCase()).join(', '));
}
$('#fxRandom').addEventListener('click', fxRandomize);
$('#fxReset').addEventListener('click', () => { font.fx.p = FXE.defaults(); syncFxPanel(); fxChanged(); $('#fxPreset').value = ''; });
function buildFxPresets() { const sel = $('#fxPreset'), v = sel.value; sel.length = 1; [...sel.querySelectorAll('optgroup')].forEach(g => g.remove()); for (const nm in FXE.PRESETS) { const o = document.createElement('option'); o.value = nm; o.textContent = T(nm); sel.appendChild(o); } const my = myPresets(), names = Object.keys(my); if (names.length) { const og = document.createElement('optgroup'); og.label = T('Мои пресеты'); for (const nm of names) { const o = document.createElement('option'); o.value = 'my:' + nm; o.textContent = nm; og.appendChild(o); } sel.appendChild(og); } sel.value = v; }
buildFxPresets();
$('#fxPreset').addEventListener('change', e => { if (e.target.value.startsWith('my:')) { applyMyPreset(e.target.value.slice(3)); return; } const pr = FXE.PRESETS[e.target.value]; if (!pr) return; font.fx.p = Object.assign(FXE.defaults(), pr); syncFxPanel(); fxChanged(); blip(.7); });
armed($('#fxBake'), () => {
  if (!FXE.isActive(fxP())) { toast(T('Сначала включите хотя бы один эффект')); return; }
  for (const k of font.order) { const g = font.glyphs[k]; const out = fxOut(k, 0); const s = undo.s(k); s.u.push(snapshot(g)); s.r.length = 0; g.contours = out.contours.map(L.cloneC); g.adv = out.adv; gver[k] = (gver[k] || 0) + 1; dirtyCards.add(k); }
  font.fx.p = FXE.defaults(); syncFxPanel(); fxCache.clear(); fxChanged(); buildFxGrid(); touch(); toast(T('Эффекты запечены в контуры. В редакторе их можно отменить по Ctrl+Z для каждого глифа'));
});
function phraseLayoutUnits() {
  const I = font.info, lines = (fxs.phrase || ' ').split('\n').map(t => layoutFx(t, 0)), lh = (I.ascender - I.descender) * 1.12, pad = 60;
  const W = Math.max(1, ...lines.map(l => l.width)) + pad * 2, H = lh * lines.length + pad * 2;
  return { I, lines, lh, pad, W, H };
}
function phraseSVG() {
  const { I, lines, lh, pad, W, H } = phraseLayoutUnits(); let d = '';
  lines.forEach((ln, li) => { const ox = pad + (W - pad * 2 - ln.width) / 2, base = pad + li * lh + I.ascender; for (const it of ln.items) d += FXE.pathD(it.out.contours, (x, y) => [ox + it.x + x, base - y]); });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}" width="${Math.ceil(W)}" height="${Math.ceil(H)}"><path fill="#111" d="${d}"/></svg>\n`;
}
function phrasePNG() {
  const { I, lines, lh, pad, W, H } = phraseLayoutUnits(), k = Math.min(3000 / W, 3000 / H, 2), c = document.createElement('canvas');
  c.width = Math.ceil(W * k); c.height = Math.ceil(H * k); const x = c.getContext('2d'); x.fillStyle = '#111';
  lines.forEach((ln, li) => { const ox = pad + (W - pad * 2 - ln.width) / 2, base = pad + li * lh + I.ascender; for (const it of ln.items) x.fill(glyphPath(it.out, (a, b) => [(ox + it.x + a) * k, (base - b) * k])); });
  return new Promise(res => c.toBlob(res, 'image/png'));
}
$('#fxExport').addEventListener('click', async () => {
  const fmt = $('#fxFmt').value, b = baseName(), tr = fxTransform();
  if (!hasOT && (fmt === 'zip' || fmt === 'ttf')) { toast(T('Экспорт шрифта недоступен: библиотека не загрузилась')); return; }
  try {
    if (fmt === 'zip') return await exportFont();
    await warmFx((i, n) => toast(T('Применяю эффекты: {0} из {1}', i, n)));
    if (fmt === 'ttf') return await saveFile(b + '.ttf', new Blob([L.buildTTF(font, { transform: tr, kerning: L.flatKerning(font) }).buffer], { type: 'font/ttf' }));
    if (fmt === 'svgfont') return await saveFile(b + '.svg', new Blob([L.buildSVGFont(font, { transform: tr, kerning: L.flatKerning(font) }, FXE.pathD)], { type: 'image/svg+xml' }));
    if (fmt === 'gif' || fmt === 'video') return await exportAnim(fmt);
    if (fmt === 'svgtext') return await saveFile(b + '-phrase.svg', new Blob([phraseSVG()], { type: 'image/svg+xml' }));
    if (fmt === 'png') return await saveFile(b + '-phrase.png', await phrasePNG());
  } catch (e) { toast(T('Ошибка экспорта: ') + (e.message || e)); }
});
function enterFx() {
  if (!font.glyphs[fxs.cur] || !font.glyphs[fxs.cur].contours.length) fxs.cur = font.order.find(k => font.glyphs[k].contours.length) || font.order[0];
  fxs.sig = fxSig(); syncFxPanel(); buildFxGrid(); setFxMode(fxs.mode); scheduleFxDraw(); if (fxs.anim) { fxs.last = performance.now(); requestAnimationFrame(animFx); }
}

/* ======================= MOBILE SHEETS ======================= */
const MQ = window.matchMedia('(max-width: 980px)');
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const HR = () => ed.touch ? 2.4 : 1;
for (const sh of $$('.sheet')) { const h = document.createElement('div'); h.className = 'sheethead'; h.innerHTML = '<b></b><button class="btn sm" data-sheet-close></button>'; h.querySelector('button').textContent = T('Готово'); h.querySelector('b').textContent = sh.dataset.title || ''; sh.prepend(h); }
function syncSheetBtns() { $$('[data-sheet]').forEach(b => { const s = $('#' + b.dataset.sheet); b.setAttribute('aria-pressed', String(!!(s && s.classList.contains('open')))); }); }
function toggleSheet(id, force) {
  const el = $('#' + id); if (!el) return; const open = force == null ? !el.classList.contains('open') : force;
  $$('.sheet.open').forEach(s => { if (s !== el) s.classList.remove('open'); });
  el.classList.toggle('open', open);
  $$('.view').forEach(v => v.classList.toggle('sheet-open', MQ.matches && !!v.querySelector('.sheet.open')));
  syncSheetBtns();
}
function closeSheets() { $$('.sheet.open').forEach(s => s.classList.remove('open')); $$('.view').forEach(v => v.classList.remove('sheet-open')); syncSheetBtns(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (b) toggleSheet(b.dataset.sheet); else if (e.target.closest('[data-sheet-close]')) closeSheets(); });
for (const h of $$('.sheethead')) {
  let y0 = null;
  h.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; y0 = e.clientY; h.setPointerCapture(e.pointerId); h.parentElement.style.transition = 'none'; });
  h.addEventListener('pointermove', e => { if (y0 == null) return; const dy = Math.max(0, e.clientY - y0); h.parentElement.style.transform = `translateY(${dy}px)`; });
  const end = e => { if (y0 == null) return; const dy = e.clientY - y0, sh = h.parentElement; sh.style.transition = ''; sh.style.transform = ''; y0 = null; if (dy > 70) closeSheets(); };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
}
MQ.addEventListener('change', closeSheets);

/* ======================= MODALS ======================= */
function openModal(id) { const m = $('#' + id); m.hidden = false; const f = m.querySelector('[data-close]'); if (f) f.focus(); }
function closeModal(m) { m.hidden = true; }
const openModalEl = () => $$('.modal').find(m => !m.hidden);
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); }));
window.addEventListener('keydown', e => { const m = openModalEl(); if (!m) return; if (e.key === 'Escape') closeModal(m); else if (m.id === 'mTour') tourKey(e); if (!typing(e)) e.stopImmediatePropagation(); }, true);
$('#bHelp').addEventListener('click', () => openModal('mHelp'));

/* ======================= PROJECTS & SAVING ======================= */
const PIDX = 'litera.projects.v1', PCUR = 'litera.cur';
let projId = null;
const newPid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function projList() { try { const a = JSON.parse(localStorage.getItem(PIDX) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
let saveStateV = 'saved';
function setSaveState(s) { saveStateV = s; const el = $('#saveState'); if (!el) return; el.className = 'savest' + (s === 'fail' ? ' fail' : ''); el.textContent = s === 'saved' ? T('Сохранено') : s === 'pending' ? T('Сохраняю…') : T('Не сохранено'); el.title = s === 'fail' ? T('Браузер не дал сохранить проект: хранилище заполнено или отключено. Скачайте .json, чтобы не потерять работу.') : ''; }
function save() {
  clearTimeout(saveT);
  try {
    if (!projId) projId = newPid();
    localStorage.setItem('litera.p.' + projId, JSON.stringify(font));
    const list = projList().filter(p => p.id !== projId);
    list.unshift({ id: projId, name: font.info.familyName, style: font.info.styleName, n: font.order.filter(k => font.glyphs[k].contours.length).length, t: Date.now() });
    localStorage.setItem(PIDX, JSON.stringify(list)); localStorage.setItem(PCUR, projId);
    setSaveState('saved'); autoVersion();
  } catch (e) { setSaveState('fail'); }
  if (tab === 'font') renderProjects();
}
const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = txt; if (fn) b.addEventListener('click', fn); return b; };
function renderProjects() {
  const box = $('#plist'); box.textContent = ''; const list = projList();
  if (!list.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = T('Здесь появятся ваши шрифты.'); box.appendChild(p); return; }
  for (const p of list) {
    const row = document.createElement('div'); row.className = 'prow' + (p.id === projId ? ' cur' : '');
    const info = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = (p.name || T('Без названия')) + ' ' + (p.style || ''); sm.textContent = T('{0} глифов · {1}', p.n || 0, new Date(p.t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    info.append(b, sm); row.appendChild(info);
    if (p.id === projId) { const s = document.createElement('span'); s.className = 'lbl'; s.textContent = T('открыт'); row.append(s, document.createElement('span')); }
    else { const d = mkBtn(T('Удалить')); armed(d, () => deleteProject(p.id)); row.append(mkBtn(T('Открыть'), () => openProject(p.id)), d); }
    box.appendChild(row);
  }
}
function newProject(f, msg) { save(); projId = newPid(); setFont(f); save(); renderProjects(); if (msg) toast(msg); }
function openProject(id) {
  save(); let o = null; try { o = JSON.parse(localStorage.getItem('litera.p.' + id) || 'null'); } catch (e) { }
  if (!o || !o.glyphs) { toast(T('Проект не найден в хранилище браузера')); return; }
  projId = id; setFont(o); save(); renderProjects(); toast(T('Открыт: ') + font.info.familyName);
}
function deleteProject(id) { try { localStorage.removeItem('litera.p.' + id); localStorage.setItem(PIDX, JSON.stringify(projList().filter(p => p.id !== id))); } catch (e) { } renderProjects(); toast(T('Проект удалён')); }
function sampleLigas(f) {
  for (const [seq, parts] of [['fi', ['f', 'ı']], ['fl', ['f', 'l']]]) {
    const key = 'liga:' + seq; if (f.glyphs[key] || parts.some(c => !f.glyphs[c] || !f.glyphs[c].contours.length)) continue;
    const g = { u: null, name: L.glyphName(key), adv: 0, contours: [] }; let x = 0;
    parts.forEach((c, i) => { const src = f.glyphs[c]; if (i) x -= 40; g.contours.push(...L.shiftC(src.contours, x, 0)); x += src.adv; });
    g.adv = Math.round(x); if (window.polygonClipping) { try { g.contours = L.booleanOp('union', g.contours, []); } catch (e) { } }
    f.glyphs[key] = g; f.order.push(key);
  }
}
function makeSample() {
  const f = L.sampleFont(!!window.polygonClipping);
  if (window.polygonClipping) for (const k of f.order) { const g = f.glyphs[k]; if (g.contours.length) g.contours = L.fixContours(g.contours); }
  L.composeSets(f, Object.keys(L.CSETS), { kern: true }); sampleLigas(f); f.sampleVersion = 4; f.info.description = T('Образец, созданный в Kernage'); return f;
}
$('#bNewFont').addEventListener('click', () => { newProject((() => { const f = L.emptyFont(); f.info.familyName = T('Новый шрифт'); return f; })(), T('Создан пустой шрифт')); setTab('glyphs'); });
$('#bSample').addEventListener('click', () => { newProject(makeSample(), T('Создан шрифт из образца Orbita')); setTab('glyphs'); });
$('#bDup').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(font)); c.info.familyName += ' ' + T('копия'); newProject(c, T('Создана копия')); fillInfo(); });

/* ======================= GLYPH MARKS & COMPOSITES ======================= */
let gMark = '';
$('#gmark').addEventListener('change', e => { gMark = e.target.value; applyFilter(); });
$$('.marks [data-m]').forEach(b => b.addEventListener('click', () => { const g = curG(), m = +b.dataset.m; if (m) g.mark = m; else delete g.mark; touch(cur); refreshPanel(); }));
$('#pFxSkip').addEventListener('change', e => { const g = curG(); if (e.target.checked) g.fxSkip = true; else delete g.fxSkip; touch(cur); });
function refreshExtra(g) {
  $$('.marks [data-m]').forEach(b => b.setAttribute('aria-pressed', String((g.mark || 0) === +b.dataset.m)));
  $('#pFxSkip').checked = !!g.fxSkip;
  renderRefs(g); renderPalette(); renderAnchors(); renderLayerUI(); syncFormulas();
  const ci = $('#compInfo'); ci.hidden = !g.comp; if (g.comp) $('#compTxt').textContent = T('Составной: {0} + {1}', g.comp.base, L.MARKS[g.comp.kind] || T('поворот'));
}
$('#bCompRe').addEventListener('click', () => { const g = curG(); if (!g.comp) return; const r = L.composeOne(font, { ch: cur, base: g.comp.base, kind: g.comp.kind }); if (r.err) { toast(r.err === 'base' ? T('Базовая буква пустая') : T('Знак пустой: нарисуйте его')); return; } pushUndo(); g.contours = r.contours; g.adv = r.adv; ed.sel.clear(); changed(); });
function openComp() {
  const box = $('#cGroups'); box.textContent = '';
  for (const key in L.CSETS) {
    const specs = L.parseSet(key), have = specs.filter(s => font.glyphs[s.ch] && font.glyphs[s.ch].contours.length).length;
    const lab = document.createElement('label'); lab.className = 'cgroup';
    lab.innerHTML = `<span class="chk"><input type="checkbox" data-set="${key}"${have < specs.length ? ' checked' : ''}> <span></span> <span class="lbl mono"></span></span><div class="chars"></div>`;
    lab.querySelector('.chk > span:not(.lbl)').textContent = T(L.CSETS[key].name); lab.querySelector('.lbl').textContent = `${have}/${specs.length}`;
    const ch = lab.querySelector('.chars'); for (const s of specs) { const e = document.createElement(font.glyphs[s.ch] && font.glyphs[s.ch].contours.length ? 'b' : 'span'); e.textContent = s.ch; ch.appendChild(e); }
    box.appendChild(lab);
  }
  const miss = Object.values(L.MARKS).filter(m => !font.glyphs[m] || !font.glyphs[m].contours.length);
  if (miss.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = T('Нет знаков: {0}. Буквы с ними будут пропущены. Добавьте и нарисуйте эти глифы.', miss.join(' ')); box.appendChild(p); }
  openModal('mComp');
}
$('#bComp').addEventListener('click', openComp);
$('#bCompGo').addEventListener('click', () => {
  const keys = $$('#cGroups [data-set]').filter(i => i.checked).map(i => i.dataset.set); if (!keys.length) { toast(T('Отметьте хотя бы один набор')); return; }
  const r = L.composeSets(font, keys, { kern: $('#cKern').checked, overwrite: $('#cOver').checked });
  r.made.forEach(k => { dirtyCards.add(k); gver[k] = (gver[k] || 0) + 1; }); buildGrid(); touch(); closeModal($('#mComp'));
  toast(T('Собрано букв: {0}', r.made.length) + (r.skipped.length ? T(' · пропущено {0}: нет базы или знака', r.skipped.length) : ''));
});
$('#bCompAll').addEventListener('click', () => { const n = L.rebuildComposites(font); fxCache.clear(); buildGrid(); touch(); closeModal($('#mComp')); toast(T('Пересобрано составных: ') + n); });

/* ======================= EDITOR: TOUCH, BRUSH, MEASURE ======================= */
let lpT = 0, lastTap = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
function longPress(h) {
  const dr = ed.drag; if (!dr || dr.armed || dr.type !== 'nodes') return;
  dropUndo(); ed.drag = null; pushUndo(); buzz(18); toggleSmooth([[h.ci, h.ni]]); ed.sel = new Set([h.ci + ',' + h.ni]); changed();
  toast(node(h.ci, h.ni).s ? T('Точка стала гладкой') : T('Точка стала угловой'));
}
function checkDoubleTap(sx, sy, dr) {
  const now = performance.now();
  if (lastTap && now - lastTap.t < 340 && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 28) {
    lastTap = null; const h = hitNode(sx, sy);
    if (h && h.part === 'node') { if (dr.undo) dropUndo(); const c = curG().contours[h.ci]; ed.sel = new Set(c.map((_, ni) => h.ci + ',' + ni)); edDraw(); refreshPanel(); return true; }
    const sg = hitSegment(sx, sy); if (sg) { if (dr.undo) dropUndo(); pushUndo(); insertPoint(sg); changed(); buzz(10); return true; }
    return false;
  }
  lastTap = { t: now, x: sx, y: sy }; return false;
}
const brushR = ev => { const w = +$('#brW').value / 2; return ev.pointerType === 'pen' && $('#brPress').checked ? w * (0.2 + 0.8 * (ev.pressure || 0.5)) : w; };
function finishStroke(dr) {
  if (!window.polygonClipping) { toast(T('Кисть недоступна: модуль геометрии не загрузился')); edDraw(); return; }
  const g = curG(); pushUndo();
  try { const comps = g.contours.filter(L.isComp), r = L.applyStroke(g.contours.filter(c => !L.isComp(c)), dr.pts, dr.erase, $('#brMerge').checked, 1.3); if (!r.changed) { dropUndo(); edDraw(); return; } g.contours = r.contours.concat(comps); ed.sel.clear(); changed(); }
  catch (err) { dropUndo(); toast(T('Мазок не удалось применить')); edDraw(); }
}
function snapAngle(a, b) { const v = angleSnapV(b[0] - a[0], b[1] - a[1]); return [a[0] + v[0], a[1] + v[1]]; }
function segX(A, B, P, Q) { const r = [B[0] - A[0], B[1] - A[1]], s = [Q[0] - P[0], Q[1] - P[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((P[0] - A[0]) * s[1] - (P[1] - A[1]) * s[0]) / den, u = ((P[0] - A[0]) * r[1] - (P[1] - A[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u < 1 ? t : null; }
function drawMeasure(g) {
  const m = ed.measure, A = m.a, B = m.b, len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 1) return;
  const a = toS(A[0], A[1]), b = toS(B[0], B[1]), ts = [];
  for (const c of g.contours) { const r = L.flatten(c, 3); for (let i = 0; i < r.length; i++) { const t = segX(A, B, r[i], r[(i + 1) % r.length]); if (t != null) ts.push(t); } }
  ts.sort((x, y) => x - y);
  cx.strokeStyle = COL.neg; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
  const lab = (x, y, txt) => { cx.font = "11px 'IBM Plex Mono', monospace"; const w = cx.measureText(txt).width + 10; cx.fillStyle = COL.ink; cx.fillRect(x - w / 2, y - 9, w, 18); cx.fillStyle = COL.canvas; cx.textBaseline = 'middle'; cx.textAlign = 'center'; cx.fillText(txt, x, y + .5); cx.textAlign = 'left'; };
  for (const t of ts) { const p = toS(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t); cx.fillStyle = COL.neg; cx.beginPath(); cx.arc(p[0], p[1], 3.5, 0, 7); cx.fill(); }
  for (let i = 0; i + 1 < ts.length; i++) { const d = (ts[i + 1] - ts[i]) * len; if (d * ed.scale < 22) continue; const tm = (ts[i] + ts[i + 1]) / 2, p = toS(A[0] + (B[0] - A[0]) * tm, A[1] + (B[1] - A[1]) * tm); lab(p[0], p[1] - 14, String(Math.round(d))); }
  lab(b[0], b[1] + 18, `${Math.round(len)} · ${Math.round(Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI)}°`);
}
function drawExtras(g) {
  const bb = L.bounds(g.contours);
  if (bb) { const [ax0, by0] = toS(0, 0), [ax1] = toS(g.adv, 0); cx.font = "10px 'IBM Plex Mono', monospace"; cx.fillStyle = COL.mute; cx.textBaseline = 'top'; cx.fillText(String(Math.round(bb.x0)), ax0 + 4, by0 + 4); const rs = String(Math.round(g.adv - bb.x1)); cx.fillText(rs, ax1 - cx.measureText(rs).width - 4, by0 + 4); }
  const dr = ed.drag;
  if (dr && dr.type === 'stroke') {
    cx.strokeStyle = dr.erase ? COL.neg : COL.accent; cx.globalAlpha = .5; cx.lineCap = 'round';
    for (let i = 0; i < dr.pts.length; i++) { const p = dr.pts[i], q = dr.pts[Math.max(0, i - 1)], a = toS(q[0], q[1]), b = toS(p[0], p[1]); cx.lineWidth = Math.max(1, (p[2] + q[2]) * ed.scale); cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0] + 0.01, b[1]); cx.stroke(); }
    cx.globalAlpha = 1; cx.lineCap = 'butt';
  }
  if ((ed.tool === 'brush' || ed.tool === 'erase') && ed.mouse && !ed.touch && !(dr && dr.type === 'stroke')) { cx.strokeStyle = ed.tool === 'erase' ? COL.neg : COL.mute; cx.lineWidth = 1; cx.beginPath(); cx.arc(ed.mouse[0], ed.mouse[1], Math.max(2, +$('#brW').value / 2 * ed.scale), 0, 7); cx.stroke(); }
  if (ed.measure && ed.tool === 'measure') drawMeasure(g);
  if (ed.knife && ed.tool === 'knife') drawKnife();
  drawAnchors();
  drawGuides();
  $('#penBar').hidden = ed.pen == null; $('#selBar').hidden = !(ed.tool === 'select' && ed.sel.size && (COARSE || MQ.matches) && !ed.drag && ed.pen == null); $('#brushBar').hidden = !(ed.tool === 'brush' || ed.tool === 'erase');
}
$('#tMulti').addEventListener('click', () => { ed.multi = !ed.multi; $('#tMulti').setAttribute('aria-pressed', String(ed.multi)); toast(ed.multi ? T('Касания добавляют точки к выделению') : T('Обычное выделение')); });
$('#penDone').addEventListener('click', () => { endPen(); edDraw(); refreshPanel(); });
$('#penClose').addEventListener('click', () => { const g = curG(); if (ed.pen == null) return; if (g.contours[ed.pen].length < 3) { toast(T('Нужно хотя бы три точки')); return; } pushUndo(); ed.pen = null; ed.sel.clear(); changed(); });
$('#brW').addEventListener('input', e => { $('#brWv').textContent = e.target.value; lsSet('litera.brw', e.target.value); edDraw(); });
$$('[data-nd]').forEach(b => b.addEventListener('click', () => { if (!selList().length) { toast(T('Сначала выделите точки')); return; } const [dx, dy] = b.dataset.nd.split(',').map(Number), st = +$('#ndStep').value; moveSel(dx * st, dy * st); }));
$('#bSelAll').addEventListener('click', () => { selectAllOwn(); edDraw(); refreshPanel(); });
$('#bSelNone').addEventListener('click', () => { ed.sel.clear(); edDraw(); refreshPanel(); });
$$('[data-al]').forEach(b => b.addEventListener('click', () => {
  const s = selList(); if (s.length < 2) { toast(T('Выделите хотя бы две точки')); return; } pushUndo();
  const ns = s.map(([ci, ni]) => node(ci, ni)), xs = ns.map(n => n.x), ys = ns.map(n => n.y), al = b.dataset.al;
  const tx = al === 'l' ? Math.min(...xs) : al === 'r' ? Math.max(...xs) : al === 'cx' ? Math.round((Math.min(...xs) + Math.max(...xs)) / 2) : null;
  const ty = al === 'b' ? Math.min(...ys) : al === 't' ? Math.max(...ys) : al === 'cy' ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : null;
  for (const n of ns) { const dx = tx == null ? 0 : tx - n.x, dy = ty == null ? 0 : ty - n.y; n.x += dx; n.y += dy; if (n.i) n.i = [n.i[0] + dx, n.i[1] + dy]; if (n.o) n.o = [n.o[0] + dx, n.o[1] + dy]; }
  changed();
}));
$('#bRoundCorners').addEventListener('click', () => {
  const r = +$('#tRad').value || 40, by = {};
  for (const [ci, ni] of selList()) if (!node(ci, ni).s) (by[ci] = by[ci] || []).push(ni);
  const cis = Object.keys(by); if (!cis.length) { toast(T('Выделите угловые точки')); return; }
  pushUndo(); let done = 0; for (const ci of cis) { const res = L.roundCorners(curG().contours[ci], by[ci], r); curG().contours[ci] = res.contour; done += res.done; }
  ed.sel.clear(); if (!done) { dropUndo(); toast(T('Углы слишком короткие для такого радиуса')); edDraw(); return; } changed(); toast(T('Скруглено углов: ') + done);
});
$('#bExtremes').addEventListener('click', () => { pushUndo(); const g = curG(), comps = g.contours.filter(L.isComp), r = L.addExtremes(g.contours.filter(c => !L.isComp(c))); if (!r.added) { dropUndo(); toast(T('Все экстремумы на месте')); return; } g.contours = r.contours.concat(comps); ed.sel.clear(); changed(); toast(T('Добавлено точек: ') + r.added); });
function runCheck() {
  const r = L.checkContours(curG().contours), out = $('#chkOut'), lines = [];
  if (r.wrongDir) lines.push(T('Неверное направление контуров: {0}', r.wrongDir)); if (r.extremes) lines.push(T('Кривых без точек в экстремумах: {0}', r.extremes));
  if (r.dupes) lines.push(T('Совпадающих точек: {0}', r.dupes)); if (r.degenerate) lines.push(T('Пустых контуров: {0}', r.degenerate)); if (r.tiny) lines.push(T('Очень коротких отрезков: {0}', r.tiny));
  out.hidden = false; out.textContent = lines.length ? lines.join('\n') : T('Ошибок не найдено'); $('#bFixAll').hidden = !r.total;
}
$('#bCheck').addEventListener('click', runCheck);
$('#bFixAll').addEventListener('click', () => { pushUndo(); const g = curG(); g.contours = L.fixContours(g.contours.filter(c => !L.isComp(c))).concat(g.contours.filter(L.isComp)); ed.sel.clear(); changed(); runCheck(); });

/* ======================= SKETCH & TRACE ======================= */
function sketchLum(maxSide) {
  const img = ed.bg, k = Math.min(1, maxSide / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, lum = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) lum[i] = Math.round(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
  return { lum, w, h, k };
}
const isInk = (v, th, inv) => inv ? v > th : v < th;
function autoThreshold() {
  const { lum, w, h } = sketchLum(400), hist = new Uint32Array(256); for (const v of lum) hist[v]++;
  const th = L.otsu(hist, w * h); let dark = 0; for (const v of lum) if (v < th) dark++;
  $('#trThr').value = th; $('#trThrV').textContent = th; $('#trInv').checked = dark > w * h * 0.6;
}
function buildMask() {
  if (!ed.bg) { ed.bgMask = null; return; }
  const { lum, w, h } = sketchLum(700), th = +$('#trThr').value, inv = $('#trInv').checked, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), id = x.createImageData(w, h), hx = (COL.accent || '#2D43D2').replace('#', ''), R = parseInt(hx.slice(0, 2), 16), G2 = parseInt(hx.slice(2, 4), 16), B2 = parseInt(hx.slice(4, 6), 16);
  for (let i = 0; i < w * h; i++) if (isInk(lum[i], th, inv)) { id.data[i * 4] = R; id.data[i * 4 + 1] = G2; id.data[i * 4 + 2] = B2; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); ed.bgMask = c;
}
function fitSketch(silent) {
  if (!ed.bg) { if (!silent) toast(T('Сначала загрузите эскиз')); return; }
  const { lum, w, h, k } = sketchLum(500), th = +$('#trThr').value, inv = $('#trInv').checked;
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isInk(lum[y * w + x], th, inv)) { rows[y]++; cols[x]++; }
  const minR = Math.max(1, w * 0.004), minC = Math.max(1, h * 0.004); let y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
  while (y0 < h && rows[y0] < minR) y0++; while (y1 > y0 && rows[y1] < minR) y1--; while (x0 < w && cols[x0] < minC) x0++; while (x1 > x0 && cols[x1] < minC) x1--;
  if (y0 >= h || x0 >= w) { if (!silent) toast(T('На эскизе не нашлось линий. Поменяйте порог')); return; }
  const I = font.info; let mode = $('#fitTo').value;
  if (mode === 'auto') mode = !/\p{Ll}/u.test(cur) ? 'cap' : /[bdfhklt]|[бё]/u.test(cur) ? 'asc' : /[gjpqy]|[дзруфцщ]/u.test(cur) ? 'desc' : 'x';
  const [yb, yt] = mode === 'cap' ? [0, I.capHeight] : mode === 'x' ? [0, I.xHeight] : mode === 'asc' ? [0, I.ascender - 20] : [I.descender + 20, I.xHeight];
  const img = ed.bg, kk = (yt - yb) / ((y1 - y0 + 1) / k), lsb = 60;
  ed.bgSc = kk * img.height / (I.ascender - I.descender); ed.bgY = yb + ((y1 + 1) / k) * kk - I.ascender; ed.bgX = lsb - (x0 / k) * kk;
  $('#bgSc').value = Math.round(ed.bgSc * 100); $('#bgX').value = Math.round(ed.bgX); $('#bgY').value = Math.round(ed.bgY);
  const g = curG(); if (!g.contours.length) { g.adv = Math.round(((x1 - x0 + 1) / k) * kk + lsb * 2); touch(cur); refreshPanel(); }
  ed.needFit = true; edDraw(); if (!silent) toast(T('Эскиз подогнан по метрикам'));
}
function blur3(a, w, h) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } } t[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } o[y * w + x] = s / n; }
  return o;
}
function traceSketch() {
  if (!ed.bg) { toast(T('Сначала загрузите эскиз')); return; }
  const I = font.info, img = ed.bg, kU = (I.ascender - I.descender) * ed.bgSc / img.height;
  const maxSide = Math.max(80, Math.min(900, Math.max(img.width, img.height) * kU / 2.2));
  const { lum, w, h, k } = sketchLum(maxSide), upp = kU / k, th = +$('#trThr').value, inv = $('#trInv').checked;
  const val = new Float32Array(w * h); for (let i = 0; i < w * h; i++) { const d = inv ? lum[i] - th : th - lum[i]; val[i] = Math.max(0, Math.min(1, 0.5 + d / 60)); }
  const rings = L.traceField(blur3(val, w, h), w, h, 0.5), ox = ed.bgX, oy = I.ascender + ed.bgY;
  const cs = L.ringsToContours(rings, p => [ox + (p[0] + .5) * upp, oy - (p[1] + .5) * upp], +$('#trErr').value / 10, Math.pow(upp * 4, 2), upp);
  if (!cs.length) { toast(T('Контуры не найдены. Поменяйте порог или переключите «Светлые линии»')); return; }
  const cs2 = L.addExtremes(cs).contours; pushUndo(); const g = curG(); g.contours = $('#trRepl').checked ? cs2.concat(g.contours.filter(L.isComp)) : g.contours.concat(cs2); ed.sel.clear(); ed.bgMask = null; changed();
  toast(T('Трассировано: контуров {0}, точек {1}', cs2.length, cs2.reduce((a, c) => a + c.length, 0)));
}
function loadSketch(f) {
  if (!f) return; const img = new Image();
  img.onload = () => { ed.bg = img; autoThreshold(); fitSketch(true); buildMask(); edDraw(); toast(T('Эскиз загружен. Проверьте порог и нажмите «Трассировать эскиз»')); };
  img.onerror = () => toast(T('Не удалось открыть изображение')); img.src = URL.createObjectURL(f);
}
$('#bgCam').addEventListener('change', e => { loadSketch(e.target.files[0]); e.target.value = ''; });
$('#bBgFit').addEventListener('click', () => { fitSketch(false); });
$('#bTrace').addEventListener('click', traceSketch);
let maskT; const remask = () => { clearTimeout(maskT); maskT = setTimeout(() => { buildMask(); edDraw(); }, 60); };
$('#trThr').addEventListener('input', e => { $('#trThrV').textContent = e.target.value; remask(); });
$('#trInv').addEventListener('change', remask);
$('#trErr').addEventListener('input', e => { $('#trErrV').textContent = (e.target.value / 10).toFixed(1); });

/* ======================= PREVIEW EXTRAS ======================= */
$$('[data-pa]').forEach(b => b.addEventListener('click', () => { $$('[data-pa]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#proof').style.textAlign = b.dataset.pa; }));
function applyColors(on) { for (const el of [$('#proof'), $('#wf'), $('#chart')]) { el.style.color = on ? $('#pvInk').value : ''; el.style.background = on ? $('#pvPaper').value : ''; } }
$('#pvInk').addEventListener('input', () => applyColors(true)); $('#pvPaper').addEventListener('input', () => applyColors(true));
$('#pvColReset').addEventListener('click', () => { applyColors(false); $('#pvInk').value = COL.ink.length === 7 ? COL.ink : '#131722'; $('#pvPaper').value = COL.canvas.length === 7 ? COL.canvas : '#fcfdfe'; });
$('#pvPng').addEventListener('click', async () => {
  if (!liveFace) { toast(T('Шрифт ещё собирается, попробуйте через секунду')); return; }
  const size = +$('#pvSize').value * 2, lh = +$('#pvLh').value / 100, tr = +$('#pvTr').value / 1000, W = 2000, pad = 120, al = $('#proof').style.textAlign || 'left';
  const ink = $('#proof').style.color ? $('#pvInk').value : '#131722', paper = $('#proof').style.background ? $('#pvPaper').value : '#ffffff';
  const c = document.createElement('canvas'), x = c.getContext('2d'), fam = `${size}px '${liveFace.family}', 'Golos Text', sans-serif`;
  const setup = () => { x.font = fam; try { x.letterSpacing = (tr * size) + 'px'; } catch (e) { } try { x.fontKerning = $('#pvKern').checked ? 'normal' : 'none'; } catch (e) { } };
  setup(); const lines = [];
  for (const para of ($('#proof').innerText || ' ').split('\n')) { let cur2 = ''; for (const w of para.split(/\s+/)) { const t2 = cur2 ? cur2 + ' ' + w : w; if (cur2 && x.measureText(t2).width > W - pad * 2) { lines.push(cur2); cur2 = w; } else cur2 = t2; } lines.push(cur2); }
  c.width = W; c.height = Math.ceil(pad * 2 + lines.length * size * lh + 60);
  x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height); setup(); x.fillStyle = ink; x.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => { const w = x.measureText(ln).width, X = al === 'center' ? (W - w) / 2 : al === 'right' ? W - pad - w : pad; x.fillText(ln, X, pad + size * 0.85 + i * size * lh); });
  x.font = "28px 'IBM Plex Mono', monospace"; try { x.letterSpacing = '0px'; } catch (e) { } x.globalAlpha = .55; x.fillText(`${font.info.familyName} ${font.info.styleName} · ${size / 2}px`, pad, c.height - pad / 2); x.globalAlpha = 1;
  c.toBlob(b => { if (b) saveFile(baseName() + '-specimen.png', b); else toast(T('Не удалось создать изображение')); }, 'image/png');
});

/* ======================= FAMILY EXPORT ======================= */
const FAMILY = [{ id: 'fvLight', style: 'Light', wc: 300, fs: 0, w: -14, sl: 0 }, { id: 'fvBold', style: 'Bold', wc: 700, fs: 32, w: 24, sl: 0 }, { id: 'fvItalic', style: 'Italic', wc: 400, fs: 1, w: 0, sl: 11 }, { id: 'fvBoldItalic', style: 'Bold Italic', wc: 700, fs: 33, w: 24, sl: 11 }];
function variantTransform(tr, v) {
  const memo = new Map();
  return (k, g) => {
    if (memo.has(k)) return memo.get(k);
    const base = tr ? tr(k, g) : g, P = FXE.defaults(); P.weight = v.w; P.slant = v.sl;
    let out; try { out = FXE.process({ contours: base.contours, adv: base.adv, u: g.u }, P, font.info, 1, 0); if (v.w && out.contours.length) { L.translate(out.contours, v.w, 0); out.adv = Math.round(out.adv + 2 * v.w); } } catch (e) { out = { contours: base.contours, adv: base.adv }; }
    memo.set(k, out); return out;
  };
}
async function familyFiles(tr, files, KF, web) {
  const fam = (font.info.familyName.replace(/[^\p{L}\p{N}_-]+/gu, '') || 'font'), out = [];
  for (const v of FAMILY) {
    if (!$('#' + v.id).checked) continue; const vt = variantTransform(tr, v), opts = { transform: vt, styleName: v.style, weightClass: v.wc, fsSelection: v.fs, kerning: KF, kerningRaw: font.kerning, kgroups: font.kgroups, hint: $('#xHint').checked }, nm = fam + '-' + v.style.replace(/\s/g, '');
    { let t0 = performance.now(); for (const k of font.order) { const g = font.glyphs[k]; if (g && g.contours.length) vt(k, g); if (performance.now() - t0 > 40) { toast(T('Начертание {0}…', v.style)); await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); } } }
    const ob = L.buildFont(font, opts).buffer;
    if ($('#xOtf').checked || !$('#xTtf').checked) files.push({ name: nm + '.otf', data: new Uint8Array(ob) });
    if ($('#xTtf').checked) files.push({ name: nm + '.ttf', data: new Uint8Array(L.buildTTF(font, opts).buffer) });
    if (web) files.push({ name: nm + '.woff', data: new Uint8Array(await L.toWOFF(ob)) });
    out.push({ file: nm, wc: v.wc, sl: v.sl, style: v.style, ttf: $('#xTtf').checked });
    await new Promise(r => setTimeout(r, 0));
  }
  return out;
}

/* ======================= FX EXTRAS ======================= */
$('#fxRandom2').addEventListener('click', fxRandomize);
$('#fxBakeOne').addEventListener('click', () => {
  const k = fxs.cur, g = font.glyphs[k]; if (!g) return; if (g.fxSkip) { toast(T('Этот глиф уже исключён из эффектов')); return; }
  if (!FXE.isActive(fxP())) { toast(T('Сначала включите хотя бы один эффект')); return; }
  const out = fxOut(k, 0), s = undo.s(k); s.u.push(snapshot(g)); s.r.length = 0;
  g.contours = out.contours.map(L.cloneC); g.adv = out.adv; g.fxSkip = true; touch(k); scheduleFxDraw(); queueThumbs();
  toast(T('Глиф {0} запечён и исключён из эффектов', show(k)));
});
(function () {
  const st = $('#fxStage'), pts = new Map(); let pz = null, last = null;
  st.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pz = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: fxs.zoom }; } });
  st.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pz && pts.size === 2) { const [a, b] = [...pts.values()]; fxs.zoom = Math.max(.2, Math.min(6, pz.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pz.d)); scheduleFxDraw(); } });
  const up = e => {
    const had = pts.size; pts.delete(e.pointerId); if (pts.size < 2) pz = null;
    if (e.type === 'pointerup' && e.pointerType === 'touch' && had === 1) { const now = performance.now(); if (last && now - last.t < 340 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) { last = null; fxs.tt = now; setFxMode(fxs.mode === 'phrase' ? 'glyph' : 'phrase'); } else last = { t: now, x: e.clientX, y: e.clientY }; }
  };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
})();

/* ======================= KERNING GROUPS & HISTORY ======================= */
const kh = { u: [], r: [] };
let kRangeActive = false;
function kSnap() { return { k: Object.assign({}, font.kerning), g: font.kgroups ? JSON.parse(JSON.stringify(font.kgroups)) : null }; }
function kPush() { kh.u.push(kSnap()); if (kh.u.length > 25) kh.u.shift(); kh.r.length = 0; syncKUndo(); }
function kRestore(s) { font.kerning = s.k; font.kgroups = s.g; touch(null, true); renderKernList(); drawKern(); fillGroupsUI(); syncKUndo(); }
function kUndo() { if (!kh.u.length) return; kh.r.push(kSnap()); kRestore(kh.u.pop()); }
function kRedo() { if (!kh.r.length) return; kh.u.push(kSnap()); kRestore(kh.r.pop()); }
function syncKUndo() { $('#kUndoB').disabled = !kh.u.length; $('#kRedoB').disabled = !kh.r.length; }
$('#kUndoB').addEventListener('click', kUndo); $('#kRedoB').addEventListener('click', kRedo);
const groupMode = () => !!(font.kgroups && $('#kgMode').checked);
const showKey = side => L.isGS(side) ? '[' + show(side.slice(1)) + ']' : show(side);
function kernSrcLabel() {
  const s = L.kernSource(font, kern.l, kern.r), G = font.kgroups, el = $('#kSrc');
  const gl = G && G.L[kern.l], gr = G && G.R[kern.r];
  const grp = (gl || gr) ? ` [${gl ? show(gl) : show(kern.l)}][${gr ? show(gr) : show(kern.r)}]` : '';
  el.textContent = s.src === 'pair' ? T('пара') : s.src === 'group' ? T('группа') + grp : s.src === 'exception' ? T('исключение') : (grp ? T('группа') + grp : '');
  el.className = 'ksrc ' + s.src;
}
function fillGroupsUI() {
  const G = font.kgroups, nL = G ? new Set(Object.values(G.L)).size : 0, nR = G ? new Set(Object.values(G.R)).size : 0;
  if (document.activeElement !== $('#kgL')) $('#kgL').value = G ? L.groupsToText(font, 'L') : '';
  if (document.activeElement !== $('#kgR')) $('#kgR').value = G ? L.groupsToText(font, 'R') : '';
  $('#kgStat').textContent = G ? T('Групп по правой стороне: {0}, по левой: {1}', nL, nR) : T('Групп пока нет');
  $('#kgMode').disabled = !G;
}
$('#bAutoGroups').addEventListener('click', () => {
  kPush(); const t0 = performance.now(); font.kgroups = L.autoGroups(font); const r = L.collapseKerning(font);
  touch(null, true); fillGroupsUI(); renderKernList(); drawKern();
  toast(T('Группы собраны за {0} мс. Пар кернинга: было {1}, стало {2}', Math.round(performance.now() - t0), r.before, r.after));
});
armed($('#bClearGroups'), () => { if (!font.kgroups) return; kPush(); font.kerning = L.flatKerning(font); font.kgroups = null; touch(null, true); fillGroupsUI(); renderKernList(); drawKern(); toast(T('Группы убраны, кернинг развёрнут в пары')); });
$('#bApplyGroups').addEventListener('click', () => {
  const a = L.parseGroups(font, $('#kgL').value), b = L.parseGroups(font, $('#kgR').value);
  if (!Object.keys(a.map).length && !Object.keys(b.map).length) { toast(T('Нет ни одной группы из двух и более глифов')); return; }
  kPush(); const flat = L.flatKerning(font); font.kgroups = { L: a.map, R: b.map }; font.kerning = flat; const r = L.collapseKerning(font);
  touch(null, true); fillGroupsUI(); renderKernList(); drawKern();
  toast(T('Группы применены. Пар: {0}', r.after) + (a.bad.length + b.bad.length ? ' · ' + T('пропущены строки с неизвестными символами') : ''));
});
$('#kgMode').addEventListener('change', kernSrcLabel);

/* ======================= SMART GUIDES ======================= */
function guideSets(excludeSel) {
  const g = curG(), xs = new Set([0, Math.round(g.adv)]), ys = new Set();
  g.contours.forEach((c, ci) => c.forEach((n, ni) => { if (excludeSel && ed.sel.has(ci + ',' + ni)) return; xs.add(n.x); ys.add(n.y); }));
  return { gx: [...xs], gy: [...ys] };
}
function smartSnap(x, y, sets) {
  ed.guides = null; if (!ed.smart) return [x, y];
  const tol = 6 / ed.scale; let bx = null, by = null;
  for (const v of sets.gx) if (Math.abs(v - x) < tol && (bx == null || Math.abs(v - x) < Math.abs(bx - x))) bx = v;
  for (const v of sets.gy) if (Math.abs(v - y) < tol && (by == null || Math.abs(v - y) < Math.abs(by - y))) by = v;
  if (bx != null || by != null) { if (ed.touch && (!ed.lastGuide || ed.lastGuide.x !== bx || ed.lastGuide.y !== by)) buzz(5); ed.guides = { x: bx, y: by }; }
  ed.lastGuide = ed.guides;
  return [bx != null ? bx : x, by != null ? by : y];
}
function drawGuides() {
  if (!ed.guides || !ed.drag) return; cx.strokeStyle = COL.neg; cx.lineWidth = 1; cx.setLineDash([5, 4]);
  if (ed.guides.x != null) { const sx = Math.round(toS(ed.guides.x, 0)[0]) + .5; cx.beginPath(); cx.moveTo(sx, 0); cx.lineTo(sx, ed.h); cx.stroke(); }
  if (ed.guides.y != null) { const sy = Math.round(toS(0, ed.guides.y)[1]) + .5; cx.beginPath(); cx.moveTo(0, sy); cx.lineTo(ed.w, sy); cx.stroke(); }
  cx.setLineDash([]);
}
$('#oSmart').addEventListener('change', e => { ed.smart = e.target.checked; lsSet('litera.smart', ed.smart ? '1' : '0'); });

/* ======================= FILL FROM FONT FILE ======================= */
$('#fFill').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!hasOT) { toast(T('Импорт недоступен: библиотека шрифтов не загрузилась')); return; }
  try {
    const src = L.importOT(await f.arrayBuffer()), k = font.info.capHeight / Math.max(1, src.info.capHeight || 700);
    const inRange = ch => { const c = ch.codePointAt(0); return (c >= 0x20 && c <= 0x24F) || (c >= 0x400 && c <= 0x4FF) || (c >= 0x2010 && c <= 0x206F) || c === 0x2116 || (c >= 0x2C6 && c <= 0x2DD); };
    const fresh = new Set(); let filled = 0, added = 0;
    for (const ch of src.order) {
      const sg = src.glyphs[ch]; if (!sg.contours.length && ch !== ' ') continue;
      const cs = L.mapPts(sg.contours, p => [p[0] * k, p[1] * k]), adv = Math.round(sg.adv * k), g = font.glyphs[ch];
      if (g) { if (!g.contours.length && ch !== ' ') { g.contours = cs; g.adv = adv; filled++; fresh.add(ch); dirtyCards.add(ch); gver[ch] = (gver[ch] || 0) + 1; } }
      else if (inRange(ch) && ch !== ' ') { const ng = L.newGlyph(ch, adv); ng.contours = cs; font.glyphs[ch] = ng; font.order.push(ch); added++; fresh.add(ch); }
    }
    let pairs = 0;
    for (const key in src.kerning) { const [l, r] = key.split('\t'); if ((fresh.has(l) || fresh.has(r)) && font.glyphs[l] && font.glyphs[r] && !(key in font.kerning)) { font.kerning[key] = Math.round(src.kerning[key] * k); pairs++; } }
    buildGrid(); touch(); toast(T('Из файла: заполнено {0}, добавлено {1}, пар кернинга {2}', filled, added, pairs));
  } catch (err) { toast(T('Не удалось прочитать шрифт: {0}', err.message || err)); }
});

/* ======================= WEB KIT ======================= */
function webKit(files, b, woffName, hasTtf, famFiles) {
  const fam = font.info.familyName.replace(/'/g, ''), esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const face = (file, w, st, ttf) => `@font-face {\n  font-family: '${fam}';\n  src: url('${file}.woff') format('woff')${ttf ? `,\n       url('${file}.ttf') format('truetype')` : ''};\n  font-weight: ${w};\n  font-style: ${st};\n  font-display: swap;\n}\n`;
  let css = face(b, 400, 'normal', hasTtf);
  for (const v of famFiles) css += face(v.file, v.wc, v.sl ? 'italic' : 'normal', v.ttf);
  css += `\n.kernage-font { font-family: '${fam}', system-ui, sans-serif; }\n`;
  const glyphs = font.order.filter(k => font.glyphs[k].contours.length && !L.isSpecial(k)).join('') + ' ' + otSample();
  const sizes = [14, 18, 24, 32, 48, 72, 120].map(s => `<p style="font-size:${s}px"><small>${s}px</small> ${esc(T('Съешь же ещё этих мягких французских булок'))}</p>`).join('\n');
  const html = `<!doctype html>\n<html lang="${LANG}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(font.info.familyName)} — ${esc(T('образец'))}</title>\n<link rel="stylesheet" href="${b}.css">\n<style>\nbody{margin:0;padding:48px 24px;font-family:'${fam}',system-ui,sans-serif;color:#151821;background:#fbfbf8}\nmain{max-width:1100px;margin:0 auto}\nh1{font-size:clamp(56px,12vw,160px);line-height:1;margin:0 0 24px;font-weight:400}\n.meta{font:13px/1.4 ui-monospace,monospace;color:#6a6f7c;margin-bottom:40px}\np{margin:.2em 0;line-height:1.15}\nsmall{font:11px ui-monospace,monospace;color:#9097a3;display:inline-block;width:48px}\n.chart{font-size:44px;letter-spacing:.08em;line-height:1.4;word-break:break-all;margin-top:48px}\n${famFiles.map(v => `.v-${v.wc}${v.sl ? 'i' : ''}{font-weight:${v.wc};font-style:${v.sl ? 'italic' : 'normal'}}`).join('\n')}\n</style>\n</head>\n<body>\n<main>\n<h1>${esc(font.info.familyName)}</h1>\n<div class="meta">${esc(font.info.styleName)} · ${font.order.filter(k => font.glyphs[k].contours.length).length} ${esc(T('глифов'))} · ${esc(T('сделано в Kernage'))}</div>\n${sizes}\n${famFiles.map(v => `<p class="v-${v.wc}${v.sl ? 'i' : ''}" style="font-size:48px">${esc(v.style)} — ${esc(T('Съешь же ещё этих мягких французских булок'))}</p>`).join('\n')}\n<div class="chart">${esc(glyphs)}</div>\n</main>\n</body>\n</html>\n`;
  const enc = new TextEncoder(); files.push({ name: b + '.css', data: enc.encode(css) }, { name: b + '-specimen.html', data: enc.encode(html) });
}


/* ======================= OPENTYPE: LIGATURES & ALTERNATES ======================= */
const FEAT_RE = /^(ss(?:0[1-9]|1\d|20)|salt|tnum|smcp|calt)$/;
const FEAT_LABEL = { tnum: 'Табличные цифры', smcp: 'Капитель', calt: 'Контекстные замены' };
function glyphLabel(k) { const s = L.specInfo(k); return s.kind === 'liga' ? s.seq.join('') : s.base + '.' + s.feat; }
function ghostText(k) { if (!L.isSpecial(k)) return k; const s = L.specInfo(k); return s.kind === 'liga' ? s.seq.join('') : s.base; }
function ligaKeys() { return font.order.filter(k => k.startsWith('liga:') && font.glyphs[k] && font.glyphs[k].contours.length).map(k => [k, [...k.slice(5)]]).sort((a, b) => b[1].length - a[1].length); }
function shape(text, on) {
  const chars = [...text], out = [], ligs = on === false ? [] : ligaKeys();
  for (let i = 0; i < chars.length;) {
    let hit = null; for (const [k, seq] of ligs) if (seq.length <= chars.length - i && seq.every((c, j) => chars[i + j] === c)) { hit = [k, seq.length]; break; }
    if (hit) { out.push(hit[0]); i += hit[1]; } else { out.push(chars[i]); i++; }
  }
  return out;
}
function resolveKey(v) {
  v = (v || '').trim(); if (!v) return null; const ch = parseChar(v); if (ch && font.glyphs[ch]) return ch;
  if (font.glyphs['liga:' + v]) return 'liga:' + v;
  const m = v.match(/^(.+)\.([a-z0-9]{4})$/u); if (m && font.glyphs['alt:' + m[1] + ':' + m[2]]) return 'alt:' + m[1] + ':' + m[2];
  return ch;
}
function addLiga(seq) {
  const k = 'liga:' + seq; if (font.glyphs[k]) { openGlyph(k); setTab('editor'); return; }
  const missing = [...seq].filter(c => !font.glyphs[c] || !font.glyphs[c].contours.length); if (missing.length) { toast(T('Сначала нарисуйте глифы: {0}', missing.join(' '))); return; }
  const g = { u: null, name: L.glyphName(k), adv: 0, contours: [] }; let x = 0, prev = null;
  for (const c of seq) { const src = font.glyphs[c]; if (prev) x += kv(prev, c); g.contours.push(...L.shiftC(src.contours, x, 0)); x += src.adv; prev = c; }
  g.adv = Math.round(x);
  if (window.polygonClipping && g.contours.length) { try { g.contours = L.booleanOp('union', g.contours, []); } catch (e) { } }
  font.glyphs[k] = g; font.order.push(k); buildGrid(); touch(k);
  toast(T('Лигатура {0} собрана из составляющих букв. Перерисуйте её как нужно', seq)); openGlyph(k); setTab('editor');
}
function addAlt(base, feat) {
  if (!font.glyphs[base]) { toast(T('Сначала добавьте глиф {0}', base)); return; }
  const k = 'alt:' + base + ':' + feat;
  if (!font.glyphs[k]) { const b = font.glyphs[base]; font.glyphs[k] = { u: null, name: L.glyphName(k), adv: b.adv, contours: b.contours.map(L.cloneC) }; font.order.push(k); buildGrid(); touch(k); toast(T('Альтернатива {0} для {1} создана копией. Перерисуйте её', feat, base)); }
  openGlyph(k); setTab('editor');
}
function addFromInput(v) {
  v = (v || '').trim(); if (!v) { toast(T('Введите символ, код U+XXXX, лигатуру вроде fi или альтернативу вроде a.ss01')); return; }
  const m = v.match(/^(.+)\.([a-z0-9]{4})$/u);
  if (m && [...m[1]].length === 1) { if (!FEAT_RE.test(m[2])) { toast(T('Используйте набор от ss01 до ss20 или salt')); return; } return addAlt(m[1], m[2]); }
  const ch = parseChar(v); if (ch) return addGlyph(ch);
  const arr = [...v]; if (arr.length >= 2 && arr.length <= 8 && !/\s/.test(v)) return addLiga(v);
  toast(T('Введите символ, код U+XXXX, лигатуру вроде fi или альтернативу вроде a.ss01'));
}
$('#bAddGlyph').addEventListener('click', () => addFromInput($('#gadd').value));
$('#gadd').addEventListener('keydown', e => { if (e.key === 'Enter') addFromInput(e.target.value); });
function otFeats() { const f = new Set(); for (const k of font.order) if (k.startsWith('alt:') && font.glyphs[k].contours.length) f.add(L.specInfo(k).feat); if ((font.calt || '').trim()) f.add('calt'); return [...f].sort(); }
const pvFeat = { liga: true, calt: true };
function renderPvFeat() {
  const box = $('#pvFeat'); box.textContent = ''; const feats = otFeats(), hasLiga = ligaKeys().length > 0;
  const add = (tag, label) => { const l = document.createElement('label'); l.className = 'chk'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!pvFeat[tag]; i.addEventListener('change', () => { pvFeat[tag] = i.checked; applyPreview(); }); l.append(i, ' ' + label); box.appendChild(l); };
  if (hasLiga) add('liga', T('Лигатуры')); for (const f of feats) add(f, FEAT_LABEL[f] ? T(FEAT_LABEL[f]) : f);
  box.hidden = !box.children.length;
}
function featStr(kOn) { const parts = ['"kern" ' + (kOn ? 1 : 0), '"liga" ' + (pvFeat.liga === false ? 0 : 1)]; for (const f of otFeats()) parts.push(`"${f}" ${pvFeat[f] ? 1 : 0}`); return parts.join(', '); }
function otSample() { const ligs = ligaKeys().map(([, s]) => s.join('')), feats = otFeats(); return ligs.join(' ') + (feats.length ? ' ' + [...new Set(font.order.filter(k => k.startsWith('alt:')).map(k => L.specInfo(k).base))].join('') : ''); }

/* ======================= GLYPH EXPORT ======================= */
function glyphSafeName(k) { return (font.glyphs[k].name || 'glyph').replace(/[^A-Za-z0-9._-]/g, '_'); }
function glyphSVG(k) {
  const g = font.glyphs[k], I = font.info, pad = 40, W = Math.max(1, Math.round(g.adv)), H = I.ascender - I.descender;
  const d = FXE.pathD(g.contours, (x, y) => [x, I.ascender - y]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" width="${W + pad * 2}" height="${H + pad * 2}"><path fill="#111111" d="${d}"/></svg>\n`;
}
$('#bGlyphSvg').addEventListener('click', () => { const g = curG(); if (!g.contours.length) { toast(T('Глиф пустой')); return; } saveFile(baseName() + '-' + glyphSafeName(cur) + '.svg', new Blob([glyphSVG(cur)], { type: 'image/svg+xml' })); });
$('#bGlyphPng').addEventListener('click', () => {
  const g = curG(); if (!g.contours.length) { toast(T('Глиф пустой')); return; }
  const I = font.info, H = 1024, k = H / (I.ascender - I.descender + 80), W = Math.max(64, Math.round((g.adv + 80) * k)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#111111'; x.fill(glyphPath(g, (a, b) => [(a + 40) * k, (I.ascender + 40 - b) * k]));
  c.toBlob(b => { if (b) saveFile(baseName() + '-' + glyphSafeName(cur) + '.png', b); else toast(T('Не удалось создать изображение')); }, 'image/png');
});

/* ======================= KERNING PAIR NAVIGATION ======================= */
function testPairs() { const ks = shape(kern.test), out = []; for (let i = 1; i < ks.length; i++) { const a = font.glyphs[ks[i - 1]], b = font.glyphs[ks[i]]; if (a && b && a.contours.length && b.contours.length) out.push([ks[i - 1], ks[i]]); } return out; }
function stepPair(d) {
  const ps = testPairs(); if (!ps.length) { toast(T('В тестовой строке нет пар')); return; }
  let i = ps.findIndex(p => p[0] === kern.l && p[1] === kern.r); i = i < 0 ? (d > 0 ? 0 : ps.length - 1) : (i + d + ps.length) % ps.length;
  kern.l = ps[i][0]; kern.r = ps[i][1]; drawKern(); highlightRow();
}
$('#kPrevP').addEventListener('click', () => stepPair(-1)); $('#kNextP').addEventListener('click', () => stepPair(1));

/* ======================= MOBILE CONTROL ======================= */
const buzz = ms => { try { if (COARSE && navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };
const loupeCv = document.createElement('canvas');
function drawLoupe(p) {
  const R = 62, Z = 2.4, d = DPR(), side = 2 * R * d; if (loupeCv.width !== side) { loupeCv.width = side; loupeCv.height = side; }
  const lc = loupeCv.getContext('2d'); lc.setTransform(1, 0, 0, 1, 0, 0); lc.fillStyle = COL.canvas; lc.fillRect(0, 0, side, side);
  const src = 2 * R / Z; lc.drawImage(cv, (p[0] - src / 2) * d, (p[1] - src / 2) * d, src * d, src * d, 0, 0, side, side);
  const lx = p[0] < ed.w / 2 ? ed.w - R - 14 : R + 14, ly = R + 14;
  cx.save(); cx.beginPath(); cx.arc(lx, ly, R, 0, 7); cx.clip(); cx.drawImage(loupeCv, lx - R, ly - R, 2 * R, 2 * R); cx.restore();
  cx.strokeStyle = COL.accent; cx.lineWidth = 2; cx.beginPath(); cx.arc(lx, ly, R, 0, 7); cx.stroke();
  cx.strokeStyle = COL.neg; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(lx - 8, ly); cx.lineTo(lx + 8, ly); cx.moveTo(lx, ly - 8); cx.lineTo(lx, ly + 8); cx.stroke();
}
function dupSel() {
  const sc = selContours(); if (!sc.length) { toast(T('Сначала выделите точки')); return; } pushUndo();
  const g = curG(), base = g.contours.length; sc.forEach(ci => g.contours.push(L.shiftC([g.contours[ci]], 20, -20)[0]));
  ed.sel = new Set(); for (let k = 0; k < sc.length; k++) g.contours[base + k].forEach((_, ni) => ed.sel.add((base + k) + ',' + ni)); changed();
}
$('#sbSmooth').addEventListener('click', () => { const s = selList(); if (!s.length) return; pushUndo(); toggleSmooth(s); changed(); buzz(8); });
$('#sbDel').addEventListener('click', () => { deleteNodes(); buzz(8); });
$('#sbDup').addEventListener('click', dupSel);
$('#sbNone').addEventListener('click', () => { ed.sel.clear(); edDraw(); refreshPanel(); });
function twoFingerTap(pz) {
  ed.scale = pz.scale; ed.ox = pz.ox; ed.oy = pz.oy; const s = undo.s(cur);
  if (pz.tri) { if (!s.r.length) { toast(T('Нечего повторять')); edDraw(); return; } doRedo(); toast(T('Повторено')); }
  else { if (!s.u.length) { toast(T('Нечего отменять')); edDraw(); return; } doUndo(); toast(T('Отменено')); }
  buzz(15);
}
(function () {
  const st = $('#fxStage'); let s0 = null;
  st.addEventListener('pointerdown', e => { s0 = e.pointerType === 'touch' && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), n: 1 } : null; });
  st.addEventListener('pointerdown', e => { if (s0 && !e.isPrimary) s0.n++; });
  st.addEventListener('pointerup', e => {
    if (!s0 || !e.isPrimary || s0.n > 1 || fxs.mode !== 'glyph') { s0 = null; return; }
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y; if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && performance.now() - s0.t < 450) { fxStep(dx < 0 ? 1 : -1); buzz(6); } s0 = null;
  });
})();
function setGridSize(v) { const map = { s: '62px', m: '84px', l: '124px' }; document.documentElement.style.setProperty('--gmin', map[v] || map.m); $$('[data-gs]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gs === v))); lsSet('litera.gs', v); }
$$('[data-gs]').forEach(b => b.addEventListener('click', () => setGridSize(b.dataset.gs)));

/* ======================= LANGUAGE ======================= */
const domTr = [];
function collectDom() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const ru = n.nodeValue.trim(); if (!ru || !I18N[ru] || n.parentElement.closest('script,style,#proof,#chart,#wf')) continue; domTr.push({ n, ru, last: ru }); }
  for (const el of document.querySelectorAll('[title],[placeholder],[aria-label],[data-title]')) for (const at of ['title', 'placeholder', 'aria-label', 'data-title']) { const v = el.getAttribute(at); if (v && I18N[v]) domTr.push({ el, at, ru: v, last: v }); }
}
function applyDom() {
  for (const it of domTr) {
    const tr = T(it.ru);
    if (it.n) { if (it.n.nodeValue.trim() !== it.last) continue; it.n.nodeValue = it.n.nodeValue.replace(it.last, () => tr); it.last = tr; }
    else { if (it.el.getAttribute(it.at) !== it.last) continue; it.el.setAttribute(it.at, tr); it.last = tr; }
  }
}
function pickLang() { const st = lsGet('litera.lang'); if (st && ['ru', 'en', 'es'].includes(st)) return st; return 'en'; }
function setLang(v, init) {
  const prev = init ? 'ru' : LANG; LANG = ['ru', 'en', 'es'].includes(v) ? v : 'ru'; lsSet('litera.lang', LANG);
  document.documentElement.lang = LANG; $('#lang').value = LANG; applyDom(); document.title = T('Kernage');
  const old = PRESET_SETS[prev], pr = $('#proof'), idx = old.indexOf(pr.textContent);
  PRESETS = PRESET_SETS[LANG]; if (idx >= 0) pr.textContent = PRESETS[idx];
  if (Object.values(FX_PHRASES).includes(fxs.phrase)) { fxs.phrase = FX_PHRASES[LANG]; $('#fxPhrase').value = fxs.phrase; }
  if (font.info.familyName === 'Новый шрифт' || font.info.familyName === 'New font' || font.info.familyName === 'Fuente nueva') { font.info.familyName = T('Новый шрифт'); }
  syncThemeBtn(); syncPvMore();
  if (init) return;
  buildFxPanel(); buildFxPresets(); applyFilter(); renderKernList(); syncKernInputs(); fillGroupsUI(); refreshPanel(); fillInfo(); renderProjects(); fillWaterfall(); setSaveState(saveStateV);
  if (tab === 'editor') edDraw(); if (tab === 'kern') drawKern(); if (tab === 'fx') { scheduleFxDraw(); queueThumbs(); } if (tab === 'font') drawMetrics();
}
$('#lang').addEventListener('change', e => setLang(e.target.value));
const HOST_THEME = document.documentElement.dataset.theme || null;
let themeMode = ['light', 'dark'].includes(lsGet('litera.theme')) ? lsGet('litera.theme') : 'auto';
const THEME_ICONS = { auto: '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13A6.5 6.5 0 0010 3.5z" fill="currentColor"/>', light: '<circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M4.2 4.2l1.6 1.6M14.2 14.2l1.6 1.6M4.2 15.8l1.6-1.6M14.2 5.8l1.6-1.6"/>', dark: '<path d="M16.5 12.3A7 7 0 017.7 3.5a7 7 0 108.8 8.8z"/>' };
function applyTheme() { const r = document.documentElement; if (themeMode === 'auto') { if (HOST_THEME) r.dataset.theme = HOST_THEME; else delete r.dataset.theme; } else r.dataset.theme = themeMode; syncThemeBtn(); }
function syncThemeBtn() { const b = $('#bTheme'); if (!b) return; const lab = themeMode === 'light' ? T('Тема: светлая') : themeMode === 'dark' ? T('Тема: тёмная') : T('Тема: как в системе'); b.title = lab; b.setAttribute('aria-label', lab); b.querySelector('svg').innerHTML = THEME_ICONS[themeMode]; }
$('#bTheme').addEventListener('click', () => { themeMode = { auto: 'light', light: 'dark', dark: 'auto' }[themeMode]; lsSet('litera.theme', themeMode); applyTheme(); toast($('#bTheme').title); });
function syncPvMore() { const b = $('#pvMore'); if (!b) return; const open = $('.pctl').classList.contains('open'); b.setAttribute('aria-expanded', open); b.textContent = open ? T('Скрыть настройки') : T('Ещё настройки'); }
$('#pvMore').addEventListener('click', () => { $('.pctl').classList.toggle('open'); syncPvMore(); });
if (lsGet('litera.onb') !== '1') $('#onb').hidden = false;
$('#onbX').addEventListener('click', () => { $('#onb').hidden = true; lsSet('litera.onb', '1'); });
$('#gemptyAdd').addEventListener('click', e => { const k = e.currentTarget.dataset.k; if (!k) return; if (e.currentTarget.dataset.mode === 'show') { gFilter = 'all'; gMark = ''; $('#gmark').value = ''; $$('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.f === 'all')); applyFilter(); return; } $('#gadd').value = k; $('#bAddGlyph').click(); $('#gsearch').value = ''; gSearch = ''; applyFilter(); });

/*EXT*/
/* ======================= BOOT ======================= */
LANG = pickLang(); PRESETS = PRESET_SETS[LANG];
readColors();
let start = null; projId = lsGet(PCUR);
if (projId) { try { const o = JSON.parse(lsGet('litera.p.' + projId) || 'null'); if (o && o.glyphs && o.order) start = o; } catch (e) { } }
if (!start) { projId = null; const saved = lsGet(STORE); if (saved) { try { const o = JSON.parse(saved); if (o && o.glyphs && o.order) start = o; } catch (e) { } } }
if (start && (start.sampleVersion || 0) < 3 && start.info && start.info.description === 'Образец, созданный в Kernage') {
  const fresh = makeSample();
  for (const k of fresh.order) { const g = start.glyphs[k]; if (!g) { start.glyphs[k] = fresh.glyphs[k]; (start.order = start.order || []).push(k); } else if (!(g.contours || []).length && k !== ' ') { g.contours = fresh.glyphs[k].contours; g.adv = fresh.glyphs[k].adv; } }
  for (const kk in fresh.kerning) if (!(kk in (start.kerning || {}))) (start.kerning = start.kerning || {})[kk] = fresh.kerning[kk];
  start.sampleVersion = 3;
}
if (start && start.sampleVersion === 3) { sampleLigas(start); start.sampleVersion = 4; }
try { font = normalize(start || makeSample()); } catch (e) { if (start) { lsSet('litera.broken.' + (projId || 'old'), JSON.stringify(start)); setTimeout(() => toast(T('Сохранённый проект повреждён — открыт образец. Копия сохранена.')), 600); } projId = null; font = normalize(makeSample()); }
cur = font.order.includes('A') ? 'A' : font.order[0];
save();
setGridSize(lsGet('litera.gs') || (MQ.matches ? 's' : 'm'));
ed.smart = lsGet('litera.smart') !== '0'; $('#oSmart').checked = ed.smart;
{ const bw = lsGet('litera.brw'); if (bw) { $('#brW').value = bw; $('#brWv').textContent = bw; } }
ed.ctx = lsGet('litera.ctx') || 'HO*OH'; $('#ctxStr').value = ed.ctx;
kern.test = lsGet('litera.ktest') || kern.test; $('#ktest').value = kern.test;
$('#proof').textContent = PRESETS[0];
fxs.phrase = lsGet('litera.fxphrase') || FX_PHRASES[LANG]; $('#fxPhrase').value = fxs.phrase; buildFxPanel();
buildGrid(); fillInfo(); setTool('select');
const t0 = lsGet('litera.tab'); setTab(['glyphs', 'editor', 'kern', 'fx', 'preview', 'font'].includes(t0) ? t0 : 'glyphs');
{ const bw = document.getElementById('bootwarn'); if (bw) bw.remove(); }
collectDom(); setLang(LANG, true); applyTheme();
window.__showErr = (() => { let last = 0; return m => { const n = Date.now(); if (n - last < 4000) return; last = n; try { toast(T('Ошибка') + ': ' + m); } catch (e) { } }; })();
if (document.fonts) document.fonts.ready.then(() => { drawAllCards(); if (tab === 'editor') edDraw(); });
})();
