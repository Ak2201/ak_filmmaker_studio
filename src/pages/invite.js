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
import { h, commitMain } from '../lib/dom.js';
import { trialLength } from '../lib/trial-time.js';
/* §33's trial_offer(): ANON-callable, one narrow public fact (is the
   trial on, and how long is it). The signed-out half of this page needs
   it to name the length, and billing_status() cannot answer without a
   session. Plain fetch, no SDK — funnel.js owns that pattern. */
import { trialOffer as anonTrialOffer, purchasesRequired } from '../lib/funnel.js';
import { resolveReturn, clearReturn } from '../lib/return-to.js';
import { inviteSection, wireGateUI, markDemoPending, enterAddress } from '../ui/gate-ui.js';
import { requestBlock, wireRequestUI } from '../ui/invite-request.js';
import { getCodePass, setCodePass, clearCodePass, codeFromLocation, formatCode, errorSentence } from '../lib/gate.js';

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
  if (!c.getSession() && getCodePass()) return 'This browser is holding an invite code. Sign in with Google to spend it on your account and start the trial it carries.';
  if (!c.getSession()) {
    return !trialsOff()
      ? 'Start a free trial of the whole studio, buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.'
      : 'Buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.';
  }
  if (g.state === 'unknown') return 'Checking your invite…';
  if (g.state === 'open') return 'You are in. Your projects sync to this account.';
  if (g.state === 'lost') return 'This account is active on another device, so sync is paused here.';
  /* CLOSED. The old sentence here was the sync status — "Awaiting an
     invite" — which is true and is no longer what this page is for: it
     told somebody who had just asked for a free trial that they were
     waiting for one. Say what they can do instead, and keep the one
     thing they will actually be worried about. */
  if (g.state === 'closed' && (!g.reason || g.reason === 'noinvite')) {
    return 'Start a free trial, buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.';
  }
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

/* sitegate.js leaves the reason it turned a visitor away in
   sessionStorage (fms_sitegate_why). Say it once, plainly; no new key. */
function whyRaw() { try { return sessionStorage.getItem('fms_sitegate_why') || ''; } catch (e) { return ''; } }

