/* ============================================================
   THE CONSOLE — the application as a whole, for its administrators
   ------------------------------------------------------------
   Two things on one page, because the person who reads one reads the
   other in the same sitting:

     the studio in numbers   who has signed in, who is through the
                             gate, who is waiting, how many
                             organisations and seats, how many films,
                             who is active right now — schema section
                             15, three read-only RPCs
     the gate's controls     invite requests, codes, members, sessions
                             and screening passes — src/ui/gate-ui.js's
                             adminSection(), which used to live on
                             settings.html and moved here whole

   SHOWN BY ROLE, AND THE ROLE IS THE SERVER'S. studio_status() says
   whether this account is an admin; every RPC on this page re-checks
   is_studio_admin() itself, so the page appearing is a convenience and
   a page forced open from devtools gets 42501 from every call. The
   lists are DATA, not controls: nothing here grants, revokes or
   deletes except through the buttons gate-ui.js already had.

   LOAD ORDER: store.js first (invariant 6). cloud.js by name, because
   the page is a view of window.StudioCloud and nothing else here would
   pull it in.
   ============================================================ */
import Store from '../lib/store.js';   /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../styles/admin.css';
import '../lib/cloud.js';              /* sets window.StudioCloud; the gate lives there */

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { adminSection, wireGateUI } from '../ui/gate-ui.js';
import { billingAdminSection, wireBillingAdmin } from '../ui/billing-admin.js';
import { planFeaturesSection, wirePlanFeatures } from '../ui/plan-features.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;

/* THE CATEGORIES. One strip across the top of the console, one entry
   per section below it, pinned under the shell so it is in reach from
   anywhere down the page. They are LINKS to the sections, not tabs
   that hide the rest: every section keeps its id and stays in the
   document, so a deep link (#billing) lands, the gate's proofs find
   their controls without first picking a tab, and the page can be
   read top to bottom as well as jumped around. The one that is on
   screen is marked by an IntersectionObserver, not by the hash. */
