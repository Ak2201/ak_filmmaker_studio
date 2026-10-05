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
  if (!c || !c.isConfigured()) return 'This build has no cloud project, so there is nothing here to be invited to. Everything you write is saved in this browser.';
  if (!c.getSession() && getCodePass()) return 'This browser came in with an invite code. Sign in with Google whenever you want your work backed up to an account; nothing else is needed.';
  if (!c.getSession()) return 'The studio is invite-only. Enter the code you were given to come straight in — or sign in with Google and ask for an invite.';
  if (g.state === 'unknown') return 'Checking whether this account is through the gate…';
  if (g.state === 'open') return 'This account is through the gate. Your projects sync to it.';
  if (g.state === 'lost') return 'This account is active on another device, so sync is paused here.';
  return c.gateDetail ? c.gateDetail(g.reason) + '. Everything on this device is still here.' : 'Sync is paused.';
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
      'Cloud sync is a build setting that this copy of the studio does not carry. Your work lives in this browser; back it up from Settings.'));
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
      'A request is made BY an account, so the address an administrator sees is the one Google attested rather than one typed into a box. Signing in changes nothing on this device.');
    sec.append(h('div.iv-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })
    ]));
    body.append(sec);
  } else if (g.state === 'unknown') {
    body.append(section('checking', 'One moment', 'Checking your invite…', 'Asking the studio whether ' + (email || 'this account') + ' is through the gate.'));
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
        'A paid plan admits this account without an invite. One payment, full access for good; the free tier is what an invited member gets.');
      buy.append(planCards(plans, null, {
        onBuy: (planId, period, onStatus) => Billing.buy(planId, period, { onStatus }),
        rerender: render
      }));
      body.append(buy);
    }
    const out = section('meanwhile', 'Meanwhile', 'Nothing here is locked.',
      'The gate guards the cloud, not your work. Every page in the studio opens and saves on this device while you wait; sync starts by itself once you are through.');
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