function whySentence(c, signedIn, state) {
  let w = null;
  try { w = JSON.parse(whyRaw() || 'null'); } catch (e) { w = null; }
  if (!w || !w.reason) return '';
  const r = String(w.reason).toLowerCase();
  /* A BREADCRUMB ABOUT A STATE THAT NO LONGER HOLDS IS A LIE. The gate
     cleared it when it let somebody in, but this page is exempt and so
     never sees that happen; compare it with now instead. */
  if (r === 'signedout' && signedIn) return '';
  if (r === 'nocloud' && c && c.isConfigured()) return '';
  if (signedIn && (state === 'open' || state === 'lost')) return '';
  const page = w.from ? String(w.from).replace(/^\//, '').split(/[?#]/)[0] : '';
  const lead = page ? 'You were sent here from ' + page + ' because ' : 'You were sent here because ';
  if (r === 'signedout') return lead + 'you are not signed in.';
  if (r === 'nocloud') return lead + 'this site is not connected to its server just now. Everything on this device is still here.';
  if (r === 'timeout' || r === 'unreachable') return lead + 'your invite could not be checked just then. Everything on this device is still here.';
  return lead + 'this account has no trial running and no plan yet.';
}

/* WHAT THE READER HAS TYPED, ACROSS A REDRAW.
   This page replaces `main` on every gate event, every plans load and
   every auth change — by design, from one source. The invite-request
   note is the one field a person types into slowly (it asks who they
   are and who sent them), so it is the one a redraw can throw away.
   prove:gate caught exactly that: a request row arriving with the right
   attested e-mail and an EMPTY note, intermittently, depending on
   whether a round trip landed mid-sentence.

   Carried by id rather than by a general form-state mechanism because
   there is exactly one such field; if a second ever appears, this is
   the place to generalise. */
function keepTyped() {
  const el = document.getElementById('irNote');
  return el ? el.value : null;
}
function restoreTyped(v) {
  if (v == null || v === '') return;
  const el = document.getElementById('irNote');
  if (el && !el.value) el.value = v;
}

/* THE OPEN SITE. With the purchases switch off, any signed-in visitor is
   in (sitegate.js); membership only decides whether work SYNCS. This page
   is exempt from the gate, so it asks the same anon question itself and
   draws "you're in" instead of an offer nobody needs. Cached in the
   gate's own sessionStorage key, so both agree. */
let siteOpen = false;
try { siteOpen = sessionStorage.getItem('fms_purchases_req') === '0'; } catch (e) { /* ignore */ }
let askedOpen = false;
function askSiteOpen() {
  if (siteOpen || askedOpen) return;
  askedOpen = true;
  purchasesRequired().then((v) => {
    if (typeof v !== 'boolean') return;
    try { sessionStorage.setItem('fms_purchases_req', v ? '1' : '0'); } catch (e) { /* ignore */ }
    if (v === false) { siteOpen = true; render(); }
  }).catch(() => { /* the offer stands */ });
}

/* The page they asked for before the gate turned them away
   (return-to.js), validated; '' until it resolves. */
let returnHref = '';
function refreshReturn() {
  resolveReturn().then((to) => { if (to !== returnHref) { returnHref = to; render(); } }).catch(() => {});
}

/* `#request` survives the Google hop in sessionStorage: the hash does
   not (the return lands on the hub). */
const VIEW_KEY = 'fms_invite_view';
function wantsRequest() {
  if (/(^|#)request$/.test(location.hash)) {
    try { sessionStorage.setItem(VIEW_KEY, 'request'); } catch (e) { /* ignore */ }
    return true;
  }
  try { return sessionStorage.getItem(VIEW_KEY) === 'request'; } catch (e) { return false; }
}
function forgetRequest() { try { sessionStorage.removeItem(VIEW_KEY); } catch (e) { /* ignore */ } }

function render() {
  const typed = keepTyped();
  const c = cloud();
  const g0 = (c && c.getGateState && c.getGateState()) || { state: 'unknown', reason: '', status: null };
  const signedIn = !!(c && c.getSession && c.getSession());
  if (signedIn) askSiteOpen();
  const openSite = signedIn && siteOpen && g0.state !== 'lost';
  const g = openSite ? Object.assign({}, g0, { state: 'open' }) : g0;
  const wantReq = wantsRequest();
  const email = (c && c.getUserEmail && c.getUserEmail()) || '';

  const main = h('main#main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio · Come in' }),
    h('h1.bd-title', { text: 'Come in.' }),
    h('p.bd-deck', { text: deckFor(c, g) })
  ]));
  const body = h('div.iv-body');
  const why = whySentence(c, signedIn, g.state);
  if (why) body.append(h('p.bd-sub.iv-why', { role: 'status', text: why }));

  if (!c || !c.isConfigured()) {
    body.append(section('local', 'Local only', 'Nothing to redeem.',
      'Cloud sync is not available right now. Your work lives in this browser; you can back it up from Settings.'));
  } else if (!signedIn && getCodePass() && getCodePass().from === 'demo') {
    /* A DEMO PASS, and only a demo pass, is in on its own. */
    const sec = section('through', 'Through', 'You’re in, with a code.',
      'Code ' + formatCode(getCodePass().code) + ' opened this browser. Your work is saved here; an account would back it up and let you pick it up elsewhere.');
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: 'index.html', text: 'GO TO THE STUDIO' }),
      h('button.btn', { type: 'button', 'data-auth-action': 'google', text: 'SIGN IN WITH GOOGLE' }),
      h('button.btn', { type: 'button', 'data-iv-action': 'forget-code', text: 'FORGET THIS CODE' })
    ]));
    body.append(sec);
  } else if (!signedIn && getCodePass()) {
    /* HELD, NOT SPENT. The code is in this browser and worth a seven-day
       trial; a trial is counted against a person, so it is waiting for
       an account. One button, and it says what pressing it does. */
    const sec = section('through', 'Your code', 'Sign in to spend your code.',
      'Code ' + formatCode(getCodePass().code) + ' is held in this browser. Sign in with Google and it is redeemed on your account, with the free trial it carries. Nothing on this device changes.');
    sec.append(h('div.iv-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' }),
      h('button.btn', { type: 'button', 'data-iv-action': 'forget-code', text: 'FORGET THIS CODE' })
    ]));
    sec.append(legalLine('By continuing you agree to the '));
    body.append(sec);
  } else if (!signedIn) {
    /* THE ORDER IS THE OFFER, and it was the other way round until
       12 Oct 2026. This page used to lead with the code box and then
       ask a stranger to apply for an invite — so somebody who had just
       pressed "Start your free trial" on the landing page arrived at a
       form asking them to request one, and the trial they came for was
       nowhere on the page. Trial, then plans, then the code: what most
       people came for, first.

       All three begin with the same Google button, because all three
       belong to an ACCOUNT: a trial is counted against a person, a plan
       is bought by one, and a code is spent on one. */
    /* Hidden only when the server has SAID trials are off: a "Start your
       free trial" card would promise what it will refuse. An answer that
       has not arrived (offline, a slow call, a build with no network —
       which is what verify's baseline is captured under) leaves the card
       in place, the same fail-open rule start.js applies to its own card.
       Plans and the code box stay either way. */
    if (!trialsOff()) {
      const len = anonTrial && anonTrial.enabled ? trialLength(anonTrial.minutes) : '';
      /* The LENGTH belongs in the deck, not in the heading: "Start your
         30 minutes free trial" is not a sentence anybody says. */
      const t = section('trial', 'Free trial', 'Start your free trial.',
        'The whole studio, on the Dragon and The Dark Knight sample films' + (len ? ', for ' + len : '') + '. No card, nothing to install. Sign in and it begins.');
      t.append(h('div.iv-actions', {}, [
        h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })
      ]));
      t.append(legalLine('By continuing you agree to the '));
      body.append(t);
    }
    /* start.html links to invite.html#buy. A plan is bought by an
       account, so signed out the cards' way in is signing in. */
    /* Signed out, the prices are on start.html: fetching the plan rows
       here would pull the Supabase SDK into this page's first paint,
       which the budget forbids (CLAUDE.md, "lazy chunks"). */
    {
      const buy = section('buy', 'Or', 'Buy a plan and come straight in.',
        'One payment, access for good — no trial first if you already know you want it. Sign in with Google, then choose a plan.');
      buy.append(h('div.iv-actions', {}, [
        h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'SIGN IN TO BUY' }),
        h('a.btn', { href: 'start.html#pricing', text: 'SEE PLANS AND PRICES' })
      ]));
      body.append(buy);
    }
    /* Third, and no longer a door of its own: the box holds the code and
       sends them to Google, which is the only way it can be spent. */
    const code = inviteSection(section, null);
    if (code) body.append(code);
  } else if (g.state === 'unknown') {
    body.append(section('checking', 'One moment', 'Checking your invite…', 'Checking the invite for ' + (email || 'this account') + '.'));
  } else if (g.state === 'open' && !openSite && lastStatus && lastStatus.entitled === false) {
    /* §33. THROUGH THE GATE, BUT NOT ENTITLED: a member whose trial has
       run out (or who never had one, while purchases are required).
       This page used to say "You're in — GO TO THE STUDIO", and the
       studio was the wall, whose only door led back here: the loop the
       owner reported. It says what is true now, and offers the two
       real ways on — buy, or sign out. */
    const used = lastStatus.trial_used === true;
    const sec = section('through', used ? 'Your trial' : 'The studio', used ? 'Your free trial is over.' : 'Choose a plan to come in.',
      'Signed in as ' + email + '. Everything you wrote is still saved on this device; a plan opens the studio for good.');
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: 'purchase.html', text: 'SEE PLANS' }),
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })
    ]));
    body.append(sec);
    /* A held or typed code can still be entered here: the box was only
       drawn for somebody with no membership, which left a member whose
       trial had run out with no way to spend the code they were given. */
    const codeBox = inviteSection(section, g.status);
    if (codeBox) body.append(codeBox);
  } else if (g.state === 'open') {
    forgetRequest();
    /* §33: access given by e-mail with no plan says so, in the studio's
       words, rather than leaving the person to wonder what they are on. */
    const granted = !!(lastStatus && lastStatus.granted === true);
    const sec = section('through', 'Through', 'You’re in.',
      'Signed in as ' + email + '. ' + (granted ? 'Access given by the studio — the whole studio is open to you. ' : '')
      + (g0.state === 'open'
        ? 'Projects you open sync to this account, and the Chrome extension signs in with it too.'
        : 'The studio is open to everyone who signs in. Your work is saved on this device; syncing it to your account needs an invite or a plan.'));
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: returnHref || 'index.html', 'data-iv-action': 'enter', text: 'GO TO THE STUDIO' }),
      h('a.btn', { href: 'settings.html#account', text: 'ACCOUNT SETTINGS' }),
      /* Every state of this page that has a session has a way out of it. */
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })
    ]));
    body.append(sec);
  } else if (g.state === 'lost') {
    const sec = section('lost', 'Elsewhere', 'Active on another device.',
      'Take the session back to sync here; the other window pauses. Or leave it — this device keeps saving locally.');
    sec.append(h('div.iv-actions', {}, [h('button.btn.primary', { type: 'button', 'data-iv-action': 'takeover', text: 'TAKE OVER SESSION' })]));
    body.append(sec);
  } else {
    /* CLOSED — signed in, not a member. Since 12 Oct 2026 this is where
       a brand-new signup LANDS: they press "Start your free trial" on
       the landing page, Google sends them back to the hub, the site
       gate reads "not a member" and replaces the document with this
       page. So this branch is the offer, not a waiting room.

       THE ORDER CARRIES THE DECISION (owner, 12 Oct 2026):
         a trial is available -> the trial, first and primary; plans
                                 below it as the alternative
         no trial available   -> no trial section AT ALL; the plans
                                 lead, and the page says why

       NOTHING STARTS BY ITSELF. The owner was explicit: the trial
       begins when somebody presses the button and not before. A signup
       that quietly consumed the one trial an account ever gets, before
       the person had read a word of what it was, would spend it for
       them.

       trialOffer is null when §30 has not run, when the switch is off,
       when this account has had its trial, or when it has already paid.
       All four read as "plans only", which is why nothing here is
       conditional on a schema version. */
    const st = g.status;
    const used = !!(lastStatus && lastStatus.trial_used === true);
    if (trialOffer) {
      const len = trialLength(trialOffer.minutes);
      const t = section('trial', 'Free trial', 'Start your free trial.',
        'Open the Dragon sample — a complete Tamil feature, with its script, its breakdown, its schedule and its call sheets — and read it from the inside, for ' + len + '. No card, nothing to fill in.');
      t.append(h('div.iv-actions', {}, [
        h('button.btn.primary', { type: 'button', 'data-iv-action': 'start-trial', text: 'START MY ' + len.toUpperCase() })
      ]));
      t.append(h('p.bd-sub', { id: 'trialMsg', role: 'status', 'aria-live': 'polite', text: '' }));
      body.append(t);
    }
    /* PAYING GRANTS ENTRY (schema section 16). With a trial on offer
       this is the alternative; without one it is the whole page. */
    if (plans) {
      const buy = trialOffer
        ? section('buy', 'Or', 'Buy a plan and come straight in.',
            'One payment, access for good — and the only thing that keeps the studio open once a trial has run out.')
        : section('buy', used ? 'Your trial' : 'Plans', used ? 'Your free trial is over.' : 'Choose a plan to come in.',
            'Signed in as ' + email + '. Everything you wrote is still saved on this device, exactly as it is. One payment, access for good.');
      /* The status, not null (§33): planCards() disables BUY and says
         why for a DISABLED account, and with null it could not know —
         a disabled visitor pressed BUY, waited for Checkout, and was
         refused by rzp-order. */
      buy.append(planCards(plans, lastStatus, {
        onBuy: (planId, period, onStatus, code) => Billing.buy(planId, period, { onStatus, code }),
        /* Paying grants entry, so the gate has already flipped and this
           block is about to disappear: the hub's welcome card (read from
           ?welcome=plan, then removed) says what unlocked. */
        onSuccess: () => { location.href = 'index.html?welcome=plan'; },
        rerender: render
      }));
      body.append(buy);
    }
    const code = inviteSection(section, st);
    if (code) body.append(code);
    /* THE REQUEST QUEUE IS OFF THE PUBLIC DOOR (owner, 12 Oct 2026).
       "Ask an administrator and wait" was the only road in before the
       trial existed; it is now the slowest of four, and leading with it
       is what made this page read as a rejection. The RPC, the console
       queue and every pending request are untouched — the block is
       drawn for somebody who already HAS a request in flight (so they
       can see where it stands), and otherwise only at invite.html#request,
       which is the address an administrator can still hand out. */
    const asked = !!(st && st.requestStatus);
    /* NOT DEPLOYED is the third case and it is not optional: with the
       gate's functions missing there is no trial to offer and no plan
       to sell, so without the request block this page would have
       nothing on it at all. requestBlock() is what says "invites are
       not open yet" — it is the only place that sentence exists. */
    const undeployed = !!(st && st.deployed === false);
    if (asked || undeployed || wantReq) {
      const sec = section('request', 'Or', undeployed ? 'Invites are not open yet.' : asked && st.requestStatus === 'pending' ? 'Your request is in.' : 'Ask for an invite.',
        'Signed in as ' + email + ', which is not a member of this studio yet.');
      sec.append(requestBlock(st, g.reason));
      body.append(sec);
    }
    const out = section('meanwhile', 'Meanwhile', 'Your work is safe.',
      'Anything already saved on this device stays exactly as it is. Once you are in, everything opens again and sync starts by itself.');
    /* A check that could not be made is retryable; the others are not. */
    const retryable = g.reason === 'unreachable' || g.reason === 'nocloud' || /"reason":"(timeout|unreachable|nocloud)"/.test(whyRaw());
    out.append(h('div.iv-actions', {}, [
      retryable ? h('button.btn.primary', { type: 'button', 'data-iv-action': 'retry', text: 'TRY AGAIN' }) : null,
      h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' }),
      h('a.btn', { href: 'start.html', text: 'ABOUT THE STUDIO' })
    ]));
    body.append(out);
  }

  main.append(body);
  if (!commitMain(app, main, () => { restoreTyped(typed); mountShell(); })) return;
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
  if (el.dataset.ivAction === 'start-trial') startTrial(el);
  if (el.dataset.ivAction === 'enter') clearReturn();   // the link goes where it points; the errand is spent
  if (el.dataset.ivAction === 'retry') retryGate(el);
});

