/* ============================================================
   fake-admin-rpcs-usage — a browser harness for the Usage tab, the Sync &
   storage tab, the Growth cohorts block, the Settings privacy switch and
   the client's usage reporting, against the shared fake Supabase.
   ------------------------------------------------------------
   Not part of `npm run ship`. Run after `npm run build:open`:

     node scripts/fake-admin-rpcs-usage.mjs            asserts, no screenshots
     SHOTS=/some/dir node scripts/fake-admin-rpcs-usage.mjs   also screenshots
        (light and dark, 1280 and 390) of each surface

   It wraps fake-supabase.mjs's handler: the six RPCs this work added are
   answered here with fixtures (including a CLIENT-AHEAD scope list, the
   §37 shape), everything else falls through. Nothing is written outside
   SHOTS.
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.FAKE_DIST || 'dist';
const PORT = Number(process.env.FAKE_PORT) || 5334;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- fixtures ---------------------------------------------------- */
const day = (i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
const MODS = ['story-beats', 'screenplay', 'script-breakdown', 'scene-list', 'budget', 'stripboard', 'calendar', 'shoot-day', 'glossary', 'songs'];
const modRow = (id, k) => {
  const by = Array.from({ length: 30 }, (_, i) => (k === 0 ? 0 : Math.max(0, Math.round((Math.sin(i / 3 + k) + 1.2) * k * 2))));
  const opens = by.reduce((a, b) => a + b, 0);
  return { name: 'module_open:' + id, id, opens, opens_14d: by.slice(16).reduce((a, b) => a + b, 0), last_opened: opens ? day(29) : null, by_plan: { free: opens, indie: 0 }, by_day: by };
};
const USAGE = () => ({
  since: day(0), until: day(29), days: Array.from({ length: 30 }, (_, i) => day(i)), tracking_began: day(4),
  modules: MODS.map((id, i) => modRow(id, i === 9 ? 0 : 6 - Math.min(5, i))).sort((a, b) => b.opens - a.opens),
  features: [
    { name: 'ai_call', total: 42, by_plan: { indie: 30, free: 12 }, by_day: Array.from({ length: 30 }, (_, i) => i % 4) },
    { name: 'export_pdf', total: 18, by_plan: { indie: 18 }, by_day: Array.from({ length: 30 }, (_, i) => i % 3) },
    { name: 'limit_hit', total: 9, by_plan: { free: 8, starter: 1 }, by_day: Array.from({ length: 30 }, (_, i) => (i > 20 ? 1 : 0)) },
    { name: 'script_import', total: 5, by_plan: { free: 5 }, by_day: Array.from({ length: 30 }, (_, i) => (i === 9 ? 5 : 0)) }
  ],
  dead_modules: ['songs', 'glossary'],
  daily_total: Array.from({ length: 30 }, (_, i) => ({ day: day(i), events: 10 + (i % 7) })),
  active_users: { source: 'usage_rate rows, kept 48 hours: people who sent at least one batch', last_24h: 7, last_48h: 11, weekly: 'not available by design' }
});
const SYNC = (ahead) => ({
  observed_at: new Date().toISOString(), members: 24,
  last_sync_buckets: { under_1d: 6, d1_to_7: 7, d7_to_30: 3, over_30d: 2, never: 6 },
  project_data: { rows: 311, bytes: 8421390, accounts_with_data: 18 },
  top_accounts: [
    { user_id: USERS['tok-amy'].id, email: 'amy@example.com', bytes: 3200000, rows: 74, films: 3, last_sync: new Date(Date.now() - 3600e3).toISOString() },
    { user_id: USERS['tok-ben'].id, email: 'ben@example.com', bytes: 900000, rows: 22, films: 1, last_sync: null }
  ],
  per_scope: [{ scope: 'script', rows: 40, bytes: 5000000, last_write: new Date().toISOString() }, { scope: 'scenes', rows: 38, bytes: 1200000, last_write: new Date().toISOString() }],
  allowed_scopes: ahead ? ['feature', 'script', 'scenes', 'costs'] : null,   // null: filled from the client's own list below
  scopes_in_use: ['script', 'scenes'], in_use_not_allowed: [], reportable_scopes: [], reportable_not_allowed: [],
  errors: { since: day(16), total: 7, by_scope_code: [{ scope: 'write_goals', code: '23514', count: 5 }, { scope: 'other', code: 'P0402', count: 2 }],
            by_day: Array.from({ length: 14 }, (_, i) => ({ day: day(16 + i), count: i % 3 })), on_scopes_not_allowed: [{ scope: 'write_goals', count: 5 }] }
});
const PRESSURE = (enforced) => ({
  observed_at: new Date().toISOString(), enforced, threshold_pct: 80, count: 2,
  accounts: [
    { user_id: USERS['tok-amy'].id, email: 'amy@example.com', plan: 'starter', plan_name: 'Basic', max_pct: 100, metrics: [{ key: 'projects', used: 3, cap: 3, pct: 100 }, { key: 'storage_bytes', used: 450e6, cap: 500e6, pct: 90 }] },
    { user_id: USERS['tok-ben'].id, email: 'ben@example.com', plan: 'indie', plan_name: 'Intermediate', max_pct: 85, metrics: [{ key: 'seats', used: 17, cap: 20, pct: 85 }] }
  ]
});
const wk = (i) => new Date(Date.now() - (11 - i) * 7 * 86400000).toISOString().slice(0, 10);
const COHORTS = () => ({
  weeks: 12, since: wk(0), until: wk(11),
  stages: ['signed_up', 'members', 'trial_started', 'active_in_trial', 'checkout_started', 'paid', 'refunded'],
  by_week: Array.from({ length: 12 }, (_, i) => ({ week_start: wk(i), signed_up: 20 + i, members: 18 + i, trial_started: 12 + i, active_in_trial: 8, checkout_started: 5, paid: 3, refunded: i === 3 ? 1 : 0 })),
  by_source: [{ source: 'signup', signed_up: 180, members: 160, trial_started: 120, active_in_trial: 70, checkout_started: 40, paid: 25, refunded: 2 }, { source: 'code', signed_up: 60, members: 60, trial_started: 55, active_in_trial: 40, checkout_started: 20, paid: 12, refunded: 0 }],
  by_attribution: [{ attribution: 'none', signed_up: 200, members: 190, trial_started: 150, active_in_trial: 90, checkout_started: 40, paid: 27, refunded: 2 }, { attribution: 'referral', signed_up: 40, members: 30, trial_started: 25, active_in_trial: 20, checkout_started: 20, paid: 10, refunded: 0 }],
  totals: { signed_up: 240, members: 220, trial_started: 175, active_in_trial: 110, checkout_started: 60, paid: 37, refunded: 2 }, notes: {}
});

const S = { calls: [], bumps: [], reports: [], mode: 'ahead', pressureEnforced: false, fail: '', clientScopes: [] };
async function wrapped(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  if (m) {
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) { /* none */ }
    const n = m[1];
    if (n === 'bump_usage') { S.bumps.push(args.p_names); return json(args.p_names.length); }
    if (n === 'report_sync_error') { S.reports.push(args); return json(null, 204); }
    if (['admin_usage', 'admin_cohorts', 'admin_sync_overview', 'admin_limit_pressure'].includes(n)) {
      S.calls.push(n);
      if (S.fail === n) return json({ code: 'PGRST202', message: `Could not find the function public.${n} in the schema cache` }, 404);
      if (n === 'admin_usage') return json(USAGE());
      if (n === 'admin_cohorts') return json(COHORTS());
      if (n === 'admin_limit_pressure') return json(PRESSURE(S.pressureEnforced));
      const d = SYNC(S.mode === 'ahead');
      if (!d.allowed_scopes) d.allowed_scopes = S.clientScopes;
      return json(d);
    }
  }
  if (url.pathname.startsWith('/rest/v1/project_data') && req.method() !== 'GET' && S.mode === 'refuse') {
    return json({ code: '23514', message: 'new row violates check constraint', details: null, hint: null }, 400);
  }
  return handle(route);
}

