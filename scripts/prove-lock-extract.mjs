/* ============================================================
   THE LOCK'S EXTRACTION, END TO END (docs/LOCK-EXTRACT.md, 1 Nov 2026)
   ------------------------------------------------------------
   One fresh profile, the open build, a Short with a three-scene script
   in fms_script_v1 (KITCHEN, STREET with a crowd, BUS) and three things
   typed by hand BEFORE the lock: a Cast & Crew contact (Ravi, DOP), a
   budget row (ci_1: Chai and snacks, typed on the Budget page) and a
   synopsis on the BUS scene.

   A. The lock sheet lists the seven new rows generically next to the old
      ones and one tick per tagged category; props is unticked. The run:
      synopses (first sentence, BUS's own kept), extras 'Students (40)'
      and no bare Crowd, one 'To be cast' Maya contact (Ravi untouched),
      three recce cards, new budget rows (days, no rates, currency
      stamped), one call sheet per shoot day, nothing of the unticked
      kind, "Enhance with AI" locked with no request made.
      Sides print the script text; Auto-Tag's "Accept all <category>"
      tags exactly that category and its Undo takes exactly those back.
      Unlock + lock again writes nothing new; 4s idle writes nothing.
   B. Undo this run, with Maya's contact renamed first: everything it
      wrote goes, the renamed contact stays, the typed records never move.
   C. Undo this run, nothing edited: scenes, contacts, locations and the
      budget return byte for byte (the script stays locked).

       npm run build:open && npm run prove:lock-extract
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5395;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0, passed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}
const url = (p) => `http://localhost:${PORT}/${p}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
let ctx, page;
const aiRequests = [];

function watch(pg) {
  pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  pg.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (/supabase\.co/.test(loc) || /supabase\.co|Failed to load resource|ERR_(TUNNEL|PROXY|NAME|CONNECTION|INTERNET)/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });
  pg.on('request', (r) => {
    if (/anthropic\.com|generativelanguage\.googleapis\.com|openai\.com/.test(r.url())) aiRequests.push(r.url());
  });
}
async function freshContext() {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await c.addInitScript(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__writes.push(k); return set.call(this, k, v); };
  });
  const p = await c.newPage();
  watch(p);
  return [c, p];
}
async function until(fn, arg, ms = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; }
}
/* The open project's blob under `key`, raw (no proxy), as text or JSON. */
const raw = (key) => page.evaluate((k) => { const S = window.StudioStore; return S.rawGet(k + '__' + S.currentProjectId()); }, key);
const json = async (key) => JSON.parse(await raw(key) || 'null');
const rows = async () => ((await json('fms_scenes_v1')) || {}).scenes || [];
/* Every key of the studio, raw, so "byte-identical" means all of it. */
const everything = () => page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  return out;
});
const place = (t) => (String(t).match(/KITCHEN|STREET|BUS/) || [''])[0];

const SCRIPT = [
  { id: 'e0', type: 'scene', text: 'INT. KITCHEN - NIGHT' },
  { id: 'e1', type: 'action', text: 'Maya, 20s, pours tea. A kettle whistles.' },
  { id: 'e2', type: 'character', text: 'MAYA' },
  { id: 'e3', type: 'dialogue', text: 'Not yet. Sit down.' },
  { id: 'e4', type: 'scene', text: 'EXT. STREET - DAY' },
  { id: 'e5', type: 'action', text: 'Forty STUDENTS (40) crowd the stop. A bus waits.' },
  { id: 'e6', type: 'action', text: 'They crowd the door.' },
  { id: 'e7', type: 'scene', text: 'INT. BUS - DAY' },
  { id: 'e8', type: 'action', text: 'Maya sits by the window with a rucksack.' },
  { id: 'e9', type: 'character', text: 'MAYA' },
  { id: 'e10', type: 'dialogue', text: 'Is that the stop?' }
];
const BUS_SYNOPSIS = 'Maya rides home, typed by hand';
const RAVI = { id: 'ct_ravi', name: 'Ravi', role: 'DOP', department: 'Camera', phone: '', email: '', notes: '' };

