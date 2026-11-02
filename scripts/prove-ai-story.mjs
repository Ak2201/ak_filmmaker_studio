/* ============================================================
   PROOF: the story lane's two AI tasks (docs/AI-EVERYWHERE.md 9, 10)
   — character-arcs (story.html, Characters & world) and script-cleanup
   (screenplay.html, the AI menu) — in a real Chromium against the shared
   Supabase fake (aiScenario()) and a FAKED Anthropic (no key, no network).

     (a) LOCKED: signed out, each pill is on its page, greyed and
         aria-disabled; a click asks the Pro question, the Desk never opens
     (b) PRO + KEY, per task: the pill opens the Desk; the input shows what
         would be sent (and nothing private); nothing is sent before Run and
         nothing written before Accept; three idle seconds write nothing;
         Accept writes exactly what the spec allows and leaves a typed value
         alone; Undo restores only what was written
     (c) script-cleanup refuses a rewording reply, and a page with no
         selection

   Run:  VITE_SITE_GATE=off npx vite build --outDir dist-p3-2
         PROVE_DIST=dist-p3-2 PROVE_PORT=6013 node scripts/prove-ai-story.mjs
         (PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 6013;
const BASE = 'http://localhost:' + PORT;
if (!fs.existsSync(path.join(DIST, 'story.html'))) { console.error('no story.html in ' + DIST + ': build first'); process.exit(2); }
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('this proof needs the OPEN build (VITE_SITE_GATE=off)'); process.exit(2); }
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
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
const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';

/* ---- the seeded film ------------------------------------------- */
const PRIVATE = ['9876501234', 'owner@example.com'];
const CHARS = [
  { id: 'ch1', name: 'MEENA', want: 'To leave', contactId: 'c1' },
  { id: 'ch2', name: 'RAVI', arc: 'typed arc' },
  { id: 'ch3', name: 'KIRAN', arc: 'a', arcStart: 'b', arcEnd: 'c' }          // nothing empty: never sent
];
const BLUEPRINT = { s4_name: 'Anbu, 30', s4_want: 'Money', s4_need: 'Home', s4_arc: '' };
const CONTACTS = { contacts: [{ id: 'c1', name: 'Priya Actor', phone: PRIVATE[0], email: PRIVATE[1] }], callSheets: [] };
const SCENES = [
  { id: 's1', number: '1', intExt: 'INT', location: 'House', dayNight: 'DAY', eighths: 8, synopsis: 'Anbu counts coins.', elements: { cast: ['Anbu'] } },
  { id: 's2', number: '2', intExt: 'EXT', location: 'Street', dayNight: 'NIGHT', eighths: 4, synopsis: 'Meena waits for Anbu.', elements: { cast: ['Meena'] } }
];
const MESSY = 'ANBU: Hello there.\nMEENA: Hi.';
const SCRIPT = { elements: [
  { id: 'e0', type: 'action', text: 'SECRET EARLY LINE' },
  { id: 'e1', type: 'scene', text: 'INT. HOUSE - DAY' },
  { id: 'e2', type: 'action', text: 'Anbu enters.' },
  { id: 'e3', type: 'action', text: MESSY },
  { id: 'e4', type: 'action', text: 'SECRET LATER LINE' }
], revisions: [], documents: [] };

/* ---- the fake model: which task is asking is the system prompt --- */
const requests = [];
let reword = false;
const factsOf = (user) => { const m = /\(JSON\):\n(\{.*\})/.exec(user); return m ? JSON.parse(m[1]) : {}; };
function answer(system, user) {
  if (/story editor helping a filmmaker describe how each character changes/.test(system)) {
    return { arcs: [
      { characterId: 'bp:protagonist', arc: 'Learns to stay put.', arcStart: 'Alone and broke.', arcEnd: 'At home.' },
      { characterId: 'ch1', arc: 'Finds her voice.', arcStart: 'Quiet.', arcEnd: 'Speaks first.' },
      { characterId: 'ch2', arc: 'WOULD OVERWRITE', arcStart: 'Careless.', arcEnd: 'Careful.' },
      { characterId: 'ghost', arc: 'x', arcStart: 'x', arcEnd: 'x' }
    ] };
  }
  if (/screenplay formatter/.test(system)) {
    if (reword) return { elements: [{ type: 'character', text: 'ANBU' }, { type: 'dialogue', text: 'Hello, my friend.' }] };
    return { elements: [
      { type: 'character', text: 'ANBU' }, { type: 'dialogue', text: 'Hello there.' },
      { type: 'character', text: 'MEENA' }, { type: 'dialogue', text: 'Hi.' }
    ] };
  }
  return {};
}
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const user = body.messages ? body.messages[0].content : '';
  const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
  requests.push({ url: req.url(), user, system, key: req.headers()['x-api-key'] || '' });
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(answer(system, user)) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function context({ tok = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
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
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {}); });
  return { ctx, page, errors };
}

