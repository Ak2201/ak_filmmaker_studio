/* ============================================================
   PROOF: the shared beat sheet — two people, one Story page each
   ------------------------------------------------------------
   Two browser contexts, two accounts, ONE project, against the open
   build. The real cloud.js runs in both; only HTTP to the Supabase
   origin is faked (scripts/fake-supabase.mjs, plus a shared
   project_data table this file keeps in Node, and the §49 switch
   answered by `co_editing_enabled`). Realtime is a websocket and is
   NOT faked: each arrival here comes through pullProjectData(), the
   same _applyRemoteRow() merge the live handler's twin runs.

   Asserted:
     1  switch ON: each writer adds a step to a different beat; after
        the two pulls both pages and the server hold BOTH steps
     2  an arrival while a step is being typed in: the typed text is
        kept, the focus and the caret stay, and the step the other
        writer changed shows their text (the page listens to
        cloud:synced now — this holds with the switch OFF as well)
     3  both changed the synopsis: theirs is the synopsis, mine is
        offered back on the Synopsis step, and "Use this text" swaps
     4  presence: who is here and the step they are editing, named by
        this page's step number; this page says which step it is on
        (the channel is faked, as in prove:presence)
     5  switch OFF: the same two new steps — one of them is lost to the
        page that pulls last (last write wins, exactly as before)
     6  no page errors
     7  a step edit whose story row arrives BEFORE its scenes row (two
        rows, two arrivals; the scenes push held back): the other page
        keeps the new text and is never sent back the old one, the
        server holds the new text, no story push repeats — ON and OFF
     8  "Step removed" Undo after an arrival already kept that step:
        no second copy of the id, here, on the server or on the other
        page
     9  a step A added and B deleted stays deleted on both pages and
        the server, and the pushes stop (no ping-pong)
    10  B typing in a step A deleted, inside the 600ms debounce, when
        the arrival lands: the step, the typing and the caret survive

       npm run build:open && npm run prove:story-coedit
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, EXT_RPC } from './fake-supabase.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5376;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
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
const BASE = `http://localhost:${PORT}/`;

let failed = 0, passed = 0;
function ok(cond, label, extra) {
  if (cond) passed++; else failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra));
}

/* ---- the shared server ------------------------------------------ */
const PID = '5a5a5a5a-1111-4222-8333-444444444444';
const ADMIN = USERS['tok-admin'].id, AMY = USERS['tok-amy'].id;
let ROWS = new Map();          // scope -> { scope, data, updated_at, updated_by }
let COEDIT = true;
let HOLD = new Set(); const HELD = []; const PUSHES = [];   // section 7: a scope whose upserts lag
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const eqp = (url, col) => { const v = url.searchParams.get(col); return v && v.startsWith('eq.') ? v.slice(3) : null; };
async function route(r) {
  const req = r.request();
  const url = new URL(req.url());
  if (url.pathname.startsWith('/rest/v1/projects')) {
    if (req.method() === 'GET') return json(r, 200, [{ id: PID, title: 'Shared Beats', format: 'feature', owner_id: ADMIN, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' }]);
    return json(r, 201, []);
  }
  if (url.pathname.startsWith('/rest/v1/project_data')) {
    if (req.method() === 'GET') {
      if (eqp(url, 'project_id') !== PID) return json(r, 200, []);
      const sc = eqp(url, 'scope');
      return json(r, 200, [...ROWS.values()].filter((x) => !sc || x.scope === sc).map(({ scope, data, updated_at }) => ({ scope, data, updated_at })));
    }
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
    for (const row of [].concat(body || [])) {
      if (row && row.project_id === PID) PUSHES.push({ scope: row.scope, by: row.updated_by, data: row.data });
      if (row && row.project_id === PID && HOLD.has(row.scope)) { HELD.push(row); continue; }
      if (row && row.project_id === PID) ROWS.set(row.scope, { scope: row.scope, data: row.data, updated_at: row.updated_at, updated_by: row.updated_by });
    }
    return json(r, 201, []);
  }
  return handle(r);
}
EXT_RPC.co_editing_enabled = () => COEDIT;
EXT_RPC.budget_privacy = () => ({ private: false, visible: true, can_change: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
async function person(tok) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', route);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(([k, v, uid]) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem(k, v);
      localStorage.setItem('fms_studio_account_v1', uid);
      sessionStorage.setItem('__seeded', '1');
    }
    /* Presence only: the Realtime channel is faked, as prove:presence does. */
    window.__pr = { sent: [], sync: null };
    let real;
    Object.defineProperty(window, 'StudioCloud', {
      configurable: true,
      get() { return real; },
      set(v) {
        real = v;
        v.joinPresence = async (pid, onSync) => {
          window.__pr.sync = (state) => onSync(state, uid);
          return { track: (m) => window.__pr.sent.push({ ...m }), leave: () => {} };
        };
      }
    });
  }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tok + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource|ERR_/i.test(m.text())) errors.push(tok + ' console: ' + m.text()); });
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession(), null, { timeout: 15000 });
  await page.waitForFunction(() => window.StudioCloud.getGateState().state === 'open', null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(async (pid) => {
    await window.StudioCloud.pullProjectList();
    window.StudioStore.setCurrentProject(pid);
  }, PID);
  return { ctx, page };
}
const storyOn = (P) => P.page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}'));
const serverStory = () => (ROWS.get('story') || {}).data || {};
const pull = (P) => P.page.evaluate((pid) => window.StudioCloud.pullProjectData(pid), PID);
const settle = (P, ms = 1800) => P.page.waitForTimeout(ms);   // the 600ms field save + the 800ms push
/* A step's Remove is on its OPEN card (the Beat Sheet's views, 31 Oct
   2026): the caret in its text opens it, as a writer's click would. */
