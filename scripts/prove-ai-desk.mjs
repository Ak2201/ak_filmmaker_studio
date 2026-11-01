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
     (e) PRO + KEY — synopsis → script, stage 2 (write.html#generate):
         a job seeded at stage 'beats'; the gen-scenes pill → Run →
         one item per proposed scene, nothing written before Accept;
         untick one, Accept selected → the scene model holds exactly
         the ticked scenes and the job is at 'pages'; Undo restores
         the scene list and the stage
     (f) PRO + KEY — stage 3: a job at 'pages' with five scenes,
         cursor 0; the gen-batch pill → Run → one item per scene in
         the batch; three idle seconds with the Desk open write
         nothing; untick one, Accept → the script gained the elements
         of exactly the ticked scenes and the cursor moved past the
         WHOLE batch; Undo restores script and cursor; Skip writes
         nothing
     (g) PRO + KEY — the voice check (write.html#coverage): pick a
         character with three lines → the voice-check pill → Run →
         one item per rewrite; Accept one → it is an alternate take
         (`alts`) on that line and the line in use is unchanged;
         Undo removes it

   Run:  npm run build:open && npm run prove:ai-desk
         (PROVE_DIST=dist-verify to point it at another open build;
          PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE, deskAnswer, refineRound, passedSpeech, FAKE_SCENES, fakePagesFor, voiceRewrite } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5383;
const BASE = 'http://localhost:' + PORT;
const SHOTS = process.env.PROVE_SHOTS || '';

if (!fs.existsSync(path.join(DIST, 'screenplay.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/screenplay.html — run `npm run build:open` first');
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
  /* beforeunload is the one native prompt the platform insists on:
     script.html's leave-prompt warns on a page.goto while the working
     copy differs from the latest draft (the seeded script has none).
     Accept it — that is the page doing its job. Any OTHER native
     dialog is an error (the app's asks go through dialog.js). */
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { d.accept().catch(() => {}); return; }
    errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {});
  });
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
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page, !!tok);
  const p = await pill(page);
  const st = await p.evaluate((el) => ({ cls: el.className, state: el.dataset.aiState, aria: el.getAttribute('aria-disabled'), disabled: el.disabled, text: el.textContent }));
  ok(/\bis-locked\b/.test(st.cls) && st.state === 'locked', 'the script pill is locked (.is-locked, data-ai-state="locked")', st);
  ok(st.aria === 'true' && !st.disabled, 'aria-disabled="true" and NOT disabled — it stays focusable', st);
  ok(/Pro/.test(st.text), 'the pill says Pro', st.text);
  const fill = await p.evaluate((el) => getComputedStyle(el).color);
  ok(!!fill, 'the pill has a computed colour (greyed by tokens): ' + fill);

  /* force: Playwright counts aria-disabled="true" as not enabled and
     would wait forever; a person's click lands, and that is the point
     of aria-disabled over disabled. */
  await p.click({ force: true });
  const dlg = page.locator('.dlg');
  const shown = await dlg.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  ok(shown, 'a click opens the in-app dialog (.dlg)');
  const dtext = shown ? await dlg.textContent() : '';
  ok(/AI tools come with Pro/.test(dtext), 'the dialog asks the Pro question', dtext.slice(0, 120));
  ok(!(await deskOpen(page)) && await page.locator('aside.ai-desk').count() === 0, 'the Desk did not open');
  await page.locator('.dlg button', { hasText: 'Not now' }).click().catch(() => {});
  await page.waitForTimeout(400);
  ok(/\/screenplay(\.html)?$/.test(new URL(page.url()).pathname) && !(await dlg.isVisible().catch(() => false)), '"Not now" closes it and stays on the page', page.url());
  ok(await page.locator('aside.ai-desk').count() === 0, 'still no Desk after "Not now"');

  await (await pill(page)).click({ force: true });
  await dlg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await Promise.all([
    page.waitForURL(/purchase(\.html)?\?plan=pro/, { timeout: 8000 }).catch(() => {}),
    page.locator('.dlg button', { hasText: 'See Pro plans' }).click().catch(() => {})
  ]);
  const u = new URL(page.url());
  ok(/\/purchase(\.html)?$/.test(u.pathname) && u.searchParams.get('plan') === 'pro', '"See Pro plans" lands on purchase.html?plan=pro', page.url());

  for (const pg of ['screenplay.html', 'story.html', 'visualize.html', 'feature.html', 'settings.html#ai']) {
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
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
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

  for (const pg of ['screenplay.html', 'story.html', 'visualize.html', 'feature.html']) {
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
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const p = await pill(page);
  ok(await p.evaluate((el) => el.dataset.aiState) === 'ready', 'the pill reads data-ai-state="ready"');

  /* The cursor in the three-line speech. */
  /* The rows are textareas, so the speech is their VALUE, not their
     text content: find the row by its element id. */
  const speechRow = page.locator('#wr-page [data-el="el4"] .wr-text').first();
  const onPage = (await speechRow.count()) && (await speechRow.inputValue()).includes('Naan nalaikku Chennai poren.');
  ok(onPage, 'the seeded speech is on the page');
  if (onPage) await speechRow.click();

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
  /* `u` is the co-editing stamp (script-merge.js): an Undo is a new edit and
     is stamped fresh, or a line-by-line merge would rank it below the Accept.
     Everything else must come back byte for byte. */
  const unstamped = (els) => els.map(({ u, ...rest }) => rest);
  const ue = unstamped(undone.elements), be = unstamped(before.elements);
  ok(JSON.stringify(ue) === JSON.stringify(be), 'Undo restores the script exactly (bar the edit stamp)', ue.map((e, i) => JSON.stringify(e) === JSON.stringify(be[i]) ? null : { got: e, want: be[i] }).filter(Boolean));

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

  /* A read keeps notes (lane D): the beat critique of the scene at the
     caret shows its prose AND a tick per note, with Accept; Accept
     writes only the ticked note (a sticky note when the scene is not on
     the scene list, its readerNote when it is); Undo takes it back. */
  const notesNow = () => page.evaluate(() => {
    const out = [];
    for (const k of Object.keys(localStorage)) {
      if (/^fms_idea_vault_v1/.test(k)) { try { out.push(...JSON.parse(localStorage.getItem(k)).map((x) => x.snippet)); } catch (e) { /* skip */ } }
      if (/^fms_scenes_v1/.test(k)) { try { out.push(...JSON.parse(localStorage.getItem(k)).scenes.map((s) => s.readerNote || '')); } catch (e) { /* skip */ } }
    }
    return out.filter((t) => /AI \(Beat critique\)/.test(t));
  });
  await openTask(page, 'beat-critique');
  ok(await deskOpen(page), 'the Desk opens on the beat critique');
  ok(!(await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').count()), 'before Run a read offers no Accept');
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 15000 }).catch(() => {});
  ok(await page.locator('aside.ai-desk .ai-desk-readtext').count() === 1, 'the critique prose is still shown');
  ok(await page.locator('aside.ai-desk .ai-desk-item input[type="checkbox"]').count() === 2, 'one tick per note');
  ok(await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').count() === 1, 'Accept is offered for a read that can keep notes');
  ok((await notesNow()).length === 0, 'nothing was kept before Accept');
  await page.locator('aside.ai-desk .ai-desk-item input[type="checkbox"]').nth(1).uncheck();
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(800);
  const keptNotes = await notesNow();
  ok(keptNotes.length === 1 && /The want is stated, not shown/.test(keptNotes[0]), 'Accept kept exactly the ticked note', keptNotes);
  const said = await page.locator('.toast', { hasText: /Beat critique: saved/ }).count();
  ok(said >= 1, 'the toast says what was saved');
  const cundo = page.locator('.toast-action', { hasText: /Undo/ }).last();
  if (await cundo.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await cundo.click();
  await page.waitForTimeout(800);
  ok((await notesNow()).length === 0, 'Undo removed the note it added', await notesNow());

  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /desk|chat/i.test(k)));
  ok(keys.length === 0, 'no storage key for the Desk or its chat', keys);
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (c2) TWO SPEECHES — the Desk keeps a session per speech; Accept on
   the restored session of speech A writes A, never the speech that
   was sent last (ai-tasks.js once read the target from a map keyed
   by task id only).
   ================================================================= */
{
  console.log('(c2) Pro + key: two speeches, Accept on the earlier one');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  await seed(page, { key: true });
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const runOn = async (elId) => {
    await page.locator('#wr-page [data-el="' + elId + '"] .wr-text').first().click();
    await openTask(page, 'dialogue-pass');
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    await page.waitForSelector('aside.ai-desk .ai-desk-ver', { timeout: 15000 }).catch(() => {});
    await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
    await page.waitForTimeout(300);
  };
  await runOn('el4');
  await runOn('el6');
  ok(requests.length === 2, 'one run on each speech', requests.length);
  await page.locator('#wr-page [data-el="el4"] .wr-text').first().click();
  await openTask(page, 'dialogue-pass');
  ok(/\(pass v1\)/.test(await deskText(page)) && (await deskText(page)).includes('Chennai'), "the Desk restores speech A's session");
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  const after = await scriptDoc(page);
  const el = (id) => (after.elements.find((e) => e.id === id) || {}).text;
  ok(el('el6') === 'Saapittiya?', 'speech B is untouched', el('el6'));
  ok(el('el4') === passedSpeech(SPEECH, 1), "speech A carries A's own pass", el('el4'));
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
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  /* The rows are textareas, so the speech is their VALUE, not their
     text content: find the row by its element id. */
  const speechRow = page.locator('#wr-page [data-el="el4"] .wr-text').first();
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


/* =================================================================
   SYNOPSIS → SCRIPT AND THE VOICE CHECK, on write.html?stay=1
   -----------------------------------------------------------------
   The job is seeded straight into localStorage under the key
   scriptgen.js reads (fms_scriptgen_v1), AFTER the project exists, so
   store.js's proxy suffixes it with the project id exactly as the
   page's own save() would. The script starts EMPTY in (e) and (f):
   scene-sync with zero headings bins nothing, so the scene model is
   only what the seed and the Desk put there.
   ================================================================= */
const BEATS = [
  { id: 'opening-image', label: 'Opening Image', happens: 'Anbu counts coins on the floor of a one-room house.' },
  { id: 'catalyst', label: 'Catalyst', happens: 'The mill closes and the wages stop.' },
  { id: 'break-into-two', label: 'Break into Two', happens: 'Anbu takes the first bus to Chennai.' }
];
const baseJob = (patch) => ({
  stage: 'synopsis', synopsis: 'A broke son leaves his mother to find work in Chennai.',
  logline: 'A son leaves home to find work.', format: 'feature', lang: 'ta-dialogue',
  target: 0, beats: [], scenes: [], cursor: 0, model: '', startedAt: '', truncations: 0, ...patch
});

/** A project, the key, and whatever the scenario stores. */
async function seedGen(page, { job = null, scenes = null, elements = [] } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ job, scenes, elements, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Gen Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements, revisions: [], documents: [] }));
    if (scenes) localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    if (job) localStorage.setItem('fms_scriptgen_v1', JSON.stringify(job));
    S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key);
  }, { job, scenes, elements, key: KEY });
}

