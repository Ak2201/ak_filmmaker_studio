/* ============================================================
   ADMIN TAB — Launch & health (health, #health)
   ------------------------------------------------------------
   What the LIVE project says about itself, and the launch checklist that
   ends in the purchases switch. Principle 4 of the plan: ask the server,
   not the file (rzp-refund answered 404 for three days while the docs
   said it was deployed; plans.features sat empty until somebody read the
   table).

   FIVE RULES THIS TAB KEEPS
     1. A slot that came back as {error, message} is drawn as UNKNOWN with
        the message. It is never a green tick and never an empty list.
     2. A thing SQL cannot see ("last webhook seen", whether Resend is
        configured) is drawn as "Not observable" or "Inferred", and says
        what the inference rests on.
     3. A probe states what it observed (an HTTP status) and does not name
        a cause it has not checked.
     4. The switch needs the word REQUIRE typed, shows who it would wall
        before it asks, and says the server's refusal as the sentence the
        server wrote.
     5. Rollback = purchase_required:false, which the server never refuses.
        The 24-hour window is DERIVED from the audit log (the newest
        set_billing_settings row that turned the switch on); if that row
        cannot be read the tab says the window is unknown rather than
        guess one.

   EDGE FUNCTIONS are probed from the browser, with a deliberately
   unauthenticated POST. 401, 400, 403, 422 and 503 are an answer from a
   deployed function; 404 is a missing one. A reply the browser cannot read
   (no CORS headers — rzp-webhook, on purpose) is retried in no-cors mode:
   if that resolves the function is deployed ("answered, status unreadable");
   only when both fail is it shown as unreachable.

   Shared with the Overview (src/pages/admin.js): ensureHealth(),
   healthState(), reload().
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { kpi, pill, checklist, emptyState, errorState, skeleton, dataTable, hashParts, absTime, relTime } from '../../ui/admin-kit.js';
import { ask } from '../../ui/dialog.js';
import StudioUI from '../../ui/chrome.js';
import { fmtPaise } from '../../lib/billing.js';
import { callRpc, duration } from './rpc.js';

const DAY = 86400000;
const FUNCTIONS = ['rzp-order', 'rzp-verify', 'rzp-webhook', 'rzp-refund'];

const H = { phase: 'idle', data: null, error: '', at: 0 };       // admin_health()
const W = { phase: 'idle', data: null, error: '' };               // admin_launch_preview()
const I = { phase: 'idle', rows: [], error: '' };                 // admin_list_invoices()
const T = { phase: 'idle', at: null, error: '' };                 // when the switch was last turned ON, from the audit log
const P = { phase: 'idle', res: {}, at: 0 };                      // the edge-function probes
const SW = { busy: false, msg: null };                            // the switch's own message
let ctxRef = null;

let queued = false;
/* Asynchronous and coalesced: loads start inside render(), and a synchronous
   rerender there would re-enter the page's own render. */
const again = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; if (ctxRef && ctxRef.rerender) ctxRef.rerender(); }, 0);
};
const cloud = () => (ctxRef && ctxRef.cloud) || window.StudioCloud || null;
const isErr = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'error' in v;
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/* ---- loading ------------------------------------------------------ */

/* A reload over data already on screen keeps drawing it (phase stays 'ok',
   `busy` says it is refreshing); skeletons are for when there is nothing yet. */
