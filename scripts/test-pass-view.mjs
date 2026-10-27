#!/usr/bin/env node
/* test:pass (second half) — src/lib/pass-view.js, the studio's reading
   of the launch pass: which phase the offer is in, whether THIS account
   may buy it, and the sentence for each server refusal. Every question
   fails CLOSED: an unknown is never an offer. */
import { passPhase, mayBuyPass, holdsPlan, onPass, passRefusal, passFacts, passCta, passName, passDays, passMode, passTerms } from '../src/lib/pass-view.js';
import { autopaySummary } from '../src/lib/pass-view.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const NOW = Date.parse('2026-10-27T10:00:00Z');
const raw = { open: true, amount_paise: 4900, days: 7, plan: 'pro', ends_at: '2026-10-30T10:00:00Z', cap: null, left: null, now: '2026-10-27T10:00:00Z' };
const at = (r) => ({ raw: r, readAt: NOW });

/* the phase */
ok(passPhase(null, NOW) === 'off', 'no offer read: off');
ok(passPhase(at(null), NOW) === 'off', 'no block: off');
ok(passPhase(at({ ...raw, amount_paise: 0 }), NOW) === 'off', 'a malformed block: off');
ok(passPhase(at(raw), NOW) === 'open', 'open before the deadline');
ok(passPhase(at(raw), NOW + 3 * 86400000 + 1000) === 'ended', 'the countdown crossing zero: ended (not off)');
ok(passPhase(at({ ...raw, open: false, now: '2026-10-31T10:00:00Z' }), NOW) === 'ended', 'closed by the server after its deadline: ended');
ok(passPhase(at({ ...raw, open: false, cap: 500, left: 0 }), NOW) === 'ended', 'closed with the cap reached: ended');
ok(passPhase(at({ ...raw, open: true, cap: 500, left: 0 }), NOW) === 'ended', 'the last pass sold: ended');
ok(passPhase(at({ ...raw, open: false, ends_at: null }), NOW) === 'off', 'switched off (no deadline passed, no cap reached): off');
ok(passPhase(at({ ...raw, open: false }), NOW) === 'off', 'switched off before its deadline: off');

/* who may buy */
const st = { plan: 'free', pass_used: false, pass_active: false, plan_period: null };
ok(mayBuyPass(null) === true, 'signed out: the offer stands, the sign-in comes first');
ok(mayBuyPass(st) === true, 'no plan, never had a pass: may buy');
ok(mayBuyPass({ plan: 'free' }) === false, 'a server without §61 (no pass_used key): may not');
ok(mayBuyPass({ ...st, pass_used: true }) === false, 'once per account');
ok(mayBuyPass({ ...st, plan: 'pro', plan_period: 'pass', pass_active: true }) === false, 'not on top of a running pass');
ok(mayBuyPass({ ...st, plan: 'starter', plan_period: 'year' }) === false, 'never on top of a yearly plan');
ok(mayBuyPass({ ...st, disabled: true }) === false, 'a disabled account may not');
ok(holdsPlan({ plan: 'pro', plan_period: 'pass' }) === false && holdsPlan({ plan: 'indie', plan_period: 'year' }) === true, 'a running pass is not a plan held');
ok(onPass({ pass_active: true }) && onPass({ plan_period: 'pass' }) && !onPass({ plan: 'pro', plan_period: 'year' }) && !onPass(null), 'onPass reads pass_active or plan_period');

/* the refusals */
for (const h of ['disabled', 'closed', 'inr_only', 'used', 'has_plan', 'code']) ok(passRefusal(h, 'server words') !== 'server words' && passRefusal(h).length > 20, 'a sentence for ' + h);
ok(passRefusal('other', 'server words') === 'server words', 'an unknown hint keeps the server sentence');
ok(/try again/i.test(passRefusal('', '')), 'nothing at all: a generic sentence');

/* the words */
const f = passFacts(at(raw));
ok(f && f.price === '₹49' && f.length === '7 days' && f.plan === 'pro', 'facts: ₹49, 7 days, pro');
ok(passFacts(at({ ...raw, amount_paise: 9900 })).price === '₹99', 'the price follows the server (₹99)');
ok(passCta(f) === 'TRY IT FOR ₹49', 'the button: TRY IT FOR ₹49');
ok(passName(7) === '7-day pass' && passName(null) === 'Launch pass', 'the name: 7-day pass / Launch pass');
ok(passDays({ payments: [{ period: 'pass', status: 'paid', starts_at: '2026-10-27T10:00:00Z', ends_at: '2026-11-03T10:00:00Z' }] }) === 7, 'days from the pass payment');
ok(passDays({ payments: [{ period: 'year', status: 'paid', starts_at: '2026-10-27T10:00:00Z', ends_at: '2027-10-27T10:00:00Z' }] }) === null, 'a yearly payment is not a pass');

/* §62: the mode is the server's, worded by offer-terms.js; unknown claims neither */
ok(passMode(at(raw)) === null && passTerms(at(raw)).line === '₹49 for 7 days', 'no mode: price and length only');
ok(passMode(at({ ...raw, mode: 'once' })) === 'once' && /nothing renews/.test(passTerms(at({ ...raw, mode: 'once' })).line), 'once: says it does not renew');
ok(/every 7 days.*cancel anytime/.test(passTerms(at({ ...raw, mode: 'renew' })).line), 'renew: every 7 days, cancel anytime');
ok(passMode(at({ ...raw, mode: 'weekly' })) === null, 'a mode it does not know is unknown');
for (const h of ['renew_off', 'subscribed']) ok(passRefusal(h, 'server words') !== 'server words', 'a sentence for ' + h);
/* §62: the Settings auto-pay card */
const ap = { status: 'active', product: 'pass', price: '₹49', currentEnd: '2026-11-03T10:00:00Z', nextChargeAt: '2026-11-03T10:00:00Z', live: true, open: true, cancelAtEnd: false };
const s1 = autopaySummary(ap, () => '7-day pass', NOW);
ok(s1 && s1.canCancel && /^Renews .* · ₹49$/.test(s1.line) && s1.led[0] === 'Auto-pay on', 'auto-pay on: renews <date> · amount, cancellable');
const s2 = autopaySummary({ ...ap, live: false, cancelAtEnd: true }, () => '7-day pass', NOW);
ok(s2 && !s2.canCancel && /^Auto-pay off · access until /.test(s2.line), 'cancelled: access until <date>, no cancel button');
ok(autopaySummary({ ...ap, live: false, status: 'cancelled', currentEnd: '2026-10-01T00:00:00Z' }, null, NOW) === null, 'ended in the past: no card');
ok(autopaySummary(null) === null, 'no auto-pay: no card');

console.log(fail ? `✗ pass view: ${pass} passed, ${fail} failed` : `✓ pass view: ${pass} passed, 0 failed`);
process.exitCode = fail ? 1 : 0;
