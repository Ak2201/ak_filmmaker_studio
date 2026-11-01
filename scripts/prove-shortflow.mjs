/* ============================================================
   THE SHORT-FILM WALK, AS A CI TEST
   ------------------------------------------------------------
   One browser context, a fresh profile, the open build:
     hub -> Short door -> create -> dashboard;
     the three-scene screenplay typed with the editor's own keys
     (KITCHEN night with a MAYA cue, STREET day, BUS day with MAYA);
     the live sync fills the Scene List with exactly 3 scenes numbered
     1,2,3 in script order, and after a reload the screenplay shows no
     "new scene since your last breakdown" banner;
     breakdown.html#overview opens Whole script and #scenes the Scene List;
     "Break down everything" casts MAYA on KITCHEN and BUS;
     stripboard.html shows 3 strips;
     no page error and no console error (a *.supabase.co network failure
     is the sandbox's block, not a bug).

       npm run build:open && npm run prove:shortflow
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5393;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0, passed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}
const url = (p) => `http://localhost:${PORT}/${p}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
let ctx, page;

/* Poll a page-side function for a signal; never a fixed sleep. */
async function until(fn, arg, ms = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; }
}
/* The Scene List's cards, in order: number, location, cast. */
const listRows = () => page.evaluate(() =>
  [...document.querySelectorAll('.bd-sl')].map((e) => {
    const no = e.querySelector('.bd-scene-no');
    return {
      num: ((no && (no.value ?? no.textContent)) || '').trim(),
      where: (e.querySelector('.bd-slug')?.value || '').toUpperCase(),
      cast: ((e.querySelector('.bd-sl-cast')?.title || '') + ' ' + (e.querySelector('.bd-sl-cast')?.textContent || '')).toUpperCase(),
    };
  }));
const selectedTab = () => page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]')?.innerText.replace(/\s+/g, ' ').trim() || '');

try {
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (/supabase\.co/.test(loc) || /supabase\.co|Failed to load resource|ERR_(TUNNEL|PROXY|NAME|CONNECTION|INTERNET)/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  /* ---- 1. create a Short from the hub door ---- */
  await page.goto(url('index.html'));
  await page.click('[data-action="start-short"]');
  await page.fill('#psTitle', 'Last Bus Home');
  await page.click('#psSubmit');
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {});
  check('creating a Short lands on the dashboard', /dashboard\.html/.test(page.url()), true);

  /* ---- 2. type the screenplay with the editor's own keys ---- */
  await page.goto(url('screenplay.html'));
  const first = page.locator('textarea.wr-text').first();
  await first.waitFor({ timeout: 15000 });
  await first.click();
  const kb = page.keyboard;
  await kb.type('INT. KITCHEN - NIGHT'); await kb.press('Enter');      // heading -> action
  await kb.type('Maya stirs cold tea at the counter.'); await kb.press('Enter');
  await kb.press('Tab');                                               // action -> character
  await kb.type('MAYA'); await kb.press('Enter');                      // -> dialogue
  await kb.type('I will miss the last bus.'); await kb.press('Enter'); await kb.press('Enter');
  await kb.press('Alt+1');                                             // scene heading
  await kb.type('EXT. STREET - DAY'); await kb.press('Enter');
  await kb.type('Maya runs past the closing bus stop. The bus pulls away.'); await kb.press('Enter');
  await kb.press('Alt+1');
  await kb.type('INT. BUS - DAY'); await kb.press('Enter');
  await kb.type('Maya sits by the window, finally still.'); await kb.press('Enter');
  await kb.press('Alt+3'); await kb.type('MAYA'); await kb.press('Enter');
  await kb.type('Home, at last.'); await kb.press('Enter');            // Enter schedules the sync

  /* The live sync's signal: the scene rows exist. Read them off the Scene List. */
  await page.goto(url('breakdown.html#scenes'));
  await until(() => document.querySelectorAll('.bd-sl').length === 3);
  check('the Scene List has exactly 3 scenes', await page.locator('.bd-sl').count(), 3);
  const rows = await listRows();
  check('numbered 1, 2, 3', rows.map((r) => r.num.replace(/\D/g, '')), ['1', '2', '3']);
  check('in script order: KITCHEN, STREET, BUS',
    rows.map((r) => (r.where.match(/KITCHEN|STREET|BUS/) || [''])[0]), ['KITCHEN', 'STREET', 'BUS']);

  /* ---- 3. no banner after a reload ---- */
  await page.goto(url('screenplay.html'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  await page.reload();
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  await until(() => document.querySelector('.wr-text')?.value);       // the page is drawn
  check('no "new scene since your last breakdown" banner',
    await page.evaluate(() => /new scenes? since your last breakdown/i.test(document.body.innerText)), false);

  /* ---- 4. breakdown tabs ---- */
  await page.goto(url('breakdown.html#overview'));
  await until(() => document.querySelector('[role=tab][aria-selected=true]'));
  check('#overview opens Whole script', /Whole script/i.test(await selectedTab()), true);
  await page.goto(url('breakdown.html#scenes'));
  await until(() => document.querySelector('[role=tab][aria-selected=true]'));
  check('#scenes opens Scene List', /Scene List/i.test(await selectedTab()), true);

  /* ---- 5. Break down everything ---- */
  await page.goto(url('breakdown.html#overview'));
  const run = page.locator('button:has-text("Break down everything"):visible').first();
  await run.waitFor({ timeout: 15000 });
  await run.click();
  /* The run's signal: MAYA shows on a Scene List card (read off the list, not storage). */
  await page.goto(url('breakdown.html#scenes'));
  await until(() => [...document.querySelectorAll('.bd-sl-cast')].some((e) => /MAYA/i.test(e.title + e.textContent)), null, 20000);
  const after = await listRows();
  const castOf = (word) => after.filter((r) => r.where.includes(word)).map((r) => r.cast.includes('MAYA'));
  check('MAYA is cast on KITCHEN', castOf('KITCHEN'), [true]);
  check('MAYA is cast on BUS', castOf('BUS'), [true]);

  /* ---- 6. the stripboard ---- */
  await page.goto(url('stripboard.html'));
  await until(() => document.querySelectorAll('.sb-strip').length === 3);
  check('the stripboard shows 3 strips', await page.locator('.sb-strip').count(), 3);

  /* ---- 7. a heading typed BETWEEN existing scenes (the case that broke:
     it got max+1 and sat in the middle as 1,2,4,3) ---- */
  await page.goto(url('screenplay.html'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  const at = await page.evaluate(() => [...document.querySelectorAll('textarea.wr-text')].findIndex((t) => /Maya runs past/.test(t.value)));
  await page.locator('textarea.wr-text').nth(at).click();
  await kb.press('Control+End'); await kb.press('Enter');
  await kb.press('Alt+1'); await kb.type('INT. SHOP - DAY'); await kb.press('Enter');
  await kb.type('Maya buys a ticket.'); await kb.press('Enter');
  await page.goto(url('breakdown.html#scenes'));
  await until(() => document.querySelectorAll('.bd-sl').length === 4);
  const mid = await listRows();
  check('a mid-script heading is numbered 1-4 in script order',
    mid.map((r) => r.num.replace(/\D/g, '') + (r.where.match(/KITCHEN|STREET|SHOP|BUS/) || [''])[0]),
    ['1KITCHEN', '2STREET', '3SHOP', '4BUS']);

  check('no page error or console error', errors, []);
} catch (e) {
  failed++;
  console.log('FAIL  the walk threw: ' + e.message);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