async function loadHealth() {
  if (H.phase !== 'ok') H.phase = 'loading'; H.busy = true;
  try { H.data = await callRpc(cloud(), 'admin_health'); H.phase = 'ok'; H.error = ''; H.at = Date.now(); }
  catch (e) { H.phase = 'error'; H.error = e.message || 'The server did not say why.'; }
  H.busy = false;
  again();
}
async function loadPreview() {
  if (W.phase !== 'ok') W.phase = 'loading';
  try { W.data = await callRpc(cloud(), 'admin_launch_preview'); W.phase = 'ok'; W.error = ''; }
  catch (e) { W.phase = 'error'; W.error = e.message || 'The server did not say why.'; }
  again();
}
async function loadInvoices() {
  if (I.phase !== 'ok') I.phase = 'loading';
  try { I.rows = (await callRpc(cloud(), 'admin_list_invoices')) || []; I.phase = 'ok'; I.error = ''; }
  catch (e) { I.phase = 'error'; I.error = e.message || 'The server did not say why.'; }
  again();
}
/** The newest audit row that turned purchase_required ON or OFF decides what the log says. */
async function loadThrow() {
  if (T.phase !== 'ok') T.phase = 'loading';
  try {
    const out = await callRpc(cloud(), 'admin_list_audit', { p_action: 'set_billing_settings', p_target: 'billing_settings:global', p_limit: 50 });
    const rows = Array.isArray(out && out.rows) ? out.rows : [];
    const flips = rows.find((r) => r.before && r.after && typeof r.after.purchase_required === 'boolean' && r.before.purchase_required !== r.after.purchase_required);
    T.at = flips && flips.after.purchase_required === true ? Date.parse(flips.at) : null;
    T.phase = 'ok'; T.error = '';
  } catch (e) { T.phase = 'error'; T.at = null; T.error = e.message || 'The server did not say why.'; }
  again();
}
function loadAll() { loadHealth(); loadPreview(); loadInvoices(); loadThrow(); }

export function healthState() { return H; }
export function ensureHealth(ctx) { if (ctx) ctxRef = ctx; if (H.phase === 'idle') loadAll(); }
export function reload(ctx) { if (ctx) ctxRef = ctx; loadAll(); }
/** The failed-receipt rows, for whoever wants them (the Overview counts from admin_health instead). */
export const receiptRows = () => I.rows.filter(awaiting);

const awaiting = (r) => !r.emailed_at && String(r.buyer_email || '').trim() && r.razorpay_order_id;

/* ---- the edge-function probes ------------------------------------- */

async function probeOne(base, fn) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    /* No headers, a string body: a "simple" request, so no CORS preflight
       can stand between the page and the status. */
    const r = await fetch(`${base}/functions/v1/${fn}`, { method: 'POST', body: '{}', signal: ac.signal, cache: 'no-store', credentials: 'omit' });
    let msg = '';
    try { const j = await r.clone().json(); msg = String(j.error || j.message || ''); } catch (e) { /* no JSON body */ }
    return { status: r.status, msg: msg.slice(0, 140) };
  } catch (e) {
    if (e && e.name === 'AbortError') return { status: 0, msg: 'no answer in 8 seconds' };
    /* A readable answer failed. Ask again in no-cors mode: that resolves (an
       opaque response) when a server answered and merely sent no CORS
       headers — which is what rzp-webhook does on purpose, since only
       Razorpay calls it — and rejects on a real network failure. A missing
       function is NOT hidden by this: the platform answers a 404 for an
       undeployed function WITH CORS headers, so it would have been read
       above. */
    try {
      await fetch(`${base}/functions/v1/${fn}`, { method: 'POST', body: '{}', mode: 'no-cors', signal: ac.signal, cache: 'no-store', credentials: 'omit' });
      return { status: -1, msg: 'answered, but sends no CORS headers (as a webhook should), so the browser cannot read its status' };
    } catch (e2) {
      return { status: 0, msg: '' };
    }
  } finally { clearTimeout(timer); }
}
async function runProbes() {
  const c = cloud();
  const cfg = c && c.getCfg ? c.getCfg() : null;
  const base = cfg && cfg.url ? String(cfg.url).replace(/\/+$/, '') : '';
  if (!base) { P.phase = 'done'; P.res = {}; P.at = Date.now(); P.noUrl = true; again(); return; }
  P.phase = 'running'; P.noUrl = false;
  again();
  const out = await Promise.all(FUNCTIONS.map((fn) => probeOne(base, fn)));
  P.res = Object.fromEntries(FUNCTIONS.map((fn, i) => [fn, out[i]]));
  P.phase = 'done'; P.at = Date.now();
  again();
}
const probeKind = (r) => (!r ? 'wait' : r.status === -1 ? 'alive' : r.status === 0 ? 'down' : r.status === 404 ? 'missing' : r.status >= 500 && r.status !== 503 ? 'error' : 'alive');
const PROBE_WORD = { alive: ['Answers', 'ok'], missing: ['Missing (404)', 'danger'], down: ['Unreachable', 'danger'], error: ['Server error', 'warn'], wait: ['Not probed', 'neutral'] };

