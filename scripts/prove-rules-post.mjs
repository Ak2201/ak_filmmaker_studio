/* ============================================================
   PROOF: the no-AI twins of the on-set and post Desk tasks
   (docs/RULES-BREAKDOWN.md, lane B) in a real Chromium. NO KEY, signed
   out, no AI host reachable: every request outside the build is
   aborted and counted.

   For each of drafts.html "Summarise changes", shoot.html "Wrap note",
   edit.html "Draft notes", deliverables.html#certification "Read the
   flags" and screenplay.html#analysis "Measured notes":
     - the button is there, a plain kit button (not a pill), and the AI
       pill beside it reads "Enhance with AI"
     - pressing it opens the Desk with NO key step and no Pro question,
       the list already built ("On this device"), nothing written yet
     - Accept all writes (scene notes marked "Rules (...)", sticky notes
       from rules, or the blank edit notes) and says what it wrote
     - the toast's Undo puts the scene list, the notes board and the
       edit log back exactly
     - no request went to an AI host, and the only outside request the
       page made was the app's own announcement call (refused)

   Run:  VITE_SITE_GATE=off npx vite build --outDir dist-verify
         PROVE_DIST=dist-verify node scripts/prove-rules-post.mjs
         (PROVE_PORT, PW_CHROMIUM)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5386;
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
/* A script with a calm middle and a lead who goes quiet: the analysis has flags. */
const HEAVY = 'He screams and smashes the door. She slaps him, blood and a gun, a threat, a fight!';
const CALM = 'She waters the plants. Quiet morning. Tea.';
const LONG = [];
const LONG_SCENES = [];
for (let i = 0; i < 24; i++) {
  LONG.push({ id: 'rs' + i, type: 'scene', text: 'INT. PLACE ' + i + ' - DAY' });
  LONG.push({ id: 'ra' + i, type: 'action', text: i < 6 || i >= 18 ? HEAVY : CALM });
  if (i < 6 || i >= 18) { LONG.push({ id: 'rc' + i, type: 'character', text: 'MARA' }); LONG.push({ id: 'rd' + i, type: 'dialogue', text: 'No!' }); }
  LONG_SCENES.push(scene('la' + i, String(i + 1), { location: 'PLACE ' + i, scriptElId: 'rs' + i, shootDay: 0 }));
}

/* ---- the browser: signed out, every outside request refused -------- */
const external = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function context() {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => {
    const u = r.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.fulfill({ status: 200, body: '' });
    external.push(u);
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload|net::ERR/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { if (d.type() === 'beforeunload') d.accept().catch(() => {}); else { errors.push('native dialog: ' + d.message()); d.dismiss().catch(() => {}); } });
  return { ctx, page, errors };
}
async function seed(page, { script = SCRIPT, scenes = SCENES, edit = null } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ script, scenes, edit }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Rules Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify(script));
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    if (edit) localStorage.setItem('fms_edit_v1', JSON.stringify(edit));
  }, { script, scenes, edit });
}
/* What Undo promises: the same notes on the board (by id), the same note on
   every scene row, the same edit-log notes. A save may restamp a blob's meta,
   so the raw strings are not the measure. */
const snap = (page) => page.evaluate(() => {
  const val = (re) => { const k = Object.keys(localStorage).find((x) => re.test(x)); try { return k ? JSON.parse(localStorage.getItem(k)) : null; } catch (e) { return null; } };
  const v = val(/^fms_idea_vault_v1/);
  const vault = (Array.isArray(v) ? v : (v && (v.items || v.list)) || []).map((x) => x && x.id);
  const sc = val(/^fms_scenes_v1/);
  const rows = (Array.isArray(sc) ? sc : (sc && sc.scenes) || []).map((x) => (x && x.id) + ':' + (x && x.readerNote || ''));
  const ed = val(/^fms_edit_v1/);
  const notes = Object.entries((ed && ed.scenes) || {}).map(([id, e]) => id + ':' + (e && e.note || ''));
  return JSON.stringify({ vault, rows, notes });
});
const vaultNotes = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^fms_idea_vault_v1/.test(x));
  const v = k ? JSON.parse(localStorage.getItem(k)) : [];
  return Array.isArray(v) ? v : [];
});
const sceneNote = (page, id) => page.evaluate((id) => {
  const k = Object.keys(localStorage).find((x) => /^fms_scenes_v1/.test(x));
  const sc = JSON.parse(localStorage.getItem(k));
  return ((sc.scenes || sc).find((s) => s.id === id) || {}).readerNote || '';
}, id);
const editNote = (page, id) => page.evaluate((id) => {
  const k = Object.keys(localStorage).find((x) => /^fms_edit_v1/.test(x));
  const ed = k ? JSON.parse(localStorage.getItem(k)) : { scenes: {} };
  return ((ed.scenes || {})[id] || {}).note || '';
}, id);
const deskText = (page) => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');

