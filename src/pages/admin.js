/* ============================================================
   THE CONSOLE — the application as a whole, for its administrators
   ------------------------------------------------------------
   ONE page, eleven tabs in four GROUPS (src/ui/tabs.js turns the
   top-level sections into the strip, and draws each group under its
   heading — a vertical sub-navigation inside the content column at
   1100px and over, the single scrolling strip below; the hash picks
   one). The groups, in order:

     Run      Overview · Launch & health · Audit log
     People   People · Support · Access & sharing (#requests)
     Money    Purchases · Growth
     Product  Usage · Sync & storage · Controls

   The six tabs that are NOT written here — health, audit, support,
   usage, sync, controls — are one module each in src/pages/admin-tabs/,
   registered in NEW_TABS below. A module exports

     render(ctx) -> Node          its content, built synchronously
     badge(ctx)  -> number|null   (optional) the sub-nav count

   and ctx is { id, gate, cloud, status, overview, billing, growth,
   purchasesRequired, env, rerender, refresh, go, fmt } — see makeCtx().
   Until a module is replaced it draws "Coming in this build".

   A status bar sits under the band on every tab: Razorpay mode from the
   key id's prefix, whether purchases are required, and when the numbers
   were last counted. The drawer (src/ui/admin-kit.js) is linked from the
   hash: #people?user=<id>.

   Below is the original header, still true of the five old tabs:

     Overview    #overview   one row of numbers, each a link to its tab
     People      #people     members and sessions (gate-ui 'members'),
                             Give access (access-admin), everyone who
                             has signed in, organisations
     Requests    #requests   the invite queue, codes, the demo link,
                             redemptions (gate-ui 'requests',
                             #admin-console)
     Purchases   #purchases  the "Purchases required" switch, plans &
                             prices + grant (#tiers), payments + refunds
                             (#billing), invoices (#invoices), promo
                             codes (#promos), plan features (#features)
     Growth      #growth     trial, price rise, referrals, affiliates,
                             leads, funnel (growth-admin)

   RE-HOUSED, NOT REWRITTEN. Each module still draws its own block and
   wires its own handlers; this page only decides where each one sits.
   A module asks for a "section" by id: `block()` below answers with a
   tab section when the id IS a tab (growth), else with a plain div —
   so every old id (#billing, #tiers, #promos, #features, #invoices,
   #admin-console, #give-access) still exists, inside its tab, and a
   link to it opens that tab (tabs.js: a fragment inside a tab selects
   the tab). purchases.html, which used to hold the money half, is a
   redirect stub to #purchases now.

   SHOWN BY ROLE, AND THE ROLE IS THE SERVER'S. studio_status() says
   whether this account is an admin; every RPC behind every block
   re-checks is_studio_admin(), so the page appearing is a convenience
   and a page forced open from devtools gets 42501 from every call.

   A RE-RENDER KEEPS WHAT YOU TYPED. Every module re-renders the whole
   page when its data lands, and six of them load at once here, so a
   form half-filled while another block arrives would be rebuilt from
   its defaults. carryFields() puts back every field typed into since
   its form was last submitted (and the focus), by form + field.

   LOAD ORDER: store.js first (invariant 6). cloud.js by name, because
   the page is a view of window.StudioCloud.
   ============================================================ */
import Store from '../lib/store.js';   /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../lib/cloud.js';              /* sets window.StudioCloud; the gate lives there */

import StudioUI from '../ui/chrome.js';
import { pageHeader, button, panel } from '../ui/kit/index.js';
import { mountShell } from '../ui/shell.js';
import { h, commitMain, coalesce } from '../lib/dom.js';
import { fmtPaise, RAZORPAY_KEY_ID } from '../lib/billing.js';
import { kpi, pill, emptyState, errorState, skeleton, relTime, stampDensity, syncDrawerFromHash } from '../ui/admin-kit.js';
import * as kit from '../ui/admin-kit.js';
import * as charts from '../ui/admin-charts.js';
import * as healthTab from './admin-tabs/health.js';
import * as auditTab from './admin-tabs/audit.js';
import * as supportTab from './admin-tabs/support.js';
import * as usageTab from './admin-tabs/usage.js';
import * as syncTab from './admin-tabs/sync.js';
import * as controlsTab from './admin-tabs/controls.js';
import { duration } from './admin-tabs/rpc.js';
import { adminSection, wireGateUI } from '../ui/gate-ui.js';
import { planFeaturesSection, wirePlanFeatures } from '../ui/plan-features.js';
import { purchasesSwitchBlock, accessAdminSection, wireAccessAdmin, purchasesRequiredNow } from '../ui/access-admin.js';
import { billingAdminSection, wireBillingAdmin, billingSnapshot } from '../ui/billing-admin.js';
import { invoiceAdminSection } from '../ui/invoice-panels.js';
import { growthAdminSection, wireGrowthAdmin, growthSnapshot } from '../ui/growth-admin.js';
import { trialLength } from '../lib/trial-time.js';
/* LAST, after every module's own sheet, so the console's one set of
   components (admin.css, scoped to .ad-console) wins the ties. */
