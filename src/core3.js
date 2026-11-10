/* ===== LITERA CORE 3: knife, overshoot, masters, variable/color fonts, GIF, UFO/Glyphs, words ===== */
(function (G) {
'use strict';
const L = G.Litera;
const { N, segOf, bez, cloneC, roundC, bounds, reverseC, correctDirections, isSpecial, specInfo, glyphName } = L;

/* ---------- small binary helpers ---------- */
const u8 = (a, v) => a.push(v & 255);
const u16 = (a, v) => a.push((v >> 8) & 255, v & 255);
const i16 = (a, v) => u16(a, v < 0 ? v + 65536 : v);
const u32 = (a, v) => a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const fixed = (a, v) => u32(a, Math.round(v * 65536) >>> 0);
const f2d14 = (a, v) => i16(a, Math.round(v * 16384));
const tagB = (a, t) => { for (let i = 0; i < 4; i++) a.push(t.charCodeAt(i)); };

/* ---------- bezier helpers ---------- */
const lp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function splitAt(b, t) { const p01 = lp(b[0], b[1], t), p12 = lp(b[1], b[2], t), p23 = lp(b[2], b[3], t), p012 = lp(p01, p12, t), p123 = lp(p12, p23, t), p = lp(p012, p123, t); return [[b[0], p01, p012, p], [p, p123, p23, b[3]]]; }
function tangentAt(b, t, curve) {
  if (!curve) return [b[3][0] - b[0][0], b[3][1] - b[0][1]];
  const m = 1 - t; let d = [3 * m * m * (b[1][0] - b[0][0]) + 6 * m * t * (b[2][0] - b[1][0]) + 3 * t * t * (b[3][0] - b[2][0]), 3 * m * m * (b[1][1] - b[0][1]) + 6 * m * t * (b[2][1] - b[1][1]) + 3 * t * t * (b[3][1] - b[2][1])];
  if (Math.hypot(d[0], d[1]) < 1e-6) d = t < .5 ? [b[2][0] - b[0][0], b[2][1] - b[0][1]] : [b[3][0] - b[1][0], b[3][1] - b[1][1]];
  if (Math.hypot(d[0], d[1]) < 1e-6) d = [b[3][0] - b[0][0], b[3][1] - b[0][1]];
  return d;
}
const isComp = c => !!(c && c[0] && c[0].r);

/* ---------- knife ---------- */
function lineHits(b, curve, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1], D = p => (p[0] - A[0]) * dy - (p[1] - A[1]) * dx, sg = v => v > 0;
  const out = [];
  if (!curve) { const d0 = D(b[0]), d3 = D(b[3]); if (sg(d0) !== sg(d3)) out.push(d0 / (d0 - d3)); return out; }
  const S = 48; let pv = D(b[0]), pt = 0;
  for (let k = 1; k <= S; k++) {
    const t = k / S, v = D(bez(b, t));
    if (sg(v) !== sg(pv)) { let lo = pt, hi = t, vlo = pv; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2, vm = D(bez(b, mid)); if (sg(vm) === sg(vlo)) { lo = mid; vlo = vm; } else hi = mid; } out.push((lo + hi) / 2); }
    pv = v; pt = t;
  }
  return out;
}
function knife(contours, A, B) {
  const len2 = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2; if (len2 < 4) return { contours, cuts: 0 };
  const src = correctDirections(contours.map(cloneC)), xs = [], per = src.map(() => []);
  src.forEach((c, ci) => {
    if (c.length < 2) return;
    for (let si = 0; si < c.length; si++) {
      const s = segOf(c, si);
      for (let t of lineHits(s.b, s.curve, A, B)) {
        t = Math.min(1, Math.max(1e-6, t)); const P = s.curve ? bez(s.b, t) : lp(s.b[0], s.b[3], t);
        const u = ((P[0] - A[0]) * (B[0] - A[0]) + (P[1] - A[1]) * (B[1] - A[1])) / len2;
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        const x = { id: xs.length, ci, si, t, u, P }; xs.push(x); per[ci].push(x);
      }
    }
  });
  const valid = new Set(); per.forEach((l, ci) => { if (l.length >= 2 && l.length % 2 === 0) valid.add(ci); });
  const list = xs.filter(x => valid.has(x.ci)).sort((a, b) => a.u - b.u);
  if (list.length < 2 || list.length % 2) return { contours, cuts: 0 };
  const partner = new Map(); for (let i = 0; i < list.length; i += 2) { partner.set(list[i].id, list[i + 1]); partner.set(list[i + 1].id, list[i]); }
  // split crossed contours into pieces between consecutive crossings
  const startPiece = new Map(), pieces = [];
  for (const ci of valid) {
    const c = src[ci], cr = per[ci].slice().sort((a, b) => a.si - b.si || a.t - b.t), items = [];
    for (let si = 0; si < c.length; si++) {
      const s = segOf(c, si), here = cr.filter(x => x.si === si); let rem = s.b, t0 = 0, first = true;
      for (const x of here) {
        const tt = (x.t - t0) / (1 - t0 || 1); let part;
        if (tt >= 1 - 1e-9) { part = rem; rem = null; } else if (s.curve) { const sp = splitAt(rem, tt); part = sp[0]; rem = sp[1]; } else { const P = lp(rem[0], rem[3], tt); part = [rem[0], rem[0], P, P]; rem = [P, P, rem[3], rem[3]]; }
        items.push({ seg: part, curve: s.curve, s0: first ? !!c[si].s : false }); items.push({ x }); first = false; t0 = x.t;
        if (!rem) break;
      }
      if (rem) items.push({ seg: rem, curve: s.curve, s0: first ? !!c[si].s : false });
    }
    const fi = items.findIndex(it => it.x), rot = items.slice(fi + 1).concat(items.slice(0, fi + 1));
    let curP = { start: items[fi].x, segs: [] };
    for (const it of rot) { if (it.x) { curP.end = it.x; pieces.push(curP); startPiece.set(curP.start.id, curP); curP = { start: it.x, segs: [] }; } else curP.segs.push(it); }
  }
  const nodesOf = p => {
    const ns = [];
    p.segs.forEach((s, j) => { const prev = p.segs[j - 1]; ns.push({ x: s.seg[0][0], y: s.seg[0][1], i: j > 0 && prev.curve ? [...prev.seg[2]] : null, o: s.curve ? [...s.seg[1]] : null, s: j > 0 ? s.s0 : false }); });
    const last = p.segs[p.segs.length - 1]; if (last) ns.push({ x: last.seg[3][0], y: last.seg[3][1], i: last.curve ? [...last.seg[2]] : null, o: null, s: false });
    return ns;
  };
  const used = new Set(), out = src.filter((c, ci) => !valid.has(ci));
  for (const p0 of pieces) {
    if (used.has(p0)) continue; let p = p0, nodes = [], guard = 0;
    while (p && !used.has(p) && guard++ < 999) { used.add(p); nodes = nodes.concat(nodesOf(p)); const nx = partner.get(p.end.id); p = nx ? startPiece.get(nx.id) : null; }
    const clean = []; for (const n of nodes) { const l = clean[clean.length - 1]; if (l && Math.abs(l.x - n.x) < .01 && Math.abs(l.y - n.y) < .01) { l.o = n.o; continue; } clean.push(n); }
    if (clean.length > 2) { const f = clean[0], l = clean[clean.length - 1]; if (Math.abs(f.x - l.x) < .01 && Math.abs(f.y - l.y) < .01) { f.i = l.i; clean.pop(); } }
    if (clean.length > 2) out.push(roundC(clean));
  }
  return { contours: out, cuts: list.length / 2 };
}

