/* ===== LITERA CORE 4: OpenType layout (GPOS class kerning + mark/mkmk, GSUB liga/single/calt, GDEF), anchors, hinting, masters ===== */
(function (G) {
'use strict';
const L = G.Litera;
const { isSpecial, specInfo, bounds, segOf, reverseC, cloneC, isUpperish } = L;

const u16 = (a, v) => a.push((v >> 8) & 255, v & 255);
const i16 = (a, v) => u16(a, v < 0 ? v + 65536 : v);
const u32 = (a, v) => a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const tagB = (a, t) => { for (let i = 0; i < 4; i++) a.push(t.charCodeAt(i)); };
const app = (a, b) => { for (let i = 0; i < b.length; i++) a.push(b[i]); };
function pack(items) {
  let hs = 0; for (const it of items) hs += (it[0] === 'u32' || it[0] === 'tag') ? 4 : 2;
  const out = [], tail = []; let off = hs;
  for (const [t, v] of items) {
    if (t === 'u16') u16(out, v); else if (t === 'i16') i16(out, v); else if (t === 'u32') u32(out, v); else if (t === 'tag') tagB(out, v);
    else if (t === 'o16') { if (!v) u16(out, 0); else { if (off > 65535) throw new Error('offset overflow'); u16(out, off); tail.push(v); off += v.length; } }
  }
  for (const b of tail) app(out, b);
  return out;
}
const uniq = a => [...new Set(a)].sort((x, y) => x - y);
function coverage(gids) { gids = uniq(gids); const a = []; u16(a, 1); u16(a, gids.length); for (const g of gids) u16(a, g); return a; }
function classDef(map) { // Map gid->class
  const ents = [...map].filter(e => e[1] > 0).sort((a, b) => a[0] - b[0]), rs = [];
  for (const [g, c] of ents) { const l = rs[rs.length - 1]; if (l && l[1] === g - 1 && l[2] === c) l[1] = g; else rs.push([g, g, c]); }
  const a = []; u16(a, 2); u16(a, rs.length); for (const r of rs) { u16(a, r[0]); u16(a, r[1]); u16(a, r[2]); } return a;
}
const anchor = p => { const a = []; u16(a, 1); i16(a, Math.round(p[0])); i16(a, Math.round(p[1])); return a; };

/* ---------- generic GSUB/GPOS assembler with extension lookups (32-bit offsets) ---------- */
function buildOTL(lookups, features, extType) {
  features = features.filter(f => f.lookups.length).sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
  const scripts = ['DFLT', 'cyrl', 'latn'], nf = features.length;
  const langSys = () => { const a = []; u16(a, 0); u16(a, 0xFFFF); u16(a, nf); for (let i = 0; i < nf; i++) u16(a, i); return a; };
  const script = () => pack([['o16', langSys()], ['u16', 0]]);
  const SL = pack([['u16', scripts.length], ...scripts.flatMap(s => [['tag', s], ['o16', script()]])]);
  const FL = pack([['u16', nf], ...features.flatMap(f => { const ft = []; u16(ft, 0); u16(ft, f.lookups.length); for (const l of f.lookups) u16(ft, l); return [['tag', f.tag], ['o16', ft]]; })]);
  const llStart = 10 + SL.length + FL.length, llHead = 2 + 2 * lookups.length, lkSizes = lookups.map(l => 6 + 10 * l.subs.length);
  const LL = []; u16(LL, lookups.length); let o = llHead; const lkOff = lkSizes.map(s => { const r = o; o += s; return r; }); for (const x of lkOff) u16(LL, x);
  const extPos = [], dataStart = llStart + o; let dp = dataStart; const data = [];
  lookups.forEach((l, li) => {
    u16(LL, extType); u16(LL, l.flag || 0); u16(LL, l.subs.length); const base = llStart + lkOff[li];
    l.subs.forEach((_, k) => u16(LL, 6 + 2 * l.subs.length + 8 * k));
    l.subs.forEach((s, k) => { const ep = base + 6 + 2 * l.subs.length + 8 * k; u16(LL, 1); u16(LL, l.type); u32(LL, dp - ep); dp += s.length; data.push(s); });
  });
  const out = []; u16(out, 1); u16(out, 0); u16(out, 10); u16(out, 10 + SL.length); u16(out, llStart);
  app(out, SL); app(out, FL); app(out, LL); for (const d of data) app(out, d);
  return new Uint8Array(out);
}

/* ---------- marks & anchors ---------- */
const COMB = { grave: '̀', acute: '́', circ: '̂', tilde: '̃', diaer: '̈', ring: '̊', caron: '̌', breve: '̆', dot: '̇', ced: '̧' };
const isComb = k => typeof k === 'string' && [...k].length === 1 && /\p{Mn}/u.test(k);
const isSpacingMark = k => Object.values(L.MARKS || {}).includes(k);
function autoAnchorsFor(font, k) {
  const g = font.glyphs[k], I = font.info; if (!g || !g.contours.length || isSpecial(k)) return null; const bb = bounds(g.contours); if (!bb) return null;
  const cx = Math.round((bb.x0 + bb.x1) / 2), A = {};
  if (isComb(k) || isSpacingMark(k)) { const below = /[̧̨¸˛]/.test(k) || bb.y1 < I.xHeight * 0.3; if (below) { A._bottom = [cx, bb.y1]; A.bottom = [cx, bb.y0 - 30]; } else { A._top = [cx, bb.y0]; A.top = [cx, bb.y1 + 40]; } return A; }
  if (!/[\p{L}\p{N}]/u.test(k)) return null; const up = isUpperish(k);
  A.top = [cx, Math.round((up ? Math.max(bb.y1, I.capHeight) : bb.y1) + (up ? 50 : 60))]; A.bottom = [cx, Math.round(bb.y0 + 30)];
  return A;
}
function autoAnchors(font, keys, overwrite) { let n = 0; for (const k of keys || font.order) { const g = font.glyphs[k]; if (!g || (g.anchors && Object.keys(g.anchors).length && !overwrite)) continue; const a = autoAnchorsFor(font, k); if (a) { g.anchors = a; n++; } } return n; }
function makeCombining(font) { // zero-width combining marks built as components of spacing marks
  const made = [];
  for (const kind in COMB) {
    const ch = COMB[kind], src = L.MARKS[kind], S = font.glyphs[src]; if (!S || !S.contours.length || font.glyphs[ch]) continue; const bb = bounds(S.contours), dx = -Math.round((bb.x0 + bb.x1) / 2);
    const g = L.newGlyph(ch, 0); g.adv = 0; g.refs = [{ k: src, x: dx, y: 0 }]; g.contours = L.shiftC(S.contours, dx, 0).map(c => c.map(n => Object.assign(n, { r: src, ri: 0 }))); font.glyphs[ch] = g; font.order.push(ch);
    const a = autoAnchorsFor(font, ch); if (a) g.anchors = a; made.push(ch);
  }
  return made;
}

/* ---------- calt rules ---------- */
function parseCalt(text, font) {
  const rules = [], errors = [], has = k => !!(font.glyphs[k] && font.glyphs[k].contours.length);
  (text || '').split('\n').forEach((raw, li) => {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) return;
    const m = line.split(/\s*(?:>|→)\s*/); if (m.length !== 2) { errors.push([li + 1, 'syntax']); return; }
    const toks = m[0].match(/\[[^\]]+\]|\{[^}]+\}|\S/gu) || []; const ti = toks.findIndex(t => t[0] === '['); if (ti < 0) { errors.push([li + 1, 'target']); return; }
    const cls = t => { const s = t.replace(/^[[{]|[\]}]$/g, ''); const inner = s[0] === '{' ? s.slice(1, -1) : s; return [...inner].filter(c => c.trim()); };
    const tgt = cls(toks[ti]), before = toks.slice(0, ti).map(cls), after = toks.slice(ti + 1).map(cls), rep = m[1].trim();
    const all = [...tgt, ...before.flat(), ...after.flat()], miss = all.filter(c => !has(c)); if (miss.length) { errors.push([li + 1, 'glyph', miss.join('')]); return; }
    const map = [], mm = rep.match(/^(.+)\.([A-Za-z0-9_]+)$/);
    if (rep[0] !== '.' && mm && tgt.length > 1) { errors.push([li + 1, 'alt', rep]); return; }
    for (const c of tgt) { const k = rep[0] === '.' ? 'alt:' + c + ':' + rep.slice(1) : mm ? 'alt:' + mm[1] + ':' + mm[2] : rep; if (!has(k)) { errors.push([li + 1, 'alt', rep]); return; } map.push([c, k]); }
    rules.push({ before, target: tgt, after, map, line: li + 1 });
  });
  return { rules, errors };
}

