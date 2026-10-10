/* ============================================================
   START — the public landing page's only script
   ------------------------------------------------------------
   start.html sits OUTSIDE the site gate (EXEMPT in src/lib/sitegate.js)
   and is now the page EVERY signed-out visitor lands on, so it is the
   one a stranger, a crawler and a link preview meet first. It follows
   the legal pages' pattern (src/pages/legal.js): the words are in the
   MARKUP and this module adds only what cannot be static.

   WHAT IT MAY IMPORT, AND WHY THE LIST IS SHORT. Only ../styles/*.css
   and three leaf libraries — funnel.js, invite-code.js, start-auth.js
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
   6. The five stages and their modules, DERIVED from navigation.json
      (invariant 2). A hand-written copy of that list on a sales page
      would be the first thing to drift from the product.
   7. Testimonials, if any have been given with consent. There are
      none; the section stays hidden.
   8. The launch-offer form and the day counters.
   9. The scheduled price rise, from price_notice(). It ADDS the
      coming figure beside the build-stamped one and never replaces
      it, and the band stays hidden unless the server reports a rise
      it will actually execute.
  10. The thumb rail: one gold button, one thumb away, below 720px.
   ============================================================ */
import '../styles/base.css';
import '../styles/start.css';
import '../styles/motion.css';
import { reveal, splitWords, countUp, spotlight, magnetic, tilt } from '../lib/motion.js';
import { addLead, bumpOnce, bumpEvent, optOut, priceNotice } from '../lib/funnel.js';
import { codeFromLocation, setCodePass, formatCode } from '../lib/invite-code.js';
import * as StartAuth from '../lib/start-auth.js';
import { AUTH_ERROR_KEY } from '../lib/auth-scope.js';

/* navigation.json is FETCHED, not imported. vite.config.js folds every
   `import` of src/data/*.json into one shared `data` chunk — 450KB that
   every app page needs and this page does not. A URL import emits the
   15KB file as its own asset and leaves the chunking rule alone. */
const NAV_URL = new URL('../data/navigation.json', import.meta.url);

const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);

/* ---- 1. the chosen theme ------------------------------------------
   NOT dark-only any more. This page hard-set data-theme="dark" while
   the studio had one palette; the palette went back to two on 9 Oct
   (owner's call) and 'dark' is not even a theme name — chrome.js's
   CSS_THEME maps ink->dark and paper->light, so the literal would have
   matched no [data-theme] block at all and the page would have fallen
   through to bare :root by luck rather than by decision.

   It reads the theme the reader CHOSE elsewhere in the studio, raw:
   there is no store.js here and the theme key is device-wide, never
   scoped. Read only. With scripts off the OS setting still applies. */
