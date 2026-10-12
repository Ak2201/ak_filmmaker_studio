/* ============================================================
   THE SITE GATE — the website is invite-only, not only the cloud
   ------------------------------------------------------------
   Decided by the owner on 5 Oct 2026, and worth stating plainly
   because it reverses the contract the rest of this codebase was
   written under: the gate used to guard the CLOUD and never local
   work. Now a visitor who is not through the gate sees nothing but
   invite.html — sign in with Google, then a code or a request — and
   the pages open only once an administrator has let them in.

   WHAT IT DOES AND DOES NOT PROTECT. This is a static site: every
   HTML, JS and JSON file is public, and anybody can read them. What
   this module controls is whether the APP RENDERS for a visitor, which
   is the owner's product decision; what protects people's cloud data
   is RLS in the database, and nothing here changes that. Local work in
   a browser is hidden while its owner is outside the gate — never
   deleted, never touched — and reappears the moment they are through.

   AND SINCE 12 OCT 2026 IT FOLLOWS THE PURCHASES SWITCH (§32), which
   is the owner's access model rather than this module's:
     purchases OFF -> anybody signed in with Google is in. The website
                      is open; membership only decides whether their
                      work SYNCS.
     purchases ON  -> a plan or a running trial, both of which write the
                      membership row this gate reads. A free trial is
                      the first road in and is started by a PRESS, never
                      by itself.
     not known     -> the membership gate below, failing closed.

   HOW IT DECIDES, in order, on every page that imports chrome.js:
     1. <html data-sitegate="pending"> is set at module evaluation,
        and base.css hides the document while it is. No flash of the
        app for somebody who is about to be sent away.
     2. The decision waits for cloud.js to BOOT (`cloud:booted`),
        because "no session" means nothing until the stored one has
        been restored or found missing.
     3. A CODE PASS (gate.js) -> the code is re-verified once per
                                 browser session and, valid, lets the
                                 visitor in signed out or signed in
                                 and closed alike; invalid, it is
                                 forgotten and the rest applies
        Signed out            -> purchase.html (the one place a plan is bought), start.html (the public landing page;
                                 every other refusal goes to invite.html)
        no cloud in the build -> invite.html (nobody can be checked,
                                 so nobody is in — fail closed)
        gate 'open' or 'lost' -> show the page ('lost' is a member
                                 whose session is on another device;
                                 they are in, their sync is paused)
        purchases OFF         -> show the page, whatever the gate says
        gate 'closed'         -> invite.html, whatever the reason —
                                 EXCEPT 'unreachable' in a tab that
                                 already passed this session, so one
                                 dropped request mid-session does not
                                 throw a member out of their own work
        gate 'unknown'        -> keep waiting, up to GIVE_UP_MS, then
                                 invite.html (a status call that never
                                 returns is not a pass)
   The pass is remembered in sessionStorage only: this tab, this
   session. A new tab asks again. Nothing is written to localStorage,
   which the verify gate asserts.

   EXEMPT: invite.html (the doorway), screening.html (a guest's pass is
   its own credential), privacy.html, terms.html and refund.html (the OAuth consent
   screen's and the payment gateway's readers, which import nothing anyway),
   start.html (the public landing page — what the product IS, for a
   stranger who has not been invited yet; it imports no app code either),
   and everything under
   chrome-extension:// — the side panel has its own gatekeeper and
   opens the app's pages inside it.

   THE BUILD FLAG. `VITE_SITE_GATE=off` turns this module into a no-op
   at build time, and the build says which it is in a <meta> tag that
   vite.config.js injects. `npm run verify` loads every page SIGNED OUT
   and measures its words, keys and contrast; under the gate every one
   of those loads would be a redirect to invite.html, so verify refuses
   a gated dist and asks for `npm run build:open`. The production build
   (`npm run build`, which is what Vercel and Netlify run) has the gate
   ON; scripts/prove-gate.mjs refuses an OPEN dist for the mirror-image
   reason. Two builds, each checked by the tool that can see it.
   ============================================================ */
import Store from './store.js';
import { getCodePass, clearCodePass, isMissing } from './gate.js';
/* §32's purchases_required(). Plain fetch to PostgREST with the anon
   key — no SDK, so asking it costs nothing at first paint, and gate.js
   already imports this module so it adds no weight to any chunk. */
