/* ============================================================
   THE CONSOLE — the application as a whole, for its administrators
   ------------------------------------------------------------
   ONE page, five tabs (src/ui/tabs.js turns the top-level sections
   into the strip; the hash picks one):

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
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { fmtPaise } from '../lib/billing.js';
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

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;

const TABS = { overview: 'Overview', people: 'People', requests: 'Requests', purchases: 'Purchases', growth: 'Growth' };
/* A block's own heading, where the module's first sub-heading does not
   already name it. Everything else starts at the module's h3. */
const BLOCK_TITLE = { features: 'Plan features', invoices: 'Invoices' };

function tab(id) {
  return h('section.ad-tab', { id, 'data-tab-label': TABS[id] });
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
  return h('section.ad-state', { id }, [
    h('h2.ad-state-h', { text: title }),
    line ? h('p.ad-meta', { text: line }) : null,
    actions && actions.length ? h('div.ad-actions', {}, actions) : null
  ].filter(Boolean));
}

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '');
const n = (v) => (Number(v) || 0).toLocaleString();
const plural = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;

/* ---- the numbers ------------------------------------------------ */

let ov = { phase: 'idle', data: null, accounts: [], users: [], error: '' };

async function loadOverview() {
  const g = gate();
  if (!g || ov.phase === 'loading') return;
  ov = { ...ov, phase: 'loading', error: '' }; render();
  try {
    const [data, accounts, users] = await Promise.all([g.admin.overview(), g.admin.listAccounts(), g.admin.listUsers()]);
    ov = { phase: 'ok', data: data || {}, accounts: accounts || [], users: users || [], error: '' };
  } catch (e) {
    ov = { ...ov, phase: 'error', error: e.message || 'The console could not load.' };
  }
  render();
}

/* A tile is a figure over its label, and a link to where it is acted on. */
function stat(label, value, sub, href, attention) {
  return h('a.ad-stat' + (attention ? '.is-attention' : ''), { href }, [
    h('span.ad-stat-n', { text: value }),
    h('span.ad-stat-l', { text: label }),
    sub ? h('span.ad-stat-sub', { text: sub }) : null
  ].filter(Boolean));
}

function overviewTab() {
  const sec = tab('overview');
  if (ov.error) sec.append(h('p.gt-error', { role: 'alert', text: ov.error }));
  if (ov.phase !== 'ok') { sec.append(h('p.ad-meta', { text: ov.phase === 'loading' ? 'Counting…' : '' })); return sec; }
  const d = ov.data;
  const b = billingSnapshot();
  const g = growthSnapshot();
  const pr = purchasesRequiredNow();
  const by = (b && b.overview.active_by_plan) || {};
  const paying = Object.entries(by).filter(([k]) => k !== 'free').reduce((t, [, v]) => t + (Number(v) || 0), 0);
  const trials = Number.isInteger(d.trials_active)
    ? stat('Trials running', n(d.trials_active), '', '#growth')
    : stat('Trial', g ? (g.trial_enabled !== false ? 'On' : 'Off') : '…', g && g.trial_enabled !== false ? trialLength(g.trial_minutes || 30) : '', '#growth');
  sec.append(h('div.ad-stats', {}, [
    stat('Members', n(d.members_active), `${n(d.members_admin)} admin`, '#members'),
    stat('Pending requests', n(d.requests_pending), '', '#admin-console', d.requests_pending > 0),
    stat('Paying accounts', b ? n(paying) : '…', '', '#billing'),
    stat('Revenue', b ? fmtPaise(b.overview.paid_total_paise || 0) : '…', b ? `${fmtPaise(b.overview.paid_30d_paise || 0)} in 30 days` : '', '#billing'),
    trials,
    stat('Purchases required', pr === null ? '—' : pr ? 'On' : 'Off', '', '#purchasesRequired')
  ]));
  sec.append(h('div.ad-bar', {}, [
    h('p.ad-meta', { text: [
      plural(d.users_total, 'signed in', 'signed in'), `${n(d.users_active_7d)} active this week`,
      plural(d.accounts, 'organisation', 'organisations'), plural(d.projects, 'film', 'films'),
      `${n(d.sessions_live)} online`, `${plural(d.codes_active, 'code', 'codes')} open`, 'counted ' + fmtTime(d.generated_at)
    ].join(' · ') }),
    h('button.btn.ad-refresh', { type: 'button', 'data-ad-action': 'reload', text: 'REFRESH' })
  ]));
  return sec;
}

function organisationsBlock() {
  const sec = block('organisations');
  sec.append(h('h3.gt-h3', { text: `Organisations (${ov.accounts.length})` }));
  if (!ov.accounts.length) { sec.append(h('p.gt-meta', { text: 'None yet.' })); return sec; }
  const table = h('table.gt-table');
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
  const table = h('table.gt-table');
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
    ov.phase === 'ok' ? signedInBlock() : null,
    ov.phase === 'ok' ? organisationsBlock() : null
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
    invoiceAdminSection(block, st, { rerender: render }),
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

let st = null;   // the last studio_status(); null until asked
let askedFor = '';

async function refreshStatus() {
  const c = cloud();
  if (!c || !c.gate || !c.getSession()) { st = null; askedFor = ''; render(); return; }
  const who = c.getUserEmail ? c.getUserEmail() : '';
  if (askedFor === who && st) { render(); return; }
  try { st = await c.gate.status(); askedFor = who; } catch (e) { st = null; }
  render();
}

function render() {
  const c = cloud();
  const signedIn = !!(c && c.getSession && c.getSession());
  const isAdmin = !!(st && st.deployed && st.role === 'admin');
  const kept = snapshotFields();

  const main = h('main#main');
  main.append(h('header.bd-head.ad-head', {}, [
    h('p.bd-eyebrow', { text: 'Administration' }),
    h('h1.bd-title', { text: 'Console' }),
    isAdmin ? h('p.ad-meta', { text: 'Signed in as ' + (c.getUserEmail() || 'an administrator') }) : null
  ].filter(Boolean)));

  let body;
  if (!c || !c.isConfigured()) {
    body = h('div.ad-body', {}, [state('local', 'No cloud, no console', 'This build carries no Supabase project (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')]);
  } else if (!signedIn) {
    body = h('div.ad-body', {}, [state('signin', 'Sign in', 'Use an administrator’s Google account.',
      [h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })])]);
  } else if (!st) {
    body = h('div.ad-body', {}, [state('checking', 'Checking…', '')]);
  } else if (!isAdmin) {
    body = h('div.ad-body', {}, [state('denied', 'Administrators only',
      'Signed in as ' + (c.getUserEmail() || 'this account') + '. Access is granted by the studio’s owner.',
      [h('a.btn', { href: 'index.html', text: 'BACK TO THE STUDIO' })])]);
  } else {
    if (ov.phase === 'idle') loadOverview();
    body = h('div.ad-body.ad-console', {}, [
      overviewTab(), peopleTab(st), requestsTab(st), purchasesTab(st), growthAdminSection(block, st)
    ].filter(Boolean));
  }

  main.append(body);
  app.replaceChildren(main);
  carryFields(kept);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[admin] chrome', e); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ad-action="reload"]');
  if (el) { ov = { ...ov, phase: 'idle' }; loadOverview(); }
});

wireGateUI(render);
wirePlanFeatures(render);
wireAccessAdmin(render);
wireBillingAdmin(render);
wireGrowthAdmin(render);
Store.subscribe('gate:changed', refreshStatus);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshStatus, 0));
refreshStatus();