const THEME_KEY = 'fms_studio_theme_v1';           // chrome.js THEME_KEY
const CSS_THEME = { ink: 'dark', paper: 'light' };  // chrome.js CSS_THEME
try {
  const t = CSS_THEME[localStorage.getItem(THEME_KEY)];
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage blocked: the OS setting stands */ }

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
const APP_PAGE = /^(?!(?:invite|start|privacy|terms|refund|screening)(?:\.html)?(?:[?#]|$))[\w-]+\.html(?:[?#]|$)/;
function gateAppLinks(root) {
  if (!GATED) return;
  for (const a of root.querySelectorAll('a[href]')) {
    if (APP_PAGE.test(a.getAttribute('href'))) a.setAttribute('href', 'invite.html#request');
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
  let info = null;
  try {
    const raw = sessionStorage.getItem(AUTH_ERROR_KEY);
    if (raw) { sessionStorage.removeItem(AUTH_ERROR_KEY); info = JSON.parse(raw); }
  } catch (e) { return; }           // private mode, or something unparseable
  if (!info || !info.message) return;
  says('Sign-in did not complete. ' + info.message, true);
})();
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('[data-start-auth="google"]');
  if (!a || e.defaultPrevented) return;
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

/* ---- 6. the stages ------------------------------------------------- */
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

const built = (m) => m && m.status === 'built' && m.href;

function moduleList(mods) {
  return el('ul', { class: 'st-mods' }, mods.map((m) => el('li', {}, [
    el('a', { href: m.href, text: m.label }),
    m.purpose ? el('span', { text: ' — ' + m.purpose }) : null
  ])));
}

function stageCard(phase, index) {
  const mods = (phase.modules || []).filter(built);
  return el('article', { class: 'st-stage', 'data-stage': phase.id }, [
    el('p', { class: 'st-stage-n', text: String(index + 1).padStart(2, '0') }),
    el('h3', { class: 'st-h3', text: phase.label }),
    phase.blurb ? el('p', { class: 'st-stage-blurb', text: phase.blurb }) : null,
    moduleList(mods)
  ]);
}

function shelfCard(shelf) {
  const mods = (shelf.modules || []).filter(built);
  return el('article', { class: 'st-stage st-shelf', 'data-shelf': shelf.id }, [
    el('p', { class: 'st-stage-n', text: 'Shelf' }),
    el('h3', { class: 'st-h3', text: shelf.label }),
    shelf.blurb ? el('p', { class: 'st-stage-blurb', text: shelf.blurb }) : null,
    moduleList(mods)
  ]);
}

async function renderStages(host) {
  let nav;
  try {
    const r = await fetch(NAV_URL);
    if (!r.ok) throw new Error('navigation.json ' + r.status);
    nav = await r.json();
  } catch (e) {
    /* Offline on a first visit, or blocked: the <noscript> sentence is
       not shown (scripts ran), so say the same thing in its place. */
    host.replaceChildren(el('p', { class: 'st-note', text: 'The list of stages and modules could not be loaded just now. Everything else on this page stands.' }));
    return;
  }
  const phases  = nav.phases || [];
  const shelves = (nav.global || []).filter((g) => Array.isArray(g.modules) && g.modules.some(built) && !g.adminOnly);
  const total   = phases.reduce((n, p) => n + (p.modules || []).filter(built).length, 0)
                + shelves.reduce((n, s) => n + (s.modules || []).filter(built).length, 0);
  host.replaceChildren(
    el('p', { class: 'st-count', text: `${total} modules across ${phases.length} stages and ${shelves.length} shelves — every one of them built and live.` }),
    el('div', { class: 'st-stage-grid' }, [
      ...phases.map(stageCard),
      ...shelves.map(shelfCard)
    ])
  );
  gateAppLinks(host);
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
  const T = (Array.isArray(data.testimonials) ? data.testimonials : []).filter((t) => t && t.id && t.quote && t.name && t.consentOn);
  const F = (Array.isArray(data.films) ? data.films : []).filter((f) => f && f.id && f.title && f.consentOn);
  const vl = byId('voiceList'), fl = byId('filmList');
  let shown = 0;
  for (const t of T) {
    if (sec.querySelector(`[data-testimonial="${CSS.escape(t.id)}"]`)) { shown++; continue; }
    vl.append(el('li', { class: 'st-voice', 'data-testimonial': t.id }, [
      el('blockquote', {}, [el('p', { text: t.quote })]),
      el('p', { class: 'st-voice-who', text: [t.name, t.role, t.film].filter(Boolean).join(' · ') })
    ]));
    shown++;
  }
  for (const f of F) {
    if (sec.querySelector(`[data-film="${CSS.escape(f.id)}"]`)) { shown++; continue; }
    fl.append(el('li', { class: 'st-film', 'data-film': f.id }, [
      el('strong', { text: f.title }),
      el('span', { text: ' ' + [f.year && `(${f.year})`, f.director, f.format].filter(Boolean).join(' · ') })
    ]));
    shown++;
  }
  if (!shown) return;
  vl.hidden = !vl.children.length;
  fl.hidden = !fl.children.length;
  sec.hidden = false;
}
renderVoices();

const stageHost = byId('stageList');
if (stageHost) renderStages(stageHost);

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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Please enter a valid e-mail address.', true); leadForm.elements.email.focus(); return; }
    if (!leadForm.elements.consent.checked) { say('Please tick the box to say you agree.', true); return; }
    const btn = leadForm.querySelector('button[type="submit"]');
    btn.disabled = true; say('Saving…');
    try {
      await addLead(email, byId('leadConsentText').textContent.replace(/\s+/g, ' ').trim(), 'start');
      leadForm.reset(); say('Thank you. You are on the list.');
    } catch (err) { say(err.message, true); }
    finally { btn.disabled = false; }
  });
}
const noCount = byId('noCount');
if (noCount) noCount.addEventListener('click', () => { optOut(); noCount.textContent = 'This visit is not counted'; noCount.disabled = true; });

bumpOnce('landing_view');
const pricing = byId('pricing');
if (pricing && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => {
    if (es.some((x) => x.isIntersecting)) { io.disconnect(); bumpOnce('pricing_view'); }
  }, { threshold: 0.25 });
  io.observe(pricing);
}

