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
async function seed(page, { key = false, drive = false, drawn = false } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ scenes, shots, key, drive, drawn }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Board Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    localStorage.setItem('fms_shots_v1', JSON.stringify({ shots, frames: drawn ? [{ id: 'frSeed', shotId: 'sh1', caption: 'Seeded', ref: 'drive:SEEDEDFILE0001' }] : [], boards: [], blocks: [] }));
    if (key) S.rawSet('fms_ai_key_gemini_v1', 'AIzaPROVEPROVEPROVEPROVE12');
    if (drive) S.rawSet('fms_drive_sync_v1', JSON.stringify({ enabled: true, fileId: 'BACKUPFILE0001', revisionId: 'rev1', syncedAt: new Date().toISOString() }));
  }, { scenes: SCENES, shots: SHOTS_SEED, key, drive, drawn });
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
    ok(draw && /Sign in/.test(draw.why) && /Google Drive/.test(draw.why), 'with the reason', draw && draw.why);
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

await browser.close();
server.close();
console.log(`\nprove:board-frames — ${pass} passed, ${fail} failed`);
console.log('(Gemini and Drive were FAKED; no real provider or Drive was reached.)');
process.exit(fail ? 1 : 0);
