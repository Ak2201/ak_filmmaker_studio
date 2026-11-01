/* ============================================================
   PROOF: drawn storyboard frames (NEXT-UI-REVAMP-PLAN phase 4) in a
   real Chromium, against the shared Supabase fake
   (scripts/fake-supabase.mjs), a FAKED Gemini image endpoint and a
   FAKED Google Drive. Every other host is aborted.

   WHAT THIS CANNOT PROVE: that the real Gemini image model answers
   this request with a picture, or that the real Drive accepts the
   upload. Both are faked from the published API shapes; neither has
   been run against a real key or a real Drive.

     (a) SIGNED OUT, at 1280 and 390 (each loaded directly at that
         width): the storyboard's "Draw frames with AI" is disabled
         with the reason and a Sign in link; a frame whose ref is
         drive:<id> shows "Reconnect Drive", never a broken <img>;
         nothing is sent to Gemini or Drive; nothing overflows.
     (b) PRO + GEMINI KEY + DRIVE CONNECTED WITH A TOKEN, at 1280 and
         390: the pill is ready; the Desk shows what goes in (a Style
         line + one line per shot without a drawing) and sends NOTHING
         before Run; Run → one picture per shot, each request with the
         key in x-goog-api-key and never ?key=; still nothing uploaded
         and nothing written; untick one, Accept selected → exactly
         the ticked pictures are uploaded to Drive and each becomes a
         frame whose ref is drive:<fileId>; no stored value carries
         image bytes; the page shows the pictures from Drive; Undo
         removes the frames and deletes the files.
     (c) PRO + KEY, DRIVE CONNECTED, NO TOKEN: the page reads
         "Reconnect Drive" in place of the pill, and a drawn frame
         waits for it instead of showing a broken image; nothing is
         sent. (The Desk's own blocked state — reached when the token
         lapses while the page is open — is not driven here.)

   Run:  npm run build:open && npm run prove:board-frames
         (PROVE_SHOTS=dir to save screenshots; PW_CHROMIUM=path)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5386;
const BASE = 'http://localhost:' + PORT;
const SHOTS = process.env.PROVE_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

if (!fs.existsSync(path.join(DIST, 'visualize.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/visualize.html — run `npm run build:open` first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build (npm run build:open)'); process.exit(2); }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail).slice(0, 400)));
  return !!cond;
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/* ---- a real picture for the fakes to hand back ------------------
   Drawn once in the browser: a rough pencil-ish sketch in SVG, as a
   PNG. Its bytes stand in for what Gemini would answer. */
const PNG = await (async () => {
  const pg = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await pg.setContent(`<body style="margin:0;background:#f4f1ea"><svg width="640" height="360" viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="#333" stroke-width="3" stroke-linecap="round">
      <path d="M0 270 L640 262"/><path d="M60 270 L60 110 L210 110 L210 270"/><path d="M80 130 h110 v60 h-110 z"/>
      <path d="M380 270 c0-60 10-90 30-110 c20-20 50-20 60 0 c12 24 10 60 0 110"/><circle cx="440" cy="120" r="26"/>
      <path d="M470 180 l70 40"/><path d="M540 220 l18 -10 l10 22 z"/><path d="M250 300 q140 -30 300 0" stroke-dasharray="6 8"/>
    </g><g stroke="#777" stroke-width="1"><path d="M70 200 l40 -40 M90 210 l50 -50 M110 220 l60 -60"/></g></svg></body>`);
  const buf = await pg.screenshot({ type: 'png' });
  await pg.close();
  return buf;
})();
const B64 = PNG.toString('base64');

/* ---- the fakes ---------------------------------------------------- */
const G = { requests: [] };
const D = { uploads: [], deletes: [], downloads: 0, files: new Map(), n: 0 };
function resetFakes() { G.requests.length = 0; D.uploads.length = 0; D.deletes.length = 0; D.downloads = 0; D.files.clear(); D.n = 0; }

