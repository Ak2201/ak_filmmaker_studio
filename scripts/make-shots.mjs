#!/usr/bin/env node
/* ============================================================
   PRODUCT SCREENSHOTS FOR start.html  —  npm run shots
   ------------------------------------------------------------
   Serves dist/ (build it with `npm run build:open` first: the gated
   build would bounce every page to the doorway), loads the Dragon
   sample the way start.html's own link does (index.html?sample=1),
   and captures four pages at 1280x800 into public/shots/*.webp.
   Committed, not generated at build: the hosts have no browser.
   Env: PW_CHROMIUM = path to a Chromium (default /opt/pw-browsers/chromium).
   ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'public', 'shots');
const MAX = 250 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ is missing: run `npm run build:open` first.'); process.exit(1); }
if (/name="fms-site-gate"[^>]*content="invite"|data-site-gate="invite"/.test(readFileSync(join(DIST, 'index.html'), 'utf8'))) {
  console.error('dist/ looks like the GATED build; run `npm run build:open`.'); process.exit(1);
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(DIST, p);
  if (!f.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const SHOTS = [
  ['hub',        'index.html?sample=1',  'hub.webp'],
  ['write',      'write.html',           'write.webp'],
  ['stripboard', 'stripboard.html',      'stripboard.webp'],
  ['shoot',      'shoot.html',           'shoot.webp']
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', colorScheme: 'dark' });
const page = await ctx.newPage();
for (const [name, url, file] of SHOTS) {
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(name === 'hub' ? 2500 : 1800);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // the announcement strip and any toast are not the product
  await page.evaluate(() => document.querySelectorAll('.toast, [class*="toast"], [class*="announce"]').forEach((n) => { n.style.display = 'none'; }));
  const png = await page.screenshot({ type: 'png' });
  let q = 82, buf;
  do { buf = await sharp(png).webp({ quality: q }).toBuffer(); q -= 8; } while (buf.length > MAX && q > 30);
  writeFileSync(join(OUT, file), buf);
  console.log(`${file}  ${(buf.length / 1024).toFixed(0)}KB  (${name})`);
}
await browser.close();
server.close();