import { purchasesRequired } from './funnel.js';
import { rememberReturn, takeReturn } from './return-to.js';
/* THE GATE CANNOT DECIDE WITHOUT THIS, so it asks for it rather than
   hoping. cloud.js sets window.StudioCloud, and everything below reads
   that global — evaluate() returns 'wait' until it appears, and after
   GIVE_UP_MS that becomes a REDIRECT. Six page entries import cloud.js
   by name (hub, feature, short, invite, panel, admin); no module page
   does, and `vite.config.js` says so where it forces cloud into
   CORE_LIB. That works in a BUILD, where every page loads the core
   chunk, and fails in `npm run dev`, where a module loads only if
   something imports it: on settings.html window.StudioCloud was simply
   undefined, so the gate timed out and bounced a signed-in admin to
   invite.html, isConfigured() was unreachable and the Plan section
   announced "this build is not connected to a cloud project" with a
   real project in .env. One missing import, and only the bundler was
   hiding it. Side-effect import on purpose: the gate wants the global,
   not the exports. No cycle — cloud.js imports store, drive, gate and
   extension-bridge, none of which import this file.

   STATIC, AND MEASURED. This was briefly `import('./cloud.js')`, on a
   diagnosis that turned out to be wrong: feature.html was over its
   first-paint budget and I attributed the 35KB to cloud.js being
   dragged into CORE_LIB by this edge. It was not. `feature.js` has
   always imported cloud.js directly (line 72), so that page never
   lacked it, and the budget overrun is PRE-EXISTING — `main` fails the
   same check at 1,088,622 bytes. Measured on both branches: main
   1,088,622 / 48 files, static here 1,089,038 / 48, dynamic
   1,090,683 / 49. The dynamic form cost MORE and added a chunk. Static
   it is, at +416 bytes for everything this branch adds. 8-9 Oct 2026. */
import './cloud.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const SITE_GATE = String(env.VITE_SITE_GATE || 'invite').toLowerCase() === 'off' ? 'off' : 'invite';
export const PASS_KEY = 'fms_sitegate_pass';   // sessionStorage, never localStorage
/* The purchases switch, cached for this tab's session. sessionStorage
   and NOT localStorage, for the reason the pass is: `verify` asserts
   zero localStorage writes across four idle seconds, and a gate that
   recorded its own decision would trip it, correctly. */
export const REQ_KEY = 'fms_purchases_req';
/** Why the last redirect happened, for the page that lands after it.
 *  sessionStorage, diagnostic only; nothing decides on it. */
export const WHY_KEY = 'fms_sitegate_why';
/* The veil cannot stay up for ever, so an unanswered gate gives up and
   FAILS CLOSED. Twenty seconds, in dev as in the build.

   It was briefly (env.DEV ? 120 : 20) on 8 Oct 2026, to stop the dev
   server bouncing a signed-in admin to invite.html. That was treating
   a symptom: the gate was not slow, it was never going to be answered,
   because window.StudioCloud did not exist on module pages in dev —
   see the import above. With the import in place the gate answers well
   inside twenty seconds and the allowance is gone, deliberately. A
   timeout here should stay loud enough to mean something. */
const GIVE_UP_MS = 20000;
/* purchase is exempt since 12 Oct 2026: it is the ONE place a plan is bought,
   and a signed-in person the gate has not let through (purchases required, no
   plan, no trial) has to be able to reach it. invite.html used to sell plans
   itself for exactly that reason. The page draws no studio content, and it
   handles being signed out. */
const EXEMPT = /(^|\/)(invite|screening|privacy|terms|refund|start|purchase)(\.html)?$/;

export function isExempt() {
  if (typeof location === 'undefined') return true;
  if (location.protocol === 'chrome-extension:') return true;
  return EXEMPT.test(location.pathname);
}

const passed = () => { try { return sessionStorage.getItem(PASS_KEY) === '1'; } catch (e) { return false; } };
const remember = () => { try { sessionStorage.setItem(PASS_KEY, '1'); } catch (e) { /* private mode: asks again */ } };

/* Is a supabase-js session sitting in localStorage? The same shape check
   cloud.js uses to decide whether to load the SDK, read without it. Here
   storage that throws answers NO: optimistic admission must never be
   granted on a guess. */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token(\.\d+)?$/.test(k)) return true;
    }
  } catch (e) { /* no storage, no optimism */ }
  return false;
}

