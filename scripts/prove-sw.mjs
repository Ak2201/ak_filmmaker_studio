/* ============================================================
   PROOF: the service worker, against a host that REDIRECTS.
   ------------------------------------------------------------
   `npm run verify` cannot see any of this — its Chromium context has
   no worker, and a route sweep cannot either, because HTTP is not
   where it fails. CLAUDE.md records the day it cost: vercel.json sets
   `cleanUrls`, so `/page.html` answers 308 → `/page`; the worker
   precached every HTML page through that redirect, Cache.put accepted
   the redirected response without a word, and the next navigation to
   a typed `.html` URL was ERR_FAILED — "a redirected response was
   used for a request whose redirect mode is not 'follow'". curl said
   the site was fine. It was not.

   So this script does the one thing neither of those tools can: it
   serves the build the way the PRODUCTION host does, and opens it in
   a browser that has the worker installed.

   The server is tiny and deliberately reproduces vercel.json rather
   than guessing at it: `cleanUrls` (308 from `/x.html` to `/x`, and
   `/x` serves x.html), `trailingSlash: false`, and the file's own
   `redirects` and `rewrites`, read from the file. `vite preview`
   would have been the easy choice and it does NOT do cleanUrls, which
   is the whole point.

   Asserted:
     (a) the worker installs and activates, and the precache holds
         every manifest URL except the arunak-*.html redirect stubs
     (b) typed `.html` URLs resolve THROUGH the worker — no ERR_FAILED,
         the right title, no console errors — for the hub, the
         dashboard, the breakdown and a few more
     (c) the three arunak-*.html stubs still land on the page they
         redirect to, with the worker in the way
     (d) OFFLINE: `/` and a module page load from the precache
     (e) no response in ANY cache is `redirected: true`
     (f) the stubs are NOT in the precache; the manifest names no
         `assets/*.html`
     (g) a `/page` clean URL visited online is served offline too
     (h) the offline shoot pack (reports.html#dpr): after its button,
         `/shoot` — never visited — opens offline as the shoot day

   Run (needs Node >= 22.12; set PW_CHROMIUM if Playwright's own
   download is not present):
     npm run prove:sw
   It builds its own dist into dist-sw/ — the open build, with the
   worker ON — so the dist/ the gate judges is left alone.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-sw');
const PORT = Number(process.env.PROVE_PORT) || 5531;
const ORIGIN = `http://localhost:${PORT}`;

/* ---- build: open gate, worker ON, into our own directory ----- */
if (!process.env.PROVE_SW_SKIP_BUILD) {
  console.log('building dist-sw/ …');
  const build = spawnSync(process.execPath, [
    path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build',
    '--outDir', OUT, '--emptyOutDir'
  ], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      /* The open build: this proof loads pages signed out and the gate
         would send every one of them to invite.html. The worker is
         what is on trial, and it is identical in both builds. */
      VITE_SITE_GATE: 'off',
      VITE_DISABLE_SW: ''      // explicitly ON, whatever the shell has
    }),
    encoding: 'utf8'
  });
  if (build.status !== 0) {
    console.error(build.stdout || '', build.stderr || '');
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(OUT, 'sw.js'))) {
  console.error('✗ dist-sw/sw.js is missing — the build did not emit a worker (is VITE_DISABLE_SW set?)');
  process.exit(1);
}

/* ---- the host, as vercel.json describes it -------------------
   Three things in order, which is Vercel's own order: `redirects`,
   then the filesystem (with cleanUrls / trailingSlash applied), then
   `rewrites`. A `source` is path-to-regexp-lite: `:name` is one
   segment, `(.*)` is whatever the file wrote. */
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
function compileSource(source) {
  const names = [];
  let re = '';
  const PARAM = /^:([A-Za-z_][A-Za-z0-9_]*)/;
  for (let i = 0; i < source.length;) {
    const rest = source.slice(i);
    if (rest.startsWith('(.*)')) { re += '(.*)'; i += 4; continue; }
    const m = PARAM.exec(rest);
    if (m) { names.push(m[1]); re += '([^/]+)'; i += m[0].length; continue; }
    re += source[i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); i++;
  }
  return { re: new RegExp('^' + re + '$'), names };
}
function applyDest(dest, m, names) {
  let out = dest;
  names.forEach((n, i) => { out = out.split(':' + n).join(m[i + 1]); });
  // positional groups for `(.*)` sources
  out = out.replace(/\$(\d+)/g, (_, i) => m[Number(i)] || '');
  return out;
}
const REDIRECTS = (vercel.redirects || []).map((r) => ({ ...compileSource(r.source), to: r.destination, status: r.permanent === false ? 307 : 308 }));
const REWRITES  = (vercel.rewrites || []).map((r) => ({ ...compileSource(r.source), to: r.destination }));
const CLEAN = vercel.cleanUrls === true;
const TRAILING = vercel.trailingSlash === true;