function wantProbes() { return P.phase === 'idle' && hashParts().tab === 'health'; }

/* ---- what the data says, as sentences ----------------------------- */

const check = (id) => (H.data && Array.isArray(H.data.checks) ? H.data.checks.find((c) => c.id === id) : null) || null;
const slotMsg = (v) => `Unknown: ${v.message || v.error}${v.error ? ` (${v.error})` : ''}`;

/** Resend is not readable from SQL. What can be seen: invoices with no mail recorded. */
function resendInference() {
  const r = H.data && H.data.receipts;
  const p = H.data && H.data.payments;
  if (!r || isErr(r)) return { kind: 'none', text: 'Not observable. The receipts probe did not answer' + (isErr(r) ? ': ' + (r.message || r.error) : '.') };
  if (num(r.awaiting_recent) > 0) return { kind: 'warn', text: `${r.awaiting_recent} invoice(s) from the last 7 days have no mail recorded.` };
  const recentPaid = p && !isErr(p) && p.last_paid_at && Date.now() - Date.parse(p.last_paid_at) < 7 * DAY;
  if (recentPaid) return { kind: 'ok', text: 'A payment was captured in the last 7 days and no recent receipt is waiting.' };
  return { kind: 'none', text: 'No evidence either way: no payment in the last 7 days, so no recent receipt to judge by. Confirm with one test purchase.' };
}

/** BILLING.md §19, "Throwing the switch", in order, each with a live state. */
function launchSteps(ctx) {
  const d = H.data;
  if (!d) return [{ label: 'Reading the live checks…', state: 'wait' }];
  const byCheck = (id, label, passNote) => {
    const c = check(id);
    if (!c) return { label, state: 'skip', note: 'The server did not report this check.' };
    if (c.level === 'unknown') return { label, state: 'skip', note: c.observed };
    return { label, state: c.level === 'ok' ? 'pass' : 'fail', note: c.observed || passNote };
  };
  const steps = [];
  steps.push(byCheck('sections', 'Every schema section is present'));

  const rs = resendInference();
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

  const env = ctx && ctx.env;
  steps.push({ label: 'Razorpay is on a live key', state: env === 'LIVE' ? 'pass' : env === 'TEST' ? 'fail' : 'skip', note: env ? `The key id's prefix says ${env}.` : 'No key id in this build.' });

  const p = d.payments;
  if (isErr(p)) steps.push({ label: 'A real payment has been captured', state: 'skip', note: slotMsg(p) });
  else steps.push({ label: 'A real payment has been captured', state: num(p.paid) > 0 ? 'pass' : 'fail', note: num(p.paid) > 0 ? `${p.paid} paid; the last ${p.last_paid_at ? relTime(p.last_paid_at) : 'at an unknown time'}. A paid row does not say whether it was test or live.` : 'No payment has been captured.' });

  const rf = d.refunds;
  if (isErr(rf)) steps.push({ label: 'A refund has been exercised', state: 'skip', note: slotMsg(rf) });
  else steps.push({ label: 'A refund has been exercised', state: rf.last_refund_processed_at ? 'pass' : 'fail', note: rf.last_refund_processed_at ? `The last processed ${relTime(rf.last_refund_processed_at)}.` : 'No refund has been processed.' });

  steps.push(byCheck('plan_features', 'Every paid plan has its features set (BILLING §19.3)'));

  const w = d.wall;
  if (isErr(w)) steps.push({ label: 'No grandfathered member would be walled (BILLING §19.4)', state: 'skip', note: slotMsg(w) });
  else steps.push({ label: 'No grandfathered member would be walled (BILLING §19.4)', state: num(w.grandfathered_walled) === 0 ? 'pass' : 'fail', note: `${w.grandfathered_walled} grandfathered member(s) would be walled.` });
  return steps;
}

/* ---- drawing ------------------------------------------------------ */

const LEVEL = { ok: ['OK', 'ok'], warn: ['Needs a look', 'warn'], info: ['Info', 'neutral'], unknown: ['Unknown', 'neutral'] };
const LABEL = (k) => { const t = String(k).replace(/_seconds$/, '').replace(/_/g, ' '); return t[0].toUpperCase() + t.slice(1); };

