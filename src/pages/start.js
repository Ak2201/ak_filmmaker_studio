/* ============================================================
   START — the public landing page's only script
   ------------------------------------------------------------
   start.html sits OUTSIDE the site gate (EXEMPT in src/lib/sitegate.js)
   and is now the page EVERY signed-out visitor lands on, so it is the
   one a stranger, a crawler and a link preview meet first. It follows
   the legal pages' pattern (src/pages/legal.js): the words are in the
   MARKUP and this module adds only what cannot be static.

   WHAT IT MAY IMPORT, AND WHY THE LIST IS SHORT. Only ../styles/*.css
   and a few leaf libraries — funnel.js, invite-code.js, start-auth.js,
   start-model.js (this page's own logic: its stashes and derivations)
   — all of which are pure or plain-fetch and none of which reaches the
   Supabase SDK. NOT store.js, chrome.js, cloud.js, gate.js, billing.js,
   plan-gate.js, plans.js or dom.js: every one of those lives in (or
   drags in) the shared `studio` CORE chunk, about a megabyte, on the
   one page that must be instant on a phone. `prove:growth` asserts no
   Supabase chunk is fetched here at all, and the first-paint budget
   fails such a chunk by name. This page's JS is single-digit KB; keep
   it that way.

   What it adds, in order:

   1. The dark palette, stamped for anything that keys off it.
   2. The CTA targets under the gate: every link INTO the app becomes
      the doorway, because a gated app page bounces a stranger back to
      the page they came from.
   3. The measured height of the sticky band, published as --st-top-h,
      so a fragment jump lands under it rather than behind it.
   4. An invite code arriving as start.html#code=XXXX: held in this
      browser, stripped from the address bar, announced in a band.
   5. Sign-in. Every CTA is already <a href="invite.html"> in the
      markup — a real door for a reader with scripts off — and this
      only INTERCEPTS it when the build has a Supabase project.
   6. (The stage list that was here went with the section, 12 Oct
      2026: the plans lead the page now, and each card's features are
      stamped at build time from plan-matrix.json.)
   7. Testimonials, if any have been given with consent. There are
      none; the section stays hidden.
   8. The launch-offer form and the day counters.
   9. (The scheduled price rise went to pricing.html with the plans:
      src/pages/pricing.js.)
  10. The thumb rail: one gold button, one thumb away, below 720px.
   ============================================================ */
import '../styles/base.css';
import '../styles/start.css';
import '../styles/start-obsidian.css';
import '../styles/motion.css';
import '../styles/motion-landing.css';
import { reveal, splitWords, countUp, spotlight, magnetic, tilt, prefersReducedMotion } from '../lib/motion.js';
import { scrollProgress, parallax, glow, aurora } from '../lib/motion-landing.js';
import { addLead, bumpOnce, bumpEvent, optOut, purchasesRequired, trialOffer } from '../lib/funnel.js';
import { trialLength } from '../lib/trial-time.js';
import { codeFromLocation, setCodePass, formatCode } from '../lib/invite-code.js';
import * as StartAuth from '../lib/start-auth.js';
import { AUTH_ERROR_KEY } from '../lib/auth-scope.js';
/* Import-free (the startlib trap): the stashes and the derivations. */
import {
  takeAuthError, isAppPage, validEmail, consentText, consentedVoices, voiceByline,
  filmByline, swappedText
} from '../lib/start-model.js';

const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);

/* ---- 1. the theme ---------------------------------------------------
   There is one: dark (14 Oct 2026). Bare :root in tokens.css carries it,
   so this page sets nothing and reads nothing. */

/* ---- 2. where the app links go ------------------------------------- */
/* Named directly so Vite inlines the one string; reading it off the
   env OBJECT inlines every VITE_* value into this chunk. */
const GATED = String(import.meta.env.VITE_SITE_GATE || 'invite').toLowerCase() !== 'off';   // sitegate.js SITE_GATE

/* Under the gate every app page bounces a stranger, so a "try it" link
   would land them on the landing page they came from. Point every link
   into the app at the doorway instead. The open build keeps its hrefs.

   invite.html IS ON THE EXEMPT LIST in this regex, which is what keeps
   the sign-in CTAs intact: they are <a href="invite.html"> and must
   stay that way, because that href is the whole of the no-JS fallback.
   A previous version of this file also rewrote the CTAs through a
   data-gated/data-open pair; that is gone with the buttons it served. */
