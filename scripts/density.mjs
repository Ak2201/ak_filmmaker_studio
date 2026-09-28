/* ============================================================
   DENSITY REPORT — quantify "cluttered"
   ------------------------------------------------------------
   Not a gate. `npm run verify` decides whether the build is
   correct; this decides nothing. It exists because "the UI is too
   busy" is the one complaint that gets argued rather than measured,
   and an argument about taste that nobody can settle is an argument
   that gets relitigated every redesign.

   Run it before a design pass and after. The number that carried the
   most signal was `panels`: elements drawn with a 3px+ coloured rule
   down the left. The feature page had 182 of them and the one page
   already in the new language had 1.

   Read the numbers knowing what they cannot see:
     panels    counts the motif, not whether the colour MEANS
               anything. 50 survive on the feature page and they are
               meant to: 24 formula slabs, one per step, plus the
               worked examples, whose hue says which film.
     maxNest   counts surfaces inside surfaces, so a <textarea> in a
               <td> in a table reads as depth 4 and is not clutter.
     bgs       counts every distinct background, including six phase
               dots and the semantic ok/warn/danger.
   A metric worth keeping is one whose blind spots are written down.
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/arun-9285/filmmakers-studio';
const DIST = path.join(ROOT, 'dist');
const PORT = 5399;
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff2':'font/woff2' };
const server = http.createServer((req,res)=>{
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p,'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(p)]||'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(PORT,r));

const browser = await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
const PAGES=['index.html','feature.html','short.html','library.html','breakdown.html'];
const rows=[];
for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport:{width:1280,height:800} });
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/${page}`, { waitUntil:'networkidle' });
  await pg.waitForTimeout(700);
  // dismiss any modal so measurements see the page
  await pg.evaluate(()=>{ document.querySelectorAll('.modal-backdrop,.modal,[role="dialog"]').forEach(m=>m.remove()); });
  const m = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('#app *')];
    const isPanel = (el) => {
      const cs = getComputedStyle(el);
      const lw = parseFloat(cs.borderLeftWidth)||0;
      const tw = parseFloat(cs.borderTopWidth)||0;
      return lw >= 3 && lw > tw;      // the "coloured left rule" motif
    };
    const hasSurface = (el) => {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const opaque = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const bordered = ['borderTopWidth','borderLeftWidth','borderRightWidth','borderBottomWidth']
        .some(k => (parseFloat(cs[k])||0) > 0);
      return (opaque || bordered) && el.getBoundingClientRect().width > 80;
    };
    const panels = els.filter(isPanel);
    // deepest chain of surfaces inside surfaces
    let maxNest = 0;
    for (const el of els) {
      if (!hasSurface(el)) continue;
      let n = 1, p = el.parentElement;
      while (p && p.id !== 'app') { if (hasSurface(p)) n++; p = p.parentElement; }
      if (n > maxNest) maxNest = n;
    }
    const bgs = new Set(), colours = new Set(), sizes = new Set(), fams = new Set();
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bgs.add(cs.backgroundColor);
      if (el.textContent && el.children.length === 0 && el.textContent.trim()) {
        colours.add(cs.color); sizes.add(cs.fontSize); fams.add(cs.fontFamily.split(',')[0]);
      }
    }
    // sticky/fixed chrome that eats the viewport
    let chromePx = 0; const bars = [];
    for (const el of [...document.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height === 0 || r.height > 220) continue;
      if (r.top < -10) continue;                       // offscreen skip links
      chromePx += r.height; bars.push({ cls: (el.className||'').toString().split(' ')[0], h: Math.round(r.height) });
    }
    // how far down the page is the first thing you can type in
    const tb = document.querySelector('.toolbar');
    const shl = document.querySelector('.sh-shell');
    const toolbarH = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
    const shellH = shl ? Math.round(shl.getBoundingClientRect().height) : 0;
    const field = document.querySelector('#app input:not([type=hidden]), #app textarea, #app select');
    const firstFieldY = field ? Math.round(field.getBoundingClientRect().top + scrollY) : null;
    const firstHeadingY = (() => { const hs=[...document.querySelectorAll('#app h1,#app h2')]; return hs[0]?Math.round(hs[0].getBoundingClientRect().top+scrollY):null; })();
    return {
      panels: panels.length, maxNest,
      bgs: bgs.size, textColours: colours.size, fontSizes: sizes.size, families: fams.size,
      chromePx: Math.round(chromePx), bars, toolbarH, shellH,
      firstFieldY, firstHeadingY,
      docHeight: Math.round(document.documentElement.scrollHeight)
    };
  });
  rows.push({ page, ...m });
  await ctx.close();
}
await browser.close(); server.close();
console.log(JSON.stringify(rows, null, 2));
