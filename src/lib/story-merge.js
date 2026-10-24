/* ============================================================
   MERGING TWO COPIES OF ONE STORY — the shared beat sheet
   ------------------------------------------------------------
   With the co-editing switch on (schema §49), a collaborator's save of
   the story (`fms_story_v1`, cloud scope `story`) is MERGED into yours
   instead of replacing it. Off, the story is last write wins, as it
   always was; cloud.js never calls this then.

     outline       step by step, by id: src/lib/script-merge.js
                   mergeElements, reused. The later `u` wins (story.js
                   stamps a step when it is written); a step only one
                   copy has is NEW there, unless `base` (the copy both
                   last agreed on) proves the other side deleted it and
                   it was not edited since. No base, nothing is deleted.
                   Order follows the copy that arrived.
     marks         the same rule, by id; then each is re-found in the
                   merged synopsis (story-anchor.js, the logic of
                   story.js anchor()) and the list is sorted by start.
     source        the synopsis prose cannot be merged by sentence. The
                   side that changed it since base wins; when BOTH
                   changed (or there is no base to tell), the arriving
                   text is kept and this device's text goes into
                   `sourceConflicts` [{ id, at, u, text }] — a field of
                   the story, not a key — so nothing typed is lost. The
                   Synopsis step offers it back ("Use this text").
     tension       per key, the side that changed it.
     conflicts,    as sets: kept when both have it, or when it is new on
     comps         one side; gone only when base proves a removal.
     everything    (logline, idea, framework, frameworkChosen, genre,
     else          audience, budgetTier, outlineLockedAt, conflictLine,
                   and any field a later build adds) pick3: the side
                   that changed it since base wins; both changed, the
                   arriving copy wins. A field this build has never
                   heard of is carried, never dropped.

   CLOCKS: `u` is each device's own clock — the caveat script-merge.js
   states, accepted for the same reason.

   PURE. Imports two pure modules and nothing that touches storage: it
   runs in cloud.js (CORE) and in Node (test:story-merge).
     mergeStory(local, remote, base?, { now }?) → merged story
     mergeStoryRaw(localRaw, remote, base?) → canonical JSON text, the
       same call shape as mergeScriptRaw so cloud.js keeps one table
   ============================================================ */
import { mergeElements, pick3 } from './script-merge.js';
import { anchorMarks } from './story-anchor.js';

const KEEP_CONFLICTS = 10;   // the newest few; an older one has had its chance

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const items = (a) => (Array.isArray(a) ? a.filter((x) => isObj(x) && typeof x.id === 'string' && x.id) : []);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const parse = (r) => {
  if (isObj(r)) return r;
  if (typeof r !== 'string') return null;
  try { const o = JSON.parse(r); return isObj(o) ? o : null; } catch (e) { return null; }
};
/* FNV-1a: the same text kept twice is one entry, whichever merge kept it. */
const textId = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'sc-' + s.length.toString(36) + h.toString(36);
};

/* A list merged as a SET, keyed by `keyOf`: an entry both sides have is
   pick3'd, one side's new entry is kept, and an entry base has but one
   side dropped (and the other did not change) is gone. */
function mergeSet(L, R, B, keyOf) {
  const hasBase = Array.isArray(B);
  const lk = new Map(L.map((x) => [keyOf(x), x]));
  const rk = new Map(R.map((x) => [keyOf(x), x]));
  const bk = new Map((B || []).map((x) => [keyOf(x), x]));
  const out = [];
  const keepOne = (k, only) => {
    if (!hasBase || !bk.has(k)) return only;                  // new on that side
    return same(only, bk.get(k)) ? null : only;               // removed on the other, unless changed since
  };
  for (const [k, r] of rk) {
    const v = lk.has(k) ? pick3(lk.get(k), r, bk.get(k), hasBase && bk.has(k)) : keepOne(k, r);
    if (v != null) out.push(v);
  }
  for (const [k, l] of lk) {
    if (rk.has(k)) continue;
    const v = keepOne(k, l);
    if (v != null) out.push(v);
  }
  return out;
}

