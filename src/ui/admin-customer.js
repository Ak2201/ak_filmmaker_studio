/* ============================================================
   ADMIN CUSTOMER — the Customer 360 drawer
   ------------------------------------------------------------
   One person, one sheet. admin.html#people?user=<id> opens it (the hash
   is admin-kit's; this file only registers what `user` means), and any
   row that names a person can open it with openUser(id).

   WHAT IT READS: admin_customer(p_user), one jsonb — identity, standing,
   trial clock, payments, invoices, refunds and requests, referral,
   sessions and devices, work, orgs, notes, an audit slice (schema §42).
   WORK IS COUNTS AND SIZES, NEVER CONTENT: the server sends no title and
   no project_data value, and this file draws none.

   WHAT IT WRITES, each behind ask() from dialog.js with the CONSEQUENCE
   in the sentence: admin_add_note, admin_grant_trial, admin_grant_plan,
   admin_issue_invoice, admin_terminate_session, admin_reset_user (typed
   confirmation of the e-mail). No action here has a native confirm.

   ROLES ARE HIDING, NOT A BOUNDARY. studio_role() says owner / finance /
   support, and buttons the role cannot press are not drawn. The server
   re-checks every call (require_role, 42501); when it refuses, its own
   sentence is shown as it came, not a generic "failed".

   REGISTERED FROM THIS MODULE'S IMPORT. admin.js imports support.js,
   which imports this, so registerDrawer('user', …) has run before the
   first syncDrawerFromHash(). Nothing in admin.js names this file.

   Handlers: one delegated listener per event on [data-cu-act] and
   [data-cu-form], installed once. No inline handlers.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { registerDrawer, openDrawer, closeDrawer, pill, kpi, meter, timeline, errorState, skeleton, absTime, relTime } from './admin-kit.js';
import { ask, askDanger } from './dialog.js';
import Billing, { planName } from '../lib/billing.js';
import { fmtMinor } from '../lib/price-model.js';
import { trialLength } from '../lib/trial-time.js';
import { errorSentence } from '../lib/gate.js';
import { customerCall } from '../lib/admin-api.js';

/* ---- talking to the server ---------------------------------------- */

/* The call itself is src/lib/admin-api.js's (rule V2); this keeps the
   name the drawer and the Support tab import. */
export function rpc(name, args) { return customerCall(window.StudioCloud, name, args); }
const isMissingFn = (e) => !!e && (e.code === 'Pgrst202' || e.code === '42883' || /Could not find|does not exist/i.test(String(e.message || '')));
const sentence = (e, fallback) => errorSentence(e, fallback || 'That did not work.');

const toast = (msg, type, opts) => {
  if (window.StudioUI && window.StudioUI.toast) window.StudioUI.toast(msg, Object.assign(type ? { type } : {}, opts || {}));
};
const wrote = (msg) => toast(msg, 'success', {
  action: 'View in audit log',
  onAction: () => { closeDrawer(); location.hash = '#audit'; }
});

/* ---- roles --------------------------------------------------------- */

let role;                 // undefined = not asked yet, null = not an admin
let rolePromise = null;
/** owner | finance | support. Resolves 'owner' where §45 has not run: every
 *  admin was one before roles existed, and the server decides anyway. */
export function studioRole() {
  if (!rolePromise) {
    rolePromise = rpc('studio_role')
      .then((r) => { role = r || null; return role; })
      .catch((e) => { role = isMissingFn(e) ? 'owner' : null; return role; });
  }
  return rolePromise;
}
export const currentRole = () => role;
const CAPS = {
  notes:   ['owner', 'support', 'finance'],
  trial:   ['owner', 'support'],
  plan:    ['owner', 'finance'],
  session: ['owner', 'support'],
  reset:   ['owner', 'support'],
  delete:  ['owner'],
  invoice: ['owner', 'finance'],
  money:   ['owner', 'finance'],
  ticket:  ['owner', 'support'],
  passes:  ['owner', 'support']
};
/** Whether this role is shown the control. Unknown role shows nothing to write. */
export const can = (cap, r = role) => !!r && (CAPS[cap] || []).includes(r);

const me = () => {
  const c = window.StudioCloud;
  const s = c && c.getSession && c.getSession();
  return { id: (s && s.user && s.user.id) || '', email: String((c && c.getUserEmail && c.getUserEmail()) || '').toLowerCase() };
};

/* ---- small formatters ---------------------------------------------- */

