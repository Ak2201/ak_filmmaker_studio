/* ============================================================
   PROOF: coverage, the voice check and the logline workshop in a
   real Chromium, against a FAKED Anthropic and Gemini (Playwright
   route(), the SSE builders in scripts/fake-ai.mjs). No key, no
   network: any request to another host fails the run.

     · nothing is sent before a click; the cost line is on screen first
     · the run goes through the AI pill → the AI Desk → Run → Accept
       (src/lib/ai-tasks.js 'coverage' / 'logline'); nothing is stored
       as the report until Accept
     · a fabricated quote is stripped and the count is printed
     · the report is stored inside the script blob and a reload reads
       it back WITHOUT a request
     · a run that fails on part 2 keeps part 1, and Resume sends only
       the parts not yet read (it does not bill twice)
     · a voice-check rewrite lands in `alts`, never in `text`
     · the logline workshop (in the Desk) replaces nothing until a
       variant is accepted, and Undo restores the writer's line
     · the AUDIENCE TEST from Script analysis (screenplay.html#analysis,
       the 'audience-test' Desk task): nothing sent before Run; Stop
       mid-run keeps the parts screened as a checkpoint; Resume sends
       only the rest and the verdict request; nothing is stored as a
       result before Accept; Accept draws the panel's curve over the
       tension chart; Undo puts the partial back exactly; a stored run
       from another draft is labelled "from an earlier draft", not hidden
     · no horizontal overflow at 390 and 1280, in both themes

   Run:  npm run build:verify && npm run prove:ai-coverage
         (PROVE_DIST=dist to point it at the `npm run build:open` output)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { anthropicSSE, geminiSSE } from './fake-ai.mjs';
/* AI tools are LOCKED unless the signed-in plan is known and includes
   them (plan-gate.js aiUnlocked()), so this proof signs in — Amy, on
   Pro, against the shared Supabase fake — rather than running signed
   out as it did before the lock. */
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
const TOK = 'tok-amy';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist-verify');
/* Without the build every page is a 404 and the first evaluate dies
   on `window.StudioStore` being undefined — say what is missing. */
if (!fs.existsSync(path.join(DIST, 'write.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/write.html — run `npm run build:verify` first (or PROVE_DIST=dist after `npm run build:open`)');
  process.exit(2);
}
const PORT = Number(process.env.PROVE_PORT) || 5863;
const SHOTS = process.env.PROVE_SHOTS || '';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const BASE = 'http://localhost:' + PORT;

let failed = 0;
function check(label, cond, detail) {
  if (!cond) failed++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail)));
}

/* ---- a script long enough for three coverage parts ------------- */
const LINES = [
  'Naan nalaikku Chennai poren.', 'Yaaru kitta kettu poriya?', 'Indha ooru ennai vida perusu.',
  'Furthermore, I would posit that my qualifications are exemplary.', 'Amma, naan thirumbi varala.'
];
function makeScript(nScenes) {
  const els = [];
  let id = 0;
  const E = (type, text) => els.push({ id: 'el' + (++id), type, text });
  for (let s = 1; s <= nScenes; s++) {
    E('scene', (s % 2 ? 'INT. ANBU HOUSE' : 'EXT. BUS STAND') + ' - ' + (s % 3 ? 'DAY' : 'NIGHT'));
    E('action', 'Scene ' + s + '. Anbu counts coins on the floor. ' + 'The ceiling fan ticks and the street outside keeps its own time. '.repeat(s === 1 ? 1 : 28));
    E('character', 'ANBU');
    E('dialogue', LINES[(s - 1) % LINES.length]);
    E('character', 'AMMA');
    E('dialogue', 'Saapittiya? Scene ' + s + '.');
  }
  return els;
}

/* ---- the fake API ----------------------------------------------- */
const requests = [];
let failPart2Once = false;
/* The audience test's part 2 is HELD until the proof presses Stop, so
   the Stop lands mid-run on a request in flight, deterministically. */