const CATEGORIES = [
  ['overview',      'Overview'],
  ['organisations', 'Organisations'],
  ['people',        'People'],
  ['admin-console', 'Access'],
  ['billing',       'Billing'],
  ['features',      'Features']
];
let onScreen = 'overview';
let spy = null;
function categoryBar() {
  const nav = h('nav.ad-tabs', { 'aria-label': 'Console sections' });
  for (const [id, label] of CATEGORIES) {
    nav.append(h('a.ad-tab' + (onScreen === id ? '.is-on' : ''), { href: '#' + id, 'data-ad-tab': id, text: label,
      ...(onScreen === id ? { 'aria-current': 'location' } : {}) }));
  }
  return nav;
}
function watchSections() {
  if (spy) spy.disconnect();
  if (typeof IntersectionObserver !== 'function') return;
  spy = new IntersectionObserver((entries) => {
    const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!hit) return;
    const id = hit.target.id;
    if (id === onScreen) return;
    onScreen = id;
    document.querySelectorAll('.ad-tab').forEach((t) => {
      const on = t.dataset.adTab === id;
      t.classList.toggle('is-on', on);
      if (on) t.setAttribute('aria-current', 'location'); else t.removeAttribute('aria-current');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  CATEGORIES.forEach(([id]) => { const el = document.getElementById(id); if (el) spy.observe(el); });
}

function section(id, eyebrow, title, deck) {
  const sec = h('section.ad-sec.st-sec', { id });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const n = (v) => (Number(v) || 0).toLocaleString();

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

function stat(label, value, sub, attention) {
  return h('div.ad-stat' + (attention ? '.is-attention' : ''), {}, [
    h('span.ad-stat-n', { text: n(value) }),
    h('span.ad-stat-l', { text: label }),
    sub ? h('span.ad-stat-sub', { text: sub }) : null
  ].filter(Boolean));
}
function group(label, tiles) {
  return h('div.ad-group', {}, [h('p.ad-group-l', { text: label }), h('div.ad-stats', {}, tiles)]);
}

function overviewSection() {
  const sec = section('overview', 'Overview', 'The studio in numbers.',
    'Counted by the database when this page loaded, not kept anywhere. Refresh to count again.');
  if (ov.error) sec.append(h('p.gt-error', { role: 'alert', text: ov.error }));
  if (ov.phase !== 'ok') { sec.append(h('p.ad-meta', { text: ov.phase === 'loading' ? 'Counting…' : '' })); return sec; }
  const d = ov.data;
  sec.append(group('People', [
    stat('Signed in, ever', d.users_total, `${n(d.users_new_30d)} new in 30 days`),
    stat('Active this week', d.users_active_7d),
    stat('Through the gate', d.members_active, `${n(d.members_admin)} admin · ${n(d.members_disabled)} disabled`),
    stat('Waiting for an invite', d.requests_pending, `${n(d.requests_approved)} approved · ${n(d.requests_declined)} declined`, d.requests_pending > 0),
    stat('Active right now', d.sessions_live, `${n(d.sessions_24h)} in the last 24 hours`)
  ]));
  sec.append(group('Organisations', [
    stat('Organisations', d.accounts),
    stat('Seats in use', d.account_members_active, `${n(d.account_members_pending)} invited, not yet joined`)
  ]));
  sec.append(group('Films', [
    stat('Projects in the cloud', d.projects, `${n(d.projects_new_30d)} new in 30 days`),
    stat('Worked on this week', d.projects_updated_7d),
    stat('Collaborators', d.collaborators, `${n(d.shares_live)} live share links`),
    stat('Invite codes open', d.codes_active)
  ]));
  sec.append(h('div.ad-actions', {}, [h('button.btn', { type: 'button', 'data-ad-action': 'reload', text: 'REFRESH' })]));
  sec.append(h('p.ad-meta', { text: 'Counted ' + fmtWhen(d.generated_at) + '.' }));
  return sec;
}

function accountsSection() {
  const sec = section('organisations', 'Organisations', `Accounts (${ov.accounts.length}).`,
    'An organisation is a studio account: an owner, a plan, seats, and the films attached to it.');
  if (ov.phase !== 'ok') return sec;
  if (!ov.accounts.length) { sec.append(h('p.ad-meta', { text: 'No organisation has been created yet. People create one from Settings → Account.' })); return sec; }
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

function usersSection() {
  const sec = section('people', 'People', `Everyone who has signed in (${ov.users.length}).`,
    'Members, requesters and strangers alike — the one list that includes an account with no invite, because it exists only in the sign-in table.');
  if (ov.phase !== 'ok') return sec;
  if (!ov.users.length) { sec.append(h('p.ad-meta', { text: 'Nobody has signed in yet.' })); return sec; }
  const live = (u) => u.last_heartbeat && Date.now() - Date.parse(u.last_heartbeat) < 90000;
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['Who', 'Standing', 'Last sign-in', 'Films', 'Orgs', 'Now'].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const u of ov.users) {
    tb.append(h('tr', {}, [
      h('td', {}, [h('strong', { text: u.display_name || u.email }), u.display_name ? h('br') : null, u.display_name ? h('span.ad-meta', { text: u.email }) : null].filter(Boolean)),
      h('td', {}, [roleTag(u)]),
      h('td', { text: fmtWhen(u.last_sign_in_at) + ' · joined ' + fmtDate(u.created_at) }),
      h('td', { text: n(u.projects) }),
      h('td', { text: n(u.accounts) }),
      h('td', { text: live(u) ? 'Active' : '' })
    ]));
  }
  table.append(tb);
  sec.append(h('div.gt-scroll', {}, [table]));
  return sec;
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

  const main = h('main#main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio · Administration' }),
    h('h1.bd-title', { text: 'Console.' }),
    h('p.bd-deck', { text: !c || !c.isConfigured()
      ? 'This build carries no cloud project, so there is nothing to administer.'
      : !signedIn ? 'Sign in with the administrator account to see the studio as a whole.'
      : !st ? 'Checking who you are…'
      : !isAdmin ? 'This account is not an administrator of the studio.'
      : 'Everything the studio knows about itself, and the controls that let people in.' })
  ]));
  const body = h('div.ad-body');

  if (!c || !c.isConfigured()) {
    body.append(section('local', 'Local only', 'No cloud, no console.', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time.'));
  } else if (!signedIn) {
    const sec = section('signin', 'Administrators', 'Sign in.', 'The console is shown by the role the database reports for the signed-in account, and every number on it is fetched by that account.');
    sec.append(h('div.ad-actions', {}, [h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })]));
    body.append(sec);
  } else if (!st) {
    body.append(section('checking', 'One moment', 'Checking…', ''));
  } else if (!isAdmin) {
    const sec = section('denied', 'Administrators only', 'Not this account.',
      'Signed in as ' + (c.getUserEmail() || 'this account') + '. An administrator is made by hand in the database (schema section 13.2); nothing on this site can grant it.');
    sec.append(h('div.ad-actions', {}, [h('a.btn', { href: 'index.html', text: 'BACK TO THE STUDIO' })]));
    body.append(sec);
  } else {
    if (ov.phase === 'idle') loadOverview();
    body.append(categoryBar());
    body.append(overviewSection(), accountsSection(), usersSection());
    const console_ = adminSection(section, st);
    if (console_) body.append(console_);
    const feats = planFeaturesSection(section, st);
    const bill = billingAdminSection(section, st);
    if (bill) body.append(bill);
    if (feats) body.append(feats);
  }

  main.append(body);
  app.replaceChildren(main);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[admin] chrome', e); }
  if (isAdmin) watchSections();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ad-action="reload"]');
  if (el) { ov = { ...ov, phase: 'idle' }; loadOverview(); }
});

wireGateUI(render);
wireBillingAdmin(render);
wirePlanFeatures(render);
Store.subscribe('gate:changed', refreshStatus);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshStatus, 0));
refreshStatus();