function gateAppLinks(root) {
  if (!GATED) return;
  for (const a of root.querySelectorAll('a[href]')) {
    if (isAppPage(a.getAttribute('href'))) a.setAttribute('href', 'invite.html');
  }
}
gateAppLinks(document);

/* ---- 3. the band's measured height --------------------------------- */
/* --st-top-h feeds the one scroll-padding-top on this page. A guessed
   offset lands every fragment jump behind the sticky band, which reads
   as the page scrolling to the wrong place rather than as a chrome
   bug — the trap CLAUDE.md names for --sh-chrome-h, one page down.
   Measured twice, the second time after the webfonts land, because a
   band measured in the fallback face is measured at the wrong height. */
function measureTop() {
  const top = $('.st-top');
  if (!top) return;
  const h = Math.round(top.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--st-top-h', h + 'px');
}
measureTop();
requestAnimationFrame(measureTop);
try { document.fonts && document.fonts.ready.then(measureTop); } catch (e) { /* no Font Loading API */ }
addEventListener('resize', measureTop, { passive: true });

/* ---- 4. an invite code in the address bar -------------------------- */
/* start.html#code=XXXX-XXXX. The code is held in this browser and
   redeemed by cloud.js's runGate() the first time this browser signs
   in — a code is worth a longer trial now, and a trial is counted
   against a person, so the code has to MEET an account to be spent.
   The fragment is stripped straight away: a code left in the address
   bar travels in a screenshot and sits in the history of a shared
   machine. replaceState, not pushState, so Back does not restore it. */
(function holdInviteCode() {
  let code = '';
  try { code = codeFromLocation(); } catch (e) { return; }
  if (!code) return;
  try { setCodePass(code, { from: 'start' }); } catch (e) { /* private mode */ }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ }
  const band = byId('inviteBand');
  const slot = byId('inviteCode');
  if (slot) slot.textContent = formatCode(code);
  if (band) band.hidden = false;
})();

/* ---- 5. sign in ----------------------------------------------------
   Progressive enhancement, not replacement. Every CTA is already
   <a href="invite.html" data-start-auth="google"> in the markup, so a
   reader with scripts off, a crawler and a middle-click all reach a
   real door. This handler intercepts only when the build actually has
   a Supabase project to send them to.

   There is no chrome.js here and therefore no toasts: anything that
   goes wrong is a sentence in #authMsg, which is role="status". */
const authMsg = byId('authMsg');
function says(text, bad) {
  if (!authMsg) return;
  authMsg.textContent = text;
  authMsg.classList.toggle('st-bad', !!bad);
}

/* WHY THEY ARE BACK HERE. A Google return that does not produce a
   session lands on the hub, where the site gate reads "signed out" and
   replaces the document with this page — so the sign-in's own error
   message is destroyed before anyone can read it, and the whole
   failure presents as "I pressed Continue with Google and ended up
   where I started". That was the owner's bug report, word for word.

   cloud.js leaves the reason in sessionStorage on its way out
   (AUTH_ERROR_KEY); this reads it once and says it. Read-and-clear, so
   a later ordinary visit to this page is not haunted by it.

   Deliberately NOT an import of cloud.js — see auth-scope.js. The key
   is shared; the code is not. */
(function showWhyTheyCameBack() {
  if (!authMsg) return;
  const info = takeAuthError(AUTH_ERROR_KEY);   // null: none, private mode, or unparseable
  if (!info || !info.message) return;
  says('Sign-in did not complete. ' + info.message, true);
})();
/* A VISITOR WHO IS ALREADY SIGNED IN does not need Google again: the
   buttons say so and go to the studio. Detected by the shape of the
   stored session (no SDK here), which can be stale — an expired one
   simply meets the gate on the hub and comes back to this page. */
const SIGNED_IN = StartAuth.hasStoredSession();
if (SIGNED_IN) {
  document.documentElement.dataset.signedin = '1';
  for (const a of document.querySelectorAll('[data-start-auth="google"]')) a.setAttribute('href', '/');
}

