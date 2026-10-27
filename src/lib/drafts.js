/* ============================================================
   DRAFTS — the versioning model over the revisions already in the
   script blob
   ------------------------------------------------------------
   A draft IS an entry of `doc.revisions` (src/lib/script.js). Nothing
   new is stored beyond three OPTIONAL fields on such an entry: `number`
   (Draft 3), `note`, and `titlePage` (the title page as it was). `date`
   is the saved-at stamp. The colour is NOT stored: it is the entry's
   position among the ISSUED drafts (issuedColour(): side copies take
   no place in the colour order, and have no colour).

   "Changed since the last draft" is DERIVED: a stable hash of the
   working copy against a hash of the latest draft's snapshot, at the
   moment someone asks. Nothing records it.

   The writers here mutate the doc they are handed and return what they
   made; the CALLER saves (persistNow on the script page, saveScript on
   the drafts page). Pure otherwise — no storage, no DOM.
   ============================================================ */
import {
  makeRevision, restoreElements, revisionColour, normaliseTitlePage, hasTitlePage, pageCount,
  isNumberingLocked
} from './script.js';
import { isSideCopy, issuedColour } from './script-incoming.js';

/* FNV-1a over the things that make two scripts different. Text, type and
   the dual flag; ids are left out on purpose — a restored or snapshotted
   list has fresh ids and is still the same script. */
export function hashElements(elements) {
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const e of elements || []) {
    feed(String(e.type || '') + (e.dual === true ? '*' : '') + '\u0001' + String(e.text ?? '') + '\u0002');
  }
  return (h >>> 0).toString(16) + ':' + (elements || []).length;
}

const hashTitle = (tp) => (hasTitlePage(tp) ? JSON.stringify(normaliseTitlePage(tp)) : '');

/** One entry, normalised for display. Old revisions get a number from
    their position and keep their own name. */
function describe(rev, index, revs) {
  const number = Number.isFinite(rev.number) && rev.number > 0 ? rev.number : index + 1;
  /* The colour is the draft's place among the ISSUED drafts; a side copy
     has none (null) and is shown as one (QA r4). `revs` is the whole
     list; without it (an old caller) the position is all there is. */
  const side = isSideCopy(rev);
  const colour = revs ? issuedColour(revs, index) : revisionColour(index);
  return {
    id: rev.id,
    index,
    number,
    name: rev.number ? 'Draft ' + number : (rev.name || 'Draft ' + number),
    label: rev.number ? 'Draft ' + number : (rev.name || 'Draft ' + number),
    note: rev.note || '',
    savedAt: rev.date || '',
    colour,
    side,
    pages: pageCount(rev.elements || []),
    lines: (rev.elements || []).length,
    hasTitlePage: !!rev.titlePage,
    rev
  };
}

/** Newest first. */
export function listDrafts(doc) {
  const revs = (doc && Array.isArray(doc.revisions)) ? doc.revisions : [];
  return revs.map((r, i) => describe(r, i, revs)).reverse();
}

/** The newest real draft. A side copy the sync kept by itself
    ("From another device", "Your version" — script-incoming.js) is
    listed, but is never the current draft. */
export function latestDraft(doc) {
  const revs = (doc && Array.isArray(doc.revisions)) ? doc.revisions : [];
  for (let i = revs.length - 1; i >= 0; i--) if (!isSideCopy(revs[i])) return describe(revs[i], i, revs);
  return null;
}

const nextNumber = (doc) => (doc.revisions || [])
  .reduce((m, r, i) => (isSideCopy(r) ? m : Math.max(m, Number.isFinite(r.number) && r.number > 0 ? r.number : i + 1)), 0) + 1;

export function nextDraftNumber(doc) { return nextNumber(doc); }

function snapshot(doc, entry, note) {
  const snap = makeRevision(doc.elements, entry.name);
  entry.elements = snap.elements;
  entry.date = snap.date;
  // Always recorded, empty included: a draft prints with the title page
  // it was saved with, never with one added to the working copy later.
  entry.titlePage = normaliseTitlePage(doc.titlePage);
  if (note !== undefined) {
    if (String(note).trim()) entry.note = String(note).trim();
    else delete entry.note;
  }
  return entry;
}

/** Append "Draft N" (N = highest number + 1). The caller saves. */
export function saveNewDraft(doc, { note = '' } = {}) {
  if (!Array.isArray(doc.revisions)) doc.revisions = [];
  const number = nextNumber(doc);
  const entry = { id: makeRevision([], '').id, name: 'Draft ' + number, number, date: '', elements: [] };
  snapshot(doc, entry, note);
  doc.revisions.push(entry);
  return describe(entry, doc.revisions.length - 1, doc.revisions);
}

