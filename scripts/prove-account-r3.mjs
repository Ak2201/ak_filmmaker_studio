/* PROOF: account & business, round 3 — what a browser can see without a backend.
     settings  a choice group is ONE Tab stop (roving tabindex), and an arrow key
               chooses the neighbour
     screening a malformed optional e-mail does not stop the pass from being
               checked: the page answers in its own words, not a native bubble
   Run: npm run build:open && PW_CHROMIUM=... PROVE_PORT=5680 npm run prove:account-r3  (PROVE_DIST default dist) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT || 5680);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const base = 'http://localhost:' + PORT + '/';

  console.log('settings choice group');
  await page.goto(base + 'settings.html#preferences');
  await page.waitForSelector('[role=radio][data-region-choice]');
  const stops = await page.$$eval('.st-group', (gs) => gs.map((g) => [...g.querySelectorAll('.st-choice')].map((r) => r.tabIndex)));
  ok(stops.length > 0 && stops.every((g) => g.length >= 2 && g.filter((t) => t === 0).length === 1), 'one Tab stop per group (' + stops.map((g) => g.join(',')).join(' | ') + ')');
  const before = await page.$$eval('[data-region-choice]', (rs) => rs.find((r) => r.getAttribute('aria-checked') === 'true').dataset.regionChoice);
  await page.focus('[data-region-choice][aria-checked="true"]');
  await Promise.all([page.waitForNavigation({ timeout: 8000 }).catch(() => {}), page.keyboard.press('ArrowRight')]);
  await page.waitForSelector('[role=radio][data-region-choice]');
  const after = await page.$$eval('[data-region-choice]', (rs) => rs.find((r) => r.getAttribute('aria-checked') === 'true').dataset.regionChoice);
  ok(after !== before, 'ArrowRight chose the neighbour (' + before + ' -> ' + after + ')');

  console.log('screening room');
  await page.goto(base + 'screening.html');
  await page.waitForSelector('#scCode');
  ok(await page.$eval('form.sc-form', (f) => f.noValidate), 'the form does not use native validation');
  await page.fill('#scCode', 'x');
  await page.fill('#scEmail', 'not an email');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#scError', { timeout: 4000 }).catch(() => {});
  ok(await page.$('#scError') !== null, 'the page answers in its own words');
} catch (e) { fail++; console.log('  ✗ ' + (e && e.message)); }
await browser.close(); server.close();
console.log(fail ? `\n✗ ${fail} check(s) failed` : `\n✓ all ${pass} account-r3 proof checks pass`);
process.exit(fail ? 1 : 0);