const n = (v) => (Number(v) || 0).toLocaleString();
export function fmtBytes(b) {
  const v = Number(b) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(v < 10485760 ? 1 : 0) + ' MB';
  return (v / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
const when = (ts) => (ts ? h('time.ad-when', { datetime: new Date(ts).toISOString(), title: absTime(ts), text: relTime(ts) }) : '—');
const dateOnly = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
export function browserOf(ua) {
  const u = String(ua || '');
  const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  const os = /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Linux/.test(u) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' on ');
}
const clock = (secs) => {
  const s = Math.max(0, Number(secs) || 0);
  if (s >= 86400) return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
};
const PAY_TONE = { paid: 'ok', granted: 'accent', pending: 'warn', created: 'warn', failed: 'danger', refunded: 'neutral', partially_refunded: 'neutral' };
const STATUS_TONE = { pending: 'warn', approved: 'accent', declined: 'neutral', processed: 'ok', failed: 'danger' };
const humanise = (s) => String(s || '').replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* ---- the state of the open drawer ---------------------------------- */

let cur = null;   // { id, data, body, titleHost, subHost, actsHost, collapsed:Set, plans }

const facts = (rows) => h('dl.cu-dl', {}, rows.filter(Boolean).flatMap(([k, v]) => [
  h('dt', { text: k }),
  h('dd', {}, [v == null || v === '' ? '—' : (v instanceof Node ? v : String(v))])
]));
const none = (text) => h('p.cu-none', { text });

function section(key, title, content, { count, tone } = {}) {
  const det = h('details.cu-sec', { 'data-cu-sec': key, open: cur && cur.collapsed.has(key) ? null : '' }, [
    h('summary.cu-sec-h', { tabindex: '0' }, [
      h('span.cu-sec-t', { text: title }),
      count != null ? pill(String(count), tone || 'neutral') : null
    ]),
    h('div.cu-sec-b', {}, [content])
  ]);
  return det;
}

/** How this person stands, as one pill and one line. */
export function standing(d) {
  const s = d.standing || {}, t = d.trial || {};
  const plan = s.plan && s.plan !== 'free' ? s.plan : '';
  if (s.disabled_at) return { label: 'Disabled', tone: 'danger', line: 'Their session ended and sync stopped ' + relTime(s.disabled_at) + '.' };
  if (!s.is_member) return { label: 'Not a member', tone: 'neutral', line: 'Signed in with Google but has not been let in.' };
  if (plan) return { label: 'Paying · ' + planName(plan), tone: 'ok', line: 'On the ' + planName(plan) + ' plan.' };
  if (s.grandfathered) return { label: 'Grandfathered', tone: 'accent', line: 'Admitted before purchases were required; a year-long trial stands in for a plan.' };
  if (t.active) return { label: 'On trial', tone: 'accent', line: 'Trial ends ' + relTime(t.ends_at) + '.' };
  if (s.purchases_required && !s.entitled) return { label: 'Walled', tone: 'danger', line: 'A member with no plan and no running trial: they meet the purchase wall.' };
  return { label: 'Member', tone: 'neutral', line: s.purchases_required ? 'A member.' : 'A member. Purchases are not required, so nothing is walled.' };
}

/* ---- the sections -------------------------------------------------- */

function identitySection(d) {
  const i = d.identity || {}, s = d.standing || {}, st = standing(d);
  const reds = d.redemptions || [];
  const grant = s.email_grant;
  const wrap = h('div.cu-stack', {}, [
    h('p.cu-line', {}, [pill(st.label, st.tone, { dot: true }), ' ', st.line]),
    facts([
      ['E-mail', i.email],
      ['Name', i.name],
      ['Joined', i.created_at ? h('span', {}, [dateOnly(i.created_at), ' ', when(i.created_at)]) : null],
      ['Last sign-in', i.last_sign_in_at ? when(i.last_sign_in_at) : null],
      ['E-mail confirmed', i.email_confirmed_at ? 'Yes' : 'No'],
      ['Role', s.is_member ? (s.role === 'admin' ? 'Administrator' : 'Member') : 'Not a member'],
      ['Member since', s.member_since ? dateOnly(s.member_since) : null],
      ['Plan', s.plan && s.plan !== 'free' ? planName(s.plan) : 'No plan'],
      ['Entitled', s.entitled ? 'Yes' + (!s.purchases_required ? ' (purchases are not required)' : '') : 'No'],
      ['Admitted by', s.admitted_by ? humanise(s.admitted_by.pass_type) + (s.admitted_by.label ? ' · ' + s.admitted_by.label : '') : null],
      ['E-mail grant', grant ? [humanise(grant.role), grant.plan ? planName(grant.plan) : 'no plan', grant.until ? 'until ' + dateOnly(grant.until) : 'until removed', grant.applied ? 'applied' : 'waiting for first sign-in'].join(' · ') : null],
      ['User id', h('code.cu-code', { text: i.id })]
    ])
  ]);
  if (reds.length) {
    wrap.append(h('h4.cu-h4', { text: 'Codes used' }), h('ul.cu-list', {}, reds.map((r) => h('li', {}, [
      humanise(r.pass_type) + (r.label ? ' · ' + r.label : ''), ' ', when(r.redeemed_at)]))));
  }
  return section('identity', 'Identity & standing', wrap);
}

function trialSection(d) {
  const t = d.trial || {};
  if (!t.started_at) return section('trial', 'Trial clock', none('No trial has been started for this person.'));
  const tone = t.active ? 'ok' : 'neutral';
  return section('trial', 'Trial clock', facts([
    ['State', pill(t.active ? 'Running' : 'Ended', tone, { dot: true })],
    ['Started', h('span', {}, [dateOnly(t.started_at), ' ', when(t.started_at)])],
    ['Length', trialLength(t.minutes) || (t.minutes != null ? t.minutes + ' minutes' : null)],
    ['Source', humanise(t.source)],
    ['Covers', humanise(t.scope)],
    ['Ends', t.ends_at ? h('span', {}, [absTime(t.ends_at), ' ', when(t.ends_at)]) : null],
    ['Time left', t.active && t.seconds_left != null ? clock(t.seconds_left) : null]
  ]));
}

/* §56: an amount is in minor units of ITS row's currency (rupees when
   the row says none); a refund row carries the payment's. */
const money = (minor, row) => fmtMinor(minor || 0, row && row.currency === 'USD' ? 'USD' : 'INR');
function payRow(p, invoices) {
  const hasInvoice = invoices.some((i) => i.payment_id === p.id);
  const issue = can('invoice') && p.status === 'paid' && Number(p.amount_paise) > 0 && !hasInvoice
    ? h('button.btn.cu-mini', { type: 'button', 'data-cu-act': 'invoice', 'data-id': p.id, 'aria-label': 'Issue an invoice for ' + money(p.amount_paise, p), text: 'Issue invoice' })
    : null;
  return h('li.cu-row', {}, [
    h('div.cu-row-main', {}, [
      h('strong', { text: p.plan_id ? planName(p.plan_id) : 'Payment' }),
      pill(humanise(p.status), PAY_TONE[p.status] || 'neutral'),
      h('span.cu-amt', { text: money(p.amount_paise, p) }),
      /* "Intl card" (§56 C4): Razorpay said the card was issued abroad.
         Recorded and shown; never blocked or re-priced. */
      p.international === true ? pill('Intl card' + (p.card_country ? ' · ' + p.card_country : ''), 'neutral') : null
    ].filter(Boolean)),
    h('div.cu-row-sub', {}, [
      when(p.paid_at || p.created_at),
      p.period ? ' · ' + humanise(p.period) : '',
      p.promo_code ? ' · code ' + p.promo_code : '',
      Number(p.discount_paise) ? ' · ' + money(p.discount_paise, p) + ' off' : '',
      p.razorpay_payment_id ? h('code.cu-code', { title: 'Razorpay payment id', text: p.razorpay_payment_id }) : null,
      hasInvoice ? ' · invoiced' : ''
    ]),
    issue
  ]);
}

function paymentsSection(d) {
  const pays = d.payments || [], inv = d.invoices || [];
  return section('payments', 'Payments', pays.length
    ? h('ul.cu-rows', {}, pays.map((p) => payRow(p, inv)))
    : none('No payments.'), { count: pays.length });
}
function invoicesSection(d) {
  const inv = d.invoices || [];
  return section('invoices', 'Invoices', inv.length
    ? h('ul.cu-rows', {}, inv.map((i) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: i.number }), h('span.cu-amt', { text: money(i.amount_paise, i) })]),
      h('div.cu-row-sub', {}, [i.plan_name || '', ' · ', when(i.issued_at), i.emailed_at ? ' · e-mailed ' : ' · not e-mailed', i.emailed_at ? when(i.emailed_at) : null])
    ])))
    : none('No invoices.'), { count: inv.length });
}
function refundsSection(d) {
  const rf = d.refunds || [], rq = d.refund_requests || [];
  const wrap = h('div.cu-stack');
  if (!rf.length && !rq.length) wrap.append(none('No refunds and no refund requests.'));
  if (rq.length) {
    wrap.append(h('h4.cu-h4', { text: 'Requests' }), h('ul.cu-rows', {}, rq.map((q) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: humanise(q.category) }), pill(humanise(q.status), STATUS_TONE[q.status] || 'neutral')]),
      h('div.cu-row-sub', {}, ['asked ', when(q.created_at), q.decided_at ? [' · decided ', when(q.decided_at)] : '']),
      q.message ? h('p.cu-quote', { text: q.message }) : null,
      q.admin_note ? h('p.cu-quote.is-note', { text: 'Our note: ' + q.admin_note }) : null
    ]))));
  }
  if (rf.length) {
    wrap.append(h('h4.cu-h4', { text: 'Refunds' }), h('ul.cu-rows', {}, rf.map((r) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: money(r.amount_paise, r.currency ? r : (d.payments || []).find((x) => x.id === r.payment_id)) }), pill(humanise(r.status), STATUS_TONE[r.status] || 'neutral')]),
      h('div.cu-row-sub', {}, [when(r.created_at), r.reason ? ' · ' + r.reason : ''])
    ]))));
  }
  if (can('money')) wrap.append(h('p.cu-meta', {}, [h('a', { href: '#refunds', 'data-cu-act': 'leave', text: 'Refunds are decided in Purchases →' })]));
  return section('refunds', 'Refunds & requests', wrap, { count: rf.length + rq.length, tone: rq.some((q) => q.status === 'pending') ? 'warn' : 'neutral' });
}
function referralSection(d) {
  const r = d.referral || {}, cr = r.credits || [];
  return section('referral', 'Referral', h('div.cu-stack', {}, [
    facts([['Code', r.code ? h('code.cu-code', { text: r.code }) : 'None']]),
    cr.length ? h('ul.cu-rows', {}, cr.map((c) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: money(c.amount_paise, null) }), pill(humanise(c.status), c.status === 'paid' ? 'ok' : 'warn')]),
      h('div.cu-row-sub', {}, [when(c.created_at), c.paid_at ? [' · paid ', when(c.paid_at)] : ''])])))
      : none('No referral credits.')
  ]), { count: cr.length });
}