const hits = [];   // every request the server answered, for the report
const server = http.createServer((req, res) => {
  const u = new URL(req.url, ORIGIN);
  let p = decodeURIComponent(u.pathname);
  const redirect = (to, status) => {
    hits.push({ path: p, status, to });
    res.writeHead(status, { Location: to });
    res.end();
  };
  const serve = (file, status = 200) => {
    hits.push({ path: p, status, file: path.relative(OUT, file) });
    res.writeHead(status, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };
  const fileFor = (pth) => {
    const f = path.join(OUT, pth);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    if (fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, 'index.html'))) return path.join(f, 'index.html');
    if (CLEAN && !path.extname(pth) && fs.existsSync(f + '.html')) return f + '.html';
    return null;
  };

  // 1. redirects
  for (const r of REDIRECTS) {
    const m = r.re.exec(p);
    if (m) return redirect(applyDest(r.to, m, r.names) + u.search, r.status);
  }
  // 2. cleanUrls / trailingSlash normalisation
  if (CLEAN && /\.html$/.test(p)) {
    const clean = p === '/index.html' ? '/' : p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    return redirect(clean + u.search, 308);
  }
  if (!TRAILING && p.length > 1 && p.endsWith('/')) return redirect(p.replace(/\/+$/, '') + u.search, 308);
  // 3. filesystem
  if (p === '/favicon.ico') { hits.push({ path: p, status: 204 }); res.writeHead(204); return res.end(); }
  const f = fileFor(p);
  if (f) return serve(f);
  // 4. rewrites
  for (const r of REWRITES) {
    const m = r.re.exec(p);
    if (!m) continue;
    const dest = new URL(applyDest(r.to, m, r.names), ORIGIN);
    const g = fileFor(decodeURIComponent(dest.pathname));
    if (g) return serve(g);
  }
  hits.push({ path: p, status: 404 });
  res.writeHead(404); res.end('not found');
});
await new Promise((r) => server.listen(PORT, r));

/* ---- what the worker is going to precache ------------------- */
const swText = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
const manifestUrls = [...swText.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);
const STUB = /(^|\/)arunak-[^/]*\.html$/;
const expectedPrecache = new Set(manifestUrls.filter((u) => !STUB.test(u)).map((u) => new URL(u, ORIGIN + '/').href));
const titleOf = (file) => ((fs.readFileSync(path.join(OUT, file), 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim();

const report = [];
let failures = 0;
const check = (name, ok, detail) => {
  report.push({ check: name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  — ' + detail : ''}`);
};

/* ---- manifest facts that need no browser --------------------- */
check('(f) manifest names no assets/*.html',
  !manifestUrls.some((u) => /^assets\/.*\.html$/.test(u)),
  `${manifestUrls.length} manifest URLs`);
check('(f) manifest carries the three redirect stubs (so the worker has to filter them)',
  manifestUrls.filter((u) => STUB.test(u)).length === 3,
  manifestUrls.filter((u) => STUB.test(u)).join(', '));

/* ---- the browser, with a worker -------------------------------- */
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fms-sw-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  headless: true,
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'allow'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // The sandbox cannot reach Google Fonts; that is the environment.
  if (/fonts\.g(oogleapis|static)\.com|ERR_TUNNEL|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) return;
  // Chromium fetches the manifest's install icon from the BROWSER
  // process, outside the page and its worker, whenever a page with a
  // manifest loads. When that fetch is still in flight as the run
  // turns the context offline (step (d)/(h)) it fails and Chromium
  // logs this — one run in two in this container. It says nothing
  // about the app; the icon itself is asserted directly below
  // (precached, served by the worker, a real SVG).
  if (/^Error while trying to use the following icon from the Manifest/.test(m.text())) { iconNotices.push(m.text()); return; }
  errors.push('console: ' + m.text());
});
const iconNotices = [];

// (a) install + precache
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), 20000))
  ]).catch((e) => ({ error: e.message }));
  if (reg && reg.error) return { supported: true, error: reg.error };
  // `ready` resolves after activate, and install's waitUntil holds the
  // whole precache — so by here the precache is complete or install failed.
  const names = await caches.keys();
  const out = {};
  for (const n of names) {
    const c = await caches.open(n);
    out[n] = (await c.keys()).map((r) => r.url);
  }
  return { supported: true, scope: reg.scope, caches: out };
});
check('(a) the worker installed and activated', sw.supported && !sw.error && sw.scope, sw.error || sw.scope);
const precacheName = Object.keys(sw.caches || {}).find((n) => /precache/.test(n));
const precached = new Set((sw.caches || {})[precacheName] || []);
const missingFromPrecache = [...expectedPrecache].filter((u) => !precached.has(u));
const unexpectedInPrecache = [...precached].filter((u) => !expectedPrecache.has(u));
check('(a) the precache holds every manifest URL except the stubs',
  precacheName && missingFromPrecache.length === 0 && unexpectedInPrecache.length === 0,
  `${precached.size} cached, ${expectedPrecache.size} expected`
    + (missingFromPrecache.length ? `; missing: ${missingFromPrecache.slice(0, 5).join(', ')}` : '')
    + (unexpectedInPrecache.length ? `; unexpected: ${unexpectedInPrecache.slice(0, 5).join(', ')}` : ''));