/* ---- THE PURCHASES SWITCH, AND WHAT IT NOW DECIDES ----------------
   The owner's decision, 12 Oct 2026, and it changes what this gate IS:

     purchases OFF -> anybody who signs in with Google is in. No invite,
                      no code, no plan, no trial. The website is open.
     purchases ON  -> a plan or a running trial is required, and
                      membership (which start_trial() and a purchase both
                      write) is still what says so.
     NOT KNOWN     -> exactly what this file did before: the membership
                      gate, failing closed.

   WHY THE UNKNOWN CASE IS THE OLD BEHAVIOUR rather than "open". A gate
   that opened on a failed fetch would open on every offline load, on a
   database that has not run §32, and on any request a proxy ate — which
   is the fail-open bug docs/GATE.md exists to close. A wrong "closed"
   costs somebody a reload; a wrong "open" costs the gate.

   -1 unknown | 0 off | 1 on. Cached for the session because this is
   asked on every navigation and the answer changes about once a month. */
let purchaseReq = -1;
try {
  const v = sessionStorage.getItem(REQ_KEY);
  if (v === '1') purchaseReq = 1; else if (v === '0') purchaseReq = 0;
} catch (e) { /* private mode: asked again, every page */ }
let askedReq = false;
/* Has the question been ANSWERED, however it was answered? Distinct
   from `purchaseReq !== -1`, because "the database has not run §32" is
   a settled unknown and must not hold the veil up for twenty seconds.
   True straight away when the session cache already held a value. */
