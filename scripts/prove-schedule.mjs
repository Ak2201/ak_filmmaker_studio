/* ============================================================
   PROOF: the schedule and its reports agree with themselves
   (shoot.html, stripboard.html, reports.html, preprod.html) on the
   Dragon sample, in a real Chromium.
   ------------------------------------------------------------
   Each assertion is a QA finding from 26 Oct 2026 and FAILS on the
   code before its fix:
     1  a DROPPED scene is settled but never shot: Shoot Day's "Scenes
        shot", "Pages shot" and "In the can" leave it out, as the DPR
        does; "left today" only on today's date
     2  a day NUMBER emptied on the stripboard: "Day 18 of 17" is never
        printed (shoot.html eyebrow, its day strip, the DPR title)
     3  the DPR's "Mark scenes on the shoot day" carries ?day=N, and
        shoot.html opens on it
     4  a scene of exactly one page reads "1 page"
     5  one runtime estimate, one number: the stripboard's minutes are
        the Reports figure; the no-songs note names the script estimate
     6  Pre-Production says "people", never "persons"
     7  the DOOD names the Stripboard tab (nothing is "above" it), its
        key explains SWF, and a code never wraps out of its badge
     8  the lock dialog points at this page's Unlock draft, and the lock
        badge prints the date in the film's style, never raw ISO
     9  print: a strip's day prints as text (no empty frame), the kit's
        link-buttons and the labels of hidden controls do not print, a
        blank DPR field prints blank (no placeholder, no time mask)
    10  the DPR / kit day picker is the kit's select
    11  at 390 a PINNED tab strip carries no edge mask (the page under
        it showed through both ends)

       npm run build:open && npm run prove:schedule
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5391;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'shoot.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/shoot.html — run `npm run build:open` first');
  process.exit(2);
}
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0;
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra).slice(0, 500));
}
const url = (p) => `http://localhost:${PORT}/${p}`;
const settle = (page, ms = 500) => page.waitForTimeout(ms);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.click('[data-action="sample-project"][data-sample="dragon"]');
await page.waitForLoadState('networkidle');
await settle(page, 800);

const scenes = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_scenes_v1') || '{"scenes":[]}').scenes);
const writeScenes = (fn) => page.evaluate((src) => {
  const blob = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  // eslint-disable-next-line no-new-func
  new Function('scenes', src)(blob.scenes);
  localStorage.setItem('fms_scenes_v1', JSON.stringify(blob));
}, fn);
const all0 = await scenes();
ok(all0.length > 10, '0  the Dragon sample is open', all0.length);

/* ---- 1 dropped is not shot ------------------------------------ */
const day1 = all0.filter((s) => Number(s.shootDay) === 1);
await writeScenes(`for (const s of scenes) { s.shotState = ''; } scenes.find((s) => s.id === ${JSON.stringify(day1[0].id)}).shotState = 'dropped';`);
await page.goto(url('shoot.html?day=1'), { waitUntil: 'networkidle' });
await settle(page);
const kpi = await page.$$eval('.sd-kpis .k-stat', (cs) => cs.map((c) => ({
  label: c.querySelector('.k-stat-label')?.textContent, value: c.querySelector('.k-stat-value')?.firstChild?.textContent,
  note: c.querySelector('.k-stat-note')?.textContent || ''
})));
const by = (l) => kpi.find((k) => k.label === l) || {};
ok(by('Scenes shot').value === '0', '1  Scenes shot leaves a dropped scene out', kpi);
ok(by('Pages shot').value === '0', '1  Pages shot leaves it out', kpi);
ok(by('In the can').value === '0' && /^0 of /.test(by('In the can').note), '1  In the can leaves it out', kpi);
ok(/left/.test(by('Scenes shot').note) && !/today/.test(by('Scenes shot').note), '1  a February day does not say "left today"', by('Scenes shot'));

/* ---- 3 ?day=N opens that day ---------------------------------- */
await page.goto(url('shoot.html?day=7'), { waitUntil: 'networkidle' });
await settle(page);
ok(await page.$eval('.sd-day.is-on', (b) => b.dataset.day).catch(() => '') === '7', '3  shoot.html?day=7 opens on Day 7');
await page.goto(url('reports.html?day=7#dpr'), { waitUntil: 'networkidle' });
await settle(page);
const markHref = await page.$$eval('#dpr a', (as) => (as.find((a) => /Mark scenes on the shoot day/.test(a.textContent)) || {}).getAttribute?.('href') || '');
ok(/shoot\.html\?day=7$/.test(markHref), '3  the DPR links to the day it reports', markHref);
await page.click(`#dpr a[href="${markHref}"]`).catch(() => {});
await page.waitForLoadState('networkidle'); await settle(page);
ok(await page.$eval('.sd-day.is-on', (b) => b.dataset.day).catch(() => '') === '7', '3  …and Shoot Day opens on it');