function factValue(k, v) {
  if (v == null) return '—';
  if (typeof v === 'string' && /not observable/i.test(v)) return pill('Not observable', 'neutral', { title: v });
  if (/_age_seconds$/.test(k)) return duration(v) + ' old';
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return h('time', { datetime: v, title: absTime(v), text: relTime(v) });
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return null;
  return String(v);
}
function facts(obj) {
  const dl = h('dl.ad-facts');
  for (const [k, v] of Object.entries(obj || {})) {
    const val = factValue(k, v);
    if (val === null) continue;
    dl.append(h('dt', { text: LABEL(k) }), h('dd', {}, [val]));
  }
  return dl;
}

function sectionsBody(s) {
  const missing = Array.isArray(s.missing) ? s.missing : [];
  const body = [facts({ expected: s.expected, present: Array.isArray(s.present) ? s.present.length : null })];
  if (missing.length) body.push(checklist(missing.map((m) => ({ label: `§${m.section}`, state: 'fail', note: `marker not found: ${m.marker}` }))));
  if (Array.isArray(s.weak_markers) && s.weak_markers.length) body.push(h('p.ad-meta', { text: `§${s.weak_markers.join(', §')} are weak markers: finding one proves the object, not that every statement of its section ran.` }));
  return body;
}
function featuresBody(rows) {
  if (!rows.length) return [h('p.ad-meta', { text: 'The server returned no paid plan rows.' })];
  const t = h('table.ad-table');
  t.append(h('thead', {}, [h('tr', {}, ['Plan', 'Features on', 'Of keys', 'State'].map((x) => h('th', { scope: 'col', text: x })))]));
  const tb = h('tbody');
  for (const r of rows) tb.append(h('tr', {}, [
    h('td', {}, [h('strong', { text: r.plan }), r.active === false ? ' (not on offer)' : '']),
    h('td.is-end', { text: String(r.enabled) }), h('td.is-end', { text: String(r.keys) }),
    h('td', {}, [r.empty ? pill('Empty map', 'danger') : pill('Set', 'ok')])
  ]));
  t.append(tb);
  return [h('div.ad-dt-scroll', {}, [t])];
}

const SLOTS = [
  { key: 'sections', title: 'Schema sections', check: 'sections', body: sectionsBody },
  { key: 'plan_features', title: 'Plan features', check: 'plan_features', body: featuresBody },
  { key: 'purchases_required', title: 'Purchases switch', check: 'purchases_required', body: (v) => [facts({ purchases_required: v })] },
  { key: 'trial_offer', title: 'Trial', check: 'trial_offer' },
  { key: 'price_notice', title: 'Prices', check: 'price_notice' },
  { key: 'receipts', title: 'Receipts', check: 'receipts' },
  { key: 'payments', title: 'Payments', check: 'payments_created' },
  { key: 'refunds', title: 'Refunds', check: 'refunds' },
  { key: 'invite_requests', title: 'Invite requests', check: 'invite_requests' },
  { key: 'wall', title: 'Purchase wall census', check: 'purchase_wall' },
  { key: 'billing_settings_last_touched', title: 'Billing settings last changed', check: null }
];

function slotCard(def) {
  const v = H.data[def.key];
  const c = def.check ? check(def.check) : null;
  const bad = isErr(v);
  const [word, tone] = bad ? LEVEL.unknown : (c && LEVEL[c.level]) || ['', 'neutral'];
  const body = [];
  if (bad) body.push(h('p.ad-unk', { role: 'status', text: slotMsg(v) + '. Nothing here is a pass.' }));
  else {
    if (c && c.observed) body.push(h('p.ad-meta', { text: c.observed }));
    if (def.body) body.push(...def.body(v));
    else body.push(facts(v));
  }
  return h('section.ad-card.ad-hc', { 'aria-label': def.title }, [
    h('div.ad-hc-h', {}, [h('h3.ad-card-h', { text: def.title }), word ? pill(word, tone) : null]),
    ...body
  ]);
}

