/* ============================================================
   PROOF: plans, Razorpay checkout, activation, caps, the console
   ------------------------------------------------------------
   The real GATED build (what the hosts run) in Chromium, against the
   shared Supabase fake extended with schema section 16 and the two
   edge functions, and a stub of Razorpay Checkout that signs the way
   Razorpay does (HMAC-SHA256 of order|payment with the key secret) —
   so rzp-verify's check is real even though no money moves.

   Asserted (and, since section 18, (i): the Features matrix on the
   console, the free tier seeing the Dragon sample alone, a module
   unticked for a plan showing its lock panel and its PLAN flag):
     (a) a member sees the four tiers on purchase.html with the prices
         the plans table holds; the period switch reprices them
     (b) BUY: rzp-order is asked for the plan and period, Checkout opens,
         rzp-verify receives a GENUINE signature, the plan activates,
         the page shows the tier and its expiry, the ledger reads paid
     (c) PAYING GRANTS ENTRY: a signed-in stranger on purchase.html buys a
         plan and is a member — the gate opens with no code and no
         admin
     (d) a tampered signature is refused and nothing activates
     (e) closing Checkout charges nothing and says so
     (f) the plan's project cap: the cloud refuses the second project
         (P0402), the page says so with a way to the plans, and the
         project is still on this device
     (g) the console: an admin edits a price and the cards follow;
         a grant lands in the ledger and on the member
     (h) nothing here writes to localStorage
     (j) promo codes (schema section 20): "Have a code?" reprices the
         cards from quote_order, BUY carries the code, Checkout opens
         with the DISCOUNTED amount, the ledger row has the code and
         the code's use count moves at activation; a refused code
         prints the server's sentence and prices nothing; the console
         lists, adds and deactivates a code
     (n) refunds (schema section 27): the customer's "Request a
         refund" is absent while the admin's switch is off and appears
         when it is on; a request is filed, not refunded; the console
         lists it and APPROVE opens the REFUND dialog, which calls the
         rzp-refund function (admin-checked) and the fake Razorpay
         refund endpoint; a partial refund from the ledger needs a
         reason, stays pending until the webhook, and the webhook is
         idempotent; DECLINE needs a note the customer then reads; a
         non-admin calling rzp-refund is refused
     (o) THE TRIAL AND THE WALL (schema section 30): while a trial runs
         the rail's .sh-rail-trial block carries the clock and the hub shows the
         sample alone with no NEW PROJECT; when it has run out the
         paywall covers index.html but NOT purchase.html, which
         is where a plan is bought; DOWNLOAD MY WORK produces a real
         file from behind the wall, because nothing a person wrote is
         held hostage to a sale; and an administrator is never walled
     (p) PURCHASES REQUIRED (schema section 32): switched OFF, an expired
         free member is not walled, the rail's Purchase entry and every
         buy link are hidden and purchase.html says there is nothing to
         buy; switched ON while a page is open, a focus walls it with no
         reload; and with the key ABSENT (§32 not run) nothing changes
     (q) THE END OF A TRIAL, AND THE WAY OUT (schema section 33): a trial
         that runs out while a page is open walls it with no navigation,
         and a fresh load after expiry is one navigation and a wall that
         stays (counted over ten seconds); the wall offers SIGN OUT, which
         signs out, lands on start.html and stays out, and signing back in
         works; invite.html no longer tells a lapsed member "You're in";
         purchase.html says the trial ended and offers SIGN OUT; a
         membership with no trial is offered one on the wall; two tabs:
         a plan bought in one takes the other's wall down with no focus
     (r) HOURS AND NO FREE PLAN (owner, 11 Oct 2026): the console sets the
         trial in hours and stores minutes (round trip), the band and
         invite.html say hours; no Free card on purchase.html or
         invite.html, no Free tier or column on start.html, and the
         console's grant lists offer paid plans only

   Run:  npm run build && node scripts/prove-billing.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, signFor, RZP, webhookRefundProcessed, setTrial, expireTrial, clearTrial } from './fake-supabase.mjs';
import { loadMatrixModule } from './make-plan-features-sql.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-billing');
/* READ, never typed — billing.js builds the checkout logo url from
   this same field, so a domain move must not need two edits. */
const BRAND_HOST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8')).host;

/* ---- build, with a public Razorpay key id, into our own directory.
   The committed .env carries no key id until the owner has one, and a
   build without one renders every BUY disabled — correctly — so this
   proof cannot run against dist/. The gate stays ON: this is the
   production configuration plus one variable. */
console.log('building dist-billing/ …');
const build = spawnSync(process.execPath, [
  path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'
], { cwd: ROOT, env: Object.assign({}, process.env, { VITE_RAZORPAY_KEY_ID: RZP.keyId, VITE_DISABLE_SW: '1' }), encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout || '', build.stderr || ''); process.exit(1); }
{
  const stamp = (fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp !== 'invite') { console.error('✗ this proof needs the gate ON; do not set VITE_SITE_GATE=off'); process.exit(2); }
}
const PORT = Number(process.env.PROVE_PORT) || 5358;
const BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0, skipped = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
/* A check whose subject is missing reports itself skipped rather than
   quietly not running — the hue-coding assertion in verify is the
   precedent, and the missing subject has always failed an ok() of its
   own first, so the run is already red. */
const skip = (m) => { skipped++; console.log('  – skipped: ' + m); };

/* Razorpay Checkout, stubbed: `open()` asks the fake for a genuine
   signature over this order and a fresh payment id, then calls the
   page's handler exactly as Checkout would. `RZP.mode` steers it:
   'pay' | 'dismiss' | 'tamper'. */
const CHECKOUT_STUB = `
window.Razorpay = function (opts) {
  this.opts = opts; this.handlers = {};
};
window.Razorpay.prototype.on = function (ev, fn) { this.handlers[ev] = fn; };
window.Razorpay.prototype.open = function () {
  const o = this.opts;
  fetch('https://checkout.razorpay.com/__sign?order=' + encodeURIComponent(o.order_id)).then((r) => r.json()).then((s) => {
    window.__rzpOpened = (window.__rzpOpened || 0) + 1;
    window.__rzpLast = { amount: o.amount, currency: o.currency, order_id: o.order_id, key: o.key };
    if (s.mode === 'dismiss') { o.modal && o.modal.ondismiss && o.modal.ondismiss(); return; }
    const sig = s.mode === 'tamper' ? s.signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) : s.signature;
    o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: s.payment_id, razorpay_signature: sig });
  });
};`;

/* THE TRIAL TIMER (12 Oct 2026): the top strip .sh-trial is gone. The clock is
   .sh-rail-trial at the foot of the rail (built hidden by shell.js, shown by
   trial-band.js only while a trial runs) and ticks in SECONDS: m:ss under an
   hour, h:mm:ss under a day. "Up" means present AND not hidden. */
const trialUp = (page) => page.evaluate(() => {
  const b = document.querySelector('#studioRail .sh-rail-trial');
  return !!b && !b.hidden && !!b.querySelector('[role="timer"]');
}).catch(() => false);
const trialClock = (page) => page.textContent('.sh-rail-trial-time', { timeout: 500 }).then((t) => t.trim(), () => '');
const waitTrial = (page, up = true, timeout = 10000) => page.waitForFunction((u) => {
  const b = document.querySelector('#studioRail .sh-rail-trial');
  return (!!b && !b.hidden && !!b.querySelector('[role="timer"]')) === u;
}, up, { timeout });

