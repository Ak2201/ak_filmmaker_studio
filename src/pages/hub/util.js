/* ============================================================
   HUB — shared small things: the three blueprint keys the hub's
   views read, the page filenames, the format labels, and the string
   and storage helpers. Moved out of hub.js in the split of 7 Oct
   2026 verbatim; hub.js and its four modules import them from here
   so the strings exist once. ALL_KEYS stays on hub.js — that one is
   the RESET list and reset belongs to the page (CLAUDE.md).
   ============================================================ */
const FEATURE_KEY  = 'fms_filmmaker_combined_v1';
const SHORT_KEY    = 'fms_shortfilm_blueprint_v1';
const LIB_CALC_KEY = 'fms_library_calc_v1';

const FEATURE_URL = 'feature.html';
const SHORT_URL   = 'short.html';
const DASHBOARD_URL = 'dashboard.html';
const LIBRARY_URL = 'library.html';

const FORMAT_LABELS = {
  feature: 'FEATURE FILM',
  short: 'SHORT FILM',
  documentary: 'DOCUMENTARY',
  musicvideo: 'MUSIC VIDEO',
  adfilm: 'AD FILM'
};

/** Strip authored markup so data HTML can be used as plain text —
 *  and decode its entities, or "Horror &amp; fantastic" reaches a
 *  text node (or esc()) still spelled as an entity. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c' };
function plain(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ').trim();
}
function clip(s, n = 104) {
  const t = plain(s);
  return t.length > n ? t.slice(0, n - 1).replace(/[\s,;·]+$/, '') + '…' : t;
}
/** "The Spark." → "The Spark" */
function title(s) { return plain(s).replace(/\.$/, ''); }

// ============================================================
// SMALL UTILITIES (ported verbatim)
// ============================================================
function parseStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
}
function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate();
}
function fmtRelDate(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  return relTime(t);
}
const $ = (sel) => document.querySelector(sel);

export {
  FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY,
  FEATURE_URL, SHORT_URL, DASHBOARD_URL, LIBRARY_URL,
  FORMAT_LABELS,
  plain, clip, title,
  parseStorage, relTime, fmtRelDate, $
};
