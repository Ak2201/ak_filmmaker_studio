/* KIT · SHEET — the bottom sheet, which is NOT a new component
   sheet({ title, body, kind, focus, returnTo, onClose }) → Promise<the open sheet>
   closeSheet() → Promise
     It is the phone's Go-to / Tools frame (src/ui/mobile-nav.js open()):
     the same overlay, header, close button, focus trap, Escape, backdrop
     and scroll lock, reached here so a page goes through the kit's one
     import path instead of growing a second sheet. At 720px and up the
     same frame sits centred at a reading width (mobile-nav.css).
     body     the element under the header (built with the kit)
     kind     a word for data-mn-sheet (styling / proofs), default 'kit'
     focus    () => the element to focus first (default: the close button)
     returnTo the element that gets focus back on close
   The import is DYNAMIC on purpose: mobile-nav.js is already in the CORE
   chunk (chrome.js loads it on every shell page), so nothing extra is
   fetched, but a static import would drag the shell, the store and the
   navigation model into every module that imports the kit — including
   the Node tests that load kit-built views (test:beats).
   A CONFIRMATION is not a sheet: use ask / askDanger / tell (dialog.js),
   which already renders as a bottom sheet below 720px (kit.css). */
const nav = () => import('../mobile-nav.js');

export function sheet(o = {}) {
  return nav().then((m) => m.openSheet(o.kind || 'kit', o.title || '', o.body,
    { focus: o.focus, returnTo: o.returnTo, onClose: o.onClose }));
}

export function closeSheet() { return nav().then((m) => m.closeSheet()); }