const isLive = (hb) => hb && Date.now() - Date.parse(hb) < 90000;
function sessionsSection(d) {
  const s = d.sessions || {}, lock = s.device_lock, auth = s.auth;
  const wrap = h('div.cu-stack');
  if (lock) {
    wrap.append(facts([
      ['Device', [browserOf(lock.user_agent), lock.client_ip].filter(Boolean).join(' · ') || null],
      ['State', pill(isLive(lock.last_heartbeat) ? 'Active now' : 'Idle', isLive(lock.last_heartbeat) ? 'ok' : 'neutral', { dot: true })],
      ['Last heartbeat', lock.last_heartbeat ? when(lock.last_heartbeat) : null]
    ]));
  } else wrap.append(none('No device holds the one-window lock.'));
  if (auth === null || auth === undefined) {
    wrap.append(h('p.cu-meta', { text: 'The sign-in provider’s session table did not answer, so sign-ins are not listed.' }));
  } else {
    wrap.append(facts([['Signed-in sessions', n(auth.count)], ['Last active', auth.last_active ? when(auth.last_active) : null]]));
    if ((auth.recent || []).length) {
      wrap.append(h('ul.cu-list', {}, auth.recent.map((r) => h('li', {}, [
        [browserOf(r.user_agent) || 'Unknown device', r.ip ? ' · ' + r.ip : ''].join(''), ' ', when(r.created_at)]))));
    }
  }
  const self = me();
  const isSelf = String((d.identity || {}).email || '').toLowerCase() === self.email;
  const mayEnd = can('session') && lock && isLive(lock.last_heartbeat);
  const mayDisable = can('session') && (d.standing || {}).is_member && !(d.standing || {}).disabled_at && (d.standing || {}).role !== 'admin' && !isSelf;
  if (mayEnd || mayDisable) {
    wrap.append(h('div.cu-btns', {}, [
      mayEnd ? h('button.btn', { type: 'button', 'data-cu-act': 'end-session', text: 'End session' }) : null,
      mayDisable ? h('button.btn.danger', { type: 'button', 'data-cu-act': 'disable', text: 'Disable' }) : null
    ]));
  }
  return section('sessions', 'Sessions & devices', wrap);
}

