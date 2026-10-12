/* ============================================================
   AI DIFF — a line diff the AI Desk can accept change by change
   ------------------------------------------------------------
   PURE. No DOM, no storage, no imports: scripts/test-ai-desk.mjs
   loads it in Node.

     diffLines(original, proposed) → hunks
       Each hunk is one run of consecutive changed lines:
         { id: 'h0', start, removed: [lines], added: [lines], before }
       `start` is the index in the ORIGINAL's lines where the run
       begins, `before` the original line just above it (context
       for the reader, or '' at the top).

     mergeHunks(original, hunks, acceptedIds) → string
       The original with ONLY the accepted hunks applied. Every
       hunk accepted reproduces `proposed` exactly; none accepted
       reproduces `original` exactly. Both are after normalise().

   LINE ENDINGS ARE NORMALISED FIRST (CRLF and lone CR → LF), so a
   model answering in CRLF does not turn every line into a change.
   The merged string is LF.

   THE ALGORITHM is common prefix/suffix trim, then an LCS table on
   the middle. A table is O(n·m), so past LCS_LIMIT cells the whole
   middle is one hunk rather than a frozen tab: an answer that
   rewrote a thousand lines is one change in any useful sense.
   ============================================================ */

export const LCS_LIMIT = 4000000;

export function normalise(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n');
}

export function splitLines(s) {
  return normalise(s).split('\n');
}

/* Ops over the two line arrays: ['=', a] | ['-', a] | ['+', b]. */
function ops(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre
    && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const out = [];
  for (let i = 0; i < pre; i++) out.push(['=', a[i]]);

  if ((A.length + 1) * (B.length + 1) > LCS_LIMIT) {
    A.forEach((l) => out.push(['-', l]));
    B.forEach((l) => out.push(['+', l]));
  } else {
    const n = A.length, m = B.length, w = m + 1;
    const T = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        T[i * w + j] = A[i] === B[j]
          ? T[(i + 1) * w + j + 1] + 1
          : Math.max(T[(i + 1) * w + j], T[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push(['=', A[i]]); i++; j++; }
      else if (T[(i + 1) * w + j] >= T[i * w + j + 1]) { out.push(['-', A[i]]); i++; }
      else { out.push(['+', B[j]]); j++; }
    }
    while (i < n) out.push(['-', A[i++]]);
    while (j < m) out.push(['+', B[j++]]);
  }

  for (let i = a.length - suf; i < a.length; i++) out.push(['=', a[i]]);
  return out;
}

export function diffLines(original, proposed) {
  const a = splitLines(original);
  const b = splitLines(proposed);
  const hunks = [];
  let ai = 0;
  let cur = null;
  for (const [op, line] of ops(a, b)) {
    if (op === '=') {
      if (cur) { hunks.push(cur); cur = null; }
      ai++;
      continue;
    }
    if (!cur) cur = { id: 'h' + hunks.length, start: ai, removed: [], added: [], before: ai > 0 ? a[ai - 1] : '' };
    if (op === '-') { cur.removed.push(line); ai++; }
    else cur.added.push(line);
  }
  if (cur) hunks.push(cur);
  return hunks;
}

export function mergeHunks(original, hunks, acceptedIds) {
  const a = splitLines(original);
  const take = new Set([].concat(acceptedIds || []));
  const sorted = [...(hunks || [])].sort((x, y) => x.start - y.start);
  const out = [];
  let i = 0;
  for (const hk of sorted) {
    while (i < hk.start && i < a.length) out.push(a[i++]);
    if (take.has(hk.id)) out.push(...hk.added);
    else out.push(...a.slice(i, i + hk.removed.length));
    i += hk.removed.length;
  }
  while (i < a.length) out.push(a[i++]);
  return out.join('\n');
}

export default { diffLines, mergeHunks, normalise, splitLines, LCS_LIMIT };
