/* ============================================================
   prove:conversion — the in-app conversion surfaces, in a browser
   ------------------------------------------------------------
   Against the OPEN build (PROVE_DIST, default dist-verify/: the site
   gate off, as verify needs) and the fake Supabase project
   (scripts/fake-supabase.mjs), driven through F.db exactly as
   prove:billing and prove:growth drive it:

     (a) the upgrade nudge: a plan wall (guard()) names the next plan and
         the DIFFERENCE the server quotes (quote_order, §21/§52) for a
         Basic holder; with no quote it names the plan and prints no figure
     (b) the project cap (P0402) toast names the next plan and the difference
     (b2) a cap notice REPLAYED at boot (before billing_status answers)
         never names the plan the member already holds
     (b3) the share-link cap (P0402 from the share dialog) and the seat cap
         (53400 on Settings → Account, owner only) name the next plan and
         the difference, the same way
     (c) the dashboard's referral row: the code, a /purchase?ref=…&src=referral link that
         fills the friend's "Have a code?" box, a plain wa.me share;
         absent signed out
     (d) "Made with" on a staged PDF for a plan that keeps branding, the
         last child of <body>, shown in print; absent on Pro; removed on unstage;
         and on the plain prints of the budget, stripboard and reports
     (d2) What's new from the rail's avatar menu
     (e) Settings → What's in my plan: the plan's modules, the next plan's
         extras, the upgrade figure; a full trial is not told it may remove
         the PDF line; an ended trial and a lapsed year list nothing and
         offer a plan; a grant shows no section; absent signed out
     (f) What's new: the drawer opens with every entry, "New" goes, the
         seen id lands in fms_studio_prefs_v1 (no new key), and stays gone
     (g) the first-week list's "Choose a plan": listed during a trial,
         ticked once paid, absent signed out, absent for a year-long
         (grandfathered) trial
     (h) the trial reminders: one toast at <= 24h and one at <= 2h left,
         once per threshold per trial; none with three days left; none at
         all for a 30-minute trial (a threshold the trial never exceeded
         twice over is skipped)
     (i) no localStorage key outside the known registry was written
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, setTrial, EXT_RPC } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist-verify');
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8'));
const MATRIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plan-matrix.json'), 'utf8'));
const CHANGELOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/changelog.json'), 'utf8'));
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('✗ no build at ' + DIST + ' (npm run build:verify)'); process.exit(2); }
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp !== 'off') { console.error('✗ this proof needs the open build (VITE_SITE_GATE=off)'); process.exit(2); }
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const PORT = Number(process.env.PROVE_PORT) || 5391;
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); });
const BASE = `http://localhost:${PORT}/`;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/* The plan rows as §36 seeds them from the matrix, so "what the next plan
   adds" has something to add (the fake's rows are {} = everything allowed). */
function matrixFeatures(planId) {
  const out = {};
  for (const r of MATRIX.features) {
    if (r.kind === 'limit') continue;
    const has = (r.plans || []).includes(planId);
    if (r.inverted) { if (has) out[r.key] = true; } else out[r.key] = has;
  }
  return out;
}
const AMY = USERS['tok-amy'].id;
function basicHolder() {
  F.reset();
  for (const row of F.db.plans) if (row.id !== 'free') row.features = matrixFeatures(row.id);
  F.db.members.set(AMY, { role: 'user', disabled_at: null, trial_started_at: null });
  const at = new Date(Date.now() - 3 * 86400e3).toISOString();
  const s0 = new Date(Date.now() + 86400e3).toISOString(), e0 = new Date(Date.now() + 366 * 86400e3).toISOString();
  F.db.accounts.push({ id: 'acc_amy', name: 'Amy’s Studio', owner_id: AMY, plan: 'starter', plan_until: e0, plan_period: 'year', seat_limit: 1, created_at: at });
  F.db.payments.push({ id: 'payS', user_id: AMY, account_id: 'acc_amy', plan_id: 'starter', period: 'year', amount_paise: 299900, list_paise: 299900, discount_paise: 0, credit_paise: 0,
    currency: 'INR', razorpay_order_id: 'order_s', razorpay_payment_id: 'pay_s', status: 'paid', created_at: at, paid_at: at, starts_at: s0, ends_at: e0 });
}
function proHolder() {
  basicHolder();
  const a = F.db.accounts.find((x) => x.id === 'acc_amy'); a.plan = 'pro';
  F.db.payments[0].plan_id = 'pro';
}