function workSection(d) {
  const w = d.work || {}, scopes = w.scopes || [];
  const fm = Object.entries(w.formats || {}).map(([k, v]) => `${v} ${k}`).join(', ');
  const wrap = h('div.cu-stack', {}, [
    h('div.ad-stats.cu-kpis', {}, [
      kpi({ label: 'Films', value: n(w.projects), sub: fm }),
      kpi({ label: 'Stored', value: fmtBytes(w.total_bytes) }),
      kpi({ label: 'Last sync', value: w.last_sync ? relTime(w.last_sync) : 'Never', title: absTime(w.last_sync) })
    ]),
    facts([['Collaborating on', n(w.collaborating_on)], ['Share links made', n(w.shares_created)]])
  ]);
  if (scopes.length) {
    const max = Math.max(1, ...scopes.map((x) => Number(x.bytes) || 0));
    wrap.append(h('h4.cu-h4', { text: 'By kind of data' }), h('div.cu-meters', {}, scopes.map((x) =>
      meter({ value: x.bytes, max, tone: 'ok', label: `${humanise(x.scope)} · ${n(x.rows)} row${Number(x.rows) === 1 ? '' : 's'}`, format: fmtBytes }))));
  }
  wrap.append(h('p.cu-meta', { text: 'Counts and sizes only. Titles and contents are never shown in the console.' }));
  return section('work', 'Work', wrap);
}