/* ---- 9. the scheduled price rise -----------------------------------
   §30's price_notice(): anon-callable, one narrow fact per plan, and
   NOTHING unless a rise is actually scheduled. What makes this an
   announcement rather than false urgency is that effective_price()
   fires the rise by itself the instant next_price_at passes or the
   buyer cap is reached — the same function that charges the card. So:

     - the countdown renders the SERVER's instant. It is the same for
       every visitor and shows LESS time on a reload, never more.
     - the seat count is a real COUNT of paid rows against a real cap.
     - if either is missing, or the call fails, this draws nothing and
       the build-stamped list prices stand on their own.

   It never replaces a price. The figures in the markup came from
   LIST_PRICE at build time; this only ever ADDS the coming one beside
   them, which is why a failure here leaves a correct page. */
const inr = (paise) => '₹' + Math.round(Number(paise || 0) / 100).toLocaleString('en-IN');
const onDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }); }
  catch (e) { return d.toDateString(); }
};
function timeLeft(ms) {
  if (!(ms > 0)) return '';
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  if (days >= 1) return days + 'd ' + (hrs % 24) + 'h left';
  if (hrs >= 1) return hrs + 'h ' + (mins % 60) + 'm left';
  return Math.max(1, mins) + 'm left';
}

function renderPriceRise(notice) {
  if (!notice || !Array.isArray(notice.plans)) return;

  /* Each tier gets its coming figure beside the current one. */
  for (const p of notice.plans) {
    if (!p || !p.id || !p.next_price_paise || !p.next_price_at) continue;
    let li;
    try { li = document.querySelector(`.st-tiers li[data-tier="${CSS.escape(p.id)}"]`); } catch (e) { li = null; }
    const price = li && li.querySelector('.st-price');
    if (!price || price.querySelector('.st-price-next')) continue;
    price.append(el('span', { class: 'st-price-next', text: inr(p.next_price_paise) + ' from ' + onDate(p.next_price_at) }));
  }

  /* The band: the cheapest PAID tier that is rising carries the
     headline, because that is the figure most people are deciding
     about. No rise, no band — the section stays hidden and the plain
     prices stand, which is the whole of the honesty guarantee. */
  const rise = notice.plans.find((p) => p && p.id && p.id !== 'free' && p.next_price_paise && p.next_price_at);
  const band = byId('offer');
  if (!rise || !band) return;
  const ends = new Date(rise.next_price_at).getTime();
  if (!(ends > Date.now())) return;               // already fired; the server will say so next load

  const seatsTotal = Number(notice.seats_total);
  const seatsTaken = Number(notice.seats_taken);
  const capped = Number.isFinite(seatsTotal) && seatsTotal > 0;

  const line = byId('offerLine');
  if (line) {
    line.textContent = inr(rise.price_paise) + ' today. ' + inr(rise.next_price_paise) + ' from ' + onDate(rise.next_price_at)
      + (capped ? ' — or once ' + seatsTotal.toLocaleString('en-IN') + ' people have joined, whichever comes first.' : '.');
  }
  const seatsChip = byId('offerSeats');
  if (seatsChip && capped && Number.isFinite(seatsTaken)) {
    seatsChip.textContent = seatsTaken.toLocaleString('en-IN') + ' of ' + seatsTotal.toLocaleString('en-IN') + ' taken';
    seatsChip.hidden = false;
  }

  const leftChip = byId('offerLeft');
  const tick = () => {
    const t = timeLeft(ends - Date.now());
    if (!t) { band.hidden = true; return; }        // it fired while the page was open
    if (leftChip) { leftChip.textContent = t; leftChip.hidden = false; }
  };
  tick();
  /* Minutes, not seconds. A ticking second counter on a three-week
     deadline is pressure theatre, and it is the thing that makes a
     true announcement read like a fake one. */
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  band.hidden = false;
}
try { priceNotice().then(renderPriceRise, () => {}); } catch (e) { /* never breaks the page */ }

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
  try {
    reveal(document);
    splitWords(q('h1.st-title'));
    document.querySelectorAll('.st-eyebrow').forEach((n) => n.classList.add('mo-shimmer'));
    magnetic(q('#ctaOpen'));
    tilt(q('.st-shot-hero img'));
    spotlight(q('.st-hero'));
    const pick = q('.st-pick'); if (pick) pick.classList.add('mo-trail');
    document.querySelectorAll('b.st-price').forEach((n) => countUp(n));
  } catch (e) { /* motion is decoration; never let it break the page */ }
})();
