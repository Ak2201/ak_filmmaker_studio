/* ============================================================
   PROOF: the Script page and Drafts — writing the conventional
   way, and the "new draft or update this one?" question.
   ------------------------------------------------------------
   verify sees words, keys, overflow and idle writes on an EMPTY
   page. None of what this page is for happens on an empty page:
   typing INT. and getting a scene heading, ALL CAPS + Return
   giving a character, a draft saved from the leave dialog, a
   draft printing the same way twice. So this types.

   Asserted:
     1  INT. becomes a scene heading; Return moves to action
     2  ALL CAPS + Return makes a character, then dialogue follows
     3  Alt+digit sets the type, and the top-bar dropdown follows
     4  no per-row <select> on the writing page
     5  a typing burst is one save, and idle writes nothing
     6  the beats panel opens, marks a current beat, and jumps
     7  Ctrl/⌘+S offers "Save as Draft 1" before any draft exists
     8  leaving with changes asks: Save as Draft 2 / Update Draft 1 / Not now
     9  each answer does what it says, and navigation continues
    10  leaving with NO changes asks nothing
    11  a draft's print staging is identical twice
    12  old write.html fragments land on their new homes; ?stay=1 stays
    13  no horizontal overflow at 390 or 1280; no page errors
    19  an import offers "Break down everything"; the checklist runs every
        step, the summary counts what was made, and the Script analysis
        tab draws — at 1280 and 390
    20  QA round: a multi-line paste is split into elements; the chips
        follow Alt+digit; the line toolbar covers no text; a stale "Use
        theirs" is withdrawn; an arrival is never the current draft; a
        second Writer tab and an open drafts.html never save a stale
        copy; Revised pages is on drafts.html; a restore bins the
        scenes it lacks; the phone toolbar is one row with Notes' icon
    23  QA round 4: a >64 KB script saved in another window reaches the open
        Writer; focus survives arrivals, "Use theirs" and the drafts actions;
        the find count follows an arrival; menus skip CSS-hidden items; the
        stage guide has its gutter

       npm run build:open && npm run prove:script
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5371;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
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
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
/* Count script saves, and make print() observable without a dialog. */
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push({ k, t: performance.now() }); return set.call(this, k, v); };
  window.__prints = [];
  window.print = () => {
    const m = document.getElementById('main');
    window.__prints.push((m ? m.innerHTML : '') + '|' + document.title + '|' + document.body.className);
    setTimeout(() => dispatchEvent(new Event('afterprint')), 0);
  };
});
const page = await ctx.newPage();
/* The beforeunload warning is the page doing its job on page.goto with
   unsaved draft changes; Chromium logs that it held back the panel. */
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const doc = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const types = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.type + ':' + e.text);
const settle = (ms = 1500) => page.waitForTimeout(ms);
const dialog = () => page.$$eval('.lp-card [data-lp]', (bs) => bs.map((b) => b.textContent.trim()));

/* ---- a project ---------------------------------------------------- */
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Script', format: 'feature' });
  S.setCurrentProject(p.id);
});

/* ---- 1–4 typing ----------------------------------------------------- */
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
ok(await page.$$eval('#wr-page select', (s) => s.length) === 0, '4  no per-row <select> on the writing page');
ok(await page.isVisible('.sc-hint'), 'the empty script shows its one-line hint');
await page.click('#wr-page .wr-text');
await page.keyboard.type('int. hostel room - night');
await page.keyboard.press('Enter');
await page.keyboard.type('Arun stares at the board.');
await page.keyboard.press('Enter');
await page.keyboard.type('ARUN');
await page.keyboard.press('Enter');
await page.keyboard.type('I will finish this.');
await settle();
const t1 = await types();
ok(t1[0] && t1[0].startsWith('scene:'), '1  INT. becomes a scene heading', t1);
ok(t1[1] === 'action:Arun stares at the board.', '1  Return after the heading moves to action', t1);
ok(t1[2] === 'character:ARUN' && t1[3] === 'dialogue:I will finish this.', '2  ALL CAPS + Return makes a character, then dialogue', t1);
ok(!(await page.isVisible('.sc-hint')), 'the hint is gone once something is written');

await page.keyboard.press('Enter');
await page.keyboard.press('Alt+6');   // transition, per write-presets
await page.waitForTimeout(200);
const sel = await page.$eval('#scType', (s) => s.value);
await page.keyboard.type('CUT TO:');
await settle();
const t2 = await types();
ok(sel === t2[t2.length - 1].split(':')[0] && sel !== 'dialogue', '3  Alt+digit sets the type and the dropdown follows', { sel, last: t2[t2.length - 1] });

/* ---- 5 one save per burst; idle writes nothing ------------------------ */
await page.click('#wr-page .wr-el:nth-child(2) .wr-text').catch(() => {});
let before = await page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
await page.keyboard.press('End');
await page.keyboard.type(' He does not blink.', { delay: 20 });
await settle();
let after = await page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
ok(after - before >= 1 && after - before <= 2, '5  a typing burst is one save (two at most across the debounce)', after - before);
before = await page.evaluate(() => window.__writes.length);
await page.waitForTimeout(4000);
after = await page.evaluate(() => window.__writes.length);
ok(after === before, '5  four idle seconds write nothing', after - before);

/* ---- 6 beats --------------------------------------------------------- */
/* Beats land on the target when one is set, else on the script as written
   (beat-basis.js), so a short proof script has no unwritten beat unless the
   film's target runs far past it. */
await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('fms_songs_v1') || '{}'); o.targetMinutes = 300; localStorage.setItem('fms_songs_v1', JSON.stringify(o)); });
await page.click('[data-action="sc-beats"]');
await page.waitForSelector('#beatsPanel .bp-beat', { timeout: 5000 }).catch(() => {});
const nBeats = await page.$$eval('#beatsPanel .bp-beat', (b) => b.length);
ok(nBeats >= 5, '6  the beats panel lists the beats', nBeats);
await page.click('#wr-page .wr-text');
await page.waitForTimeout(300);
ok(await page.$('#beatsPanel .bp-beat[aria-current="true"]') !== null, '6  the beat being written is marked');
await page.click('#beatsPanel .bp-beat >> nth=-1');
await page.waitForTimeout(300);
ok(/./.test(await page.$eval('#beatsPanel .bp-hint', (n) => n.textContent)), '6  an unwritten beat says so and jumps to the end');
await page.click('[data-action="sc-beats"]');

/* ---- 7 Ctrl+S before any draft ---------------------------------------- */
await page.click('#wr-page .wr-text');
await page.keyboard.press('Control+s');
await page.waitForSelector('.lp-card', { timeout: 3000 }).catch(() => {});
const d0 = await dialog();
ok(d0.includes('Save as Draft 1') && d0.includes('Not now') && d0.length === 2, '7  Ctrl+S offers Save as Draft 1 / Not now', d0);
await page.click('.lp-card [data-lp="new"]');
await settle(800);
let revs = ((await doc()) || {}).revisions || [];
ok(revs.length === 1 && revs[0].number === 1, '7  Draft 1 is saved inside the script blob', revs.map((r) => r.number));
ok(/Draft 1/.test(await page.$eval('[data-sc="draft"]', (n) => n.textContent)), 'the top bar names Draft 1');

/* ---- 8–10 leaving ------------------------------------------------------ */
/* A link off the page. The one under the sheet used to go to the
   Breakdown; since the naming pass it is screenplay.html#analysis, a view
   of this page, which rightly asks nothing — so the proof leaves by a
   link that does leave. */