check('(f) the arunak-*.html stubs are NOT in the precache',
  ![...precached].some((u) => STUB.test(new URL(u).pathname)));
check('host: precaching went through the 308s (the host behaved like Vercel)',
  hits.some((h) => h.status === 308 && /\.html$/.test(h.path)),
  `${hits.filter((h) => h.status === 308).length} redirects answered during install`);

// Playwright keeps the worker on the context; the page can tell us the controller.
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
if (!controlled) { await page.reload({ waitUntil: 'networkidle' }); }
check('the page is controlled by the worker',
  await page.evaluate(() => !!navigator.serviceWorker.controller));

// (b) typed .html URLs, through the worker
const TYPED = ['index.html', 'dashboard.html', 'breakdown.html', 'feature.html', 'feature.html?stay=1', 'settings.html', 'write.html', 'story.html'];
/* feature.html / short.html forward to their stage guide (10 Oct 2026,
   src/pages/blueprint-redirect.js); with no #step the guide is Story's.
   ?stay=1 is the full old page, and has to resolve through the worker
   in its own right. */
const FORWARDS = { 'feature.html': 'story.html', 'short.html': 'story.html' };
const landsOn = (f) => FORWARDS[f] || f.split('?')[0];
for (const file of TYPED) {
  const before = errors.length;
  let failed = null;
  const resp = await page.goto(`${ORIGIN}/${file}`, { waitUntil: 'networkidle' }).catch((e) => { failed = e.message; return null; });
  await page.waitForTimeout(300);
  const title = failed ? null : await page.title();
  const want = titleOf(landsOn(file));
  const url = page.url();
  check(`(b) /${file} resolves through the worker`,
    !failed && resp && title === want && errors.length === before,
    failed ? failed.split('\n')[0]
           : `status ${resp && resp.status()}, landed on ${new URL(url).pathname}, title "${title}"`
             + (title !== want ? ` (expected "${want}")` : '')
             + (errors.length > before ? `; ${errors.slice(before).join(' | ')}` : ''));
}

