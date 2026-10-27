/* ============================================================
   A FAKE SUPABASE PROJECT implementing schema sections 13 and 14
   ------------------------------------------------------------
   Shared by scripts/prove-gate.mjs and scripts/prove-extension.mjs.
   An in-memory database (codes, hashed tickets, members, the 90-second
   lock, screening passes, a project with data) behind a Playwright
   route handler for the project's origin. `F.db` is the live state;
   `F.reset()` starts a scenario clean.

   SECTIONS 58 AND 59 are in here too: bump_event (one argument or two),
   admin_funnel / admin_funnel_by_source over F.db.events, and the
   testimonial RPCs over F.db.testimonials (an author's own, the owner's
   approval, the public list of approved and unrevoked ones).

   SECTION 30 (the trial, and the price rise that fires itself) is in
   here too, and it is DRIVEN THE SAME WAY EVERYTHING ELSE IS: a proof
   reaches into `F.db` and says what it wants to be true. The knobs:

     F.db.settings.trial_enabled / trial_minutes / code_trial_days /
                   trial_scope / trial_plan / price_rises_after_buyers
     F.db.plans[n].next_price_paise / next_price_at   (the scheduled rise)
     setTrial(uid, {...})  expireTrial(uid)  clearTrial(uid)

   SECTION 61, THE LAUNCH PASS, is in here too and driven the same way:
     F.db.settings.pass_enabled / pass_paise / pass_days / pass_plan /
                   pass_ends_at / pass_cap      (off by default, as live)
   trial_offer() and price_notice() carry the public `pass` block;
   rzp-order takes period 'pass' (refusing 'disabled' | 'closed' |
   'inr_only' | 'used' | 'has_plan' | 'code' as 400 { error, reason }); activation applies
   the pass plan for pass_days with plan_period 'pass'; billing_status()
   adds pass_used / pass_active / plan_period; start_trial() refuses a
   signup trial with reason 'pass' while the pass is enabled; and
   admin_pass_status / admin_set_pass are owner or finance only. A pass
   is kept out of paid_buyers(), the referral code and payout, the §34
   refund trial, and the §52 year credit.

   SECTION 62, AUTO-RENEW, is in here too:
     F.db.settings.pass_mode / plan_mode ('once' default, as live)
     F.db.noRenewSchema = true   a database without §62 (no modes, no
                                 autopay key, the RPCs PGRST202)
   trial_offer() / price_notice() carry pass.mode and plan_mode;
   billing_status() carries `autopay`; rzp-subscribe makes a
   subscription (refusing 'renew_off' | 'subscribed' | quote_pass's and
   'downgrade' as 400 { error, reason }); rzp-verify takes a subscription
   reply, checks HMAC(payment|subscription) and answers 200 { ok,
   pending } — the "webhook" (chargeSubscription, after RZP.subDelay ms,
   or never with RZP.subWebhook = 'off') applies the charge. A proof
   triggers a RENEWAL with chargeSubscription(id): a pass stacks its days
   from plan_until, a year stacks a year, and a cancelled one charges
   nothing. rzp-cancel cancels at the period's end (the user's own; an
   admin by subscription_id); admin_billing_modes /
   admin_set_billing_modes / admin_list_subscriptions are owner or
   finance only.

   setTrial/expireTrial/clearTrial are exported for the same reason
   webhookRefundProcessed() is: "this person is mid-trial" and "this
   person's thirty minutes are up" are the two states every paywall
   assertion needs, and spelling them out of member-row fields at each
   call site is how two proofs end up disagreeing about what expired
   means.

   THE GRANDFATHER BACKFILL IS THE DEFAULT, exactly as 30.3's UPDATE
   makes it live: a member row with no trial_started_at reads back as a
   year-long 'full' trial begun when the database was created. That is
   not a convenience for the proofs — it is the behaviour, and it is
   what keeps every pre-section-30 scenario (a member on Free seeing the
   hub) green without a line of editing. A proof that wants a REAL
   thirty-minute trial says so with setTrial().
   ============================================================ */
import { createHash, createHmac } from 'node:crypto';
import { promoPrice, normalisePromo } from '../supabase/functions/_shared/razorpay.js';

export const SB = 'https://conhlrulxfwkhsnymakz.supabase.co';
export const REF = 'conhlrulxfwkhsnymakz';
export const F = { db: null, reset() { F.db = freshDb(); return F.db; } };
/* EXTENSION POINTS for lanes that add RPCs / edge functions without
   editing this file's switch (see scripts/fake-admin-rpcs.mjs):
     EXT_RPC[name] = (args, user, { isAdmin }) => data      (throw {code, message, status?} to refuse)
     EXT_FN[name]  = (body, user) => [status, jsonBody]      (/functions/v1/<name>)
   An EXT_RPC entry wins over a `case` of the same name. */
export const EXT_RPC = {};
export const EXT_FN = {};

/* ---- section 16: the fake Razorpay ---------------------------------
   The key secret the fake "edge functions" verify with, and the mode
   the Checkout stub reads ('pay' | 'dismiss' | 'tamper'). signFor()
   is what Razorpay does: HMAC-SHA256(order|payment, KEY_SECRET). */
export const RZP = { keyId: 'rzp_test_fake', secret: 'fake_key_secret_123', mode: 'pay', refundMode: 'pending', capture: 'captured', subDelay: 300, subWebhook: 'on' };   // refundMode: 'pending' | 'processed' | 'fail'
// capture: what GET /v1/payments/{id} says when rzp-verify reads the payment back (§51) —
//   'captured' (auto-capture), 'authorized' (manual capture; rzp-verify captures it),
//   'held' (authorized and the capture does not go through: no plan, 202 pending)
export const signFor = async (order, payment) => createHmac('sha256', RZP.secret).update(`${order}|${payment}`).digest('hex');
const PLAN_RANK = { free: 0, starter: 1, indie: 2, pro: 3 };
/* Section 52: a plan is a YEAR. applyPlan() stacks 365 days onto the time
   left on the same plan; a grant (days 0) is still for good, and
   accountPlan() has always read a null plan_until as "no end". */
function accountPlan(a) { return !a || a.plan === 'free' ? 'free' : (!a.plan_until || Date.parse(a.plan_until) > Date.now()) ? a.plan : 'free'; }
function userPlan(uid) {
  const owned = F.db.accounts.filter((a) => a.owner_id === uid);
  return owned.map(accountPlan).sort((x, y) => PLAN_RANK[y] - PLAN_RANK[x])[0] || 'free';
}
/* section 32: while purchases are not required, user_limits() is {} —
   the P0402 triggers stand down — and billing_status() is entitled with
   the top paid plan's features. */
export const purchasesRequired = () => F.db.settings.purchase_required !== false;
/* section 33: email_grant_active() — an applied, unexpired, PLAN-LESS
   grant on a membership that is not disabled. Uncapped and entitled
   while it stands; revoke (the row deleted) or `until` passing ends it. */
function grantActive(uid) {
  if (!uid) return false;
  const m = F.db.members.get(uid);
  if (!m || m.disabled_at) return false;
  for (const g of F.db.emailGrants.values()) {
    if (g.applied_user === uid && !g.plan && (!g.until || Date.parse(g.until) > Date.now())) return true;
  }
  return false;
}
const grantedNow = (uid) => userPlan(uid) === 'free' && grantActive(uid);
function userLimits(uid) {
  if (!purchasesRequired() || grantedNow(uid)) return {};
  return (F.db.plans.find((p) => p.id === userPlan(uid)) || {}).limits || {};
}
function openFeatures() {
  const top = F.db.plans.filter((p) => p.id !== 'free').sort((a, b) => (PLAN_RANK[b.id] ?? 0) - (PLAN_RANK[a.id] ?? 0))[0];
  return (top && top.features) || {};
}
function cap(lim, k) { return Number.isInteger(lim[k]) ? lim[k] : null; }

/* ---- section 30: the trial -----------------------------------------
   The trial lives on the studio_members row, which here is the value in
   F.db.members — so the fields hang off the same object the gate reads.

   trialOf() is public.trial_ends_at() plus the 30.3 backfill folded
   together: a member whose row carries no trial_started_at IS a
   grandfathered member, and gets the year at full scope rather than
   being locked out of a studio they were invited into. */
const GRANDFATHER = { minutes: 525600, source: 'admin', scope: 'full' };
function trialOf(uid) {
  const m = uid && F.db.members.get(uid);
  if (!m) return null;                                  // not a member: no row, no trial
  /* THE KEY'S ABSENCE IS THE GRANDFATHER, ITS NULL IS "NEVER TOOK ONE".
     A row written the old way — `{ role, disabled_at }`, which is how
     every proof before section 30 makes a member — has no
     trial_started_at key at all and reads as backfilled. clearTrial()
     writes the key as null, which is the row redeem_invite leaves
     behind before start_trial() has run. */
  if (!('trial_started_at' in m)) {
    return { startedAt: F.db.bornAt, minutes: GRANDFATHER.minutes, source: GRANDFATHER.source, scope: GRANDFATHER.scope,
             ends: F.db.bornAt + GRANDFATHER.minutes * 60000 };
  }
  if (!m.trial_started_at) return null;
  const started = Date.parse(m.trial_started_at);
  const minutes = Number.isInteger(m.trial_minutes) ? m.trial_minutes : F.db.settings.trial_minutes;
  return { startedAt: started, minutes, source: m.trial_source || 'signup', scope: m.trial_scope || 'sample', ends: started + minutes * 60000 };
}
function trialActive(uid) {
  const t = trialOf(uid);
  const m = uid && F.db.members.get(uid);
  return !!(t && F.db.settings.trial_enabled && m && !m.disabled_at && t.ends > Date.now());
}
function isEntitled(uid) { return !!uid && (!purchasesRequired() || userPlan(uid) !== 'free' || trialActive(uid) || grantedNow(uid)); }

/** "This person is mid-trial." Minutes and scope default to what
 *  signing up buys; startedAt is a ms epoch so a proof can place the
 *  trial in the past without a clock. */
export function setTrial(uid, { minutes = 30, source = 'signup', scope = 'sample', startedAt = Date.now(), role = 'user' } = {}) {
  const cur = F.db.members.get(uid) || { role, disabled_at: null };
  const row = { ...cur, trial_started_at: new Date(startedAt).toISOString(), trial_minutes: minutes, trial_source: source, trial_scope: scope };
  F.db.members.set(uid, row);
  return row;
}
/** "Their thirty minutes are up." Keeps trial_used true, which is what
 *  separates an expired trial from one never taken. */
export function expireTrial(uid, opts = {}) {
  const minutes = opts.minutes ?? 30;
  return setTrial(uid, { ...opts, minutes, startedAt: Date.now() - (minutes + 5) * 60000 });
}
/** "They have never had one" — a member row with the trial columns
 *  null, which is NOT the same as the grandfather default above. */
export function clearTrial(uid) {
  const cur = F.db.members.get(uid);
  if (!cur) return null;
  const row = { ...cur, trial_started_at: null, trial_minutes: null, trial_source: null, trial_scope: null };
  F.db.members.set(uid, row);
  return row;
}

/* ---- section 30: the price rise ------------------------------------
   paid_buyers() and effective_price(), which is THE ONLY PRICER on this
   side too — quoteOrder() and rzp-order both read it, so a proof that
   moves next_price_at into the past sees the new figure everywhere at
   once, the way the database arranges it. */
export function paidBuyers() {
  return new Set(F.db.payments.filter((p) => p.status === 'paid' && p.amount_paise > 0 && p.period !== 'pass').map((p) => p.user_id)).size;
}
/* ---- section 61: the launch pass ---------------------------------- */
/** pass_sold(): paid (not refunded) pass payments. */
export function passSold() { return F.db.payments.filter((p) => p.period === 'pass' && p.status === 'paid' && !p.renewal).length; }   // §62: a renewal is not a pass sold
/** pass_open(): enabled, before the deadline, under the cap. */
export function passOpen() {
  const s = F.db.settings;
  if (!s.pass_enabled) return false;
  if (s.pass_ends_at && Date.parse(s.pass_ends_at) <= Date.now()) return false;
  return s.pass_cap == null || passSold() < s.pass_cap;
}
/** The public block trial_offer() and price_notice() carry. */
export function passBlock() {
  const s = F.db.settings;
  return { open: passOpen(), amount_paise: s.pass_paise, days: s.pass_days, plan: s.pass_plan, ends_at: s.pass_ends_at || null,
    cap: s.pass_cap ?? null, left: s.pass_cap == null ? null : Math.max(0, s.pass_cap - passSold()),
    now: new Date(Date.now() + (F.db.serverSkewMs || 0)).toISOString() };
}
/** A pass this person paid for or had refunded: once per person. */
const passUsedBy = (uid) => F.db.payments.some((p) => p.user_id === uid && p.period === 'pass' && (p.status === 'paid' || p.status === 'refunded'));
/** quote_pass(): the refusals, each with its hint, then the price. */
export function quotePass(user, currency = 'INR') {
  const s = F.db.settings;
  const no = (hint, message) => { throw Object.assign(new Error(message), { code: '22023', hint }); };
  if (!s.pass_enabled) no('disabled', 'The launch pass is not on sale.');
  if (!passOpen()) no('closed', 'The launch offer has ended.');
  if (currency !== 'INR') no('inr_only', 'The launch pass is sold in rupees only.');
  if (user && passUsedBy(user.id)) no('used', 'You have already had the launch pass.');
  if (user) {
    const held = F.db.accounts.filter((a) => a.owner_id === user.id).some((a) => accountPlan(a) !== 'free' && a.plan_period !== 'pass');
    if (held) no('has_plan', 'You already have a plan.');
  }
  return { plan_id: s.pass_plan, period: 'pass', days: s.pass_days, amount_paise: s.pass_paise, list_paise: s.pass_paise, discount_paise: 0, credit_paise: 0, code: null, ok: true };
}
export function effectivePrice(planId) {
  const p = F.db.plans.find((x) => x.id === planId);
  if (!p) return null;
  if (p.next_price_paise == null) return p.price_paise;
  if (p.next_price_at && Date.parse(p.next_price_at) <= Date.now()) return p.next_price_paise;
  const capN = F.db.settings.price_rises_after_buyers;
  if (capN != null && paidBuyers() >= capN) return p.next_price_paise;
  return p.price_paise;
}
function accountForBuyer(uid) {
  let a = F.db.accounts.filter((x) => x.owner_id === uid).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))[0];
  if (a) return a;
  const u = Object.values(USERS).find((x) => x.id === uid);
  a = { id: 'acc_' + uid.slice(-4), name: ((u && u.name) || (u && u.email.split('@')[0]) || 'My') + "'s Studio", owner_id: uid, plan: 'free', seat_limit: 1, created_at: new Date().toISOString() };
  F.db.accounts.push(a);
  F.db.accountMembers.push({ account_id: a.id, invited_email: u ? u.email : '', user_id: uid, role: 'owner', status: 'active' });
  return a;
}
/* public.apply_plan (§52): days <= 0 is for good; otherwise a renewal of
   the plan still running stacks onto its end. Returns the new plan_until. */
