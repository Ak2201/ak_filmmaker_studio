/* ============================================================
   PROOF: the on-set and post Desk tasks (docs/AI-EVERYWHERE.md 5-8) —
   draft-changes, day-wrap-summary, edit-notes, cert-read — in a real
   Chromium against the shared Supabase fake and a FAKED Anthropic.
   No key, no network.

     (a) LOCKED — signed out: each page's pill is greyed
         (data-ai-state="locked", aria-disabled), a click asks the Pro
         question, the Desk never opens
     (b) PRO + KEY — each pill opens the Desk; nothing is sent before
         Run; a read shows the text ending "Changed nothing.", has a
         working Copy; nothing is written by a Run; a scene or rule the
         model names that was not sent is dropped; cert-read carries the
         DISCLAIMER and names no script text. Its points are a "Keep as
         notes" list: Accept all saves them (scene note or sticky note,
         ai-tasks.js keepNotes) and the toast's Undo puts the scene list
         and the notes board back byte for byte
     (c) edit-notes — Accept writes ONLY the empty notes, a note typed
         between Run and Accept is skipped, Undo blanks only what was
         written (and leaves a note edited since)

   Run:  npm run build:open && node scripts/prove-ai-post.mjs
         (PROVE_DIST=<open build>, PROVE_PORT, PW_CHROMIUM)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5384;
const BASE = 'http://localhost:' + PORT;
if (!fs.existsSync(path.join(DIST, 'edit.html'))) { console.error('no ' + DIST + '/edit.html: build first'); process.exit(2); }
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

/* ---- the seeded film ---------------------------------------------- */
const ELS = [
  { id: 'e1', type: 'scene', text: 'INT. ANBU HOUSE - NIGHT' },
  { id: 'e2', type: 'action', text: 'Anbu counts coins. He lights a cigarette.' },
  { id: 'e3', type: 'scene', text: 'EXT. BUS STAND - DAY' },
  { id: 'e4', type: 'action', text: 'The first bus pulls in.' }
];
const OLD = ELS.map((e) => ({ id: 'r' + e.id, liveId: e.id, type: e.type, text: e.text }));
OLD[1].text = 'Anbu counts coins.';
const SCRIPT = { elements: ELS, revisions: [{ id: 'rev1', name: 'Draft 1', number: 1, date: '2026-10-01T10:00:00.000Z', elements: OLD }], documents: [] };
const scene = (id, number, extra = {}) => ({
  id, number, intExt: 'INT', dayNight: 'DAY', location: 'HOUSE ' + number, synopsis: '', eighths: 8, elements: {}, shootDay: 1, ...extra
});
const SCENES = [
  scene('sc1', '1', { shotState: 'shot', takes: [{ n: 1, circled: true, note: '', at: '' }], floorNote: 'wind on the boom' }),
  scene('sc2', '2', { shotState: 'part' }),
  scene('sc3', '3', { synopsis: 'He lights a cigarette and smokes.' })
];