function probeCard(ctx) {
  const env = ctx.env;
  const rs = resendInference();
  const list = h('ul.ad-probe');
  for (const fn of FUNCTIONS) {
    const r = P.res[fn];
    const kind = P.phase === 'running' ? 'wait' : probeKind(r);
    const [word, tone] = PROBE_WORD[kind];
    const detail = !r ? (P.phase === 'running' ? 'Probing…' : 'Not probed yet')
      : r.status === 0 ? `No readable answer${r.msg ? ' (' + r.msg + ')' : ' (a network error or a CORS refusal look the same to a page)'}`
      : r.status === -1 ? `Deployed: ${r.msg}`
      : `HTTP ${r.status}${r.msg ? ': ' + r.msg : ''}`;
    list.append(h('li', {}, [h('code', { text: fn }), pill(word, tone), h('span.ad-meta', { text: detail })]));
  }
  return h('section.ad-card.ad-hc', { 'aria-label': 'Payment functions' }, [
    h('div.ad-hc-h', {}, [h('h3.ad-card-h', { text: 'Payment functions' }),
      h('button.btn', { type: 'button', 'data-action': 'health-probe', disabled: P.phase === 'running' ? '' : null, text: P.phase === 'running' ? 'PROBING…' : 'RE-PROBE' })]),
    h('p.ad-meta', { text: 'An unauthenticated POST to each function. 401, 400 and 503 are answers from a deployed function; 404 is a missing one.' }),
    list,
    P.at ? h('p.ad-meta', {}, ['Probed ', h('time', { datetime: new Date(P.at).toISOString(), title: absTime(P.at), text: relTime(P.at) }), '.']) : null,
    h('dl.ad-facts', {}, [
      h('dt', { text: 'Razorpay mode' }),
      h('dd', {}, [env ? pill(env, env === 'LIVE' ? 'danger' : 'warn', { title: 'From the public key id’s prefix' }) : pill('Not set', 'neutral')]),
      h('dt', { text: 'Resend' }),
      h('dd', {}, [pill(rs.kind === 'ok' ? 'Inferred working' : rs.kind === 'warn' ? 'Inferred failing' : 'Not observable', rs.kind === 'ok' ? 'ok' : rs.kind === 'warn' ? 'warn' : 'neutral', { title: 'Inferred: the secret is not readable' }),
        h('span.ad-meta', { text: ' ' + rs.text })]),
      h('dt', { text: 'Last webhook seen' }),
      h('dd', {}, [pill('Not observable', 'neutral', { title: 'No table records a webhook delivery' })])
    ])
  ].filter(Boolean));
}

function receiptsCard() {
  const rows = receiptRows();
  const card = h('section.ad-card.ad-hc', { 'aria-label': 'Receipts not mailed' }, [
    h('div.ad-hc-h', {}, [h('h3.ad-card-h', { text: 'Receipts not mailed' }), I.phase === 'ok' ? pill(String(rows.length), rows.length ? 'warn' : 'ok') : null])
  ]);
  if (I.phase === 'loading' || I.phase === 'idle') { card.append(skeleton({ kind: 'rows', count: 2 })); return card; }
  if (I.phase === 'error') { card.append(errorState({ title: 'The invoices could not load', why: I.error, onRetry: () => loadInvoices() })); return card; }
  if (!rows.length) { card.append(emptyState({ title: 'Every receipt has a mail recorded', body: 'Invoices with a buyer e-mail and no mail time would be listed here.', stamp: true, icon: '✓' })); return card; }
  card.append(h('p.ad-meta', { text: 'An invoice with a buyer e-mail and no mail recorded. Older ones may pre-date receipt mailing. Resend clears the mark so the receipt is queued again.' }));
  card.append(dataTable({
    caption: `${rows.length} waiting`,
    columns: [
      { key: 'number', label: 'Invoice' },
      { key: 'buyer_email', label: 'Buyer' },
      { key: 'amount_paise', label: 'Amount', align: 'end', render: (r) => fmtPaise(r.amount_paise) },
      { key: 'issued_at', label: 'Issued', render: (r) => h('time', { datetime: r.issued_at, title: absTime(r.issued_at), text: relTime(r.issued_at) }) },
      { key: 'id', label: '', render: (r) => h('button.btn', { type: 'button', 'data-action': 'receipt-resend', 'data-id': r.id, 'aria-label': 'Resend the receipt for ' + r.number, text: 'RESEND' }) }
    ],
    rows: rows.slice(0, 25)
  }));
  return card;
}