/* ---------- structure-preserving offset (for variable masters & small caps) ---------- */
function offsetContours(contours, wx, wy) {
  return contours.map(c => {
    const n = c.length; if (n < 2) return cloneC(c);
    const segs = c.map((_, i) => segOf(c, i)), out = cloneC(c);
    for (let i = 0; i < n; i++) {
      const sIn = segs[(i - 1 + n) % n], sOut = segs[i];
      let a = tangentAt(sIn.b, 1, sIn.curve), b = tangentAt(sOut.b, 0, sOut.curve);
      const la = Math.hypot(a[0], a[1]) || 1, lb = Math.hypot(b[0], b[1]) || 1; a = [a[0] / la, a[1] / la]; b = [b[0] / lb, b[1] / lb];
      const na = [a[1], -a[0]], nb = [b[1], -b[0]], det = na[0] * nb[1] - na[1] * nb[0];
      let v; if (Math.abs(det) < 0.05) v = [(na[0] + nb[0]) / 2, (na[1] + nb[1]) / 2]; else v = [(nb[1] - na[1]) / det, (na[0] - nb[0]) / det];
      const l = Math.hypot(v[0], v[1]); if (l > 2.2) { v = [v[0] / l * 2.2, v[1] / l * 2.2]; }
      const dx = v[0] * wx, dy = v[1] * wy, o = out[i];
      o.x += dx; o.y += dy; if (o.i) o.i = [o.i[0] + dx, o.i[1] + dy]; if (o.o) o.o = [o.o[0] + dx, o.o[1] + dy];
    }
    return out;
  });
}
function masterOf(glyph, w, ratio, noFix) {
  if (!glyph.contours.length || !w) return { adv: glyph.adv, contours: glyph.contours.map(cloneC) };
  const src = glyph.contours.map(cloneC), cs = offsetContours(noFix ? src : correctDirections(src), w, w * (ratio == null ? 0.55 : ratio));
  for (const c of cs) for (const n of c) { n.x += w; if (n.i) n.i[0] += w; if (n.o) n.o[0] += w; }
  return { adv: Math.max(0, glyph.adv + 2 * w), contours: cs };
}

/* ---------- overshoot ---------- */
function extremeKind(contours, top, minW) {
  const bb = bounds(contours); if (!bb) return null; const ey = top ? bb.y1 : bb.y0, band = 30, W = Math.max(1, bb.x1 - bb.x0, minW || 0);
  let best = null;
  for (const c of contours) {
    const r = L.flatten(c, 10); if (r.length < 3) continue; let ei = -1, ev = top ? -Infinity : Infinity;
    r.forEach((p, i) => { if (top ? p[1] > ev : p[1] < ev) { ev = p[1]; ei = i; } });
    if (Math.abs(ev - ey) > 2) continue; const inBand = p => top ? p[1] >= ey - band : p[1] <= ey + band;
    let x0 = r[ei][0], x1 = x0, flatLen = 0;
    for (const dir of [1, -1]) { let i = ei; for (let s = 0; s < r.length; s++) { const j = (i + dir + r.length) % r.length; if (!inBand(r[j])) break; x0 = Math.min(x0, r[j][0]); x1 = Math.max(x1, r[j][0]); if (Math.abs(r[j][1] - ey) < 1 && Math.abs(r[i][1] - ey) < 1) flatLen += Math.abs(r[j][0] - r[i][0]); i = j; } }
    const chord = x1 - x0; if (!best || chord > best.chord) best = { chord, flatLen };
  }
  if (!best) return null;
  return { y: ey, round: best.chord / W > 0.3 && best.flatLen < best.chord * 0.25 };
}
function overshootInfo(font, k) {
  const g = font.glyphs[k], I = font.info, ov = I.overshoot == null ? 12 : I.overshoot; if (!g || !g.contours.length || ov <= 0) return null;
  const own = g.contours.filter(c => !isComp(c)); if (!own.length) return null;
  const top = extremeKind(own, true, I.capHeight * 0.45), bot = extremeKind(own, false, I.capHeight * 0.45), res = { k, ov, top: null, bottom: null };
  if (top && top.round) { const refs = [I.capHeight, I.xHeight, I.ascender].filter(v => v > 0); let best = null; for (const r of refs) { const d = Math.abs(top.y - (r + ov / 2)); if (d < 45 && (!best || d < best.d)) best = { r, d }; } if (best) res.top = { ref: best.r, y: top.y, target: best.r + ov, ok: top.y >= best.r + ov * 0.5 && top.y <= best.r + ov * 1.8 }; }
  if (bot && bot.round && Math.abs(bot.y + ov / 2) < 45) res.bottom = { ref: 0, y: bot.y, target: -ov, ok: bot.y <= -ov * 0.5 && bot.y >= -ov * 1.8 };
  return (res.top || res.bottom) ? res : null;
}
function fixOvershoot(g, info) {
  const own = g.contours.filter(c => !isComp(c)), bb = bounds(own); if (!bb) return false;
  const t0 = bb.y1, b0 = bb.y0, t1 = info.top && !info.top.ok ? info.top.target : t0, b1 = info.bottom && !info.bottom.ok ? info.bottom.target : b0;
  if (t1 === t0 && b1 === b0) return false; const k = (t1 - b1) / Math.max(1, t0 - b0), f = y => b1 + (y - b0) * k;
  for (const c of own) for (const n of c) { n.y = Math.round(f(n.y)); if (n.i) n.i = [n.i[0], Math.round(f(n.i[1]))]; if (n.o) n.o = [n.o[0], Math.round(f(n.o[1]))]; }
  return true;
}

/* ---------- OpenType generators: tabular figures, small caps ---------- */
function makeTnum(font) {
  const ds = [...'0123456789'].filter(d => font.glyphs[d] && font.glyphs[d].contours.length); if (!ds.length) return [];
  const W = Math.max(...ds.map(d => font.glyphs[d].adv)), made = [];
  for (const d of ds) { const g = font.glyphs[d], k = 'alt:' + d + ':tnum'; if (font.glyphs[k]) continue; const dx = Math.round((W - g.adv) / 2); font.glyphs[k] = { u: null, name: glyphName(k), adv: W, contours: L.shiftC(g.contours.map(cloneC), dx, 0) }; if (!font.order.includes(k)) font.order.push(k); made.push(k); }
  return made;
}
function makeSmcp(font) {
  const I = font.info, s = Math.min(1, (I.xHeight + 8) / Math.max(1, I.capHeight)), sx = Math.min(1, s * 1.1), made = [];
  for (const lo of Object.keys(font.glyphs)) {
    if (isSpecial(lo) || [...lo].length !== 1 || lo === lo.toUpperCase()) continue; const up = lo.toUpperCase(); if (up.length !== 1 || !font.glyphs[up] || !font.glyphs[up].contours.length) continue;
    if (font.glyphs['alt:' + lo + ':smcp']) continue;
    const U = font.glyphs[up], cs = U.contours.map(c => cloneC(c).map(n => ({ x: n.x * sx, y: n.y * s, s: n.s, i: n.i ? [n.i[0] * sx, n.i[1] * s] : null, o: n.o ? [n.o[0] * sx, n.o[1] * s] : null })));
    const w = Math.round(14 * (1 - s)), m = masterOf({ contours: cs, adv: U.adv * sx }, w, 0.6), k = 'alt:' + lo + ':smcp';
    m.contours.forEach(roundC); font.glyphs[k] = { u: null, name: glyphName(k), adv: Math.round(m.adv), contours: m.contours }; if (!font.order.includes(k)) font.order.push(k); made.push(k);
  }
  return made;
}

/* ---------- problem pairs ---------- */
function problemPairs(font, chars, opts, limit) {
  const sug = L.autoKern(font, chars, opts), set = new Set(chars), seen = new Set(), rows = [];
  const consider = (l, r) => { const key = l + '\t' + r; if (seen.has(key)) return; seen.add(key); const cur = L.kernValue(font, l, r), s = sug[key] || 0, d = s - cur; if (Math.abs(d) >= Math.max(10, (opts.threshold || 20) * 0.75)) rows.push({ l, r, cur, sug: s, d }); };
  for (const key in sug) { const [l, r] = key.split('\t'); consider(l, r); }
  for (const key in L.flatKerning(font)) { const [l, r] = key.split('\t'); if (set.has(l) && set.has(r)) consider(l, r); }
  rows.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)); return rows.slice(0, limit || 60);
}

