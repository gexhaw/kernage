/* ===== LITERA CORE: geometry, booleans, fitting, sample font, autokern, export ===== */
(function (G) {
'use strict';
const opentype = G.opentype, PC = G.polygonClipping;

/* ---------- vector helpers ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const neg = a => [-a[0], -a[1]];
const angBetween = (u, v) => { const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]); if (!lu || !lv) return 0; let c = dot(u, v) / (lu * lv); c = Math.max(-1, Math.min(1, c)); return Math.acos(c); };
function bez(b, t) { const m = 1 - t, a = m * m * m, c = 3 * t * m * m, d = 3 * t * t * m, e = t * t * t; return [a * b[0][0] + c * b[1][0] + d * b[2][0] + e * b[3][0], a * b[0][1] + c * b[1][1] + d * b[2][1] + e * b[3][1]]; }
function bezD1(b, t) { const m = 1 - t; return [3 * m * m * (b[1][0] - b[0][0]) + 6 * m * t * (b[2][0] - b[1][0]) + 3 * t * t * (b[3][0] - b[2][0]), 3 * m * m * (b[1][1] - b[0][1]) + 6 * m * t * (b[2][1] - b[1][1]) + 3 * t * t * (b[3][1] - b[2][1])]; }
function bezD2(b, t) { const m = 1 - t; return [6 * m * (b[2][0] - 2 * b[1][0] + b[0][0]) + 6 * t * (b[3][0] - 2 * b[2][0] + b[1][0]), 6 * m * (b[2][1] - 2 * b[1][1] + b[0][1]) + 6 * t * (b[3][1] - 2 * b[2][1] + b[1][1])]; }

/* ---------- contour model: node {x,y,i:[x,y]|null,o:[x,y]|null,s:bool} ---------- */
const N = (x, y) => ({ x, y, i: null, o: null, s: false });
function cloneC(c) { return c.map(n => { const o = { x: n.x, y: n.y, i: n.i ? [n.i[0], n.i[1]] : null, o: n.o ? [n.o[0], n.o[1]] : null, s: !!n.s }; if (n.k) o.k = n.k; return o; }); }
function reverseC(c) { return c.slice().reverse().map(n => { const o = { x: n.x, y: n.y, i: n.o ? [n.o[0], n.o[1]] : null, o: n.i ? [n.i[0], n.i[1]] : null, s: n.s }; if (n.k) o.k = n.k; if (n.r) o.r = n.r; return o; }); }
function segOf(c, i) { const a = c[i], b = c[(i + 1) % c.length]; if (a.o || b.i) return { curve: true, b: [[a.x, a.y], a.o || [a.x, a.y], b.i || [b.x, b.y], [b.x, b.y]] }; return { curve: false, b: [[a.x, a.y], [a.x, a.y], [b.x, b.y], [b.x, b.y]] }; }
function flatten(c, step) {
  step = step || 6; const pts = [], n = c.length; if (!n) return pts;
  for (let i = 0; i < n; i++) {
    const a = c[i]; pts.push([a.x, a.y]); const s = segOf(c, i);
    if (s.curve) { const L = (dist(s.b[0], s.b[1]) + dist(s.b[1], s.b[2]) + dist(s.b[2], s.b[3]) + dist(s.b[0], s.b[3])) / 2; const k = Math.max(4, Math.ceil(L / step)); for (let j = 1; j < k; j++) pts.push(bez(s.b, j / k)); }
  }
  return pts;
}
function ringArea(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
function contourArea(c) { return ringArea(flatten(c, 12)); }
function pointInRing(pt, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if (((a[1] > pt[1]) !== (b[1] > pt[1])) && (pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0])) ins = !ins; } return ins; }
function bounds(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const p of flatten(c, 10)) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return isFinite(x0) ? { x0, y0, x1, y1 } : null;
}
function autoSmooth(c) {
  const n = c.length;
  for (let k = 0; k < n; k++) {
    const nd = c[k], pv = c[(k - 1 + n) % n], nx = c[(k + 1) % n];
    const inV = sub([nd.x, nd.y], nd.i || [pv.x, pv.y]), outV = sub(nd.o || [nx.x, nx.y], [nd.x, nd.y]);
    nd.s = !!(nd.i || nd.o) && Math.hypot(inV[0], inV[1]) > 0.01 && Math.hypot(outV[0], outV[1]) > 0.01 && angBetween(inV, outV) < 0.06;
  }
  return c;
}
function roundC(c) { for (const n of c) { n.x = Math.round(n.x); n.y = Math.round(n.y); if (n.i) n.i = [Math.round(n.i[0]), Math.round(n.i[1])]; if (n.o) n.o = [Math.round(n.o[0]), Math.round(n.o[1])]; } return c; }
/* nesting depth parity → outer CCW, holes CW */
function correctDirections(contours) {
  const rings = contours.map(c => flatten(c, 10));
  return contours.map((c, i) => {
    if (!rings[i].length) return c;
    let depth = 0; const p = rings[i][0];
    for (let j = 0; j < contours.length; j++) if (j !== i && rings[j].length > 2 && Math.abs(ringArea(rings[j])) > Math.abs(ringArea(rings[i])) && pointInRing(p, rings[j])) depth++;
    const ccw = ringArea(rings[i]) > 0, wantCCW = depth % 2 === 0;
    return ccw === wantCCW ? c : reverseC(c);
  });
}

/* ---------- primitives ---------- */
function arcNodes(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(1, Math.ceil((a1 - a0) / 90 - 1e-9)), d = (a1 - a0) / n * Math.PI / 180, k = 4 / 3 * Math.tan(d / 4), out = [];
  for (let j = 0; j <= n; j++) {
    const t = a0 * Math.PI / 180 + j * d, c = Math.cos(t), s = Math.sin(t), nd = N(cx + rx * c, cy + ry * s), dx = -rx * s * k, dy = ry * c * k;
    if (j > 0) nd.i = [nd.x - dx, nd.y - dy]; if (j < n) nd.o = [nd.x + dx, nd.y + dy]; nd.s = j > 0 && j < n; out.push(nd);
  }
  return out;
}
function ellipseC(cx, cy, rx, ry) { const a = arcNodes(cx, cy, rx, ry, 0, 360), last = a.pop(); a[0].i = last.i; a[0].s = true; return a; }
function rectC(x0, y0, x1, y1) { return [N(x0, y0), N(x1, y0), N(x1, y1), N(x0, y1)]; }

/* ---------- booleans via polygon-clipping ---------- */
function toPolys(contours) {
  const fixed = correctDirections(contours.filter(c => c.length > 2));
  const rings = fixed.map(c => { const r = flatten(c, 5); return r; });
  const outers = [], holes = [];
  rings.forEach((r, i) => { if (r.length < 3) return; (ringArea(r) > 0 ? outers : holes).push(r); });
  const polys = outers.map(o => [o]);
  for (const h of holes) {
    let best = -1, ba = Infinity;
    outers.forEach((o, k) => { const a = Math.abs(ringArea(o)); if (a < ba && pointInRing(h[0], o)) { ba = a; best = k; } });
    if (best >= 0) polys[best].push(h);
  }
  return polys.map(p => p.map(r => { const q = r.map(v => [v[0], v[1]]); q.push([q[0][0], q[0][1]]); return q; }));
}
function fromMulti(mp) {
  const out = [];
  for (const poly of mp) for (const ring of poly) { const c = fitRing(ring); if (c && c.length > 1) out.push(c); }
  return out;
}
function booleanOp(op, a, b) {
  if (!PC) throw new Error('Модуль булевых операций не загрузился');
  const pa = toPolys(a), pb = toPolys(b);
  if (op === 'union') { const all = pa.concat(pb); if (!all.length) return []; return fromMulti(PC.union(...all)); }
  if (!pa.length) return op === 'difference' ? [] : (op === 'xor' ? fromMulti(PC.union(...pb)) : []);
  if (!pb.length) return op === 'intersection' ? [] : fromMulti(PC.union(...pa));
  const A = PC.union(...pa), B = PC.union(...pb);
  return fromMulti(PC[op](A, B));
}

