/* ============================================================
   THE LEGAL PAGES' ONLY SCRIPT — and it is two imports
   ------------------------------------------------------------
   privacy.html, terms.html and refund.html keep their text in the MARKUP, not
   in a renderer, which is the opposite of every other page here
   and is deliberate:

     - a consent-screen reviewer, a crawler and a reader with
       scripts off all have to be able to read the whole document,
       and a page that renders itself from JS gives them an empty
       <div id="app">;
     - the words are a commitment rather than content. They are
       not derived from src/data, nothing counts them, and the
       rule that keeps the 24 steps out of markup exists because
       those ARE derived. This is the case it does not cover.

   So this file carries the stylesheets, one font check and (for
   404.html, which shares it) a fragment fix. No
   store.js, because these pages touch no storage; no chrome.js,
   because they have no toolbar, no theme picker and no shell to
   re-init; no pwa.js, because a document does not need a service
   worker to register from it.

   THAT IS ALSO WHY NO SKIN IS LOADED. skin.js globs
   src/styles/skins/ and sets the --sk-* family; none of it runs
   here, so legal.css reads the fixed tokens instead.

   SINCE 20 OCT 2026 THEY ARE DARK AND WEAR THE PUBLIC SITE'S FRAME:
   the shared header and footer are stamped into marked regions by
   scripts/make-marketing-pages.mjs, and marketing.css styles them.
   marketing.js is NOT imported: it counts visits and asks the
   purchases switch, and a policy page adds nothing to what is counted.
   Without it the header uses its no-script fallbacks (Product goes to
   start.html#tools, the menu button to the footer), which work.
   ============================================================ */
import '../styles/base.css';
import '../styles/marketing.css';
import '../styles/legal.css';

/* The header's two marks (the Product chevron, the phone menu button) are
   Material Symbols ligatures, which base.css keeps hidden until the face
   has loaded (html:not(.sym-ready)). marketing.js and chrome.js say so on
   their pages; this is the same few lines, and all this file runs. */
(function symbolFontReady() {
  const root = document.documentElement;
  const done = () => root.classList.add('sym-ready');
  let fonts;
  try { fonts = document.fonts; } catch (e) { fonts = null; }
  if (!fonts || typeof fonts.forEach !== 'function') return done();
  const check = () => {
    if (root.classList.contains('sym-ready')) return;
    let ok = false;
    fonts.forEach((f) => { if (f.status === 'loaded' && /Material Symbols/i.test(f.family)) ok = true; });
    if (ok) done();
  };
  check();
  try { fonts.addEventListener('loadingdone', check); } catch (e) { /* older engines */ }
  try { fonts.ready.then(check); } catch (e) { /* older engines */ }
  addEventListener('load', check, { once: true });
})();

/* 404.html is served at ANY unknown path, so it carries <base href="/">
   for its assets — and under a base, the frame's bare "#main" (skip link)
   and "#mkFoot" (the phone menu's no-script target) resolve to "/#main"
   and leave the page for the home page. Keep a same-document fragment on
   this document. The three policies have no <base>, so this never runs
   there. */
if (document.querySelector('base[href]')) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    let t = null;
    try { t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); } catch (err) { t = null; }
    if (!t) return;
    e.preventDefault();
    if (!t.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) t.setAttribute('tabindex', '-1');
    t.scrollIntoView();
    t.focus({ preventScroll: true });
  });
}
