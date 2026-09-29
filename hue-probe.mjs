import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const PORT = 5340;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const PAGES = ['index.html','feature.html','short.html','library.html','breakdown.html','stripboard.html',
  'reports.html','contacts.html','visualize.html','write.html','plan.html','study.html','dissect.html','dashboard.html'];
const THEMES = ['light','sepia','desk','dark'];
const SKINS = ['studio','press','binder','console','mission'];

const WALK = () => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const n = m[1].split(',').map((x) => parseFloat(x));
    return { c: [n[0], n[1], n[2]], a: n.length > 3 ? n[3] : 1 };
  };
  const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (!p || p.a === 0) continue;
      layers.push(p); if (p.a >= 1) break;
    }
    const base = parse(getComputedStyle(document.body).backgroundColor);
    if (!layers.length || layers[layers.length-1].a < 1) layers.push(base && base.a >= 1 ? base : { c:[255,255,255], a:1 });
    let out = layers[layers.length-1].c;
    for (let i = layers.length-2; i >= 0; i--) { const { c, a } = layers[i]; out = out.map((v,k) => c[k]*a + v*(1-a)); }
    return out;
  };
  const sel = (el) => {
    const bits = [];
    for (let n = el; n && n.tagName && bits.length < 3; n = n.parentElement) {
      const cls = (n.className || '').toString().split(/\s+/).filter(Boolean).slice(0,2).join('.');
      bits.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
    }
    return bits.join(' > ');
  };
  const out = [];
  const main = document.querySelector('main') || document.body;
  const tw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = tw.nextNode())) {
    const txt = (node.nodeValue || '').trim();
    if (!txt) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const eff = fg.a >= 1 ? fg.c : fg.c.map((v,k) => v*fg.a + bg[k]*(1-fg.a));
    const cr = ratio(eff, bg);
    if (cr >= 4.5) continue;
    const key = sel(el) + '|' + cs.color;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sel: sel(el), fg: cs.color, bg: 'rgb(' + bg.map(Math.round).join(',') + ')',
               ratio: Math.round(cr*100)/100, sample: txt.slice(0,28) });
  }
  return out;
};

const browser = await chromium.launch();
const all = new Map();
for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/${page}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => { if (window.StudioStore && !StudioStore.currentProject()) StudioStore.createProject({ title:'P', format:'feature' }); });
  await p.waitForTimeout(500);
  for (const theme of THEMES) {
    for (const skin of SKINS) {
      await p.evaluate(([t, s]) => {
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-skin', s);
        document.querySelectorAll('*').forEach((e) => { e.style.transition = 'none'; });
      }, [theme, skin]);
      await p.waitForTimeout(90);
      const rows = await p.evaluate(WALK);
      for (const r of rows) {
        const k = r.sel + '|' + r.fg;
        const prev = all.get(k);
        if (!prev || r.ratio < prev.ratio) all.set(k, { ...r, page, theme, skin });
      }
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

const rows = [...all.values()].sort((a, b) => a.ratio - b.ratio);
console.log('DISTINCT FAILING (selector, colour) PAIRS:', rows.length);
for (const r of rows) {
  console.log(`${String(r.ratio).padStart(5)}  ${r.fg.padEnd(22)} on ${r.bg.padEnd(18)} ${r.page}/${r.theme}/${r.skin}  ${r.sel}  "${r.sample}"`);
}