/* ---------- curve fitting (Schneider) ---------- */
function chord(d) { const u = [0]; for (let i = 1; i < d.length; i++) u.push(u[i - 1] + dist(d[i], d[i - 1])); const L = u[u.length - 1] || 1; return u.map(v => v / L); }
function genBez(d, u, t1, t2) {
  const f = d[0], l = d[d.length - 1]; let C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = u[i], m = 1 - t, b0 = m * m * m, b1 = 3 * t * m * m, b2 = 3 * t * t * m, b3 = t * t * t, A0 = mul(t1, b1), A1 = mul(t2, b2);
    C00 += dot(A0, A0); C01 += dot(A0, A1); C11 += dot(A1, A1);
    const tmp = sub(d[i], add(mul(f, b0 + b1), mul(l, b2 + b3))); X0 += dot(A0, tmp); X1 += dot(A1, tmp);
  }
  const det = C00 * C11 - C01 * C01, seg = dist(f, l);
  let al = det ? (X0 * C11 - X1 * C01) / det : 0, ar = det ? (C00 * X1 - C01 * X0) / det : 0;
  if (al < 1e-6 * seg || ar < 1e-6 * seg || al > seg * 3 || ar > seg * 3) al = ar = seg / 3;
  return [f, add(f, mul(t1, al)), add(l, mul(t2, ar)), l];
}
function maxErr(d, b, u) { let m = 0, s = Math.floor(d.length / 2); for (let i = 1; i < d.length - 1; i++) { const e = dist(bez(b, u[i]), d[i]); if (e > m) { m = e; s = i; } } return [m, s]; }
function reparam(d, u, b) { return u.map((t, i) => { const q = bez(b, t), q1 = bezD1(b, t), q2 = bezD2(b, t), qp = sub(q, d[i]), den = dot(q1, q1) + dot(qp, q2); let r = den ? t - dot(qp, q1) / den : t; return Math.max(0, Math.min(1, r)); }); }
function fitCubic(d, t1, t2, err, out, depth) {
  depth = depth || 0;
  if (d.length === 2) { const k = dist(d[0], d[1]) / 3; out.push([d[0], add(d[0], mul(t1, k)), add(d[1], mul(t2, k)), d[1]]); return; }
  let u = chord(d), b = genBez(d, u, t1, t2), [me, sp] = maxErr(d, b, u);
  if (me < err) { out.push(b); return; }
  if (me < err * 8) for (let it = 0; it < 8; it++) { const u2 = reparam(d, u, b), b2 = genBez(d, u2, t1, t2), r = maxErr(d, b2, u2); u = u2; b = b2; me = r[0]; sp = r[1]; if (me < err) { out.push(b); return; } }
  if (depth > 30 || d.length < 4) { out.push(b); return; }
  sp = Math.max(1, Math.min(d.length - 2, sp));
  const tc = unit(sub(d[sp - 1], d[sp + 1]));
  fitCubic(d.slice(0, sp + 1), t1, tc, err, out, depth + 1);
  fitCubic(d.slice(sp), neg(tc), t2, err, out, depth + 1);
}
function isStraight(b) { const ch = sub(b[3], b[0]), L = Math.hypot(ch[0], ch[1]); if (L < 1e-6) return true; const nrm = [-ch[1] / L, ch[0] / L]; const d1 = Math.abs(dot(sub(b[1], b[0]), nrm)), d2 = Math.abs(dot(sub(b[2], b[0]), nrm)); const p1 = dot(sub(b[1], b[0]), ch) / (L * L), p2 = dot(sub(b[2], b[0]), ch) / (L * L); return d1 < 0.6 && d2 < 0.6 && p1 >= -0.01 && p1 <= 1.01 && p2 >= -0.01 && p2 <= 1.01; }
function fitRing(ringIn, err) {
  err = err || 1.1;
  let pts = [];
  for (const p of ringIn) if (!pts.length || dist(p, pts[pts.length - 1]) > 0.35) pts.push([p[0], p[1]]);
  while (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.35) pts.pop();
  // drop collinear points
  for (let pass = 0; pass < 2; pass++) {
    const q = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]; if (angBetween(sub(b, a), sub(c, b)) < 0.003 && (dist(a, b) > 14 || dist(b, c) > 14)) continue; q.push(b); }
    pts = q;
  }
  const n = pts.length; if (n < 3) return null;
  const LONG = 13, eLen = i => dist(pts[((i % n) + n) % n], pts[(((i + 1) % n) + n) % n]), P = i => pts[((i % n) + n) % n];
  const brk = new Array(n).fill(false), corner = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (angBetween(sub(P(i), P(i - 1)), sub(P(i + 1), P(i))) > 0.55) corner[i] = brk[i] = true;
    if (eLen(i) > LONG) { brk[i] = true; brk[(i + 1) % n] = true; }
  }
  const segs = [];
  const bi = []; for (let i = 0; i < n; i++) if (brk[i]) bi.push(i);
  if (!bi.length) {
    const seq = pts.concat([pts[0]]), t1 = unit(sub(pts[1], pts[n - 1]));
    fitCubic(seq, t1, neg(t1), err, segs);
  } else {
    for (let k = 0; k < bi.length; k++) {
      const s = bi[k], e = bi[(k + 1) % bi.length], span = ((e - s) % n + n) % n || n;
      if (span === 1 && eLen(s) > LONG) { segs.push([P(s), P(s), P(s + 1), P(s + 1), 'L']); continue; }
      const seq = []; for (let j = 0; j <= span; j++) seq.push(P(s + j));
      const t1 = (!corner[s] && eLen(s - 1) > LONG) ? unit(sub(P(s), P(s - 1))) : unit(sub(seq[1], seq[0]));
      const t2 = (!corner[e] && eLen(e) > LONG) ? unit(sub(P(e), P(e + 1))) : unit(sub(seq[seq.length - 2], seq[seq.length - 1]));
      fitCubic(seq, t1, t2, err, segs);
    }
  }
  const nodes = [];
  for (const b of segs) {
    const line = b[4] === 'L' || isStraight(b);
    if (!nodes.length || dist([nodes[nodes.length - 1].x, nodes[nodes.length - 1].y], b[0]) > 0.01) nodes.push(N(b[0][0], b[0][1]));
    nodes[nodes.length - 1].o = line ? null : [b[1][0], b[1][1]];
    const e = N(b[3][0], b[3][1]); e.i = line ? null : [b[2][0], b[2][1]]; nodes.push(e);
  }
  if (nodes.length > 1 && dist([nodes[0].x, nodes[0].y], [nodes[nodes.length - 1].x, nodes[nodes.length - 1].y]) < 0.01) { nodes[0].i = nodes[nodes.length - 1].i; nodes.pop(); }
  // merge collinear straight nodes
  const out = [];
  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k], pv = nodes[(k - 1 + nodes.length) % nodes.length], nx = nodes[(k + 1) % nodes.length];
    if (!nd.i && !nd.o && !pv.o && !nx.i && nodes.length > 3 && angBetween(sub([nd.x, nd.y], [pv.x, pv.y]), sub([nx.x, nx.y], [nd.x, nd.y])) < 0.004) continue;
    out.push(nd);
  }
  autoSmooth(out); roundC(out);
  return out;
}

