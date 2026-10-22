/* ============================================================
   PROOF: one frame per page, however it is reached
   ------------------------------------------------------------
   Owner, 17 Oct 2026: "the UI changes depending on which page I
   navigated from — I want my UI to be the same when it is opened from
   any page." It did: the shell coloured a page from the hash it was
   ENTERED by, so contacts.html#call-sheets wore Production while
   contacts.html wore Pre-Production, Reports' DPR tab wore no stage at
   all, and the volume accent beat the stage accent on four pages.

   For every shell page this collects every href that names it — the
   modules and globals of navigation.json, each stage's lead (the
   dashboard and journey stage links), the bare file, and the in-page
   calls to action listed in CTAS below — and loads the page through
   each one in a FRESH context with a project, at 1280 and at 390
   (the viewport is set at creation, so matchMedia decides at load as a
   phone does). Per page, across every href at a width, these must be
   identical:

     html[data-phase]            the accent
     the lit rail stage          .sh-rail-stage.is-active
     the crumb's stage segment   .sh-where-phase
     the .sh-tools signature     the band's right-hand zone
     main h1 present             the header
     the tab layout              side | strip | none

   …and data-phase, the lit stage and the crumb stage must also agree
   ACROSS the two widths. Two more, per load: the tab shown is the one
   the hash names (when the hash names something inside a tab panel),
   and the runtime data-phase equals the one in the served .html, so the
   scripts-off first paint is the same colour; and the --accent the page
   computes is its stage's hue (a [data-volume] rule declared after the
   phase rules used to beat it on budget, preprod, drafts and the vault).

   Recorded, not asserted: the crumb's last segment (it follows the
   tab, by design) and main's computed max-width (the content width —
   another lane is unifying it).

   Run:  npm run build:open && npm run prove:nav
         PROVE_PORT (default 5361), PROVE_DIST (default dist),
         PW_CHROMIUM=<path> for a Chromium other than Playwright's own.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5361;
const BASE = `http://localhost:${PORT}/`;
const WIDTHS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];
const CONCURRENCY = Number(process.env.PROVE_CONCURRENCY) || 4;

/* In-page calls to action that land on another page with a section.
   Hand-listed because they live in page code, not in the map; a new
   one is a line here. */
const CTAS = [
  'contacts.html#call-sheets', 'contacts.html', 'reports.html#sides', 'reports.html?day=1#dpr',
  'reports.html#dpr', 'reports.html#kit', 'reports.html#oneliner',
  'breakdown.html', 'breakdown.html#scenes', 'breakdown.html#script', 'edit.html#log',
  'deliverables.html#checklist', 'screenplay.html#import', 'plan.html', 'budget.html',
  'preprod.html', 'drafts.html#title', 'story.html#pitch', 'vault.html'
];

/* ---- the open build, or nothing ------------------------------- */
{
  const idx = path.join(DIST, 'index.html');
  const stamp = fs.existsSync(idx) ? (fs.readFileSync(idx, 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1] : null;
  if (stamp !== 'off') {
    console.error(`✗ ${path.relative(ROOT, DIST)}/ was built with the site gate ${stamp ? 'ON' : 'unstamped'}; this proof loads pages signed out.`);
    console.error('  Build it with:  npm run build:open');
    process.exit(2);
  }
}

/* ---- every inbound href, grouped by the file it names --------- */
const nav = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));
const fileOf = (href) => String(href || '').split('#')[0].split('?')[0].toLowerCase();
const hrefs = new Set();
for (const p of nav.phases) {
  if (p.home && p.home.href) hrefs.add(p.home.href);
  for (const m of p.modules || []) if (m.href && m.status === 'built') hrefs.add(m.href);
  /* the stage's lead: what the rail icon, the crumb, the dashboard's
     stage card and the hub's door open (signed out, allowed() is open) */
  const lead = (p.modules || []).find((m) => m.status === 'built' && m.href);
  if (lead) hrefs.add(lead.href);
}
for (const g of nav.global) {
  if (g.href) hrefs.add(g.href);
  for (const m of g.modules || []) if (m.href) hrefs.add(m.href);
}
CTAS.forEach((c) => hrefs.add(c));
const byFile = new Map();
for (const h of hrefs) {
  const f = fileOf(h);
  if (!f || !fs.existsSync(path.join(DIST, f))) continue;
  if (!byFile.has(f)) byFile.set(f, new Set([f]));   // the bare file is always one way in
  byFile.get(f).add(h);
}