/* ---------- words for kerning ---------- */
const WORDS = {
  en: ('about above across after again against almost also always among another answer anyone anything around avenue avoid away awful aware back ball bank base beautiful because become before began behind believe below between beyond black blue' +
    ' body book both boy bring brown build busy buy call came cannot care carry catch cause center change charge child city clean clear close cold color come company cover create cross day dear deep develop does done door down draw dream drive' +
    ' during each early earth easy eat eight either else end enough even every exact eye face fact fall family famous far fast father favor fear feel few field figure final find fire first five floor fly follow food foot force forest form forward' +
    ' found four free friend from front full game gave give glass go good great green ground group grow guard half hand happy hard have heavy help here high history hold home hope horse hour house however human hundred idea important into island' +
    ' join joy just keep kept kind king know lady land language large last late later laugh law lay lazy lead learn least leave left less letter level life light like line list little live long look lost love lower luck lynx make many map mark' +
    ' matter may mean meet might mind minute money month more morning most mother move much music name nature navy near need never new next night none north note nothing now number object ocean offer office often old only open order other over' +
    ' own page paper part party pass past pay people perhaps person piece place plain plan play point power present pretty problem public pull put quick quite quiet race rain raise reach read ready real reason record remain report rest return' +
    ' river road rock room round rule safe said save saw say school sea second seem sense serve seven several shall shape short should show side simple since sing size sky slow small snow soft some song soon sound south space speak special stand' +
    ' start state stay still stop story street strong study style sun sure system table take talk tall teach team tell test than that their them then there these they thing think this those though three through time today together told took' +
    ' toward town travel tree true try turn twenty type under until upon very view village visit voice vote wait walk wall want warm watch water wave way weather week well went were west what when where which while white whole why wide wife will' +
    ' wind window winter wish with without woman wonder word work world would write wrong yard year yellow yes yet you young your youth Avatar Toyota Yacht Wavy Fly Try Type Tea Vow Lt. Fr. Mr.').split(' '),
  ru: ('автор адрес актёр анкета арбуз авария богатый борьба буква быстро важный вагон ваза вата вдруг ведро вера ветер вечер взгляд вода война вокзал волна вопрос восток впереди время всегда выход газета гараж гвоздь где герой глава глаз говорить' +
    ' год голова гора город готов гость граница группа губа давно дальше дата дверь двор девочка дело день деньги дерево деревня детство джинсы диван добрый дом дорога дочь друг думать дух душа дым ехать жара жёлтый жена живот жизнь журнал забота' +
    ' завод закон зал заря звезда звук здание зелёный зима знак золото зуб игра идея изба имя искусство история кабинет каждый камень карта картина касса квартира кино класс клуб книга ковёр кожа комната конец корабль кот край красный крыша кто' +
    ' кулак лампа лев лес лето лицо лодка лошадь луг луна любовь люди магазин майка мальчик мама масло мать машина мебель место месяц мир много молоко море мост муха мысль мяч народ начало небо неделя ночь нога нос облако обед огонь окно олень' +
    ' осень остров отец отдых офис палата папа парк парта петух песня печь письмо плата платье победа погода пол поле порт поэт правда право природа птица пусть работа радость раз рама рассказ ребёнок река рука рыба сад самолёт сахар свет север' +
    ' село семья сердце сила синий слово снег собака солнце сон сосна стакан стол страна строка студент суп сыр табак так танец твой театр тело тема тепло товар тогда тоже толпа тот трава трамвай туман тут убор угол удача улица утро уха учитель' +
    ' фабрика факт фото футбол хлеб ход холод хор цветок цель центр час человек черта число чай чудо шаг шапка школа шум щека этаж юг юмор яблоко язык якорь январь яркий ясно ТАРАКАН ГОРА Тогда Гаага Тут Ты Ваш Уля Яго').split(' '),
  es: ('agua avenida año ayuda ayer bajo bastante bella boca bueno café calle cama campo casa cielo cosa ciudad claro como cuatro dar decir día dónde dulce edad ellos entonces escuela favor fiesta flor fuego fuerte gato gente grande guerra hablar' +
    ' hacer hasta hoy idea joven juego lado largo libro llave lluvia luz madre mano mar mayo mesa mundo nada nave noche nuevo ojo otro padre país palabra papel parte playa poco puerta pueblo rato rey río rojo saber sala tarde taza tiempo tierra' +
    ' todo trabajo valle vaso verde viaje vida voz ya yo Tú Ya voy Táctil Ávila').split(' ')
};
function wordsFor(l, r, max) {
  const out = [], up = c => c === c.toUpperCase() && c !== c.toLowerCase(), lo = c => c === c.toLowerCase() && c !== c.toUpperCase();
  const pairLo = (l + r).toLowerCase(), pool = [...WORDS.en, ...WORDS.ru, ...WORDS.es];
  for (const w of pool) {
    if (out.length >= (max || 6)) break; let cand = null;
    if (/[.,:;!?»)]/.test(r)) { if (w.toLowerCase().endsWith(l.toLowerCase())) cand = (up(l) ? w.toUpperCase() : w) + r; }
    else if (/[«(]/.test(l)) { if (w.toLowerCase().startsWith(r.toLowerCase())) cand = l + (up(r) ? w.toUpperCase() : w); }
    else if (w.toLowerCase().includes(pairLo)) { if (up(l) && up(r)) cand = w.toUpperCase(); else if (up(l) && lo(r)) { if (w.toLowerCase().startsWith(pairLo)) cand = w[0].toUpperCase() + w.slice(1).toLowerCase(); } else if (lo(l) && lo(r)) cand = w.toLowerCase(); else if (lo(l) && up(r)) cand = null; else cand = w; }
    if (cand && cand.includes(l + r) && !out.includes(cand)) out.push(cand);
  }
  return out;
}

/* ---------- name table patch ---------- */
function readName(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength), count = dv.getUint16(2), so = dv.getUint16(4), recs = [];
  for (let i = 0; i < count; i++) { const o = 6 + i * 12; const r = { p: dv.getUint16(o), e: dv.getUint16(o + 2), l: dv.getUint16(o + 4), id: dv.getUint16(o + 6), len: dv.getUint16(o + 8), off: dv.getUint16(o + 10) }; r.bytes = data.slice(so + r.off, so + r.off + r.len); recs.push(r); }
  return recs;
}
function utf16be(s) { const a = []; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xFFFF) { const v = c - 0x10000; u16(a, 0xD800 + (v >> 10)); u16(a, 0xDC00 + (v & 1023)); } else u16(a, c); } return new Uint8Array(a); }
function writeName(recs) {
  recs.sort((a, b) => a.p - b.p || a.e - b.e || a.l - b.l || a.id - b.id);
  const head = [], store = []; u16(head, 0); u16(head, recs.length); u16(head, 6 + recs.length * 12);
  for (const r of recs) { u16(head, r.p); u16(head, r.e); u16(head, r.l); u16(head, r.id); u16(head, r.bytes.length); u16(head, store.length); for (const b of r.bytes) store.push(b); }
  return new Uint8Array(head.concat(store));
}
function addNames(tables, entries) { // entries: {id: string}
  const nt = tables.find(t => t.tag === 'name'); if (!nt) return; const recs = readName(new Uint8Array(nt.data)).filter(r => !(r.id in entries));
  for (const id in entries) { recs.push({ p: 3, e: 1, l: 0x409, id: +id, bytes: utf16be(entries[id]) }); const mac = new TextEncoder().encode(entries[id]); if (/^[\x20-\x7e]*$/.test(entries[id])) recs.push({ p: 1, e: 0, l: 0, id: +id, bytes: mac }); }
  nt.data = writeName(recs);
}

