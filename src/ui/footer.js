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
        code — read from my_referral() via growth.js (see
        learnReferral below) — and omitted when it has none.
   2. "Help on WhatsApp" — VITE_SUPPORT_WHATSAPP (digits, country code
      first). Set, the link renders here, in Settings → Plan and on
      invite.html (which imports chrome.js too). Unset, nothing renders
      anywhere: no empty link, no "coming soon".
   3. THE TOUR LOADER. src/ui/tour.js is a lazy chunk, fetched only on
      the hub (for the first-week checklist) and on a page where a tour
      the user started is still running — read from fms_tour_v1, which
      this module only ever READS.
   ============================================================ */
import Store from '../lib/store.js';
import { delegate } from '../lib/dom.js';
import { BRAND, BRAND_HOST, BRAND_PATH } from '../lib/brand.js';
import { setPort } from '../lib/ports.js';
import { currentPlan } from '../lib/plan-gate.js';   // CORE, like this file
import { brandingPrefOff, saveBrandingOff, tourActive } from '../lib/chrome-prefs.js';
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
export function whatsAppHref(text = 'Hi, I need help with ' + BRAND.name + '.') {
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
export { BRAND_HOST, BRAND_PATH };
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
  return !brandingPrefOff();
}
/** Written on a click only — never on load. */
export function setBrandingOff(off) {
  saveBrandingOff(off);   // private mode: not written, and the line stays
  syncFootBrand();
}

/** The line as an element. `ref` overrides the member's code (the
 *  screening room passes the SENDER's, from the pass). */
export function brandLine({ ref, className = 'made-with' } = {}) {
  const p = document.createElement('p');
  p.className = className;
  p.append(document.createTextNode('Made with ' + BRAND.name + ' — '));
  const a = document.createElement('a');
  const r = ref === undefined ? refCode : ref;
  a.href = brandURL(r);
  a.textContent = brandText(r);
  a.rel = 'noopener';
  p.append(a);
  return p;
}

/* The referral code comes from my_referral() (§22, via growth.js) —
   billing_status() carries none, so the old read of it there could
   never find one and the ?ref= was silently dead. Asked once per page,
   and only for a signed-in member on a page that prints a branded
   document: never an extra round trip on every page of the studio.
   growth.js is imported lazily so it stays out of first paint. */
/* Every page with a PDF export carries the line now (pdfBrandLine below),
   so every one of them may want the code. */
const BRANDED_PAGES = /(^|\/)(contacts|story|feature|short|screenplay|write|drafts|breakdown|stripboard|reports|visualize|deliverables|dashboard|budget|index)?(\.html)?$/;
async function learnReferral() {
  if (refAsked || !BRANDED_PAGES.test(location.pathname)) return;
  refAsked = true;
  try {
    const Growth = await import('../lib/growth.js');
    const r0 = await Growth.myReferral();
    const r = cleanRef(r0 && r0.eligible && r0.active !== false ? r0.code : '');
    if (r !== refCode) { refCode = r; syncFootBrand(); }
  } catch (e) { /* no code: the line goes out without one */ }
}

/* The hidden line in the footer that a printed call sheet shows. */
function syncFootBrand() {
  const foot = document.querySelector('footer.site-foot');
  if (!foot) return;
  const old = foot.querySelector('.site-foot-made');
  if (!brandingOn()) { if (old) old.remove(); return; }
  const fresh = brandLine({ className: 'made-with site-foot-made' });
  if (old && old.outerHTML === fresh.outerHTML) return;   // plan:changed echoes: no swap when nothing differs
  if (old) old.replaceWith(fresh); else foot.append(fresh);
}

if (typeof window !== 'undefined') {
  Store.subscribe('plan:changed', (p) => {
    lastPlan = p || null;
    syncFootBrand();
    if (p && p.gated) learnReferral();
  });
}

/* ---- the line on every PDF the studio prints ------------------------
   pdf.js stage() asks for it through the 'pdfBrandLine' port and puts it
   at the very end of <body>, after the document, so it falls on the last
   page; footer.css keeps it one small line on paper. The rule is the
   plan's alone (owner, 26 Oct 2026): a plan that keeps branding prints
   it, a plan whose features allow remove_branding (Pro) does not — the
   Settings switch still governs only the deck, the call sheet and the
   screening room, which carry the line of their own. One builder: the
   same brandLine() the footer and the deck use. */
/* The plan as plan-gate holds it NOW, not the last 'plan:changed' this
   file heard: a Pro member exporting in the first second must not get
   the line because an event had not arrived yet. Until a plan is known
   it is not gated, and the line prints — erring toward the brand. */
function planNow() {
  try { const cp = currentPlan(); if (cp && cp.gated) return cp; } catch (e) { /* below */ }
  return lastPlan;
}
export function pdfBrandLine(plan = planNow()) {
  if (mayRemoveBranding(plan)) return null;
  const p = brandLine({ className: 'made-with pdf-made-with' });
  p.id = 'pdf-made-with';
  return p;
}

/* ---- the same line on a PLAIN print ---------------------------------
   The budget's top sheet and settlement, the budget page, the
   stripboard's Print and the reports' one-view prints go through
   window.print() with their own "only this prints" body class, not
   through pdf.js stage(). They carry the same line by the same rule
   (none on a plan that may remove it), for the length of that one
   print: brandPrint() appends it as the last child of <body> and returns
   the function that takes it off again (afterprint does too). footer.css
   shows .pdf-made-plain above every page's print rule. A staged job has
   its own already, so this adds nothing then. Call it right before
   window.print(). */
export function brandPrint() {
  if (typeof document === 'undefined' || document.getElementById('pdf-made-with')) return () => {};
  const line = pdfBrandLine();
  if (!line) return () => {};
  line.classList.add('pdf-made-plain');
  document.body.append(line);
  const off = () => { line.remove(); window.removeEventListener('afterprint', off); };
  window.addEventListener('afterprint', off);
  return off;
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
    label.append(box, document.createTextNode(' Show “Made with ' + BRAND.name + '” on pitch decks, call sheets and the screening room'));
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
const isHub = () => /(^|\/)(index(\.html)?)?$/.test(location.pathname);
function maybeTour() {
  const active = tourActive();
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
  copy.textContent = '© ' + new Date().getFullYear() + ' ' + BRAND.name;

  foot.append(nav, copy);
  document.body.append(foot);
  syncFootBrand();
  maybeTour();
  return foot;
}

export default { injectFooter, brandLine, pdfBrandLine, brandPrint, brandingOn, mayRemoveBranding, setBrandingOff, planExtras, whatsAppLink, whatsAppHref, SUPPORT_WHATSAPP };

/* The pitch deck (src/lib/pitch-deck.js) closes on this line through a
   port, so the logic layer never imports the footer. Null when the
   member turned branding off. */
setPort('brandLine', (o = {}) => (brandingOn() ? brandLine(o) : null));
setPort('pdfBrandLine', () => pdfBrandLine());