async function geminiRoute(r) {
  const req = r.request();
  const headers = req.headers();
  G.requests.push({ url: req.url(), key: headers['x-goog-api-key'] || '', body: JSON.parse(req.postData() || '{}') });
  return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] }, finishReason: 'STOP' }] }) });
}
async function driveRoute(r) {
  const req = r.request();
  const u = new URL(req.url());
  const auth = req.headers()['authorization'] || '';
  if (!/^Bearer ya29\./.test(auth)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"no token"}}' });
  const m = req.method();
  if (m === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const buf = req.postDataBuffer() || Buffer.alloc(0);
    const id = 'FRAMEFILE' + String(++D.n).padStart(4, '0');
    D.uploads.push({ id, size: buf.length, hasPng: buf.indexOf(PNG.subarray(0, 64)) >= 0, meta: (buf.toString('latin1').match(/\{"name":[^\r\n]*\}/) || [''])[0] });
    D.files.set(id, true);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, name: 'x.png', mimeType: 'image/png' }) });
  }
  const fm = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
  if (fm && m === 'DELETE') { D.deletes.push(fm[1]); D.files.delete(fm[1]); return r.fulfill({ status: 204, body: '' }); }
  if (fm && m === 'GET' && u.searchParams.get('alt') === 'media') {
    D.downloads++;
    if (/^FRAME/.test(fm[1]) || /^SEEDED/.test(fm[1])) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  if (fm && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fm[1], headRevisionId: 'rev1', modifiedTime: new Date().toISOString() }) });
  if (/^\/upload\/drive\/v3\/files\//.test(u.pathname) && m === 'PATCH') {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'BACKUPFILE0001', headRevisionId: 'rev2' }) });
  }
  return r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"not faked"}}' });
}

/** A fresh context at one width, loaded straight at that width.
    `tok` null = signed out; `driveToken` adds a Google provider_token
    to the restored session (what a sign-in with drive.file carries). */
async function context({ tok = null, width = 1280, driveToken = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: width < 720 ? 844 : 900 } });
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB)
    && !/^https:\/\/(generativelanguage|www)\.googleapis\.com\//.test(u.href), (r) => r.abort());
  await ctx.route(SB + '/**', handle);
  await ctx.route(/^https:\/\/generativelanguage\.googleapis\.com\//, geminiRoute);
  await ctx.route(/^https:\/\/www\.googleapis\.com\//, driveRoute);
  let sess = null;
  if (tok) {
    const s = JSON.parse(sessionFor(tok));
    if (driveToken) s.provider_token = 'ya29.FAKEDRIVETOKEN';
    sess = JSON.stringify(s);
  }
  await ctx.addInitScript(([k, v, uid]) => {
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, tok ? [`sb-${REF}-auth-token`, sess, USERS[tok].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload|ERR_FAILED|net::/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.type()); d.dismiss().catch(() => {}); });
  return { ctx, page, errors };
}

const SCENES = [
  { id: 'scA', number: '4', intExt: 'INT', location: 'CHAI SHOP', dayNight: 'DAY', eighths: 12, synopsis: 'Ravi waits for Meena with two cups.', elements: { cast: ['RAVI', 'MEENA'] } },
  { id: 'scB', number: '5', intExt: 'EXT', location: 'BUS STAND', dayNight: 'NIGHT', eighths: 6, synopsis: 'Rain. Meena runs for the last bus.', elements: { cast: ['MEENA'] } }
];
const SHOTS_SEED = [
  { id: 'sh1', sceneId: 'scA', number: '1', size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', description: 'The chai shop at noon, Ravi behind the counter.' },
  { id: 'sh2', sceneId: 'scA', number: '2', size: 'MCU', angle: 'low', movement: 'push in', lens: '50mm', description: 'Ravi pours two cups.' },
  { id: 'sh3', sceneId: 'scB', number: '1', size: 'LS', angle: 'high', movement: 'static', lens: '35mm', description: 'Meena running through the rain to the bus.' }
];

/** A project with scenes and shots; `drawn` adds a frame already held in Drive. */
async function seed(page, { key = false, drive = false, drawn = false, empty = false } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ scenes, shots, key, drive, drawn, empty }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Board Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    const frames = [];
    if (drawn) frames.push({ id: 'frSeed', shotId: 'sh1', caption: 'Seeded', ref: 'drive:SEEDEDFILE0001' });
    if (empty) frames.push({ id: 'frEmpty', shotId: 'sh2', caption: '', ref: '' });
    localStorage.setItem('fms_shots_v1', JSON.stringify({ shots, frames, boards: [], blocks: [] }));
    if (key) S.rawSet('fms_ai_key_gemini_v1', 'AIzaPROVEPROVEPROVEPROVE12');
    if (drive) S.rawSet('fms_drive_sync_v1', JSON.stringify({ enabled: true, fileId: 'BACKUPFILE0001', revisionId: 'rev1', syncedAt: new Date().toISOString() }));
  }, { scenes: SCENES, shots: SHOTS_SEED, key, drive, drawn, empty });
}
const shotsDoc = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_shots_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const deskOpen = (page) => page.evaluate(() => {
  const d = document.querySelector('aside.ai-desk');
  return !!d && !d.hidden && d.getBoundingClientRect().width > 0;
});
async function shot(page, name, sel) {
  if (!SHOTS) return;
  if (sel) { const el = page.locator(sel).first(); if (await el.count()) { await el.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300); } }
  await page.screenshot({ path: path.join(SHOTS, name) });
}
async function settle(page, signedIn) {
  if (signedIn) for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(3200);   // drive-sync adopts the sign-in token on a timer (0 and 2.5s)
}

