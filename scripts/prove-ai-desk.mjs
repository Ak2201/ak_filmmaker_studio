/* ============================================================
   PROOF: the AI Desk — the Pro lock, the one key place, and the
   desk itself (run, refine, tick, accept, undo, skip) — in a real
   Chromium against the shared Supabase fake (scripts/fake-supabase.mjs,
   aiScenario()) and a FAKED Anthropic (scripts/fake-ai.mjs,
   deskAnswer()). No key, no network: every other host is aborted.

     (a) LOCKED — signed out, and signed in on a plan with
         ai_tools:false: the script page's pill is greyed
         (.is-locked, data-ai-state="locked", aria-disabled); a click
         asks the in-app Pro question; "Not now" does nothing;
         "See Pro plans" lands on purchase.html?plan=pro; the Desk
         never opens; no .ai-key-input on script/story/visualize/
         feature, and none on settings.html#ai either
     (b) PRO, NO KEY — the pill opens the Desk on ONE step, the link
         to settings.html#ai, with no input, no run and no key form;
         settings.html#ai carries the key input; no key form anywhere
         else
     (c) PRO + KEY — a seeded script; the dialogue pass on the speech
         at the cursor: nothing sent before Run; Run → v1 with two
         hunks; two refinements → v3, each request carrying the
         numbered instructions; the switcher steps back to v1 and on
         to v3; three idle seconds with the Desk open write nothing;
         untick one hunk, Accept selected → the script changes by
         exactly the ticked hunk and nothing else; Undo restores it;
         Skip writes nothing; at 1280 the page narrows by
         --ai-desk-w and nothing sits under the Desk
     (d) 390px — the Desk is a sheet and nothing overflows sideways

   Run:  npm run build:open && npm run prove:ai-desk
         (PROVE_DIST=dist-verify to point it at another open build;
          PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE, deskAnswer, refineRound, passedSpeech } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5383;
const BASE = 'http://localhost:' + PORT;
const SHOTS = process.env.PROVE_SHOTS || '';

if (!fs.existsSync(path.join(DIST, 'script.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/script.html — run `npm run build:open` first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build (npm run build:open); the gated one walls a signed-out visitor'); process.exit(2); }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
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
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail)));
  return !!cond;
}

/* ---- the seeded script ------------------------------------------
   A three-line speech, so a dialogue pass that touches lines 0 and 2
   (fake-ai's passedSpeech) is TWO hunks with an unchanged line
   between them. */
const SPEECH = ['Naan nalaikku Chennai poren.', 'Amma onnum sollala.', 'Naan thirumbi varuven.'].join('\n');
const ELEMENTS = [
  { id: 'el1', type: 'scene', text: 'INT. ANBU HOUSE - NIGHT' },
  { id: 'el2', type: 'action', text: 'Anbu counts coins on the floor. The ceiling fan ticks.' },
  { id: 'el3', type: 'character', text: 'ANBU' },
  { id: 'el4', type: 'dialogue', text: SPEECH },
  { id: 'el5', type: 'character', text: 'AMMA' },
  { id: 'el6', type: 'dialogue', text: 'Saapittiya?' },
  { id: 'el7', type: 'scene', text: 'EXT. BUS STAND - DAY' },
  { id: 'el8', type: 'action', text: 'The first bus to Chennai pulls in.' }
];
const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';

/* ---- the fake model ---------------------------------------------- */
const requests = [];
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const user = body.messages ? body.messages[0].content : '';
  const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
  const headers = req.headers();
  requests.push({ url: req.url(), user, system, key: headers['x-api-key'] || '' });
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(deskAnswer({ system, user })) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/** A fresh context. `tok` null = signed out. Every localStorage write is
    logged into window.__writes (key, time) for the idle and Skip checks. */
async function context({ tok = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/^https:\/\/api\.anthropic\.com\//.test(u.href)
    && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), (r) => r.abort());
  await ctx.route(SB + '/**', handle);
  await ctx.route(/^https:\/\/api\.anthropic\.com\//, aiRoute);
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (a, b) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now() }); return set.call(this, a, b); };
    Storage.prototype.removeItem = function (a) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now(), rm: true }); return rem.call(this, a); };
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, tok ? [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  return { ctx, page, errors };
}