/* ---------- sample font "Orbita": rounded monoline skeletons ---------- */
const R = 40, SB = 55, B = 40, C = 660, X = 460, AS = 700, DS = -160;
const SK = {
  A: [520, [['l', 0, B, 260, C], ['l', 260, C, 520, B], ['l', 76, 220, 444, 220]]],
  B: [440, [['l', 0, B, 0, C], ['l', 0, C, 240, C], ['a', 240, 510, 150, 150, -90, 90], ['l', 0, 360, 260, 360], ['l', 0, B, 260, B], ['a', 260, 200, 180, 160, -90, 90]]],
  C: [520, [['a', 300, 350, 300, 310, 40, 320]]],
  D: [500, [['l', 0, B, 0, C], ['l', 0, C, 200, C], ['l', 0, B, 200, B], ['a', 200, 350, 300, 310, -90, 90]]],
  E: [400, [['l', 0, B, 0, C], ['l', 0, C, 400, C], ['l', 0, 350, 360, 350], ['l', 0, B, 400, B]]],
  F: [400, [['l', 0, B, 0, C], ['l', 0, C, 400, C], ['l', 0, 350, 360, 350]]],
  G: [600, [['a', 300, 350, 300, 310, 45, 360], ['l', 360, 350, 600, 350]]],
  H: [480, [['l', 0, B, 0, C], ['l', 480, B, 480, C], ['l', 0, 350, 480, 350]]],
  I: [0, [['l', 0, B, 0, C]]],
  J: [400, [['l', 400, C, 400, 250], ['a', 200, 250, 200, 210, 180, 360]]],
  K: [460, [['l', 0, B, 0, C], ['l', 0, 280, 440, C], ['l', 150, 410, 460, B]]],
  L: [380, [['l', 0, B, 0, C], ['l', 0, B, 380, B]]],
  M: [600, [['l', 0, B, 0, C], ['l', 0, C, 300, 200], ['l', 300, 200, 600, C], ['l', 600, C, 600, B]]],
  N: [480, [['l', 0, B, 0, C], ['l', 0, C, 480, B], ['l', 480, B, 480, C]]],
  O: [640, [['o', 320, 350, 320, 310]]],
  P: [410, [['l', 0, B, 0, C], ['l', 0, C, 240, C], ['l', 0, 320, 240, 320], ['a', 240, 490, 170, 170, -90, 90]]],
  Q: [640, [['o', 320, 350, 320, 310], ['l', 400, 170, 600, B]]],
  R: [440, [['l', 0, B, 0, C], ['l', 0, C, 240, C], ['l', 0, 320, 240, 320], ['a', 240, 490, 170, 170, -90, 90], ['l', 220, 320, 440, B]]],
  S: [460, [['a', 220, 510, 210, 150, 20, 270], ['a', 230, 200, 230, 160, -160, 90]]],
  T: [480, [['l', 0, C, 480, C], ['l', 240, B, 240, C]]],
  U: [480, [['l', 0, C, 0, 260], ['l', 480, C, 480, 260], ['a', 240, 260, 240, 220, 180, 360]]],
  V: [500, [['l', 0, C, 250, B], ['l', 250, B, 500, C]]],
  W: [720, [['l', 0, C, 180, B], ['l', 180, B, 360, C], ['l', 360, C, 540, B], ['l', 540, B, 720, C]]],
  X: [480, [['l', 0, C, 480, B], ['l', 0, B, 480, C]]],
  Y: [500, [['l', 0, C, 250, 350], ['l', 500, C, 250, 350], ['l', 250, 350, 250, B]]],
  Z: [440, [['l', 0, C, 440, C], ['l', 440, C, 0, B], ['l', 0, B, 440, B]]],
  a: [420, [['o', 210, 250, 210, 210], ['l', 420, B, 420, X]]],
  b: [420, [['l', 0, B, 0, AS], ['o', 210, 250, 210, 210]]],
  c: [400, [['a', 210, 250, 210, 210, 40, 320]]],
  d: [420, [['o', 210, 250, 210, 210], ['l', 420, B, 420, AS]]],
  e: [420, [['a', 210, 250, 210, 210, 0, 320], ['l', 0, 250, 420, 250]]],
  f: [300, [['l', 100, B, 100, 560], ['a', 250, 560, 150, 140, 90, 180], ['l', 0, X, 260, X]]],
  g: [420, [['o', 210, 250, 210, 210], ['l', 420, X, 420, -20], ['a', 210, -20, 210, 140, 200, 360]]],
  h: [400, [['l', 0, B, 0, AS], ['a', 200, 260, 200, 200, 0, 180], ['l', 400, 260, 400, B]]],
  i: [0, [['l', 0, B, 0, X], ['d', 0, 640]]],
  j: [100, [['l', 100, X, 100, -60], ['a', 0, -60, 100, 100, 270, 360], ['d', 100, 640]]],
  k: [380, [['l', 0, B, 0, AS], ['l', 0, 180, 360, X], ['l', 110, 266, 380, B]]],
  l: [0, [['l', 0, B, 0, AS]]],
  m: [680, [['l', 0, B, 0, X], ['a', 170, 290, 170, 170, 0, 180], ['l', 340, 290, 340, B], ['a', 510, 290, 170, 170, 0, 180], ['l', 680, 290, 680, B]]],
  n: [400, [['l', 0, B, 0, X], ['a', 200, 260, 200, 200, 0, 180], ['l', 400, 260, 400, B]]],
  o: [440, [['o', 220, 250, 220, 210]]],
  p: [420, [['l', 0, DS, 0, X], ['o', 210, 250, 210, 210]]],
  q: [420, [['o', 210, 250, 210, 210], ['l', 420, DS, 420, X]]],
  r: [200, [['l', 0, B, 0, X], ['a', 200, 260, 200, 200, 90, 180]]],
  s: [350, [['a', 170, 355, 160, 105, 20, 270], ['a', 175, 145, 175, 105, -160, 90]]],
  t: [300, [['l', 100, 620, 100, 140], ['a', 220, 140, 120, 100, 180, 270], ['l', 0, X, 280, X]]],
  u: [400, [['l', 0, X, 0, 240], ['a', 200, 240, 200, 200, 180, 360], ['l', 400, X, 400, B]]],
  v: [400, [['l', 0, X, 200, B], ['l', 200, B, 400, X]]],
  w: [600, [['l', 0, X, 150, B], ['l', 150, B, 300, X], ['l', 300, X, 450, B], ['l', 450, B, 600, X]]],
  x: [400, [['l', 0, X, 400, B], ['l', 0, B, 400, X]]],
  y: [420, [['l', 0, X, 217, B], ['l', 420, X, 120, DS]]],
  z: [380, [['l', 0, X, 380, X], ['l', 380, X, 0, B], ['l', 0, B, 380, B]]],
  '0': [500, [['o', 250, 350, 250, 310]]],
  '1': [150, [['l', 150, B, 150, C], ['l', 150, C, 0, 540]]],
  '2': [440, [['a', 220, 460, 200, 200, -40, 160], ['l', 373, 331, 0, B], ['l', 0, B, 440, B]]],
  '3': [440, [['a', 210, 510, 200, 150, -90, 150], ['a', 220, 200, 220, 160, -150, 90]]],
  '4': [440, [['l', 340, B, 340, C], ['l', 340, C, 0, 240], ['l', 0, 240, 440, 240]]],
  '5': [420, [['l', 400, C, 40, C], ['l', 40, C, 25, 320], ['a', 210, 220, 210, 180, -150, 150]]],
  '6': [420, [['o', 210, 220, 210, 180], ['a', 260, 330, 260, 330, 60, 180]]],
  '7': [440, [['l', 0, C, 440, C], ['l', 440, C, 140, B]]],
  '8': [420, [['o', 210, 505, 180, 155], ['o', 210, 195, 210, 155]]],
  '9': [420, [['o', 210, 480, 210, 180], ['a', 160, 370, 260, 330, 240, 360]]],
  '.': [0, [['d', 0, 46]]],
  ',': [40, [['d', 40, 46], ['l', 40, 40, 0, -100]]],
  ':': [0, [['d', 0, 46], ['d', 0, 420]]],
  ';': [40, [['d', 40, 420], ['d', 40, 46], ['l', 40, 40, 0, -100]]],
  '!': [0, [['l', 0, 210, 0, C], ['d', 0, 46]]],
  '?': [400, [['a', 200, 500, 200, 160, -90, 160], ['l', 200, 340, 200, 220], ['d', 200, 46]]],
  '-': [260, [['l', 0, 300, 260, 300]]],
  '–': [460, [['l', 0, 300, 460, 300]]],
  '—': [820, [['l', 0, 300, 820, 300]]],
  "'": [0, [['l', 0, 520, 0, C]]],
  '"': [140, [['l', 0, 520, 0, C], ['l', 140, 520, 140, C]]],
  '/': [380, [['l', 0, -60, 380, AS]]],
  '(': [160, [['a', 360, 300, 360, 400, 125, 235]]],
  ')': [160, [['a', -200, 300, 360, 400, -55, 55]]],
  '+': [400, [['l', 0, 300, 400, 300], ['l', 200, 100, 200, 500]]],
  '=': [400, [['l', 0, 220, 400, 220], ['l', 0, 380, 400, 380]]],
  '×': [340, [['l', 0, 130, 340, 470], ['l', 0, 470, 340, 130]]],
  'Г': [380, [['l', 0, B, 0, C], ['l', 0, C, 380, C]]],
  'П': [480, [['l', 0, B, 0, C], ['l', 480, B, 480, C], ['l', 0, C, 480, C]]],
  'И': [480, [['l', 0, B, 0, C], ['l', 0, B, 480, C], ['l', 480, B, 480, C]]],
  'Ш': [640, [['l', 0, B, 0, C], ['l', 320, B, 320, C], ['l', 640, B, 640, C], ['l', 0, B, 640, B]]],
  'Б': [410, [['l', 0, B, 0, C], ['l', 0, C, 400, C], ['l', 0, 380, 240, 380], ['l', 0, B, 240, B], ['a', 240, 210, 170, 170, -90, 90]]],
  'Л': [460, [['l', 0, B, 180, C], ['l', 180, C, 460, C], ['l', 460, C, 460, B]]],
  'Э': [520, [['a', 220, 350, 300, 310, -140, 140], ['l', 160, 350, 520, 350]]],
  'Ч': [440, [['l', 0, C, 0, 440], ['a', 200, 440, 200, 120, 180, 360], ['l', 440, C, 440, B]]],
  'Ц': [520, [['l', 0, B, 0, C], ['l', 460, B, 460, C], ['l', 0, B, 520, B], ['l', 520, B, 520, -100]]],
  'У': [480, [['l', 0, C, 271, 300], ['l', 480, C, 120, B]]],
  'Д': [500, [['l', 140, C, 440, C], ['l', 440, C, 440, B], ['l', 140, C, 60, B], ['l', 0, B, 500, B], ['l', 0, B, 0, -100], ['l', 500, B, 500, -100]]],
  'Ж': [640, [['l', 320, B, 320, C], ['l', 320, 350, 20, C], ['l', 320, 350, 620, C], ['l', 320, 350, 0, B], ['l', 320, 350, 640, B]]],
  'Й': [480, [['l', 0, B, 0, C], ['l', 0, B, 480, C], ['l', 480, B, 480, C], ['a', 240, 800, 110, 70, 200, 340]]],
  'Ф': [600, [['l', 300, B, 300, C], ['o', 300, 370, 300, 200]]],
  'Щ': [700, [['l', 0, B, 0, C], ['l', 320, B, 320, C], ['l', 640, B, 640, C], ['l', 0, B, 700, B], ['l', 700, B, 700, -100]]],
  'Ь': [390, [['l', 0, B, 0, C], ['l', 0, 380, 220, 380], ['l', 0, B, 220, B], ['a', 220, 210, 170, 170, -90, 90]]],
  'Ъ': [490, [['l', 0, C, 100, C], ['l', 100, B, 100, C], ['l', 100, 380, 320, 380], ['l', 100, B, 320, B], ['a', 320, 210, 170, 170, -90, 90]]],
  'Ы': [560, [['l', 0, B, 0, C], ['l', 0, 380, 200, 380], ['l', 0, B, 200, B], ['a', 200, 210, 170, 170, -90, 90], ['l', 560, B, 560, C]]],
  'Ю': [720, [['l', 0, B, 0, C], ['l', 0, 350, 160, 350], ['o', 440, 350, 280, 310]]],
  'б': [420, [['o', 210, 250, 210, 210], ['l', 0, 250, 0, 560], ['a', 140, 560, 140, 140, 90, 180], ['l', 140, AS, 400, AS]]],
  'в': [340, [['l', 0, B, 0, X], ['l', 0, X, 200, X], ['a', 200, 355, 105, 105, -90, 90], ['l', 0, 250, 220, 250], ['l', 0, B, 220, B], ['a', 220, 145, 120, 105, -90, 90]]],
  'д': [460, [['l', 100, X, 400, X], ['l', 400, X, 400, B], ['l', 100, X, 40, B], ['l', 0, B, 460, B], ['l', 0, B, 0, -100], ['l', 460, B, 460, -100]]],
  'ж': [560, [['l', 280, B, 280, X], ['l', 280, 250, 20, X], ['l', 280, 250, 540, X], ['l', 280, 250, 0, B], ['l', 280, 250, 560, B]]],
  'й': [400, [['l', 0, X, 0, B], ['l', 0, B, 400, X], ['l', 400, X, 400, B], ['a', 200, 600, 100, 60, 200, 340]]],
  'м': [520, [['l', 0, B, 0, X], ['l', 0, X, 260, 140], ['l', 260, 140, 520, X], ['l', 520, X, 520, B]]],
  'ф': [560, [['l', 280, DS, 280, AS], ['o', 280, 250, 280, 210]]],
  'ц': [460, [['l', 0, B, 0, X], ['l', 400, B, 400, X], ['l', 0, B, 460, B], ['l', 460, B, 460, -100]]],
  'щ': [660, [['l', 0, B, 0, X], ['l', 300, B, 300, X], ['l', 600, B, 600, X], ['l', 0, B, 660, B], ['l', 660, B, 660, -100]]],
  'ь': [340, [['l', 0, B, 0, X], ['l', 0, 250, 200, 250], ['l', 0, B, 200, B], ['a', 200, 145, 140, 105, -90, 90]]],
  'ъ': [440, [['l', 0, X, 100, X], ['l', 100, B, 100, X], ['l', 100, 250, 300, 250], ['l', 100, B, 300, B], ['a', 300, 145, 140, 105, -90, 90]]],
  'ы': [520, [['l', 0, B, 0, X], ['l', 0, 250, 180, 250], ['l', 0, B, 180, B], ['a', 180, 145, 140, 105, -90, 90], ['l', 520, B, 520, X]]],
  'э': [410, [['a', 200, 250, 210, 210, -140, 140], ['l', 120, 250, 410, 250]]],
  'ю': [620, [['l', 0, B, 0, X], ['l', 0, 250, 180, 250], ['o', 400, 250, 220, 210]]],
  'я': [380, [['l', 380, B, 380, X], ['l', 380, X, 170, X], ['a', 170, 355, 130, 105, 90, 270], ['l', 170, 250, 380, 250], ['l', 210, 250, 0, B]]],
  '`': [70, [['l', 70, 560, 0, 650]]],
  '´': [70, [['l', 0, 560, 70, 650]]],
  'ˆ': [180, [['l', 0, 560, 90, 650], ['l', 90, 650, 180, 560]]],
  'ˇ': [180, [['l', 0, 650, 90, 560], ['l', 90, 560, 180, 650]]],
  '˜': [200, [['a', 50, 600, 50, 35, 0, 180], ['a', 150, 600, 50, 35, 180, 360]]],
  '¨': [150, [['d', 0, 600], ['d', 150, 600]]],
  '˚': [120, [['o', 60, 620, 60, 55]]],
  '˘': [180, [['a', 90, 650, 90, 70, 180, 360]]],
  '˙': [0, [['d', 0, 600]]],
  '¸': [90, [['l', 40, 30, 40, -40], ['a', 40, -85, 50, 45, -90, 90], ['l', 40, -130, 0, -130]]],
  'ı': [0, [['l', 0, B, 0, X]]],
  'п': [400, [['l', 0, B, 0, X], ['l', 0, X, 400, X], ['l', 400, X, 400, B]]],
  'и': [400, [['l', 0, X, 0, B], ['l', 0, B, 400, X], ['l', 400, X, 400, B]]],
  'н': [400, [['l', 0, B, 0, X], ['l', 400, B, 400, X], ['l', 0, 250, 400, 250]]],
  'т': [400, [['l', 0, X, 400, X], ['l', 200, X, 200, B]]],
  'г': [300, [['l', 0, B, 0, X], ['l', 0, X, 300, X]]],
  'к': [360, [['l', 0, B, 0, X], ['l', 0, 200, 340, X], ['l', 110, 284, 360, B]]],
  'ш': [600, [['l', 0, B, 0, X], ['l', 300, B, 300, X], ['l', 600, B, 600, X], ['l', 0, B, 600, B]]],
  'л': [400, [['l', 0, B, 150, X], ['l', 150, X, 400, X], ['l', 400, X, 400, B]]],
  'ч': [380, [['l', 0, X, 0, 320], ['a', 180, 320, 180, 90, 180, 360], ['l', 380, X, 380, B]]],
};
const ALIAS = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'З': '3', 'з': '3s', 'Я': '~R', 'Ё': null };

