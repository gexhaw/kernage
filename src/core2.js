/* ===== LITERA CORE 2: brush, trace, path tools, composites ===== */
(function (G) {
'use strict';
const L = G.Litera, PC = G.polygonClipping;
const { N, segOf, bez, dist, sub, unit, roundC, cloneC, flatten, ringArea, pointInRing, correctDirections, fitRing, bounds, isUpperish } = L;

/* ---------- segments ---------- */
function splitBez(b, t) { const lp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; const p01 = lp(b[0], b[1]), p12 = lp(b[1], b[2]), p23 = lp(b[2], b[3]), p012 = lp(p01, p12), p123 = lp(p12, p23), p = lp(p012, p123); return [[b[0], p01, p012, p], [p, p123, p23, b[3]]]; }
function segsOf(c) { return c.map((nd, i) => { const s = segOf(c, i); return { b: s.b.map(p => [p[0], p[1]]), curve: s.curve, s0: !!nd.s }; }); }
function rebuild(segs) {
  const n = segs.length, nodes = segs.map(sg => ({ x: sg.b[0][0], y: sg.b[0][1], i: null, o: sg.curve ? [sg.b[1][0], sg.b[1][1]] : null, s: sg.s0 }));
  segs.forEach((sg, k) => { if (sg.curve) nodes[(k + 1) % n].i = [sg.b[2][0], sg.b[2][1]]; });
  return nodes;
}
function extremaT(b) {
  const ts = [];
  for (const ax of [0, 1]) {
    const p0 = b[0][ax], p1 = b[1][ax], p2 = b[2][ax], p3 = b[3][ax], a = -p0 + 3 * p1 - 3 * p2 + p3, bb = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
    if (Math.abs(a) < 1e-9) { if (Math.abs(bb) > 1e-9) ts.push(-c / bb); }
    else { const D = bb * bb - 4 * a * c; if (D >= 0) { const s = Math.sqrt(D); ts.push((-bb + s) / (2 * a), (-bb - s) / (2 * a)); } }
  }
  return ts.filter(t => t > 0.03 && t < 0.97).sort((x, y) => x - y).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 0.03);
}
function addExtremes(cs) {
  let added = 0;
  const out = cs.map(c => {
    if (c.length < 2) return cloneC(c);
    const segs = [];
    for (const sg of segsOf(c)) {
      if (!sg.curve) { segs.push(sg); continue; }
      const ts = extremaT(sg.b); if (!ts.length) { segs.push(sg); continue; }
      let rem = sg.b, prev = 0, first = true;
      for (const t of ts) { const [a, b] = splitBez(rem, (t - prev) / (1 - prev)); segs.push({ b: a, curve: true, s0: first ? sg.s0 : true }); first = false; rem = b; prev = t; added++; }
      segs.push({ b: rem, curve: true, s0: true });
    }
    return roundC(rebuild(segs));
  });
  return { contours: out, added };
}
function roundCorners(c, idxs, r0) {
  let segs = segsOf(c); const sorted = [...new Set(idxs)].sort((a, b) => b - a); let done = 0;
  for (const idx of sorted) {
    const n = segs.length, inI = (idx - 1 + n) % n, sIn = segs[inI], sOut = segs[idx];
    if (sIn.s0 === undefined) continue;
    const P = sOut.b[0], lenIn = dist(sIn.b[0], sIn.b[3]), lenOut = dist(sOut.b[0], sOut.b[3]);
    const r = Math.min(r0, lenIn * 0.45, lenOut * 0.45); if (r < 2) continue;
    let lo = 0, hi = 1; for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (dist(bez(sIn.b, m), P) > r) lo = m; else hi = m; }
    const tIn = lo; lo = 0; hi = 1; for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (dist(bez(sOut.b, m), P) < r) lo = m; else hi = m; }
    const tOut = hi;
    const a = sIn.curve ? splitBez(sIn.b, tIn)[0] : (() => { const A = bez(sIn.b, tIn); return [sIn.b[0], sIn.b[0], A, A]; })();
    const b = sOut.curve ? splitBez(sOut.b, tOut)[1] : (() => { const B = bez(sOut.b, tOut); return [B, B, sOut.b[3], sOut.b[3]]; })();
    const A = a[3], B = b[0];
    let ta = sub(A, a[2]); if (Math.hypot(ta[0], ta[1]) < 1e-6) ta = sub(A, a[0]); ta = unit(ta);
    let tb = sub(b[1], B); if (Math.hypot(tb[0], tb[1]) < 1e-6) tb = sub(b[3], B); tb = unit(tb);
    const k = r * 0.55, corner = { b: [A, [A[0] + ta[0] * k, A[1] + ta[1] * k], [B[0] - tb[0] * k, B[1] - tb[1] * k], B], curve: true, s0: true };
    const ns = [];
    for (let j = 0; j < n; j++) {
      if (j === inI) { ns.push({ b: a, curve: sIn.curve, s0: sIn.s0 }); ns.push(corner); }
      else if (j === idx) ns.push({ b, curve: sOut.curve, s0: true });
      else ns.push(segs[j]);
    }
    if (inI === idx) continue;
    segs = ns; done++;
  }
  return { contour: roundC(rebuild(segs)), done };
}
function checkContours(cs) {
  const fixed = correctDirections(cs); let wrongDir = 0, extremes = 0, dupes = 0, tiny = 0, degenerate = 0;
  cs.forEach((c, i) => {
    if (fixed[i] !== c) wrongDir++;
    if (c.length < 3 && !c.some(n => n.i || n.o)) degenerate++;
    else if (Math.abs(ringArea(flatten(c, 8))) < 16) degenerate++;
    for (let k = 0; k < c.length; k++) {
      const a = c[k], b = c[(k + 1) % c.length]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 0.5 && c.length > 1) dupes++; else if (d < 3) tiny++;
      const s = segOf(c, k); if (s.curve && extremaT(s.b).length) extremes++;
    }
  });
  return { wrongDir, extremes, dupes, tiny, degenerate, total: wrongDir + extremes + dupes + degenerate };
}
function fixContours(cs) {
  let out = cs.map(c => {
    const r = [];
    for (const n of c) { const l = r[r.length - 1]; if (l && Math.hypot(l.x - n.x, l.y - n.y) < 0.5) { l.o = n.o; l.s = l.s && n.s; continue; } r.push({ x: n.x, y: n.y, i: n.i, o: n.o, s: n.s }); }
    if (r.length > 1) { const a = r[0], l = r[r.length - 1]; if (Math.hypot(a.x - l.x, a.y - l.y) < 0.5) { a.i = l.i; r.pop(); } }
    return r;
  }).filter(c => c.length >= 2 && !(c.length < 3 && !c.some(n => n.i || n.o)) && Math.abs(ringArea(flatten(c, 8))) >= 16);
  out = addExtremes(out).contours;
  return correctDirections(out).map(c => roundC(c));
}