/* ---------- variable TTF (wght) ---------- */
function quadsN(b, n) { const out = []; let rem = b; for (let j = 0; j < n; j++) { let pc; if (j < n - 1) { const sp = splitAt(rem, 1 / (n - j)); pc = sp[0]; rem = sp[1]; } else pc = rem; out.push([[(3 * (pc[1][0] + pc[2][0]) - pc[0][0] - pc[3][0]) / 4, (3 * (pc[1][1] + pc[2][1]) - pc[0][1] - pc[3][1]) / 4], pc[3]]); } return out; }
function quadCount(b, tol) { const d = [b[0][0] - 3 * b[1][0] + 3 * b[2][0] - b[3][0], b[0][1] - 3 * b[1][1] + 3 * b[2][1] - b[3][1]], err = Math.hypot(d[0], d[1]) * Math.sqrt(3) / 36; return Math.max(1, Math.min(24, Math.ceil(Math.cbrt(err / tol)))); }
function glyfPoints(contours, plan) { // returns {cts:[[x,y,on]], plan}
  const mk = !plan; if (mk) plan = []; const cts = [];
  contours.forEach((c0, ci) => {
    if (!c0 || c0.length < 2) { if (mk) plan.push(null); return; } const c = reverseC(c0), pts = [], pp = mk ? [] : plan[ci]; if (!pp) return;
    for (let i = 0; i < c.length; i++) { const s = segOf(c, i); pts.push([s.b[0][0], s.b[0][1], 1]); if (s.curve) { const n = mk ? quadCount(s.b, 0.4) : pp[i]; if (mk) pp.push(n); const qs = quadsN(s.b, n); qs.forEach((q, k) => { pts.push([q[0][0], q[0][1], 0]); if (k < qs.length - 1) pts.push([q[1][0], q[1][1], 1]); }); } else if (mk) pp.push(0); }
    if (mk) plan.push(pp); cts.push(pts);
  });
  return { cts, plan };
}
function encodePts(cts) {
  const rc = cts.map(c => c.map(p => [Math.round(p[0]), Math.round(p[1]), p[2]])).filter(c => c.length > 1);
  if (!rc.length) return { bytes: new Uint8Array(0), xMin: 0, yMin: 0, xMax: 0, yMax: 0, np: 0, nc: 0, pts: [] };
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity, np = 0;
  for (const c of rc) for (const p of c) { xMin = Math.min(xMin, p[0]); yMin = Math.min(yMin, p[1]); xMax = Math.max(xMax, p[0]); yMax = Math.max(yMax, p[1]); np++; }
  const a = []; i16(a, rc.length); i16(a, xMin); i16(a, yMin); i16(a, xMax); i16(a, yMax);
  let e = -1; for (const c of rc) { e += c.length; u16(a, e); } u16(a, 0);
  for (const c of rc) for (const p of c) a.push(p[2] ? 1 : 0);
  let px = 0; for (const c of rc) for (const p of c) { i16(a, p[0] - px); px = p[0]; }
  let py = 0; for (const c of rc) for (const p of c) { i16(a, p[1] - py); py = p[1]; }
  while (a.length % 4) a.push(0);
  return { bytes: new Uint8Array(a), xMin, yMin, xMax, yMax, np, nc: rc.length, pts: rc.flat() };
}
function packDeltas(ds) {
  const a = []; let i = 0;
  while (i < ds.length) {
    if (ds[i] === 0) { let n = 0; while (i + n < ds.length && ds[i + n] === 0 && n < 64) n++; a.push(0x80 | (n - 1)); i += n; continue; }
    const byte = v => v >= -128 && v <= 127; let n = 0;
    if (byte(ds[i])) { while (i + n < ds.length && ds[i + n] !== 0 && byte(ds[i + n]) && n < 64) n++; a.push(n - 1); for (let k = 0; k < n; k++) a.push(ds[i + k] & 255); }
    else { while (i + n < ds.length && ds[i + n] !== 0 && !byte(ds[i + n]) && n < 64) n++; a.push(0x40 | (n - 1)); for (let k = 0; k < n; k++) i16(a, ds[i + k]); }
    i += n;
  }
  return a;
}
function buildVarTTF(font, opts) {
  opts = opts || {}; const wL = opts.light == null ? -24 : opts.light, wB = opts.bold == null ? 40 : opts.bold, ratio = opts.ratio == null ? 0.55 : opts.ratio;
  const r = L.buildFont(font, opts), st = (function () { const buf = r.buffer, dv = new DataView(buf), num = dv.getUint16(4), t = []; for (let i = 0; i < num; i++) { const o = 12 + 16 * i; t.push({ tag: String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)), data: new Uint8Array(buf, dv.getUint32(o + 8), dv.getUint32(o + 12)).slice() }); } return t; })();
  const n = r.outlines.length, enc = [], gv = [], rev = {}; let manualN = 0; for (const k in r.index) rev[r.index[k]] = k;
  for (let gi = 0; gi < n; gi++) {
    const o = r.outlines[gi], base = { contours: o.contours.filter(c => c && c.length > 1), adv: o.adv };
    const D = correctDirections(base.contours.map(cloneC)), def = glyfPoints(D, null), e = encodePts(def.cts); enc.push(e);
    if (!e.np) { gv.push(null); continue; }
    const tuples = [], key = rev[gi], src = key != null && !opts.transform ? font.glyphs[key] : null;
    for (const [w, mk] of [[wL, 'mL'], [wB, 'mB']]) {
      let m = null; const man = src && src[mk];
      if (man && man.contours && L.compatible(base.contours, man.contours).ok) { const mc = man.contours.map((c, ci) => (L.ringArea(L.flatten(D[ci], 6)) > 0) === (L.ringArea(L.flatten(base.contours[ci], 6)) > 0) ? cloneC(c) : reverseC(c)); m = { contours: mc, adv: man.adv }; manualN++; }
      if (!m) m = masterOf({ contours: D, adv: base.adv }, w, ratio, true);
      const mp = glyfPoints(m.contours, def.plan), me = mp.cts.map(c => c.map(p => [Math.round(p[0]), Math.round(p[1])])).filter(c => c.length > 1).flat();
      if (me.length !== e.pts.length) { tuples.push(null); continue; }
      const dx = me.map((p, k) => p[0] - e.pts[k][0]).concat([0, Math.round(m.adv) - Math.round(base.adv), 0, 0]), dy = me.map((p, k) => p[1] - e.pts[k][1]).concat([0, 0, 0, 0]);
      tuples.push(packDeltas(dx).concat(packDeltas(dy)));
    }
    gv.push(tuples);
  }
  // glyf/loca/maxp/hmtx as in buildTTF
  const total = enc.reduce((s, e) => s + e.bytes.length, 0), glyf = new Uint8Array(total || 4), loca = new Uint8Array(4 * (n + 1)), lv = new DataView(loca.buffer);
  let off = 0; enc.forEach((e, i) => { lv.setUint32(4 * i, off); glyf.set(e.bytes, off); off += e.bytes.length; }); lv.setUint32(4 * n, off);
  const maxp = new Uint8Array(32), mv = new DataView(maxp.buffer); mv.setUint32(0, 0x00010000); mv.setUint16(4, n); mv.setUint16(6, Math.max(0, ...enc.map(e => e.np))); mv.setUint16(8, Math.max(0, ...enc.map(e => e.nc))); mv.setUint16(14, 2);
  const hmtx = new Uint8Array(4 * n), hv = new DataView(hmtx.buffer); r.outlines.forEach((o, i) => { hv.setUint16(4 * i, Math.max(0, Math.min(65535, Math.round(o.adv)))); hv.setInt16(4 * i + 2, enc[i].xMin); });
  const T = {}; for (const t of st) T[t.tag] = t; const ne = enc.filter(e => e.nc);
  const head = T.head.data, hd = new DataView(head.buffer); if (ne.length) { hd.setInt16(36, Math.min(...ne.map(e => e.xMin)) - Math.abs(wB)); hd.setInt16(38, Math.min(...ne.map(e => e.yMin)) - Math.abs(wB)); hd.setInt16(40, Math.max(...ne.map(e => e.xMax)) + 3 * Math.abs(wB)); hd.setInt16(42, Math.max(...ne.map(e => e.yMax)) + Math.abs(wB)); } hd.setInt16(50, 1); hd.setInt16(52, 0);
  const hh = new DataView(T.hhea.data.buffer); hh.setUint16(34, n);
  // gvar
  const shared = []; f2d14(shared, -1); f2d14(shared, 1);
  const datas = gv.map(tp => {
    if (!tp || !tp.some(Boolean)) return [];
    const live = tp.map((d, i) => d ? { d, i } : null).filter(Boolean), a = [];
    u16(a, 0x8000 | live.length); const hdrLen = 4 + live.length * 4; u16(a, hdrLen);
    for (const t of live) { u16(a, t.d.length); u16(a, t.i); }
    const ser = [0]; for (const t of live) ser.push(...t.d);
    // variationDataSize must exclude the shared points byte: attach shared byte before first tuple data
    const out = a.concat(ser); while (out.length % 2) out.push(0); return out;
  });
  const gvar = []; u16(gvar, 1); u16(gvar, 0); u16(gvar, 1); u16(gvar, 2); const shOffPos = gvar.length; u32(gvar, 0); u16(gvar, n); u16(gvar, 1); const arrOffPos = gvar.length; u32(gvar, 0);
  let doff = 0; const offs = []; for (const d of datas) { offs.push(doff); doff += d.length; } offs.push(doff); for (const o of offs) u32(gvar, o);
  const shOff = gvar.length; gvar.push(...shared); while (gvar.length % 4) gvar.push(0); const arrOff = gvar.length; for (const d of datas) gvar.push(...d);
  const gdv = (v, pos) => { gvar[pos] = (v >>> 24) & 255; gvar[pos + 1] = (v >>> 16) & 255; gvar[pos + 2] = (v >>> 8) & 255; gvar[pos + 3] = v & 255; }; gdv(shOff, shOffPos); gdv(arrOff, arrOffPos);
  // fvar
  const minW = opts.minW || 300, maxW = opts.maxW || 700, fvar = []; u16(fvar, 1); u16(fvar, 0); u16(fvar, 16); u16(fvar, 2); u16(fvar, 1); u16(fvar, 20); u16(fvar, 3); u16(fvar, 8);
  tagB(fvar, 'wght'); fixed(fvar, minW); fixed(fvar, 400); fixed(fvar, maxW); u16(fvar, 0); u16(fvar, 256);
  for (const [nid, v] of [[257, minW], [2, 400], [258, maxW]]) { u16(fvar, nid); u16(fvar, 0); fixed(fvar, v); }
  // STAT v1.1
  const stat = []; u16(stat, 1); u16(stat, 1); u16(stat, 8); u16(stat, 1); u32(stat, 20); u16(stat, 3); u32(stat, 28); u16(stat, 2);
  tagB(stat, 'wght'); u16(stat, 256); u16(stat, 0);
  const avStart = stat.length; u16(stat, 6); u16(stat, 18); u16(stat, 30);
  for (const [nid, v, fl] of [[257, minW, 0], [259, 400, 2], [258, maxW, 0]]) { u16(stat, 1); u16(stat, 0); u16(stat, fl); u16(stat, nid); fixed(stat, v); }
  void avStart;
  // avar not needed; patch OS/2 weight
  const os2 = T['OS/2']; if (os2) new DataView(os2.data.buffer).setUint16(4, 400);
  const tables = st.filter(t => !['CFF ', 'maxp', 'head', 'hmtx', 'hhea', 'glyf', 'loca'].includes(t.tag));
  addNames(tables, { 256: 'Weight', 257: 'Light', 258: 'Bold', 259: 'Regular' });
  tables.push({ tag: 'glyf', data: glyf }, { tag: 'loca', data: loca }, { tag: 'maxp', data: maxp }, { tag: 'head', data: head }, { tag: 'hmtx', data: hmtx }, { tag: 'hhea', data: T.hhea.data }, { tag: 'gvar', data: new Uint8Array(gvar) }, { tag: 'fvar', data: new Uint8Array(fvar) }, { tag: 'STAT', data: new Uint8Array(stat) });
  return { buffer: L.buildSfntPub(0x00010000, tables), glyphCount: n, pairCount: r.pairCount, manualMasters: manualN };
}