function strokeEnds(s) {
  if (s[0] === 'l') return [[s[1], s[2]], [s[3], s[4]]];
  if (s[0] === 'a') { const [, cx, cy, rx, ry, a0, a1] = s, r = Math.PI / 180; return [[cx + rx * Math.cos(a0 * r), cy + ry * Math.sin(a0 * r)], [cx + rx * Math.cos(a1 * r), cy + ry * Math.sin(a1 * r)]]; }
  return [];
}
function coveredBy(p, s, r) {
  if (s[0] === 'l') {
    const a = [s[1], s[2]], b = [s[3], s[4]], ab = sub(b, a), L = Math.hypot(ab[0], ab[1]); if (L < 1) return false;
    const t = dot(sub(p, a), ab) / (L * L); if (t * L < r - 0.5 || (1 - t) * L < r - 0.5) return false;
    return dist(p, add(a, mul(ab, t))) < 0.8;
  }
  if (s[0] === 'a' || s[0] === 'o') {
    const [, cx, cy, rx, ry] = s; const th = Math.atan2((p[1] - cy) / ry, (p[0] - cx) / rx);
    if (dist(p, [cx + rx * Math.cos(th), cy + ry * Math.sin(th)]) > 0.8) return false;
    if (s[0] === 'o') return true;
    let d = th * 180 / Math.PI; const a0 = s[5], a1 = s[6], m = (r / Math.min(rx, ry)) * 180 / Math.PI;
    while (d < a0) d += 360; while (d > a1 + 360) d -= 360;
    return d >= a0 + m && d <= a1 - m;
  }
  return false;
}
function skeletonPolys(strokes, r) {
  const polys = [], ends = [];
  for (const s of strokes) {
    if (s[0] === 'l') { const [, x1, y1, x2, y2] = s, L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L * r, ny = (x2 - x1) / L * r; polys.push([[N(x1 - nx, y1 - ny), N(x2 - nx, y2 - ny), N(x2 + nx, y2 + ny), N(x1 + nx, y1 + ny)]]); }
    else if (s[0] === 'a') { const [, cx, cy, rx, ry, a0, a1] = s; polys.push([arcNodes(cx, cy, rx + r, ry + r, a0, a1).concat(reverseC(arcNodes(cx, cy, rx - r, ry - r, a0, a1)))]); }
    else if (s[0] === 'o') { const [, cx, cy, rx, ry] = s; polys.push([ellipseC(cx, cy, rx + r, ry + r), reverseC(ellipseC(cx, cy, rx - r, ry - r))]); }
    else if (s[0] === 'd') polys.push([ellipseC(s[1], s[2], r * 1.15, r * 1.15)]);
    for (const e of strokeEnds(s)) ends.push(e);
  }
  const capped = [];
  for (const e of ends) {
    if (capped.some(c => dist(c, e) < 1)) continue;
    if (strokes.some(s => coveredBy(e, s, r))) continue;
    capped.push(e); polys.push([ellipseC(e[0], e[1], r, r)]);
  }
  return polys;
}
function shiftStroke(s, dx) {
  const t = s.slice();
  if (t[0] === 'l') { t[1] += dx; t[3] += dx; } else if (t[0] === 'a' || t[0] === 'o' || t[0] === 'd') t[1] += dx;
  return t;
}
function mirrorStroke(s, w) {
  const t = s.slice();
  if (t[0] === 'l') { t[1] = w - t[1]; t[3] = w - t[3]; }
  else if (t[0] === 'a') { t[1] = w - t[1]; const a0 = 180 - t[6], a1 = 180 - t[5]; t[5] = a0; t[6] = a1; }
  else if (t[0] === 'o' || t[0] === 'd') t[1] = w - t[1];
  return t;
}
function skeletonGlyph(ch, merge) {
  let def = SK[ch];
  if (!def && ALIAS[ch] !== undefined) {
    const al = ALIAS[ch]; if (!al) return null;
    if (al[0] === '~') { const d = SK[al.slice(1)]; def = [d[0], d[1].map(s => mirrorStroke(s, d[0]))]; }
    else if (al === '3s') { def = [360, [['a', 170, 355, 160, 105, -90, 150], ['a', 180, 145, 180, 105, -150, 90]]]; }
    else def = SK[al];
  }
  if (!def) return null;
  const off = SB + R, strokes = def[1].map(s => shiftStroke(s, off));
  const polys = skeletonPolys(strokes, R);
  let contours;
  if (merge && PC) {
    try { const rings = polys.map(p => p.map(c => { const q = flatten(c, 5); q.push(q[0]); return q; })); contours = fromMulti(PC.union(...rings)); }
    catch (e) { contours = null; }
  }
  if (!contours) contours = polys.flat().map(c => roundC(cloneC(c)));
  return { adv: def[0] + 2 * off, contours };
}