function orgsSection(d) {
  const o = d.orgs || {}, own = o.owned || [], mem = o.member_of || [];
  const wrap = h('div.cu-stack');
  if (!own.length && !mem.length) wrap.append(none('Not part of an organisation.'));
  if (own.length) {
    wrap.append(h('h4.cu-h4', { text: 'Owns' }), h('ul.cu-rows', {}, own.map((a) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: a.name || 'Untitled' }), pill(a.plan ? planName(a.plan) : 'No plan', 'neutral')]),
      h('div.cu-row-sub', { text: `${n(a.seats_used)} of ${n(a.seat_limit)} seats` + (a.storage_limit_mb ? ` · ${n(a.storage_limit_mb)} MB storage` : '') + (a.plan_until ? ' · until ' + dateOnly(a.plan_until) : '') })
    ]))));
  }
  if (mem.length) {
    wrap.append(h('h4.cu-h4', { text: 'Member of' }), h('ul.cu-rows', {}, mem.map((a) => h('li.cu-row', {}, [
      h('div.cu-row-main', {}, [h('strong', { text: a.name || 'Untitled' }), pill(humanise(a.role), 'neutral'), a.status && a.status !== 'active' ? pill(humanise(a.status), 'warn') : null]),
      h('div.cu-row-sub', {}, [a.joined_at ? ['joined ', when(a.joined_at)] : ''])
    ]))));
  }
  return section('orgs', 'Organisations', wrap, { count: own.length + mem.length });
}