// (c) the redirect stubs, with the worker in the way
for (const r of vercel.redirects || []) {
  if (!STUB.test(r.source)) continue;
  let failed = null;
  await page.goto(ORIGIN + r.source, { waitUntil: 'networkidle' }).catch((e) => { failed = e.message; });
  const title = failed ? null : await page.title();
  const want = titleOf(landsOn(r.destination.replace(/^\//, '')));
  check(`(c) ${r.source} still redirects to ${r.destination}`,
    !failed && title === want,
    failed ? failed.split('\n')[0] : `landed on ${new URL(page.url()).pathname}, title "${title}"`);
}

// (g) a clean URL visited online, so the runtime cache has it
await page.goto(ORIGIN + '/breakdown', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// (h) the offline shoot pack: press the DPR tab's button, online, then
// (below, offline) open /shoot — a clean URL never visited, which
// without the pack falls back to the hub.
let packResult = null;
{
  await page.goto(ORIGIN + '/reports.html#dpr', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  let failed = null;
  await page.click('[data-action="rp-offline"]').catch((e) => { failed = e.message; });
  if (!failed) {
    await page.waitForFunction(() => document.querySelectorAll('#rp-offline-list .rp-off.is-ok').length >= 3, null, { timeout: 30000 })
      .catch((e) => { failed = e.message; });
  }
  packResult = failed ? { failed: failed.split('\n')[0] }
    : await page.evaluate(() => [...document.querySelectorAll('#rp-offline-list li')].map((li) => li.textContent));
}

// (e) nothing cached is redirected
const tainted = await page.evaluate(async () => {
  const bad = [];
  let total = 0;
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    for (const req of await c.keys()) {
      const res = await c.match(req);
      total++;
      if (res && res.redirected) bad.push(n + ' ' + req.url);
    }
  }
  return { bad, total };
});
{
  const icon = await page.evaluate(async () => {
    const r = await caches.match(new URL('icons/icon.svg', location.href).href);
    const t = r ? await r.text() : '';
    return { cached: !!r, svg: /^<svg[\s>]/.test(t.trim()), type: r ? r.headers.get('content-type') : null };
  });
  check('the manifest icon is precached and is a real SVG', icon.cached && icon.svg,
    JSON.stringify(icon) + (iconNotices.length ? `; Chromium's own icon fetch logged ${iconNotices.length} notice(s) (see the console filter)` : ''));
}
check('(e) no cached response is `redirected: true`', tainted.bad.length === 0,
  `${tainted.total} cached responses inspected` + (tainted.bad.length ? `; tainted: ${tainted.bad.slice(0, 5).join(', ')}` : ''));

// (d) offline
await context.setOffline(true);
const OFFLINE = [
  { url: '/', want: titleOf('index.html'), why: 'the shell' },
  { url: '/breakdown.html', want: titleOf('breakdown.html'), why: 'a precached module page, typed' },
  { url: '/breakdown', want: titleOf('breakdown.html'), why: 'a clean URL visited online (runtime cache)' },
  { url: '/stripboard.html', want: titleOf('stripboard.html'), why: 'a precached page never visited' }
];
for (const o of OFFLINE) {
  const before = errors.length;
  let failed = null;
  await page.goto(ORIGIN + o.url, { waitUntil: 'load' }).catch((e) => { failed = e.message; });
  await page.waitForTimeout(500);
  const title = failed ? null : await page.title();
  const hasApp = failed ? false : await page.evaluate(() => !!document.querySelector('#app') && document.querySelector('#app').children.length > 0);
  check(`(d) offline: ${o.url} (${o.why})`,
    !failed && title === o.want && hasApp,
    failed ? failed.split('\n')[0]
           : `title "${title}"${title !== o.want ? ` (expected "${o.want}")` : ''}, app ${hasApp ? 'rendered' : 'EMPTY'}`
             + (errors.length > before ? `; ${errors.slice(before).join(' | ')}` : ''));
}
{
  let failed = packResult && packResult.failed ? packResult.failed : null;
  let title = null, hasDay = false;
  if (!failed) {
    await page.goto(ORIGIN + '/shoot', { waitUntil: 'load' }).catch((e) => { failed = e.message; });
    await page.waitForTimeout(500);
    title = failed ? null : await page.title();
    hasDay = failed ? false : await page.evaluate(() => !!document.querySelector('main.sd-main'));
  }
  check('(h) offline: "Make today available offline" keeps /shoot (a clean URL never visited) as the shoot day, not the hub',
    !failed && title === titleOf('shoot.html') && hasDay,
    failed ? String(failed).split('\n')[0]
           : `title "${title}"; pack: ${(packResult || []).join(' | ')}`);
}
await context.setOffline(false);

// A page never cached under any key, offline, must get the shell rather than an error.
await context.setOffline(true);
{
  let failed = null;
  await page.goto(ORIGIN + '/plan', { waitUntil: 'load' }).catch((e) => { failed = e.message; });
  const title = failed ? null : await page.title();
  check('(d) offline: a never-visited clean URL falls back to the shell, not an error',
    !failed && title === titleOf('index.html'),
    failed ? failed.split('\n')[0] : `title "${title}"`);
}
await context.setOffline(false);

check('no console or page errors across the run', errors.length === 0, errors.slice(0, 5).join(' | '));

await context.close();
server.close();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* tmp */ }

console.log('\n' + JSON.stringify({ precached: precached.size, expectedPrecache: expectedPrecache.size, hostRedirects: hits.filter((h) => h.status === 308).length, report }, null, 2));
console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ service worker: ${report.length} checks pass`);
process.exit(failures ? 1 : 0);
