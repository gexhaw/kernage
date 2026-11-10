/* ===== LITERA FX: destructive effect engine ===== */
(function (G) {
'use strict';
const L = G.Litera, PC = G.polygonClipping, D2R = Math.PI / 180;
const TIERS = ['Мелкое хулиганство', 'Вандализм', 'Апокалипсис'];
// id, label, tier, min, max, step, default, unit, tip
const FX = [
  ['rotate', 'Поворот', 0, -180, 180, 1, 0, '°', 'Вращает каждый глиф вокруг центра'],
  ['slant', 'Наклон', 0, -60, 60, 1, 0, '°', 'Механический курсив'],
  ['sx', 'Растяжение X', 0, 0.2, 3, 0.01, 1, '×', 'Шире или уже вместе с шириной глифа'],
  ['sy', 'Растяжение Y', 0, 0.2, 3, 0.01, 1, '×', 'Выше или ниже от базовой линии'],
  ['tracking', 'Трекинг', 0, -300, 600, 1, 0, '', 'Расстояние между глифами'],
  ['weight', 'Вес', 0, -60, 140, 1, 0, '', 'Раздувает или истончает штрих'],
  ['twist', 'Закрутка', 1, -540, 540, 1, 0, '°', 'Центр поворачивается сильнее краёв'],
  ['pinch', 'Талия', 1, -1, 1, 0.01, 0, '', 'Сжимает или распирает середину по высоте'],
  ['bulge', 'Линза', 1, -1, 1, 0.01, 0, '', 'Выпуклая или вогнутая линза'],
  ['pull', 'Магнит', 1, -1, 1, 0.01, 0, '', 'Тянет середину глифа вверх или вниз'],
  ['perspective', 'Перспектива', 1, -1, 1, 0.01, 0, '', 'Сужает верх или низ'],
  ['wave', 'Волна', 1, 0, 1, 0.01, 0, '', 'Синусоида по горизонтали'],
  ['ripple', 'Рябь', 1, 0, 1, 0.01, 0, '', 'Круги на воде от центра'],
  ['refraction', 'Рифлёное стекло', 1, 0, 1, 0.01, 0, '', 'Вертикальные полосы преломления'],
  ['noise', 'Шум', 1, 0, 1, 0.01, 0, '', 'Плавный случайный сдвиг точек'],
  ['jitter', 'Дрожь', 1, 0, 1, 0.01, 0, '', 'Резкий случайный сдвиг каждой точки'],
  ['sharpen', 'Заострение', 1, -1, 1, 0.01, 0, '', 'Укорачивает ручки кривых; минус скругляет'],
  ['smooth', 'Сглаживание', 1, 0, 1, 0.01, 0, '', 'Превращает углы в плавные кривые'],
  ['flip', 'Переворот', 1, 0, 1, 0.01, 0, '', 'Зеркалит глиф по ширине'],
  ['crush', 'Пресс', 1, 0, 1, 0.01, 0, '', 'Сплющивает верх и низ'],
  ['wind', 'Ветер', 1, -1, 1, 0.01, 0, '', 'Сдувает верх глифа в сторону'],
  ['curl', 'Изгиб', 1, -180, 180, 1, 0, '°', 'Гнёт глиф по дуге'],
  ['melt', 'Плавление', 1, 0, 1, 0.01, 0, '', 'Низ глифа стекает каплями'],
  ['outline', 'Обводка', 2, 0, 1, 0.01, 0, '', 'Оставляет только контур'],
  ['echo', 'Эхо', 2, 0, 1, 0.01, 0, '', 'Повторяет форму со сдвигом, как объём'],
  ['slice', 'Нарезка', 2, 0, 1, 0.01, 0, '', 'Режет на полосы и сдвигает их'],
  ['shatter', 'Осколки', 2, 0, 1, 0.01, 0, '', 'Раскалывает глиф случайными разрезами'],
  ['cheese', 'Сыр', 2, 0, 1, 0.01, 0, '', 'Дырки разного размера'],
  ['grid', 'Решётка', 2, 0, 1, 0.01, 0, '', 'Прорезает сетку, как трафарет'],
  ['stripes', 'Полосы', 2, 0, 1, 0.01, 0, '', 'Горизонтальные прорези'],
  ['spikes', 'Шипы', 2, 0, 1, 0.01, 0, '', 'Колючки по всему контуру'],
  ['poly', 'Полигоны', 2, 0, 1, 0.01, 0, '', 'Грубые прямые грани вместо кривых'],
  ['pixel', 'Пиксели', 2, 0, 1, 0.01, 0, '', 'Растр из квадратов'],
  ['halftone', 'Растр точками', 2, 0, 1, 0.01, 0, '', 'Полутон из кружков разного размера'],
];
const DEF = {}; FX.forEach(f => DEF[f[0]] = f[6]);
const defaults = () => Object.assign({}, DEF);
const isActive = P => FX.some(f => Math.abs((P[f[0]] ?? f[6]) - f[6]) > 1e-9);
const PRESETS = {
  'Глитч': { slice: .55, refraction: .35, jitter: .08 },
  'Плавленый сыр': { melt: .8, cheese: .35, weight: 14 },
  'Шторм': { wind: .55, noise: .5, wave: .25 },
  'Тюрьма': { grid: .5, weight: 28 },
  'Пиксель-арт': { pixel: .42 },
  'Газета': { halftone: .45, weight: 20 },
  'Колючка': { spikes: .5, poly: .15 },
  'Объём': { echo: .65, slant: 10 },
  'Кислота': { twist: 140, bulge: .45, ripple: .35 },
  'Кракелюр': { shatter: .55, rotate: 3 },
  'Неон': { outline: .35, smooth: .6, weight: 10 },
  'Ржавчина': { noise: .35, jitter: .12, cheese: .2, sharpen: .4 },
};

/* ---------- random & noise ---------- */
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- contour helpers ---------- */
function mapC(cs, f) { return cs.map(c => c.map(n => { const p = f([n.x, n.y]); return { x: p[0], y: p[1], i: n.i ? f(n.i) : null, o: n.o ? f(n.o) : null, s: n.s }; })); }
function splitC(b, t) { const lp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; const p01 = lp(b[0], b[1]), p12 = lp(b[1], b[2]), p23 = lp(b[2], b[3]), p012 = lp(p01, p12), p123 = lp(p12, p23), p = lp(p012, p123); return [[b[0], p01, p012, p], [p, p123, p23, b[3]]]; }
function densify(cs, maxLen) {
  return cs.map(c => {
    const n = c.length; if (n < 2) return L.cloneC(c);
    const nodes = []; let pend = null;
    for (let i = 0; i < n; i++) {
      const s = L.segOf(c, i); let b;
      if (s.curve) b = s.b.map(p => [p[0], p[1]]);
      else { const p0 = s.b[0], p3 = s.b[3]; b = [p0, [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3], [p0[0] + 2 * (p3[0] - p0[0]) / 3, p0[1] + 2 * (p3[1] - p0[1]) / 3], p3]; }
      const len = L.dist(b[0], b[1]) + L.dist(b[1], b[2]) + L.dist(b[2], b[3]);
      const k = Math.max(1, Math.min(48, Math.ceil(len / maxLen)));
      let rem = b; const pieces = [];
      for (let j = 0; j < k - 1; j++) { const sp = splitC(rem, 1 / (k - j)); pieces.push(sp[0]); rem = sp[1]; }
      pieces.push(rem);
      pieces.forEach((pc, j) => { nodes.push({ x: pc[0][0], y: pc[0][1], i: pend, o: pc[1], s: j > 0 ? true : c[i].s }); pend = pc[2]; });
    }
    nodes[0].i = pend; return nodes;
  });
}
function offsetC(cs, d) {
  const src = L.correctDirections(densify(cs, 70));
  return src.map(c => {
    const n = c.length;
    return c.map((nd, k) => {
      const pv = c[(k - 1 + n) % n], nx = c[(k + 1) % n];
      let ti = L.sub([nd.x, nd.y], nd.i || [pv.x, pv.y]), to = L.sub(nd.o || [nx.x, nx.y], [nd.x, nd.y]);
      if (Math.hypot(ti[0], ti[1]) < 1e-6) ti = L.sub([nd.x, nd.y], [pv.x, pv.y]);
      if (Math.hypot(to[0], to[1]) < 1e-6) to = L.sub([nx.x, nx.y], [nd.x, nd.y]);
      const ui = L.unit(ti), uo = L.unit(to); let bis = L.unit(L.add(ui, uo)); if (!isFinite(bis[0]) || Math.hypot(bis[0], bis[1]) < .5) bis = uo;
      const cosH = Math.max(0.35, L.dot(ui, bis)), m = d / cosH, nv = [bis[1] * m, -bis[0] * m];
      const mv = p => [p[0] + nv[0], p[1] + nv[1]];
      return { x: nd.x + nv[0], y: nd.y + nv[1], i: nd.i ? mv(nd.i) : null, o: nd.o ? mv(nd.o) : null, s: nd.s };
    });
  });
}
function translateMP(mp, dx, dy) { return mp.map(poly => poly.map(r => r.map(p => [p[0] + dx, p[1] + dy]))); }
function rectP(x0, y0, x1, y1) { return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]; }
function circleP(cx, cy, r, n) { n = n || 28; const ring = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } ring.push(ring[0]); return [ring]; }
const VMAX = 520;
function rdpOpen(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = l > 1e-6 ? Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / l : Math.hypot(pts[i][0] - A[0], pts[i][1] - A[1]); if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(ring, eps) {
  const pts = ring.slice(0, -1); if (pts.length < 8) return ring;
  let far = 0, fd = -1; for (let i = 1; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = rdpOpen(pts.slice(0, far + 1), eps), b = rdpOpen(pts.slice(far).concat([pts[0]]), eps), r = a.slice(0, -1).concat(b.slice(0, -1));
  r.push(r[0]); return r;
}
function polysOf(cs, budget) {
  let polys = L.toPolys(cs); const count = () => polys.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0); let eps = 0.6;
  while (count() > budget && eps < 6) {
    polys = polys.map(p => { const o = simplifyRing(p[0], eps); if (o.length < 4) return null; return [o].concat(p.slice(1).map(h => simplifyRing(h, eps)).filter(h => h.length >= 4)); }).filter(Boolean);
    eps *= 1.7;
  }
  const c = count();
  if (c > budget) {
    const k = Math.ceil(c / budget), dec = r => { const q = r.slice(0, -1).filter((_, i) => i % k === 0); q.push(q[0]); return q; };
    polys = polys.map(p => { const o = dec(p[0]); if (o.length < 4) return null; return [o].concat(p.slice(1).map(dec).filter(h => h.length >= 4)); }).filter(Boolean);
  }
  return polys;
}
function unionOf(cs, budget) { const p = polysOf(cs, budget || VMAX); return p.length ? PC.union(...p) : []; }
function mpStraight(mp) {
  const out = [];
  for (const poly of mp) for (const ring of poly) {
    let pts = ring.slice(0, -1);
    const q = []; for (let i = 0; i < pts.length; i++) { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-6 && L.dist(a, b) > 0.01) continue; q.push(b); }
    if (q.length > 2) out.push(q.map(p => L.N(Math.round(p[0]), Math.round(p[1]))));
  }
  return out;
}
function resample(ring, step) {
  const out = [], n = ring.length; if (n < 3) return ring;
  let acc = 0; out.push(ring[0]);
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]; let seg = L.dist(a, b), t0 = 0;
    while (acc + seg - t0 * seg >= step) { const need = step - acc; const t = t0 + need / seg; if (t > 1) break; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); t0 = t; acc = 0; }
    acc += seg * (1 - t0);
  }
  if (out.length > 2 && L.dist(out[0], out[out.length - 1]) < step * 0.4) out.pop();
  return out;
}
function winding(pt, rings) {
  let w = 0;
  for (const r of rings) for (let i = 0, n = r.length; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    if (a[1] <= pt[1]) { if (b[1] > pt[1] && (b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1]) > 0) w++; }
    else if (b[1] <= pt[1] && (b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1]) < 0) w--;
  }
  return w;
}

