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

   Idempotent: a second call finds the element and stops. No storage,
   no listeners, nothing written. The year is the only derived thing
   and it is a fact rather than a clock: it changes once a year.
   ============================================================ */
import '../styles/footer.css';

const LINKS = [
  ['privacy.html', 'Privacy'],
  ['terms.html',   'Terms'],
  ['refund.html',  'Refunds']
];

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

  const copy = document.createElement('p');
  copy.className = 'site-foot-copy';
  copy.textContent = '© ' + new Date().getFullYear() + ' FilmMakerStudio';

  foot.append(nav, copy);
  document.body.append(foot);
  return foot;
}

export default { injectFooter };
