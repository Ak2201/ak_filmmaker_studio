/* ============================================================
   ADMIN HEALTH MODEL — what the live project's report MEANS
   ------------------------------------------------------------
   The Launch & health tab (src/pages/admin-tabs/health.js) draws; this
   decides. Every function is pure: the admin_health() answer, the probe
   results and the clock come in as arguments, and sentences and states
   come out. The tab's five rules are kept here, where they are decided:
   a slot that came back as {error, message} is UNKNOWN (never a pass),
   a thing SQL cannot see is "Not observable" or "Inferred", and a probe
   states what it observed without naming a cause.
   ============================================================ */
import { relTime, duration } from './admin-format.js';

export const DAY = 86400000;
/** The four payment edge functions the tab probes, in order. */
export const FUNCTIONS = ['rzp-order', 'rzp-verify', 'rzp-webhook', 'rzp-refund'];

/** A report slot that answered with an error object rather than data. */
export const isErr = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'error' in v;
export const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** An invoice with a buyer e-mail and no mail recorded. */
export const awaiting = (r) => !r.emailed_at && String(r.buyer_email || '').trim() && r.razorpay_order_id;

/** When the purchases switch was last turned ON, from admin_list_audit rows
    (newest first): the newest row that FLIPPED it decides. null when that
    row turned it off, or none flipped it. */
export function lastThrowAt(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const flips = list.find((r) => r.before && r.after && typeof r.after.purchase_required === 'boolean' && r.before.purchase_required !== r.after.purchase_required);
  return flips && flips.after.purchase_required === true ? Date.parse(flips.at) : null;
}

/* ---- the probes ---------------------------------------------------- */

export const probeKind = (r) => (!r ? 'wait' : r.status === -1 ? 'alive' : r.status === 0 ? 'down' : r.status === 404 ? 'missing' : r.status >= 500 && r.status !== 503 ? 'error' : 'alive');
export const PROBE_WORD = { alive: ['Answers', 'ok'], missing: ['Missing (404)', 'danger'], down: ['Unreachable', 'danger'], error: ['Server error', 'warn'], wait: ['Not probed', 'neutral'] };

/** The line under one function's pill. */
export function probeDetail(r, running) {
  return !r ? (running ? 'Probing…' : 'Not probed yet')
    : r.status === 0 ? `No readable answer${r.msg ? ' (' + r.msg + ')' : ' (a network error or a CORS refusal look the same to a page)'}`
    : r.status === -1 ? `Deployed: ${r.msg}`
    : `HTTP ${r.status}${r.msg ? ': ' + r.msg : ''}`;
}

/* ---- what the data says, as sentences ----------------------------- */

/** One named check from the report, or null. */
export const findCheck = (data, id) => (data && Array.isArray(data.checks) ? data.checks.find((c) => c.id === id) : null) || null;
export const slotMsg = (v) => !v ? 'Unknown: the report has no answer for this check.' : `Unknown: ${v.message || v.error}${v.error ? ` (${v.error})` : ''}`;

/** Resend is not readable from SQL. What can be seen: invoices with no mail recorded. */
export function resendInference(data, now = Date.now()) {
  const r = data && data.receipts;
  const p = data && data.payments;
  if (!r || isErr(r)) return { kind: 'none', text: 'Not observable. The receipts probe did not answer' + (isErr(r) ? ': ' + (r.message || r.error) : '.') };
  if (num(r.awaiting_recent) > 0) return { kind: 'warn', text: `${r.awaiting_recent} invoice(s) from the last 7 days have no mail recorded.` };
  const recentPaid = p && !isErr(p) && p.last_paid_at && now - Date.parse(p.last_paid_at) < 7 * DAY;
  if (recentPaid) return { kind: 'ok', text: 'A payment was captured in the last 7 days and no recent receipt is waiting.' };
  return { kind: 'none', text: 'No evidence either way: no payment in the last 7 days, so no recent receipt to judge by. Confirm with one test purchase.' };
}

/** BILLING.md §19, "Throwing the switch", in order, each with a live state.
    `probes` is { phase, res, noUrl }; `env` is 'TEST' | 'LIVE' | null. */
