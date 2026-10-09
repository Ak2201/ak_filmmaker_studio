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

   So this file carries the stylesheets and nothing else. No
   store.js, because these pages touch no storage; no chrome.js,
   because they have no toolbar, no theme picker and no shell to
   re-init; no pwa.js, because a document does not need a service
   worker to register from it.

   THAT IS ALSO WHY NO SKIN IS LOADED. skin.js globs
   src/styles/skins/ and sets the --sk-* family; none of it runs
   here, so legal.css reads the fixed tokens instead. Light and
   dark still work, because tokens.css answers
   prefers-color-scheme on bare :root with no JavaScript at all.

   THE ONE THING IT DOES BESIDES (UX audit L20): honour the theme the
   reader CHOSE elsewhere in the studio, which the OS query alone
   cannot know. It reads the same key chrome.js writes, RAW — there is
   no store.js here, and the theme key is device-wide, never scoped —
   and maps the stored name to the CSS one the way chrome.js's
   CSS_THEME does. It only reads. A module script runs before
   DOMContentLoaded, so this lands before the first full paint on an
   ordinary load; with scripts off the OS setting still applies.
   ============================================================ */
import '../styles/base.css';
import '../styles/legal.css';

const THEME_KEY = 'fms_studio_theme_v1';           // chrome.js THEME_KEY
const CSS_THEME = { ink: 'dark', paper: 'light' };  // chrome.js CSS_THEME
try {
  const t = CSS_THEME[localStorage.getItem(THEME_KEY)];
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage blocked: the OS setting stands */ }