let holdAudPart2 = false;
let releaseAud = null;
function answer(user) {
  const scenes = [...user.matchAll(/--- SCENE (\S+) ---/g)].map((m) => m[1]);
  if (scenes.length) {
    return {
      scenes: scenes.map((n) => ({ scene: n, summary: 'Anbu, scene ' + n + '.' })),
      evidence: [
        { aspect: 'premise', scene: scenes[0], quote: 'Anbu counts coins on the floor.', note: 'Need in one image.' },
        { aspect: 'dialogue', scene: scenes[0], quote: 'Naan kandippa jeyippen da', note: 'Fabricated.' }
      ]
    };
  }
  if (/Write the coverage/.test(user)) {
    return {
      logline: 'A broke son leaves for Chennai and cannot go home.',
      premise: { assessment: 'Simple and clear.', points: [{ scene: '1', quote: 'Anbu counts coins on the floor.', note: 'Opens on need.' }] },
      structure: { assessment: 'A clean line.', actBreaks: [{ label: 'End of act one', scene: '3', quote: 'Indha ooru ennai vida perusu.', note: 'He leaves.' }],
        points: [{ scene: '2', quote: 'The manager weeps openly.', note: 'A fabricated point.' }] },
      character: { protagonist: 'ANBU', want: 'Work in Chennai', need: 'To forgive his mother', assessment: 'Want clear; need not.',
        points: [{ scene: '1', quote: 'Naan nalaikku Chennai poren.', note: 'States the want.' }] },
      dialogue: { assessment: 'Mostly natural.', points: [{ scene: '4', quote: 'I would posit that my qualifications', note: 'Off-voice.' },
        { scene: '4', quote: 'Unga appa enna sonnaru?', note: 'Fabricated.' }] },
      pacing: { assessment: 'Brisk.', points: [] },
      marketability: { assessment: 'An OTT drama.', points: [] },
      verdict: 'consider', verdictWhy: 'A voice worth developing.'
    };
  }
  if (/Check the voice of/.test(user)) {
    const ids = [...user.matchAll(/\[(el\d+)\] scene/g)].map((m) => m[1]);
    const posit = ids.find((i) => user.includes('[' + i + '] scene 4:'));
    return {
      voice: 'Short, plain Tanglish.',
      breaks: [
        posit ? { line: posit, quote: 'Furthermore, I would posit', why: 'Never a textbook.', rewrite: 'Sir, enakku velai venum.' } : null,
        { line: ids[0], quote: 'Naan naalai Mumbai poren', why: 'Fabricated.', rewrite: '' }
      ].filter(Boolean)
    };
  }
  if (/workshop on their logline/.test(user)) {
    return {
      check: [
        { part: 'protagonist', present: true, found: 'a broke son', note: 'Clear.' },
        { part: 'goal', present: true, found: 'to find work in Chennai', note: 'Clear.' },
        { part: 'obstacle', present: true, found: 'a city that hates him', note: 'Fabricated.' },
        { part: 'stakes', present: false, found: '', note: 'Missing.' },
        { part: 'irony', present: true, found: 'leaves his mother', note: 'There.' }
      ],
      variants: [1, 2, 3, 4, 5].map((i) => ({ text: 'Variant ' + i + ': to feed his mother, a son must leave her.', angle: 'angle ' + i }))
    };
  }
  /* The audience test (src/lib/audience-model.js): a part names the
     panel by id and its scenes as "=== SCENE n — heading ===". Viewer
     2 walks out at scene 5; viewer 1 carries one fabricated quote per
     part, which must be stripped and counted. */
  const panelIds = (from, to) => {
    const a = user.indexOf(from);
    if (a < 0) return [];
    const b = user.indexOf(to, a);
    return [...user.slice(a, b < 0 ? undefined : b).matchAll(/^- ([a-z0-9-]+) \| /gm)].map((m) => m[1]);
  };
  const audScenes = [...user.matchAll(/^=== SCENE (\S+) — /gm)].map((m) => m[1]);
  if (audScenes.length && /THE PANEL \(id \| who/.test(user)) {
    const ids = panelIds('THE PANEL (id', 'THE SCENES IN THIS PART');
    return {
      viewers: ids.map((id, k) => {
        const out = k === 1 && audScenes.includes('5') ? '5' : '';
        const scored = out ? audScenes.slice(0, audScenes.indexOf(out) + 1) : audScenes;
        return {
          viewer: id,
          scores: scored.map((n) => ({ scene: n, score: ((k + Number(n)) % 5) - 2 })),
          moments: [
            { scene: audScenes[0], kind: 'hooked', quote: 'Anbu counts coins on the floor.', note: 'The coins got me.' },
            k === 0 ? { scene: audScenes[0], kind: 'lost', quote: 'Naan kandippa jeyippen da', note: 'Fabricated.' } : null
          ].filter(Boolean),
          state: 'Still watching after scene ' + scored[scored.length - 1] + '.',
          walkedOutAt: out
        };
      })
    };
  }
  if (/^The test screening of/m.test(user)) {
    const ids = panelIds('THE PANEL:', 'SCORES PER SCENE');
    return {
      verdicts: ids.map((id) => ({ viewer: id, verdict: 'recommend', hooked: '1', lost: '', voice: 'I would watch it again.' })),
      panel: [{ scene: '5', note: 'The panel split early.' }]
    };
  }
  return { ok: true };
}

async function route(r) {
  const req = r.request();
  const url = req.url();
  const provider = url.startsWith('https://api.anthropic.com') ? 'anthropic' : 'gemini';
  const body = JSON.parse(req.postData() || '{}');
  const user = provider === 'anthropic' ? body.messages[0].content : body.contents[0].parts[0].text;
  const headers = req.headers();
  requests.push({ provider, url, user, key: headers['x-api-key'] || headers['x-goog-api-key'] || '' });
  if (failPart2Once && /This is part 2 of/.test(user)) {
    failPart2Once = false;
    return r.fulfill({ status: 529, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) });
  }
  if (holdAudPart2 && /— part 2 of/.test(user) && /THE PANEL \(id/.test(user)) {
    holdAudPart2 = false;
    await new Promise((res) => { releaseAud = res; });
    /* By now the page has aborted the request; answering it is a no-op
       or a throw, and either is the point. */
    try { await r.fulfill({ status: 200, contentType: 'text/event-stream', body: provider === 'anthropic' ? anthropicSSE(answer(user)) : geminiSSE(answer(user)) }); } catch (e) { /* aborted */ }
    return;
  }
  const json = answer(user);
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: provider === 'anthropic' ? anthropicSSE(json) : geminiSSE(json) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function session({ width, theme, provider }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  /* A failed resource is judged by its URL, not by the console line,
     which carries none. Two are this harness's own doing and are not
     findings: every off-origin request is aborted below (ERR_FAILED),
     and the fake answers the "failed run" with a 529 on purpose. */
  page.on('console', (m) => {
    /* Signed in, the client opens Supabase realtime; a WebSocket is
       not routed by page.route, so it fails to connect here. Not a finding. */
    if (m.type() === 'error' && !/^Failed to load resource|WebSocket connection to .*\/realtime\//.test(m.text())) errors.push(m.text());
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !(r.status() === 529 && /anthropic\.com|googleapis\.com/.test(u))) errors.push(r.status() + ' ' + u);
  });
  // ERR_ABORTED is the browser cancelling a request because the page
  // navigated or a lazy import was superseded — not a failure to load.
  page.on('requestfailed', (r) => {
    const why = (r.failure() || {}).errorText || '';
    if (r.url().startsWith(BASE) && !/ERR_ABORTED/.test(why)) errors.push('failed ' + r.url() + ' ' + why);
  });
  await page.route(/^https:\/\/(api\.anthropic\.com|generativelanguage\.googleapis\.com)\//, route);
  await page.route(SB + '/**', handle);
  await page.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/anthropic\.com|googleapis\.com\/v1beta/.test(u.href), (r) => r.abort());
  await page.addInitScript(([k, v, uid]) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, [`sb-${REF}-auth-token`, sessionFor(TOK), USERS[TOK].id]);
  /* The "run it again?" questions are asked in the app now: press the
     in-app confirm button the way a person would, and fail on a native box. */
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript(() => {
    const press = () => { const b = document.querySelector('.dlg .mbtn.primary:not([disabled])'); if (b) setTimeout(() => b.click(), 50); };
    new MutationObserver(press).observe(document, { childList: true, subtree: true });
  });
  return { ctx, page, errors };
}

const KEY = { anthropic: 'sk-ant-PROVEPROVEPROVEPROVE12', gemini: 'AIzaPROVEPROVEPROVEPROVE12' };

/* ---- the AI Desk ------------------------------------------------- */
const deskShown = (page) => page.evaluate(() => {
  const d = document.querySelector('aside.ai-desk');
  return !!d && !d.hidden && d.getBoundingClientRect().width > 0;
});
/** Click a one-task pill and wait for the Desk to show its task. */
async function openPill(page, sel) {
  const p = page.locator(sel).first();
  await p.waitFor({ state: 'visible', timeout: 15000 });
  await p.scrollIntoViewIfNeeded().catch(() => {});
  await p.click();
  await page.waitForFunction(() => {
    const d = document.querySelector('aside.ai-desk');
    return d && !d.hidden && d.getBoundingClientRect().width > 0 && d.querySelector('.ai-desk-input');
  }, null, { timeout: 10000 });
  await page.waitForTimeout(300);
}
const deskSays = async (page, sel) => ((await page.locator('aside.ai-desk ' + sel).first().textContent().catch(() => '')) || '');

for (const [width, theme, provider] of [[1280, 'ink', 'anthropic'], [390, 'ink', 'gemini'], [390, 'ink', 'anthropic'], [1280, 'ink', 'gemini']]   /* one theme since 14 Oct 2026 */) {
  const tag = '[' + width + ' ' + theme + ' ' + provider + '] ';
  requests.length = 0;
  F.reset(); aiScenario('pro', TOK);
  const { ctx, page, errors } = await session({ width, theme, provider });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ els, theme, provider, key, keep }) => {
    const S = window.StudioStore;
    /* Clear the studio but keep the session, the account pointer and
       this device's lock id — without the first two the next load is
       signed out and every AI pill is locked; without the third the
       device lock reads a NEW device and puts up "Active in another
       window" over the page. */
    const saved = keep.map((k) => [k, localStorage.getItem(k)]);
    localStorage.clear();
    for (const [k, v] of saved) if (v != null) localStorage.setItem(k, v);
    const p = S.createProject({ title: 'Ooru', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: els, revisions: [], documents: [] }));
    localStorage.setItem('fms_studio_theme_v1', theme);
    S.rawSet('fms_ai_provider_v1', provider);
    S.rawSet(provider === 'anthropic' ? 'fms_ai_key_v1' : 'fms_ai_key_gemini_v1', key);
    localStorage.setItem('fms_story_v1', JSON.stringify({ logline: 'A broke son leaves his mother to find work in Chennai.', idea: '', source: '', marks: [], tension: {}, outline: [] }));
  }, { els: makeScript(40), theme, provider, key: KEY[provider], keep: [`sb-${REF}-auth-token`, 'fms_studio_account_v1', 'fms_device_session_v1'] });

  /* ---- write.html#coverage, before any click ---------------------- */
  await page.goto(BASE + '/write.html?stay=1#coverage', { waitUntil: 'networkidle' });
  await page.waitForSelector('#coverage .cv-run .ai-pill', { timeout: 15000 });
  /* The plan has to have ARRIVED before an AI control is unlocked. */
  for (let i = 0; i < 50 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  check(tag + 'signed in: billing_status() was asked', F.db.calls.includes('billing_status'));
  await page.waitForTimeout(400);
  check(tag + 'the Coverage tab is a tab', await page.locator('.tabs [role="tab"]', { hasText: 'Coverage' }).count() === 1);
  const cost = await page.locator('#coverage .cv-cost').textContent();
  check(tag + 'the cost is on screen before the click: ' + cost.slice(0, 60), /About 4 requests/.test(cost) && /tokens sent/.test(cost), cost);
  check(tag + 'nothing was sent on load', requests.length === 0, requests.length);

  const PILL = '#coverage .cv-run .ai-pill';
  check(tag + 'the run is an AI pill, unlocked on Pro with a key', await page.locator(PILL).first().evaluate((el) => el.dataset.aiState) === 'ready');

  /* ---- a run that fails on part 2, then resumes ------------------- */
  failPart2Once = true;
  await openPill(page, PILL);
  check(tag + 'the pill opens the AI Desk on Coverage', /Coverage/.test(await deskSays(page, '.ai-desk-title')));
  const what = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
  check(tag + '"What goes in" states the parts and the first part', /in 3 parts/.test(what) && /The first part sends/.test(what), what.slice(0, 160));
  check(tag + 'opening the Desk sent nothing', requests.length === 0, requests.length);
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-error', { timeout: 15000 });
  check(tag + 'the failed run made two requests (part 1, part 2)', requests.length === 2, requests.length);
  const partial = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).documents.filter((d) => d.coverage).map((d) => [d.coverage.status, d.coverage.checkpoint && d.coverage.checkpoint.parts.length]));
  check(tag + 'the part read is stored as a checkpoint in the script blob', JSON.stringify(partial) === '[["partial",1]]', partial);
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
  await page.waitForTimeout(300);
  check(tag + 'Skip closes the Desk', !(await deskShown(page)));
  const resumeBtn = await page.locator(PILL).first().textContent();
  check(tag + 'the pill offers Resume', /Resume coverage — 1 of 3 read/.test(resumeBtn), resumeBtn);
  requests.length = 0;
  await openPill(page, PILL);
  const what2 = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
  check(tag + 'the Desk says part 1 is not sent again', /1 of 3 parts are already read/.test(what2), what2.slice(0, 220));
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 15000 });
  check(tag + 'Resume sent parts 2 and 3 and the report only — part 1 not billed again',
    requests.length === 3 && !requests.some((r) => /This is part 1 of/.test(r.user)), requests.map((r) => r.user.slice(0, 40)));
  check(tag + 'the key went in a header, never in a URL',
    requests.every((r) => r.key === KEY[provider] && !r.url.includes(KEY[provider]) && !/[?&]key=/.test(r.url)));
  const nItems = await page.locator('aside.ai-desk .ai-desk-item').count();
  check(tag + 'the Desk lists the report\'s points, each ticked (' + nItems + ')', nItems >= 4
    && await page.$$eval('aside.ai-desk .ai-desk-item input[type="checkbox"]', (b) => b.every((x) => x.checked)), nItems);
  check(tag + 'the Desk notes the verdict before Accept', /Verdict: Consider/.test(await deskSays(page, '.ai-desk-note')));
  const notYet = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).documents.filter((d) => d.coverage && d.coverage.status === 'done').length);
  check(tag + 'nothing is stored as the report before Accept', notYet === 0, notYet);
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForSelector('#coverage .cv-report', { timeout: 15000 });
  check(tag + 'Accept closes the Desk', !(await deskShown(page)));
  const removed = await page.locator('#coverage .cv-removed').textContent();
  check(tag + 'the stripped quotes are counted: ' + removed.slice(0, 70), /2 quotes removed because they were not in your script/.test(removed) && /3 more/.test(removed), removed);
  const quotes = await page.locator('#coverage .cv-quote').allTextContents();
  const els = makeScript(40);
  const all = els.map((e) => e.text).join('\n');
  check(tag + 'every quote printed is in the script (' + quotes.length + ')', quotes.length >= 4 && quotes.every((q) => all.includes(q.replace(/^“|”$/g, ''))), quotes);
  check(tag + 'a point that lost its quote says so', await page.locator('#coverage .cv-unquoted').count() === 2);
  check(tag + 'the verdict is shown', (await page.locator('#coverage .cv-verdict').textContent()) === 'Consider');

  /* ---- stored: a reload reads it back with no request ------------- */
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).documents.map((d) => [d.kind, d.coverage && d.coverage.status, /CONSIDER/.test(d.body)]));
  check(tag + 'one Notes document holds the finished report', JSON.stringify(stored) === '[["Notes","done",true]]', stored);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /cover/i.test(k)));
  check(tag + 'no new storage key', keys.length === 0, keys);
  requests.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#coverage .cv-report', { timeout: 15000 });
  check(tag + 'reopening shows the stored report without a request', requests.length === 0, requests.length);
  check(tag + 'the pill now says Run again', /Run coverage again/.test(await page.locator(PILL).first().textContent()));

  /* ---- the voice check: a rewrite becomes a take, not the line ---- */
  await page.selectOption('select[data-action="cv-voice-pick"]', 'ANBU');
  const vdisc = await page.locator('.cv-voice .ai-disclose').textContent();
  check(tag + 'the voice disclosure names what is sent', /40 lines/.test(vdisc), vdisc);
  /* The run is the AI Desk's 'voice-check' task: the pill opens it,
     Run sends, the suggested rewrites are the items, Accept adds the
     ticked ones as takes. */
  const VPILL = '#coverage .cv-voice .ai-pill';
  check(tag + 'the voice check is an AI pill, unlocked on Pro with a key', await page.locator(VPILL).first().evaluate((el) => el.dataset.aiState) === 'ready');
  requests.length = 0;
  await openPill(page, VPILL);
  check(tag + 'the voice pill opens the Desk on the voice check', /Voice check/.test(await deskSays(page, '.ai-desk-title')));
  const vin = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
  check(tag + 'voice: "What goes in" names ANBU\'s 40 lines', /Every line ANBU speaks/.test(vin) && /40 lines/.test(vin), vin.slice(0, 160));
  check(tag + 'voice: opening the Desk sent nothing', requests.length === 0, requests.length);
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 15000 });
  check(tag + 'only ANBU\'s lines were sent', requests.length === 1 && !/Saapittiya/.test(requests[0].user));
  const vrem = await deskSays(page, '.ai-desk-note');
  check(tag + 'voice: the fabricated quote is counted', /1 quote removed/.test(vrem), vrem);
  const vdet = await page.locator('aside.ai-desk .ai-desk-item p').allTextContents();
  check(tag + 'voice: scene numbers are the script\'s', vdet.length >= 1 && vdet.every((t) => /^Sc (4|9|14|19|24|29|34|39) /.test(t)), vdet);
  const vnone = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).elements.filter((e) => Array.isArray(e.alts)).length);
  check(tag + 'voice: nothing is added before Accept', vnone === 0, vnone);
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(800);
  const line = await page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('fms_script_v1'));
    return b.elements.filter((e) => Array.isArray(e.alts)).map((e) => [e.text, e.alts]);
  });
  check(tag + 'the rewrite is an alternate take; the line in use is unchanged',
    line.length === 1 && line[0][0] === LINES[3] && line[0][1][0] === 'Sir, enakku velai venum.', line);
  const undo = page.locator('.toast-action', { hasText: 'Undo' }).last();
  await undo.click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).elements.filter((e) => Array.isArray(e.alts)).length);
  check(tag + 'Undo takes the take away again', after === 0, after);

  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(tag + 'no horizontal overflow on the Coverage tab', ov <= 0, ov);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'coverage-' + width + '-' + theme + '.png'), fullPage: true });

  /* ---- story.html: the logline workshop, in the Desk -------------- */
  await page.goto(BASE + '/story.html#path-2', { waitUntil: 'networkidle' });
  await page.waitForSelector('.st-lw .ai-pill', { timeout: 15000 });
  requests.length = 0;
  await openPill(page, '.st-lw .ai-pill');
  const lwIn = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
  check(tag + 'workshop: "What goes in" is the writer\'s logline', lwIn === 'A broke son leaves his mother to find work in Chennai.', lwIn);
  check(tag + 'workshop: nothing sent before Run', requests.length === 0, requests.length);
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 15000 });
  check(tag + 'workshop: one request', requests.length === 1, requests.length);
  const lrem = await deskSays(page, '.ai-desk-note');
  check(tag + 'workshop: the fabricated span is counted', /1 quote removed because it was not in your logline/.test(lrem), lrem);
  check(tag + 'workshop: five variants to choose from', await page.locator('aside.ai-desk .ai-desk-item').count() === 5);
  const before = await page.locator('#stLogline').inputValue();
  check(tag + 'workshop: the logline is untouched until Accept', before === 'A broke son leaves his mother to find work in Chennai.', before);
  /* Keep ONLY the third variant ticked, then Accept selected. */
  const ticks = page.locator('aside.ai-desk .ai-desk-item input[type="checkbox"]');
  for (let k = 0; k < 5; k++) if (k !== 2) await ticks.nth(k).uncheck();
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(400);
  const now = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1')).logline);
  check(tag + 'workshop: Accept takes the ticked variant as the logline', /^Variant 3/.test(now), now);
  await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1')).logline);
  check(tag + 'workshop: Undo puts the writer\'s logline back', back === before, back);
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(tag + 'no horizontal overflow on the logline step', ov2 <= 0, ov2);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'logline-' + width + '-' + theme + '.png'), fullPage: true });


  /* ---- screenplay.html#analysis: the audience test ---------------- */
  {
    const docsOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).documents
      .filter((d) => d.audience).map((d) => ({ id: d.id, status: d.audience.status, parts: d.audience.checkpoint ? d.audience.checkpoint.parts.length : null, sig: d.audience.sig, json: JSON.stringify(d) })));
    await page.goto(BASE + '/screenplay.html#analysis', { waitUntil: 'networkidle' });
    const APILL = '.sa-head-acts .ai-pill';
    await page.waitForSelector(APILL, { timeout: 15000 });
    await page.waitForTimeout(400);
    check(tag + 'audience: no curve is drawn before a test is kept', await page.locator('.sa-aud-block').count() === 0);
    const openAudience = async () => {
      await page.locator(APILL).first().scrollIntoViewIfNeeded().catch(() => {});
      await page.locator(APILL).first().click();
      await page.locator('.ai-pill-menu [data-task="audience-test"]').click();
      await page.waitForFunction(() => {
        const d = document.querySelector('aside.ai-desk');
        return d && !d.hidden && d.getBoundingClientRect().width > 0 && d.querySelector('.ai-desk-input');
      }, null, { timeout: 10000 });
      await page.waitForTimeout(300);
    };
    requests.length = 0;
    await openAudience();
    check(tag + 'audience: the Script analysis pill opens the Desk on Audience test', /Audience test/.test(await deskSays(page, '.ai-desk-title')));
    const ain = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
    check(tag + 'audience: "What goes in" names the panel, the parts and the simulated line',
      /8 simulated viewers/.test(ain) && /in 3 parts/.test(ain) && /Simulated by a model, not by real viewers/.test(ain) && /The first part sends/.test(ain), ain.slice(0, 200));
    check(tag + 'audience: opening the Desk sent nothing', requests.length === 0, requests.length);

    /* Run, and Stop while part 2 is in flight */
    holdAudPart2 = true;
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    for (let i = 0; i < 150 && !releaseAud; i++) await page.waitForTimeout(100);
    check(tag + 'audience: part 2 went out after part 1', !!releaseAud && requests.length === 2 && /— part 1 of 3/.test(requests[0].user), requests.map((r) => r.user.slice(0, 40)));
    await page.click('aside.ai-desk [data-action="ai-desk-stop"]');
    await page.waitForFunction(() => !document.querySelector('aside.ai-desk [data-action="ai-desk-stop"]'), null, { timeout: 15000 }).catch(() => {});
    if (releaseAud) { releaseAud(); releaseAud = null; }
    await page.waitForTimeout(300);
    check(tag + 'audience: Stop says it stopped', /Stopped/.test(await page.locator('aside.ai-desk').textContent()));
    const cp = await docsOf();
    check(tag + 'audience: Stop leaves part 1 as a checkpoint in the script blob', cp.length === 1 && cp[0].status === 'partial' && cp[0].parts === 1, cp.map((d) => [d.status, d.parts]));
    check(tag + 'audience: no curve is drawn from a partial run', await page.locator('.sa-aud-block').count() === 0);
    await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
    await page.waitForTimeout(300);

    /* Resume: parts 2 and 3 and the verdict, never part 1 again */
    requests.length = 0;
    await openAudience();
    const ain2 = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
    check(tag + 'audience: the Desk says part 1 is not sent again', /1 of 3 parts are already screened/.test(ain2) && /same panel as the unfinished run/.test(ain2), ain2.slice(0, 260));
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 20000 });
    check(tag + 'audience: Resume sent parts 2 and 3 and the verdict request only',
      requests.length === 3 && !requests.some((r) => /— part 1 of/.test(r.user)) && /^The test screening of/m.test(requests[2].user), requests.map((r) => r.user.slice(0, 40)));
    check(tag + 'audience: the key went in a header, never in a URL',
      requests.every((r) => r.key === KEY[provider] && !r.url.includes(KEY[provider]) && !/[?&]key=/.test(r.url)));
    const anote = await deskSays(page, '.ai-desk-note');
    check(tag + 'audience: the note says simulated and counts the stripped quotes', /Simulated by a model/.test(anote) && /3 quotes were removed/.test(anote), anote);
    const arows = await page.locator('aside.ai-desk .ai-desk-item').count();
    check(tag + 'audience: one row per viewer and the panel rows (' + arows + ')', arows >= 9, arows);
    const pre = await docsOf();
    check(tag + 'audience: nothing is stored as a result before Accept', pre.length === 1 && pre[0].status === 'partial' && pre[0].parts === 3, pre.map((d) => [d.status, d.parts]));
    const partialJSON = pre[0] && pre[0].json;

    /* Accept: one finished document, and the curve on the chart */
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    await page.waitForSelector('.sa-aud-block', { timeout: 15000 });
    const done = await docsOf();
    check(tag + 'audience: Accept turns the partial into one finished document', done.length === 1 && done[0].status === 'done' && done[0].id === pre[0].id, done.map((d) => [d.status, d.id]));
    const doneJSON = done[0] && done[0].json;
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /audience/i.test(k)));
    check(tag + 'audience: no new storage key', keys.length === 0, keys);
    const mean = await page.locator('.sa-aud-mean').getAttribute('d');
    check(tag + 'audience: the panel mean is a second line over the tension curve', !!mean && mean.length > 20 && await page.locator('.pc-line').count() === 1, (mean || '').slice(0, 40));
    check(tag + 'audience: the simulated line is on the chart', /Simulated by a model, not by real viewers/.test(await page.locator('.sa-aud-block').textContent()));
    check(tag + 'audience: the walkout is marked on the axis', await page.locator('.sa-walk').count() === 1
      && /walked out at Sc 5/.test(await page.locator('.sa-walk').first().getAttribute('title')));
    await page.waitForTimeout(500);
    check(tag + 'audience: a run of THIS draft is not labelled earlier', await page.locator('.sa-aud-draft').evaluate((e) => e.hidden));
    const vpath = page.locator('.sa-aud-viewer').first();
    check(tag + 'audience: viewer lines start off', (await vpath.getAttribute('visibility')) === 'hidden');
    await page.locator('.sa-aud-chip input').first().check();
    check(tag + 'audience: ticking a viewer draws their line', (await vpath.getAttribute('visibility')) === 'visible');
    await page.locator('.sa-aud-scrub').focus();
    await page.keyboard.press('Home');
    const readRows = await page.locator('.sa-aud-read .sa-aud-row').count();
    const at = await page.locator('.sa-aud-read .sa-aud-at').textContent();
    const moment = await page.locator('.sa-aud-read .sa-aud-moment').first().textContent();
    check(tag + 'audience: focusing the chart reads out every viewer at a scene', readRows === 8 && /^Sc 1/.test(at) && /Hooked: The coins got me/.test(moment), [readRows, at, moment]);
    for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');
    const gone = await page.locator('.sa-aud-read .sa-aud-row.is-gone').count();
    check(tag + 'audience: past the walkout, the viewer who left is shown as gone', gone === 1 && /^Sc 7/.test(await page.locator('.sa-aud-read .sa-aud-at').textContent()), gone);
    const box = await page.locator('.sa-aud-scrub').boundingBox();
    await page.mouse.move(box.x + box.width * 0.98, box.y + box.height / 2);
    check(tag + 'audience: hovering the end of the chart reads the last scene', /^Sc 40/.test(await page.locator('.sa-aud-read .sa-aud-at').textContent()));
    const aov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(tag + 'audience: no horizontal overflow on Script analysis with the curve', aov <= 0, aov);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'audience-' + width + '-' + theme + '.png'), fullPage: true });

    /* Undo: the partial comes back exactly, and the curve goes */
    await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
    await page.waitForTimeout(800);
    const undone = await docsOf();
    check(tag + 'audience: Undo puts the partial back byte for byte', undone.length === 1 && undone[0].json === partialJSON, undone.map((d) => [d.status, d.parts]));
    check(tag + 'audience: Undo takes the curve off the chart', await page.locator('.sa-aud-block').count() === 0);

    /* A kept run from another draft is labelled, never hidden. The
       document is put back and the script edited with the editor page
       CLOSED, so nothing in its memory writes over either. (Closed
       without beforeunload: the leave prompt rightly warns about a
       script with no draft, and that warning is not what this tests.) */
    await page.close({ runBeforeUnload: false });
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.route(/^https:\/\/(api\.anthropic\.com|generativelanguage\.googleapis\.com)\//, route);
    await p2.route(SB + '/**', handle);
    await p2.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/anthropic\.com|googleapis\.com\/v1beta/.test(u.href), (r) => r.abort());
    await p2.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await p2.evaluate((json) => {
      const b = JSON.parse(localStorage.getItem('fms_script_v1'));
      b.documents = b.documents.filter((d) => !d.audience).concat([JSON.parse(json)]);
      b.elements[1].text += ' A new line in a later draft.';
      localStorage.setItem('fms_script_v1', JSON.stringify(b));
    }, doneJSON);
    requests.length = 0;
    await p2.goto(BASE + '/screenplay.html#analysis', { waitUntil: 'networkidle' });
    await p2.waitForSelector('.sa-aud-block', { timeout: 15000 });
    await p2.waitForFunction(() => { const e = document.querySelector('.sa-aud-draft'); return e && !e.hidden; }, null, { timeout: 10000 }).catch(() => {});
    check(tag + 'audience: a run of an earlier draft is drawn and labelled "from an earlier draft"',
      await p2.locator('.sa-aud-draft').evaluate((e) => !e.hidden && e.textContent === 'from an earlier draft') && !!(await p2.locator('.sa-aud-mean').getAttribute('d')));
    const still = await p2.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1')).documents.filter((d) => d.audience).map((d) => JSON.stringify(d)));
    check(tag + 'audience: opening the tab deleted and rewrote nothing', still.length === 1 && still[0] === doneJSON, still.length);
    check(tag + 'audience: drawing the stored run sent nothing', requests.length === 0, requests.length);
    const ov3 = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(tag + 'audience: no horizontal overflow with the earlier-draft label', ov3 <= 0, ov3);
    if (SHOTS) await p2.screenshot({ path: path.join(SHOTS, 'audience-earlier-' + width + '.png'), fullPage: true });
  }

  check(tag + 'no page errors', errors.length === 0, errors);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