/* ---- 5b. (moved) ----------------------------------------------------
   The plans, the comparison, the FAQ and everything that drew or
   enhanced them live on pricing.html and src/pages/pricing.js now: the
   buy hand-off with its plan stash, the pricing_view count, the scheduled
   price rise, and the trial strip. The Education track was dropped. */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('[data-start-auth="google"]');
  if (!a || e.defaultPrevented) return;
  if (SIGNED_IN) return;                        // the href is the studio; let it go
  /* A modified click is the reader asking for a new tab or a saved
     link. Let the href do exactly what they asked for. */
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!StartAuth.configured()) return;          // no project: the markup's door stands
  e.preventDefault();
  bumpEvent('signup');
  says('Taking you to Google…');
  try {
    if (!StartAuth.startGoogle({ redirectTo: StartAuth.defaultRedirect() })) location.href = a.href;
  } catch (err) {
    says('Could not open the Google sign-in just now. Try again, or use the invite page.', true);
  }
});

/* ---- 6. a small element builder ----------------------------------- */
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) n.append(c);
  return n;
}

/* ---- 7. testimonials ----------------------------------------------
   src/data/testimonials.json is { testimonials: [], films: [] }. The
   section stays hidden while both are empty — and it IS empty, which
   is why #proof above it carries checkable facts instead of invented
   quotes. When an entry exists and the markup does not already carry
   it (scripts/check-testimonials.mjs keeps hand-copied markup honest),
   draw it here so a consented quote can never be stranded in the JSON.
   Textual only, no storage. */
const VOICES_URL = new URL('../data/testimonials.json', import.meta.url);
async function renderVoices() {
  const sec = byId('voices');
  if (!sec) return;
  let data;
  try {
    const r = await fetch(VOICES_URL);
    if (!r.ok) return;
    data = await r.json();
  } catch (e) { return; }
  const { testimonials: T, films: F } = consentedVoices(data);
  const vl = byId('voiceList'), fl = byId('filmList');
  let shown = 0;
  for (const t of T) {
    if (sec.querySelector(`[data-testimonial="${CSS.escape(t.id)}"]`)) { shown++; continue; }
    vl.append(el('li', { class: 'st-voice', 'data-testimonial': t.id }, [
      el('blockquote', {}, [el('p', { text: t.quote })]),
      el('p', { class: 'st-voice-who', text: voiceByline(t) })
    ]));
    shown++;
  }
  for (const f of F) {
    if (sec.querySelector(`[data-film="${CSS.escape(f.id)}"]`)) { shown++; continue; }
    fl.append(el('li', { class: 'st-film', 'data-film': f.id }, [
      el('strong', { text: f.title }),
      el('span', { text: filmByline(f) })
    ]));
    shown++;
  }
  if (!shown) return;
  vl.hidden = !vl.children.length;
  fl.hidden = !fl.children.length;
  sec.hidden = false;
}
renderVoices();

/* ---- 8. launch offers and the funnel -------------------------------
   Plain fetch through src/lib/funnel.js: the Supabase SDK stays out of
   first paint. The consent sentence stored with the address is the text
   the visitor actually saw, read off the label. */
const leadForm = byId('leadForm');
if (leadForm) {
  const msg = byId('leadMsg');
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = leadForm.elements.email.value.trim();
    const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('st-bad', !!bad); };
    if (!validEmail(email)) { say('Please enter a valid e-mail address.', true); leadForm.elements.email.focus(); return; }
    if (!leadForm.elements.consent.checked) { say('Please tick the box to say you agree.', true); return; }
    const btn = leadForm.querySelector('button[type="submit"]');
    btn.disabled = true; say('Saving…');
    try {
      await addLead(email, consentText(byId('leadConsentText').textContent), 'start');
      leadForm.reset(); say('Thank you. You are on the list.');
    } catch (err) { say(err.message, true); }
    finally { btn.disabled = false; }
  });
}
const noCount = byId('noCount');
if (noCount) noCount.addEventListener('click', () => { optOut(); noCount.textContent = 'This visit is not counted'; noCount.disabled = true; });

bumpOnce('landing_view');

/* ---- 9. (moved) -----------------------------------------------------
   The scheduled price rise (price_notice()) is drawn on pricing.html by
   src/pages/pricing.js, beside the prices it describes. */
/* ---- 9b. purchases not required (§32) ------------------------------
   The owner can switch purchasing off. The plans STAY on this page
   either way (owner, 12 Oct 2026): it is the purchase page, and the
   prices are what a plan will cost the day purchasing is switched on.
   An explicit `false` from the anon purchases_required() only marks
   the page, and the price-rise band is not drawn — a countdown to a
   rise on a studio that is not selling would be urgency nobody
   enforces. */
