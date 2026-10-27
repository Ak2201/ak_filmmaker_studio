/* ============================================================
   PROOF: Visualize and post-production QA fixes (26 Oct 2026), on the
   Dragon sample, in a real Chromium.
   ------------------------------------------------------------
   Each assertion is a QA finding and FAILS on the code before its fix:
     1  "Undo the last draft" keeps a drafted shot edited (or framed)
        since, and strands no frame
     2  with "To shoot" on, the up arrow steps over a hidden done shot
        and the row really moves; the arrows are disabled by what shows
     3  arrow keys held on a blocking mark never stack the learn box
     4  ticking a scene in the Draft picker keeps the focus on the box
     5  contacts' "New shoot day" switches to Call Sheets and focuses the
        new title; both buttons share one name
     6  the storyboard's notice is not headed "No image uploads."; an
        empty storyboard links to the step that comes first
     7  a blocking mark removed by the Delete key offers Undo
     8  the scene board prints "2 2/8 pgs", its empty Shots line is
        padded like its neighbours, and the five Visualise tabs have
        five distinct icons
     9  the delete-shot confirm names the shot and says "Delete shot"
    10  an empty "Add" on Deliverables says why
   (The shot list CSV's BOM, the mark labels and the undo's model are
   proved in Node: test:shots, test:blocking.)

       npm run build:open && npm run prove:visual
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5392;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'visualize.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/visualize.html — run `npm run build:open` first');
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

const shotsDoc = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_shots_v1') || '{}'));
const writeShots = (src) => page.evaluate((s) => {
  const doc = JSON.parse(localStorage.getItem('fms_shots_v1'));
  // eslint-disable-next-line no-new-func
  new Function('doc', s)(doc);
  localStorage.setItem('fms_shots_v1', JSON.stringify(doc));
}, src);
const confirmDanger = async () => {
  await page.waitForSelector('.mbtn.k-btn--danger:visible', { timeout: 3000 });
  const label = await page.$eval('.mbtn.k-btn--danger:visible', (b) => b.textContent.trim()).catch(() => '');
  await page.click('.mbtn.k-btn--danger:visible');
  await settle(page, 300);
  return label;
};

/* ---- 8 the scene board ------------------------------------------- */
await page.goto(url('visualize.html#scene-board'), { waitUntil: 'networkidle' });
await settle(page);
await page.selectOption('#scene-board select', 'dragon-sc-1').catch(() => {});
await settle(page, 300);
const board = await page.evaluate(() => {
  const empty = [...document.querySelectorAll('#scene-board .vz-sb-shots .bd-none')][0];
  const panel = empty && empty.closest('.k-panel');
  return {
    count: document.querySelector('.vz-sb-head .vz-scene-count')?.textContent,
    inset: empty && panel ? empty.getBoundingClientRect().left - panel.getBoundingClientRect().left : null,
    icons: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.querySelector('.sym, .material-symbols-outlined, [class*="icon"]') || {}).textContent || '')
  };
});
ok(board.count === '2 2/8 pgs', '8  the scene board prints the length as every view does', board.count);
ok(board.inset !== null && board.inset >= 12, '8  the empty Shots line is padded like its neighbours', board.inset);
const icons = board.icons.filter(Boolean);
ok(icons.length >= 5 && new Set(icons).size === icons.length, '8  every Visualise tab has its own icon', board.icons);