import '../styles/admin.css';
import '../styles/kit-scope.css';   /* the kit's look for the legacy .btn / fields / tables a module still draws */

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;

/* THE TABS, in the order they appear. `group` is the sub-nav heading (src/ui/tabs.js
   draws it from data-tab-group); the ids of the first five are the old
   ones and every old fragment still resolves inside them. */
const TAB_DEFS = [
  { id: 'overview',  label: 'Overview',          group: 'Run',     icon: 'dashboard',      hint: 'The numbers, and what needs you today.' },
  { id: 'health',    label: 'Launch & health',   group: 'Run',     icon: 'monitor_heart',  hint: 'Is everything switched on and working?' },
  { id: 'audit',     label: 'Audit log',         group: 'Run',     icon: 'history',        hint: 'Who changed what, and when.' },
  { id: 'people',    label: 'People',            group: 'People',  icon: 'groups',         hint: 'Members, access and organisations.' },
  { id: 'support',   label: 'Support',           group: 'People',  icon: 'support_agent',  hint: 'Look up an account and help with it.' },
  { id: 'requests',  label: 'Access & sharing',  group: 'People',  icon: 'share',          hint: 'Invite requests, codes and shared films.' },
  { id: 'purchases', label: 'Purchases',         group: 'Money',   icon: 'shopping_cart',  hint: 'Payments, invoices, refunds and promo codes.' },
  { id: 'growth',    label: 'Growth',            group: 'Money',   icon: 'trending_up',    hint: 'Visits, sign-ups and the funnel.' },
  { id: 'usage',     label: 'Usage',             group: 'Product', icon: 'bar_chart',      hint: 'What people use, and how much.' },
  { id: 'sync',      label: 'Sync & storage',    group: 'Product', icon: 'storage',        hint: 'Cloud sync, queues and stored work.' },
  { id: 'controls',  label: 'Controls',          group: 'Product', icon: 'toggle_on',      hint: 'Switches, plans and features.' }
];
const TABS = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t.label]));
const GROUP = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t.group]));
const META = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t]));
/* THE REGISTRY. A tab that has its own module in ./admin-tabs/. To add
   one: a file there, an import above, a row here and in TAB_DEFS. */
const NEW_TABS = { health: healthTab, audit: auditTab, support: supportTab, usage: usageTab, sync: syncTab, controls: controlsTab };
/* A block's own heading, where the module's first sub-heading does not
   already name it. Everything else starts at the module's h3. */
const BLOCK_TITLE = { features: 'Plan features', invoices: 'Invoices' };

function tab(id) {
  return h('section.ad-tab', { id, 'data-tab-label': TABS[id], 'data-tab-group': GROUP[id], 'data-tab-icon': META[id].icon, 'data-tab-hint': META[id].hint });
}
/** The `section` a module asks for. Eyebrow and deck are not drawn:
 *  the tab names the place and a block carries one meta line at most. */
function block(id) {
  if (TABS[id]) return tab(id);
  const el = h('div.ad-block', { id });
  if (BLOCK_TITLE[id]) el.append(h('h3.gt-h3', { text: BLOCK_TITLE[id] }));
  return el;
}
/** The signed-out / not-admin / no-cloud states: one short block. */
function state(id, title, line, actions) {
  return panel({ tag: 'section', id, class: 'ad-state', eyebrow: 'Console', body: [
    h('h2.ad-state-h', { text: title }),
    line ? h('p.ad-meta', { text: line }) : null,
    actions && actions.length ? h('div.ad-actions', {}, actions) : null
  ].filter(Boolean) });
}

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '');
const n = (v) => (Number(v) || 0).toLocaleString();
const num0 = (v) => Number(v) || 0;
const plural = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;

/* ---- the numbers ------------------------------------------------ */

let ov = { phase: 'idle', data: null, accounts: [], users: [], error: '', loadedAt: 0 };

