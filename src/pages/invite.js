/* ============================================================
   INVITE — the doorway to the studio's cloud
   ------------------------------------------------------------
   Where a sign-in lands when the gate is closed (cloud.js's
   runGate() sends the FIRST load after a sign-in here and no other),
   and where the sign-in pill points for as long as it stays closed.
   Two routes through, both from schema sections 13 and 14:

     a code     verified anonymously, redeemed once Google has said
                who is redeeming — src/ui/gate-ui.js's box, the same
                one settings.html shows
     a request  the signed-in account asks; an administrator approves
                from the console — src/ui/invite-request.js

   And the order the user asked for: sign in FIRST, then the ask. A
   request made by a signed-in account carries an e-mail Google
   attested, so there is nothing to type and nothing to forge; a
   signed-out visitor is offered Google, and the code box for anyone
   who already holds one.

   WHAT THIS PAGE DOES NOT DO. It never blocks the local app. Being
   sent here once is not being kept here: the breadcrumb, the rail
   and every link out work, and a visitor waiting on an administrator
   can go on writing in this browser with sync paused. The gate guards
   the cloud; see the banner at the top of src/lib/gate.js.

   LOAD ORDER: store.js first (invariant 6). cloud.js is imported by
   name because nothing else on this page would pull it in, and the
   whole page is a view of window.StudioCloud.
   ============================================================ */
import Store from '../lib/store.js';   /* FIRST — invariant 6. */
import Billing from '../lib/billing.js';
import { planCards } from '../ui/plan-cards.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../styles/invite.css';
import '../lib/cloud.js';              /* sets window.StudioCloud; the gate lives there */

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { inviteSection, wireGateUI } from '../ui/gate-ui.js';
import { requestBlock, wireRequestUI } from '../ui/invite-request.js';
import { getCodePass, clearCodePass, codeFromLocation, formatCode } from '../lib/gate.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;

