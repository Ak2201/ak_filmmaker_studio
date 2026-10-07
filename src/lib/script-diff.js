/* ============================================================
   SCRIPT DIFF — what changed between two drafts, by element
   ------------------------------------------------------------
   Two element lists in (an older revision and a newer one, or a
   revision and the live script), one ordered list of operations out:

     same      the element is in both, unchanged
     changed   the element is in both and its words (or its type) moved;
               carries `words`, a word-level diff of the line
     moved     the element is in both but no longer in the same place
               relative to the rest (and may also have been edited)
     added     only in the newer list
     removed   only in the older list, placed where it used to be

   PURE. Nothing read from storage, nothing written, and nothing about
   the result is kept: a comparison is a view, and a stored diff would
   be stale the first keystroke after it was taken.

   HOW ELEMENTS ARE PAIRED — identity first, then text.
     1. IDENTITY. A live element's id is stable for its life, and a
        revision records the live id each of its elements had when it
        was taken (`liveId`, src/lib/script.js makeRevision()). Two
        elements with one identity are the same element, whatever
        happened to its words. The longest run of those that kept
        their relative order are the ANCHORS; the rest moved.
     2. TEXT, between the anchors, for everything identity could not
        pair — a revision taken before `liveId` existed, a restore
        (which gives every element a fresh id), an import. Patience
        alignment: lines unique on both sides anchor first, and what
        is left is an LCS, so a repeated "RAVI" cue cannot pull the
        alignment across a page.
     3. PAIRING. A removed line and an added line in the same gap that
        are mostly the same words are one CHANGED line, not two.

   Everything is bounded: the LCS tables are only built for gaps small
   enough to be cheap, and a gap past that is reported as removed and
   added, which is true, just less helpful. The Dragon sample's 2,361
   elements diff in a few milliseconds when ids line up.
   ============================================================ */

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ');
const keyOf = (el) => (el && (el.liveId || el.id)) || '';
const textKey = (el) => (el ? el.type + '\u0001' + norm(el.text) : '');
const sameContent = (a, b) => a.type === b.type && norm(a.text) === norm(b.text);

/* Gaps past these sizes skip the quadratic table. */
const MAX_LCS_CELLS = 250000;
const MAX_WORD_CELLS = 40000;

/* ---- the longest increasing subsequence ------------------------
   Of `seq` (numbers), as the indices into seq that form it. O(n log n). */
function lisIndices(seq) {
  const tails = [];          // index into seq of the smallest tail of each length
  const prev = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(k);
  return out.reverse();
}

/* ---- LCS on two key arrays, as aligned index pairs -------------- */
function lcsPairs(A, B) {
  const n = A.length, m = B.length;
  const W = m + 1;
  const T = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      T[i * W + j] = A[i] === B[j]
        ? T[(i + 1) * W + j + 1] + 1
        : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push([i, j]); i++; j++; }
    else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) i++;
    else j++;
  }
  return out;
}

/* ---- patience alignment ----------------------------------------
   Aligned index pairs [i, j] of two key arrays, in order. */
