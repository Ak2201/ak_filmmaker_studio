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
    12  plan.html with no scenes prints dashes, as the stripboard does,
        never "0 shoot days · 0 dates set · 0 locations"

    13  round 2: "Make the call sheet" carries the day and "View call sheet"
        lands on that day's sheet; marking with "Incomplete" on keeps focus;
        a swapped lunch / negative setups never print as figures; an
        equipment removal has Undo and keeps focus; an empty Equipment add
        says why; clearing an orphan date has Undo and keeps focus; the
        dashboard's "days dated" is the Plan's count; the Reports strip,
        and the DOOD intro, claim nothing on an empty project; the DOOD tab
        has its own Export and prints every day; the cast matrix prints
        every scene; the recce prints blanks blank and answers whole; the
        Reports Export menus are kit buttons; Shoot Day's spoken names
        contain their visible labels

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
/* ---- 12 an empty plan claims nothing (before the sample) ------ */
await page.goto(url('plan.html'), { waitUntil: 'networkidle' });
await settle(page);
const planStats = await page.$$eval('.bd-head .k-stat .k-stat-value', (vs) => vs.slice(0, 3).map((v) => v.textContent));
ok(planStats.length === 3 && planStats.every((v) => v === '—'), '12 an empty plan.html prints dashes, not zeros', planStats);
await page.goto(url('reports.html'), { waitUntil: 'networkidle' });
await settle(page);
const rpStats = await page.$$eval('.bd-head .k-stat .k-stat-value', (vs) => vs.map((v) => v.textContent.trim()));
ok(rpStats.length === 5 && rpStats.every((v) => v === '—'), '13 an empty reports.html strip prints dashes, not zeros', rpStats);
await page.goto(url('stripboard.html#dood'), { waitUntil: 'networkidle' });
await settle(page);
const emptyDood = await page.$eval('#dood', (n) => n.innerText).catch(() => '');
ok(/Stripboard tab/.test(emptyDood) && !/on the breakdown/.test(emptyDood), '13 the empty DOOD says days are set on the Stripboard tab', emptyDood.slice(0, 300));
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
await page.goto(url('breakdown.html#screentime'), { waitUntil: 'networkidle' });
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

/* ---- 13 round 2 ------------------------------------------------ */
const fire = (sel, ev = 'change') => page.$eval(sel, (n, e) => n.dispatchEvent(new Event(e, { bubbles: true })), ev);
await writeScenes(`for (const s of scenes) { s.shotState = ''; }`);