function mergeTension(L, R, B, hasBase) {
  const l = isObj(L) ? L : {}, r = isObj(R) ? R : {}, b = isObj(B) ? B : {};
  const out = {};
  for (const k of [...new Set([...Object.keys(r), ...Object.keys(l)])]) {
    const v = pick3(l[k], r[k], b[k], hasBase);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const SPECIAL = new Set(['outline', 'marks', 'tension', 'conflicts', 'comps', 'source', 'sourceConflicts']);

export function mergeStory(local, remote, base, { now = Date.now() } = {}) {
  const L = isObj(local) ? local : {}, R = isObj(remote) ? remote : {};
  const B = isObj(base) ? base : null;
  const hasBase = !!B;
  const out = {};

  /* Every plain field, in the arriving copy's order, then any only this
     side has. A field neither special nor known is merged the same way,
     which is what keeps a newer build's field alive through this one. */
  for (const k of [...new Set([...Object.keys(R), ...Object.keys(L)])]) {
    if (SPECIAL.has(k)) { out[k] = undefined; continue; }   // holds the key's place; filled below
    const v = pick3(L[k], R[k], hasBase ? B[k] : undefined, hasBase);
    if (v !== undefined) out[k] = v;
  }

  /* The synopsis prose. */
  let keep = '';
  if ('source' in L || 'source' in R) {
    const ls = typeof L.source === 'string' ? L.source : '';
    const rs = typeof R.source === 'string' ? R.source : '';
    const bs = hasBase && typeof B.source === 'string' ? B.source : '';
    let src = rs;
    if (ls === rs) src = rs;
    else if (hasBase && ls === bs) src = rs;                  // only they changed it
    else if (hasBase && rs === bs) src = ls;                  // only this side changed it
    else { src = rs; if (ls.trim()) keep = ls; }              // both changed, or no way to tell
    out.source = src;
  }
  const source = typeof out.source === 'string' ? out.source : '';

  /* The texts kept from earlier meetings, then this one's. */
  if ('sourceConflicts' in L || 'sourceConflicts' in R || keep) {
    const at = (c) => ({ ...c, u: Number(c.u) || Number(c.at) || 0 });
    let list = mergeElements(items(L.sourceConflicts).map(at), items(R.sourceConflicts).map(at),
      hasBase ? items(B.sourceConflicts).map(at) : null)
      .filter((c) => typeof c.text === 'string' && c.text.trim() && c.text !== source);
    if (keep && keep !== source && !list.some((c) => c.text === keep)) list.push({ id: textId(keep), at: now, u: now, text: keep });
    list = list.slice(-KEEP_CONFLICTS);
    out.sourceConflicts = list;
  }

  if ('outline' in L || 'outline' in R) {
    out.outline = mergeElements(items(L.outline), items(R.outline), hasBase ? items(B.outline) : null);
  }

  if ('marks' in L || 'marks' in R) {
    const merged = mergeElements(items(L.marks), items(R.marks), hasBase ? items(B.marks) : null)
      .filter((m) => typeof m.text === 'string');
    const live = anchorMarks(source, merged);
    out.marks = merged
      .map((m, i) => (live[i].detached || (live[i].start === m.start && live[i].end === m.end)
        ? m : { ...m, start: live[i].start, end: live[i].end }))
      .map((m, i) => [m, i])
      .sort((a, b) => ((Number(a[0].start) || 0) - (Number(b[0].start) || 0)) || (a[1] - b[1]))
      .map(([m]) => m);
  }

  if ('tension' in L || 'tension' in R) out.tension = mergeTension(L.tension, R.tension, hasBase ? B.tension : undefined, hasBase);

  const listOr = (x) => (Array.isArray(x) ? x : []);
  const baseList = (k) => (hasBase ? listOr(B[k]) : null);
  if ('conflicts' in L || 'conflicts' in R) {
    out.conflicts = mergeSet(listOr(L.conflicts).filter((x) => typeof x === 'string'),
      listOr(R.conflicts).filter((x) => typeof x === 'string'), baseList('conflicts'), (x) => x);
  }
  if ('comps' in L || 'comps' in R) {
    const key = (c) => (isObj(c) ? String(c.title || '').trim().toLowerCase() : String(c));
    out.comps = mergeSet(listOr(L.comps), listOr(R.comps), baseList('comps'), key);
  }

  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** The cloud.js shape: local as stored text, remote as the row's data
 *  (an object, or text), base the copy both last agreed on (or null).
 *  Returns canonical JSON, so "did anything change" is a string compare. */
export function mergeStoryRaw(localRaw, remote, base) {
  return JSON.stringify(mergeStory(parse(localRaw) || {}, parse(remote) || {}, parse(base)));
}

export default { mergeStory, mergeStoryRaw };