/* =================================================================
   (a) SIGNED OUT
   ================================================================= */
for (const width of [1280, 390]) {
  console.log('(a) signed out @' + width);
  F.reset(); resetFakes();
  const { ctx, page, errors } = await context({ width });
  try {
    await seed(page, { drawn: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, false);
    const draw = await page.evaluate(() => {
      const d = document.querySelector('.vz-draw');
      return d && { gate: d.dataset.gate, off: !!d.querySelector('.vz-draw-off[disabled]'), pill: d.querySelectorAll('.ai-pill').length,
        why: (d.querySelector('.vz-draw-why') || {}).textContent || '', fix: (d.querySelector('a.vz-draw-fix') || {}).getAttribute?.('href') || '' };
    });
    ok(draw && draw.gate === 'signedout', 'the draw block knows it is signed out', draw);
    ok(draw && draw.off && draw.pill === 0, '"Draw frames with AI" is disabled, and no pill is offered', draw);
    ok(draw && /Continue with Google/.test(draw.why) && /Google Drive/.test(draw.why), 'with the reason', draw && draw.why);
    ok(draw && draw.fix === 'settings.html#account', 'and the way to fix it', draw);
    const pic = await page.evaluate(() => {
      const el = document.querySelector('.vz-frame[data-frame="frSeed"] .drv-img');
      return el && { imgs: el.querySelectorAll('img').length, reconnect: el.querySelectorAll('[data-action="drive-reconnect"]').length, text: el.textContent };
    });
    ok(pic && pic.imgs === 0 && pic.reconnect === 1, 'a drawn frame with no Drive token shows Reconnect Drive, never a broken image', pic);
    ok(G.requests.length === 0 && D.uploads.length === 0 && D.downloads === 0, 'nothing went to Gemini or Drive', { g: G.requests.length, d: D.downloads });
    ok(await overflow(page) <= 0, 'no sideways overflow');
    await shot(page, 'board-signedout-' + width + '.png', '.vz-draw');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (b) PRO + KEY + DRIVE WITH A TOKEN
   ================================================================= */
for (const width of [1280, 390]) {
  console.log('(b) Pro + Gemini key + Drive @' + width);
  F.reset(); resetFakes();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok, width, driveToken: true });
  try {
    await seed(page, { key: true, drive: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, true);
    const st = await page.evaluate(() => {
      const d = document.querySelector('.vz-draw');
      const p = d && d.querySelector('.ai-pill');
      return d && { gate: d.dataset.gate, state: p && p.dataset.aiState, label: p && p.textContent, count: (d.querySelector('.vz-draw-count') || {}).textContent };
    });
    ok(st && st.gate === 'ok' && st.state === 'ready', 'signed in, Drive connected with a token, a Gemini key, Pro: the pill is ready', st);
    ok(st && /3 shots without a drawing/.test(st.count || ''), 'the count is real: three shots, none drawn', st);
    await page.locator('.vz-draw .ai-pill').click();
    await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.querySelector('.ai-desk-input'); }, null, { timeout: 10000 });
    await page.waitForTimeout(500);
    const input = await page.locator('.ai-desk-input').inputValue();
    ok(/^Style: Pencil sketch/.test(input) && (input.match(/^\d+\.\d+ \|/gm) || []).length === 3, 'what goes in: a Style line and one line per shot', input.slice(0, 200));
    const deskTxt = await page.evaluate(() => document.querySelector('aside.ai-desk').textContent);
    ok(/the Gemini API/.test(deskTxt) && /generativelanguage\.googleapis\.com/.test(deskTxt), 'the Desk says where it goes (Gemini), before Run');
    ok(G.requests.length === 0, 'nothing sent before Run', G.requests.length);
    await page.locator('.ai-desk-input').fill(input.replace('Style: Pencil sketch', 'Style: Colour'));
    if (width >= 720) await shot(page, 'board-desk-input-' + width + '.png');
    await page.locator('[data-action="ai-desk-run"]').click();
    await page.waitForSelector('.ai-desk-item img.ai-desk-pic', { timeout: 15000 });
    await page.waitForTimeout(600);
    ok(G.requests.length === 3, 'one Gemini request per shot', G.requests.length);
    ok(G.requests.every((q) => q.key === 'AIzaPROVEPROVEPROVEPROVE12' && !/[?&]key=/.test(q.url) && !q.url.includes('AIza')), 'the key rode in x-goog-api-key, never in the URL', G.requests.map((q) => q.url));
    ok(G.requests.every((q) => /colour storyboard/.test(q.body.contents[0].parts[0].text)), 'the style the writer typed is the style asked for');
    ok(G.requests.every((q) => q.body.generationConfig.responseModalities.join() === 'IMAGE'), 'each asks for an IMAGE');
    const items = await page.evaluate(() => [...document.querySelectorAll('.ai-desk-item')].map((it) => {
      const img = it.querySelector('img.ai-desk-pic');
      return { src: img && img.src.slice(0, 4), w: img && img.naturalWidth, text: it.textContent.slice(0, 60) };
    }));
    ok(items.length === 3 && items.every((i) => i.src === 'blob' && i.w > 0), 'three pictures to judge, each shown from a blob: URL', items);
    let doc = await shotsDoc(page);
    ok(doc.frames.length === 0 && D.uploads.length === 0, 'nothing uploaded and nothing written before Accept', { frames: doc.frames.length, up: D.uploads.length });
    await shot(page, 'board-desk-review-' + width + '.png', '.ai-desk-item');
    await page.locator('.ai-desk-item input[type=checkbox]').nth(1).uncheck();
    await page.locator('[data-action="ai-desk-accept"]').click();
    await page.waitForTimeout(1500);
    doc = await shotsDoc(page);
    ok(D.uploads.length === 2, 'exactly the two ticked pictures were uploaded to Drive', D.uploads.length);
    ok(D.uploads.every((u) => u.hasPng && /"mimeType":"image\/png"/.test(u.meta)), 'each upload carried the picture bytes, typed', D.uploads.map((u) => u.meta));
    ok(doc.frames.length === 2 && doc.frames.every((f) => /^drive:FRAMEFILE\d{4}$/.test(f.ref)), 'each became a frame whose ref is drive:<fileId>', doc.frames);
    eq2(doc.frames.map((f) => f.shotId).sort(), ['sh1', 'sh3'], 'on the shots that were ticked');
    const fat = await page.evaluate((b) => Object.keys(localStorage).filter((k) => {
      const v = localStorage.getItem(k) || '';
      return v.includes(b.slice(0, 40)) || /data:image|base64/.test(v);
    }), B64);
    ok(fat.length === 0, 'no stored value carries image bytes (so no backup can)', fat);
    await page.waitForFunction(() => document.querySelectorAll('.vz-frame .drv-img img.drv-img-pic').length === 2, null, { timeout: 8000 }).catch(() => {});
    const shown = await page.evaluate(() => [...document.querySelectorAll('.vz-frame .drv-img img.drv-img-pic')].map((i) => i.naturalWidth));
    ok(shown.length === 2 && shown.every((w) => w > 0), 'the storyboard shows both pictures, fetched from Drive', shown);
    ok(await overflow(page) <= 0, 'no sideways overflow');
    await shot(page, 'board-drawn-' + width + '.png', '.vz-frame .drv-img');
    const undo = page.locator('.toast button, [class*="toast"] button', { hasText: 'Undo' }).first();
    await undo.click();
    await page.waitForTimeout(1200);
    doc = await shotsDoc(page);
    ok(doc.frames.length === 0, 'Undo removes exactly those frames', doc.frames.length);
    ok(D.deletes.length === 2 && D.deletes.every((id) => /^FRAMEFILE/.test(id)), 'and deletes the files it made', D.deletes);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}
function eq2(a, b, m) { return ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b }); }