/* The gate's check can fail for the network's reasons (a timeout, an
   unreachable server). Ask again, then draw what it says. */
async function retryGate(btn) {
  btn.disabled = true; btn.textContent = 'CHECKING…';
  try { const c = cloud(); if (c && c.runGate) await c.runGate(); } catch (e) { /* the page says what it finds */ }
  try { sessionStorage.removeItem('fms_sitegate_why'); } catch (e) { /* ignore */ }
  render();
}

/* ?plan= and #buy must survive the Google hop, which returns to the hub
   and so loses both. Stashed (sessionStorage) when a sign-in button is
   pressed, restored below once this page is drawn again. */
const PLAN_KEY = 'fms_invite_plan';
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-auth-action="google"]');
  if (!b) return;
  let plan = '';
  try { plan = new URLSearchParams(location.search).get('plan') || ''; } catch (err) { plan = ''; }
  const buy = !!b.closest('#buy') || location.hash === '#buy' || !!plan;
  if (!buy) return;
  try { sessionStorage.setItem(PLAN_KEY, JSON.stringify({ plan: /^[\w-]{1,32}$/.test(plan) ? plan : '', buy: true })); } catch (err) { /* ignore */ }
}, true);
/* ...and the restore. The stash used to bring back only the scroll to
   #buy, so a buyer who pressed "Buy Intermediate" on start.html came
   back from Google to the right section with no card picked and no
   checkout — the plan they chose was lost on the hop. plan-cards.js
   reads ?plan= from the ADDRESS, so put it back there (replaceState:
   Back is not a second visit). start.js writes the same key. */