/* ---- the switch --------------------------------------------------- */

const switchOn = () => (H.data && typeof H.data.purchases_required === 'boolean' ? H.data.purchases_required : null);

function previewBlock() {
  if (W.phase === 'loading' || W.phase === 'idle') return skeleton({ kind: 'block', count: 1 });
  if (W.phase === 'error') return errorState({ title: 'Who it would wall could not load', why: W.error, onRetry: () => loadPreview() });
  const p = W.data || {};
  const wall = num(p.would_wall_count);
  const parts = [h('p.ad-sw-line', {}, [
    h('strong', { text: `${wall} ${wall === 1 ? 'member' : 'members'}` }),
    ` would be walled (${num(p.would_wall_after_grants)} once e-mail grants are counted), of ${num(p.census && p.census.members)} members: ${num(p.census && p.census.paid)} paid, ${num(p.census && p.census.in_trial)} in a trial.`
  ])];
  if (!p.can_throw) parts.push(h('p.ad-unk', { role: 'status', text: `The server will refuse: ${num(p.blocked_by_grandfathered)} member(s) admitted before purchases existed, whose grandfathered access has run out, would be walled. Give them a plan, a longer trial or an e-mail grant first.` }));
  if (Array.isArray(p.members) && p.members.length) {
    parts.push(h('details.ad-sw-who', {}, [
      h('summary', { text: `Who would be walled (${p.members.length}${p.truncated ? ' of ' + wall : ''})` }),
      dataTable({
        columns: [
          { key: 'email', label: 'Member', render: (r) => r.email || r.user_id },
          { key: 'member_since', label: 'Since', render: (r) => (r.member_since ? absTime(r.member_since) : '—') },
          { key: 'trial_ends_at', label: 'Trial ended', render: (r) => (r.trial_ends_at ? relTime(r.trial_ends_at) : '—') },
          { key: 'f', label: 'Notes', render: (r) => [r.grandfathered ? 'grandfathered' : '', r.email_grant ? 'has an e-mail grant' : ''].filter(Boolean).join(', ') || '—' }
        ],
        rows: p.members.slice(0, 50), caption: p.truncated ? 'The server lists the first 500.' : ''
      })
    ]));
  }
  return h('div.ad-sw-prev', {}, parts);
}

