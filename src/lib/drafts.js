/* ============================================================
   DRAFTS — the versioning model over the revisions already in the
   script blob
   ------------------------------------------------------------
   A draft IS an entry of `doc.revisions` (src/lib/script.js). Nothing
   new is stored beyond three OPTIONAL fields on such an entry: `number`
   (Draft 3), `note`, and `titlePage` (the title page as it was). `date`
   is the saved-at stamp. The colour is NOT stored: it is the entry's
   position in the list, as it always was (revisionColour()).

   "Changed since the last draft" is DERIVED: a stable hash of the
   working copy against a hash of the latest draft's snapshot, at the
   moment someone asks. Nothing records it.

   The writers here mutate the doc they are handed and return what they
   made; the CALLER saves (persistNow on the script page, saveScript on
   the drafts page). Pure otherwise — no storage, no DOM.
   ============================================================ */
import {
  makeRevision, restoreElements, revisionColour, normaliseTitlePage, hasTitlePage, pageCount
} from './script.js';

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
function describe(rev, index) {
  const number = Number.isFinite(rev.number) && rev.number > 0 ? rev.number : index + 1;
  const colour = revisionColour(index);
  return {
    id: rev.id,
    index,
    number,
    name: rev.number ? 'Draft ' + number : (rev.name || 'Draft ' + number),
    label: rev.number ? 'Draft ' + number : (rev.name || 'Draft ' + number),
    note: rev.note || '',
    savedAt: rev.date || '',
    colour,
    pages: pageCount(rev.elements || []),
    lines: (rev.elements || []).length,
    hasTitlePage: !!rev.titlePage,
    rev
  };
}

/** Newest first. */
export function listDrafts(doc) {
  const revs = (doc && Array.isArray(doc.revisions)) ? doc.revisions : [];
  return revs.map(describe).reverse();
}

export function latestDraft(doc) {
  const revs = (doc && Array.isArray(doc.revisions)) ? doc.revisions : [];
  return revs.length ? describe(revs[revs.length - 1], revs.length - 1) : null;
}

const nextNumber = (doc) => (doc.revisions || [])
  .reduce((m, r, i) => Math.max(m, Number.isFinite(r.number) && r.number > 0 ? r.number : i + 1), 0) + 1;

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
  return describe(entry, doc.revisions.length - 1);
}

/** Overwrite a draft's snapshot with the working copy. The spec's
    "update current draft" is the latest; any id is accepted. */
export function updateDraft(doc, id, { note } = {}) {
  const i = (doc.revisions || []).findIndex((r) => r.id === id);
  if (i < 0) return null;
  const entry = doc.revisions[i];
  if (!entry.number) entry.number = i + 1;   // an old entry gains its number only when rewritten
  snapshot(doc, entry, note);
  return describe(entry, i);
}

/** Put a draft's snapshot back as the working copy. The CALLER has
    confirmed. Fresh element ids (restoreElements). Returns whether it
    did anything. */
export function restoreDraft(doc, id) {
  const rev = (doc.revisions || []).find((r) => r.id === id);
  if (!rev) return false;
  doc.elements = restoreElements(rev);
  if (rev.titlePage) {
    if (hasTitlePage(rev.titlePage)) doc.titlePage = normaliseTitlePage(rev.titlePage);
    else delete doc.titlePage;
  }
  // A locked numbering keys on element ids, which have just been renewed.
  delete doc.numbering;
  return true;
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
    (or the working one, for a draft that predates the snapshot). No
    numbering: the snapshot's element ids are not the live ones. */
export function draftDocument(doc, id) {
  const rev = (doc.revisions || []).find((r) => r.id === id);
  if (!rev) return null;
  const out = { elements: rev.elements.map((e) => ({ ...e })), revisions: [], documents: [] };
  const tp = rev.titlePage || doc.titlePage;
  if (hasTitlePage(tp)) out.titlePage = normaliseTitlePage(tp);
  return out;
}

export default {
  hashElements, listDrafts, latestDraft, nextDraftNumber, saveNewDraft, updateDraft,
  restoreDraft, changedSinceDraft, draftDocument
};