async function seed(page, { key = false } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ chars, bp, contacts, scenes, script, key, KEY }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Story Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_characters_v1', JSON.stringify(chars));
    localStorage.setItem('fms_filmmaker_combined_v1', JSON.stringify(bp));
    localStorage.setItem('fms_contacts_v1', JSON.stringify(contacts));
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    localStorage.setItem('fms_script_v1', JSON.stringify(script));
    if (key) { S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', KEY); }
  }, { chars: CHARS, bp: BLUEPRINT, contacts: CONTACTS, scenes: SCENES, script: SCRIPT, key, KEY });
}
const read = (page, key) => page.evaluate((k) => { const x = Object.keys(localStorage).find((n) => n === k || n.startsWith(k + '__')); return x ? JSON.parse(localStorage.getItem(x)) : null; }, key);
const scenesNow = async (page) => (await read(page, 'fms_scenes_v1')).scenes;
const dayOfNow = async (page, id) => (await scenesNow(page)).find((s) => s.id === id).shootDay || 0;
const planKnown = async (page) => { for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100); await page.waitForTimeout(900); };
const deskOpen = (page) => page.evaluate(() => { const d = document.querySelector('aside.ai-desk'); return !!d && !d.hidden && d.getBoundingClientRect().width > 0; });
const deskInput = (page) => page.locator('aside.ai-desk .ai-desk-input').inputValue().catch(() => '');
const deskText = (page) => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');

