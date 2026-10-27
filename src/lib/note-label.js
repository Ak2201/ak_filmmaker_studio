/* The accessible name of a private-note pencil. Ten pencils in a row
   used to announce the same sentence; each now says which question its
   note belongs to (WCAG 2.4.6). Pure: no DOM, no storage. */
export const NOTE_TITLE = 'Add a private note (saved on your device)';

/** "Add a private note on: Your idea", or the generic sentence when the
 *  field has no readable label. */
export function noteLabel(fieldText) {
  const t = String(fieldText || '').replace(/✎/g, '').replace(/\s+/g, ' ').trim();
  return t ? `Add a private note on: ${t}` : NOTE_TITLE;
}