/* ---------- multipolygon → contours with tolerance ---------- */
function fromMultiErr(mp, err) { const out = []; for (const poly of mp) for (const ring of poly) { const c = fitRing(ring, err); if (c && c.length > 1) out.push(c); } return out; }
function fromMultiSmooth(mp, err, step) {
  const out = [];
  for (const poly of mp) for (const ring0 of poly) { let r = ring0.slice(0, -1); if (r.length < 3 || Math.abs(ringArea(r)) < step * step) continue; r = resampleRing(r, step); if (r.length < 4) continue; r = smoothRing(r, 2); const c = fitRing(r, err); if (c && c.length > 1) out.push(c); }
  return correctDirections(out).map(c => roundC(c));
}
function contourGroups(cs) {
  const fixed = correctDirections(cs), rings = fixed.map(c => flatten(c, 5)), areas = rings.map(r => ringArea(r)), groups = [];
  const outerOf = [];
  rings.forEach((r, i) => { if (r.length < 3) return; if (areas[i] > 0) { outerOf[i] = groups.length; groups.push({ idx: [i], rings: [r] }); } });
  rings.forEach((r, i) => {
    if (r.length < 3 || areas[i] > 0) return;
    let best = -1, ba = Infinity; rings.forEach((o, j) => { if (areas[j] > 0 && areas[j] < ba && pointInRing(r[0], o)) { ba = areas[j]; best = j; } });
    if (best >= 0) { const g = groups[outerOf[best]]; g.idx.push(i); g.rings.push(r); } else groups.push({ idx: [i], rings: [r.slice().reverse()] });
  });
  for (const g of groups) { g.poly = g.rings.map(r => { const q = r.map(p => [p[0], p[1]]); q.push([q[0][0], q[0][1]]); return q; }); g.bb = bounds([fixed[g.idx[0]]]); }
  return groups;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / l; if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function circRing(x, y, r) { const n = Math.max(12, Math.min(40, Math.round(r / 3))), ring = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ring.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } ring.push(ring[0]); return [ring]; }