/* ---------- glyph set ---------- */
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(String.fromCodePoint(i)); return r; };
const SETS = {
  upper: range(65, 90), lower: range(97, 122), digits: range(48, 57),
  punct: ' .,:;!?-–—\'"()/&@#%+=*_×«»№'.split(''),
  cyrU: range(0x410, 0x42F).concat(['Ё']), cyrL: range(0x430, 0x44F).concat(['ё']),
  marks: ['ı', '`', '´', 'ˆ', '˜', '¨', '˚', 'ˇ', '˘', '˙', '¸']
};
const PS_NAMES = { ' ': 'space', '.': 'period', ',': 'comma', ':': 'colon', ';': 'semicolon', '!': 'exclam', '?': 'question', '-': 'hyphen', '–': 'endash', '—': 'emdash', "'": 'quotesingle', '"': 'quotedbl', '(': 'parenleft', ')': 'parenright', '/': 'slash', '&': 'ampersand', '@': 'at', '#': 'numbersign', '%': 'percent', '+': 'plus', '=': 'equal', '*': 'asterisk', '_': 'underscore', '×': 'multiply', '«': 'guillemotleft', '»': 'guillemotright', '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine' };
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ə: 'e', ğ: 'g', ı: 'i', ş: 's', ç: 'c' };
function psName(family, style) {
  const tr = str => [...String(str || '')].map(c => { const lo = c.toLowerCase(), t = TRANSLIT[lo]; if (t === undefined) return c; return c === lo ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join('').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '');
  const f = tr(family) || 'KernageFont', st = tr(style) || 'Regular';
  return (f + '-' + st).slice(0, 63);
}
function isSpecial(k) { return typeof k === 'string' && (k.startsWith('liga:') || k.startsWith('alt:')); }
function specInfo(k) {
  if (k.startsWith('liga:')) return { kind: 'liga', seq: [...k.slice(5)] };
  if (k.startsWith('alt:')) { const i = k.lastIndexOf(':'); return { kind: 'alt', base: k.slice(4, i), feat: k.slice(i + 1) }; }
  return null;
}
function glyphName(ch) {
  if (isSpecial(ch)) { const s = specInfo(ch); return s.kind === 'liga' ? s.seq.map(c => glyphName(c)).join('_') : glyphName(s.base) + '.' + s.feat; }
  if (PS_NAMES[ch]) return PS_NAMES[ch];
  if (/^[A-Za-z]$/.test(ch)) return ch;
  const cp = ch.codePointAt(0); return (cp > 0xFFFF ? 'u' : 'uni') + cp.toString(16).toUpperCase().padStart(4, '0');
}
function newGlyph(ch, adv) { return { u: ch.codePointAt(0), name: glyphName(ch), adv: adv == null ? 500 : adv, contours: [] }; }
function sampleFont(merge) {
  const font = {
    info: { familyName: 'Orbita', styleName: 'Regular', designer: '', version: '1.000', description: 'Образец, созданный в Kernage', upm: 1000, ascender: 760, descender: -230, capHeight: 700, xHeight: 500, lineGap: 0 },
    glyphs: {}, order: [], kerning: {}, sampleVersion: 3
  };
  const all = [].concat(SETS.upper, SETS.lower, SETS.digits, SETS.punct, SETS.cyrU, SETS.cyrL, SETS.marks);
  for (const ch of all) {
    const g = newGlyph(ch, ch === ' ' ? 260 : 560);
    const sk = skeletonGlyph(ch, merge);
    if (sk) { g.adv = sk.adv; g.contours = sk.contours; }
    font.glyphs[ch] = g; font.order.push(ch);
  }
  // copy Ё/ё from Е/е + dots
  for (const [d, s, y] of [['Ё', 'Е', 800], ['ё', 'е', 620]]) {
    const src = font.glyphs[s]; if (!src.contours.length) continue;
    const g = font.glyphs[d]; g.adv = src.adv; g.contours = src.contours.map(cloneC);
    const bb = bounds(src.contours), cx = (bb.x0 + bb.x1) / 2;
    g.contours.push(roundC(ellipseC(cx - 90, y, 44, 44)), roundC(ellipseC(cx + 90, y, 44, 44)));
  }
  if (merge) { const chs = font.order.filter(c => c !== ' '); applySpacing(font, autoSpace(font, chs, { sb: SB, depth: 110, strength: 0.75, min: 12 })); font.kerning = autoKern(font, [].concat(SETS.upper, SETS.lower, SETS.digits, SETS.cyrU, SETS.cyrL, ['.', ',']), { strength: 0.6, depth: 110, minDist: 40, threshold: 20 }); }
  return font;
}
function emptyFont() {
  const f = sampleFont(false);
  f.info.familyName = 'Новый шрифт'; f.info.description = '';
  for (const k of f.order) { f.glyphs[k].contours = []; f.glyphs[k].adv = k === ' ' ? 260 : 560; }
  f.kerning = {};
  return f;
}

/* ---------- autokern ---------- */
function profile(g, ymin, ymax, step) {
  const rings = g.contours.map(c => flatten(c, 8)).filter(r => r.length > 2), n = Math.ceil((ymax - ymin) / step);
  const L = new Float32Array(n).fill(NaN), Rr = new Float32Array(n).fill(NaN); let bot = -1, top = -1, xmin = Infinity, xmax = -Infinity;
  for (let b = 0; b < n; b++) {
    const y = ymin + (b + 0.5) * step; let lo = Infinity, hi = -Infinity;
    for (const r of rings) for (let i = 0, m = r.length; i < m; i++) {
      const p = r[i], q = r[(i + 1) % m];
      if ((p[1] > y) !== (q[1] > y)) { const x = p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]); if (x < lo) lo = x; if (x > hi) hi = x; }
    }
    if (isFinite(lo)) { L[b] = lo; Rr[b] = hi; if (bot < 0) bot = b; top = b; if (lo < xmin) xmin = lo; if (hi > xmax) xmax = hi; }
  }
  return { L, R: Rr, bot, top, xmin, xmax };
}
function pairStats(gl, pl, gr, pr, D) {
  const b0 = Math.max(pl.bot, pr.bot), b1 = Math.min(pl.top, pr.top);
  if (pl.bot < 0 || pr.bot < 0 || b1 < b0) return null;
  const sb = (gl.adv - pl.xmax) + pr.xmin;
  let sum = 0, cnt = 0, minGap = Infinity;
  for (let b = b0; b <= b1; b++) {
    const hl = !isNaN(pl.R[b]), hr = !isNaN(pr.L[b]);
    const il = hl ? pl.xmax - pl.R[b] : D, ir = hr ? pr.L[b] - pr.xmin : D;
    if (hl && hr) { const g = sb + il + ir; if (g < minGap) minGap = g; }
    sum += sb + Math.min(il, D) + Math.min(ir, D); cnt++;
  }
  return { mean: sum / cnt, minGap };
}
function autoSpace(font, chars, opt) {
  const I = font.info, step = 10, ymin = I.descender - 40, ymax = I.ascender + 60, out = {};
  for (const ch of chars) {
    const g = font.glyphs[ch]; if (!g || !g.contours.length) continue;
    const p = profile(g, ymin, ymax, step); if (p.bot < 0) continue;
    const top = isUpperish(ch) ? I.capHeight : I.xHeight;
    const b0 = Math.max(p.bot, Math.floor((0 - ymin) / step)), b1 = Math.min(p.top, Math.floor((top - ymin) / step) - 1);
    let sl = 0, sr = 0, n = 0;
    for (let b = b0; b <= b1; b++) { n++; sl += isNaN(p.L[b]) ? opt.depth : Math.min(p.L[b] - p.xmin, opt.depth); sr += isNaN(p.R[b]) ? opt.depth : Math.min(p.xmax - p.R[b], opt.depth); }
    if (!n) continue;
    const lsb = Math.max(opt.min, Math.round(opt.sb - (sl / n) * opt.strength)), rsb = Math.max(opt.min, Math.round(opt.sb - (sr / n) * opt.strength));
    out[ch] = { lsb, rsb, dx: lsb - p.xmin, adv: Math.round(lsb + (p.xmax - p.xmin) + rsb) };
  }
  return out;
}
function applySpacing(font, sp) {
  for (const ch in sp) { const g = font.glyphs[ch], s = sp[ch]; translate(g.contours, s.dx, 0); g.adv = s.adv; }
}
function translate(contours, dx, dy) { for (const c of contours) for (const n of c) { n.x += dx; n.y += dy; if (n.i) { n.i[0] += dx; n.i[1] += dy; } if (n.o) { n.o[0] += dx; n.o[1] += dy; } } roundAll(contours); }
function roundAll(cs) { for (const c of cs) roundC(c); }
const isUpperish = ch => /[A-ZА-ЯЁ0-9]/.test(ch);
const isCyr = ch => /[Ѐ-ӿ]/.test(ch);
function autoKern(font, chars, opt) {
  const { ymin, ymax } = { ymin: font.info.descender - 40, ymax: font.info.ascender + 60 }, step = 10;
  const prof = {}, P = ch => prof[ch] || (prof[ch] = profile(font.glyphs[ch], ymin, ymax, step));
  const refCh = ch => { const cy = isCyr(ch); if (isUpperish(ch)) return (cy && font.glyphs['Н'] && font.glyphs['Н'].contours.length) ? 'Н' : 'H'; return (cy && font.glyphs['н'] && font.glyphs['н'].contours.length) ? 'н' : 'n'; };
  const refCache = {};
  const ref = (a, b) => {
    const k = a + b; if (refCache[k]) return refCache[k];
    const ga = font.glyphs[a], gb = font.glyphs[b]; if (!ga || !gb || !ga.contours.length || !gb.contours.length) return (refCache[k] = null);
    const s = pairStats(ga, P(a), gb, P(b), opt.depth); if (!s) return (refCache[k] = null);
    return (refCache[k] = { mean: s.mean });
  };
  const res = {};
  const list = chars.filter(c => font.glyphs[c] && font.glyphs[c].contours.length);
  for (const l of list) for (const r of list) {
    const rf = ref(refCh(l), refCh(r)); if (!rf) continue;
    const s = pairStats(font.glyphs[l], P(l), font.glyphs[r], P(r), opt.depth); if (!s) continue;
    let k = (rf.mean - s.mean) * opt.strength;
    if (isFinite(s.minGap) && s.minGap + k < opt.minDist) k = Math.max(k, opt.minDist - s.minGap);
    k = Math.round(k / 5) * 5;
    if (Math.abs(k) >= opt.threshold) res[l + '\t' + r] = k;
  }
  return res;
}