async function clickLeave() {
  await page.evaluate(() => {
    if (document.getElementById('proofLeave')) return;
    const a = document.createElement('a'); a.id = 'proofLeave'; a.href = 'breakdown.html'; a.textContent = 'Breakdown';
    document.getElementById('main').append(a);
  });
  await page.click('#proofLeave');
}
async function editAndLeave(text) {
  await page.click('#wr-page .wr-el:nth-child(2) .wr-text').catch(() => page.click('#wr-page .wr-text'));
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await settle();
  await clickLeave();
  await page.waitForSelector('.lp-card', { timeout: 3000 }).catch(() => {});
}
await editAndLeave(' Again.');
const d1 = await dialog();
ok(d1.join('|') === 'Save as Draft 2|Update Draft 1|Not now', '8  leaving with changes asks the three questions', d1);
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="new"]')]);
ok(/breakdown\.html/.test(page.url()), '9  Save as Draft 2, and the navigation continues', page.url());
revs = ((await doc()) || {}).revisions || [];
ok(revs.length === 2 && revs[1].number === 2, '9  Draft 2 exists', revs.map((r) => r.number));

await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await editAndLeave(' Once more.');
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="update"]')]);
revs = ((await doc()) || {}).revisions || [];
const live = ((await doc()) || {}).elements || [];
ok(revs.length === 2 && JSON.stringify(revs[1].elements.map((e) => e.text)) === JSON.stringify(live.map((e) => e.text)),
  '9  Update Draft 2 overwrites it with the working copy, and adds none', revs.length);

await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await clickLeave();
await page.waitForURL(/breakdown\.html/, { timeout: 5000 }).catch(() => {});
ok(/breakdown\.html/.test(page.url()) && !(await page.$('.lp-card')), '10 leaving with no changes asks nothing');

await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await editAndLeave(' Not yet.');
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="skip"]')]);
revs = ((await doc()) || {}).revisions || [];
ok(/breakdown\.html/.test(page.url()) && revs.length === 2, '9  Not now leaves, and makes no draft');
ok(JSON.stringify(((await doc()) || {}).elements || []).includes('Not yet.'), '9  …and the working copy kept the edit');

/* ---- 11 a draft prints the same way twice ------------------------------ */
await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
ok(await page.$$eval('[data-dr="pdf"]', (b) => b.length) === 2, 'the Drafts page lists both drafts');
for (let i = 0; i < 2; i++) {
  await page.click('[data-dr="pdf"] >> nth=1');
  await page.waitForFunction((n) => window.__prints.length > n, i, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}
const prints = await page.evaluate(() => window.__prints);
ok(prints.length === 2 && prints[0] === prints[1] && prints[0].length > 200, '11 the same draft stages the same document twice', prints.map((p) => p.length));

/* ---- 12 redirects ------------------------------------------------------ */
for (const [from, to] of [['write.html', /screenplay\.html$/], ['write.html#revisions', /drafts\.html$/],
  ['write.html#outline', /story\.html#path-outline$/], ['write.html#guide', /screenplay\.html#guide$/]]) {
  await page.goto(url(from));
  await page.waitForURL(to, { timeout: 5000 }).catch(() => {});
  ok(to.test(page.url()), `12 ${from} → ${page.url().replace(/^.*\//, '')}`);
}
await page.goto(url('write.html?stay=1'), { waitUntil: 'networkidle' });
ok(/write\.html\?stay=1/.test(page.url()), '12 write.html?stay=1 stays');

/* ---- 14 notes overview (a derived view: reads, writes nothing) ----------- */
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
const noteId = await page.$eval('#wr-page [data-el]', (n) => n.getAttribute('data-el'));
await page.evaluate((id) => localStorage.setItem('fms_note_script_' + id, 'Overview probe note'), noteId);
const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort().join('|'));
await page.evaluate(() => document.querySelector('[data-action="sc-notes"]').click());
await page.waitForSelector('.sn .sn-note', { timeout: 5000 }).catch(() => {});
ok((await page.$$eval('.sn .sn-note', (n) => n.length)) === 1, '14 the notes overview lists the private note');
await page.selectOption('.sn select[data-sn="state"]', 'resolved');
ok((await page.$$eval('.sn .sn-note', (n) => n.length)) === 0, '14 the Resolved filter hides it');
await page.selectOption('.sn select[data-sn="state"]', 'all');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('[data-sn-export="csv"]')]);
ok(dl && /-notes\.csv$/.test(dl.suggestedFilename()), '14 CSV downloads', dl && dl.suggestedFilename());
await page.keyboard.press('Escape');
ok(!(await page.$('.sn')), '14 Escape closes it');
ok((await page.evaluate(() => Object.keys(localStorage).sort().join('|'))) === keysBefore, '14 opening the overview adds no storage key');
await page.evaluate((id) => localStorage.removeItem('fms_note_script_' + id), noteId);

/* ---- 15 a newer copy arrives while the page is open ----------------------
   cloud.js writes a synced script into storage and announces it with
   cloud:synced. The page used to keep its own older copy and save it over
   the arrival on the next keystroke. Simulated here exactly as cloud.js
   does it: rawSet under the project's key, then notify. */
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const arrive = (text, opts = {}) => page.evaluate(({ text, opts }) => {
  const S = window.StudioStore;
  const pid = S.currentProjectId();
  const k = 'fms_script_v1__' + pid;
  const blob = JSON.parse(S.rawGet(k));
  blob.elements = blob.elements.map((e, i) => (i === 1 ? { ...e, text } : e));
  S.rawSet(k, JSON.stringify(blob));
  S.notify('cloud:synced', opts.live ? { projectId: pid, scope: 'script' } : { projectId: pid, applied: 1, kept: 0, scopes: ['script'] });
}, { text, opts });
const shown = (i) => page.$eval(`#wr-page .wr-el:nth-child(${i}) .wr-text`, (t) => t.value).catch(() => null);
await arrive('Arun stares at the board. Meera walks in.');
await page.waitForTimeout(500);
const second = await page.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value)[1]);
ok(second === 'Arun stares at the board. Meera walks in.', '15 nothing unsaved: the newer copy is shown at once', second);
await page.focus('#wr-page .wr-el:last-child .wr-text');
await page.keyboard.press('End');
await page.keyboard.type(' Later.');
await settle();
const afterType = await types();
ok(afterType.includes('action:Arun stares at the board. Meera walks in.'), '15 and the next keystroke does not save the old copy back over it', afterType);

/* mid-edit: both kept */
await page.focus('#wr-page .wr-el:last-child .wr-text');
await page.keyboard.type(' And again.');
await arrive('Arun leaves the room.', { live: true });
await page.waitForTimeout(800);
let d = await doc();
ok(d.elements.some((e) => /Later\. And again\.$/.test(e.text)) && !d.elements.some((e) => e.text === 'Arun leaves the room.'), '15 mid-edit: the writer\'s lines stay on screen and in storage', d.elements.map((e) => e.text));
const kept = (d.revisions || []).find((r) => /^From another device/.test(r.name));
ok(kept && kept.elements.some((e) => e.text === 'Arun leaves the room.'), '15 and the arrival is kept whole as a draft', (d.revisions || []).map((r) => r.name));
ok(await page.isVisible('.toast:has-text("Use theirs")'), '15 the toast offers Use theirs');
await page.click('.toast:has-text("Another device saved") .toast-action');
await page.waitForTimeout(800);
d = await doc();
ok(d.elements.some((e) => e.text === 'Arun leaves the room.'), '15 Use theirs puts the arrival on screen', d.elements.map((e) => e.text));
ok((d.revisions || []).some((r) => /^Your version/.test(r.name) && r.elements.some((e) => /And again\.$/.test(e.text))), '15 and keeps the writer\'s copy as a draft');
ok((await page.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value))).includes('Arun leaves the room.'), '15 the page shows it');

