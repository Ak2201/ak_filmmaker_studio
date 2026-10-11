#!/usr/bin/env node
/* ============================================================
   PRODUCTION SMOKE  —  node scripts/smoke-production.mjs
   ------------------------------------------------------------
   THE ONE LAYER THIS REPO DID NOT HAVE. Everything else tests a
   BUILD: `verify` serves dist/, every `prove:*` serves dist/, and
   CI never touches the live site. So the two worst incidents in
   this project's history were both invisible to a green pipeline:

   - 10 Oct 2026. `motion-app.js` threw `ReferenceError: HEADS is
     not defined` in every real browser. verify passed 21 pages,
     prove:gate 120, prove:growth 78, prove:billing 186 — all
     green, all blind, because the module is OFF under
     `navigator.webdriver` by design. Nobody could sign in to the
     live site for three hours.
   - 11 Oct 2026. The host moved to a new domain. Nothing in the
     repo could tell you whether the DEPLOYED html actually named
     it, because the gate diffs a local build against a local
     baseline and both would agree while production served a
     week-old bundle.

   This runs AFTER a deployment, against the real origin, over the
   real network. It is deliberately small: it answers "is the
   thing that is live the thing we think is live", not "is the app
   correct". The build gates already answer the second question
   and answer it far better.

   THE HOST IS DERIVED, NEVER TYPED. It comes from
   src/data/brand.json, the same single source every page title,
   meta tag and footer reads. A smoke test with the host written
   into it would pass on the day the host changed and fail for a
   week afterwards — which is exactly the rot that put the old
   address into ten documentation files.

   Usage:
     node scripts/smoke-production.mjs                 # the brand host
     SMOKE_BASE=https://staging.example npm run smoke  # somewhere else
     SMOKE_BROWSER=0 ...                               # skip the browser half

   Exit 0 = every check passed. Exit 1 = at least one failed, and
   the failures are printed last so CI's tail is useful.
   ============================================================ */
import { readFileSync } from 'node:fs';

const BRAND = JSON.parse(
  readFileSync(new URL('../src/data/brand.json', import.meta.url), 'utf8')
);
const HOST = BRAND.host;
const BASE = (process.env.SMOKE_BASE || `https://${HOST}`).replace(/\/$/, '');
const WANT_BROWSER = process.env.SMOKE_BROWSER !== '0';

const pass = [];
const fail = [];
const ok = (m) => { pass.push(m); console.log('  ✓ ' + m); };
const no = (m) => { fail.push(m); console.log('  ✗ ' + m); };

/* A deploy can be mid-flight when this fires, and a cold edge can
   be slow. Retry a few times before calling it a failure — a flaky
   smoke test gets muted, and a muted test is worse than none. */
async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return r;
      last = new Error(url + ' -> ' + r.status);
    } catch (e) { last = e; }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw last;
}

console.log(`\nproduction smoke -> ${BASE}`);
console.log(`expected host (from src/data/brand.json): ${HOST}\n`);

/* ---- 1. the public pages answer ---------------------------- */
console.log('the four public pages plus the hub');
const PUBLIC = ['/', '/start', '/privacy', '/terms', '/refund'];
for (const path of PUBLIC) {
  try {
    const r = await get(BASE + path);
    if (r.status === 200) ok(`${path} -> 200`);
    else no(`${path} -> ${r.status} (expected 200)`);
  } catch (e) { no(`${path} -> ${e.message}`); }
}

/* ---- 2. the deployed html names the right host -------------- */
console.log('\nthe DEPLOYED markup names the brand host');
let startHtml = '';
try {
  startHtml = await (await get(BASE + '/start')).text();
} catch (e) { no('could not read /start: ' + e.message); }

