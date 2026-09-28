/* ============================================================
   MIGRATION VERIFIER
   ------------------------------------------------------------
   Answers the only question that matters about this refactor:
   did anything get lost on the way from four hand-written HTML
   files to a data-driven build?

   Serves dist/, loads every page in Chromium, and compares each
   one against its ORIGINAL in legacy/ on the things a user would
   notice:

     1. data-key parity — the storage contract. A missing key
        means somebody's saved work no longer has a field to
        load into. This must be exact.
     2. visible-text coverage — did any prose disappear?
     3. no console errors, no inline event handlers.
     4. no runaway writes (the save-loop regression test).
     5. no horizontal overflow at phone width.

   Run: npm run build && npm run verify
   ============================================================ */

import { chromium } from 'playwright';
import { parseHTML } from 'linkedom';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* --baseline recaptures the reference instead of asserting against it.
   Re-baselining is a deliberate act — a redesign that rewrites copy
   should require someone to type `npm run baseline` and say so in a
   commit, not quietly pass because the check drifted with it. */
const WRITE_BASELINE = process.argv.includes('--baseline');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'baseline.json');
const DIST = path.join(ROOT, 'dist');
const PORT = 5321;

const PAGES = [
  { page: 'index.html',   legacy: 'index.html',                        name: 'hub' },
  { page: 'feature.html', legacy: 'arunak-filmmaker-blueprint.html',   name: 'feature' },
  { page: 'short.html',   legacy: 'arunak-shortfilm-blueprint.html',   name: 'short' },
  { page: 'library.html', legacy: 'arunak-filmmaker-library.html',     name: 'library' },
  // No legacy counterpart — this page did not exist before v5. The
  // `legacy` field is vestigial now that nothing diffs against it.
  { page: 'breakdown.html', legacy: null, name: 'breakdown' }
];

/* ------------------------------------------------------------
   KNOWN DIVERGENCES
   ------------------------------------------------------------
   Words that appear in a legacy page and deliberately do not
   appear in its replacement. Every entry needs a reason, because
   an unexplained one is indistinguishable from a bug. Anything
   NOT on this list that goes missing fails the run.
   ------------------------------------------------------------ */
/* Words that are deliberately gone from a page since the baseline was
   captured, each with the reason.

   Emptied when the oracle was re-baselined. Every previous entry
   explained a divergence from the original legacy/ markup, and against
   a baseline taken from the app's own output there is no such
   divergence — the stale-allowance check flagged all of them the moment
   the baseline landed, which is the check working.

   It is not dead. Reword something on purpose and verify will fail with
   the missing word; add it here with a reason and the run goes green
   again. Two rules keep this list honest: an entry that stops firing
   fails the run, so it cannot rot into a permanent excuse; and if the
   list is growing, that is the signal to re-baseline deliberately with
   `npm run baseline` rather than to keep adding rows. */
const EXPECTED = {
  hub: {},
  breakdown: {},
  feature: {},
  short: {},
  library: {}
};

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

/* ---- helpers ---------------------------------------------- */
const strip = (html) => String(html).replace(/<[^>]+>/g, ' ');
const words = (s) => strip(s).replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

/* The reference the live pages are diffed against.

   This used to be legacy/ — the four hand-written pages the app was
   migrated from. That oracle did its job: it proved the migration lost
   no data-key and no prose. But it pins the app to 2023 markup, so any
   deliberate redesign has to be bought with EXPECTED entries until the
   allowlist is the document and the check is noise.

   scripts/baseline.json replaces it. The first baseline was captured
   from a build that still passed 100% against legacy/, so the original
   guarantee is inherited rather than discarded — the file records which
   commit it came from. legacy/ stays: `npm run extract` reads it, and
   it remains the historical record. It is no longer the oracle. */
function baselineFacts(name) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(
      '\nNo scripts/baseline.json. Capture one with:\n' +
      '  npm run build && npm run baseline\n' +
      'Only do that when the current output is known good — it becomes the reference.\n'
    );
    process.exit(2);
  }
  const all = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const page = all.pages[name];
  if (!page) {
    console.error(`\nbaseline.json has no entry for "${name}". Re-run npm run baseline.\n`);
    process.exit(2);
  }
  return { keys: new Set(page.keys), text: page.words };
}