function strokePolys(raw) {
  if (!raw.length) return [];
  let pts = raw.map((p, i) => { if (i === 0 || i === raw.length - 1) return p; const a = raw[i - 1], b = raw[i + 1]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4, (a[2] + 2 * p[2] + b[2]) / 4]; });
  let eps = 0.8; let s = rdp(pts, eps); while (s.length > 140) { eps *= 1.6; s = rdp(pts, eps); }
  const polys = [];
  for (let i = 0; i < s.length; i++) {
    const p = s[i]; polys.push(circRing(p[0], p[1], Math.max(1, p[2])));
    if (i) { const q = s[i - 1], u = unit(sub(p, q)), nx = -u[1], ny = u[0]; if (dist(p, q) > 0.5) polys.push([[[q[0] + nx * q[2], q[1] + ny * q[2]], [p[0] + nx * p[2], p[1] + ny * p[2]], [p[0] - nx * p[2], p[1] - ny * p[2]], [q[0] - nx * q[2], q[1] - ny * q[2]], [q[0] + nx * q[2], q[1] + ny * q[2]]]]); }
  }
  return PC.union(...polys);
}
function mpBounds(mp) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const poly of mp) for (const p of poly[0]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return { x0, y0, x1, y1 }; }
function applyStroke(cs, raw, erase, merge, err) {
  const S = strokePolys(raw); if (!S.length) return { contours: cs, changed: false };
  const avgR = raw.reduce((t, p) => t + p[2], 0) / raw.length, step = Math.max(2, Math.min(8, avgR * 0.18)), fm = mp => fromMultiSmooth(mp, err, step);
  const sb = mpBounds(S), groups = contourGroups(cs), hit = [], keepIdx = new Set(cs.map((_, i) => i));
  for (const g of groups) {
    if (!g.bb || g.bb.x1 < sb.x0 || g.bb.x0 > sb.x1 || g.bb.y1 < sb.y0 || g.bb.y0 > sb.y1) continue;
    let inter = []; try { inter = PC.intersection(g.poly, S); } catch (e) { }
    if (inter.length) { hit.push(g); g.idx.forEach(i => keepIdx.delete(i)); }
  }
  const kept = cs.filter((_, i) => keepIdx.has(i));
  if (erase) {
    if (!hit.length) return { contours: cs, changed: false };
    const res = PC.difference(PC.union(...hit.map(g => g.poly)), S);
    return { contours: kept.concat(fm(res)), changed: true };
  }
  if (!merge) return { contours: cs.concat(fm(S)), changed: true };
  const res = hit.length ? PC.union(S, ...hit.map(g => g.poly)) : S;
  return { contours: kept.concat(fm(res)), changed: true };
}