/* ---------- binary export ---------- */
function contoursToPath(contours) {
  const p = new opentype.Path();
  for (const c of contours) {
    if (c.length < 2) continue;
    p.moveTo(c[0].x, c[0].y);
    for (let i = 0; i < c.length; i++) { const s = segOf(c, i), e = s.b[3]; if (s.curve) p.curveTo(s.b[1][0], s.b[1][1], s.b[2][0], s.b[2][1], e[0], e[1]); else if (i < c.length - 1) p.lineTo(e[0], e[1]); }
    p.close();
  }
  return p;
}
function u16(a, v) { a.push((v >> 8) & 255, v & 255); }
function i16(a, v) { u16(a, v < 0 ? v + 65536 : v); }
function tag(a, s) { for (let i = 0; i < 4; i++) a.push(s.charCodeAt(i)); }
function makeGPOS(pairs) { // pairs: [[gl, gr, val]] glyph indices
  const byFirst = new Map();
  for (const [l, r, v] of pairs) { if (!byFirst.has(l)) byFirst.set(l, []); byFirst.get(l).push([r, v]); }
  const firsts = [...byFirst.keys()].sort((a, b) => a - b);
  // chunk into subtables under 60k
  const subs = []; let cur = [], size = 0;
  for (const f of firsts) { const sz = 2 + 4 * byFirst.get(f).length + 4; if (cur.length && size + sz > 58000) { subs.push(cur); cur = []; size = 0; } cur.push(f); size += sz; }
  if (cur.length) subs.push(cur);
  const subBytes = subs.map(fs => {
    const head = 10 + 2 * fs.length; const sets = fs.map(f => { const arr = []; const lst = byFirst.get(f).sort((a, b) => a[0] - b[0]); u16(arr, lst.length); for (const [r, v] of lst) { u16(arr, r); i16(arr, v); } return arr; });
    let off = head; const offs = sets.map(s => { const o = off; off += s.length; return o; });
    const cov = []; u16(cov, 1); u16(cov, fs.length); for (const f of fs) u16(cov, f);
    const a = []; u16(a, 1); u16(a, off); u16(a, 0x0004); u16(a, 0); u16(a, fs.length); for (const o of offs) u16(a, o);
    for (const s of sets) a.push(...s); a.push(...cov); return a;
  });
  // Lookup
  const lookup = []; u16(lookup, 2); u16(lookup, 0); u16(lookup, subBytes.length);
  let lo = 6 + 2 * subBytes.length; const lookOffs = subBytes.map(s => { const o = lo; lo += s.length; return o; });
  for (const o of lookOffs) u16(lookup, o); for (const s of subBytes) lookup.push(...s);
  const lookupList = []; u16(lookupList, 1); u16(lookupList, 4); lookupList.push(...lookup);
  const featureList = []; u16(featureList, 1); tag(featureList, 'kern'); u16(featureList, 8); u16(featureList, 0); u16(featureList, 1); u16(featureList, 0);
  const scripts = ['DFLT', 'cyrl', 'latn'];
  const scriptList = []; u16(scriptList, scripts.length);
  const recEnd = 2 + 6 * scripts.length;
  scripts.forEach((s, i) => { tag(scriptList, s); u16(scriptList, recEnd + i * 12); });
  for (let i = 0; i < scripts.length; i++) { u16(scriptList, 4); u16(scriptList, 0); u16(scriptList, 0); u16(scriptList, 0xFFFF); u16(scriptList, 1); u16(scriptList, 0); }
  const out = []; u16(out, 1); u16(out, 0); u16(out, 10); u16(out, 10 + scriptList.length); u16(out, 10 + scriptList.length + featureList.length);
  out.push(...scriptList, ...featureList, ...lookupList);
  return new Uint8Array(out);
}
function makeKern(pairs) {
  if (!pairs.length || pairs.length > 10900) return null;
  const ps = pairs.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const n = ps.length; let es = 0; while ((1 << (es + 1)) <= n) es++; const sr = (1 << es) * 6;
  const a = []; u16(a, 0); u16(a, 1); u16(a, 0); u16(a, 14 + 6 * n); u16(a, 1); u16(a, n); u16(a, sr); u16(a, es); u16(a, n * 6 - sr);
  for (const [l, r, v] of ps) { u16(a, l); u16(a, r); i16(a, v); }
  return new Uint8Array(a);
}
function sfntTables(buf) {
  const dv = new DataView(buf), num = dv.getUint16(4), t = [];
  for (let i = 0; i < num; i++) { const o = 12 + 16 * i; const tg = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); t.push({ tag: tg, data: new Uint8Array(buf, dv.getUint32(o + 8), dv.getUint32(o + 12)) }); }
  return { flavor: dv.getUint32(0), tables: t };
}
function checksum(bytes) { let s = 0; const n = bytes.length; for (let i = 0; i < n; i += 4) s = (s + ((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0))) >>> 0; return s; }
function buildSfnt(flavor, tables) {
  tables.sort((a, b) => a.tag < b.tag ? -1 : 1);
  const n = tables.length; let es = 0; while ((1 << (es + 1)) <= n) es++; const sr = (1 << es) * 16;
  let off = 12 + 16 * n; const offs = tables.map(t => { const o = off; off += (t.data.length + 3) & ~3; return o; });
  const out = new Uint8Array(off), dv = new DataView(out.buffer);
  dv.setUint32(0, flavor); dv.setUint16(4, n); dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, n * 16 - sr);
  let headOff = -1;
  tables.forEach((t, i) => {
    const data = new Uint8Array(t.data); if (t.tag === 'head') { new DataView(data.buffer, data.byteOffset).setUint32(8, 0); headOff = offs[i]; }
    out.set(data, offs[i]); const o = 12 + 16 * i;
    for (let k = 0; k < 4; k++) out[o + k] = t.tag.charCodeAt(k);
    dv.setUint32(o + 4, checksum(data)); dv.setUint32(o + 8, offs[i]); dv.setUint32(o + 12, data.length);
  });
  if (headOff >= 0) dv.setUint32(headOff + 8, (0xB1B0AFBA - checksum(out)) >>> 0);
  return out.buffer;
}
function buildFont(font, opts) {
  opts = opts || {};
  const I = font.info, keys = font.order.filter(k => font.glyphs[k]);
  const nd = new opentype.Path(); const w = Math.round(I.upm * 0.5), h = I.capHeight;
  nd.moveTo(50, 0); nd.lineTo(w - 50, 0); nd.lineTo(w - 50, h); nd.lineTo(50, h); nd.close(); nd.moveTo(100, 50); nd.lineTo(100, h - 50); nd.lineTo(w - 100, h - 50); nd.lineTo(w - 100, 50); nd.close();
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: w, path: nd })];
  const outlines = [{ adv: w, contours: [rectC(50, 0, w - 50, h), [N(100, 50), N(100, h - 50), N(w - 100, h - 50), N(w - 100, 50)]] }];
  const index = {}, used = new Set(['.notdef']), tr = opts.transform;
  for (const k of keys) {
    const g = font.glyphs[k]; const sp = isSpecial(k); if (!g.u && !sp) continue;
    if (!opts.includeEmpty && !g.contours.length && k !== ' ') continue;
    let nm = g.name || glyphName(k); if (used.has(nm)) nm = glyphName(k) + '.' + glyphs.length; used.add(nm);
    index[k] = glyphs.length;
    const t = tr ? tr(k, g) : g, adv = Math.max(0, Math.round(t.adv));
    outlines.push({ adv, contours: t.contours });
    glyphs.push(new opentype.Glyph({ name: nm, unicode: sp ? undefined : g.u, advanceWidth: adv, path: contoursToPath(t.contours) }));
  }
  const f = new opentype.Font({ familyName: I.familyName || 'Untitled', styleName: opts.styleName || I.styleName || 'Regular', postScriptName: psName(I.familyName, opts.styleName || I.styleName), weightClass: opts.weightClass || 400, fsSelection: opts.fsSelection, unitsPerEm: I.upm, ascender: I.ascender, descender: I.descender, designer: I.designer || ' ', version: 'Version ' + (I.version || '1.000'), description: I.description || ' ', glyphs, tables: { os2: { sTypoLineGap: I.lineGap || 0 } } });
  f.tables.os2 = f.tables.os2 || {};
  let buf = f.toArrayBuffer();
  const pairs = [];
  const KK = opts.kerning || font.kerning;
  for (const key in KK) { const [l, r] = key.split('\t'); const v = Math.round(KK[key]); if (v && index[l] != null && index[r] != null) pairs.push([index[l], index[r], v]); }
  const st = sfntTables(buf);
  // fix OS/2 x-height and cap height
  const os2 = st.tables.find(t => t.tag === 'OS/2');
  if (os2 && os2.data.length >= 90) { const d = new Uint8Array(os2.data); const dv = new DataView(d.buffer); dv.setInt16(86, I.xHeight); dv.setInt16(88, I.capHeight); dv.setUint16(74, Math.max(dv.getUint16(74), I.ascender, 1)); dv.setUint16(76, Math.max(dv.getUint16(76), -I.descender, 1)); os2.data = d; }
  if (opts.extraTables) for (const t of opts.extraTables(index) || []) { st.tables = st.tables.filter(x => x.tag !== t.tag); st.tables.push(t); }
  st.tables = st.tables.filter(t => !['GPOS', 'GSUB', 'GDEF', 'kern'].includes(t.tag));
  const lay = G.Litera.buildLayout(font, index, { kerning: KK, kerningRaw: opts.kerningRaw, kgroups: opts.kgroups });
  for (const t of ['GPOS', 'GSUB', 'GDEF']) if (lay[t]) st.tables.push({ tag: t, data: lay[t] });
  if (pairs.length) { const k = makeKern(pairs); if (k) st.tables.push({ tag: 'kern', data: k }); }
  return { buffer: buildSfnt(st.flavor, st.tables), glyphCount: glyphs.length, pairCount: pairs.length, outlines, index, caltErrors: lay.caltErrors };
}
async function toWOFF(buf) {
  const st = sfntTables(buf);
  const canZ = typeof CompressionStream !== 'undefined';
  const comp = async d => { if (!canZ) return d; const cs = new CompressionStream('deflate'); const b = await new Response(new Blob([d]).stream().pipeThrough(cs)).arrayBuffer(); const u = new Uint8Array(b); return u.length < d.length ? u : d; };
  const items = []; for (const t of st.tables) { const d = new Uint8Array(t.data); items.push({ tag: t.tag, orig: d, comp: await comp(d) }); }
  items.sort((a, b) => a.tag < b.tag ? -1 : 1);
  const n = items.length; let off = 44 + 20 * n; const offs = items.map(it => { const o = off; off += (it.comp.length + 3) & ~3; return o; });
  const out = new Uint8Array(off), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x774F4646); dv.setUint32(4, st.flavor); dv.setUint32(8, off); dv.setUint16(12, n); dv.setUint16(14, 0);
  dv.setUint32(16, buf.byteLength); dv.setUint16(20, 1); dv.setUint16(22, 0);
  items.forEach((it, i) => { const o = 44 + 20 * i; for (let k = 0; k < 4; k++) out[o + k] = it.tag.charCodeAt(k); dv.setUint32(o + 4, offs[i]); dv.setUint32(o + 8, it.comp.length); dv.setUint32(o + 12, it.orig.length); const tmp = new Uint8Array(it.orig); if (it.tag === 'head') new DataView(tmp.buffer).setUint32(8, new DataView(it.orig.buffer, it.orig.byteOffset).getUint32(8)); dv.setUint32(o + 16, checksum(it.tag === 'head' ? (() => { const c = new Uint8Array(it.orig); new DataView(c.buffer).setUint32(8, 0); return c; })() : it.orig)); out.set(it.comp, offs[i]); });
  return out.buffer;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) { // [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), d = f.data, crc = crc32(d), h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, 0, true); v.setUint16(12, 0x5A21, true);
    v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, nm.length, true); h.set(nm, 30);
    const c = new Uint8Array(46 + nm.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(14, 0x5A21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, d.length, true); cv.setUint32(24, d.length, true); cv.setUint16(28, nm.length, true); cv.setUint32(42, off, true); c.set(nm, 46);
    parts.push(h, d); central.push(c); off += h.length + d.length;
  }
  const cs = central.reduce((s, c) => s + c.length, 0), e = new Uint8Array(22), ev = new DataView(e.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, e], { type: 'application/zip' });
}

