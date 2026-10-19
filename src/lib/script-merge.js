/* ============================================================
   MERGING TWO COPIES OF ONE SCREENPLAY — line by line
   ------------------------------------------------------------
   With the co-editing switch on (schema §49), a collaborator's save is
   merged into yours instead of replacing it. Every element (a line of
   the script: a heading, an action block, a cue, a speech) is merged on
   its own, by id:

     both copies have it      the later edit wins: each element carries
                              `u`, the time it was last changed
                              (script.js saveScript stamps it, and the
                              Screenplay Writer stamps a line as it is
                              typed)
     only one copy has it     either it is NEW there (kept) or the other
                              copy DELETED it. Which, needs `base`: the
                              copy both sides last agreed on. Deleted
                              there and not edited here since → gone.
                              Edited here after the delete → kept.
                              No base (a page just opened) → kept,
                              because a line coming back is a nuisance
                              and a line lost is a writer's work gone.

   ORDER follows `remote` (the copy that just arrived), with any line
   only `local` has placed after its nearest preceding line. A line one
   side MOVED while the other did not keeps the remote position; that
   is the one thing this does not reconcile, and it loses no words.

   The script's other parts (drafts, documents, title page, locked
   numbers) are merged too: drafts and documents by id (a document's
   newer `updated` wins), the title page and the numbering by "the side
   that changed it since base wins; both changed, remote wins".

   CLOCKS: `u` is each device's own clock, so two laptops minutes apart
   can pick the wrong one of two edits to the SAME line. Accepted: it
   never drops a line, and the same line edited on two machines within
   minutes is what the presence warning exists to prevent.

   PURE. No imports, no storage: it runs in cloud.js (CORE) and in Node
   (test:merge).
     mergeScript(local, remote, base?) → merged doc
     mergeScriptRaw(localRaw, remoteObj, base?) → canonical JSON text
   ============================================================ */

const els = (d) => (d && Array.isArray(d.elements) ? d.elements : []);
const stamp = (e) => Number(e && e.u) || 0;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function pick3(local, remote, base, hasBase) {
  if (same(local, remote)) return remote;
  if (hasBase) {
    const lc = !same(local, base), rc = !same(remote, base);
    if (lc && !rc) return local;
  }
  return remote;
}

function byIdUnion(a = [], b = [], prefer) {
  const out = new Map();
  for (const x of a) if (x && x.id) out.set(x.id, x);
  for (const x of b) {
    if (!x || !x.id) continue;
    const have = out.get(x.id);
    out.set(x.id, have ? prefer(have, x) : x);
  }
  return [...out.values()];
}

export function mergeElements(L, R, B) {
  const hasBase = Array.isArray(B);
  const lMap = new Map(L.map((e) => [e.id, e]));
  const rMap = new Map(R.map((e) => [e.id, e]));
  const bMap = new Map((B || []).map((e) => [e.id, e]));
  const keep = (id) => {
    const l = lMap.get(id), r = rMap.get(id), b = bMap.get(id);
    if (l && r) return stamp(l) > stamp(r) ? l : r;
    const only = l || r;
    if (!hasBase || !b) return only;                  // new on that side, or no way to know
    return stamp(only) > stamp(b) ? only : null;      // deleted on the other side, unless edited since
  };
  const out = [];
  const placed = new Set();
  for (const r of R) {
    const e = keep(r.id);
    if (e) { out.push(e); placed.add(r.id); }
  }
  // Lines only local has, each after its nearest preceding placed line.
  L.forEach((l, i) => {
    if (placed.has(l.id) || rMap.has(l.id)) return;
    const e = keep(l.id);
    if (!e) return;
    let at = 0;
    for (let k = i - 1; k >= 0; k--) {
      const j = out.findIndex((x) => x.id === L[k].id);
      if (j >= 0) { at = j + 1; break; }
    }
    out.splice(at, 0, e);
    placed.add(l.id);
  });
  return out;
}

export function mergeScript(local, remote, base) {
  const L = local || {}, R = remote || {};
  const hasBase = !!base && typeof base === 'object';
  const out = {
    elements: mergeElements(els(L), els(R), hasBase ? els(base) : null),
    revisions: byIdUnion(L.revisions, R.revisions, (a, b) => b)
      .sort((x, y) => String(x.date || '').localeCompare(String(y.date || ''))),
    documents: byIdUnion(L.documents, R.documents,
      (a, b) => (String(a.updated || '') > String(b.updated || '') ? a : b))
  };
  const tp = pick3(L.titlePage, R.titlePage, hasBase ? base.titlePage : undefined, hasBase);
  if (tp) out.titlePage = tp;
  const nb = pick3(L.numbering, R.numbering, hasBase ? base.numbering : undefined, hasBase);
  if (nb) out.numbering = nb;
  return out;
}

/** The cloud.js shape: local as stored text, remote as the row's data.
    Returns canonical JSON, so "did anything change" is a string compare. */
export function mergeScriptRaw(localRaw, remote, base) {
  let local = null;
  try { local = JSON.parse(localRaw || '{}'); } catch (e) { local = {}; }
  return JSON.stringify(mergeScript(local, remote || {}, base || null));
}

export default { mergeScript, mergeScriptRaw, mergeElements };