/* ---------- tracing ---------- */
function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } }
  return th;
}
function traceField(val, w, h, iso) {
  iso = iso == null ? 0.5 : iso;
  const W = w + 2, H = h + 2, F = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) F[(y + 1) * W + x + 1] = val[y * w + x];
  const v = (x, y) => F[y * W + x], segs = [], pts = new Map();
  const hid = (x, y) => (y * (W + 1) + x) * 2, vid = (x, y) => (y * (W + 1) + x) * 2 + 1;
  const lerp = (a, b) => (iso - a) / ((b - a) || 1e-9);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const tl = v(x, y), tr = v(x + 1, y), br = v(x + 1, y + 1), bl = v(x, y + 1);
    const c = (tl > iso ? 8 : 0) | (tr > iso ? 4 : 0) | (br > iso ? 2 : 0) | (bl > iso ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = hid(x, y), B = hid(x, y + 1), Lf = vid(x, y), R = vid(x + 1, y);
    if (!pts.has(T)) pts.set(T, [x + lerp(tl, tr), y]); if (!pts.has(B)) pts.set(B, [x + lerp(bl, br), y + 1]);
    if (!pts.has(Lf)) pts.set(Lf, [x, y + lerp(tl, bl)]); if (!pts.has(R)) pts.set(R, [x + 1, y + lerp(tr, br)]);
    const mid = (tl + tr + br + bl) / 4 > iso;
    switch (c) {
      case 1: segs.push([Lf, B]); break; case 2: segs.push([B, R]); break; case 3: segs.push([Lf, R]); break; case 4: segs.push([T, R]); break;
      case 5: if (mid) segs.push([Lf, T], [B, R]); else segs.push([Lf, B], [T, R]); break;
      case 6: segs.push([T, B]); break; case 7: segs.push([T, Lf]); break; case 8: segs.push([T, Lf]); break; case 9: segs.push([T, B]); break;
      case 10: if (mid) segs.push([T, R], [Lf, B]); else segs.push([T, Lf], [B, R]); break;
      case 11: segs.push([T, R]); break; case 12: segs.push([Lf, R]); break; case 13: segs.push([R, B]); break; case 14: segs.push([Lf, B]); break;
    }
  }
  const adj = new Map(); segs.forEach((s, i) => { for (const e of s) { if (!adj.has(e)) adj.set(e, []); adj.get(e).push(i); } });
  const used = new Uint8Array(segs.length), rings = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1; const start = segs[i][0], ring = [start]; let curE = segs[i][1], guard = 0;
    while (curE !== start && guard++ < 1e6) { ring.push(curE); const nx = (adj.get(curE) || []).find(j => !used[j]); if (nx == null) break; used[nx] = 1; curE = segs[nx][0] === curE ? segs[nx][1] : segs[nx][0]; }
    if (ring.length > 3) rings.push(ring.map(e => { const p = pts.get(e); return [p[0] - 1, p[1] - 1]; }));
  }
  return rings;
}
function smoothRing(r, it) { let a = r; for (let k = 0; k < it; k++) { const n = a.length; a = a.map((p, i) => { const q = a[(i - 1 + n) % n], s = a[(i + 1) % n]; return [(q[0] + 2 * p[0] + s[0]) / 4, (q[1] + 2 * p[1] + s[1]) / 4]; }); } return a; }
function resampleRing(r, step) {
  const out = [r[0]]; let acc = 0;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], d = dist(a, b); let t0 = 0; while (acc + d * (1 - t0) >= step) { const t = t0 + (step - acc) / d; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); t0 = t; acc = 0; } acc += d * (1 - t0); }
  if (out.length > 3 && dist(out[0], out[out.length - 1]) < step * 0.5) out.pop();
  return out;
}
function ringsToContours(rings, map, err, minArea, upp) {
  const out = [];
  for (const r0 of rings) {
    let r = r0.map(map); if (Math.abs(ringArea(r)) < minArea) continue;
    r = resampleRing(smoothRing(r, 2), Math.max(2, upp * 1.2)); if (r.length < 4) continue;
    const c = fitRing(r, err); if (c && c.length > 1) out.push(c);
  }
  return correctDirections(out).map(c => roundC(c));
}

