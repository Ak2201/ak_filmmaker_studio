/* ============================================================
   THE ICON — one renderer, for every map in the app
   ------------------------------------------------------------
   navigation.json carries two marks per entry. `sym` is a
   Material Symbols name and `icon` is the typographic glyph that
   came before it; this returns a <span> for whichever is there,
   preferring the symbol and falling back to the glyph so an entry
   that has not been given one still renders a mark rather than a
   hole. That fallback is what makes a branch adding modules safe
   to merge without touching this.

   IT EXISTS BECAUSE THERE WERE FOUR CALLERS. The launcher's
   tiles, the shell's phase menu, its breadcrumb and its global
   rail, and the command palette's rows all draw the same mark
   from the same data. Four copies of "prefer sym, else icon,
   else a bullet" is the shape of bug CLAUDE.md names about the
   money parser: they agree until one is edited, and then they
   disagree quietly. One function, four callers.

   WHY MATERIAL SYMBOLS IS NOT THE THING THE LAUNCHER'S NOTE
   WARNED OFF. That note argued against colour emoji — "somebody
   else's UI pasted in" — and it still holds. These glyphs are
   monochrome and inherit `currentColor`, so every one is painted
   by the token the glyph it replaced was painted by, in both
   themes, and none of them can smuggle in a palette.

   TWO THINGS THE CSS MUST DO AND THE CALLER MUST NOT UNDO:
   `text-transform: none` and a reset `letter-spacing`. The glyph
   is a LIGATURE on literal text, so an inherited uppercase sends
   "DESCRIPTION" to the font, which matches no ligature and prints
   as letters — and a tracked ligature does not form at all. The
   shared `.sym` rule in base.css sets both; a caller that adds
   tracking to the icon span breaks it.

   `aria-hidden` on every one of them, always. The label beside
   the mark is the accessible name, and a ligature's text content
   is the word "description" — exactly what a screen reader must
   not read out. `translate="no"` for the same reason in the other
   direction: a page translator rewriting "list" into another
   language would destroy the ligature.
   ============================================================ */
import { h } from '../lib/dom.js';

/**
 * @param {string} cls      the caller's own class, e.g. 'lx-mod-icon'
 * @param {object} entry    a navigation.json entry, or any {sym?, icon?}
 * @param {string} [fallback] printed when the entry carries neither
 * @returns {HTMLElement}
 */
export function iconSpan(cls, entry, fallback) {
  const e = entry || {};
  if (e.sym) {
    return h(`span.${cls}.sym`, { text: e.sym, 'aria-hidden': 'true', translate: 'no' });
  }
  return h(`span.${cls}`, { text: e.icon || fallback || '·', 'aria-hidden': 'true' });
}

export default { iconSpan };