/* ---- run --------------------------------------------------- */
// Playwright resolves its own downloaded browser. PW_CHROMIUM overrides
// that for environments that ship Chromium at a fixed path instead.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const report = [];
const captured = {};
let failures = 0;

for (const spec of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The sandbox cannot reach fonts.googleapis.com; that is the
    // environment, not the app.
    if (/fonts\.g(oogleapis|static)\.com|ERR_TUNNEL|Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'networkidle' });
  // The hub needs a project before the blueprints will scope storage.
  await page.evaluate(() => {
    if (window.StudioStore && !StudioStore.currentProject()) {
      StudioStore.createProject({ title: 'Verification', format: 'feature' });
    }
  });
  await page.waitForTimeout(600);

  const live = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key')),
    // innerHTML, not innerText — the legacy side is read the same way.
    // innerText drops anything currently display:none (the resume card
    // before there is anything to resume, the projects toolbar with no
    // projects) and the text of unselected <option>s, which made a
    // faithful port look like it had lost a twentieth of its copy.
    text: (() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
      return clone.innerHTML;
    })(),
    inlineHandlers: document.querySelectorAll(
      '[onclick],[onchange],[oninput],[onsubmit],[onkeydown],[ondblclick],[onfocus],[onblur]'
    ).length,
    steps: document.querySelectorAll('.step').length,
    hasMain: !!document.querySelector('main#main')
  }));

  // --- idle-write probe (the save-loop regression) ---
  await page.evaluate(() => {
    window.__w = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__w++; return orig.call(this, k, v); };
  });
  await page.waitForTimeout(4000);
  const idleWrites = await page.evaluate(() => window.__w);

  // --- phone width ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

  // --- themes must actually swap ---
  // The stylesheets key off :root[data-theme]; chrome.js once set only
  // body.dark/.sepia, which no rule matches — so all three themes
  // rendered identically, the picker was a no-op and sepia was
  // unreachable. Nothing above would notice: the text, the keys and the
  // handlers are all still correct on a page with the wrong palette.
  const themes = await page.evaluate(() => {
    const api = window.StudioUI;
    if (!api || !api.applyTheme) return { unavailable: true };
    const bg = () => getComputedStyle(document.body).backgroundColor;
    const before = document.documentElement.getAttribute('data-theme');
    const out = {};
    ['paper', 'sepia', 'ink'].forEach((t) => { api.applyTheme(t); out[t] = bg(); });
    if (before) document.documentElement.setAttribute('data-theme', before);
    return out;
  });
  const themeSwatches = themes.unavailable
    ? null
    : new Set([themes.paper, themes.sepia, themes.ink]).size;

  // --- overflow with every phase menu OPEN ---
  // The plain overflow check above measures a page with all menus shut,
  // and missed a 260px dropdown anchored to the rightmost phase pushing
  // 96px of horizontal overflow at 375px. Open them all and measure
  // again; a dropdown that escapes the viewport is a layout bug whether
  // or not the page is scrolled sideways by default.
  const overflowOpen = await page.evaluate(() => {
    const SEL = '.sh-phase-menu, .tb-menu-panel';
    if (!document.querySelector(SEL)) return { checked: false, overflow: 0, escaped: 0 };
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = false; });
    const de = document.documentElement;
    const escaped = [...document.querySelectorAll(SEL)]
      .filter((m) => {
        const r = m.getBoundingClientRect();
        return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
      }).length;
    const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = true; });
    return { checked: true, overflow, escaped };
  });

  const liveKeys = new Set(live.keys);
  const liveWords = new Set(words(live.text));

  // Capturing a baseline records what the build produces; there is
  // nothing to compare it against yet, so skip the assertions.
  if (WRITE_BASELINE) {
    captured[spec.name] = { keys: [...liveKeys].sort(), words: [...liveWords].sort() };
    await ctx.close();
    continue;
  }

  const old = baselineFacts(spec.name);
  const missingKeys = [...old.keys].filter((k) => !liveKeys.has(k));
  const allowed = EXPECTED[spec.name] || {};
  const gone = [...new Set(old.text)].filter((w) => !liveWords.has(w));
  const missingWords = gone.filter((w) => !(w in allowed));       // unexplained
  const explained = gone.filter((w) => w in allowed);             // deliberate
  const total = new Set(old.text).size;
  const coverage = ((total - gone.length) / total) * 100;
  // Coverage counting deliberate rewording as intact — this is the
  // number that must be 100%.
  const accountedCoverage = ((total - missingWords.length) / total) * 100;
  // An allowlist entry that no longer fires is stale; say so rather
  // than letting the list rot into a set of permanent excuses.
  const staleAllowances = Object.keys(allowed).filter((w) => !gone.includes(w));

  const row = {
    page: spec.name,
    legacyKeys: old.keys.size,
    liveKeys: liveKeys.size,
    missingKeys: missingKeys.length,
    missingKeySample: missingKeys.slice(0, 8),
    textCoverage: +coverage.toFixed(2),
    accountedCoverage: +accountedCoverage.toFixed(2),
    explainedDivergences: explained.length,
    staleAllowances,
    missingWordSample: missingWords.slice(0, 200),
    steps: live.steps,
    hasMain: live.hasMain,
    inlineHandlers: live.inlineHandlers,
    idleWrites,
    hOverflowAt390: overflow,
    hOverflowMenusOpen: overflowOpen.overflow,
    menusEscapingViewport: overflowOpen.escaped,
    distinctThemes: themeSwatches,
    errors
  };
  report.push(row);

  const bad = [];
  if (missingKeys.length) bad.push(`${missingKeys.length} data-keys missing`);
  if (missingWords.length) {
    bad.push(`${missingWords.length} unexplained missing words (${missingWords.slice(0, 6).join(', ')})`);
  }
  if (staleAllowances.length) {
    bad.push(`stale allowlist entries: ${staleAllowances.join(', ')}`);
  }
  if (live.inlineHandlers) bad.push(`${live.inlineHandlers} inline handlers`);
  if (idleWrites > 0) bad.push(`${idleWrites} idle writes`);
  if (overflow > 0) bad.push(`${overflow}px horizontal overflow at 390px`);
  if (overflowOpen.checked && overflowOpen.overflow > 0) {
    bad.push(`${overflowOpen.overflow}px horizontal overflow at 390px with the dropdowns open`);
  }
  if (overflowOpen.checked && overflowOpen.escaped > 0) {
    bad.push(`${overflowOpen.escaped} dropdown(s) escape the viewport at 390px`);
  }
  if (themeSwatches !== null && themeSwatches !== 3) {
    bad.push(`themes do not swap (${themeSwatches} distinct background(s) across paper/sepia/ink)`);
  }
  if (errors.length) bad.push(`${errors.length} console/page errors`);
  if (!live.hasMain) bad.push('no <main id="main">');
  if (bad.length) { failures++; row.FAIL = bad; }

  await ctx.close();
}

