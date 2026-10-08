/* ============================================================
   THE SITE FOOTER — Privacy, Terms, Refunds, and the year
   ------------------------------------------------------------
   Imported once, by chrome.js, which every reachable app page
   already imports; the three legal pages do not import chrome.js
   and carry their own footer line in their markup.

   It is appended to <body>, AFTER #app, never inside it: every page
   replaces #app's children on each render, and a footer inside it
   would be wiped by the first redraw. Being a body child also means
   it inherits the body's padding — the mobile action bar's measured
   height (--mab-h) and the rail's width — so it clears both without
   restating either.

   Idempotent: a second call finds the element and stops. Nothing is
   written on load. The year is the only derived thing and it is a
   fact rather than a clock: it changes once a year.

   THREE MORE JOBS LIVE HERE, because this is the one module every
   app page evaluates and none of them deserves a CORE module of its
   own:

   1. "MADE WITH FILMMAKERSTUDIO" — the growth line on the documents
      that leave the studio: the pitch deck PDF (pitch-deck.js), the
      screening room (screening.js) and a printed call sheet (a hidden
      line in this footer that print.css shows under body.ct-printing).
        Free plan, signed out, code-only, plan unknown: always shown.
        A paid plan whose `features` does not untick `remove_branding`
        (plan-gate.js's rule: a missing key is ALLOWED) may switch it
        off in Settings → Plan. The choice is `branding: 'off'` inside
        the EXISTING device prefs blob fms_studio_prefs_v1 (GLOBAL_KEYS
        and ALL_KEYS already carry it) — no new key — and is written
        only when that checkbox is clicked.
        `?ref=<code>` is added when the signed-in member has a referral
        code. Billing is being taught referral codes in parallel, so it
        is read DEFENSIVELY — Billing.referralCode() if it exists, else
        the field on billing_status() — and omitted when neither says.
   2. "HELP ON WHATSAPP" — VITE_SUPPORT_WHATSAPP (digits, country code
      first). Set, the link renders here, in Settings → Plan and on
      invite.html (which imports chrome.js too). Unset, nothing renders
      anywhere: no empty link, no "coming soon".
   3. THE TOUR LOADER. src/ui/tour.js is a lazy chunk, fetched only on
      the hub (for the first-week checklist) and on a page where a tour
      the user started is still running — read from fms_tour_v1, which
      this module only ever READS.
   ============================================================ */
import Store from '../lib/store.js';
import Billing from '../lib/billing.js';
import { delegate } from '../lib/dom.js';
import '../styles/footer.css';

const LINKS = [
  ['privacy.html', 'Privacy'],
  ['terms.html',   'Terms'],
  ['refund.html',  'Refunds']
];

/* ---- WhatsApp ------------------------------------------------------ */
/* Named directly so Vite inlines the one string (reading it off the env
   OBJECT inlines every VITE_* value into the chunk). Digits only: a
   "+91 98…" typed with spaces is accepted and cleaned; anything that is
   not 8–15 digits afterwards is treated as unset rather than shipped as
   a broken link. */
const WA_RAW = String(import.meta.env.VITE_SUPPORT_WHATSAPP || '');
export const SUPPORT_WHATSAPP = (() => {
  const d = WA_RAW.replace(/[\s()+-]/g, '');
  return /^\d{8,15}$/.test(d) ? d : '';
})();
export const whatsAppConfigured = () => !!SUPPORT_WHATSAPP;
export function whatsAppHref(text = 'Hi, I need help with FilmMakerStudio.') {
  if (!SUPPORT_WHATSAPP) return '';
  return 'https://wa.me/' + SUPPORT_WHATSAPP + (text ? '?text=' + encodeURIComponent(text) : '');
}
/** An <a>, or null when the build has no number. */
export function whatsAppLink({ className = 'wa-link', label = 'Help on WhatsApp' } = {}) {
  const href = whatsAppHref();
  if (!href) return null;
  const a = document.createElement('a');
  a.className = className;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  return a;
}

/* ---- "Made with FilmMakerStudio" ----------------------------------- */
/* The canonical host is a placeholder in ten files (LAUNCH §7); this is
   the eleventh, and the one constant to change with them. */
export const BRAND_HOST = 'thefilmmakerstudio.vercel.app';
export const BRAND_PATH = '/start';
const PREFS_KEY = 'fms_studio_prefs_v1';
const REF_RE = /^[A-Za-z0-9_-]{3,40}$/;

let lastPlan = null;        // plan-gate.js's currentPlan(), from 'plan:changed'
let refCode = '';           // the signed-in member's referral code, when known
let refAsked = false;

const cleanRef = (v) => (typeof v === 'string' && REF_RE.test(v.trim()) ? v.trim() : '');

export function brandURL(ref = refCode) {
  const r = cleanRef(ref);
  return 'https://' + BRAND_HOST + BRAND_PATH + (r ? '?ref=' + encodeURIComponent(r) : '');
}
/** What the line PRINTS: the address without the scheme, readable on paper. */
export const brandText = (ref = refCode) => brandURL(ref).replace(/^https:\/\//, '');

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (e) { return {}; }
}

/** May THIS plan remove the line? Free, unknown and signed out: no. */
export function mayRemoveBranding(plan = lastPlan) {
  if (!plan || !plan.gated) return false;
  const id = String(plan.plan || '');
  if (!id || id === 'free') return false;
  return !(plan.features && plan.features.remove_branding === false);
}
/** Is the line on? Only a plan that may remove it AND a user who did. */
export function brandingOn(plan = lastPlan) {
  if (!mayRemoveBranding(plan)) return true;
  return readPrefs().branding !== 'off';
}
/** Written on a click only — never on load. */
export function setBrandingOff(off) {
  const p = readPrefs();
  if (off) p.branding = 'off'; else delete p.branding;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* private mode: the line stays */ }
  syncFootBrand();
}

