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
import { pageHeader } from '../ui/kit/page-header.js';
import { listPriceBlock } from '../ui/list-prices.js';
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
/* After chrome.js on purpose: it reads sitegate.js's key names, and
   sitegate.js must still be evaluated where chrome.js puts it. */
import {
  readGateWhyRaw, clearGateWhy, readGateWhy, readSiteOpen, saveSiteOpen, wantsRequestView, forgetRequestView,
  clearSitegatePass, takeInvitePlan, deckFor as deckSentence, whySentence as whyFrom, retryable as isRetryable,
  isDemoHash, trialOfferFrom, anonTrialFrom, trialRefusal
} from '../lib/invite-model.js';

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
  const configured = !!(c && c.isConfigured());
  const signedIn = configured && !!c.getSession();
  return deckSentence({
    configured,
    signedIn,
    codeHeld: configured && !signedIn && !!getCodePass(),
    trialsOff: configured && !signedIn && trialsOff(),
    state: g.state,
    reason: g.reason,
    gateDetail: configured && c.gateDetail ? (r) => c.gateDetail(r) : null
  });
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
   sessionStorage (fms_sitegate_why). Say it once, plainly; no new key.
   invite-model.js reads it and words it. */
function whySentence(c, signedIn, state) {
  return whyFrom(readGateWhy(), { configured: !!(c && c.isConfigured()), signedIn, state });
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
let siteOpen = readSiteOpen();
let askedOpen = false;
function askSiteOpen() {
  if (siteOpen || askedOpen) return;
  askedOpen = true;
  purchasesRequired().then((v) => {
    if (typeof v !== 'boolean') return;
    saveSiteOpen(v);
    if (v === false) { siteOpen = true; render(); }
  }).catch(() => { /* the offer stands */ });
}

/* The page they asked for before the gate turned them away
   (return-to.js), validated; '' until it resolves. */
let returnHref = '';
function refreshReturn() {
  resolveReturn().then((to) => { if (to !== returnHref) { returnHref = to; render(); } }).catch(() => {});
}

/* `#request` survives the Google hop (invite-model.js remembers it for
   the tab): the hash does not (the return lands on the hub). */
const wantsRequest = () => wantsRequestView(location.hash);
const forgetRequest = forgetRequestView;

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
  /* ONE PAGE FRAME: the kit header every studio page opens with. The
     deck is this page's answer to "why am I here", so it is a body
     paragraph rather than the header's sub (which .bd-head hides). */
  main.append(pageHeader({ eyebrow: ['Studio', 'Come in'], title: 'Come in', class: 'bd-head' }));
  const body = h('div.iv-body');
  body.append(h('p.bd-deck.iv-deck', { text: deckFor(c, g) }));
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
    /* Plans are bought on purchase.html only. Signed out, the prices are
       on start.html and the buy screen is purchase.html, which asks for the
       sign-in itself. */
    {
      const buy = section('buy', 'Or', 'Buy a plan and come straight in.',
        'One payment, access for good — no trial first if you already know you want it.');
      /* The prices on this page (src/ui/list-prices.js), not a link away. */
      buy.append(listPriceBlock());
      buy.append(h('div.iv-actions', {}, [
        h('a.btn.primary', { href: 'purchase.html', text: 'SEE PLANS AND BUY' }),
        h('a.btn', { href: 'pricing.html#compare', text: 'COMPARE EVERY FEATURE' })
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
    /* The same prices and the same button a new signup gets: this branch
       used to offer one bare SEE PLANS, one hop more than a stranger.
       Plans are BOUGHT on purchase.html only (owner, 12 Oct 2026). */
    sec.append(listPriceBlock());
    sec.append(h('div.iv-actions', {}, [
      h('a.btn.primary', { href: 'purchase.html', text: 'SEE PLANS AND BUY' }),
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
        'Open the Dragon and The Dark Knight samples — two whole films, each with its script, its breakdown, its schedule and its call sheets — and read them from the inside, for ' + len + '. No card, nothing to fill in.');
      t.append(h('div.iv-actions', {}, [
        h('button.btn.primary', { type: 'button', 'data-iv-action': 'start-trial', text: 'START MY ' + len.toUpperCase() })
      ]));
      t.append(h('p.bd-sub', { id: 'trialMsg', role: 'status', 'aria-live': 'polite', text: '' }));
      body.append(t);
    }
    /* PAYING GRANTS ENTRY (schema section 16). The plans themselves are
       NOT drawn here any more (owner, 12 Oct 2026: "all purchases only in
       the Purchase space"). purchase.html is exempt from the site gate, so
       a signed-in person who is not through yet can reach it, and the one
       buy screen is the one place prices, promo codes, checkout and
       upgrade credits live. */
    {
      const buy = trialOffer
        ? section('buy', 'Or', 'Buy a plan and come straight in.',
            'One payment, access for good — and the only thing that keeps the studio open once a trial has run out.')
        : section('buy', used ? 'Your trial' : 'Plans', used ? 'Your free trial is over.' : 'Choose a plan to come in.',
            'Signed in as ' + email + '. Everything you wrote is still saved on this device, exactly as it is. One payment, access for good.');
      buy.append(listPriceBlock());
      buy.append(h('div.iv-actions', {}, [
        h('a.btn' + (trialOffer ? '' : '.primary'), { href: 'purchase.html', text: 'SEE PLANS AND BUY' })
      ]));
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
    const retryable = isRetryable(g.reason, readGateWhyRaw());
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
    clearSitegatePass();
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
  clearGateWhy();
  render();
}

/* A plan chosen on start.html (signed out) is stashed there under this key
   (start.js writes it) and has to survive the Google hop, which returns to the
   hub and so loses ?plan=. Plans are bought on purchase.html only, so once
   this page knows there is a session it forwards the buyer there with the plan
   named — plan-cards.js marks that card. The stash is spent when it is used. */
function forwardPlan() {
  try {
    const to = takeInvitePlan(!!(cloud() && cloud().getSession && cloud().getSession()));
    if (to) location.replace(to);
  } catch (e) { /* the page still offers SEE PLANS AND BUY */ }
}

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
      say(trialRefusal(r && r.reason), true);
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
  const demo = isDemoHash(location.hash);
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
/* true once billing_status() has been read for this session */
let statusRead = false;
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
    anonTrial = anonTrialFrom(t);
    render();
  }).catch(() => { /* the length is a courtesy, never a gate */ });
}
async function loadPlans() {
  const c = cloud();
  if (!c || !c.isConfigured() || !c.getSession()) return;
  /* One round trip, one render: every render() replaces `main`, so a reader
     typing a note into the request form would lose it on a second one. */
  const st = await Billing.status().catch(() => null);
  statusRead = true;
  forwardPlan();
  readTrialOffer(st);
  render();
}

/* Anything paid, granted or refunded counts as having paid
   (paidBefore() in invite-model.js) — the same read as plan-gate.js,
   deliberately: the wall and the door must not disagree. */
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
    /* The console can set any length (1 minute to 31 days), so the
       offer reads the server's figure; 30 is the column's default, for
       a database that predates the key. */
    trialOffer = trialOfferFrom(st);
  } catch (e) { trialOffer = null; }
}
wireGateUI(render);
wireRequestUI(render);
Store.subscribe('gate:changed', () => { if (!statusRead) loadPlans(); });
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
