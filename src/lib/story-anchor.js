/* ============================================================
   RE-FINDING A TAGGED PASSAGE — the pure half of story.js anchor()
   ------------------------------------------------------------
   A mark stores its passage's text and the offsets it had when it was
   made. Offsets drift the moment anyone types above them, so a mark is
   re-found by its TEXT, at the occurrence nearest the old position. A
   passage no longer in the synopsis is DETACHED, never re-pointed at
   whatever now sits at those offsets.

   Its own file, with no imports, because two callers need it and one
   of them is cloud.js (CORE, via story-merge.js), which must not pull
   story.js and its frameworks JSON into every page's first paint.
     anchorMarks(source, marks) → new objects with live offsets and a
     `detached` flag; the marks handed in are not touched.
   ============================================================ */
export function anchorMarks(source, marks) {
  const src = String(source || '');
  return (Array.isArray(marks) ? marks : []).map((m) => {
    if (src.slice(m.start, m.end) === m.text) return { ...m, detached: false };
    let best = -1, bestDist = Infinity, at = src.indexOf(m.text);
    while (at !== -1) {
      const d = Math.abs(at - m.start);
      if (d < bestDist) { best = at; bestDist = d; }
      at = src.indexOf(m.text, at + 1);
    }
    return best < 0
      ? { ...m, detached: true }
      : { ...m, start: best, end: best + m.text.length, detached: false };
  });
}

export default { anchorMarks };
