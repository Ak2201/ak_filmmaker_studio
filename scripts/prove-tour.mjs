/* ============================================================
   PROOF: the studio tour starts by itself on an account's FIRST EVER
   sign-in, walks every navigation page, and can be paused, resumed,
   skipped and started again (owner, 31 Oct 2026)
   ------------------------------------------------------------
   Reads the OPEN build (PROVE_DIST, default dist-verify — CI runs it
   after build:verify) and serves it with Supabase replaced by
   scripts/fake-supabase.mjs, plus the two RPCs the tour reads, answered
   HERE through EXT_RPC so the shared fake is not edited:
     tour_status()        → { started_at, finished_at }   (42501 signed out)
     mark_tour_started()  → boolean   (true exactly once)
   — §66's real shapes, as schema-66-drive-storage.sql returns them.
   TOUR.mode switches them to an error or to "function not found"
   (PGRST202), the two states the client must treat as "do not start".

   Asserted, at 1440 and 390:
     (a) a member's first ever sign-in: tour_status then mark_tour_started,
         ONCE; the Dragon sample opens and the tour lands on its next
         step (the dashboard) by itself
     (b) Next walks every step in tour.json order, one card per page, each
         ringing a real anchor (never <main> itself); the stage pages
         come in navigation.json order and every global page but the
         console (admins only) and Home is walked; the last is Finish
     (c) a reload mid-tour comes back on the same step; idle mid-tour
         writes nothing; Back works
     (d) Pause keeps the step; the account menu says "Resume the tour"
         and lands on it; Skip records dismissed and stops; Finish
         records finished
     (e) a second sign-in (same account, a new browser) does not start
         it; nor does started:true, an RPC error, an absent function,
         or a member the gate walls (tour_status is never even asked)
     (f) the account menu's "Take the tour" and Settings → Help start it
         again, signed out too
     (g) zero localStorage writes on idle, no page errors
   Run:  PW_CHROMIUM=/opt/pw-browsers/chromium PROVE_PORT=5941 npm run prove:tour
   ============================================================ */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, EXT_RPC } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist-verify');
const PORT = Number(process.env.PROVE_PORT) || 5941;
const BASE = `http://localhost:${PORT}/`;
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/tour.json'), 'utf8'));
const NAV = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`✗ no build at ${DIST} — run npm run build:verify`); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- the two RPCs -------------------------------------------------- */
const TOUR = { started: new Set(), mode: 'ok', calls: [] };
EXT_RPC.tour_status = (args, user) => {
  TOUR.calls.push('status:' + (user ? user.email : 'anon'));
  if (TOUR.mode === 'missing') throw { code: 'PGRST202', message: 'Could not find the function public.tour_status', status: 404 };
  if (TOUR.mode === 'error') throw { code: 'XX000', message: 'boom', status: 500 };
  /* §66's real shapes (schema-66-drive-storage.sql): tour_status() is
     {started_at, finished_at} and refuses anon with 42501;
     mark_tour_started() is a bare boolean, true exactly once. */
  if (!user) throw { code: '42501', message: 'Sign in first' };
  return { started_at: TOUR.started.has(user.id) ? '2026-10-31T00:00:00Z' : null, finished_at: null };
};
EXT_RPC.mark_tour_started = (args, user) => {
  TOUR.calls.push('mark:' + (user ? user.email : 'anon'));
  if (!user) throw { code: '42501', message: 'Sign in first' };
  const first = !TOUR.started.has(user.id);
  TOUR.started.add(user.id);
  return first;
};
const calls = (kind, email) => TOUR.calls.filter((c) => c === kind + ':' + email).length;