/* ---- 16 a Word screenplay, through the real file picker ------------------ */
{
  const { zip } = await import('./lib/zip-fixture.mjs');
  const wp = (style, text) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docx = zip([
    ['[Content_Types].xml', '<Types/>', 0],
    ['word/styles.xml', '<w:styles><w:style w:styleId="SH"><w:name w:val="Scene Heading"/></w:style><w:style w:styleId="AC"><w:name w:val="Action"/></w:style><w:style w:styleId="CH"><w:name w:val="Character"/></w:style><w:style w:styleId="DI"><w:name w:val="Dialogue"/></w:style></w:styles>', 8],
    ['word/document.xml', '<w:document><w:body>' + wp('SH', 'INT. TEA STALL - MORNING') + wp('AC', 'Steam rises.') + wp('CH', 'kumar') + wp('DI', 'Two teas.') + '</w:body></w:document>', 8]
  ]);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-action="sc-import"]').click());
  await page.waitForSelector('#scImpFile', { state: 'attached', timeout: 5000 });
  await page.setInputFiles('#scImpFile', { name: 'tea.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx });
  await page.waitForFunction(() => /Word screenplay/.test((document.getElementById('scImport') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok(/Word screenplay/.test(await page.textContent('#scImport')), '16 a .docx previews as a Word screenplay');
  await page.evaluate(() => document.querySelector('[data-action="sc-imp-commit"]').click());
  await page.waitForTimeout(1200);
  const imported = await types();
  ok(['scene:INT. TEA STALL - MORNING', 'action:Steam rises.', 'character:KUMAR', 'dialogue:Two teas.'].every((l) => imported.includes(l)), '16 and imports with each line\'s type from its Word style', imported);
}

/* ---- 17 Export Word (.docx) — a real download, read back --------------- */
{
  const fs = await import('node:fs');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.evaluate(() => document.querySelector('#scTop [data-action="sc-docx"]').click())
  ]);
  ok(/\.docx$/.test(dl.suggestedFilename()), '17 Export Word downloads a .docx', dl.suggestedFilename());
  const buf = fs.readFileSync(await dl.path());
  ok(buf.readUInt32LE(0) === 0x04034b50, '17 it is a ZIP');
  const D = await import('../src/lib/docx-text.js');
  const r = await D.extractDocxParagraphs(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const styles = (r.paras || []).map((p) => p.style);
  ok(styles.includes('Scene Heading') && styles.includes('Character') && styles.includes('Dialogue'), '17 and holds the script in named screenplay styles', styles);
  ok((r.paras || []).some((p) => p.text === 'INT. TEA STALL - MORNING'), '17 with the imported scene in it');
}

/* ---- 18 locked pages: 12A, through the real controls --------------------- */
{
  // A script long enough for several pages.
  await page.evaluate(() => {
    const S = window.StudioStore;
    const k = 'fms_script_v1__' + S.currentProjectId();
    const els = [];
    for (let n = 1; n <= 8; n++) {
      els.push({ id: 'h' + n, type: 'scene', text: 'INT. ROOM ' + n + ' - DAY' });
      for (let j = 0; j < 9; j++) els.push({ id: 'a' + n + '_' + j, type: 'action', text: 'A line of action in scene ' + n + ', long enough to wrap onto a second line of the page, number ' + j + '.' });
    }
    S.rawSet(k, JSON.stringify({ elements: els, revisions: [], documents: [] }));
  });
  await page.goto(url('drafts.html#numbering'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('[data-action="numbers-lock"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="pages-lock"]');
  await page.waitForTimeout(800);
  let d = await doc();
  ok(d.numbering && d.numbering.pages && d.numbering.pages.locked && d.numbering.pages.starts.length >= 3, '18 Lock page numbers records where each page starts', d.numbering && d.numbering.pages);
  ok(/Pages locked/.test(await page.textContent('#numbering')), '18 and the tool says the pages are locked');
  const startP3 = d.numbering.pages.starts[2].id;
  // Grow page 2 by a long passage, the way a writer would: in storage, then reopen.
  await page.evaluate(() => {
    const S = window.StudioStore;
    const k = 'fms_script_v1__' + S.currentProjectId();
    const b = JSON.parse(S.rawGet(k));
    const at = b.elements.findIndex((e) => e.id === b.numbering.pages.starts[1].id) + 1;
    const more = Array.from({ length: 20 }, (_, j) => ({ id: 'x' + j, type: 'action', text: 'An added line that grows page two and should not move page three, number ' + j + '.' }));
    b.elements.splice(at, 0, ...more);
    S.rawSet(k, JSON.stringify(b));
  });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const breaks = await page.$$eval('#wr-page .wr-pbreak', (ns) => ns.map((n) => n.textContent));
  ok(breaks.some((t) => /^Page 2A/.test(t)), '18 the page view shows 2A after page 2 grows', breaks);
  const p3 = await page.$$eval('#wr-page .wr-pbreak', (ns) => { const n = ns.find((x) => x.textContent === 'Page 3'); return n ? (n.nextElementSibling && n.nextElementSibling.dataset.el) : null; });
  ok(p3 === startP3, '18 and page 3 still begins on the same line', { p3, startP3 });
  await page.goto(url('drafts.html#numbering'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ok(/\b[1-9]\d* A-pages?\b/.test(await page.textContent('#numbering')), '18 the tool counts the A-pages', (await page.textContent('#numbering')).match(/[^.]*A-page[^.]*/));
}

/* ---- 19 import → Break down everything → summary → Script analysis ------ */
for (const w of [1280, 390]) {
  await page.setViewportSize({ width: w, height: 860 });
  await page.evaluate(() => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Proof Pipeline ' + Date.now(), format: 'feature' });
    S.setCurrentProject(p.id);
  });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const fountain = [
    'INT. CHAI SHOP - DAY', '', 'RAVI, 30s, wipes a glass. A KNIFE on the counter.', '', 'RAVI', 'One tea. Only one.', '', 'MEENA', 'Then two.', '',
    'EXT. BUS STAND - NIGHT', '', 'Rain. Meena runs. A bus pulls away.', '', 'MEENA', 'Wait!', '',
    'INT. CHAI SHOP - NIGHT', '', 'RAVI', 'You came back.', '', 'MEENA', 'For the tea.', '',
    'EXT. ROOFTOP - DAY', '', 'They fight. Blood on the parapet. A scream.', '', 'RAVI', 'Run!'
  ].join('\n');
  await page.evaluate(() => document.querySelector('[data-action="sc-import"]').click());
  await page.waitForSelector('#scImpPaste');
  await page.evaluate((t) => { document.getElementById('scImpPaste').value = t; }, fountain);
  await page.evaluate(() => document.querySelector('[data-action="sc-imp-paste"]').click());
  await page.waitForSelector('[data-action="sc-imp-commit"]');
  await page.evaluate(() => document.querySelector('[data-action="sc-imp-commit"]').click());
  const offered = await page.waitForSelector('#pl-offer [data-action="pipeline-run"]', { timeout: 8000 }).then(() => true, () => false);
  ok(offered, `19 an import offers "Break down everything" (${w}px)`);
  if (!offered) continue;
  await page.click('#pl-offer [data-action="pipeline-run"]');
  const done = await page.waitForSelector('[data-pipeline="done"]', { timeout: 15000 }).then(() => true, () => false);
  ok(done, `19 the checklist runs to the end (${w}px)`);
  const rows = await page.$$eval('.pl-row', (rs) => rs.map((r) => r.dataset.step + ':' + r.dataset.status));
  ok(rows.length === 8 && rows.every((r) => !/:(waiting|running|error)$/.test(r)), `19 every step reports (${w}px)`, rows);
  const sum = await page.textContent('.pl-sumline');
  ok(/4 scenes/.test(sum) && /shots?/.test(sum) && /shooting days?/.test(sum), `19 the summary counts what was made (${w}px)`, sum);
  const store = await page.evaluate(() => {
    const S = window.StudioStore; const id = S.currentProjectId();
    const g = (k) => JSON.parse(S.rawGet(k + '__' + id) || 'null');
    const scenes = (g('fms_scenes_v1') || {}).scenes || [];
    const shots = (g('fms_shots_v1') || {}).shots || [];
    return { scenes: scenes.length, days: scenes.filter((x) => x.shootDay > 0).length, shots: shots.length, props: scenes.some((x) => (x.elements && x.elements.props || []).length) };
  });
  ok(store.scenes === 4 && store.days === 4 && store.shots >= 4 && !store.props, `19 scenes, days and shots are stored; props stay suggestions (${w}px)`, store);
  const over1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over1 <= 0, `19 the checklist fits at ${w}px`, over1);
  await page.click('.mn-sheet [data-mn="close"]');
  await page.waitForTimeout(300);
  /* The run's Undo outlives the sheet: closing it leaves a toast that
     stays, with the Undo on it. */
  const keptUndo = page.locator('.toast', { has: page.locator('.toast-action', { hasText: 'Undo the run' }) }).last();
  ok(await keptUndo.isVisible().catch(() => false), `19 closing the checklist keeps the run's Undo in a toast (${w}px)`);
  await keptUndo.locator('.toast-close').click().catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#scTop [role="tab"][data-tab="analysis"]');
  const drawn = await page.waitForSelector('#analysis .sa .pc-curve-svg', { timeout: 8000 }).then(() => true, () => false);
  ok(drawn, `19 the Script analysis tab draws the tension curve (${w}px)`);
  ok(/#analysis$/.test(page.url()) && await page.isHidden('#screenplay'), `19 the tab moves the hash and the editor steps aside (${w}px)`, page.url());
  const panels = await page.$$eval('#analysis .k-panel', (ps) => ps.length);
  ok(panels >= 5, `19 tension, pacing, structure, cast and coverage panels (${w}px)`, panels);
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over2 <= 0, `19 the analysis has no horizontal overflow at ${w}px`, over2);
  await page.click('#scTop [role="tab"][data-tab="screenplay"]');
  ok(await page.isVisible('#wr-page') && !/#analysis$/.test(page.url()), `19 Write brings the editor back (${w}px)`);
}
await page.setViewportSize({ width: 1280, height: 900 });

/* ---- 20 QA round (26 Oct 2026): paste, other windows, drafts, toolbars ----
   Each of these was a confirmed finding; each assertion failed before
   its fix. */
{
  const fresh = async (title, els) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url('index.html'), { waitUntil: 'networkidle' });
    await page.evaluate(({ title, els }) => {
      const S = window.StudioStore;
      const p = S.createProject({ title: title + ' ' + Date.now(), format: 'feature' });
      S.setCurrentProject(p.id);
      if (els) S.rawSet('fms_script_v1__' + p.id, JSON.stringify({ elements: els, revisions: [], documents: [] }));
    }, { title, els });
  };
  const stored = () => page.evaluate(() => {
    const S = window.StudioStore; const id = S.currentProjectId();
    return { script: JSON.parse(S.rawGet('fms_script_v1__' + id) || 'null'), scenes: ((JSON.parse(S.rawGet('fms_scenes_v1__' + id) || 'null') || {}).scenes || []) };
  });
  const FOUR = [
    { id: 'e1', type: 'scene', text: 'INT. FLAT - NIGHT' }, { id: 'e2', type: 'action', text: 'Ravi paces.' },
    { id: 'e3', type: 'character', text: 'RAVI' }, { id: 'e4', type: 'dialogue', text: 'Not tonight.' }
  ];

  /* a) a multi-line paste into a heading is split into its elements */
  await fresh('Proof Paste');
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#wr-page .wr-text');
  const cancelled = await page.evaluate(() => {
    const ta = document.querySelector('#wr-page .wr-text');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'INT. KITCHEN - DAY\n\nMara pours tea.\n\nMARA\nNot now.');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  await page.waitForTimeout(2600);
  let s = await stored();
  ok(cancelled, '20a a multi-line paste into a line is taken over from the browser');
  ok(JSON.stringify(s.script.elements.map((e) => e.type + ':' + e.text)) === JSON.stringify(['scene:INT. KITCHEN - DAY', 'action:Mara pours tea.', 'character:MARA', 'dialogue:Not now.']),
    '20a and split into heading, action, cue and dialogue', s.script.elements.map((e) => e.type + ':' + e.text));
  ok(s.scenes.length === 1 && s.scenes[0].location === 'KITCHEN', '20a the Breakdown gets KITCHEN, not the whole scene', s.scenes.map((x) => x.location));

  /* b) the chip bar follows the preset's digits: chip 4 is what Alt+4 sets */
  const chips = await page.$$eval('#scChips .sc-chip', (cs) => cs.map((c) => c.dataset.type));
  ok(chips[3] === 'paren' && chips[4] === 'dialogue' && chips.includes('shot'), '20b chips in Alt+digit order, Shot included', chips);

  /* c) the line toolbar sits clear of the line above */
  await fresh('Proof Bar', [{ id: 'h1', type: 'scene', text: 'INT. KITCHEN - DAY' }, { id: 'a1', type: 'action', text: 'Tea.' },
    { id: 'h2', type: 'scene', text: 'EXT. ROOF OF THE TALL BUILDING ACROSS THE RIVER - NIGHT' }, { id: 'a2', type: 'action', text: 'Wind.' }]);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('[data-el="a2"] .wr-text');
  await page.waitForTimeout(200);
  const covered = await page.evaluate(() => {
    const bar = document.querySelector('[data-el="a2"] > .sc-linebar').getBoundingClientRect();
    return [...document.querySelectorAll('#wr-page .wr-text')].filter((t) => {
      const b = t.getBoundingClientRect();
      return !(b.right < bar.left || b.left > bar.right || b.bottom < bar.top || b.top > bar.bottom);
    }).length;
  });
  ok(covered === 0, '20c the focused line\'s toolbar covers no line of text', covered);

  /* d) a stale "Use theirs" goes when a newer copy loads */
  await fresh('Proof Stale', FOUR);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const deliver = (i, text) => page.evaluate(({ i, text }) => {
    const S = window.StudioStore; const pid = S.currentProjectId(); const k = 'fms_script_v1__' + pid;
    const b = JSON.parse(S.rawGet(k)); b.elements[i] = { ...b.elements[i], text };
    S.rawSet(k, JSON.stringify(b)); S.notify('cloud:synced', { projectId: pid, scope: 'script' });
  }, { i, text });
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' MINE.');
  await deliver(3, 'THEIRS-1');
  await page.waitForTimeout(400);
  ok(await page.isVisible('.toast:has-text("Use theirs")'), '20d mid-edit arrival offers Use theirs');
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const S = window.StudioStore; const k = 'fms_script_v1__' + S.currentProjectId(); const b = JSON.parse(S.rawGet(k)); b.elements[1].text = 'Ravi paces. MINE.'; S.rawSet(k, JSON.stringify(b)); });
  await deliver(3, 'THEIRS-2 NEWEST');
  await page.waitForTimeout(600);
  const onScreen = await page.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value));
  ok(onScreen[3] === 'THEIRS-2 NEWEST', '20d an idle arrival loads', onScreen);
  ok(!(await page.isVisible('.toast:has-text("Use theirs")')), '20d and the older offer is withdrawn, so it cannot bring the old copy back');

  /* e) the arrival is a side copy: not the current draft */
  s = await stored();
  ok(s.script.revisions.some((r) => /^From another device/.test(r.name)), '20e the arrival is kept as a draft');
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const stateLine = await page.textContent('[data-dr-state]');
  ok(!/From another device/.test(stateLine), '20e the drafts state line is not measured against the arrival', stateLine);
  ok(!(await page.$('.dr-row.is-current')), '20e the arrival is not badged Current', await page.$$eval('.dr-row.is-current strong', (n) => n.map((x) => x.textContent)));

  /* f) two Writer tabs: the second picks up the first's save */
  await fresh('Proof Tabs', FOUR);
  const tabB = await ctx.newPage();
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await tabB.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.bringToFront();
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' TAB-A EDIT.');
  await page.waitForTimeout(2500);
  await tabB.bringToFront();
  await tabB.waitForTimeout(400);
  const bLine = await tabB.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value)[1]);
  ok(bLine === 'Ravi paces. TAB-A EDIT.', '20f the other tab shows the first tab\'s save', bLine);
  await tabB.click('[data-el="e4"] .wr-text');
  await tabB.keyboard.press('End');
  await tabB.keyboard.type(' TAB-B.');
  await tabB.waitForTimeout(2500);
  s = await stored();
  ok(s.script.elements[1].text === 'Ravi paces. TAB-A EDIT.' && s.script.elements[3].text === 'Not tonight. TAB-B.', '20f and its own save keeps both edits', s.script.elements.map((e) => e.text));

  /* g) drafts.html open beside the Writer saves no stale copy */
  await tabB.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await page.bringToFront();
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' TYPED IN WRITER.');
  await page.waitForTimeout(2500);
  await tabB.bringToFront();
  await tabB.click('[data-dr="new"]');
  await tabB.waitForSelector('.lp-card [data-lp="go"]');
  await tabB.click('.lp-card [data-lp="go"]');
  await tabB.waitForTimeout(600);
  s = await stored();
  ok(/TYPED IN WRITER\.$/.test(s.script.elements[1].text), '20g Save as new draft keeps the Writer\'s newer line', s.script.elements[1].text);
  const d1 = s.script.revisions.find((r) => r.name === 'Draft 1');
  ok(d1 && /TYPED IN WRITER\.$/.test(d1.elements[1].text), '20g and the draft is taken from it', d1 && d1.elements[1].text);
  await tabB.fill('[data-tp-field="title"]', 'A Title');
  await tabB.waitForTimeout(300);
  await page.bringToFront();
  await page.click('[data-el="e4"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' LATER.');
  await page.waitForTimeout(2500);
  await tabB.bringToFront();
  await tabB.fill('[data-tp-field="title"]', 'A Title 2');
  await tabB.waitForTimeout(900);
  s = await stored();
  ok(/LATER\.$/.test(s.script.elements[3].text) && s.script.titlePage && s.script.titlePage.title === 'A Title 2', '20g typing a title page does not undo a newer edit', [s.script.elements[3].text, s.script.titlePage]);

  /* h) Revised pages is offered on drafts.html */
  ok(!!(await tabB.$('[data-action="export-pdf-revised"]')), '20h drafts.html offers Save revised PDF');
  await tabB.close();

  /* i) restoring a draft takes the Breakdown with it */
  await fresh('Proof Restore', [{ id: 'k', type: 'scene', text: 'INT. KITCHEN - DAY' }, { id: 'k2', type: 'action', text: 'Tea.' },
    { id: 'r', type: 'scene', text: 'EXT. ROOF - NIGHT' }, { id: 'r2', type: 'action', text: 'Wind.' }]);
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await page.click('[data-dr="new"]');
  await page.click('.lp-card [data-lp="go"]');
  await page.waitForTimeout(400);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('[data-el="r2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+1');
  await page.keyboard.type('INT. CAVE - NIGHT');
  await page.waitForTimeout(3000);
  s = await stored();
  const before = s.scenes.map((x) => x.location);
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.click('.dr-row [data-dr="restore"]');
  await page.waitForSelector('.lp-card [data-lp="go"]');
  await page.click('.lp-card [data-lp="go"]');
  await page.waitForTimeout(800);
  s = await stored();
  ok(before.includes('CAVE') && !s.scenes.some((x) => x.location === 'CAVE') && s.scenes.length === 2,
    '20i a scene the restored draft lacks leaves the Breakdown', { before, after: s.scenes.map((x) => x.location) });

  /* j) the phone toolbar: one row, the type named in full, Notes shows its icon */
  await fresh('Proof Phone', FOUR);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const tb = await page.evaluate(() => {
    const b = (s) => { const n = document.querySelector(s); return n ? n.getBoundingClientRect() : null; };
    const name = document.querySelector('.sc-typename');
    return {
      sameRow: Math.round(b('.sc-tools-l').top) === Math.round(b('.sc-tools-r').top),
      nameFits: name.scrollWidth <= name.clientWidth + 1,
      ai: Math.round(b('.sc-tools .ai-pill').height), tools: Math.round(b('.sc-tools-r .sc-tools-sheet-btn').height),
      icon: Math.round(b('.sc-tools .nt-open .k-sym').width), notesW: Math.round(b('.sc-tools .nt-open').width)
    };
  });
  ok(tb.sameRow, '20j the phone toolbar is one row (the ⋯ button no longer wraps alone)', tb);
  ok(tb.nameFits && tb.ai === tb.tools, '20j the type pill names the type in full; the AI pill is the row\'s height', tb);
  ok(tb.icon > 8 && tb.notesW >= 44, '20j Notes shows its icon in a thumb-sized button', tb);
  await page.setViewportSize({ width: 1280, height: 900 });
}