async function newCtx(browser, { tok, w = 1280, h = 900, scheme = 'dark' }) {
  if (tok) F.db.sessions.delete(USERS[tok].id);   // one fake user, many contexts: do not meet the device lock
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, colorScheme: scheme });
  await ctx.route(SB + '/**', wrapped);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  if (tok) {
    await ctx.addInitScript(([k, v, uid, th]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid);
        localStorage.setItem('fms_studio_theme_v1', th);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id, scheme === 'dark' ? 'ink' : 'paper']);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const wide = (page) => page.evaluate(() => { const cw = document.documentElement.clientWidth; return 'doc ' + document.documentElement.scrollWidth + '/' + cw + ' body ' + document.body.scrollWidth + ' :: ' + [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > cw + 1 || (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0); }).slice(0, 8).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' w' + Math.round(e.getBoundingClientRect().width) + ' sw' + e.scrollWidth).join(' | '); });

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
try {
  F.reset();
  for (const [scheme, w] of [['dark', 1280], ['light', 1280], ['dark', 390], ['light', 390]]) {
    const tag = `${scheme}-${w}`;
    console.log(`(${tag})`);
    S.calls = []; S.mode = 'ahead';
    const { ctx, page, errors } = await newCtx(browser, { tok: 'tok-admin', w, h: w === 390 ? 844 : 900, scheme });
    await page.goto(BASE + 'admin.html#usage');
    await page.waitForSelector('#usage .us-root .adc-heat', { timeout: 15000 });
    S.clientScopes = await page.evaluate(() => Object.keys(window.StudioCloud.KEY_BY_SCOPE));
    const th = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(th === 'dark', 'theme ' + th + ' (one theme since 14 Oct 2026, whatever the OS prefers)');
    const txt = await page.textContent('#usage');
    ok(/weekly active figure is not available, by design/i.test(txt) && /floor/.test(txt), 'usage: says weekly actives are unavailable and figures are a floor');
    ok(/Unused for 14 days \(2 of 10\)/.test(txt) && /opted|turned counting off/.test(txt), 'usage: unused list with the opted-in note');
    ok(await page.evaluate(() => { const k = [...document.querySelectorAll('#usage .ad-kpi')]; const v = (re) => (k.find((e) => re.test(e.textContent)) || { querySelector: () => null }).querySelector('.ad-stat-n'); return v(/24 hours/) && v(/24 hours/).textContent === '7' && v(/48 hours/).textContent === '11'; }), 'usage: 24h/48h figures');
    ok((await page.$$('#usage .adc-spark')).length >= 10, 'usage: a sparkline per module row');
    ok(!!(await page.$('#usage .adc-barwrap')), 'usage: limit-hit leaderboard bars');
    await shot(page, `usage-${tag}`);
    ok((await overflow(page)) <= 0, 'usage: no horizontal page scroll ' + ((await overflow(page)) > 0 ? await wide(page) : ''));
    if (w === 1280 && scheme === 'dark') {
      S.calls = [];
      await page.click('#usage [data-us-days="7"]');
      await page.waitForFunction(() => document.querySelector('#usage [data-us-days="7"][aria-pressed="true"]'), null, { timeout: 5000 });
      await page.waitForSelector('#usage .adc-heat', { timeout: 5000 });
      ok(S.calls.filter((c) => c === 'admin_usage').length >= 1, 'usage: the 7-day picker asks again');
    }

    await page.goto(BASE + 'admin.html#sync');
    await page.waitForSelector('#sync .us-loud', { timeout: 15000 });
    const st = await page.textContent('#sync');
    ok(/Client ahead of database/.test(st), 'sync: says "client ahead of database" loudly when the client maps a scope the CHECK refuses');
    ok(!!(await page.$('#sync .us-loud[role="alert"]')), 'sync: the alarm is an alert, not colour alone');
    ok(/write_goals/.test(st), 'sync: names the offending scope(s) and error counters');
    ok(/Limits are not enforced/.test(st) && !/nudge/i.test(st), 'sync: shows the enforced flag honestly and has no nudge button');
    ok(!!(await page.$('#sync [role="meter"]')), 'sync: limit pressure uses meters');
    await shot(page, `sync-${tag}`);
    ok((await overflow(page)) <= 0, 'sync: no horizontal page scroll');
    if (w === 1280 && scheme === 'dark') {
      await page.click('#sync tr[data-row="' + USERS['tok-amy'].id + '"]');
      await page.waitForFunction((id) => location.hash.includes('user=' + id), USERS['tok-amy'].id, { timeout: 5000 }).then(() => ok(true, 'sync: an account row opens the customer drawer (#people?user=)'), () => ok(false, 'sync: an account row opens the customer drawer'));
    }

    await page.goto(BASE + 'admin.html#growth');
    await page.waitForSelector('#growth .adc-funnel', { timeout: 15000 });
    const gt = await page.textContent('#growth');
    ok(/Signed up/.test(gt) && /Conversion by sign-up week/.test(gt) && /By source/.test(gt), 'growth: funnel, conversion grid and source comparison');
    await shot(page, `growth-${tag}`);
    ok((await overflow(page)) <= 0, 'growth: no horizontal page scroll ' + ((await overflow(page)) > 0 ? await wide(page) : ''));
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();
  }

  console.log('(failures say why)');
  {
    S.fail = 'admin_usage';
    const { ctx, page } = await newCtx(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'admin.html#usage');
    await page.waitForSelector('#usage .ad-error', { timeout: 15000 });
    ok(/schema section 43/.test(await page.textContent('#usage .ad-error')) && !!(await page.$('#usage .ad-error button')), 'usage: a missing RPC says which section and offers retry');
    S.fail = '';
    await ctx.close();
  }
  {
    S.pressureEnforced = true; S.mode = 'ok';
    const { ctx, page } = await newCtx(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'admin.html#sync');
    await page.waitForSelector('#sync [role="meter"]', { timeout: 15000 });
    ok(/Limits are enforced/.test(await page.textContent('#sync')), 'sync: enforced=true is shown');
    S.pressureEnforced = false; S.mode = 'ahead';
    await ctx.close();
  }
  {
    const { ctx, page } = await newCtx(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'admin.html');
    await page.waitForSelector('#denied', { timeout: 10000 });
    ok(!(await page.$('#usage .us-root')), 'a member who is not an admin sees no usage tab');
    await ctx.close();
  }

  console.log('(client: usage reporting)');
  {
    S.bumps = []; S.reports = [];
    const { ctx, page, errors } = await newCtx(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'breakdown.html#elements');
    await page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession(), null, { timeout: 15000 });
    const writes = await page.evaluate(() => new Promise((res) => {
      const keys = []; const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k) { keys.push(k); return orig.apply(this, arguments); };
      setTimeout(() => { Storage.prototype.setItem = orig; res(keys); }, 4000);
    }));
    ok(writes.length === 0, 'client: four idle seconds write nothing to localStorage (' + writes.join(',') + ')');
    ok(S.bumps.length === 0, 'client: nothing is sent while the page is open and idle');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(800);
    const first = S.bumps.flat();
    ok(S.bumps.length === 1 && first.includes('module_open:elements'), 'client: ONE bump_usage on hide, naming this page’s module (' + first.join(',') + ')');
    ok(first.every((n) => /^(module_open:[a-z-]+|[a-z_]+)$/.test(n)), 'client: names only, nothing else');
    // opt out: nothing more is sent, and the key is raw-written only by the toggle
    await page.goto(BASE + 'settings.html#privacy');
    await page.waitForSelector('#usageCountToggle', { timeout: 10000 });
    ok(await page.isChecked('#usageCountToggle'), 'settings: counting is on by default');
    await shot(page, 'settings-privacy');
    await page.click('#usageCountToggle');
    ok(await page.evaluate(() => localStorage.getItem('fms_usage_optout_v1') === '1'), 'settings: turning it off writes fms_usage_optout_v1');
    S.bumps = [];
    await page.goto(BASE + 'breakdown.html#elements');
    await page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession(), null, { timeout: 15000 });
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
    await page.waitForTimeout(600);
    ok(S.bumps.length === 0, 'client: opted out, nothing is sent');
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();
  }
  {
    S.bumps = [];
    const { ctx, page } = await newCtx(browser, { tok: null });
    await page.goto(BASE + 'breakdown.html#elements');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    await page.waitForTimeout(500);
    ok(S.bumps.length === 0, 'client: signed out, nothing is sent');
    ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /supabase-/.test(e.name)))), 'client: signed out, no supabase chunk is fetched');
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