/* ---- a static server for the build ---------------------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another>`); process.exit(2);
});
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function context({ user = null, width = 1440 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 }, timezoneId: 'Asia/Kolkata' });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|youtube|ytimg/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { window.__writes.push({ store: this === sessionStorage ? 'session' : 'local', key: String(a[0]), at: performance.now() }); return o.apply(this, a); };
    try { localStorage.setItem('fms_region_v1', 'IN'); } catch (e) { /* private */ }
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, user ? [`sb-${REF}-auth-token`, sessionFor(user), USERS[user].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const localWrites = (page, since = 0) => page.evaluate((s) => window.__writes.filter((w) => w.store === 'local' && w.at >= s).map((w) => w.key), since);
const now = (page) => page.evaluate(() => performance.now());
const tourState = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fms_tour_v1') || 'null'); } catch (e) { return null; } });
const card = (page, id, timeout = 20000) => page.waitForSelector(`.tour-pop[data-tour-step="${id}"]`, { timeout }).then(() => true, () => false);
const pageId = (page) => { const last = new URL(page.url()).pathname.split('/').pop() || 'index'; return last.replace(/\.html$/, '') || 'index'; };
const member = (tok) => F.db.members.set(USERS[tok].id, { role: 'user', disabled_at: null });

/* Who walks what: a non-admin walks every step but the console. */
const walkFor = (admin) => DATA.steps.filter((s) => !s.admin || admin);
const NON_ADMIN = walkFor(false);
/* navigation.json's stage pages, in rail order, first appearance. */
const fileOf = (href) => String(href).split('#')[0].replace(/\.html$/, '') || 'index';
const STAGE_PAGES = [...new Set(NAV.phases.flatMap((p) => (p.modules || []).map((m) => fileOf(m.href))))];
const GLOBAL_PAGES = NAV.global.map((g) => fileOf(g.href)).filter((p) => p !== 'admin' && p !== 'index');

/* A menu row is icon + label; the icon's ligature name is text too. */
const rowLabel = (row) => row.evaluate((e) => (e.lastElementChild || e).textContent.trim());
async function openAccountMenu(page) {
  const btn = await page.$('#studioRail .sh-rail-account');
  if (!btn) return null;
  await btn.click();
  return page.waitForSelector('#shAcctMenu [data-action="rail-tour"]', { timeout: 4000 }).catch(() => null);
}

for (const width of [1440, 390]) {
  const phone = width < 720;
  console.log(`\n=== ${width}px ===`);
  F.reset(); TOUR.started.clear(); TOUR.mode = 'ok'; TOUR.calls.length = 0;
  member('tok-amy');

  console.log('(a) the first ever sign-in');
  const { ctx, page, errors } = await context({ user: 'tok-amy', width });
  await page.goto(BASE + 'dashboard.html');
  ok(await card(page, 'dashboard', 30000), 'the tour started by itself and landed on the dashboard step');
  ok(calls('status', 'amy@example.com') >= 1 && calls('mark', 'amy@example.com') === 1, `tour_status asked, mark_tour_started called once (${TOUR.calls.join(', ')})`);
  ok(await page.evaluate(() => { const S = window.StudioStore || null; return true; }) && /\/dashboard(\.html)?$/.test(new URL(page.url()).pathname), 'the address is the dashboard');
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]')).some((p) => p && p.sample)), 'the Dragon sample was opened for it');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('tour-pop')), 'focus is on the step card');
  const st0 = await tourState(page);
  ok(st0 && st0.active === true && st0.step === 1, 'fms_tour_v1 says active, step 1');

  console.log('(c) idle, reload, Back');
  let t0 = await now(page);
  await page.waitForTimeout(4000);
  ok((await localWrites(page, t0)).length === 0, 'a page mid-tour writes nothing while idle');
  await page.reload();
  ok(await card(page, 'dashboard'), 'a reload comes back on the same step');
  ok(calls('mark', 'amy@example.com') === 1, 'and does not mark again');
  await page.click('.tour-pop [data-tour-act="back"]');
  ok(await card(page, 'sample'), 'Back goes to the sample step on Home');
  ok(await page.evaluate(() => /Next: Dashboard/.test((document.querySelector('.tour-pop [data-tour-act="next"]') || {}).textContent || '')), 'which says the sample is open and offers Next');
  await page.click('.tour-pop [data-tour-act="next"]');
  ok(await card(page, 'dashboard'), 'Next returns to the dashboard');

  console.log('(b) the walk');
  const seen = ['index'];
  const anchors = [];
  let walked = true;
  for (let i = 1; i < NON_ADMIN.length; i++) {
    const step = NON_ADMIN[i];
    if (i > 1) {
      await page.click('.tour-pop [data-tour-act="next"]');
      if (!(await card(page, step.id))) { walked = false; ok(false, `step ${step.id} came up (on ${page.url()})`); break; }
    }
    seen.push(pageId(page));
    const a = await page.evaluate(() => {
      const el = document.querySelector('[data-tour-on]');
      const pop = document.querySelector('.tour-pop');
      const r = pop && pop.getBoundingClientRect();
      return { tag: el ? el.tagName : null, id: el ? el.id : null, cls: el ? String(el.className).slice(0, 40) : '',
        count: (pop && pop.querySelector('.tour-count') || {}).textContent || '',
        inView: !!r && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    anchors.push([step.id, a]);
    if (!a.tag || a.tag === 'MAIN' || a.id === 'main') ok(false, `${step.id} rings a real anchor (got ${a.tag}#${a.id})`);
    if (!a.inView) ok(false, `${step.id}: the card is inside the viewport`);
    if (a.count !== `Step ${i + 1} of ${NON_ADMIN.length}`) ok(false, `${step.id}: "${a.count}" reads Step ${i + 1} of ${NON_ADMIN.length}`);
    if (step.id === 'reports') {
      /* (c) once more, mid-walk: idle and a reload on a stage page */
      t0 = await now(page); await page.waitForTimeout(4000);
      ok((await localWrites(page, t0)).length === 0, 'idle mid-walk writes nothing (Reports)');
      await page.reload();
      ok(await card(page, 'reports'), 'a reload mid-walk comes back on Reports');
    }
  }
  ok(walked && anchors.length === NON_ADMIN.length - 1, `every one of the ${NON_ADMIN.length - 1} steps after Home came up`);
  ok(anchors.every(([, a]) => a.tag && a.tag !== 'MAIN' && a.id !== 'main'), 'every step rings a real anchor: ' + anchors.map(([id, a]) => id + '=' + (a.id ? '#' + a.id : a.tag ? a.tag.toLowerCase() + '.' + a.cls.split(' ')[0] : 'NONE')).join(' '));
  /* (the summary names a missing ring as NONE rather than throwing on it:
     the step's own line above has already failed, and a TypeError here
     hid every check after it — Gate run 383) */
  ok(anchors.every(([, a]) => a.inView), 'every card sits inside the viewport');
  ok(anchors.every(([, a]) => !a.overflow), 'no page overflows sideways with the card up');
  const firstSeen = [...new Set(seen)];
  const stageOrder = firstSeen.filter((p) => STAGE_PAGES.includes(p));
  ok(JSON.stringify(stageOrder) === JSON.stringify(STAGE_PAGES), 'the stage pages come in navigation.json order: ' + stageOrder.join(' › '));
  ok(GLOBAL_PAGES.every((p) => firstSeen.includes(p)), 'every global page but Home and the console is walked: ' + GLOBAL_PAGES.join(', '));
  ok(!seen.includes('admin'), 'the console step is left out for a non-admin');
  ok(await page.evaluate(() => /^Finish$/.test(((document.querySelector('.tour-pop [data-tour-act="finish"]') || {}).textContent || '').trim())), 'the last step says Finish');

  console.log('(d) finish, pause, resume, skip');
  t0 = await now(page);
  await page.click('.tour-pop [data-tour-act="finish"]');
  await page.waitForTimeout(400);
  let st = await tourState(page);
  ok(st && st.finished === true && st.active === false && !(await page.$('.tour-pop')), 'Finish records finished and closes the card');
  ok(JSON.stringify([...new Set(await localWrites(page, t0))]) === '["fms_tour_v1"]', 'and writes only fms_tour_v1');

  if (!phone) {
    /* The account menu: Take the tour (finished → starts again) */
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(1500);
    const row = await openAccountMenu(page);
    ok(!!row && /^Take the tour$/.test(await rowLabel(row)), 'the account menu offers "Take the tour" beside Help');
    ok(await page.evaluate(() => { const r = [...document.querySelectorAll('#shAcctMenu .sh-acct-item')].map((e) => (e.lastElementChild || e).textContent.trim()); const i = r.indexOf('Take the tour'); return i > 0 && /Help/.test(r[i + 1] || ''); }), 'placed just above Help & shortcuts');
    if (row) await row.click();
    ok(await card(page, 'dashboard'), 'it starts the tour again, on the sample');
    ok(calls('mark', 'amy@example.com') === 1, 'without asking the server to mark anything');
    await page.click('.tour-pop [data-tour-act="next"]');
    ok(await card(page, 'story'), 'Next → Story');
    await page.click('.tour-pop [data-tour-act="next"]');
    ok(await card(page, 'vault'), 'Next → Idea Vault');
    t0 = await now(page);
    await page.click('.tour-pop [data-tour-act="pause"]');
    await page.waitForTimeout(300);
    st = await tourState(page);
    const vaultIdx = DATA.steps.findIndex((s) => s.id === 'vault');
    ok(st && st.active === false && st.step === vaultIdx && !st.dismissed && !(await page.$('.tour-pop')), 'Pause closes the card and keeps the step');
    await page.goto(BASE + 'budget.html'); await page.waitForTimeout(1500);
    ok(!(await page.$('.tour-pop, .tour-chip')), 'a paused tour draws nothing on other pages');
    const row2 = await openAccountMenu(page);
    ok(!!row2 && /^Resume the tour$/.test(await rowLabel(row2)), 'the menu now says "Resume the tour"');
    if (row2) await row2.click();
    ok(await card(page, 'vault'), 'Resume lands on the paused step');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    st = await tourState(page);
    ok(st && st.active === false && st.step === vaultIdx && !(await page.$('.tour-pop')), 'Esc pauses too');
    const row3 = await openAccountMenu(page); if (row3) await row3.click();
    ok(await card(page, 'vault'), 'and resumes');
    await page.click('.tour-pop [data-tour-act="skip-tour"]'); await page.waitForTimeout(300);
    st = await tourState(page);
    ok(st && st.dismissed === true && st.active === false && !(await page.$('.tour-pop')), 'Skip records dismissed and stops');
    await page.reload(); await page.waitForTimeout(2000);
    ok(!(await page.$('.tour-pop, .tour-chip')), 'and a reload brings nothing back');

    /* Settings → Preferences → Help */
    await page.goto(BASE + 'settings.html#preferences'); await page.waitForTimeout(1500);
    const sbtn = await page.waitForSelector('[data-action="tour-start"]', { timeout: 6000 }).catch(() => null);
    ok(!!sbtn, 'Settings → Preferences has the tour button');
    /* A locator, not the handle: settings.js swaps <main> whenever a fetch
       lands (commitMain), and a handle taken a moment earlier is then a
       detached copy ("Element is not attached to the DOM", seen under load). */
    if (sbtn) { await page.locator('[data-action="tour-start"]').click(); ok(await card(page, 'dashboard'), 'and it starts the tour on the sample'); }
  } else {
    /* On a phone the same flow, Pause and resume through the hub's list */
    await page.goto(BASE + 'index.html'); await page.waitForTimeout(1500);
    const start = await page.$('#firstweek [data-tour-act="start"]');
    ok(!!start, 'Home offers "Take the tour again" after it finished');
    if (start) { await start.click(); ok(await card(page, 'dashboard'), 'it starts again on the sample'); }
    await page.click('.tour-pop [data-tour-act="pause"]'); await page.waitForTimeout(300);
    st = await tourState(page);
    ok(st && st.active === false && st.step === 1, 'Pause keeps the step');
  }
  t0 = await now(page); await page.waitForTimeout(4000);
  ok((await localWrites(page, t0)).length === 0, 'idle writes nothing');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  console.log('(e) when it must not start');
  {
    /* The same account, a new browser: the server says started. */
    const c2 = await context({ user: 'tok-amy', width });
    const before = calls('mark', 'amy@example.com');
    await c2.page.goto(BASE + 'dashboard.html'); await c2.page.waitForTimeout(5000);
    ok(!(await c2.page.$('.tour-pop')) && calls('mark', 'amy@example.com') === before, 'a second device: started already, no tour, no mark');
    const n = calls('status', 'amy@example.com');
    await c2.page.goto(BASE + 'budget.html'); await c2.page.waitForTimeout(3000);
    ok(calls('status', 'amy@example.com') === n, 'and the tab does not ask again on the next page');
    ok(c2.errors.length === 0, 'no page errors');
    await c2.ctx.close();

    for (const mode of ['error', 'missing']) {
      TOUR.mode = mode; member('tok-cal');
      const c3 = await context({ user: 'tok-cal', width });
      await c3.page.goto(BASE + 'dashboard.html'); await c3.page.waitForTimeout(5000);
      ok(!(await c3.page.$('.tour-pop')) && calls('status', 'cal@example.com') >= 1 && calls('mark', 'cal@example.com') === 0, `tour_status ${mode === 'error' ? 'fails' : 'is absent (PGRST202)'}: no tour, never marked`);
      ok(!(await tourState(c3.page)), 'and fms_tour_v1 is not written');
      await c3.ctx.close();
    }
    TOUR.mode = 'ok';

    /* Walled: ben is not a member, so the gate closes and nobody asks. */
    const c4 = await context({ user: 'tok-ben', width });
    await c4.page.goto(BASE + 'dashboard.html'); await c4.page.waitForTimeout(5000);
    ok(calls('status', 'ben@example.com') === 0 && !(await c4.page.$('.tour-pop')), 'a member the gate walls is never toured (tour_status not even asked)');
    await c4.ctx.close();

    /* Signed out: nothing starts by itself, and the account menu still starts it. */
    const c5 = await context({ width });
    await c5.page.goto(BASE + 'dashboard.html'); await c5.page.waitForTimeout(3000);
    ok(!(await c5.page.$('.tour-pop')) && TOUR.calls.every((c) => !c.endsWith(':anon')), 'signed out: no auto-start, no RPC');
    t0 = await now(c5.page); await c5.page.waitForTimeout(4000);
    ok((await localWrites(c5.page, t0)).length === 0, 'signed out, idle: nothing written');
    if (!phone) {
      const row = await openAccountMenu(c5.page);
      ok(!!row, 'signed out, the account menu has the tour row');
      if (row) { await row.click(); ok(await card(c5.page, 'dashboard'), 'and it starts the tour on the sample, signed out'); }
    }
    ok(c5.errors.length === 0, 'no page errors' + (c5.errors.length ? ': ' + c5.errors.slice(0, 3).join(' | ') : ''));
    await c5.ctx.close();
  }

  if (!phone) {
    console.log('(b2) an admin also walks the console');
    F.reset(); TOUR.started.clear(); TOUR.calls.length = 0;
    const c6 = await context({ user: 'tok-admin', width });
    await c6.page.goto(BASE + 'purchase.html'); await c6.page.waitForTimeout(3000);
    ok(!(await c6.page.$('.tour-pop')) && calls('status', 'admin@example.com') === 0, 'not asked on the purchase page (somebody’s errand)');
    await c6.page.goto(BASE + 'settings.html');
    ok(await card(c6.page, 'dashboard', 30000), 'the admin’s first sign-in starts it on the next studio page');
    /* jump to the purchase step and go on: the console follows */
    const purchaseIdx = DATA.steps.findIndex((s) => s.id === 'purchase');
    await c6.page.evaluate((i) => { const t = JSON.parse(localStorage.getItem('fms_tour_v1')); t.step = i; localStorage.setItem('fms_tour_v1', JSON.stringify(t)); }, purchaseIdx);
    await c6.page.goto(BASE + 'purchase.html');
    ok(await card(c6.page, 'purchase'), 'the purchase step');
    /* Waited for, not read once: the card is drawn before the gate's answer
       (role: admin) lands, and tour.js redraws it on gate:changed — a round
       trip that outlasted the card's first paint under load. */
    ok(await c6.page.waitForFunction(() => /Next: Console/.test((document.querySelector('.tour-pop [data-tour-act="next"]') || {}).textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'offers Next: Console to an admin');
    await c6.page.click('.tour-pop [data-tour-act="next"]');
    ok(await card(c6.page, 'console'), 'and the console step comes up, the last');
    ok(await c6.page.evaluate(() => !!document.querySelector('.tour-pop [data-tour-act="finish"]')), 'with Finish');
    ok(c6.errors.length === 0, 'no page errors' + (c6.errors.length ? ': ' + c6.errors.slice(0, 3).join(' | ') : ''));
    await c6.ctx.close();
  }
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