(function restorePlan() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('plan')) return;
    const v = JSON.parse(sessionStorage.getItem(PLAN_KEY) || 'null');
    if (!v || !v.plan || !/^[\w-]{1,32}$/.test(v.plan)) return;
    q.set('plan', v.plan);
    history.replaceState(history.state, '', location.pathname + '?' + q.toString() + '#buy');
  } catch (e) { /* the scroll to #buy below still happens */ }
})();

/* TWO STEPS, AND THE SECOND IS NOT OPTIONAL. start_trial() inserts the
   studio_members row, which is what the SITE gate reads — so until the
   gate is asked again, the studio still refuses this browser even
   though the server has already said yes. Billing.buy() does the same
   pair for the same reason. */
async function startTrial(btn) {
  const msg = document.getElementById('trialMsg');
  const say = (t, bad) => { if (msg) { msg.textContent = t; msg.classList.toggle('iv-bad', !!bad); } };
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'STARTING…';
  try {
    const r = await Billing.startTrial();
    if (!r || !r.started) {
      /* The ordinary refusals come back as a verdict, not an error —
         see start_trial()'s header for why. */
      const why = {
        used: 'You have already had your trial on this account. A plan opens the studio for good.',
        paid: 'You have already bought a plan — you should be in. Try reloading.',
        disabled: 'Trials are not open at the moment.'
      }[r && r.reason] || 'That did not start. Please try again.';
      say(why, true);
      btn.disabled = false; btn.textContent = was;
      trialOffer = null;
      return;
    }
    say('You are in. Opening the studio…');
    const c = cloud();
    if (c && c.runGate) await c.runGate();
    Store.notify('billing:changed', null);
    /* LAND ON THE FILM, NOT ON AN EMPTY HUB. The sentence above this
       button promises the Dragon sample, and a signup trial's scope IS
       'sample' — so sending them to a bare hub hands them a studio with
       nothing in it and thirty minutes to find the thing they were
       shown. enterAddress() is the demo link's existing landing: the
       sample is seeded on the hub and `fms_demo_land` carries them on to
       the dashboard, or straight to the dashboard if this device already
       has films of its own. One mechanism, not a second one. */
    markDemoPending();
    location.href = enterAddress();
  } catch (e) {
    say(errorSentence(e, 'That did not start. Please try again.'), true);
    btn.disabled = false; btn.textContent = was;
  }
}