/* ---------- layout tables ---------- */
function buildLayout(font, index, opts) {
  opts = opts || {}; const out = {}, gid = k => index[k];
  /* GPOS: kerning */
  const gposLookups = [], gposFeat = [];
  const K = opts.kerningRaw, GR = opts.kgroups, flat = opts.kerning || {};
  const pairsF1 = new Map(); let classPairs = [];
  const hasGroups = GR && (Object.keys(GR.L || {}).length || Object.keys(GR.R || {}).length);
  if (K && hasGroups) {
    const membersL = {}, membersR = {}; for (const m in GR.L) (membersL[GR.L[m]] = membersL[GR.L[m]] || new Set()).add(m); for (const m in GR.R) (membersR[GR.R[m]] = membersR[GR.R[m]] || new Set()).add(m);
    for (const ld in membersL) membersL[ld].add(ld); for (const ld in membersR) membersR[ld].add(ld);
    // zero values are kept on purpose: an explicit 0 exception must block the class pair below it
    const set = (l, r, v) => { const a = gid(l), b = gid(r); if (a == null || b == null) return; const key = a * 65536 + b; if (!pairsF1.has(key)) pairsF1.set(key, [a, b, v]); };
    const keys = Object.keys(K), sd = k => { const i = k.indexOf('\t'); return [G.Litera.isGS(k.slice(0, i)), G.Litera.isGS(k.slice(i + 1))]; }, ex = keys.filter(k => { const s = sd(k); return !s[0] && !s[1]; }), lr = keys.filter(k => { const s = sd(k); return s[0] && !s[1]; }), rr = keys.filter(k => { const s = sd(k); return !s[0] && s[1]; }), cc = keys.filter(k => { const s = sd(k); return s[0] && s[1]; });
    for (const k of ex) { const [l, r] = k.split('\t'); set(l, r, Math.round(K[k])); }
    for (const k of lr) { const [l, r] = k.split('\t'), ms = membersL[l.slice(1)] || new Set([l.slice(1)]); for (const m of ms) if (!((m + '\t' + r) in K)) set(m, r, Math.round(K[k])); }
    for (const k of rr) { const [l, r] = k.split('\t'), ms = membersR[r.slice(1)] || new Set([r.slice(1)]); for (const m of ms) if (!((l + '\t' + m) in K)) set(l, m, Math.round(K[k])); }
    classPairs = cc.map(k => { const [l, r] = k.split('\t'); return [l.slice(1), r.slice(1), Math.round(K[k])]; }).filter(p => p[2]);
    const subs = [];
    if (pairsF1.size) subs.push(...pairPosF1([...pairsF1.values()]));
    if (classPairs.length) subs.push(...pairPosF2(classPairs, membersL, membersR, gid));
    if (subs.length) { gposLookups.push({ type: 2, subs }); gposFeat.push({ tag: 'kern', lookups: [0] }); }
  } else {
    const ps = []; for (const key in flat) { const [l, r] = key.split('\t'), v = Math.round(flat[key]); if (v && gid(l) != null && gid(r) != null) ps.push([gid(l), gid(r), v]); }
    if (ps.length) { gposLookups.push({ type: 2, subs: pairPosF1(ps) }); gposFeat.push({ tag: 'kern', lookups: [0] }); }
  }
  /* GPOS: marks */
  const marks = [], bases = [], mm2 = [];
  for (const k in index) { const g = font.glyphs[k]; if (!g || !g.anchors) continue; const A = g.anchors; if (isComb(k)) { if (Object.keys(A).some(n => n[0] === '_')) marks.push(k); if (Object.keys(A).some(n => n[0] !== '_')) mm2.push(k); } else if (Object.keys(A).some(n => n[0] !== '_')) bases.push(k); }
  const classes = uniq([]).concat([...new Set(marks.flatMap(k => Object.keys(font.glyphs[k].anchors).filter(n => n[0] === '_').map(n => n.slice(1))))].sort());
  if (marks.length && classes.length) {
    const mt = buildMarkAttach(font, marks, bases, classes, gid, false);
    if (mt) { const li = gposLookups.length; gposLookups.push({ type: 4, subs: [mt] }); gposFeat.push({ tag: 'mark', lookups: [li] }); }
    const m1 = marks, m2 = mm2.filter(k => Object.keys(font.glyphs[k].anchors).some(n => n[0] !== '_' && classes.includes(n)));
    if (m2.length) { const mk = buildMarkAttach(font, m1, m2, classes, gid, true); if (mk) { const li = gposLookups.length; gposLookups.push({ type: 6, subs: [mk] }); gposFeat.push({ tag: 'mkmk', lookups: [li] }); } }
  }
  if (gposLookups.length) out.GPOS = buildOTL(gposLookups, gposFeat, 9);
  /* GSUB */
  const gsubLookups = [], gsubFeat = [], ligs = [], singles = {};
  for (const k in index) { if (!isSpecial(k)) continue; const si = specInfo(k); if (si.kind === 'liga') { const comps = si.seq.map(gid); if (comps.length > 1 && comps.every(x => x != null)) ligs.push([comps, gid(k)]); } else if (gid(si.base) != null && /^(ss(0[1-9]|1\d|20)|salt|tnum|smcp)$/.test(si.feat)) (singles[si.feat] = singles[si.feat] || []).push([gid(si.base), gid(k)]); }
  if (ligs.length) { const li = gsubLookups.length; gsubLookups.push({ type: 4, subs: [ligatureSubst(ligs)] }); gsubFeat.push({ tag: 'liga', lookups: [li] }); }
  for (const f of Object.keys(singles).sort()) { const li = gsubLookups.length; gsubLookups.push({ type: 1, subs: [singleSubst(singles[f])] }); gsubFeat.push({ tag: f, lookups: [li] }); }
  const calt = parseCalt(font.calt || '', font);
  if (calt.rules.length) {
    const chainIdx = gsubLookups.length; gsubLookups.push({ type: 6, subs: [] }); gsubFeat.push({ tag: 'calt', lookups: [chainIdx] });
    for (const r of calt.rules) {
      const pairs = r.map.map(([c, k]) => [gid(c), gid(k)]).filter(p => p[0] != null && p[1] != null); if (!pairs.length) continue;
      const si = gsubLookups.length; gsubLookups.push({ type: 1, subs: [singleSubst(pairs)] });
      const cov = cs => coverage(cs.map(gid).filter(x => x != null));
      const bt = r.before.slice().reverse().map(cov), inp = [coverage(pairs.map(p => p[0]))], la = r.after.map(cov);
      gsubLookups[chainIdx].subs.push(pack([['u16', 3], ['u16', bt.length], ...bt.map(c => ['o16', c]), ['u16', 1], ...inp.map(c => ['o16', c]), ['u16', la.length], ...la.map(c => ['o16', c]), ['u16', 1], ['u16', 0], ['u16', si]]));
    }
    if (!gsubLookups[chainIdx].subs.length) { gsubLookups.splice(chainIdx, 1); gsubFeat.pop(); }
  }
  if (gsubLookups.length) out.GSUB = buildOTL(gsubLookups, gsubFeat, 7);
  /* GDEF */
  const cls = new Map(); for (const k in index) { const g = index[k]; if (!g) continue; cls.set(g, isComb(k) ? 3 : (k.startsWith('liga:') ? 2 : 1)); }
  out.GDEF = new Uint8Array(pack([['u16', 1], ['u16', 0], ['o16', classDef(cls)], ['u16', 0], ['u16', 0], ['u16', 0]]));
  out.caltErrors = calt.errors;
  return out;
}
function pairPosF1(pairs) {
  const byFirst = new Map(); for (const [l, r, v] of pairs) { if (!byFirst.has(l)) byFirst.set(l, []); byFirst.get(l).push([r, v]); }
  const firsts = [...byFirst.keys()].sort((a, b) => a - b), groups = []; let cur = [], size = 0;
  for (const f of firsts) { const sz = 6 + 4 * byFirst.get(f).length; if (cur.length && size + sz > 56000) { groups.push(cur); cur = []; size = 0; } cur.push(f); size += sz; }
  if (cur.length) groups.push(cur);
  return groups.map(fs => pack([['u16', 1], ['o16', coverage(fs)], ['u16', 4], ['u16', 0], ['u16', fs.length], ...fs.map(f => { const s = []; const lst = byFirst.get(f).sort((a, b) => a[0] - b[0]); u16(s, lst.length); for (const [r, v] of lst) { u16(s, r); i16(s, v); } return ['o16', s]; })]));
}
function pairPosF2(classPairs, membersL, membersR, gid) {
  const lgs = [...new Set(classPairs.map(p => p[0]))], rgs = [...new Set(classPairs.map(p => p[1]))], rcls = new Map();
  const cd2 = new Map(); rgs.forEach((g, i) => { rcls.set(g, i + 1); for (const m of (membersR[g] || [g])) { const id = gid(m); if (id != null && !cd2.has(id)) cd2.set(id, i + 1); } });
  const val = new Map(classPairs.map(p => [p[0] + '\t' + p[1], p[2]])), c2n = rgs.length + 1, perClass = 2 * c2n, maxC1 = Math.max(1, Math.floor(50000 / perClass) - 1), subs = [];
  for (let s = 0; s < lgs.length; s += maxC1) {
    const chunk = lgs.slice(s, s + maxC1), cd1 = new Map(), cov = [];
    chunk.forEach((g, i) => { for (const m of (membersL[g] || [g])) { const id = gid(m); if (id != null && !cd1.has(id)) { cd1.set(id, i + 1); cov.push(id); } } });
    if (!cov.length) continue;
    const recs = []; for (let c1 = 0; c1 <= chunk.length; c1++) for (let c2 = 0; c2 < c2n; c2++) { const v = c1 && c2 ? (val.get(chunk[c1 - 1] + '\t' + rgs[c2 - 1]) || 0) : 0; recs.push(['i16', v]); }
    subs.push(pack([['u16', 2], ['o16', coverage(cov)], ['u16', 4], ['u16', 0], ['o16', classDef(cd1)], ['o16', classDef(cd2)], ['u16', chunk.length + 1], ['u16', c2n], ...recs]));
  }
  return subs;
}
function buildMarkAttach(font, marks, bases, classes, gid, mkmk) {
  const mIds = uniq(marks.map(gid).filter(x => x != null)), bIds = uniq(bases.map(gid).filter(x => x != null)); if (!mIds.length || !bIds.length) return null;
  const byId = {}; for (const k of marks.concat(bases)) { const id = gid(k); if (id != null) byId[id] = k; }
  const markArr = pack([['u16', mIds.length], ...mIds.flatMap(id => { const A = font.glyphs[byId[id]].anchors, c = classes.findIndex(n => A['_' + n]); return [['u16', Math.max(0, c)], ['o16', anchor(A['_' + classes[Math.max(0, c)]] || [0, 0])]]; })]);
  const baseArr = pack([['u16', bIds.length], ...bIds.flatMap(id => { const A = font.glyphs[byId[id]].anchors; return classes.map(n => ['o16', A[n] ? anchor(A[n]) : null]); })]);
  return pack([['u16', 1], ['o16', coverage(mIds)], ['o16', coverage(bIds)], ['u16', classes.length], ['o16', markArr], ['o16', baseArr]]);
}
function singleSubst(pairs) { const m = new Map(); for (const [a, b] of pairs) if (!m.has(a)) m.set(a, b); const ks = [...m.keys()].sort((x, y) => x - y); return pack([['u16', 2], ['o16', coverage(ks)], ['u16', ks.length], ...ks.map(k => ['u16', m.get(k)])]); }
function ligatureSubst(ligs) {
  const by = new Map(); for (const [comps, g] of ligs) { if (!by.has(comps[0])) by.set(comps[0], []); by.get(comps[0]).push([comps, g]); }
  const fs = [...by.keys()].sort((a, b) => a - b);
  return pack([['u16', 1], ['o16', coverage(fs)], ['u16', fs.length], ...fs.map(f => { const ls = by.get(f).sort((a, b) => b[0].length - a[0].length); return ['o16', pack([['u16', ls.length], ...ls.map(([comps, g]) => { const l = []; u16(l, g); u16(l, comps.length); for (const c of comps.slice(1)) u16(l, c); return ['o16', l]; })])]; })]);
}