function alignKeys(A, B, offA = 0, offB = 0, out = []) {
  /* The common tail is taken FIRST, so a removed run that could sit in
     two places is reported at its earlier one: dropping the middle of
     three RAVI speeches removes "RAVI / Two.", not "Two. / RAVI". */
  let e = 0;
  while (e < A.length && e < B.length && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  let s = 0;
  while (s < A.length - e && s < B.length - e && A[s] === B[s]) { out.push([offA + s, offB + s]); s++; }
  const midA = A.slice(s, A.length - e);
  const midB = B.slice(s, B.length - e);
  if (midA.length && midB.length) alignMiddle(midA, midB, offA + s, offB + s, out);
  for (let k = e; k > 0; k--) out.push([offA + A.length - k, offB + B.length - k]);
  return out;
}

function alignMiddle(A, B, offA, offB, out) {
  // key -> [count in A, count in B, first index in A, first index in B]
  const count = new Map();
  const at = (k) => { let c = count.get(k); if (!c) { c = [0, 0, -1, -1]; count.set(k, c); } return c; };
  A.forEach((k, i) => { const c = at(k); if (!c[0]++) c[2] = i; });
  B.forEach((k, j) => { const c = at(k); if (!c[1]++) c[3] = j; });
  const uniques = [];
  for (const c of count.values()) if (c[0] === 1 && c[1] === 1) uniques.push([c[2], c[3]]);
  if (!uniques.length) {
    if (A.length * B.length <= MAX_LCS_CELLS) {
      for (const [i, j] of lcsPairs(A, B)) out.push([offA + i, offB + j]);
    }
    return;
  }
  uniques.sort((x, y) => x[0] - y[0]);
  const keep = lisIndices(uniques.map((u) => u[1])).map((k) => uniques[k]);
  let ai = 0, bj = 0;
  for (const [i, j] of keep) {
    alignKeys(A.slice(ai, i), B.slice(bj, j), offA + ai, offB + bj, out);
    out.push([offA + i, offB + j]);
    ai = i + 1; bj = j + 1;
  }
  alignKeys(A.slice(ai), B.slice(bj), offA + ai, offB + bj, out);
}

/* ---- words ------------------------------------------------------ */
const tokens = (t) => String(t ?? '').split(/(\s+)/).filter((x) => x !== '');

/**
 * A word-level diff of one line: [{ op: 'same'|'add'|'del', text }].
 * Whitespace rides with the words so the pieces join back into the
 * two lines exactly. A pair of lines too long to table is one del and
 * one add, which is still correct.
 */
export function wordDiff(before, after) {
  const A = tokens(before), B = tokens(after);
  const segs = [];
  const push = (op, text) => {
    const last = segs[segs.length - 1];
    if (last && last.op === op) last.text += text; else segs.push({ op, text });
  };
  if (A.length * B.length > MAX_WORD_CELLS) {
    if (A.length) push('del', A.join(''));
    if (B.length) push('add', B.join(''));
    return segs;
  }
  const pairs = lcsPairs(A, B);
  let i = 0, j = 0;
  for (const [pi, pj] of pairs) {
    while (i < pi) push('del', A[i++]);
    while (j < pj) push('add', B[j++]);
    push('same', A[i]); i++; j++;
  }
  while (i < A.length) push('del', A[i++]);
  while (j < B.length) push('add', B[j++]);
  return segs;
}

/** How alike two lines are, 0..1, by the words they share in order. */
export function similarity(a, b) {
  const A = norm(a).split(' ').filter(Boolean), B = norm(b).split(' ').filter(Boolean);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  if (A.length * B.length > MAX_WORD_CELLS) {
    const sa = new Set(A);
    const shared = B.filter((w) => sa.has(w)).length;
    return (2 * shared) / (A.length + B.length);
  }
  return (2 * lcsPairs(A, B).length) / (A.length + B.length);
}

const PAIR_SAME_TYPE = 0.5;
const PAIR_OTHER_TYPE = 0.8;
const PAIR_WINDOW = 12;

/* ---- the diff ---------------------------------------------------- */
function changedOp(a, b, ai, bi, op) {
  const edited = !sameContent(a, b);
  const out = { op: op || (edited ? 'changed' : 'same'), a, b, ai, bi };
  if (edited) {
    out.words = wordDiff(a.text, b.text);
    if (a.type !== b.type) out.typeChanged = true;
  }
  if (op === 'moved') out.edited = edited;
  return out;
}

/** Turn one gap's leftovers into removed/added/changed, in order. */
function settleGap(A, B, gapA, gapB, ops) {
  const keysA = gapA.map((i) => textKey(A[i]));
  const keysB = gapB.map((j) => textKey(B[j]));
  const aligned = alignKeys(keysA, keysB);
  let pa = 0, pb = 0;
  const flushRun = (toA, toB) => {
    const rem = gapA.slice(pa, toA);
    const add = gapB.slice(pb, toB);
    // Pair a removed and an added line that are mostly the same words.
    const pairedA = new Map();          // bi -> ai
    let floor = 0;
    /* In order, and within a short window: a rewritten line sits near
       the line it replaced, and an unbounded search over two big gaps
       is quadratic in similarity() calls for no better answer. */
    for (const bi of add) {
      for (let r = floor; r < rem.length && r < floor + PAIR_WINDOW; r++) {
        const ai = rem[r];
        const sim = similarity(A[ai].text, B[bi].text);
        const need = A[ai].type === B[bi].type ? PAIR_SAME_TYPE : PAIR_OTHER_TYPE;
        if (sim >= need && (norm(A[ai].text) || norm(B[bi].text))) { pairedA.set(bi, ai); floor = r + 1; break; }
      }
    }
    const used = new Set(pairedA.values());
    for (const ai of rem) if (!used.has(ai)) ops.push({ op: 'removed', a: A[ai], b: null, ai, bi: -1 });
    for (const bi of add) {
      if (pairedA.has(bi)) ops.push(changedOp(A[pairedA.get(bi)], B[bi], pairedA.get(bi), bi));
      else ops.push({ op: 'added', a: null, b: B[bi], ai: -1, bi });
    }
  };
  for (const [x, y] of aligned) {
    flushRun(x, y);
    ops.push({ op: 'same', a: A[gapA[x]], b: B[gapB[y]], ai: gapA[x], bi: gapB[y] });
    pa = x + 1; pb = y + 1;
  }
  flushRun(gapA.length, gapB.length);
}

/**
 * The diff. `older` and `newer` are element lists.
 * Returns { ops, stats: { same, changed, moved, added, removed } }.
 */
export function diffElements(older, newer) {
  const A = (older || []).filter(Boolean);
  const B = (newer || []).filter(Boolean);
  const ops = [];

  // 1. identity
  const posB = new Map();
  B.forEach((el, j) => { const k = keyOf(el); if (k && !posB.has(k)) posB.set(k, j); });
  const pairs = [];
  const usedB = new Set();
  A.forEach((el, i) => {
    const j = posB.get(keyOf(el));
    if (j !== undefined && !usedB.has(j)) { usedB.add(j); pairs.push([i, j]); }
  });
  const anchorIdx = new Set(lisIndices(pairs.map((p) => p[1])));
  const anchors = pairs.filter((p, k) => anchorIdx.has(k));
  const movedA = new Set(), movedB = new Map();     // bi -> ai
  pairs.forEach((p, k) => { if (!anchorIdx.has(k)) { movedA.add(p[0]); movedB.set(p[1], p[0]); } });

  // 2. between each pair of anchors, text
  let ai = 0, bj = 0;
  const gap = (toA, toB) => {
    const gapA = [], gapB = [];
    for (let i = ai; i < toA; i++) if (!movedA.has(i)) gapA.push(i);
    const movedHere = [];
    for (let j = bj; j < toB; j++) {
      if (movedB.has(j)) movedHere.push(j); else gapB.push(j);
    }
    const local = [];
    settleGap(A, B, gapA, gapB, local);
    // A moved element is shown where it now is, among the gap's lines.
    for (const j of movedHere) {
      const op = changedOp(A[movedB.get(j)], B[j], movedB.get(j), j, 'moved');
      const at = local.findIndex((o) => o.bi > j);
      if (at < 0) local.push(op); else local.splice(at, 0, op);
    }
    ops.push(...local);
  };
  for (const [i, j] of anchors) {
    gap(i, j);
    ops.push(changedOp(A[i], B[j], i, j));
    ai = i + 1; bj = j + 1;
  }
  gap(A.length, B.length);

  const stats = { same: 0, changed: 0, moved: 0, added: 0, removed: 0 };
  for (const o of ops) stats[o.op]++;
  return { ops, stats };
}

/** True when the two lists say the same thing. */
export const isUnchanged = (diff) => !!diff
  && !diff.stats.changed && !diff.stats.moved && !diff.stats.added && !diff.stats.removed;

/**
 * The ops grouped by scene, for the comparison view. A group opens at
 * every heading on either side — a heading only the older draft had
 * still opens its group, so a deleted scene reads as one block — and
 * the lines before the first heading are a group with no heading.
 * Only groups with a change are returned unless `opts.all`.
 *   → [{ heading, headingId, headingOp, ops, counts }]
 */
export function groupByScene(diff, opts = {}) {
  const groups = [];
  let cur = { heading: '', headingId: null, headingOp: null, ops: [] };
  const close = () => {
    const counts = { changed: 0, moved: 0, added: 0, removed: 0 };
    for (const o of cur.ops) if (o.op in counts) counts[o.op]++;
    const any = counts.changed + counts.moved + counts.added + counts.removed;
    if (cur.ops.length && (any || opts.all)) groups.push({ ...cur, counts });
  };
  for (const o of (diff && diff.ops) || []) {
    const el = o.b || o.a;
    if (el && el.type === 'scene' && norm(el.text)) {
      close();
      cur = { heading: norm((o.b || o.a).text), headingId: o.b ? o.b.id : null, headingOp: o.op, ops: [] };
    }
    cur.ops.push(o);
  }
  close();
  return groups;
}

/**
 * The newer list's ids that a revised page marks: every added, changed
 * and moved element, and, where something was REMOVED, the element
 * that now stands in its place (the next one, or the one before it at
 * the end) — a deletion is a revision too, and an asterisk is the only
 * way a page can say that something is no longer on it.
 */
export function revisedIds(diff) {
  const out = new Set();
  const ops = (diff && diff.ops) || [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    /* An element whose text was cleared prints nothing — the page sees
       it as a removal, so it is marked like one. */
    const blanked = o.b && !norm(o.b.text);
    if (!blanked && (o.op === 'added' || o.op === 'changed' || o.op === 'moved')) { out.add(o.b.id); continue; }
    if (o.op !== 'removed' && !(blanked && o.op !== 'same')) continue;
    const printed = (x) => x.b && norm(x.b.text);
    let mark = null;
    for (let n = k + 1; n < ops.length && !mark; n++) if (printed(ops[n])) mark = ops[n].b.id;
    for (let n = k - 1; n >= 0 && !mark; n--) if (printed(ops[n])) mark = ops[n].b.id;
    if (mark) out.add(mark);
  }
  return out;
}

export default { diffElements, groupByScene, revisedIds, wordDiff, similarity, isUnchanged };
