/* ============================================================
   A match in context, for a one-line search result
   ------------------------------------------------------------
   Pure: no DOM, no storage. The palette's screenplay hits used a fixed
   24-character lead-in, so a hit read "…p's schedule, sides and budget"
   — cut inside "app's" — and a line cut at the END carried no mark at
   all. Both ends now snap to a word boundary, and each cut end says so.
   ============================================================ */
/**
 * @param {string} text   the whole line
 * @param {number} at     index of the match in text
 * @param {number} len    length of the match
 * @param {{before?:number, after?:number}} [o]  context, in characters
 * @returns {string}
 */
export function snippetAround(text, at, len, { before = 24, after = 48 } = {}) {
  const t = String(text || '');
  let from = Math.max(0, at - before);
  if (from > 0 && /\S/.test(t[from - 1])) {
    // inside a word: start at the next word, unless that passes the match
    const sp = t.slice(from, at).search(/\s/);
    from = sp < 0 ? at : from + sp + 1;
  }
  let to = Math.min(t.length, at + len + after);
  if (to < t.length && /\S/.test(t[to])) {
    // inside a word: end at the last space before it, unless that cuts the match
    const sp = t.slice(at + len, to).lastIndexOf(' ');
    to = sp < 0 ? at + len : at + len + sp;
  }
  const body = t.slice(from, to).trim();
  return (from > 0 ? '…' : '') + body + (to < t.length ? '…' : '');
}
