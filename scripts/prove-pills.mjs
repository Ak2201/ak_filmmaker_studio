/* ============================================================
   PROOF: every explainer trigger in the built pages is THE pill
   ------------------------------------------------------------
   Owner, 31 Oct 2026: every "What is …?" is one kit pill (icon + a
   question, src/ui/learn-pill.js). On the Dragon sample, page by page:
     - every `.learn-pill` also carries `.learn`, a `help` icon and a label;
     - the label reads "What is / What are …?" unless the pill is declared
       exempt (data-pill-exempt: "Why?", "Who can see this budget?", …);
     - none of the retired triggers is left: .learn-q, .fg-why-btn,
       .lib-term-more, and no <button data-learn> that is not a pill;
     - every data-learn id on a pill is a topic in src/data/learn.json;
     - the pill's text meets AA 4.5:1 against its own fill, at rest;
     - at 390 nothing overflows sideways;
     - under an emulated coarse pointer (touch) every visible pill is 44px
       tall at least.
   Pages that must hold a pill are listed in MUST; the rest are only
   checked when they have one.

       npm run build:open && npm run prove:pills
       (PROVE_DIST picks the build, default dist; PROVE_PORT the port,
        default 5399; PW_CHROMIUM a Chromium)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5399;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'story.html'))) {
  console.error(`prove:pills: no build at ${DIST} — run npm run build:open (or build:verify with PROVE_DIST=dist-verify)`);
  process.exit(2);
}
const TOPIC_IDS = new Set(JSON.parse(fs.readFileSync('src/data/learn.json', 'utf8')).topics.map((t) => t.id));

const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((resolve) => {
  server.once('error', (e) => {
    console.error(`prove:pills: port ${PORT} is taken (${e.code}); set PROVE_PORT to a free one`);
    process.exit(2);
  });
  server.listen(PORT, resolve);
});

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

/* page, selector to wait for, whether a pill MUST be there */
const PAGES = [
  ['story.html#path-bible', 'main section.st-step', true],
  ['story.html#path-outline', 'main section.st-step', true],
  ['feature.html?stay=1', '.why-pop', true],
  ['budget.html', '#estimate', true],
  ['library.html#glossary', '#libTerms .lib-term', true],
  ['stripboard.html', 'main', false],
  ['reports.html', 'main', false],
  ['contacts.html', 'main', false],
  ['breakdown.html', 'main', false],
  ['visualize.html', 'main', false],
  ['screenplay.html', 'main', false]
];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const url = (p) => `http://localhost:${PORT}/${p}`;

/* the facts about every pill on the page, read in the page */
const audit = () => {
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/) || s.match(/color\(srgb ([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); const srgb = /srgb/.test(s); return [srgb ? p[0] * 255 : p[0], srgb ? p[1] * 255 : p[1], srgb ? p[2] * 255 : p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const bgOf = (el) => {
    let acc = [255, 255, 255];
    const chain = [];
    for (let e = el; e; e = e.parentElement) chain.push(e);
    for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) acc = over(c, acc); }
    return acc;
  };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const pills = [...document.querySelectorAll('.learn-pill')];
  const out = {
    count: pills.length,
    notLearn: [], noIcon: [], badLabel: [], unknownTopic: [], lowContrast: [], short: [],
    retired: document.querySelectorAll('.learn-q, .fg-why-btn, .lib-term-more').length,
    strayButtons: [...document.querySelectorAll('button[data-learn]:not(.learn-pill)')].map((b) => b.dataset.learn),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
  for (const b of pills) {
    const label = (b.querySelector('.learn-pill-label') || {}).textContent || '';
    const name = label.slice(0, 30);
    if (!b.classList.contains('learn')) out.notLearn.push(name);
    const ic = b.querySelector('.learn-pill-ic');
    if (!ic || ic.textContent.trim() !== 'help' || ic.getAttribute('aria-hidden') !== 'true') out.noIcon.push(name);
    if (!/^What (is|are) /.test(label) && !b.hasAttribute('data-pill-exempt')) out.badLabel.push(name);
    if (b.dataset.learn && !window.__topics.includes(b.dataset.learn)) out.unknownTopic.push(b.dataset.learn);
    if (!vis(b)) continue;
    const fg = parse(getComputedStyle(b).color);
    const bg = bgOf(b);
    const L1 = lum(over(fg, bg)); const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < 4.5) out.lowContrast.push(name + ' ' + ratio.toFixed(2));
    out.short.push(Math.round(b.getBoundingClientRect().height));
  }
  return out;
};

async function run(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript((ids) => { window.__topics = ids; }, [...TOPIC_IDS]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  const btn = await page.$('[data-action="sample-project"]');
  if (btn) {
    await Promise.all([page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {}), btn.click()]);
    await page.waitForFunction(() => {
      const S = window.StudioStore; const p = S && S.currentProject();
      return !!p && JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes?.length > 10;
    }, null, { timeout: 15000 }).catch(() => {});
  } else {
    await page.evaluate(() => { const S = window.StudioStore; if (!S.currentProject()) S.createProject({ title: 'Pills', format: 'feature' }); });
  }
  for (const [p, wait, must] of PAGES) {
    const at = `${label} ${p}: `;
    await page.goto(url(p), { waitUntil: 'networkidle' });
    await page.waitForSelector(wait, { timeout: 15000, state: 'attached' }).catch(() => {});
    await page.waitForTimeout(1200);
    const a = await page.evaluate(audit);
    console.log('      pills on ' + p + ': ' + a.count);
    if (must) check(at + 'it holds a pill', a.count > 0, true);
    check(at + 'every pill is .learn + .learn-pill', a.notLearn, []);
    check(at + 'every pill has the help icon', a.noIcon, []);
    check(at + 'labels read "What is / What are" unless declared exempt', a.badLabel, []);
    check(at + 'every data-learn id is a topic', a.unknownTopic, []);
    check(at + 'no retired trigger is left', [a.retired, a.strayButtons], [0, []]);
    check(at + 'pill text meets AA 4.5:1', a.lowContrast, []);
    if (ctxOpts.hasTouch) check(at + 'every visible pill is 44px or more', a.short.filter((h) => h < 44), []);
    if (ctxOpts.viewport.width <= 390) check(at + 'no sideways overflow', a.overflow, false);
  }
  check(label + ' no page errors', errors, []);
  await ctx.close();
}

await run('1440 mouse:', { viewport: { width: 1440, height: 900 } });
await run('390 touch:', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await browser.close();
server.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall pill checks passed');