/* ---------- warps ---------- */
const NONLIN = ['twist', 'pinch', 'bulge', 'pull', 'perspective', 'wave', 'ripple', 'refraction', 'noise', 'wind', 'curl', 'crush', 'melt'];
function makeWarp(P, X) {
  const { cx, cy, EM, W, H, R, seed, ymin, ph } = X, f = [];
  if (P.slant) { const t = Math.tan(P.slant * D2R); f.push(p => [p[0] + (p[1] - cy) * t, p[1]]); }
  if (P.rotate) { const c = Math.cos(P.rotate * D2R), s = Math.sin(P.rotate * D2R); f.push(p => { const x = p[0] - cx, y = p[1] - cy; return [cx + x * c - y * s, cy + x * s + y * c]; }); }
  if (P.flip) { const k = Math.cos(Math.PI * P.flip); f.push(p => [cx + (p[0] - cx) * k, p[1]]); }
  if (P.pinch) f.push(p => { const k = 1 - P.pinch * 0.85 * Math.exp(-Math.pow((p[1] - cy) / (EM * 0.3), 2)); return [cx + (p[0] - cx) * k, p[1]]; });
  if (P.bulge) f.push(p => { const x = p[0] - cx, y = p[1] - cy, r = Math.hypot(x, y), q = r / R; if (q >= 1) return p; const k = Math.max(0.05, 1 + P.bulge * 0.9 * (1 - q * q)); return [cx + x * k, cy + y * k]; });
  if (P.twist) f.push(p => { const x = p[0] - cx, y = p[1] - cy, q = Math.min(1, Math.hypot(x, y) / R), a = P.twist * D2R * Math.pow(1 - q, 1.6), c = Math.cos(a), s = Math.sin(a); return [cx + x * c - y * s, cy + x * s + y * c]; });
  if (P.pull) { const w = Math.max(W, EM * .3) * .32; f.push(p => [p[0], p[1] + P.pull * EM * 0.45 * Math.exp(-Math.pow((p[0] - cx) / w, 2)) * clamp(p[1] / EM, 0, 1.2)]); }
  if (P.perspective) f.push(p => [cx + (p[0] - cx) * Math.max(0.04, 1 + P.perspective * ((p[1] - cy) / EM) * 1.6), p[1]]);
  if (P.curl) { const a = P.curl * D2R, r0 = EM / a; f.push(p => { const u = p[0] - cx, phi = p[1] / r0; return [cx + r0 - (r0 - u) * Math.cos(phi), (r0 - u) * Math.sin(phi)]; }); }
  if (P.wave) f.push(p => [p[0], p[1] + P.wave * EM * 0.14 * Math.sin(2 * Math.PI * p[0] / (EM * 0.55) + ph)]);
  if (P.ripple) f.push(p => { const x = p[0] - cx, y = p[1] - cy, r = Math.hypot(x, y) || 1e-6, nr = r + P.ripple * EM * 0.05 * Math.sin(r / (EM * 0.045) - ph * 2); return [cx + x / r * nr, cy + y / r * nr]; });
  if (P.refraction) { const band = EM * 0.11; f.push(p => { const loc = ((p[0] % band) + band) % band - band / 2, idx = Math.floor(p[0] / band); return [p[0] - P.refraction * loc * 0.85, p[1] + P.refraction * EM * 0.05 * Math.sin(idx * 2.3 + ph)]; }); }
  if (P.noise) { const A = P.noise * EM * 0.09, sc = EM * 0.22; f.push(p => [p[0] + A * vnoise(p[0] / sc + ph * .3, p[1] / sc, seed), p[1] + A * vnoise(p[0] / sc, p[1] / sc + ph * .3, seed + 17)]); }
  if (P.wind) f.push(p => [p[0] + P.wind * EM * 0.55 * Math.pow(clamp(p[1] / EM, 0, 1.5), 2) + P.wind * EM * 0.05 * vnoise(p[1] / (EM * 0.05), ph, seed + 3), p[1]]);
  if (P.crush) { const lim = EM * 0.5 * (1 - P.crush * 0.85); f.push(p => [p[0], cy + lim * Math.tanh((p[1] - cy) / lim)]); }
  if (P.melt) f.push(p => { const d = Math.pow(Math.max(0, vnoise(p[0] / (EM * 0.07), 0.5, seed + 9) + 0.25), 1.6), k = Math.pow(clamp(1 - (p[1] - ymin) / (H * 0.65 || 1), 0, 1), 2); return [p[0], p[1] - P.melt * EM * 0.6 * d * k]; });
  return p => { for (const g of f) p = g(p); return p; };
}