export function launchSteps(data, probes, env) {
  const d = data;
  if (!d) return [{ label: 'Reading the live checks…', state: 'wait' }];
  const P = probes || { phase: 'idle', res: {} };
  const byCheck = (id, label, passNote) => {
    const c = findCheck(d, id);
    if (!c) return { label, state: 'skip', note: 'The server did not report this check.' };
    if (c.level === 'unknown') return { label, state: 'skip', note: c.observed };
    return { label, state: c.level === 'ok' ? 'pass' : 'fail', note: c.observed || passNote };
  };
  const steps = [];
  steps.push(byCheck('sections', 'Every schema section is present'));

  const rs = resendInference(d);
  steps.push({ label: 'Resend delivers receipts (BILLING §19.1)', state: rs.kind === 'ok' ? 'pass' : rs.kind === 'warn' ? 'fail' : 'skip', note: (rs.kind === 'ok' ? 'Inferred. ' : '') + rs.text });

  const kinds = FUNCTIONS.map((fn) => probeKind(P.res[fn]));
  const probed = P.phase === 'done' && !P.noUrl;
  let fnState = 'wait'; let fnNote = P.phase === 'running' ? 'Probing…' : 'Not probed yet.';
  if (probed) {
    const bad = FUNCTIONS.filter((fn, i) => kinds[i] !== 'alive');
    fnState = bad.length ? 'fail' : 'pass';
    fnNote = bad.length ? bad.map((fn) => `${fn}: ${PROBE_WORD[probeKind(P.res[fn])][0].toLowerCase()}`).join('; ') : 'All four answered an unauthenticated request.';
  } else if (P.noUrl) { fnState = 'skip'; fnNote = 'This build carries no Supabase URL to probe.'; }
  steps.push({ label: 'The four payment functions answer (BILLING §19.2)', state: fnState, note: fnNote });

  steps.push({ label: 'Razorpay is on a live key', state: env === 'LIVE' ? 'pass' : env === 'TEST' ? 'fail' : 'skip', note: env ? `The key id's prefix says ${env}.` : 'No key id in this build.' });

  const p = d.payments;
  if (!p || isErr(p)) steps.push({ label: 'A real payment has been captured', state: 'skip', note: slotMsg(p) });
  else steps.push({ label: 'A real payment has been captured', state: num(p.paid) > 0 ? 'pass' : 'fail', note: num(p.paid) > 0 ? `${p.paid} paid; the last ${p.last_paid_at ? relTime(p.last_paid_at) : 'at an unknown time'}. A paid row does not say whether it was test or live.` : 'No payment has been captured.' });

  const rf = d.refunds;
  if (!rf || isErr(rf)) steps.push({ label: 'A refund has been exercised', state: 'skip', note: slotMsg(rf) });
  else steps.push({ label: 'A refund has been exercised', state: rf.last_refund_processed_at ? 'pass' : 'fail', note: rf.last_refund_processed_at ? `The last processed ${relTime(rf.last_refund_processed_at)}.` : 'No refund has been processed.' });

  steps.push(byCheck('plan_features', 'Every paid plan has its features set (BILLING §19.3)'));

  const w = d.wall;
  if (!w || isErr(w)) steps.push({ label: 'No grandfathered member would be walled (BILLING §19.4)', state: 'skip', note: slotMsg(w) });
  else steps.push({ label: 'No grandfathered member would be walled (BILLING §19.4)', state: num(w.grandfathered_walled) === 0 ? 'pass' : 'fail', note: `${w.grandfathered_walled} grandfathered member(s) would be walled.` });
  return steps;
}

/** The checklist's headline: how many fail, how many could not be confirmed. */
export function stepTally(steps) {
  return {
    failing: steps.filter((s) => s.state === 'fail').length,
    unsure: steps.filter((s) => s.state === 'skip' || s.state === 'wait').length
  };
}

/** The confirmation's body before the switch is thrown. */
export function throwBody(steps, wall) {
  const notPassing = steps.filter((s) => s.state !== 'pass');
  return `${wall == null ? 'Some members' : wall + ' member(s)'} will be walled until they buy a plan or start a trial. ` +
    (notPassing.length ? `Not passing: ${notPassing.map((s) => s.label.replace(/ \(BILLING[^)]*\)/, '')).join('; ')}. ` : 'Every launch step is passing. ') +
    'Rollback stays one click away for 24 hours.';
}

/** The switch's live state from the report: true, false, or null when unknown. */
export const switchState = (data) => (data && typeof data.purchases_required === 'boolean' ? data.purchases_required : null);

/** What the rollback window says, from when the switch was last turned on. */
export function rollbackWindow(throwPhase, at, now = Date.now()) {
  const left = at ? at + DAY - now : null;
  return { left, offer: throwPhase === 'error' || at == null || left > 0 };
}

/* ---- the report's own words ---------------------------------------- */

export const LEVEL = { ok: ['OK', 'ok'], warn: ['Needs a look', 'warn'], info: ['Info', 'neutral'], unknown: ['Unknown', 'neutral'] };
/** "oldest_pending_age_seconds" -> "Oldest pending age". */
export const LABEL = (k) => { const t = String(k).replace(/_seconds$/, '').replace(/_/g, ' '); return t[0].toUpperCase() + t.slice(1); };

/** How one fact is shown: { kind: 'none' | 'skip' | 'unobservable' | 'time' | 'text', text }.
    'skip' is an object (drawn by its own card, not as a fact). */
export function factKind(k, v) {
  if (v == null) return { kind: 'text', text: '—' };
  if (typeof v === 'string' && /not observable/i.test(v)) return { kind: 'unobservable', text: v };
  if (/_age_seconds$/.test(k)) return { kind: 'text', text: duration(v) + ' old' };
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return { kind: 'time', text: v };
  if (typeof v === 'boolean') return { kind: 'text', text: v ? 'Yes' : 'No' };
  if (typeof v === 'object') return { kind: 'skip' };
  return { kind: 'text', text: String(v) };
}

/** Checks by level, for the three tiles. */
export function checkCounts(checks) {
  const list = Array.isArray(checks) ? checks : [];
  const count = (l) => list.filter((c) => c.level === l).length;
  return { total: list.length, ok: count('ok'), warn: count('warn'), unknown: count('unknown') };
}

/** The sub-nav count: checks that need a look or could not be read; null when unknown. */
export function healthBadge(phase, data) {
  if (phase !== 'ok' || !data || !Array.isArray(data.checks)) return null;
  return data.checks.filter((c) => c.level === 'warn' || c.level === 'unknown').length;
}

export default { DAY, FUNCTIONS, isErr, num, awaiting, lastThrowAt, probeKind, PROBE_WORD, probeDetail, findCheck, slotMsg, resendInference, launchSteps, stepTally, throwBody, switchState, rollbackWindow, LEVEL, LABEL, factKind, checkCounts, healthBadge };
