/* ============================================================
   DRAFTS MODEL — the sentences and headers of drafts.html
   ------------------------------------------------------------
   src/lib/drafts.js is the model of a draft. This is what the Drafts
   page says about them: the state line, each row's meta, the restore
   question and its choices, and the header a draft's PDF is printed
   with — taken from the draft alone, never from the clock, so the
   same draft prints the same sheets. src/pages/drafts.js draws it.

   Pure: no `document`, no storage, no view imports.
   ============================================================ */
import { latestDraft, changedSinceDraft, nextDraftNumber } from './drafts.js';
import { formatStamp } from './write-format.js';

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/** Where the working copy stands against the drafts. */
export function draftStateText(doc) {
  const last = latestDraft(doc);
  if (!last) return doc.elements.length ? 'No draft saved yet.' : 'Nothing written yet.';
  return changedSinceDraft(doc) ? 'Unsaved draft changes since ' + last.label + '.' : 'Up to date with ' + last.label + '.';
}

/** The title-page card's state line. */
export const titlePageStateText = (on) => (on
  ? 'Page 1 of every PDF. A draft keeps the title page it was saved with.'
  : 'Empty — the PDF opens on a plain title.');

/** A row's meta: when it was saved, its pages and its lines. */
export const draftMetaText = (d) =>
  [formatStamp(d.savedAt, true), plural(d.pages, 'page'), plural(d.lines, 'line')].join(' · ');

/** "Draft 4" — the name the next saved draft takes. */
export const nextDraftName = (doc) => 'Draft ' + nextDraftNumber(doc);

/** The restore dialog for a draft: its title, body and choices.
    `dirty` is whether the working copy has changes no draft holds. */
export function restoreDialogSpec(d, dirty, nextName) {
  const choices = [];
  if (dirty) choices.push({ id: 'save', label: 'Save as ' + nextName + ', then restore', primary: true });
  choices.push({ id: 'go', label: dirty ? 'Restore anyway' : 'Restore ' + d.label, primary: !dirty, danger: dirty });
  choices.push({ id: 'cancel', label: 'Cancel' });
  return {
    title: 'Restore ' + d.label + ' as the working copy?',
    body: dirty
      ? 'The script you have now has changes that are in no draft. Restoring replaces it.'
      : 'The script you have now matches the latest draft, so nothing is lost.',
    choices
  };
}

/** The typesetter's header for a draft's PDF, from the draft alone. */
export function draftPdfMeta(d, projectTitle) {
  return {
    title: projectTitle,
    revision: d.colour.name + ' — ' + d.label,
    subtitle: formatStamp(d.savedAt),
    date: String(d.savedAt).slice(0, 10)
  };
}
/** The PDF export's own title and subtitle for a draft. */
export function draftPdfTitles(d, projectTitle) {
  return {
    title: projectTitle + ' — Screenplay — ' + d.label,
    subtitle: [d.label, plural(d.pages, 'page'), formatStamp(d.savedAt)].join(' · ')
  };
}
