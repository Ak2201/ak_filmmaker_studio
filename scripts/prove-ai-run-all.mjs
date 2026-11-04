/* ============================================================
   PROOF: Run all's draft space (preprod.html#drafts) — the L2 view
   over the L1 engine (ai-run-all.js, ai-drafts.js) — in a real
   Chromium against the shared Supabase fake and a FAKED Anthropic.
   No key, no network, never a real provider.

     (a) the section: ticks (Storyboard frames OFF and says it needs
         Gemini + Drive), the provider disclosure before the press,
         the Pro button, a live region
     (b) one press, shot division + blocking ticked: three cards come
         back Ready (the shot draft, then blocking per scene), and
         NOTHING reaches the studio models before an Accept
     (c) Review opens the AI Desk on the stored draft (v1, ticks) with
         no request sent; Skip closes it and nothing is written
     (d) Accept all on a BLOCKING card accepts its shot-draft parent
         first (shots exist, the scene's floor plan is drawn on the
         REAL ids), the cards say Accepted; Undo puts fms_shots_v1
         back byte for byte and the cards back to Ready
     (e) a reload lists the drafts again; Review → Accept in the Desk
         accepts through the same path; Undo again exact
     (f) Reject marks a card rejected and writes nothing to the film
     (g) a run cut short by a reload shows Resume, and Resume finishes it
     (h) at 390px the section has no horizontal overflow
     and no localStorage write while the page sits idle.

   Run (after L1 and L2 are integrated):
         npm run build:open && PROVE_DIST=dist npm run prove:ai-run-all
         (PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5386;
const BASE = 'http://localhost:' + PORT;

if (!fs.existsSync(path.join(DIST, 'preprod.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/preprod.html — run an open build first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build'); process.exit(2); }
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';

/* ---- the fake model ---------------------------------------------- */
const reqs = [];
let hold = false;
const held = [];
const text = (v) => (Array.isArray(v) ? v.map((b) => (b && b.text) || '').join('\n') : v);
const mark = (kind, label, x, y) => ({ kind, label, x, y, rot: 0, hasMove: false, toX: 0, toY: 0, path: [], curve: false, charId: '' });
function answer(system, user) {
  if (/blocking a scene/i.test(system)) {
    const ids = [...user.matchAll(/id (\S+) —/g)].map((m) => m[1]);
    return {
      floor: { name: 'The room', note: 'Staged along the window.', widthM: 6, set: [], axis: { on: false, x1: 0, y1: 0, x2: 0, y2: 0 } },
      actors: [],
      shots: ids.map((id, i) => ({ shotId: id, number: String(i + 1), note: 'Shot ' + (i + 1), marks: [mark('camera', 'Cam A', 0.5, 0.8)] }))
    };
  }
  const ids = [...user.matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
  return {
    scenes: ids.map((id) => ({
      sceneId: id,
      shots: [
        { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: '', setup: '', description: 'The room of ' + id + '.' },
        { size: 'CU', angle: 'eye level', movement: 'static', lens: '', rig: '', setup: '', description: 'A detail of ' + id + '.' }
      ]
    }))
  };
}
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const system = text(body.system || '');
  const user = text(body.messages ? body.messages[0].content : '');
  reqs.push({ system, user, key: req.headers()['x-api-key'] || '', url: req.url() });
  if (hold) await new Promise((res) => held.push(res));
  try { await r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(answer(system, user)) }); }
  catch (e) { /* the page went away */ }
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const tok = aiScenario('pro', 'tok-amy');

