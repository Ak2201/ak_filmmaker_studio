/* ============================================================
   PURCHASES — every purchase item, for the administrators
   ------------------------------------------------------------
   The money half of the console, on a page of its own (the owner:
   "a separate space for purchase instead of admin console; for admin
   all, which will have all purchase items"). Five tabs, each a
   section the shell turns into a tab (src/ui/tabs.js):

     Payments & refunds   #billing   the money, refund requests, ledger
     Invoices             #invoices  Bills of Supply, newest first
     Promo codes          #promos    discount and affiliate codes
     Tiers & grants       #tiers     what a tier costs and allows, grants
     Growth               #growth    trial, price rise, referrals,
                                     affiliates, leads, funnel

   Nothing is rebuilt: each tab mounts the module that used to sit in
   admin.html (src/ui/billing-admin.js in three parts, invoice-panels,
   growth-admin). SHOWN BY ROLE, AND THE ROLE IS THE SERVER'S —
   studio_status() says whether this account is an admin, and every RPC
   behind a tab re-checks is_studio_admin(); a page forced open from
   devtools gets 42501 from each call. A non-admin sees the denied
   state, as admin.html shows it.
   ============================================================ */
import Store from '../lib/store.js';   /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../styles/admin.css';
import '../lib/cloud.js';              /* sets window.StudioCloud */

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { billingAdminSection, wireBillingAdmin } from '../ui/billing-admin.js';
import { invoiceAdminSection } from '../ui/invoice-panels.js';
import { growthAdminSection, wireGrowthAdmin } from '../ui/growth-admin.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;

const TAB_LABELS = { billing: 'Payments & refunds', invoices: 'Invoices', promos: 'Promo codes', tiers: 'Tiers & grants', growth: 'Growth' };

function section(id, eyebrow, title, deck) {
  const sec = h('section.ad-sec.st-sec', { id, ...(TAB_LABELS[id] ? { 'data-tab-label': TAB_LABELS[id] } : {}) });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

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
    h('h1.bd-title', { text: 'Purchases.' }),
    h('p.bd-deck', { text: !c || !c.isConfigured()
      ? 'This build carries no cloud project, so there are no purchases to show.'
      : !signedIn ? 'Sign in with the administrator account to see every purchase.'
      : !st ? 'Checking who you are…'
      : !isAdmin ? 'This account is not an administrator of the studio.'
      : 'Payments, refunds, invoices, promo codes, tiers and growth, in one place.' })
  ]));
  const body = h('div.ad-body');

  if (!c || !c.isConfigured()) {
    body.append(section('local', 'Local only', 'No cloud, no purchases.', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time.'));
  } else if (!signedIn) {
    const sec = section('signin', 'Administrators', 'Sign in.', 'Use an administrator’s Google account.');
    sec.append(h('div.ad-actions', {}, [h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })]));
    body.append(sec);
  } else if (!st) {
    body.append(section('checking', 'One moment', 'Checking…', ''));
  } else if (!isAdmin) {
    const sec = section('denied', 'Administrators only', 'Not this account.',
      'Signed in as ' + (c.getUserEmail() || 'this account') + '. Administrator access is granted by the studio’s owner and cannot be requested from this page. Plans and your own invoices are on the Purchase page.');
    sec.append(h('div.ad-actions', {}, [h('a.btn', { href: 'purchase.html', text: 'GO TO PURCHASE' }), h('a.btn', { href: 'index.html', text: 'BACK TO THE STUDIO' })]));
    body.append(sec);
  } else {
    const parts = [
      billingAdminSection(section, st, { part: 'payments' }),
      invoiceAdminSection(section, st, { rerender: render }),
      billingAdminSection(section, st, { part: 'promos' }),
      billingAdminSection(section, st, { part: 'tiers' }),
      growthAdminSection(section, st)
    ];
    for (const p of parts) if (p) body.append(p);
  }

  main.append(body);
  app.replaceChildren(main);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[purchases] chrome', e); }
}

wireBillingAdmin(render);
wireGrowthAdmin(render);
Store.subscribe('gate:changed', refreshStatus);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshStatus, 0));
refreshStatus();