/* the call sheet link carries the day / the sheet */
await page.goto(url('shoot.html?day=3'), { waitUntil: 'networkidle' });
await settle(page);
const make = await page.$$eval('.sd-hero a.k-btn', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]));
ok(make.some(([t, h]) => /Make the call sheet/.test(t) && /\?day=3#call-sheets$/.test(h)), '13 "Make the call sheet" on Day 3 carries ?day=3', make);
await page.goto(url('contacts.html?day=3#call-sheets'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-action="sheet-add"] >> visible=true');
await settle(page, 300);
const made = await page.evaluate(() => document.activeElement && document.activeElement.value);
ok(/Day 3/.test(made || ''), '13 "New shoot day" after it makes the sheet for Day 3, not the first free day', made);
await page.goto(url('shoot.html?day=14'), { waitUntil: 'networkidle' });
await settle(page);
const viewHref = await page.$$eval('.sd-hero a.k-btn', (as) => (as.find((a) => /View call sheet/.test(a.textContent)) || {}).getAttribute?.('href') || '');
ok(/contacts\.html\?sheet=[^#]+#call-sheets$/.test(viewHref), '13 "View call sheet" names the sheet', viewHref);
if (viewHref) {
  await page.goto(url(viewHref), { waitUntil: 'networkidle' });
  await settle(page, 700);
  const sid = decodeURIComponent((viewHref.match(/sheet=([^#]+)/) || [])[1] || '');
  const top = await page.evaluate((id) => { const c = document.querySelector('.ct-sheet[data-sheet="' + CSS.escape(id) + '"]'); return c ? Math.round(c.getBoundingClientRect().top) : null; }, sid);
  ok(top !== null && top >= 0 && top < 400, '13 …and opens at that day\'s sheet, not the top of the list', top);
}

/* marking with "Incomplete" on keeps focus */
await page.goto(url('shoot.html?day=3'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('.sd-fbtn[data-filter="incomplete"]');
await settle(page, 200);
await page.focus('.sd-card [data-shoot-action="mark"]');
await page.keyboard.press('Enter');
await settle(page, 300);
const kept = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
ok(kept && kept !== 'BODY', '13 marking a scene with the Incomplete filter on keeps focus in the page', kept);

/* spoken names contain the visible words (WCAG 2.5.3) */
await page.click('.sd-take-add >> nth=0');
await settle(page, 200);
const names = await page.$$eval('.sd-take-undo, [data-shoot-action="note-edit"]', (bs) => bs.map((b) => [(b.lastElementChild ? b.lastElementChild.textContent : b.textContent).trim().toLowerCase(), (b.getAttribute('aria-label') || '').toLowerCase()]));
ok(names.length > 1 && names.every(([t, a]) => a.includes(t)), '13 Undo / Add floor note / Edit note are spoken with their visible words', names);

/* the DPR */
await page.goto(url('reports.html?day=1#dpr'), { waitUntil: 'networkidle' });
await settle(page);
await page.fill('#dpr-setups', '-3'); await fire('#dpr-setups');
ok(await page.$eval('#dpr-setups', (i) => i.value) === '', '13 a typed -3 in Setups is refused', await page.$eval('#dpr-setups', (i) => i.value));
ok(!/-3/.test(await page.$eval('#rp-dpr-derived', (n) => n.innerText)), '13 the strip never prints SETUPS -3');
for (const [f, v] of [['crewCall', '07:00'], ['wrap', '19:00'], ['lunchIn', '13:00'], ['lunchOut', '12:30'], ['firstShot', '06:30']]) {
  await page.fill(`[data-dpr-field="${f}"]`, v); await fire(`[data-dpr-field="${f}"]`);
}
const calc = await page.$eval('#rp-dpr-calc', (n) => n.textContent);
ok(/Check the two times/.test(calc) && !/23h/.test(calc), '13 a swapped lunch / first shot is flagged, never 23h 30m', calc);
ok(await page.$$eval('#dpr .tb-menu-btn', (bs) => bs.length > 0 && bs.every((b) => b.classList.contains('k-btn'))), '13 the DPR Export menu is a kit button');

/* equipment */
await page.goto(url('reports.html?day=1#kit'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-action="kit-add"][data-dept="camera"]');
ok(await page.$eval('[data-kit-new="camera"]', (i) => i.getAttribute('aria-invalid')) === 'true', '13 an empty Equipment add says why (aria-invalid)');
for (const n of ['Tripod A', 'Tripod B', 'Tripod C']) {
  await page.fill('[data-kit-new="camera"]', n);
  await page.press('[data-kit-new="camera"]', 'Enter');
  await settle(page, 150);
}
const rm = await page.$$('[data-action="kit-remove"]');
const before = await page.$$eval('[data-action="kit-remove"]', (b) => b.length);
await rm[rm.length - 2].focus();
await page.keyboard.press('Enter');
await settle(page, 300);
const fk = await page.evaluate(() => { const a = document.activeElement; return a && (a.id || a.getAttribute('data-action') || a.tagName); });
ok(fk && fk !== 'rp-kit-day' && fk !== 'BODY', '13 removing an item keeps focus in the list, not on the day picker', fk);
await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
await settle(page, 300);
ok(await page.$$eval('[data-action="kit-remove"]', (b) => b.length) === before, '13 Undo puts the removed item back');
ok(await page.$$eval('#kit .tb-menu-btn', (bs) => bs.length > 0 && bs.every((b) => b.classList.contains('k-btn'))), '13 the Equipment Export menu is a kit button');

/* the plan: an orphan date */
await page.evaluate(() => {
  const b = JSON.parse(localStorage.getItem('fms_locations_v1') || '{}');
  b.days = b.days || {};
  b.days['1'] = '2026-03-01'; b.days['2'] = '2026-03-02'; b.days['40'] = '2026-04-01';
  localStorage.setItem('fms_locations_v1', JSON.stringify(b));
});
await page.goto(url('plan.html#calendar'), { waitUntil: 'networkidle' });
await settle(page);
const planDated = await page.$eval('.bd-head [data-pl-dated] .k-stat-value', (v) => v.textContent.trim());
await page.goto(url('dashboard.html'), { waitUntil: 'networkidle' });
await settle(page, 800);
const dashDated = await page.evaluate(() => { const m = document.body.innerText.match(/(\d+) days? dated/); return m ? m[1] : ''; });
ok(planDated !== '' && dashDated === planDated, '13 the dashboard\'s "days dated" is the Plan\'s count (an orphan date is not counted)', [planDated, dashDated]);
await page.goto(url('plan.html#calendar'), { waitUntil: 'networkidle' });
await settle(page);
await page.focus('.pl-orphan[data-day="40"] [data-action="day-clear"]');
await page.keyboard.press('Enter');
await settle(page, 300);
const fo = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
ok(fo && fo !== 'BODY', '13 clearing an orphan date keeps focus in the calendar', fo);
await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
await settle(page, 300);
ok(await page.$('.pl-orphan[data-day="40"]') !== null, '13 …and Undo puts the date back');

/* print: the recce, the DOOD, the cast matrix */
await page.goto(url('plan.html#locations'), { waitUntil: 'networkidle' });
await settle(page);
await page.fill('.pl-input[data-recce-field="power"]', 'Mains on site, thirty metres from the van, and a generator on standby for the dusk window');
await settle(page, 200);
await page.emulateMedia({ media: 'print' });
const rc = await page.evaluate(() => {
  const ins = [...document.querySelectorAll('.pl-input')];
  const mirrors = ins.map((i) => i.nextElementSibling).filter((m) => m && m.classList.contains('pl-print'));
  const filled = mirrors.find((m) => /generator on standby/.test(m.textContent));
  return { inputs: ins.length, shown: ins.filter((i) => getComputedStyle(i).display !== 'none').length, mirrors: mirrors.length,
    mirrorsShown: mirrors.filter((m) => getComputedStyle(m).display === 'block').length, filled: !!filled, blanks: mirrors.filter((m) => !m.textContent).length };
});
ok(rc.inputs > 0 && rc.shown === 0 && rc.mirrors === rc.inputs && rc.mirrorsShown === rc.mirrors, '13 the recce prints a mirror, never a clipped input with a placeholder', rc);
ok(rc.filled && rc.blanks > 0, '13 a filled answer prints whole and a blank one prints blank', rc);
await page.emulateMedia({ media: 'screen' });

await page.setViewportSize({ width: 700, height: 900 });
await page.goto(url('stripboard.html#dood'), { waitUntil: 'networkidle' });
await settle(page);
await page.setViewportSize({ width: 1440, height: 900 });
ok(await page.$eval('#dood .tb-menu-btn', (b) => b.offsetParent !== null).catch(() => false), '13 the DOOD tab has its own Export menu');
await page.setViewportSize({ width: 700, height: 900 });
await page.emulateMedia({ media: 'print' });
const dp = await page.$eval('.sb-dood-scroll', (n) => ({ ov: getComputedStyle(n).overflowX, sw: n.scrollWidth, cw: n.clientWidth, days: n.querySelectorAll('.sb-grid-day').length }));
ok(dp.ov === 'visible' && dp.sw <= dp.cw + 1 && dp.days > 6, '13 printing the DOOD fits every day on the page', dp);
await page.emulateMedia({ media: 'screen' });
await page.goto(url('breakdown.html#cast-matrix'), { waitUntil: 'networkidle' });
await settle(page);
await page.emulateMedia({ media: 'print' });
const cmx = await page.$eval('#cast-matrix .rp-scroll', (n) => ({ ov: getComputedStyle(n).overflowX, sw: n.scrollWidth, cw: n.clientWidth, cols: n.querySelectorAll('thead th').length }));
ok(cmx.ov === 'visible' && cmx.sw <= cmx.cw + 1 && cmx.cols > 20, '13 printing the cast matrix fits every scene column', cmx);
await page.emulateMedia({ media: 'screen' });
await page.setViewportSize({ width: 1440, height: 900 });
/* 14 Cast matrix and Screen time each have one Export menu (print, PDF, CSV), and the CSV downloads. */
for (const [id, tag, csvName] of [['cast-matrix', 'castmatrix', 'cast-matrix.csv'], ['screentime', 'screentime', 'screen-time.csv']]) {
  await page.goto(url('breakdown.html#' + id), { waitUntil: 'networkidle' });
  await settle(page);
  const acts = await page.$$eval(`#${id} [data-action]`, (ns) => ns.map((n) => n.getAttribute('data-action')));
  ok(['print-', 'pdf-', 'csv-'].every((p) => acts.includes(p + tag)), `14 ${id} has print, PDF and CSV in its Export menu`, acts);
  await page.click(`#${id} .tb-menu-btn`).catch(() => {});
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.click(`#${id} [data-action="csv-${tag}"]`, { force: true }).catch(() => {})
  ]);
  ok(!!dl && dl.suggestedFilename().endsWith(csvName), `14 ${id} CSV downloads as *-${csvName}`, dl && dl.suggestedFilename());
}

/* ---- round 3 -------------------------------------------------- */
const daysOf = async () => (await scenes()).map((s) => [s.id, Number(s.shootDay) || 0]);
const activeAction = () => page.evaluate(() => document.activeElement?.getAttribute('data-action') || document.activeElement?.tagName);
await page.goto(url('stripboard.html#stripboard'), { waitUntil: 'networkidle' });
await settle(page, 1000);
const days0 = await daysOf();
await page.click('[data-action="sb-auto"]');
await settle(page, 300);
ok(await page.locator('.dlg button', { hasText: /^Re-schedule$/ }).count() === 1, '14 re-scheduling names its button, not OK');
await page.locator('.dlg button', { hasText: /^Re-schedule$/ }).click();
await settle(page, 500);
ok(JSON.stringify(await daysOf()) !== JSON.stringify(days0), '14 re-scheduling rewrote the days');
ok(await activeAction() === 'sb-auto', '14 focus returns to Schedule by location after the confirm', await activeAction());
await page.locator('.toast-action', { hasText: 'UNDO' }).last().click();
await settle(page, 400);
ok(JSON.stringify(await daysOf()) === JSON.stringify(days0), '14 UNDO brings the hand-made schedule back');
await page.click('[data-action="sb-clear"]');
await settle(page, 300);
await page.locator('.dlg button', { hasText: /^Clear days$/ }).click();
await settle(page, 500);
ok(await activeAction() === 'sb-clear', '14 focus returns to Clear days after the confirm', await activeAction());
/* 19.5 nothing scheduled: the pages card says so in pages' words, never "eighths" */
const pagesCard = await page.$eval('.sb-kpi-pages', (n) => n.innerText).catch(() => '');
ok(!/eighths/i.test(pagesCard) && /no shoot days yet/i.test(pagesCard), '19.5 the Script pages card never prints \u201ceighths\u201d', pagesCard);

await page.goto(url('preprod.html'), { waitUntil: 'networkidle' });
await settle(page);
const sheetsState = await page.$eval('#step-sheets .pp-state', (n) => n.textContent.trim()).catch(() => '');
ok(/not started|to do/i.test(sheetsState), '15 with every day cleared, Sides & call sheets is not Done', sheetsState);
await page.emulateMedia({ media: 'print' });
const printed = await page.$$eval('.pp-step', (ns) => ns.map((n) => getComputedStyle(n).display));
await page.emulateMedia({ media: 'screen' });
ok(printed.length >= 9 && printed.every((d) => d !== 'none'), '16 printing Pre-Production prints every step', printed);

await page.evaluate((d) => {
  const blob = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  const m = new Map(d); blob.scenes.forEach((s) => { s.shootDay = m.get(s.id) || 0; });
  localStorage.setItem('fms_scenes_v1', JSON.stringify(blob));
}, days0);
await page.goto(url('reports.html?day=1#dpr'), { waitUntil: 'networkidle' });
await settle(page, 800);
await page.click('[data-action="dpr-delay-add"]');
await settle(page, 200);
const mins = page.locator('#dpr input[data-field="minutes"]').first();
for (const [typed, shown] of [['-30', ''], ['99999', ''], ['1.5', '1']]) {
  await mins.fill(typed); await mins.press('Tab'); await settle(page, 200);
  ok(await mins.inputValue() === shown, `17 delay minutes "${typed}" shows "${shown}", what the total adds`, await mins.inputValue());
}
await page.locator('#dpr input[data-field="note"]').first().fill('Rain stopped play');
await page.locator('#dpr input[data-field="note"]').first().press('Tab');
await page.click('[data-action="dpr-delay-remove"]');
await settle(page, 300);
ok(await page.locator('#dpr input[data-field="note"]').count() === 0, '18 Remove takes the delay out');
await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
await settle(page, 300);
ok(await page.locator('#dpr input[data-field="note"]').first().inputValue() === 'Rain stopped play', '18 Undo puts the delay back with its note');

/* ---- 19 round 4 ------------------------------------------------ */
{
  const R = (n, label) => `19.${n} ${label}`;
  /* 1 a later day dated before an earlier one is said on the calendar */
  await page.goto(url('plan.html#calendar'), { waitUntil: 'networkidle' });
  await settle(page);
  const d3 = page.locator('input[aria-label="Calendar date for shoot day 3"]');
  const was3 = await d3.inputValue();
  const when0 = await page.$eval('.pl-day[data-day="3"] .pl-day-when', (n) => n.textContent);
  await d3.fill('2024-02-01'); await d3.press('Tab'); await settle(page, 300);
  const when3 = await page.$eval('.pl-day[data-day="3"] .pl-day-when', (n) => n.textContent);
  ok(/dated before Day 2/.test(when3), R(1, 'a later shoot day dated before an earlier one says so'), when3);
  await d3.fill(was3); await d3.press('Tab'); await settle(page, 300);
  const back3 = await page.$eval('.pl-day[data-day="3"] .pl-day-when', (n) => n.textContent);
  ok(back3 === when0, R(1, 'and the note goes when the date is put right'), { was3, when0, back3 });

  /* 2, 3 stripboard focus: banner removal, Alt+arrow on a strip's handle */
  await page.goto(url('stripboard.html#stripboard'), { waitUntil: 'networkidle' });
  await settle(page);
  await page.click('[data-action="sb-group"][data-value="day"]');
  await settle(page, 300);
  await page.locator('.sb-banner-menu .tb-menu-btn').first().click();
  await page.locator('[data-action="sb-banner-add"][data-kind="note"]').first().click();
  await settle(page, 300);
  await page.locator('[data-action="sb-banner-remove"]').first().focus();
  await page.keyboard.press('Enter');
  await settle(page, 300);
  const afterRm = await page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, menu: !!(a.closest && a.closest('.sb-banner-menu')) }; });
  ok(afterRm.menu, R(2, 'removing a banner leaves focus on that day’s + Banner, not <body>'), afterRm);
  const grip = page.locator('.sb-strip .tb-menu-btn').first();
  await grip.focus();
  await page.keyboard.press('Alt+ArrowUp');          /* the first strip is already at the top */
  await settle(page, 200);
  const opened = await page.evaluate(() => ({ open: document.querySelectorAll('.tb-menu-panel:not([hidden])').length, item: document.activeElement.classList.contains('tb-item') }));
  ok(opened.open === 0 && !opened.item, R(3, 'Alt+↑ on a strip that cannot move opens no menu'), opened);

  /* 6, 17, 16 Shoot Day: the note cap, Escape, the badge */
  await page.goto(url('shoot.html?day=3'), { waitUntil: 'networkidle' });
  await settle(page);
  const badge = await page.$eval('.sd-day[data-day="1"] .sd-day-m.is-cur', (n) => n.textContent.trim()).catch(() => '');
  ok(badge !== 'current', R(16, 'the strip’s badge never says “current” on a day that is not the selected one'), badge);
  await page.locator('[data-shoot-action="note-edit"]').first().click();
  await settle(page, 200);
  const cap = await page.$eval('[data-shoot-note]', (t) => t.getAttribute('maxlength'));
  ok(cap === '2000', R(6, 'the floor-note box enforces the 2,000 cap, not maxlength="undefined"'), cap);
  await page.locator('[data-shoot-note]').first().fill('half a note');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  const esc = await page.evaluate(() => ({ open: !!document.querySelector('[data-shoot-note]'), act: document.activeElement.getAttribute('data-shoot-action') }));
  ok(!esc.open && esc.act === 'note-edit', R(17, 'Escape closes the note editor and returns focus to Add floor note'), esc);

  /* 7, 9, 10, 15 Reports */
  await page.goto(url('breakdown.html#cast-matrix'), { waitUntil: 'networkidle' });
  await settle(page, 600);
  const boxes = await page.$$eval('#cast-matrix .rp-scroll, .rp-scroll', (ns) => ns.filter((n) => n.offsetParent).map((n) => [n.getAttribute('tabindex'), n.getAttribute('role'), (n.getAttribute('aria-label') || '').length > 0]));
  ok(boxes.length > 0 && boxes.every((b) => b[0] === '0' && b[1] === 'region' && b[2]), R(9, 'a sideways-scrolling report table is a focusable, named region'), boxes);
  await page.emulateMedia({ media: 'print' });
  const names7 = await page.$$eval('.rp-matrix tbody th.loc', (ns) => ns.slice(0, 5).map((n) => Math.round(n.getBoundingClientRect().width)));
  const head7 = await page.$eval('.rp-matrix thead th', (n) => Math.round(n.getBoundingClientRect().width));
  await page.emulateMedia({ media: 'screen' });
  ok(names7.length > 0 && names7.every((w) => w >= 100) && head7 >= 100, R(7, 'a printed cast matrix gives the character column room for a name'), { names7, head7 });

  await page.goto(url('reports.html#sides'), { waitUntil: 'networkidle' });
  await settle(page, 600);
  await page.click('[data-action="sides-none"]');
  await settle(page, 200);
  await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  await page.locator('#sides .tb-menu-btn').first().click();
  await page.locator('[data-action="print-sides"]').first().click();
  await settle(page, 300);
  const toastText = await page.$$eval('.toast', (ns) => ns.map((n) => n.textContent).join(' | '));
  ok(await page.evaluate(() => window.__prints) === 0 && /Tick the scenes/.test(toastText), R(10, 'Print the sides with nothing ticked prints nothing and says why'), toastText);
  ok(await page.$eval('#rp-sides-out .bd-none', (n) => n.classList.contains('rp-noprint')).catch(() => false), R(10, 'the on-screen instruction is not part of the printout'));
  await page.click('[data-action="sides-all"]');
  await page.evaluate(() => document.body.classList.remove('rp-print-sides'));   /* a plain Ctrl+P, not the Export item */
  await page.emulateMedia({ media: 'print' });
  const brk = await page.$eval('#sides', (n) => getComputedStyle(n).breakBefore);
  await page.emulateMedia({ media: 'screen' });
  ok(brk === 'auto', R(11, 'Ctrl+P on the Sides tab does not push the sides to page 2 behind the stat strip'), brk);

  await page.goto(url('breakdown.html#screentime'), { waitUntil: 'networkidle' });
  await settle(page, 600);
  await page.fill('#rt-target', '99999'); await fire('#rt-target');
  await settle(page, 300);
  ok(/1 to 600 minutes/.test(await page.$$eval('.toast', (ns) => ns.map((n) => n.textContent).join(' | '))), R(15, 'an out-of-range target says why it was not kept'));

  /* 12 the recce prints blank */
  await page.goto(url('plan.html'), { waitUntil: 'networkidle' });
  await settle(page, 600);
  await page.emulateMedia({ media: 'print' });
  const rc = await page.evaluate(() => {
    const n = document.querySelector('.pl-notes'), sel = document.querySelector('select.pl-sel'), note = document.querySelector('.pl-light-note');
    return {
      ph: n && getComputedStyle(n, '::placeholder').color,
      app: sel && getComputedStyle(sel).appearance,
      hint: note ? getComputedStyle(note).display : 'none'
    };
  });
  await page.emulateMedia({ media: 'screen' });
  ok(/rgba\(0, 0, 0, 0\)|transparent/.test(rc.ph || '') && rc.app === 'none' && rc.hint === 'none', R(12, 'a recce prints blank: no Notes placeholder, no select chevron, no screen-only map hint'), rc);

  /* 14 a wrap before the call is not a 23-hour day */
  await page.goto(url('reports.html?day=1#dpr'), { waitUntil: 'networkidle' });
  await settle(page);
  for (const [f, v] of [['crewCall', '06:00'], ['wrap', '05:00'], ['lunchIn', ''], ['lunchOut', ''], ['firstShot', '']]) {
    await page.fill(`[data-dpr-field="${f}"]`, v); await fire(`[data-dpr-field="${f}"]`);
  }
  const calc14 = await page.$eval('#rp-dpr-calc', (n) => n.textContent);
  ok(/Check the two times/.test(calc14) && !/23h/.test(calc14), R(14, 'call 06:00, wrap 05:00 is flagged, never a 23h 00m day'), calc14);

  /* phone: 4 the active tab clears the Sections button; 8 the equipment table fits; 18 the select; 19 the Fix links */
  const ph4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const q = await ph4.newPage();
  q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(url('reports.html#dpr'), { waitUntil: 'networkidle' });
  await settle(q, 800);
  const tabv = await q.evaluate(() => {
    const t = document.querySelector('nav.tabs [aria-selected="true"], nav.tabs .is-on, nav.tabs [aria-current="page"]');
    const b = document.querySelector('nav.tabs .tabs-sections');
    if (!t || !b || !b.offsetParent) return { skip: true, t: !!t, b: !!b };
    const r = t.getBoundingClientRect(), s = b.getBoundingClientRect();
    return { overlap: Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left)), tab: [r.left, r.right], btn: [s.left, s.right] };
  });
  ok(!tabv.skip && tabv.overlap === 0, R(4, 'at 390 the selected Reports tab is clear of the Sections button'), tabv);

  await q.goto(url('reports.html?day=1#kit'), { waitUntil: 'networkidle' });
  await settle(q, 600);
  await q.click('[data-action="kit-seed"]');
  await settle(q, 400);
  const kit = await q.evaluate(() => {
    const t = document.querySelector('.rp-kit-table'), box = t && t.closest('.rp-scroll');
    const tick = t && t.querySelector('.rp-kit-tick input');
    const x = t && t.querySelector('[data-action="kit-remove"]');
    return {
      page: document.documentElement.scrollWidth, vw: window.innerWidth,
      fits: box ? box.scrollWidth <= box.clientWidth + 1 : null,
      tick: tick && Math.round(tick.getBoundingClientRect().width),
      removeRight: x && Math.round(x.getBoundingClientRect().right)
    };
  });
  ok(kit.page <= kit.vw && kit.fits === true && kit.tick >= 24 && kit.removeRight <= kit.vw, R(8, 'at 390 the equipment table fits its card: no page overflow, Back and Remove on screen, 24px+ tick boxes'), kit);

  await q.goto(url('stripboard.html#stripboard'), { waitUntil: 'networkidle' });
  await settle(q, 600);
  const selw = await q.$eval('#sb-target', (n) => Math.round(n.getBoundingClientRect().width));
  ok(selw >= 200, R(18, 'at 390 the pages-per-day select is wide enough for “4 7/8 pp · default”'), selw);

  await q.goto(url('preprod.html#step-ready'), { waitUntil: 'networkidle' });
  await settle(q, 600);
  const fix = await q.$$eval('.pp-check a', (ns) => ns.map((n) => Math.round(n.getBoundingClientRect().height)));
  ok(fix.length > 0 && fix.every((h) => h >= 44), R(19, 'the Fix → links are 44px tall on a touch screen'), fix);
  await ph4.close();
}

/* ---- 26 leftovers: Edit Log conflict buttons keep focus -------- */
{
  const target = (await scenes())[0].id;
  await writeScenes(`scenes.find((s) => s.id === ${JSON.stringify(target)}).shotState = 'dropped';`);
  const seedCut = () => page.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem('fms_edit_v1') || '{}');
    d.scenes = Object.assign({}, d.scenes, { [id]: { cut: 'in' } });
    localStorage.setItem('fms_edit_v1', JSON.stringify(d));
  }, target);
  for (const act of ['conflict-cut-out', 'conflict-pickup']) {
    await page.goto(url('index.html'), { waitUntil: 'networkidle' });
    await seedCut();
    await page.goto(url('edit.html'), { waitUntil: 'networkidle' });
    await settle(page, 600);
    const btn = `[data-edit-action="${act}"][data-scene="${target}"]`;
    if (!(await page.$(btn))) { ok(false, `26 a dropped scene still in the cut shows ${act}`); continue; }
    await page.click(btn);
    await settle(page, 500);
    const f = await page.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, field: a && a.getAttribute && a.getAttribute('data-edit-field'), scene: a && a.getAttribute && a.getAttribute('data-scene') }; });
    ok(f.tag !== 'BODY' && f.field === 'cut' && f.scene === target, `26 ${act} puts focus on the scene's cut-status select`, f);
  }
}

ok(errors.length === 0, '0  no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