/* ---------- TrueType hinting: vertical blue zones ---------- */
function hintZones(info) { const ov = info.overshoot == null ? 12 : info.overshoot; return [{ y: 0, d: -ov, cvt: 0 }, { y: info.xHeight, d: ov, cvt: 1 }, { y: info.capHeight, d: ov, cvt: 2 }, { y: info.ascender, d: ov, cvt: 3 }, { y: info.descender, d: -ov, cvt: 4 }]; }
function hintInstr(pts, zones) { // pts: [[x,y,on]] flattened in glyph order
  const ops = [0x00]; let n = 0; const tol = 3;
  pts.forEach((p, i) => {
    if (!p[2]) return; let best = null;
    for (const z of zones) { const lo = Math.min(z.y, z.y + z.d) - tol, hi = Math.max(z.y, z.y + z.d) + tol; if (p[1] >= lo && p[1] <= hi) { const d = Math.abs(p[1] - z.y); if (!best || d < best.d) best = { d, z }; } }
    if (!best) return; n++;
    if (i < 256) ops.push(0xB1, i, best.z.cvt); else { ops.push(0xB9, (i >> 8) & 255, i & 255, 0, best.z.cvt); }
    ops.push(0x3F);
  });
  if (!n) return [];
  ops.push(0x30); return ops;
}
function hintTables(info) {
  const cvt = []; for (const v of [0, info.xHeight, info.capHeight, info.ascender, info.descender]) i16(cvt, v);
  const prep = [0xB8, 0x01, 0xFF, 0x85, 0xB0, 0x04, 0x8D];
  const gasp = []; u16(gasp, 1); u16(gasp, 2); u16(gasp, 8); u16(gasp, 0x000A); u16(gasp, 0xFFFF); u16(gasp, 0x000F);
  return [{ tag: 'cvt ', data: new Uint8Array(cvt) }, { tag: 'prep', data: new Uint8Array(prep) }, { tag: 'gasp', data: new Uint8Array(gasp) }];
}

/* ---------- masters ---------- */
function compatible(a, b) {
  if (!a || !b || a.length !== b.length) return { ok: false, why: ['contours', a ? a.length : 0, b ? b.length : 0] };
  for (let i = 0; i < a.length; i++) { if (a[i].length !== b[i].length) return { ok: false, why: ['nodes', i + 1, a[i].length, b[i].length] }; for (let j = 0; j < a[i].length; j++) if (segOf(a[i], j).curve !== segOf(b[i], j).curve) return { ok: false, why: ['segment', i + 1, j + 1] }; }
  return { ok: true };
}

Object.assign(L, { buildLayout, buildOTL, autoAnchors, autoAnchorsFor, makeCombining, COMB, isComb, parseCalt, hintZones, hintInstr, hintTables, compatible });
})(typeof window !== 'undefined' ? window : globalThis);