/* ---------- process ---------- */
function process(g, P, info, seedIn, phase) {
  P = P || DEF; const EM = info.capHeight || 700, ph = phase || 0;
  let adv = Math.max(0, Math.round(g.adv * P.sx + P.tracking));
  let cs = (g.contours || []).filter(c => c.length > 1).map(L.cloneC);
  if (!cs.length) return { contours: [], adv };
  const seed = (Math.imul(seedIn | 0, 1000003) + (g.u || 0)) | 0, rnd = mulberry(seed);
  if (P.sx !== 1 || P.sy !== 1) cs = mapC(cs, p => [p[0] * P.sx, p[1] * P.sy]);
  if (P.weight) cs = offsetC(cs, P.weight);
  if (P.sharpen) { const k = 1 - P.sharpen; cs = cs.map(c => c.map(n => ({ x: n.x, y: n.y, s: n.s, i: n.i ? [n.x + (n.i[0] - n.x) * k, n.y + (n.i[1] - n.y) * k] : null, o: n.o ? [n.x + (n.o[0] - n.x) * k, n.y + (n.o[1] - n.y) * k] : null }))); }
  if (P.smooth) {
    const k = P.smooth;
    cs = cs.map(c => c.map((n, j) => {
      const pv = c[(j - 1 + c.length) % c.length], nx = c[(j + 1) % c.length], t = [(nx.x - pv.x) / 6, (nx.y - pv.y) / 6];
      const ti = [n.x - t[0], n.y - t[1]], to = [n.x + t[0], n.y + t[1]], ci = n.i || [n.x, n.y], co = n.o || [n.x, n.y];
      return { x: n.x, y: n.y, s: k > .5 || n.s, i: [ci[0] + (ti[0] - ci[0]) * k, ci[1] + (ti[1] - ci[1]) * k], o: [co[0] + (to[0] - co[0]) * k, co[1] + (to[1] - co[1]) * k] };
    }));
  }
  const bb = L.bounds(cs) || { x0: 0, y0: 0, x1: adv, y1: EM };
  const X = { cx: adv / 2, cy: EM / 2, EM, W: bb.x1 - bb.x0, H: bb.y1 - bb.y0, R: Math.max(adv, EM) * 0.62, seed, ymin: bb.y0, ph };
  if (NONLIN.some(k => P[k])) cs = densify(cs, (P.refraction || P.noise || P.ripple) ? 22 : 42);
  const w = makeWarp(P, X); cs = mapC(cs, w);
  if (P.jitter) { const A = P.jitter * EM * 0.06; cs = cs.map(c => c.map(n => { const dx = (rnd() * 2 - 1) * A, dy = (rnd() * 2 - 1) * A, m = p => p && [p[0] + dx + (rnd() * 2 - 1) * A * .4, p[1] + dy + (rnd() * 2 - 1) * A * .4]; return { x: n.x + dx, y: n.y + dy, i: m(n.i), o: m(n.o), s: n.s }; })); }
  // geometry
  if (PC) {
    const step = (name, fn) => { if (!P[name]) return; try { const r = fn(); if (r) cs = r; } catch (e) { } };
    step('outline', () => { const wd = EM * (0.012 + P.outline * 0.05); const A = unionOf(offsetC(cs, wd)), B = unionOf(offsetC(cs, -wd)); return L.fromMulti(B.length ? PC.difference(A, B) : A); });
    step('echo', () => { const n = 1 + Math.round(P.echo * 5), d = EM * 0.034, base = PC.union(...polysOf(cs, Math.max(160, Math.floor(1400 / (n + 1))))); const all = [base]; for (let i = 1; i <= n; i++) all.push(translateMP(base, i * d, -i * d)); return L.fromMulti(PC.union(...all)); });
    step('slice', () => { const U = unionOf(cs), b = L.bounds(cs), n = 7, h = (b.y1 - b.y0 + 20) / n, parts = []; for (let i = 0; i < n; i++) { const y0 = b.y0 - 10 + i * h, dx = (i % 2 ? 1 : -1) * P.slice * EM * 0.22 * (0.4 + rnd() * 0.6); const r = PC.intersection(U, rectP(b.x0 - 999, y0, b.x1 + 999, y0 + h)); parts.push(...translateMP(r, dx, 0)); } return L.fromMulti(parts); });
    step('shatter', () => {
      const b = L.bounds(cs); let pieces = [unionOf(cs)]; const K = 2 + Math.round(P.shatter * 6), gap = P.shatter * EM * 0.035, BIG = 5000;
      for (let k = 0; k < K; k++) {
        const a = rnd() * Math.PI, px = b.x0 + rnd() * (b.x1 - b.x0), py = b.y0 + rnd() * (b.y1 - b.y0), dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        const hp = sgn => [[[px - dx * BIG, py - dy * BIG], [px + dx * BIG, py + dy * BIG], [px + dx * BIG + nx * BIG * sgn, py + dy * BIG + ny * BIG * sgn], [px - dx * BIG + nx * BIG * sgn, py - dy * BIG + ny * BIG * sgn], [px - dx * BIG, py - dy * BIG]]];
        const next = [];
        for (const pc of pieces) { const A = PC.intersection(pc, hp(1)), B = PC.intersection(pc, hp(-1)); if (A.length) next.push(translateMP(A, nx * gap, ny * gap)); if (B.length) next.push(translateMP(B, -nx * gap, -ny * gap)); }
        pieces = next;
      }
      return L.fromMulti([].concat(...pieces));
    });
    step('cheese', () => { const b = L.bounds(cs), n = Math.round(4 + P.cheese * 16), holes = []; for (let i = 0; i < n; i++) holes.push(circleP(b.x0 + rnd() * (b.x1 - b.x0), b.y0 + rnd() * (b.y1 - b.y0), EM * (0.02 + rnd() * (0.03 + P.cheese * 0.09)))); return L.fromMulti(PC.difference(unionOf(cs), ...holes)); });
    step('grid', () => { const b = L.bounds(cs), sp = EM * (0.2 - P.grid * 0.1), bw = sp * P.grid * 0.42 + 3, bars = []; for (let x = b.x0 + sp / 2; x < b.x1; x += sp) bars.push(rectP(x - bw / 2, b.y0 - 20, x + bw / 2, b.y1 + 20)); for (let y = b.y0 + sp / 2; y < b.y1; y += sp) bars.push(rectP(b.x0 - 20, y - bw / 2, b.x1 + 20, y + bw / 2)); return L.fromMulti(PC.difference(unionOf(cs), ...bars)); });
    step('stripes', () => { const b = L.bounds(cs), sp = EM * 0.085, bw = sp * P.stripes * 0.75, bars = []; for (let y = b.y0 + sp; y < b.y1; y += sp) bars.push(rectP(b.x0 - 20, y - bw / 2, b.x1 + 20, y + bw / 2)); return L.fromMulti(PC.difference(unionOf(cs), ...bars)); });
  }
  if (P.spikes) {
    const fixed = L.correctDirections(cs), st = EM * 0.035, A = P.spikes * EM * 0.14;
    cs = fixed.map(c => { const r = resample(L.flatten(c, 4), st), n = r.length; if (n < 3) return null; return r.map((p, i) => { if (i % 2 === 0) return L.N(Math.round(p[0]), Math.round(p[1])); const a = r[(i - 1 + n) % n], b = r[(i + 1) % n], t = L.unit(L.sub(b, a)); return L.N(Math.round(p[0] + t[1] * A), Math.round(p[1] - t[0] * A)); }); }).filter(Boolean);
  }
  if (P.poly) { const st = EM * (0.03 + P.poly * 0.22); cs = cs.map(c => { const r = resample(L.flatten(c, 4), st); return r.length > 2 ? r.map(p => L.N(Math.round(p[0]), Math.round(p[1]))) : null; }).filter(Boolean); }
  if (P.pixel && cs.length) {
    const rings = cs.map(c => L.flatten(c, 6)), b = L.bounds(cs), cell = EM * (0.015 + P.pixel * 0.11), rects = [];
    const gx0 = Math.floor(b.x0 / cell) * cell, gy0 = Math.floor(b.y0 / cell) * cell;
    for (let y = gy0; y < b.y1; y += cell) { let run = null; for (let x = gx0; x < b.x1 + cell; x += cell) { const on = x < b.x1 && winding([x + cell / 2, y + cell / 2], rings) !== 0; if (on && run == null) run = x; if (!on && run != null) { rects.push(rectP(run, y, x, y + cell)); run = null; } } }
    if (rects.length) { try { cs = PC ? mpStraight(PC.union(...rects)) : rects.map(r => r[0].slice(0, 4).map(p => L.N(p[0], p[1]))); } catch (e) { cs = rects.map(r => r[0].slice(0, 4).map(p => L.N(p[0], p[1]))); } } else cs = [];
  }
  if (P.halftone && cs.length) {
    const rings = cs.map(c => L.flatten(c, 6)), b = L.bounds(cs), cell = EM * (0.04 + P.halftone * 0.12), out = [];
    const gx0 = Math.floor(b.x0 / cell) * cell, gy0 = Math.floor(b.y0 / cell) * cell;
    for (let y = gy0, row = 0; y < b.y1; y += cell, row++) for (let x = gx0 + (row % 2 ? cell / 2 : 0); x < b.x1; x += cell) {
      let cov = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (winding([x + (i + .5) / 4 * cell, y + (j + .5) / 4 * cell], rings) !== 0) cov++;
      if (cov) { const r = cell * 0.5 * Math.sqrt(cov / 16) * 1.12; if (r > 2) out.push(L.ellipseC(x + cell / 2, y + cell / 2, r, r)); }
    }
    cs = out;
  }
  cs = cs.filter(c => c && c.length > 1).map(c => L.roundC(c));
  return { contours: cs, adv };
}

/* ---------- glyph → svg path ---------- */
function pathD(contours, tx) {
  tx = tx || ((x, y) => [x, y]); const f = v => Math.round(v * 10) / 10; let d = '';
  for (const c of contours) {
    if (c.length < 2) continue; const a = tx(c[0].x, c[0].y); d += `M${f(a[0])} ${f(a[1])}`;
    for (let i = 0; i < c.length; i++) { const s = L.segOf(c, i), e = tx(s.b[3][0], s.b[3][1]); if (s.curve) { const c1 = tx(s.b[1][0], s.b[1][1]), c2 = tx(s.b[2][0], s.b[2][1]); d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(e[0])} ${f(e[1])}`; } else if (i < c.length - 1) d += `L${f(e[0])} ${f(e[1])}`; }
    d += 'Z';
  }
  return d;
}

G.LiteraFX = { FX, TIERS, DEF, defaults, isActive, PRESETS, process, pathD, mulberry };
})(typeof window !== 'undefined' ? window : globalThis);
