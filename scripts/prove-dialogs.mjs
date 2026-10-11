/* ============================================================
   PROOF: every question is asked in the app, never by the browser
   ------------------------------------------------------------
   Owner, 11 Oct 2026: "all pops should be used inside app only, not
   with browser". Four real surfaces — the hub's project delete,
   settings' erase-everything, the short blueprint's reset, and a
   document delete on write.html — are driven in Chromium with
   page.on('dialog') FAILING the run (a native box is a failure, and is
   dismissed so the page cannot hang). Each asserts the in-app .dlg
   appears and that Cancel leaves the stored data intact.

       npm run build:open && node scripts/prove-dialogs.mjs
       (PW_CHROMIUM=<path> picks a Chromium other than Playwright's own)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PROVE_PORT) || 5383;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
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

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
let native = 0;
page.on('dialog', (d) => { native++; errors.push('NATIVE ' + d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const titles = () => page.evaluate(() => window.StudioStore.listProjects().map((p) => p.title).sort());
const dlg = () => page.waitForSelector('.dlg', { timeout: 8000 });
const dlgGone = () => page.waitForFunction(() => !document.querySelector('.dlg-overlay'), null, { timeout: 8000 });
const dlgTitle = () => page.textContent('.dlg h3');

async function seed() {
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    S.createProject({ title: 'Alpha', format: 'feature' });
    const b = S.createProject({ title: 'Beta', format: 'short' });
    S.setCurrentProject(b.id);
    S.notify('projects:changed', { reason: 'test' });
  });
}

/* 1. hub: delete a project — Cancel keeps it, Delete removes it */
await seed();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-action="delete-project"]', { timeout: 15000 });
await page.evaluate(() => document.querySelector('[data-action="delete-project"]').click());
await dlg();
check('hub: delete asks in the app, not the browser', /Delete project/.test(await dlgTitle()), true);
await page.click('.dlg .mbtn:not(.primary)');
await dlgGone();
check('hub: Cancel leaves both projects', await titles(), ['Alpha', 'Beta']);
await page.evaluate(() => document.querySelector('[data-action="delete-project"]').click());
await dlg();
await page.keyboard.press('Escape');
await dlgGone();
check('hub: Escape cancels too', await titles(), ['Alpha', 'Beta']);
await page.evaluate(() => document.querySelector('[data-action="delete-project"]').click());
await dlg();
await page.click('.dlg .mbtn.primary');
await dlgGone();
check('hub: confirming deletes exactly one', (await titles()).length, 1);

/* 2. settings: Danger zone erase — type-to-confirm, Cancel keeps data */
await seed();
await page.goto(url('settings.html'), { waitUntil: 'networkidle' });
await page.waitForSelector('[data-action="erase-all"]', { state: 'attached', timeout: 15000 });
await page.evaluate(() => document.querySelector('[data-action="erase-all"]').click());
await dlg();
check('settings: erase asks in the app and demands the typed word', await page.evaluate(() => !!document.querySelector('.dlg .dlg-field') && document.querySelector('.dlg .mbtn.primary').disabled), true);
await page.click('.dlg .mbtn:not(.primary)');
await dlgGone();
check('settings: Cancel erases nothing', await titles(), ['Alpha', 'Beta']);

/* 3. short.html: Reset — ONE dialog (was two native confirms), Cancel keeps data */
await seed();
await page.goto(url('short.html?stay=1'), { waitUntil: 'networkidle' });
await page.waitForSelector('[data-action="reset"]', { state: 'attached', timeout: 15000 });
await page.evaluate(() => { const i = document.querySelector('[data-key]'); if (i) { i.value = 'keep me'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
await page.waitForTimeout(900);
const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
await page.evaluate(() => document.querySelector('[data-action="reset"]').click());
await dlg();
check('short: reset asks in the app, once, typed', await page.evaluate(() => !!document.querySelector('.dlg .dlg-field')), true);
await page.click('.dlg .mbtn:not(.primary)');
await dlgGone();
await page.waitForTimeout(300);
check('short: no second "Are you SURE" follows a Cancel', await page.evaluate(() => !document.querySelector('.dlg')), true);
check('short: Cancel leaves the stored data byte-identical', await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))), before);

/* 4. write.html: delete a document — danger dialog, Cancel keeps it */
await seed();
await page.goto(url('write.html?stay=1#documents'), { waitUntil: 'networkidle' });
await page.waitForSelector('[data-action="doc-add"]', { state: 'attached', timeout: 15000 });
await page.evaluate(() => document.querySelector('[data-action="doc-add"]').click());
await page.waitForSelector('[data-action="doc-del"]', { state: 'attached', timeout: 8000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('[data-action="doc-del"]').click());
await dlg();
check('write: delete document asks in the app', /Delete/.test(await dlgTitle()), true);
await page.click('.dlg .mbtn:not(.primary)');
await dlgGone();
check('write: Cancel keeps the document', await page.evaluate(() => !!document.querySelector('[data-action="doc-del"]')), true);

check('no native dialog opened anywhere', native, 0);
check('no page errors', errors, []);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