/* ---------- color: COLR v0 + CPAL ---------- */
function hexToBGRA(h) { const m = String(h || '#000').replace('#', ''); const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m.padEnd(6, '0'); return [parseInt(v.slice(4, 6), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(0, 2), 16), 255]; }
function makeCOLR(bases) { // [{gid, layers:[{gid, pal}]}]
  bases.sort((a, b) => a.gid - b.gid); const a = [], nl = bases.reduce((s, b) => s + b.layers.length, 0);
  u16(a, 0); u16(a, bases.length); u32(a, 14); u32(a, 14 + bases.length * 6); u16(a, nl);
  let li = 0; for (const b of bases) { u16(a, b.gid); u16(a, li); u16(a, b.layers.length); li += b.layers.length; }
  for (const b of bases) for (const l of b.layers) { u16(a, l.gid); u16(a, l.pal); }
  return new Uint8Array(a);
}
function makeCPAL(colors) { const a = []; u16(a, 0); u16(a, colors.length); u16(a, 1); u16(a, colors.length); u32(a, 14); u16(a, 0); for (const c of colors) a.push(...hexToBGRA(c)); return new Uint8Array(a); }
function colorPlan(font) { // returns {extra:{key:glyph}, map:{base:[{key,pal}]}} using contour color k on first node
  const extra = {}, map = {}; const pal = font.palette || [];
  for (const k of font.order) {
    const g = font.glyphs[k]; if (!g || !g.contours.length) continue; const idx = g.contours.map(c => (c[0] && c[0].k) ? c[0].k : 0);
    if (!idx.some(v => v > 0 && pal[v - 1])) continue; const groups = new Map();
    g.contours.forEach((c, ci) => { const v = idx[ci] > 0 && pal[idx[ci] - 1] ? idx[ci] : 0; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(c); });
    const layers = []; [...groups.keys()].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b)).forEach(v => { const key = 'alt:' + (isSpecial(k) ? glyphName(k) : k) + ':c' + String(v).padStart(2, '0'); extra[key] = { u: null, name: glyphName(k) + '.color' + v, adv: g.adv, contours: groups.get(v), _base: k }; layers.push({ key, pal: v === 0 ? 0xFFFF : v - 1 }); });
    map[k] = layers;
  }
  return { extra, map, has: Object.keys(map).length > 0 };
}

/* ---------- GIF encoder ---------- */
function gifEncode(frames, w, h, palette, delay) { // frames: Uint8Array indices; palette: [[r,g,b]] length 256
  const out = []; const w16 = v => out.push(v & 255, (v >> 8) & 255);
  for (const c of 'GIF89a') out.push(c.charCodeAt(0)); w16(w); w16(h); out.push(0xF7, 0, 0);
  for (let i = 0; i < 256; i++) { const p = palette[i] || [0, 0, 0]; out.push(p[0], p[1], p[2]); }
  out.push(0x21, 0xFF, 11); for (const c of 'NETSCAPE2.0') out.push(c.charCodeAt(0)); out.push(3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xF9, 4, 0x04); w16(delay); out.push(0, 0);
    out.push(0x2C); w16(0); w16(0); w16(w); w16(h); out.push(0);
    out.push(8); const data = lzw(f, 8); for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(data[i + k]); } out.push(0);
  }
  out.push(0x3B); return new Uint8Array(out);
}
function lzw(px, minSize) {
  const clear = 1 << minSize, eoi = clear + 1, out = []; let size = minSize + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0;
  const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  emit(clear); let w = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = w * 4096 + k, v = dict.get(key);
    if (v !== undefined) { w = v; continue; }
    emit(w); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; }
    w = k;
  }
  emit(w); emit(eoi); if (bits > 0) out.push(cur & 255); return out;
}

