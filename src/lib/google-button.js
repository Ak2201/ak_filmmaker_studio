/* ============================================================
   THE GOOGLE BUTTON — one source of truth (owner, 31 Oct 2026)
   ------------------------------------------------------------
   Every "sign in / sign up / get started" that leads to auth is ONE
   button, "Continue with Google". This module is PURE and import-free
   (pinned to the `startlib` chunk in vite.config.js, and imported by the
   Node page generator): it owns the label, the mark's attributes and the
   HTML for the generator. The studio's DOM builder is
   src/ui/kit/google-btn.js, which reads GOOGLE_LABEL and googleMarkAttrs
   from here, so the two cannot drift.

   The mark is public/google-g.svg: Google's official colours live in
   that file alone, so no .css or .js ever names them (the raw-colour
   grep stays clean) and nothing may recolour it. */
export const GOOGLE_LABEL = 'Continue with Google';
export const GOOGLE_MARK_SRC = '/google-g.svg';
export const googleMarkAttrs = { class: 'gbtn-g', src: GOOGLE_MARK_SRC, width: '18', height: '18', alt: '', 'aria-hidden': 'true' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function googleMarkHTML() {
  return '<img ' + Object.entries(googleMarkAttrs).map(([k, v]) => k + '="' + esc(v) + '"').join(' ') + '>';
}

/* {id, cls, attrs, label, href, open} -> an <a> (open: it opens the sign-in
   modal, which carries the terms; otherwise it goes straight to Google) for the generator. cls carries
   the page's own button classes (mk-btn mk-btn--primary …). */
export function googleBtnHTML({ id = '', cls = '', attrs = '', label = GOOGLE_LABEL, href = 'invite.html', open = false } = {}) {
  return '<a class="gbtn ' + cls + '"' + (id ? ' id="' + esc(id) + '"' : '') + ' href="' + esc(href) + '" ' + (open ? 'data-open-signup' : 'data-start-auth="google"') + (attrs ? ' ' + attrs : '') + '>'
    + googleMarkHTML() + '<span class="gbtn-l">' + esc(label) + '</span></a>';
}