/* ---- the fake model ------------------------------------------------ */
const requests = [];
function answer(user) {
  if (/Here is what changed between two drafts/.test(user)) {
    return { summary: 'A cigarette was added and one line slowed down.', scenes: [{ heading: 'INT. ANBU HOUSE - NIGHT', change: 'Anbu now lights a cigarette.' }, { heading: 'INT. INVENTED SET - DAY', change: 'Nothing here.' }], watch: ['Tobacco warning on the cigarette.'] };
  }
  if (/Here is the shoot day/.test(user)) {
    return { summary: 'Scene 1 was shot. Scene 99 slipped.', owed: ['Scene 2 is part shot.', 'Scene 77 needs a pick-up.'], tomorrow: ['Pick up Scene 2.'] };
  }
  if (/Here is the edit log/.test(user)) {
    const ids = [...user.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    return { notes: ids.concat(['ghost']).map((id) => ({ sceneId: id, note: 'Check the cut of ' + id + '.' })) };
  }
  if (/A word search flagged/.test(user)) {
    return { read: 'Smoking flagged: see [tobacco] and [madeup].', rules: [{ ruleId: 'tobacco', why: 'Needs the anti-tobacco warning.' }, { ruleId: 'notarule', why: 'x' }], questions: ['Is the cigarette needed?'] };
  }
  return { summary: '', scenes: [], watch: [] };
}
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const user = body.messages ? body.messages[0].content : '';
  requests.push({ url: req.url(), user, key: req.headers()['x-api-key'] || '' });
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(answer(user)) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function context({ tok = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/^https:\/\/api\.anthropic\.com\//.test(u.href)
    && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), (r) => r.abort());
  await ctx.route(SB + '/**', handle);
  await ctx.route(/^https:\/\/api\.anthropic\.com\//, aiRoute);
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (a, b) { if (this === localStorage) window.__writes.push(String(a)); return set.call(this, a, b); };
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, tok ? [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { if (d.type() === 'beforeunload') d.accept().catch(() => {}); else { errors.push('native dialog: ' + d.message()); d.dismiss().catch(() => {}); } });
  return { ctx, page, errors };
}
async function seed(page, { key = false, edit = null } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ script, scenes, edit, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Post Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify(script));
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    if (edit) localStorage.setItem('fms_edit_v1', JSON.stringify(edit));
    if (key) { S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key); }
  }, { script: SCRIPT, scenes: SCENES, edit, key: key ? KEY : '' });
}
const stored = (page, key) => page.evaluate((key) => {
  const k = Object.keys(localStorage).find((x) => x === key || x.startsWith(key + '__'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
}, key);
const writesTo = (page, prefix) => page.evaluate((p) => window.__writes.filter((k) => k.startsWith(p)).length, prefix);
const planKnown = async (page, signedIn) => {
  if (signedIn) for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(900);
};
const deskOpen = (page) => page.evaluate(() => {
  const d = document.querySelector('aside.ai-desk');
  return !!d && !d.hidden && d.getBoundingClientRect().width > 0;
});
const deskText = (page) => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');
const pillOf = async (page, label) => {
  const p = page.locator('.ai-pill', { hasText: label }).first();
  await p.waitFor({ state: 'attached', timeout: 15000 });
  return p;
};
async function openPill(page, label) {
  await (await pillOf(page, label)).click();
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function runDesk(page) {
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-read, aside.ai-desk .ai-desk-item, aside.ai-desk .ai-error', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

const PAGES = [
  { url: '/drafts.html', label: 'Summarise changes', task: 'draft-changes' },
  { url: '/shoot.html?day=1', label: 'Wrap summary', task: 'day-wrap-summary' },
  { url: '/edit.html', label: 'Edit notes', task: 'edit-notes' },
  { url: '/deliverables.html#certification', label: 'Certification read', task: 'cert-read' }
];

/* (a) LOCKED */
{
  console.log('(a) locked: signed out');
  F.reset();
  const tok = aiScenario('signed-out', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    await seed(page, { key: true });
    for (const pg of PAGES) {
      await page.goto(BASE + pg.url, { waitUntil: 'networkidle' });
      await planKnown(page, false);
      const p = await pillOf(page, pg.label);
      const st = await p.evaluate((el) => ({ state: el.dataset.aiState, aria: el.getAttribute('aria-disabled'), disabled: el.disabled, text: el.textContent, vis: el.getBoundingClientRect().width > 0 }));
      ok(st.state === 'locked' && st.aria === 'true' && !st.disabled && /Pro/.test(st.text) && st.vis, pg.label + ' on ' + pg.url + ' is a locked pill', st);
      await p.click({ force: true });
      const shown = await page.locator('.dlg').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      ok(shown && /AI tools come with Pro/.test(await page.locator('.dlg').textContent()), '  a click asks the Pro question');
      ok(!(await deskOpen(page)) && requests.length === 0, '  the Desk did not open and nothing was sent');
      await page.locator('.dlg button', { hasText: 'Not now' }).click().catch(() => {});
    }
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'stopped: ' + String(e && e.message || e).split('\n')[0]); } finally { await ctx.close(); }
}

/* (b) PRO + KEY: the three reads */
const reads = [
  { ...PAGES[0], must: [/cigarette was added/i, /Anbu now lights a cigarette/], never: [/INVENTED SET/], input: /INT\. ANBU HOUSE - NIGHT/, writes: 'fms_script_v1' },
  { ...PAGES[1], must: [/Scene 1 was shot/, /Scene 2 is part shot/, /Pick up Scene 2/], never: [/Scene 99/, /Scene 77/], input: /Shoot day 1/, writes: 'fms_scenes_v1' },
  { ...PAGES[3], must: [/\[tobacco\]/, /hint, not advice/i, /Is the cigarette needed/], never: [/notarule/, /\[madeup\]/], input: /tobacco/, writes: 'fms_scenes_v1' }
];
for (const rd of reads) {
  console.log('(b) ' + rd.task);
  F.reset(); requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    await seed(page, { key: true });
    await page.goto(BASE + rd.url, { waitUntil: 'networkidle' });
    await planKnown(page, true);
    const p = await pillOf(page, rd.label);
    ok(await p.evaluate((el) => el.dataset.aiState) === 'ready', 'the pill is ready (Pro + key)');
    const w0 = await writesTo(page, rd.writes);
    await openPill(page, rd.label);
    ok(await deskOpen(page), 'the pill opens the Desk');
    const input = await page.locator('aside.ai-desk .ai-desk-input').inputValue().catch(() => '');
    ok(rd.input.test(input), 'what goes in shows the facts', input.slice(0, 200));
    if (rd.task === 'cert-read') ok(!/cigarette/i.test(input) && !/smokes/.test(input), 'no script or synopsis text is in what goes in', input.slice(0, 200));
    ok(requests.length === 0, 'nothing was sent before Run');
    await runDesk(page);
    ok(requests.length === 1 && requests[0].key === KEY && !requests[0].url.includes(KEY), 'Run sent one request, the key in a header');
    const text = await page.locator('aside.ai-desk .ai-desk-readtext').textContent().catch(() => '');
    ok(rd.must.every((r) => r.test(text)), 'the read shows the answer', text);
    ok(rd.never.every((r) => !r.test(text)), 'what the model named that was not sent is dropped', text);
    ok(/Changed nothing\.\s*$/.test(text), 'the text ends "Changed nothing."');
    if (rd.task === 'cert-read') {
      const disc = await page.evaluate(() => (document.querySelector('.dv-cert-disclaimer') || {}).textContent || '');
      ok(disc && text.includes(disc.trim()), 'the page DISCLAIMER is in the read verbatim');
    }
    const accept = await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').count();
    const kept = await page.locator('aside.ai-desk .ai-desk-item').count();
    ok(accept === 1 && kept > 0, 'a read offers its points to keep as notes (' + kept + ')', { accept, kept });
    await page.click('aside.ai-desk [data-action="ai-desk-copy"]');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    const status = await page.locator('aside.ai-desk .ai-status').textContent();
    ok(/Copied/.test(status) && (clip === null || clip === text), 'Copy puts the text on the clipboard', { status, same: clip === text });
    await page.waitForTimeout(3000);
    ok(await writesTo(page, rd.writes) === w0, 'a run and three idle seconds write nothing to ' + rd.writes);
    /* What Undo promises: the same notes on the board (by id) and the same
       note on every scene row. A save may restamp a blob's meta, so the
       raw strings are not the measure. */
    const snap = () => page.evaluate(() => {
      const val = (re) => { const k = Object.keys(localStorage).find((x) => re.test(x)); try { return k ? JSON.parse(localStorage.getItem(k)) : null; } catch (e) { return null; } };
      const v = val(/^fms_idea_vault_v1/);
      const vault = (Array.isArray(v) ? v : (v && (v.items || v.list)) || []).map((x) => x && x.id);
      const sc = val(/^fms_scenes_v1/);
      const rows = (Array.isArray(sc) ? sc : (sc && sc.scenes) || []).map((x) => (x && x.id) + ':' + (x && x.readerNote || ''));
      return JSON.stringify({ vault, rows });
    });
    const before = await snap();
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    const toast = page.locator('.toast', { hasText: /saved/ }).last();
    const said = await toast.waitFor({ state: 'visible', timeout: 4000 }).then(() => toast.textContent(), () => '');
    ok(/saved/.test(said) && (await snap()) !== before, 'Accept all keeps the points as notes', said);
    if (said) {
      await toast.locator('.toast-action', { hasText: /Undo/ }).click();
      await page.waitForTimeout(400);
      ok((await snap()) === before, 'Undo puts the scene list and the notes board back exactly');
    }
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'stopped: ' + String(e && e.message || e).split('\n')[0]); } finally { await ctx.close(); }
}

/* (c) edit-notes */
async function editCycle(name, fn) {
  console.log('(c) edit-notes: ' + name);
  F.reset(); requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    await seed(page, { key: true, edit: { scenes: { sc2: { cut: '', note: 'typed by the editor', sync: false } }, pickups: [], cuts: [] } });
    await page.goto(BASE + '/edit.html', { waitUntil: 'networkidle' });
    await planKnown(page, true);
    const w0 = await writesTo(page, 'fms_edit_v1');
    await openPill(page, 'Edit notes');
    const input = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
    ok(/"id":"sc1"/.test(input) && /typed by the editor/.test(input), 'the facts show every scene and the note already there');
    ok(requests.length === 0, 'nothing sent before Run');
    await runDesk(page);
    const items = await page.locator('aside.ai-desk .ai-desk-item').allTextContents();
    ok(items.length === 2 && items.every((t) => !/Scene 2/.test(t)), 'one item per EMPTY scene; the typed one and the ghost are dropped', items);
    ok(await writesTo(page, 'fms_edit_v1') === w0, 'nothing written before Accept');
    await fn(page, w0);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'stopped: ' + String(e && e.message || e).split('\n')[0]); } finally { await ctx.close(); }
}
const note = async (page, id) => ((await stored(page, 'fms_edit_v1')) || { scenes: {} }).scenes[id]?.note;
const setNote = (page, id, text) => page.evaluate(({ id, text }) => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_edit_v1'));
  const d = JSON.parse(localStorage.getItem(k));
  d.scenes[id] = { ...(d.scenes[id] || { cut: '', sync: false }), note: text };
  localStorage.setItem(k, JSON.stringify(d));
}, { id, text });