function applyPlan(a, plan, days = 0, period = 'year') {
  const lim = (F.db.plans.find((p) => p.id === plan) || {}).limits || {};
  a.seat_limit = Math.max(1, cap(lim, 'seats') ?? 1000);
  if (!(days > 0)) { a.plan = plan; a.plan_period = period === 'grant' ? 'grant' : 'lifetime'; a.plan_until = null; return null; }
  /* §61: a running PASS is never stacked onto — a yearly plan bought on a
     pass starts now and replaces it, and a pass starts now. */
  const running = a.plan === plan && a.plan_period !== 'pass' && period !== 'pass' && a.plan_until && Date.parse(a.plan_until) > Date.now();
  const until = new Date((running ? Date.parse(a.plan_until) : Date.now()) + days * DAY).toISOString();
  a.plan = plan; a.plan_period = period === 'grant' ? 'grant' : period === 'pass' ? 'pass' : 'year'; a.plan_until = until;
  return until;
}
/* What the account HOLDS for ranking a purchase: a running pass is no plan. */
const heldPlan = (a) => (a && a.plan_period === 'pass' ? 'free' : accountPlan(a));
function activate(orderId, paymentId, raw) {
  const pay = F.db.payments.find((x) => x.razorpay_order_id === orderId);
  if (!pay) throw Object.assign(new Error('No payment with that order id'), { code: '22023' });
  if (pay.status === 'paid') return { already: true, pay };
  const a = accountForBuyer(pay.user_id);
  /* §61: a pass is applied for its own days, always (a buyer who paid is
     never refused), with plan_period 'pass'. */
  const isPass = pay.period === 'pass';
  const days = isPass ? (pay.days || F.db.settings.pass_days || 7) : 365;
  // section 52: applied when it is the same plan (a renewal) or a higher one
  const applied = isPass || (PLAN_RANK[pay.plan_id] ?? 0) >= (PLAN_RANK[heldPlan(a)] ?? 0);
  const until = applied ? applyPlan(a, pay.plan_id, days, isPass ? 'pass' : 'year') : null;
  Object.assign(pay, { status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString(), account_id: a.id, period: isPass ? 'pass' : 'year', plan_applied: applied,
    starts_at: until ? new Date(Date.parse(until) - days * DAY).toISOString() : null, ends_at: until, raw });
  // section 20: a code is spent at activation, once
  if (pay.promo_code) { const c = F.db.promos.find((x) => x.code === pay.promo_code); if (c) c.uses++; }
  afterPaid(pay);
  if (!F.db.members.has(pay.user_id)) F.db.members.set(pay.user_id, { role: 'user', disabled_at: null });
  return { already: false, pay };
}

/* section 32: apply_email_grant() / undo_email_grant(), as the
   database does them — membership, the role, the plan through
   accountForBuyer/applyPlan, and what it changed so revoke undoes it. */
function applyGrant(u) {
  const g = u && F.db.emailGrants.get(String(u.email || '').toLowerCase());
  if (!g || g.applied_user) return false;
  const mem = F.db.members.get(u.id);
  /* A row the grant CREATES is the SQL's `insert (user_id, role)`: the
     trial columns null, i.e. never had a trial — NOT this fake's
     grandfather default (a row with no trial_started_at key), which
     would make a membership-only grant read as a year's trial. */
  F.db.members.set(u.id, { ...(mem || { trial_started_at: null, trial_minutes: null, trial_source: null, trial_scope: null }),
    role: g.role === 'admin' ? 'admin' : (mem ? mem.role : 'user'), disabled_at: null });
  let put = null, acc = null, prior = null;
  if (g.plan) {
    acc = accountForBuyer(u.id);
    prior = { plan: acc.plan, plan_until: acc.plan_until ?? null, plan_period: acc.plan_period ?? null, seat_limit: acc.seat_limit };
    const cur = accountPlan(acc);
    if ((PLAN_RANK[cur] ?? 0) < (PLAN_RANK[g.plan] ?? 0) && !(g.until && cur !== 'free')) {
      put = g.plan; applyPlan(acc, g.plan);
      if (g.until) { acc.plan_until = g.until; acc.plan_period = 'grant'; }
    }
  }
  Object.assign(g, { applied_user: u.id, applied_at: new Date().toISOString(), applied_account: acc ? acc.id : null, applied_plan: put,
    created_member: !mem, prior_role: mem ? mem.role : null, prior });
  return true;
}
function undoGrant(mail) {
  const g = F.db.emailGrants.get(mail);
  if (!g || !g.applied_user) return;
  const a = g.applied_account && F.db.accounts.find((x) => x.id === g.applied_account);
  if (a && g.applied_plan && a.plan === g.applied_plan && g.prior) Object.assign(a, g.prior);
  const m = F.db.members.get(g.applied_user);
  if (m && g.role === 'admin' && g.prior_role !== 'admin' && m.role === 'admin') m.role = 'user';
  if (m && g.created_member && !m.disabled_at) m.disabled_at = new Date().toISOString();
  Object.assign(g, { applied_user: null, applied_at: null, applied_account: null, applied_plan: null, created_member: null, prior_role: null, prior: null });
}

/* section 27: mark_payment_refunded() — idempotent, ends the plan it bought */
function endPlanByRefund(pay) {
  if (pay.status === 'refunded') return;
  pay.status = 'refunded';
  const a = F.db.accounts.find((x) => x.id === pay.account_id);
  if (a && a.plan === pay.plan_id) {
    /* §52: the year this payment bought comes off; other years stay */
    const span = pay.starts_at && pay.ends_at ? Date.parse(pay.ends_at) - Date.parse(pay.starts_at) : 0;
    const left = span > 0 && a.plan_until ? Date.parse(a.plan_until) - span : 0;
    a.plan_until = new Date(left > Date.now() ? left : Date.now() - 1000).toISOString();
  }
  /* section 34: the trigger at commit — no other plan left, so the trial
     restarts now, for the configured length and scope, source 'refund'.
     §61: never for a refunded PASS. */
  if (pay.period !== 'pass' && userPlan(pay.user_id) === 'free') {
    const cur = F.db.members.get(pay.user_id);
    setTrial(pay.user_id, { minutes: F.db.settings.trial_minutes || 30, source: 'refund',
      scope: F.db.settings.trial_scope || 'sample', startedAt: Date.now(), role: (cur && cur.role) || 'user' });
  }
}
/** What the refund.processed WEBHOOK does, for a proof to call: settle the refunds row, end the plan once. */
export function webhookRefundProcessed(paymentRowId) {
  const f = F.db.refunds.find((x) => x.payment_id === paymentRowId && x.status !== 'failed');
  if (f) f.status = 'processed';
  const pay = F.db.payments.find((x) => x.id === paymentRowId);
  if (pay) endPlanByRefund(pay);
}

/* section 20: public.quote_order(), as the database answers it */
const SENTENCE = { unknown: 'That code is not one we know. Check the spelling.', expired: 'That code has expired.', exhausted: 'That code has been used as many times as it allows.',
  not_for_plan: 'That code does not apply to this plan.', inactive: 'That code is not active right now.',
  own_code: 'That is your own referral code — it is for the friends you share it with.', gift: 'That is a gift code. Redeem it under "Have a gift code?" instead.' };

/* section 22: the payer's own referral code, minted on a paid payment;
   the owner of a referral code used is credited (payments_referral_after). */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randCode = (prefix, n) => prefix + Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export function ensureReferralCode(uid) {
  const c = F.db.promos.find((x) => x.kind === 'referral' && x.owner_user_id === uid);
  if (c) return c.code;
  if (!F.db.payments.some((x) => x.user_id === uid && x.status === 'paid' && x.amount_paise > 0 && x.period !== 'pass')) return null;
  let code;
  do { code = randCode('REF-', 6); } while (F.db.promos.some((x) => x.code === code));
  F.db.promos.push({ code, percent_off: F.db.settings.referral_friend_pct, amount_off_paise: null, plan_ids: null, max_uses: null, uses: 0, valid_from: null, valid_until: null,
    active: true, kind: 'referral', owner_user_id: uid, note: 'Referral', created_at: new Date().toISOString() });
  return code;
}
function afterPaid(pay) {
  if (pay.period === 'pass') return;   // §61: no referral code, no payout, for a pass
  if (pay.amount_paise > 0) ensureReferralCode(pay.user_id);
  const c = pay.promo_code && F.db.promos.find((x) => x.code === pay.promo_code);
  if (c && c.kind === 'referral' && c.owner_user_id && c.owner_user_id !== pay.user_id && !F.db.credits.some((r) => r.payment_id === pay.id)) {
    const st = F.db.settings;
    const amt = Number.isInteger(st.referral_reward_pct) ? Math.floor(pay.amount_paise * st.referral_reward_pct / 100) : Math.min(st.referral_reward_paise || 0, pay.amount_paise);
    F.db.credits.push({ id: 'rc' + F.db.credits.length, referrer_user_id: c.owner_user_id, payment_id: pay.id, code: c.code, basis_paise: pay.amount_paise, amount_paise: amt,
      status: 'owed', created_at: new Date().toISOString(), paid_at: null, paid_note: null });
  }
}
/* section 52: the UNUSED part of each paid year of the plan held now */
export function paidCredit(uid) {
  const a = F.db.accounts.find((x) => x.owner_id === uid);
  const now = Date.now();
  return Math.floor(F.db.payments.filter((x) => x.user_id === uid && x.status === 'paid' && x.period === 'year' && x.plan_applied !== false
      && a && x.plan_id === a.plan && x.starts_at && x.ends_at && Date.parse(x.ends_at) > now)
    .reduce((n, x) => {
      const s = Date.parse(x.starts_at), e = Date.parse(x.ends_at);
      return n + (x.amount_paise + (x.credit_paise || 0)) * Math.max(0, Math.min(1, (e - Math.max(now, s)) / (e - s)));
    }, 0));
}
/* ---- section 62: auto-renew --------------------------------------- */
const SUB_LIVE = ['created', 'authenticated', 'active', 'pending', 'halted'];
/** The subscription billing_status() reports: the newest one still
 *  running, or a cancelled one whose paid period has not ended. */
export function subFor(uid) {
  const mine = F.db.subscriptions.filter((x) => x.user_id === uid).slice().reverse();
  return mine.find((x) => SUB_LIVE.includes(x.status)) || mine.find((x) => x.current_end && Date.parse(x.current_end) > Date.now()) || null;
}
const subLiveFor = (uid) => F.db.subscriptions.some((x) => x.user_id === uid && SUB_LIVE.includes(x.status) && !x.cancel_at_period_end);
function autopayOf(uid) {
  const x = subFor(uid);
  if (!x) return null;
  return { status: x.status, product: x.product, period: x.period, amount_minor: x.amount_minor, currency: x.currency, current_end: x.current_end,
    next_charge_at: SUB_LIVE.includes(x.status) && !x.cancel_at_period_end ? x.current_end : null, cancel_at_period_end: !!x.cancel_at_period_end };
}
/** apply_subscription_charge(): idempotent on the payment id. A pass
 *  stacks its days from plan_until (a renewing pass, §62's one change to
 *  §61); a year stacks a year (apply_plan). A cancelled or halted
 *  subscription charges nothing. Returns the payment row, or null. */
export function chargeSubscription(subId, { paymentId = null } = {}) {
  const x = F.db.subscriptions.find((s) => s.id === subId);
  if (!x) return null;
  const pid = paymentId || 'pay_' + Math.random().toString(36).slice(2, 10);
  const had = F.db.payments.find((p) => p.razorpay_payment_id === pid);
  if (had) return had;
  if (x.cancel_at_period_end || !['created', 'authenticated', 'active', 'pending'].includes(x.status)) { F.db.calls.push('sub:charge refused ' + x.status + (x.cancel_at_period_end ? ' cancelled' : '')); return null; }
  const a = accountForBuyer(x.user_id);
  const isPass = x.product === 'pass';
  const plan = isPass ? x.plan_id : x.product;
  let until;
  if (isPass) {
    const running = a.plan === plan && a.plan_period === 'pass' && a.plan_until && Date.parse(a.plan_until) > Date.now();
    until = new Date((running ? Date.parse(a.plan_until) : Date.now()) + x.days * DAY).toISOString();
    applyPlan(a, plan, x.days, 'pass');
    a.plan_until = until;
  } else {
    until = applyPlan(a, plan, 365, 'year');
  }
  const days = isPass ? x.days : 365;
  const pay = { id: 'pay' + F.db.payments.length, user_id: x.user_id, account_id: a.id, plan_id: plan, period: isPass ? 'pass' : 'year', days, amount_paise: x.amount_minor, currency: x.currency,
    list_paise: x.amount_minor, discount_paise: 0, promo_code: null, credit_paise: 0, razorpay_order_id: null, razorpay_payment_id: pid,
    razorpay_subscription_id: x.id, subscription_id: x.id, renewal: (x.charges || 0) > 0, status: 'paid', paid_at: new Date().toISOString(), plan_applied: true,
    starts_at: new Date(Date.parse(until) - days * DAY).toISOString(), ends_at: until, created_at: new Date().toISOString() };
  F.db.payments.push(pay);
  afterPaid(pay);
  if (!F.db.members.has(x.user_id)) F.db.members.set(x.user_id, { role: 'user', disabled_at: null });
  Object.assign(x, { status: 'active', current_start: x.current_start || pay.starts_at, current_end: until, charges: (x.charges || 0) + 1 });
  F.db.calls.push('sub:charge ' + x.product + ' ' + x.amount_minor);
  return pay;
}
const subRow = (x) => ({ id: x.id, user_email: (Object.values(USERS).find((u) => u.id === x.user_id) || {}).email || '', product: x.product, period: x.period, days: x.days,
  amount_minor: x.amount_minor, currency: x.currency, status: x.status, current_end: x.current_end, cancel_at_period_end: !!x.cancel_at_period_end, created_at: x.created_at });