async function newContext(browser, { tok = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  /* THE CHECKOUT LOGO. billing.js passes Razorpay an absolute
     `image` on the brand host, because checkout is their iframe on
     their origin and a relative path would resolve to nothing. This
     proof fakes every other external origin — Supabase, the fonts,
     checkout.js — and the moment the logo was added and this route
     was not, the (f) project-cap assertion began failing
     deterministically: an unrouted request to the real brand host
     goes out over the real network, and the 10s wait for the sync
     status no longer fits around it. The failure surfaced three
     sections away from its cause, which is what cost the time.
     Fulfil it like the fonts: the bytes do not matter, only that
     nothing leaves the machine. */
  await ctx.route(new RegExp('https://' + BRAND_HOST.replace(/\./g, '\\.') + '/.*'), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: CHECKOUT_STUB }));
  await ctx.route(/https:\/\/checkout\.razorpay\.com\/__sign/, async (r) => {
    const order = new URL(r.request().url()).searchParams.get('order');
    const payment_id = 'pay_' + Math.random().toString(36).slice(2, 10);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payment_id, signature: await signFor(order, payment_id), mode: RZP.mode }) });
  });
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
const gateState = (page) => page.evaluate(() => window.StudioCloud && window.StudioCloud.getGateState().state);
const waitGate = (page, want) => page.waitForFunction((w) => window.StudioCloud && window.StudioCloud.getGateState().state === w, want, { timeout: 10000 }).then(() => true, () => false);
const prices = (page) => page.$$eval('.pl-card', (cards) => cards.map((c) => [c.dataset.plan, c.querySelector('.pl-price strong').textContent]));

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  console.log('(a) the tiers, from the table');
  F.reset(); RZP.mode = 'pay';
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'purchase.html');   // the Plan TAB; the section is hidden under any other
    ok(await waitGate(page, 'open'), 'Amy (a member) is through the gate');
    await page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    const p = await prices(page);
    /* NO FREE CARD (owner, 11 Oct 2026): a free TRIAL, not a free plan.
       The table's 'free' row is the no-plan state and is never drawn. */
    ok(p.length === 3 && p.map((x) => x[0]).join() === 'starter,indie,pro', 'three cards, the paid tiers in order, and no Free card: ' + p.map((x) => x[0]).join(', '));
    ok(p.find((x) => x[0] === 'indie')[1] === '₹7,999', 'the card shows the table’s ONE price (₹7,999)');
    ok((await page.textContent('#plan')).includes('yours for good'), 'and says it is bought once, for good');
    ok(!(await page.$('[data-plan-action="period"]')), 'there is no period switch — section 18 withdrew the subscription model');
    ok(!(await page.$('#plan .is-current')) && !/Baseline/.test(await page.textContent('#plan')), 'with nothing bought, no card is "Your plan" and none is a "Baseline"');
    ok(!(await page.textContent('#plan')).includes('Your usage'), 'and no usage against a free tier\'s caps (there is no free tier)');

    console.log('(b) buy');
    await page.evaluate(() => { window.__w = 0; window.__wk = []; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (...a) { window.__w++; window.__wk.push(String(a[0])); return o.apply(this, a); }; });
    await page.click('.pl-card[data-plan="indie"] [data-plan-action="buy"]');
    await page.waitForFunction(() => document.querySelector('#plan .is-current') && document.querySelector('#plan .is-current').dataset.plan === 'indie', null, { timeout: 15000 }).then(() => ok(true, 'the Indie card becomes the current plan'), () => ok(false, 'the Indie card becomes the current plan'));
    const order = F.db.calls.find((c) => c.startsWith('fn:rzp-order'));
    ok(order === 'fn:rzp-order indie lifetime', 'rzp-order was asked for indie, for good');
    const last = await page.evaluate(() => window.__rzpLast);
    ok(last && last.amount === 799900 && last.currency === 'INR' && last.key === 'rzp_test_fake', 'Checkout opened with the table’s amount in paise and the public key id');
    ok(F.db.calls.includes('fn:rzp-verify ok'), 'rzp-verify accepted a genuine signature');
    const pay = F.db.payments.find((x) => x.plan_id === 'indie');
    ok(pay && pay.status === 'paid' && pay.razorpay_payment_id, 'the ledger reads paid with the payment id');
    const acc = F.db.accounts.find((a) => a.owner_id === USERS['tok-amy'].id);
    ok(acc && acc.plan === 'indie' && acc.plan_until === null, 'Amy owns an organisation on Indie with no end date');
    { const t = await page.textContent('#plan'); ok(!/Until|Lapsed|RENEW|EXTEND/.test(t) && /Nothing to renew/.test(t), 'the card says there is nothing to renew, and prints no expiry'); }
    ok(!(await page.$('.pl-card[data-plan="starter"] [data-plan-action="buy"]')), 'a lower tier offers no button once Indie is held');
    ok((await page.textContent('#plan .bd-h2')).includes('Intermediate'), 'the section title names the plan and the organisation');
    /* (h) Nothing about the purchase lands in localStorage. The plan is
       a fact about the account, read from the server every time. Other
       modules may write during the re-render (the rail's open state, the
       site gate's pass), so the assertion is about WHAT was written, not
       whether anything was. */
    { const leak = await page.evaluate(([oid, pid]) => {
        const keys = [], hits = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); keys.push(k); const v = localStorage.getItem(k) || ''; if ((oid && v.includes(oid)) || (pid && v.includes(pid)) || /razorpay/i.test(v)) hits.push(k); }
        return { keys: keys.filter((k) => /plan|bill|razorpay|payment|order/i.test(k)), hits, wrote: [...new Set(window.__wk)] };
      }, [last && last.order_id, pay && pay.razorpay_payment_id]);
      ok(leak.keys.length === 0 && leak.hits.length === 0, '(h) buying left no plan, order or payment in localStorage' + (leak.keys.length || leak.hits.length ? ' (keys: ' + leak.keys.join(', ') + '; values in: ' + leak.hits.join(', ') + ')' : ' (writes during the purchase: ' + (leak.wrote.join(', ') || 'none') + ')'));
    }

    console.log('(d) tamper, (e) dismiss');
    RZP.mode = 'tamper';
    await page.click('.pl-card[data-plan="pro"] [data-plan-action="buy"]');
    await page.waitForFunction(() => { const n = document.querySelector('.pl-status'); return n && !/…$/.test(n.textContent.trim()); }, null, { timeout: 10000 }).catch(() => {});
    { const t = await page.textContent('.pl-status'); ok(/could not be verified/i.test(t), 'a tampered signature is refused with a sentence' + (/could not be verified/i.test(t) ? '' : ' (said: ' + t.trim() + ')')); }
    ok(!F.db.payments.some((x) => x.plan_id === 'pro' && x.status === 'paid'), 'and nothing activated');
    ok(F.db.accounts.find((a) => a.owner_id === USERS['tok-amy'].id).plan === 'indie', 'Amy is still on Indie');
    RZP.mode = 'dismiss';
    await page.click('.pl-card[data-plan="pro"] [data-plan-action="buy"]');
    await page.waitForFunction(() => /cancelled/i.test((document.querySelector('.pl-status') || {}).textContent || ''), null, { timeout: 10000 }).then(() => ok(true, 'closing Checkout says the payment was cancelled'), () => ok(false, 'closing Checkout says the payment was cancelled'));
    ok(F.db.payments.filter((x) => x.plan_id === 'pro').every((x) => x.status === 'created'), 'a dismissed order stays created, never paid');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(c) paying grants entry');
  F.reset(); RZP.mode = 'pay';
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-ben' });   // Ben is NOT a member
    await page.goto(BASE + 'purchase.html');
    ok(await waitGate(page, 'closed'), 'Ben (a stranger) is outside the gate');
    await page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    ok(true, 'purchase.html offers the tiers to a signed-in stranger who is outside the gate');
    await page.click('.pl-card[data-plan="starter"] [data-plan-action="buy"]');
    ok(await waitGate(page, 'open'), 'after paying, the gate is OPEN with no code and no admin');
    ok(F.db.members.has(USERS['tok-ben'].id), 'Ben is a member');
    ok(F.db.accounts.some((a) => a.owner_id === USERS['tok-ben'].id && a.plan === 'starter'), 'with an organisation on Starter');
    /* Paying keeps the buyer on the purchase page, whose success card says what unlocked. */
    await page.waitForSelector('.pl-success', { timeout: 8000 }).then(() => ok(true, 'the purchase page says what unlocked (Payment received)'), () => ok(false, 'the purchase page says what unlocked (Payment received)'));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(f) the project cap');
  F.reset();
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  F.db.projects.push({ id: 'existing', title: 'Already in the cloud', format: 'feature', owner_id: USERS['tok-amy'].id });
  /* This section proves the SERVER's cap (the P0402 trigger), so the free
     tier here may make projects; the feature lock that hides New project
     on the default free tier is section (i)'s to prove. */
  { const fp = F.db.plans.find((p) => p.id === 'free'); fp.features = { ...(fp.features || {}), new_projects: true, sample_only: false }; }
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'index.html');
    await waitGate(page, 'open');
    // Drive the creation through the hub's own control: the setup sheet
    // (src/ui/project-setup.js, #psTitle / #psSubmit) replaced the old
    // #projectModal on 10 Oct 2026; it creates the project and opens
    // the dashboard, where the push meets the cap.
    await page.locator('[data-action="new-project"]:visible').first().click();
    await page.waitForSelector('#projectSetupForm #psTitle', { timeout: 5000 });
    await page.fill('#psTitle', 'Second film');
    await Promise.all([page.waitForURL(/dashboard/, { timeout: 10000 }).catch(() => {}), page.click('#psSubmit')]);
    await page.waitForFunction(() => /plan limit/i.test((window.StudioCloud.getSyncStatus() || {}).detail || ''), null, { timeout: 10000 })
      .then(() => ok(true, 'the sync status says the plan limit was reached'), () => ok(false, 'the sync status says the plan limit was reached (status: ' + 'see log)'));
    ok(F.db.calls.filter((c) => c === 'write:projects:P0402').length >= 1, 'the cloud refused the insert with P0402');
    const toast = await page.evaluate(() => [...document.querySelectorAll('.toast-host')].map((n) => n.textContent).join(' '));
    ok(/Free plan syncs up to 1 project/.test(toast) && /See plans/i.test(toast), 'a toast names the cap and offers the plans');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]').some((p) => /Second film/.test(p.title))), 'the second project is still on this device');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(g) the console');
  F.reset();
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'admin.html#tiers');   // inside the console's Purchases tab
    await page.waitForSelector('#tiers .ba-plan', { timeout: 15000 });
    ok((await page.$$eval('#tiers .ba-plan', (e) => e.length)) === 4, 'the console lists the four tiers for editing');
    ok(!(await page.$('#ba_indie_monthly')) && !(await page.$('#ba_indie_yearly')), 'the console has one price field per tier, no monthly/yearly');
    await page.fill('#ba_indie_price', '599');
    await page.fill('#ba_indie_projects', '12');
    await page.click('form[data-plan="indie"] button[type="submit"]');
    await page.waitForSelector('.ba-saved', { timeout: 8000 });
    const indie = F.db.plans.find((p) => p.id === 'indie');
    ok(indie.price_paise === 59900 && indie.limits.projects === 12, 'admin_set_plan received ₹599 as price_paise 59900 and projects 12');
    ok(indie.limits.seats === 3, 'untouched limits survived the save');
    // "Saved." clears itself with a re-render 2.5s on; fill the grant form after that, not under it.
    await page.waitForSelector('.ba-saved', { state: 'detached', timeout: 8000 });
    await page.selectOption('#baGrantWho', USERS['tok-amy'].id);
    await page.selectOption('#baGrantPlan', 'pro');
    ok(!(await page.$('#baGrantDays')), 'the grant form asks for no days');
    await page.fill('#baGrantNote', 'festival comp');
    await page.click('form[data-ba-form="grant"] button[type="submit"]');
    await page.waitForFunction(() => /Granted — full access, for good/.test(document.body.innerText), null, { timeout: 8000 }).then(() => ok(true, 'the grant is confirmed as full access, for good'), () => ok(false, 'the grant is confirmed as full access, for good'));
    const g = F.db.payments.find((x) => x.status === 'granted');
    ok(g && g.plan_id === 'pro' && g.amount_paise === 0 && g.note === 'festival comp', 'the ledger carries a ₹0 granted row with the note');
    ok(F.db.accounts.some((a) => a.owner_id === USERS['tok-amy'].id && a.plan === 'pro' && a.plan_until === null), 'Amy’s organisation is on Pro, for good');
    await page.waitForFunction(() => /for good/.test((document.querySelector('#billing .ba-ledger') || {}).textContent || ''), null, { timeout: 8000 }).then(() => ok(true, 'the ledger’s Access column reads "for good"'), () => ok(false, 'the ledger’s Access column reads "for good"'));
    await page.waitForFunction(() => /festival comp/.test((document.querySelector('#billing .ba-ledger') || {}).textContent || ''), null, { timeout: 8000 }).then(() => ok(true, 'the payments table shows it'), () => ok(false, 'the payments table shows it'));
    await page.setViewportSize({ width: 390, height: 844 });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the billing console does not overflow at 390px');
    allErrors.push(...errors); await ctx.close();

    const amy = await newContext(browser, { tok: 'tok-amy' });
    // purchases.html is a stub now: it forwards to the console's Purchases tab, fragment kept.
    await amy.page.goto(BASE + 'purchases.html#promos');
    await amy.page.waitForURL(/admin(\.html)?\?tab=purchases#promos$/, { timeout: 10000 }).then(() => ok(true, 'purchases.html#promos forwards to admin.html#promos'), () => ok(false, 'purchases.html#promos forwards to admin.html#promos: ' + amy.page.url()));
    // and the console is for administrators: a member who is not one gets the denied state and no tabs.
    await amy.page.waitForSelector('#denied', { timeout: 15000 }).then(() => ok(true, 'a non-admin sees the denied state on the console'), () => ok(false, 'a non-admin sees the denied state on the console'));
    ok(!(await amy.page.$('#billing')) && !(await amy.page.$('#promos')), 'and none of the money sections are on the page');
    await amy.page.goto(BASE + 'purchase.html');
    await amy.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    ok((await prices(amy.page)).find((x) => x[0] === 'indie')[1] === '₹599', 'the cards show the edited price');
    ok((await amy.page.getAttribute('#plan .is-current', 'data-plan')) === 'pro', 'and Amy sees Pro as her plan after the grant');
    allErrors.push(...amy.errors); await amy.ctx.close();
  }
  console.log('(i) features by plan: the matrix, the free tier, a locked module');
  F.reset();
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });   // Amy: a member on Free
  /* The console section above GRANTED Amy Pro; this section is about the
     free tier, so her organisations go back to Free first — otherwise
     every check below measures Pro and fails for the wrong reason. */
  for (const a of F.db.accounts) if (a.owner_id === USERS['tok-amy'].id) { a.plan = 'free'; a.plan_until = null; }
  /* SECTION 30 MADE THE SCENARIO EXPLICIT, and the setup had to change
     with it — this is not a relaxed assertion, it is the same
     assertion pointed at the user it was always about.
     "A member on Free" is now two different people: one mid-trial at
     'sample' scope, who sees the free plan's own feature map, and a
     grandfathered member from before section 30, whose trial is a year
     at 'full' scope and who therefore borrows ANOTHER plan's features
     (30.6). A row created the old way defaults to the second, so every
     feature check below was reading Indie's empty map and finding
     everything allowed. This block is about the free tier's map, so
     Amy is the first of the two, said out loud. */
  setTrial(USERS['tok-amy'].id, { minutes: 60, source: 'signup', scope: 'sample' });
  {
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#features');
    await A.page.waitForSelector('#features .pf-table', { timeout: 15000 });
    ok((await A.page.$$eval('#features thead th', (e) => e.length)) === 5, 'the matrix has a column per plan');
    ok(await A.page.isChecked('input[name="free:sample_only"]') && !(await A.page.isChecked('input[name="free:new_projects"]')) && await A.page.isChecked('input[name="pro:new_projects"]'), 'the free tier reads sample only, no new projects; pro reads everything');
    ok(await A.page.isChecked('input[name="free:story-beats"]'), 'a module nobody has touched is ticked (missing = allowed)');
    ok(/shares a page with .*Elements/.test(await A.page.textContent('tr[data-feature="breakdowns"]')), 'a module that shares a page says so, and with whom');
    // story.html hosts story-beats (a real plan row) and pitch-deck (off for every plan, so never a plan row);
    // a page locks when every module that CAN be on a plan is unticked.
    // pitch-deck is off on every plan in the real §36 rows (a tick here would be the
    // console switching it back on), so the fixture unticks it too, as the live matrix reads.
    for (const id of ['story-beats', 'pitch-deck']) await A.page.uncheck(`input[name="free:${id}"]`);
    await A.page.click('#features button[type="submit"]');
    await A.page.waitForSelector('#features .ba-saved', { timeout: 8000 });
    const free = F.db.plans.find((p) => p.id === 'free');
    ok(free.features['story-beats'] === false && free.features.sample_only === true && free.features['scene-list'] === true, 'admin_set_plan received the whole map: story-beats unticked false, sample_only kept, the rest true');
    ok(!(await A.page.$('.pg-lock')), 'the console itself is never locked (it is not a module page)');
    allErrors.push(...A.errors); await A.ctx.close();

    const amy = await newContext(browser, { tok: 'tok-amy' });
    await amy.page.goto(BASE + 'index.html');
    /* Filed in AMY'S namespace (`ns` carries her uid): a signed-in hub
       lists the account's projects, and a device-namespace film would
       simply not be hers to see — the storage model, not the plan. */
    await amy.page.evaluate((uid) => {
      const list = JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]');
      const now = new Date().toISOString();
      list.push({ id: 'p-dragon', title: 'Dragon', format: 'feature', createdAt: now, updatedAt: now, ns: ['', uid] });
      list.push({ id: 'p-mine', title: 'My own film', format: 'short', createdAt: now, updatedAt: now, ns: ['', uid] });
      localStorage.setItem('fms_studio_projects_v1', JSON.stringify(list));
    }, USERS['tok-amy'].id);
    await amy.page.reload();
    await amy.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getGateState().state === 'open', null, { timeout: 10000 });
    await amy.page.waitForFunction(() => document.querySelectorAll('#projectsGrid .project-card:not(.new-card)').length === 1, null, { timeout: 10000 })
      .then(() => ok(true, 'on Free the hub shows ONE project'), () => ok(false, 'on Free the hub shows ONE project'));
    const titles = await amy.page.$$eval('#projectsGrid .project-card:not(.new-card)', (cards) => cards.map((c) => c.textContent));
    ok(titles.length === 1 && /Dragon/.test(titles[0]) && !/My own film/.test(titles.join()), 'and it is the Dragon sample — her own film is hidden, not deleted');
    ok(await amy.page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_projects_v1')).some((p) => p.title === 'My own film')), 'the hidden film is still on the device');
    ok(await amy.page.evaluate(() => [...document.querySelectorAll('[data-action="new-project"]')].every((el) => el.hidden || el.closest('[hidden]') || getComputedStyle(el).display === 'none')), 'no NEW PROJECT control is offered');
    ok(!(await amy.page.$('#projectsGrid .new-card')), 'and no new-project card in the grid');
    await amy.page.goto(BASE + 'story.html');
    await amy.page.waitForSelector('.pg-lock', { timeout: 10000 }).then(() => ok(true, 'story.html (its one plan row unticked for Free) shows the plan lock'), () => ok(false, 'story.html (its one plan row unticked for Free) shows the plan lock'));
    ok(/Not part of the free trial/.test(await amy.page.textContent('.pg-lock')), 'saying it is not part of the free trial (no "Free plan" is named)');
    ok((await amy.page.evaluate(() => getComputedStyle(document.querySelector('main')).visibility)) === 'hidden', 'with the page veiled underneath, not removed');
    await amy.page.goto(BASE + 'breakdown.html');
    await amy.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getGateState().state === 'open', null, { timeout: 10000 });
    await amy.page.waitForTimeout(800);
    ok(!(await amy.page.$('.pg-lock')), 'a module still ticked (scene list) opens normally');
    /* (The PLAN flag on Story · Beats used to be asserted in the stage dropdown. That
       dropdown is gone — a stage tab is a plain link since 11 Oct 2026 — and the hub no
       longer draws module tiles, so the mark has no surface in this flow to read.) */
    /* The cards count what the matrix left ticked: every built module
       plus five capabilities (sample_only is said in words, not counted). */
    /* Every module on the map: the five stages' and the Library's own
       (case studies, dissection, glossary hang off the Library since
       6 Oct 2026 — src/lib/navmodel.js joins the two lists the same way). */
    const NAV = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));
    const built = [...NAV.phases, ...NAV.global].flatMap((p) => p.modules || []).filter((m) => m.status !== 'planned').length;
    // Every capability row counts except sample_only, which narrows
    // rather than grants. Read from plan-gate.js rather than typed here,
    // or each new capability (remove_branding was the sixth) fails this.
    const capSrc = fs.readFileSync(path.join(ROOT, 'src/lib/plan-gate.js'), 'utf8');
    const caps = [...(capSrc.match(/export const CAPABILITIES = \[([\s\S]*?)\n\];/) || ['', ''])[1].matchAll(/\['([a-z_]+)'/g)].map((m) => m[1]);
    const total = built + caps.filter((k) => k !== 'sample_only').length;
    await amy.page.goto(BASE + 'purchase.html');
    await amy.page.waitForSelector('#plan .pl-card .pl-features-n', { timeout: 10000 });
    const counts = await amy.page.$$eval('#plan .pl-card', (cards) => Object.fromEntries(cards.map((c) => [c.dataset.plan, (c.querySelector('.pl-features-n') || {}).textContent])));
    ok(!('free' in counts), 'a trial user on purchase.html is offered no Free card — only plans to buy');
    ok(counts.pro === `${total} of ${total} features`, `the Pro card counts everything: ${counts.pro}`);
    ok(/free trial has .* left/i.test(await amy.page.textContent('#plan')), 'and the page says how long her free trial has left');
    allErrors.push(...amy.errors); await amy.ctx.close();
  }

  console.log('(j) promo codes');
  F.reset(); RZP.mode = 'pay';
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'purchase.html');
    await page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    ok(!!(await page.$('#plan .pl-promo summary')), 'the row offers "Have a code?" under the cards');
    ok((await prices(page)).find((x) => x[0] === 'indie')[1] === '₹7,999', 'before a code the Indie card shows the list price');
    // a refused code first: nothing reprices, the server's sentence shows
    await page.click('#plan .pl-promo summary');
    await page.fill('#plPromoCode', 'nope-2026');
    await page.click('#plan .pl-promo-form button[type="submit"]');
    await page.waitForSelector('#plan .pl-promo-msg.is-error', { timeout: 8000 }).then(() => ok(true, 'an unknown code prints a refusal'), () => ok(false, 'an unknown code prints a refusal'));
    { const t = await page.textContent('#plan .pl-promo-msg'); ok(/not one we know/.test(t), 'with the server’s sentence: ' + t.trim()); }
    ok((await prices(page)).find((x) => x[0] === 'indie')[1] === '₹7,999' && !(await page.$('#plan .pl-card.has-promo')), 'and no card is repriced');
    ok(F.db.calls.filter((c) => c === 'quote_order').length === 3, 'quote_order was asked once per buyable plan (three)');
    // then the live one
    await page.fill('#plPromoCode', 'launch 10');
    await page.click('#plan .pl-promo-form button[type="submit"]');
    await page.waitForSelector('#plan .pl-card[data-plan="indie"].has-promo', { timeout: 8000 }).then(() => ok(true, 'LAUNCH10 reprices the Indie card'), () => ok(false, 'LAUNCH10 reprices the Indie card'));
    const p2 = await prices(page);
    ok(p2.find((x) => x[0] === 'indie')[1] === '₹7,199.10' && p2.find((x) => x[0] === 'pro')[1] === '₹17,999.10', 'the cards show the discounted prices from quote_order (₹7,199.10 and ₹17,999.10 — 10% of a paise-exact price keeps its paise)');
    ok((await page.textContent('#plan .pl-card[data-plan="indie"] .pl-list')) === '₹7,999', 'with the list price struck beside it');
    ok(/₹799\.90 off with LAUNCH10/.test(await page.textContent('#plan .pl-card[data-plan="indie"]')), 'and the saving named');
    ok(/LAUNCH10 applied to Basic, Intermediate, Pro/.test(await page.textContent('#plan .pl-promo-msg')), 'the box says which plans it applied to');
    // buy with it
    await page.click('.pl-card[data-plan="indie"] [data-plan-action="buy"]');
    await page.waitForFunction(() => document.querySelector('#plan .is-current') && document.querySelector('#plan .is-current').dataset.plan === 'indie', null, { timeout: 15000 })
      .then(() => ok(true, 'the purchase goes through'), () => ok(false, 'the purchase goes through'));
    ok(F.db.calls.includes('fn:rzp-order code LAUNCH10 ok'), 'rzp-order received the code and re-quoted it');
    const last = await page.evaluate(() => window.__rzpLast);
    ok(last && last.amount === 719910, 'Checkout opened with the DISCOUNTED amount (719910 paise), not the list');
    const pay = F.db.payments.find((x) => x.plan_id === 'indie' && x.status === 'paid');
    ok(pay && pay.promo_code === 'LAUNCH10' && pay.discount_paise === 79990 && pay.list_paise === 799900 && pay.amount_paise === 719910, 'the ledger row carries the code, the list price and the discount');
    ok(F.db.promos.find((c) => c.code === 'LAUNCH10').uses === 1, 'the code’s use count moved at activation');
    ok(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /promo|code/i.test(k) && !/invite_code/.test(k)) || Object.values(localStorage).some((v) => /LAUNCH10/.test(String(v))))), 'the code is in no localStorage key or value');
    allErrors.push(...errors); await ctx.close();

    // the console: list, add, deactivate — and the card obeys
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#promos');
    await A.page.waitForSelector('#promos tr[data-promo="LAUNCH10"]', { timeout: 15000 }).then(() => ok(true, 'the console lists LAUNCH10'), () => ok(false, 'the console lists LAUNCH10'));
    ok(/10% off/.test(await A.page.textContent('#promos tr[data-promo="LAUNCH10"]')) && /\b1\b/.test(await A.page.textContent('#promos tr[data-promo="LAUNCH10"] td:nth-child(4)')), 'with its discount and one use');
    ok(/LAUNCH10 \(₹799\.90 off\)/.test(await A.page.textContent('#billing .ba-ledger')), 'the payments ledger shows the code on the discounted row');
    await A.page.fill('#baPromoCode', 'fest 500');
    await A.page.selectOption('#baPromoKind', 'amount');
    await A.page.fill('#baPromoValue', '500');
    await A.page.fill('#baPromoMax', '1');
    await A.page.uncheck('#promos input[name="plan"][value="starter"]');
    await A.page.fill('#baPromoNote', 'festival desk');
    await A.page.click('form[data-ba-form="promo"] button[type="submit"]');
    await A.page.waitForSelector('#promos tr[data-promo="FEST500"]', { timeout: 8000 }).then(() => ok(true, 'ADD CODE lands FEST500 in the list'), () => ok(false, 'ADD CODE lands FEST500 in the list'));
    const fest = F.db.promos.find((c) => c.code === 'FEST500');
    ok(fest && fest.amount_off_paise === 50000 && fest.max_uses === 1 && fest.plan_ids && fest.plan_ids.join() === 'indie,pro' && fest.note === 'festival desk', 'admin_set_promo_code received ₹500 as 50000 paise, one use, Indie and Pro only, with the note');
    await A.page.click('#promos tr[data-promo="LAUNCH10"] [data-ba-action="promo-toggle"]');
    await A.page.waitForFunction(() => /inactive/.test((document.querySelector('#promos tr[data-promo="LAUNCH10"]') || {}).textContent || ''), null, { timeout: 8000 })
      .then(() => ok(true, 'DEACTIVATE marks LAUNCH10 inactive'), () => ok(false, 'DEACTIVATE marks LAUNCH10 inactive'));
    ok(F.db.promos.find((c) => c.code === 'LAUNCH10').active === false, 'and the fake’s row is inactive');
    await A.page.setViewportSize({ width: 390, height: 844 });
    ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the promo console does not overflow at 390px');
    allErrors.push(...A.errors); await A.ctx.close();

    // a stranger on invite.html: the deactivated code is refused, the new one prices Pro and not Starter
    const B = await newContext(browser, { tok: 'tok-ben' });
    await B.page.goto(BASE + 'purchase.html');
    await B.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    await B.page.click('#plan .pl-promo summary');
    await B.page.fill('#plPromoCode', 'LAUNCH10');
    await B.page.click('#plan .pl-promo-form button[type="submit"]');
    await B.page.waitForSelector('#plan .pl-promo-msg.is-error', { timeout: 8000 });
    ok(/not active/.test(await B.page.textContent('#plan .pl-promo-msg')), 'invite.html: the deactivated code is refused as inactive');
    await B.page.fill('#plPromoCode', 'FEST500');
    await B.page.click('#plan .pl-promo-form button[type="submit"]');
    await B.page.waitForSelector('#plan .pl-card[data-plan="pro"].has-promo', { timeout: 8000 });
    ok(!(await B.page.$('#plan .pl-card[data-plan="starter"].has-promo')) && /FEST500 applied to Intermediate, Pro/.test(await B.page.textContent('#plan .pl-promo-msg')), 'FEST500 prices Indie and Pro and leaves Starter alone');
    ok((await prices(B.page)).find((x) => x[0] === 'pro')[1] === '₹19,499', 'Pro reads ₹19,499 (₹500 off)');
    allErrors.push(...B.errors); await B.ctx.close();
  }

  console.log('(k) upgrade by paying the difference (schema section 21)');
  F.reset(); RZP.mode = 'pay';
  {
    const amy = USERS['tok-amy'].id;
    F.db.members.set(amy, { role: 'user', disabled_at: null });
    const at = new Date(Date.now() - 3 * 86400e3).toISOString();
    F.db.accounts.push({ id: 'acc_amy', name: 'Amy’s Studio', owner_id: amy, plan: 'starter', plan_until: null, plan_period: 'lifetime', seat_limit: 1, created_at: at });
    F.db.payments.push({ id: 'payS', user_id: amy, account_id: 'acc_amy', plan_id: 'starter', period: 'lifetime', amount_paise: 299900, list_paise: 299900, discount_paise: 0, credit_paise: 0,
      currency: 'INR', razorpay_order_id: 'order_s', razorpay_payment_id: 'pay_s', status: 'paid', created_at: at, paid_at: at });
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'purchase.html');
    await page.waitForSelector('#plan .pl-card[data-plan="indie"] .pl-upgrade', { timeout: 10000 })
      .then(() => ok(true, 'a Starter holder sees an upgrade line on the Indie card'), () => ok(false, 'a Starter holder sees an upgrade line on the Indie card'));
    ok((await page.textContent('#plan .pl-card[data-plan="indie"] .pl-upgrade')) === 'Upgrade to Intermediate — ₹5,000 (you paid ₹2,999 for Basic)', 'it reads "Upgrade to Intermediate — ₹5,000 (you paid ₹2,999 for Basic)"');
    const p = await prices(page);
    ok(p.find((x) => x[0] === 'indie')[1] === '₹5,000' && p.find((x) => x[0] === 'pro')[1] === '₹17,000', 'the cards price the DIFFERENCE from quote_order (Indie ₹5,000, Pro ₹17,000)');
    ok((await page.textContent('#plan .pl-card[data-plan="indie"] .pl-list')) === '₹7,999', 'with the list price struck beside it');
    ok(!(await page.$('#plan .pl-card[data-plan="starter"] [data-plan-action="buy"]')), 'the plan already held offers no button');
    await page.click('.pl-card[data-plan="indie"] [data-plan-action="buy"]');
    await page.waitForFunction(() => document.querySelector('#plan .is-current') && document.querySelector('#plan .is-current').dataset.plan === 'indie', null, { timeout: 15000 })
      .then(() => ok(true, 'the upgrade goes through and Indie is the current plan'), () => ok(false, 'the upgrade goes through and Indie is the current plan'));
    const last = await page.evaluate(() => window.__rzpLast);
    ok(last && last.amount === 500000, 'Checkout opened at the difference (500000 paise), not the list');
    const row = F.db.payments.find((x) => x.plan_id === 'indie' && x.status === 'paid');
    ok(row && row.credit_paise === 299900 && row.list_paise === 799900 && row.amount_paise === 500000, 'the ledger row carries list, credit and the amount paid');
    await page.waitForFunction(() => /you paid ₹7,999 for Intermediate/.test((document.querySelector('#plan .pl-card[data-plan="pro"] .pl-upgrade') || {}).textContent || ''), null, { timeout: 10000 })
      .then(() => ok(true, 'the Pro card re-quotes: everything paid so far (₹7,999) is credited'), () => ok(false, 'the Pro card re-quotes: everything paid so far (₹7,999) is credited'));
    ok((await prices(page)).find((x) => x[0] === 'pro')[1] === '₹12,000', 'Pro now costs ₹12,000 (1999900 − 799900)');
    const refused = await page.evaluate(async ([sb]) => {
      const r = await fetch(sb + '/functions/v1/rzp-order', { method: 'POST', headers: { Authorization: 'Bearer tok-amy', 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'starter', period: 'lifetime' }) });
      return { status: r.status, body: await r.json() };
    }, [SB]);
    ok(refused.status === 400 && /lower plan/.test(refused.body.error || ''), 'an order for a lower plan, sent by hand, is refused by the server: ' + (refused.body.error || refused.status));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(l) referral codes (schema section 22)');
  {
    // continues from (k): Amy has paid, so she has a code. (k)'s context
    // still holds her one-device lock (fresh for 90s), so release it.
    F.db.sessions.clear();
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'purchase.html');
    await page.waitForSelector('#plan [data-gr-panel="referral"] .gr-code', { timeout: 10000 })
      .then(() => ok(true, 'a paying member sees "Your referral code" under the cards'), () => ok(false, 'a paying member sees "Your referral code" under the cards'));
    const code = (await page.textContent('#plan [data-gr-panel="referral"] .gr-code')).trim();
    ok(/^REF-[A-HJ-KM-NP-Z2-9]{6}$/.test(code) && F.db.promos.some((c) => c.code === code && c.kind === 'referral' && c.owner_user_id === USERS['tok-amy'].id), 'the code is a REF- promo row owned by her: ' + code);
    ok(/10% off/.test(await page.textContent('#plan [data-gr-panel="referral"]')), 'and says what it gives a friend');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.click('#plan [data-gr-action="copy"]');
    await page.waitForFunction((c) => [...document.querySelectorAll('.toast-host')].some((n) => n.textContent.includes('Copied ' + c)), code, { timeout: 5000 })
      .then(() => ok(true, 'COPY copies it and says so'), () => ok(false, 'COPY copies it and says so'));
    // her own code in the promo box: refused by the server
    await page.click('#plan .pl-promo summary');
    await page.fill('#plPromoCode', code);
    await page.click('#plan .pl-promo-form button[type="submit"]');
    await page.waitForSelector('#plan .pl-promo-msg.is-error', { timeout: 8000 }).catch(() => {});
    ok(/your own referral code/.test(await page.textContent('#plan .pl-promo-msg')), 'self-referral is refused with the server’s sentence');
    allErrors.push(...errors); await ctx.close();

    // Ben, a stranger, buys Starter with it on purchase.html
    const B = await newContext(browser, { tok: 'tok-ben' });
    await B.page.goto(BASE + 'purchase.html');
    await B.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    await B.page.click('#plan .pl-promo summary');
    await B.page.fill('#plPromoCode', code.toLowerCase());
    await B.page.click('#plan .pl-promo-form button[type="submit"]');
    await B.page.waitForSelector('#plan .pl-card[data-plan="starter"].has-promo', { timeout: 8000 });
    ok((await prices(B.page)).find((x) => x[0] === 'starter')[1] === '₹2,699.10', 'a friend sees Starter at 10% off (₹2,699.10)');
    await B.page.click('#plan .pl-card[data-plan="starter"] [data-plan-action="buy"]');
    ok(await waitGate(B.page, 'open'), 'the friend’s purchase goes through');
    const credit = F.db.credits.find((r) => r.referrer_user_id === USERS['tok-amy'].id);
    ok(credit && credit.status === 'owed' && credit.basis_paise === 269910 && credit.amount_paise === 26991, 'activation credited Amy 10% of what Ben paid (₹269.91), owed');
    allErrors.push(...B.errors); await B.ctx.close();

    // the console lists it and records the payout
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#growth');
    await A.page.waitForSelector('#growth tr[data-credit]', { timeout: 15000 }).then(() => ok(true, 'the Growth tab lists the credit'), () => ok(false, 'the Growth tab lists the credit'));
    ok(/amy@example\.com/.test(await A.page.textContent('#growth tr[data-credit]')) && /ben@example\.com/.test(await A.page.textContent('#growth tr[data-credit]')), 'naming referrer and friend');
    await A.page.check('#growth input[name="credit"]');
    await A.page.fill('#graPayNote', 'UPI 7 Oct');
    await A.page.click('#growth form[data-gra-form="payout"] button[type="submit"]');
    await A.page.waitForFunction(() => /paid/.test((document.querySelector('#growth tr[data-credit]') || {}).textContent || '') && !document.querySelector('#growth input[name="credit"]'), null, { timeout: 8000 })
      .then(() => ok(true, 'MARK SELECTED PAID records the payout'), () => ok(false, 'MARK SELECTED PAID records the payout'));
    ok(F.db.credits[0].status === 'paid' && F.db.credits[0].paid_note === 'UPI 7 Oct', 'the fake’s row is paid with the note');
    await A.page.fill('#graRewardValue', '250');
    await A.page.selectOption('#graRewardKind', 'paise');
    await A.page.click('#growth form[data-gra-form="referral"] button[type="submit"]');
    await A.page.waitForSelector('#growth .ba-saved', { timeout: 8000 }).catch(() => {});
    ok(F.db.settings.referral_reward_paise === 25000 && F.db.settings.referral_reward_pct === null, 'the referral terms save: a fixed ₹250 reward, the percentage cleared');
    await A.page.setViewportSize({ width: 390, height: 844 });
    ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the Growth tab does not overflow at 390px');
    allErrors.push(...A.errors); await A.ctx.close();
  }

  console.log('(m) affiliate codes (schema section 23)');
  F.db.sessions.clear();
  {
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#promos');
    await A.page.waitForSelector('#baPromoComm', { timeout: 15000 });
    /* WAIT FOR THE LOAD TO SETTLE BEFORE TYPING. The section kicks off
       load() while it is being built, and load() calls rerender() twice
       — once on entry, once when the three calls come back. Typing into
       the form in that window is a race nobody runs in real life: a
       person opens the page, watches it fill, and then types. The proof
       was typing during the load and failing roughly one run in three,
       which read as a flake and was not one.

       The promo table is the tell: earlier blocks created codes, so a
       row exists once the data has arrived. (billing-admin.js also
       keeps the form's draft across a rerender now, so a refresh that
       lands mid-typing no longer empties it — that was the other half,
       and the same bug the refund form had.) */
    await A.page.waitForSelector('#promos tr[data-promo]', { timeout: 15000 });
    await A.page.waitForLoadState('networkidle');
    await A.page.fill('#baPromoCode', 'festdesk');
    await A.page.fill('#baPromoValue', '5');
    await A.page.fill('#baPromoComm', '20');
    await A.page.fill('#baPromoNote', 'Chennai festival desk');
    await A.page.click('form[data-ba-form="promo"] button[type="submit"]');
    await A.page.waitForSelector('#promos tr[data-promo="FESTDESK"]', { timeout: 8000 }).catch(() => {});
    const fd = F.db.promos.find((c) => c.code === 'FESTDESK');
    ok(fd && fd.kind === 'affiliate' && fd.commission_pct === 20 && fd.percent_off === 5, 'ADD CODE with a commission makes an affiliate code (5% off, 20% commission)');
    ok(/20% commission/.test(await A.page.textContent('#promos tr[data-promo="FESTDESK"]')), 'the promo list says so');
    allErrors.push(...A.errors); await A.ctx.close();

    const C = await newContext(browser, { tok: 'tok-cal' });
    await C.page.goto(BASE + 'purchase.html');
    await C.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    await C.page.click('#plan .pl-promo summary');
    await C.page.fill('#plPromoCode', 'FESTDESK');
    await C.page.click('#plan .pl-promo-form button[type="submit"]');
    await C.page.waitForSelector('#plan .pl-card[data-plan="indie"].has-promo', { timeout: 8000 });
    await C.page.click('#plan .pl-card[data-plan="indie"] [data-plan-action="buy"]');
    ok(await waitGate(C.page, 'open'), 'Cal buys Indie through the affiliate code');
    allErrors.push(...C.errors); await C.ctx.close();

    F.db.sessions.clear();
    const A2 = await newContext(browser, { tok: 'tok-admin' });
    await A2.page.goto(BASE + 'admin.html#growth');
    await A2.page.waitForSelector('#growth tr[data-affiliate="FESTDESK"]', { timeout: 15000 }).then(() => ok(true, 'the Growth tab lists FESTDESK under Affiliates'), () => ok(false, 'the Growth tab lists FESTDESK under Affiliates'));
    const cells = await A2.page.$$eval('#growth tr[data-affiliate="FESTDESK"] td', (tds) => tds.map((t) => t.textContent));
    ok(cells[3] === '1' && cells[4] === '₹7,599.05' && cells[6] === '₹1,519.81', `one order, revenue net of the 5% (₹7,599.05), commission due ₹1,519.81: ${cells.slice(3, 7).join(' / ')}`);
    await A2.page.click('#growth [data-gra-action="aff-orders"][data-code="FESTDESK"]');
    await A2.page.waitForFunction(() => /cal@example\.com/.test(document.querySelector('#growth')?.textContent || ''), null, { timeout: 8000 })
      .then(() => ok(true, 'ORDERS lists who bought through it'), () => ok(false, 'ORDERS lists who bought through it'));
    allErrors.push(...A2.errors); await A2.ctx.close();
  }

  console.log('(n) refunds: the switch, a request, approve -> refund, a partial refund, decline');
  {
    F.reset(); RZP.mode = 'pay'; RZP.refundMode = 'processed';
    const seed = (tok, id, plan, paise, accId) => {
      const u = USERS[tok];
      F.db.members.set(u.id, { role: 'user', disabled_at: null });
      F.db.accounts.push({ id: accId, name: u.email.split('@')[0] + "'s Studio", owner_id: u.id, plan, plan_period: 'lifetime', plan_until: null, seat_limit: 1, created_at: new Date().toISOString() });
      F.db.payments.push({ id, user_id: u.id, account_id: accId, plan_id: plan, period: 'lifetime', amount_paise: paise, currency: 'INR', razorpay_order_id: 'order_' + id,
        razorpay_payment_id: 'pay_' + id, status: 'paid', created_at: new Date().toISOString(), paid_at: new Date().toISOString(), ends_at: null });
    };
    seed('tok-ben', 'payR1', 'starter', 299900, 'accR1');
    seed('tok-amy', 'payR2', 'indie', 799900, 'accR2');
    seed('tok-cal', 'payR3', 'starter', 299900, 'accR3');
    const planOf = (accId) => { const a = F.db.accounts.find((x) => x.id === accId); return a.plan_until && Date.parse(a.plan_until) <= Date.now() ? 'ended' : a.plan; };

    // 1. the switch is off: the customer has nothing to click
    const B = await newContext(browser, { tok: 'tok-ben' });
    await B.page.goto(BASE + 'purchase.html');
    await B.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    await B.page.waitForTimeout(600);
    ok(F.db.calls.includes('my_refund_status') && !(await B.page.$('[data-rf-panel]')), 'with the switch off, Ben has a captured payment and sees NO "Request a refund"');
    ok(await B.page.evaluate(() => { const h = [...document.querySelectorAll('#plan h3')].map((e) => e.textContent); return !h.includes('Request a refund'); }), 'and the heading is not on the page');

    // 2. the admin turns it on
    F.db.sessions.clear();
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#billing');
    await A.page.waitForSelector('#baRefundSwitch', { timeout: 15000 });
    ok(!(await A.page.isChecked('#baRefundSwitch')), 'the console switch "Let customers request refunds from the Purchase page" reads OFF by default');
    await A.page.check('#baRefundSwitch');
    await A.page.waitForFunction(() => document.getElementById('baRefundSwitch') && document.getElementById('baRefundSwitch').checked && !document.getElementById('baRefundSwitch').disabled, null, { timeout: 8000 });
    ok(F.db.rrEnabled === true, 'turning it on reaches the database (admin_set_refund_requests_enabled)');

    // 3. the customer asks
    await B.page.reload();
    await B.page.waitForSelector('[data-rf-panel="request"]', { timeout: 12000 }).then(() => ok(true, 'with it on, Ben (captured payment) sees "Request a refund"'), () => ok(false, 'with it on, Ben sees "Request a refund"'));
    /* settings.html re-renders main as billing, gate and refund status
       arrive, so wait for the settled form rather than read the first
       paint of the panel (a read too early was a 1-in-3 failure). */
    const rfSettled = () => B.page.waitForFunction(() => {
      const p = document.querySelector('[data-rf-panel="request"]');
      return !!(p && /Purchases are final/.test(p.textContent) && p.querySelector('a[href="refund.html"]') && document.querySelectorAll('#rfCategory option').length === 4);
    }, null, { timeout: 12000 }).then(() => true, () => false);
    ok(await rfSettled(), 'it states the policy and links refund.html');
    ok((await B.page.$$eval('#rfCategory option', (o) => o.map((x) => x.value))).join() === 'duplicate_charge,not_delivered,legal,other', 'the four reason categories are offered');
    await B.page.selectOption('#rfCategory', 'not_delivered');
    await B.page.fill('#rfMessage', 'Paid on 7 Oct, plan never showed.');
    await B.page.click('[data-rf-form="request"] button[type="submit"]');
    await B.page.waitForFunction(() => /Waiting for the studio/.test(document.querySelector('[data-rf-panel]')?.textContent || ''), null, { timeout: 10000 })
      .then(() => ok(true, 'the block shows the request as pending'), () => ok(false, 'the block shows the request as pending'));
    ok(F.db.rreqs.length === 1 && F.db.rreqs[0].status === 'pending' && F.db.rreqs[0].category === 'not_delivered', 'the request reached the database as PENDING');
    ok(F.db.refunds.length === 0 && F.db.rzpRefunds.length === 0 && F.db.payments.find((x) => x.id === 'payR1').status === 'paid', 'and nothing was refunded: a request is not a refund');
    ok(!(await B.page.$('[data-rf-form="request"]')), 'the form is gone while one is open');

    // 4. the admin approves: the dialog, then the refund
    await A.page.click('#billing [data-ba-action="reload"]');
    await A.page.waitForSelector('#refunds tr[data-rreq] [data-ba-action="rreq-approve"]', { timeout: 10000 });
    ok(/ben@example\.com/.test(await A.page.textContent('#refunds tr[data-rreq]')) && /plan never showed/.test(await A.page.textContent('#refunds tr[data-rreq]')), 'the console lists the request with who and why');
    ok((await A.page.getAttribute('#refunds [data-ba-action="rreq-approve"]', 'aria-label')) === 'Approve and refund ben@example.com', 'APPROVE carries the customer in its aria-label');
    await A.page.click('#refunds [data-ba-action="rreq-approve"]');
    await A.page.waitForSelector('.rf-dialog #rfReason', { timeout: 5000 });
    ok(/ends .*plan today/.test(await A.page.textContent('.rf-dialog .rf-warn')), 'the dialog warns the refund ends the plan');
    ok((await A.page.inputValue('#rfAmount')) === '2999' && /not_delivered|charged but my plan did not arrive/.test(await A.page.inputValue('#rfReason')), 'the amount defaults to the full ₹2,999 and the reason to the customer’s');
    await A.page.fill('#rfReason', '');
    await A.page.click('.rf-dialog button[type="submit"]');
    ok(/reason/i.test(await A.page.textContent('.rf-dialog .gt-error')) && F.db.rzpRefunds.length === 0, 'an empty reason is refused in the dialog and Razorpay is not called');
    await A.page.fill('#rfReason', 'Not delivered — verified');
    await A.page.click('.rf-dialog button[type="submit"]');
    await A.page.waitForFunction(() => !document.querySelector('.rf-dialog'), null, { timeout: 8000 });
    ok(F.db.rzpRefunds.length === 1 && F.db.rzpRefunds[0].payment === 'pay_payR1' && F.db.rzpRefunds[0].amount === 299900 && F.db.rzpRefunds[0].notes.refunded_by === 'admin@example.com' && /verified/.test(F.db.rzpRefunds[0].notes.reason), 'the fake Razorpay was asked for the full ₹2,999 with the reason and the admin’s e-mail in its notes');
    ok(F.db.payments.find((x) => x.id === 'payR1').status === 'refunded' && planOf('accR1') === 'ended', 'an immediate "processed" answer refunds the payment and ends the plan');
    ok(F.db.rreqs[0].status === 'refunded', 'and the request is settled as refunded');
    await A.page.waitForFunction(() => /\brefunded\b/.test(document.querySelector('#refunds tr[data-rreq]')?.textContent || ''), null, { timeout: 8000 })
      .then(() => ok(true, 'the console list shows it refunded'), () => ok(false, 'the console list shows it refunded'));
    ok(!(await A.page.$('#billing .ba-ledger button[data-ba-action="refund"][aria-label^="Refund ben@example.com"]')), 'and the ledger offers no REFUND for that payment any more');
    await B.page.reload();
    await B.page.waitForSelector('#plan .pl-card', { timeout: 10000 }); await B.page.waitForTimeout(500);
    ok(!(await B.page.$('[data-rf-panel]')), 'Ben’s block disappears once the payment is refunded (no captured, unrefunded payment)');

    // 5. a partial refund from the ledger, Razorpay says pending, the webhook finishes it, twice
    RZP.refundMode = 'pending';
    await A.page.click('#billing [data-ba-action="reload"]');
    const amyBtn = '#billing .ba-ledger button[data-ba-action="refund"][aria-label^="Refund amy@example.com"]';
    await A.page.waitForSelector(amyBtn, { timeout: 10000 });
    await A.page.click(amyBtn);
    await A.page.waitForSelector('.rf-dialog #rfAmount', { timeout: 5000 });
    ok((await A.page.inputValue('#rfAmount')) === '7999', 'the ledger REFUND dialog opens at the full ₹7,999');
    await A.page.fill('#rfAmount', '99999');
    await A.page.fill('#rfReason', 'x');
    await A.page.click('.rf-dialog button[type="submit"]');
    ok(/between/.test(await A.page.textContent('.rf-dialog .gt-error')) && F.db.rzpRefunds.length === 1, 'more than was paid is refused in the dialog');
    await A.page.fill('#rfAmount', '1000');
    await A.page.fill('#rfReason', 'Duplicate charge, goodwill part');
    const slow = A.page.click('.rf-dialog button[type="submit"]');
    await slow;
    await A.page.waitForFunction(() => !document.querySelector('.rf-dialog'), null, { timeout: 8000 });
    ok(F.db.rzpRefunds.length === 2 && F.db.rzpRefunds[1].amount === 100000, 'a partial ₹1,000 went to Razorpay as 100000 paise');
    ok(F.db.payments.find((x) => x.id === 'payR2').status === 'paid' && planOf('accR2') === 'indie', 'a PENDING refund leaves the payment and the plan alone until the webhook');
    await A.page.click('#billing [data-ba-action="reload"]');
    await A.page.waitForFunction(() => /refund pending/.test(document.querySelector('#billing .ba-ledger')?.textContent || ''), null, { timeout: 8000 })
      .then(() => ok(true, 'the ledger shows "refund pending"'), () => ok(false, 'the ledger shows "refund pending"'));
    ok(!(await A.page.$(amyBtn)), 'and the REFUND button is gone while it is in flight (no double refund)');
    const dbl = await A.page.evaluate(async ([sb, tok]) => {
      const r = await fetch(sb + '/functions/v1/rzp-refund', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: 'payR2', reason: 'again' }) });
      return { status: r.status, body: await r.json() };
    }, [SB, 'tok-admin']);
    ok(dbl.status === 400 && /already in progress/.test(dbl.body.error) && F.db.rzpRefunds.length === 2, 'a second refund while one is pending is refused by the server');
    webhookRefundProcessed('payR2'); webhookRefundProcessed('payR2');
    ok(F.db.payments.find((x) => x.id === 'payR2').status === 'refunded' && planOf('accR2') === 'ended' && F.db.refunds.filter((f) => f.payment_id === 'payR2' && f.status !== 'failed').length === 1, 'the webhook (delivered twice) refunds once: one refund row, the plan ended');

    // 6. a non-admin cannot call the function at all
    const bad = await B.page.evaluate(async ([sb, tok]) => {
      const r = await fetch(sb + '/functions/v1/rzp-refund', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: 'payR3', reason: 'sneaky' }) });
      return { status: r.status, body: await r.json() };
    }, [SB, 'tok-ben']);
    ok(bad.status === 403 && F.db.rzpRefunds.length === 2 && F.db.payments.find((x) => x.id === 'payR3').status === 'paid', 'a signed-in non-admin calling rzp-refund is refused (403) and nothing moves');

    // 7. decline, with a note the customer reads
    const C = await newContext(browser, { tok: 'tok-cal' });
    await C.page.goto(BASE + 'purchase.html');
    await C.page.waitForSelector('[data-rf-panel="request"]', { timeout: 12000 });
    await C.page.selectOption('#rfCategory', 'other');
    await C.page.click('[data-rf-form="request"] button[type="submit"]');
    await C.page.waitForSelector('[data-rf-panel] .gt-error', { timeout: 5000 }).then(() => ok(true, '"Something else" with no words is refused in the form'), () => ok(false, '"Something else" with no words is refused in the form'));
    ok(F.db.rreqs.length === 1, 'and no request was filed');
    await C.page.fill('#rfMessage', 'Changed my mind');
    await C.page.click('[data-rf-form="request"] button[type="submit"]');
    await C.page.waitForFunction(() => /Waiting for the studio/.test(document.querySelector('[data-rf-panel]')?.textContent || ''), null, { timeout: 10000 });
    await A.page.click('#billing [data-ba-action="reload"]');
    await A.page.waitForSelector('#refunds [data-ba-action="rreq-decline"]', { timeout: 10000 });
    ok((await A.page.getAttribute('#refunds [data-ba-action="rreq-decline"]', 'aria-label')) === 'Decline the request from cal@example.com', 'DECLINE carries the customer in its aria-label');
    await A.page.click('#refunds [data-ba-action="rreq-decline"]');
    await A.page.waitForSelector('.rf-dialog #rfNote', { timeout: 5000 });
    await A.page.click('.rf-dialog button[type="submit"]');
    ok(/Say why/.test(await A.page.textContent('.rf-dialog .gt-error')) && F.db.rreqs[1].status === 'pending', 'declining without a note is refused in the dialog');
    await A.page.fill('#rfNote', 'Outside the refund policy: the plan was delivered.');
    await A.page.click('.rf-dialog button[type="submit"]');
    await A.page.waitForFunction(() => !document.querySelector('.rf-dialog'), null, { timeout: 8000 });
    ok(F.db.rreqs[1].status === 'declined' && /Outside the refund policy/.test(F.db.rreqs[1].admin_note) && F.db.rzpRefunds.length === 2, 'the request is declined with the note and Razorpay was not called');
    await C.page.reload();
    await C.page.waitForFunction(() => /Declined/.test(document.querySelector('[data-rf-panel]')?.textContent || ''), null, { timeout: 12000 })
      .then(() => ok(true, 'Cal sees the request as declined'), () => ok(false, 'Cal sees the request as declined'));
    ok(await C.page.waitForFunction(() => {
      const p = document.querySelector('[data-rf-panel]');
      return !!(p && /Outside the refund policy/.test(p.textContent) && document.querySelector('[data-rf-form="request"]'));
    }, null, { timeout: 12000 }).then(() => true, () => false), 'with the administrator’s note, and may ask again');
    await C.page.setViewportSize({ width: 390, height: 800 });
    ok(await C.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the request block does not overflow at 390px');
    await A.page.setViewportSize({ width: 390, height: 800 });
    ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the console’s refund list and ledger do not overflow at 390px');
    ok(!(await C.page.evaluate(() => Object.keys(localStorage).some((k) => /refund/i.test(k)))), 'no refund state is kept in localStorage');
    for (const x of [A, B, C]) { allErrors.push(...x.errors); await x.ctx.close(); }
    RZP.refundMode = 'pending';
  }

  console.log('(o) the trial, and the wall when it runs out');
  F.reset();
  {
    /* Amy: a member, on Free, mid-trial. Her plan is literally 'free'
       and free's features are already {sample_only, new_projects:false}
       from section 18 — which is the whole point of the design: the
       trial needed no new gating anywhere, only a second axis saying
       whether she may be here at all. */
    F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
    setTrial(USERS['tok-amy'].id, { minutes: 30, source: 'signup', scope: 'sample' });
    for (const a of F.db.accounts) if (a.owner_id === USERS['tok-amy'].id) { a.plan = 'free'; a.plan_until = null; }

    const amy = await newContext(browser, { tok: 'tok-amy' });
    await amy.page.goto(BASE + 'index.html');
    await amy.page.evaluate((uid) => {
      const list = JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]');
      const now = new Date().toISOString();
      list.push({ id: 'p-dragon', title: 'Dragon', format: 'feature', createdAt: now, updatedAt: now, ns: ['', uid] });
      list.push({ id: 'p-mine', title: 'My own film', format: 'short', createdAt: now, updatedAt: now, ns: ['', uid] });
      localStorage.setItem('fms_studio_projects_v1', JSON.stringify(list));
    }, USERS['tok-amy'].id);
    await amy.page.reload();
    ok(await waitGate(amy.page, 'open'), 'a trial user is through the gate (start_trial inserts the member row, which is what admits them)');
    /* THE TRIAL CLOCK lives in the rail (.sh-rail-trial), built by
       trial-band.js only while a trial runs, and ticks in seconds. */
    await waitTrial(amy.page)
      .then(() => ok(true, 'the rail carries the trial clock (.sh-rail-trial)'), () => ok(false, 'the rail carries the trial clock (.sh-rail-trial)'));
    ok(/^\d+:\d\d$/.test(await trialClock(amy.page)), 'saying how long is left, in m:ss — seconds always (owner, 12 Oct 2026): ' + await trialClock(amy.page));
    { const t1 = await trialClock(amy.page); await amy.page.waitForTimeout(2300);
      ok(t1 !== await trialClock(amy.page), 'and it TICKS: ' + t1 + ' -> ' + await trialClock(amy.page)); }
    ok(!(await amy.page.$('.sh-trial')), 'the old top strip (.sh-trial) is gone');
    ok(!(await amy.page.$('.pg-lock.pg-wall')), 'and the page is NOT walled while the trial runs');
    await amy.page.waitForFunction(() => document.querySelectorAll('#projectsGrid .project-card:not(.new-card)').length === 1, null, { timeout: 10000 })
      .then(() => ok(true, 'the hub shows ONE project'), () => ok(false, 'the hub shows ONE project'));
    const titles = await amy.page.$$eval('#projectsGrid .project-card:not(.new-card)', (c) => c.map((x) => x.textContent));
    ok(titles.length === 1 && /Dragon/.test(titles[0]), 'and it is the Dragon sample: ' + JSON.stringify(titles));
    ok(await amy.page.evaluate(() => [...document.querySelectorAll('[data-action="new-project"]')].every((el) => el.hidden || el.closest('[hidden]') || getComputedStyle(el).display === 'none')), 'no NEW PROJECT control is offered during the trial');

    /* ---- the thirty minutes are up -------------------------------
       expireTrial() backdates the row; the SERVER decides, which is
       why this is a reload and not a clock. */
    expireTrial(USERS['tok-amy'].id);
    await amy.page.goto(BASE + 'index.html');
    await amy.page.waitForSelector('.pg-lock.pg-wall', { timeout: 12000 })
      .then(() => ok(true, 'index.html is covered by the paywall once the trial has run out'), () => ok(false, 'index.html is covered by the paywall once the trial has run out'));
    /* The wall is a VARIANT of the module lock, never a rename of it:
       (c) and (i) above read .pg-lock, .pg-lock-card and .pg-flag by
       name and must keep working. */
    ok(!!(await amy.page.$('.pg-lock.pg-wall .pg-lock-card.pg-wall-card')), 'as a variant of the existing lock, both class names present');
    ok((await amy.page.evaluate(() => getComputedStyle(document.querySelector('main')).visibility)) === 'hidden', 'with the page veiled underneath, not deleted');
    ok(await amy.page.evaluate(() => document.documentElement.hasAttribute('data-paywall')), 'and :root carries data-paywall');
    ok(!(await trialUp(amy.page)) && !(await amy.page.$('.sh-trial-chip')), 'the trial clock is gone (hidden and emptied, no chip)');

    /* YOU CANNOT BUY FROM BEHIND A WALL. settings is exempt by name,
       matched WITHOUT the .html because vercel's cleanUrls makes the
       live pathname `/settings` — an exemption anchored to .html
       would have walled the page you pay on, on the live site and
       nowhere else. */
    await amy.page.goto(BASE + 'purchase.html');
    await amy.page.waitForSelector('#plan .pl-card', { timeout: 12000 }).catch(() => {});
    ok(!(await amy.page.$('.pg-lock.pg-wall')), 'purchase.html is NOT walled — it is where a plan is bought');
    ok(!!(await amy.page.$('#plan .pl-card')), 'and the tiers are there to buy');

    /* ---- DOWNLOAD MY WORK ----------------------------------------
       The one door that must stay open. It calls backup.js directly
       rather than the hub's exportAll(), because the wall appears on
       every page and exportAll() needs hub.js. */
    await amy.page.goto(BASE + 'index.html');
    await amy.page.waitForSelector('.pg-lock.pg-wall [data-action="pg-export"]', { timeout: 12000 }).catch(() => {});
    const btn = await amy.page.$('.pg-lock.pg-wall [data-action="pg-export"]');
    ok(!!btn, 'the wall offers DOWNLOAD MY WORK');
    if (!btn) {
      skip('the download produces a real file (no button to press)');
    } else {
      const dl = amy.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await btn.click();
      const file = await dl;
      ok(!!file, 'pressing it produces a real download' + (file ? ': ' + file.suggestedFilename() : ''));
      if (file) {
        const to = path.join(OUT, '__wall-backup.json');
        await file.saveAs(to).catch(() => {});
        let body = null; try { body = JSON.parse(fs.readFileSync(to, 'utf8')); } catch (e) { /* */ }
        ok(!!body, 'and the file is a readable backup, not an empty blob');
        ok(!!body && /Dragon|p-dragon/.test(JSON.stringify(body)), 'carrying the work that was on the device');
        try { fs.unlinkSync(to); } catch (e) { /* */ }
      } else {
        skip('the downloaded file is a readable backup (nothing was downloaded)');
      }
    }
    allErrors.push(...amy.errors); await amy.ctx.close();

    /* ---- an administrator is never walled -------------------------
       The owner locked out of their own studio by their own paywall
       is a 2 a.m. incident. The role is the SERVER's answer, carried
       on the gate state, not anything the client decides — so the
       admin here is put in exactly Amy's position first: Free plan,
       trial expired. */
    for (const a of F.db.accounts) if (a.owner_id === USERS['tok-admin'].id) { a.plan = 'free'; a.plan_until = null; }
    expireTrial(USERS['tok-admin'].id, { role: 'admin' });
    const ad = await newContext(browser, { tok: 'tok-admin' });
    await ad.page.goto(BASE + 'index.html');
    await ad.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getGateState().role === 'admin', null, { timeout: 12000 }).catch(() => {});
    await ad.page.waitForTimeout(1200);
    ok((await ad.page.evaluate(() => window.StudioCloud.getGateState().role)) === 'admin', 'the admin’s role comes back from studio_status()');
    ok(!(await ad.page.$('.pg-lock.pg-wall')), 'and an administrator on an expired trial is not walled on index.html');
    await ad.page.goto(BASE + 'breakdown.html');
    await ad.page.waitForTimeout(1500);
    ok(!(await ad.page.$('.pg-lock.pg-wall')), 'nor anywhere else');
    allErrors.push(...ad.errors); await ad.ctx.close();
  }

  console.log('(p) purchases required: the switch (schema section 32)');
  F.reset();
  {
    /* Amy is exactly the person the wall is for: a member on Free whose
       trial ran out. With the switch OFF she is not walled, nothing on
       screen offers to sell her anything, and purchase.html says there
       is nothing to buy. */
    F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
    expireTrial(USERS['tok-amy'].id);
    F.db.settings.purchase_required = false;
    const purchaseRailHidden = (page) => page.evaluate(() => {
      const a = document.querySelector('.sh-rail a.sh-rail-item[href="purchase.html"]');
      return !a ? null : getComputedStyle(a).display === 'none';
    });
    const amy = await newContext(browser, { tok: 'tok-amy' });
    await amy.page.goto(BASE + 'index.html');
    ok(await waitGate(amy.page, 'open'), 'OFF: Amy is through the gate');
    await amy.page.waitForFunction(() => document.documentElement.dataset.purchases === 'off', null, { timeout: 12000 })
      .then(() => ok(true, 'OFF: plan-gate publishes data-purchases="off" from billing_status()'), () => ok(false, 'OFF: plan-gate publishes data-purchases="off" from billing_status()'));
    ok(!(await amy.page.$('.pg-lock.pg-wall')), 'OFF: an expired free member is NOT walled');
    ok(!(await trialUp(amy.page)), 'OFF: no trial band');
    const railOff = await purchaseRailHidden(amy.page);
    if (railOff === null) skip('the rail has no Purchase entry on this page'); else ok(railOff, 'OFF: the rail’s Purchase entry is hidden');
    await amy.page.goto(BASE + 'purchase.html');
    await amy.page.waitForFunction(() => /free to use right now/.test(document.body.textContent), null, { timeout: 12000 }).catch(() => {});
    ok((await amy.page.textContent('#plan').catch(() => '')).includes('The studio is free to use right now \u2014 nothing to buy.'), 'OFF: purchase.html says "The studio is free to use right now — nothing to buy."');
    ok(!(await amy.page.$('#plan .pl-card')), 'OFF: and shows no plan cards, so no checkout');
    await amy.page.goto(BASE + 'settings.html');
    await amy.page.waitForFunction(() => document.documentElement.dataset.purchases === 'off', null, { timeout: 12000 }).catch(() => {});
    ok(await amy.page.evaluate(() => [...document.querySelectorAll('a[href="purchase.html"]')].every((a) => !a.offsetParent)),
      'OFF: no visible link to purchase.html on Settings (the "Plan & purchases" row included)');

    /* THE SWITCH REACHES AN OPEN TAB. The owner turns it on; Amy's
       index.html has been open all along. Focus is what re-reads
       billing_status() — no reload, no navigation. */
    await amy.page.goto(BASE + 'index.html');
    await amy.page.waitForFunction(() => document.documentElement.dataset.purchases === 'off', null, { timeout: 12000 }).catch(() => {});
    ok(!(await amy.page.$('.pg-lock.pg-wall')), '(control) the open page is not walled before the switch');
    F.db.settings.purchase_required = true;
    await amy.page.waitForTimeout(5500);   // past plan-gate's focus throttle
    await amy.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await amy.page.waitForSelector('.pg-lock.pg-wall', { timeout: 12000 })
      .then(() => ok(true, 'ON + focus: the open page walls itself, with no reload'), () => ok(false, 'ON + focus: the open page walls itself, with no reload'));
    ok(!(await amy.page.evaluate(() => document.documentElement.hasAttribute('data-purchases'))), 'ON: data-purchases is gone, so buying is back on screen');
    const railOn = await purchaseRailHidden(amy.page);
    if (railOn === null) skip('the rail has no Purchase entry on this page'); else ok(!railOn, 'ON: the rail’s Purchase entry is visible again');
    await amy.page.goto(BASE + 'purchase.html');
    await amy.page.waitForSelector('#plan .pl-card', { timeout: 12000 }).catch(() => {});
    ok(!!(await amy.page.$('#plan .pl-card')), 'ON: purchase.html has the plan cards back');

    /* AN OLDER DATABASE: no §32, so billing_status() carries no key.
       The key has to be PRESENT to be believed — the studio is exactly
       what it was before this section existed. */
    delete F.db.settings.purchase_required;
    await amy.page.goto(BASE + 'index.html');
    await amy.page.waitForSelector('.pg-lock.pg-wall', { timeout: 12000 })
      .then(() => ok(true, 'NO KEY (§32 not run): the wall stands, as before'), () => ok(false, 'NO KEY (§32 not run): the wall stands, as before'));
    ok(!(await amy.page.evaluate(() => document.documentElement.hasAttribute('data-purchases'))), 'NO KEY: nothing is hidden');
    allErrors.push(...amy.errors); await amy.ctx.close();
  }

  console.log('(q) the end of a trial: one stable wall, and the way out');
  /* One browser at a time: the 90-second device lock (§14) would put the
     takeover prompt over every page a SECOND context opens for Amy, and
     that prompt — not the wall — is then what the checks would read. */
  const soloContext = (o) => { F.db.sessions.clear(); return newContext(browser, o); };
  {
    const amyId = USERS['tok-amy'].id;
    /* Main-frame navigations, the loop's only honest measure. */
    const navCounter = (page) => { const n = []; page.on('framenavigated', (f) => { if (f === page.mainFrame()) n.push(f.url().replace(BASE, '/')); }); return n; };

    // 1. the clock runs out while the page is open
    F.reset();
    F.db.members.set(amyId, { role: 'user', disabled_at: null });
    setTrial(amyId, { minutes: 30, startedAt: Date.now() - 30 * 60000 + 8000 });   // eight seconds left
    {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.goto(BASE + 'index.html');
      await waitTrial(A.page).catch(() => {});
      ok((await trialUp(A.page)) && !(await A.page.$('.pg-wall')), '(control) the band is up and there is no wall while seconds remain');
      const navs = navCounter(A.page);
      await A.page.waitForSelector('.pg-lock.pg-wall', { timeout: 20000 })
        .then(() => ok(true, 'the trial runs out on an open page: the band asks the server and the wall goes up'), () => ok(false, 'the trial runs out on an open page: the band asks the server and the wall goes up'));
      await A.page.waitForTimeout(10000);
      ok(navs.length === 0, 'and NO navigation in the ten seconds after it (no loop): ' + (navs.join(' > ') || 'none'));
      ok(!!(await A.page.$('.pg-wall')) && !(await trialUp(A.page)), 'the wall is still up and the band is gone');
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 2. a fresh load after expiry, on the hub, a module page and the dashboard
    for (const pg of ['index.html', 'breakdown.html', 'dashboard.html']) {
      const A = await soloContext({ tok: 'tok-amy' });
      const navs = navCounter(A.page);
      await A.page.goto(BASE + pg);
      await A.page.waitForTimeout(10000);
      ok(navs.length <= 1 && !!(await A.page.$('.pg-wall')), `${pg} after expiry: ${navs.length} navigation in ten seconds, and one stable wall`);
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 3. purchase.html is reachable, usable, and tells the truth
    {
      const A = await soloContext({ tok: 'tok-amy' });
      const navs = navCounter(A.page);
      await A.page.goto(BASE + 'purchase.html');
      await A.page.waitForSelector('#plan .pl-card', { timeout: 12000 }).catch(() => {});
      await A.page.waitForTimeout(6000);
      ok(navs.length <= 1 && !(await A.page.$('.pg-wall')), 'purchase.html after expiry: not walled, no loop');
      ok(/free trial ended/i.test(await A.page.textContent('#plan').catch(() => '')), 'and it says the free trial ended (not "Your plan: Free")');
      ok(!!(await A.page.$('#plan [data-auth-action="signout"]')), 'with a SIGN OUT beside the plans');
      ok(!!(await A.page.$('#plan .pl-card[data-plan="starter"] [data-plan-action="buy"]:not([disabled])')), 'and a plan it can actually buy');
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 4. invite.html no longer says "You're in"
    {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.goto(BASE + 'invite.html');
      await A.page.waitForFunction(() => /free trial is over/i.test(document.body.textContent), null, { timeout: 12000 }).catch(() => {});
      const t = await A.page.textContent('main').catch(() => '');
      ok(/free trial is over/i.test(t) && !/You’re in/.test(t), 'invite.html tells a lapsed member the trial is over, not "You’re in"');
      ok(!!(await A.page.$('main a[href="purchase.html"]')) && !!(await A.page.$('main [data-auth-action="signout"]')), 'and offers SEE PLANS and SIGN OUT');
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 5. SIGN OUT from the wall, at desktop and at phone width; it stays out; signing back in works
    for (const width of [1280, 390]) {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.setViewportSize({ width, height: 860 });
      await A.page.goto(BASE + 'index.html');
      await A.page.waitForSelector('.pg-wall [data-auth-action="signout"]', { timeout: 12000 }).catch(() => {});
      const btn = await A.page.$('.pg-wall [data-auth-action="signout"]');
      ok(!!btn && await btn.isVisible(), `${width}px: the wall offers a visible SIGN OUT (the band and the phone bar are hidden under it)`);
      if (!btn) { skip(`${width}px: signing out from the wall (no button)`); allErrors.push(...A.errors); await A.ctx.close(); continue; }
      const navs = navCounter(A.page);
      await btn.click();
      await A.page.waitForURL(/start\.html/, { timeout: 15000 }).catch(() => {});
      await A.page.waitForTimeout(3000);
      ok(/start\.html/.test(A.page.url()), `${width}px: it lands on start.html: ` + navs.join(' > '));
      ok(navs.length <= 2, `${width}px: in at most two navigations (${navs.length})`);
      ok(!(await A.page.evaluate((k) => localStorage.getItem(k), `sb-${REF}-auth-token`)), `${width}px: and the session is gone from storage`);
      ok(!(await A.page.$('.pg-wall')) && !(await trialUp(A.page)), `${width}px: no stale wall and no trial band`);
      // stays out: the hub sends a signed-out visitor straight back to the landing page
      await A.page.goto(BASE + 'index.html');
      await A.page.waitForURL(/start\.html/, { timeout: 15000 }).catch(() => {});
      ok(/start\.html/.test(A.page.url()) && !(await A.page.evaluate(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession())), `${width}px: it stays out — index.html returns to start.html, no session`);
      if (width === 1280) {
        // and back in, the way Google returns
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const back = navCounter(A.page);
        await A.page.goto(BASE + '#access_token=tok-amy&refresh_token=r-tok-amy&expires_in=3600&expires_at=' + exp + '&token_type=bearer');
        await A.page.waitForSelector('.pg-wall', { timeout: 15000 }).catch(() => {});
        await A.page.waitForTimeout(4000);
        ok(!!(await A.page.evaluate(() => window.StudioCloud.getSession())) && !!(await A.page.$('.pg-wall')), 'signing back in works: a session, and (the trial still over) the wall');
        ok(back.length <= 4, 'the return from Google settles in a bounded number of loads, no loop: ' + back.length);
      }
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 6. SIGN OUT from Settings (the account pill's destination) during a RUNNING trial
    F.reset();
    F.db.members.set(amyId, { role: 'user', disabled_at: null });
    setTrial(amyId, { minutes: 30 });
    {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.goto(BASE + 'index.html');
      await waitTrial(A.page).catch(() => {});
      const pill = await A.page.$('[data-auth-action="pill"]');
      if (pill && await pill.isVisible()) { await pill.click(); await A.page.waitForURL(/settings\.html/, { timeout: 10000 }).catch(() => {}); }
      else await A.page.goto(BASE + 'settings.html#account');
      ok(/settings\.html/.test(A.page.url()), 'the account pill leads a trial user to Settings → Account');
      await A.page.waitForSelector('[data-auth-action="signout"]', { timeout: 10000 }).catch(() => {});
      await A.page.click('[data-auth-action="signout"]').catch(() => {});
      await A.page.waitForURL(/start\.html/, { timeout: 15000 }).catch(() => {});
      ok(/start\.html/.test(A.page.url()) && !(await trialUp(A.page)), 'Settings’ SIGN OUT signs a trial user out to start.html, with no band left behind');
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 7. a member with no trial (a membership-only grant) is OFFERED one on the wall
    F.reset();
    F.db.members.set(amyId, { role: 'user', disabled_at: null });
    clearTrial(amyId);
    F.db.settings.trial_minutes = 120;
    {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.goto(BASE + 'index.html');
      await A.page.waitForSelector('.pg-wall [data-action="pg-start-trial"]', { timeout: 12000 }).catch(() => {});
      const b = await A.page.$('.pg-wall [data-action="pg-start-trial"]');
      ok(!!b && /2 HOURS/.test(await b.textContent()), 'a member who never had a trial is offered one on the wall, in hours: ' + (b ? await b.textContent() : 'no button'));
      if (b) {
        await b.click();
        await A.page.waitForFunction(() => !document.querySelector('.pg-wall') && (() => { const b = document.querySelector('#studioRail .sh-rail-trial'); return b && !b.hidden && b.querySelector('[role="timer"]'); })(), null, { timeout: 12000 })
          .then(() => ok(true, 'starting it takes the wall down and puts the band up'), () => ok(false, 'starting it takes the wall down and puts the band up'));
        ok(/^\d+:\d\d:\d\d$/.test(await trialClock(A.page)), 'and the clock counts down in h:mm:ss: ' + await trialClock(A.page));
      } else skip('starting the trial from the wall');
      allErrors.push(...A.errors); await A.ctx.close();
    }

    // 8. two tabs: a plan bought in one takes the other's wall down, with no focus
    F.reset(); RZP.mode = 'pay';
    F.db.members.set(amyId, { role: 'user', disabled_at: null });
    expireTrial(amyId);
    {
      const A = await soloContext({ tok: 'tok-amy' });
      await A.page.goto(BASE + 'index.html');
      await A.page.waitForSelector('.pg-wall', { timeout: 12000 }).catch(() => {});
      const B = await A.ctx.newPage();
      B.on('pageerror', (e) => A.errors.push(e.message));
      await B.goto(BASE + 'purchase.html');
      await B.waitForSelector('#plan .pl-card[data-plan="starter"] [data-plan-action="buy"]', { timeout: 12000 });
      ok(!!(await A.page.$('.pg-wall')), '(control) tab one is walled while tab two shops');
      await B.click('#plan .pl-card[data-plan="starter"] [data-plan-action="buy"]');
      await B.waitForFunction(() => document.querySelector('#plan .is-current') && document.querySelector('#plan .is-current').dataset.plan === 'starter', null, { timeout: 15000 })
        .then(() => ok(true, 'tab two buys Basic'), () => ok(false, 'tab two buys Basic'));
      await A.page.waitForFunction(() => !document.querySelector('.pg-wall'), null, { timeout: 8000 })
        .then(() => ok(true, 'and tab one’s wall comes down by itself — no focus, no reload (BroadcastChannel)'), () => ok(false, 'and tab one’s wall comes down by itself — no focus, no reload (BroadcastChannel)'));
      allErrors.push(...A.errors); await A.ctx.close();
    }
  }

  console.log('(r) hours, and no free plan anywhere');
  F.reset();
  {
    /* The console: 30 minutes reads 0.5 hours; 3 hours saves 180 minutes. */
    const A = await soloContext({ tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#growth');
    await A.page.waitForSelector('#graTrialHours', { timeout: 15000 }).catch(() => {});
    ok((await A.page.inputValue('#graTrialHours').catch(() => '')) === '0.5', 'the console shows the 30-minute trial as 0.5 hours');
    ok(/hours/i.test(await A.page.textContent('label[for="graTrialHours"]').catch(() => '')), 'and the field is labelled in hours');
    await A.page.fill('#graTrialHours', '3');
    await A.page.click('form[data-gra-form="trial"] button[type="submit"]');
    await A.page.waitForFunction(() => document.querySelector('form[data-gra-form="trial"] .ba-saved'), null, { timeout: 8000 }).catch(() => {});
    ok(F.db.settings.trial_minutes === 180, 'saving 3 hours stores 180 minutes (the column stays minutes): ' + F.db.settings.trial_minutes);
    await A.page.reload();
    await A.page.waitForSelector('#graTrialHours', { timeout: 15000 }).catch(() => {});
    ok((await A.page.inputValue('#graTrialHours').catch(() => '')) === '3', 'and reads back as 3 hours after a reload');
    ok(/3 hours/.test(await A.page.textContent('form[data-gra-form="trial"]').catch(() => '')), 'the switch’s sentence says "3 hours"');
    // the grant lists: paid plans only
    await A.page.goto(BASE + 'admin.html#tiers');
    await A.page.waitForSelector('#baGrantPlan', { timeout: 15000 }).catch(() => {});
    const grantOpts = await A.page.$$eval('#baGrantPlan option', (o) => o.map((x) => x.value)).catch(() => ['?']);
    ok(grantOpts.length > 0 && !grantOpts.includes('free'), 'the console’s grant-a-plan list offers paid plans only: ' + grantOpts.join(','));
    await A.page.goto(BASE + 'admin.html#give-access');
    await A.page.waitForSelector('#accPlan', { timeout: 15000 }).catch(() => {});
    const accOpts = await A.page.$$eval('#accPlan option', (o) => o.map((x) => x.value)).catch(() => ['?']);
    ok(!accOpts.includes('free'), 'and the give-access list has no Free plan (blank = membership only): ' + accOpts.join(','));
    allErrors.push(...A.errors); await A.ctx.close();

    /* invite.html: a signed-in stranger is offered "3 hours", and the
       cards there carry no Free card. */
    const N = await soloContext({ tok: 'tok-ben' });
    await N.page.goto(BASE + 'invite.html');
    await N.page.waitForSelector('[data-iv-action="start-trial"]', { timeout: 12000 }).catch(() => {});
    ok(/START MY 3 HOURS/.test(await N.page.textContent('[data-iv-action="start-trial"]').catch(() => '')), 'invite.html offers the trial in hours: START MY 3 HOURS');
    ok(!(await N.page.$('.pl-card')) && !!(await N.page.$('#buy a[href="purchase.html"]')), 'invite.html draws no plan cards: it links to purchase.html, where plans are bought');
    await N.page.goto(BASE + 'purchase.html');
    await N.page.waitForSelector('#plan .pl-card', { timeout: 12000 }).catch(() => {});
    const inv = await N.page.$$eval('#plan .pl-card', (c) => c.map((x) => x.dataset.plan)).catch(() => []);
    ok(inv.length === 3 && !inv.includes('free'), 'purchase.html’s cards are the three paid plans, no Free card: ' + inv.join(','));
    allErrors.push(...N.errors); await N.ctx.close();

    /* pricing.html (the plans moved off start.html): no Free tier, no Free column, and the trial strip says 3 hours. */
    const S = await soloContext();
    await S.page.goto(BASE + 'pricing.html');
    await S.page.waitForFunction(() => /3 hours/.test((document.querySelector('#pricing [data-trial] [data-trial-length]') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
    ok(!(await S.page.$('.pr-tiers li[data-tier="free"]')) && !!(await S.page.$('#pricing [data-trial]')), 'pricing.html: no Free tier, and a free-trial strip in its place');
    ok(!(await S.page.$$eval('.pr-table thead .pr-th-name', (t) => t.map((x) => x.textContent.trim()))).includes('Free'), 'pricing.html: no Free column in the comparison table');
    ok(/3 hours/.test(await S.page.textContent('#pricing [data-trial] [data-trial-length]').catch(() => '')), 'pricing.html: the trial strip says "3 hours", from the anon trial_offer()');
    allErrors.push(...S.errors); await S.ctx.close();

    /* the band, in hours */
    F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
    setTrial(USERS['tok-amy'].id, { minutes: 180 });
    const B = await soloContext({ tok: 'tok-amy' });
    await B.page.goto(BASE + 'index.html');
    await waitTrial(B.page).catch(() => {});
    ok(/^[23]:\d\d:\d\d$/.test(await trialClock(B.page)), 'a three-hour trial’s clock reads h:mm:ss, not "180 minutes": ' + await trialClock(B.page));
    /* skew: a server clock 3 minutes ahead of this browser shortens the countdown by those minutes */
    F.db.serverSkewMs = 3 * 60000;
    setTrial(USERS['tok-amy'].id, { minutes: 10 });
    await B.page.reload();
    await waitTrial(B.page).catch(() => {});
    const left = Number(((await trialClock(B.page)).match(/^(\d+):\d\d$/) || [])[1]);
    ok(left >= 6 && left <= 7, 'the clock counts against the SERVER’s clock (server_now): 10-minute trial, server 3 min ahead -> ' + left + ' minutes left');
    F.db.serverSkewMs = 0;
    allErrors.push(...B.errors); await B.ctx.close();
  }

  console.log('(s) access given by the studio, and a refund’s fresh trial (schema sections 33 and 34)');
  F.reset();
  {
    /* A member given access by e-mail with NO plan, while purchases are
       required (the fake's default): no wall, no band, the studio's own
       words. Their trial was never used. */
    const ben = USERS['tok-ben'];
    F.db.members.set(ben.id, { role: 'user', disabled_at: null });
    clearTrial(ben.id);
    F.db.emailGrants.set(ben.email, { email: ben.email, role: 'member', plan: null, until: null, applied_user: ben.id,
      applied_at: new Date().toISOString(), applied_account: null, applied_plan: null, created_member: false, prior_role: 'user', prior: null });
    const G = await soloContext({ tok: 'tok-ben' });
    await G.page.goto(BASE + 'index.html');
    await G.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession(), null, { timeout: 10000 }).catch(() => {});
    await G.page.waitForTimeout(2500);
    ok(!(await G.page.$('.pg-wall')) && !(await trialUp(G.page)), 'a plan-less grant while purchases are required: no wall and no trial band');
    await G.page.goto(BASE + 'purchase.html');
    await G.page.waitForSelector('.pu-granted', { timeout: 10000 }).catch(() => {});
    const pu = await G.page.textContent('#plan').catch(() => '');
    ok(/Access given by the studio/.test(pu) && !/free trial/i.test(pu), 'purchase.html says "Access given by the studio" and no trial wording');
    /* Settings said the same state was on the FREE plan: 'granted' is only
       computed with plan 'free', so its planName is the free plan's name. */
    await G.page.goto(BASE + 'settings.html#account');
    await G.page.waitForSelector('.st-facts', { timeout: 10000 }).catch(() => {});
    // The plan resolves after the first paint; wait for it to say granted.
    await G.page.waitForFunction(() => /Access given/.test((document.querySelector('.st-plan-line') || {}).textContent || ''), null, { timeout: 12000 }).catch(() => {});
    const facts = await G.page.textContent('.st-facts').catch(() => '');
    const planLine = await G.page.textContent('.st-plan-line').catch(() => '');
    ok(/Access given by the studio/.test(facts) && !/\bFree\b/.test(facts), 'settings identity card reads "Access given by the studio", not the Free plan: ' + facts);
    ok(/Access given to you by the studio\.$/.test(planLine.trim()), 'settings plan card names no plan for granted access: ' + planLine);
    /* Revoked: the ordinary state — never had a trial, so the wall offers one. */
    F.db.emailGrants.clear();
    await G.page.goto(BASE + 'index.html');
    await G.page.waitForSelector('.pg-lock.pg-wall', { timeout: 12000 }).catch(() => {});
    ok((await G.page.getAttribute('.pg-wall', 'data-kind').catch(() => '')) === 'fresh', 'revoked: the wall is back, offering the unused trial');
    allErrors.push(...G.errors); await G.ctx.close();

    /* A buyer whose trial ran out long ago is refunded: the refund
       starts a fresh trial of the configured length, and the band says so. */
    const amy = USERS['tok-amy'];
    F.db.settings.trial_minutes = 120;
    F.db.members.set(amy.id, { role: 'user', disabled_at: null });
    expireTrial(amy.id);
    const acc = { id: 'acc_refund', name: 'Amy’s Studio', owner_id: amy.id, plan: 'indie', plan_period: 'lifetime', plan_until: null, seat_limit: 3, created_at: new Date().toISOString() };
    F.db.accounts.push(acc);
    F.db.payments.push({ id: 'payRT', user_id: amy.id, account_id: acc.id, plan_id: 'indie', period: 'lifetime', amount_paise: 799900, status: 'paid',
      razorpay_order_id: 'order_RT', razorpay_payment_id: 'pay_RT', created_at: new Date().toISOString(), paid_at: new Date().toISOString(), ends_at: null });
    webhookRefundProcessed('payRT');
    ok(F.db.members.get(amy.id)?.trial_source === 'refund' && F.db.members.get(amy.id)?.trial_minutes === 120, '(fake) the refund restarted the trial: source refund, the configured 120 minutes');
    const R = await soloContext({ tok: 'tok-amy' });
    await R.page.goto(BASE + 'index.html');
    await waitTrial(R.page, true, 12000).catch(() => {});
    ok((await trialUp(R.page)) && !(await R.page.$('.pg-wall')), 'a refunded buyer sees the trial band, and no wall');
    ok(/^[12]:\d\d:\d\d$/.test(await trialClock(R.page)), 'counting down the configured hours: ' + await trialClock(R.page));
    allErrors.push(...R.errors); await R.ctx.close();
  }

  console.log('(t) the three plans, as plan-matrix.json says (schema section 35)');
  F.reset();
  {
    /* The fake's plans take EXACTLY the maps section 35 writes — the same
       functions generate both — so this is the owner's split as a buyer
       meets it: Basic writes, Intermediate prepares, Pro is everything. */
    const M = await loadMatrixModule();
    for (const p of F.db.plans) if (p.id !== 'free') { p.features = M.matrixFeatures(p.id); p.limits = { ...p.limits, ...M.matrixLimits(p.id) }; }
    const amy = USERS['tok-amy'];
    F.db.members.set(amy.id, { role: 'user', disabled_at: null });
    expireTrial(amy.id);
    const acc = { id: 'acc_tiers', name: 'Amy’s Studio', owner_id: amy.id, plan: 'starter', plan_period: 'lifetime', plan_until: null, seat_limit: 1, created_at: new Date().toISOString() };
    F.db.accounts.push(acc);
    const T = await soloContext({ tok: 'tok-amy' });
    const open = async (file) => {
      await T.page.goto(BASE + file);
      await T.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getGateState().state === 'open', null, { timeout: 10000 }).catch(() => {});
      await T.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession(), null, { timeout: 10000 }).catch(() => {});
    };
    const locked = async (file) => { await open(file); return T.page.waitForSelector('.pg-lock:not(.pg-wall)', { timeout: 8000 }).then(() => true, () => false); };
    const unlocked = async (file) => { await open(file); await T.page.waitForTimeout(1800); return !(await T.page.$('.pg-lock')); };

    ok(await locked('budget.html'), 'Basic: budget.html is locked');
    ok(/Not on the Basic plan/.test(await T.page.textContent('.pg-lock').catch(() => '')), 'naming the plan');
    ok(/Included in the Intermediate plan/.test(await T.page.waitForFunction(() => /Included in the/.test((document.querySelector('.pg-lock-plan') || {}).textContent || ''), null, { timeout: 8000 }).then(() => T.page.textContent('.pg-lock-plan'), () => '')), 'and the lowest plan that has it (Intermediate)');
    ok(await locked('shoot.html'), 'Basic: shoot.html (Shoot Day) is locked');
    ok(await unlocked('screenplay.html'), 'Basic: screenplay.html (Screenplay Writer) opens');
    ok(await unlocked('drafts.html'), 'Basic: drafts.html (Drafts) opens');
    ok(await unlocked('story.html'), 'Basic: story.html (Beats & Pacing) opens');
    /* Screen Time and Cast Matrix are off for every plan, so what is left on
       reports.html (Production Reports, Sides) is Intermediate: the page locks
       for Basic, and the two off sections are kept hidden, never sold. */
    ok(await locked('reports.html'), 'Basic: reports.html is locked — only the Intermediate sections are left on it');
    ok(!!(await T.page.$('#screentime[data-tab-off]')) && !!(await T.page.$('#cast-matrix[data-tab-off]')), 'and Screen Time and Cast Matrix are hidden (off for every plan), not offered');
    ok(await unlocked('breakdown.html'), 'Basic: breakdown.html opens (Screenplay Analysis, Scene List)');
    await T.page.waitForSelector('#elements[data-tab-lock]', { state: 'attached', timeout: 8000 }).then(() => ok(true, 'Basic: the Elements section is locked in place'), () => ok(false, 'Basic: the Elements section is locked in place'));
    ok(!(await T.page.$('#scenes[data-tab-lock]')) && !(await T.page.$('#breakdown[data-tab-lock]')), 'and the Scene List (with the cards nested in it) is not');
    await open('settings.html#drive');
    await T.page.waitForSelector('[data-plan-locked="drive_backup"]', { state: 'attached', timeout: 8000 }).then(() => ok(true, 'Basic: Settings says Drive backup is not part of the plan'), () => ok(false, 'Basic: Settings says Drive backup is not part of the plan'));
    await open('purchase.html');
    await T.page.waitForSelector('#plan .pl-card[data-plan="indie"] .pl-adds', { timeout: 10000 }).catch(() => {});
    { const t = await T.page.textContent('#plan .pl-card[data-plan="indie"] .pl-adds').catch(() => '');
      ok(/Everything in Basic, plus/.test(t) && /Budget/.test(t) && !/Shoot Day/.test(t), 'the Intermediate card lists what it adds, from the rows: ' + t.replace(/\s+/g, ' ').slice(0, 80)); }
    { const t = await T.page.textContent('#plan .pl-card[data-plan="pro"] .pl-adds').catch(() => '');
      ok(/Everything in Intermediate, plus/.test(t) && /Call sheets/i.test(t) && !/Shoot Day/.test(t) && !/Deliverables/.test(t), 'the Pro card adds Call sheets and no longer lists Shoot Day or Deliverables'); }

    acc.plan = 'indie';
    ok(await unlocked('budget.html'), 'Intermediate: budget.html opens');
    ok(await locked('shoot.html'), 'Intermediate: shoot.html is still locked');
    ok(await unlocked('contacts.html'), 'Intermediate: contacts.html opens');
    await T.page.waitForSelector('#call-sheets[data-tab-lock]', { state: 'attached', timeout: 8000 }).then(() => ok(true, 'Intermediate: Call Sheets is locked in place on contacts.html'), () => ok(false, 'Intermediate: Call Sheets is locked in place on contacts.html'));

    acc.plan = 'pro';
    for (const f of ['budget.html', 'contacts.html']) ok(await unlocked(f), 'Pro: ' + f + ' opens');
    /* Shoot Day, Edit Log and Deliverables are off for every plan, Pro included:
       the page says so, with no plan to buy. */
    for (const f of ['shoot.html', 'edit.html', 'deliverables.html']) {
      await open(f);
      ok(await T.page.waitForSelector('.pg-lock[data-gone]', { timeout: 8000 }).then(() => true, () => false), 'Pro: ' + f + ' says not available (off for every plan)');
    }
    ok(!(await T.page.$('[data-tab-lock]')), 'Pro: no section is locked anywhere on contacts.html');
    allErrors.push(...T.errors); await T.ctx.close();
  }
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = allErrors.filter((e) => !/net::|ERR_|CERT|fetch/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(`${fail ? '✗' : '✓'} billing proof: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