/** Overwrite a draft's snapshot with the working copy. The spec's
    "update current draft" is the latest; any id is accepted. */
export function updateDraft(doc, id, { note } = {}) {
  const i = (doc.revisions || []).findIndex((r) => r.id === id);
  if (i < 0) return null;
  const entry = doc.revisions[i];
  if (!entry.number) entry.number = i + 1;   // an old entry gains its number only when rewritten
  snapshot(doc, entry, note);
  return describe(entry, i, doc.revisions);
}

/** Put a draft's snapshot back as the working copy. The CALLER has
    confirmed. Fresh element ids (restoreElements). Returns whether it
    did anything. */
export function restoreDraft(doc, id) {
  const rev = (doc.revisions || []).find((r) => r.id === id);
  if (!rev) return false;
  const restored = restoreElements(rev);
  /* A locked numbering keys on element ids, and restoreElements() has
     just renewed every one. It used to be deleted here, which threw
     away the scene lock, every OMITTED number and the page lock — the
     numbers the call sheets and sides were printed with — under a
     dialog that said nothing was lost. Each snapshot line records the
     id it had in the live script (`liveId`, makeRevision()), so the
     lock is RE-KEYED through it instead. An entry no restored line
     answers to stays in the record: a heading the draft lacks is an
     omitted scene, which is what a lock says of a deleted one, and a
     heading from a draft older than `liveId` gets its number back by
     its words (sceneNumbers() step 2). */
  if (isNumberingLocked(doc.numbering)) {
    const map = new Map();
    (rev.elements || []).forEach((e, i) => {
      if (e && e.liveId && restored[i] && !map.has(e.liveId)) map.set(e.liveId, restored[i].id);
    });
    doc.numbering = rekeyNumbering(doc.numbering, map);
  } else {
    delete doc.numbering;
  }
  doc.elements = restored;
  if (rev.titlePage) {
    if (hasTitlePage(rev.titlePage)) doc.titlePage = normaliseTitlePage(rev.titlePage);
    else delete doc.titlePage;
  }
  return true;
}

/** The lock with every id that `map` (old id → new id) knows replaced.
    PURE — returns a new object. */
function rekeyNumbering(numbering, map) {
  const to = (id) => (id && map.has(id) ? map.get(id) : id);
  const ids = {};
  for (const [k, e] of Object.entries(numbering.ids || {})) ids[to(k)] = { ...e };
  const out = { ...numbering, ids };
  if (numbering.pages && Array.isArray(numbering.pages.starts)) {
    out.pages = { ...numbering.pages, starts: numbering.pages.starts.map((st) => ({ ...st, id: st.id ? to(st.id) : st.id })) };
  }
  return out;
}

/** True when the working copy differs from the latest draft. With no
    draft at all: true when there is anything written. */
export function changedSinceDraft(doc) {
  if (!doc) return false;
  const last = latestDraft(doc);
  if (!last) return (doc.elements || []).length > 0 && (doc.elements || []).some((e) => String(e.text ?? '').trim());
  if (hashElements(doc.elements) !== hashElements(last.rev.elements)) return true;
  // A title page is compared only once the draft carries one.
  if (last.rev.titlePage && hashTitle(doc.titlePage) !== hashTitle(last.rev.titlePage)) return true;
  return false;
}

/** The document a draft prints from: its snapshot, and its title page
    (or the working one, for a draft that predates the snapshot). A
    draft saved while the numbers were LOCKED carries that lock, re-keyed
    from the live ids to the snapshot's through `liveId` (as
    restoreDraft does), so the pages that go to the floor print the
    call sheet's numbers (QA r3). A draft from before the lock gets
    none: those numbers were not issued when it was written. */
export function draftDocument(doc, id) {
  const rev = (doc.revisions || []).find((r) => r.id === id);
  if (!rev) return null;
  const out = { elements: rev.elements.map((e) => ({ ...e })), revisions: [], documents: [] };
  const tp = rev.titlePage || doc.titlePage;
  if (hasTitlePage(tp)) out.titlePage = normaliseTitlePage(tp);
  if (isNumberingLocked(doc.numbering) && String(doc.numbering.at || '') <= String(rev.date || '')) {
    const map = new Map();
    out.elements.forEach((e) => { if (e.liveId && !map.has(e.liveId)) map.set(e.liveId, e.id); });
    out.numbering = rekeyNumbering(doc.numbering, map);
  }
  return out;
}

export default {
  hashElements, listDrafts, latestDraft, nextDraftNumber, saveNewDraft, updateDraft,
  restoreDraft, changedSinceDraft, draftDocument
};
