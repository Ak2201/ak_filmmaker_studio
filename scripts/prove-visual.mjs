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
ok(ct.n === sheets0 + 1 && ct.hidden === false && ct.hash === '#call-sheets', '5  New shoot day switches to the Call Sheets tab', ct);
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

ok(errors.length === 0, '0  no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `\nprove:visual — ${failed} FAILED` : '\nprove:visual — all passed');
process.exit(failed ? 1 : 0);