async function loadOverview() {
  const g = gate();
  if (!g || ov.phase === 'loading') return;
  ov = { ...ov, phase: 'loading', error: '' }; renderSoon();
  try {
    const [data, accounts, users] = await Promise.all([g.admin.overview(), g.admin.listAccounts(), g.admin.listUsers()]);
    ov = { phase: 'ok', data: data || {}, accounts: accounts || [], users: users || [], error: '', loadedAt: Date.now() };
  } catch (e) {
    ov = { ...ov, phase: 'error', error: e.message || 'The console could not load.' };
  }
  renderSoon();
}

/* ---- the status bar, and what the other tabs are handed --------- */

/** Razorpay mode, read from the PREFIX of the public key id — never the key. */
function razorpayEnv() {
  if (/^rzp_test_/.test(RAZORPAY_KEY_ID)) return 'TEST';
  if (/^rzp_live_/.test(RAZORPAY_KEY_ID)) return 'LIVE';
  return null;
}

/** The two facts that change what every action on this page means. */
function statusBar() {
  const env = razorpayEnv();
  const pr = purchasesRequiredNow();
  const at = ov.data && ov.data.generated_at ? ov.data.generated_at : ov.loadedAt;
  return h('div.ad-status', { role: 'region', 'aria-label': 'Environment' }, [
    pill(env ? 'Razorpay ' + env : 'Razorpay not set', env === 'LIVE' ? 'danger' : env === 'TEST' ? 'warn' : 'neutral',
      { dot: true, title: env ? 'From the public key id’s prefix (VITE_RAZORPAY_KEY_ID)' : 'No VITE_RAZORPAY_KEY_ID in this build' }),
    pill(pr === null ? 'Purchases required: unknown' : pr ? 'Purchases required: ON' : 'Purchases required: OFF', pr ? 'warn' : 'neutral',
      { dot: true, title: pr === null ? 'Section 32 has not answered' : null }),
    h('span.ad-status-r', {}, [
      ov.phase === 'loading' ? h('span.ad-meta', { text: 'Refreshing…' })
        : h('span.ad-meta', {}, ['Refreshed ', h('time', { title: at ? new Date(at).toLocaleString() : null, text: at ? new Date(at).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '—' })]),
      button({ label: 'Refresh', icon: 'refresh', size: 'sm', class: 'ad-refresh', disabled: ov.phase === 'loading', attrs: { 'data-ad-action': 'reload' } })
    ])
  ]);
}

/** Waiting items that already have a count, per tab, for the sub-nav badges. */
function pendingCounts() {
  const b = billingSnapshot();
  return {
    requests: ov.data ? Number(ov.data.requests_pending) || 0 : 0,
    purchases: b ? Number(b.refundRequestsPending) || 0 : 0
  };
}