await editCycle('a note typed between Run and Accept is skipped; Undo blanks only what was written', async (page) => {
  await setNote(page, 'sc3', 'typed late');
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  ok(/Check the cut of sc1/.test(await note(page, 'sc1') || ''), 'Accept wrote the empty note (scene 1)');
  ok(await note(page, 'sc3') === 'typed late', 'the note typed since was left alone (scene 3)');
  ok(await note(page, 'sc2') === 'typed by the editor', 'the note that was there before is untouched (scene 2)');
  const undo = page.locator('.toast-action', { hasText: /Undo/ }).last();
  ok(await undo.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false), 'an Undo toast is offered');
  await undo.click();
  await page.waitForTimeout(1000);
  ok(!(await note(page, 'sc1')), 'Undo blanked the note it wrote');
  ok(await note(page, 'sc3') === 'typed late' && await note(page, 'sc2') === 'typed by the editor', 'and left both typed notes as they were');
});

await editCycle('Undo leaves a note edited after Accept; unticked items are not written', async (page) => {
  await page.locator('aside.ai-desk .ai-desk-item input[type="checkbox"]').last().uncheck();
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1200);
  ok(/Check the cut of sc1/.test(await note(page, 'sc1') || '') && !(await note(page, 'sc3')), 'Accept selected wrote the ticked scene only');
  await setNote(page, 'sc1', 'I changed this');
  const undo = page.locator('.toast-action', { hasText: /Undo/ }).last();
  await undo.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  await undo.click().catch(() => {});
  await page.waitForTimeout(1000);
  ok(await note(page, 'sc1') === 'I changed this', 'Undo left the note edited since');
});

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
