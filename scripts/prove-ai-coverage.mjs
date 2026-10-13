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

for (const [width, theme, provider] of [[1280, 'ink', 'anthropic'], [390, 'paper', 'gemini'], [390, 'ink', 'anthropic'], [1280, 'paper', 'gemini']]) {
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
  requests.length = 0;
  await page.click('[data-action="cv-voice-run"]');
  await page.waitForSelector('.cv-voice .ai-result', { timeout: 15000 });
  check(tag + 'only ANBU\'s lines were sent', requests.length === 1 && !/Saapittiya/.test(requests[0].user));
  const vrem = await page.locator('.cv-voice .cv-removed').textContent();
  check(tag + 'voice: the fabricated quote is counted', /1 quote removed/.test(vrem), vrem);
  check(tag + 'voice: scene numbers are the script\'s', (await page.locator('.cv-voice .cv-sc').allTextContents()).every((t) => /^Sc (4|9|14|19|24|29|34|39)$/.test(t)));
  await page.locator('[data-action="cv-add-take"]').first().click();
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

  check(tag + 'no page errors', errors.length === 0, errors);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