if (WRITE_BASELINE) {
  const sha = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    } catch (e) { return 'unknown'; }
  })();
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _about:
      'Reference for npm run verify. Regenerate ONLY with `npm run build && npm run baseline`, ' +
      'and only when the current output is known good — it becomes the thing every later run is judged against.',
    capturedAt: new Date().toISOString(),
    capturedFrom: sha,
    provenance:
      'Captured from the build at the commit above. The FIRST baseline (16bf3b4) came from a build that ' +
      'still passed 100% against the original legacy/ pages, so the migration guarantee entered the chain ' +
      'there; every later capture inherits whatever the build was at that moment, which is why re-baselining ' +
      'is a deliberate act and belongs in a commit message.',
    pages: captured
  }, null, 2) + '\n');
  await browser.close();
  server.close();
  const n = Object.keys(captured).length;
  const keys = Object.values(captured).reduce((a, p) => a + p.keys.length, 0);
  console.log(`\n✓ baseline written — ${n} pages, ${keys} data-keys, from ${sha}`);
  console.log('  scripts/baseline.json');
  process.exit(0);
}

/* ---- backup round trip --------------------------------------
   Export is the ONLY backup a local-first app has, so it gets its own
   assertion rather than riding on the per-page diff.

   v1 read the per-project keys straight off localStorage, where the
   storage proxy resolved them to whichever project was open — so a file
   labelled "full studio backup" held exactly one film, and the other
   projects were gone the moment the browser was. Nothing in the page
   diff could see it: the hub's markup is identical either way.

   Two projects out, two projects back, with their contents matched. */
const rtCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const rtPage = await rtCtx.newPage();
const rtErrors = [];
rtPage.on('pageerror', (e) => rtErrors.push(e.message));
await rtPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

const exported = await rtPage.evaluate(async () => {
  const S = window.StudioStore;
  if (!S) return { unavailable: true };
  S.listProjects().forEach((p) => S.deleteProject(p.id));
  const a = S.createProject({ title: 'RT Alpha', format: 'feature' });
  S.setCurrentProject(a.id);
  localStorage.setItem('arunak_filmmaker_combined_v1', JSON.stringify({ lad_1_logline: 'ALPHA-CONTENT' }));
  const b = S.createProject({ title: 'RT Beta', format: 'short' });
  S.setCurrentProject(b.id);
  localStorage.setItem('arunak_filmmaker_combined_v1', JSON.stringify({ lad_1_logline: 'BETA-CONTENT' }));

  // Capture the blob instead of letting the browser download it.
  let blob = null;
  const origCreate = URL.createObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (b2) { blob = b2; return 'blob:verify-stub'; };
  HTMLAnchorElement.prototype.click = function () {};
  document.querySelector('[data-action="export-all"]').click();
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  return { text: blob ? await blob.text() : null };
});

let backup = { checked: false };
if (!exported.unavailable && exported.text) {
  const parsed = JSON.parse(exported.text);
  const loglines = Object.values(parsed.data || {})
    .map((d) => d.feature_blueprint && d.feature_blueprint.lad_1_logline)
    .filter(Boolean).sort();

  // Wipe, then re-import the captured file through the real input path.
  await rtPage.evaluate((text) => {
    const S = window.StudioStore;
    S.listProjects().forEach((p) => S.deleteProject(p.id));
    window.confirm = () => true;
    window.alert = () => {};
    const input = document.getElementById('importAllFile');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'backup.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, exported.text);

  // importV2 finishes with location.reload()
  await rtPage.waitForLoadState('networkidle').catch(() => {});
  await rtPage.waitForTimeout(1200);

  const restored = await rtPage.evaluate(() => {
    const S = window.StudioStore;
    return S.listProjects().map((p) => ({
      title: p.title,
      logline: (() => {
        const raw = S.rawGet('arunak_filmmaker_combined_v1__' + p.id);
        try { return JSON.parse(raw || '{}').lad_1_logline || null; } catch (e) { return null; }
      })()
    })).sort((x, y) => (x.title > y.title ? 1 : -1));
  });

  backup = {
    checked: true,
    exportVersion: parsed._version,
    projectsInFile: (parsed.projects || []).length,
    loglinesInFile: loglines,
    projectsRestored: restored.length,
    restored,
    pageErrors: rtErrors
  };

  const bad = [];
  if (parsed._version < 2) bad.push(`export is v${parsed._version}, expected v2+`);
  if ((parsed.projects || []).length !== 2) {
    bad.push(`export listed ${(parsed.projects || []).length} project(s), expected 2`);
  }
  if (loglines.join('|') !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`export carried [${loglines.join(', ')}], expected both projects' content`);
  }
  if (restored.length !== 2) bad.push(`restored ${restored.length} project(s), expected 2`);
  const restoredLoglines = restored.map((r) => r.logline).sort().join('|');
  if (restoredLoglines !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`restored content [${restoredLoglines}], expected both projects' content`);
  }
  if (bad.length) { failures++; backup.FAIL = bad; }
} else {
  backup.FAIL = ['could not capture an export blob'];
  failures++;
}
report.push({ page: 'backup round trip', ...backup });

await rtCtx.close();
await browser.close();
server.close();

console.log(JSON.stringify(report, null, 2));
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all pages pass');
process.exit(failures ? 1 : 0);
