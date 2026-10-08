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
        Signed out            -> invite.html
        no cloud in the build -> invite.html (nobody can be checked,
                                 so nobody is in — fail closed)
        gate 'open' or 'lost' -> show the page ('lost' is a member
                                 whose session is on another device;
                                 they are in, their sync is paused)
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

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const SITE_GATE = String(env.VITE_SITE_GATE || 'invite').toLowerCase() === 'off' ? 'off' : 'invite';
export const PASS_KEY = 'fms_sitegate_pass';   // sessionStorage, never localStorage
/** Why the last redirect happened, for the page that lands after it.
 *  sessionStorage, diagnostic only; nothing decides on it. */
export const WHY_KEY = 'fms_sitegate_why';
/* The veil cannot stay up for ever, so an unanswered gate gives up and
   FAILS CLOSED. Twenty seconds is right for the built site, where the
   whole studio is a handful of chunks.

   IT IS WRONG FOR THE DEV SERVER, and the symptom is alarming rather
   than slow: Vite serves every module as its own request, so a heavy
   page (settings.html is the heaviest) can still be booting at twenty
   seconds, and a signed-in admin gets bounced to invite.html as though
   they had been refused. Measured on 8 Oct 2026 from the gate's own
   breadcrumb — reason 'timeout', from /settings.html — while the built
   site at the same moment was fine. Pre-bundling the Supabase SDK
   (vite.config.js optimizeDeps) removed part of the delay, not all of
   it, because the rest is the module waterfall itself.

   Dev gets two minutes. Production is unchanged: this is the one
   timing constant where being impatient looks exactly like being
   locked out, and dev is the only place slow enough to prove it. */
const GIVE_UP_MS = (env.DEV ? 120 : 20) * 1000;
const EXEMPT = /(^|\/)(invite|screening|privacy|terms|refund|start)(\.html)?$/;

export function isExempt() {
  if (typeof location === 'undefined') return true;
  if (location.protocol === 'chrome-extension:') return true;
  return EXEMPT.test(location.pathname);
}

const passed = () => { try { return sessionStorage.getItem(PASS_KEY) === '1'; } catch (e) { return false; } };
const remember = () => { try { sessionStorage.setItem(PASS_KEY, '1'); } catch (e) { /* private mode: asks again */ } };

let decided = false;
let timer = 0;

function allow() {
  if (decided) return;
  decided = true;
  clearTimeout(timer);
  remember();
  delete document.documentElement.dataset.sitegate;
  Store.notify('sitegate:open', {});
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
  document.documentElement.dataset.sitegate = 'denied';
  Store.notify('sitegate:denied', { reason });
  location.replace('invite.html');
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
  if (getCodePass()) {
    if (codeCheck === 'ok' || (codeCheck === 'pending' && passed())) return { verdict: 'allow', reason: 'code' };
    if (codeCheck === 'pending') return { verdict: 'wait', reason: 'code-check' };
    /* 'bad' falls through: the pass was cleared, the rest decides. */
  }
  if (!c.getSession()) return { verdict: 'deny', reason: 'signedout' };
  const g = c.getGateState();
  if (g.state === 'open' || g.state === 'lost') return { verdict: 'allow', reason: g.state };
  if (g.state === 'closed') {
    if (g.reason === 'unreachable' && passed()) return { verdict: 'allow', reason: 'unreachable-but-passed' };
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
  Store.subscribe('cloud:booted', decide);
  Store.subscribe('gate:changed', () => (decided ? redecide() : decide()));
  /* cloud.js assigns window.StudioCloud when it evaluates, which may be
     after this module on a page whose entry imports it later. Poll
     briefly for the global rather than import it — importing cloud.js
     here would put it on pages that chose not to carry it. */
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
    deny('timeout');
  };
  timer = setTimeout(giveUp, GIVE_UP_MS);
  decide();
}

export default { SITE_GATE, isExempt, evaluate };