if (startHtml) {
  const canonical = (startHtml.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const ogUrl = (startHtml.match(/<meta property="og:url" content="([^"]+)"/) || [])[1];

  canonical && canonical.includes(HOST)
    ? ok(`canonical names ${HOST}: ${canonical}`)
    : no(`canonical is ${canonical || 'ABSENT'} — expected it to name ${HOST}`);

  ogUrl && ogUrl.includes(HOST)
    ? ok(`og:url names ${HOST}: ${ogUrl}`)
    : no(`og:url is ${ogUrl || 'ABSENT'} — expected it to name ${HOST}`);

  /* A STALE DEPLOY is the thing this catches. If production is still
     serving a build from before a host change, the page is perfectly
     valid and every local gate is green; only the live bytes differ. */
  const stale = startHtml.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g);
  stale
    ? no(`served html still names a .vercel.app host (stale deploy?): ${[...new Set(stale)].join(', ')}`)
    : ok('no .vercel.app host left in the served html');

  /* The brand plugin stamps {{brand:*}} at BUILD time. A literal one
     in production means the html was served without being built —
     which is exactly what GitHub Pages did from the repo root. */
  const raw = startHtml.match(/\{\{brand:[a-z|]+\}\}/g);
  raw
    ? no(`UNSTAMPED build placeholder in served html: ${[...new Set(raw)].join(', ')}`)
    : ok('no unstamped {{brand:*}} placeholder');
}

/* ---- 3. robots + sitemap agree with the same host ----------- */
console.log('\nrobots.txt and sitemap.xml agree');
try {
  const robots = await (await get(BASE + '/robots.txt')).text();
  const line = (robots.match(/^Sitemap:\s*(\S+)/m) || [])[1];
  line && line.includes(HOST)
    ? ok(`robots.txt Sitemap -> ${line}`)
    : no(`robots.txt Sitemap is ${line || 'ABSENT'} — expected it to name ${HOST}`);
} catch (e) { no('robots.txt: ' + e.message); }

try {
  const xml = await (await get(BASE + '/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const wrong = locs.filter((l) => !l.includes(HOST));
  if (!locs.length) no('sitemap.xml has no <loc> entries');
  else if (wrong.length) no(`sitemap.xml has ${wrong.length} <loc> not naming ${HOST}: ${wrong[0]}`);
  else ok(`sitemap.xml: all ${locs.length} <loc> name ${HOST}`);
} catch (e) { no('sitemap.xml: ' + e.message); }

/* ---- 4. the apex is canonical, www redirects to it ---------- */
console.log('\nthe apex is the one that serves');
if (BASE === `https://${HOST}`) {
  try {
    const r = await get(`https://www.${HOST}/start`);
    const loc = r.headers.get('location') || '';
    if (r.status === 308 && loc.includes(`https://${HOST}`)) ok(`www -> ${r.status} -> ${loc}`);
    else if (r.status === 200) no('www serves 200 — it should redirect to the apex, or every canonical url is a redirect');
    else no(`www -> ${r.status} ${loc}`);
  } catch (e) { no('www: ' + e.message); }
} else {
  console.log('  - skipped (SMOKE_BASE is not the brand host)');
}

/* ---- 5. a REAL browser, because that is the blind spot ------ */
if (WANT_BROWSER) {
  console.log('\na real browser (the only thing that sees a CORE throw)');
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('  - skipped (playwright not installed)');
    chromium = null;
  }
  if (chromium) {
    const browser = await chromium.launch();
    try {
      for (const path of ['/start', '/']) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 });
        await page.waitForTimeout(3500);   // let the lazy chunks land
        errors.length
          ? no(`${path}: ${errors.length} console error(s) — first: ${errors[0].slice(0, 180)}`)
          : ok(`${path}: no console errors`);
        await ctx.close();
      }
    } catch (e) {
      no('browser pass: ' + e.message);
    } finally {
      await browser.close();
    }
  }
}

/* ---- the verdict ------------------------------------------- */
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) {
  console.log('\nFAILED:');
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('production smoke: clean\n');
