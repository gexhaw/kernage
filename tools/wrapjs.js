// node wrapjs.js in.html out.html — keep every line short: split JS after ',' / ';' tokens, CSS data URLs with line continuations
const fs = require('fs'), acorn = require('../vendor/acorn.js');
const LIM = 300;
function splitJS(src) {
  const ins = []; let lineStart = 0;
  const tk = acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true, onComment: () => {} });
  for (const t of tk) {
    const nl = src.lastIndexOf('\n', t.start); if (nl >= lineStart) lineStart = nl + 1;
    if ((t.type.label === ',' || t.type.label === ';') && t.end - lineStart > LIM) { ins.push(t.end); lineStart = t.end; }
  }
  let out = '', p = 0; for (const i of ins) { out += src.slice(p, i) + '\n'; p = i; } return out + src.slice(p);
}
let h = fs.readFileSync(process.argv[2], 'utf8');
h = h.replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => { const s = splitJS(js); new Function(s); return '<script>' + s + '</script>'; });
h = h.replace(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g, (_, b) => 'url("data:font/woff2;base64,' + b.match(/.{1,300}/g).join('\\\n') + '")');
fs.writeFileSync(process.argv[3], h);
const lines = h.split('\n'); let mx = 0, at = 0; lines.forEach((l, i) => { if (l.length > mx) { mx = l.length; at = i + 1; } });
console.log('lines', lines.length, 'max', mx, 'at', at);