let reqSettled = purchaseReq !== -1;
function askPurchaseReq() {
  if (askedReq) return;
  askedReq = true;
  const done = () => { reqSettled = true; decide(); };
  purchasesRequired().then((v) => {
    if (typeof v === 'boolean') {
      purchaseReq = v ? 1 : 0;
      try { sessionStorage.setItem(REQ_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    done();                                    // null: a settled unknown
  }).catch(done);
}

let decided = false;
let optimistic = false;   // the veil was lifted before the verdict; the verdict is still owed
let timer = 0;

function allow() {
  if (decided) return;
  decided = true;
  clearTimeout(timer);
  remember();
  delete document.documentElement.dataset.sitegate;
  /* The reason for an earlier bounce is history once they are in; left
     behind it would be printed by invite.html for a state that no longer
     holds. */
  try { sessionStorage.removeItem(WHY_KEY); } catch (e) { /* ignore */ }
  Store.notify('sitegate:open', {});
  spendReturn();
}
/* THE PAGE THEY ASKED FOR (return-to.js). Spent once, on the hub only:
   that is where a Google return lands. A hub load that carries a query
   (?sample=1, ?welcome=plan) is somebody else's errand and is left
   alone, as is anything while the demo landing is pending. */
function spendReturn() {
  try {
    if (!/\/(index(\.html)?)?$/.test(location.pathname) || location.search) return;
    if (sessionStorage.getItem('fms_demo_land') === '1') return;
    takeReturn().then((to) => { if (to) location.replace(to); }).catch(() => {});
  } catch (e) { /* a courtesy, never a gate */ }
}
function deny(reason) {
  if (decided) return;
  decided = true;
  clearTimeout(timer);
  try { sessionStorage.removeItem(PASS_KEY); } catch (e) { /* ignore */ }
  /* WHY the gate sent them away, and from where. The redirect destroys
     the page that knew, so without this a bounce is indistinguishable
     from a broken page — which is exactly how it reads, and how it read
     for an hour on 8 Oct 2026. invite.html may print it; a developer can
     read it in sessionStorage after any unexplained redirect. */
  try {
    sessionStorage.setItem(WHY_KEY, JSON.stringify({
      reason, from: location.pathname + location.hash, at: new Date().toISOString(),
    }));
  } catch (e) { /* private mode: the breadcrumb is a nicety */ }
  /* And where they were going, so the way back from sign-in can be the
     page they asked for. Path only; see return-to.js. */
  rememberReturn(location.pathname + location.hash);
  document.documentElement.dataset.sitegate = 'denied';
  Store.notify('sitegate:denied', { reason });
  /* A STRANGER (signed out, no valid code) is sent to the public landing
     page, which says what the product is and links on to invite.html;
     everyone else (signed in but not a member, nobody checkable, a
     timeout) goes straight to the doorway. Both targets are EXEMPT. */
  location.replace(reason === 'signedout' ? 'start.html' : 'invite.html');
}

/** Why the current state is or is not through. Exported for the
 *  proof harness and for a page that wants to say so; the decision
 *  itself is taken by decide() below. */
export function evaluate() {
  const c = window.StudioCloud;
  if (!c) return { verdict: 'wait', reason: 'nocloudjs' };
  if (!c.isConfigured()) return { verdict: 'deny', reason: 'nocloud' };
  if (!c.isBooted || !c.isBooted()) return { verdict: 'wait', reason: 'booting' };
  /* The code pass, before the session: it admits a signed-out visitor
     and a signed-in one the gate has closed on (their membership may
     simply not have happened yet). Verified once per browser session;
     `codeCheck` is that verification's outcome. */
  /* A HELD CODE IS NOT A KEY ANY MORE, EXCEPT A DEMO ONE (owner,
     12 Oct 2026). Every other pass is merely HELD — waiting to be spent
     on the account that signs in next, which is where its seven-day
     trial can be counted. A demo link is the exception on purpose: it
     exists to show the sample to a room, where asking for a Google
     account is the whole of the friction it was made to avoid.

     THE STAMP IS WHAT DECIDES, not the code. gate-ui's box, start.js
     and an invite link all set a pass without `from: 'demo'`, so none
     of them admits a signed-out browser; only invite.js's demo branch
     sets it. A pass with no stamp at all is an OLD one, written by a
     build that let codes in on their own — it is not admitted either,
     which is the conservative reading and costs that browser one
     sign-in. */
  const pass0 = getCodePass();
  if (pass0) {
    /* VERIFIED WHATEVER IT IS FOR. A held code is re-checked once per
       browser session even when it cannot admit anybody, because that
       check is what makes revoking a code mean something: without it a
       revoked code would sit in a browser until the next sign-in and
       then fail quietly at redemption. verifyCodePass() forgets a code
       the server refuses. */
    if (codeCheck === 'pending' && !passed()) return { verdict: 'wait', reason: 'code-check' };
    /* ADMITTED only if it is a demo pass, or there is a session to
       redeem it against. 'bad' falls through: the pass was cleared. */
    if (codeCheck === 'ok' || (codeCheck === 'pending' && passed())) {
      if (pass0.from === 'demo' || c.getSession()) return { verdict: 'allow', reason: 'code' };
    }
  }
  if (!c.getSession()) return { verdict: 'deny', reason: 'signedout' };
  /* Signed in, and nothing is for sale: the website is open. Note this
     sits AFTER the signed-out check on purpose — "open" means open to
     accounts, not to strangers, which is the owner's wording. It also
     sits BEFORE the gate state, so a member whose sync is paused and a
     visitor with no membership at all are treated the same here; what
     membership still decides is whether their work SYNCS, which is
     cloud.js's business and is left exactly as it was. */
  if (purchaseReq === 0) return { verdict: 'allow', reason: 'open-site' };
  const g = c.getGateState();
  if (g.state === 'open' || g.state === 'lost') return { verdict: 'allow', reason: g.state };
  if (g.state === 'closed') {
    if (g.reason === 'unreachable' && passed()) return { verdict: 'allow', reason: 'unreachable-but-passed' };
    /* DO NOT WALK THEM OUT BEFORE THE SWITCH HAS ANSWERED. The membership
       call and the purchases call go out together, and the membership one
       is the quicker of the two — so without this a signed-in visitor on
       an OPEN website was bounced to the door for the half-second before
       the answer that would have let them in arrived, which is a redirect
       and therefore not something a later verdict can take back. The
       give-up timer still bounds the wait. */
    if (!reqSettled) return { verdict: 'wait', reason: 'purchases' };
    return { verdict: 'deny', reason: g.reason || 'closed' };
  }
  return { verdict: 'wait', reason: 'unknown' };
}

let codeCheck = 'pending';   // 'pending' | 'ok' | 'bad'
let checking = false;
async function verifyCodePass() {
  const c = window.StudioCloud;
  const pass = getCodePass();
  if (!c || !pass || checking || codeCheck !== 'pending') return;
  if (passed()) { codeCheck = 'ok'; return; }   // this tab already checked it this session
  checking = true;
  try {
    const t = await c.gate.verifyCode(pass.code);
    if (t.passType === 'standard') codeCheck = 'ok';
    else { clearCodePass(); codeCheck = 'bad'; }   // a screening pass is not a way into the studio
  } catch (e) {
    /* A refusal (revoked, expired, used up, unknown) forgets the code.
       A missing function or a network failure forgets nothing and
       admits nobody: fail closed, try again next session. */
    if (!isMissing(e) && e.code !== 'nocloud' && !/fetch|network/i.test(String(e.message || ''))) clearCodePass();
    codeCheck = 'bad';
  } finally {
    checking = false;
    decide();
  }
}

function decide() {
  const v = evaluate();
  if (v.verdict === 'wait' && v.reason === 'code-check') { verifyCodePass(); return; }
  if (v.verdict === 'allow') allow();
  else if (v.verdict === 'deny') deny(v.reason);
}

/* A member who signs out, or whose membership is revoked mid-session,
   is decided again: the page they are on stops being theirs to see.
   `decided` is reset for those two events only. */
function redecide() { decided = false; decide(); }

if (SITE_GATE === 'invite' && typeof document !== 'undefined' && !isExempt()) {
  document.documentElement.dataset.sitegate = 'pending';
  /* OPTIMISTIC ADMISSION. A tab that already passed this session, and
     that still holds a stored session or a code pass, lifts the veil at
     once instead of waiting for the lazy SDK, the session restore and
     the membership call on every navigation. Nothing else changes: the
     same verdict is still computed, and a deny still runs deny() and
     redirects. Anyone who has not passed in this tab (a new tab, a
     stranger, a cleared session) never reaches this branch and waits,
     failing closed as before. */
  if (passed() && (hasStoredSession() || getCodePass())) {
    optimistic = true;
    delete document.documentElement.dataset.sitegate;
  }
  /* Asked at once, not when it is first needed: it is a plain fetch with
     no dependency on the SDK, the session or the gate, so it rides
     alongside the cloud boot instead of adding a round trip after it. */
  askPurchaseReq();
  Store.subscribe('cloud:booted', decide);
  Store.subscribe('gate:changed', () => (decided ? redecide() : decide()));
  /* A page restored from the back/forward cache keeps its old JS state,
     so a gated page left open before a sign-out elsewhere would show
     itself again. Decide afresh: no stored session and no code pass
     means signed out whatever this page remembers. */
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    if (!hasStoredSession() && !getCodePass()) {
      decided = false;
      document.documentElement.dataset.sitegate = 'pending';
      deny('signedout');
      return;
    }
    redecide();
  });
  /* cloud.js assigns window.StudioCloud when it evaluates, which may be
     after this module on a page whose entry imports it later. Poll
     briefly for the global. (This module DOES import cloud.js, above,
     so the global exists once that evaluates; the poll is a belt for
     an entry whose cloud.js finishes assigning it a tick later.) */
  const hook = setInterval(() => {
    const c = window.StudioCloud;
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => (decided ? redecide() : decide()));
    decide();
  }, 50);
  /* The give-up timer is for a status call that never answers, not
     for a person reading the takeover prompt (base.css lets that one
     dialog through the veil). While it is open the clock re-arms. */
  const giveUp = () => {
    if (decided) return;
    if (document.querySelector('.gt-overlay')) { timer = setTimeout(giveUp, GIVE_UP_MS); return; }
    clearInterval(hook);
    /* Already admitted on this tab's pass and never contradicted: an
       unanswered status call is the unreachable case, which a passed
       tab survives. */
    if (optimistic) { allow(); return; }
    deny('timeout');
  };
  timer = setTimeout(giveUp, GIVE_UP_MS);
  decide();
}