/** The line as an element. `ref` overrides the member's code (the
 *  screening room passes the SENDER's, from the pass). */
export function brandLine({ ref, className = 'made-with' } = {}) {
  const p = document.createElement('p');
  p.className = className;
  p.append(document.createTextNode('Made with FilmMakerStudio — '));
  const a = document.createElement('a');
  const r = ref === undefined ? refCode : ref;
  a.href = brandURL(r);
  a.textContent = brandText(r);
  a.rel = 'noopener';
  p.append(a);
  return p;
}

/* The referral code, read defensively: whichever shape billing.js ends
   up exposing, and nothing at all when it exposes none. Asked once per
   page, and only for a signed-in member on a page that prints a branded
   document or when billing offers a dedicated (cheap) lookup — never a
   second billing_status() round trip on every page of the studio. */
const BRANDED_PAGES = /(^|\/)(contacts|story|feature)(\.html)?$/;
async function learnReferral() {
  if (refAsked) return;
  try {
    let v = '';
    if (typeof Billing.referralCode === 'function') v = await Billing.referralCode();
    else if (typeof Billing.referralCode === 'string') v = Billing.referralCode;
    else if (BRANDED_PAGES.test(location.pathname)) {
      refAsked = true;
      const st = await Billing.status();
      v = st && (st.referral_code || (st.referral && st.referral.code) || st.ref_code || '');
    }
    refAsked = true;
    if (v && typeof v === 'object') v = v.code || '';
    const r = cleanRef(v);
    if (r !== refCode) { refCode = r; syncFootBrand(); }
  } catch (e) { refAsked = true; /* no code: the line goes out without one */ }
}

/* The hidden line in the footer that a printed call sheet shows. */
function syncFootBrand() {
  const foot = document.querySelector('footer.site-foot');
  if (!foot) return;
  const old = foot.querySelector('.site-foot-made');
  if (!brandingOn()) { if (old) old.remove(); return; }
  const fresh = brandLine({ className: 'made-with site-foot-made' });
  if (old) old.replaceWith(fresh); else foot.append(fresh);
}

if (typeof window !== 'undefined') {
  Store.subscribe('plan:changed', (p) => {
    lastPlan = p || null;
    syncFootBrand();
    if (p && p.gated) learnReferral();
  });
}

/* ---- Settings → Plan: the toggle and the help link ----------------- */
let wired = false;
function wireToggle() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  delegate(document, 'change', '[data-action="branding-toggle"]', (e, el) => {
    setBrandingOff(!el.checked);
  });
}
/**
 * Extras for the plan section: the branding switch (paid plan whose
 * features allow it) and the WhatsApp line (when configured). `st` is
 * billing_status() as settings.js already holds it. Null when neither.
 */
export function planExtras(st) {
  const plan = st ? { gated: true, plan: st.lapsed ? 'free' : st.plan, features: st.features || {} } : lastPlan;
  const parts = [];
  if (mayRemoveBranding(plan)) {
    wireToggle();
    const id = 'brandingToggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = id;
    box.dataset.action = 'branding-toggle';
    box.checked = brandingOn(plan);
    const label = document.createElement('label');
    label.className = 'brand-toggle';
    label.htmlFor = id;
    label.append(box, document.createTextNode(' Show “Made with FilmMakerStudio” on pitch decks, call sheets and the screening room'));
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Your plan lets you remove the line. The choice is kept on this device.';
    parts.push(label, hint);
  }
  const wa = whatsAppLink();
  if (wa) {
    const p = document.createElement('p');
    p.className = 'wa-line';
    p.append(document.createTextNode('Stuck, or deciding on a plan? '), wa);
    parts.push(p);
  }
  if (!parts.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'plan-extras';
  wrap.append(...parts);
  return wrap;
}

/* ---- the tour loader ---------------------------------------------- */
const TOUR_KEY = 'fms_tour_v1';
const isHub = () => /(^|\/)(index(\.html)?)?$/.test(location.pathname);
function maybeTour() {
  let active = false;
  try { const t = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null'); active = !!(t && t.active); } catch (e) { /* none */ }
  if (!active && !isHub()) return;
  import('./tour.js').then((m) => m.boot()).catch((e) => console.warn('[tour]', e));
}

/* ---- the footer itself -------------------------------------------- */
export function injectFooter() {
  if (typeof document === 'undefined' || !document.body) return null;
  const existing = document.querySelector('footer.site-foot');
  if (existing) return existing;

  const foot = document.createElement('footer');
  foot.className = 'site-foot';

  const nav = document.createElement('nav');
  nav.className = 'site-foot-links';
  nav.setAttribute('aria-label', 'Legal');
  for (const [href, label] of LINKS) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    nav.append(a);
  }
  const wa = whatsAppLink({ className: 'wa-link' });
  if (wa) nav.append(wa);

  const copy = document.createElement('p');
  copy.className = 'site-foot-copy';
  copy.textContent = '© ' + new Date().getFullYear() + ' FilmMakerStudio';

  foot.append(nav, copy);
  document.body.append(foot);
  syncFootBrand();
  maybeTour();
  return foot;
}

export default { injectFooter, brandLine, brandingOn, mayRemoveBranding, setBrandingOff, planExtras, whatsAppLink, whatsAppHref, SUPPORT_WHATSAPP };