/* ---------- import ---------- */
function importOT(buffer) {
  const ot = opentype.parse(buffer);
  const upm = ot.unitsPerEm, k = 1000 / upm;
  const nm = ot.names || {}, pick = o => o ? (o.en || o[Object.keys(o)[0]] || '') : '';
  const os2 = ot.tables.os2 || {};
  const font = { info: { familyName: pick(nm.fontFamily) || 'Imported', styleName: pick(nm.fontSubfamily) || 'Regular', designer: pick(nm.designer).trim(), version: (pick(nm.version).match(/[\d.]+/) || ['1.000'])[0], description: pick(nm.description).trim(), upm: 1000, ascender: Math.round(ot.ascender * k), descender: Math.round(ot.descender * k), capHeight: Math.round((os2.sCapHeight || ot.ascender * 0.7) * k), xHeight: Math.round((os2.sxHeight || ot.ascender * 0.5) * k), lineGap: Math.round((os2.sTypoLineGap || 0) * k) }, glyphs: {}, order: [], kerning: {} };
  const byIndex = {};
  for (let i = 0; i < ot.glyphs.length; i++) {
    const g = ot.glyphs.get(i); if (g.unicode == null) continue;
    const ch = String.fromCodePoint(g.unicode); if (font.glyphs[ch]) continue;
    const contours = []; let cur = null, last = null;
    for (const c of g.path.commands) {
      if (c.type === 'M') { cur = [N(c.x * k, c.y * k)]; contours.push(cur); last = [c.x * k, c.y * k]; }
      else if (c.type === 'L') { cur.push(N(c.x * k, c.y * k)); last = [c.x * k, c.y * k]; }
      else if (c.type === 'C') { cur[cur.length - 1].o = [c.x1 * k, c.y1 * k]; const n = N(c.x * k, c.y * k); n.i = [c.x2 * k, c.y2 * k]; cur.push(n); last = [n.x, n.y]; }
      else if (c.type === 'Q') { const p0 = last, q = [c.x1 * k, c.y1 * k], p = [c.x * k, c.y * k]; cur[cur.length - 1].o = add(p0, mul(sub(q, p0), 2 / 3)); const n = N(p[0], p[1]); n.i = add(p, mul(sub(q, p), 2 / 3)); cur.push(n); last = p; }
      else if (c.type === 'Z' && cur && cur.length > 1) { const a = cur[0], b = cur[cur.length - 1]; if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) { a.i = b.i; cur.pop(); } }
    }
    const cs = contours.filter(c => c.length > 1).map(c => roundC(autoSmooth(c)));
    font.glyphs[ch] = { u: g.unicode, name: g.name || glyphName(ch), adv: Math.round(g.advanceWidth * k), contours: cs };
    font.order.push(ch); byIndex[i] = ch;
  }
  font.order.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  // kerning
  try {
    const idx = Object.keys(byIndex).map(Number);
    if (idx.length <= 400) for (const a of idx) for (const b of idx) { const v = ot.getKerningValue(a, b); if (v) font.kerning[byIndex[a] + '\t' + byIndex[b]] = Math.round(v * k); }
  } catch (e) { }
  Object.defineProperty(font, '__ot', { value: ot }); Object.defineProperty(font, '__byIndex', { value: byIndex }); Object.defineProperty(font, '__k', { value: k });
  return font;
}