/** A scoped key's value, through the proxy's suffix (the project id). */
const stored = (page, key) => page.evaluate((key) => {
  const k = Object.keys(localStorage).find((x) => x === key || x.startsWith(key + '__'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
}, key);
const writesTo = (page, key) => page.evaluate((key) => window.__writes.filter((w) => w.k.startsWith(key)).length, key);

/** Open `taskId` from the pill in `scope` whose label matches `labelRe`
    (a section can carry more than one pill: stage 2 also has "Draft the
    beats again"). Returns the label found, or '' when there is none. */
async function openPillIn(page, scope, labelRe, taskId) {
  await page.waitForSelector(scope + ' .ai-pill', { state: 'attached', timeout: 15000 }).catch(() => {});
  const all = page.locator(scope + ' .ai-pill');
  const n = await all.count();
  let target = null, label = '';
  for (let i = 0; i < n; i++) {
    const t = (await all.nth(i).textContent()) || '';
    if (labelRe.test(t)) { target = all.nth(i); label = t.trim(); break; }
  }
  if (!target) return '';
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  const item = page.locator(`[data-action="ai-pill-task"][data-task="${taskId}"]`).first();
  try { await item.waitFor({ state: 'visible', timeout: 1500 }); await item.click(); } catch (e) { /* one task: the Desk opened itself */ }
  await page.waitForFunction(() => {
    const d = document.querySelector('aside.ai-desk');
    return d && !d.hidden && d.getBoundingClientRect().width > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  return label || '(pill)';
}
const pillLabels = (page, scope) => page.$$eval(scope + ' .ai-pill', (b) => b.map((x) => x.textContent.trim())).catch(() => []);

/** Run, and wait for the list. Returns the items' { id, text }. */
async function runList(page) {
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk label.ai-desk-item input[data-tick="item"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  return page.$$eval('aside.ai-desk label.ai-desk-item', (ls) => ls.map((l) => ({
    id: (l.querySelector('input[data-tick="item"]') || {}).dataset?.id || '',
    text: l.textContent || '',
    checked: !!(l.querySelector('input[data-tick="item"]') || {}).checked
  })));
}
async function untick(page, i) {
  await page.locator('aside.ai-desk label.ai-desk-item input[data-tick="item"]').nth(i).uncheck();
  await page.waitForTimeout(150);
}
async function clickUndo(page) {
  const undo = page.locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await undo.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
  ok(has, 'an Undo toast is offered');
  if (has) await undo.click();
  await page.waitForTimeout(1200);
  return has;
}

/* =================================================================
   (e) stage 2 — the scene list
   ================================================================= */
{
  console.log('(e) Pro + key: synopsis → script, stage 2 (gen-scenes)');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  await seedGen(page, { job: baseJob({ stage: 'beats', beats: BEATS }) });
  await page.goto(BASE + '/write.html?stay=1#generate', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const scope = '#generate';
  const opened = await openPillIn(page, scope, /lay out/i, 'gen-scenes');
  ok(!!opened, 'stage 2 offers the gen-scenes pill ("' + opened + '")', await pillLabels(page, scope));
  ok(await deskOpen(page), 'the Desk opens on the scene list');
  ok(requests.length === 0, 'nothing was sent before Run', requests.length);
  const sw0 = await writesTo(page, 'fms_scenes_v1');
  const items = await runList(page);
  ok(requests.length === 1 && /Break this story into a scene list/.test((requests[0] || {}).user || ''), 'Run sent the scene-list request', requests.length);
  ok(items.length === FAKE_SCENES.length && items.length >= 3, 'one item per proposed scene (' + items.length + ')', items.map((x) => x.text.slice(0, 60)));
  ok(items.every((x) => x.checked), 'every scene is ticked by default');
  ok(await writesTo(page, 'fms_scenes_v1') === sw0 && (await stored(page, 'fms_scenes_v1') || { scenes: [] }).scenes.length === 0, 'nothing reached the scene model before Accept');

  /* untick the second scene, Accept selected */
  const dropAt = 1;
  const dropLoc = FAKE_SCENES[dropAt].location;
  ok(new RegExp(dropLoc, 'i').test(items[dropAt] ? items[dropAt].text : ''), 'the second item is the second proposed scene (' + dropLoc + ')', items[dropAt]);
  await untick(page, dropAt);
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1500);
  const want = FAKE_SCENES.filter((s, i) => i !== dropAt).map((s) => s.location);
  const got = ((await stored(page, 'fms_scenes_v1')) || { scenes: [] }).scenes;
  ok(JSON.stringify(got.map((s) => s.location)) === JSON.stringify(want), 'the scene model holds exactly the ticked scenes', got.map((s) => s.location));
  ok(got.every((s, i) => s.number === String(i + 1)), 'numbered 1…' + want.length, got.map((s) => s.number));
  const job = await stored(page, 'fms_scriptgen_v1');
  ok(job && job.stage === 'pages' && job.cursor === 0 && job.scenes.length === want.length, 'the job is at stage "pages" with ' + want.length + ' scenes, cursor 0', job && { stage: job.stage, n: job.scenes.length, cursor: job.cursor });
  ok(job && job.scenes.every((s, i) => s.sceneId === got[i].id), "the job's scenes point at the scene rows written", job && job.scenes.map((s) => s.sceneId));

  await clickUndo(page);
  const undoneScenes = ((await stored(page, 'fms_scenes_v1')) || { scenes: [] }).scenes;
  ok(undoneScenes.length === 0, 'Undo restores the previous scene list (empty)', undoneScenes.map((s) => s.location));
  const undoneJob = await stored(page, 'fms_scriptgen_v1');
  ok(undoneJob && undoneJob.stage === 'beats' && undoneJob.scenes.length === 0 && undoneJob.beats.length === BEATS.length, 'and the job is back at stage "beats", beats intact', undoneJob && { stage: undoneJob.stage, scenes: undoneJob.scenes.length, beats: undoneJob.beats.length });
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (f) stage 3 — one batch, reviewed
   ================================================================= */
{
  console.log('(f) Pro + key: synopsis → script, stage 3 (gen-batch)');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  const LOCS = ['ANBU HOUSE', 'BUS STAND', 'CHENNAI MANSION', 'TEA SHOP', 'MILL GATE'];
  const rows = LOCS.map((loc, i) => ({
    id: 'gs' + (i + 1), number: String(i + 1), intExt: i % 2 ? 'EXT' : 'INT', dayNight: i % 2 ? 'DAY' : 'NIGHT',
    location: loc, synopsis: 'Scene ' + (i + 1) + ' happens', eighths: 8, elements: { cast: ['ANBU'] }
  }));
  const jobScenes = rows.map((r) => ({
    sceneId: r.id, slug: r.intExt + '. ' + r.location + ' - ' + r.dayNight, synopsis: r.synopsis, eighths: 8, cast: ['ANBU'], beat: 'catalyst'
  }));
  await seedGen(page, { scenes: rows, job: baseJob({ stage: 'pages', beats: BEATS, scenes: jobScenes, cursor: 0, startedAt: new Date().toISOString() }) });
  await page.goto(BASE + '/write.html?stay=1#generate', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const scope = '#generate';
  const before = await scriptDoc(page);
  const opened = await openPillIn(page, scope, /next/i, 'gen-batch');
  ok(!!opened, 'stage 3 offers the gen-batch pill ("' + opened + '")', await pillLabels(page, scope));
  ok(await deskOpen(page), 'the Desk opens on the next batch');
  ok(requests.length === 0, 'nothing was sent before Run', requests.length);
  const items = await runList(page);
  const BATCH = 4;   // scriptgen.js BATCH_SIZE
  const batch = jobScenes.slice(0, BATCH);
  ok(requests.length === 1 && /marked WRITE THIS below/.test((requests[0] || {}).user || ''), 'Run sent one batch request', requests.length);
  ok(batch.every((s) => ((requests[0] || {}).user || '').includes('sceneId: ' + s.sceneId)) && !((requests[0] || {}).user || '').includes('sceneId: gs5'), 'it asked for the first ' + BATCH + ' scenes only');
  ok(items.length === BATCH, 'one item per scene in the batch (' + items.length + ')', items.map((x) => x.id + ' ' + x.text.slice(0, 50)));
  ok(items.every((x, i) => x.id === batch[i].sceneId || x.text.includes(batch[i].slug)), 'each item is its scene, in order (id = sceneId, or the heading on it)', items.map((x) => x.id));

  /* idle with the Desk open */
  await page.waitForTimeout(500);
  const w0 = await page.evaluate(() => window.__writes.length);
  await page.waitForTimeout(3000);
  const idle = await page.evaluate((n) => window.__writes.slice(n).map((w) => w.k), w0);
  ok(idle.length === 0, 'three idle seconds with the Desk open write nothing to localStorage', idle);
  const mid = await scriptDoc(page);
  ok(JSON.stringify(mid.elements) === JSON.stringify(before.elements), 'nothing reached the script before Accept');
  ok((await stored(page, 'fms_scriptgen_v1')).cursor === 0, 'and the cursor has not moved');

  /* untick the third scene, Accept selected */
  const dropAt = 2;
  await untick(page, dropAt);
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1500);
  const after = await scriptDoc(page);
  const kept = batch.filter((s, i) => i !== dropAt);
  const wantEls = kept.flatMap((s) => fakePagesFor({ sceneId: s.sceneId, heading: s.slug, cast: s.cast }, 1)).map((e) => e.type + '|' + e.text);
  const added = after.elements.slice(before.elements.length).map((e) => e.type + '|' + e.text);
  ok(JSON.stringify(added) === JSON.stringify(wantEls), 'the script gained the elements of exactly the ticked scenes (' + kept.length + ' of ' + BATCH + ')', { added, wantEls });
  ok(!after.elements.some((e) => String(e.text).includes(batch[dropAt].sceneId)), 'nothing of the unticked scene landed (' + batch[dropAt].sceneId + ')');
  const job = await stored(page, 'fms_scriptgen_v1');
  ok(job && job.cursor === BATCH && job.stage === 'pages', 'the cursor moved past the WHOLE batch (0 → ' + BATCH + ')', job && { cursor: job.cursor, stage: job.stage });

  await clickUndo(page);
  const undone = await scriptDoc(page);
  ok(JSON.stringify(undone.elements) === JSON.stringify(before.elements), 'Undo restores the script', undone.elements.length);
  const undoneJob = await stored(page, 'fms_scriptgen_v1');
  ok(undoneJob && undoneJob.cursor === 0 && undoneJob.stage === 'pages', 'and the cursor (back to 0)', undoneJob && undoneJob.cursor);

  /* Skip */
  if (!(await deskOpen(page))) await openPillIn(page, scope, /next/i, 'gen-batch');
  ok(await deskOpen(page), 'the Desk reopens on the batch');
  if (!(await page.locator('aside.ai-desk label.ai-desk-item').count())) await runList(page);
  const sk0 = await writesTo(page, 'fms_script_v1'), sj0 = await writesTo(page, 'fms_scriptgen_v1');
  const skDoc = JSON.stringify((await scriptDoc(page)).elements);
  const r0 = requests.length;
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
  await page.waitForTimeout(1500);
  ok(await writesTo(page, 'fms_script_v1') === sk0 && await writesTo(page, 'fms_scriptgen_v1') === sj0
    && JSON.stringify((await scriptDoc(page)).elements) === skDoc, 'Skip writes nothing (script and job)');
  ok(requests.length === r0, 'Skip sends nothing');
  ok((await stored(page, 'fms_scriptgen_v1')).cursor === 0, 'and the cursor stays at 0');
  ok(!(await deskOpen(page)), 'Skip closes the Desk');
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (g) the voice check
   ================================================================= */
{
  console.log('(g) Pro + key: the voice check (voice-check)');
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
  const VLINES = ['Naan nalaikku Chennai poren.', 'Amma, kavalai padatheenga.', 'Naan thirumbi varuven, sathiyama.'];
  const VELS = [
    { id: 'v1', type: 'scene', text: 'INT. ANBU HOUSE - NIGHT' },
    { id: 'v2', type: 'character', text: 'ANBU' }, { id: 'v3', type: 'dialogue', text: VLINES[0] },
    { id: 'v4', type: 'character', text: 'AMMA' }, { id: 'v5', type: 'dialogue', text: 'Saapittiya?' },
    { id: 'v6', type: 'character', text: 'ANBU' }, { id: 'v7', type: 'dialogue', text: VLINES[1] },
    { id: 'v8', type: 'scene', text: 'EXT. BUS STAND - DAY' },
    { id: 'v9', type: 'character', text: 'ANBU' }, { id: 'v10', type: 'dialogue', text: VLINES[2] }
  ];
  const ANBU_IDS = ['v3', 'v7', 'v10'];
  await seedGen(page, { elements: VELS });
  await page.goto(BASE + '/write.html?stay=1#coverage', { waitUntil: 'networkidle' });
  await planKnown(page, true);
  const pick = page.locator('select[data-action="cv-voice-pick"]');
  const hasPick = await pick.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  ok(hasPick, 'the voice check keeps its character picker');
  if (hasPick) await pick.selectOption('ANBU');
  await page.waitForTimeout(400);
  const scope = '.cv-voice';
  const before = await scriptDoc(page);
  const opened = await openPillIn(page, scope, /voice|check/i, 'voice-check');
  ok(!!opened, 'the voice check is an AI pill ("' + opened + '")', await pillLabels(page, scope));
  ok(await deskOpen(page), 'the Desk opens on the voice check');
  ok(requests.length === 0, 'nothing was sent before Run', requests.length);
  const items = await runList(page);
  const sent = (requests[0] || {}).user || '';
  ok(requests.length === 1 && /Check the voice of ANBU/.test(sent), 'Run sent the voice check for ANBU', sent.slice(0, 80));
  ok(ANBU_IDS.every((id) => sent.includes('[' + id + ']')) && !sent.includes('Saapittiya'), "it sent ANBU's lines and nobody else's");
  ok(items.length === VLINES.length, 'one item per suggested rewrite (' + items.length + ')', items.map((x) => x.text.slice(0, 60)));
  ok(items.some((x) => x.text.includes(voiceRewrite(VLINES[0], 1))), 'an item carries the rewrite', items.map((x) => x.text.slice(0, 80)));
  ok(JSON.stringify((await scriptDoc(page)).elements) === JSON.stringify(before.elements), 'nothing reached the script before Accept');

  /* keep only the first rewrite */
  for (let i = 1; i < items.length; i++) await untick(page, i);
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1500);
  const after = await scriptDoc(page);
  const el = (doc, id) => doc.elements.find((e) => e.id === id) || {};
  const first = items.findIndex((x) => x.text.includes(voiceRewrite(VLINES[0], 1)));
  const tookId = ANBU_IDS[first >= 0 ? first : 0];
  const tookText = VLINES[first >= 0 ? first : 0];
  ok(Array.isArray(el(after, tookId).alts) && el(after, tookId).alts.includes(voiceRewrite(tookText, 1)), 'the ticked rewrite is an alternate take on its line', el(after, tookId));
  ok(el(after, tookId).text === tookText, 'and the line in use is unchanged', el(after, tookId).text);
  ok(ANBU_IDS.filter((id) => id !== tookId).every((id) => !el(after, id).alts), 'the unticked rewrites added nothing', ANBU_IDS.map((id) => el(after, id).alts));
  ok(JSON.stringify(after.elements.map((e) => [e.id, e.type, e.text])) === JSON.stringify(before.elements.map((e) => [e.id, e.type, e.text])), 'no line, cue or heading moved');

  await clickUndo(page);
  const undone = await scriptDoc(page);
  ok(!el(undone, tookId).alts || !el(undone, tookId).alts.length, 'Undo removes the take', el(undone, tookId));
  ok(JSON.stringify(undone.elements.map((e) => [e.id, e.text])) === JSON.stringify(before.elements.map((e) => [e.id, e.text])), 'and the script reads as before');
  ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
