/* ============================================================
   WRITE FORMAT — dates, the title page's labels, page anchors
   ------------------------------------------------------------
   The small pure pieces write.html, screenplay.html and drafts.html
   all need. IMPORT-FREE on purpose: drafts.js and screenplay.js
   import it without pulling write-model.js's dependencies (the
   screenplay analysis, which screenplay.js loads lazily) into their
   first paint. No `document`, no storage.
   ============================================================ */
/* ---- dates ---------------------------------------------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An ISO timestamp as '28 Sep 2026' or, withTime, '28 Sep 2026, 14:05'.
    No locale surprises; '—' for anything that is not a date. */
export function formatStamp(iso, withTime) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  return withTime ? day + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : day;
}
/** An ISO timestamp as '28 Sep 2026, 14:05'. */
export const prettyStamp = (iso) => formatStamp(iso, true);

/* ---- the title page ------------------------------------------- */
export const TITLE_LABELS = {
  title: 'Title', credit: 'Credit', author: 'Written by', source: 'Based on',
  draft: 'Draft', date: 'Date', contact: 'Contact'
};
/** A title-page field's placeholder. `projectTitle` is the open
    project's title; the date is today's, as the field would print it. */
export function titlePlaceholder(f, projectTitle, now = new Date()) {
  return {
    title: projectTitle,
    credit: 'Written by',
    author: 'Your name — and a co-writer, with &',
    source: 'Based on the novel by …',
    draft: 'First draft',
    date: formatStamp(now.toISOString()),
    contact: 'Name\nPhone · e-mail\nAgent or production company'
  }[f];
}

/* ---- the page view -------------------------------------------- */
/** Where each page after the first starts: anchors[p] is
    { id, split } for the first row of page p that carries an element,
    or null. `pages` is the paginator's answer (paginateDoc). */
export function pageAnchors(pages) {
  const anchors = [];
  pages.forEach((rows, p) => {
    if (p === 0) return;
    const first = rows.find((r) => r.id);
    anchors[p] = first ? { id: first.id, split: !!first.cont } : null;
  });
  return anchors;
}
