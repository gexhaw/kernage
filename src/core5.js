/* Kernage core5: WOFF2 decoding and a fuller OpenType import (GPOS kerning of any size, GSUB alternates and ligatures). */
(function (G) {
  const L = G.Litera;

  /* ---------------- WOFF2 -> sfnt ---------------- */
  const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
  const isWOFF2 = buf => { const u = new Uint8Array(buf, 0, 4); return u[0] === 0x77 && u[1] === 0x4F && u[2] === 0x46 && u[3] === 0x32; };
  function Rd(u8, pos) { this.u = u8; this.p = pos || 0; }
  Rd.prototype = {
    u8() { if (this.p >= this.u.length) throw new Error('WOFF2: truncated data'); return this.u[this.p++]; },
    u16() { const v = (this.u[this.p] << 8) | this.u[this.p + 1]; this.p += 2; return v; },
    i16() { const v = this.u16(); return v & 0x8000 ? v - 0x10000 : v; },
    u32() { const v = ((this.u[this.p] << 24) >>> 0) + (this.u[this.p + 1] << 16) + (this.u[this.p + 2] << 8) + this.u[this.p + 3]; this.p += 4; return v; },
    b128() { let v = 0; for (let i = 0; i < 5; i++) { const b = this.u8(); if (i === 0 && b === 0x80) throw new Error('WOFF2: bad UIntBase128'); v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; } throw new Error('WOFF2: bad UIntBase128'); },
    u255() { const c = this.u8(); if (c === 253) return this.u16(); if (c === 255) return this.u8() + 253; if (c === 254) return this.u8() + 506; return c; },
    bytes(n) { if (this.p + n > this.u.length) throw new Error('WOFF2: truncated data'); const b = this.u.subarray(this.p, this.p + n); this.p += n; return b; },
  };
  function woff2ToSfnt(buf) {
    const dec = G.KernageBrotli; if (!dec) throw new Error('WOFF2 decoder is missing');
    const u = new Uint8Array(buf), r = new Rd(u, 4), flavor = r.u32(); r.u32(); const numTables = r.u16(); r.u16(); r.u32(); const compLen = r.u32(); r.p += 4 + 20;
    if (flavor === 0x74746366) throw new Error('WOFF2 font collections are not supported');
    const dir = [];
    for (let i = 0; i < numTables; i++) {
      const f = r.u8(), ti = f & 63, tv = f >> 6; let tag = KNOWN[ti];
      if (ti === 63) tag = String.fromCharCode(...r.bytes(4));
      const orig = r.b128(); const tr = (tag === 'glyf' || tag === 'loca') ? tv !== 3 : tv !== 0; const tl = tr ? r.b128() : orig;
      dir.push({ tag, orig, tr, tv, len: tl });
    }
    const data = dec(u.subarray(r.p, r.p + compLen)); let off = 0; const T = {};
    for (const d of dir) { d.data = data.subarray(off, off + d.len); off += d.len; T[d.tag] = d; }
    const out = [];
    let glyfRes = null;
    if (T.glyf && T.glyf.tr) glyfRes = rebuildGlyf(T.glyf.data);
    for (const d of dir) {
      if (d.tag === 'glyf' && glyfRes) out.push({ tag: 'glyf', data: glyfRes.glyf });
      else if (d.tag === 'loca' && glyfRes) out.push({ tag: 'loca', data: glyfRes.loca });
      else if (d.tag === 'hmtx' && d.tr) out.push({ tag: 'hmtx', data: rebuildHmtx(d.data, T, glyfRes) });
      else if (d.tag === 'head' && glyfRes) { const h = d.data.slice(); h[50] = 0; h[51] = glyfRes.indexFormat; out.push({ tag: 'head', data: h }); }
      else out.push({ tag: d.tag, data: d.data.slice() });
    }
    return L.buildSfntPub(flavor, out);
  }
  function rebuildGlyf(t) {
    const r = new Rd(t, 0); r.u16(); const opt = r.u16(), nG = r.u16(), indexFormat = r.u16();
    const sz = []; for (let i = 0; i < 7; i++) sz.push(r.u32());
    let p = r.p; const S = sz.map(n => { const s = new Rd(t, p); s.end = p + n; p += n; return s; });
    const [nC, nP, fl, gl, co, bb, ins] = S, bmLen = 4 * Math.floor((nG + 31) / 32), bbMap = t.subarray(bb.p, bb.p + bmLen); bb.p += bmLen;
    const glyphs = [], xMins = new Int16Array(nG);
    for (let i = 0; i < nG; i++) {
      const n = nC.i16(), hasBB = (bbMap[i >> 3] >> (7 - (i & 7))) & 1;
      if (n === 0) { glyphs.push(new Uint8Array(0)); continue; }
      if (n === -1) {
        const st = co.p; let more = true, hasIns = false;
        while (more) { const f = co.u16(); co.u16(); co.p += f & 1 ? 4 : 2; co.p += f & 8 ? 2 : f & 0x40 ? 4 : f & 0x80 ? 8 : 0; if (f & 0x100) hasIns = true; more = !!(f & 0x20); }
        const comp = t.subarray(st, co.p); let insB = null; if (hasIns) { const il = gl.u255(); insB = ins.bytes(il); }
        const b = [bb.i16(), bb.i16(), bb.i16(), bb.i16()]; xMins[i] = b[0];
        const o = new Uint8Array(10 + comp.length + (insB ? 2 + insB.length : 0)), dv = new DataView(o.buffer);
        dv.setInt16(0, -1); b.forEach((v, k) => dv.setInt16(2 + 2 * k, v)); o.set(comp, 10); if (insB) { dv.setUint16(10 + comp.length, insB.length); o.set(insB, 12 + comp.length); }
        glyphs.push(o); continue;
      }
      const ends = []; let tot = 0; for (let c = 0; c < n; c++) { tot += nP.u255(); ends.push(tot - 1); }
      const xs = new Int32Array(tot), ys = new Int32Array(tot), on = new Uint8Array(tot); let x = 0, y = 0;
      for (let k = 0; k < tot; k++) {
        const f = fl.u8(), fi = f & 0x7f; on[k] = f >> 7 ? 0 : 1; const ws = (fl2, v) => (fl2 & 1) ? v : -v; let dx, dy;
        if (fi < 10) { dx = 0; dy = ws(fi, ((fi & 14) << 7) + gl.u8()); }
        else if (fi < 20) { dx = ws(fi, (((fi - 10) & 14) << 7) + gl.u8()); dy = 0; }
        else if (fi < 84) { const b0 = fi - 20, b1 = gl.u8(); dx = ws(fi, 1 + (b0 & 0x30) + (b1 >> 4)); dy = ws(fi >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)); }
        else if (fi < 120) { const b0 = fi - 84; dx = ws(fi, 1 + (Math.floor(b0 / 12) << 8) + gl.u8()); dy = ws(fi >> 1, 1 + (((b0 % 12) >> 2) << 8) + gl.u8()); }
        else if (fi < 124) { const a = gl.u8(), b2 = gl.u8(), c = gl.u8(); dx = ws(fi, (a << 4) + (b2 >> 4)); dy = ws(fi >> 1, ((b2 & 0x0f) << 8) + c); }
        else { const a = gl.u8(), b = gl.u8(), c = gl.u8(), d = gl.u8(); dx = ws(fi, (a << 8) + b); dy = ws(fi >> 1, (c << 8) + d); }
        x += dx; y += dy; xs[k] = x; ys[k] = y;
      }
      const il = gl.u255(), insB = ins.bytes(il);
      let b; if (hasBB) b = [bb.i16(), bb.i16(), bb.i16(), bb.i16()]; else { let a = 1e9, c = 1e9, d = -1e9, e = -1e9; for (let k = 0; k < tot; k++) { a = Math.min(a, xs[k]); c = Math.min(c, ys[k]); d = Math.max(d, xs[k]); e = Math.max(e, ys[k]); } b = [a, c, d, e]; }
      xMins[i] = b[0];
      const o = new Uint8Array(10 + 2 * n + 2 + il + tot * 5), dv = new DataView(o.buffer); let q = 0;
      dv.setInt16(q, n); q += 2; b.forEach(v => { dv.setInt16(q, v); q += 2; }); ends.forEach(e => { dv.setUint16(q, e); q += 2; });
      dv.setUint16(q, il); q += 2; o.set(insB, q); q += il;
      for (let k = 0; k < tot; k++) o[q++] = on[k];
      let px = 0; for (let k = 0; k < tot; k++) { dv.setInt16(q, xs[k] - px); px = xs[k]; q += 2; }
      let py = 0; for (let k = 0; k < tot; k++) { dv.setInt16(q, ys[k] - py); py = ys[k]; q += 2; }
      glyphs.push(o);
    }
    let total = 0; const offs = []; for (const g of glyphs) { offs.push(total); total += (g.length + 3) & ~3; } offs.push(total);
    const glyf = new Uint8Array(total); glyphs.forEach((g, i) => glyf.set(g, offs[i]));
    // always long offsets: the rebuilt glyf is larger than the original (no flag/coordinate packing)
    const loca = new Uint8Array((nG + 1) * 4), lv = new DataView(loca.buffer);
    offs.forEach((o, i) => lv.setUint32(i * 4, o));
    return { glyf, loca, indexFormat: 1, xMins, nG };
  }
  function rebuildHmtx(t, T, gr) {
    const nH = new DataView(T.hhea.data.buffer, T.hhea.data.byteOffset).getUint16(34), nG = new DataView(T.maxp.data.buffer, T.maxp.data.byteOffset).getUint16(4);
    const r = new Rd(t, 0), fl = r.u8(), adv = []; for (let i = 0; i < nH; i++) adv.push(r.u16());
    const lsb = []; for (let i = 0; i < nH; i++) lsb.push(fl & 1 ? (gr ? gr.xMins[i] : 0) : r.i16());
    for (let i = nH; i < nG; i++) lsb.push(fl & 2 ? (gr ? gr.xMins[i] : 0) : r.i16());
    const o = new Uint8Array(nH * 4 + (nG - nH) * 2), dv = new DataView(o.buffer); let q = 0;
    for (let i = 0; i < nH; i++) { dv.setUint16(q, adv[i]); dv.setInt16(q + 2, lsb[i]); q += 4; }
    for (let i = nH; i < nG; i++) { dv.setInt16(q, lsb[i]); q += 2; }
    return o;
  }

  /* ---------------- OpenType layout readers ---------------- */
  function sfntTable(buf, tag) {
    const dv = new DataView(buf), n = dv.getUint16(4);
    for (let i = 0; i < n; i++) { const o = 12 + 16 * i; if (String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)) === tag) return new DataView(buf, dv.getUint32(o + 8), dv.getUint32(o + 12)); }
    return null;
  }
  function coverage(dv, o) {
    const f = dv.getUint16(o), out = [];
    if (f === 1) { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) out.push(dv.getUint16(o + 4 + 2 * i)); }
    else if (f === 2) { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) { const p = o + 4 + 6 * i, s = dv.getUint16(p), e = dv.getUint16(p + 2); for (let g = s; g <= e; g++) out.push(g); } }
    return out;
  }
  function classDef(dv, o) {
    const m = new Map(); if (!o) return m; const f = dv.getUint16(o);
    if (f === 1) { const s = dv.getUint16(o + 2), n = dv.getUint16(o + 4); for (let i = 0; i < n; i++) { const c = dv.getUint16(o + 6 + 2 * i); if (c) m.set(s + i, c); } }
    else if (f === 2) { const n = dv.getUint16(o + 2); for (let i = 0; i < n; i++) { const p = o + 4 + 6 * i, s = dv.getUint16(p), e = dv.getUint16(p + 2), c = dv.getUint16(p + 4); if (c) for (let g = s; g <= e; g++) m.set(g, c); } }
    return m;
  }
  // lookups referenced by the given features (DFLT/latn/cyrl, any language), with extension subtables resolved
  function featureLookups(dv, want, extType) {
    const sl = dv.getUint16(4), fl = dv.getUint16(6), ll = dv.getUint16(8), byFeat = {};
    const nF = dv.getUint16(fl), use = new Set(), nS = dv.getUint16(sl);
    // default language systems only: language-specific variants (TRK, NLD…) must not be mixed in
    for (let i = 0; i < nS; i++) { const so = sl + dv.getUint16(sl + 6 + 6 * i), dl = dv.getUint16(so), nl = dv.getUint16(so + 2), lo = dl ? so + dl : nl ? so + dv.getUint16(so + 8) : 0; if (!lo) continue;
      const req = dv.getUint16(lo + 2), n = dv.getUint16(lo + 4); if (req !== 0xffff) use.add(req); for (let j = 0; j < n; j++) use.add(dv.getUint16(lo + 6 + 2 * j)); }
    for (let i = 0; i < nF; i++) { if (!use.has(i)) continue; const tag = String.fromCharCode(...[0, 1, 2, 3].map(k => dv.getUint8(fl + 2 + 6 * i + k))); if (!want(tag)) continue; const fo = fl + dv.getUint16(fl + 6 + 6 * i), n = dv.getUint16(fo + 2); for (let j = 0; j < n; j++) (byFeat[tag] = byFeat[tag] || new Set()).add(dv.getUint16(fo + 4 + 2 * j)); }
    const nL = dv.getUint16(ll), lookup = idx => {
      if (idx >= nL) return null; const lo = ll + dv.getUint16(ll + 2 + 2 * idx); let type = dv.getUint16(lo); const n = dv.getUint16(lo + 4), subs = [];
      for (let j = 0; j < n; j++) { let so = lo + dv.getUint16(lo + 6 + 2 * j); if (type === extType && dv.getUint16(so) === 1) { const et = dv.getUint16(so + 2); so = so + dv.getUint32(so + 4); subs.push({ o: so, type: et }); } else subs.push({ o: so, type }); }
      return subs;
    };
    return { byFeat, lookup };
  }
  const vrSize = f => { let n = 0; for (let b = 0; b < 8; b++) if (f & (1 << b)) n++; return 2 * n; };
  const xAdv = (dv, o, f) => { if (!(f & 4)) return (f & 1) ? 0 : 0; let p = o; if (f & 1) p += 2; if (f & 2) p += 2; return dv.getInt16(p); };
  function readKerning(buf, keyOf) {
    const dv = sfntTable(buf, 'GPOS'); if (!dv) return null;
    const { byFeat, lookup } = featureLookups(dv, t => t === 'kern', 9); const idxs = [...(byFeat.kern || [])].sort((a, b) => a - b); if (!idxs.length) return null;
    const total = new Map(), groupsL = {}, groupsR = {};
    for (const li of idxs) {
      const subs = lookup(li) || [], seen = new Map();
      for (const s of subs) {
        if (s.type !== 2) continue; const o = s.o, fmt = dv.getUint16(o), cov = coverage(dv, o + dv.getUint16(o + 2)), vf1 = dv.getUint16(o + 4), vf2 = dv.getUint16(o + 6), s1 = vrSize(vf1), s2 = vrSize(vf2);
        if (fmt === 1) {
          const n = dv.getUint16(o + 8);
          for (let i = 0; i < n && i < cov.length; i++) { const a = keyOf(cov[i]); if (a == null) continue; const ps = o + dv.getUint16(o + 10 + 2 * i), m = dv.getUint16(ps);
            for (let j = 0; j < m; j++) { const pr = ps + 2 + j * (2 + s1 + s2), b = keyOf(dv.getUint16(pr)); if (b == null) continue; const key = a + '\t' + b; if (!seen.has(key)) seen.set(key, xAdv(dv, pr + 2, vf1)); } }
        } else if (fmt === 2) {
          const c1 = classDef(dv, dv.getUint16(o + 8) ? o + dv.getUint16(o + 8) : 0), c2 = classDef(dv, dv.getUint16(o + 10) ? o + dv.getUint16(o + 10) : 0), n1 = dv.getUint16(o + 12), n2 = dv.getUint16(o + 14), rec = s1 + s2;
          const members2 = new Map(); let rest2 = null;
          for (const [g, c] of c2) { const k = keyOf(g); if (k == null) continue; if (!members2.has(c)) members2.set(c, []); members2.get(c).push(k); }
          const all = () => { if (!rest2) { rest2 = []; for (const [g, k] of keyOf.all) if (!c2.has(g)) rest2.push(k); } return rest2; };
          for (const g of cov) { const a = keyOf(g); if (a == null) continue; const cl1 = c1.get(g) || 0; if (cl1 >= n1) continue;
            if (!groupsL[a]) groupsL[a] = 'L' + li + '_' + o + '_' + cl1;
            for (let cl2 = 0; cl2 < n2; cl2++) { const v = xAdv(dv, o + 16 + (cl1 * n2 + cl2) * rec, vf1); const list = cl2 ? (members2.get(cl2) || []) : (v ? all() : []);
              for (const b of list) { const key = a + '\t' + b; if (!seen.has(key)) seen.set(key, v); } }
          }
          for (const [g, c] of c2) { const k = keyOf(g); if (k != null && !groupsR[k]) groupsR[k] = 'R' + li + '_' + o + '_' + c; }
        }
      }
      for (const [k, v] of seen) if (v) total.set(k, (total.get(k) || 0) + v);
    }
    return { pairs: total, groupsL, groupsR };
  }
  const ALT_FEATS = /^(ss(?:0[1-9]|1\d|20)|salt|tnum|smcp)$/;
  function readSubs(buf) {
    const dv = sfntTable(buf, 'GSUB'); if (!dv) return { singles: [], ligas: [] };
    const { byFeat, lookup } = featureLookups(dv, t => ALT_FEATS.test(t) || t === 'liga', 7), singles = [], ligas = [];
    for (const tag in byFeat) for (const li of byFeat[tag]) for (const s of lookup(li) || []) {
      const o = s.o, fmt = dv.getUint16(o);
      if (s.type === 1 && tag !== 'liga') { const cov = coverage(dv, o + dv.getUint16(o + 2));
        if (fmt === 1) { const d = dv.getInt16(o + 4); cov.forEach(g => singles.push([tag, g, (g + d) & 0xffff])); }
        else if (fmt === 2) { const n = dv.getUint16(o + 4); cov.forEach((g, i) => { if (i < n) singles.push([tag, g, dv.getUint16(o + 6 + 2 * i)]); }); } }
      else if (s.type === 3 && ALT_FEATS.test(tag) && fmt === 1) { const cov = coverage(dv, o + dv.getUint16(o + 2)), n = dv.getUint16(o + 4); cov.forEach((g, i) => { if (i >= n) return; const as = o + dv.getUint16(o + 6 + 2 * i); if (dv.getUint16(as)) singles.push([tag, g, dv.getUint16(as + 2)]); }); }
      else if (s.type === 4 && tag === 'liga' && fmt === 1) { const cov = coverage(dv, o + dv.getUint16(o + 2)), n = dv.getUint16(o + 4);
        cov.forEach((g, i) => { if (i >= n) return; const ls = o + dv.getUint16(o + 6 + 2 * i), m = dv.getUint16(ls);
          for (let j = 0; j < m; j++) { const lo = ls + dv.getUint16(ls + 2 + 2 * j), lig = dv.getUint16(lo), cc = dv.getUint16(lo + 2), comp = [g]; for (let q = 1; q < cc; q++) comp.push(dv.getUint16(lo + 2 + 2 * q)); ligas.push([lig, comp]); } }); }
    }
    return { singles, ligas };
  }

  /* ---------------- import wrapper ---------------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], addv = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, s) => [a[0] * s, a[1] * s];
  function outline(g, k) {
    const contours = []; let cur = null, last = null;
    for (const c of g.path.commands) {
      if (c.type === 'M') { cur = [L.N(c.x * k, c.y * k)]; contours.push(cur); last = [c.x * k, c.y * k]; }
      else if (!cur) continue;
      else if (c.type === 'L') { cur.push(L.N(c.x * k, c.y * k)); last = [c.x * k, c.y * k]; }
      else if (c.type === 'C') { cur[cur.length - 1].o = [c.x1 * k, c.y1 * k]; const n = L.N(c.x * k, c.y * k); n.i = [c.x2 * k, c.y2 * k]; cur.push(n); last = [n.x, n.y]; }
      else if (c.type === 'Q') { const p0 = last, q = [c.x1 * k, c.y1 * k], p = [c.x * k, c.y * k]; cur[cur.length - 1].o = addv(p0, mul(sub(q, p0), 2 / 3)); const n = L.N(p[0], p[1]); n.i = addv(p, mul(sub(q, p), 2 / 3)); cur.push(n); last = p; }
      else if (c.type === 'Z' && cur.length > 1) { const a = cur[0], b = cur[cur.length - 1]; if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) { a.i = b.i; cur.pop(); } }
    }
    return contours.filter(c => c.length > 1).map(c => L.roundC(L.autoSmooth(c)));
  }
  // Group kerning that reproduces the flat pairs exactly: the most common value per group pair, plus exceptions (including explicit zeros)
  function exactCollapse(flat, GL, GR) {
    const gk = (l, r) => (GL[l] ? '@' + GL[l] : l) + '\t' + (GR[r] ? '@' + GR[r] : r), votes = new Map();
    for (const key in flat) { const i = key.indexOf('\t'), k2 = gk(key.slice(0, i), key.slice(i + 1)); let m = votes.get(k2); if (!m) votes.set(k2, m = new Map()); m.set(flat[key], (m.get(flat[key]) || 0) + 1); }
    const memL = {}, memR = {}; for (const c in GL) (memL[GL[c]] = memL[GL[c]] || []).push(c); for (const c in GR) (memR[GR[c]] = memR[GR[c]] || []).push(c);
    const out = {};
    for (const [k2, m] of votes) {
      const i = k2.indexOf('\t'), a = k2.slice(0, i), b = k2.slice(i + 1); let best = 0, bc = -1; for (const [v, c] of m) if (c > bc) { bc = c; best = v; }
      const ls = a[0] === '@' && a.length > 1 ? memL[a.slice(1)] : [a], rs = b[0] === '@' && b.length > 1 ? memR[b.slice(1)] : [b];
      if (ls.length * rs.length === 1) { out[ls[0] + '\t' + rs[0]] = best; continue; }
      out[k2] = best;
      for (const l of ls) for (const r of rs) { const v = flat[l + '\t' + r] || 0; if (v !== best) out[l + '\t' + r] = v; }
    }
    return out;
  }
  const baseImport = L.importOT;
  function importOT(buffer) {
    let woff2 = false; if (isWOFF2(buffer)) { buffer = woff2ToSfnt(buffer); woff2 = true; }
    const font = baseImport(buffer), ot = font.__ot, k = font.__k, gidKey = new Map(Object.entries(font.__byIndex).map(([g, c]) => [+g, c]));
    const stats = { woff2, alts: 0, ligas: 0, kern: 0 };
    let buf = buffer; if (!(buf instanceof ArrayBuffer)) buf = buf.buffer;
    // alternates and ligatures (glyphs without Unicode)
    try {
      const { singles, ligas } = readSubs(buf);
      for (const [tag, from, to] of singles) { const base = gidKey.get(from); if (base == null || [...base].length !== 1 || gidKey.has(to)) continue; const key = 'alt:' + base + ':' + tag; if (font.glyphs[key]) continue;
        const g = ot.glyphs.get(to); if (!g) continue; font.glyphs[key] = { u: null, name: L.glyphName(key), adv: Math.round(g.advanceWidth * k), contours: outline(g, k) }; font.order.push(key); gidKey.set(to, key); stats.alts++; }
      for (const [lig, comp] of ligas) { const chars = comp.map(g => gidKey.get(g)); if (chars.some(c => c == null || [...c].length !== 1) || gidKey.has(lig)) continue; const key = 'liga:' + chars.join(''); if (font.glyphs[key]) continue;
        const g = ot.glyphs.get(lig); if (!g) continue; font.glyphs[key] = { u: null, name: L.glyphName(key), adv: Math.round(g.advanceWidth * k), contours: outline(g, k) }; font.order.push(key); gidKey.set(lig, key); stats.ligas++; }
    } catch (e) { console.warn('GSUB import', e); }
    // kerning: GPOS (any size), then the old kern table
    try {
      const keyOf = g => gidKey.has(g) ? gidKey.get(g) : null; keyOf.all = gidKey;
      const r = readKerning(buf, keyOf);
      if (r && r.pairs.size) {
        const flat = {}; for (const [key, v] of r.pairs) { const s = Math.round(v * k); if (s) flat[key] = s; }
        font.kerning = flat; stats.kern = Object.keys(flat).length;
        if (stats.kern > 3000 && L.collapseKerning) {
          const name = m => { const by = {}; for (const ch in m) (by[m[ch]] = by[m[ch]] || []).push(ch); const out = {}; for (const id in by) { if (by[id].length < 2) continue; const nm = by[id][0]; for (const ch of by[id]) out[ch] = nm; } return out; };
          const GL = name(r.groupsL), GR = name(r.groupsR); font.kgroups = { L: GL, R: GR }; font.kerning = exactCollapse(flat, GL, GR);
        }
      } else if (ot.kerningPairs && Object.keys(ot.kerningPairs).length) {
        const flat = {}; for (const p in ot.kerningPairs) { const [a, b] = p.split(',').map(Number), ka = keyOf(a), kb = keyOf(b); if (ka == null || kb == null) continue; const s = Math.round(ot.kerningPairs[p] * k); if (s) flat[ka + '\t' + kb] = s; }
        font.kerning = flat; stats.kern = Object.keys(flat).length;
      } else stats.kern = Object.keys(font.kerning).length;
    } catch (e) { console.warn('GPOS import', e); }
    Object.defineProperty(font, '__stats', { value: stats });
    return font;
  }
  Object.assign(L, { importOT, woff2ToSfnt, isWOFF2 });
})(typeof window !== 'undefined' ? window : globalThis);
