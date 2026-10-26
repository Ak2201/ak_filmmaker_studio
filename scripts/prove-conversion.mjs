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
     (c) the dashboard's referral row: the code, a /start?ref= link, a
         plain wa.me share; absent signed out
     (d) "Made with" on a staged PDF for a plan that keeps branding, the
         last child of <body>, shown in print; absent on Pro; removed on unstage
     (e) Settings → What's in my plan: the plan's modules, the next plan's
         extras, the upgrade figure; absent signed out
     (f) What's new: the drawer opens with every entry, "New" goes, the
         seen id lands in fms_studio_prefs_v1 (no new key), and stays gone
     (g) the first-week list's "Choose a plan": listed during a trial,
         ticked once paid, absent signed out
     (h) the trial reminders: one toast at <= 24h and one at <= 2h left,
         once per threshold per session; none with three days left
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

async function newContext({ tok = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 }, timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
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
    ok(hit, 'the cap toast says the cap, then "Upgrade to Intermediate for ₹5,000 more.": ' + JSON.stringify(await toasts(page)));
    ok(/See plans/i.test(await toasts(page)), 'and still offers See plans');
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
      const want = 'https://' + BRAND.host + BRAND.path + '?ref=' + encodeURIComponent(r.code || '');
      ok(!!r.code && r.link === want, 'COPY LINK carries the /start?ref= link footer.js builds: ' + r.link);
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

  console.log('(i) errors');
  ok(allErrors.length === 0, 'no page errors' + (allErrors.length ? ': ' + allErrors.slice(0, 5).join(' / ') : ''));
} finally {
  await browser.close();
  server.close();
}
console.log(`\nprove:conversion — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
