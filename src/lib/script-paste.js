/* ============================================================
   PASTING SCREENPLAY TEXT INTO A LINE — the model half
   ------------------------------------------------------------
   A line of the Screenplay Writer is a textarea, so a native paste
   put every newline of a copied passage inside ONE element: a scene
   heading holding a whole scene, which scene sync then read as a
   Breakdown row with the location "KITCHEN - DAY Mara pours tea.
   MARA Not now." (QA, 26 Oct 2026). The Import dialog's paste box
   already splits text into elements with parseScript(); a paste into
   a line now goes the same way.

   Pure: the editor (src/ui/script-editor/editor.js) parses the text
   with parseScript() and hands the elements here; this says what the
   line becomes and what is inserted after it. No DOM, no storage.
   ============================================================ */

/** Types that are one line on the page: a newline inside one is never right. */
export const ONE_LINE_TYPES = new Set(['scene', 'character', 'transition']);

/** Does this paste need splitting? A one-line type takes no newline at
    all; any line takes a passage of several paragraphs as several
    elements. A newline inside one paragraph of action or dialogue is the
    writer's own line break, and is left to the browser. */
export function wantsSplit(type, text) {
  const t = String(text || '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  if (!t.includes('\n')) return false;
  return ONE_LINE_TYPES.has(type) || /\n[ \t]*\n/.test(t);
}

/** A one-line type's text, its line breaks folded to spaces. */
export const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

/**
 * What the line becomes.
 *   line     { type, before, after }: the line's type, and its text
 *            before and after the selection being replaced
 *   parsed   [{ type, text }] from parseScript(), or null when the text
 *            could not be parsed (it is then one piece of the line's type)
 *   raw      the pasted text
 * Returns { type, text, insert: [{ type, text }] }: the line's own new
 * type and text, and the elements that follow it, in order.
 */
export function planPaste(line, parsed, raw) {
  const type = line.type;
  const before = String(line.before || '');
  const after = String(line.after || '');
  const fit = (t, s) => (ONE_LINE_TYPES.has(t) ? oneLine(s) : String(s || ''));
  const pieces = (Array.isArray(parsed) ? parsed : [])
    .filter((e) => e && String(e.text || '').trim())
    .map((e) => ({ type: e.type, text: fit(e.type, e.text) }));
  if (pieces.length <= 1) {
    const text = pieces.length ? pieces[0].text : String(raw || '').replace(/\r\n?/g, '\n');
    return { type, text: before + fit(type, text) + after, insert: [] };
  }
  const insert = pieces.slice();
  let head;
  if (before.trim()) head = { type, text: before.replace(/\s+$/, '') };
  else head = insert.shift();
  if (after.trim()) insert.push({ type, text: fit(type, after.replace(/^\s+/, '')) });
  return { type: head.type, text: head.text, insert };
}

export default { ONE_LINE_TYPES, wantsSplit, oneLine, planPaste };