function notesSection(d, notes) {
  const wrap = h('div.cu-stack');
  if (can('notes')) {
    const ta = h('textarea#cuNote', { name: 'body', rows: '3', maxlength: '1000', required: true, 'aria-label': 'A note about this person', placeholder: 'What did you learn? Visible to administrators only.' });
    wrap.append(h('form.cu-note-form', { 'data-cu-form': 'note', autocomplete: 'off' }, [
      ta,
      h('div.cu-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'Add note' }), h('span.cu-meta', { text: 'Up to 1000 characters. Notes cannot be edited or deleted.' })])
    ]));
  }
  wrap.append(notes.length
    ? h('ul.cu-notes', {}, notes.map((x) => h('li.cu-note', {}, [
      h('div.cu-note-h', {}, [h('strong', { text: x.author_email || 'An administrator' }), when(x.at)]),
      h('p.cu-note-b', { text: x.body })
    ])))
    : none('No notes yet.'));
  return section('notes', 'Notes', wrap, { count: notes.length });
}

function auditSection(d) {
  const rows = d.audit || [];
  if (!rows.length) return section('audit', 'Audit slice', none('No admin has changed anything about this person.'));
  return section('audit', 'Audit slice', h('div.cu-stack', {}, [
    timeline(rows.map((r) => ({
      at: r.at, title: humanise(r.action), sub: [r.actor_email ? 'by ' + r.actor_email : '', r.note || ''].filter(Boolean).join(' — ') || null
    }))),
    h('p.cu-meta', {}, [h('a', { href: '#audit', 'data-cu-act': 'leave', text: 'The full log is in Audit log →' })])
  ]), { count: rows.length });
}

/** Give time / give a plan / clear: the only places a person is changed. */
function actionsSection(d) {
  const s = d.standing || {}, i = d.identity || {};
  const parts = [];
  if (can('trial')) {
    parts.push(h('form.cu-form', { 'data-cu-form': 'trial', autocomplete: 'off' }, [
      h('h4.cu-h4', { text: 'Give trial time' }),
      h('div.cu-fields', {}, [
        h('div', {}, [h('label', { for: 'cuTrialLen', text: 'For' }), h('select#cuTrialLen', { name: 'minutes' }, [
          ['60', '1 hour'], ['1440', '1 day'], ['4320', '3 days'], ['10080', '7 days'], ['43200', '30 days']].map(([v, l]) => h('option', { value: v, text: l, selected: v === '10080' ? '' : null })))]),
        h('div', {}, [h('label', { for: 'cuTrialNote', text: 'Note (optional)' }), h('input#cuTrialNote', { name: 'note', type: 'text', maxlength: '200', placeholder: 'Why' })])
      ]),
      h('button.btn.primary', { type: 'submit', text: 'Give time' })
    ]));
  }
  if (can('plan') && cur && cur.plans.length) {
    parts.push(h('form.cu-form', { 'data-cu-form': 'plan', autocomplete: 'off' }, [
      h('h4.cu-h4', { text: 'Grant a plan' }),
      h('div.cu-fields', {}, [
        h('div', {}, [h('label', { for: 'cuPlan', text: 'Plan' }), h('select#cuPlan', { name: 'plan' }, cur.plans.map((p) => h('option', { value: p.id, text: p.name || planName(p.id) })))]),
        h('div', {}, [h('label', { for: 'cuPlanDays', text: 'Days' }), h('select#cuPlanDays', { name: 'days' }, [['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['3660', 'About ten years']].map(([v, l]) => h('option', { value: v, text: l })))]),
        h('div', {}, [h('label', { for: 'cuPlanNote', text: 'Note (optional)' }), h('input#cuPlanNote', { name: 'note', type: 'text', maxlength: '200', placeholder: 'Why' })])
      ]),
      h('button.btn.primary', { type: 'submit', text: 'Grant plan' })
    ]));
  }
  const self = me();
  const isSelf = String(i.email || '').toLowerCase() === self.email;
  if (can('reset') && s.role !== 'admin' && !isSelf && (s.is_member || d.redemptions && d.redemptions.length)) {
    parts.push(h('div.cu-danger', {}, [
      h('h4.cu-h4', { text: 'Clear access' }),
      h('p.cu-meta', { text: 'Removes their membership, invite request, the code they used (freeing it) and their session, so their next sign-in starts as a new one. Their films, organisation and payments are not touched.' }),
      h('button.btn.danger', { type: 'button', 'data-cu-act': 'reset', text: 'Clear access…' })
    ]));
  }
  if (can('delete') && s.role !== 'admin' && !isSelf && i.email) {
    parts.push(h('div.cu-danger', {}, [
      h('h4.cu-h4', { text: 'Delete totally' }),
      h('p.cu-meta', { text: 'Removes the person, their sign-in, synced films, payments, team, tickets, grant and mailing-list entry. Their invoices are kept as the seller’s legal record with the name, e-mail and GSTIN removed. It cannot be undone and is recorded in the audit log.' }),
      h('button.btn.danger', { type: 'button', 'data-cu-act': 'delete', text: 'Delete totally…' })
    ]));
  }
  if (!parts.length) return null;
  return section('actions', 'Give & manage', h('div.cu-stack', {}, parts));
}

/* ---- header: name, standing, the three likeliest actions ------------- */

function paintHeader(d) {
  if (!cur) return;
  const i = d.identity || {}, st = standing(d), s = d.standing || {};
  cur.titleHost.textContent = i.name || i.email || 'Person';
  cur.subHost.replaceChildren(
    h('p.ad-meta', { text: i.name ? i.email : (s.role === 'admin' ? 'Administrator' : '') }),
    h('p.cu-pills', {}, [pill(st.label, st.tone, { dot: true }), s.role === 'admin' ? pill('Admin', 'accent') : null])
  );
  const live = can('session') && ((d.sessions || {}).device_lock) && isLive(d.sessions.device_lock.last_heartbeat);
  cur.actsHost.replaceChildren(
    can('trial') || can('plan') ? h('button.btn', { type: 'button', 'data-cu-act': 'goto', 'data-sec': 'actions', text: 'Give time' }) : null,
    can('notes') ? h('button.btn', { type: 'button', 'data-cu-act': 'goto', 'data-sec': 'notes', text: 'Add note' }) : null,
    live ? h('button.btn', { type: 'button', 'data-cu-act': 'end-session', text: 'End session' })
      : h('button.btn', { type: 'button', 'data-cu-act': 'copy-email', text: 'Copy e-mail' })
  );
}

function paintBody(d) {
  if (!cur) return;
  const scroller = cur.body.closest('.ad-drawer-b');
  const top = scroller ? scroller.scrollTop : 0;
  const notes = Array.isArray(d.notes) ? d.notes : [];
  cur.body.replaceChildren(...[
    identitySection(d), trialSection(d), actionsSection(d), paymentsSection(d), invoicesSection(d), refundsSection(d),
    referralSection(d), sessionsSection(d), workSection(d), orgsSection(d), notesSection(d, notes), auditSection(d)
  ].filter(Boolean));
  if (scroller) scroller.scrollTop = top;
}

async function fetchPerson({ quiet = false } = {}) {
  const st = cur;
  if (!st) return;
  if (!quiet) st.body.replaceChildren(skeleton({ kind: 'rows', count: 6 }));
  try {
    await studioRole();
    if (can('plan') && !st.plans.length) {
      try { st.plans = (await Billing.listPlans()).filter((p) => p.id !== 'free'); } catch (e) { st.plans = []; }
    }
    const d = await rpc('admin_customer', { p_user: st.id });
    if (cur !== st) return;
    st.data = d || {};
    paintHeader(st.data);
    paintBody(st.data);
  } catch (e) {
    if (cur !== st) return;
    st.body.replaceChildren(errorState({ title: 'This person could not load', why: sentence(e, 'The server did not say why.'), onRetry: () => fetchPerson() }));
  }
}

/* ---- the loader admin-kit calls ------------------------------------ */

async function loader(id) {
  const titleHost = h('span', { text: 'Person' });
  const subHost = h('div.cu-sub');
  const actsHost = h('span.cu-acts');
  const body = h('div.cu-body', {}, [skeleton({ kind: 'rows', count: 6 })]);
  cur = { id: String(id), data: null, body, titleHost, subHost, actsHost, collapsed: new Set(), plans: [] };
  /* The drawer opens at once with the loading state; the fetch lands in
     it. openDrawer() has made its h2 by the next tick, and the h2's text
     is where the name goes. */
  setTimeout(() => {
    const el = document.querySelector('.ad-drawer[data-id="' + CSS.escape(String(id)) + '"]');
    const h2 = el && el.querySelector('h2');
    if (h2 && cur && cur.id === String(id)) { cur.titleHost = h2; }
    fetchPerson();
  }, 0);
  return { title: 'Person', sub: subHost, body, actions: [actsHost] };
}
registerDrawer('user', loader);

/** Open the sheet for a person from any row that names one. */
export async function openUser(id) {
  if (!id) return;
  const spec = await loader(id);
  openDrawer({ ...spec, param: 'user', id });
}

/** Find the person for an e-mail (the People list rows carry no id). */
let usersCache = null;
export async function userIdForEmail(email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return null;
  try {
    if (!usersCache || Date.now() - usersCache.at > 60000) usersCache = { at: Date.now(), rows: (await rpc('admin_list_users')) || [] };
  } catch (e) { return null; }
  const hit = usersCache.rows.find((u) => String(u.email || '').toLowerCase() === want);
  return hit ? hit.user_id : null;
}

/* ---- the actions ---------------------------------------------------- */

async function afterWrite(message) {
  wrote(message);
  await fetchPerson({ quiet: true });
}
const emailNow = () => (cur && cur.data && cur.data.identity && cur.data.identity.email) || 'this person';

async function endSession() {
  const email = emailNow();
  if (!await ask({ title: 'End ' + email + '’s session?', body: 'Their open window is signed off the studio now. Nothing on their device is touched and they can sign straight back in.', confirm: 'End session' })) return;
  try { await rpc('admin_terminate_session', { p_user: cur.id, p_disable: false }); await afterWrite('Session ended for ' + email + '.'); }
  catch (e) { toast(sentence(e), 'error'); }
}
async function disable() {
  const email = emailNow();
  if (!await askDanger({ title: 'Disable ' + email + '?', body: 'Their session ends and their cloud sync stops until they are let in again. Nothing on their own device is touched.', confirm: 'Disable' })) return;
  try { await rpc('admin_terminate_session', { p_user: cur.id, p_disable: true }); await afterWrite(email + ' is disabled.'); }
  catch (e) { toast(sentence(e), 'error'); }
}
async function resetUser() {
  const email = emailNow();
  if (!await askDanger({
    title: 'Clear access for ' + email + '?',
    body: 'This removes their membership, their invite request, the invite code they used (freeing it) and their session, so their next sign-in starts as a new one.\n\nTheir projects, their organisation and any payment are NOT touched.',
    confirm: 'Clear access', typeToConfirm: email
  })) return;
  try {
    const out = await rpc('admin_reset_user', { p_user: cur.id, p_note: null });
    const bits = [];
    if (out && out.membership_removed) bits.push('membership removed');
    if (out && out.request_removed) bits.push('request cleared');
    if (out && out.redemptions_freed) bits.push(out.redemptions_freed + ' code ' + (out.redemptions_freed === 1 ? 'use' : 'uses') + ' freed');
    bits.push(out && out.signed_out ? 'signed out' : 'session left in place');
    await afterWrite(email + ' is a stranger again — ' + bits.join(', ') + '.');
  } catch (e) { toast(sentence(e), 'error'); }
}
async function deleteTotally() {
  const email = emailNow();
  if (!await askDanger({
    title: 'Delete ' + email + ' totally?',
    body: 'This deletes their sign-in, their films and everything synced to the server, their payments, team, support tickets, access grant and mailing-list entry. It cannot be undone, and it is recorded in the audit log.\n\nTheir invoices are kept, as the seller\u2019s legal record, with the name, e-mail and GSTIN removed. Work kept only in their own browser is not touched.\n\nTo only take their access away, use Clear access instead.',
    confirm: 'Delete totally', typeToConfirm: email
  })) return;
  try {
    const out = await rpc('admin_delete_user', { p_user: cur.id, p_confirm_email: email });
    const n = out && typeof out.invoices_retained === 'number' ? out.invoices_retained : 0;
    wrote(email + ' is deleted' + (n ? ' — ' + n + (n === 1 ? ' invoice' : ' invoices') + ' kept, anonymised' : '') + '.');
    closeDrawer();
  } catch (e) { toast(sentence(e), 'error'); }
}
async function issueInvoice(paymentId) {
  const p = ((cur.data || {}).payments || []).find((x) => x.id === paymentId);
  if (!p) return;
  if (!await ask({ title: 'Issue an invoice for ' + money(p.amount_paise, p) + '?', body: 'A Bill of Supply is numbered now from the gapless series for this financial year. A number is never reused, so this cannot be undone.', confirm: 'Issue invoice' })) return;
  try { const inv = await rpc('admin_issue_invoice', { p_payment: paymentId }); await afterWrite('Invoice ' + ((inv && inv.number) || '') + ' issued.'); }
  catch (e) { toast(sentence(e), 'error'); }
}

delegate(document, 'click', '[data-cu-act]', (e, el) => {
  const act = el.dataset.cuAct;
  if (act === 'leave') { closeDrawer({ keepHash: true }); return; }   // the anchor's own hash change does the navigating
  if (!cur) return;
  if (act === 'end-session') endSession();
  else if (act === 'disable') disable();
  else if (act === 'reset') resetUser();
  else if (act === 'delete') deleteTotally();
  else if (act === 'invoice') issueInvoice(el.dataset.id);
  else if (act === 'copy-email') {
    try { navigator.clipboard.writeText(emailNow()); toast('E-mail copied.'); } catch (err) { toast('Copy is not available here.', 'error'); }
  } else if (act === 'goto') {
    const sec = cur.body.querySelector('[data-cu-sec="' + el.dataset.sec + '"]');
    if (!sec) return;
    sec.open = true; cur.collapsed.delete(el.dataset.sec);
    sec.scrollIntoView({ block: 'start', behavior: 'instant' });
    const f = sec.querySelector('textarea, select, input');
    if (f) f.focus({ preventScroll: true });
  }
});

delegate(document, 'submit', '[data-cu-form]', async (e, form) => {
  e.preventDefault();
  if (!cur) return;
  const kind = form.dataset.cuForm;
  const f = new FormData(form);
  const email = emailNow();
  if (kind === 'note') {
    const body = String(f.get('body') || '').trim();
    if (!body) { toast('Write something first.', 'error'); return; }
    try {
      await rpc('admin_add_note', { p_user: cur.id, p_body: body });
      await afterWrite('Note added.');
    } catch (err) { toast(sentence(err), 'error'); }
  } else if (kind === 'trial') {
    const minutes = parseInt(String(f.get('minutes')), 10);
    const note = String(f.get('note') || '').trim();
    if (!await ask({ title: 'Give ' + email + ' ' + trialLength(minutes) + '?', body: 'A fresh trial of ' + trialLength(minutes) + ' starts for them now and replaces any trial clock they have. It does not refuse a second trial, and it makes them a member if they are not one.', confirm: 'Give ' + trialLength(minutes) })) return;
    try { await Billing.admin.grantTrial(cur.id, minutes, note); await afterWrite('Gave ' + email + ' ' + trialLength(minutes) + '.'); }
    catch (err) { toast(sentence(err), 'error'); }
  } else if (kind === 'plan') {
    const plan = String(f.get('plan'));
    const days = parseInt(String(f.get('days')), 10);
    const note = String(f.get('note') || '').trim();
    if (!await ask({ title: 'Grant ' + email + ' the ' + planName(plan) + ' plan for ' + days + ' days?', body: 'They get the plan now at no charge. A zero-rupee “granted” payment is recorded against them, and they become a member if they are not one.', confirm: 'Grant plan' })) return;
    try { await Billing.admin.grantPlan(cur.id, plan, days, note); await afterWrite(planName(plan) + ' granted to ' + email + '.'); }
    catch (err) { toast(sentence(err), 'error'); }
  }
});

/* remember which sections were folded, so a refresh after an action keeps the page as it was */
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!cur || !d || !d.matches || !d.matches('details.cu-sec')) return;
  const k = d.dataset.cuSec;
  if (d.open) cur.collapsed.delete(k); else cur.collapsed.add(k);
}, true);

/* ---- rows that name a person ---------------------------------------- */
/* gate-ui's own rows carry data-gate-user; the People list in admin.js
   carries nothing, so its rows are found by the e-mail they print. */

function rowEmail(tr) {
  const sub = tr.querySelector('.ad-sub');
  const strong = tr.querySelector('strong');
  const t = ((sub && sub.textContent) || (strong && strong.textContent) || '').trim();
  return /@/.test(t) ? t : '';
}
function tagRows() {
  for (const tr of document.querySelectorAll('#signed-in tbody tr:not([data-cu-tagged])')) {
    const email = rowEmail(tr);
    tr.dataset.cuTagged = '1';
    if (!email) continue;
    tr.dataset.cuEmail = email;
    tr.setAttribute('tabindex', '0');
    tr.classList.add('cu-open-row');
    tr.setAttribute('aria-label', 'Open ' + email);
  }
}
if (typeof document !== 'undefined') {
  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; tagRows(); });
  });
  const start = () => { const app = document.getElementById('app'); if (app) { mo.observe(app, { childList: true, subtree: true }); tagRows(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  const openRow = async (tr) => { const id = await userIdForEmail(tr.dataset.cuEmail); if (id) openUser(id); else toast('That person could not be found.', 'error'); };
  delegate(document, 'click', 'tr[data-cu-email]', (e, tr) => {
    if (e.target.closest('a, button, input, select, textarea, label, summary')) return;
    openRow(tr);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target && e.target.matches && e.target.matches('tr[data-cu-email]') ? e.target : null;
    if (tr) { e.preventDefault(); openRow(tr); }
  });
}

export default { openUser, userIdForEmail, studioRole, can, currentRole, rpc, fmtBytes, browserOf };