async function openDesk(page, selector, taskId) {
  const p = page.locator(selector).first();
  await p.waitFor({ state: 'attached', timeout: 15000 });
  await p.scrollIntoViewIfNeeded().catch(() => {});
  await p.click();
  const item = page.locator(`[data-action="ai-pill-task"][data-task="${taskId}"]`).first();
  try { await item.waitFor({ state: 'visible', timeout: 1200 }); await item.click(); } catch (e) { /* a one-task pill opened the Desk itself */ }
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function run(page) {
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-answer, aside.ai-desk .ai-error', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}
const untick = (page, id) => page.locator(`aside.ai-desk input[data-tick="item"][data-id="${id}"]`).uncheck();
async function undo(page) {
  const u = page.locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await u.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  ok(has, 'an Undo toast is offered');
  if (has) await u.click();
  await page.waitForTimeout(500);
}
async function idleWrites(page, label) {
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.__writes.length);
  await page.waitForTimeout(3000);
  const w = await page.evaluate((n) => window.__writes.slice(n).map((x) => x.k), n);
  ok(w.length === 0, label + ': three idle seconds with the Desk open write nothing', w);
}


const PAGES = [
  ['character-arcs', '/story.html#path-bible', '#sb-card-characters .ai-pill'],
  ['script-cleanup', '/screenplay.html', '.sc-tools-l .ai-pill']
];

/* (a) LOCKED */
console.log('(a) locked: signed out');
{
  F.reset();
  const { ctx, page, errors } = await context({ tok: null });
  try {
    await seed(page, { key: true });
    for (const [id, url, sel] of PAGES) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const p = page.locator(sel).first();
      const there = await p.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false);
      ok(there, id + ': the pill is on ' + url);
      if (!there) continue;
      const st = await p.evaluate((el) => ({ state: el.dataset.aiState, aria: el.getAttribute('aria-disabled'), disabled: el.disabled, text: el.textContent }));
      ok(st.state === 'locked' && st.aria === 'true' && !st.disabled && /Pro/.test(st.text), id + ': locked, aria-disabled, says Pro', st);
      await p.scrollIntoViewIfNeeded().catch(() => {});
      await p.click({ force: true });
      const shown = await page.locator('.dlg').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      ok(shown && /AI tools come with Pro/.test(await page.locator('.dlg').textContent()), id + ': a click asks the Pro question');
      ok(!(await deskOpen(page)), id + ': the Desk did not open');
      await page.locator('.dlg button', { hasText: 'Not now' }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    ok(requests.length === 0, 'nothing was sent while locked', requests.length);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'locked scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* (b) PRO + KEY */
async function pro(label, fn, opts = {}) {
  console.log(label);
  F.reset();
  requests.length = 0;
  reword = !!opts.reword;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try { await seed(page, { key: true }); await fn(page); ok(errors.length === 0, 'no page errors', errors); }
  catch (e) { ok(false, 'scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}
const noPrivate = (what) => ok(requests.every((r) => PRIVATE.every((x) => !r.user.includes(x)) && !/Priya/.test(r.user)), what + ': nothing private left the browser', requests.map((r) => r.user.slice(0, 80)));
const header = () => ok(requests.length > 0 && requests.every((r) => r.key === KEY && !r.url.includes(KEY)), 'the key went in a header, never in the URL');
const chars = async (page) => (await read(page, 'fms_characters_v1')) || [];
const charOf = async (page, id) => (await chars(page)).find((c) => c.id === id) || {};
const bp = async (page) => (await read(page, 'fms_filmmaker_combined_v1')) || {};
const typeIn = async (page, id, field, text) => {
  await page.evaluate((i) => { const d = document.querySelector(`details.sb-char[data-ch="${i}"]`); if (d) d.open = true; }, id);
  await page.locator(`details.sb-char[data-ch="${id}"] [data-ch-field="${field}"]`).fill(text);
  await page.locator(`details.sb-char[data-ch="${id}"] [data-ch-field="${field}"]`).blur();
  await page.waitForTimeout(900);
};

await pro('(b1) character-arcs', async (page) => {
  await page.goto(BASE + '/story.html#path-bible', { waitUntil: 'networkidle' });
  await planKnown(page);
  const beforeChars = JSON.stringify(await chars(page));
  const beforeBp = JSON.stringify(await bp(page));
  await openDesk(page, '#sb-card-characters .ai-pill', 'character-arcs');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const input = await deskInput(page);
  const f = factsOf(input);
  ok(JSON.stringify((f.characters || []).map((c) => c.characterId)) === '["bp:protagonist","ch1","ch2"]', 'the input shows the blueprint protagonist, Meena and Ravi, not Kiran (nothing empty)', (f.characters || []).map((c) => c.characterId));
  ok(JSON.stringify((f.characters || []).find((c) => c.characterId === 'ch2').empty) === '["arcStart","arcEnd"]', 'Ravi: only his empty fields are listed');
  ok(f.scenes && f.scenes.length === 2 && /Anbu counts coins/.test(input), 'the scenes the writer wrote are shown');
  ok(PRIVATE.every((x) => !input.includes(x)) && !/Priya/.test(input), 'nothing from contacts is shown');
  ok(requests.length === 0, 'nothing was sent before Run');
  await run(page);
  header();
  ok(requests.length === 1 && requests[0].user.trim() === input.trim(), 'what was sent is what the Desk showed');
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => ({ id: x.querySelector('input').dataset.id, t: x.textContent })));
  ok(items.map((i) => i.id).join() === 'cbp:protagonist,cch1,cch2', 'one item per character; the id the model made up is dropped', items.map((i) => i.id));
  ok(!/WOULD OVERWRITE/.test(items[2].t) && /Careless/.test(items[2].t), 'a field that already has text is not offered for Ravi', items[2].t);
  ok(JSON.stringify(await chars(page)) === beforeChars && JSON.stringify(await bp(page)) === beforeBp, 'nothing written before Accept');
  await idleWrites(page, 'character-arcs');
  /* the writer types Meena's start line between Run and Accept */
  await typeIn(page, 'ch1', 'arcStart', 'TYPED later');
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  const meena = await charOf(page, 'ch1');
  ok(meena.arc === 'Finds her voice.' && meena.arcEnd === 'Speaks first.', 'Meena: the empty arc and arcEnd are filled', meena);
  ok(meena.arcStart === 'TYPED later', 'Meena: the start typed meanwhile is left alone', meena.arcStart);
  const ravi = await charOf(page, 'ch2');
  ok(ravi.arc === 'typed arc' && ravi.arcStart === 'Careless.' && ravi.arcEnd === 'Careful.', 'Ravi: his typed arc is kept; the empty start and end are filled', ravi);
  const kiran = await charOf(page, 'ch3');
  ok(kiran.arc === 'a' && kiran.arcStart === 'b' && kiran.arcEnd === 'c', 'Kiran is untouched');
  const b = await bp(page);
  ok(b.s4_arc === 'Learns to stay put.' && b.s4_name === 'Anbu, 30' && b.s4_want === 'Money', 'the protagonist\'s arc went into the blueprint (s4_arc); its other answers are intact', b);
  const proto = (await chars(page)).find((c) => c.role === 'protagonist') || {};
  ok(proto.arcStart === 'Alone and broke.' && proto.arcEnd === 'At home.' && !proto.arc, 'the unbacked start and end are on a record (not stored twice: its arc stays empty)', proto);
  await typeIn(page, 'ch1', 'arc', 'I rewrote the arc');
  await undo(page);
  const m2 = await charOf(page, 'ch1');
  ok(m2.arc === 'I rewrote the arc' && !m2.arcEnd && m2.arcStart === 'TYPED later', 'Undo blanks arcEnd, keeps the arc the writer rewrote and the start they typed', m2);
  const r2 = await charOf(page, 'ch2');
  ok(r2.arc === 'typed arc' && !r2.arcStart && !r2.arcEnd, 'Undo blanks Ravi\'s start and end, keeps his typed arc', r2);
  const b2 = await bp(page);
  const p2 = (await chars(page)).find((c) => c.role === 'protagonist') || {};
  ok(!b2.s4_arc && b2.s4_name === 'Anbu, 30' && !p2.arcStart && !p2.arcEnd, 'Undo blanks the blueprint arc and the protagonist\'s fields; the name stays', { b2, p2 });
  noPrivate('character-arcs');
});

const elementsNow = async (page) => ((await read(page, 'fms_script_v1')) || {}).elements || [];
const sig = (els) => JSON.stringify(els.map((e) => [e.id, e.type, e.text]));
async function selectMessy(page) {
  await page.locator('[data-el="e3"] .wr-text').first().click();
  await page.evaluate(() => { const ta = document.querySelector('[data-el="e3"] .wr-text'); ta.focus(); ta.select(); });
  await page.waitForTimeout(300);
}

await pro('(b2) script-cleanup', async (page) => {
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = sig(await elementsNow(page));
  await selectMessy(page);
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  ok(await deskOpen(page), 'the AI menu item opens the Desk');
  const input = await deskInput(page);
  ok(input.includes('ANBU: Hello there.') && input.includes('MEENA: Hi.') && input.includes('INT. HOUSE - DAY') && input.includes('Anbu enters.'), 'the input shows the selected block and the two lines above it');
  ok(!/SECRET/.test(input), 'nothing else from the script is shown or sent');
  ok(requests.length === 0, 'nothing was sent before Run');
  await run(page);
  header();
  ok(requests.length === 1 && requests[0].user.trim() === input.trim(), 'what was sent is what the Desk showed');
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => ({ id: x.querySelector('input').dataset.id, t: x.textContent })));
  ok(items.length === 4 && items.map((i) => i.id).join() === 'e0,e1,e2,e3' && /Character/.test(items[0].t) && /Dialogue/.test(items[1].t), 'one tickable item per proposed element, with its type', items);
  ok(sig(await elementsNow(page)) === before, 'nothing written before Accept');
  await idleWrites(page, 'script-cleanup');
  await untick(page, 'e3');
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1200);
  const after = await elementsNow(page);
  ok(after.map((e) => e.id).slice(0, 3).join() === 'e0,e1,e2' && after[after.length - 1].id === 'e4' && after[0].text === 'SECRET EARLY LINE' && after[after.length - 1].text === 'SECRET LATER LINE', 'the lines outside the block are untouched, in place');
  const mid = after.slice(3, -1);
  ok(!after.some((e) => e.id === 'e3') && mid.length === 4, 'the block\'s own element is replaced by four', mid);
  ok(JSON.stringify(mid.map((e) => [e.type, e.text])) === JSON.stringify([['character', 'ANBU'], ['dialogue', 'Hello there.'], ['character', 'MEENA'], ['action', 'Hi.']]), 'types set (character, dialogue, character); the unticked line keeps its words as action', mid.map((e) => [e.type, e.text]));
  ok(await page.locator('[data-el="' + mid[0].id + '"].t-character').count() === 1, 'the page shows the new first line as a character cue');
  /* the writer edits one new line, then undoes */
  await undo(page);
  const back = await elementsNow(page);
  ok(sig(back) === before, 'Undo puts the original element back, same id, type and text', back.map((e) => [e.id, e.text]));

  /* accept again, then edit a written line: Undo leaves it */
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  ok(await deskOpen(page), 'the Desk opens again on the pasted-text menu');
});

await pro('(b3) script-cleanup undo guard', async (page) => {
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  await selectMessy(page);
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  await run(page);
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  const mid = (await elementsNow(page)).slice(3, -1);
  ok(JSON.stringify(mid.map((e) => e.type)) === '["character","dialogue","character","dialogue"]', 'accepting all gives four typed lines', mid.map((e) => e.type));
  const ta = page.locator('[data-el="' + mid[1].id + '"] .wr-text').first();
  await ta.click();
  await ta.fill('Hello there, edited.');
  await page.waitForTimeout(3500);
  await undo(page);
  const now = await elementsNow(page);
  ok(now.some((e) => e.text === 'Hello there, edited.') && !now.some((e) => e.id === 'e3'), 'a line the writer edited after Accept is left alone: the undo does not run over it', now.map((e) => e.text));
  ok(/edited since|left as it is/i.test(await page.evaluate(() => document.body.textContent)), 'and says so');
});

await pro('(c1) script-cleanup refuses a rewording reply', async (page) => {
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = sig(await elementsNow(page));
  await selectMessy(page);
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  await run(page);
  const t = await deskText(page);
  ok(/formatting, not editing/.test(t), 'the Desk says this is formatting, not editing');
  ok(await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').isDisabled(), 'there is nothing to accept (Accept is disabled)');
  ok(await page.locator('aside.ai-desk input[data-tick="item"]').count() === 0, 'and no line is offered');
  ok(sig(await elementsNow(page)) === before, 'nothing was written');
}, { reword: true });

await pro('(c2) script-cleanup with nothing selected', async (page) => {
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  ok(/Select some text in a line, or paste text/.test(await deskInput(page) + await deskText(page)), 'the task says what to do');
  await run(page);
  ok(requests.length === 0, 'and sends nothing');
});

await pro('(b4) script-cleanup offers a block just pasted', async (page) => {
  await page.goto(BASE + '/screenplay.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  await page.locator('[data-el="e4"] .wr-text').first().click();
  await page.evaluate(() => {
    const ta = document.querySelector('[data-el="e4"] .wr-text');
    ta.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', 'INT. SHOP - NIGHT\n\nANBU\nHello there.\n\nMEENA\nHi.\n');
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(1500);
  const els = await elementsNow(page);
  ok(els.length > 5, 'the multi-paragraph paste was split into lines', els.length);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await openDesk(page, '.sc-tools-l .ai-pill', 'script-cleanup');
  const input = await deskInput(page);
  ok(/INT\. SHOP - NIGHT/.test(input) && /SECRET LATER LINE/.test(input) && !/SECRET EARLY/.test(input), 'the input is the line pasted into and the lines the paste made', input.slice(0, 200));
});

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