/* ---------- ZIP reader ---------- */
async function readZip(buf) {
  const dv = new DataView(buf), u = new Uint8Array(buf); let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('zip');
  const cnt = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {}, dec = new TextDecoder();
  for (let i = 0; i < cnt; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break; const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl; if (name.endsWith('/')) continue;
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true), start = lo + 30 + lnl + lxl, raw = u.subarray(start, start + csize);
    if (method === 0) files[name] = raw.slice(); else if (method === 8) { const ds = new DecompressionStream('deflate-raw'); files[name] = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer()); }
  }
  return files;
}

/* ---------- plist (XML) ---------- */
function plistEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toPlist(v, ind) {
  ind = ind || ''; const n = ind + '  ';
  if (Array.isArray(v)) return `${ind}<array>\n${v.map(x => toPlist(x, n)).join('')}${ind}</array>\n`;
  if (v && typeof v === 'object') return `${ind}<dict>\n${Object.keys(v).map(k => `${n}<key>${plistEsc(k)}</key>\n${toPlist(v[k], n)}`).join('')}${ind}</dict>\n`;
  if (typeof v === 'number') return Number.isInteger(v) ? `${ind}<integer>${v}</integer>\n` : `${ind}<real>${+v.toFixed(4)}</real>\n`;
  if (typeof v === 'boolean') return `${ind}<${v}/>\n`;
  return `${ind}<string>${plistEsc(v)}</string>\n`;
}
const plistDoc = v => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${toPlist(v)}</plist>\n`;
function parsePlistXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'), root = doc.querySelector('plist > *'); if (!root) return null;
  const val = el => { const t = el.tagName; if (t === 'dict') { const o = {}; const ch = [...el.children]; for (let i = 0; i < ch.length; i += 2) o[ch[i].textContent] = val(ch[i + 1]); return o; } if (t === 'array') return [...el.children].map(val); if (t === 'integer') return parseInt(el.textContent, 10); if (t === 'real') return parseFloat(el.textContent); if (t === 'true') return true; if (t === 'false') return false; return el.textContent; };
  return val(root);
}

/* ---------- UFO export ---------- */
function ufoFileName(name, used) {
  let b = name.replace(/[A-Z]/g, c => c + '_').replace(/[\x00-\x1f"*+/:<>?[\\\]|\x7f]/g, '_'); if (b[0] === '.') b = '_' + b.slice(1);
  if (/^(con|prn|aux|clock\$|nul|a:-z:|com\d|lpt\d)$/i.test(b)) b = '_' + b; b = b.slice(0, 200); let f = b + '.glif', i = 1;
  while (used.has(f.toLowerCase())) f = b + String(i++).padStart(15, '0').slice(-15) + '.glif'; used.add(f.toLowerCase()); return f;
}
function glifXML(name, g, k) {
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<glyph name="${plistEsc(name)}" format="2">\n  <advance width="${Math.round(g.adv)}"/>\n`;
  if (g.u != null && !isSpecial(k)) s += `  <unicode hex="${g.u.toString(16).toUpperCase().padStart(4, '0')}"/>\n`;
  s += '  <outline>\n';
  for (const c of g.contours) {
    if (c.length < 2) continue; s += '    <contour>\n';
    for (let i = 0; i < c.length; i++) { const sg = segOf(c, i), b = c[(i + 1) % c.length]; if (sg.curve) { s += `      <point x="${Math.round(sg.b[1][0])}" y="${Math.round(sg.b[1][1])}"/>\n      <point x="${Math.round(sg.b[2][0])}" y="${Math.round(sg.b[2][1])}"/>\n      <point x="${Math.round(b.x)}" y="${Math.round(b.y)}" type="curve"${b.s ? ' smooth="yes"' : ''}/>\n`; } else s += `      <point x="${Math.round(b.x)}" y="${Math.round(b.y)}" type="line"${b.s ? ' smooth="yes"' : ''}/>\n`; }
    s += '    </contour>\n';
  }
  return s + '  </outline>\n</glyph>\n';
}
function exportUFO(font, base) {
  const I = font.info, enc = new TextEncoder(), files = [], dir = base + '.ufo/', names = {}, used = new Set(), contents = {}, order = [];
  for (const k of font.order) { const g = font.glyphs[k]; if (!g) continue; let nm = g.name || glyphName(k); while (Object.values(names).includes(nm)) nm += '_'; names[k] = nm; }
  for (const k of font.order) { const g = font.glyphs[k]; if (!g) continue; const nm = names[k], fn = ufoFileName(nm, used); contents[nm] = fn; order.push(nm); files.push({ name: dir + 'glyphs/' + fn, data: enc.encode(glifXML(nm, g, k)) }); }
  const [vMaj, vMin] = String(I.version || '1.000').split('.').map(x => parseInt(x, 10) || 0);
  files.push({ name: dir + 'metainfo.plist', data: enc.encode(plistDoc({ creator: 'com.kernage', formatVersion: 3 })) });
  files.push({ name: dir + 'fontinfo.plist', data: enc.encode(plistDoc({ familyName: I.familyName, styleName: I.styleName, unitsPerEm: I.upm, ascender: I.ascender, descender: I.descender, capHeight: I.capHeight, xHeight: I.xHeight, versionMajor: vMaj, versionMinor: vMin, openTypeNameDesigner: I.designer || '', openTypeNameDescription: I.description || '', openTypeHheaLineGap: I.lineGap || 0 })) });
  files.push({ name: dir + 'layercontents.plist', data: enc.encode(plistDoc([['public.default', 'glyphs']])) });
  files.push({ name: dir + 'glyphs/contents.plist', data: enc.encode(plistDoc(contents)) });
  const groups = {}, G = font.kgroups; const gname = (side, leader) => 'public.kern' + (side === 'L' ? 1 : 2) + '.' + (names[leader] || glyphName(leader));
  if (G) for (const side of ['L', 'R']) for (const m in G[side]) { const ld = G[side][m], gn = gname(side, ld); if (!names[m]) continue; (groups[gn] = groups[gn] || []).push(names[m]); }
  const kern = {};
  for (const key in font.kerning) { const v = Math.round(font.kerning[key]); if (!v) continue; const [l, r] = key.split('\t'); const gL = L.isGS(l), gR = L.isGS(r), a = gL ? gname('L', l.slice(1)) : names[l], b = gR ? gname('R', r.slice(1)) : names[r]; if (!a || !b || (gL && !groups[a]) || (gR && !groups[b])) continue; (kern[a] = kern[a] || {})[b] = v; }
  if (Object.keys(groups).length) files.push({ name: dir + 'groups.plist', data: enc.encode(plistDoc(groups)) });
  if (Object.keys(kern).length) files.push({ name: dir + 'kerning.plist', data: enc.encode(plistDoc(kern)) });
  let fea = ''; const byFeat = {};
  for (const k of font.order) { if (!isSpecial(k) || !font.glyphs[k].contours.length) continue; const si = specInfo(k); if (si.kind === 'liga') { if (si.seq.every(c => names[c])) (byFeat.liga = byFeat.liga || []).push(`  sub ${si.seq.map(c => names[c]).join(' ')} by ${names[k]};`); } else if (names[si.base] && /^(ss\d\d|salt|tnum|smcp)$/.test(si.feat)) (byFeat[si.feat] = byFeat[si.feat] || []).push(`  sub ${names[si.base]} by ${names[k]};`); }
  for (const f in byFeat) fea += `feature ${f} {\n${byFeat[f].join('\n')}\n} ${f};\n\n`;
  if (fea) files.push({ name: dir + 'features.fea', data: enc.encode(fea) });
  files.push({ name: dir + 'lib.plist', data: enc.encode(plistDoc({ 'public.glyphOrder': order })) });
  return files;
}