/* ---- 4 + 1 the Draft picker and its undo ------------------------ */
await page.goto(url('visualize.html#draft'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-action="vz-ai-none"]');
await settle(page, 300);
ok(await page.evaluate(() => document.activeElement?.dataset?.action) === 'vz-ai-none', '4  Clear keeps the focus on Clear');
await page.focus('input[data-action="vz-ai-pick"][data-scene="dragon-sc-1"]');
await page.keyboard.press('Space');
await settle(page, 300);
const foc = await page.evaluate(() => ({ a: document.activeElement?.dataset?.action, s: document.activeElement?.dataset?.scene, on: document.activeElement?.checked }));
ok(foc.a === 'vz-ai-pick' && foc.s === 'dragon-sc-1' && foc.on, '4  ticking a scene keeps the focus on its box', foc);

const before = (await shotsDoc()).shots.length;
await page.click('[data-action="vz-basic-run"]');
await settle(page, 800);
const drafted = (await shotsDoc()).shots.filter((s) => s.sceneId === 'dragon-sc-1').map((s) => s.id);
ok(drafted.length >= 2 && (await shotsDoc()).shots.length === before + drafted.length, '1  the basic run drafted shots for scene 1', drafted.length);
const edited = drafted[0];
await writeShots(`const s = doc.shots.find((x) => x.id === ${JSON.stringify(edited)}); s.description = 'MY OWN EDIT';
  doc.frames.push({ id: 'qa-frame', shotId: ${JSON.stringify(drafted[1])}, ref: '', caption: 'mine' });`);
await page.click('[data-action="vz-ai-undo"]');
await confirmDanger();
const after = await shotsDoc();
const ids = new Set(after.shots.map((s) => s.id));
ok(ids.has(edited) && ids.has(drafted[1]), '1  undo keeps the edited and the framed drafted shots', [...ids].filter((i) => drafted.includes(i)));
ok(drafted.slice(2).every((i) => !ids.has(i)), '1  and removes the untouched ones');
ok(after.frames.every((f) => ids.has(f.shotId)), '1  no frame is left pointing at a removed shot');
ok(/kept/.test(await page.textContent('#draft')), '1  the status says what was kept');

/* ---- 9 the delete confirm ---------------------------------------- */
await page.goto(url('visualize.html#shot-list'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-shot="dragon-sh-3-4"] [data-action="vz-shot-del"]');
await page.waitForSelector('.mbtn.k-btn--danger:visible');
const q = await page.evaluate(() => [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')]
  .filter((d) => d.offsetParent !== null || d.open).map((d) => d.textContent).join(' | '));
ok(/Delete shot 4 “The front block held two beats after he…”\?/.test(q), '9  the confirm names the shot and cuts on a word', q);
ok(await page.$eval('.mbtn.k-btn--danger:visible', (b) => b.textContent.trim()) === 'Delete shot', '9  the danger button says Delete shot');
await page.keyboard.press('Escape');
await settle(page, 300);

/* ---- 2 a filtered move ------------------------------------------- */
const sc3 = async () => (await shotsDoc()).shots.filter((s) => s.sceneId === 'dragon-sc-3').map((s) => s.id.replace('dragon-sh-', ''));
const order0 = await sc3();
await writeShots(`doc.shots.find((x) => x.id === 'dragon-sh-3-2').done = true;`);
await page.goto(url('visualize.html#shot-list'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-action="vz-cov-filter"][data-value="todo"]');
await settle(page, 300);
const vis = () => page.$$eval('#shot-list [data-shot^="dragon-sh-3-"]', (rs) => [...new Set(rs.map((r) => r.dataset.shot.replace('dragon-sh-', '')))]);
ok(await page.$eval('[data-shot="dragon-sh-3-1"] [data-action="vz-shot-up"]', (b) => b.disabled || b.getAttribute('aria-disabled') === 'true'), '2  the first VISIBLE row has its up arrow disabled');
await page.click('[data-shot="dragon-sh-3-3"] [data-action="vz-shot-up"]');
await settle(page, 300);
const v1 = await vis();
ok(v1.indexOf('3-3') < v1.indexOf('3-1'), '2  up past a hidden done shot moves the row above the visible one', { before: order0, visible: v1 });
const o1 = await sc3();
ok(o1.indexOf('3-2') > o1.indexOf('3-1'), '2  the hidden shot keeps its place after the one it followed', o1);
await page.click('[data-action="vz-cov-filter"][data-value="all"]');
await settle(page, 300);

/* ---- 6 the storyboard's words ------------------------------------ */
await page.goto(url('visualize.html#storyboard'), { waitUntil: 'networkidle' });
await settle(page);
const sb = await page.textContent('#storyboard');
ok(!/No image uploads/i.test(sb) && /Pictures are kept in your Google Drive/.test(sb), '6  the storyboard notice is headed for what it says', sb.slice(0, 200));
ok(!/move a shot above/.test(sb), '6  the subtitle does not point "above" at another tab');

/* ---- 3 + 7 blocking ---------------------------------------------- */
await page.goto(url('visualize.html#blocking'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-action="blk-add"]');
await settle(page, 300);
for (let i = 0; i < 3; i++) { await page.click('[data-action="blk-add-mark"][data-kind="actor"]'); await settle(page, 150); }
await page.focus('.vz-map.is-editable [data-mark]');
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
await settle(page, 800);
ok(await page.$$eval('#blocking details.learn', (d) => d.length) === 1, '3  held arrow keys leave ONE learn box', await page.$$eval('#blocking details.learn', (d) => d.length));
await page.focus('.vz-map.is-editable [data-mark]');
await page.keyboard.press('Delete');
await settle(page, 300);
const toast = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
ok(/Removed Actor/.test(toast) && /Undo/.test(toast), '7  the Delete key offers the same Undo as the button', toast);

/* ---- 5 contacts' New shoot day ----------------------------------- */
await page.goto(url('contacts.html#contacts'), { waitUntil: 'networkidle' });
await settle(page);
const sheets0 = await page.$$eval('.ct-sheet', (s) => s.length);
await page.click('.k-page-head [data-action="sheet-add"], header [data-action="sheet-add"]');
await settle(page, 400);
const ct = await page.evaluate(() => ({
  hidden: document.getElementById('call-sheets')?.hidden, hash: location.hash,
  focus: document.activeElement?.classList.contains('ct-sheet-title'), n: document.querySelectorAll('.ct-sheet').length,
  names: [...new Set([...document.querySelectorAll('[data-action="sheet-add"]')].map((b) => b.textContent.replace(/add/, '').trim()))]
}));
ok(ct.n === sheets0 + 1 && ct.hidden === false && /^#(call-sheets|sheet-)/.test(ct.hash), '5  New shoot day switches to the Call Sheets tab', ct);
ok(ct.focus, '5  and the new sheet\'s title has the focus', ct);
ok(ct.names.length === 1, '5  the action has one name', ct.names);

/* ---- 10 deliverables' empty Add ---------------------------------- */
await page.goto(url('deliverables.html'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-dv-form="custom"] button[type="submit"]');
await settle(page, 300);
const dv = await page.evaluate(() => {
  const f = document.querySelector('[data-dv-form="custom"]');
  const why = f.querySelector('[role="alert"]');
  return { why: why && !why.hidden ? why.textContent : '', invalid: f.querySelector('input[name="label"]').getAttribute('aria-invalid') };
});
ok(/name/.test(dv.why) && dv.invalid === 'true', '10 an empty Add says a name is needed', dv);

/* ---- 11 / 12 the Edit Log: link rows, target length --------------- */
await page.goto(url('edit.html#cuts'), { waitUntil: 'networkidle' });
await settle(page);
const align = await page.$$eval('form.el-link-add', (f) => f.map((x) => getComputedStyle(x).alignItems));
ok(align.length > 0 && align.every((a) => a === 'center'), '11 the Add link button is centred on its inputs', align);
await page.goto(url('edit.html'), { waitUntil: 'networkidle' });
await settle(page);
await page.fill('[data-edit-target]', '120');
await page.keyboard.press('Tab');
await settle(page, 300);
await page.fill('[data-edit-target]', '-30');
await page.keyboard.press('Tab');
await settle(page, 400);
const tg = await page.evaluate(() => ({
  value: document.querySelector('[data-edit-target]').value,
  stored: JSON.parse(localStorage.getItem('fms_songs_v1') || '{}').targetMinutes,
  said: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')
}));
ok(tg.value === '120' && tg.stored === 120 && /1 to 600/.test(tg.said), '12 a negative target is refused, said, and the old one kept', tg);

/* ---- round 2: focus kept, dates, labels, validation -------------- */
const activeDesc = () => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a && a.tagName, field: a && (a.dataset.sheetField || a.dataset.markField || a.dataset.blockField || a.dataset.action || a.dataset.editAction || ''), name: a && a.getAttribute('name') };
});

// contacts: a call-sheet field saves and Tab moves ON, page stays put, no page error
await page.goto(url('contacts.html#call-sheets'), { waitUntil: 'networkidle' });
await settle(page);
const errs0 = errors.length;
await page.focus('.ct-sheet .ct-sheet-title');
const y0 = await page.evaluate(() => scrollY);
await page.keyboard.type(' Z');
await page.keyboard.press('Tab');
await settle(page, 300);
const cf = await activeDesc();
ok(cf.tag !== 'BODY' && cf.tag !== 'SECTION' && Math.abs((await page.evaluate(() => scrollY)) - y0) < 4 && errors.length === errs0,
  '13 a call-sheet field keeps the focus moving on (not <body>), the page where it was, no page error', { cf, errs: errors.slice(errs0) });
ok(/ Z/.test(await page.$eval('.ct-sheet .ct-doc-title', (n) => n.textContent)), '13 and the paper view caught up with the title');

// contacts: remove / delete confirms name the action and focus survives
await page.goto(url('contacts.html#contacts'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('.ct-person [data-action="contact-del"]');
const personLabel = await confirmDanger();
const pf = await page.evaluate(() => ({ body: document.activeElement === document.body, inList: !!document.activeElement.closest('.ct-person') || document.activeElement.dataset.action === 'contact-add' }));
ok(personLabel === 'Remove person' && !pf.body && pf.inList, '14 removing a person: the red button says Remove person and focus lands on a neighbour', { personLabel, pf });
await page.goto(url('contacts.html#call-sheets'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('.ct-sheet [data-action="sheet-del"]');
const sheetLabel = await confirmDanger();
const sf = await page.evaluate(() => ({ body: document.activeElement === document.body, ok: !!document.activeElement.closest('.ct-sheet') || document.activeElement.dataset.action === 'sheet-add' }));
ok(sheetLabel === 'Delete call sheet' && !sf.body && sf.ok, '14 deleting a call sheet: Delete call sheet, focus kept', { sheetLabel, sf });
await page.goto(url('contacts.html#contacts'), { waitUntil: 'networkidle' });
await settle(page);
const statLabels = await page.$$eval('.ct-kpis .k-stat-label, .ct-kpis [class*="label"]', (n) => n.map((x) => x.textContent.trim()));
ok(['People', 'Cast', 'Departments', 'Call sheets'].every((l) => statLabels.some((t) => t.toLowerCase() === l.toLowerCase())), '15 the stat cards use the page\'s own words', statLabels);

// contacts: New shoot day from the Cast tab brings the new title INTO view
await page.evaluate(() => scrollTo(0, 300));
await page.click('.k-page-head [data-action="sheet-add"], header [data-action="sheet-add"]');
await settle(page, 600);
const newVis = await page.evaluate(() => {
  const r = document.activeElement.getBoundingClientRect();
  return { cls: document.activeElement.className, top: r.top, h: innerHeight };
});
ok(/ct-sheet-title/.test(newVis.cls) && newVis.top >= 0 && newVis.top < newVis.h, '16 New shoot day from Cast & Crew scrolls the new sheet\'s title into view', newVis);

// edit log: cut date is the local day, empty adds say why, spelling
const tzCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Kolkata' });
await tzCtx.addInitScript(() => {
  const Real = Date, at = new Real(Date.UTC(2026, 9, 26, 20, 0, 0));      // 01:30 IST on the 27th
  // eslint-disable-next-line no-global-assign
  Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(+at); } static now() { return +at; } };
});
const tzPage = await tzCtx.newPage();
await tzPage.goto(url('index.html'), { waitUntil: 'networkidle' });
await tzPage.click('[data-action="sample-project"][data-sample="dragon"]');
await tzPage.waitForLoadState('networkidle');
await settle(tzPage, 800);
await tzPage.goto(url('edit.html#cuts'), { waitUntil: 'networkidle' });
await settle(tzPage);
ok(await tzPage.$eval('[data-edit-form="cut"] [name="date"]', (i) => i.value) === '2026-10-27', '17 the New cut date is the local day at 01:30 IST');
await tzCtx.close();

await page.goto(url('edit.html#cuts'), { waitUntil: 'networkidle' });
await settle(page);
await page.click('[data-edit-form="cut"] button[type="submit"]');
await settle(page, 300);
const cutEmpty = await page.evaluate(() => ({ inv: document.querySelector('[data-edit-form="cut"] [name="name"]').getAttribute('aria-invalid'), said: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|') }));
ok(cutEmpty.inv === 'true' && /name/i.test(cutEmpty.said), '18 an empty Add cut says a name is needed', cutEmpty);
await page.goto(url('edit.html'), { waitUntil: 'networkidle' });
await settle(page);
const pk = await page.evaluate(() => {
  const f = document.querySelector('[data-edit-form="pickup"]');
  if (!f) return null;
  const d = f.closest('details'); if (d) d.open = true;
  return true;
});
if (pk) {
  await page.click('[data-edit-form="pickup"] button[type="submit"]');
  await settle(page, 300);
  const pkEmpty = await page.evaluate(() => ({ inv: document.querySelector('[data-edit-form="pickup"] input[name="what"]').getAttribute('aria-invalid'), said: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|') }));
  ok(pkEmpty.inv === 'true' && /first/i.test(pkEmpty.said), '18 an empty Add pick-up says why', pkEmpty);
  await page.fill('[data-edit-form="pickup"] input[name="what"]', 'Insert of the key');
  await page.click('[data-edit-form="pickup"] button[type="submit"]');
  await settle(page, 300);
  ok(/Pending pick-up/.test(await page.textContent('main')) && !/Pending pickup/.test(await page.textContent('main')), '19 one spelling: Pending pick-up');
}

// deliverables: adding keeps the focus in the box
await page.goto(url('deliverables.html'), { waitUntil: 'networkidle' });
await settle(page);
await page.fill('[data-dv-form="custom"] input[name="label"]', 'Hard drive to distributor');
await page.keyboard.press('Enter');
await settle(page, 400);
ok(await page.evaluate(() => document.activeElement?.getAttribute('name')) === 'label', '20 adding a deliverable returns the focus to the box');

// visualize: the shot list
await page.goto(url('visualize.html#shot-list'), { waitUntil: 'networkidle' });
await settle(page);
const sc = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('.vz-scene[data-scene]')].filter((b) => b.querySelectorAll('tr.vz-row [data-shot-field="mins"]').length >= 2);
  return blocks[0] ? blocks[0].dataset.scene : null;
});
const inScene = (sel) => `.vz-scene[data-scene="${sc}"] tr.vz-row ${sel}`;
await page.fill(`${inScene('[data-shot-field="mins"]')} >> nth=0`, '12');
await page.keyboard.press('Tab');
await settle(page, 300);
const timeTxt = await page.$eval(`.vz-scene[data-scene="${sc}"] .vz-scene-time`, (n) => n.textContent);
ok(/12 min/.test(timeTxt), '21 typing minutes updates the scene running time at once', timeTxt);
await page.fill(`${inScene('[data-shot-field="mins"]')} >> nth=1`, 'abc');
await page.keyboard.press('Tab');
await settle(page, 300);
ok(await page.$eval(`${inScene('[data-shot-field="mins"]')} >> nth=1`, (i) => i.getAttribute('aria-invalid')) === 'true', '22 unreadable minutes are flagged invalid', null);
const n0 = await page.$eval(`${inScene('[data-shot-field="number"]')} >> nth=0`, (i) => i.value);
await page.fill(`${inScene('[data-shot-field="number"]')} >> nth=1`, n0 || '1');
await page.keyboard.press('Tab');
await settle(page, 300);
ok(await page.$eval(`${inScene('[data-shot-field="number"]')} >> nth=1`, (i) => i.getAttribute('aria-invalid')) === 'true', '23 a shot number another shot already has is flagged', n0);

// visualize: storyboard frame delete keeps the focus
await page.goto(url('visualize.html#storyboard'), { waitUntil: 'networkidle' });
await settle(page);
if (await page.$('[data-action="vz-frame-del"]')) {
  await page.focus('[data-action="vz-frame-del"] >> nth=0');
  await page.keyboard.press('Enter');
  await confirmDanger();
  ok(await page.evaluate(() => document.activeElement !== document.body), '24 deleting a frame leaves the focus on the page');
}

// visualize: blocking — names, focus, undo order, label Tab
await page.goto(url('visualize.html#blocking'), { waitUntil: 'networkidle' });
await settle(page);
for (let i = 0; i < 3; i++) { await page.click('[data-action="blk-add"]'); await settle(page, 200); }
const sel0 = await page.evaluate(() => { const i = document.activeElement; return { cls: i.className, s: i.selectionStart, e: i.selectionEnd, len: i.value.length }; });
ok(/vz-blk-name/.test(sel0.cls) && sel0.s === 0 && sel0.e === sel0.len && sel0.len > 0, '25 a new setup\'s name is selected, so typing replaces it', sel0);
const names = () => page.$$eval('#blocking .vz-blk-name', (n) => n.map((x) => x.value));
const nm0 = await names();
await page.click('#blocking .vz-blk >> nth=0 >> [data-action="blk-del"]');
await settle(page, 300);
ok(await page.evaluate(() => document.activeElement !== document.body), '26 deleting a setup leaves the focus on the page');
await page.click('[data-action="blk-add"]');
await settle(page, 200);
const nm1 = await names();
ok(new Set(nm1).size === nm1.length, '27 a new setup never repeats a name in use', nm1);
await page.click('#blocking .vz-blk >> nth=0 >> [data-action="blk-del"]');
await settle(page, 200);
const afterDel = await names();
await page.click('.toast [data-toast-action], .toast button:has-text("Undo")');
await settle(page, 300);
const restored = await names();
ok(restored[0] === afterDel.length && false || restored.length === afterDel.length + 1 && restored.slice(1).join('|') === afterDel.join('|'), '28 Undo puts the setup back where it was', { afterDel, restored });
await page.click('[data-action="blk-add-mark"][data-kind="actor"]');
await settle(page, 200);
await page.focus('.vz-blk-label');
await page.keyboard.type('Hero');
await page.keyboard.press('Tab');
await settle(page, 300);
ok(await page.evaluate(() => document.activeElement !== document.body && document.activeElement.dataset.action === 'mk-turn'), '29 a mark label keeps the focus moving on (to the turn buttons)', await activeDesc());
ok(/Hero/.test(await page.$eval('.vz-map.is-editable', (m) => m.textContent)), '29 and the map shows the label');

/* ---- round 3 findings -------------------------------------------- */
// R1 scene board: Shots table fits its panel at 1440, no mid-word breaks
await page.goto(url('visualize.html#scene-board'), { waitUntil: 'networkidle' });
await settle(page);
await page.selectOption('#scene-board select', 'dragon-sc-3').catch(() => {});
await settle(page, 300);
const sbw = await page.evaluate(() => {
  const w = document.querySelector('.vz-sb-shots .k-table-wrap');
  const c = [...document.querySelectorAll('.vz-sb-table tbody tr:first-child td')].slice(1, 5).map((td) => td.getBoundingClientRect().height);
  return w ? { client: w.clientWidth, scroll: w.scrollWidth, h: c } : null;
});
ok(sbw && sbw.scroll <= sbw.client, 'R1 the scene board Shots table fits its panel at 1440', sbw);
ok(await page.$eval('.vz-sb-table td:nth-child(3)', (td) => getComputedStyle(td).whiteSpace === 'nowrap'), 'R1 short columns do not wrap inside a word');
const sceneIds = await page.$$eval('#scene-board select option', (o) => o.map((x) => x.value));
let sbEmpty1 = '';
for (const id of sceneIds) {
  await page.selectOption('#scene-board select', id);
  await settle(page, 150);
  sbEmpty1 = await page.evaluate(() => [...document.querySelectorAll('.vz-sb-col .bd-none')].map((n) => n.textContent).join('|'));
  if (/shots yet/.test(sbEmpty1) && /frames drawn/.test(sbEmpty1)) break;
}
ok(/Shot list tab/.test(sbEmpty1) && /Storyboard tab/.test(sbEmpty1), 'R6 empty Shots and Frames say where to add them', sbEmpty1);

// R2 + R4 + R5 + R8 shot list
await page.goto(url('visualize.html#shot-list'), { waitUntil: 'networkidle' });
await settle(page);
ok(await page.evaluate(() => /\d+ shots? across/.test(document.querySelector('.vz-tools-lab')?.textContent || '') && !/setup/i.test(document.querySelector('.vz-tools-lab')?.textContent || '')), 'R4 the toolbar counts shots, not setups');
ok(await page.evaluate(() => [...document.querySelectorAll('.vz-scene-progress [role="meter"], .vz-scene-progress')].every((n) => !/setups? completed/.test(n.textContent + (n.getAttribute('aria-label') || '')))), 'R4 scene progress counts shots');
ok(await page.$eval('[data-action="vz-shot-lock"]', (b) => /can change this number/.test(b.title)), 'R5 the unlocked tooltip is a sentence');
ok(await page.evaluate(() => [...document.querySelectorAll('.pdf-menu-host .tb-menu-btn')].every((b) => b.classList.contains('k-btn'))), 'R8 export menus are kit buttons');
await page.click('[data-action="vz-cov-filter"][data-value="todo"]');
await settle(page, 300);
await page.focus('[data-shot] [data-shot-field="done"] >> nth=0');
await page.keyboard.press('Space');
await settle(page, 300);
ok(await page.evaluate(() => document.activeElement !== document.body && !!document.activeElement.closest('[data-shot], .vz-cov-filter')), 'R2 ticking a shot out of "To shoot" keeps the focus on the page', await activeDesc());
await page.click('[data-action="vz-cov-filter"][data-value="all"]');
await settle(page, 300);

// R3 empty stat strip
const emptyCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ep = await emptyCtx.newPage();
await ep.goto(url('visualize.html'), { waitUntil: 'networkidle' });
await settle(ep, 600);
const strip = await ep.evaluate(() => document.querySelector('.vz-stats')?.textContent || '');
ok(strip === '' || !/0\s*\/\s*0/.test(strip), 'R3 no "0 / 0" scenes covered with no scenes', strip);
await emptyCtx.close();

// R7 contacts: each person row is named
await page.goto(url('contacts.html#contacts'), { waitUntil: 'networkidle' });
await settle(page);
const ctR = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ct-person')];
  const labels = rows.map((r) => r.getAttribute('aria-label'));
  const dels = rows.map((r) => r.querySelector('[data-action="contact-del"]').getAttribute('aria-label'));
  return { n: rows.length, grouped: rows.every((r) => r.getAttribute('role') === 'group'), named: labels.filter(Boolean).length, uniqueDel: new Set(dels).size, role: document.querySelector('.ct-role').placeholder };
});
ok(ctR.n > 0 && ctR.grouped && ctR.named === ctR.n && ctR.uniqueDel > 1, 'R7 person rows are labelled groups and Remove names the person', ctR);
ok(!/Ravi/.test(ctR.role), 'R9 the role placeholder offers roles only', ctR.role);

ok(errors.length === 0, '0  no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `\nprove:visual — ${failed} FAILED` : '\nprove:visual — all passed');
process.exit(failed ? 1 : 0);
