/* ============================================================
   WRITE ROUTE — where write.html's old fragments live now
   ------------------------------------------------------------
   write.html is retired as a page (the Script, Drafts and the Script
   Breakdown took its jobs). Pure, like blueprint-route.js: no storage,
   no DOM, so a node test can import it and a page can import it
   without the studio CORE chunk.

   `?stay=1` exempts, the same escape the blueprint redirect has.
   Hrefs keep `.html` (cleanUrls answers with a 308; the service worker
   copes — CLAUDE.md, the redirected-response trap).
   ============================================================ */

/** fragment (no '#') -> destination. Every old write.html anchor. */
const ROUTES = {
  screenplay: 'script.html',
  import: 'script.html#import',
  'wr-import': 'script.html#import',
  'wr-import-paste': 'script.html#import',
  revisions: 'drafts.html',
  documents: 'drafts.html',
  outline: 'breakdown.html#script',
  characters: 'breakdown.html#script',
  coverage: 'breakdown.html#script',
  generate: 'script.html',
  guide: 'script.html'   // TODO(handoff): the stage guide lands on script.html later; see docs/HANDOFF.md
};

/** Where an old write.html hash goes; always answers. */
export function routeForWrite(hash) {
  const frag = String(hash || '').replace(/^#/, '');
  return ROUTES[frag] || 'script.html';
}

/** Redirect when this is write.html without ?stay=1. True if it navigated. */
export function redirectIfWrite(loc = typeof location === 'undefined' ? null : location) {
  if (!loc) return false;
  if (/(^|[?&])stay=1(&|$)/.test(loc.search || '')) return false;
  loc.replace(routeForWrite(loc.hash));
  return true;
}

export default { routeForWrite, redirectIfWrite };
