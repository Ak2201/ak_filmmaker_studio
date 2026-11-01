/* ============================================================
   THE SCRIPT LOCK, END TO END (docs/SCRIPT-LOCK.md, 1 Nov 2026)
   ------------------------------------------------------------
   One fresh profile, the open build, a Short with three typed scenes:
     the soft-gate bar is a DRAFT bar on the Breakdown and the Stripboard
     (first child of main, a link to screenplay.html#lock, the old
     sb-lock button gone, no overflow at 390);
     screenplay.html#lock shows the review (facts), "Lock and generate"
     runs the rules pass (no AI block), and the blob holds numbering.base
     = a draft id, ids for 3 scenes and no `reviewed`; typed cast,
     synopsis and shootDay survive it;
     the locked bar reads Locked + White with a swatch and no changes,
     and writes nothing in four idle seconds;
     an edit and a NEW heading typed after the lock are HELD: the rows
     stay 3, the heading is numbered 1A;
     the change report lists 1A (added) and 2 (changed) with their
     downstream impact (day, shots, call sheet, sides, budget);
     Mark reviewed / Add to Breakdown act on the items, the marks persist
     over a reload and an edit brings an item back;
     Unlock (File menu) warns about renumbering and the cleared report,
     then renumbers 1..4 by position and keeps every typed field and the
     call sheet's scene id;
     a LEGACY lock (no base) reads Locked, offers "Start change tracking",
     is never written by a read, and is not held.

       npm run build:open && npm run prove:script-lock
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5394;
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
const pages = [];

function watch(pg) {
  pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  pg.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (/supabase\.co/.test(loc) || /supabase\.co|Failed to load resource|ERR_(TUNNEL|PROXY|NAME|CONNECTION|INTERNET)/.test(m.text())) return;
    errors.push('console: ' + m.text());
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
  pages.push(c);
  return [c, p];
}

/* Poll a page-side function for a signal; never a fixed sleep. */
async function until(fn, arg, ms = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; }
}
/* The open project's scoped blobs, read raw (no proxy). */
const blob = () => page.evaluate(() => {
  const S = window.StudioStore;
  return JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()) || 'null');
});
const rawBlob = () => page.evaluate(() => {
  const S = window.StudioStore;
  return S.rawGet('fms_script_v1__' + S.currentProjectId());
});
const rows = () => page.evaluate(() => {
  const S = window.StudioStore;
  return (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
});
const patchKey = (name, src) => page.evaluate(([n, code]) => {
  const S = window.StudioStore;
  const k = n + '__' + S.currentProjectId();
  const v = JSON.parse(S.rawGet(k) || 'null');
  const out = new Function('v', code)(v);
  S.rawSet(k, JSON.stringify(out === undefined ? v : out));
}, [name, src]);
const syncCount = () => page.evaluate(() => Number(document.documentElement.dataset.sceneSync || 0));
const waitBar = (state) => until((s) => {
  const b = document.getElementById('lockBar');
  return b && !b.hasAttribute('data-pending') && (!s || b.dataset.state === s);
}, state);
/* The bar, once it has answered. */
async function barOn(file, state) {
  await page.goto(url(file));
  await waitBar(state);
  return page.evaluate(() => {
    const b = document.getElementById('lockBar');
    if (!b) return null;
    return {
      state: b.dataset.state || '', open: b.dataset.open ?? null, text: b.innerText.replace(/\s+/g, ' ').trim(),
      first: !!b.parentElement && b.parentElement.tagName === 'MAIN' && b.parentElement.firstElementChild === b,
      go: b.querySelector('a.lk-go')?.getAttribute('href') || null,
      swatch: !!b.querySelector('span.dr-swatch.c-white'),
      report: !!b.querySelector('[data-action="lock-report"]'),
      track: /Start change tracking/i.test(b.innerText)
    };
  });
}
/* The Breakdown's rows, with their heading element ids, in script order. */
async function rowsByHeading() {
  const [b, r] = [await blob(), await rows()];
  const heads = b.elements.filter((e) => e.type === 'scene');
  return heads.map((e) => ({ el: e, row: r.find((x) => x.scriptElId === e.id) || null }));
}
const place = (t) => (String(t).match(/KITCHEN|STREET|CAFE|BUS|LIBRARY/) || [''])[0];
const kb = () => page.keyboard;
/* Click into the editor line holding `text`, caret at its end. */
async function caretAtEndOf(text) {
  const at = await page.evaluate((t) => [...document.querySelectorAll('textarea.wr-text')].findIndex((x) => x.value.includes(t)), text);
  if (at < 0) throw new Error('no editor line holds: ' + text);
  await page.locator('textarea.wr-text').nth(at).click();
  await kb().press('Control+End');
}
async function openScreenplay(hash = '') {
  await page.goto(url('screenplay.html' + hash));
  await page.locator('textarea.wr-text').first().waitFor({ timeout: 15000 });
  await until(() => document.querySelector('.wr-text')?.value);
}
async function openReport() {
  await page.click('#lockBar [data-action="lock-report"]');
  return until(() => document.querySelector('#changes.lk-report'));
}
const itemInfo = (key) => page.evaluate((k) => {
  const it = document.querySelector(`#changes [data-lock-item][data-key="${k}"]`);
  if (!it) return null;
  const imp = (id) => { const e = it.querySelector(`[data-impact="${id}"]`); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; };
  return {
    kind: it.dataset.kind, reviewed: it.dataset.reviewed,
    day: imp('day'), shots: imp('shots'), sheets: imp('sheets'), sides: imp('sides'), budget: imp('budget')
  };
}, key);

try {
  /* ---- 0. fresh context; hub -> Short door -> dashboard ---- */
  [ctx, page] = await freshContext();
  await page.goto(url('index.html'));
  await page.click('[data-action="start-short"]');
  await page.fill('#psTitle', 'Lock Test');
  await page.click('#psSubmit');
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {});
  check('0. creating a Short lands on the dashboard', /dashboard\.html/.test(page.url()), true);

  /* ---- 1. three scenes, typed with the editor's own keys ---- */
  await openScreenplay();
  await page.locator('textarea.wr-text').first().click();
  await kb().type('INT. KITCHEN - NIGHT'); await kb().press('Enter');
  await kb().type('Maya stirs cold tea at the counter.'); await kb().press('Enter');
  await kb().press('Tab'); await kb().type('MAYA'); await kb().press('Enter');
  await kb().type('I will miss the last bus.'); await kb().press('Enter'); await kb().press('Enter');
  await kb().press('Alt+1'); await kb().type('EXT. STREET - DAY'); await kb().press('Enter');
  await kb().type('Maya runs past the closing bus stop.'); await kb().press('Enter');
  await kb().press('Alt+1'); await kb().type('INT. BUS - DAY'); await kb().press('Enter');
  await kb().type('Maya sits by the window, finally still.'); await kb().press('Enter');
  await kb().press('Alt+3'); await kb().type('MAYA'); await kb().press('Enter');
  await kb().type('Home, at last.'); await kb().press('Enter');
  check('1. the live sync advanced and the scene rows are 3, numbered 1,2,3', await until(() => {
    const S = window.StudioStore;
    const r = (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
    return Number(document.documentElement.dataset.sceneSync || 0) > 0
      && r.length === 3 && r.map((x) => String(x.number)).join() === '1,2,3';
  }), true);
  const typed = await rowsByHeading();
  check('1. rows follow the script: KITCHEN, STREET, BUS', typed.map((x) => place(x.el.text)), ['KITCHEN', 'STREET', 'BUS']);

  /* ---- 2. typed fields, a call sheet, a reload ---- */
  const ids = typed.map((x) => x.row && x.row.id);
  await page.goto(url('dashboard.html'));
  await page.evaluate(([r1, r2]) => {
    const S = window.StudioStore;
    const pid = S.currentProjectId();
    const sk = 'fms_scenes_v1__' + pid;
    const all = JSON.parse(S.rawGet(sk));
    for (const s of all.scenes) {
      if (s.id === r1) {
        s.elements = { ...(s.elements || {}) };
        s.elements.cast = [...(s.elements.cast || []), 'RAVI'];
        s.synopsis = 'Maya burns the toast';
      }
      if (s.id === r2) s.shootDay = '2';
    }
    S.rawSet(sk, JSON.stringify(all));
    const ck = 'fms_contacts_v1__' + pid;
    const c = JSON.parse(S.rawGet(ck) || '{"contacts":[],"callSheets":[]}');
    c.callSheets = [...(c.callSheets || []), { title: 'Day 2 sheet', date: '2026-11-20', sceneIds: [r2] }];
    S.rawSet(ck, JSON.stringify(c));
  }, [ids[0], ids[1]]);
  await page.reload();
  const r0 = await rows();
  check('2. typed fields are stored (RAVI, synopsis, shootDay 2)',
    [r0.find((x) => x.id === ids[0]).elements.cast.includes('RAVI'), r0.find((x) => x.id === ids[0]).synopsis, String(r0.find((x) => x.id === ids[1]).shootDay)],
    [true, 'Maya burns the toast', '2']);

  /* ---- 3. the DRAFT bar on Breakdown and Stripboard ---- */
  let b = await barOn('breakdown.html', 'draft');
  check('3. breakdown: #lockBar is a draft bar, first child of main, linking to the lock', [b.state, b.first, b.go], ['draft', true, 'screenplay.html#lock']);
  b = await barOn('stripboard.html', 'draft');
  check('3. stripboard: #lockBar is a draft bar, first child of main, linking to the lock', [b.state, b.first, b.go], ['draft', true, 'screenplay.html#lock']);
  check('3. stripboard: no sb-lock button any more', await page.locator('[data-action="sb-lock"]').count(), 0);
  check('3. stripboard: .sb-lock-btn is a link to the one lock',
    await until(() => document.querySelector('.sb-lock-btn')) && await page.$eval('.sb-lock-btn', (a) => [a.tagName, a.getAttribute('href')]), ['A', 'screenplay.html#lock']);
  await page.setViewportSize({ width: 390, height: 844 });
  await barOn('breakdown.html', 'draft');
  check('3. breakdown: no horizontal overflow at 390', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ---- 4. the lock ---- */
  await openScreenplay('#lock');
  check('4. #lock opens the review sheet', await until(() => document.querySelector('#lock.lk-review [data-lock-fact]')), true);
  const facts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#lock [data-lock-fact]')]
    .map((e) => [e.dataset.lockFact, parseInt((e.innerText.match(/\d+/) || [''])[0], 10)])));
  check('4. facts: 3 scenes, cast >= 1, 3 locations, elements and extras present',
    [facts.scenes, facts.cast >= 1, facts.locations, 'elements' in facts, 'extras' in facts], [3, true, 3, true, true]);
  await page.click('[data-action="lock-confirm"]');
  check('4. the pass finishes ([data-pipeline="done"])', await until(() => document.querySelector('[data-pipeline="done"]'), null, 30000), true);
  /* Phase 2 (docs/LOCK-EXTRACT.md): the done state offers "Enhance with AI"; with no Pro plan the pill is locked and nothing is requested. */
  check('4. the done state has the Enhance with AI block, its pill locked (Pro off)',
    [await page.locator('.pl-ai').count(), await page.locator('.pl-ai .ai-pill').getAttribute('data-ai-state')], [1, 'locked']);
  const locked = await blob();
  const n = locked.numbering || {};
  check('4. blob: locked, base names a draft, 3 ids, no reviewed',
    [n.locked === true, locked.revisions.some((r) => r.id === n.base), Object.keys(n.ids || {}).length, 'reviewed' in n], [true, true, 3, false]);
  const lr = await rows();
  const kitchen = lr.find((x) => x.id === ids[0]);
  check('4. rows: 3, numbered 1,2,3', [lr.length, lr.map((x) => String(x.number)).join()], [3, '1,2,3']);
  check('4. typed fields survive: RAVI, synopsis, shootDay 2',
    [kitchen.elements.cast.includes('RAVI'), kitchen.synopsis, String(lr.find((x) => x.id === ids[1]).shootDay)],
    [true, 'Maya burns the toast', '2']);
  await page.keyboard.press('Escape');

  /* ---- 5. the LOCKED bar ---- */
  for (const f of ['breakdown.html', 'stripboard.html']) {
    b = await barOn(f, 'locked');
    check(`5. ${f}: locked bar, Locked + White + swatch, no changes`,
      [b.state, /Locked/.test(b.text), /White/.test(b.text), b.swatch, b.open, /no script changes since the lock/i.test(b.text)],
      ['locked', true, true, true, '0', true]);
  }
  await page.evaluate(() => { window.__writes = []; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 4000)));   // the idle window itself, not a wait for a signal
  check('5. no localStorage write in 4s idle on the stripboard', await page.evaluate(() => window.__writes), []);

  /* ---- 6. edit after the lock: held ---- */
  await openScreenplay();
  const before6 = await syncCount();
  await caretAtEndOf('Maya runs past');
  await kb().press('Enter'); await kb().type('A tram bell rings.');
  await caretAtEndOf('I will miss the last bus.');
  await kb().press('Enter');
  await kb().press('Alt+1'); await kb().type('INT. CAFE - DAY'); await kb().press('Enter');
  await kb().type('Steam on the window.'); await kb().press('Enter');
  check('6. saved, and the held sync ran', await until((c) => {
    const S = window.StudioStore;
    const x = JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()) || 'null');
    return Number(document.documentElement.dataset.sceneSync || 0) > c && x
      && x.elements.some((e) => /CAFE/.test(e.text)) && x.elements.some((e) => /tram bell/.test(e.text));
  }, before6), true);
  check('6. held: the Breakdown still has 3 rows', (await rows()).length, 3);
  const afterEdit = await blob();
  const cafe = afterEdit.elements.find((e) => e.type === 'scene' && /CAFE/.test(e.text));
  check('6. the new heading is numbered 1A', afterEdit.numbering.ids && afterEdit.numbering.ids[cafe.id] && afterEdit.numbering.ids[cafe.id].n, '1A');

  /* ---- 7. the change report ---- */
  b = await barOn('stripboard.html', 'locked');
  check('7. stripboard bar counts 2 changes', b.open, '2');
  check('7. the report sheet opens', await openReport(), true);
  const i1a = await itemInfo('1A');
  const i2 = await itemInfo('2');
  check('7. report holds 1A (added) and 2 (changed)', [i1a && i1a.kind, i2 && i2.kind], ['added', 'changed']);
  check('7. item 2: day impact mentions Day 2', /Day 2/.test((i2 && i2.day) || ''), true);
  check('7. item 2: shots impact shows >= 1 (from the pass)', parseInt(((i2 && i2.shots) || '').match(/\d+/)?.[0] || '0', 10) >= 1, true);
  check('7. item 2: sheets impact names Day 2 sheet', /Day 2 sheet/.test((i2 && i2.sheets) || ''), true);
  check('7. item 2: sides impact is present', !!(i2 && i2.sides), true);
  check('7. item 1A: budget impact says it is not on a day', /not counted in the budget/i.test((i1a && i1a.budget) || ''), true);

  /* ---- 8. review ---- */
  await page.click('#changes [data-lock-item][data-key="2"] [data-lock-act="review"]');
  check('8. Mark reviewed on item 2 -> data-reviewed true',
    await until(() => document.querySelector('#changes [data-lock-item][data-key="2"]')?.dataset.reviewed === 'true'), true);
  await page.click('#changes [data-lock-item][data-key="1A"] [data-lock-act="add"]');
  check('8. Add to Breakdown -> 4 rows, the new one numbered 1A', await until(() => {
    const S = window.StudioStore;
    const r = (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
    return r.length === 4 && r.some((x) => String(x.number).toUpperCase() === '1A');
  }), true);
  check('8. the bar reads 0 open', await until(() => document.getElementById('lockBar')?.dataset.open === '0'), true);
  const marked = await blob();
  check('8. numbering.reviewed has keys 2 and 1A', Object.keys(marked.numbering.reviewed || {}).sort(), ['1A', '2']);
  await page.keyboard.press('Escape');
  await page.reload();
  await waitBar('locked');
  check('8. after a reload the marks persist (open 0)', await page.evaluate(() => document.getElementById('lockBar').dataset.open), '0');
  const rr = await rows();
  const sameFields = () => {
    const k = rr.find((x) => x.id === ids[0]);
    return [k.elements.cast.includes('RAVI'), k.synopsis, String(rr.find((x) => x.id === ids[1]).shootDay)];
  };
  check('8. RAVI, synopsis and shootDay 2 unchanged', sameFields(), [true, 'Maya burns the toast', '2']);
  await openScreenplay();
  await caretAtEndOf('A tram bell rings.');
  await kb().type(' It rings again.');
  check('8. the second edit of scene 2 is saved', await until(() => {
    const S = window.StudioStore;
    const x = JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()) || 'null');
    return x && x.elements.some((e) => /rings again/.test(e.text));
  }), true);
  await barOn('stripboard.html', 'locked');
  await openReport();
  check('8. editing scene 2 again brings its item back (data-reviewed false)', (await itemInfo('2') || {}).reviewed, 'false');
  const rr2 = await rows();
  check('8. RAVI, synopsis and shootDay 2 still unchanged',
    [rr2.find((x) => x.id === ids[0]).elements.cast.includes('RAVI'), rr2.find((x) => x.id === ids[0]).synopsis, String(rr2.find((x) => x.id === ids[1]).shootDay)],
    [true, 'Maya burns the toast', '2']);
  await page.keyboard.press('Escape');

  /* ---- 9. unlock, from the File menu ---- */
  await openScreenplay();
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('#scTop .tb-menu')].find((x) => x.querySelector('[data-action="sc-unlock"]'));
    m.querySelector('.tb-menu-btn').click();
  });
  await page.click('[data-action="sc-unlock"]', { timeout: 5000 });
  check('9. a .k-modal opens', await until(() => document.querySelector('.k-modal')), true);
  const dlg = await page.$eval('.k-modal', (d) => d.innerText.replace(/\s+/g, ' '));
  check('9. it mentions renumbering and that the report and review marks are cleared',
    [/renumber/i.test(dlg), /change report/i.test(dlg), /review marks/i.test(dlg)], [true, true, true]);
  await page.click('.k-modal .mbtn.danger, .k-modal .mbtn.primary');
  check('9. the blob has no numbering', await until(() => {
    const S = window.StudioStore;
    const x = JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()) || 'null');
    return x && !x.numbering;
  }), true);
  b = await barOn('breakdown.html', 'draft');
  check('9. breakdown bar is a draft bar again', b.state, 'draft');
  check('9. rows renumbered 1..4 by position', await until(() => {
    const S = window.StudioStore;
    const r = (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
    return r.length === 4 && r.map((x) => String(x.number)).sort().join() === '1,2,3,4';
  }), true);
  const un = await rowsByHeading();
  check('9. numbers follow script position (KITCHEN, CAFE, STREET, BUS = 1..4)',
    un.map((x) => place(x.el.text) + (x.row && String(x.row.number))), ['KITCHEN1', 'CAFE2', 'STREET3', 'BUS4']);
  const byEl = (h) => un.find((x) => x.el.id === h).row;
  check('9. typed fields kept (matched by scriptElId): RAVI on KITCHEN, synopsis, shootDay 2 on STREET',
    [byEl(typed[0].el.id).elements.cast.includes('RAVI'), byEl(typed[0].el.id).synopsis, String(byEl(typed[1].el.id).shootDay)],
    [true, 'Maya burns the toast', '2']);
  const cs = await page.evaluate(() => {
    const S = window.StudioStore;
    return JSON.parse(S.rawGet('fms_contacts_v1__' + S.currentProjectId())).callSheets.map((c) => c.sceneIds);
  });
  /* Phase 2's lock also drafts a sheet for each shoot day that had none; the typed sheet is the first and keeps its row. */
  check('9. the typed call sheet still lists the STREET row (first sheet, untouched by the lock\'s drafts)', cs[0], [ids[1]]);

  /* ---- 10. a legacy lock, in a second fresh project ---- */
  await ctx.close();
  [ctx, page] = await freshContext();
  await page.goto(url('index.html'));
  await page.click('[data-action="start-short"]');
  await page.fill('#psTitle', 'Legacy Lock');
  await page.click('#psSubmit');
  await page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => {
    const S = window.StudioStore;
    const els = [
      { id: 'lg_h1', type: 'scene', text: 'INT. ATTIC - NIGHT' }, { id: 'lg_a1', type: 'action', text: 'Dust hangs in the lamplight.' },
      { id: 'lg_h2', type: 'scene', text: 'EXT. ROOF - DAWN' }, { id: 'lg_a2', type: 'action', text: 'The first bus passes below.' }
    ];
    const ids = {};
    els.filter((e) => e.type === 'scene').forEach((e, i) => { ids[e.id] = { n: String(i + 1), t: e.text }; });
    S.rawSet('fms_script_v1__' + S.currentProjectId(), JSON.stringify({
      elements: els, revisions: [], documents: [], numbering: { locked: true, at: '2026-10-01T09:00:00.000Z', ids }
    }));
  });
  const seeded = await rawBlob();
  for (const f of ['screenplay.html', 'breakdown.html', 'stripboard.html']) {
    if (f === 'screenplay.html') await openScreenplay(); else await page.goto(url(f));
    b = await (async () => { await waitBar('legacy'); return page.evaluate(() => { const e = document.getElementById('lockBar'); return e && { state: e.dataset.state, text: e.innerText.replace(/\s+/g, ' ') }; }); })()
      .catch(() => null);
    if (f !== 'screenplay.html') check(`10. ${f}: legacy bar reads Locked`, [b && b.state, b && /Locked/.test(b.text)], ['legacy', true]);
  }
  check('10. the raw blob is byte-identical after the three loads', await rawBlob(), seeded);
  await page.goto(url('stripboard.html'));
  await waitBar('legacy');
  await openReport();
  check('10. the report sheet offers Start change tracking', await page.locator('#changes [data-action="lock-track"]').count() > 0, true);
  check('10. still byte-identical after opening the sheet', await rawBlob(), seeded);
  await page.keyboard.press('Escape');
  await openScreenplay();
  const rowsBefore = (await rows()).length;
  const before10 = await syncCount();
  await caretAtEndOf('The first bus passes below.');
  await kb().press('Enter');
  await kb().press('Alt+1'); await kb().type('INT. LIBRARY - DAY'); await kb().press('Enter');
  await kb().type('Dust on the shelves.'); await kb().press('Enter');
  check('10. legacy is not held: a typed heading ADDS a row', await until(([c, n0]) => {
    const S = window.StudioStore;
    const r = (JSON.parse(S.rawGet('fms_scenes_v1__' + S.currentProjectId()) || '{}').scenes) || [];
    return Number(document.documentElement.dataset.sceneSync || 0) > c && r.length > n0
      && r.some((x) => /LIBRARY/i.test(x.location || ''));
  }, [before10, rowsBefore]), true);

  /* ---- 11. no errors ---- */
  check('11. no page error or console error', errors, []);
} catch (e) {
  failed++;
  console.log('FAIL  the walk threw: ' + (e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