function makeCtx(id) {
  const b = billingSnapshot();
  return {
    id,
    gate: gate(),
    cloud: cloud(),
    status: st,
    overview: ov,                       // { phase, data, accounts, users, error, loadedAt }
    billing: b,                         // billingSnapshot(): { overview, payments, refundRequestsPending } | null
    growth: growthSnapshot(),
    purchasesRequired: purchasesRequiredNow(),
    env: razorpayEnv(),                 // 'TEST' | 'LIVE' | null
    kit, charts,
    rerender: () => renderSoon(),
    refresh: () => { ov = { ...ov, phase: 'idle' }; loadOverview(); },
    go: (tabId, params) => {
      const next = kit.hashFor(tabId, params);
      try { history.replaceState(history.state, '', location.pathname + location.search + next); } catch (e) { /* ignore */ }
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    fmt: { date: fmtDate, when: fmtWhen, time: fmtTime, n, paise: fmtPaise, rel: relTime }
  };
}

/** A tab module's section: its render(ctx) inside the tab, a failure inside one
 *  tab never takes the others down. */
function moduleTab(id) {
  const sec = tab(id);
  const ctx = makeCtx(id);
  try { sec.append(NEW_TABS[id].render(ctx)); }
  catch (e) { sec.append(errorState({ title: TABS[id] + ' could not draw', why: (e && e.message) || 'An error with no message.', onRetry: render })); }
  return sec;
}

/* ---- the command centre ------------------------------------------ */

/** One row of "Needs attention": a pill, a sentence, and a link into the right tab. */
/* Severity is the item's own tone, named: danger CRIT, warn HIGH, neutral
   LOW. MED is unused because the list has only three tones; nothing is
   graded that the code did not already grade. */
const SEVERITY = { danger: 'CRIT', warn: 'HIGH', neutral: 'LOW' };
function attentionItem({ label, tone = 'warn', text, tab: to, params }) {
  return h('li', { 'data-sev': tone }, [h('a.ad-att', { href: kit.hashFor(to, params), 'data-ad-go': to, 'data-ad-params': params ? JSON.stringify(params) : null }, [
    h('span.ad-sev.is-' + tone, { text: SEVERITY[tone] || 'LOW' }),
    pill(String(label), tone),
    h('span.ad-att-t', { text }),
    h('span.ad-att-go', { 'aria-hidden': 'true', text: '→' })
  ])]);
}

/** The ranked list: health failures, failed receipts, refund requests over 48 hours,
 *  invite requests, other refund requests, abandoned payments. Anything the health
 *  report could not read is said, never counted as zero. */
function attentionList(d, hs) {
  const out = [];
  const hd = hs.phase === 'ok' ? hs.data : null;
  const bad = (v) => !v || v.error;
  const COVERED = new Set(['receipts', 'payments_created', 'refunds', 'invite_requests']);
  if (hs.phase === 'error') out.push(attentionItem({ label: 'Health', tone: 'danger', text: 'The health report could not load: ' + hs.error, tab: 'health' }));
  if (hd) {
    for (const c of hd.checks || []) {
      if (COVERED.has(c.id) || (c.level !== 'warn' && c.level !== 'unknown')) continue;
      out.push(attentionItem({ label: c.level === 'unknown' ? 'Unknown' : 'Health', tone: c.level === 'unknown' ? 'neutral' : 'danger', text: c.observed || c.id, tab: 'health' }));
    }
    for (const c of hd.checks || []) if (c.level === 'unknown' && COVERED.has(c.id)) out.push(attentionItem({ label: 'Unknown', tone: 'neutral', text: c.observed, tab: 'health' }));
    const r = hd.receipts;
    if (!bad(r) && Number(r.awaiting_recent) > 0) out.push(attentionItem({ label: r.awaiting_recent, text: `${Number(r.awaiting_recent) === 1 ? 'receipt' : 'receipts'} from the last 7 days ${Number(r.awaiting_recent) === 1 ? 'has' : 'have'} no mail recorded`, tab: 'health' }));
  }
  const rf = hd && !bad(hd.refunds) ? hd.refunds : null;
  const pendingRefunds = rf ? Number(rf.requests_pending) || 0 : (pendingCounts().purchases || 0);
  const old = rf && Number(rf.oldest_pending_age_seconds) > 48 * 3600;
  if (old && pendingRefunds) out.push(attentionItem({ label: pendingRefunds, tone: 'danger', text: `${pendingRefunds === 1 ? 'refund request' : 'refund requests'} waiting, the oldest ${duration(rf.oldest_pending_age_seconds)}`, tab: 'purchases' }));
  const inv = Number(d.requests_pending) || 0;
  if (inv) out.push(attentionItem({ label: inv, text: inv === 1 ? 'person is waiting for an invite' : 'people are waiting for an invite', tab: 'requests' }));
  if (!old && pendingRefunds) out.push(attentionItem({ label: pendingRefunds, text: pendingRefunds === 1 ? 'refund request is waiting for an answer' : 'refund requests are waiting for an answer', tab: 'purchases' }));
  const ab = hd && !bad(hd.payments) ? Number(hd.payments.created_older_than_1h) || 0 : 0;
  if (ab) out.push(attentionItem({ label: ab, tone: 'neutral', text: `${ab === 1 ? 'payment' : 'payments'} still open after an hour (abandoned or not yet settled)`, tab: 'purchases' }));
  return out;
}

function activityCard(ctx) {
  const rc = auditTab.recentState();
  const card = h('div.k-panel.ad-card', {}, [h('h3.ad-card-h', { text: 'Activity' })]);
  if (rc.phase === 'error') card.append(errorState({ title: 'The audit log could not load', why: rc.error, onRetry: () => auditTab.reloadRecent(ctx) }));
  else if (rc.phase !== 'ok') card.append(skeleton({ kind: 'rows', count: 4 }));
  else if (!rc.rows.length) card.append(emptyState({ title: 'No admin action recorded yet', body: 'Every admin write is listed here, newest first.', stamp: true, icon: '◷' }));
  else {
    card.append(kit.timeline(rc.rows.map((r) => ({
      at: r.at, tone: auditTab.rowTone(r), title: auditTab.rowTitle(r),
      sub: h('p.ad-tl-s', {}, [h('code', { text: auditTab.rowTarget(r) })]),
      target: { href: kit.hashFor('audit', { target: r.target_id }), label: 'Everything about this target' }
    }))));
    card.append(h('p.ad-meta.ad-card-f', {}, [
      `Showing the latest ${rc.rows.length} \u00b7 `,
      h('a', { href: '#audit', 'data-ad-go': 'audit', text: 'Open the audit log →' }),
      ' \u00b7 ',
      h('button.ad-chip', { type: 'button', 'data-action': 'audit-export-recent', title: 'Download these rows as CSV', text: 'Export CSV' })
    ]));
  }
  return card;
}

function overviewTab() {
  const sec = tab('overview');
  const ctx = makeCtx('overview');
  healthTab.ensureHealth(ctx);
  auditTab.ensureRecent(ctx);
  if (ov.phase === 'error') {
    sec.append(errorState({ title: 'The numbers could not load', why: ov.error, onRetry: () => { ov = { ...ov, phase: 'idle' }; loadOverview(); } }));
    return sec;
  }
  /* Stale-while-refresh: a REFRESH keeps the numbers on screen (the header says
     Refreshing…); the skeleton is for when there is nothing to show yet. */
  if (!ov.data) { sec.append(skeleton({ kind: 'kpi' }), skeleton({ kind: 'block', count: 2 })); return sec; }
  const d = ov.data;
  const b = billingSnapshot();
  const g = growthSnapshot();
  const pr = purchasesRequiredNow();
  const hs = healthTab.healthState();
  const by = (b && b.overview.active_by_plan) || {};
  const paying = Object.entries(by).filter(([k]) => k !== 'free').reduce((t, [, v]) => t + (Number(v) || 0), 0);
  const trials = Number.isInteger(d.trials_active)
    ? kpi({ label: 'Trials running', value: n(d.trials_active), href: '#growth' })
    : kpi({ label: 'Trial', value: g ? (g.trial_enabled !== false ? 'On' : 'Off') : '…', sub: g && g.trial_enabled !== false ? trialLength(g.trial_minutes || 30) : '', href: '#growth' });

  /* A tile from the health report. A slot that errored, or a report that
     has not landed, is "—" / "…" and says so: never a zero that reads as healthy. */
  const hk = (label, slot, pick, { sub, href, hot = (v) => v > 0 } = {}) => {
    if (hs.phase === 'error') return kpi({ label, value: '—', sub: 'unknown', href });
    if (hs.phase !== 'ok') return kpi({ label, value: '…', href });
    const v = hs.data[slot];
    if (!v || v.error) return kpi({ label, value: '—', sub: 'unknown', href, title: v && v.message ? v.message : null });
    const x = Number(pick(v)) || 0;
    return kpi({ label, value: n(x), sub, href, attention: hot(x) });
  };

  sec.append(h('div.ad-stats.ad-kpis', {}, [
    kpi({ label: 'Members', value: n(d.members_active), sub: `${n(d.members_admin)} admin`, href: '#people' }),
    kpi({ label: 'Pending requests', value: n(d.requests_pending), href: '#requests', attention: d.requests_pending > 0 }),
    kpi({ label: 'Paying accounts', value: b ? n(paying) : '…', href: '#billing' }),
    kpi({ label: 'Revenue', value: b ? fmtPaise(b.overview.paid_total_paise || 0) : '…', sub: b ? `${fmtPaise(b.overview.paid_30d_paise || 0)} in 30 days` : '', href: '#billing' }),
    trials,
    kpi({ label: 'Purchases required', value: pr === null ? '—' : pr ? 'On' : 'Off', href: '#purchasesRequired' }),
    hk('Failed receipts', 'receipts', (v) => v.awaiting_recent, { sub: 'last 7 days', href: '#health' }),
    hk('Abandoned payments', 'payments', (v) => v.created_older_than_1h, { sub: 'open over 1 hour', href: '#purchases', hot: () => false }),
    hk('Refund backlog', 'refunds', (v) => num0(v.requests_pending) + num0(v.requests_approved_not_refunded) + num0(v.refunds_failed), { sub: 'pending, approved, failed', href: '#purchases' }),
    hk('Walled', 'wall', (v) => v.walled, { sub: pr ? 'out of the studio' : 'if purchases were required', href: '#health', hot: () => false })
  ]));

  const items = attentionList(d, hs);
  const crit = items.filter((li) => li.getAttribute('data-sev') === 'danger').length;
  const attention = h('div.k-panel.ad-card', {}, [h('h3.ad-card-h', {}, ['Needs attention', crit ? pill(crit + ' critical', 'danger') : null])]);
  if (items.length) attention.append(h('ul.ad-att-list', {}, items));
  else if (hs.phase === 'ok') attention.append(emptyState({ title: 'Nothing needs you', body: 'The health checks pass, and no receipt, refund, invite or payment is waiting.', stamp: true, icon: '✓' }));
  else if (hs.phase === 'loading' || hs.phase === 'idle') attention.append(skeleton({ kind: 'rows', count: 3 }));
  else attention.append(emptyState({ title: 'Nothing found so far', body: 'The health report did not load, so this is not an all-clear.', stamp: true, icon: '?' }));
  sec.append(h('div.ad-cols', {}, [attention, activityCard(ctx)]));

  sec.append(h('p.ad-meta', { text: [
    plural(d.users_total, 'signed in', 'signed in'), `${n(d.users_active_7d)} active this week`,
    plural(d.accounts, 'organisation', 'organisations'), plural(d.projects, 'film', 'films'),
    `${n(d.sessions_live)} online`, `${plural(d.codes_active, 'code', 'codes')} open`, 'counted ' + fmtTime(d.generated_at)
  ].join(' · ') }));
  return sec;
}

function organisationsBlock() {
  const sec = block('organisations');
  sec.append(h('h3.gt-h3', { text: `Organisations (${ov.accounts.length})` }));
  if (!ov.accounts.length) { sec.append(h('p.gt-meta', { text: 'None yet.' })); return sec; }
  const table = h('table.gt-table.k-table');
  table.append(h('thead', {}, [h('tr', {}, ['Organisation', 'Owner', 'Plan', 'Seats', 'Films', 'Since'].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const a of ov.accounts) {
    tb.append(h('tr', {}, [
      h('td', {}, [h('strong', { text: a.name || 'Untitled' })]),
      h('td', { text: a.owner_email || '—' }),
      h('td', { text: a.plan || '—' }),
      h('td', { text: `${n(a.seats_used)} of ${n(a.seat_limit)}` + (a.members_pending ? ` · ${n(a.members_pending)} invited` : '') }),
      h('td', { text: n(a.projects) }),
      h('td', { text: fmtDate(a.created_at) })
    ]));
  }
  table.append(tb);
  sec.append(h('div.gt-scroll', {}, [table]));
  return sec;
}

function roleTag(u) {
  if (u.disabled_at) return h('span.ad-tag.is-off', { text: 'disabled' });
  if (u.studio_role === 'admin') return h('span.ad-tag.is-admin', { text: 'admin' });
  if (u.studio_role) return h('span.ad-tag', { text: 'member' });
  if (u.request_status === 'pending') return h('span.ad-tag.is-pending', { text: 'waiting' });
  if (u.request_status === 'declined') return h('span.ad-tag.is-off', { text: 'declined' });
  return h('span.ad-tag', { text: 'not a member' });
}

function signedInBlock() {
  const sec = block('signed-in');
  sec.append(h('h3.gt-h3', { text: `Everyone signed in (${ov.users.length})` }));
  if (!ov.users.length) { sec.append(h('p.gt-meta', { text: 'Nobody yet.' })); return sec; }
  const live = (u) => u.last_heartbeat && Date.now() - Date.parse(u.last_heartbeat) < 90000;
  const table = h('table.gt-table.k-table');
  table.append(h('thead', {}, [h('tr', {}, ['Who', 'Standing', 'Last sign-in', 'Joined', 'Films', 'Orgs', 'Now'].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const u of ov.users) {
    tb.append(h('tr', {}, [
      h('td', {}, [h('strong', { text: u.display_name || u.email }), u.display_name ? h('span.ad-sub', { text: u.email }) : null].filter(Boolean)),
      h('td', {}, [roleTag(u)]),
      h('td', { text: fmtWhen(u.last_sign_in_at) }),
      h('td', { text: fmtDate(u.created_at) }),
      h('td', { text: n(u.projects) }),
      h('td', { text: n(u.accounts) }),
      h('td', { text: live(u) ? 'Active' : '' })
    ]));
  }
  table.append(tb);
  sec.append(h('div.gt-scroll', {}, [table]));
  return sec;
}

function fill(sec, parts) { for (const p of parts) if (p) sec.append(p); return sec; }

function peopleTab(st) {
  return fill(tab('people'), [
    adminSection(block, st, { part: 'members' }),
    accessAdminSection(block, st),
    ov.data ? signedInBlock() : null,
    ov.data ? organisationsBlock() : null
  ]);
}
function requestsTab(st) {
  return fill(tab('requests'), [adminSection(block, st, { part: 'requests' })]);
}
function purchasesTab(st) {
  return fill(tab('purchases'), [
    purchasesSwitchBlock(),
    billingAdminSection(block, st, { part: 'tiers' }),
    billingAdminSection(block, st, { part: 'payments' }),
    invoiceAdminSection(block, st, { rerender: () => renderSoon() }),
    billingAdminSection(block, st, { part: 'promos' }),
    planFeaturesSection(block, st)   // the ~40-row matrix last, so it does not bury the rest
  ]);
}

/* ---- keeping what was typed across a re-render ------------------- */

const dirty = new WeakSet();
const FIELDS = 'form input, form select, form textarea';
const formKey = (f) => (f ? [...f.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).join(',') : '');
const fieldKey = (el) => formKey(el.form) + '|' + (el.id || el.name + (el.type === 'checkbox' || el.type === 'radio' ? '=' + el.value : ''));
const mark = (e) => { const t = e.target; if (t && t.matches && t.matches(FIELDS) && app.contains(t)) dirty.add(t); };
document.addEventListener('input', mark, true);
document.addEventListener('change', mark, true);
/* A submit is the form's own reset point: once sent, a module that
   redraws it from defaults means to. Capture phase, so this runs before
   the module's handler reads the values (they are still in the DOM). */
document.addEventListener('submit', (e) => { for (const el of (e.target && e.target.elements) || []) dirty.delete(el); }, true);

function snapshotFields() {
  const saved = new Map();
  for (const el of app.querySelectorAll(FIELDS)) if (dirty.has(el)) saved.set(fieldKey(el), { value: el.value, checked: el.checked });
  const a = document.activeElement;
  const focus = a && a.matches && a.matches(FIELDS) && app.contains(a)
    ? { key: fieldKey(a), start: (() => { try { return a.selectionStart; } catch (e) { return null; } })(), end: (() => { try { return a.selectionEnd; } catch (e) { return null; } })() }
    : null;
  return { saved, focus };
}
function carryFields({ saved, focus }) {
  if (!saved.size && !focus) return;
  for (const el of app.querySelectorAll(FIELDS)) {
    const key = fieldKey(el);
    const o = saved.get(key);
    if (o) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = o.checked;
      else if (el.tagName === 'SELECT') { if ([...el.options].some((x) => x.value === o.value)) el.value = o.value; }
      else el.value = o.value;
      dirty.add(el);
      el.dispatchEvent(new Event('input', { bubbles: true }));   // a preview drawn from the field repaints
    }
    if (focus && focus.key === key) {
      el.focus({ preventScroll: true });
      try { if (focus.start != null) el.setSelectionRange(focus.start, focus.end); } catch (e) { /* not a text field */ }
    }
  }
}

/* ---- the page ---------------------------------------------------- */

let drawerSynced = false;   // the hash's drawer is opened once, on the first admin render
let st = null;   // the last studio_status(); null until asked
let askedFor = '';
let painted = false;      // render() got past the boot wait at least once
let forceRender = false;  // the fallback below: draw even if cloud:booted never came

async function refreshStatus() {
  const c = cloud();
  if (!c || !c.gate || !c.getSession()) {
    const changed = st !== null || askedFor !== '' || ov.data;
    st = null; askedFor = ''; ov = { phase: 'idle', data: null, accounts: [], users: [], error: '', loadedAt: 0 };   // nobody's numbers outlive their session
    if (changed || !painted) renderSoon();
    return;
  }
  const who = c.getUserEmail ? c.getUserEmail() : '';
  /* Nothing new to say (same account, status already held, page already
     drawn): an auth or gate echo does not repaint. */
  if (askedFor === who && st) { if (!painted) renderSoon(); return; }
  try { st = await c.gate.status(); askedFor = who; } catch (e) { st = null; }
  renderSoon();
}

function render() {
  const c = cloud();
  /* The session is restored asynchronously. Drawing before it lands shows a
     signed-in administrator the Sign-in card, then Checking…, then the
     console — three pages in a row. Wait for the boot; it renotifies. */
  if (!forceRender && c && c.isConfigured() && c.isBooted && !c.isBooted()) return;
  painted = true;
  const signedIn = !!(c && c.getSession && c.getSession());
  const isAdmin = !!(st && st.deployed && st.role === 'admin');
  const kept = snapshotFields();

  const main = h('main#main.k-scope');
  let body;
  let statusEl = null;
  if (!c || !c.isConfigured()) {
    body = h('div.ad-body', {}, [state('local', 'No cloud, no console', 'This build carries no Supabase project (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')]);
  } else if (!signedIn) {
    body = h('div.ad-body', {}, [state('signin', 'Sign in', 'Use an administrator’s Google account.',
      [button({ label: 'CONTINUE WITH GOOGLE', variant: 'primary', pill: true, attrs: { 'data-auth-action': 'google' } })])]);
  } else if (!st) {
    body = h('div.ad-body', {}, [state('checking', 'Checking…', '')]);
  } else if (!isAdmin) {
    body = h('div.ad-body', {}, [state('denied', 'Administrators only',
      'Signed in as ' + (c.getUserEmail() || 'this account') + '. Access is granted by the studio’s owner.',
      [button({ label: 'BACK TO THE STUDIO', href: 'index.html' })])]);
  } else {
    if (ov.phase === 'idle') loadOverview();
    const sections = {
      overview: overviewTab(), people: peopleTab(st), requests: requestsTab(st), purchases: purchasesTab(st), growth: growthAdminSection(block, st)
    };
    for (const id of Object.keys(NEW_TABS)) sections[id] = moduleTab(id);
    const counts = pendingCounts();
    for (const id of Object.keys(NEW_TABS)) {
      let c = null;
      try { c = NEW_TABS[id].badge ? NEW_TABS[id].badge(makeCtx(id)) : null; } catch (e) { c = null; }
      if (Number(c) > 0) counts[id] = Number(c);
    }
    const ordered = TAB_DEFS.map((t) => sections[t.id]).filter(Boolean);
    for (const sec of ordered) if (counts[sec.id] > 0) sec.dataset.tabBadge = String(Math.min(99, counts[sec.id]));
    statusEl = statusBar();
    body = stampDensity(h('div.ad-body.ad-console.ad-grouped', {}, ordered));
  }

  /* The header is drawn after the body is chosen so the status chips can sit
     on the title's own row (the design's console header); statusBar() reads
     the overview phase loadOverview() just set. */
  const head = pageHeader({
    eyebrow: 'Administration',
    title: 'Console',
    sub: isAdmin ? 'Signed in as ' + (c.getUserEmail() || 'an administrator') : null,
    class: 'ad-head'
  });
  main.append(head);
  if (statusEl) main.append(statusEl);
  main.append(body);
  /* Identical output is not repainted (commitMain); scroll and focus survive. */
  commitMain(app, main, () => {
    carryFields(kept);
    mountShell();
    if (isAdmin && !drawerSynced) { drawerSynced = true; syncDrawerFromHash(makeCtx('')); }
    try {
      StudioUI.autoAriaLabels();
      StudioUI.wireGlossaryPopovers();
      StudioUI.polishEmptyStates();
    } catch (e) { console.warn('[admin] chrome', e); }
  });
}
/* Gate, plan, access, billing, growth, auth and the overview fetch all land
   within a second of load; one trailing paint instead of one each. */
const renderSoon = coalesce(render, 60);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ad-action="reload"]');
  if (el) { ov = { ...ov, phase: 'idle' }; loadOverview(); const c = makeCtx('overview'); healthTab.reload(c); auditTab.reloadRecent(c); }
});
/* A link in the Overview that names a tab: go through ctx.go() so its params
   (an audit target, a drawer) land in the hash the way the tab expects. */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-ad-go]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  let params; try { params = a.dataset.adParams ? JSON.parse(a.dataset.adParams) : undefined; } catch (err) { params = undefined; }
  makeCtx(a.dataset.adGo).go(a.dataset.adGo, params);
});

wireGateUI(renderSoon);
wirePlanFeatures(renderSoon);
wireAccessAdmin(renderSoon);
wireBillingAdmin(renderSoon);
wireGrowthAdmin(renderSoon);
Store.subscribe('gate:changed', refreshStatus);
Store.subscribe('cloud:booted', refreshStatus);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshStatus, 0));
refreshStatus();
/* If the boot never announces itself, the page must not stay blank: after 3s
   draw with what is known (the sign-in or checking state). */
setTimeout(() => { if (!painted) { forceRender = true; refreshStatus(); renderSoon(); } }, 3000);