/* THE WORDS, WHILE NOTHING IS FOR SALE. The markup keeps the TRIAL
   wording (crawlers, scripts off, and the day the switch is on); these
   attributes carry the alternatives, swapped here and never rewritten at
   build time:
     data-open-text  a signed-in visitor: the button opens the studio
     data-off-text   purchases off: no trial is promised, because nothing
                     starts one by itself and the studio is open
   Signed in wins over off. textContent only: no markup is built from
   these strings. */
function swapWords() {
  const off = document.documentElement.dataset.purchases === 'off';
  for (const n of document.querySelectorAll('[data-open-text], [data-off-text]')) {
    const t = swappedText(n.dataset, { signedIn: SIGNED_IN, off });
    if (!t) continue;
    if (n.dataset.origText === undefined) n.dataset.origText = n.textContent;
    n.textContent = t;
  }
  if (off) hideTrial();
}
/* No trial on offer (purchases off, or trials switched off): any
   "or start the free trial" line goes, because it would promise what the
   server will refuse. (The strip under the plans is pricing.html's.) */
function hideTrial() {
  document.querySelectorAll('[data-trial], [data-trial-link]').forEach((n) => { n.hidden = true; });
}
swapWords();
function showFreeNow() {
  document.documentElement.dataset.purchases = 'off';
  swapWords();
}
try {
  purchasesRequired().then((req) => { if (req === false) showFreeNow(); }, () => {});
} catch (e) { /* never breaks the page */ }

/* ---- 9c. the free trial's length (§33) -----------------------------
   There is no free plan (owner, 11 Oct 2026); the first card is the
   free TRIAL, set in hours in the console. The markup says "a limited
   time" — true whatever the setting, and what a crawler or a failed
   request sees — and the anon trial_offer() replaces it with the
   length the server will actually give. Trials switched off: the card
   goes, because offering one would be untrue. */
try {
  trialOffer().then((t) => {
    if (!t) return;
    if (t.trial_enabled === false) { hideTrial(); return; }
    const len = trialLength(t.trial_minutes);
    if (len) document.querySelectorAll('[data-trial-length]').forEach((n) => { n.textContent = len; });
  }, () => {});
} catch (e) { /* never breaks the page */ }

/* ---- 10. the thumb rail --------------------------------------------
   One gold button, one thumb away, below 720px and only once the hero
   has scrolled past — a bar that covers the hero's own button is a bar
   in the way.

   It LISTENS to the media query rather than sampling it, which is the
   trap chrome.js's mobile action bar already paid for: a phone turned
   to landscape kept a bar that no longer fitted, and a page loaded in
   landscape never got one at all.

   And its height is MEASURED, not guessed. A row of 48px targets plus
   padding plus env(safe-area-inset-bottom) is more than any round
   number somebody would type, so a reserved guess puts the last
   control on the page underneath it. Measured synchronously first
   because requestAnimationFrame does not run in a background tab. */
(function thumbRail() {
  const bar = byId('startBar');
  const hero = $('.st-hero');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;

  let mq;
  try { mq = matchMedia('(max-width: 720px)'); } catch (e) { return; }
  let heroGone = false;

  const measure = () => {
    document.documentElement.style.setProperty('--st-bar-h', Math.round(bar.getBoundingClientRect().height) + 'px');
  };

  function sync() {
    const on = mq.matches && heroGone;
    if (on) {
      if (!bar.hidden) { measure(); return; }
      bar.hidden = false;
      document.body.classList.add('has-st-bar');
      measure();
      requestAnimationFrame(() => { measure(); bar.setAttribute('data-on', ''); });
      return;
    }
    bar.removeAttribute('data-on');
    bar.hidden = true;
    document.body.classList.remove('has-st-bar');
    document.documentElement.style.setProperty('--st-bar-h', '0px');
  }

  new IntersectionObserver((entries) => {
    for (const en of entries) heroGone = !en.isIntersecting;
    sync();
  }, { threshold: 0 }).observe(hero);
  if (mq.addEventListener) mq.addEventListener('change', sync);
  else if (mq.addListener) mq.addListener(sync);
  addEventListener('resize', () => { if (!bar.hidden) measure(); }, { passive: true });
  sync();
})();