/* A fresh Short, the walk script seeded, the three hand-made records in
   place. Returns the pre-lock snapshots. */
async function seedProject(title) {
  [ctx, page] = await freshContext();
  await page.goto(url('index.html'));
  await page.click('[data-action="start-short"]');
  await page.fill('#psTitle', title);
  await page.click('#psSubmit');
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {});
  await page.evaluate((els) => {
    const S = window.StudioStore;
    S.rawSet('fms_script_v1__' + S.currentProjectId(), JSON.stringify({ elements: els, revisions: [], documents: [] }));
  }, SCRIPT);
  await page.goto(url('screenplay.html'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  /* Scenes follow the script on an edit (the live sync), so one typed key
     and its backspace is the whole trigger; the text ends as it began. */
  await page.locator('textarea.wr-text').last().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  const synced = await until(() => {
    const S = window.StudioStore;
    const r = (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
    return Number(document.documentElement.dataset.sceneSync || 0) > 0 && r.length === 3;
  });
  if (!synced) throw new Error('the three scene rows never appeared');
  /* The typed budget row goes through the Budget page's own save path,
     which also stamps the budget's currency, as any person's row would. */
  await page.goto(url('budget.html'));
  await page.locator('[data-key="ci_1_custom"]').waitFor({ timeout: 15000 });
  await page.fill('[data-key="ci_1_custom"]', 'Chai and snacks');
  await page.fill('[data-key="ci_1_rate"]', '5000');
  await page.fill('[data-key="ci_1_days"]', '2');
  await until(() => {
    const S = window.StudioStore;
    const c = JSON.parse(S.rawGet('fms_library_calc_v1__' + S.currentProjectId()) || '{}');
    return c.ci_1_custom === 'Chai and snacks' && c.ci_1_rate === '5000' && c.ci_1_days === '2';
  });
  await page.goto(url('dashboard.html'));
  await page.evaluate(([ravi, syn]) => {
    const S = window.StudioStore;
    const pid = S.currentProjectId();
    const ck = 'fms_contacts_v1__' + pid;
    const c = JSON.parse(S.rawGet(ck) || '{"contacts":[],"callSheets":[]}');
    c.contacts = [...(c.contacts || []), ravi];
    S.rawSet(ck, JSON.stringify(c));
    const sk = 'fms_scenes_v1__' + pid;
    const all = JSON.parse(S.rawGet(sk));
    const bus = all.scenes.find((s) => /BUS/i.test(s.location || ''));
    bus.synopsis = syn;
    S.rawSet(sk, JSON.stringify(all));
  }, [RAVI, BUS_SYNOPSIS]);
  const calc = await json('fms_library_calc_v1');
  const snap = {
    scenes: await raw('fms_scenes_v1'), contacts: await raw('fms_contacts_v1'),
    locations: await raw('fms_locations_v1'), calc: await raw('fms_library_calc_v1'),
    ravi: JSON.stringify(((await json('fms_contacts_v1')).contacts || []).find((c) => c.id === 'ct_ravi')),
    ci1: JSON.stringify(Object.fromEntries(Object.entries(calc).filter(([k]) => /^ci_1_/.test(k)))),
    busSyn: BUS_SYNOPSIS
  };
  return snap;
}

/* Open the lock sheet. `untick` is a category id to leave unticked. */
async function openLock() {
  await page.goto(url('screenplay.html#lock'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  return until(() => document.querySelector('#lock.lk-review [data-step]'));
}
async function lockAndRun(untick) {
  if (untick) await page.uncheck(`input[data-lock-cat="${untick}"]`);
  await page.click('[data-action="lock-confirm"]');
  return until(() => document.querySelector('[data-pipeline="done"]'), null, 30000);
}
const bySceneName = (rs, name) => rs.find((s) => new RegExp(name, 'i').test(s.location || ''));
const catList = (s) => Object.keys(s.elements || {}).filter((k) => (s.elements[k] || []).length);
const addedOnly = (before, after) => Object.keys(after).filter((k) => before[k] !== after[k]);

try {
  /* ================= A ================= */
  const pre = await seedProject('Lock Extract A');
  check('0. the walk script produced three scenes: KITCHEN, STREET, BUS',
    (await rows()).map((s) => place(s.location)), ['KITCHEN', 'STREET', 'BUS']);
  check('0. Ravi, ci_1 and the BUS synopsis are in place before the lock',
    [JSON.parse(pre.ravi).role, JSON.parse(pre.ci1).ci_1_custom, bySceneName(await rows(), 'BUS').synopsis], ['DOP', 'Chai and snacks', BUS_SYNOPSIS]);
  const preCurrency = (await json('fms_library_calc_v1')).ci_currency;
  check('0. the Budget page stamped a currency on the typed row', typeof preCurrency, 'string');

  check('1. #lock opens the review sheet', await openLock(), true);
  const stepIds = await page.$$eval('#lock [data-step]', (els) => els.map((e) => e.dataset.step));
  const NEW = ['synopsis', 'extras', 'tags', 'castcontacts', 'recce', 'sheets', 'budgetlines'];
  const OLD = ['scenes', 'characters', 'locations', 'props', 'shots', 'days', 'budget', 'analysis'];
  check('1. the sheet lists the seven new rows, generically, next to the old ones',
    [NEW.every((id) => stepIds.includes(id)), OLD.every((id) => stepIds.includes(id))], [true, true]);
  check('1. the new rows read in the doc\'s order',
    stepIds.filter((id) => NEW.includes(id)), NEW);
  const labels = await page.$$eval('#lock [data-step]', (els) => Object.fromEntries(els.map((e) => [e.dataset.step, e.querySelector('.lk-step-label')?.innerText || ''])));
  check('1. their labels are the plain ones (synopses, background, pre-tagged, cast contacts, recce, call sheets, budget lines)',
    [/synops/i.test(labels.synopsis), /background/i.test(labels.extras), /pre-tagged/i.test(labels.tags), /cast contacts/i.test(labels.castcontacts), /recce/i.test(labels.recce), /call sheets/i.test(labels.sheets), /budget lines/i.test(labels.budgetlines)],
    [true, true, true, true, true, true, true]);
  const cats = await page.$$eval('fieldset.lk-cats input[data-lock-cat]', (els) => els.map((e) => [e.dataset.lockCat, e.checked]));
  check('1. lk-cats offers props and background (extras), every box ticked',
    [cats.length > 0, cats.every(([, on]) => on), cats.some(([id]) => id === 'props'), cats.some(([id]) => id === 'extras')], [true, true, true, true]);
  const tickedCats = cats.map(([id]) => id).filter((id) => id !== 'props');

  check('1. confirm with props unticked: the run reaches done', await lockAndRun('props'), true);
  const done = await page.evaluate(() => ({
    line: document.querySelector('.pl-sumline')?.innerText || '',
    pill: (() => { const b = document.querySelector('.pl-ai .ai-pill'); return b && { locked: b.dataset.aiState, aria: b.getAttribute('aria-disabled'), text: b.innerText.replace(/\s+/g, ' ').trim() }; })(),
    aiBlock: !!document.querySelector('.pl-ai')
  }));
  check('7. done state shows the Enhance with AI block, its pill locked (Pro off)',
    [done.aiBlock, done.pill && /Enhance with AI/.test(done.pill.text), done.pill && done.pill.locked, done.pill && done.pill.aria], [true, true, 'locked', 'true']);

  const after = {
    scenes: await rows(), contacts: await json('fms_contacts_v1'), locations: await json('fms_locations_v1'), calc: await json('fms_library_calc_v1'),
    script: await json('fms_script_v1')
  };
  const kit = bySceneName(after.scenes, 'KITCHEN'), street = bySceneName(after.scenes, 'STREET'), bus = bySceneName(after.scenes, 'BUS');
  check('4. the script is locked (the lock itself)', after.script.numbering && after.script.numbering.locked === true, true);

  /* (1) synopses */
  const syn = (s) => String(s.synopsis || '');
  check('(1) KITCHEN synopsis is the first action sentence', syn(kit), 'Maya, 20s, pours tea.');
  check('(1) STREET synopsis is the first action sentence', syn(street), 'Forty STUDENTS (40) crowd the stop.');
  check('(1) every filled synopsis is <= 140 chars (+ the ellipsis)', [kit, street].every((s) => syn(s).length > 0 && syn(s).length <= 141), true);
  check('(1) the typed BUS synopsis is unchanged', syn(bus), BUS_SYNOPSIS);
  /* (2) extras */
  check('(2) STREET extras is exactly Students (40), no bare Crowd',
    [street.elements.extras, (street.elements.extras || []).some((x) => /^crowd/i.test(x))], [['Students (40)'], false]);
  /* (3) cast contacts */
  const contacts = after.contacts.contacts || [];
  const mayas = contacts.filter((c) => c.role === 'Maya');
  check('(3) exactly one Maya contact: name To be cast, department Cast',
    [mayas.length, mayas[0] && mayas[0].name, mayas[0] && mayas[0].department], [1, 'To be cast', 'Cast']);
  check('(3) the typed Ravi contact is byte-identical', JSON.stringify(contacts.find((c) => c.id === 'ct_ravi')), pre.ravi);
  check('(3) two contacts in all (Ravi, Maya)', contacts.length, 2);
  /* (4) recce */
  check('(4) recces has exactly the keys bus, kitchen, street', Object.keys(after.locations.recces || {}).sort(), ['bus', 'kitchen', 'street']);
  /* (5) budget */
  const calc = after.calc;
  const idx = Object.keys(calc).map((k) => (k.match(/^ci_(\d+)_/) || [])[1]).filter(Boolean).map(Number);
  /* The Budget page saved its blank default rows (2..5) when the typed row
     was entered, so "above the old max index" is read from the pre-lock blob. */
  const maxOld = Math.max(...Object.keys(JSON.parse(pre.calc)).map((k) => Number((k.match(/^ci_(\d+)_/) || [0, 0])[1])));
  const fresh = [...new Set(idx)].filter((n) => n > maxOld).sort((a, b) => a - b);
  const name = (n) => calc['ci_' + n + '_custom'];
  const names = fresh.map(name);
  check('(5) new rows sit above the old max index and each has days filled',
    [fresh.length > 0, fresh.every((n) => String(calc['ci_' + n + '_days'] || '').trim() !== '')], [true, true]);
  check('(5) no new row has a rate key at all', fresh.filter((n) => ('ci_' + n + '_rate') in calc), []);
  check('(5) the expected lines exist: Cast: Maya, Background extras (peak 40), Unit shoot days',
    ['Cast: Maya', 'Background extras (peak 40)', 'Unit shoot days'].map((x) => names.includes(x)), [true, true, true]);
  check('(5) three Location rows', names.filter((x) => /^Location: /.test(x)).length, 3);
  check('(5) ci_1_* is unchanged byte for byte',
    JSON.stringify(Object.fromEntries(Object.entries(calc).filter(([k]) => /^ci_1_/.test(k)))), pre.ci1);
  check('(5) ci_currency is present and is the film\'s (the stamp the typed row got)', [typeof calc.ci_currency, calc.ci_currency], ['string', preCurrency]);
  /* (6) call sheets */
  const sheets = after.contacts.callSheets || [];
  const dayIds = {};
  for (const s of after.scenes) { const d = String(s.shootDay || ''); if (d) (dayIds[d] = dayIds[d] || []).push(s.id); }
  const days = Object.keys(dayIds);
  const mayaId = mayas[0] && mayas[0].id;
  check('(6) one call sheet per shoot day, no more', [days.length > 0, sheets.length], [true, days.length]);
  check('(6) each sheet holds exactly its day\'s scenes',
    days.every((d) => sheets.some((sh) => JSON.stringify([...sh.sceneIds].sort()) === JSON.stringify([...dayIds[d]].sort()))), true);
  check('(6) Maya\'s id is in calls on exactly the days she appears; general call and wrap blank',
    days.every((d) => {
      const sh = sheets.find((x) => JSON.stringify([...x.sceneIds].sort()) === JSON.stringify([...dayIds[d]].sort()));
      const she = dayIds[d].some((id) => [kit.id, bus.id].includes(id));
      return !!sh && (mayaId in (sh.calls || {})) === she && !sh.generalCall && !sh.wrap;
    }), true);
  /* (7) the unticked category */
  check('(7) the unticked category (props) tagged nothing on any scene', after.scenes.flatMap((s) => (s.elements && s.elements.props) || []), []);
  const ticked = [...new Set(after.scenes.flatMap(catList))];
  check('(7) a ticked category did tag (the lock is not a no-op)', tickedCats.filter((c) => c !== 'extras').every((c) => ticked.includes(c)) && ticked.includes('extras'), true);
  check('(7) no AI request was made, and the run wrote nothing more of its own for AI',
    aiRequests, []);

  /* the sheet's summary strip, while it is still open */
  const stats = await page.$$eval('.pl-stats .k-stat, .pl-stats > *', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
  check('7. the done strip adds Cast contacts, Call sheets and Budget lines', [/Cast contacts/.test(stats), /Call sheets/.test(stats), /Budget lines/.test(stats)], [true, true, true]);
  const afterFirstRun = await everything();
  await page.keyboard.press('Escape');

  /* ---- sides: the script text prints with the scene ---- */
  await page.goto(url('reports.html#sides'));
  await page.locator('input[data-action="side-toggle"]').first().waitFor({ timeout: 15000 });
  const streetId = street.id;
  await page.check(`input[data-action="side-toggle"][data-scene="${streetId}"]`);
  const streetScript = () => [...document.querySelectorAll('#rp-sides-out article.rp-side')]
    .find((a) => /STREET/.test(a.querySelector('.rp-side-slug')?.innerText || ''))?.querySelector('.rp-side-script')?.innerText || '';
  check('sides: the STREET block prints its script text inside .rp-side-script',
    await until(() => /Forty STUDENTS \(40\) crowd the stop/.test((() => [...document.querySelectorAll('#rp-sides-out article.rp-side')]
      .find((a) => /STREET/.test(a.querySelector('.rp-side-slug')?.innerText || ''))?.querySelector('.rp-side-script')?.innerText || '')())), true);
  check('sides: it also names its script page count', /\bpages?\b/.test(await page.evaluate(streetScript)), true);

  /* ---- Auto-Tag: Accept all <category> ---- */
  await page.goto(url('breakdown.html#suggest'));
  await page.locator('button[data-action="sug-cat"]').first().waitFor({ timeout: 15000 });
  const catBtn = await page.$$eval('button[data-action="sug-cat"]', (els) => els.map((e) => [e.dataset.cat, e.innerText.trim()]));
  check('suggest: props has a remaining suggestion and an "Accept all Props" button', catBtn.some(([c, t]) => c === 'props' && t === 'Accept all Props'), true);
  const beforeTag = await rows();
  await page.click('button[data-action="sug-cat"][data-cat="props"]');
  check('suggest: pressing it tags props', await until(() => /Tagged \d+ element/.test(document.querySelector('.toast-host')?.innerText || '')), true);
  const tagged = await rows();
  const diff = tagged.flatMap((s) => {
    const was = beforeTag.find((x) => x.id === s.id);
    return Object.keys(s.elements || {}).flatMap((c) => (s.elements[c] || []).filter((n) => !((was.elements || {})[c] || []).includes(n)).map((n) => c));
  });
  check('suggest: exactly that category was added, and more than nothing', [diff.length > 0, [...new Set(diff)]], [true, ['props']]);
  await page.locator('.toast-action', { hasText: /^Undo$/ }).last().click();
  /* Scenes.untagMany leaves an emptied category as [] (as Add all's Undo
     always has), so "exactly those tags" compares the tags themselves. */
  const tagsOf = (rs) => JSON.stringify(rs.map((s) => [s.id, Object.keys(s.elements || {}).sort().map((c) => [c, s.elements[c]]).filter(([, v]) => v.length)]));
  check('suggest: the toast Undo removes exactly those tags (every scene\'s tags as before)',
    await until(() => /Removed the \d+ tag/.test(document.querySelector('.toast-host')?.innerText || '')) && tagsOf(await rows()), tagsOf(beforeTag));

  /* ---- idempotence: unlock, lock again ---- */
  await page.goto(url('screenplay.html'));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('#scTop .tb-menu')].find((x) => x.querySelector('[data-action="sc-unlock"]'));
    m.querySelector('.tb-menu-btn').click();
  });
  await page.click('[data-action="sc-unlock"]', { timeout: 5000 });
  await page.click('.k-modal .mbtn.danger, .k-modal .mbtn.primary');
  await until(() => { const S = window.StudioStore; const x = JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()) || 'null'); return x && !x.numbering; });
  /* the unlock's own renumbering may touch the script and the rows; capture
     the studio as it stands now, then lock again and diff */
  await openLock();
  await page.uncheck('input[data-lock-cat="props"]').catch(() => {});
  const beforeRelock = await everything();
  await page.click('[data-action="lock-confirm"]');
  check('idempotence: the second lock run finishes', await until(() => document.querySelector('[data-pipeline="done"]'), null, 30000), true);
  const rerun = await page.evaluate(() => document.querySelector('.pl-sumline')?.innerText || '');
  check('idempotence: the second run reports nothing made (no contacts, recce, sheets or budget lines)',
    /cast contacts|recce card|call sheet|budget lines/i.test(rerun), false);
  const afterRelock = await everything();
  /* The lock's own save moves the script blob and the two bookkeeping
     stamps every save moves (project updated-at, sync meta); nothing else. */
  const changed = addedOnly(beforeRelock, afterRelock).filter((k) => !/^fms_script_v1__|^fms_studio_projects_v1$|^fms_studio_sync_meta_v1$/.test(k));
  check('idempotence: the relock wrote nothing but the lock itself (every other key byte-identical)', changed, []);
  /* The suggest step above tagged and untagged props, leaving "props": [] on
     two scenes (Scenes.untagMany); scenes are compared without empty lists. */
  const pruneScenes = (t) => JSON.stringify(JSON.parse(t).scenes.map((s) => ({ ...s, elements: Object.fromEntries(Object.entries(s.elements || {}).filter(([, v]) => v.length)) })));
  const sameKey = (k) => Object.keys(afterRelock).filter((x) => x.startsWith(k + '__')).every((x) => k === 'fms_scenes_v1' ? pruneScenes(afterFirstRun[x]) === pruneScenes(afterRelock[x]) : afterFirstRun[x] === afterRelock[x]);
  check('idempotence: against the FIRST run, scenes, contacts, locations and budget are identical',
    ['fms_scenes_v1', 'fms_contacts_v1', 'fms_locations_v1', 'fms_library_calc_v1'].map(sameKey), [true, true, true, true]);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__writes = []; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 4000)));   // the idle window itself
  check('idle: no localStorage write in 4s', await page.evaluate(() => window.__writes), []);
  await ctx.close();

  /* ================= B: undo with an edited seeded contact ================= */
  const preB = await seedProject('Lock Extract B');
  await openLock();
  await lockAndRun('props');
  const midB = await json('fms_contacts_v1');
  const mayaB = midB.contacts.find((c) => c.role === 'Maya');
  await page.evaluate((id) => {
    const S = window.StudioStore;
    const k = 'fms_contacts_v1__' + S.currentProjectId();
    const d = JSON.parse(S.rawGet(k));
    d.contacts.find((c) => c.id === id).name = 'Anjali';
    S.rawSet(k, JSON.stringify(d));
  }, mayaB.id);
  await page.click('[data-action="pipeline-undo"]');
  await until(() => !JSON.parse(window.StudioStore.rawGet('fms_locations_v1__' + window.StudioStore.currentProjectId()) || '{}').recces
    || Object.keys(JSON.parse(window.StudioStore.rawGet('fms_locations_v1__' + window.StudioStore.currentProjectId()) || '{}').recces).length === 0);
  const afterB = {
    contacts: await json('fms_contacts_v1'), scenes: await rows(), locations: await raw('fms_locations_v1'), calc: await raw('fms_library_calc_v1'),
    script: await json('fms_script_v1')
  };
  const peopleB = afterB.contacts.contacts || [];
  check('B. the renamed Maya contact is kept (name Anjali, role Maya)', peopleB.filter((c) => c.role === 'Maya').map((c) => c.name), ['Anjali']);
  check('B. the typed Ravi contact is untouched', JSON.stringify(peopleB.find((c) => c.id === 'ct_ravi')), preB.ravi);
  check('B. nothing else the run seeded is left in contacts (Ravi + Anjali only) and its call sheets are gone',
    [peopleB.length, (afterB.contacts.callSheets || []).length], [2, 0]);
  check('B. locations are back byte for byte', afterB.locations, preB.locations);
  check('B. budget is back byte for byte; the Chai row never moved', [afterB.calc, JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(afterB.calc)).filter(([k]) => /^ci_1_/.test(k))))], [preB.calc, preB.ci1]);
  check('B. the BUS typed synopsis is untouched', bySceneName(afterB.scenes, 'BUS').synopsis, BUS_SYNOPSIS);
  check('B. the script stays locked', afterB.script.numbering && afterB.script.numbering.locked, true);
  await ctx.close();

  /* ================= C: undo, nothing edited ================= */
  const preC = await seedProject('Lock Extract C');
  await openLock();
  await lockAndRun('props');
  await page.click('[data-action="pipeline-undo"]');
  await until(() => {
    const S = window.StudioStore;
    const l = JSON.parse(S.rawGet('fms_locations_v1__' + S.currentProjectId()) || '{}');
    return !l.recces || Object.keys(l.recces).length === 0;
  });
  const afterC = {
    scenes: await raw('fms_scenes_v1'), contacts: await raw('fms_contacts_v1'), locations: await raw('fms_locations_v1'),
    calc: await raw('fms_library_calc_v1'), script: await json('fms_script_v1')
  };
  check('C. fms_scenes_v1 is back byte for byte', afterC.scenes, preC.scenes);
  check('C. fms_contacts_v1 is back byte for byte', afterC.contacts, preC.contacts);
  check('C. fms_locations_v1 is back byte for byte', afterC.locations, preC.locations);
  check('C. fms_library_calc_v1 is back byte for byte', afterC.calc, preC.calc);
  check('C. the script stays locked after the undo', afterC.script.numbering && afterC.script.numbering.locked, true);

  check('no page error or console error', errors, []);
  check('no AI request across the whole walk', aiRequests, []);
} catch (e) {
  failed++;
  console.log('FAIL  the walk threw: ' + (e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