/* section 21: public.quote_for(user, plan, code). `user` null = signed out. */
export function quoteOrder(planId, rawCode, user = null) {
  const pl = F.db.plans.find((p) => p.id === planId && p.active);
  /* section 30: the price is effective_price(), never plans.price_paise,
     in all three places the database replaced it — the "not for sale"
     guard, the amount due and the floor. */
  const price = pl ? effectivePrice(pl.id) : null;
  if (!pl || !(price > 0)) throw Object.assign(new Error('That plan is not for sale'), { code: '22023' });
  let credit = 0, cur = 'free', renewal = false, curUntil = null;
  if (user) {
    /* §61: a running pass is "no plan" — no renewal, no credit, no downgrade refusal */
    cur = F.db.accounts.filter((a) => a.owner_id === user.id).map(heldPlan).sort((x, y) => PLAN_RANK[y] - PLAN_RANK[x])[0] || 'free';
    if (cur !== 'free') {
      const held = F.db.accounts.find((a) => a.owner_id === user.id && accountPlan(a) === cur);
      curUntil = held ? held.plan_until ?? null : null;
      const curName = (F.db.plans.find((p) => p.id === cur) || {}).name || cur;
      if (cur === pl.id) {
        if (!curUntil) throw Object.assign(new Error(`You have ${pl.name} for good. There is nothing to renew.`), { code: '22023', hint: 'same_plan' });
        renewal = true;
      } else if ((PLAN_RANK[pl.id] ?? 0) < (PLAN_RANK[cur] ?? 0)) {
        throw Object.assign(new Error(`Your ${curName} year runs until ${curUntil ? new Date(curUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'its end'}. A lower plan can be bought when it ends.`),
          { code: '22023', hint: 'downgrade' });
      } else credit = paidCredit(user.id);
    }
  }
  let due = price - credit;
  if (due < 100) due = Math.min(price, 100);
  const code = normalisePromo(rawCode) || null;
  const base = { plan_id: pl.id, list_paise: price, credit_paise: price - due, due_paise: due, amount_paise: due, discount_paise: 0, code, ok: true, reason: null, sentence: null,
    period: 'year', days: 365, renewal, current_until: curUntil,
    upgrade_from: credit > 0 ? cur : null, upgrade_from_name: credit > 0 ? (F.db.plans.find((p) => p.id === cur) || {}).name : null, paid_paise: credit,
    /* Null once the rise has fired, so a card can never advertise a
       change that has already happened (30.8). */
    next_price_paise: price === pl.price_paise ? pl.next_price_paise : null,
    next_price_at: price === pl.price_paise ? pl.next_price_at : null };
  if (!code) return base;
  const c = F.db.promos.find((x) => x.code === code);
  const now = Date.now();
  const reason = !c ? 'unknown' : c.kind === 'gift' ? 'gift' : !c.active || (c.valid_from && Date.parse(c.valid_from) > now) ? 'inactive'
    : c.valid_until && Date.parse(c.valid_until) <= now ? 'expired' : Number.isInteger(c.max_uses) && c.uses >= c.max_uses ? 'exhausted'
    : c.plan_ids && !c.plan_ids.includes(pl.id) ? 'not_for_plan' : user && c.owner_user_id === user.id ? 'own_code' : null;
  if (reason) return { ...base, ok: false, reason, sentence: SENTENCE[reason] };
  const amt = promoPrice(due, c.percent_off ?? null, c.amount_off_paise ?? null);
  return { ...base, amount_paise: amt, discount_paise: due - amt, kind: c.kind || 'promo', percent_off: c.percent_off ?? null, amount_off_paise: c.amount_off_paise ?? null };
}

/* ---- section 55: an order in US dollars (docs/US-MARKET-PLAN.md §C) ----
   plan_prices as { <plan>: { amount_minor, next_amount_minor } } for USD,
   and billing_settings.usd_checkout. The dollar price follows the plan's
   one rise date. A dollar quote is the rupee quote's arithmetic at the
   ratio of THAT plan's list prices (paid_credit_minor: no FX rate is ever
   used); an amount-off (rupee) code answers ok:false reason 'currency'. */
export function effectivePriceMinor(planId, currency) {
  if (currency !== 'USD') return effectivePrice(planId);
  const pl = F.db.plans.find((x) => x.id === planId);
  const pp = F.db.planPrices[planId];
  if (!pl || !pp || !(pp.amount_minor > 0)) return null;
  const fired = pl.next_price_paise != null && effectivePrice(planId) !== pl.price_paise;
  return fired && pp.next_amount_minor ? pp.next_amount_minor : pp.amount_minor;
}
export function quoteOrderIn(planId, rawCode, user = null, currency = 'INR') {
  const q = quoteOrder(planId, rawCode, user);
  const mirror = (o, cur) => ({ ...o, currency: cur, list_minor: o.list_paise, credit_minor: o.credit_paise, due_minor: o.due_paise, amount_minor: o.amount_paise, discount_minor: o.discount_paise });
  if (currency !== 'USD') return mirror(q, 'INR');
  if (!F.db.settings.usd_checkout) throw Object.assign(new Error('Checkout in US dollars is not open yet. You can pay in rupees.'), { code: '22023', hint: 'currency_closed' });
  const usd = effectivePriceMinor(planId, 'USD');
  if (!(usd >= 100)) throw Object.assign(new Error('That plan is not sold in US dollars at the moment. You can pay in rupees.'), { code: '22023', hint: 'currency' });
  const r = usd / q.list_paise;
  const credit = Math.round(q.credit_paise * r);
  let due = usd - credit; if (due < 100) due = Math.min(usd, 100);
  const c = q.code && F.db.promos.find((x) => x.code === q.code);
  const base = { ...q, list_paise: usd, credit_paise: usd - due, due_paise: due, amount_paise: due, discount_paise: 0, paid_paise: credit };
  if (q.ok && c && c.amount_off_paise != null) return mirror({ ...base, ok: false, reason: 'currency', sentence: 'This code takes a rupee amount off, so it works only when you pay in rupees.' }, 'USD');
  if (q.ok && c && c.percent_off != null) { const amt = Math.max(100, Math.round(due * (100 - c.percent_off) / 100)); return mirror({ ...base, amount_paise: amt, discount_paise: due - amt }, 'USD'); }
  return mirror({ ...base, ok: q.ok, reason: q.reason, sentence: q.sentence }, 'USD');
}