/* One press-through: button -> Desk (no key step) -> Accept all -> Undo. */
async function pressThrough({ name, url, label, task, seedOpts, expectItems, afterAccept, snapAfterLoad = false }) {
  console.log(name);
  const { ctx, page, errors } = await context();
  external.length = 0;
  try {
    await seed(page, seedOpts);
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const btn = page.locator('[data-action="rules-desk"]', { hasText: label }).first();
    await btn.waitFor({ state: 'attached', timeout: 15000 });
    const kind = await btn.evaluate((el) => ({ cls: el.className, tag: el.tagName, task: el.dataset.rulesTask, text: el.textContent.trim(), lock: !!el.querySelector('.ai-pill-glyph'), vis: el.getBoundingClientRect().width > 0 }));
    ok(/k-btn/.test(kind.cls) && kind.tag === 'BUTTON' && kind.task === task && !/Pro/.test(kind.text) && !kind.lock && kind.vis,
      '"' + label + '" is a plain kit button for ' + task + ', no plan flag', kind);
    const pill = await btn.locator('xpath=..').locator('.ai-pill').first().textContent().catch(() => '');
    ok(/Enhance with AI/.test(pill), 'the AI pill beside it reads "Enhance with AI"', pill);
    const before = await snap(page);
    await btn.click();
    await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 15000 });
    const text = await deskText(page);
    ok(!/Add your key|key in Settings|come with Pro|Pro plan/i.test(text) && /On this device/i.test(text), 'the Desk opens with no key step and no Pro question', text.slice(0, 200));
    ok(await page.locator('aside.ai-desk [data-action="ai-desk-send"]').count() === 0, 'no chat box: there is no model to refine with');
    const items = await page.locator('aside.ai-desk .ai-desk-item').allTextContents();
    ok(items.length >= (expectItems || 1), 'the list is already built (' + items.length + ' items)', items);
    ok((await snap(page)) === before, 'nothing is written before Accept');
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    await page.waitForTimeout(900);
    const after = await snap(page);
    ok(after !== before, 'Accept all writes');
    if (afterAccept) await afterAccept(page);
    const undo = page.locator('.toast-action', { hasText: /Undo/ }).last();
    ok(await undo.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false), 'the toast offers Undo');
    const said = await page.locator('.toast').last().textContent().catch(() => '');
    ok(/saved|added/i.test(await page.locator('.toast-host').textContent().catch(() => '')), 'the toast says what was written', said);
    await undo.click();
    await page.waitForTimeout(900);
    ok((await snap(page)) === before, 'Undo puts the scene list, the notes board and the edit log back exactly');
    ok(!(await vaultNotes(page)).some((n) => n.from === 'ai'), 'nothing is from ai');
    const raw = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^fms_(scenes|idea_vault|edit)_v1/.test(k)).map((k) => localStorage.getItem(k)).join('\n'));
    ok(!/"ai"\s*:|aiFill/.test(raw), 'no ai or aiFill field anywhere in what was written');
    /* The app's own announcement call to its backend is aborted with the rest;
       what matters is that nothing went to an AI provider. */
    const toAI = external.filter((u) => /anthropic|generativelanguage|openai|googleapis\.com\/(v1|upload)/i.test(u));
    ok(toAI.length === 0, 'no request to an AI host (' + external.length + ' other outside request' + (external.length === 1 ? '' : 's') + ' refused)', toAI);
    ok(external.every((u) => /\.supabase\.co\/rest\/v1\/rpc\/site_announcement_now$/.test(u)), 'and nothing else outside the build was asked for', external);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'stopped: ' + String(e && e.message || e).split('\n')[0]); } finally { await ctx.close(); }
  void snapAfterLoad;
}

