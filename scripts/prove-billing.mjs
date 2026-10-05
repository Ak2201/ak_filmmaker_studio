/* ============================================================
   PROOF: plans, Razorpay checkout, activation, caps, the console
   ------------------------------------------------------------
   The real GATED build (what the hosts run) in Chromium, against the
   shared Supabase fake extended with schema section 16 and the two
   edge functions, and a stub of Razorpay Checkout that signs the way
   Razorpay does (HMAC-SHA256 of order|payment with the key secret) —
   so rzp-verify's check is real even though no money moves.

   Asserted:
     (a) a member sees the four tiers on settings.html with the prices
         the plans table holds; the period switch reprices them
     (b) BUY: rzp-order is asked for the plan and period, Checkout opens,
         rzp-verify receives a GENUINE signature, the plan activates,
         the page shows the tier and its expiry, the ledger reads paid
     (c) PAYING GRANTS ENTRY: a signed-in stranger on invite.html buys a
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

   Run:  npm run build && node scripts/prove-billing.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, signFor, RZP } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-billing');

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
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

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

async function newContext(browser, { tok = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
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
    await page.goto(BASE + 'settings.html');
    ok(await waitGate(page, 'open'), 'Amy (a member) is through the gate');
    await page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    const p = await prices(page);
    ok(p.length === 4 && p.map((x) => x[0]).join() === 'free,starter,indie,pro', 'four cards in order: ' + p.map((x) => x[0]).join(', '));
    ok(p.find((x) => x[0] === 'indie')[1] === '₹7,999', 'yearly is the default period and shows the table’s yearly price (₹7,999)');
    ok((await page.textContent('#plan')).includes('Saves'), 'a yearly saving is named');
    await page.click('[data-plan-action="period"][data-period="month"]');
    ok((await prices(page)).find((x) => x[0] === 'indie')[1] === '₹799', 'the period switch reprices: ₹799 a month');
    ok((await page.textContent('#plan .is-current .bd-eyebrow')) === 'Your plan' && (await page.getAttribute('#plan .is-current', 'data-plan')) === 'free', 'Free is marked as the current plan');
    ok((await page.textContent('#plan')).includes('Cloud projects: 0 of 1'), 'usage shows 0 of 1 projects on Free');

    console.log('(b) buy');
    await page.click('[data-plan-action="period"][data-period="year"]');
    await page.evaluate(() => { window.__w = 0; window.__wk = []; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (...a) { window.__w++; window.__wk.push(String(a[0])); return o.apply(this, a); }; });
    await page.click('.pl-card[data-plan="indie"] [data-plan-action="buy"]');
    await page.waitForFunction(() => document.querySelector('#plan .is-current') && document.querySelector('#plan .is-current').dataset.plan === 'indie', null, { timeout: 15000 }).then(() => ok(true, 'the Indie card becomes the current plan'), () => ok(false, 'the Indie card becomes the current plan'));
    const order = F.db.calls.find((c) => c.startsWith('fn:rzp-order'));
    ok(order === 'fn:rzp-order indie year', 'rzp-order was asked for indie, yearly');
    const last = await page.evaluate(() => window.__rzpLast);
    ok(last && last.amount === 799900 && last.currency === 'INR' && last.key === 'rzp_test_fake', 'Checkout opened with the table’s amount in paise and the public key id');
    ok(F.db.calls.includes('fn:rzp-verify ok'), 'rzp-verify accepted a genuine signature');
    const pay = F.db.payments.find((x) => x.plan_id === 'indie');
    ok(pay && pay.status === 'paid' && pay.razorpay_payment_id, 'the ledger reads paid with the payment id');
    const acc = F.db.accounts.find((a) => a.owner_id === USERS['tok-amy'].id);
    ok(acc && acc.plan === 'indie' && Date.parse(acc.plan_until) - Date.now() > 360 * 86400e3, 'Amy owns an organisation on Indie for a year');
    ok((await page.textContent('#plan')).includes('Until'), 'the card prints the expiry');
    ok((await page.textContent('#plan .bd-h2')).includes('Indie'), 'the section title names the plan and the organisation');
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
    await page.goto(BASE + 'invite.html');
    ok(await waitGate(page, 'closed'), 'Ben (a stranger) is outside the gate');
    await page.waitForSelector('#buy .pl-card', { timeout: 10000 });
    ok(true, 'invite.html offers the tiers as a way in');
    await page.click('.pl-card[data-plan="starter"] [data-plan-action="buy"]');
    ok(await waitGate(page, 'open'), 'after paying, the gate is OPEN with no code and no admin');
    ok(F.db.members.has(USERS['tok-ben'].id), 'Ben is a member');
    ok(F.db.accounts.some((a) => a.owner_id === USERS['tok-ben'].id && a.plan === 'starter'), 'with an organisation on Starter');
    await page.waitForSelector('#through', { timeout: 8000 }).then(() => ok(true, 'the page says "You’re in"'), () => ok(false, 'the page says "You’re in"'));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(f) the project cap');
  F.reset();
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  F.db.projects.push({ id: 'existing', title: 'Already in the cloud', format: 'feature', owner_id: USERS['tok-amy'].id });
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'index.html');
    await waitGate(page, 'open');
    // Drive the creation through the hub's own control: the modal is
    // #projectModal with #pmTitle, submitted by the form.
    await page.locator('[data-action="new-project"]:visible').first().click();
    await page.waitForSelector('#projectModal.show #pmTitle', { timeout: 5000 });
    await page.fill('#pmTitle', 'Second film');
    await page.click('#pmSubmit');
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
    await page.goto(BASE + 'admin.html');
    await page.waitForSelector('#billing .ba-plan', { timeout: 15000 });
    ok((await page.$$eval('#billing .ba-plan', (e) => e.length)) === 4, 'the console lists the four tiers for editing');
    await page.fill('#ba_indie_monthly', '599');
    await page.fill('#ba_indie_projects', '12');
    await page.click('form[data-plan="indie"] button[type="submit"]');
    await page.waitForSelector('.ba-saved', { timeout: 8000 });
    const indie = F.db.plans.find((p) => p.id === 'indie');
    ok(indie.monthly_paise === 59900 && indie.limits.projects === 12, 'admin_set_plan received ₹599 as 59900 paise and projects 12');
    ok(indie.limits.seats === 3, 'untouched limits survived the save');
    // "Saved." clears itself with a re-render 2.5s on; fill the grant form after that, not under it.
    await page.waitForSelector('.ba-saved', { state: 'detached', timeout: 8000 });
    await page.selectOption('#baGrantWho', USERS['tok-amy'].id);
    await page.selectOption('#baGrantPlan', 'pro');
    await page.fill('#baGrantDays', '45');
    await page.fill('#baGrantNote', 'festival comp');
    await page.click('form[data-ba-form="grant"] button[type="submit"]');
    await page.waitForFunction(() => /Granted until/.test(document.body.innerText), null, { timeout: 8000 }).then(() => ok(true, 'the grant is confirmed with its end date'), () => ok(false, 'the grant is confirmed with its end date'));
    const g = F.db.payments.find((x) => x.status === 'granted');
    ok(g && g.plan_id === 'pro' && g.amount_paise === 0 && g.note === 'festival comp', 'the ledger carries a ₹0 granted row with the note');
    ok(F.db.accounts.some((a) => a.owner_id === USERS['tok-amy'].id && a.plan === 'pro'), 'Amy’s organisation is on Pro');
    await page.waitForFunction(() => /festival comp/.test((document.querySelector('#billing .gt-table') || {}).textContent || ''), null, { timeout: 8000 }).then(() => ok(true, 'the payments table shows it'), () => ok(false, 'the payments table shows it'));
    await page.setViewportSize({ width: 390, height: 844 });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the billing console does not overflow at 390px');
    allErrors.push(...errors); await ctx.close();

    const amy = await newContext(browser, { tok: 'tok-amy' });
    await amy.page.goto(BASE + 'settings.html');
    await amy.page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    await amy.page.click('[data-plan-action="period"][data-period="month"]');
    ok((await prices(amy.page)).find((x) => x[0] === 'indie')[1] === '₹599', 'the cards show the edited price');
    ok((await amy.page.getAttribute('#plan .is-current', 'data-plan')) === 'pro', 'and Amy sees Pro as her plan after the grant');
    allErrors.push(...amy.errors); await amy.ctx.close();
  }
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = allErrors.filter((e) => !/net::|ERR_|CERT|fetch/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(`${fail ? '✗' : '✓'} billing proof: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