/* ---- 11. reveal on scroll -------------------------------------------
   A landing page full of scroll animation is exactly where
   prefers-reduced-motion matters, so this does not run at all under
   it — and the class that hides a section is only ever added BY this
   function, so a reader with scripts off, a crawler, or a browser
   where IntersectionObserver is missing sees every word immediately.

   The failsafe matters more than the effect, and getting it right
   took two goes. "Reveal everything after three seconds" ends the
   effect for the whole page a moment after the first scroll.
   "Is the first section still veiled after three seconds" looks
   smarter and is wrong here, because at 1280 the hero fills the
   viewport and NO section is on screen at load — so the question
   answers yes on a perfectly healthy page and the failsafe fires
   every time.

   The precise question is whether the OBSERVER IS ALIVE, and an
   IntersectionObserver answers it by itself: it invokes its callback
   once per observed element as soon as it is observed, intersecting
   or not. So one flag set in the callback is the whole test, and a
   page where it is still unset after three seconds reveals
   everything. Content that stays invisible because an observer
   misfired is a broken page, and this page is the shop window.

   Hidden sections are skipped: #offer and #voices are display:none
   and would be observed as permanently not-intersecting, which also
   means the veil would still be on them if they were unhidden
   later. */
(function motionInit() {
  /* The effects live in lib/motion.js (import-free, in the startlib
     chunk). Reveal keeps the semantics described above: the hiding class
     is added by JS only, hidden sections are skipped, the 8s backstop
     shows anything still veiled, and nothing runs under reduced motion. */
  const q = (s) => document.querySelector(s);
  const qa = (s) => document.querySelectorAll(s);
  const enter = (n, cls, d) => { if (!n) return; n.style.setProperty('--d', d + 'ms'); n.classList.add(cls); };
  const reduced = prefersReducedMotion();
  try {
    /* hero sequence: eyebrow shimmer -> headline words -> hook -> lede ->
       CTAs pop -> screenshot slides in */
    if (!reduced) {
      enter(q('.st-hero .st-hook'), 'mo-up', 900);
      enter(q('.st-hero .st-trust'), 'mo-up', 1050);
      /* The hero CTA and screenshot are never delayed: the thing a visitor came to press and see is there at once. */
      enter(q('.st-hero .st-fine'), 'mo-up', 1500);
    }
    aurora(q('.st-hero'));
    reveal(document);
    splitWords(q('h1.st-title'));
    qa('.st-h2').forEach((h) => splitWords(h, { onScroll: true }));
    qa('.st-eyebrow').forEach((n) => n.classList.add('mo-shimmer'));
    scrollProgress();

    qa('.st-btn-primary').forEach((b) => { b.classList.add('mo-shine'); magnetic(b); });
    const cta = q('#ctaOpen');
    if (cta) { cta.classList.add('mo-shine-loop'); glow(cta); }
    tilt(q('.st-shot-hero img'));
    parallax(q('.st-shot-hero'), { speed: 0.06 });
    qa('.st-sec .st-shot').forEach((f) => parallax(f, { speed: 0.04 }));
    spotlight(q('.st-hero'));
    qa('.st-card, .st-faq').forEach((n) => spotlight(n));
    /* The facts count; the PRICES never do — a price that reads ₹0 for
       a second, or to a screen reader, is a price that misleads. */
    qa('.st-fact-n').forEach((n) => countUp(n));
    qa('.st-faq').forEach(smoothFaq);
  } catch (e) { /* motion is decoration; never let it break the page */ }

  /* FAQ: animate the box height with WAAPI. The native toggle still does
     the work; this only interpolates between the two heights. */
  function smoothFaq(d) {
    const s = d.querySelector('summary');
    if (!s || !d.animate || reduced) return;
    let anim = null;
    s.addEventListener('click', (e) => {
      e.preventDefault();
      if (anim) { anim.onfinish = null; anim.cancel(); anim = null; }
      const from = d.offsetHeight;
      let to, opening = !d.open;
      if (opening) { d.open = true; to = d.offsetHeight; }
      else { d.open = false; to = d.offsetHeight; d.open = true; }
      d.style.overflow = 'hidden';
      anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      const mine = anim;
      mine.onfinish = () => {
        if (anim === mine) anim = null;
        d.style.overflow = '';
        if (!opening) d.open = false;
      };
    });
  }
})();
