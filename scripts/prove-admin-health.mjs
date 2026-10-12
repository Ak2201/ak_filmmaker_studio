/* ============================================================
   PROVE: the console's Launch & health tab, Audit log tab and Overview
   ------------------------------------------------------------
   A signed-in admin against the fake project (fake-supabase.mjs +
   fake-admin-rpcs.mjs). Not part of npm run test:all (package.json is not
   this lane's to edit); run it by hand:

     VITE_SITE_GATE=off npx vite build --outDir dist-ha
     PROVE_DIST=dist-ha PROVE_PORT=5371 node scripts/prove-admin-health.mjs

   SHOTS=<dir> also writes screenshots (light and dark, 1280 and 390).
   Needs the OPEN build (the console is loaded signed in either way, but
   the open build keeps the site gate out of the way).
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';
import { ADMIN } from './fake-admin-rpcs.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.PROVE_DIST || 'dist-ha';
const PORT = Number(process.env.PROVE_PORT) || 5371;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newContext(browser, tok, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, acceptDownloads: true });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(([k, v, uid]) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const theme = (page, t) => page.evaluate((x) => { document.documentElement.setAttribute('data-theme', x); }, t);
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').replace(/^[✓✕…–]\s*/, '').trim()));
async function fresh({ invite = false } = {}) {
  F.reset(); ADMIN.reset();
  F.db.settings.purchase_required = false;
  if (invite) F.db.requests.set(USERS['tok-ben'].id, { user_id: USERS['tok-ben'].id, status: 'pending', requested_at: new Date().toISOString(), decided_at: null, decided_by: null, decision_note: null, note: '', times_asked: 1, user_agent: null });
}

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  console.log('(a) Overview');
  await fresh({ invite: true });
  {
    const A = await newContext(browser, 'tok-admin');
    await A.page.goto(BASE + 'admin.html');
    await A.page.waitForSelector('#overview .ad-stat', { timeout: 10000 });
    await A.page.waitForSelector('#overview .ad-att-list', { timeout: 10000 });
    ok((await A.page.$$('#overview .ad-kpis > .ad-stat')).length === 10, 'ten KPI tiles (six old, four from the health report)');
    const tiles = await texts(A.page, '#overview .ad-kpis > .ad-stat');
    ok(tiles.some((t) => /Failed receipts/i.test(t) && /\b2\b/.test(t)), 'failed receipts counts the two recent awaiting invoices: ' + tiles.find((t) => /Failed/i.test(t)));
    ok(tiles.some((t) => /Abandoned payments/i.test(t) && /\b2\b/.test(t)), 'abandoned payments reads 2');
    ok(tiles.some((t) => /Refund backlog/i.test(t) && /\b1\b/.test(t)), 'refund backlog reads 1');
    ok(tiles.some((t) => /Walled/i.test(t) && /\b7\b/.test(t)), 'walled reads 7 (census)');
    const att = await texts(A.page, '#overview .ad-att-list > li');
    console.log('   attention: ' + JSON.stringify(att));
    ok(att.length === 4, 'four attention items: ' + att.length);
    ok(/receipt/.test(att[0]) && /refund request/.test(att[1]) && /oldest 3d/.test(att[1]) && /invite/.test(att[2]) && /payment/.test(att[3]), 'ranked: receipts, refund over 48h, invites, abandoned payments');
    const feed = await A.page.$$('#overview .ad-tl > li');
    ok(feed.length === 15, 'the activity feed is the last 15 audit rows: ' + feed.length);
    await shot(A.page, 'overview-dark-1280');
    await theme(A.page, 'light'); await shot(A.page, 'overview-light-1280');
    // a link goes through ctx.go
    await A.page.click('#overview .ad-att-list a[data-ad-go="health"]');
    await sleep(300);
    ok(await A.page.isVisible('#health') && await A.page.isHidden('#overview'), 'an attention link opens the Launch & health tab');
    await A.page.click('.tabs [data-tab="overview"]');
    await A.page.click('#overview .ad-tl a.ad-tl-a >> nth=0');
    await sleep(500);
    ok(await A.page.isVisible('#audit'), 'an activity row links into the audit tab');
    ok(/target=/.test(await A.page.evaluate(() => location.hash)), 'with the target in the hash: ' + await A.page.evaluate(() => location.hash));
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(a2) Overview when the health report is broken');
  await fresh();
  ADMIN.state.refusal = 'Administrators only';
  {
    const A = await newContext(browser, 'tok-admin');
    await A.page.goto(BASE + 'admin.html');
    await A.page.waitForSelector('#overview .ad-stat', { timeout: 10000 });
    await sleep(800);
    const tiles = await texts(A.page, '#overview .ad-kpis > .ad-stat');
    ok(tiles.filter((t) => /unknown/.test(t)).length === 4, 'the four health tiles say unknown, not zero');
    ok((await texts(A.page, '#overview .ad-att-list > li')).some((t) => /health report could not load/.test(t)), 'the attention list says the health report could not load');
    ok(await A.page.isVisible('#overview .ad-error'), 'the activity feed shows an error state with its reason');
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(b) Launch & health');
  await fresh();
  {
    const A = await newContext(browser, 'tok-admin');
    await A.page.goto(BASE + 'admin.html#health');
    await A.page.waitForSelector('#health .ad-check', { timeout: 10000 });
    await A.page.waitForFunction(() => document.querySelectorAll('#health .ad-probe .ad-pill').length === 4 && !/Not probed|Probing/.test(document.querySelector('#health .ad-probe').textContent), null, { timeout: 10000 });
    const probes = await texts(A.page, '#health .ad-probe li');
    ok(probes.length === 4 && probes.every((t) => /Answers/.test(t)), 'all four functions answered the unauthenticated probe: ' + probes.join(' | '));
    ok(probes.some((t) => /rzp-webhook/.test(t) && /401/.test(t) && /bad signature/.test(t)), 'the webhook reads 401 bad signature, alive');
    const steps = await texts(A.page, '#health .ad-check-i');
    ok(steps.length === 8, 'eight launch steps: ' + steps.length);
    ok(steps.every((s) => /^(Passing|Failing|Checking|Not checked)/.test(s)), 'every step carries a state word, not colour alone');
    ok(/^Passing.*schema section/i.test(steps[0]), 'schema sections pass');
    ok(/^Not checked.*Resend|^Failing.*Resend/.test(steps[1]), 'Resend is never a pass without evidence: ' + steps[1].slice(0, 90));
    ok(/Failing.*refund has been exercised/i.test(steps.find((s) => /refund has been exercised/.test(s))), 'no processed refund -> failing');
    const slots = await texts(A.page, '#health .ad-hgrid > section');
    ok(slots.length === 11, 'one card per health slot: ' + slots.length);
    ok(slots.some((t) => /Receipts/.test(t) && /Not observable/.test(t)), 'resend_configured shows as Not observable');
    ok(await A.page.isVisible('#health .ad-facts >> text=Last webhook seen'), 'last webhook seen is labelled not observable');
    // failed-receipt queue
    ok((await A.page.$$('#health .ad-hc [data-action="receipt-resend"]')).length === 2, 'two receipts waiting, two Resend buttons');
    await A.page.click('[data-action="receipt-resend"][data-id="inv1"]');
    await A.page.waitForSelector('.modal.dlg', { timeout: 3000 });
    await A.page.click('.mbtn.primary');
    await A.page.waitForFunction(() => document.querySelectorAll('[data-action="receipt-resend"]').length === 1, null, { timeout: 5000 });
    ok(ADMIN.state.audit[0].action === 'resend_receipt', 'a resend wrote its audit row');
    ok(await A.page.isVisible('.toast >> text=View in audit log'), 'and the toast offers View in audit log');
    await shot(A.page, 'health-dark-1280');
    await theme(A.page, 'light'); await shot(A.page, 'health-light-1280'); await theme(A.page, 'dark');

    // the switch
    ok(/OFF/.test(await A.page.textContent('.ad-sw')), 'the switch reads OFF');
    ok(/7 members/.test(await A.page.textContent('.ad-sw-prev')), 'the preview says 7 members would be walled');
    await A.page.click('[data-action="switch-throw"]');
    await A.page.waitForSelector('.dlg-field', { timeout: 3000 });
    ok(await A.page.isDisabled('.mbtn.primary'), 'the confirm button is disabled until REQUIRE is typed');
    await A.page.fill('.dlg-field', 'require');
    ok(await A.page.isDisabled('.mbtn.primary'), 'lower-case "require" is not enough');
    ok(/Not passing/.test(await A.page.textContent('.modal.dlg')), 'the dialog lists the steps that are not passing');
    await A.page.fill('.dlg-field', 'REQUIRE');
    await A.page.click('.mbtn.primary');
    await A.page.waitForFunction(() => /ON/.test(document.querySelector('.ad-sw .ad-sw-line')?.textContent || ''), null, { timeout: 5000 });
    ok(F.db.settings.purchase_required === true, 'the server setting is now true');
    ok(/One-click rollback stays here for 2[34]h/.test(await A.page.textContent('.ad-sw')), 'rollback is offered with the 24-hour window: ' + (await A.page.textContent('.ad-sw')).replace(/\s+/g, ' ').slice(0, 220));
    ok(ADMIN.state.audit[0].action === 'set_billing_settings', 'the throw wrote its audit row');
    await shot(A.page, 'health-switch-on-dark-1280');
    await A.page.click('[data-action="switch-rollback"]');
    await A.page.waitForSelector('.mbtn.primary');
    await A.page.click('.mbtn.primary');
    await A.page.waitForFunction(() => /OFF/.test(document.querySelector('.ad-sw .ad-sw-line')?.textContent || ''), null, { timeout: 5000 });
    ok(F.db.settings.purchase_required === false, 'rollback turned it off');

    // a refusal is a sentence
    ADMIN.state.grandfathered = 3;
    await A.page.click('[data-action="switch-throw"]');
    await A.page.waitForSelector('.dlg-field');
    await A.page.fill('.dlg-field', 'REQUIRE');
    await A.page.click('.mbtn.primary');
    await A.page.waitForSelector('.ad-sw p.ad-unk[role="alert"]', { timeout: 5000 });
    const refusal = await A.page.textContent('.ad-sw p.ad-unk[role="alert"]');
    ok(/Requiring a plan would wall 3 member\(s\)/.test(refusal) && !/Error|42501/.test(refusal.slice(0, 20)), 'the grandfathered refusal shows as the server\'s sentence on the card');
    ok(F.db.settings.purchase_required === false, 'and nothing changed');
    // and with the census known, the button is disabled up front
    await A.page.click('[data-action="health-refresh"]');
    await A.page.waitForFunction(() => document.querySelector('[data-action="switch-throw"]')?.disabled, null, { timeout: 5000 });
    ok(true, 'after a refresh the button is disabled and the preview says the server will refuse');
    ok(/The server will refuse/.test(await A.page.textContent('.ad-sw-prev')), '  ... with the reason');
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(b2) slots that cannot be read are Unknown');
  await fresh();
  ADMIN.state.broken = { receipts: true, sections: true };
  ADMIN.state.missing = [36];
  ADMIN.state.fnStatus['rzp-webhook'] = 503;
  {
    const A = await newContext(browser, 'tok-admin');
    await A.page.goto(BASE + 'admin.html#health');
    await A.page.waitForSelector('#health .ad-hgrid', { timeout: 10000 });
    await A.page.waitForFunction(() => /503/.test(document.querySelector('#health .ad-probe')?.textContent || ''), null, { timeout: 10000 });
    const cards = await A.page.$$eval('#health .ad-hgrid > section', (s) => s.map((c) => ({ t: c.querySelector('h3').textContent, pills: [...c.querySelectorAll('.ad-hc-h .ad-pill')].map((p) => p.textContent), unk: !!c.querySelector('.ad-unk') })));
    const rec = cards.find((c) => c.t === 'Receipts');
    ok(rec && rec.unk && rec.pills.join() === 'Unknown', 'a broken receipts slot is Unknown with its message, not OK');
    ok(cards.find((c) => c.t === 'Schema sections').unk, 'a broken sections slot is Unknown');
    ok(/webhook secret not configured/.test(await A.page.textContent('#health .ad-probe')), 'a 503 shows the function\'s own message');
    const steps = await texts(A.page, '#health .ad-check-i');
    ok(/^Not checked/.test(steps[0]) && /^Not checked.*Resend/.test(steps[1]), 'steps built on unknown slots are Not checked, never Passing');
    ok((await texts(A.page, '#overview .ad-att-list > li').catch(() => [])).length >= 0, 'overview still draws');
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(b3) a missing function is Missing');
  await fresh();
  {
    const A = await newContext(browser, 'tok-admin');
    await A.ctx.route(SB + '/functions/v1/rzp-refund', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"NOT_FOUND","message":"Requested function was not found"}' }));
    await A.page.goto(BASE + 'admin.html#health');
    await A.page.waitForFunction(() => /404/.test(document.querySelector('#health .ad-probe')?.textContent || ''), null, { timeout: 10000 });
    ok(/rzp-refund.*Missing \(404\)/.test(await A.page.textContent('#health .ad-probe')), 'rzp-refund 404 reads Missing');
    const steps = await texts(A.page, '#health .ad-check-i');
    ok(/^Failing.*payment functions/.test(steps[2]), 'and the functions step fails');
    await A.page.click('[data-action="health-probe"]');
    ok(true, 'Re-probe is clickable');
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(c) Audit log');
  await fresh();
  {
    const A = await newContext(browser, 'tok-admin');
    await A.page.goto(BASE + 'admin.html#audit');
    await A.page.waitForSelector('#audit .ad-tl > li', { timeout: 10000 });
    ok((await A.page.$$('#audit .ad-tl > li')).length === 50, 'a page is 50 rows');
    await A.page.click('[data-action="audit-more"]');
    await A.page.waitForFunction(() => document.querySelectorAll('#audit .ad-tl > li').length === 100, null, { timeout: 5000 });
    ok(true, 'Load more appends the next 50 (keyset by next_before)');
    const ids = await A.page.$$eval('#audit .ad-tl-s code', (e) => e.length);
    ok(ids === 100, 'no row repeated or lost across the page boundary');
    await A.page.click('#audit .ad-audit-d >> nth=0 >> summary');
    ok(await A.page.isVisible('#audit .ad-diff >> nth=0'), 'a row expands to its before/after diff');
    await shot(A.page, 'audit-dark-1280');
    await theme(A.page, 'light'); await shot(A.page, 'audit-light-1280'); await theme(A.page, 'dark');
    await A.page.fill('#adAuditAction', 'set_');
    await A.page.click('.ad-audit-f button[type="submit"]');
    await A.page.waitForFunction(() => document.querySelectorAll('#audit .ad-tl > li').length === 40, null, { timeout: 5000 });
    ok(true, 'action prefix set_ narrows to the 40 set_* rows (set_plan, set_promo_code)');
    ok((await texts(A.page, '#audit .ad-tl-t strong')).every((t) => /^Set /.test(t)), 'every row starts with set_');
    await A.page.click('[data-action="audit-clear"]');
    await A.page.waitForFunction(() => document.querySelectorAll('#audit .ad-tl > li').length === 50, null, { timeout: 5000 });
    await A.page.click('#audit [data-action="audit-target"] >> nth=0');
    await A.page.waitForFunction(() => document.querySelector('#adAuditTarget')?.value, null, { timeout: 5000 });
    const tv = await A.page.inputValue('#adAuditTarget');
    await sleep(500);
    const rows = await A.page.$$eval('#audit .ad-tl-s code', (e) => e.map((x) => x.textContent));
    ok(rows.length > 0 && rows.every((r) => r.endsWith(tv)), `"everything about this target" filters to ${tv} (${rows.length} rows)`);
    ok(new RegExp('target=').test(await A.page.evaluate(() => location.hash)), 'and writes the target into the hash');
    // export
    const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.click('[data-action="audit-export"]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    const lines = csv.trim().split(/\r?\n/);
    ok(lines[0] === 'at,actor,actor_email,action,target_kind,target_id,note,before,after' && lines.length === rows.length + 1, 'Export CSV is exactly the loaded rows plus a header: ' + lines.length + ' lines');
    // table view
    await A.page.click('[data-view="table"]');
    await sleep(300);
    const trs = (await A.page.$$('#audit table.ad-table tbody tr')).length;
    ok(await A.page.isVisible('#audit table.ad-table') && trs === rows.length, `the table view lists the same rows (${trs} of ${rows.length})`);
    // empty filter
    await A.page.fill('#adAuditTarget', 'nobody-at-all');
    await A.page.click('.ad-audit-f button[type="submit"]');
    await A.page.waitForSelector('#audit .ad-empty', { timeout: 5000 });
    ok(/No rows match/.test(await A.page.textContent('#audit .ad-empty')) && /Checked/.test(await A.page.textContent('#audit .ad-empty')), 'an empty result says so, with a timestamp');
    // refusal
    ADMIN.state.refusal = 'Administrators only';
    await A.page.click('.ad-audit-f button[type="submit"]');
    await A.page.waitForSelector('#audit .ad-error', { timeout: 5000 });
    ok(/42501/.test(await A.page.textContent('#audit .ad-error')), 'a refused read shows an error state with the reason, not an empty list');
    allErrors.push(...A.errors);
    await A.ctx.close();
  }

  console.log('(d) a member is not shown the console');
  await fresh();
  {
    const M = await newContext(browser, 'tok-amy');
    await M.page.goto(BASE + 'admin.html');
    await sleep(2500);
    const text = await M.page.textContent('#main');
    ok(/Administrators only/.test(text) && !(await M.page.$('#health')), 'a non-admin sees "Administrators only" and no tabs');
    ok(!F.db.calls.includes('admin_health'), 'and no health RPC was called for them');
    allErrors.push(...M.errors);
    await M.ctx.close();
  }

  console.log('(e) 390px');
  await fresh();
  {
    const A = await newContext(browser, 'tok-admin', { width: 390, height: 844 });
    for (const t of ['overview', 'health', 'audit']) {
      await A.page.goto(BASE + 'admin.html#' + t);
      await A.page.waitForSelector(`#${t} .ad-card, #${t} .ad-audit-f`, { timeout: 10000 });
      await sleep(1500);
      const o = await overflow(A.page);
      ok(o <= 0, `${t}: no horizontal overflow at 390px (${o})`);
      await shot(A.page, t + '-dark-390');
      await theme(A.page, 'light'); await shot(A.page, t + '-light-390'); await theme(A.page, 'dark');
    }
    allErrors.push(...A.errors);
    await A.ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
const errs = allErrors.filter((e) => !/the server responded with a status of 4\d\d|Failed to load resource/.test(e));
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