/* AN INVITE LINK: invite.html#code=XXXX-XXXX-XXXX. The code is read
   once and taken off the address bar straight away — a code left there
   travels in a screenshot and sits in the history of a shared machine.

   IT NO LONGER LETS THEM IN BY ITSELF (owner, 12 Oct 2026). The link
   used to type the code into the box and submit it as if by hand, which
   entered the studio with no sign-in. A code is worth a seven-day trial
   now, and a trial is counted against a PERSON, so the code has to meet
   an account: it is HELD in this browser, the box shows it, and the
   next sign-in — from any button on this page — spends it. cloud.js's
   runGate() does the redeeming, as it already did for "come in now,
   sign in later".

   It is also no longer SUBMITTED on arrival. Sending somebody to Google
   the instant they open a link, before they have read a word of what
   this is, is not one motion — it is a hijack. The press is theirs. */
function adoptLinkCode() {
  const code = codeFromLocation();
  if (!code) return;
  /* `&demo=1` (the console's "Create demo link") IS THE ONE EXCEPTION,
     and deliberately so: a demo link exists to show the sample to a room
     — a festival desk, a producer, a classroom — where asking for a
     Google account is the whole of the friction it was made to avoid.
     The pass is stamped `from: 'demo'`, and sitegate.js admits a
     signed-out browser on that stamp and on no other. Read BEFORE the
     fragment is stripped. */
  const demo = /(?:^#|&)demo=1(?:&|$)/.test(String(location.hash || ''));
  const signedIn = !!(cloud() && cloud().getSession && cloud().getSession());
  if (demo && !signedIn) {
    setCodePass(code, { from: 'demo' });
    markDemoPending();
    location.replace(enterAddress());
    return;
  }
  if (!signedIn) setCodePass(code, { from: 'link' });
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  const fill = () => {
    const box = document.getElementById('gtCode');
    if (!box) return false;
    box.value = formatCode(code);
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
/* §30. { minutes } when this account may start a trial, else null.
   Null covers four different "no" answers — section 30 has not run, the
   owner switched trials off, this account has had one, this account has
   paid — and the page is identical in all four, which is what lets the
   same build run against a database that has never heard of a trial. */
let trialOffer = null;
/* The last billing_status() this page read, for the 'open' state: a
   member who is not entitled is not "in" (§33). */
let lastStatus = null;
/* { enabled, minutes } from the anon read, for the SIGNED-OUT branch
   only. Null until it lands, and the page is correct without it — the
   trial section simply says "your free trial" instead of naming a
   length. Never throws; funnel.js returns null on any failure. */
let anonTrial = null;
/* True only when the anonymous offer arrived AND says trials are off. */
function trialsOff() { return !!anonTrial && anonTrial.enabled === false; }
if (!(cloud() && cloud().getSession && cloud().getSession())) {
  anonTrialOffer().then((t) => {
    if (!t) return;
    anonTrial = { enabled: t.trial_enabled === true, minutes: Number(t.trial_minutes) > 0 ? Math.round(t.trial_minutes) : 30 };
    render();
  }).catch(() => { /* the length is a courtesy, never a gate */ });
}
async function loadPlans() {
  const c = cloud();
  if (!c || !c.isConfigured() || !c.getSession()) return;
  /* BOTH IN FLIGHT, ONE RENDER. These were sequential for an hour and
     it was a real bug, not just a slow page: every render() replaces
     `main`, so a reader who has started typing their note into the
     request form loses it when the second round trip lands. Awaiting
     the status AFTER the plans doubled the window in which that
     happens, and prove:gate caught it as an intermittent "the note and
     the browser that asked" — the row arrived with the right e-mail
     and name, attested by auth, and an empty note.

     Parallel restores the single round trip. The note is ALSO preserved
     across a render now (below), because the window can never be zero:
     this page redraws on every gate event by design. */
  const [pl, st] = await Promise.all([
    Billing.listPlans().catch(() => null),   // section 16 not run: no cards
    Billing.status().catch(() => null)
  ]);
  plans = pl;
  readTrialOffer(st);
  render();
}

/* Anything paid, granted or refunded. start_trial() refuses with
 *  reason 'paid' on `payments.paid_at is not null`, which catches a grant
 *  and a refunded buyer too — so offering one here would be offering what
 *  the server is about to refuse. The same read as plan-gate.js:234,
 *  deliberately: the wall and the door must not disagree about who has
 *  already paid. */
function paidBefore(st) {
  return !!(st && Array.isArray(st.payments)
            && st.payments.some((p) => p && /^(paid|granted|refunded)$/.test(p.status)));
}

function readTrialOffer(st) {
  lastStatus = st || null;
  try {
    /* The key has to be PRESENT to be believed: an older database
       returns no `trial_enabled` at all, and undefined must not read as
       "offer them one" any more than it reads as "wall them".

       IT USED TO READ `st.entitled !== true` AS WELL, AND THAT ONE LINE
       WAS THE WHOLE BUG. billing_status() computes entitled as
       `(not purchase_required) or (plan <> 'free') or trial_active`, and
       the live purchases switch is OFF — so entitled is TRUE for
       everybody, so this was never on, so the "Start your free trial"
       block was never drawn and nobody could ever begin one. The trial
       was enabled, configured and invisible.

       Entitlement answers "may they USE the app". Whether to OFFER a
       trial is a different question with a different answer, and the
       four facts below are the whole of it: trials are on, this account
       has not had one, is not in one, and has never paid. */
    const on = st && st.trial_enabled === true && st.trial_used !== true
            && st.trial_active !== true && !paidBefore(st);
    /* The console can set any length (1 minute to 31 days), so the
       offer reads the server's figure; 30 is the column's default, for
       a database that predates the key. */
    const mins = Number(st && st.trial_minutes);
    trialOffer = on ? { minutes: mins > 0 ? Math.round(mins) : 30 } : null;
  } catch (e) { trialOffer = null; }
}
wireGateUI(render);
wireRequestUI(render);
/* ?plan=<id> from a landing-page button: bring the buy section into view. */
function wantsBuy() {
  try {
    if (new URLSearchParams(location.search).get('plan') || location.hash === '#buy') return true;
    const v = JSON.parse(sessionStorage.getItem(PLAN_KEY) || 'null');
    return !!(v && v.buy);
  } catch (e) { return false; }
}
if (wantsBuy()) {
  /* The buy section draws once the plans (or, signed out, the page) have
     rendered; look for it until it is there, then scroll once. The stash
     is spent only when signed in: signed out, the visitor has not yet
     been through Google. */
  let tries = 0;
  const seek = () => {
    const b = document.getElementById('buy');
    if (b) {
      b.scrollIntoView({ block: 'start' });
      if (cloud() && cloud().getSession && cloud().getSession()) { try { sessionStorage.removeItem(PLAN_KEY); } catch (e) { /* ignore */ } }
      return;
    }
    if (++tries < 40) setTimeout(seek, 300);
  };
  setTimeout(seek, 600);
}
Store.subscribe('gate:changed', () => { if (!plans) loadPlans(); });
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(loadPlans, 0));
loadPlans();
refreshReturn();
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshReturn, 0));
/* THE HASH IS PART OF WHAT THIS PAGE DRAWS now that the request block
   lives behind #request, so a link to it from this very page — the
   commonest way anybody reaches it — must redraw. Without this the hash
   changes, nothing re-renders, and the block the address names is not
   there: a dead link that looks like a broken page. */
addEventListener('hashchange', render);
Store.subscribe('gate:changed', render);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(render, 0));
render();