function section(id, eyebrow, title, deck) {
  const sec = h('section.iv-sec.st-sec', { id });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

/* The deck under the title says which of the four situations this
   is, in one sentence, before the sections repeat it with controls. */
function deckFor(c, g) {
  if (!c || !c.isConfigured()) return 'Invites are not available right now. Everything you write is saved in this browser.';
  if (!c.getSession() && getCodePass()) return 'This browser came in with an invite code. Sign in with Google whenever you want your work backed up to an account; nothing else is needed.';
  if (!c.getSession()) return 'The studio is invite-only. Enter the code you were given to come straight in — or sign in with Google and ask for an invite.';
  if (g.state === 'unknown') return 'Checking your invite…';
  if (g.state === 'open') return 'You are in. Your projects sync to this account.';
  if (g.state === 'lost') return 'This account is active on another device, so sync is paused here.';
  return c.gateDetail ? c.gateDetail(g.reason) + '. Everything on this device is still here.' : 'Sync is paused.';
}

/* The one sentence that points a newcomer at the legal pages before
   they sign in. Links, not a checkbox: continuing is the agreement. */
function legalLine(lead) {
  return h('p.iv-legal', {}, [
    lead,
    h('a', { href: 'terms.html', text: 'Terms of Service' }),
    ' and the ',
    h('a', { href: 'privacy.html', text: 'Privacy Policy' }),
    '.'
  ]);
}

function render() {
  const c = cloud();
  const g = (c && c.getGateState && c.getGateState()) || { state: 'unknown', reason: '', status: null };
  const signedIn = !!(c && c.getSession && c.getSession());
  const email = (c && c.getUserEmail && c.getUserEmail()) || '';

  const main = h('main#main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio · Invite' }),
    h('h1.bd-title', { text: 'Invite.' }),
    h('p.bd-deck', { text: deckFor(c, g) })
  ]));
  const body = h('div.iv-body');

  if (!c || !c.isConfigured()) {
    body.append(section('local', 'Local only', 'Nothing to redeem.',
      'Cloud sync is not available right now. Your work lives in this browser; you can back it up from Settings.'));
  } else if (!signedIn && getCodePass()) {
    const sec = section('through', 'Through', 'You’re in, with a code.',
      'Code ' + formatCode(getCodePass().code) + ' opened this browser. Your work is saved here; an account would back it up and let you pick it up elsewhere.');
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: 'index.html', text: 'GO TO THE STUDIO' }),
      h('button.btn', { type: 'button', 'data-auth-action': 'google', text: 'SIGN IN WITH GOOGLE' }),
      h('button.btn', { type: 'button', 'data-iv-action': 'forget-code', text: 'FORGET THIS CODE' })
    ]));
    body.append(sec);
  } else if (!signedIn) {
    /* The code first: it is the shorter road and the one a link
       arrives by. Sign-in is the other road, for people with no code. */
    const code = inviteSection(section, null);
    if (code) body.append(code);
    const sec = section('signin', 'No code?', 'Sign in with Google and ask.',
      'Sign in with your Google account and send a short request. Once it is approved you are in on your next visit. Signing in does not change anything on this device.');
    sec.append(h('div.iv-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })
    ]));
    sec.append(legalLine('By continuing you agree to the '));
    body.append(sec);
  } else if (g.state === 'unknown') {
    body.append(section('checking', 'One moment', 'Checking your invite…', 'Checking the invite for ' + (email || 'this account') + '.'));
  } else if (g.state === 'open') {
    const sec = section('through', 'Through', 'You’re in.',
      'Signed in as ' + email + '. Projects you open sync to this account, and the Chrome extension signs in with it too.');
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: 'index.html', text: 'GO TO THE STUDIO' }),
      h('a.btn', { href: 'settings.html#account', text: 'ACCOUNT SETTINGS' })
    ]));
    body.append(sec);
  } else if (g.state === 'lost') {
    const sec = section('lost', 'Elsewhere', 'Active on another device.',
      'Take the session back to sync here; the other window pauses. Or leave it — this device keeps saving locally.');
    sec.append(h('div.iv-actions', {}, [h('button.btn.primary', { type: 'button', 'data-iv-action': 'takeover', text: 'TAKE OVER SESSION' })]));
    body.append(sec);
  } else {
    /* closed */
    const st = g.status;
    const pending = st && st.requestStatus === 'pending';
    const sec = section('request', 'Step two', pending ? 'Your request is in.' : 'Ask for an invite.',
      'Signed in as ' + email + ', which is not a member of this studio yet.');
    sec.append(requestBlock(st, g.reason));
    body.append(sec);
    const code = inviteSection(section, st);
    if (code) body.append(code);
    /* PAYING GRANTS ENTRY (schema section 16): a plan is the third route
       through the gate. The cards come from the plans table; a purchase
       activates server-side and runGate() is asked again. */
    if (plans) {
      const buy = section('buy', 'Or', 'Buy a plan and come straight in.',
        'A paid plan lets this account in without an invite. One payment, access for good. Invited members start on the free plan.');
      buy.append(planCards(plans, null, {
        onBuy: (planId, period, onStatus) => Billing.buy(planId, period, { onStatus }),
        rerender: render
      }));
      body.append(buy);
    }
    const out = section('meanwhile', 'Meanwhile', 'Your work is safe.',
      'Anything already saved on this device stays exactly as it is. Once you are in, everything opens again and sync starts by itself.');
    out.append(h('div.iv-actions', {}, [
      h('a.btn', { href: 'index.html', text: 'KEEP WORKING' }),
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })
    ]));
    body.append(out);
  }

  main.append(body);
  app.replaceChildren(main);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[invite] chrome', e); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-iv-action]');
  if (!el) return;
  if (el.dataset.ivAction === 'takeover' && cloud() && cloud().takeBack) cloud().takeBack();
  if (el.dataset.ivAction === 'forget-code') {
    clearCodePass();
    try { sessionStorage.removeItem('fms_sitegate_pass'); } catch (err) { /* ignore */ }
    render();
  }
});

/* AN INVITE LINK: invite.html#code=XXXX-XXXX-XXXX. The code is read
   once, taken off the address bar (so a reload, a bookmark or a
   screenshot does not carry it), typed into the box and submitted as
   if by hand — one code path for the link and the keyboard. Only when
   signed out: a signed-in member with a link has nothing to do with
   it, and a signed-in non-member gets the same box, pre-filled. */
function adoptLinkCode() {
  const code = codeFromLocation();
  if (!code) return;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  const fill = () => {
    const box = document.getElementById('gtCode');
    if (!box) return false;
    box.value = formatCode(code);
    const c = cloud();
    if (c && !c.getSession() && !getCodePass()) box.form.requestSubmit();
    return true;
  };
  if (!fill()) {
    /* The box renders once the cloud has booted; try again on each
       redraw until it is there, then stop. */
    const off = Store.subscribe('gate:changed', () => { if (fill()) off(); });
    setTimeout(() => { fill(); }, 800);
  }
}
adoptLinkCode();

/* Everything this page shows arrives later than the first paint —
   the session, then the gate's answer a round trip after it — so it
   redraws on each, from the one source. */
let plans = null;
async function loadPlans() {
  const c = cloud();
  if (!c || !c.isConfigured() || !c.getSession()) return;
  try { plans = await Billing.listPlans(); } catch (e) { plans = null; }   // section 16 not run: no cards
  render();
}
wireGateUI(render);
wireRequestUI(render);
Store.subscribe('gate:changed', () => { if (!plans) loadPlans(); });
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(loadPlans, 0));
loadPlans();
Store.subscribe('gate:changed', render);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(render, 0));
render();