/* ---------- composites ---------- */
const MARKS = { grave: '`', acute: '´', circ: 'ˆ', tilde: '˜', diaer: '¨', ring: '˚', caron: 'ˇ', breve: '˘', dot: '˙', ced: '¸' };
const CSETS = {
  west: { name: 'Западноевропейские', list: 'ÀA grave|ÁA acute|ÂA circ|ÃA tilde|ÄA diaer|ÅA ring|àa grave|áa acute|âa circ|ãa tilde|äa diaer|åa ring|ÈE grave|ÉE acute|ÊE circ|ËE diaer|èe grave|ée acute|êe circ|ëe diaer|ÌI grave|ÍI acute|ÎI circ|ÏI diaer|ìı grave|íı acute|îı circ|ïı diaer|ÑN tilde|ñn tilde|ÒO grave|ÓO acute|ÔO circ|ÕO tilde|ÖO diaer|òo grave|óo acute|ôo circ|õo tilde|öo diaer|ÙU grave|ÚU acute|ÛU circ|ÜU diaer|ùu grave|úu acute|ûu circ|üu diaer|ÝY acute|ýy acute|ÿy diaer|ÇC ced|çc ced' },
  central: { name: 'Центральноевропейские', list: 'ČC caron|čc caron|ŠS caron|šs caron|ŽZ caron|žz caron|ŘR caron|řr caron|ĚE caron|ěe caron|ŇN caron|ňn caron|ŤT caron|ŮU ring|ůu ring|ĆC acute|ćc acute|ŃN acute|ńn acute|ŚS acute|śs acute|ŹZ acute|źz acute|ŻZ dot|żz dot' },
  turkic: { name: 'Тюркские', list: 'ĞG breve|ğg breve|ŞS ced|şs ced|İI dot|Əe rotcap|əe rot|ÖO diaer|öo diaer|ÜU diaer|üu diaer|ÇC ced|çc ced' },
  cyr: { name: 'Кириллица', list: 'ЁЕ diaer|ёе diaer|ЙИ breve|йи breve|ЎУ breve|ўу breve' },
};
function parseSet(key) { return CSETS[key].list.split('|').map(s => { const a = [...s.split(' ')[0]]; return { ch: a[0], base: a[1], kind: s.split(' ')[1] }; }); }
function shiftC(cs, dx, dy) { return cs.map(c => c.map(n => ({ x: Math.round(n.x + dx), y: Math.round(n.y + dy), s: n.s, i: n.i ? [Math.round(n.i[0] + dx), Math.round(n.i[1] + dy)] : null, o: n.o ? [Math.round(n.o[0] + dx), Math.round(n.o[1] + dy)] : null }))); }
function mapPts(cs, f) { return cs.map(c => c.map(n => { const p = f([n.x, n.y]); return { x: Math.round(p[0]), y: Math.round(p[1]), s: n.s, i: n.i ? f(n.i).map(Math.round) : null, o: n.o ? f(n.o).map(Math.round) : null }; })); }
function composeOne(font, spec) {
  const I = font.info, B = font.glyphs[spec.base]; if (!B || !B.contours.length) return { err: 'base' };
  const bb = bounds(B.contours);
  if (spec.kind === 'rot' || spec.kind === 'rotcap') {
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    let cs = mapPts(B.contours, p => [2 * cx - p[0], 2 * cy - p[1]]), adv = B.adv;
    if (spec.kind === 'rotcap') { const k = I.capHeight / Math.max(1, I.xHeight), kx = 1 + (k - 1) * 0.5; cs = mapPts(cs, p => [bb.x0 + (p[0] - bb.x0) * kx, bb.y0 + (p[1] - bb.y0) * k]); adv = Math.round(B.adv + (bb.x1 - bb.x0) * (kx - 1)); }
    return { contours: cs, adv };
  }
  const M = font.glyphs[MARKS[spec.kind]]; if (!M || !M.contours.length) return { err: 'mark' };
  const mb = bounds(M.contours), cx = (bb.x0 + bb.x1) / 2, dx = cx - (mb.x0 + mb.x1) / 2;
  let dy;
  if (spec.kind === 'ced') dy = (bb.y0 + 30) - mb.y1;
  else { const up = isUpperish(spec.base); dy = (up ? Math.max(bb.y1, I.capHeight) : bb.y1) + (up ? 50 : 60) - mb.y0; }
  return { contours: B.contours.map(cloneC).concat(shiftC(M.contours, dx, dy)), adv: B.adv };
}
function composeSets(font, keys, opt) {
  opt = opt || {}; const made = [], skipped = [], specs = [];
  for (const k of keys) for (const s of parseSet(k)) if (!specs.some(x => x.ch === s.ch)) specs.push(s);
  for (const s of specs) {
    const ex = font.glyphs[s.ch];
    if (ex && ex.contours.length && !opt.overwrite && !(ex.comp && opt.rebuild)) continue;
    const r = composeOne(font, s); if (r.err) { skipped.push(s.ch); continue; }
    let g = ex; if (!g) { g = L.newGlyph(s.ch, r.adv); font.glyphs[s.ch] = g; font.order.push(s.ch); }
    g.contours = r.contours; g.adv = r.adv; g.comp = { base: s.base, kind: s.kind }; made.push(s.ch);
  }
  if (opt.kern && made.length) {
    const byBase = {}; for (const ch of made) { const b = font.glyphs[ch].comp.base; (byBase[b] = byBase[b] || []).push(ch); }
    const orig = Object.entries(font.kerning);
    for (const [key, v] of orig) {
      const [l, r] = key.split('\t'), Ls = [l].concat(byBase[l] || []), Rs = [r].concat(byBase[r] || []);
      for (const a of Ls) for (const b of Rs) { const k2 = a + '\t' + b; if (!(k2 in font.kerning)) font.kerning[k2] = v; }
    }
  }
  return { made, skipped };
}
function rebuildComposites(font) {
  let n = 0;
  for (const k of font.order) { const g = font.glyphs[k]; if (!g || !g.comp) continue; const r = composeOne(font, { ch: k, base: g.comp.base, kind: g.comp.kind }); if (r.err) continue; g.contours = r.contours; g.adv = r.adv; n++; }
  return n;
}