/* ---------- import helpers: point lists → nodes ---------- */
function ptsToContour(pts) { // pts: [{x,y,type:'line'|'curve'|'qcurve'|'offcurve'|'move', smooth}]
  if (pts.length < 2) return null; let open = pts[0].type === 'move';
  let st = pts.findIndex(p => p.type !== 'offcurve'); if (st < 0) return null;
  const P = open ? pts : pts.slice(st + 1).concat(pts.slice(0, st + 1));
  const nodes = []; let off = [];
  const first = open ? P[0] : P[P.length - 1];
  let prev = { x: first.x, y: first.y };
  const startNode = N(first.x, first.y); startNode.s = !!first.smooth;
  const list = open ? P.slice(1) : P;
  nodes.push(startNode);
  for (const p of list) {
    if (p.type === 'offcurve') { off.push(p); continue; }
    const nd = N(p.x, p.y); nd.s = !!p.smooth; const last = nodes[nodes.length - 1];
    if (off.length === 2 || (p.type === 'curve' && off.length >= 2)) { last.o = [off[0].x, off[0].y]; nd.i = [off[off.length - 1].x, off[off.length - 1].y]; }
    else if (off.length === 1) { const q = off[0]; last.o = [prev.x + (q.x - prev.x) * 2 / 3, prev.y + (q.y - prev.y) * 2 / 3]; nd.i = [p.x + (q.x - p.x) * 2 / 3, p.y + (q.y - p.y) * 2 / 3]; }
    else if (off.length > 2) { // quadratic spline with implied on-curves
      let a = prev; for (let i = 0; i < off.length; i++) { const q = off[i], b = i < off.length - 1 ? { x: (q.x + off[i + 1].x) / 2, y: (q.y + off[i + 1].y) / 2 } : p; const l = nodes[nodes.length - 1]; l.o = [a.x + (q.x - a.x) * 2 / 3, a.y + (q.y - a.y) * 2 / 3]; const m = i < off.length - 1 ? N(b.x, b.y) : nd; m.i = [b.x + (q.x - b.x) * 2 / 3, b.y + (q.y - b.y) * 2 / 3]; if (i < off.length - 1) { m.s = true; nodes.push(m); } a = b; }
    }
    off = []; nodes.push(nd); prev = p;
  }
  if (!open) { const a = nodes[0], b = nodes[nodes.length - 1]; if (Math.abs(a.x - b.x) < .01 && Math.abs(a.y - b.y) < .01) { a.i = b.i; a.s = b.s || a.s; nodes.pop(); } }
  return nodes.length > 1 ? roundC(nodes) : null;
}
function keyFromName(name, uni, byName) {
  if (uni != null) return String.fromCodePoint(uni);
  const m = name.match(/^(.+)\.(ss(?:0[1-9]|1\d|20)|salt|tnum|smcp)$/); if (m) { const b = byName[m[1]]; if (b) return 'alt:' + b + ':' + m[2]; }
  if (name.includes('_')) { const parts = name.split('_').map(p => byName[p]); if (parts.length > 1 && parts.every(Boolean) && parts.every(p => [...p].length === 1)) return 'liga:' + parts.join(''); }
  return null;
}
function importUFO(files) { // files: {path: Uint8Array}
  const dec = new TextDecoder(), paths = Object.keys(files), root = (paths.find(p => /(^|\/)[^/]*\.ufo\/metainfo\.plist$/i.test(p)) || paths.find(p => /(^|\/)metainfo\.plist$/.test(p)) || '').replace(/metainfo\.plist$/, '');
  const read = p => files[root + p] ? dec.decode(files[root + p]) : null, pl = p => { const t = read(p); return t ? parsePlistXML(t) : null; };
  if (!read('metainfo.plist')) throw new Error('UFO: metainfo.plist');
  const fi = pl('fontinfo.plist') || {}, lc = pl('layercontents.plist'), gdir = (lc && lc[0] && lc[0][1]) || 'glyphs', contents = pl(gdir + '/contents.plist') || {};
  const upm = fi.unitsPerEm || 1000, k = 1000 / upm;
  const font = { info: { familyName: fi.familyName || 'Imported', styleName: fi.styleName || 'Regular', designer: fi.openTypeNameDesigner || '', version: (fi.versionMajor != null ? fi.versionMajor + '.' + String(fi.versionMinor || 0).padStart(3, '0') : '1.000'), description: fi.openTypeNameDescription || '', upm: 1000, ascender: Math.round((fi.ascender || 750) * k), descender: Math.round((fi.descender || -250) * k), capHeight: Math.round((fi.capHeight || 700) * k), xHeight: Math.round((fi.xHeight || 500) * k), lineGap: 0 }, glyphs: {}, order: [], kerning: {} };
  const raw = {};
  for (const name in contents) {
    const t = read(gdir + '/' + contents[name]); if (!t) continue; const doc = new DOMParser().parseFromString(t, 'application/xml'), gl = doc.querySelector('glyph'); if (!gl) continue;
    const adv = +((doc.querySelector('advance') || {}).getAttribute ? (doc.querySelector('advance').getAttribute('width') || 0) : 0), un = doc.querySelector('unicode'), uni = un ? parseInt(un.getAttribute('hex'), 16) : null;
    const contours = []; for (const c of doc.querySelectorAll('outline > contour')) { const pts = [...c.querySelectorAll('point')].map(p => ({ x: +p.getAttribute('x') * k, y: +p.getAttribute('y') * k, type: p.getAttribute('type') || 'offcurve', smooth: p.getAttribute('smooth') === 'yes' })); const cc = ptsToContour(pts); if (cc) contours.push(cc); }
    const comps = [...doc.querySelectorAll('outline > component')].map(c => ({ base: c.getAttribute('base'), m: ['xScale', 'xyScale', 'yxScale', 'yScale', 'xOffset', 'yOffset'].map((a, i) => c.hasAttribute(a) ? +c.getAttribute(a) : (i === 0 || i === 3 ? 1 : 0)) }));
    raw[name] = { adv: adv * k, uni, contours, comps };
  }
  const resolve = (name, depth) => { const r = raw[name]; if (!r) return []; let cs = r.contours.map(cloneC); if (depth < 6) for (const c of r.comps) { const m = c.m; for (const sc of resolve(c.base, depth + 1)) cs.push(sc.map(n => { const T = p => [m[0] * p[0] + m[2] * p[1] + m[4] * k, m[1] * p[0] + m[3] * p[1] + m[5] * k]; const q = T([n.x, n.y]); return { x: q[0], y: q[1], s: n.s, i: n.i ? T(n.i) : null, o: n.o ? T(n.o) : null }; })); } return cs; };
  const byName = {}; for (const name in raw) if (raw[name].uni != null) byName[name] = String.fromCodePoint(raw[name].uni);
  for (const name in raw) { const key = keyFromName(name, raw[name].uni, byName); if (!key || font.glyphs[key]) continue; font.glyphs[key] = { u: isSpecial(key) ? null : raw[name].uni, name, adv: Math.round(raw[name].adv), contours: resolve(name, 0).map(roundC) }; font.order.push(key); byName[name] = byName[name] || key; }
  const plain = font.order.filter(k2 => !isSpecial(k2)).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)); font.order = plain.concat(font.order.filter(isSpecial));
  const groups = pl('groups.plist') || {}, kern = pl('kerning.plist') || {}, kg = { L: {}, R: {} }, gLeader = {};
  for (const gn in groups) { const m = gn.match(/^public\.kern([12])\.(.+)$/); if (!m) continue; const side = m[1] === '1' ? 'L' : 'R', mem = groups[gn].map(n => byName[n]).filter(Boolean); if (!mem.length) continue; gLeader[gn] = mem[0]; for (const c of mem) kg[side][c] = mem[0]; }
  for (const a in kern) for (const b in kern[a]) { const l = groups[a] ? (gLeader[a] ? '@' + gLeader[a] : null) : byName[a], r = groups[b] ? (gLeader[b] ? '@' + gLeader[b] : null) : byName[b]; if (l && r) font.kerning[l + '\t' + r] = Math.round(kern[a][b] * k); }
  if (Object.keys(kg.L).length || Object.keys(kg.R).length) font.kgroups = kg;
  return font;
}