function switchBlock() {
  const on = switchOn();
  const box = h('div.ad-sw', {}, [h('h4.ad-sw-h', { text: 'The purchases switch' })]);
  if (H.phase !== 'ok') { box.append(h('p.ad-meta', { text: 'Waiting for the live state.' })); return box; }
  if (isErr(H.data.purchases_required) || on === null) {
    box.append(h('p.ad-unk', { role: 'status', text: 'The switch’s state is unknown: ' + (isErr(H.data.purchases_required) ? slotMsg(H.data.purchases_required) : 'the server did not answer it') + '. Neither button is offered.' }));
    return box;
  }
  box.append(h('p.ad-sw-line', {}, ['Purchases required is ', pill(on ? 'ON' : 'OFF', on ? 'warn' : 'neutral', { dot: true }), on ? ' — a member with no plan and no trial is walled.' : ' — nobody is walled; every signed-in member is in.']));
  if (!on) {
    box.append(previewBlock());
    const blocked = W.phase === 'ok' && W.data && W.data.can_throw === false;
    box.append(h('div.ad-actions', {}, [
      h('button.btn.primary.ad-danger', { type: 'button', 'data-action': 'switch-throw', disabled: SW.busy || blocked || W.phase !== 'ok' ? '' : null, text: SW.busy ? 'WORKING…' : 'REQUIRE PURCHASES' }),
      h('span.ad-meta', { text: 'You will be asked to type REQUIRE. The server refuses the switch while it would wall a grandfathered member.' })
    ]));
  } else {
    const left = T.at ? T.at + DAY - Date.now() : null;
    if (T.phase === 'error') box.append(h('p.ad-meta', { text: `When it was turned on could not be read from the audit log (${T.error}), so the 24-hour window is unknown. Rollback is offered anyway: the server never refuses it.` }));
    else if (T.at == null) box.append(h('p.ad-meta', { text: 'The audit log has no row that turned it on, so the 24-hour window is unknown. Rollback is available anyway: the server never refuses it.' }));
    else if (left > 0) box.append(h('p.ad-meta', {}, ['Turned on ', h('time', { datetime: new Date(T.at).toISOString(), title: absTime(T.at), text: relTime(T.at) }), `. One-click rollback stays here for ${duration(left / 1000)} more.`]));
    else box.append(h('p.ad-meta', {}, ['Turned on ', h('time', { datetime: new Date(T.at).toISOString(), title: absTime(T.at), text: relTime(T.at) }), '. The 24-hour rollback window has passed; it can still be turned off from Purchases.']));
    const offer = T.phase === 'error' || T.at == null || left > 0;
    box.append(h('div.ad-actions', {}, [
      offer ? h('button.btn.ad-danger', { type: 'button', 'data-action': 'switch-rollback', disabled: SW.busy ? '' : null, text: SW.busy ? 'WORKING…' : 'ROLL BACK: PURCHASES NOT REQUIRED' })
        : h('a.btn', { href: '#purchases', text: 'OPEN PURCHASES' })
    ]));
  }
  if (SW.msg) box.append(h('p' + (SW.msg.tone === 'danger' ? '.ad-unk' : '.ad-meta'), { role: SW.msg.tone === 'danger' ? 'alert' : 'status', text: SW.msg.text }));
  return box;
}

function launchCard(ctx) {
  const steps = launchSteps(ctx);
  const failing = steps.filter((s) => s.state === 'fail').length;
  const unsure = steps.filter((s) => s.state === 'skip' || s.state === 'wait').length;
  return h('section.ad-card.ad-hc.ad-launch', { 'aria-label': 'Launch checklist' }, [
    h('div.ad-hc-h', {}, [h('h3.ad-card-h', { text: 'Launch checklist' }),
      H.phase === 'ok' ? pill(failing ? `${failing} failing` : unsure ? `${unsure} unconfirmed` : 'All passing', failing ? 'warn' : unsure ? 'neutral' : 'ok') : null]),
    h('p.ad-meta', { text: 'The order BILLING.md §19 gives for throwing the switch. Each step is read live; a step the page cannot see is “not checked”, never a pass.' }),
    checklist(steps),
    switchBlock()
  ]);
}

/* ---- the tab ------------------------------------------------------- */

export function render(ctx) {
  ctxRef = ctx;
  if (H.phase === 'idle' && hashParts().tab === 'health') loadAll();
  if (wantProbes()) runProbes();

  const root = h('div.ad-health', {});
  root.append(h('div.ad-hbar', {}, [
    h('span.ad-meta', {}, H.phase === 'ok' && !H.busy ? ['Read ', h('time', { datetime: new Date(H.at).toISOString(), title: absTime(H.at), text: relTime(H.at) }), ' from the live project.'] : [H.phase === 'loading' || H.busy ? 'Reading the live project…' : '']),
    h('button.btn', { type: 'button', 'data-action': 'health-refresh', disabled: H.phase === 'loading' || H.busy ? '' : null, text: 'REFRESH' })
  ]));

  if (H.phase === 'idle' || H.phase === 'loading') { root.append(skeleton({ kind: 'kpi', count: 3 }), skeleton({ kind: 'block', count: 2 })); }
  else if (H.phase === 'error') {
    root.append(errorState({ title: 'The health report could not load', why: H.error, onRetry: () => loadAll() }));
  } else {
    const checks = Array.isArray(H.data.checks) ? H.data.checks : [];
    const count = (l) => checks.filter((c) => c.level === l).length;
    root.append(h('div.ad-stats.ad-kpis', {}, [
      kpi({ label: 'Checks OK', value: `${count('ok')} of ${checks.length}` }),
      kpi({ label: 'Need a look', value: count('warn'), attention: count('warn') > 0 }),
      kpi({ label: 'Unknown', value: count('unknown'), sub: count('unknown') ? 'could not be read' : '', attention: count('unknown') > 0 })
    ]));
  }
  root.append(launchCard(ctx));
  root.append(h('div.ad-cols', {}, [probeCard(ctx), receiptsCard()]));
  if (H.phase === 'ok') root.append(h('div.ad-hgrid', {}, SLOTS.filter((s) => s.key in H.data).map(slotCard)));
  return root;
}