/* =================================================================
   (c) PRO + KEY, DRIVE CONNECTED, NO TOKEN
   ================================================================= */
{
  console.log('(c) Drive connected, token lapsed');
  F.reset(); resetFakes();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok, width: 1280, driveToken: false });
  try {
    await seed(page, { key: true, drive: true, drawn: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, true);
    const draw = await page.evaluate(() => {
      const d = document.querySelector('.vz-draw');
      return d && { gate: d.dataset.gate, reconnect: d.querySelectorAll('[data-action="drive-reconnect"]').length, why: (d.querySelector('.vz-draw-why') || {}).textContent };
    });
    ok(draw && draw.gate === 'reconnect' && draw.reconnect === 1, 'the page reads Reconnect Drive', draw);
    const pic = await page.evaluate(() => document.querySelectorAll('.vz-frame[data-frame="frSeed"] .drv-img img').length);
    ok(pic === 0, 'the drawn frame waits for Reconnect, no broken image');
    await shot(page, 'board-reconnect-1280.png', '.vz-draw');
    ok(G.requests.length === 0 && D.uploads.length === 0, 'nothing sent');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (d) UPLOAD A PICTURE (src/ui/frame-upload.js)
   Signed out: the press says why and opens no file picker. Signed in
   with Drive and a token: a 2400x1350 picture goes up shrunk to
   1600x900 JPEG, the frame keeps drive:<fileId> and no bytes, the
   picture shows from Drive, the Shape select sets the slate; Undo
   restores the frame and deletes the new file.
   ================================================================= */
{
  console.log('(d) upload, signed out');
  F.reset(); resetFakes();
  const { ctx, page, errors } = await context({ width: 1280 });
  try {
    await seed(page, { empty: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, false);
    let chooser = false;
    page.on('filechooser', () => { chooser = true; });
    await page.click('.vz-frame[data-frame="frEmpty"] [data-action="vz-frame-upload"]');
    await page.waitForTimeout(400);
    const said = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
    ok(!chooser, 'signed out: no file picker opens');
    ok(/Continue with Google first/.test(said) && /Google Drive/.test(said), 'and the press says why', said);
    ok(D.uploads.length === 0, 'nothing reached Drive');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}
for (const width of [1280, 390]) {
  console.log('(d) upload, Drive with a token @' + width);
  F.reset(); resetFakes();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok, width, driveToken: true });
  try {
    await seed(page, { drive: true, empty: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, true);
    /* A 2400x1350 picture, drawn in the page so its bytes are a real PNG. */
    const big = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 1350;
      const x = c.getContext('2d'); x.fillStyle = 'gray'; x.fillRect(0, 0, 2400, 1350); x.fillStyle = 'black'; x.fillRect(300, 300, 900, 600);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.click('.vz-frame[data-frame="frEmpty"] [data-action="vz-frame-upload"]')
    ]);
    await chooser.setFiles({ name: 'board.png', mimeType: 'image/png', buffer: Buffer.from(big) });
    for (let i = 0; i < 50 && !D.uploads.length; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(600);
    ok(D.uploads.length === 1, 'one file went to Drive', D.uploads.length);
    const up = D.uploads[0] || {};
    ok(/"mimeType":"image\/jpeg"/.test(up.meta || '') && /filmmakers-studio-frame-/.test(up.meta || ''), 'as a JPEG with a readable name', up.meta);
    ok(up.size > 0 && up.size < big.length, 'shrunk before it left (smaller than the picked file)', { sent: up.size, picked: big.length });
    const doc = await shotsDoc(page);
    const fr = doc.frames.find((f) => f.id === 'frEmpty');
    ok(fr && fr.ref === 'drive:' + up.id, 'the frame keeps drive:<fileId>', fr);
    ok(JSON.stringify(doc).length < 4000, 'and no picture bytes in storage', JSON.stringify(doc).length);
    await page.waitForFunction(() => !!document.querySelector('.vz-frame[data-frame="frEmpty"] .drv-img img'), null, { timeout: 5000 }).catch(() => {});
    ok(await page.$$eval('.vz-frame[data-frame="frEmpty"] .drv-img img', (i) => i.length) === 1, 'the picture shows, from Drive');
    ok(await page.isVisible('.toast:has-text("Picture saved to your Google Drive") .toast-action'), 'the toast offers Undo');
    ok(/Replace picture/.test(await page.textContent('.vz-frame[data-frame="frEmpty"] [data-action="vz-frame-upload"]')), 'the button now reads Replace picture');

    await page.selectOption('.vz-frame[data-frame="frEmpty"] .vz-frame-aspect', '2.39:1');
    await page.waitForTimeout(300);
    const shape = await page.evaluate(() => {
      const c = document.querySelector('.vz-frame[data-frame="frEmpty"]');
      const r = c.querySelector('.vz-frame-slate').getBoundingClientRect();
      return { attr: c.dataset.aspect, ratio: Math.round((r.width / r.height) * 100) / 100 };
    });
    ok(shape.attr === '2.39:1' && Math.abs(shape.ratio - 2.39) < 0.05, 'Shape 2.39:1 sets the slate', shape);
    ok(((await shotsDoc(page)).frames.find((f) => f.id === 'frEmpty') || {}).aspect === '2.39:1', 'and is stored on the frame');
    ok(await overflow(page) <= 0, 'no sideways overflow');

    await page.click('.toast:has-text("Picture saved to your Google Drive") .toast-action');
    await page.waitForTimeout(500);
    const back = ((await shotsDoc(page)).frames.find((f) => f.id === 'frEmpty') || {});
    ok(back.ref === '', 'Undo puts the frame back as it was', back);
    ok(D.deletes.length === 1 && D.deletes[0] === up.id, 'and deletes the new file from Drive', D.deletes);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (e) MANY PICTURES AT ONCE (frame-upload.js uploadManyToFrames)
   "Pictures" with three files picked → three new frames on that shot,
   each its own Drive file, uploaded one at a time; one Undo removes all
   three and deletes the files. Then two pictures and a PDF DROPPED on a
   shot → two frames, the PDF refused.
   ================================================================= */
{
  console.log('(e) bulk pictures, Drive with a token');
  F.reset(); resetFakes();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok, width: 1280, driveToken: true });
  try {
    await seed(page, { drive: true, empty: true });
    await page.goto(BASE + '/visualize.html#storyboard', { waitUntil: 'networkidle' });
    await settle(page, true);
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const x = c.getContext('2d'); x.fillStyle = 'gray'; x.fillRect(0, 0, 320, 180);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    const col = '.vz-shotcol:has(.vz-frame[data-frame="frEmpty"])';
    const shotId = await page.getAttribute(col, 'data-shot');
    const before = (await shotsDoc(page)).frames.filter((f) => f.shotId === shotId).length;
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.click(col + ' [data-action="vz-frame-bulk"]')
    ]);
    ok(chooser.isMultiple(), 'the Pictures picker takes several files');
    await chooser.setFiles(['a', 'b', 'c'].map((n) => ({ name: n + '.png', mimeType: 'image/png', buffer: Buffer.from(png) })));
    for (let i = 0; i < 80 && D.uploads.length < 3; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(600);
    ok(D.uploads.length === 3, 'three files went to Drive', D.uploads.length);
    let doc = await shotsDoc(page);
    const mine = doc.frames.filter((f) => f.shotId === shotId);
    ok(mine.length === before + 3, 'one new frame per picture', { before, after: mine.length });
    const ids = D.uploads.map((u) => 'drive:' + u.id);
    ok(ids.every((r) => mine.some((f) => f.ref === r)), 'each new frame keeps its own drive:<fileId>');
    ok(JSON.stringify(doc).length < 6000, 'and no picture bytes in storage', JSON.stringify(doc).length);
    ok(await page.isVisible('.toast:has-text("3 pictures saved") .toast-action'), 'one toast for the run, with Undo');
    await page.click('.toast:has-text("3 pictures saved") .toast-action');
    await page.waitForTimeout(600);
    doc = await shotsDoc(page);
    ok(doc.frames.filter((f) => f.shotId === shotId).length === before, 'Undo removes the three frames');
    ok(D.deletes.length === 3, 'and deletes the three files from Drive', D.deletes);

    /* A drop: two pictures and a PDF onto the same shot. */
    const n0 = D.uploads.length;
    await page.evaluate(async ({ sel, bytes }) => {
      const dt = new DataTransfer();
      const u8 = new Uint8Array(bytes);
      dt.items.add(new File([u8], 'd1.png', { type: 'image/png' }));
      dt.items.add(new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }));
      dt.items.add(new File([u8], 'd2.png', { type: 'image/png' }));
      const el = document.querySelector(sel);
      el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, { sel: col, bytes: png });
    for (let i = 0; i < 80 && D.uploads.length < n0 + 2; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(600);
    ok(D.uploads.length === n0 + 2, 'a drop of two pictures and a PDF uploads two', D.uploads.length - n0);
    ok((await shotsDoc(page)).frames.filter((f) => f.shotId === shotId).length === before + 2, 'two new frames from the drop');
    const said = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
    ok(/1 file was not a picture/.test(said), 'and the PDF is named as refused', said);
    ok(await overflow(page) <= 0, 'no sideways overflow');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (f) THE SHOT LIST'S NUMBERS AND LAYOUT (phase 3 review fixes)
   A scene numbered by hand (12, 13, 14) keeps its numbers through a
   move; a scene in auto order renumbers; locking a blank number stamps
   the number the row shows; unlocking a "12B" offers Undo. At 1280 the
   list fits, "What we see" is the wide column and Light / rig shows.
   ================================================================= */
{
  console.log('(f) shot list numbers and layout @1280');
  F.reset(); resetFakes();
  const { ctx, page, errors } = await context({ width: 1280 });
  try {
    await seed(page);
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('fms_shots_v1'));
      const d = JSON.parse(localStorage.getItem(k));
      d.shots = [
        { id: 'h1', sceneId: 'scA', number: '12', size: 'EWS', rig: 'Key from window', description: 'The chai shop at noon, Ravi behind the counter wiping the glasses one at a time.' },
        { id: 'h2', sceneId: 'scA', number: '13', size: 'MCU' },
        { id: 'h3', sceneId: 'scA', number: '14B' },
        { id: 'o1', sceneId: 'scB', number: '1' }, { id: 'o2', sceneId: 'scB', number: '2' }, { id: 'o3', sceneId: 'scB', number: '' }
      ];
      localStorage.setItem(k, JSON.stringify(d));
    });
    await page.goto(BASE + '/visualize.html#shot-list', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const nums = async (scene) => (await shotsDoc(page)).shots.filter((x) => x.sceneId === scene).map((x) => x.id + '=' + x.number);
    await page.click('[data-shot="h1"] [data-action="vz-shot-down"]');
    await page.waitForTimeout(300);
    ok(JSON.stringify(await nums('scA')) === JSON.stringify(['h2=13', 'h1=12', 'h3=14B']), 'a move in a scene numbered by hand keeps every typed number', await nums('scA'));
    await page.click('[data-shot="o1"] [data-action="vz-shot-down"]');
    await page.waitForTimeout(300);
    ok(JSON.stringify(await nums('scB')) === JSON.stringify(['o2=1', 'o1=2', 'o3=3']), 'a move in a scene in auto order renumbers it', await nums('scB'));
    // Lock a blank: clear o3's number first, then lock it.
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('fms_shots_v1'));
      const d = JSON.parse(localStorage.getItem(k));
      d.shots.find((x) => x.id === 'o3').number = '';
      localStorage.setItem(k, JSON.stringify(d));
    });
    await page.goto(BASE + '/visualize.html#shot-list', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.click('[data-shot="o3"] [data-action="vz-shot-lock"]');
    await page.waitForTimeout(300);
    const o3 = (await shotsDoc(page)).shots.find((x) => x.id === 'o3');
    ok(o3.numLocked === true && o3.number === '3', 'locking a blank number stamps the number the row shows', o3);
    await page.click('[data-shot="h3"] [data-action="vz-shot-lock"]');
    await page.waitForTimeout(300);
    ok((await shotsDoc(page)).shots.find((x) => x.id === 'h3').number !== '14B', 'unlocking 14B hands it to the list');
    ok(await page.isVisible('.toast:has-text("14B") .toast-action'), 'with an Undo toast');
    await page.click('.toast:has-text("14B") .toast-action');
    await page.waitForTimeout(300);
    ok(JSON.stringify(await nums('scA')) === JSON.stringify(['h2=13', 'h1=12', 'h3=14B']), 'Undo puts the scene\'s numbers back', await nums('scA'));
    const lay = await page.evaluate(() => {
      const wrap = document.querySelector('[data-scene="scA"] .vz-table-wrap') || document.querySelector('.vz-table-wrap');
      const desc = document.querySelector('[data-shot="h1"] .vz-desc');
      const sel = document.querySelector('[data-shot="h1"] .vz-c-size select');
      const widths = [...document.querySelectorAll('[data-shot="h1"] td')].map((t) => t.getBoundingClientRect().width);
      return { fits: wrap.scrollWidth <= wrap.clientWidth, sw: wrap.scrollWidth, cw: wrap.clientWidth, cols: [...document.querySelectorAll("[data-shot=\"h1\"] td")].map((t) => (t.className || "?") + ":" + Math.round(t.getBoundingClientRect().width)).join(" "), desc: desc.getBoundingClientRect().width, clip: desc.scrollHeight - desc.clientHeight,
        widest: Math.max(...widths) === (desc.closest('td').getBoundingClientRect().width), rig: !!document.querySelector('[data-shot="h1"] .vz-rig'),
        size: sel.options[sel.selectedIndex].text, title: sel.title };
    });
    ok(lay.fits, 'the list fits its panel at 1280 with every default column', lay);
    ok(lay.desc >= 200 && lay.widest && lay.clip <= 1, '"What we see" is the widest column and shows its whole text', lay);
    ok(lay.rig, 'Light / rig shows by default', lay);
    ok(lay.size === 'EWS' && /extreme wide/.test(lay.title), 'the size select shows its code, the words in its title', lay);
    ok(await overflow(page) <= 0, 'no sideways overflow');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

await browser.close();
server.close();
console.log(`\nprove:board-frames — ${pass} passed, ${fail} failed`);
console.log('(Gemini and Drive were FAKED; no real provider or Drive was reached.)');
process.exit(fail ? 1 : 0);