/* ---- 10 the day picker is the kit select ---------------------- */
await page.goto(url('reports.html#dpr'), { waitUntil: 'networkidle' });
await settle(page);
const pick = await page.$eval('#rp-dpr-day', (s) => ({ kit: !!s.closest('.k-control.k-select'), app: getComputedStyle(s).appearance }));
ok(pick.kit && pick.app === 'none', '10 the DPR day picker is the kit select', pick);

/* ---- 9 a blank DPR prints blank ------------------------------- */
await page.emulateMedia({ media: 'print' });
const blank = await page.evaluate(() => {
  const w = document.getElementById('dpr-weather');
  const t = document.querySelector('.rp-dpr input[type="time"]');
  return { ph: getComputedStyle(w, '::placeholder').color, time: getComputedStyle(t).color, blank: t.hasAttribute('data-blank') };
});
ok(/rgba\(0, 0, 0, 0\)|transparent/.test(blank.ph), '9  a blank weather field prints no placeholder example', blank);
ok(blank.blank && /rgba\(0, 0, 0, 0\)|transparent/.test(blank.time), '9  a blank time prints no --:-- mask', blank);
await page.emulateMedia({ media: 'screen' });
await page.fill('.rp-dpr input[type="time"]', '07:30');
ok(await page.$eval('.rp-dpr input[type="time"]', (t) => !t.hasAttribute('data-blank')), '9  a time typed in loses data-blank, so it prints');

/* ---- 4 "1 page" ----------------------------------------------- */
await writeScenes(`scenes.find((s) => s.id === ${JSON.stringify(day1[0].id)}).eighths = 8;`);
await page.goto(url('shoot.html?day=1'), { waitUntil: 'networkidle' });
await settle(page);
const pgs = await page.$$eval('.sd-pgs', (ps) => ps.map((p) => p.textContent));
ok(pgs.includes('1 page') && !pgs.includes('1 pages'), '4  a one-page scene reads "1 page"', pgs);

/* ---- 9 shoot print -------------------------------------------- */
await page.emulateMedia({ media: 'print' });
const sp = await page.evaluate(() => ({
  links: [...document.querySelectorAll('main a.k-btn')].filter((a) => getComputedStyle(a).display !== 'none').map((a) => a.textContent),
  days: getComputedStyle(document.querySelector('.sd-days')).display,
  filter: getComputedStyle(document.querySelector('.sd-filter')).display
}));
ok(sp.links.length === 0, '9  shoot.html prints no kit link-buttons', sp.links);
ok(sp.days === 'none' && sp.filter === 'none', '9  the day switcher and Filter labels do not print over nothing', sp);
await page.emulateMedia({ media: 'screen' });

/* ---- 5 one runtime -------------------------------------------- */
await page.goto(url('stripboard.html#stripboard'), { waitUntil: 'networkidle' });
await settle(page, 1200);
const sbMin = await page.$eval('.sb-kpi-runtime .k-stat-value', (v) => parseInt(v.textContent, 10)).catch(() => NaN);
await page.goto(url('reports.html#screentime'), { waitUntil: 'networkidle' });
await settle(page, 1200);
const rp = await page.evaluate(() => {
  const t = document.getElementById('screentime')?.innerText || '';
  const m = t.match(/(\d+)h (\d+)m/);
  return { min: m ? Number(m[1]) * 60 + Number(m[2]) : NaN, text: t };
});
ok(Number.isFinite(sbMin) && sbMin === rp.min, '5  the stripboard and Reports print the same runtime', [sbMin, rp.min]);
ok(!/page estimate alone/.test(rp.text) && /script estimate alone/.test(rp.text), '5  the no-songs note names the script estimate', rp.text.match(/No songs[^.]*\./));

/* ---- 6 people ------------------------------------------------- */
await page.goto(url('preprod.html#step-people'), { waitUntil: 'networkidle' });
await settle(page);
const ppl = await page.$eval('#step-people', (n) => n.innerText).catch(() => '');
ok(/\d+ people/.test(ppl) && !/persons/.test(ppl), '6  Cast & Crew counts people', ppl.slice(0, 160));

