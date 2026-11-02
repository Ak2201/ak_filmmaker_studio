/* ============================================================
   MACROS — Final Draft-style snippets on a key, as pure functions
   ------------------------------------------------------------
   A macro is a shortcut that inserts a snippet:
     { slot: 1..9, label, text, where, type }
   `where` is one of
     'new'    a NEW element of `type` after the line (or, when the line
              is empty, that line turned into it);
     'end'    the text appended to the end of the line — a heading's
              " - CONTINUOUS", a cue's " (V.O.)";
     'caret'  the text at the caret, replacing a selection.

   THE KEY is Alt+Shift+digit (Option+Shift+digit on a Mac), matched on
   e.code like every other editor key (write-keys.js says why). Not
   Ctrl+Alt+digit: on Windows that is AltGr, which types characters on
   many layouts. Alt+digit alone is the element types; Ctrl+digit is the
   browser's tab switch; Alt+Shift+digit takes nothing from either.

   Pure: no DOM, no storage. The editor performs a plan inside ONE
   history step (editor.js macro()); the list lives in `macros` in
   fms_studio_prefs_v1 (chrome-prefs.js), and only when the writer has
   changed it — absent means these defaults.
   ============================================================ */

export const WHERE = ['new', 'end', 'caret'];
export const TARGET_TYPES = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'];

export const DEFAULT_MACROS = [
  { slot: 1, label: '(beat)', text: '(beat)', where: 'new', type: 'paren' },
  { slot: 2, label: 'CONTINUOUS', text: ' - CONTINUOUS', where: 'end', type: '' },
  { slot: 3, label: 'CUT TO:', text: 'CUT TO:', where: 'new', type: 'transition' },
  { slot: 4, label: '(V.O.)', text: ' (V.O.)', where: 'end', type: '' },
  { slot: 5, label: '(O.S.)', text: ' (O.S.)', where: 'end', type: '' },
  { slot: 6, label: 'DISSOLVE TO:', text: 'DISSOLVE TO:', where: 'new', type: 'transition' },
  { slot: 7, label: 'LATER', text: ' - LATER', where: 'end', type: '' },
  { slot: 8, label: 'FADE OUT.', text: 'FADE OUT.', where: 'new', type: 'transition' },
  { slot: 9, label: '(pause)', text: '(pause)', where: 'new', type: 'paren' }
];

/** The list the writer's pref describes, cleaned: slots 1-9 once each,
    a snippet that is not empty, a target the editor can write. A bad
    entry is dropped, never repaired into something else; a pref that is
    absent or not a list is the defaults. */
export function parseMacros(raw) {
  if (!Array.isArray(raw)) return DEFAULT_MACROS.map((m) => ({ ...m }));
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const slot = Number(m.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 9 || seen.has(slot)) continue;
    const text = typeof m.text === 'string' ? m.text.slice(0, 200) : '';
    if (!text.trim()) continue;
    const where = WHERE.includes(m.where) ? m.where : 'caret';
    const type = where === 'new' ? (TARGET_TYPES.includes(m.type) ? m.type : 'action') : '';
    const label = (typeof m.label === 'string' && m.label.trim() ? m.label.trim() : text.trim()).slice(0, 40);
    seen.add(slot);
    out.push({ slot, label, text, where, type });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** What to store: nothing when the list is the defaults. */
export function storableMacros(list) {
  const clean = parseMacros(list);
  return JSON.stringify(clean) === JSON.stringify(DEFAULT_MACROS) ? undefined : clean;
}

export const macroForSlot = (list, slot) => (list || []).find((m) => m.slot === slot) || null;

/** The slot an Alt+Shift+digit keystroke names (0 = not a macro key). */
export function macroSlotOf(e) {
  if (!e || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return 0;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
  return m ? Number(m[1]) : 0;
}

/* A heading's closing time word: " - DAY" is replaced by " - CONTINUOUS",
   not followed by it ("INT. KITCHEN - DAY - CONTINUOUS" is not a
   heading). Anything else after the dash is part of the place. */
const TIME_TAIL = /\s+-\s+(?:DAY|NIGHT|DAWN|DUSK|MORNING|AFTERNOON|EVENING|LATER|CONTINUOUS|MOMENTS LATER|SAME|SAME TIME|SUNRISE|SUNSET)\s*$/i;

/** A line with `suffix` on its end. On a scene heading a dashed suffix
    takes the place of a time word already there; elsewhere, and when the
    suffix is already the line's end, nothing doubles. */
export function withSuffix(text, suffix, type = '') {
  const t = String(text ?? '').replace(/\s+$/, '');
  const s = String(suffix ?? '');
  if (!s.trim()) return t;
  if (t.toUpperCase().endsWith(s.trim().toUpperCase())) return t;
  if (type === 'scene' && /^\s*-\s/.test(s) && TIME_TAIL.test(t)) return t.replace(TIME_TAIL, '') + s;
  const lead = /^\s/.test(s) || !t ? '' : ' ';
  return t + lead + s;
}

/** The plan for a macro on one line. `line` { type, text }, `caret`
    { start, end } (null: at the end).
      { op: 'new', type, text, convert }   convert: the line is empty, so
                                           turn it into the element
      { op: 'edit', text, caret }          the line's new text and caret */
export function planMacro(macro, line, caret) {
  if (!macro) return null;
  const text = String((line && line.text) ?? '');
  if (macro.where === 'new') {
    return { op: 'new', type: macro.type || 'action', text: macro.text.trim(), convert: text.trim() === '' };
  }
  if (macro.where === 'end') {
    const next = withSuffix(text, macro.text, line && line.type);
    return { op: 'edit', text: next, caret: next.length };
  }
  const a = caret && Number.isInteger(caret.start) ? Math.min(caret.start, text.length) : text.length;
  const b = caret && Number.isInteger(caret.end) ? Math.min(Math.max(caret.end, a), text.length) : a;
  const next = text.slice(0, a) + macro.text + text.slice(b);
  return { op: 'edit', text: next, caret: a + macro.text.length };
}

export default { DEFAULT_MACROS, WHERE, TARGET_TYPES, parseMacros, storableMacros, macroForSlot, macroSlotOf, withSuffix, planMacro };