/* ---------- kerning groups ---------- */
function kernValue(font, l, r) {
  const K = font.kerning, x = K[l + '\t' + r]; if (x !== undefined) return x;
  const G = font.kgroups; if (!G) return 0; const gl = G.L[l], gr = G.R[r]; let v;
  if (gl) { v = K['@' + gl + '\t' + r]; if (v !== undefined) return v; }
  if (gr) { v = K[l + '\t@' + gr]; if (v !== undefined) return v; }
  if (gl && gr) { v = K['@' + gl + '\t@' + gr]; if (v !== undefined) return v; }
  return 0;
}
function kernSource(font, l, r) {
  const K = font.kerning, G = font.kgroups || { L: {}, R: {} }, gl = G.L[l], gr = G.R[r];
  if (K[l + '\t' + r] !== undefined) return { src: (gl || gr) ? 'exception' : 'pair', key: l + '\t' + r };
  for (const k of [gl && '@' + gl + '\t' + r, gr && l + '\t@' + gr, gl && gr && '@' + gl + '\t@' + gr]) if (k && K[k] !== undefined) return { src: 'group', key: k };
  return { src: 'none', key: null };
}
// a group side is '@' + name; the '@' glyph itself is just '@'
const isGS = s => s.length > 1 && s[0] === '@', GKRE = /(^|\t)@[^\t]/;
function hasGroupKeys(font) { for (const k in font.kerning) if (GKRE.test(k)) return true; return false; }
function flatKerning(font) {
  if (!font.kgroups || !hasGroupKeys(font)) { const o = {}; for (const k in font.kerning) if (!GKRE.test(k) && font.kerning[k]) o[k] = font.kerning[k]; return o; }
  // expand group keys instead of testing every pair: lowest precedence first, so later levels overwrite (same result as kernValue)
  const has = k => { const g = font.glyphs[k]; return !!(g && g.contours.length); }, G = font.kgroups, K = font.kerning, memL = {}, memR = {}, all = {};
  for (const c in G.L) (memL[G.L[c]] = memL[G.L[c]] || []).push(c); for (const c in G.R) (memR[G.R[c]] = memR[G.R[c]] || []).push(c);
  const isG = s => s.length > 1 && s[0] === '@', lv = [[], [], [], []];
  for (const key in K) { const i = key.indexOf('\t'), l = key.slice(0, i), r = key.slice(i + 1), gl = isG(l), gr = isG(r); lv[gl && gr ? 0 : gr ? 1 : gl ? 2 : 3].push([l, r, K[key], gl, gr]); }
  for (const level of lv) for (const [l, r, v, gl, gr] of level) {
    const ls = gl ? (memL[l.slice(1)] || []) : [l], rs = gr ? (memR[r.slice(1)] || []) : [r];
    for (const a of ls) for (const b of rs) all[a + '\t' + b] = v;
  }
  const out = {}; for (const k in all) { if (!all[k]) continue; const i = k.indexOf('\t'); if (has(k.slice(0, i)) && has(k.slice(i + 1))) out[k] = all[k]; }
  return out;
}
function sideSig(font, ch, side, top) {
  const g = font.glyphs[ch]; if (!g || !g.contours.length) return null; const p = L.profile(g, 0, top, 20); if (p.bot < 0) return null;
  const sig = []; for (let b = 0; b < p.L.length; b++) sig.push(side === 'left' ? (isNaN(p.L[b]) ? null : p.L[b]) : (isNaN(p.R[b]) ? null : g.adv - p.R[b]));
  return sig;
}
function sigDist(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x == null && y == null) continue; if (x == null || y == null) { s += 60; n++; continue; } s += Math.min(120, Math.abs(x - y)); n++; } return n ? s / n : 999; }
function autoGroups(font, thr) {
  thr = thr || 9; const G = { L: {}, R: {} }, I = font.info;
  for (const k of font.order) { const g = font.glyphs[k]; if (g && g.comp && g.comp.kind !== 'rot' && g.comp.kind !== 'rotcap' && font.glyphs[g.comp.base] && font.glyphs[g.comp.base].contours.length) { G.L[k] = g.comp.base; G.R[k] = g.comp.base; } }
  const classes = [[ch => /\p{Lu}/u.test(ch), I.capHeight], [ch => /\p{Ll}/u.test(ch), I.xHeight], [ch => /\p{Nd}/u.test(ch), I.capHeight]];
  for (const [test, top] of classes) {
    const chars = font.order.filter(k => test(k) && font.glyphs[k].contours.length && !G.L[k]);
    for (const [map, side] of [['L', 'right'], ['R', 'left']]) {
      const leaders = [];
      for (const ch of chars) {
        const s = sideSig(font, ch, side, top); if (!s) continue; let best = null, bd = thr;
        for (const ld of leaders) { const d = sigDist(s, ld.sig); if (d < bd) { bd = d; best = ld; } }
        if (best) { G[map][ch] = best.ch; best.n++; } else leaders.push({ ch, sig: s, n: 1 });
      }
      for (const ld of leaders) if (ld.n > 1) G[map][ld.ch] = ld.ch;
    }
  }
  for (const m of ['L', 'R']) for (const k in G[m]) { let v = G[m][k], guard = 0; while (G[m][v] && G[m][v] !== v && guard++ < 6) v = G[m][v]; G[m][k] = v; G[m][v] = v; }
  for (const m of ['L', 'R']) { const cnt = {}; for (const k in G[m]) cnt[G[m][k]] = (cnt[G[m][k]] || 0) + 1; for (const k in G[m]) if (cnt[G[m][k]] < 2) delete G[m][k]; }
  return G;
}
function collapseKerning(font) {
  const G = font.kgroups, K = font.kerning, before = Object.keys(K).length, out = {};
  const lead = (m, c) => { const g = G[m][c]; return !g || g === c; };
  for (const key in K) {
    const [l, r] = key.split('\t'); if (isGS(l) || isGS(r)) { out[key] = K[key]; continue; }
    if (lead('L', l) && lead('R', r)) { const nk = (G.L[l] ? '@' + l : l) + '\t' + (G.R[r] ? '@' + r : r); if (!(nk in out)) out[nk] = K[key]; }
  }
  font.kerning = out;
  for (const key in K) {
    const [l, r] = key.split('\t'); if (isGS(l) || isGS(r) || (lead('L', l) && lead('R', r))) continue;
    const gv = kernValue(font, l, r); if (Math.abs(gv - K[key]) > 4) out[key] = K[key];
  }
  return { before, after: Object.keys(out).length };
}
function groupsToText(font, m) {
  const G = font.kgroups; if (!G) return ''; const by = {};
  for (const k in G[m]) (by[G[m][k]] = by[G[m][k]] || []).push(k);
  const pos = c => { const i = font.order.indexOf(c); return i < 0 ? 1e9 : i; };
  return Object.keys(by).sort((a, b) => pos(a) - pos(b)).map(ld => [ld].concat(by[ld].filter(c => c !== ld).sort((a, b) => pos(a) - pos(b))).join(' ')).join('\n');
}
function parseGroups(font, text) {
  const map = {}, bad = [];
  for (const line of text.split('\n')) {
    const toks = [...line.replace(/[,;:]/g, ' ')].join('').split(/\s+/).filter(Boolean).map(t => [...t].length === 1 ? t : null);
    const chars = toks.filter(Boolean); if (toks.some(t => !t)) bad.push(line.trim());
    const ok = chars.filter(c => font.glyphs[c]); if (ok.length < 2) continue;
    for (const c of ok) if (!map[c]) map[c] = ok[0];
  }
  return { map, bad };
}

Object.assign(L, { isGS, GKRE, kernValue, kernSource, flatKerning, autoGroups, collapseKerning, groupsToText, parseGroups, fromMultiSmooth, splitBez, segsOf, rebuild, extremaT, addExtremes, roundCorners, checkContours, fixContours, fromMultiErr, contourGroups, strokePolys, applyStroke, otsu, traceField, ringsToContours, MARKS, CSETS, parseSet, composeOne, composeSets, rebuildComposites, mapPts, shiftC });
})(typeof window !== 'undefined' ? window : globalThis);