/* ---- the static attribute, as served -------------------------- */
const staticPhase = (f) => {
  const src = fs.readFileSync(path.join(DIST, f), 'utf8');
  const tag = (src.match(/<html\b[^>]*>/i) || [''])[0];
  const m = tag.match(/\bdata-phase="([^"]*)"/);
  return m ? m[1] : null;
};

/* ---- a static server for the build ---------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another> npm run prove:nav`);
  process.exit(2);
});

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const PIN = () => { try { localStorage.setItem('fms_region_v1', 'IN'); } catch (e) { /* private mode */ } };

/* One project, created the way verify creates it, then handed to every
   context as its storage. */
let seeded;
{
  const ctx = await browser.newContext({ viewport: WIDTHS[0] });
  await ctx.addInitScript(PIN);
  const page = await ctx.newPage();
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    if (window.StudioStore && !StudioStore.currentProject()) StudioStore.createProject({ title: 'Verification', format: 'feature' });
  });
  await page.waitForTimeout(300);
  seeded = await ctx.storageState();
  await ctx.close();
}

/* What the frame says, read off the page. */
const probe = () => {
  const de = document.documentElement;
  const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
  const tools = document.querySelector('.sh-tools');
  const sig = tools ? [...tools.children].map((c) => c.tagName.toLowerCase() + (c.id ? '#' + c.id : '')
    + [...c.classList].filter((k) => !/^(is-|has-)/.test(k)).sort().map((k) => '.' + k).join('')).join(' ') : null;
  const strip = document.querySelector('nav.tabs');
  const layout = document.querySelector('.tabs-has-side') || (strip && strip.classList.contains('tabs-side')) ? 'side' : strip ? 'strip' : 'none';
  const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  let tabOk = 'n/a';
  if (hash) {
    const el = document.getElementById(hash);
    const panel = el && (el.matches('[role="tabpanel"]') ? el : el.closest('[role="tabpanel"]'));
    if (!el) tabOk = 'no-target';
    else if (panel) tabOk = !panel.hidden && panel.getClientRects().length > 0 ? 'yes' : 'NO';
  }
  const main = document.querySelector('main');
  const seg = location.pathname.split('/').pop().toLowerCase();
  /* The accent the page actually wears is its stage's hue — not a
     [data-volume] rule declared later in tokens.css beating it. The
     stage's hue is read off a throwaway .sh-ph-<stage> probe. */
  let accentOk = 'n/a';
  const ph = de.getAttribute('data-phase');
  if (ph) {
    const t = document.createElement('span');
    t.className = 'sh-ph-' + ph;
    t.hidden = true;
    document.body.append(t);
    const want = getComputedStyle(t).getPropertyValue('--hue').trim();
    t.remove();
    const got = getComputedStyle(de).getPropertyValue('--accent').trim();
    accentOk = want && got === want ? 'yes' : 'NO (' + got + ' vs ' + want + ')';
  }
  return {
    file: !seg ? 'index.html' : /\.html$/.test(seg) ? seg : seg + '.html',
    phase: de.getAttribute('data-phase'),
    rail: [...document.querySelectorAll('.sh-rail-stage.is-active')].map((a) => a.dataset.phase).join(',') || null,
    crumbStage: txt('.sh-where-phase .sh-where-text'),
    crumbHere: txt('.sh-where-here .sh-where-text'),
    tools: sig,
    h1: !!document.querySelector('main h1'),
    h1Box: (() => { const e = document.querySelector('main h1'); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${Math.round(r.left)}px ${cs.fontSize} ${cs.fontWeight}`; })(),
    layout,
    tabOk,
    accentOk,
    mainMax: main ? getComputedStyle(main).maxWidth : null
  };
};

/* ---- load every (href, width) --------------------------------- */
const jobs = [];
for (const [file, set] of [...byFile.entries()].sort()) for (const href of set) for (const vp of WIDTHS) jobs.push({ file, href, vp });
const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const ctx = await browser.newContext({ viewport: job.vp, storageState: seeded });
    await ctx.addInitScript(PIN);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(BASE + job.href, { waitUntil: 'networkidle', timeout: 45000 });
      /* The shell defers some band controls (video-help.js) to the first
         real interaction, or 8s. Waiting for idle raced that timer, so a
         slow load read as a different band. Make the interaction happen,
         then wait for what it imported: every load sees the same band. */
      await page.mouse.move(2, 2);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      results.push({ ...job, ...(await page.evaluate(probe)), errors });
    } catch (e) {
      results.push({ ...job, error: String(e.message || e).split('\n')[0], errors });
    }
    await ctx.close();
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();
server.close();

/* ---- judge ---------------------------------------------------- */
const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);
const SAME_PER_WIDTH = ['phase', 'rail', 'crumbStage', 'tools', 'h1', 'layout'];
const SAME_ACROSS_WIDTHS = ['phase', 'rail', 'crumbStage'];
const table = [];
for (const file of [...byFile.keys()].sort()) {
  const mine = results.filter((r) => fileOf(r.href) === file);
  for (const r of mine) {
    if (r.error) { fail(file, `${r.href} @${r.vp.width}: ${r.error}`); continue; }
    if (r.file !== file) { fail(file, `${r.href} @${r.vp.width} landed on ${r.file}`); continue; }
    if (r.tabOk === 'NO') fail(file, `${r.href} @${r.vp.width}: the tab the hash names is not the one shown`);
    if (String(r.accentOk).startsWith('NO')) fail(file, `${r.href} @${r.vp.width}: --accent is not the stage's hue: ${r.accentOk}`);
    if (r.errors.length) fail(file, `${r.href} @${r.vp.width}: page error: ${r.errors[0]}`);
  }
  const ok = mine.filter((r) => !r.error && r.file === file);
  if (!ok.length) continue;
  for (const vp of WIDTHS) {
    const at = ok.filter((r) => r.vp.width === vp.width);
    for (const k of SAME_PER_WIDTH) {
      const vals = [...new Set(at.map((r) => JSON.stringify(r[k])))];
      if (vals.length > 1) {
        fail(file, `${k} differs by arrival @${vp.width}: ` + at.map((r) => `${r.href}=${JSON.stringify(r[k])}`).join('  '));
      }
    }
  }
  for (const k of SAME_ACROSS_WIDTHS) {
    const vals = [...new Set(ok.map((r) => JSON.stringify(r[k])))];
    if (vals.length > 1) fail(file, `${k} differs between 1280 and 390: ${vals.join(' vs ')}`);
  }
  const st = staticPhase(file);
  for (const r of ok) if (r.phase !== st) { fail(file, `runtime data-phase ${JSON.stringify(r.phase)} != static ${JSON.stringify(st)} (${r.href} @${r.vp.width})`); break; }
  const wide = ok.find((r) => r.vp.width === 1280) || ok[0];
  const narrow = ok.find((r) => r.vp.width === 390) || ok[0];
  table.push({
    page: file,
    hrefs: new Set(mine.map((r) => r.href)).size,
    phase: wide.phase || '—',
    static: st || '—',
    rail: wide.rail || '—',
    crumbStage: wide.crumbStage || '—',
    tabs: [...new Set(ok.map((r) => r.crumbHere || '—'))].join(' | ').slice(0, 60),
    h1: wide.h1Box && narrow.h1Box ? `${wide.h1Box} / ${narrow.h1Box}` : (wide.h1 ? 'yes' : 'NO'),
    layout: `${wide.layout}/${narrow.layout}`,
    toolsN: wide.tools ? wide.tools.split(' ').length : 0,
    mainMax: `${wide.mainMax}/${narrow.mainMax}`,
    ok: failures.some((f) => f.startsWith(file + ':')) ? 'FAIL' : 'ok'
  });
}
/* ---- one frame ACROSS pages ---------------------------------
   The same header in the same place on every studio page: an h1 that
   starts at one x, in one size and weight, per width. Screenplay keeps
   its full-width editor (no header, by owner decision); Settings and
   the console carry the side menu, so their column starts further in. */
const OWN_FRAME = new Set(['screenplay.html', 'settings.html', 'admin.html']);
for (const vp of WIDTHS) {
  const boxes = new Map();
  for (const r of results) {
    if (r.error || r.vp.width !== vp.width || OWN_FRAME.has(fileOf(r.href)) || r.file !== fileOf(r.href)) continue;
    if (!r.h1Box) { fail(r.file, `no main h1 @${vp.width} (${r.href})`); continue; }
    if (!boxes.has(r.h1Box)) boxes.set(r.h1Box, new Set());
    boxes.get(r.h1Box).add(r.file);
  }
  if (boxes.size > 1) fail('frame', `the page header differs between pages @${vp.width}: ` + [...boxes].map(([b, f]) => `${b} on ${[...f].join(',')}`).join('  |  '));
}
console.table(table);
console.log(`${results.length} loads across ${byFile.size} pages (${WIDTHS.map((w) => w.width).join(' and ')}px)`);
if (failures.length) {
  console.log(`\n✗ ${failures.length} mismatch(es):`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('✓ every page has one frame, whichever link opened it');
