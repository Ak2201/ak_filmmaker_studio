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
  screenplay: 'screenplay.html',
  import: 'screenplay.html#import',
  'wr-import': 'screenplay.html#import',
  'wr-import-paste': 'screenplay.html#import',
  revisions: 'drafts.html',
  documents: 'drafts.html#title',
  outline: 'breakdown.html#script',
  characters: 'breakdown.html#script',
  /* The AI coverage report and synopsis-to-script still live in
     write.js; they are reached through the escape, linked from the
     Script Breakdown and the Script page's ⋯ menu. */
  coverage: 'write.html?stay=1#coverage',
  generate: 'write.html?stay=1#generate',
  guide: 'screenplay.html#guide'
};

/** Where an old write.html hash goes; always answers. */
export function routeForWrite(hash) {
  const frag = String(hash || '').replace(/^#/, '');
  return ROUTES[frag] || 'screenplay.html';
}

/** Redirect when this is write.html without ?stay=1. True if it navigated. */
export function redirectIfWrite(loc = typeof location === 'undefined' ? null : location) {
  if (!loc) return false;
  if (/(^|[?&])stay=1(&|$)/.test(loc.search || '')) return false;
  loc.replace(routeForWrite(loc.hash));
  return true;
}

export default { routeForWrite, redirectIfWrite };