export const USERS = {
  'tok-admin': { id: '00000000-0000-4000-8000-00000000000a', email: 'admin@example.com' },
  'tok-amy':   { id: '00000000-0000-4000-8000-0000000000a1', email: 'amy@example.com' },
  'tok-ben':   { id: '00000000-0000-4000-8000-0000000000b1', email: 'ben@example.com' },
  // Section 14: Cal asks and is approved; Dan asks and is declined.
  'tok-cal':   { id: '00000000-0000-4000-8000-0000000000c1', email: 'cal@example.com', name: 'Cal Fernandes' },
  'tok-dan':   { id: '00000000-0000-4000-8000-0000000000d1', email: 'dan@example.com' }
};
const DAY = 86400e3;
const sha = (s) => createHash('sha256').update(s).digest('hex');
export function freshDb() {
  const now = Date.now();
  return {
    deployed: true,
    /* When this database came into being, which is when section 30's
       backfill ran: a member row with no trial of its own dates from
       here. See trialOf(). */
    bornAt: now,
    codes: [
      { id: 'c1', code: 'AMYCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Amy', created_at: new Date(now).toISOString() },
      { id: 'c2', code: 'BENCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Ben', created_at: new Date(now).toISOString() },
      { id: 'c4', code: 'LINKCODE2345', pass_type: 'standard', target_project_id: null, max_redemptions: 50, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Crew link', created_at: new Date(now).toISOString() },
      { id: 'c3', code: 'PASSCODE2345', pass_type: 'screening_pass', target_project_id: 'p1', max_redemptions: 50, redemptions_count: 0, expires_at: new Date(now + 2 * 3600e3).toISOString(), revoked_at: null, label: 'Investor', created_at: new Date(now).toISOString() }
    ],
    tickets: new Map(),
    members: new Map([[USERS['tok-admin'].id, { role: 'admin', disabled_at: null }]]),
    sessions: new Map(),
    requests: new Map(),   // section 14: user_id -> invite_requests row
    redemptions: [],
    projects: [{ id: 'p1', title: 'Dragon', format: 'feature', owner_id: USERS['tok-admin'].id, account_id: 'acc1', created_at: new Date(now - 5 * DAY).toISOString(), updated_at: new Date(now - DAY).toISOString() }],
    // section 15: one organisation, owned by the admin, with Amy invited
    accounts: [{ id: 'acc1', name: 'Dragon Pictures', owner_id: USERS['tok-admin'].id, plan: 'indie', seat_limit: 5, created_at: new Date(now - 10 * DAY).toISOString() }],
    accountMembers: [
      { account_id: 'acc1', invited_email: 'admin@example.com', user_id: USERS['tok-admin'].id, role: 'owner', status: 'active' },
      { account_id: 'acc1', invited_email: 'amy@example.com', user_id: null, role: 'member', status: 'pending' }
    ],
    data: { p1: {
      story: { source: 'A student is turned down for a college seat. He becomes somebody else.', framework: 'three_act',
               marks: [{ id: 'm', start: 0, end: 43, text: 'A student is turned down for a college seat', tags: { three_act: 'inciting' } }], tension: {} },
      feature: { s2_log_final: 'A young man living on a forged degree is recognised.', s4_name: 'RAGAVAN', s4_want: 'Status.' },
      scenes: { scenes: [{ id: 's1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'College', synopsis: 'The rejection.', eighths: 8, elements: {} }] },
      contacts: { contacts: [{ name: 'SECRET PHONE 98400' }] }
    } },
    /* section 16, and section 30's two columns on every row:
       next_price_paise / next_price_at, null until a proof (or the
       console, through admin_set_next_price) schedules a rise. */
    plans: [
      /* section 38: the row stays (it is what user_plan() answers for
         somebody who has bought nothing) and its OFFER is withdrawn, so
         price_notice() drops it exactly as the live feed now does. */
      { id: 'free',    name: 'No plan', blurb: 'What an account has before it buys one. Not for sale.', features: { sample_only: true, new_projects: false }, price_paise: 0, monthly_paise: 0, yearly_paise: 0, next_price_paise: null, next_price_at: null, limits: { projects: 1, collaborators: 0, shares: 0, seats: 1, extension: false }, sort: 0, active: false },
      { id: 'starter', name: 'Basic', blurb: 'One writer, a few films, a couple of readers.', features: {}, price_paise: 299900, monthly_paise: 29900, yearly_paise: 299900, next_price_paise: null, next_price_at: null, limits: { projects: 3, collaborators: 2, shares: 3, seats: 1, extension: true }, sort: 1, active: true },
      { id: 'indie',   name: 'Intermediate', blurb: 'A small team taking a film through production.', features: {}, price_paise: 799900, monthly_paise: 79900, yearly_paise: 799900, next_price_paise: null, next_price_at: null, limits: { projects: 10, collaborators: 5, shares: 10, seats: 3, extension: true }, sort: 2, active: true },
      { id: 'pro',     name: 'Pro',     blurb: 'A production house. No caps.', features: {}, price_paise: 1999900, monthly_paise: 199900, yearly_paise: 1999900, next_price_paise: null, next_price_at: null, limits: { projects: null, collaborators: null, shares: null, seats: 10, extension: true }, sort: 3, active: true }
    ],
    payments: [],
    subscriptions: [],
    // section 20: one live launch code; the proof adds and refuses others
    promos: [{ code: 'LAUNCH10', percent_off: 10, amount_off_paise: null, plan_ids: null, max_uses: null, uses: 0, valid_from: null, valid_until: null, active: true, note: 'launch week', created_at: new Date(now).toISOString() }],
    // section 22, and section 30's knobs (30.1). The seeded figures are
    // the schema's defaults, not the console's: a proof that wants the
    // trial off, or longer, says so.
    settings: { referral_friend_pct: 10, referral_reward_pct: 10, referral_reward_paise: null,
                trial_enabled: true, trial_minutes: 30, code_trial_days: 7, trial_scope: 'sample',
                trial_plan: null, price_rises_after_buyers: null,
                /* section 32. The LIVE default is false (the studio is
                   free). The fake defaults to TRUE because every proof
                   written before §32 asserts the switched-on studio —
                   the wall, the sample-only hub, the P0402 cap — and a
                   proof about the free studio says so by setting false.
                   `delete F.db.settings.purchase_required` is a database
                   that has not run §32: billing_status() then carries
                   no key at all. */
                purchase_required: true,
                /* section 61: the launch pass, off by default (as live) */
                pass_enabled: false, pass_paise: 4900, pass_days: 7, pass_plan: 'pro', pass_ends_at: null, pass_cap: null,
                /* section 62: one-time or auto-renew, one-time by default (as live) */
                pass_mode: 'once', plan_mode: 'once',
                /* section 55: charging in US dollars, off until the owner turns it on */
                usd_checkout: false },
    /* section 31's plan_prices for USD (cents), §31's seed figures; the
       owner replaces them from the console (admin_set_plan_price). */
    planPrices: { starter: { amount_minor: 1900, next_amount_minor: null }, indie: { amount_minor: 2900, next_amount_minor: null }, pro: { amount_minor: 3900, next_amount_minor: null } },
    /* A features map laid OVER whatever billing_status() computes,
       and the answer effective_features() gives while it is set. Null
       (the default) = no override and no effective_features() answer
       (the client then keeps billing_status()'s map, as it does
       against a database without §45). Set by aiScenario(). */
    featureOverrides: null,
    emailGrants: new Map(),   // section 32: email -> grant row
    credits: [],
    // section 27: refunds, customer requests, the switch (off by default), and what the fake Razorpay was asked
    refunds: [], rreqs: [], rrEnabled: false, rzpRefunds: [],
    /* section 58: the daily counters, now per source ('' = none) —
       { day, name, source, count }. bump_event takes one argument or two. */
    events: [],
    /* section 59: testimonials, each { id, author, author_email, quote,
       display_name, role, film, consent_text, consented_at, revoked_at,
       status, approved_by, approved_at, created_at, site_removed_at,
       first_approved_at, author_deleted }. */
    testimonials: [],
    calls: []
  };
}

/* ---- sections 58 and 59, as the browser reaches them --------------- */
const FUNNEL_NAMES = ['landing_view', 'pricing_view', 'invite_request', 'signup', 'signin_done', 'sample_open', 'trial_start', 'plan_view_in_app', 'checkout_start', 'pass_buy', 'purchase'];
const inWindow = (day, from, to) => (!from || day >= from) && (!to || day <= to);
const TM_PUBLIC = (t) => ({ id: t.id, quote: t.quote, display_name: t.display_name, role: t.role, film: t.film, approved_at: t.approved_at });
const tmOwn = (t) => { const { author_email, ...rest } = t; return rest; };

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pgErr = (route, code, message, status = 400) => json(route, status, { code, message, details: null, hint: null });

function rpc(name, args, user, route) {
  F.db.calls.push(name);
  if (!F.db.deployed) return pgErr(route, 'PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
  const isMember = (u) => { const m = u && F.db.members.get(u.id); return !!(m && !m.disabled_at); };
  const isAdmin = (u) => !!u && F.db.members.get(u.id)?.role === 'admin' && !F.db.members.get(u.id)?.disabled_at;
  const valid = (c) => c && !c.revoked_at && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && c.redemptions_count < c.max_redemptions;
  // 14.4: membership arriving by any route closes a pending request.
  const admit = (uid, role = 'user') => {
    const cur = F.db.members.get(uid);
    F.db.members.set(uid, { role: cur ? cur.role : role, disabled_at: null });
    const r = F.db.requests.get(uid);
    if (r && r.status === 'pending') { r.status = 'approved'; r.decided_at = r.decided_at || new Date().toISOString(); }
  };
  const fmtD = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (EXT_RPC[name]) {
    try { return json(route, 200, EXT_RPC[name](args, user, { isAdmin: isAdmin(user) })); }
    catch (e) { return pgErr(route, e.code || 'XX000', e.message || 'error', e.status || 400); }
  }
  switch (name) {
    case 'effective_features': {
      if (!user || !F.db.featureOverrides) return json(route, 200, []);
      let st = null;
      rpc('billing_status', {}, user, { fulfill: (o) => { st = JSON.parse(o.body); } });
      F.db.calls.pop();
      return json(route, 200, (st && st.features) || {});
    }
    case 'billing_status': {
      if (!user) return pgErr(route, '42501', 'Sign in first');
      const pl = userPlan(user.id);
      const acc = F.db.accounts.filter((a) => a.owner_id === user.id).sort((x, y) => PLAN_RANK[accountPlan(y)] - PLAN_RANK[accountPlan(x)])[0] || null;
      const lim = userLimits(user.id);
      const t = trialOf(user.id);
      const tOn = trialActive(user.id);
      /* 30.6. A 'full' scope trial borrows another plan's features; a
         'sample' one uses free's own map, which section 18 already
         seeded as {sample_only, new_projects:false}. */
      let feat = (F.db.plans.find((p) => p.id === pl) || {}).features || {};
      if (tOn && t && t.scope === 'full') feat = (F.db.plans.find((p) => p.id === (F.db.settings.trial_plan || 'indie')) || {}).features || {};
      const gOn = grantedNow(user.id);
      if (!purchasesRequired() || gOn) feat = openFeatures();
      /* The per-scenario features map (aiScenario() below). Null — the
         default — changes nothing, so every proof written before it
         reads exactly what it always read. */
      if (F.db.featureOverrides) feat = { ...feat, ...F.db.featureOverrides };
      return json(route, 200, {
        ...('purchase_required' in F.db.settings ? { purchase_required: purchasesRequired() } : {}),
        plan: pl, plan_name: (F.db.plans.find((p) => p.id === pl) || {}).name, limits: lim,
        features: feat,
        // section 30
        trial_enabled: !!F.db.settings.trial_enabled,
        trial_active: tOn,
        trial_ends_at: t ? new Date(t.ends).toISOString() : null,
        trial_used: !!t,
        trial_source: t ? t.source : null,
        trial_scope: tOn && t ? t.scope : null,
        trial_minutes: F.db.settings.trial_minutes || 30,
        entitled: isEntitled(user.id),
        // section 33. F.db.serverSkewMs moves the server's clock, for the band's skew check.
        trial_hours: Math.round((F.db.settings.trial_minutes || 30) / 60 * 100) / 100,
        server_now: new Date(Date.now() + (F.db.serverSkewMs || 0)).toISOString(),
        granted: gOn,
        account_id: acc ? acc.id : null, account_name: acc ? acc.name : null,
        plan_until: pl !== 'free' && acc ? acc.plan_until : null, bought_plan: acc ? acc.plan : null,
        lapsed: !!(acc && acc.plan !== 'free' && acc.plan_until && Date.parse(acc.plan_until) <= Date.now()),
        disabled: !!F.db.members.get(user.id)?.disabled_at, member: isMember(user),
        // section 61
        plan_period: pl !== 'free' && acc ? (acc.plan_period || null) : null,
        pass_used: passUsedBy(user.id),
        pass_active: !!(acc && acc.plan_period === 'pass' && acc.plan_until && Date.parse(acc.plan_until) > Date.now()),
        // section 62
        ...(F.db.noRenewSchema ? {} : { autopay: autopayOf(user.id) }),
        usage: { projects: F.db.projects.filter((p) => p.owner_id === user.id).length, shares: 0, collaborators: 0,
                 seats: acc ? F.db.accountMembers.filter((m) => m.account_id === acc.id).length : 0 },
        payments: F.db.payments.filter((x) => x.user_id === user.id).slice(-12).reverse()
      });
    }
    /* ---- section 30: the trial and the rise ---- */
    case 'start_trial': {
      /* 30.5. A VERDICT rather than a raise for the ordinary refusals,
         because the sign-in path calls this on every landing: a client
         that has to try/catch to tell "wall" from "studio" gets it
         wrong once. Only the three exceptional cases raise. */
      if (!user) return pgErr(route, '42501', 'Sign in first');
      const m = F.db.members.get(user.id);
      if (m && m.disabled_at) return pgErr(route, '42501', 'This account has been disabled.');
      const req = F.db.requests.get(user.id);
      if (req && req.status === 'declined') return pgErr(route, '42501', 'This account was not approved.');
      if (!F.db.settings.trial_enabled) return json(route, 200, { started: false, reason: 'disabled' });
      if (trialOf(user.id)) return json(route, 200, { started: false, reason: 'used' });
      // paid_at, not status='paid': a grant counts, and a refund is not a way back to a fresh trial
      if (F.db.payments.some((p) => p.user_id === user.id && p.paid_at)) return json(route, 200, { started: false, reason: 'paid' });
      /* THE SOURCE CANNOT BE FORGED. p_source is honoured only for an
         administrator; for everybody else it is derived from the
         invite code on their row, which only redeem_invite writes. */
      const src = (args.p_source && isAdmin(user)) ? args.p_source : (m && m.invite_code_id ? 'code' : 'signup');
      /* §61: the public's free trial is retired while the launch pass is on */
      if (src === 'signup' && F.db.settings.pass_enabled) return json(route, 200, { started: false, reason: 'pass' });
      const mins = src === 'code' ? (F.db.settings.code_trial_days || 7) * 1440 : (F.db.settings.trial_minutes || 30);
      /* Inserting the row is what admits them (30.5), so the request
         closes too — and admit() REPLACES the row, so it goes first or
         it would wipe the trial that was just written. */
      admit(user.id);
      setTrial(user.id, { minutes: mins, source: src, startedAt: Date.now(),
        /* §60: every trial follows the console's scope (a pressed one was always the sample) */
        scope: F.db.settings.trial_scope || 'sample',
        role: (F.db.members.get(user.id) || {}).role || 'user' });
      accountForBuyer(user.id);
      let status = null;
      rpc('billing_status', {}, user, { fulfill: (o) => { status = JSON.parse(o.body); } });
      F.db.calls.pop();   // the nested read is an implementation detail, not a call the client made
      return json(route, 200, { started: true, status });
    }
    case 'price_notice': {
      /* 30.7. Anon-callable; one narrow fact per plan. The buyer count
         is published ONLY while a rise is still pending — a scarcity
         number with nothing to be scarce about is the thing section 30
         refuses to ship. With p_currency (§31's price_notice(text), as
         §56 restates it): the display figures in that currency,
         `usd_checkout`, and charged_currency 'USD' only when the switch
         is on and every plan on sale has a dollar price. */
      F.db.calls.push('rpc:price_notice' + (args.p_currency ? ' ' + args.p_currency : ''));
      const anyRising = F.db.plans.some((p) => p.next_price_paise != null && effectivePrice(p.id) === p.price_paise);
      const want = args.p_currency ? String(args.p_currency).toUpperCase() : null;
      const usdComplete = F.db.plans.filter((p) => p.active && p.price_paise > 0).every((p) => (effectivePriceMinor(p.id, 'USD') || 0) >= 100);
      const out = {
        seats_total: anyRising ? (F.db.settings.price_rises_after_buyers ?? null) : null,
        seats_taken: anyRising ? paidBuyers() : null,
        plans: [...F.db.plans].filter((p) => p.active).sort((a, b) => a.sort - b.sort).map((p) => {
          const now = effectivePrice(p.id);
          const pending = p.next_price_paise != null && now === p.price_paise;
          const row = { id: p.id, name: p.name, price_paise: now,
            next_price_paise: pending ? p.next_price_paise : null,
            next_price_at: pending ? p.next_price_at : null, rising: pending };
          if (!want) return row;
          const pp = want === 'USD' ? F.db.planPrices[p.id] : null;
          const has = !!(pp && pp.amount_minor > 0);
          return { ...row, display_currency: has ? 'USD' : 'INR', display_minor: has ? effectivePriceMinor(p.id, 'USD') : now,
            display_next_minor: has && pending ? (pp.next_amount_minor || null) : null };
        })
      };
      out.pass = passBlock();   // §61
      if (!F.db.noRenewSchema) { out.pass.mode = F.db.settings.pass_mode; out.plan_mode = F.db.settings.plan_mode; }   // §62
      if (want) Object.assign(out, { currency: want, usd_checkout: !!F.db.settings.usd_checkout,
        charged_currency: want === 'USD' && F.db.settings.usd_checkout && usdComplete ? 'USD' : 'INR' });
      return json(route, 200, out);
    }
    case 'studio_role': {
      if (!isAdmin(user)) return json(route, 200, null);
      return json(route, 200, (F.db.members.get(user.id) || {}).consoleRole || 'owner');
    }
    case 'admin_set_plan_price': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      { const cr = (F.db.members.get(user.id) || {}).consoleRole; if (cr && cr !== 'owner') return pgErr(route, '42501', `Your role (${cr}) cannot do this. It needs the owner role.`); }
      F.db.calls.push(`rpc:admin_set_plan_price ${args.p_plan} ${args.p_currency} ${args.p_amount_minor} ${args.p_next_minor ?? '-'}`);
      const cur = String(args.p_currency || '').toUpperCase();
      if (cur === 'INR') return pgErr(route, '22023', 'The rupee price is set with admin_set_plan() and its rise with admin_set_next_price().');
      const pl = F.db.plans.find((x) => x.id === args.p_plan);
      if (!pl) return pgErr(route, '22023', `No such plan "${args.p_plan}"`);
      const amt = args.p_amount_minor;
      if (!Number.isInteger(amt) || amt < 0) return pgErr(route, '22023', 'A price is a whole number of minor units (cents), and not negative.');
      if (amt >= 1 && amt <= 99) return pgErr(route, '22023', 'A dollar price is charged, and the smallest charge is $1.00 (100 cents). Use 0 for "not sold in dollars".');
      if (amt === 0 && F.db.settings.usd_checkout && pl.active && pl.price_paise > 0) return pgErr(route, '22023', `${pl.name} cannot stop being sold in dollars while checkout in US dollars is on. Turn that switch off first.`);
      const next = args.p_next_minor ?? null;
      if (next != null) {
        if (next <= amt) return pgErr(route, '22023', `The new price (${next}) must be ABOVE the current one (${amt}).`);
        if (!pl.next_price_at) return pgErr(route, '22023', `No rise is scheduled for ${pl.name}. There is ONE date per plan.`);
        if (args.p_at && args.p_at !== pl.next_price_at) return pgErr(route, '22023', 'A currency cannot rise on a date of its own.');
      } else if (args.p_at) return pgErr(route, '22023', 'A date with no new price changes nothing.');
      F.db.planPrices[pl.id] = { amount_minor: amt, next_amount_minor: next };
      return rpc('price_notice', { p_currency: cur }, user, route);
    }
    case 'admin_set_usd_checkout': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      { const cr = (F.db.members.get(user.id) || {}).consoleRole; if (cr && cr !== 'owner') return pgErr(route, '42501', `Your role (${cr}) cannot do this. It needs the owner role.`); }
      F.db.calls.push(`rpc:admin_set_usd_checkout ${args.p_on}`);
      if (typeof args.p_on !== 'boolean') return pgErr(route, '22023', 'On or off?');
      if (args.p_on) {
        const missing = F.db.plans.filter((p) => p.active && p.price_paise > 0 && !((effectivePriceMinor(p.id, 'USD') || 0) >= 100)).map((p) => p.name);
        if (missing.length) return pgErr(route, '22023', `Every plan on sale needs a dollar price of at least $1.00 before dollars can be charged. Missing: ${missing.join(', ')}.`);
      }
      F.db.settings.usd_checkout = args.p_on;
      return rpc('price_notice', { p_currency: 'USD' }, user, route);
    }
    case 'admin_set_next_price': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const p = F.db.plans.find((x) => x.id === args.p_plan);
      if (!p) return pgErr(route, '22023', `No such plan "${args.p_plan}"`);
      if (args.p_paise == null) { p.next_price_paise = null; p.next_price_at = null; return rpc('price_notice', {}, user, route); }
      if (args.p_at == null) return pgErr(route, '22023', 'A price rise needs a date. Without one nothing would ever change and the notice would be untrue.');
      /* A "rise" that is not a rise is the dark pattern this whole
         section exists to avoid, so the database refuses one. */
      if (args.p_paise <= p.price_paise) return pgErr(route, '22023',
        `The new price (${args.p_paise}) must be ABOVE the current one (${p.price_paise}). Telling people a price is about to rise and then not raising it is a prohibited practice, not a marketing choice.`);
      p.next_price_paise = args.p_paise; p.next_price_at = args.p_at;
      return rpc('price_notice', {}, user, route);
    }
    case 'admin_grant_trial': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      if (!Number.isInteger(args.p_minutes) || args.p_minutes < 1 || args.p_minutes > 525600) return pgErr(route, '22023', 'Between 1 minute and a year.');
      setTrial(args.p_user, { minutes: args.p_minutes, source: 'admin', scope: 'full' });
      return json(route, 200, { ok: true, user: args.p_user, minutes: args.p_minutes, note: args.p_note || null });
    }
    case 'admin_set_plan': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const p = F.db.plans.find((x) => x.id === args.p_id);
      if (!p) return pgErr(route, '22023', 'No such plan');
      const patch = args.p_patch || {};
      if (patch.limits) for (const k of Object.keys(patch.limits)) if (!['projects','collaborators','shares','seats','extension'].includes(k)) return pgErr(route, '22023', `Unknown limit "${k}"`);
      if (p.id === 'free' && ((patch.price_paise || 0) > 0 || (patch.monthly_paise || 0) > 0 || (patch.yearly_paise || 0) > 0)) return pgErr(route, '22023', 'The free plan cannot have a price');
      if (patch.name) p.name = String(patch.name).trim().slice(0, 40) || p.name;
      if ('blurb' in patch) p.blurb = String(patch.blurb || '').slice(0, 200);
      if (Number.isInteger(patch.price_paise)) p.price_paise = patch.price_paise;
      if (Number.isInteger(patch.monthly_paise)) p.monthly_paise = patch.monthly_paise;
      if (Number.isInteger(patch.yearly_paise)) p.yearly_paise = patch.yearly_paise;
      if (patch.limits) p.limits = { ...p.limits, ...patch.limits };
      if (patch.features) {
        if (typeof patch.features !== 'object') return pgErr(route, '22023', 'features must be an object');
        for (const k of Object.keys(patch.features)) if (typeof patch.features[k] !== 'boolean') return pgErr(route, '22023', `feature "${k}" must be true or false`);
        p.features = { ...patch.features };
      }
      if (typeof patch.active === 'boolean') p.active = patch.active;
      return json(route, 200, p);
    }
    case 'admin_list_payments': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.payments].reverse().map((x) => ({ ...x, email: (Object.values(USERS).find((u) => u.id === x.user_id) || {}).email,
        account_name: (F.db.accounts.find((a) => a.id === x.account_id) || {}).name })));
    }
    case 'admin_grant_plan': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const a = accountForBuyer(args.p_user);
      const until = applyPlan(a, args.p_plan, Number(args.p_days) || 0, 'grant');   // §52: days honoured; 0 is for good
      F.db.payments.push({ id: 'pay' + F.db.payments.length, user_id: args.p_user, account_id: a.id, plan_id: args.p_plan, period: 'grant', amount_paise: 0,
        status: 'granted', note: args.p_note || null, created_at: new Date().toISOString(), paid_at: new Date().toISOString(), ends_at: until });
      if (!F.db.members.has(args.p_user)) F.db.members.set(args.p_user, { role: 'user', disabled_at: null });
      return json(route, 200, until);
    }
    case 'quote_order': {
      /* §56's 3-arg overload when p_currency is sent; the 2-arg is §21's */
      if ('p_currency' in args) {
        if (F.db.noUsdSchema) return pgErr(route, 'PGRST202', 'Could not find the function public.quote_order(p_code, p_currency, p_plan) in the schema cache');
        F.db.calls.push(`rpc:quote_order ${args.p_plan} ${args.p_currency}`);
        try { return json(route, 200, quoteOrderIn(args.p_plan, args.p_code, user, String(args.p_currency).toUpperCase())); }
        catch (e) { return json(route, 400, { code: e.code || '22023', message: e.message, details: null, hint: e.hint || null }); }
      }
      try { return json(route, 200, quoteOrder(args.p_plan, args.p_code, user)); }
      catch (e) { return json(route, 400, { code: e.code || '22023', message: e.message, details: null, hint: e.hint || null }); }
    }
    case 'admin_list_promo_codes': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.promos].sort((a, b) => (b.active - a.active) || Date.parse(b.created_at) - Date.parse(a.created_at)));
    }
    case 'admin_set_promo_code': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const code = normalisePromo(args.p_code);
      if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) return pgErr(route, '22023', 'A code is 3 to 32 letters, digits or dashes');
      const patch = args.p_patch || {};
      let c = F.db.promos.find((x) => x.code === code);
      if (!c) {
        if ((patch.percent_off == null) === (patch.amount_off_paise == null)) return pgErr(route, '22023', 'A code takes either a percentage (1–100) or an amount off in paise, not both');
        c = { code, percent_off: null, amount_off_paise: null, plan_ids: null, max_uses: null, uses: 0, valid_from: null, valid_until: null, active: true, note: null, created_at: new Date().toISOString() };
        F.db.promos.push(c);
      }
      for (const k of ['percent_off', 'amount_off_paise', 'max_uses', 'valid_from', 'valid_until', 'note']) if (k in patch) c[k] = patch[k];
      // section 23: a commission makes it an affiliate code
      if ('commission_pct' in patch) {
        if (patch.commission_pct != null && !(patch.commission_pct > 0 && patch.commission_pct <= 100)) return pgErr(route, '22023', 'a commission is above 0 and at most 100%');
        c.commission_pct = patch.commission_pct;
        if (c.kind !== 'referral' && c.kind !== 'gift') c.kind = patch.commission_pct != null ? 'affiliate' : 'promo';
      }
      if (!c.kind) c.kind = 'promo';
      if ('plan_ids' in patch) c.plan_ids = Array.isArray(patch.plan_ids) && patch.plan_ids.length ? patch.plan_ids : null;
      if (typeof patch.active === 'boolean') c.active = patch.active;
      return json(route, 200, c);
    }
    /* ---- section 22: referrals ---- */
    case 'my_referral': {
      if (!user) return pgErr(route, '42501', 'Sign in first');
      const code = ensureReferralCode(user.id);
      if (!code) return json(route, 200, { eligible: false, friend_pct: F.db.settings.referral_friend_pct });
      const c = F.db.promos.find((x) => x.code === code);
      const mine = F.db.credits.filter((r) => r.referrer_user_id === user.id);
      const sum = (s) => mine.filter((r) => r.status === s).reduce((n, r) => n + r.amount_paise, 0);
      return json(route, 200, { eligible: true, code, active: c.active, percent_off: c.percent_off, uses: c.uses,
        reward_pct: F.db.settings.referral_reward_pct, reward_paise: F.db.settings.referral_reward_paise, owed_paise: sum('owed'), paid_paise: sum('paid'),
        credits: mine.slice().reverse().map(({ amount_paise, status, created_at, paid_at }) => ({ amount_paise, status, created_at, paid_at })) });
    }
    /* ---- section 32 ---- */
    /* section 33: the landing page's read, anon */
    case 'trial_offer':
      return json(route, 200, { trial_enabled: !!F.db.settings.trial_enabled, trial_minutes: F.db.settings.trial_minutes || 30,
        trial_hours: Math.round((F.db.settings.trial_minutes || 30) / 60 * 100) / 100, purchase_required: purchasesRequired(),
        /* §60 */ trial_scope: F.db.settings.trial_scope || 'sample',
        /* §61 */ ...(F.db.noPassSchema ? {} : { pass: { ...passBlock(), ...(F.db.noRenewSchema ? {} : { mode: F.db.settings.pass_mode }) } }),
        /* §62 */ ...(F.db.noRenewSchema ? {} : { plan_mode: F.db.settings.plan_mode }) });
    /* ---- section 62: the console's modes and subscriptions (owner or finance) ---- */
    case 'admin_billing_modes':
    case 'admin_set_billing_modes':
    case 'admin_list_subscriptions': {
      if (F.db.noRenewSchema) return pgErr(route, 'PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      { const cr = (F.db.members.get(user.id) || {}).consoleRole; if (cr && !['owner', 'finance'].includes(cr)) return pgErr(route, '42501', `Your role (${cr}) cannot do this. It needs the finance role.`); }
      const s = F.db.settings;
      if (name === 'admin_list_subscriptions') {
        const want = args.p_status || null;
        return json(route, 200, F.db.subscriptions.filter((x) => !want || x.status === want).slice().reverse().map(subRow));
      }
      if (name === 'admin_set_billing_modes') {
        F.db.calls.push(`rpc:admin_set_billing_modes ${args.p_pass_mode} ${args.p_plan_mode}`);
        if (!['once', 'renew'].includes(args.p_pass_mode) || !['once', 'renew'].includes(args.p_plan_mode)) return pgErr(route, '22023', 'A mode is once or renew.');
        s.pass_mode = args.p_pass_mode; s.plan_mode = args.p_plan_mode;
      }
      return json(route, 200, { pass_mode: s.pass_mode, plan_mode: s.plan_mode });
    }
    /* ---- section 61: the console's launch pass (owner or finance) ---- */
    case 'admin_pass_status':
    case 'admin_set_pass': {
      if (F.db.noPassSchema) return pgErr(route, 'PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      { const cr = (F.db.members.get(user.id) || {}).consoleRole; if (cr && !['owner', 'finance'].includes(cr)) return pgErr(route, '42501', `Your role (${cr}) cannot do this. It needs the finance role.`); }
      const s = F.db.settings;
      if (name === 'admin_set_pass') {
        F.db.calls.push(`rpc:admin_set_pass ${args.p_enabled} ${args.p_paise} ${args.p_days} ${args.p_plan} ${args.p_ends_at || '-'} ${args.p_cap ?? '-'}`);
        if (!(Number.isInteger(args.p_paise) && args.p_paise >= 100)) return pgErr(route, '22023', 'A pass costs at least ₹1 (100 paise).');
        if (!(Number.isInteger(args.p_days) && args.p_days >= 1 && args.p_days <= 31)) return pgErr(route, '22023', 'A pass lasts 1 to 31 days.');
        if (!F.db.plans.some((p) => p.id === args.p_plan && p.id !== 'free')) return pgErr(route, '22023', `No such plan "${args.p_plan}"`);
        if (args.p_cap != null && !(Number.isInteger(args.p_cap) && args.p_cap >= 1)) return pgErr(route, '22023', 'The cap is a whole number of passes, or none.');
        Object.assign(s, { pass_enabled: !!args.p_enabled, pass_paise: args.p_paise, pass_days: args.p_days, pass_plan: args.p_plan, pass_ends_at: args.p_ends_at || null, pass_cap: args.p_cap ?? null });
      }
      const sold = passSold();
      return json(route, 200, { enabled: !!s.pass_enabled, paise: s.pass_paise, days: s.pass_days, plan: s.pass_plan, ends_at: s.pass_ends_at || null,
        cap: s.pass_cap ?? null, sold, left: s.pass_cap == null ? null : Math.max(0, s.pass_cap - sold), open: passOpen() });
    }
    case 'purchases_required':
      if (!('purchase_required' in F.db.settings)) return pgErr(route, 'PGRST202', 'Could not find the function public.purchases_required in the schema cache', 404);
      return json(route, 200, purchasesRequired());
    case 'admin_grant_email': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const mail = String(args.p_email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return pgErr(route, '22023', 'That does not look like an e-mail address.');
      if (!['member', 'admin'].includes(args.p_role)) return pgErr(route, '22023', 'Access is as a member or as an admin.');
      const pl = args.p_plan && args.p_plan !== 'free' ? args.p_plan : null;
      if (pl && !F.db.plans.some((p) => p.id === pl)) return pgErr(route, '22023', `No such plan "${args.p_plan}"`);
      if (args.p_days != null && !(args.p_days >= 1 && args.p_days <= 3650)) return pgErr(route, '22023', 'A grant lasts 1 to 3650 days, or until you remove it.');
      undoGrant(mail);
      F.db.emailGrants.set(mail, { email: mail, role: args.p_role, plan: pl, until: args.p_days == null ? null : new Date(Date.now() + args.p_days * DAY).toISOString(),
        note: args.p_note || null, created_by: user.id, created_at: new Date().toISOString(), applied_user: null, applied_at: null });
      const u = Object.values(USERS).find((x) => x.email === mail);
      if (u) applyGrant(u);
      const g = F.db.emailGrants.get(mail);
      return json(route, 200, { email: g.email, role: g.role, plan: g.plan, until: g.until, applied: !!g.applied_user, applied_at: g.applied_at, applied_plan: g.applied_plan || null });
    }
    case 'admin_revoke_email_grant': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const mail = String(args.p_email || '').trim().toLowerCase();
      if (!F.db.emailGrants.has(mail)) return pgErr(route, '22023', 'No access was given to that address.');
      undoGrant(mail); F.db.emailGrants.delete(mail);
      return json(route, 200, null);
    }
    case 'admin_list_email_grants': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.emailGrants.values()].reverse().map((g) => ({
        email: g.email, role: g.role, plan: g.plan, plan_name: g.plan ? (F.db.plans.find((p) => p.id === g.plan) || {}).name : null,
        until: g.until, note: g.note, created_at: g.created_at, created_by_email: (Object.values(USERS).find((x) => x.id === g.created_by) || {}).email || null,
        applied: !!g.applied_user, applied_at: g.applied_at, applied_plan: g.applied_plan || null,
        account_exists: Object.values(USERS).some((x) => x.email === g.email) })));
    }
    case 'admin_get_billing_settings':
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, { ...F.db.settings, trial_hours: Math.round((F.db.settings.trial_minutes || 30) / 60 * 100) / 100 });
    case 'admin_set_billing_settings': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const p = args.p_patch || {};
      const unknown = Object.keys(p).find((key) => !(key in F.db.settings));
      if (unknown) return pgErr(route, '22023', 'Unknown setting "' + unknown + '"');
      if ('purchase_required' in p && typeof p.purchase_required !== 'boolean') return pgErr(route, '22023', 'Purchases required is on (true) or off (false).');
      /* Section 30's keys are validated HERE, each with its own
         sentence, which is the trap 30.9 exists to avoid: the old body
         ended in one check_violation handler that talks about referral
         percentages, so a bad trial length would have been reported as
         "A referral pays the friend 1-100% off". The proofs assert the
         sentence does not say 'referral'. */
      if ('trial_minutes' in p && !(Number.isInteger(p.trial_minutes) && p.trial_minutes >= 1 && p.trial_minutes <= 44640))
        return pgErr(route, '22023', 'A trial lasts between 1 minute and 31 days (44640 minutes).');
      if ('code_trial_days' in p && !(Number.isInteger(p.code_trial_days) && p.code_trial_days >= 1 && p.code_trial_days <= 365))
        return pgErr(route, '22023', 'An invite code buys between 1 and 365 days.');
      if ('trial_scope' in p && !['sample', 'full'].includes(p.trial_scope))
        return pgErr(route, '22023', 'A trial shows either the sample alone ("sample") or the whole studio ("full").');
      if ('trial_plan' in p && p.trial_plan != null && !F.db.plans.some((x) => x.id === p.trial_plan))
        return pgErr(route, '22023', `No such plan "${p.trial_plan}"`);
      if ('price_rises_after_buyers' in p && p.price_rises_after_buyers != null && !(p.price_rises_after_buyers >= 1))
        return pgErr(route, '22023', 'A founding-seat cap is at least 1, or null for no cap.');
      if (p.referral_reward_pct != null) { F.db.settings.referral_reward_pct = p.referral_reward_pct; F.db.settings.referral_reward_paise = null; }
      if (p.referral_reward_paise != null) { F.db.settings.referral_reward_paise = p.referral_reward_paise; F.db.settings.referral_reward_pct = null; }
      for (const key of Object.keys(p)) if (!/^referral_reward/.test(key)) F.db.settings[key] = p[key];
      if ('referral_friend_pct' in p) for (const c of F.db.promos) if (c.kind === 'referral') c.percent_off = p.referral_friend_pct;
      return json(route, 200, { ...F.db.settings });
    }
    case 'admin_list_referral_credits': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const em = (id) => (Object.values(USERS).find((u) => u.id === id) || {}).email || null;
      return json(route, 200, F.db.credits.filter((r) => !args.p_status || r.status === args.p_status).map((r) => {
        const pay = F.db.payments.find((x) => x.id === r.payment_id) || {};
        return { ...r, referrer_email: em(r.referrer_user_id), friend_email: em(pay.user_id), plan_id: pay.plan_id };
      }).sort((a, b) => (b.status === 'owed') - (a.status === 'owed')));
    }
    case 'admin_mark_referral_paid': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      let n = 0;
      for (const r of F.db.credits) if ((args.p_ids || []).includes(r.id) && r.status === 'owed') { r.status = 'paid'; r.paid_at = new Date().toISOString(); r.paid_note = args.p_note || null; n++; }
      return json(route, 200, n);
    }
    /* ---- section 23: affiliates, derived from the ledger ---- */
    case 'admin_affiliate_report': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, F.db.promos.filter((c) => c.commission_pct != null).map((c) => {
        const ps = F.db.payments.filter((x) => x.promo_code === c.code);
        const paid = ps.filter((x) => x.status === 'paid');
        const revenue = paid.reduce((n, x) => n + x.amount_paise, 0);
        return { code: c.code, note: c.note, commission_pct: c.commission_pct, active: c.active, percent_off: c.percent_off, amount_off_paise: c.amount_off_paise,
          orders: paid.length, revenue_paise: revenue, discount_paise: paid.reduce((n, x) => n + (x.discount_paise || 0), 0),
          commission_due_paise: Math.floor(revenue * c.commission_pct / 100), refunded: ps.filter((x) => x.status === 'refunded').length,
          last_order_at: paid.map((x) => x.paid_at).sort().pop() || null };
      }));
    }
    case 'admin_affiliate_orders': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const code = normalisePromo(args.p_code);
      return json(route, 200, F.db.payments.filter((x) => x.promo_code === code && (x.status === 'paid' || x.status === 'refunded')).reverse()
        .map((x) => ({ paid_at: x.paid_at, email: (Object.values(USERS).find((u) => u.id === x.user_id) || {}).email || null, plan_id: x.plan_id,
          list_paise: x.list_paise, discount_paise: x.discount_paise, amount_paise: x.amount_paise, status: x.status })));
    }
    case 'admin_billing_overview': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const paid = F.db.payments.filter((x) => x.status === 'paid');
      const by = {}; for (const a of F.db.accounts) { const k = accountPlan(a); by[k] = (by[k] || 0) + 1; }
      /* §56: paid_*_paise are rupees only; the dollar side is in paid_by_currency */
      const inr = paid.filter((x) => (x.currency || 'INR') === 'INR');
      const byCur = Object.fromEntries(['INR', 'USD'].map((c) => { const r = paid.filter((x) => (x.currency || 'INR') === c); const t = r.reduce((n, x) => n + x.amount_paise, 0); return [c, { total_minor: t, d30_minor: t, count: r.length }]; }));
      return json(route, 200, { paid_30d_paise: inr.reduce((n, x) => n + x.amount_paise, 0), paid_total_paise: inr.reduce((n, x) => n + x.amount_paise, 0),
        paid_by_currency: byCur, intl_cards: F.db.payments.filter((x) => ['paid', 'refunded'].includes(x.status) && x.international === true).length,
        payments_30d: paid.length, active_by_plan: by, lapsing_14d: 0, refunds: F.db.payments.filter((x) => x.status === 'refunded').length });
    }
    /* ---- section 27: refund requests ---- */
    case 'refund_requests_enabled': return json(route, 200, !!F.db.rrEnabled);
    case 'admin_set_refund_requests_enabled': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      F.db.rrEnabled = !!args.p_enabled; return json(route, 200, F.db.rrEnabled);
    }
    case 'my_refund_status': {
      if (!user) return pgErr(route, '42501', 'Sign in first');
      const pay = F.db.payments.filter((x) => x.user_id === user.id && x.status === 'paid' && x.amount_paise > 0).sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at)).pop() || null;
      const mine = F.db.rreqs.filter((q) => q.user_id === user.id);
      const q = mine[mine.length - 1] || null;
      const busy = !!pay && (F.db.refunds.some((f) => f.payment_id === pay.id && f.status !== 'failed') || F.db.rreqs.some((r) => r.payment_id === pay.id && (r.status === 'pending' || r.status === 'approved')));
      return json(route, 200, { enabled: F.db.rrEnabled, eligible: F.db.rrEnabled && !!pay, can_request: F.db.rrEnabled && !!pay && !busy,
        payment: pay ? { id: pay.id, plan_id: pay.plan_id, amount_paise: pay.amount_paise, paid_at: pay.paid_at } : null,
        latest: q ? { id: q.id, status: q.status, category: q.category, message: q.message, admin_note: q.admin_note, created_at: q.created_at, decided_at: q.decided_at, payment_id: q.payment_id } : null });
    }
    case 'request_refund': {
      if (!user) return pgErr(route, '42501', 'Sign in first');
      if (!F.db.rrEnabled) return pgErr(route, '42501', 'Refund requests are not open right now. Write to us instead.');
      if (!['duplicate_charge', 'not_delivered', 'legal', 'other'].includes(args.p_category)) return pgErr(route, '22023', 'Choose a reason');
      const pay = F.db.payments.find((x) => x.id === args.p_payment_id);
      if (!pay || pay.user_id !== user.id) return pgErr(route, '42501', 'That is not one of your payments');
      if (pay.status !== 'paid') return pgErr(route, '22023', pay.status === 'refunded' ? 'That payment has already been refunded' : 'Only a payment that went through can be refunded');
      if (F.db.rreqs.some((r) => r.payment_id === pay.id && (r.status === 'pending' || r.status === 'approved'))) return pgErr(route, '22023', 'You already have a request open for that payment');
      const q = { id: 'rq' + F.db.rreqs.length, user_id: user.id, payment_id: pay.id, category: args.p_category, message: String(args.p_message || ''), status: 'pending', admin_note: null, created_at: new Date().toISOString(), decided_at: null };
      F.db.rreqs.push(q); return json(route, 200, q);
    }
    case 'admin_list_refund_requests': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.rreqs].reverse().filter((q) => !args.p_status || q.status === args.p_status).map((q) => {
        const pay = F.db.payments.find((x) => x.id === q.payment_id) || {};
        return { ...q, email: (Object.values(USERS).find((u) => u.id === q.user_id) || {}).email, plan_id: pay.plan_id, amount_paise: pay.amount_paise, razorpay_payment_id: pay.razorpay_payment_id, payment_status: pay.status };
      }));
    }
    case 'admin_decide_refund_request': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const q = F.db.rreqs.find((x) => x.id === args.p_id);
      if (!q) return pgErr(route, '22023', 'No such request');
      if (args.p_decision === 'declined' && !String(args.p_note || '').trim()) return pgErr(route, '22023', 'Say why, in a sentence — the customer will read it');
      if (q.status !== 'pending' && q.status !== 'approved') return pgErr(route, '22023', 'That request was already ' + q.status);
      Object.assign(q, { status: args.p_decision, admin_note: String(args.p_note || '').trim() || null, decided_at: new Date().toISOString() });
      return json(route, 200, q);
    }
    case 'admin_list_refunds': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.refunds].reverse());
    }
    case 'studio_status': {
      if (user) applyGrant(user);   // section 32: the gate's own check claims a pending grant
      const m = user && F.db.members.get(user.id);
      const r = user && F.db.requests.get(user.id);
      const pend = isAdmin(user) ? [...F.db.requests.values()].filter((x) => x.status === 'pending').length : 0;
      return json(route, 200, [{ registered: !!m, role: m ? m.role : '', disabled: !!(m && m.disabled_at),
        request_status: r ? r.status : '', requested_at: r ? r.requested_at : null, decided_at: r ? r.decided_at : null,
        decision_note: r ? r.decision_note : null, pending_requests: pend }]);
    }
    case 'request_invite': {
      if (!user) return pgErr(route, '42501', 'Sign in with Google to request an invite');
      if (isMember(user)) return pgErr(route, '22023', 'This account is already a member');
      const now = new Date().toISOString();
      const note = String(args.p_note || '').trim().slice(0, 1000) || null;
      let r = F.db.requests.get(user.id);
      if (!r) {
        r = { user_id: user.id, email: user.email, display_name: user.name || null, note, user_agent: args.p_user_agent || null,
              status: 'pending', times_asked: 1, requested_at: now, decided_at: null, decided_by: null, decision_note: null };
      } else if (r.status === 'pending') {
        if (note) r.note = note;
      } else if (r.status === 'declined' && Date.now() - Date.parse(r.decided_at) < 7 * DAY) {
        return pgErr(route, '22023', `This request was declined on ${fmtD(r.decided_at)}. You can ask again from ${fmtD(Date.parse(r.decided_at) + 7 * DAY)}.`);
      } else {
        Object.assign(r, { status: 'pending', requested_at: now, times_asked: r.times_asked + 1, decided_at: null, decided_by: null, decision_note: null, note, user_agent: args.p_user_agent || null });
      }
      F.db.requests.set(user.id, r);
      return json(route, 200, [{ status: r.status, requested_at: r.requested_at, decided_at: r.decided_at, decision_note: r.decision_note, times_asked: r.times_asked }]);
    }
    case 'admin_list_requests': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const rows = [...F.db.requests.values()].filter((r) => !args.p_status || r.status === args.p_status)
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || Date.parse(b.requested_at) - Date.parse(a.requested_at))
        .map((r) => ({ ...r, decided_by_email: r.decided_by ? (Object.values(USERS).find((x) => x.id === r.decided_by) || {}).email || null : null }));
      return json(route, 200, rows);
    }
    case 'admin_overview': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const reqs = [...F.db.requests.values()];
      const mem = [...F.db.members.values()];
      const live = [...F.db.sessions.values()].filter((s) => Date.now() - s.last < 90e3).length;
      return json(route, 200, {
        users_total: Object.keys(USERS).length, users_active_7d: Object.keys(USERS).length, users_new_30d: 2,
        members_active: mem.filter((m) => !m.disabled_at).length, members_admin: mem.filter((m) => m.role === 'admin' && !m.disabled_at).length,
        members_disabled: mem.filter((m) => m.disabled_at).length,
        requests_pending: reqs.filter((r) => r.status === 'pending').length, requests_approved: reqs.filter((r) => r.status === 'approved').length,
        requests_declined: reqs.filter((r) => r.status === 'declined').length,
        accounts: F.db.accounts.length, account_members_active: F.db.accountMembers.filter((m) => m.status === 'active').length,
        account_members_pending: F.db.accountMembers.filter((m) => m.status === 'pending').length,
        projects: F.db.projects.length, projects_new_30d: F.db.projects.length, projects_updated_7d: F.db.projects.length,
        collaborators: 0, shares_live: 0, sessions_live: live, sessions_24h: F.db.sessions.size,
        codes_active: F.db.codes.filter(valid).length, generated_at: new Date().toISOString()
      });
    }
    case 'admin_list_accounts': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, F.db.accounts.map((a) => ({
        id: a.id, name: a.name, owner_email: (Object.values(USERS).find((x) => x.id === a.owner_id) || {}).email || null,
        plan: a.plan, seat_limit: a.seat_limit,
        seats_used: F.db.accountMembers.filter((m) => m.account_id === a.id && m.status === 'active').length,
        members_pending: F.db.accountMembers.filter((m) => m.account_id === a.id && m.status === 'pending').length,
        projects: F.db.projects.filter((p) => p.account_id === a.id).length, created_at: a.created_at
      })));
    }
    case 'admin_list_users': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, Object.values(USERS).map((u) => {
        const m = F.db.members.get(u.id), r = F.db.requests.get(u.id), s = F.db.sessions.get(u.id);
        return { user_id: u.id, email: u.email, display_name: u.name || null, created_at: new Date(Date.now() - 3 * DAY).toISOString(),
                 last_sign_in_at: new Date().toISOString(), studio_role: m ? m.role : '', disabled_at: m ? m.disabled_at : null,
                 request_status: r ? r.status : '', projects: F.db.projects.filter((p) => p.owner_id === u.id).length,
                 accounts: F.db.accountMembers.filter((am) => am.user_id === u.id && am.status === 'active').length,
                 last_heartbeat: s ? new Date(s.last).toISOString() : null };
      }));
    }
    case 'admin_decide_request': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const r = F.db.requests.get(args.p_user);
      if (!r) return pgErr(route, '22023', 'No such request');
      if (args.p_approve) admit(args.p_user);
      Object.assign(r, { status: args.p_approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), decided_by: user.id,
                         decision_note: String(args.p_note || '').trim().slice(0, 500) || null });
      return json(route, 200, null);
    }
    case 'verify_invite': {
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      if (c.pass_type !== 'standard') return pgErr(route, '22023', 'That is a screening pass — open it in the screening room');
      const raw = 'ticket-' + Math.random().toString(36).slice(2);
      F.db.tickets.set(sha(raw), { code_id: c.id, expires: Date.now() + 600e3, used: false });
      return json(route, 200, [{ ticket: raw, pass_type: 'standard', expires_at: new Date(Date.now() + 600e3).toISOString() }]);
    }
    case 'redeem_invite': {
      if (!user) return pgErr(route, '42501', 'Sign in with Google to redeem a code');
      if (isMember(user)) return json(route, 200, [{ role: F.db.members.get(user.id).role, invite_code_id: null }]);
      const t = F.db.tickets.get(sha(args.p_ticket || ''));
      if (!t || t.used || t.expires < Date.now()) return pgErr(route, '22023', 'That sign-in took too long or the code was already used — enter the code again');
      const c = F.db.codes.find((x) => x.id === t.code_id);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      c.redemptions_count++; t.used = true;
      admit(user.id);
      F.db.redemptions.push({ id: 'r' + F.db.redemptions.length, code_id: c.id, user_id: user.id, redeemed_at: new Date().toISOString() });
      return json(route, 200, [{ role: 'user', invite_code_id: c.id }]);
    }
    case 'session_acquire': case 'session_takeover': case 'session_ping': case 'session_release': {
      if (!user) return pgErr(route, '42501', 'Not signed in');
      if (name !== 'session_release' && !isMember(user)) return pgErr(route, 'P0401', 'This account has no active invite');
      const cur = F.db.sessions.get(user.id);
      const fresh = cur && Date.now() - cur.last < 90e3;
      if (name === 'session_release') { if (cur && cur.session_id === args.p_session) F.db.sessions.delete(user.id); return json(route, 200, [{ status: 'released' }]); }
      if (name === 'session_acquire' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict', other_last_seen: new Date(cur.last).toISOString(), other_user_agent: cur.ua }]);
      if (name === 'session_ping' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict' }]);
      F.db.sessions.set(user.id, { session_id: args.p_session, last: Date.now(), ua: args.p_user_agent || (cur && cur.ua) || '' });
      return json(route, 200, [{ status: 'ok', other_last_seen: null, other_user_agent: null }]);
    }
    case 'admin_list_members':
      if (!user || F.db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.members.entries()].map(([id, m]) => {
        const u = Object.values(USERS).find((x) => x.id === id); const s = F.db.sessions.get(id);
        return { user_id: id, email: u ? u.email : id, role: m.role, disabled_at: m.disabled_at, created_at: new Date().toISOString(),
                 last_heartbeat: s ? new Date(s.last).toISOString() : null, client_ip: '203.0.113.9', user_agent: s ? s.ua : null };
      }));
    case 'admin_create_invite': {
      if (!user || F.db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      const c = { id: 'c' + (F.db.codes.length + 1), code: 'NEWCODE' + (F.db.codes.length + 10000), pass_type: args.p_pass_type,
        target_project_id: args.p_target_project, max_redemptions: args.p_max_redemptions, redemptions_count: 0,
        expires_at: args.p_expires_at, revoked_at: null, label: args.p_label, created_at: new Date().toISOString() };
      F.db.codes.unshift(c);
      return json(route, 200, c);
    }
    case 'admin_revoke_invite': { const c = F.db.codes.find((x) => x.id === args.p_id); if (c) c.revoked_at = new Date().toISOString(); return json(route, 200, null); }
    case 'admin_terminate_session': {
      F.db.sessions.delete(args.p_user);
      if (args.p_disable) { const m = F.db.members.get(args.p_user); if (m) m.disabled_at = new Date().toISOString(); }
      return json(route, 200, null);
    }
    case 'screening_open': {
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!c || c.pass_type !== 'screening_pass' || !valid(c)) return pgErr(route, '22023', 'That screening pass is not valid');
      c.redemptions_count++;
      const aid = Math.random().toString(16).slice(2, 10).toUpperCase();
      F.db.redemptions.push({ id: 'r' + F.db.redemptions.length, code_id: c.id, viewer_email: args.p_viewer_email, access_id: aid, redeemed_at: new Date().toISOString() });
      const p = F.db.projects.find((x) => x.id === c.target_project_id);
      const d = F.db.data[p.id] || {};
      const scopes = {}; for (const k of ['story', 'feature', 'short', 'scenes']) if (d[k]) scopes[k] = d[k];
      return json(route, 200, [{ project_id: p.id, title: p.title, format: p.format, access_id: aid, expires_at: c.expires_at, scopes }]);
    }
    /* ---- section 58 ---- */
    case 'bump_event': {
      if (!FUNNEL_NAMES.includes(args.p_name)) return pgErr(route, '22023', 'Unknown event.');
      const src = String(args.p_source == null ? '' : args.p_source).trim().toLowerCase();
      if (src && (!/^[a-z0-9_-]{1,32}$/.test(src) || /[0-9]{7}/.test(src))) return pgErr(route, '22023', 'A source is up to 32 of a-z, 0-9, _ and -, with no long number in it.');
      const day = new Date().toISOString().slice(0, 10);
      const row = F.db.events.find((e) => e.day === day && e.name === args.p_name && e.source === src);
      if (row) row.count++; else F.db.events.push({ day, name: args.p_name, source: src, count: 1 });
      return route.fulfill({ status: 204, body: '' });
    }
    case 'admin_funnel': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, FUNNEL_NAMES.map((name) => ({ name, total: F.db.events.filter((e) => e.name === name && inWindow(e.day, args.p_from, args.p_to)).reduce((n, e) => n + e.count, 0) })));
    }
    case 'admin_funnel_by_source': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const m = new Map();
      for (const e of F.db.events) {
        if (!inWindow(e.day, args.p_from, args.p_to)) continue;
        const k = e.name + '|' + e.source;
        m.set(k, { name: e.name, source: e.source, total: (m.get(k) ? m.get(k).total : 0) + e.count });
      }
      return json(route, 200, [...m.values()].sort((a, b) => FUNNEL_NAMES.indexOf(a.name) - FUNNEL_NAMES.indexOf(b.name) || b.total - a.total));
    }
    /* ---- section 59 ---- */
    case 'submit_testimonial': {
      if (!user) return pgErr(route, '42501', 'Sign in to send a testimonial.', 401);
      const q = String(args.p_quote || '').trim(), n = String(args.p_display_name || '').trim(), c = String(args.p_consent || '').trim();
      if (q.length < 20 || q.length > 600 || !n || n.length > 80 || c.length < 20) return pgErr(route, '23514', 'new row for relation "testimonials" violates check constraint');
      if (F.db.testimonials.filter((t) => t.author === user.id && Date.now() - Date.parse(t.created_at) < DAY).length >= 5) return pgErr(route, 'P0429', 'That is plenty for one day. Thank you.');
      const now = new Date().toISOString();
      const t = { id: 'tm' + (F.db.testimonials.length + 1) + '-0000-4000-8000-000000000000', author: user.id, author_email: user.email, quote: q, display_name: n,
        role: String(args.p_role || '').trim() || null, film: String(args.p_film || '').trim() || null, consent_text: c, consented_at: now, revoked_at: null,
        status: 'pending', approved_by: null, approved_at: null, created_at: now, site_removed_at: null,
        first_approved_at: null, author_deleted: false };
      F.db.testimonials.push(t);
      return json(route, 200, tmOwn(t));
    }
    case 'my_testimonials':
      if (!user) return pgErr(route, '42501', 'permission denied for function my_testimonials', 401);
      return json(route, 200, F.db.testimonials.filter((t) => t.author === user.id).slice().reverse().map(tmOwn));
    case 'revoke_testimonial': {
      const t = user && F.db.testimonials.find((x) => x.id === args.p_id && x.author === user.id);
      if (!t) return pgErr(route, 'P0002', 'No such testimonial of yours.');
      t.revoked_at = t.revoked_at || new Date().toISOString();
      return json(route, 200, tmOwn(t));
    }
    case 'public_testimonials':
      return json(route, 200, F.db.testimonials.filter((t) => t.status === 'approved' && !t.revoked_at).map(TM_PUBLIC));
    case 'admin_list_testimonials': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const st = args.p_status || null;
      const pick = (t) => !st || (st === 'revoked' ? !!t.revoked_at
        : st === 'takedown' ? !!(t.revoked_at && t.first_approved_at && !t.site_removed_at)
          : (t.status === st && !t.revoked_at));
      return json(route, 200, F.db.testimonials.filter(pick).slice().reverse());
    }
    case 'admin_mark_testimonial_removed': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const role = (F.db.members.get(user.id) || {}).consoleRole || 'owner';
      if (role !== 'owner') return pgErr(route, '42501', `Your role (${role}) cannot do this. It needs the owner role.`);
      const t = F.db.testimonials.find((x) => x.id === args.p_id);
      if (!t) return pgErr(route, 'P0002', 'No such testimonial.');
      if (!t.revoked_at) return pgErr(route, '22023', 'Only a testimonial its author took back is marked off the site.');
      t.site_removed_at = t.site_removed_at || new Date().toISOString();
      return json(route, 200, t);
    }
    case 'admin_set_testimonial_status': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const role = (F.db.members.get(user.id) || {}).consoleRole || 'owner';
      if (role !== 'owner') return pgErr(route, '42501', `Your role (${role}) cannot do this. It needs the owner role.`);
      if (!['pending', 'approved', 'rejected'].includes(args.p_status)) return pgErr(route, '22023', 'A testimonial is pending, approved or rejected.');
      const t = F.db.testimonials.find((x) => x.id === args.p_id);
      if (!t) return pgErr(route, 'P0002', 'No such testimonial.');
      if (t.revoked_at) return pgErr(route, '22023', 'The author took this back. It cannot be published.');
      t.status = args.p_status;
      t.approved_by = args.p_status === 'approved' ? user.id : null;
      t.approved_at = args.p_status === 'approved' ? new Date().toISOString() : null;
      t.first_approved_at = t.first_approved_at || t.approved_at;
      return json(route, 200, t);
    }
    default:
      return json(route, 200, []);
  }
}