await pressThrough({
  name: 'drafts.html: Summarise changes', url: '/drafts.html', label: 'Summarise changes', task: 'draft-changes-rules',
  afterAccept: async (page) => {
    const notes = await vaultNotes(page);
    ok(notes.length >= 2 && notes.every((n) => n.from === 'rules' && /^Rules \(Draft changes\): /.test(n.snippet)), 'every point is a sticky note from rules, headed with the drafts', notes.map((n) => n.snippet));
    ok(notes.some((n) => /INT\. ANBU HOUSE - NIGHT\): .*1 changed/.test(n.snippet)), 'the changed scene is named by its heading, with a count', notes.map((n) => n.snippet));
  }
});

await pressThrough({
  name: 'shoot.html: Wrap note', url: '/shoot.html?day=1', label: 'Wrap note', task: 'day-wrap-summary-rules', expectItems: 4,
  afterAccept: async (page) => {
    ok(/Rules \(Wrap note\): Floor note, Scene 1: “wind on the boom”/.test(await sceneNote(page, 'sc1')), 'the floor note is on its own scene, word for word');
    ok(/Rules \(Wrap note\): Scene 2 .*part shot, pick-ups owed/.test(await sceneNote(page, 'sc2')), 'the part-shot scene carries its owed line');
    ok(/Rules \(Wrap note\): Scene 3 .*not marked shot/.test(await sceneNote(page, 'sc3')), 'the unmarked scene is owed');
    const notes = await vaultNotes(page);
    ok(notes.length === 2 && notes.every((n) => n.from === 'rules') && notes.some((n) => /Day 1: 3 planned, 1 shot, 1 part, 1 not marked; 1 take, 1 circled\./.test(n.snippet)), 'the summary and tomorrow are sticky notes', notes.map((n) => n.snippet));
  }
});

await pressThrough({
  name: 'edit.html: Draft notes', url: '/edit.html', label: 'Draft notes', task: 'edit-notes-rules',
  seedOpts: { edit: { scenes: { sc2: { cut: '', note: 'typed by the editor', sync: false } }, pickups: [], cuts: [] } },
  afterAccept: async (page) => {
    ok(/^The set marked it shot\. 1 take logged, 1 circled\./.test(await editNote(page, 'sc1')), 'the blank note of the shot scene is filled from the set\'s marks');
    ok(await editNote(page, 'sc2') === 'typed by the editor', 'the typed note is untouched');
    ok(await editNote(page, 'sc3') === '', 'a scene with nothing logged gets no note');
  }
});

await pressThrough({
  name: 'deliverables.html#certification: Read the flags', url: '/deliverables.html#certification', label: 'Read the flags', task: 'cert-read-rules', expectItems: 3,
  afterAccept: async (page) => {
    const notes = await vaultNotes(page);
    ok(notes.every((n) => n.from === 'rules' && /^Rules \(Certification read\): Certification — /.test(n.snippet)), 'every point is a sticky note from rules', notes.map((n) => n.snippet.slice(0, 60)));
    ok(notes.some((n) => /^Rules \(Certification read\): Certification — Hint: U/.test(n.snippet) && /This is a hint, not advice/.test(n.snippet)), 'the hint is kept with its hint line');
    ok(notes.some((n) => /\[tobacco\] [^(]*\(Sc [\d, ]+\)/.test(n.snippet) && /Source: /.test(n.snippet)), 'the tobacco rule is kept with its scenes and its source', notes.map((n) => n.snippet.slice(0, 160)));
  }
});

await pressThrough({
  name: 'screenplay.html#analysis: Measured notes', url: '/screenplay.html#analysis', label: 'Measured notes', task: 'tension-notes-rules',
  seedOpts: { script: { elements: LONG, revisions: [], documents: [] }, scenes: LONG_SCENES },
  afterAccept: async (page) => {
    const notes = await vaultNotes(page);
    const onScenes = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => /^fms_scenes_v1/.test(x));
      const sc = JSON.parse(localStorage.getItem(k));
      return (sc.scenes || sc).filter((s) => /Rules \(Measured tension\)/.test(s.readerNote || '')).map((s) => s.readerNote);
    });
    ok(notes.length + onScenes.length > 0 && notes.every((n) => n.from === 'rules'), 'the flags are kept (' + onScenes.length + ' on scenes, ' + notes.length + ' sticky)', { notes: notes.map((n) => n.snippet), onScenes });
    ok([...notes.map((n) => n.snippet), ...onScenes].every((t) => /Measured: /.test(t)), 'every note is worded as a measurement');
  }
});

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
