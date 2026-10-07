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
     (j) promo codes (schema section 20): "Have a code?" reprices the
         cards from quote_order, BUY carries the code, Checkout opens
         with the DISCOUNTED amount, the ledger row has the code and
         the code's use count moves at activation; a refused code
         prints the server's sentence and prices nothing; the console
         lists, adds and deactivates a code

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
    await page.goto(BASE + 'settings.html#plan');   // the Plan TAB; the section is hidden under any other
    ok(await waitGate(page, 'open'), 'Amy (a member) is through the gate');
    await page.waitForSelector('#plan .pl-card', { timeout: 10000 });
    const p = await prices(page);
    ok(p.length === 4 && p.map((x) => x[0]).join() === 'free,starter,indie,pro', 'four cards in order: ' + p.map((x) => x[0]).join(', '));
    ok(p.find((x) => x[0] === 'indie')[1] === '₹7,999', 'the card shows the table’s ONE price (₹7,999)');
    ok((await page.textContent('#plan')).includes('yours for good'), 'and says it is bought once, for good');
    ok(!(await page.$('[data-plan-action="period"]')), 'there is no period switch — section 18 withdrew the subscription model');
    ok((await page.textContent('#plan .is-current .bd-eyebrow')) === 'Your plan' && (await page.getAttribute('#plan .is-current', 'data-plan')) === 'free', 'Free is marked as the current plan');
    ok((await page.textContent('#plan')).includes('Cloud projects: 0 of 1'), 'usage shows 0 of 1 projects on Free');

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
  /* This section proves the SERVER's cap (the P0402 trigger), so the free
     tier here may make projects; the feature lock that hides New project
     on the default free tier is section (i)'s to prove. */
  { const fp = F.db.plans.find((p) => p.id === 'free'); fp.features = { ...(fp.features || {}), new_projects: true, sample_only: false }; }
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
    await page.goto(BASE + 'admin.html#billing');   // the Billing tab
    await page.waitForSelector('#billing .ba-plan', { timeout: 15000 });
    ok((await page.$$eval('#billing .ba-plan', (e) => e.length)) === 4, 'the console lists the four tiers for editing');
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
    await amy.page.goto(BASE + 'settings.html#plan');
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
  {
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#features');
    await A.page.waitForSelector('#features .pf-table', { timeout: 15000 });
    ok((await A.page.$$eval('#features thead th', (e) => e.length)) === 5, 'the matrix has a column per plan');
    ok(await A.page.isChecked('input[name="free:sample_only"]') && !(await A.page.isChecked('input[name="free:new_projects"]')) && await A.page.isChecked('input[name="pro:new_projects"]'), 'the free tier reads sample only, no new projects; pro reads everything');
    ok(await A.page.isChecked('input[name="free:story-beats"]'), 'a module nobody has touched is ticked (missing = allowed)');
    ok(/shares a page with Idea Vault/.test(await A.page.textContent('tr[data-feature="story-beats"]')), 'a module that shares a page says so, and with whom');
    // story.html hosts three modules; a page locks only when all of its modules are unticked.
    for (const id of ['story-beats', 'idea-vault', 'pitch-deck']) await A.page.uncheck(`input[name="free:${id}"]`);
    await A.page.click('#features button[type="submit"]');
    await A.page.waitForSelector('#features .ba-saved', { timeout: 8000 });
    const free = F.db.plans.find((p) => p.id === 'free');
    ok(free.features['story-beats'] === false && free.features['idea-vault'] === false && free.features.sample_only === true && free.features['scene-list'] === true, 'admin_set_plan received the whole map: the three unticked false, sample_only kept, the rest true');
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
    await amy.page.waitForSelector('.pg-lock', { timeout: 10000 }).then(() => ok(true, 'story.html (all three of its modules unticked for Free) shows the plan lock'), () => ok(false, 'story.html (all three of its modules unticked for Free) shows the plan lock'));
    ok(/Not on the Free plan/.test(await amy.page.textContent('.pg-lock')), 'naming the plan');
    ok((await amy.page.evaluate(() => getComputedStyle(document.querySelector('main')).visibility)) === 'hidden', 'with the page veiled underneath, not removed');
    await amy.page.goto(BASE + 'breakdown.html');
    await amy.page.waitForFunction(() => window.StudioCloud && window.StudioCloud.getGateState().state === 'open', null, { timeout: 10000 });
    await amy.page.waitForTimeout(800);
    ok(!(await amy.page.$('.pg-lock')), 'a module still ticked (scene list) opens normally');
    ok(await amy.page.evaluate(() => !!document.querySelector('[data-module-id="story-beats"].is-locked .pg-flag')), 'the phase menu marks Story · Beats with a PLAN flag');
    /* The cards count what the matrix left ticked: every built module
       plus five capabilities (sample_only is said in words, not counted). */
    /* Every module on the map: the five stages' and the Library's own
       (case studies, dissection, glossary hang off the Library since
       6 Oct 2026 — src/lib/navmodel.js joins the two lists the same way). */
    const NAV = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));
    const built = [...NAV.phases, ...NAV.global].flatMap((p) => p.modules || []).filter((m) => m.status !== 'planned').length;
    const total = built + 5;
    await amy.page.goto(BASE + 'settings.html#plan');
    await amy.page.waitForSelector('#plan .pl-card .pl-features-n', { timeout: 10000 });
    const counts = await amy.page.$$eval('#plan .pl-card', (cards) => Object.fromEntries(cards.map((c) => [c.dataset.plan, (c.querySelector('.pl-features-n') || {}).textContent])));
    ok(counts.free === `${total - 4} of ${total} features`, `the Free card counts ${total - 4} of ${total} (three modules and new projects unticked): ${counts.free}`);
    ok(counts.pro === `${total} of ${total} features`, `the Pro card counts everything: ${counts.pro}`);
    ok(/Sample project only/.test(await amy.page.textContent('#plan .pl-card[data-plan="free"]')), 'and Free says "Sample project only" in words');
    allErrors.push(...amy.errors); await amy.ctx.close();
  }

  console.log('(j) promo codes');
  F.reset(); RZP.mode = 'pay';
  F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'settings.html#plan');
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
    ok(/LAUNCH10 applied to Starter, Indie, Pro/.test(await page.textContent('#plan .pl-promo-msg')), 'the box says which plans it applied to');
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
    await A.page.goto(BASE + 'admin.html#billing');
    await A.page.waitForSelector('#billing tr[data-promo="LAUNCH10"]', { timeout: 15000 }).then(() => ok(true, 'the console lists LAUNCH10'), () => ok(false, 'the console lists LAUNCH10'));
    ok(/10% off/.test(await A.page.textContent('#billing tr[data-promo="LAUNCH10"]')) && /\b1\b/.test(await A.page.textContent('#billing tr[data-promo="LAUNCH10"] td:nth-child(4)')), 'with its discount and one use');
    ok(/LAUNCH10 \(₹799\.90 off\)/.test(await A.page.textContent('#billing .ba-ledger')), 'the payments ledger shows the code on the discounted row');
    await A.page.fill('#baPromoCode', 'fest 500');
    await A.page.selectOption('#baPromoKind', 'amount');
    await A.page.fill('#baPromoValue', '500');
    await A.page.fill('#baPromoMax', '1');
    await A.page.uncheck('#billing input[name="plan"][value="starter"]');
    await A.page.fill('#baPromoNote', 'festival desk');
    await A.page.click('form[data-ba-form="promo"] button[type="submit"]');
    await A.page.waitForSelector('#billing tr[data-promo="FEST500"]', { timeout: 8000 }).then(() => ok(true, 'ADD CODE lands FEST500 in the list'), () => ok(false, 'ADD CODE lands FEST500 in the list'));
    const fest = F.db.promos.find((c) => c.code === 'FEST500');
    ok(fest && fest.amount_off_paise === 50000 && fest.max_uses === 1 && fest.plan_ids && fest.plan_ids.join() === 'indie,pro' && fest.note === 'festival desk', 'admin_set_promo_code received ₹500 as 50000 paise, one use, Indie and Pro only, with the note');
    await A.page.click('#billing tr[data-promo="LAUNCH10"] [data-ba-action="promo-toggle"]');
    await A.page.waitForFunction(() => /inactive/.test((document.querySelector('#billing tr[data-promo="LAUNCH10"]') || {}).textContent || ''), null, { timeout: 8000 })
      .then(() => ok(true, 'DEACTIVATE marks LAUNCH10 inactive'), () => ok(false, 'DEACTIVATE marks LAUNCH10 inactive'));
    ok(F.db.promos.find((c) => c.code === 'LAUNCH10').active === false, 'and the fake’s row is inactive');
    await A.page.setViewportSize({ width: 390, height: 844 });
    ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the promo console does not overflow at 390px');
    allErrors.push(...A.errors); await A.ctx.close();

    // a stranger on invite.html: the deactivated code is refused, the new one prices Pro and not Starter
    const B = await newContext(browser, { tok: 'tok-ben' });
    await B.page.goto(BASE + 'invite.html');
    await B.page.waitForSelector('#buy .pl-card', { timeout: 10000 });
    await B.page.click('#buy .pl-promo summary');
    await B.page.fill('#plPromoCode', 'LAUNCH10');
    await B.page.click('#buy .pl-promo-form button[type="submit"]');
    await B.page.waitForSelector('#buy .pl-promo-msg.is-error', { timeout: 8000 });
    ok(/not active/.test(await B.page.textContent('#buy .pl-promo-msg')), 'invite.html: the deactivated code is refused as inactive');
    await B.page.fill('#plPromoCode', 'FEST500');
    await B.page.click('#buy .pl-promo-form button[type="submit"]');
    await B.page.waitForSelector('#buy .pl-card[data-plan="pro"].has-promo', { timeout: 8000 });
    ok(!(await B.page.$('#buy .pl-card[data-plan="starter"].has-promo')) && /FEST500 applied to Indie, Pro/.test(await B.page.textContent('#buy .pl-promo-msg')), 'FEST500 prices Indie and Pro and leaves Starter alone');
    ok((await prices(B.page)).find((x) => x[0] === 'pro')[1] === '₹19,499', 'Pro reads ₹19,499 (₹500 off)');
    allErrors.push(...B.errors); await B.ctx.close();
  }
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = allErrors.filter((e) => !/net::|ERR_|CERT|fetch/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(`${fail ? '✗' : '✓'} billing proof: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