const removeStep = async (P, id) => {
  await P.page.focus(`#stStep_${id}`);
  await P.page.click(`[data-st="step-del"][data-step="${id}"]`);
};
const stepTexts = (s) => (s.outline || []).map((x) => x.text);
const domSteps = (P) => P.page.$$eval('textarea[data-st-field="step-text"]', (t) => t.map((x) => x.value));

const SEED = {
  v: 1, source: 'Ravi loses the shop. He fights back.', sourceName: '', framework: 'save_the_cat', frameworkChosen: true,
  marks: [], tension: {}, logline: 'A grocer fights a chain.', idea: 'A shop', conflicts: [], conflictLine: '',
  outlineLockedAt: '', genre: '', audience: '', budgetTier: '', comps: [], updatedAt: 1,
  outline: [
    { id: 'sa', beat: 'save_the_cat:catalyst', text: 'The chain opens across the road.', u: 1 },
    { id: 'sb', beat: 'save_the_cat:midpoint', text: 'Ravi wins the street over.', u: 1 }
  ]
};

async function twoWriters(coedit, { story = SEED, scenes = null } = {}) {
  F.reset();
  F.db.settings.purchase_required = false;
  F.db.members.set(AMY, { role: 'user', disabled_at: null });
  const old = new Date(Date.now() - 60000).toISOString();
  ROWS = new Map([['story', { scope: 'story', data: story, updated_at: old, updated_by: ADMIN }],
    ...(scenes ? [['scenes', { scope: 'scenes', data: scenes, updated_at: old, updated_by: ADMIN }]] : [])]);
  HOLD = new Set(); HELD.length = 0; PUSHES.length = 0;
  COEDIT = coedit;
  const A = await person('tok-admin');
  const B = await person('tok-amy');
  for (const P of [A, B]) {
    await P.page.goto(BASE + 'story.html#path-outline', { waitUntil: 'load' });
    await P.page.waitForSelector('textarea[data-st-field="step-text"]', { timeout: 15000 });
    await P.page.waitForTimeout(800);   // boot: attach, pull
  }
  return { A, B };
}
async function addStep(P, beat, text) {
  await P.page.click(`[data-st="step-add"][data-beat="${beat}"]`);
  await P.page.waitForTimeout(150);
  await P.page.keyboard.type(text);
  await P.page.locator('h1').first().click();   // blur: the change save
}