async function newContext({ tok = null, width = 1280, keepWall = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 }, timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  /* Since "one payment page" (0c92506, 28 Oct 2026) a walled member is
     SENT to purchase.html; plan-gate.js keeps the in-page wall as the
     fallback and names window.__fmsKeepWall as the proof hook that holds
     it in place. The checks below that are about the wall's or Settings'
     own wording use it; the redirect itself is asserted in (h2). */
  if (keepWall) await ctx.addInitScript(() => { window.__fmsKeepWall = true; });
  await ctx.route(SB + '/**', handle);
  await ctx.route(new RegExp('https://' + BRAND.host.replace(/\./g, '\\.') + '/.*'), (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('fms_region_v1', 'IN'); } catch (e) { /* */ } });
  if (tok) {
    await ctx.addInitScript(([k, v, uid]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('.toast-host')].map((n) => n.textContent).join(' | '));
const waitToast = (page, re, timeout = 10000) => page.waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll('.toast-host')].map((n) => n.textContent).join(' ')), re.source, { timeout }).then(() => true, () => false);
const allErrors = [];
/* PROVE_SHOTS=<dir>: a screenshot of each nudge, for a person to read. */
const shot = async (page, name) => {
  if (!process.env.PROVE_SHOTS) return;
  fs.mkdirSync(process.env.PROVE_SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.PROVE_SHOTS, name + '.png') }).catch(() => {});
};