/* ---- 21 QA round 2 (26 Oct 2026): headings, windows, keys, find, import --
   Each assertion failed before its fix. */
{
  const fresh = async (title, els, extra = {}) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url('index.html'), { waitUntil: 'networkidle' });
    await page.evaluate(({ title, els, extra }) => {
      const S = window.StudioStore;
      const p = S.createProject({ title: title + ' ' + Date.now(), format: 'feature', ...extra });
      S.setCurrentProject(p.id);
      if (els) S.rawSet('fms_script_v1__' + p.id, JSON.stringify({ elements: els, revisions: [], documents: [] }));
    }, { title, els, extra });
  };
  const stored = () => page.evaluate(() => {
    const S = window.StudioStore; const id = S.currentProjectId();
    return { script: JSON.parse(S.rawGet('fms_script_v1__' + id) || 'null'), scenes: ((JSON.parse(S.rawGet('fms_scenes_v1__' + id) || 'null') || {}).scenes || []) };
  });
  const FOUR = [
    { id: 'e1', type: 'scene', text: 'INT. FLAT - NIGHT' }, { id: 'e2', type: 'action', text: 'Ravi paces.' },
    { id: 'e3', type: 'character', text: 'RAVI' }, { id: 'e4', type: 'dialogue', text: 'Not tonight.' }
  ];
  const toasts = (pg, re) => pg.$$eval('.toast', (ts, src) => ts.filter((t) => new RegExp(src).test(t.textContent)).length, re);

  /* a) a qualifier after the time: NIGHT (1995) is a NIGHT scene in HOUSE */
  await fresh('Proof Night');
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#wr-page .wr-text');
  await page.keyboard.type('INT. HOUSE - NIGHT (1995)');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The lights are out.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+1');
  await page.keyboard.type('EXT. ROAD - NIGHT - FLASHBACK');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rain.');
  await page.waitForTimeout(3000);
  let s = await stored();
  ok(JSON.stringify(s.scenes.map((x) => [x.intExt, x.location, x.dayNight])) === JSON.stringify([['INT', 'HOUSE', 'NIGHT'], ['EXT', 'ROAD', 'NIGHT']]),
    '21a a qualifier after the time is not the time and leaves the location', s.scenes.map((x) => [x.intExt, x.location, x.dayNight]));

  /* b) two windows editing one after the other: no conflict, no side copies */
  await fresh('Proof Seq', FOUR);
  const tabB = await ctx.newPage();
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await tabB.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.bringToFront();
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' A-edit');
  await page.waitForTimeout(1500);
  await tabB.bringToFront();
  await tabB.click('[data-el="e4"] .wr-text');
  await tabB.keyboard.press('End');
  await tabB.keyboard.type(' B-edit');
  await tabB.waitForTimeout(3000);
  s = await stored();
  const conflictA = await toasts(page, 'another window'), conflictB = await toasts(tabB, 'another window');
  ok(conflictA === 0 && conflictB === 0, '21b one window after the other: no "saved in another window" toast in either', { conflictA, conflictB });
  ok(!(s.script.revisions || []).some((r) => /^From another/.test(r.name)), '21b and no side copies in Drafts', (s.script.revisions || []).map((r) => r.name));
  ok(s.script.elements[1].text === 'Ravi paces. A-edit' && s.script.elements[3].text === 'Not tonight. B-edit', '21b both edits are stored', s.script.elements.map((e) => e.text));
  const aShows = await page.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value));
  ok(aShows[3] === 'Not tonight. B-edit' && aShows[1] === 'Ravi paces. A-edit', '21b the first window simply loads the newer copy', aShows);

  /* c) both at once: a window whose lines leave its screen is told where they went */
  await fresh('Proof Race', FOUR);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await tabB.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await tabB.click('[data-el="e4"] .wr-text');
  await tabB.keyboard.press('End');
  await Promise.all([page.keyboard.type(' AAA'), tabB.keyboard.type(' BBB')]);
  await page.waitForTimeout(5000);
  const aNow = (await page.$$eval('#wr-page .wr-text', (ts) => ts.map((t) => t.value))).join('|');
  const told = await toasts(page, 'kept its own version');
  ok(/AAA/.test(aNow) || told === 1, '21c the first writer\'s lines stay on screen, or a toast says where they went', { aNow, told });
  const yoursKept = (await toasts(page, 'Yours is kept')) + (await toasts(tabB, 'Yours is kept'));
  ok(yoursKept <= 1, '21c the two windows do not trade "Yours is kept" toasts', yoursKept);
  s = await stored();
  const sides = (s.script.revisions || []).filter((r) => /^(From another|Kept when two windows saved)/.test(r.name));
  ok(sides.every((r) => /^Kept when two windows saved/.test(r.name)), '21c a copy from another window is named for windows, not a device, and not as if it were the other window\'s', sides.map((r) => r.name));
  const anyAAA = s.script.elements.some((e) => /AAA/.test(e.text)) || sides.some((r) => r.elements.some((e) => /AAA/.test(e.text)));
  ok(anyAAA, '21c and nothing typed is lost', s.script);

  /* d) Analysis: viewing writes nothing; an arrival refreshes it */
  await tabB.close();
  await fresh('Proof Analysis', FOUR);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const writesTo = () => page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
  const w0 = await writesTo();
  await page.click('#scTop [role="tab"][data-tab="analysis"]');
  await page.waitForSelector('#analysis .k-stat-value', { timeout: 8000 });
  await page.waitForTimeout(400);
  ok(await writesTo() === w0, '21d opening Script analysis saves nothing', [w0, await writesTo()]);
  const scenesStat = () => page.$eval('#analysis .k-stat-value', (n) => n.textContent);
  const before = await scenesStat();
  await page.evaluate(() => {
    const S = window.StudioStore; const pid = S.currentProjectId(); const k = 'fms_script_v1__' + pid;
    const b = JSON.parse(S.rawGet(k));
    b.elements.push({ id: 'e5', type: 'scene', text: 'EXT. ROOF - DAY' }, { id: 'e6', type: 'action', text: 'Wind.' });
    S.rawSet(k, JSON.stringify(b)); S.notify('cloud:synced', { projectId: pid, scope: 'script' });
  });
  await page.waitForTimeout(800);
  ok(before === '1' && await scenesStat() === '2', '21d an arriving copy refreshes the open analysis', [before, await scenesStat()]);
  await page.click('#scTop [role="tab"][data-tab="screenplay"]').catch(() => {});

  /* e) the keyboard moves between lines, and joins them */
  await fresh('Proof Keys', FOUR);
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const at = () => page.evaluate(() => { const a = document.activeElement; return [a.closest('[data-el]')?.dataset.el, a.selectionStart]; });
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  ok(JSON.stringify(await at()) === JSON.stringify(['e3', 0]), '21e ArrowDown on the last line goes to the next element', await at());
  await page.keyboard.press('ArrowUp');
  ok((await at())[0] === 'e2', '21e ArrowUp on the first line goes to the one before', await at());
  await page.click('[data-el="e4"] .wr-text');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  let t = (await stored()).script.elements.map((e) => e.text);
  ok(JSON.stringify(t) === JSON.stringify(['INT. FLAT - NIGHT', 'Ravi paces.', 'RAVI Not tonight.']) && JSON.stringify(await at()) === JSON.stringify(['e3', 4]),
    '21e Backspace at the start joins the line to the one above with a word gap, caret at the seam', [t, await at()]);
  await page.click('.toast:has-text("Lines joined") .toast-action');
  await page.waitForTimeout(300);
  t = (await stored()).script.elements.map((e) => e.text);
  ok(JSON.stringify(t) === JSON.stringify(['INT. FLAT - NIGHT', 'Ravi paces.', 'RAVI', 'Not tonight.']), '21e Undo puts the joined line back', t);
  await page.click('[data-el="e1"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  t = (await stored()).script.elements.map((e) => e.text);
  ok(t[0] === 'INT. FLAT - NIGHT Ravi paces.' && t.length === 3, '21e Delete at the end pulls the next line up, one word gap between (QA r3)', t);

  /* f) the import dialog keeps focus */
  await fresh('Proof Import');
  await page.goto(url('screenplay.html#import'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const inDlg = () => page.evaluate(() => !!document.activeElement.closest('#scImport'));
  ok(await inDlg(), '21f the dialog opens with focus inside it (empty project)', await page.evaluate(() => document.activeElement.tagName));
  let stayed = true;
  for (let k = 0; k < 7; k++) { await page.keyboard.press('Tab'); if (!(await inDlg())) stayed = false; }
  ok(stayed, '21f Tab cycles inside the dialog');
  await page.keyboard.press('Escape');
  await fresh('Proof Import2', FOUR);
  await page.goto(url('screenplay.html#import'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('#scImpPaste', 'INT. CAVE - NIGHT\n\nDark.');
  await page.click('[data-action="sc-imp-paste"]');
  await page.waitForSelector('[data-action="sc-imp-mode"]');
  await page.focus('[data-action="sc-imp-mode"][aria-checked="true"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const radio = await page.evaluate(() => [document.querySelector('[data-mode="replace"]').getAttribute('aria-checked'), document.activeElement.dataset.mode]);
  ok(JSON.stringify(radio) === JSON.stringify(['true', 'replace']), '21f ArrowRight moves and chooses in the placement radio pair', radio);
  await page.keyboard.press('Escape');

  /* g) on a phone, the find bar stays on screen while you type */
  await fresh('Proof Find', Array.from({ length: 60 }, (_, i) => ({ id: 'f' + i, type: i % 2 ? 'action' : 'scene', text: i % 2 ? (i === 51 ? 'Ragavan waits.' : 'Rain on the glass.') : 'INT. ROOM ' + i + ' - DAY' })));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.focus('[data-el="f1"] .wr-text');
  await page.keyboard.press('Control+Shift+H');
  await page.waitForSelector('#scFindQ');
  await page.keyboard.type('Ragavan');
  await page.waitForTimeout(400);
  const fb = await page.evaluate(() => { const b = document.getElementById('scFind').getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), y: Math.round(scrollY) }; });
  ok(fb.y > 0 && fb.top >= 0 && fb.bottom <= 844, '21g the find bar stays in view after the jump to the match (390px)', fb);
  await page.keyboard.press('Escape');

  /* h) the phone Tools sheet leaves Tamil typing out for a film made elsewhere */
  await fresh('Proof Intl', FOUR, { region: 'INT' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('.sc-tools-r .sc-tools-sheet-btn');
  await page.waitForTimeout(400);
  const tamilRow = await page.$$eval('[data-sc-act="sc-tamil"]', (bs) => bs.filter((b) => b.getClientRects().length).length);
  ok(tamilRow === 0, '21h the phone Tools sheet does not offer Tamil typing outside India', tamilRow);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 900 });

  /* i) drafts.html keeps the control in use when the Writer saves elsewhere */
  await fresh('Proof DraftsFocus', FOUR);
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await page.click('[data-dr="new"]'); await page.click('.lp-card [data-lp="go"]'); await page.waitForTimeout(300);
  await page.click('[data-dr="new"]'); await page.click('.lp-card [data-lp="go"]'); await page.waitForTimeout(300);
  const tabW = await ctx.newPage();
  await tabW.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.bringToFront();
  const sel = await page.$('main select');
  if (sel) {
    await sel.focus();
    const key = await page.evaluate(() => { const a = document.activeElement; return a.id || a.outerHTML.slice(0, 80); });
    await tabW.bringToFront();
    await tabW.click('[data-el="e2"] .wr-text');
    await tabW.keyboard.press('End');
    await tabW.keyboard.type(' more');
    await tabW.waitForTimeout(2000);
    await page.bringToFront();
    const now = await page.evaluate(() => { const a = document.activeElement; return a.tagName === 'SELECT' ? (a.id || a.outerHTML.slice(0, 80)) : a.tagName; });
    ok(now === key, '21i drafts.html keeps focus on the select in use after a save in the Writer', { key, now });
  } else ok(false, '21i drafts.html has a Compare select with two drafts');
  await tabW.close();

  /* j) a refused save never reads "Autosaved" */
  const qctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await qctx.addInitScript(() => { window.__origSet = Storage.prototype.setItem; if (location.pathname.includes('screenplay')) IDBFactory.prototype.open = function () { throw new Error('blocked'); }; });
  const q = await qctx.newPage();
  await q.goto(url('index.html'), { waitUntil: 'networkidle' });
  await q.evaluate((els) => {
    const S = window.StudioStore; localStorage.clear();
    const p = S.createProject({ title: 'Quota', format: 'feature' }); S.setCurrentProject(p.id);
    S.rawSet('fms_script_v1__' + p.id, JSON.stringify({ elements: els }));
  }, FOUR.slice(0, 2));
  await q.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await q.waitForTimeout(600);
  await q.evaluate(() => { let n = 0, size = 512 * 1024; while (size >= 64) { try { window.__origSet.call(localStorage, 'junk' + (n++), 'x'.repeat(size)); } catch (e) { size = Math.floor(size / 2); } } });
  await q.click('[data-el="e2"] .wr-text');
  await q.keyboard.press('End');
  await q.keyboard.type(' He stops at the window and counts the cars below. '.repeat(3));
  await q.waitForTimeout(2500);
  const status = await q.$eval('.sc-status', (n) => n.textContent);
  ok(!/Autosaved/.test(status) && /Not saved/.test(status), '21j a save refused for want of storage reads "Not saved", never "Autosaved"', status);
  await qctx.close();
}

/* ---- 22 QA round 3 (27 Oct 2026): touch targets, sheet rows, one button language --
   Each assertion failed before its fix. */
{
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const t = await tctx.newPage();
  await t.goto(url('index.html'), { waitUntil: 'networkidle' });
  await t.evaluate(() => {
    const S = window.StudioStore; localStorage.clear();
    const p = S.createProject({ title: 'Touch', format: 'feature' }); S.setCurrentProject(p.id);
    S.rawSet('fms_script_v1__' + p.id, JSON.stringify({ elements: [
      { id: 't1', type: 'scene', text: 'INT. FLAT - NIGHT' }, { id: 't2', type: 'action', text: 'Ravi paces.' },
      { id: 't3', type: 'scene', text: 'EXT. ROAD - DAY' }, { id: 't4', type: 'action', text: 'Rain.' }] }));
  });
  await t.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await t.waitForSelector('.wx-handoff-acts .btn', { timeout: 5000 }).catch(() => {});
  const hand = await t.$$eval('.wx-handoff-acts .btn', (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
  ok(hand.length > 0 && hand.every((x) => x >= 44), '22a the Breakdown hand-off buttons meet the 44px touch floor', hand);
  const done = await t.$$eval('.sc-done a', (as) => as.map((a) => Math.round(a.getBoundingClientRect().height)));
  ok(done.every((x) => x >= 44), '22a the link under the page meets the 44px touch floor', done);
  await t.click('.sc-tools-r .sc-tools-sheet-btn');
  await t.waitForTimeout(400);
  const under = await t.$$eval('a.sc-sheet-row', (as) => as.filter((a) => a.getClientRects().length).map((a) => getComputedStyle(a).textDecorationLine));
  ok(under.length > 0 && under.every((d) => d === 'none'), '22b the Tools sheet\'s link rows are not underlined', under);
  await t.keyboard.press('Escape');
  await t.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  await t.click('[data-dr="new"]'); await t.click('.lp-card [data-lp="go"]'); await t.waitForTimeout(400);
  const legacy = await t.$$eval('.wr-tool-row button', (bs) => ({ all: bs.length, legacy: bs.filter((b) => !b.classList.contains('k-btn')).map((b) => b.textContent) }));
  ok(legacy.all > 0 && legacy.legacy.length === 0, '22c drafts.html\'s Compare / revised PDF / lock buttons are kit buttons', legacy);
  await tctx.close();
}

/* ---- 23 QA round 4 (27 Oct 2026): big arrivals, focus, menus, guide ---
   Each assertion failed before its fix. */
{
  const fresh = async (title, els) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url('index.html'), { waitUntil: 'networkidle' });
    await page.evaluate(({ title, els }) => {
      const S = window.StudioStore;
      const p = S.createProject({ title: title + ' ' + Date.now(), format: 'feature' });
      S.setCurrentProject(p.id);
      if (els) S.rawSet('fms_script_v1__' + p.id, JSON.stringify({ elements: els, revisions: [], documents: [] }));
    }, { title, els });
    await page.evaluate(() => window.StudioStore.flushStorage && window.StudioStore.flushStorage());
  };
  /* another window of the same browser writes the script, through the store */
  const writeElsewhere = (pg, fn) => pg.evaluate(async (src) => {
    const S = window.StudioStore; const k = 'fms_script_v1__' + S.currentProjectId();
    const d = JSON.parse(S.rawGet(k));
    (0, eval)('(' + src + ')')(d);
    S.rawSet(k, JSON.stringify(d));
    if (S.flushStorage) await S.flushStorage();
  }, fn.toString());
  const readFresh = async () => {
    const c = await ctx.newPage();
    await c.goto(url('index.html'), { waitUntil: 'networkidle' });
    const d = await c.evaluate(() => { const S = window.StudioStore; return JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId())); });
    await c.close();
    return d;
  };
  const FOUR = [
    { id: 'e1', type: 'scene', text: 'INT. FLAT - NIGHT' }, { id: 'e2', type: 'action', text: 'Ravi paces.' },
    { id: 'e3', type: 'action', text: 'Ravi waits.' }, { id: 'e4', type: 'character', text: 'RAVI' },
    { id: 'e5', type: 'dialogue', text: 'Not tonight.' }
  ];
  const BIG = FOUR.concat(Array.from({ length: 700 }, (_, i) => ({ id: 'b' + i, type: i % 5 ? 'action' : 'scene',
    text: i % 5 ? 'The ceiling fans turn on their long stems while the rain keeps on at the window, line ' + i + '.' : 'INT. ROOM ' + i + ' - DAY' })));

  /* a) a script over 64 KB saved in another window reaches the open Writer — even
        a same-length edit, even after this Writer has saved the script itself */
  await fresh('Proof Big', BIG);
  const tabB = await ctx.newPage();
  await tabB.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' A1.');
  await page.waitForTimeout(2500);                                   // this Writer has now saved (its own write)
  ok((await readFresh()).elements[1].text === 'Ravi paces. A1.', '23a the big script saves from the Writer');
  await writeElsewhere(tabB, (d) => { d.elements[2].text = 'Ravi WAITS.'; });   // same length: same size stub
  await page.waitForTimeout(3000);
  const shown = await page.$eval('[data-el="e3"] .wr-text', (t) => t.value);
  ok(shown === 'Ravi WAITS.', '23a the other window\'s same-length edit to a >64 KB script reaches the open Writer', shown);
  const told = await page.$$eval('.toast', (ts) => ts.filter((t) => /your other window/.test(t.textContent)).length);
  ok(told > 0, '23a and the Writer says it loaded the other window\'s copy');
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' A2.');
  await page.waitForTimeout(2500);
  const after = await readFresh();
  ok(after.elements[2].text === 'Ravi WAITS.' && after.elements[1].text === 'Ravi paces. A1. A2.',
    '23a the next keystroke keeps the other window\'s edit', [after.elements[1].text, after.elements[2].text]);
  await tabB.goto(url('index.html'), { waitUntil: 'networkidle' });

  /* b) the line the caret was in is deleted in the other window: the caret moves to a neighbour */
  await fresh('Proof Gone', FOUR);
  await tabB.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('[data-el="e3"] .wr-text');
  await writeElsewhere(tabB, (d) => { d.elements.splice(2, 1); });
  await page.waitForTimeout(1200);
  const act = await page.evaluate(() => { const a = document.activeElement; const r = a && a.closest && a.closest('[data-el]'); return { tag: a && a.tagName, el: r && r.dataset.el }; });
  ok(act.tag === 'TEXTAREA' && act.el === 'e2', '23b a line deleted elsewhere moves the caret to the line above, not to <body>', act);

  /* c) the find panel's count follows an arrival */
  await page.keyboard.press('Control+Shift+H');
  await page.waitForSelector('#scFindQ');
  await page.fill('#scFindQ', 'Ravi');
  await page.waitForTimeout(300);
  const c1 = await page.textContent('.sc-find-count');
  await writeElsewhere(tabB, (d) => { d.elements.push({ id: 'z1', type: 'action', text: 'Ravi again.' }); });
  await page.waitForTimeout(1200);
  const c2 = await page.textContent('.sc-find-count');
  ok(/of 2$/.test(c1) && /of 3$/.test(c2), '23c the find count is recomputed after an arrival', [c1, c2]);
  await page.keyboard.press('Escape');

  /* d) "Use theirs" puts the caret back in the script */
  await fresh('Proof Theirs', FOUR);
  await tabB.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('[data-el="e2"] .wr-text');
  await page.keyboard.press('End');
  await page.keyboard.type(' MINE');
  await writeElsewhere(tabB, (d) => { d.elements[2].text = 'Ravi waits. THEIRS'; });
  const theirs = page.locator('.toast button', { hasText: 'Use theirs' });
  await theirs.waitFor({ timeout: 4000 }).catch(() => {});
  if (await theirs.count()) {
    await theirs.first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }
  const act2 = await page.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, inPage: !!(a && a.closest && a.closest('#wr-page')) }; });
  ok(act2.tag === 'TEXTAREA' && act2.inPage, '23d after "Use theirs" focus is back in the script, not on <body>', act2);
  await tabB.close();

  /* What the page actually drew, for a CI log (runs 361-366 lost the open project there, never locally). */
  const seenState = () => page.evaluate(() => {
    const S = window.StudioStore || {};
    let pointer = null; try { pointer = Object.keys(localStorage).filter((k) => /current_project/.test(k)).map((k) => k + '=' + localStorage.getItem(k)); } catch (e) { /* */ }
    return { url: location.href, current: S.currentProjectId && S.currentProjectId(), pointer,
      projects: S.listProjects && S.listProjects().map((p) => p.id + ':' + p.title),
      main: (document.querySelector('main') || document.body).innerText.slice(0, 400) };
  });
  /* e) drafts.html: the action buttons keep keyboard focus across the redraw */
  await fresh('Proof Draft Focus', FOUR);
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
  /* The page draws after networkidle on a slow runner (CI run 361): wait
     for the button, never assume it is there. */
  /* CI runs 361/362: the button never appeared, so the page drew its
     no-project branch. Say what the page saw instead of timing out blind. */
  if (!(await page.waitForSelector('[data-dr="new"]', { timeout: 15000 }).catch(() => null))) {
    console.log('23e drafts.html drew no "Save as new draft" button:', JSON.stringify(await seenState()));
    throw new Error('23e: drafts.html has no [data-dr="new"]');
  }
  await page.focus('[data-dr="new"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.lp-card [data-lp="go"]');
  await page.click('.lp-card [data-lp="go"]');
  await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-dr'));
  ok(f1 === 'new', '23e after Save as new draft focus is on the button again', f1);
  await page.focus('.dr-row [data-dr="restore"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.lp-card [data-lp="go"]');
  await page.click('.lp-card [data-lp="go"]');
  await page.waitForTimeout(600);
  const f2 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-dr'));
  ok(f2 === 'restore', '23e after Restore focus is on the Restore button', f2);
  await page.focus('[data-action="numbers-lock"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const f3 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-action'));
  ok(f3 === 'numbers-unlock', '23e after Lock scene numbers focus is on Unlock', f3);

  /* f) the More menu: ↓ reaches the first VISIBLE item when Tamil typing is hidden */
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.documentElement.setAttribute('data-no-india', ''));
  if (!(await page.waitForSelector('#scTop .tb-menu [data-action="sc-tamil"]', { state: 'attached', timeout: 15000 }).catch(() => null))) {
    console.log('23f screenplay.html drew no More menu:', JSON.stringify(await seenState()));
    throw new Error('23f: screenplay.html has no #scTop More menu');
  }
  const more = await page.evaluateHandle(() => [...document.querySelectorAll('#scTop .tb-menu')].find((m) => m.querySelector('[data-action="sc-tamil"]')).querySelector('.tb-menu-btn'));
  await more.focus();
  await page.keyboard.press('ArrowDown');
  const m1 = await page.evaluate(() => { const a = document.activeElement; return a && a.getAttribute('data-action'); });
  await page.keyboard.press('Home');
  const m2 = await page.evaluate(() => { const a = document.activeElement; return a && a.getAttribute('data-action'); });
  ok(m1 === 'sc-dictate' && m2 === 'sc-dictate', '23f ↓ and Home land on the first visible item, not the hidden one', [m1, m2]);
  await page.keyboard.press('Escape');

  /* g) the stage guide has the steps' gutter, and no chip bar over it */
  for (const w of [390, 1440]) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.goto(url('screenplay.html#guide'), { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const g = await page.evaluate(() => {
      const eb = document.querySelector('#guide .sg-eyebrow');
      const step = document.querySelector('#guide .sg-steps > .step');
      const sl = step ? step.getBoundingClientRect().left + parseFloat(getComputedStyle(step).paddingLeft) : null;
      const chips = document.getElementById('scChips');
      return { eb: eb && Math.round(eb.getBoundingClientRect().left), step: sl == null ? null : Math.round(sl), main: Math.round(document.getElementById('main').getBoundingClientRect().left),
        chips: chips ? getComputedStyle(chips).display : 'none' };
    });
    ok(g.eb >= g.main + 16 && (g.step == null || Math.abs(g.eb - g.step) <= 1) && g.chips === 'none',
      `23g at ${w}px the guide heading sits on the steps' gutter, with no chip bar over it`, g);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

/* ---- 13 overflow -------------------------------------------------------- */
for (const w of [390, 1280]) {
  for (const p of ['screenplay.html', 'drafts.html', 'breakdown.html#script']) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.goto(url(p), { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) console.log('        wide:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent || '').slice(0, 40)))));
    ok(over <= 0, `13 ${p} has no horizontal overflow at ${w}px`, over);
  }
}
/* 14 a cold #analysis reads the writer's target before it places the beats */
{
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('fms_songs_v1') || '{}'); o.targetMinutes = 100; localStorage.setItem('fms_songs_v1', JSON.stringify(o)); });
  await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });   // a different document, so the next load is cold
  await page.goto(url('screenplay.html#analysis'), { waitUntil: 'networkidle' });
  await page.waitForSelector('.sa-basis', { timeout: 8000 }).catch(() => {});
  const basis = await page.evaluate(() => document.querySelector('.sa-basis')?.textContent || '');
  ok(basis === 'Beats placed against your 100-page target', '14 cold #analysis names the 100-page target', basis);
}
ok(errors.length === 0, '13 no page errors', errors.slice(0, 5));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:script: all passed');
process.exit(failed ? 1 : 0);