/* ---------- TrueType (glyf) export ---------- */
function splitCub(b, t) { const lp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; const p01 = lp(b[0], b[1]), p12 = lp(b[1], b[2]), p23 = lp(b[2], b[3]), p012 = lp(p01, p12), p123 = lp(p12, p23), p = lp(p012, p123); return [[b[0], p01, p012, p], [p, p123, p23, b[3]]]; }
function cubicToQuads(b, tol) {
  const d = [b[0][0] - 3 * b[1][0] + 3 * b[2][0] - b[3][0], b[0][1] - 3 * b[1][1] + 3 * b[2][1] - b[3][1]];
  const err = Math.hypot(d[0], d[1]) * Math.sqrt(3) / 36, n = Math.max(1, Math.min(24, Math.ceil(Math.cbrt(err / tol))));
  const out = []; let rem = b;
  for (let j = 0; j < n; j++) { let pc; if (j < n - 1) { const sp = splitCub(rem, 1 / (n - j)); pc = sp[0]; rem = sp[1]; } else pc = rem; out.push([[(3 * (pc[1][0] + pc[2][0]) - pc[0][0] - pc[3][0]) / 4, (3 * (pc[1][1] + pc[2][1]) - pc[0][1] - pc[3][1]) / 4], pc[3]]); }
  return out;
}
function encodeGlyf(contours, zones) {
  const cts = [];
  for (const c0 of contours) {
    if (!c0 || c0.length < 2) continue; const c = reverseC(c0), pts = [];
    for (let i = 0; i < c.length; i++) { const s = segOf(c, i); pts.push([s.b[0][0], s.b[0][1], 1]); if (s.curve) { const qs = cubicToQuads(s.b, 0.4); qs.forEach((q, k) => { pts.push([q[0][0], q[0][1], 0]); if (k < qs.length - 1) pts.push([q[1][0], q[1][1], 1]); }); } }
    const r = []; for (const p of pts) { const q = [Math.round(p[0]), Math.round(p[1]), p[2]]; const l = r[r.length - 1]; if (l && l[0] === q[0] && l[1] === q[1] && l[2] === q[2]) continue; r.push(q); }
    if (r.length > 1) cts.push(r);
  }
  if (!cts.length) return { bytes: new Uint8Array(0), xMin: 0, yMin: 0, xMax: 0, yMax: 0, np: 0, nc: 0 };
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity, np = 0;
  for (const c of cts) for (const p of c) { xMin = Math.min(xMin, p[0]); yMin = Math.min(yMin, p[1]); xMax = Math.max(xMax, p[0]); yMax = Math.max(yMax, p[1]); np++; }
  const ins = zones ? G.Litera.hintInstr(cts.flat(), zones) : [];
  const a = []; i16(a, cts.length); i16(a, xMin); i16(a, yMin); i16(a, xMax); i16(a, yMax);
  let e = -1; for (const c of cts) { e += c.length; u16(a, e); } u16(a, ins.length); for (const b of ins) a.push(b);
  for (const c of cts) for (const p of c) a.push(p[2] ? 1 : 0);
  let px = 0; for (const c of cts) for (const p of c) { i16(a, p[0] - px); px = p[0]; }
  let py = 0; for (const c of cts) for (const p of c) { i16(a, p[1] - py); py = p[1]; }
  while (a.length % 4) a.push(0);
  return { bytes: new Uint8Array(a), xMin, yMin, xMax, yMax, np, nc: cts.length, ni: ins.length };
}
function buildTTF(font, opts) {
  const zones = opts && opts.hint ? G.Litera.hintZones(font.info) : null, r = buildFont(font, opts), st = sfntTables(r.buffer), enc = r.outlines.map(o => encodeGlyf(o.contours, zones)), n = enc.length;
  const total = enc.reduce((s, e) => s + e.bytes.length, 0), glyf = new Uint8Array(total || 4), loca = new Uint8Array(4 * (n + 1)), lv = new DataView(loca.buffer);
  let off = 0; enc.forEach((e, i) => { lv.setUint32(4 * i, off); glyf.set(e.bytes, off); off += e.bytes.length; }); lv.setUint32(4 * n, off);
  const maxp = new Uint8Array(32), mv = new DataView(maxp.buffer);
  mv.setUint32(0, 0x00010000); mv.setUint16(4, n); mv.setUint16(6, Math.max(0, ...enc.map(e => e.np))); mv.setUint16(8, Math.max(0, ...enc.map(e => e.nc))); mv.setUint16(14, 2);
  if (zones) { mv.setUint16(24, 16); mv.setUint16(26, Math.max(0, ...enc.map(e => e.ni || 0))); }
  const hmtx = new Uint8Array(4 * n), hv = new DataView(hmtx.buffer); r.outlines.forEach((o, i) => { hv.setUint16(4 * i, Math.max(0, Math.min(65535, Math.round(o.adv)))); hv.setInt16(4 * i + 2, enc[i].xMin); });
  const ne = enc.filter(e => e.nc);
  const T = {}; for (const t of st.tables) T[t.tag] = t;
  const head = new Uint8Array(T.head.data), hd = new DataView(head.buffer);
  if (ne.length) { hd.setInt16(36, Math.min(...ne.map(e => e.xMin))); hd.setInt16(38, Math.min(...ne.map(e => e.yMin))); hd.setInt16(40, Math.max(...ne.map(e => e.xMax))); hd.setInt16(42, Math.max(...ne.map(e => e.yMax))); }
  hd.setInt16(50, 1); hd.setInt16(52, 0); if (zones) hd.setUint16(16, hd.getUint16(16) | 0x0008);
  const hhea = new Uint8Array(T.hhea.data), hh = new DataView(hhea.buffer); hh.setUint16(34, n);
  if (ne.length) { hh.setInt16(12, Math.min(...ne.map(e => e.xMin))); }
  const tables = st.tables.filter(t => !['CFF ', 'maxp', 'head', 'hmtx', 'hhea'].includes(t.tag));
  tables.push({ tag: 'glyf', data: glyf }, { tag: 'loca', data: loca }, { tag: 'maxp', data: maxp }, { tag: 'head', data: head }, { tag: 'hmtx', data: hmtx }, { tag: 'hhea', data: hhea });
  if (zones) for (const t of G.Litera.hintTables(font.info)) tables.push(t);
  return { buffer: buildSfnt(0x00010000, tables), glyphCount: n, pairCount: r.pairCount };
}
function svgEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function buildSVGFont(font, opts, pathD) {
  opts = opts || {}; const I = font.info, tr = opts.transform, id = (I.familyName || 'font').replace(/[^A-Za-z0-9_-]/g, '') || 'font';
  let s = `<?xml version="1.0" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg">\n<defs>\n<font id="${id}" horiz-adv-x="${Math.round(I.upm / 2)}">\n<font-face font-family="${svgEsc(I.familyName)}" font-style="normal" font-weight="400" units-per-em="${I.upm}" ascent="${I.ascender}" descent="${I.descender}" cap-height="${I.capHeight}" x-height="${I.xHeight}"/>\n<missing-glyph horiz-adv-x="${Math.round(I.upm / 2)}"/>\n`;
  const have = new Set();
  for (const k of font.order) { const g = font.glyphs[k]; if (!g || (!g.contours.length && k !== ' ')) continue; const si = isSpecial(k) ? specInfo(k) : null; if (si && si.kind !== 'liga') continue; const t = tr ? tr(k, g) : g; have.add(k); s += `<glyph unicode="${svgEsc(si ? si.seq.join('') : k)}" glyph-name="${svgEsc(g.name)}" horiz-adv-x="${Math.round(t.adv)}"${t.contours.length ? ` d="${pathD(t.contours)}"` : ''}/>\n`; }
  const KK = opts.kerning || font.kerning;
  for (const key in KK) { const [l, r] = key.split('\t'); if (have.has(l) && have.has(r) && Math.round(KK[key])) s += `<hkern u1="${svgEsc(l)}" u2="${svgEsc(r)}" k="${-Math.round(KK[key])}"/>\n`; }
  return s + '</font>\n</defs>\n</svg>\n';
}

G.Litera = { psName, isSpecial, specInfo, profile, toPolys, fromMulti, buildTTF, buildSVGFont, encodeGlyf, autoSpace, applySpacing, translate, sub, add, mul, dot, dist, unit, bez, N, cloneC, reverseC, segOf, flatten, ringArea, contourArea, pointInRing, bounds, autoSmooth, roundC, correctDirections, arcNodes, ellipseC, rectC, booleanOp, fitRing, sampleFont, emptyFont, newGlyph, glyphName, SETS, isUpperish, isCyr, autoKern, buildFont, toWOFF, makeZip, importOT, buildSfntPub: buildSfnt, sfntTables };
})(typeof window !== 'undefined' ? window : globalThis);