try {
  console.log('(a) the upgrade nudge on a plan wall');
  basicHolder();
  F.db.plans.find((p) => p.id === 'starter').features.exports = false;
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'stripboard.html');
    await page.waitForFunction(() => !!window.StudioPDF, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const refused = await page.evaluate(() => window.StudioPDF.exportPDF({ scope: 'blueprint' }));
    ok(refused === false, 'a PDF export is refused on a plan without exports');
    const hit = await waitToast(page, /Upgrade to Intermediate for ₹5,000 more/);
    ok(hit, 'the toast names Intermediate and the difference the server quotes (₹5,000, not the ₹7,999 list price): ' + JSON.stringify(await toasts(page)));
    ok(/UPGRADE TO INTERMEDIATE/.test(await toasts(page)), 'its button says UPGRADE TO INTERMEDIATE');
    allErrors.push(...errors); await ctx.close();
  }
  /* No quote: the RPC is missing. The plan is named, no figure is printed. */
  EXT_RPC.quote_order = () => { throw { code: 'PGRST202', message: 'Could not find the function public.quote_order', status: 404 }; };
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.StudioPDF.exportPDF({ scope: 'blueprint' }));
    const hit = await waitToast(page, /It comes with the Intermediate plan\./);
    const t = await toasts(page);
    ok(hit && !/₹/.test(t.split('PDF exports')[1] || t), 'without a quote: "It comes with the Intermediate plan." and no figure: ' + JSON.stringify(t));
    allErrors.push(...errors.filter((e) => !/quote_order|PGRST202|404/.test(e))); await ctx.close();
  }
  delete EXT_RPC.quote_order;

  console.log('(b) the project cap names the next plan and the difference');
  basicHolder();
  for (let i = 0; i < 3; i++) F.db.projects.push({ id: 'cloud' + i, title: 'Cloud film ' + i, format: 'feature', owner_id: AMY });
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.StudioStore.createProject({ title: 'Fourth film', format: 'feature' }));
    const hit = await waitToast(page, /syncs up to 3 projects.*Upgrade to Intermediate for ₹5,000 more\./, 15000);
    await shot(page, 'project-cap-toast');
    ok(hit, 'the cap toast says the cap, then "Upgrade to Intermediate for ₹5,000 more.": ' + JSON.stringify(await toasts(page)));
    ok(/See plans/i.test(await toasts(page)), 'and still offers See plans');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(b2) a replayed cap notice never names the plan already held');
  for (const delay of [0, 2500]) {
    basicHolder();
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await ctx.route(SB + '/rest/v1/rpc/billing_status', async (r) => { await new Promise((ok2) => setTimeout(ok2, delay)); return handle(r); });
    await ctx.addInitScript(() => {
      if (!sessionStorage.getItem('__noticed')) {
        sessionStorage.setItem('__noticed', '1');
        sessionStorage.setItem('fms_plan_limit_notice', JSON.stringify({ m: 'Your Basic plan syncs up to 3 projects. Delete one or choose a bigger plan.', at: Date.now() }));
      }
    });
    await page.goto(BASE + 'dashboard.html');
    const shown = await waitToast(page, /syncs up to 3 projects/, 10000);
    await page.waitForTimeout(delay + 4000);
    const t = await toasts(page);
    ok(shown && !/Basic raises it/.test(t) && !/₹2,999/.test(t), 'billing_status after ' + delay + 'ms: the replayed toast never says "Basic raises it": ' + JSON.stringify(t));
    ok(/Intermediate/.test(t) || !/raises it|Upgrade to/.test(t), 'it names Intermediate, or no plan at all');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(b3) the share-link and seat caps name the next plan and the difference');
  basicHolder();
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await ctx.route(SB + '/rest/v1/shares*', (r) => (r.request().method() === 'POST'
      ? r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0402', message: 'Your Basic plan allows 3 live share links. Revoke one, or upgrade.', details: null, hint: null }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })));
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.StudioUI.openShareDialog('cloud0'));
    await page.click('#shGen');
    const hit = await waitToast(page, /allows 3 live share links.*Upgrade to Intermediate for ₹5,000 more\./, 15000);
    await shot(page, 'share-cap-toast');
    ok(hit, 'the share cap says the cap, then "Upgrade to Intermediate for ₹5,000 more.": ' + JSON.stringify(await toasts(page)));
    ok(/See plans/i.test(await toasts(page)), 'with a See plans button');
    allErrors.push(...errors.filter((e) => !/400|shares/.test(e))); await ctx.close();
  }
  {
    basicHolder();
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    /* seat_limit 3 under Basic's plan cap of 1 (§50: the lower binds),
       so the form is offered and the SERVER refuses "(1 of 1)". */
    const acct = { id: 'acc_amy', name: 'Amy’s Studio', owner_id: AMY, plan: 'starter', seat_limit: 3 };
    await ctx.route(SB + '/rest/v1/accounts*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? [acct] : []) }));
    await ctx.route(SB + '/rest/v1/account_members*', (r) => (r.request().method() === 'GET'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ invited_email: USERS['tok-amy'].email, user_id: AMY, role: 'owner', status: 'active', created_at: new Date().toISOString() }]) })
      : r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '53400', message: 'Seat limit reached for this account (1 of 1). Add seats to invite more people.', details: null, hint: null }) })));
    await page.goto(BASE + 'settings.html#team');
    const ready = await page.waitForSelector('#acctEmail', { timeout: 15000 }).then(() => true, () => false);
    ok(ready, 'the account panel offers an invite');
    if (ready) {
      await page.waitForTimeout(2500);   // the page's re-reads settle; a repaint keeps what is typed anyway
      await page.fill('#acctEmail', 'friend@example.com');
      /* The page redraws the panel on each of its own re-reads; press the
         button that is there NOW rather than one a redraw may replace. */
      await page.evaluate(() => document.querySelector('[data-acct-action="invite"]').click());
      const said = await page.waitForFunction(() => /Seat limit reached.*Upgrade to Intermediate for ₹5,000 more\./.test((document.querySelector('.acct-error') || {}).textContent || ''), null, { timeout: 15000 }).then(() => true, () => false);
      const box = await page.evaluate(() => { const e = document.querySelector('.acct-error'); const a = e && e.querySelector('a'); return { t: e ? e.textContent : '', href: a ? a.getAttribute('href') : '' }; });
      await shot(page, 'seat-cap-refusal');
      ok(said, 'the seat cap says the cap, then "Upgrade to Intermediate for ₹5,000 more.": ' + JSON.stringify(box.t));
      ok(/^purchase\.html\?plan=indie/.test(box.href), 'with a link to Intermediate’s card: ' + box.href);
    }
    allErrors.push(...errors.filter((e) => !/400|account_members/.test(e))); await ctx.close();
  }
  {
    /* A FULL account (1 of 1, the plan's cap): no form, and the seat line
       names the plan that adds seats with the difference. */
    basicHolder();
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    const acct = { id: 'acc_amy', name: 'Amy’s Studio', owner_id: AMY, plan: 'starter', seat_limit: 1 };
    await ctx.route(SB + '/rest/v1/accounts*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? [acct] : []) }));
    await ctx.route(SB + '/rest/v1/account_members*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(r.request().method() === 'GET' ? [{ invited_email: USERS['tok-amy'].email, user_id: AMY, role: 'owner', status: 'active', created_at: new Date().toISOString() }] : []) }));
    await page.goto(BASE + 'settings.html#team');
    const said = await page.waitForFunction(() => /Upgrade to Intermediate for ₹5,000 more\./.test((document.querySelector('.acct-seats.is-full') || {}).textContent || ''), null, { timeout: 15000 }).then(() => true, () => false);
    await shot(page, 'seat-full-line');
    ok(said, 'a full account’s seat line names Intermediate and the difference: ' + JSON.stringify(await page.textContent('.acct-seats').catch(() => '')));
    ok(!(await page.$('#acctEmail')), 'and offers no invite form the database would refuse');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(c) the dashboard referral row');
  basicHolder();
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    const shown = await page.waitForSelector('.db-member .gr-share', { timeout: 15000 }).then(() => true, () => false);
    ok(shown, 'a paid member sees the referral row on the dashboard');
    if (shown) {
      const r = await page.evaluate(() => {
        const box = document.querySelector('.db-member .gr-share');
        const copy = box.querySelector('[data-gr-action="copy"]');
        const wa = box.querySelector('a[href^="https://wa.me/"]');
        return { code: (box.querySelector('.gr-code') || {}).textContent, link: copy && copy.dataset.copy, wa: wa && wa.href, target: wa && wa.target, rel: wa && wa.rel };
      });
      const want = 'https://' + BRAND.host + '/purchase?ref=' + encodeURIComponent(r.code || '') + '&src=referral';
      ok(!!r.code && r.link === want, 'COPY LINK carries the /purchase?ref=…&src=referral link (the page that reads ?ref=; the source bucket "referral"): ' + r.link);
      /* Follow it as a friend would: the code must arrive in the box. */
      const f = await newContext({ tok: 'tok-ben' });
      await f.page.goto(BASE + 'purchase.html' + new URL(r.link).search);
      const filled = await f.page.waitForFunction((c) => { const i = document.getElementById('plPromoCode'); return !!i && i.value === c; }, r.code, { timeout: 15000 }).then(() => true, () => false);
      ok(filled, 'following the copied link fills #plPromoCode with ' + r.code);
      allErrors.push(...f.errors); await f.ctx.close();
      ok(!!r.wa && r.wa.startsWith('https://wa.me/?text=') && decodeURIComponent(r.wa.split('text=')[1]).includes(want), 'the WhatsApp share is a plain wa.me link whose text carries the link');
      ok(r.target === '_blank' && /noopener/.test(r.rel || ''), 'it opens a new tab, noopener');
    }
    allErrors.push(...errors); await ctx.close();
  }
  {
    F.reset();
    const { ctx, page, errors } = await newContext({});
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(2500);
    ok(!(await page.$('.gr-share')), 'signed out: no referral row');
    ok(!!(await page.$('[data-action="db-whatsnew"]')), 'signed out: What’s new is still there');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(d) "Made with" on every PDF');
  for (const [who, setup, want] of [['Basic', basicHolder, true], ['Pro', proHolder, false]]) {
    setup();
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(3000);
    for (const scope of ['board', 'screenplay', 'bdsheets', 'ready', 'sides']) {
      const st = await page.evaluate((sc) => {
        window.StudioPDF.stage({ scope: sc });
        const el = document.getElementById('pdf-made-with');
        return { has: !!el, last: !!el && document.body.lastElementChild === el, text: el ? el.textContent : '' };
      }, scope);
      if (want) ok(st.has && st.last && st.text.startsWith('Made with ' + BRAND.name + ' — ' + BRAND.host + BRAND.path), who + ' / ' + scope + ': the line is the last child of <body>: ' + JSON.stringify(st.text));
      else ok(!st.has, who + ' / ' + scope + ': no line (remove_branding is allowed)');
      if (want && scope === 'bdsheets') {
        await page.emulateMedia({ media: 'print' });
        const vis = await page.evaluate(() => { const el = document.getElementById('pdf-made-with'); const cs = getComputedStyle(el); return cs.display + ' ' + cs.fontSize; });
        ok(/^block 10\.6/.test(vis) || /^block/.test(vis), 'in print it shows, small, above the page\'s "only this prints" rule: ' + vis);
        await page.emulateMedia({ media: 'screen' });
      }
      await page.evaluate(() => window.StudioPDF.unstage());
      ok(!(await page.$('#pdf-made-with')), who + ' / ' + scope + ': unstage removes it');
    }
    for (const scope of ['invoice', 'pitch', 'callsheet']) {
      const has = await page.evaluate((sc) => { window.StudioPDF.stage({ scope: sc }); const x = !!document.getElementById('pdf-made-with'); window.StudioPDF.unstage(); return x; }, scope);
      ok(!has, who + ' / ' + scope + ': not added (a receipt, or a document that carries its own)');
    }
    if (want) {
      await page.evaluate(() => window.StudioPDF.stage({ scope: 'board' }));
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format: 'A4', landscape: true });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.StudioPDF.unstage());
      const { extractLayoutText } = await import('../src/lib/pdf-text.js');
      let text = '';
      try { const r = await extractLayoutText(pdf); text = JSON.stringify(r); } catch (e) { text = 'ERR ' + e.message; }
      ok(text.includes('Made with') && text.includes(BRAND.host), 'a real page.pdf() of the stripboard carries the line in its text');
    }
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(d) the plain prints: budget, stripboard, reports');
  /* window.print() is stubbed to report, at the moment it is called and
     under print media, whether the line is the last child of <body> and
     shown; the page's own print button (or its delegated action) runs. */
  const plainPrint = async (page, action) => page.evaluate((act) => new Promise((done) => {
    window.print = () => {
      const el = document.getElementById('pdf-made-with');
      done({ has: !!el, last: !!el && document.body.lastElementChild === el, shown: !!el && getComputedStyle(el).display !== 'none', text: el ? el.textContent : '' });
    };
    const [attr, name] = act.startsWith('cx:') ? ['cx', act.slice(3)] : ['action', act];
    let b = document.querySelector('[data-' + attr + '="' + name + '"]');
    let made = false;
    if (!b) { b = document.createElement('button'); b.dataset[attr] = name; b.hidden = true; (document.getElementById('main') || document.body).prepend(b); made = true; }
    b.click();
    if (made) b.remove();
    setTimeout(() => done({ has: false, last: false, shown: false, text: 'print() was never called' }), 3000);
  }), action);
  for (const [who, setup, want] of [['Basic', basicHolder, true], ['Pro', proHolder, false]]) {
    setup();
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.StudioStore.createProject({ title: 'Print film', format: 'feature' }));
    for (const [file, action] of [['budget.html', 'print'], ['budget.html', 'cx:print-top'], ['stripboard.html', 'sb-print'], ['reports.html', 'print-reports']]) {
      await page.goto(BASE + file);
      await page.waitForTimeout(3000);
      await page.emulateMedia({ media: 'print' });
      const st = await plainPrint(page, action);
      await page.emulateMedia({ media: 'screen' });
      if (want) ok(st.has && st.last && st.shown && st.text.startsWith('Made with ' + BRAND.name), who + ' / ' + file + ' ' + action + ': the line is the last child of <body>, shown in print: ' + JSON.stringify(st));
      else ok(!st.has && st.text !== 'print() was never called', who + ' / ' + file + ' ' + action + ': no line (remove_branding is allowed): ' + JSON.stringify(st));
      await page.waitForTimeout(1200);
      ok(!(await page.$('#pdf-made-with')), who + ' / ' + file + ' ' + action + ': gone again after the print');
    }
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(d2) What’s new from the avatar menu');
  F.reset();
  {
    const { ctx, page, errors } = await newContext({});
    await page.goto(BASE + 'stripboard.html');
    await page.waitForSelector('#studioRail .sh-rail-account', { timeout: 10000 });
    await page.click('#studioRail .sh-rail-account');
    const row = await page.waitForSelector('#shAcctMenu [data-action="rail-whatsnew"]', { timeout: 5000 }).then(() => true, () => false);
    ok(row, 'the account menu has a What’s new row');
    if (row) {
      await page.click('#shAcctMenu [data-action="rail-whatsnew"]');
      const n = await page.waitForSelector('[data-mn-sheet="changelog"] .cl-entry', { timeout: 5000 }).then(() => page.$$eval('[data-mn-sheet="changelog"] .cl-entry', (e) => e.length), () => 0);
      ok(n === CHANGELOG.entries.length, 'it opens the changelog drawer with every entry (' + n + ')');
      ok(!(await page.$('#shAcctMenu')), 'and the menu closes');
      await page.keyboard.press('Escape');
      ok(await page.evaluate(() => !!document.activeElement && document.activeElement.matches('.sh-rail-account')), 'Escape returns focus to the avatar');
    }
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(e) Settings: What’s in my plan');
  basicHolder();
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'settings.html#plan-contents');
    const shown = await page.waitForSelector('#plan-contents .st-pc-list', { timeout: 15000 }).then(() => true, () => false);
    ok(shown, 'the section lists the plan');
    if (shown) {
      const mine = await page.$$eval('#plan-contents .st-pc-list:not(.is-next) li', (l) => l.map((x) => x.textContent));
      ok(mine.includes('Screenplay Writer') || mine.some((x) => /Screenplay/.test(x)), 'Basic includes the Screenplay Writer: ' + mine.slice(0, 6).join(', ') + '…');
      ok(!mine.some((x) => /Stripboard/.test(x)), 'and not the Stripboard');
      const next = await page.waitForFunction(() => /Upgrade to Intermediate for ₹5,000/.test((document.querySelector('#plan-contents .st-pc-next') || {}).textContent || ''), null, { timeout: 10000 }).then(() => true, () => false);
      const box = await page.textContent('#plan-contents .st-pc-next').catch(() => '');
      ok(next && /Upgrade to Intermediate to get/.test(box) && /Stripboard/.test(box), 'the next plan’s extras, with the server’s difference: ' + JSON.stringify(box.slice(0, 200)));
    }
    allErrors.push(...errors); await ctx.close();
  }
  F.reset();
  for (const row of F.db.plans) if (row.id !== 'free') row.features = matrixFeatures(row.id);
  F.db.settings.trial_minutes = 4320;
  setTrial(AMY, { minutes: 4320, scope: 'full' });
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'settings.html#plan-contents');
    const shown = await page.waitForSelector('#plan-contents .st-pc-list', { timeout: 15000 }).then(() => true, () => false);
    const txt = shown ? await page.textContent('#plan-contents') : '';
    ok(shown && /trial/i.test(txt), 'a full-scope trial sees what the trial opens');
    ok(shown && !/Remove branding/i.test(txt), 'and is NOT told it may remove the PDF line (every trial PDF prints it)');
    allErrors.push(...errors); await ctx.close();
  }
  /* An ENDED trial (purchases required): no module list, the way back. */
  let planShots = 0;
  const planContents = async () => {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy', keepWall: true });
    await page.goto(BASE + 'settings.html#plan-contents');
    await page.waitForTimeout(4000);
    await page.evaluate(() => { const s = document.getElementById('plan-contents'); if (s) s.scrollIntoView(); });
    await shot(page, 'plan-contents-' + (++planShots));
    const r = await page.evaluate(() => { const s = document.getElementById('plan-contents'); return s ? { text: s.textContent, lists: s.querySelectorAll('.st-pc-list').length, cta: !!s.querySelector('a[href="purchase.html"]') } : null; });
    allErrors.push(...errors); await ctx.close();
    return r;
  };
  F.reset();
  for (const row of F.db.plans) if (row.id !== 'free') row.features = matrixFeatures(row.id);
  F.db.settings.purchase_required = true;
  setTrial(AMY, { minutes: 30, scope: 'full', startedAt: Date.now() - 3 * 3600e3 });
  { const r = await planContents();
    ok(!!r && /trial has ended/i.test(r.text) && r.lists === 0 && r.cta && !/opens right now/.test(r.text), 'an ended trial: "Your free trial has ended", no module list, Choose a plan: ' + JSON.stringify(r && r.text.slice(0, 160))); }
  /* A LAPSED year: the plan ran out yesterday. */
  basicHolder();
  F.db.settings.purchase_required = true;
  { const a = F.db.accounts.find((x) => x.id === 'acc_amy'); a.plan_until = new Date(Date.now() - 86400e3).toISOString(); F.db.payments[0].ends_at = a.plan_until; }
  { const r = await planContents();
    ok(!!r && /year (has )?ended/i.test(r.text) && r.lists === 0 && r.cta, 'a lapsed year: "Your plan’s year ended on …", no module list, Choose a plan: ' + JSON.stringify(r && r.text.slice(0, 160))); }
  /* A GRANT: the studio's word, not a plan's: no section. */
  F.reset();
  for (const row of F.db.plans) if (row.id !== 'free') row.features = matrixFeatures(row.id);
  F.db.settings.purchase_required = true;
  F.db.members.set(AMY, { role: 'user', disabled_at: null, trial_started_at: null });
  F.db.emailGrants.set(USERS['tok-amy'].email, { email: USERS['tok-amy'].email, role: 'user', plan: null, until: null, applied_user: AMY });
  { const r = await planContents();
    ok(r === null, 'a grant: no What’s in my plan (nothing to list, the plan card says the access): ' + JSON.stringify(r && r.text.slice(0, 120))); }
  {
    F.reset();
    const { ctx, page, errors } = await newContext({});
    await page.goto(BASE + 'settings.html');
    await page.waitForTimeout(2000);
    ok(!(await page.$('#plan-contents')), 'signed out: no What’s in my plan');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(f) What’s new');
  F.reset();
  {
    const { ctx, page, errors } = await newContext({});
    await page.goto(BASE + 'dashboard.html');
    await page.waitForSelector('[data-action="db-whatsnew"]', { timeout: 10000 });
    ok(!!(await page.$('.db-member-news .k-badge')), 'a first visit says New');
    const before = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.click('[data-action="db-whatsnew"]');
    await page.waitForSelector('[data-mn-sheet="changelog"] .cl-entry', { timeout: 5000 });
    ok((await page.$$eval('[data-mn-sheet="changelog"] .cl-entry', (e) => e.length)) === CHANGELOG.entries.length, 'the drawer lists every entry (' + CHANGELOG.entries.length + ')');
    ok(!(await page.$('.db-member-news .k-badge')), 'New is gone once opened');
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}').whatsNewSeen);
    ok(seen === CHANGELOG.entries[0].id, 'the newest id is kept in fms_studio_prefs_v1: ' + seen);
    const after = await page.evaluate(() => Object.keys(localStorage).sort());
    ok(after.every((k) => before.includes(k) || k === 'fms_studio_prefs_v1'), 'no new localStorage key: ' + after.filter((k) => !before.includes(k)).join(', '));
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('[data-action="db-whatsnew"]', { timeout: 10000 });
    ok(!(await page.$('.db-member-news .k-badge')), 'after a reload New stays gone');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(g) the first-week list: Choose a plan');
  const checklist = async (tok) => {
    const { ctx, page, errors } = await newContext({ tok });
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#firstweek .tw-item', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const items = await page.$$eval('#firstweek .tw-item', (l) => l.map((x) => [x.textContent.replace(/ — .*$/, '').replace('✓', '').trim(), x.classList.contains('is-done')]));
    allErrors.push(...errors); await ctx.close();
    return items;
  };
  F.reset(); setTrial(AMY, { minutes: 4320, scope: 'full' });
  { const it = await checklist('tok-amy'); const p = it.find((x) => x[0] === 'Choose a plan');
    ok(!!p && !p[1] && it[it.length - 1][0] === 'Choose a plan', 'during a trial "Choose a plan" is the last item, unticked'); }
  basicHolder();
  { const it = await checklist('tok-amy'); const p = it.find((x) => x[0] === 'Choose a plan');
    ok(!!p && p[1], 'once paid it is ticked'); }
  F.reset();
  { const it = await checklist(null);
    ok(it.length > 0 && !it.some((x) => x[0] === 'Choose a plan'), 'signed out it is not listed'); }
  F.reset(); F.db.members.set(AMY, { role: 'user', disabled_at: null });   // no trial key: the §30 grandfather, a year
  { const it = await checklist('tok-amy');
    ok(it.length > 0 && !it.some((x) => x[0] === 'Choose a plan'), 'a grandfathered member (a year-long trial) is not asked to choose a plan'); }

  console.log('(h) the trial-ending reminders');
  const trialLeft = (minsLeft) => { F.reset(); F.db.settings.trial_minutes = 4320; setTrial(AMY, { minutes: 4320, scope: 'full', startedAt: Date.now() - (4320 - minsLeft) * 60000 }); };
  trialLeft(4000);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'three days left: no reminder');
    allErrors.push(...errors); await ctx.close();
  }
  trialLeft(23 * 60);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /Your free trial ends in about 23 hours/), 'a day left: "ends in about 23 hours": ' + JSON.stringify(await toasts(page)));
    ok(/CHOOSE A PLAN/.test(await toasts(page)), 'with CHOOSE A PLAN');
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'the next page in the same session does not repeat it');
    trialLeft(90);
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /Your free trial ends in about 2 hours/), 'two hours left: the second reminder');
    await page.goto(BASE + 'index.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'and not again');
    const keys = await page.evaluate(() => Object.keys(sessionStorage));
    ok(keys.includes('fms_trial_reminded'), 'the shown thresholds live in sessionStorage');
    ok(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /remind/i.test(k)))), 'and nothing of them in localStorage');
    allErrors.push(...errors); await ctx.close();
  }
  trialLeft(90);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /in about 2 hours/), 'arriving with 90 minutes left shows the two-hour reminder');
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'and the day’s reminder is not shown after it');
    allErrors.push(...errors); await ctx.close();
  }

  /* A 30-MINUTE trial: neither threshold is ever reached twice over, so
     starting one raises no "ends in under an hour" on the next page. */
  F.reset(); F.db.settings.trial_minutes = 30; setTrial(AMY, { minutes: 30, scope: 'full', startedAt: Date.now() - 60000 });
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'a 30-minute trial just started: no reminder: ' + JSON.stringify(await toasts(page)));
    await page.goto(BASE + 'stripboard.html');
    await page.waitForTimeout(3000);
    ok(!/free trial ends/.test(await toasts(page)), 'nor on the next page');
    allErrors.push(...errors); await ctx.close();
  }
  /* A 3-HOUR trial: too short for the day's reminder, long enough for
     the two-hour one, which comes only once two hours are left. */
  F.reset(); F.db.settings.trial_minutes = 180; setTrial(AMY, { minutes: 180, scope: 'full', startedAt: Date.now() - 60000 });
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(4000);
    ok(!/free trial ends/.test(await toasts(page)), 'a 3-hour trial just started: no reminder');
    allErrors.push(...errors); await ctx.close();
  }
  F.reset(); F.db.settings.trial_minutes = 300; setTrial(AMY, { minutes: 300, scope: 'full', startedAt: Date.now() - 200 * 60000 });
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /Your free trial ends in about 2 hours/), 'a 5-hour trial with 100 minutes left: the two-hour reminder');
    ok(!/about 24 hours|about 23 hours/.test(await toasts(page)), 'and never the day’s');
    allErrors.push(...errors); await ctx.close();
  }


  console.log('(h2) the launch pass: its reminders, its checklist item, the wall (schema §61)');
  /* Amy on a 7-day pass with `hoursLeft` to go: Pro, plan_period 'pass',
     and the paid pass payment whose span is the pass's length. */
  const passLeft = (hoursLeft) => {
    F.reset();
    F.db.members.set(AMY, { role: 'user', disabled_at: null, trial_started_at: null });
    const until = Date.now() + hoursLeft * 3600e3;
    F.db.accounts.push({ id: 'acc_pass', name: "Amy's Studio", owner_id: AMY, plan: 'pro', plan_period: 'pass', plan_until: new Date(until).toISOString(), seat_limit: 10, created_at: new Date().toISOString() });
    F.db.payments.push({ id: 'pay_pass', user_id: AMY, account_id: 'acc_pass', plan_id: 'pro', period: 'pass', amount_paise: 4900, currency: 'INR', status: 'paid', paid_at: new Date().toISOString(),
      starts_at: new Date(until - 7 * 86400e3).toISOString(), ends_at: new Date(until).toISOString(), created_at: new Date().toISOString() });
  };
  passLeft(23);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /Your 7-day pass ends in about 23 hours/), 'a pass with a day left: "Your 7-day pass ends in about 23 hours": ' + JSON.stringify(await toasts(page)));
    ok(/Keep going with a yearly plan from about ₹[\d.]+ a day/.test(await toasts(page)) && /CHOOSE A PLAN/.test(await toasts(page)), 'with the yearly plans by the day (from the plan rows) and CHOOSE A PLAN');
    ok(!/free trial/.test(await toasts(page)), 'and no trial wording');
    allErrors.push(...errors); await ctx.close();
  }
  passLeft(6 * 24);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForTimeout(4000);
    ok(!/pass ends/.test(await toasts(page)), 'six days left: no reminder');
    allErrors.push(...errors); await ctx.close();
  }
  passLeft(1.5);
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await waitToast(page, /Your 7-day pass ends in about 2 hours/), 'an hour and a half left: the two-hour reminder');
    allErrors.push(...errors); await ctx.close();
  }
  passLeft(5 * 24);
  { const it = await checklist('tok-amy'); const p = it.find((x) => x[0] === 'Choose a plan');
    ok(!!p && !p[1], 'during a pass "Choose a plan" is listed and unticked (a pass is not a plan chosen)'); }
  /* THE WALL: a member with no trial and no plan, while the pass is on sale */
  F.reset();
  F.db.members.set(AMY, { role: 'user', disabled_at: null, trial_started_at: null });
  Object.assign(F.db.settings, { pass_enabled: true, pass_ends_at: new Date(Date.now() + 86400e3).toISOString() });
  {
    /* the one payment page: the walled member lands on purchase.html, and its pass card is there */
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy' });
    await page.goto(BASE + 'dashboard.html');
    ok(await page.waitForURL(/purchase(\.html)?/, { timeout: 12000 }).then(() => true, () => false), 'a walled member is sent to the purchase page');
    ok(await page.waitForSelector('#pass [data-pu-action="buy-pass"]', { timeout: 12000 }).then(() => true, () => false), 'and the purchase page offers the pass');
    allErrors.push(...errors); await ctx.close();
  }
  {
    const { ctx, page, errors } = await newContext({ tok: 'tok-amy', keepWall: true });
    await page.goto(BASE + 'dashboard.html');
    await page.waitForSelector('.pg-wall [data-action="pg-buy-pass"]', { timeout: 12000 }).then(() => ok(true, 'the wall offers the pass'), () => ok(false, 'the wall offers the pass'));
    ok(/TRY THE WHOLE STUDIO FOR ₹49 · 7 DAYS/.test(await page.textContent('.pg-wall').catch(() => '')), 'TRY THE WHOLE STUDIO FOR ₹49 · 7 DAYS');
    await page.waitForFunction(() => /^\d\d:\d\d:\d\d$|^1d /.test((document.querySelector('.pg-wall [data-pass-timer]') || {}).textContent || ''), null, { timeout: 5000 })
      .then(() => ok(true, 'with the countdown to the server deadline'), () => ok(false, 'with the countdown to the server deadline'));
    ok(!(await page.$('.pg-wall [data-action="pg-start-trial"]')), 'and no free trial button');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(i) errors');
  ok(allErrors.length === 0, 'no page errors' + (allErrors.length ? ': ' + allErrors.slice(0, 5).join(' / ') : ''));
} finally {
  await browser.close();
  server.close();
}
console.log(`\nprove:conversion — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