try {
  /* ---- 1 switch ON: two new steps, both kept -------------------- */
  console.log('1  co-editing ON');
  const { A, B } = await twoWriters(true);
  ok(stepTexts(await storyOn(A)).length === 2 && stepTexts(await storyOn(B)).length === 2, '1  both pages start from the same two steps',
    [stepTexts(await storyOn(A)), stepTexts(await storyOn(B))]);
  await addStep(A, 'save_the_cat:catalyst', 'A: the landlord calls.');
  await settle(A);
  await addStep(B, 'save_the_cat:midpoint', 'B: the street holds a fair.');
  await settle(B);
  ok((await storyOn(A)).outline.every((x) => Number(x.u) > 0), '1  every step carries an edit stamp');
  await pull(A); await settle(A);          // A merges B's copy and sends the union up
  await pull(B); await settle(B, 600);
  const want = ['The chain opens across the road.', 'A: the landlord calls.', 'Ravi wins the street over.', 'B: the street holds a fair.'];
  ok(JSON.stringify(stepTexts(await storyOn(A))) === JSON.stringify(want), '1  writer A holds both new steps, in their beats', stepTexts(await storyOn(A)));
  ok(JSON.stringify(stepTexts(await storyOn(B))) === JSON.stringify(want), '1  writer B holds both new steps', stepTexts(await storyOn(B)));
  ok(JSON.stringify(stepTexts(serverStory())) === JSON.stringify(want), '1  and so does the server', stepTexts(serverStory()));
  ok(JSON.stringify(await domSteps(B)) === JSON.stringify(want), '1  B\'s page redrew with them, without a reload', await domSteps(B));

  /* ---- 2 an arrival while typing --------------------------------- */
  console.log('2  an arrival under a field being typed in');
  const firstStep = 'textarea[data-step="sa"]';
  await B.page.focus('textarea[data-step="sb"]');
  await B.page.keyboard.press('End');
  await B.page.keyboard.type(' (B edits)');
  await B.page.locator('h1').first().click();
  await settle(B);
  await A.page.focus(firstStep);
  await A.page.keyboard.press('End');
  await A.page.keyboard.type(' Ravi refuses');   // still on its debounce when the pull lands
  await pull(A);
  await A.page.waitForTimeout(300);
  const st2 = await A.page.evaluate((sel) => {
    const el = document.activeElement;
    return { focused: !!el && el.matches(sel), caret: el && el.selectionStart, len: el && el.value.length, value: el && el.value,
      other: (document.querySelector('textarea[data-step="sb"]') || {}).value };
  }, firstStep);
  ok(st2.focused && st2.value === 'The chain opens across the road. Ravi refuses', '2  the step being typed in keeps its focus and every typed character', st2);
  ok(st2.caret === st2.len, '2  and the caret stays where it was', st2);
  ok(st2.other === 'Ravi wins the street over. (B edits)', '2  the other writer\'s step shows their text: the page redrew on arrival', st2);
  await A.page.locator('h1').first().click();
  await settle(A);
  await pull(B); await settle(B, 600);
  ok(stepTexts(await storyOn(B))[0] === 'The chain opens across the road. Ravi refuses', '2  and the typed text reaches the other writer', stepTexts(await storyOn(B)));

  /* ---- 3 both changed the synopsis -------------------------------- */
  console.log('3  both changed the synopsis');
  const editSource = async (P, text) => {
    await P.page.goto(BASE + 'story.html#path-synopsis', { waitUntil: 'load' });
    await P.page.waitForTimeout(600);
    const edit = P.page.locator('[data-st="mode"][data-mode="edit"]');
    if (await edit.count()) await edit.first().click();
    await P.page.waitForSelector('#stSource');
    await P.page.fill('#stSource', text);
    await P.page.locator('h1').first().click();
    await settle(P);
  };
  await editSource(A, 'Ravi loses the shop, and wins it back.');
  await editSource(B, 'Ravi loses the shop to a chain.');
  await pull(A); await A.page.waitForTimeout(500);
  const s3 = await storyOn(A);
  ok(s3.source === 'Ravi loses the shop to a chain.', '3  the arriving synopsis is the synopsis', s3.source);
  ok((s3.sourceConflicts || []).some((c) => c.text === 'Ravi loses the shop, and wins it back.'), '3  and the one written here is kept, word for word', s3.sourceConflicts);
  const kept = await A.page.$$eval('.st-kept-text', (n) => n.map((x) => x.textContent));
  ok(kept.includes('Ravi loses the shop, and wins it back.'), '3  the Synopsis step offers it back', kept);
  await settle(A);
  await pull(B);
  await B.page.goto(BASE + 'story.html#path-synopsis', { waitUntil: 'load' });
  await B.page.waitForTimeout(600);
  const wording = await B.page.$eval('.st-kept .st-muted', (n) => n.textContent).catch(() => '');
  ok(wording && !/theirs|yours|mine/i.test(wording), '3  the writer whose text won is not told "theirs is the synopsis now"', wording);
  await A.page.click('[data-st-kept="use"]');
  await A.page.waitForTimeout(300);
  const s3b = await storyOn(A);
  ok(s3b.source === 'Ravi loses the shop, and wins it back.' && (s3b.sourceConflicts || []).some((c) => c.text === 'Ravi loses the shop to a chain.'),
    '3  "Use this text" makes it the synopsis and keeps the one it replaced', [s3b.source, s3b.sourceConflicts]);

  /* ---- 4 presence ------------------------------------------------- */
  console.log('4  presence');
  await A.page.goto(BASE + 'story.html#path-outline', { waitUntil: 'load' });
  await A.page.waitForFunction(() => window.__pr && window.__pr.sync, null, { timeout: 8000 }).catch(() => {});
  ok(await A.page.evaluate(() => !!(window.__pr && window.__pr.sync)), '4  signed in with co-editing on, the page joins the project\'s channel');
  await A.page.evaluate(([me, amy]) => window.__pr.sync({
    [me]: [{ name: 'admin', page: 'story', step: '', at: 1 }],
    [amy]: [{ name: 'Amy Rao', page: 'story', step: 'sb', editing: true, at: Date.now() }],
    stranger: [{ name: 'In the script', elId: 'e1', at: 2 }]
  }), [ADMIN, AMY]);
  await A.page.waitForTimeout(150);
  const line = await A.page.$eval('#stPeers', (n) => ({ hidden: n.hidden, text: n.textContent })).catch(() => null);
  const nB = await A.page.$eval('[data-step-row="sb"] .st-ol-n', (n) => n.textContent).catch(() => '');
  ok(line && !line.hidden && line.text === 'Also here: Amy Rao (editing step ' + nB.replace(/\D+/g, '') + ').', '4  "Also here", with the step they are editing by this page\'s number', { line, nB });
  ok(await A.page.$eval('[data-step-row="sb"]', (r) => r.classList.contains('st-peer-row') && r.dataset.peer === 'Amy Rao'), '4  their step is marked with their name');
  const mark = await A.page.$eval('[data-step-row="sb"] .st-ol-n', (n) => getComputedStyle(n, '::after').content);
  ok(mark === '" · Amy Rao"', '4  and the step number reads "Step N · Amy Rao", never a bare " · "', mark);
  await A.page.focus(firstStep);
  await A.page.keyboard.type('!');
  await A.page.waitForTimeout(2300);
  const sent = await A.page.evaluate(() => window.__pr.sent.slice(-1)[0] || {});
  ok(sent.page === 'story' && sent.step === 'sa' && sent.editing === true, '4  this page says it is on the Story page, which step, and typing', sent);
  ok(!JSON.stringify(await A.page.evaluate(() => window.__pr.sent)).includes('Ravi'), '4  never the words');
  await A.page.locator('h1').first().click();
  await A.ctx.close(); await B.ctx.close();

  /* ---- 5 switch OFF: last write wins, as before ------------------- */
  console.log('5  co-editing OFF');
  {
    const { A, B } = await twoWriters(false);
    ok(!(await A.page.evaluate(() => window.__pr.sync)), '5  switch off: presence does not join');
    await addStep(A, 'save_the_cat:catalyst', 'A: the landlord calls.');
    await settle(A);
    await addStep(B, 'save_the_cat:midpoint', 'B: the street holds a fair.');
    await settle(B);
    await pull(A); await settle(A);
    await pull(B); await settle(B, 600);
    const a = stepTexts(await storyOn(A)), b = stepTexts(await storyOn(B));
    const both = (x) => x.includes('A: the landlord calls.') && x.includes('B: the street holds a fair.');
    ok(!both(a) && JSON.stringify(a) === JSON.stringify(stepTexts(serverStory())), '5  one writer\'s new step is replaced by the newer copy (last write wins)', { a, b, server: stepTexts(serverStory()) });
    /* Not salvaged either: A's copy was the one A last PUSHED, which
       _isServerCopy() counts as "the server has it" although B's copy
       replaced it unseen. The existing rule, recorded here, not changed. */
    ok(!both(b) && JSON.stringify(b) === JSON.stringify(a), '5  and both pages end on that one copy', { a, b });
    await A.ctx.close(); await B.ctx.close();
  }

  /* ---- 7 the story row ahead of its scenes row ---------------------- */
  for (const on of [true, false]) {
    console.log('7  story row before scenes row, co-editing ' + (on ? 'ON' : 'OFF'));
    const T1 = 'The chain opens across the road.', T2 = T1 + ' Ravi refuses to sell.';
    const story = JSON.parse(JSON.stringify(SEED));
    Object.assign(story.outline[0], { sceneId: 'sc1', synced: T1, syncedBeat: 'save_the_cat:catalyst' });
    const scenes = { scenes: [{ id: 'sc1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'SHOP', synopsis: T1, beatId: 'save_the_cat:catalyst', eighths: 8, elements: {} }] };
    const { A, B } = await twoWriters(on, { story, scenes });
    const sc = (P) => P.page.evaluate(() => ((JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes || [])[0] || {}).synopsis);
    ok(await sc(B) === T1, '7  both pages start with the scene', await sc(B));
    HOLD = new Set(['scenes']);
    await A.page.focus('textarea[data-step="sa"]');
    await A.page.keyboard.press('End');
    await A.page.keyboard.type(' Ravi refuses to sell.');
    await A.page.locator('h1').first().click();
    await settle(A, 2500);
    ok(stepTexts(serverStory())[0] === T2 && await sc(A) === T2, '7  A\'s step and scene hold the new text; only the story row reached the server', [stepTexts(serverStory())[0], await sc(A)]);
    PUSHES.length = 0;
    const seen = [];
    for (let round = 1; round <= 3; round++) {
      await pull(B); await settle(B, 2000);
      seen.push(stepTexts(await storyOn(B))[0]);
      await pull(A); await settle(A, 2000);
    }
    ok(seen.every((t) => t === T2), '7  B keeps the new step text on every pull', seen);
    ok(await sc(B) === T2, '7  and B\'s scene catches up from the step', await sc(B));
    const storyPushes = PUSHES.filter((x) => x.scope === 'story').map((x) => x.data.outline[0].text);
    ok(!storyPushes.includes(T1), '7  nobody pushes the old text back', storyPushes);
    ok(stepTexts(serverStory())[0] === T2, '7  the server keeps the new text', stepTexts(serverStory())[0]);
    ok(storyPushes.length <= 1, '7  no story push repeats', storyPushes.length);
    HOLD = new Set();
    for (const r of HELD.splice(0)) ROWS.set(r.scope, { scope: r.scope, data: r.data, updated_at: r.updated_at, updated_by: r.updated_by });
    await pull(B); await settle(B, 1500); await pull(A); await settle(A, 1500);
    ok(stepTexts(await storyOn(A))[0] === T2 && stepTexts(await storyOn(B))[0] === T2 && await sc(B) === T2, '7  once the scenes row lands, both settle on the new text',
      [stepTexts(await storyOn(A))[0], stepTexts(await storyOn(B))[0], await sc(B)]);
    await A.ctx.close(); await B.ctx.close();
  }

  /* ---- 8 Undo a removal the merge already undid -------------------- */
  console.log('8  "Step removed" Undo after an arrival kept the step');
  {
    const { A, B } = await twoWriters(true);
    await removeStep(A, 'sb'); await settle(A);
    await B.page.focus('textarea[data-step="sb"]'); await B.page.keyboard.press('End'); await B.page.keyboard.type(' (B edits)');
    await B.page.locator('h1').first().click(); await settle(B);
    await pull(A); await settle(A);
    const count = (s) => (s.outline || []).filter((x) => x.id === 'sb').length;
    ok(count(await storyOn(A)) === 1, '8  the merge kept B\'s edited step', (await storyOn(A)).outline);
    await A.page.click('.toast-host button:has-text("UNDO")');
    await A.page.waitForTimeout(500);
    ok(count(await storyOn(A)) === 1 && await A.page.$$eval('[data-step-row="sb"]', (n) => n.length) === 1, '8  Undo adds no second copy of the step', (await storyOn(A)).outline);
    ok((await storyOn(A)).outline.find((x) => x.id === 'sb').text === 'Ravi wins the street over. (B edits)', '8  and B\'s text stands');
    await settle(A); await pull(B); await settle(B, 800);
    ok(count(serverStory()) === 1 && count(await storyOn(B)) === 1, '8  one copy on the server and on B', [count(serverStory()), count(await storyOn(B))]);
    await A.ctx.close(); await B.ctx.close();
  }

  /* ---- 9 a step deleted by the writer who did not add it ----------- */
  console.log('9  B deletes the step A added: it stays deleted, no push ping-pong');
  {
    const { A, B } = await twoWriters(true);
    await addStep(A, 'save_the_cat:catalyst', 'A adds S'); await settle(A);
    const sId = ((await storyOn(A)).outline.find((x) => x.text === 'A adds S') || {}).id;
    await pull(B); await settle(B);
    ok(stepTexts(await storyOn(B)).includes('A adds S'), '9  B received the step', stepTexts(await storyOn(B)));
    await removeStep(B, sId); await settle(B);
    PUSHES.length = 0;
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      await pull(A); await settle(A);
      await pull(B); await settle(B);
      rounds.push([stepTexts(await storyOn(A)).includes('A adds S'), stepTexts(await storyOn(B)).includes('A adds S'), stepTexts(serverStory()).includes('A adds S')]);
    }
    ok(rounds.every((r) => JSON.stringify(r) === '[false,false,false]'), '9  A drops it, B and the server agree, every round', rounds);
    ok(PUSHES.filter((x) => x.scope === 'story').length === 0, '9  and nobody pushes the story again once they agree', PUSHES.filter((x) => x.scope === 'story').length);
    ok(!(await A.page.$$eval('textarea[data-st-field="step-text"]', (t) => t.map((x) => x.value))).includes('A adds S'), '9  A\'s page no longer shows it');
    ok(!JSON.stringify(await storyOn(A)).includes('_sync') && !JSON.stringify(await storyOn(B)).includes('_sync'), '9  neither stored copy carries the sync note');
    await A.ctx.close(); await B.ctx.close();
  }

  /* ---- 10 typing on its debounce when an arrival deletes the step --- */
  console.log('10 B is typing in a step A deleted, inside the 600ms debounce');
  {
    const { A, B } = await twoWriters(true);
    await removeStep(A, 'sb'); await settle(A);
    await B.page.focus('textarea[data-step="sb"]'); await B.page.keyboard.press('Control+End'); await B.page.keyboard.type(' typing');
    await pull(B);                               // inside the debounce
    await B.page.waitForTimeout(200);
    await B.page.keyboard.type('!');
    await B.page.waitForTimeout(300);
    const act = await B.page.evaluate(() => { const el = document.activeElement; return [el.tagName, el.getAttribute('data-step'), el.value]; });
    ok(JSON.stringify(act) === JSON.stringify(['TEXTAREA', 'sb', 'Ravi wins the street over. typing!']), '10 the field stays under the caret, with every keystroke', act);
    await B.page.locator('h1').first().click(); await settle(B);
    ok(stepTexts(await storyOn(B)).includes('Ravi wins the street over. typing!'), '10 B keeps the step with its typing', stepTexts(await storyOn(B)));
    ok(stepTexts(serverStory()).includes('Ravi wins the street over. typing!'), '10 and the server has it', stepTexts(serverStory()));
    await A.ctx.close(); await B.ctx.close();
  }

  ok(errors.length === 0, '6  no page errors', errors);
} finally {
  await browser.close();
  server.close();
}
console.log(`\nprove:story-coedit: ${passed} passed, ${failed} failed`);
console.log('(Realtime was not exercised: arrivals came through pullProjectData(). Schema §49 is checked by test:schema.)');
process.exit(failed ? 1 : 0);