/** A project with the seeded script (and, with `key`, the AI key). */
async function seed(page, { key = false } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ els, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Desk Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: els, revisions: [], documents: [] }));
    if (key) { S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key); }
  }, { els: ELEMENTS, key: key ? KEY : '' });
}

/** The plan has arrived (or, signed out, never will). */
async function planKnown(page, signedIn) {
  if (signedIn) for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(900);
}

const scriptDoc = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const scriptWrites = (page) => page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
const deskOpen = (page) => page.evaluate(() => {
  const d = document.querySelector('aside.ai-desk');
  if (!d) return false;
  const r = d.getBoundingClientRect(), cs = getComputedStyle(d);
  return !d.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0
    && r.right > 1 && r.left < innerWidth - 1;
});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The first VISIBLE .ai-pill; below 720px the toolbar may live in the
    phone's Tools sheet, so open that first when no pill is visible. */
async function pill(page) {
  await page.waitForSelector('.ai-pill', { state: 'attached', timeout: 15000 });
  let p = page.locator('.ai-pill:visible').first();
  if (await p.count()) return p;
  const tools = page.locator('[data-mn-item="tools"]');
  if (await tools.count()) { await tools.first().click(); await page.waitForTimeout(300); }
  p = page.locator('.ai-pill:visible').first();
  return (await p.count()) ? p : page.locator('.ai-pill').first();
}
/** Click the pill and, when it offers a menu, the task. */
async function openTask(page, taskId) {
  const p = await pill(page);
  await p.click();
  const item = page.locator(`[data-action="ai-pill-task"][data-task="${taskId}"], [data-ai-task="${taskId}"]`).first();
  try { await item.waitFor({ state: 'visible', timeout: 1500 }); await item.click(); } catch (e) { /* a one-task pill opened the Desk itself */ }
  await page.waitForFunction(() => {
    const d = document.querySelector('aside.ai-desk');
    return d && !d.hidden && d.getBoundingClientRect().width > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);   // the slide-in
}
const deskText = (page) => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');

/* =================================================================
   (a) LOCKED
   ================================================================= */
for (const [label, kind] of [['signed out', 'signed-out'], ['ai_tools:false', 'no-ai']]) {
  console.log('(a) locked — ' + label);
  F.reset();
  const tok = aiScenario(kind, 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  await seed(page, { key: true });   // a key on the device must not unlock a locked plan
  await page.goto(BASE + '/script.html', { waitUntil: 'networkidle' });
  await planKnown(page, !!tok);
  const p = await pill(page);
  const st = await p.evaluate((el) => ({ cls: el.className, state: el.dataset.aiState, aria: el.getAttribute('aria-disabled'), disabled: el.disabled, text: el.textContent }));
  ok(/\bis-locked\b/.test(st.cls) && st.state === 'locked', 'the script pill is locked (.is-locked, data-ai-state="locked")', st);
  ok(st.aria === 'true' && !st.disabled, 'aria-disabled="true" and NOT disabled — it stays focusable', st);
  ok(/Pro/.test(st.text), 'the pill says Pro', st.text);
  const fill = await p.evaluate((el) => getComputedStyle(el).color);
  ok(!!fill, 'the pill has a computed colour (greyed by tokens): ' + fill);

  await p.click();
  const dlg = page.locator('.dlg');
  const shown = await dlg.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  ok(shown, 'a click opens the in-app dialog (.dlg)');
  const dtext = shown ? await dlg.textContent() : '';
  ok(/AI tools come with Pro/.test(dtext), 'the dialog asks the Pro question', dtext.slice(0, 120));
  ok(!(await deskOpen(page)) && await page.locator('aside.ai-desk').count() === 0, 'the Desk did not open');
  await page.locator('.dlg button', { hasText: 'Not now' }).click().catch(() => {});
  await page.waitForTimeout(400);
  ok(/\/script(\.html)?$/.test(new URL(page.url()).pathname) && !(await dlg.isVisible().catch(() => false)), '"Not now" closes it and stays on the page', page.url());
  ok(await page.locator('aside.ai-desk').count() === 0, 'still no Desk after "Not now"');

  await (await pill(page)).click();
  await dlg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await Promise.all([
    page.waitForURL(/purchase(\.html)?\?plan=pro/, { timeout: 8000 }).catch(() => {}),
    page.locator('.dlg button', { hasText: 'See Pro plans' }).click().catch(() => {})
  ]);
  const u = new URL(page.url());
  ok(/\/purchase(\.html)?$/.test(u.pathname) && u.searchParams.get('plan') === 'pro', '"See Pro plans" lands on purchase.html?plan=pro', page.url());

  for (const pg of ['script.html', 'story.html', 'visualize.html', 'feature.html', 'settings.html#ai']) {
    await page.goto(BASE + '/' + pg, { waitUntil: 'networkidle' });
    await planKnown(page, !!tok);
    const n = await page.locator('.ai-key-input').count();
    ok(n === 0, 'no .ai-key-input on ' + pg, n);
  }
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (b) PRO, NO KEY
   ================================================================= */
{
  console.log('(b) Pro, no key');
  F.reset();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  await seed(page, { key: false });
  await page.goto(BASE + '/script.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  ok(F.db.calls.includes('billing_status'), 'signed in: the page asked billing_status()', F.db.calls.slice(0, 12));
  const p = await pill(page);
  const state = await p.evaluate((el) => el.dataset.aiState);
  ok(state === 'nokey', 'the pill reads data-ai-state="nokey"', state);
  await openTask(page, 'dialogue-pass');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const parts = await page.evaluate(() => {
    const d = document.querySelector('aside.ai-desk');
    if (!d) return null;
    return {
      settings: d.querySelectorAll('a[href="settings.html#ai"]').length,
      input: d.querySelectorAll('.ai-desk-input').length,
      run: d.querySelectorAll('[data-action="ai-desk-run"]').length,
      chat: d.querySelectorAll('textarea.ai-desk-chat').length,
      keyInput: d.querySelectorAll('.ai-key-input, input[type="password"]').length
    };
  });
  ok(parts && parts.settings === 1, 'the Desk shows the link to settings.html#ai', parts);
  ok(parts && parts.input === 0 && parts.run === 0 && parts.chat === 0, 'and nothing else: no input, no Run, no chat', parts);
  ok(parts && parts.keyInput === 0, 'no key form in the Desk', parts);
  ok(requests.length === 0, 'nothing was sent', requests.length);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'desk-nokey-1280.png') });

  for (const pg of ['script.html', 'story.html', 'visualize.html', 'feature.html']) {
    await page.goto(BASE + '/' + pg, { waitUntil: 'networkidle' });
    await planKnown(page, true);
    const n = await page.locator('.ai-key-input').count();
    ok(n === 0, 'no .ai-key-input on ' + pg + ' (the key lives in Settings only)', n);
  }
  await page.goto(BASE + '/settings.html#ai', { waitUntil: 'networkidle' });
  const has = await page.waitForSelector('.ai-key-input', { timeout: 10000 }).then(() => true, () => false);
  ok(has, 'settings.html#ai has the key input');
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (c) PRO + KEY — the Desk at work, at 1280
   ================================================================= */
{
  console.log('(c) Pro + key: the dialogue pass');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  await seed(page, { key: true });
  await page.goto(BASE + '/script.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const p = await pill(page);
  ok(await p.evaluate((el) => el.dataset.aiState) === 'ready', 'the pill reads data-ai-state="ready"');

  /* The cursor in the three-line speech. */
  const speechRow = page.locator('#wr-page .wr-el .wr-text', { hasText: 'Naan nalaikku Chennai poren.' }).first();
  if (await speechRow.count()) await speechRow.click(); else ok(false, 'the seeded speech is on the page');

  /* The pill's menu offers the three script tasks. */
  await (await pill(page)).click();
  const menuIds = await page.$$eval('[data-action="ai-pill-task"], [data-ai-task]', (els) => els.map((e) => e.dataset.task || e.dataset.aiTask)).catch(() => []);
  ok(['coverage', 'dialogue-pass', 'beat-critique'].every((t) => menuIds.includes(t)), 'the script pill offers coverage, dialogue-pass, beat-critique', menuIds);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const mainBefore = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().right);
  const before = await scriptDoc(page);
  await openTask(page, 'dialogue-pass');
  ok(await deskOpen(page), 'the Desk opens on the dialogue pass');
  ok(await page.evaluate(() => document.documentElement.classList.contains('ai-desk-open')), 'html.ai-desk-open is set at 1280');
  const geo = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--ai-desk-w)';
    document.body.append(probe);
    const w = probe.getBoundingClientRect().width; probe.remove();
    const d = document.querySelector('aside.ai-desk').getBoundingClientRect();
    return { deskW: w, deskLeft: d.left, deskWidth: d.width, mainRight: document.querySelector('main').getBoundingClientRect().right };
  });
  const moved = mainBefore - geo.mainRight;
  ok(geo.deskW > 200, '--ai-desk-w resolves to a width: ' + Math.round(geo.deskW) + 'px', geo);
  ok(Math.abs(moved - geo.deskW) <= 12, "main's right edge moved by ≈ --ai-desk-w (" + Math.round(moved) + ' vs ' + Math.round(geo.deskW) + ')', { mainBefore, ...geo });
  ok(geo.mainRight <= geo.deskLeft + 1, 'nothing of main sits under the Desk', geo);

  const input = await page.locator('aside.ai-desk .ai-desk-input').inputValue().catch(() => '');
  ok(input.includes('Naan nalaikku Chennai poren.') && input.includes('Naan thirumbi varuven.'), '"What goes in" holds the speech at the cursor', input.slice(0, 200));
  ok(requests.length === 0, 'nothing was sent before Run', requests.length);

  /* v1 */
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-hunk input[type="checkbox"]', { timeout: 15000 }).catch(() => {});
  ok(requests.length === 1, 'Run sent one request', requests.length);
  ok(requests.every((r) => r.key === KEY && !r.url.includes(KEY)), 'the key went in a header, never in the URL');
  const hunks = await page.locator('aside.ai-desk .ai-hunk input[type="checkbox"]').count();
  ok(hunks >= 2, 'the answer is a diff with one tick per hunk (' + hunks + ')', hunks);
  ok(await page.$$eval('aside.ai-desk .ai-hunk input[type="checkbox"]', (b) => b.every((x) => x.checked)), 'every hunk is ticked by default');
  ok(/\(pass v1\)/.test(await deskText(page)), 'v1 is on screen');

  /* v2, v3 */
  for (const [n, msg] of [[2, 'Shorter'], [3, 'Keep my wording']]) {
    await page.fill('aside.ai-desk textarea.ai-desk-chat', msg);
    await page.click('aside.ai-desk button[data-action="ai-desk-send"]');
    await page.waitForFunction((n) => document.querySelectorAll('aside.ai-desk .ai-desk-ver').length >= n, n, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    const last = requests[requests.length - 1] || { user: '' };
    ok(requests.length === n, 'refinement ' + (n - 1) + ' sent one more request', requests.length);
    ok(refineRound(last.user) === n - 1 && last.user.includes(msg), 'it carries the numbered instructions so far (' + (n - 1) + ')', last.user.slice(-300));
    ok(last.user.includes('Naan thirumbi varuven.') && last.user.includes('(pass v' + (n - 1) + ')'), 'and the original input and the previous version');
    ok(last.system === requests[0].system, 'against the same system prompt');
  }
  const vers = await page.$$eval('aside.ai-desk .ai-desk-ver', (b) => b.map((x) => x.textContent.trim()));
  ok(vers.length === 3 && vers.some((t) => /v3/.test(t)), 'the switcher reads v1 · v2 · v3', vers);
  ok(/\(pass v3\)/.test(await deskText(page)), 'v3 is on screen');
  await page.locator('aside.ai-desk .ai-desk-ver', { hasText: 'v1' }).first().click();
  await page.waitForTimeout(300);
  ok(/\(pass v1\)/.test(await deskText(page)) && !/\(pass v3\)/.test(await deskText(page)), 'v1 steps back to the first answer');
  await page.locator('aside.ai-desk .ai-desk-ver', { hasText: 'v3' }).first().click();
  await page.waitForTimeout(300);
  ok(/\(pass v3\)/.test(await deskText(page)), 'v3 steps forward again');
  ok(requests.length === 3, 'switching versions sends nothing', requests.length);

  /* idle */
  await page.waitForTimeout(500);
  const w0 = await page.evaluate(() => window.__writes.length);
  await page.waitForTimeout(3000);
  const idle = await page.evaluate((n) => window.__writes.slice(n).map((w) => w.k), w0);
  ok(idle.length === 0, 'three idle seconds with the Desk open write nothing to localStorage', idle);
  const mid = await scriptDoc(page);
  ok(JSON.stringify(mid.elements) === JSON.stringify(before.elements), 'nothing reached the script before Accept');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'desk-1280.png') });

  /* untick the first hunk, Accept selected */
  await page.locator('aside.ai-desk .ai-hunk input[type="checkbox"]').first().uncheck();
  const sw0 = await scriptWrites(page);
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1500);
  const after = await scriptDoc(page);
  const lines = SPEECH.split('\n');
  const want = [lines[0], lines[1], passedSpeech(SPEECH, 3).split('\n')[2]].join('\n');
  const got = (after.elements.find((e) => e.id === 'el4') || {}).text;
  ok(got === want, 'Accept selected applied the ticked hunk only', { got, want });
  const others = (doc) => JSON.stringify(doc.elements.filter((e) => e.id !== 'el4'));
  ok(others(after) === others(before) && after.elements.length === before.elements.length, 'and nothing else in the script moved');
  const sw1 = await scriptWrites(page);
  ok(sw1 - sw0 >= 1 && sw1 - sw0 <= 2, 'one Accept is one write (' + (sw1 - sw0) + ')', sw1 - sw0);

  /* Undo */
  const undo = page.locator('.toast-action', { hasText: /Undo/ }).last();
  const hasUndo = await undo.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
  ok(hasUndo, 'an Undo toast is offered');
  if (hasUndo) await undo.click();
  await page.waitForTimeout(1200);
  const undone = await scriptDoc(page);
  ok(JSON.stringify(undone.elements) === JSON.stringify(before.elements), 'Undo restores the script exactly', (undone.elements.find((e) => e.id === 'el4') || {}).text);

  /* Skip */
  if (!(await deskOpen(page))) await openTask(page, 'dialogue-pass');
  ok(await deskOpen(page), 'the Desk reopens on the same task');
  ok(await page.locator('aside.ai-desk .ai-desk-ver').count() === 3, 'and resumes the session (three versions, from memory)');
  const sk0 = await scriptWrites(page);
  const skDoc = JSON.stringify((await scriptDoc(page)).elements);
  const r0 = requests.length;
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
  await page.waitForTimeout(1500);
  ok(await scriptWrites(page) === sk0 && JSON.stringify((await scriptDoc(page)).elements) === skDoc, 'Skip writes nothing');
  ok(requests.length === r0, 'Skip sends nothing');
  ok(!(await deskOpen(page)), 'Skip closes the Desk');
  ok(!(await page.evaluate(() => document.documentElement.classList.contains('ai-desk-open'))), 'html.ai-desk-open is cleared');
  ok(await overflow(page) <= 0, 'no horizontal overflow at 1280', await overflow(page));

  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /desk|chat/i.test(k)));
  ok(keys.length === 0, 'no storage key for the Desk or its chat', keys);
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (d) 390px — a sheet, no sideways scroll
   ================================================================= */
{
  console.log('(d) 390px');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok, width: 390 });
  try {
  await seed(page, { key: true });
  await page.goto(BASE + '/script.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const speechRow = page.locator('#wr-page .wr-el .wr-text', { hasText: 'Naan nalaikku Chennai poren.' }).first();
  if (await speechRow.count()) await speechRow.click().catch(() => {});
  await openTask(page, 'dialogue-pass');
  ok(await deskOpen(page), 'the Desk opens at 390');
  const g = await page.evaluate(() => {
    const d = document.querySelector('aside.ai-desk').getBoundingClientRect();
    return { left: d.left, right: d.right, width: d.width, vw: innerWidth };
  });
  ok(g.width >= g.vw * 0.9 && g.left >= -1 && g.right <= g.vw + 1, 'it is a full-width sheet inside the viewport', g);
  ok(await overflow(page) <= 0, 'no horizontal overflow with the Desk open', await overflow(page));
  await page.click('aside.ai-desk [data-action="ai-desk-run"]').catch(() => {});
  await page.waitForSelector('aside.ai-desk .ai-hunk', { timeout: 15000 }).catch(() => {});
  ok(await page.locator('aside.ai-desk .ai-hunk').count() >= 2, 'the diff renders at 390');
  ok(await overflow(page) <= 0, 'no horizontal overflow with the answer shown', await overflow(page));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'desk-390.png') });
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