/* ---- 7 DOOD wording, key, codes ------------------------------- */
await page.goto(url('stripboard.html#dood'), { waitUntil: 'networkidle' });
await settle(page);
const dood = await page.evaluate(() => ({
  sub: document.querySelector('#dood .bd-sub')?.textContent || '',
  key: [...document.querySelectorAll('.sb-dood-key .k-dood')].map((c) => c.textContent),
  ws: [...new Set([...document.querySelectorAll('.k-dood')].map((c) => getComputedStyle(c).whiteSpace))]
}));
ok(/Stripboard tab/.test(dood.sub) && !/above/.test(dood.sub), '7  the DOOD intro names the Stripboard tab', dood.sub);
ok(dood.key.includes('SWF'), '7  the DOOD key explains SWF', dood.key);
ok(dood.ws.length === 1 && dood.ws[0] === 'nowrap', '7  a DOOD code never wraps', dood.ws);

/* ---- 2 an emptied day number ---------------------------------- */
const lastDay = Math.max(...all0.map((s) => Number(s.shootDay) || 0));
await writeScenes(`for (const s of scenes) if (Number(s.shootDay) === 5) s.shootDay = 4;`);
await page.goto(url('shoot.html?day=' + lastDay), { waitUntil: 'networkidle' });
await settle(page);
ok(await page.$eval('.sd-day.is-on', (b) => b.dataset.day).catch(() => '') === String(lastDay), '2  shoot.html opens on Day ' + lastDay);
const sd = await page.evaluate(() => ({ eb: document.querySelector('.sd-hero')?.innerText || '', of: document.querySelector('.sd-days-of')?.textContent || '' }));
const impossible = (t) => { const m = String(t).match(/Day (\d+) (?:of|\/) (\d+)/i); return !!m && Number(m[1]) > Number(m[2]); };
ok(!impossible(sd.eb) && !impossible(sd.of), '2  shoot.html never reads "Day N of M" with N > M', sd);
await page.goto(url('reports.html?day=' + lastDay + '#dpr'), { waitUntil: 'networkidle' });
await settle(page);
const title = await page.$eval('.rp-dpr-title', (t) => t.textContent).catch(() => '');
ok(title && !impossible(title), '2  the DPR title never reads "Day N of M" with N > M', title);

/* ---- 9 stripboard print: the day is text ---------------------- */
await page.goto(url('stripboard.html#stripboard'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-value="script"]').catch(() => {});
await settle(page, 300);
await page.emulateMedia({ media: 'print' });
const sbp = await page.evaluate(() => {
  const ctl = document.querySelector('.sb-day-ctl');
  const sel = ctl?.querySelector('select');
  return {
    border: ctl && getComputedStyle(ctl).borderTopWidth, caret: ctl && getComputedStyle(ctl, '::after').display,
    sel: sel && getComputedStyle(sel).display,
    seg: getComputedStyle(document.querySelector('.sb-seg')).display,
    links: [...document.querySelectorAll('main a.k-btn')].filter((a) => getComputedStyle(a).display !== 'none').length
  };
});
ok(sbp.sel !== 'none' && sbp.border === '0px' && sbp.caret === 'none', '9  a strip prints its day as text, with no empty frame', sbp);
ok(sbp.seg === 'none' && sbp.links === 0, '9  no "Group by" label or link-button prints', sbp);
await page.emulateMedia({ media: 'screen' });

/* ---- 8 lock: the dialog's pointer and the badge's date -------- */
await page.click('.sb-lock-btn');
await page.waitForSelector('.dlg .dlg-field');
const note = await page.$eval('.dlg', (d) => d.innerText);
ok(!/revision tools/.test(note) && /Unlock draft/.test(note), '8  the lock dialog points at this page\'s Unlock draft', note.slice(0, 400));
await page.fill('.dlg .dlg-field', 'LOCK');
await page.click('.dlg .mbtn.primary');
await settle(page);
const badge = await page.$eval('.sb-lock-state', (b) => b.textContent).catch(() => '');
ok(/Draft locked · /i.test(badge) && !/\d{4}-\d{2}-\d{2}/.test(badge), '8  the lock badge prints the film\'s date style', badge);

/* ---- 11 a pinned strip at 390 has no mask --------------------- */
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const pp = await phone.newPage();
pp.on('pageerror', (e) => errors.push(e.message));
await pp.goto(url('reports.html#reports'), { waitUntil: 'networkidle' });
await settle(pp, 600);
await pp.mouse.wheel(0, 700);
await settle(pp, 600);
const strip = await pp.evaluate(() => {
  const n = document.querySelector('nav.tabs');
  return n && { stuck: n.classList.contains('is-stuck'), more: n.getAttribute('data-more'), mask: getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage };
});
ok(strip && strip.stuck, '11 the strip pins at 390', strip);
ok(strip && strip.mask === 'none', '11 a pinned strip carries no edge mask', strip);
await phone.close();

ok(errors.length === 0, '0  no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