async function context(width = 1280) {
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
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload|ERR_FAILED|aborted/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { d.accept().catch(() => {}); return; }
    errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {});
  });
  return { ctx, page, errors };
}
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(80); }
}
const SCENES = [1, 2].map((n) => ({ id: 'sc' + n, number: String(n), intExt: 'INT', dayNight: 'DAY', location: 'HOUSE ' + n, synopsis: 'Scene ' + n, eighths: 8 }));
async function seed(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ scenes, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Run All Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    const elements = scenes.flatMap((sc, i) => [
      { id: 'h' + i, type: 'scene', text: sc.intExt + '. ' + sc.location + ' - ' + sc.dayNight },
      { id: 'a' + i, type: 'action', text: 'Something happens in scene ' + sc.number + '.' }
    ]);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements, revisions: [], documents: [] }));
    S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key);
  }, { scenes: SCENES, key: KEY });
}
const shotsBlob = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x === 'fms_shots_v1' || x.startsWith('fms_shots_v1__'));
  return k ? localStorage.getItem(k) : null;
});
const MODEL_KEYS = ['fms_shots_v1', 'fms_scenes_v1', 'fms_script_v1', 'fms_story_v1', 'fms_characters_v1', 'fms_locations_v1', 'fms_contacts_v1'];
const modelWrites = (page) => page.evaluate((keys) => window.__writes.filter((w) => keys.some((k) => w.k === k || w.k.startsWith(k + '__'))).length, MODEL_KEYS);
const cards = (page) => page.$$eval('#drafts .ds-run:first-of-type .ds-card', (ls) => ls.map((l) => ({ key: l.dataset.dsKey, status: l.dataset.dsStatus })));
const statusOf = async (page, key) => ((await cards(page)).find((c) => c.key === key) || {}).status;
async function openDrafts(page) {
  /* the same URL with the same hash is a fragment jump, not a load */
  if (/\/preprod(\.html)?#drafts$/.test(page.url())) await page.reload({ waitUntil: 'networkidle' });
  else await page.goto(BASE + '/preprod.html#drafts', { waitUntil: 'networkidle' });
  for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForSelector('#drafts .ds-ticks, #drafts .ds-locked', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function onlyTick(page, ids) {
  const all = await page.$$eval('#drafts input[data-ds-tick]', (xs) => xs.map((x) => x.dataset.dsTick));
  for (const id of all) {
    const box = page.locator('#drafts input[data-ds-tick="' + id + '"]');
    if ((await box.isChecked()) !== ids.includes(id)) await box.click();
  }
}
const clickToastUndo = async (page) => {
  const undo = page.locator('.toast .toast-action', { hasText: /Undo/ }).last();
  const has = await undo.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (has) await undo.click();
  await page.waitForTimeout(1200);
  return has;
};

try {
  F.reset();
  aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context(1280);
  await seed(page);
  await openDrafts(page);

  console.log('(a) the section');
  const ui = await page.evaluate(() => {
    const d = document.getElementById('drafts');
    const frames = d && d.querySelector('input[data-ds-tick="board-frames"]');
    const go = d && d.querySelector('[data-action="ds-start"]');
    return {
      has: !!d, frames: frames ? frames.checked : null,
      framesHint: frames ? frames.closest('label').textContent : '',
      others: d ? [...d.querySelectorAll('input[data-ds-tick]')].filter((x) => x.dataset.dsTick !== 'board-frames').every((x) => x.checked) : false,
      disclose: (d && d.querySelector('.ds-disclose') || {}).textContent || '',
      go: go ? go.textContent.trim() : '', live: !!(d && d.querySelector('[role="status"][aria-live="polite"]'))
    };
  });
  ok(ui.has, 'preprod.html has section#drafts');
  ok(ui.frames === false && /Gemini/.test(ui.framesHint) && /Drive/.test(ui.framesHint), 'Storyboard frames is OFF and says it needs Gemini + Drive', ui);
  ok(ui.others, 'every other tool is ticked by default');
  ok(/Anthropic|Claude/i.test(ui.disclose) && /request/.test(ui.disclose) && /key/.test(ui.disclose), 'the disclosure names the provider, the requests and the key', ui.disclose);
  ok(/Break down everything/.test(ui.go), 'the Break down everything button is there', ui.go);
  ok(ui.live, 'a polite live region');
  ok(reqs.length === 0, 'nothing was sent on load', reqs.length);

  console.log('(b) one press');
  await onlyTick(page, ['shot-draft', 'blocking-draft']);
  const w0 = await modelWrites(page);
  const shots0 = await shotsBlob(page);
  await page.click('#drafts [data-action="ds-start"]');
  const done = await waitFor(async () => {
    const c = await cards(page);
    return c.length >= 3 && c.every((x) => ['ready', 'skipped', 'failed'].includes(x.status));
  }, 20000);
  const c1 = await cards(page);
  ok(done, 'the cards settle', c1);
  ok(c1.some((c) => c.key === 'shot-draft' && c.status === 'ready'), 'Shot division is ready', c1);
  ok(['blocking-draft:sc1', 'blocking-draft:sc2'].every((k) => c1.some((c) => c.key === k && c.status === 'ready')), 'Blocking is ready per scene', c1);
  ok(reqs.length >= 3 && reqs.every((r) => r.key === KEY && !/key=/.test(r.url)), 'the requests went out with the key as a header', reqs.length);
  ok(await modelWrites(page) === w0, 'NOTHING was written to the studio models before an Accept', await modelWrites(page) - w0);
  const facts = await page.$eval('#drafts [data-ds-key="shot-draft"] .ds-facts', (e) => e.textContent).catch(() => '');
  ok(/items?/.test(facts) && /s\b/.test(facts), 'a card says its time and item count', facts);

  console.log('(c) Review opens the Desk on the stored draft');
  const n0 = reqs.length;
  await page.click('#drafts [data-ds-key="shot-draft"] [data-action="ds-review"]');
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.querySelectorAll('.ai-desk-item input').length > 0; }, null, { timeout: 8000 }).catch(() => {});
  const desk = await page.evaluate(() => {
    const d = document.querySelector('aside.ai-desk');
    return d ? { items: d.querySelectorAll('.ai-desk-item input[type=checkbox]').length, ver: (d.querySelector('.ai-desk-ver[aria-pressed="true"]') || {}).textContent || '',
      accept: !!d.querySelector('[data-action="ai-desk-accept"]'), title: (d.querySelector('.ai-desk-title') || {}).textContent || '' } : null;
  });
  ok(desk && desk.items === 4 && desk.ver === 'v1' && desk.accept, 'the Desk shows the draft as v1 with its four shots ticked', desk);
  ok(reqs.length === n0, 'opening the review sent nothing', reqs.length - n0);
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
  await page.waitForTimeout(400);
  ok(await modelWrites(page) === w0, 'Skip wrote nothing');
  /* The press repaints every card, so the Desk's saved opener is gone by
     the time it closes: focus must land on the REPLACEMENT Review, never
     <body> (QA r5 K). */
  const backTo = await page.evaluate(() => { const a = document.activeElement; const c = a && a.closest('[data-ds-key]'); return { tag: a && a.tagName, action: a && a.dataset.action, key: c && c.dataset.dsKey }; });
  ok(backTo.action === 'ds-review' && backTo.key === 'shot-draft', 'closing the Desk returns focus to the card\'s Review, not <body>', backTo);

  console.log('(d) Accept all on a blocking card accepts the shots first');
  await page.click('#drafts [data-ds-key="blocking-draft:sc1"] [data-action="ds-accept"]');
  await waitFor(async () => (await statusOf(page, 'blocking-draft:sc1')) === 'accepted', 8000);
  const after = JSON.parse((await shotsBlob(page)) || '{}');
  const list = Array.isArray(after) ? after : (after.shots || []);
  const blocks = after.blocks || after.blocking || [];
  ok((await statusOf(page, 'blocking-draft:sc1')) === 'accepted' && (await statusOf(page, 'shot-draft')) === 'accepted', 'the blocking card and its shot-draft parent are both Accepted', await cards(page));
  ok(list.length === 4, 'the four drafted shots were written', list.length);
  const realIds = new Set(list.map((s) => s.id));
  const json = JSON.stringify(after);
  ok(!/draft:\d/.test(json), 'no temporary draft:<n> id reached the film');
  ok(JSON.stringify(blocks).length > 2 || [...realIds].some((id) => json.split(id).length > 2), 'the blocking was drawn on the real shot ids', Object.keys(after));
  ok(await clickToastUndo(page), 'the toast offers Undo');
  const back = await shotsBlob(page);
  ok(back === shots0 || (shots0 == null && (JSON.parse(back || '{}').shots || []).length === 0), 'Undo puts fms_shots_v1 back exactly', { before: shots0, after: back && back.slice(0, 200) });
  await waitFor(async () => (await statusOf(page, 'shot-draft')) === 'ready', 5000);
  ok((await statusOf(page, 'shot-draft')) === 'ready' && (await statusOf(page, 'blocking-draft:sc1')) === 'ready', 'after Undo both drafts are Ready again', await cards(page));

  console.log('(e) reload, then Review → Accept in the Desk');
  await openDrafts(page);
  const c2 = await cards(page);
  ok(c2.filter((c) => c.status === 'ready').length === 3, 'a reload lists the three ready drafts again', c2);
  const shots1 = await shotsBlob(page);
  await page.click('#drafts [data-ds-key="blocking-draft:sc2"] [data-action="ds-review"]');
  await page.waitForSelector('aside.ai-desk:not([hidden]) [data-action="ai-desk-accept-all"]', { timeout: 8000 }).catch(() => {});
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await waitFor(async () => (await statusOf(page, 'blocking-draft:sc2')) === 'accepted', 8000);
  const c3 = await cards(page);
  ok(c3.find((c) => c.key === 'blocking-draft:sc2').status === 'accepted' && c3.find((c) => c.key === 'shot-draft').status === 'accepted', 'the Desk Accept went through acceptDraft: parent and card Accepted', c3);
  const mid = JSON.parse((await shotsBlob(page)) || '{}');
  ok((Array.isArray(mid) ? mid : mid.shots || []).length === 4, 'the shots were written by the Desk Accept');
  ok(await clickToastUndo(page), 'the Desk offers Undo');
  ok((await shotsBlob(page)) === shots1, 'that Undo is exact as well');

  console.log('(f) Reject');
  const w1 = await modelWrites(page);
  await page.click('#drafts [data-ds-key="blocking-draft:sc1"] [data-action="ds-reject"]');
  await waitFor(async () => (await statusOf(page, 'blocking-draft:sc1')) === 'rejected', 5000);
  ok((await statusOf(page, 'blocking-draft:sc1')) === 'rejected', 'the card says Rejected');
  ok(await modelWrites(page) === w1, 'Reject wrote nothing to the film');
  const afterReject = await page.evaluate(() => { const a = document.activeElement; const c = a && a.closest('[data-ds-key]'); return { tag: a && a.tagName, key: c && c.dataset.dsKey }; });
  ok(afterReject.key === 'blocking-draft:sc1', 'after Reject focus stays on that card, not <body>', afterReject);

  console.log('idle');
  const idle0 = await page.evaluate(() => window.__writes.length);
  await page.waitForTimeout(4000);
  ok(await page.evaluate(() => window.__writes.length) === idle0, 'zero localStorage writes in four idle seconds');

  console.log('(g) an interrupted run shows Resume');
  hold = true;
  await onlyTick(page, ['shot-draft']);
  await page.click('#drafts [data-action="ds-start"]');
  await waitFor(() => held.length > 0, 8000);
  await openDrafts(page);            // the tab "closed" mid-run
  held.splice(0).forEach((f) => f());
  hold = false;
  const resume = page.locator('#drafts .ds-run').first().locator('[data-action="ds-resume"]');
  ok(await resume.isVisible().catch(() => false), 'the cut-short run shows Resume', await cards(page));
  if (await resume.isVisible().catch(() => false)) {
    await resume.click();
    await waitFor(async () => (await statusOf(page, 'shot-draft')) === 'ready', 15000);
    ok((await statusOf(page, 'shot-draft')) === 'ready', 'Resume finished it', await cards(page));
  }

  console.log('(i) a stored picture is drawn again after a reload');
  await page.evaluate(async () => {
    const pid = window.StudioStore.currentProjectId();
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const blob = new Blob([png], { type: 'image/png' });
    const db = await new Promise((res, rej) => { const r = indexedDB.open('fms-ai-drafts', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const t = db.transaction('drafts', 'readwrite');
      t.objectStore('drafts').put({ projectId: pid, runId: 'run_zzproofpic', key: 'board-frames', taskId: 'board-frames', label: 'Storyboard frames',
        ctx: {}, wave: 2, parents: [], status: 'ready', order: 0, createdAt: new Date(Date.now() + 60000).toISOString(), endedAt: new Date().toISOString(), ms: 10,
        result: { items: [{ id: 'sc1-x', shotId: 'sc1-x', label: '1.1', blob, image: 'blob:' + location.origin + '/dead-0000', alt: 'Shot 1.1', text: 'Shot 1.1 · Pencil' }] }, error: null, model: 'img' });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    db.close();
  });
  await openDrafts(page);
  await page.click('#drafts [data-ds-run="run_zzproofpic"] [data-ds-key="board-frames"] [data-action="ds-review"]');
  await page.waitForSelector('aside.ai-desk:not([hidden]) img.ai-desk-pic', { timeout: 8000 }).catch(() => {});
  const pic = await page.evaluate(async () => {
    const img = document.querySelector('aside.ai-desk img.ai-desk-pic');
    if (!img) return null;
    if (!img.complete) await new Promise((r) => { img.onload = img.onerror = r; });
    return { src: img.src, w: img.naturalWidth };
  });
  ok(pic && /^blob:/.test(pic.src) && !/dead-0000/.test(pic.src) && pic.w > 0, 'Review after a reload draws the stored picture from its Blob (a fresh object URL)', pic);
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]').catch(() => {});
  await page.waitForTimeout(300);

  console.log('(j) a lapsed plan keeps its drafts, but cannot apply them');
  aiScenario('no-ai', 'tok-amy');
  await openDrafts(page);
  const locked = await page.evaluate(() => {
    const ready = [...document.querySelectorAll('#drafts .ds-card[data-ds-status="ready"]')];
    return { ready: ready.length, accept: ready.filter((c) => c.querySelector('[data-action="ds-accept"],[data-action="ds-review"]')).length,
      reject: ready.filter((c) => c.querySelector('[data-action="ds-reject"]')).length, notice: !!document.querySelector('#drafts .ds-locked') };
  });
  ok(locked.notice && locked.ready > 0 && locked.accept === 0 && locked.reject === locked.ready, 'locked: no Review or Accept all on a ready card, Reject stays', locked);
  aiScenario('pro', 'tok-amy');
  await openDrafts(page);

  console.log('(h) 390px');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const ov = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sec: (() => { const d = document.getElementById('drafts'); return d ? d.scrollWidth - d.clientWidth : -1; })() }));
  ok(ov.doc <= 0 && ov.sec <= 0, 'no horizontal overflow at 390px', ov);

  ok(!errors.length, 'no page errors', errors);
  await ctx.close();
} catch (e) {
  fail++;
  console.log('  ✗ the proof threw: ' + (e && e.stack || e));
}

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
