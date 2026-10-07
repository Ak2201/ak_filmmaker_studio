/* ============================================================
   MODAL FOCUS — hold Tab inside an open dialog, give focus back
   ------------------------------------------------------------
   `aria-modal="true"` is a promise to a screen reader that nothing
   outside the dialog is reachable, and the two dialogs that made it
   (the hub's new-project form, the sign-in card) did not keep it: Tab
   walked out of the card into the page behind the scrim, and closing
   either one dropped focus on <body>, so a keyboard user started again
   from the top of the document (UX audit M2).

   One helper for both, so the two cannot drift:

     holdFocus(overlay)    remember what had focus, keep Tab and
                           Shift+Tab cycling inside `overlay`
     releaseFocus(overlay) stop, and put focus back where it was —
                           if that element is still in the page

   Both are idempotent, and releaseFocus() on an overlay that is not
   held does nothing, because Escape closes "every overlay" in both
   callers whether or not it is open.
   ============================================================ */

const held = new WeakMap();

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Visible and not inside a [hidden] block — the sign-in card hides
   whole sections it is not using, and Tab must not land in them. */
function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE))
    .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

export function holdFocus(overlay) {
  if (!overlay || held.has(overlay)) return;
  const opener = document.activeElement;
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const list = focusables(overlay);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const inside = overlay.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault(); first.focus();
    }
  };
  // On the document, not the overlay: focus can already be outside it
  // (on <body>, after a click on the scrim) and Tab must still come back.
  document.addEventListener('keydown', onKey, true);
  held.set(overlay, { opener, onKey });
}

export function releaseFocus(overlay) {
  const h = overlay && held.get(overlay);
  if (!h) return;
  held.delete(overlay);
  document.removeEventListener('keydown', h.onKey, true);
  let back = h.opener;
  /* A page that re-renders on close (the hub redraws its project
     cards after a rename) has replaced the opener with a twin. Find
     the twin by what made it the opener: its id, or its action and
     the record it acts on. */
  if (back && !back.isConnected && back.dataset) {
    const { action, id } = back.dataset;
    back = (back.id && document.getElementById(back.id))
      || (action && id && document.querySelector('[data-action="' + CSS.escape(action) + '"][data-id="' + CSS.escape(id) + '"]'))
      || null;
  }
  if (back && back !== document.body && back.isConnected && typeof back.focus === 'function') {
    back.focus();
  }
}

export default { holdFocus, releaseFocus };
