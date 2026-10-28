/* ============================================================
   BILLING — the client half, in Node (run by test-billing.mjs)
   ------------------------------------------------------------
   purchase-model.js, billing.js buy() and the plan cards, under
   linkedom, with Supabase and Razorpay faked at the two seams the
   browser has: window.StudioCloud.ensureClient() and window.Razorpay.
   store.js is a stub that records notify(); billing.js is handed an
   import.meta.env with a test key id, so payments read as configured.

       node scripts/test-billing-client.mjs
   ============================================================ */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

/* store.js patches Storage.prototype for the browser; here it is every
   export it declares, as a no-op, plus a default whose notify() is
   recorded. */
const storeSrc = readFileSync(new URL('../src/lib/store.js', import.meta.url), 'utf8');
const names = [...new Set([...storeSrc.matchAll(/^export (?:async )?(?:function|const|let|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
  .concat(['FORMATS', 'SCOPED_KEYS', 'ACCOUNT_KEY', 'StudioStore']))];
const STORE = 'const S = { subscribe(){}, notify(n, d){ (globalThis.__notes ||= []).push(n); } }; export default S;'
  + names.map((n) => `export const ${n} = () => null;`).join('');
register('data:text/javascript,' + encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  const STORE = ${JSON.stringify(STORE)};
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js') return { url: 'data:text/javascript,' + encodeURIComponent(STORE), shortCircuit: true };
    if (spec.endsWith('/cloud.js')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (spec.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    if (url.endsWith('/src/lib/billing.js')) return { format: 'module', shortCircuit: true,
      source: 'import.meta.env = { VITE_RAZORPAY_KEY_ID: "rzp_test_node" };\\n' + readFileSync(new URL(url), 'utf8') };
    return next(url, ctx);
  }
`), import.meta.url);

const { parseHTML } = await import('linkedom');
const w = parseHTML('<!doctype html><html><head></head><body></body></html>');
globalThis.window = w.window;
for (const k of ['document', 'Node', 'HTMLElement', 'Element']) if (w[k] && !(k in globalThis)) globalThis[k] = w[k];
const DomEvent = w.Event;   // Node's own Event cannot be dispatched through linkedom
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.location = new URL('http://localhost/purchase.html');
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.FormData = class { constructor(f) { this.f = f; } get(n) { const el = this.f.querySelector(`[name="${n}"]`); return el ? el.value : null; } };

/* The fake cloud: what each edge function and RPC answers is set per test. */
const answers = { 'rzp-order': { data: { order_id: 'order_1', amount: 59900 }, error: null }, 'rzp-verify': null, quote_order: () => null };
const sb = {
  functions: { invoke: async (name) => answers[name] },
  rpc: async (name, args) => ({ data: answers[name](args), error: null })
};
let gateRuns = 0;
window.StudioCloud = { ensureClient: async () => sb, runGate: async () => { gateRuns++; } };
/* Checkout: open() pays at once and calls the handler. */
window.Razorpay = class { constructor(o) { this.o = o; } on() {} open() { this.o.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' }); } };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const PM = await import('../src/lib/purchase-model.js');
const Billing = await import('../src/lib/billing.js');
const { planCards } = await import('../src/ui/plan-cards.js');
globalThis.Event = DomEvent;   // plan-cards dispatches a submit when it re-quotes

/* ---- bug 5: a lapsed plan never "ended on Jan 1, 1970" ---- */
{
  // billing_status() for a lapsed account: plan 'free', plan_until null.
  const line = PM.lapsedLine({ plan: 'free', bought_plan: 'starter', lapsed: true, plan_until: null, payments: [] });
  ok(!/1970/.test(line), 'a lapsed plan with no plan_until does not print the epoch — ' + line);
  ok(/^Your Basic plan has ended\. /.test(line), 'it says the plan has ended, with no date — ' + line);
  const refunded = PM.lapsedLine({ bought_plan: 'starter', plan_until: null, payments: [{ status: 'refunded', plan_id: 'starter' }] });
  ok(/has ended \(refunded\)\./.test(refunded), 'a refunded one still says so — ' + refunded);
  const dated = PM.lapsedLine({ bought_plan: 'indie', plan_until: '2026-03-04T10:00:00Z', payments: [] });
  ok(/plan ended on /.test(dated) && /2026/.test(dated), 'a real date is still said — ' + dated);
  ok(!/1970|Invalid/.test(PM.lapsedLine({ bought_plan: 'starter', plan_until: 'not a date' })), 'an unparseable date is not printed');
  // a launch pass is not a plan: no "Renew it", no plan name (the live bug: a refunded pass read "Your Pro plan ended ... Renew it")
  const pass = PM.lapsedLine({ plan: 'free', bought_plan: 'pro', plan_period: 'pass', lapsed: true, plan_until: '2026-10-28T04:14:03Z',
    payments: [{ status: 'refunded', plan_id: 'pro', period: 'pass', starts_at: '2026-10-28T04:10:47Z', ends_at: '2026-11-04T04:10:47Z' }] });
  ok(/^Your .*pass ended on .*2026.* \(refunded\)\./.test(pass) && !/Renew it|Pro plan/.test(pass) && /once per account/.test(pass), 'a refunded pass says pass, not plan, and does not offer to renew it — ' + pass);
  const passEnded = PM.lapsedLine({ bought_plan: 'pro', plan_period: 'pass', plan_until: '2026-11-04T04:10:47Z', payments: [] });
  ok(/pass ended on /.test(passEnded) && !/refunded|Renew it/.test(passEnded), 'a pass that simply ended says so, with no refund and no renewal — ' + passEnded);
  ok(/^Your Pro plan ended on /.test(PM.lapsedLine({ bought_plan: 'pro', plan_period: 'year', plan_until: '2026-03-04T10:00:00Z', payments: [] })), 'a yearly plan is worded exactly as before');
}

/* ---- bug 6: money moved, the studio has not confirmed ---- */
{
  globalThis.__notes = [];
  answers['rzp-verify'] = { data: { ok: false, pending: true, error: 'Your payment is being confirmed. You do not need to pay again.' }, error: null };
  let err = null;
  try { await Billing.buy('starter', 'year', {}); } catch (e) { err = e; }
  ok(err && err.code === 'pending', 'a 202 pending rejects with code pending');
  ok(err && err.afterPayment === true && err.unconfirmed === true, 'and is marked after-payment, unconfirmed');
  await tick(5);
  ok(globalThis.__notes.includes('billing:changed'), 'billing is re-read at once after a pending verify (it was never re-read)');

  globalThis.__notes = [];
  answers['rzp-verify'] = { data: null, error: { message: 'Failed to send a request to the Edge Function', context: {} } };
  err = null;
  try { await Billing.buy('starter', 'year', {}); } catch (e) { err = e; }
  ok(err && err.afterPayment && err.unconfirmed, 'no answer from rzp-verify after a payment is unconfirmed');
  ok(err && /Do not pay again/.test(err.message), 'and says not to pay again — ' + (err && err.message));

  answers['rzp-verify'] = { data: null, error: { message: 'non-2xx', context: { json: async () => ({ error: 'The credit was used. Ask for a refund.' }) } } };
  err = null;
  try { await Billing.buy('starter', 'year', {}); } catch (e) { err = e; }
  ok(err && err.afterPayment && !err.unconfirmed, 'a refusal the server worded is after-payment but not unconfirmed');
  eq(err && err.message, 'The credit was used. Ask for a refund.', 'and keeps the server sentence');

  answers['rzp-verify'] = { data: { plan: 'starter' }, error: null };
  globalThis.__notes = [];
  const res = await Billing.buy('starter', 'year', {});
  eq(res, { plan: 'starter' }, 'a verified buy still resolves to the result');
  ok(globalThis.__notes.includes('billing:changed'), 'and notifies');
}

const PLANS = [
  { id: 'free', name: 'No plan', active: false, price_paise: 0, limits: {} },
  { id: 'starter', name: 'Basic', active: true, price_paise: 59900, limits: {} },
  { id: 'indie', name: 'Intermediate', active: true, price_paise: 79900, limits: {} },
  { id: 'pro', name: 'Pro', active: true, price_paise: 99900, limits: {} }
];
const FREE = { plan: 'free', payments: [] };
const HELD = { plan: 'starter', plan_until: '2027-10-21T00:00:00Z', payments: [{ status: 'paid', plan_id: 'starter' }] };
const host = document.createElement('div');
document.body.append(host);
let st = FREE;
let onBuy = async () => {};
const draw = () => { host.replaceChildren(planCards(PLANS, st, { onBuy: (...a) => onBuy(...a), rerender: draw })); };
const btn = (id) => host.querySelector(`[data-plan-action="buy"][data-plan="${id}"]`);
const click = (el) => el.dispatchEvent(new DomEvent('click', { bubbles: true }));

/* ---- bug 6, the cards: BUY does not come back over stale billing ---- */
{
  draw();
  ok(btn('starter') && !btn('starter').disabled, 'Basic is buyable on a free account');
  onBuy = async () => { const e = new Billing.BillingError('Your payment is being confirmed. You do not need to pay again.', 'pending'); e.afterPayment = true; e.unconfirmed = true; throw e; };
  click(btn('starter'));
  await tick(5);
  draw();   // the page redraws from the SAME (pre-payment) billing
  ok(btn('starter').disabled, 'after an unconfirmed payment Basic\'s BUY is not live again');
  ok(/CONFIRMING/.test(btn('starter').textContent), 'it says the payment is being confirmed — ' + btn('starter').textContent);
  ok(btn('indie').disabled && btn('pro').disabled, 'and no other BUY is live while it confirms');
  st = HELD; draw();   // the webhook activated it; billing re-read
  ok(host.querySelector('.pl-success'), 'once billing shows the plan, the success card is drawn');
  ok(btn('indie') && !btn('indie').disabled, 'and the higher tiers are buyable again');
  ok(btn('starter') && !/CONFIRMING/.test(btn('starter').textContent), 'Basic is a renewal again, not "confirming"');

  // a refusal the server worded is not held: BUY comes back
  st = FREE; draw();
  onBuy = async () => { const e = new Billing.BillingError('The card was declined.', 'failed'); throw e; };
  click(btn('pro'));
  await tick(5); draw();
  ok(!btn('pro').disabled, 'a plain failure puts BUY back (nothing was taken)');
}

/* ---- bug 7: a promo quote does not outlive the purchase it priced ---- */
{
  /* the fake quote_order() prices for the billing there is now: on a
     free account no credit; holding Basic, the year left on it counts */
  answers.quote_order = ({ p_plan }) => {
    const list = PLANS.find((p) => p.id === p_plan).price_paise;
    const credit = st.plan === 'starter' && p_plan !== 'starter' ? 29950 : 0;
    return { ok: true, code: 'STUDENT50', list_paise: list, discount_paise: list / 2, amount_paise: list / 2 - credit, credit_paise: credit,
      ...(credit ? { upgrade_from: 'starter', upgrade_from_name: 'Basic' } : {}) };
  };
  const apply = async () => {
    host.querySelector('#plPromoCode').value = 'STUDENT50';
    host.querySelector('[data-plan-form="promo"]').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true }));
    await tick(5);
  };
  const card = (id) => btn(id).closest('.pl-card');
  const priceOf = (id) => card(id).querySelector('.pl-price strong').textContent;
  st = FREE; draw();
  await apply();
  ok(/399\.50/.test(priceOf('indie')), 'the code reprices Intermediate before the purchase — ' + priceOf('indie'));
  onBuy = async () => { st = HELD; draw(); };   // purchase.js: buy, then refreshBilling() redraws
  click(btn('starter'));
  await tick(20);
  ok(!/399\.50/.test(priceOf('indie')), 'after buying Basic, Intermediate is not shown at the pre-purchase promo figure — ' + priceOf('indie'));
  ok(/100/.test(priceOf('indie')) && card('indie').querySelector('.pl-upgrade'), 'it is re-quoted for the plan now held, with the upgrade credit said — ' + priceOf('indie'));
  eq(host.querySelector('#plPromoCode').value, 'STUDENT50', 'the typed code stays in the box');

  // billing moving by itself (a sign-in, the webhook) re-quotes too
  st = FREE; draw();
  await tick(20);
  ok(/399\.50/.test(priceOf('indie')), 'back on a free account the code is quoted without credit — ' + priceOf('indie'));
  st = HELD; draw();
  ok(!card('indie').classList.contains('has-promo') || !/399\.50/.test(priceOf('indie')), 'the stale quote is not drawn once billing moves');
  await tick(20);
  ok(/100/.test(priceOf('indie')), 'and the code is quoted again for the new billing — ' + priceOf('indie'));
}

/* ---- QA r2 (26 Oct 2026): account & business ---- */
{
  /* The buyer's invoices: memberInvoicePanel() is handed billing_status(),
     which carries no `deployed` key (that is the gate's studio_status).
     It used to require one, so my_invoices was never asked. */
  const { memberInvoicePanel } = await import('../src/ui/invoice-panels.js');
  let asked = 0;
  answers.my_invoices = () => { asked++; return [{ id: 'i1', number: 'FMS/2026-27/000001', issued_at: '2026-10-20T10:00:00Z', plan_name: 'Basic', amount_paise: 299900, currency: 'INR' }]; };
  const BST = { plan: 'starter', entitled: true, payments: [{ status: 'paid', plan_id: 'starter' }] };   // billing_status(): no `deployed`
  let panel = memberInvoicePanel(BST, { rerender: () => {} });
  await tick(5);
  ok(asked === 1, 'a buyer\'s billing_status() reply asks my_invoices (asked ' + asked + ')');
  panel = memberInvoicePanel(BST, { rerender: () => {} });
  ok(panel && /Invoices/.test(panel.textContent) && panel.querySelector('[data-action="invoice-pdf"]'), 'and the Invoices panel is drawn with a DOWNLOAD PDF button');

  /* A member who never had a trial is offered it on the page Settings
     points to (purchase.html), not only told to choose a plan. */
  const never = { plan: 'free', entitled: false, purchase_required: true, trial_enabled: true, trial_used: false, trial_active: false, payments: [] };
  const IM = await import('../src/lib/invite-model.js');
  const kind = (x) => PM.trialStatus(x, () => Date.now(), !!IM.trialOfferFrom(x)).kind;
  eq(kind(never), 'fresh', 'never had a trial: the purchase page offers it');
  eq(kind({ ...never, trial_used: true }), 'over', 'a used trial is over');
  eq(kind({ ...never, payments: [{ status: 'refunded' }] }), 'over', 'a refunded buyer is not offered a trial');

  /* invite.html's deck for a walled member does not say "You are in". */
  const deck = IM.deckFor({ configured: true, signedIn: true, state: 'open', walled: true, trialHere: true });
  ok(!/You are in/.test(deck) && /trial/.test(deck) && /Sync is off/.test(deck), 'a walled member\'s deck says they are not in yet — ' + deck);
  eq(IM.deckFor({ configured: true, signedIn: true, state: 'open' }), 'You are in. Your projects sync to this account.', 'an entitled member is still told they are in');

  /* The fine print names all three refund exceptions (refund.html §4). */
  st = FREE; draw();
  ok(/where Indian law requires it/.test(host.querySelector('.pl-promise').textContent), 'the card fine print names the legal exception too');

  /* The raw browser words never reach a reader. */
  const G = await import('../src/lib/gate.js');
  eq(G.errorSentence({ message: 'TypeError: Failed to fetch' }, 'x'), 'The studio could not reach its server. Check the connection and try again.', 'a dropped connection is one sentence');
  ok(!/non-2xx/.test(G.errorSentence({ message: 'Edge Function returned a non-2xx status code' }, 'The payment service answered with an error.')), 'supabase-js\'s non-2xx wording is not shown');
  const AA = await import('../src/lib/admin-api.js');
  ok(!/TypeError/.test(AA.reasonOf('admin_usage', { message: 'TypeError: Failed to fetch' })) && !/TypeError/.test(AA.describeError({ message: 'TypeError: Failed to fetch' }, 'x')), 'the console\'s slot and RPC errors say it too');
  answers['rzp-order'] = { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => { throw new Error('not JSON'); } } } };
  let berr = null;
  try { await Billing.buy('starter', 'year', {}); } catch (e) { berr = e; }
  ok(berr && !/non-2xx/.test(berr.message), 'a 502 with an HTML body from rzp-order is said as a sentence — ' + (berr && berr.message));
}

console.log(`${fail ? '✗' : '✓'} billing (client): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