/* A WINDOW HOOK, NOT AN IMPORT: cloud.js cannot import this file (this
   one imports cloud.js), and cloud.js's landOnInvite() needs to ask
   whether the gate would let this page through right now. */
if (SITE_GATE === 'invite' && typeof window !== 'undefined') window.StudioSiteGate = { evaluate };

export default { SITE_GATE, isExempt, evaluate };

/* THE DEMO LINK'S LANDING (src/ui/gate-ui.js, enterAddress). A visitor
   who came in on a demo code with no film on the device is sent to
   index.html?sample=1; the hub seeds the Dragon sample and announces it
   as 'projects:changed' with reason 'sample'. That announcement, and
   only while the one-shot session flag is set, takes them on to the
   dashboard. The flag lives in sessionStorage, is cleared when it fires
   and after 30 seconds, and a page that is not the hub never listens. */
try {
  if (sessionStorage.getItem('fms_demo_land') === '1' && /\/(index(\.html)?)?$/.test(location.pathname)) {
    const done = () => { try { sessionStorage.removeItem('fms_demo_land'); } catch (e) { /* ignore */ } };
    const off = Store.subscribe('projects:changed', (d) => {
      if (d && d.reason === 'sample') { off(); done(); location.replace('dashboard.html'); }
    });
    setTimeout(() => { if (typeof off === 'function') off(); done(); }, 30000);
  }
} catch (e) { /* the demo landing is a courtesy, never a gate */ }
