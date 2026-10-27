/* ============================================================
   SCRIPT EDITOR — typing inference
   ------------------------------------------------------------
   The industry-standard feel: INT./EXT. makes a scene heading, an
   ALL-CAPS name plus Return makes a character, and the Fountain
   forcing marks (. @ >) are accepted silently.

   The classifiers are pure (no DOM, no storage). createInference()
   is the hook the editor calls. Every change goes through the
   editor's one type path, setElementType; a type the writer chose
   themselves (select, Alt+digit, Tab) is remembered for that line,
   in memory only, and never re-inferred.
   ============================================================ */

const SCENE_PREFIX = /^(?:int\.?\/ext\.?|i\/e\.?|int\.|ext\.)(?=\s|$|[A-Za-z])/i;
const SUFFIXES = /\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT['’]D)\)/g;

/** Typing, in an action line: the type the text now asks for, and the
 *  text to keep — or null. */
export function classifyInput(text, type) {
  if (type !== 'action' || typeof text !== 'string') return null;
  const t = text.replace(/^\s+/, '');
  if (SCENE_PREFIX.test(t)) return { type: 'scene', text };
  // ".." and "..." open an ellipsis, not a heading.
  if (t.length >= 2 && t[0] === '.' && t[1] !== '.') return { type: 'scene', text: t.slice(1).replace(/^\s+/, '') };
  if (t.length >= 2 && t[0] === '@') return { type: 'character', text: t.slice(1).replace(/^\s+/, '') };
  return null;
}

const TRANSITION_WORDS = /^(?:FADE (?:IN|OUT|TO BLACK)|(?:CUT|SMASH(?: CUT)?|SMASH|FADE) TO BLACK|SMASH CUT|MATCH CUT|JUMP CUT|TIME CUT|INTERCUT|IRIS (?:IN|OUT)|WIPE)[.:]?$/;
const CLOSING_CARD = /^(?:THE END|END|BLACK|BLACKOUT|END CREDITS|ROLL CREDITS)[.:]?$/;
const isCapsLine = (s) => /^[A-Z0-9][A-Z0-9 '’.\-]*$/.test(s) && /[A-Z]/.test(s);

/** Return at the end of an action line: what the line really was. */
export function classifyReturn(text, type) {
  if (type !== 'action' || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  if (t[0] === '>' && !/<\s*$/.test(t)) {
    const rest = t.slice(1).trim();
    return rest ? { type: 'transition', text: rest } : null;
  }
  if (t[0] === '>') return null;                       // >centered<
  if (isCapsLine(t.replace(/:$/, '')) && /\bTO:$/.test(t)) return { type: 'transition', text: t };
  /* The standard transitions that do not end in TO: (QA r4: FADE OUT.,
     CUT TO BLACK. and SMASH CUT: became a character cue, or stayed
     action). Same words the importer's TRANS_RE knows. A closing card
     (THE END, BLACK.) is a line of action, never a cue. */
  if (TRANSITION_WORDS.test(t)) return { type: 'transition', text: t };
  if (CLOSING_CARD.test(t)) return null;
  if (t.endsWith(':')) return null;
  const base = t.replace(SUFFIXES, '').trim();
  const words = base.split(/\s+/);
  if (words.length < 1 || words.length > 4) return null;
  if (!isCapsLine(base) || SCENE_PREFIX.test(base)) return null;
  return { type: 'character', text: t };
}

/** The editor's hook. `ed` needs getElements, indexOf, setElementType. */
export function createInference(ed) {
  const explicit = new Set();            // element ids; memory only
  let auto = false;

  const apply = (i, type) => {
    auto = true;
    try { ed.setElementType(i, type); } finally { auto = false; }
  };
  const setText = (el, ta, text) => {
    el.text = text;
    if (ta) {
      ta.value = text;
      try { ta.setSelectionRange(text.length, text.length); } catch (e) { /* not focusable */ }
    }
  };

  return {
    /** Called by the editor's type path for every change; a change that
     *  did not come from here was the writer's. */
    noteTypeChange(id) { if (!auto && id) explicit.add(id); },
    /** After the model has taken the new text of line i. */
    onInput(i, ta) {
      const el = ed.getElements()[i];
      if (!el || explicit.has(el.id)) return false;
      const r = classifyInput(el.text, el.type);
      if (!r) return false;
      if (r.text !== el.text) setText(el, ta, r.text);
      apply(i, r.type);
      return true;
    },
    /** Return at the end of an action line. Returns the type the line
     *  became (already applied), or null to let the flow table decide. */
    onReturn(i, ta) {
      const el = ed.getElements()[i];
      if (!el || explicit.has(el.id)) return null;
      const r = classifyReturn(ta ? ta.value : el.text, el.type);
      if (!r) return null;
      setText(el, ta, r.text);
      apply(i, r.type);
      return r.type;
    }
  };
}

export default { classifyInput, classifyReturn, createInference };