/* ---------- Glyphs (.glyphs) import ---------- */
function parseOpenStep(text) {
  let i = 0; const s = text, ws = () => { for (;;) { while (i < s.length && /\s/.test(s[i])) i++; if (s.startsWith('//', i)) { while (i < s.length && s[i] !== '\n') i++; } else if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; } else break; } };
  const str = () => { if (s[i] === '"') { i++; let o = ''; while (i < s.length && s[i] !== '"') { if (s[i] === '\\') { i++; const c = s[i]; if (c === 'n') o += '\n'; else if (c === 'U' || c === 'u') { o += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16)); i += 4; } else o += c; } else o += s[i]; i++; } i++; return o; } let st = i; while (i < s.length && !/[\s;,=(){}]/.test(s[i])) i++; return s.slice(st, i); };
  const val = () => { ws(); if (s[i] === '{') { i++; const o = {}; for (;;) { ws(); if (s[i] === '}') { i++; return o; } const k = str(); ws(); if (s[i] === '=') { i++; o[k] = val(); } else o[k] = true; ws(); if (s[i] === ';') i++; } } if (s[i] === '(') { i++; const a = []; for (;;) { ws(); if (s[i] === ')') { i++; return a; } a.push(val()); ws(); if (s[i] === ',') i++; } } return str(); };
  return val();
}
function importGlyphs(text) {
  const o = parseOpenStep(text), v3 = String(o['.formatVersion'] || '') === '3', num = v => parseFloat(v) || 0, upm = num(o.unitsPerEm) || 1000, k = 1000 / upm;
  const m0 = (o.fontMaster || [])[0] || {}, mid = m0.id;
  let asc = num(m0.ascender) || 750, desc = num(m0.descender) || -250, cap = num(m0.capHeight) || 700, xh = num(m0.xHeight) || 500;
  if (Array.isArray(m0.metricValues) && Array.isArray(o.metrics)) o.metrics.forEach((mt, j) => { const v = m0.metricValues[j] && num(m0.metricValues[j].pos); const t = mt.type || mt.name; if (t === 'ascender') asc = v; if (t === 'descender') desc = v; if (t === 'cap height') cap = v; if (t === 'x-height') xh = v; });
  const font = { info: { familyName: o.familyName || 'Imported', styleName: m0.name || 'Regular', designer: o.designer || '', version: (o.versionMajor != null ? o.versionMajor + '.' + String(o.versionMinor || 0).padStart(3, '0') : '1.000'), description: '', upm: 1000, ascender: Math.round(asc * k), descender: Math.round(desc * k), capHeight: Math.round(cap * k), xHeight: Math.round(xh * k), lineGap: 0 }, glyphs: {}, order: [], kerning: {} };
  const raw = {};
  for (const g of o.glyphs || []) {
    const name = g.glyphname, lay = (g.layers || []).find(l => l.layerId === mid || l.associatedMasterId === undefined && l.layerId === mid) || (g.layers || [])[0]; if (!name || !lay) continue;
    let uni = null; if (g.unicode != null) { const u = Array.isArray(g.unicode) ? g.unicode[0] : g.unicode; uni = v3 ? parseInt(u, 10) : parseInt(String(u).split(',')[0], 16); if (!isFinite(uni)) uni = null; }
    const contours = [];
    for (const p of lay.paths || lay.shapes || []) {
      if (!p.nodes) continue; const pts = [];
      for (const nd of p.nodes) { let x, y, t, sm = false; if (Array.isArray(nd)) { x = num(nd[0]); y = num(nd[1]); t = String(nd[2] || 'l'); sm = t.endsWith('s'); t = t.replace(/s$/, ''); t = t === 'l' ? 'line' : t === 'c' ? 'curve' : t === 'q' ? 'qcurve' : 'offcurve'; } else { const parts = String(nd).trim().split(/\s+/); x = num(parts[0]); y = num(parts[1]); t = (parts[2] || 'LINE').toLowerCase(); sm = parts[3] === 'SMOOTH'; t = t === 'line' ? 'line' : t === 'curve' ? 'curve' : t === 'qcurve' ? 'qcurve' : 'offcurve'; } pts.push({ x: x * k, y: y * k, type: t, smooth: sm }); }
      if (p.closed === '0' || p.closed === 0) continue; const cc = ptsToContour(pts); if (cc) contours.push(cc);
    }
    const comps = (lay.components || (lay.shapes || []).filter(s => s.ref)).map(c => { let m = [1, 0, 0, 1, 0, 0]; if (c.transform) { const v = String(c.transform).replace(/[{}"]/g, '').split(',').map(num); if (v.length === 6) m = v; } if (c.pos) { m[4] = num(c.pos[0]); m[5] = num(c.pos[1]); } if (c.scale) { m[0] = num(c.scale[0]); m[3] = num(c.scale[1]); } return { base: c.name || c.ref, m }; });
    raw[name] = { adv: num(lay.width) * k, uni, contours, comps };
  }
  const byName = {}; for (const n in raw) if (raw[n].uni != null) byName[n] = String.fromCodePoint(raw[n].uni);
  const resolve = (name, depth) => { const r = raw[name]; if (!r) return []; const cs = r.contours.map(cloneC); if (depth < 6) for (const c of r.comps) { const m = c.m; for (const sc of resolve(c.base, depth + 1)) cs.push(sc.map(n => { const T = p => [m[0] * p[0] + m[2] * p[1] + m[4] * k, m[1] * p[0] + m[3] * p[1] + m[5] * k]; const q = T([n.x, n.y]); return { x: q[0], y: q[1], s: n.s, i: n.i ? T(n.i) : null, o: n.o ? T(n.o) : null }; })); } return cs; };
  for (const n in raw) { const key = keyFromName(n, raw[n].uni, byName); if (!key || font.glyphs[key]) continue; font.glyphs[key] = { u: isSpecial(key) ? null : raw[n].uni, name: n, adv: Math.round(raw[n].adv), contours: resolve(n, 0).map(roundC) }; font.order.push(key); }
  const plain = font.order.filter(x => !isSpecial(x)).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)); font.order = plain.concat(font.order.filter(isSpecial));
  const K = (o.kerning && (o.kerning[mid] || Object.values(o.kerning)[0])) || (o.kerningLTR && (o.kerningLTR[mid] || Object.values(o.kerningLTR)[0])) || {};
  const groupL = {}, groupR = {}; for (const g of o.glyphs || []) { const ch = byName[g.glyphname]; if (!ch) continue; if (g.rightKerningGroup || (g.kernRight)) (groupL[g.rightKerningGroup || g.kernRight] = groupL[g.rightKerningGroup || g.kernRight] || []).push(ch); if (g.leftKerningGroup || g.kernLeft) (groupR[g.leftKerningGroup || g.kernLeft] = groupR[g.leftKerningGroup || g.kernLeft] || []).push(ch); }
  const kg = { L: {}, R: {} }; for (const gn in groupL) for (const c of groupL[gn]) kg.L[c] = groupL[gn][0]; for (const gn in groupR) for (const c of groupR[gn]) kg.R[c] = groupR[gn][0];
  const side = (key, isL) => { if (key.startsWith('@MMK_L_')) { const m = groupL[key.slice(7)]; return m ? '@' + m[0] : null; } if (key.startsWith('@MMK_R_')) { const m = groupR[key.slice(7)]; return m ? '@' + m[0] : null; } const n = Object.keys(raw).find(nm => nm === key) ? key : (o.glyphs || []).find(g => g.id === key) ? (o.glyphs.find(g => g.id === key).glyphname) : key; return byName[n] || null; };
  for (const a in K) for (const b in K[a]) { const l = side(a, true), r = side(b, false); if (l && r) font.kerning[l + '\t' + r] = Math.round(num(K[a][b]) * k); }
  if (Object.keys(kg.L).length || Object.keys(kg.R).length) font.kgroups = kg;
  return font;
}

Object.assign(L, { knife, offsetContours, masterOf, overshootInfo, fixOvershoot, makeTnum, makeSmcp, problemPairs, WORDS, wordsFor, buildVarTTF, makeCOLR, makeCPAL, colorPlan, addNames, gifEncode, readZip, exportUFO, importUFO, importGlyphs, parseOpenStep, parsePlistXML, ptsToContour, isComp });
})(typeof window !== 'undefined' ? window : globalThis);
