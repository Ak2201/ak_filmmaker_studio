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
  if (!c.getSession()) return 'The studio’s cloud is invite-only. Sign in with Google first; then redeem a code, or ask for an invite with that account.';
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
  } else if (!signedIn) {
    const sec = section('signin', 'Step one', 'Sign in with Google.',
      'The request is made BY an account, so the address an administrator sees is the one Google attested rather than one typed into a box. Signing in changes nothing on this device.');
    sec.append(h('div.iv-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'CONTINUE WITH GOOGLE' })
    ]));
    body.append(sec);
    /* Already holding a code: the box verifies it first and sends
       them to Google with the ticket waiting, as on settings.html. */
    const code = inviteSection(section, null);
    if (code) body.append(code);
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
  const el = e.target.closest('[data-iv-action="takeover"]');
  if (el && cloud() && cloud().takeBack) cloud().takeBack();
});

/* Everything this page shows arrives later than the first paint —
   the session, then the gate's answer a round trip after it — so it
   redraws on each, from the one source. */
wireGateUI(render);
wireRequestUI(render);
Store.subscribe('gate:changed', render);
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(render, 0));
render();
