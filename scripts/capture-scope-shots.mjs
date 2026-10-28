/* ============================================================
   CAPTURE ALL SCOPE SHOTS
   Captures 1440 and 390 screenshots for all states in scope:
     1. start.html (landing)
     2. pricing.html (pricing compare)
     3. invite.html (trial doorway, pass offer doorway)
     4. purchase.html:
        - signed out
        - signed in with nothing (fresh)
        - running trial
        - launch pass active
        - yearly plan active
        - lapsed
        - refunded banner
        - loading
        - error
     5. access wall (trial ended, pass ended)
     6. settings.html#autopay (autopay on, autopay off)
     7. emails (receipt, auto-pay receipt, refund processed, cancelled, reminder)
     8. invoice PDF (.inv-doc in print style)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, signFor, RZP, setTrial, expireTrial } from './fake-supabase.mjs';
import { receiptMail, chargeReceiptMail, refundMail, cancelMail, renewalReminderMail } from '../supabase/functions/_shared/mail.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'dist-billing');
const TARGET_DIR = process.env.TARGET_DIR || path.join(ROOT, 'shots/before');
fs.mkdirSync(TARGET_DIR, { recursive: true });

const PORT = 5399;
const BASE = `http://localhost:${PORT}/`;
const BRAND_HOST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8')).host;

const CHECKOUT_STUB = `
window.Razorpay = function (opts) { this.opts = opts; };
window.Razorpay.prototype.on = function () {};
window.Razorpay.prototype.open = function () {};
`;

async function newContext(browser, { tok = null, keepWall = true } = {}) {
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN'
  });
  if (keepWall) await ctx.addInitScript(() => { window.__fmsKeepWall = true; });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.route(new RegExp('https://' + BRAND_HOST.replace(/\./g, '\\.') + '/.*'), (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: CHECKOUT_STUB }));

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
  return { ctx, page };
}

async function shot(page, name) {
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);
    const p = path.join(TARGET_DIR, `${name}-${w}.png`);
    await page.screenshot({ path: p, fullPage: true });
    console.log('Saved:', path.basename(p));
  }
}

const PASS_ON = () => Object.assign(F.db.settings, {
  pass_enabled: true,
  pass_paise: 4900,
  pass_days: 7,
  pass_plan: 'pro',
  pass_ends_at: new Date(Date.now() + 3 * 86400e3).toISOString(),
  pass_cap: 500
});

async function main() {
  console.log('Starting preview server on port', PORT);
  const srv = spawn(process.execPath, [
    path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'
  ], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // 1. Landing (start.html)
    {
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'start.html');
      await page.waitForSelector('main', { timeout: 10000 });
      await shot(page, 'landing-start');
      await ctx.close();
    }

    // 2. Pricing (pricing.html)
    {
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'pricing.html');
      await page.waitForSelector('main', { timeout: 10000 });
      await shot(page, 'pricing-compare');
      await ctx.close();
    }

    // 3. Invite Doorway (trial offer)
    {
      F.reset();
      F.db.settings.pass_enabled = false;
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'invite.html');
      await page.waitForSelector('#invite', { timeout: 10000 });
      await shot(page, 'doorway-invite-trial');
      await ctx.close();
    }

    // 4. Invite Doorway (pass offer)
    {
      F.reset();
      PASS_ON();
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'invite.html');
      await page.waitForSelector('#invite', { timeout: 10000 });
      await shot(page, 'doorway-invite-pass');
      await ctx.close();
    }

    // 5. Purchase - Signed Out
    {
      F.reset();
      PASS_ON();
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-signed-out');
      await ctx.close();
    }

    // 6. Purchase - Signed in with nothing (fresh)
    {
      F.reset();
      PASS_ON();
      F.db.members.set(USERS['tok-dan'].id, { role: 'user', disabled_at: null });
      const { ctx, page } = await newContext(browser, { tok: 'tok-dan' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-empty');
      await ctx.close();
    }

    // 7. Purchase - Running Trial
    {
      F.reset();
      setTrial(USERS['tok-amy'].id, 20 * 60 * 1000); // 20 mins left
      F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-trial-active');
      await ctx.close();
    }

    // 8. Purchase - Launch Pass Active
    {
      F.reset();
      PASS_ON();
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      let acc = F.db.accounts.find((a) => a.owner_id === amyId);
      if (!acc) {
        acc = { id: 'acc_amy_pass', name: "Amy's Studio", owner_id: amyId, plan: 'pro', plan_period: 'pass', plan_until: new Date(Date.now() + 5 * 86400e3).toISOString(), seat_limit: 5, created_at: new Date().toISOString() };
        F.db.accounts.push(acc);
      } else {
        acc.plan = 'pro';
        acc.plan_period = 'pass';
        acc.plan_until = new Date(Date.now() + 5 * 86400e3).toISOString();
      }
      F.db.payments.push({
        id: 'pay_pass_test', user_id: amyId, account_id: acc.id, plan_id: 'pro', period: 'pass',
        status: 'paid', amount_paise: 4900, starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 5 * 86400e3).toISOString(), created_at: new Date().toISOString()
      });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-pass-active');
      await ctx.close();
    }

    // 9. Purchase - Yearly Plan Active
    {
      F.reset();
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      let acc = F.db.accounts.find((a) => a.owner_id === amyId);
      if (!acc) {
        acc = { id: 'acc_amy_year', name: "Amy's Studio", owner_id: amyId, plan: 'indie', plan_period: 'year', plan_until: new Date(Date.now() + 300 * 86400e3).toISOString(), seat_limit: 5, created_at: new Date().toISOString() };
        F.db.accounts.push(acc);
      } else {
        acc.plan = 'indie';
        acc.plan_period = 'year';
        acc.plan_until = new Date(Date.now() + 300 * 86400e3).toISOString();
      }
      F.db.payments.push({
        id: 'pay_indie_test', user_id: amyId, account_id: acc.id, plan_id: 'indie', period: 'year',
        status: 'paid', amount_paise: 799900, starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 300 * 86400e3).toISOString(), created_at: new Date().toISOString()
      });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-yearly-active');
      await ctx.close();
    }

    // 10. Purchase - Lapsed
    {
      F.reset();
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      let acc = F.db.accounts.find((a) => a.owner_id === amyId);
      if (!acc) {
        acc = { id: 'acc_amy_lapsed', name: "Amy's Studio", owner_id: amyId, plan: 'starter', plan_until: new Date(Date.now() - 10000).toISOString(), seat_limit: 5, created_at: new Date(Date.now() - 10 * 86400e3).toISOString() };
        F.db.accounts.push(acc);
      } else {
        acc.plan = 'starter';
        acc.plan_until = new Date(Date.now() - 10000).toISOString();
      }
      F.db.payments.push({
        id: 'pay_old_test', user_id: amyId, account_id: acc.id, plan_id: 'starter', period: 'year',
        status: 'paid', amount_paise: 599900,
        starts_at: '2025-01-01T00:00:00Z', ends_at: '2026-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z'
      });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('#plan', { timeout: 10000 });
      await shot(page, 'purchase-lapsed');
      await ctx.close();
    }

    // 11. Purchase - Refunded (Big Banner)
    {
      F.reset();
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      let acc = F.db.accounts.find((a) => a.owner_id === amyId);
      if (!acc) {
        acc = { id: 'acc_amy_refunded', name: "Amy's Studio", owner_id: amyId, plan: 'indie', plan_until: new Date(Date.now() - 10000).toISOString(), seat_limit: 5, created_at: new Date(Date.now() - 10 * 86400e3).toISOString() };
        F.db.accounts.push(acc);
      } else {
        acc.plan = 'indie';
        acc.plan_until = new Date(Date.now() - 10000).toISOString();
      }
      F.db.payments.push({
        id: 'pay_rf_test', user_id: amyId, account_id: acc.id, plan_id: 'indie', period: 'year',
        status: 'refunded', amount_paise: 799900,
        starts_at: '2026-10-01T00:00:00Z', ends_at: '2027-10-01T00:00:00Z', created_at: '2026-10-20T00:00:00Z'
      });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('.pu-refund-banner', { timeout: 10000 });
      await shot(page, 'purchase-refunded');
      await ctx.close();
    }

    // 12. Purchase - Error / Plans Unavailable
    {
      F.reset();
      F.db.deployed = false; // schema missing
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy' });
      await page.goto(BASE + 'purchase.html');
      await page.waitForSelector('.pu-sec', { timeout: 10000 });
      await shot(page, 'purchase-error');
      await ctx.close();
      F.db.deployed = true;
    }

    // 13. Access Wall - Trial Ended
    {
      F.reset();
      PASS_ON();
      F.db.settings.pass_enabled = false;
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      expireTrial(amyId);
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy', keepWall: true });
      await page.goto(BASE + 'index.html');
      await page.waitForSelector('.pg-wall', { timeout: 10000 });
      await shot(page, 'access-wall-trial-ended');
      await ctx.close();
    }

    // 14. Access Wall - Launch Pass Offer
    {
      F.reset();
      PASS_ON();
      const amyId = USERS['tok-amy'].id;
      F.db.members.set(amyId, { role: 'user', disabled_at: null });
      expireTrial(amyId);
      const { ctx, page } = await newContext(browser, { tok: 'tok-amy', keepWall: true });
      await page.goto(BASE + 'index.html');
      await page.waitForSelector('.pg-wall', { timeout: 10000 });
      await shot(page, 'access-wall-pass-ended');
      await ctx.close();
    }

    // 15. Email previews
    {
      const sampleInv = {
        invoice_number: 'INV-2026-0042',
        plan_id: 'indie',
        amount_paise: 799900,
        currency: 'INR',
        buyer_email: 'director@filmstudio.in',
        buyer_name: 'Director Arun',
        period: 'year',
        valid_until: '2027-10-28T12:00:00Z',
        renews: true,
        next_charge_at: '2027-10-28T12:00:00Z',
        created_at: new Date().toISOString()
      };
      const emailReceipt = chargeReceiptMail(sampleInv);
      const emailRefund = refundMail({
        buyer_email: 'director@filmstudio.in',
        amount_minor: 799900,
        currency: 'INR',
        reason: 'Customer request'
      });

      const { ctx, page } = await newContext(browser);
      await page.setContent(emailReceipt.html);
      await page.setViewportSize({ width: 700, height: 900 });
      await page.screenshot({ path: path.join(TARGET_DIR, 'email-receipt.png'), fullPage: true });

      await page.setContent(emailRefund.html);
      await page.setViewportSize({ width: 700, height: 900 });
      await page.screenshot({ path: path.join(TARGET_DIR, 'email-refund.png'), fullPage: true });
      await ctx.close();
    }

    // 16. Invoice PDF preview
    {
      const { ctx, page } = await newContext(browser);
      await page.goto(BASE + 'purchase.html');
      await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'inv-doc';
        el.innerHTML = `
          <div class="inv-brand">
            <span class="inv-mark">FMS</span>
            <div>
              <strong class="inv-brand-name">FilmMakerStudio</strong>
              <span class="inv-tag">The Studio for Independent Filmmakers</span>
            </div>
          </div>
          <div class="inv-head">
            <div>
              <h1>Bill of Supply</h1>
              <p class="inv-no">INV-2026-0042 · 28 October 2026</p>
            </div>
            <span class="inv-paid">PAID</span>
          </div>
          <div class="inv-cols">
            <div>
              <h2>Supplier</h2>
              <strong>FilmMakerStudio</strong>
              <div>support@filmmakerstudio.in</div>
              <div>filmmakerstudio.in</div>
            </div>
            <div>
              <h2>Billed to</h2>
              <strong>Amy Writer</strong>
              <div>amy@example.com</div>
            </div>
            <div class="inv-cols-facts">
              <h2>Payment details</h2>
              <table class="inv-facts">
                <tbody>
                  <tr><th scope="row">Invoice number</th><td>INV-2026-0042</td></tr>
                  <tr><th scope="row">Date of issue</th><td>28 October 2026</td></tr>
                  <tr><th scope="row">Plan valid</th><td>28 Oct 2026 – 28 Oct 2027</td></tr>
                  <tr><th scope="row">Payment method</th><td>Paid online via Razorpay</td></tr>
                  <tr><th scope="row">Razorpay payment ID</th><td>pay_test_invoice</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="inv-amt">Qty</th>
                <th class="inv-amt">Rate</th>
                <th class="inv-amt">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div>FilmMakerStudio — Intermediate plan</div>
                  <div class="inv-sub">A year of Intermediate (≈ ₹21.92 a day).</div>
                </td>
                <td class="inv-amt">1</td>
                <td class="inv-amt">₹7,999</td>
                <td class="inv-amt">₹7,999</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th colspan="3">Total paid</th>
                <th class="inv-amt">₹7,999</th>
              </tr>
            </tfoot>
          </table>
          <p class="inv-words">Amount in words: Seven thousand nine hundred and ninety-nine rupees only</p>
          <p class="inv-note">Bill of Supply — supplier not registered under GST. No tax is charged.</p>
          <p class="inv-terms">Refunds: Refundable within 7 days. Full policy: https://filmmakerstudio.in/refund</p>
          <p class="inv-note">This is a computer-generated document and needs no signature.</p>
        `;
        document.body.appendChild(el);
        document.body.classList.add('pdf-invoice');
      });
      await page.setViewportSize({ width: 900, height: 1200 });
      await page.waitForTimeout(400);
      const invDoc = await page.$('.inv-doc');
      if (invDoc) {
        await invDoc.screenshot({ path: path.join(TARGET_DIR, 'invoice-preview.png') });
        console.log('Saved: invoice-preview.png');
      }
      await ctx.close();
    }

    console.log('Finished capturing all scope shots in', TARGET_DIR);
  } finally {
    await browser.close();
    srv.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