/* A JWT-shaped token for `tok`, because supabase-js's setSession()
   decodes the access token locally and refuses anything else. The
   signature is not checked by the fake (nor by the client). */
export function jwtFor(tok) {
  const u = USERS[tok];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return [b64({ alg: 'HS256', typ: 'JWT' }),
          b64({ sub: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', tok, exp: Math.floor(Date.now() / 1000) + 3600 }),
          'sig'].join('.');
}
function userFromBearer(auth) {
  if (USERS[auth]) return USERS[auth];
  const parts = String(auth).split('.');
  if (parts.length !== 3) return null;
  try { return USERS[JSON.parse(Buffer.from(parts[1], 'base64url').toString()).tok] || null; } catch (e) { return null; }
}

export async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
  const user = userFromBearer(auth);
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (m) {
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) {}
    return rpc(m[1], args, user, route);
  }
  if (url.pathname.startsWith('/rest/v1/plans')) return json(route, 200, user ? [...F.db.plans].sort((a, b) => a.sort - b.sort) : []);
  if (url.pathname.startsWith('/rest/v1/payments')) return json(route, 200, user ? F.db.payments.filter((x) => x.user_id === user.id) : []);

  const extFn = url.pathname.match(/^\/functions\/v1\/([a-z-]+)$/);
  if (extFn && EXT_FN[extFn[1]]) {
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const [status, out] = EXT_FN[extFn[1]](body, user);
    return json(route, status, out);
  }
  /* ---- section 62: rzp-subscribe and rzp-cancel ---- */
  if (url.pathname === '/functions/v1/rzp-subscribe' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    if (F.db.noRenewSchema) return json(route, 404, { error: 'Requested function was not found' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const product = String(body.product || '');
    const currency = body.currency == null ? 'INR' : String(body.currency);
    F.db.calls.push(`fn:rzp-subscribe ${product} ${currency}`);
    const no = (reason, error) => { F.db.calls.push('fn:rzp-subscribe refused ' + reason); return json(route, 400, { error, reason }); };
    if (F.db.members.get(user.id)?.disabled_at) return json(route, 403, { error: 'This account has been disabled by an administrator' });
    const mode = product === 'pass' ? F.db.settings.pass_mode : F.db.settings.plan_mode;
    if (mode !== 'renew') return no('renew_off', 'This is sold as a one-time payment now.');
    if (subLiveFor(user.id)) return no('subscribed', 'Auto-pay is already on for this account.');
    let amount, days, period, planId;
    if (product === 'pass') {
      let q;
      try { q = quotePass(user, currency); } catch (e) { return no(e.hint || 'disabled', e.message); }
      amount = q.amount_paise; days = q.days; period = 'pass'; planId = q.plan_id;
    } else {
      const plan = F.db.plans.find((p) => p.id === product && p.active && p.id !== 'free');
      if (!plan) return json(route, 400, { error: 'That plan is not for sale' });
      if (!['INR', 'USD'].includes(currency)) return json(route, 400, { error: 'Orders are in rupees (INR) or US dollars (USD).' });
      if (currency === 'USD' && !F.db.settings.usd_checkout) return no('currency', 'Dollar checkout is not on.');
      const held = heldPlan(F.db.accounts.find((a) => a.owner_id === user.id));
      if ((PLAN_RANK[plan.id] ?? 0) < (PLAN_RANK[held] ?? 0)) return no('downgrade', 'A lower plan waits for your year to end.');
      amount = effectivePriceMinor(plan.id, currency); days = 365; period = 'year'; planId = plan.id;
    }
    const id = 'sub_' + Math.random().toString(36).slice(2, 10);
    F.db.subscriptions.push({ id, user_id: user.id, account_id: body.account_id || null, product, plan_id: planId, period, days, amount_minor: amount, currency,
      status: 'created', current_start: null, current_end: null, cancel_at_period_end: false, cancelled_at: null, created_at: new Date().toISOString() });
    return json(route, 200, { subscription_id: id, key: RZP.keyId, amount, currency, description: product, period, days, prefill: { email: user.email } });
  }
  if (url.pathname === '/functions/v1/rzp-cancel' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    let x;
    if (body.subscription_id) {
      const m = F.db.members.get(user.id);
      if (!m || m.role !== 'admin') return json(route, 403, { error: 'Administrators only.' });
      if (m.consoleRole && !['owner', 'finance'].includes(m.consoleRole)) return json(route, 403, { error: `Your role (${m.consoleRole}) cannot do this. It needs the finance role.` });
      x = F.db.subscriptions.find((s) => s.id === body.subscription_id);
    } else {
      x = F.db.subscriptions.filter((s) => s.user_id === user.id && SUB_LIVE.includes(s.status) && !s.cancel_at_period_end).pop();
    }
    if (!x) return json(route, 400, { error: 'There is no auto-pay to cancel.' });
    Object.assign(x, { cancel_at_period_end: true, cancelled_at: new Date().toISOString() });
    F.db.calls.push(`fn:rzp-cancel ${x.id}${body.subscription_id ? ' admin' : ''}`);
    return json(route, 200, { ok: true, current_end: x.current_end });
  }

  /* ---- the two edge functions, as the browser reaches them ---- */
  if (url.pathname === '/functions/v1/rzp-order' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const plan = F.db.plans.find((p) => p.id === body.plan && p.active);
    F.db.calls.push(`fn:rzp-order ${body.plan} ${body.period}`);
    if (F.db.members.get(user.id)?.disabled_at) return json(route, 403, { error: 'This account has been disabled by an administrator' });
    /* §61: the launch pass, priced by quote_pass; no promo code. Refusals
       carry a `hint` (the client words them). */
    if (body.period === 'pass') {
      const currency = body.currency == null ? 'INR' : String(body.currency);
      let q;
      try { q = quotePass(user, currency); } catch (e) { F.db.calls.push(`fn:rzp-order refused ${e.hint || ''}`); return json(route, 400, { error: e.message, reason: e.hint || null }); }
      if (body.code) { F.db.calls.push('fn:rzp-order refused code'); return json(route, 400, { error: 'A promo code does not apply to the launch pass.', reason: 'code' }); }
      if (body.plan && body.plan !== q.plan_id) return json(route, 400, { error: 'That plan is not the pass plan.', reason: 'disabled' });
      const id = 'pay' + F.db.payments.length;
      const order_id = 'order_' + Math.random().toString(36).slice(2, 10);
      F.db.payments.push({ id, user_id: user.id, account_id: body.account_id || null, plan_id: q.plan_id, period: 'pass', days: q.days, amount_paise: q.amount_paise, currency: 'INR',
        list_paise: q.amount_paise, discount_paise: 0, promo_code: null, credit_paise: 0, razorpay_order_id: order_id, razorpay_payment_id: null, status: 'created', created_at: new Date().toISOString() });
      const pl = F.db.plans.find((p) => p.id === q.plan_id) || {};
      return json(route, 200, { order_id, amount: q.amount_paise, amount_minor: q.amount_paise, currency: 'INR', key_id: RZP.keyId, plan: q.plan_id, period: 'pass', plan_name: pl.name, payment_id: id,
        list_paise: q.amount_paise, discount_paise: 0, promo_code: null, credit_paise: 0, prefill: { email: user.email } });
    }
    if (!plan) return json(route, 400, { error: 'That plan is not for sale' });
    /* §52: a year at a time; an older client's 'lifetime' is read as a year */
    if (body.period == null || body.period === 'lifetime') body.period = 'year';
    if (body.period !== 'year') return json(route, 400, { error: 'Plans are bought a year at a time; there is no monthly period.' });
    if (!effectivePrice(plan.id)) return json(route, 400, { error: 'That plan is not for sale' });
    // section 20: the code is re-quoted here, never priced by the client
    // section 21: priced for THIS buyer — the difference, and a downgrade refused
    /* §56: the client chooses the currency and never the amount */
    const currency = body.currency == null ? 'INR' : String(body.currency);
    if (!['INR', 'USD'].includes(currency)) return json(route, 400, { error: 'Orders are in rupees (INR) or US dollars (USD).' });
    F.db.calls.push(`currency:rzp-order ${currency}`);
    let q;
    try { q = quoteOrderIn(plan.id, body.code, user, currency); } catch (e) { F.db.calls.push(`fn:rzp-order refused ${e.hint || ''}`); return json(route, 400, { error: e.message, ...(e.hint ? { reason: e.hint } : {}) }); }
    F.db.calls.push(`fn:rzp-order code ${q.code || '-'} ${q.ok ? 'ok' : q.reason}`);
    if (!q.ok) return json(route, 400, { error: q.sentence, reason: q.reason });
    const amount = q.amount_paise;
    const id = 'pay' + F.db.payments.length;
    const order_id = 'order_' + Math.random().toString(36).slice(2, 10);
    F.db.payments.push({ id, user_id: user.id, account_id: body.account_id || null, plan_id: plan.id, period: body.period, amount_paise: amount, currency,
      list_paise: q.list_paise, discount_paise: q.discount_paise, promo_code: q.code, credit_paise: q.credit_paise,
      razorpay_order_id: order_id, razorpay_payment_id: null, status: 'created', created_at: new Date().toISOString() });
    return json(route, 200, { order_id, amount, amount_minor: amount, currency, key_id: RZP.keyId, plan: plan.id, period: body.period, plan_name: plan.name, payment_id: id,
      list_paise: q.list_paise, discount_paise: q.discount_paise, promo_code: q.code, credit_paise: q.credit_paise, prefill: { email: user.email } });
  }
  if (url.pathname === '/functions/v1/rzp-verify' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    /* §62: a subscription's Checkout reply, HMAC(payment|subscription).
       Verified, then the webhook applies the charge (no capture here). */
    if (body.razorpay_subscription_id) {
      const want = await signFor(body.razorpay_payment_id || '', body.razorpay_subscription_id);
      if (!body.razorpay_signature || want !== String(body.razorpay_signature).toLowerCase()) {
        F.db.calls.push('fn:rzp-verify sub bad');
        return json(route, 400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });
      }
      const x = F.db.subscriptions.find((s) => s.id === body.razorpay_subscription_id);
      if (!x) return json(route, 404, { error: 'No such subscription.' });
      if (x.user_id !== user.id) return json(route, 403, { error: 'That subscription belongs to another account.' });
      if (x.status === 'created') x.status = 'authenticated';
      F.db.calls.push('fn:rzp-verify sub ok');
      if (RZP.subWebhook !== 'off') { const pid = body.razorpay_payment_id; setTimeout(() => { try { chargeSubscription(x.id, { paymentId: pid }); } catch (e) { /* the proof reads the ledger */ } }, RZP.subDelay); }
      return json(route, 200, { ok: true, pending: true });
    }
    const expected = await signFor(body.razorpay_order_id || '', body.razorpay_payment_id || '');
    if (!body.razorpay_signature || expected !== String(body.razorpay_signature).toLowerCase()) {
      F.db.calls.push('fn:rzp-verify bad');
      return json(route, 400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });
    }
    const pay = F.db.payments.find((x) => x.razorpay_order_id === body.razorpay_order_id);
    if (!pay) return json(route, 404, { error: 'No such order.' });
    if (pay.user_id !== user.id) return json(route, 403, { error: 'That order belongs to another account.' });
    // §51: the payment is read back from Razorpay; a signature proves authorization, not capture
    if (pay.status !== 'paid') {
      if (RZP.capture === 'authorized') F.db.calls.push(`fn:rzp-verify capture ${pay.amount_paise}`);
      if (RZP.capture === 'held') {
        F.db.calls.push('fn:rzp-verify pending');
        return json(route, 202, { ok: false, pending: true, error: 'Your payment is still being confirmed by Razorpay. Your plan will appear as soon as the money arrives — usually within a few minutes. You do not need to pay again.' });
      }
    }
    const r = activate(body.razorpay_order_id, body.razorpay_payment_id, body);
    F.db.calls.push('fn:rzp-verify ok');
    return json(route, 200, { ok: true, plan: r.pay.plan_id, ends_at: r.pay.ends_at, account_id: r.pay.account_id, already: r.already });
  }

  /* ---- rzp-refund: the admin check, begin_refund, a fake Razorpay, record_refund ---- */
  if (url.pathname === '/functions/v1/rzp-refund' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    if (!F.db.members.get(user.id) || F.db.members.get(user.id).role !== 'admin') { F.db.calls.push('fn:rzp-refund refused non-admin'); return json(route, 403, { error: 'Administrators only.' }); }
    // require_role(['finance']): an admin with no console role reads as owner (schema §45/§50)
    { const cr = F.db.members.get(user.id).consoleRole; if (cr && !['owner', 'finance'].includes(cr)) { F.db.calls.push('fn:rzp-refund refused role'); return json(route, 403, { error: `Your role (${cr}) cannot do this. It needs the finance role.` }); } }
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    if (!String(body.reason || '').trim()) return json(route, 400, { error: 'A reason is required.' });
    const pay = F.db.payments.find((x) => x.id === body.payment_id);
    if (!pay) return json(route, 400, { error: 'No such payment' });
    if (pay.status !== 'paid') return json(route, 400, { error: pay.status === 'refunded' ? 'That payment has already been refunded' : `Only a captured payment can be refunded (this one is ${pay.status})` });
    if (F.db.refunds.some((f) => f.payment_id === pay.id && f.status !== 'failed')) return json(route, 400, { error: 'A refund for that payment is already in progress' });
    const amount = body.amount_paise == null ? pay.amount_paise : body.amount_paise;
    if (!Number.isInteger(amount) || amount < 1 || amount > pay.amount_paise) return json(route, 400, { error: `The amount must be between 1 paisa and the ${pay.amount_paise} paise that was paid` });
    const rq = body.request_id ? F.db.rreqs.find((x) => x.id === body.request_id) : null;
    if (body.request_id && (!rq || rq.payment_id !== pay.id || !['pending', 'approved'].includes(rq.status))) return json(route, 400, { error: 'That request is not open for this payment' });
    const f = { id: 'rf' + F.db.refunds.length, payment_id: pay.id, request_id: body.request_id || null, razorpay_refund_id: null, amount_paise: amount, status: 'initiated', reason: body.reason, error: null, created_at: new Date().toISOString() };
    F.db.refunds.push(f);
    // the fake Razorpay: POST /v1/payments/{id}/refund
    F.db.rzpRefunds.push({ payment: pay.razorpay_payment_id, amount, receipt: f.id, notes: { reason: body.reason, refunded_by: user.email } });
    F.db.calls.push(`fn:rzp-refund ${pay.razorpay_payment_id} ${amount}`);
    if (RZP.refundMode === 'fail') { Object.assign(f, { status: 'failed', error: 'The payment has already been fully refunded' }); return json(route, 502, { error: f.error }); }
    f.razorpay_refund_id = 'rfnd_' + f.id; f.status = RZP.refundMode === 'processed' ? 'processed' : 'pending';
    // §50: the request is settled as refunded only once processed; pending means approved
    if (rq) Object.assign(rq, { status: f.status === 'processed' ? 'refunded' : (rq.status === 'pending' ? 'approved' : rq.status), decided_at: rq.decided_at || new Date().toISOString() });
    if (f.status === 'processed') endPlanByRefund(pay);
    return json(route, 200, { ok: true, refund_id: f.razorpay_refund_id, status: f.status, amount_paise: amount, email: (Object.values(USERS).find((u) => u.id === pay.user_id) || {}).email, plan_ended: f.status === 'processed' });
  }
  if (url.pathname.startsWith('/rest/v1/invite_codes')) {
    if (!user || F.db.members.get(user.id)?.role !== 'admin') return json(route, 200, []);
    return json(route, 200, F.db.codes);
  }
  if (url.pathname.startsWith('/rest/v1/invite_redemptions')) return json(route, 200, user && F.db.members.get(user.id)?.role === 'admin' ? F.db.redemptions : []);
  if (url.pathname.startsWith('/rest/v1/projects')) {
    if (req.method() === 'GET') return json(route, 200, user ? F.db.projects.filter((p) => p.owner_id === user.id).map(({ id, title, format }) => ({ id, title, format })) : []);
    if (req.method() === 'PATCH' && user) {
      // cloud.js updates first and inserts only on an empty answer, so
      // the fake must answer a PATCH with the matching row or every
      // pulled project would be re-inserted and hit the cap.
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const hit = F.db.projects.filter((p) => p.id === id && p.owner_id === user.id);
      F.db.calls.push('write:projects'); return json(route, 200, hit.map(({ id }) => ({ id })));
    }
    if (req.method() === 'POST' && user) {
      // 16.8: enforce_project_limit, as the trigger would.
      const lim = userLimits(user.id), c = cap(lim, 'projects');
      const n = F.db.projects.filter((p) => p.owner_id === user.id).length;
      if (c !== null && n >= c) {
        F.db.calls.push('write:projects:P0402');
        const pl = userPlan(user.id);
        return pgErr(route, 'P0402', `Your ${pl[0].toUpperCase() + pl.slice(1)} plan syncs up to ${c} project${c === 1 ? '' : 's'}. Upgrade to add another to the cloud; it is still saved on this device.`);
      }
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      F.db.projects.push({ id: body.id || 'p' + F.db.projects.length, title: body.title || '', format: body.format || 'feature', owner_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    F.db.calls.push('write:projects'); return json(route, 201, []);
  }
  /* F.db.refuseData = 'P0402' (or any code): every project_data write is
     REFUSED the way PostgREST refuses one, so a proof can watch the queue
     tell a refusal from a dead network (prove:gate case t). */
  if (url.pathname.startsWith('/rest/v1/project_data') && req.method() !== 'GET' && F.db.refuseData) {
    F.db.calls.push('write:project_data:' + F.db.refuseData);
    return json(route, 400, { code: F.db.refuseData, message: 'refused by the proof', details: null, hint: null });
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (req.method() !== 'GET') F.db.calls.push('write:' + url.pathname.split('/')[3]);
    return json(route, req.method() === 'GET' ? 200 : 201, []);
  }
  if (url.pathname.startsWith('/auth/v1/user')) return user ? json(route, 200, { id: user.id, email: user.email, aud: 'authenticated' }) : json(route, 401, {});
  return json(route, 200, {});
}

/* ---- the AI scenarios (src/lib/plan-gate.js aiUnlocked()) ----------
   AI pills unlock only for a KNOWN plan whose features do not say
   ai_tools: false. One call puts the fake in the state a proof wants:

     aiScenario('pro', tok)        tok's own account on Pro, a member,
                                   features { ai_tools: true }
     aiScenario('no-ai', tok)      tok's own account on Basic, a member,
                                   features { ai_tools: false }
     aiScenario('signed-out')      nothing to set up: the proof seeds no
                                   session, and plan-gate never asks

   Call it after F.reset(). Returns the token to seed with sessionFor()
   (null for signed-out). `features` merges extra keys over the map. */
export function aiScenario(kind, tok = 'tok-amy', { features = {} } = {}) {
  if (kind === 'signed-out') { F.db.featureOverrides = null; return null; }
  const u = USERS[tok];
  if (!u) throw new Error('aiScenario: unknown user ' + tok);
  const plan = kind === 'pro' ? 'pro' : kind === 'no-ai' ? 'starter' : null;
  if (!plan) throw new Error('aiScenario: unknown scenario ' + kind);
  const cur = F.db.members.get(u.id);
  F.db.members.set(u.id, { ...(cur || {}), role: (cur && cur.role) || 'user', disabled_at: null });
  applyPlan(accountForBuyer(u.id), plan);
  const ai = kind === 'pro';
  /* The rows as src/data/plan-matrix.json sells them: ai_tools on Pro
     only among the paid plans. offerFor(['ai_tools']) reads these rows,
     so a row left unset (missing = allowed) would name a cheaper plan. */
  for (const row of F.db.plans) {
    if (row.id === 'free') continue;
    row.features = { ...(row.features || {}), ai_tools: row.id === 'pro' };
  }
  F.db.featureOverrides = { ai_tools: ai, ...features };
  return tok;
}

export function sessionFor(tok) {
  const u = USERS[tok];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
            app_metadata: { provider: 'google' }, user_metadata: u.name ? { full_name: u.name } : {}, created_at: new Date().toISOString() } });
}


F.reset();