/** The sub-nav count: checks that need a look or could not be read. */
export function badge() {
  if (H.phase !== 'ok' || !H.data || !Array.isArray(H.data.checks)) return null;
  return H.data.checks.filter((c) => c.level === 'warn' || c.level === 'unknown').length;
}

/* ---- handlers: delegated, once, on document ----------------------- */

delegate(document, 'click', '[data-action="health-refresh"]', () => { loadAll(); });
delegate(document, 'click', '[data-action="health-probe"]', () => { runProbes(); });
window.addEventListener('hashchange', () => { if (ctxRef && hashParts().tab === 'health') { if (H.phase === 'idle') loadAll(); if (wantProbes()) runProbes(); } });

delegate(document, 'click', '[data-action="receipt-resend"]', async (e, el) => {
  const row = I.rows.find((r) => r.id === el.dataset.id);
  if (!row) return;
  const ok = await ask({
    title: 'Queue this receipt again?',
    body: `This clears the “mailed” mark on invoice ${row.number}, so the receipt to ${row.buyer_email} is queued again. It writes to a customer.`,
    confirm: 'Resend'
  });
  if (!ok) return;
  try {
    await callRpc(cloud(), 'admin_resend_receipt', { p_invoice: row.id });
    StudioUI.toast(`Receipt for ${row.number} queued again.`, { action: 'View in audit log', onAction: () => ctxRef && ctxRef.go('audit', { target: row.id }) });
    loadAll();
  } catch (err) { StudioUI.toast(err.message, { type: 'error' }); }
});

async function setSwitch(on) {
  SW.busy = true; SW.msg = null; again();
  try {
    await callRpc(cloud(), 'admin_set_billing_settings', { p_patch: { purchase_required: on } });
    T.at = on ? Date.now() : null; T.phase = 'ok';
    SW.msg = { tone: 'ok', text: on ? 'Purchases are now required.' : 'Purchases are no longer required; everyone is back in.' };
    StudioUI.toast(on ? 'Purchases are now required.' : 'Purchases are no longer required.', { action: 'View in audit log', onAction: () => ctxRef && ctxRef.go('audit', { target: 'billing_settings:global' }) });
    if (ctxRef && ctxRef.refresh) ctxRef.refresh();
  } catch (e) {
    /* The server's own sentence (the grandfathered refusal carries hint
       'grandfathered'), shown as a sentence on the card, not a toast. */
    SW.msg = { tone: 'danger', text: e.message };
  }
  SW.busy = false;
  loadAll();
}

delegate(document, 'click', '[data-action="switch-throw"]', async () => {
  const steps = launchSteps(ctxRef || { env: null });
  const notPassing = steps.filter((s) => s.state !== 'pass');
  const wall = W.data ? num(W.data.would_wall_count) : null;
  const ok = await ask({
    title: 'Require a plan to use the studio?',
    body: `${wall == null ? 'Some members' : wall + ' member(s)'} will be walled until they buy a plan or start a trial. ` +
      (notPassing.length ? `Not passing: ${notPassing.map((s) => s.label.replace(/ \(BILLING[^)]*\)/, '')).join('; ')}. ` : 'Every launch step is passing. ') +
      'Rollback stays one click away for 24 hours.',
    confirm: 'Require purchases', danger: true, typeToConfirm: 'REQUIRE'
  });
  if (ok) setSwitch(true);
});
delegate(document, 'click', '[data-action="switch-rollback"]', async () => {
  const ok = await ask({
    title: 'Stop requiring purchases?',
    body: 'Everyone who is walled is let back in at once. No plan or trial is changed.',
    confirm: 'Roll back', danger: true
  });
  if (ok) setSwitch(false);
});

export default { render, badge };
