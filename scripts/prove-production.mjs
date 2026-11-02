/* ============================================================
   PROVE — the Screenplay Writer's production features in Chromium:
   revision mode's asterisks on a held script, Fit to page, Reports,
   and the revision PDF (print stubbed; what is staged is read).
     npm run build:open && PW_CHROMIUM=… PROVE_PORT=… node scripts/prove-production.mjs
   (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5396;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const url = (p) => `http://localhost:${PORT}/${p}`;

let failed = 0, passed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/supabase\.co|Failed to load resource|ERR_(TUNNEL|PROXY|NAME|CONNECTION|INTERNET)/.test(m.text())) return;
  errors.push('console: ' + m.text());
});
const until = async (fn, arg, ms = 15000) => {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; }
};
/* A File-menu item, through the menu's own button (the menus are built once). */
const menu = (action) => page.evaluate((a) => document.querySelector('#scTop .tb-menu-panel [data-action="' + a + '"]').click(), action);

try {
  await page.goto(url('index.html'));
  await page.click('[data-action="start-short"]');
  await page.fill('#psTitle', 'Production Test');
  await page.click('#psSubmit');
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {});

  /* A locked, HELD script written straight into the blob: a base draft
     (White) and one line changed since. */
  await page.evaluate(() => {
    const S = window.StudioStore;
    const k = 'fms_script_v1__' + S.currentProjectId();
    const e = (id, type, text) => ({ id, type, text });
    const base = [e('h1', 'scene', 'INT. KITCHEN - NIGHT'), e('a1', 'action', 'Maya stirs cold tea.'),
      e('c1', 'character', 'MAYA'), e('d1', 'dialogue', 'I will miss the bus.'),
      e('h2', 'scene', 'EXT. STREET - DAY'), e('a2', 'action', 'Maya runs.')];
    const live = base.map((x) => ({ ...x }));
    live[3].text = 'I will miss the last bus.';
    S.rawSet(k, JSON.stringify({
      elements: live,
      revisions: [{ id: 'r1', name: 'Draft 1', number: 1, date: '2026-11-01T09:00:00.000Z', note: 'Locked script',
        elements: base.map((x) => ({ ...x, id: 'x' + x.id, liveId: x.id })) }],
      documents: [],
      numbering: { locked: true, at: '2026-11-01T09:00:00.000Z', ids: { h1: { n: '1', t: base[0].text }, h2: { n: '2', t: base[4].text } }, base: 'r1' }
    }));
  });
  await page.goto(url('screenplay.html'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  check('revision mode: a changed line carries an asterisk', await until(() => document.querySelectorAll('.sc-revmark[data-text="*"]').length > 0), true);
  const info = await page.evaluate(() => {
    const stars = [...document.querySelectorAll('.sc-revmark[data-text="*"]')];
    return {
      rows: stars.map((s) => s.closest('[data-el]').dataset.el),
      swatch: stars[0] && stars[0].dataset.swatch,
      colour: document.getElementById('wr-page').dataset.revision || '',
      hidden: stars.every((s) => s.getAttribute('aria-hidden') === 'true'),
      painted: stars[0] ? getComputedStyle(stars[0], '::before').content : ''
    };
  });
  check('revision mode: only the changed line is marked', info.rows, ['d1']);
  check('revision mode: in the current revision colour (Blue)', [info.swatch, info.colour], ['blue', 'Blue']);
  check('revision mode: the mark is decoration (aria-hidden, CSS content)', [info.hidden, info.painted], [true, '"*"']);

  await page.evaluate(() => { window.__w = 0; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__w++; return set.call(this, k, v); }; });
  await page.waitForTimeout(2500);
  check('revision mode: no storage write while idle', await page.evaluate(() => window.__w), 0);

  /* ---- Fit to page ---- */
  await menu('sc-fit');
  check('fit to page: the sheet opens with five options', await until(() => document.querySelectorAll('.scf-row input[type="radio"]').length === 5), true);
  await page.locator('label[for="scf-opt-2"]').click();
  const note = await page.locator('.scf-note').innerText();
  check('fit to page: the chosen cheat is described', /0\.17in off the top and bottom margins/.test(note), true);
  await page.click('[data-scf="use"]');
  check('fit to page: "Use for export" keeps it in the device prefs', await until(() => {
    const p = JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}');
    return !!p.fitPage && Object.values(p.fitPage)[0] === 2;
  }), true);
  const text = await page.evaluate(() => {
    const S = window.StudioStore;
    return JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId())).elements.map((x) => x.text).join('|');
  });
  check('fit to page: the script text is untouched', text.includes('I will miss the last bus.'), true);

  /* ---- Reports ---- */
  await until(() => !document.querySelector('.scf'));
  await menu('sc-reports');
  check('reports: the sheet opens with three tables', await until(() => document.querySelectorAll('.scr .scr-table').length === 3), true);
  const sceneRows = await page.evaluate(() => [...document.querySelectorAll('.scr .scr-table')[0].querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent)));
  check('reports: scene report rows (number, heading, page)', sceneRows.map((r) => r.slice(0, 3)), [['1', 'INT. KITCHEN - NIGHT', '1'], ['2', 'EXT. STREET - DAY', '1']]);
  const chars = await page.evaluate(() => [...document.querySelectorAll('.scr .scr-table')[2].querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent));
  check('reports: the character report names MAYA', chars, ['MAYA']);

  await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = !!document.querySelector('.scr-print') && document.body.classList.contains('pdf-scr'); window.dispatchEvent(new Event('afterprint')); }; });
  await page.click('[data-scr="print"]');
  check('reports: printing stages the reports document', await until(() => window.__printed === true), true);
  check('reports: and removes it after', await until(() => !document.querySelector('.scr-print')), true);

  /* ---- the revision PDF ---- */
  await page.evaluate(() => { window.__pdf = null; window.print = () => {
    const pr = document.querySelector('.wr-print');
    window.__pdf = pr ? {
      stars: pr.querySelectorAll('.wr-pr-star').length,
      head: (pr.querySelector('.wr-pg-rev') || {}).textContent || '',
      tint: !!pr.querySelector('.wr-pg-tint.c-blue'),
      cheat: pr.classList.contains('wr-cheat'),
      sn: !!pr.querySelector('.wr-pr-sn'),
      margin: (document.getElementById('pdf-page-setup') || {}).textContent || ''
    } : null;
    window.dispatchEvent(new Event('afterprint'));
  }; });
  await menu('sc-pdf-tint');
  await until(() => window.__pdf !== null);
  const pdf = await page.evaluate(() => window.__pdf) || {};
  check('revision PDF: one asterisk, the colour and date header, the tint, the cheat, scene numbers',
    [pdf.stars, /^Blue Revision · \d+ \w{3} 2026$/.test(pdf.head || ''), pdf.tint, pdf.cheat, pdf.sn], [1, true, true, true, true]);
  check('revision PDF: the cheat shaved the top and bottom margins only', /margin: 21\.17mm 10\.16mm 17\.77mm 19\.05mm/.test(pdf.margin || ''), true);
} catch (e) {
  failed++;
  console.log('FAIL  threw: ' + e.message);
}
check('no page errors', errors, []);
await browser.close();
server.close();
console.log(`\nprove:production — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
