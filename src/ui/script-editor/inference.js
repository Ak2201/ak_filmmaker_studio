/* ============================================================
   SCRIPT EDITOR — typing inference
   ------------------------------------------------------------
   The industry-standard feel: INT./EXT. makes a scene heading, an
   ALL-CAPS name plus Return makes a character, and the Fountain
   forcing marks (. @ >) are accepted silently.

   ON ANY LINE TYPE (owner, 2 Nov 2026), not only action: a transition
   typed into a speech is a transition, a "(" opening an empty line in
   a speech is a parenthetical, a known name alone is a cue. What keeps
   that from fighting the writer is twofold: the rules outside action
   are narrower (capitals, punctuation, KNOWN names), and every switch
   is ONE step in the editor's history, so one Ctrl+Z puts the line
   back exactly as typed — and that line is then left alone.

   The classifiers are pure (no DOM, no storage). createInference()
   is the hook the editor calls. Every change goes through the
   editor's one type path, setElementType. A type the writer chose
   by hand (select, Alt+digit, Tab) is NOT protected (owner, 2 Nov
   2026: Final Draft reformats those too); the only line left alone
   is one whose auto-switch the writer UNDID, remembered in memory.
   ============================================================ */

import { ACT_LINE } from '../../lib/act-line.js';

const SCENE_PREFIX = /^(?:int\.?\/ext\.?|i\/e\.?|int\.|ext\.)(?=\s|$|[A-Za-z])/i;
/* Outside an action line the writer is writing words, not headings —
   "Int. is short for interior" in a speech must stay a speech — so a
   heading is recognised there only in the capitals a heading is typed
   in, and with the space after it. EST. is caps-only everywhere: "Est.
   1990" is a perfectly good line of action. */
const SCENE_PREFIX_CAPS = /^(?:INT\.?\/EXT\.?|I\/E\.?|INT\.|EXT\.|EST\.)\s/;
/* ...and outside action, not at the space: "EXT. " in a speech may be
   "EXT. is the code for exterior", and switching on the space turned that
   sentence into a heading before its next word existed. So a speech, a
   cue or a transition waits for two characters after the prefix and
   takes the heading only while none of them is lower case. */
function capsHeadingTyped(t) {
  const m = SCENE_PREFIX_CAPS.exec(t);
  if (!m) return false;
  const rest = t.slice(m[0].length);
  return rest.replace(/\s+/g, '').length >= 2 && !/[a-z]/.test(rest);
}
const SUFFIXES = /\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT['’]D)\)/g;
const SUFFIXES_ANY = /\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT['’]D)\)/gi;

const TRANSITION_WORDS = /^(?:FADE (?:IN|OUT|TO BLACK)|(?:CUT|SMASH(?: CUT)?|SMASH|FADE) TO BLACK|SMASH CUT|MATCH CUT|JUMP CUT|TIME CUT|INTERCUT|IRIS (?:IN|OUT)|WIPE)[.:]?$/;
const CLOSING_CARD = /^(?:THE END|END|BLACK|BLACKOUT|END CREDITS|ROLL CREDITS)[.:]?$/;
const isCapsLine = (s) => /^[A-Z0-9][A-Z0-9 '’.\-]*$/.test(s) && /[A-Z]/.test(s);

/** Is `t` (trimmed) a transition? While TYPING, only once its closing
 *  "." or ":" is there — "FADE IN" may be on its way to "FADE INTO
 *  WHITE" — so a transition waits for its punctuation; Return takes it
 *  without. "I said go TO:" is not a caps line, so a speech keeps it. */
function isTransition(t, typing) {
  if (typing && !/[.:]$/.test(t)) return false;
  if (isCapsLine(t.replace(/:$/, '')) && /\bTO:$/.test(t)) return true;
  return TRANSITION_WORDS.test(t);
}

/** A heading the writer is still typing is never turned into anything
 *  else on the way (a slug that happens to end "TO:", a stray paren). */
const headingInProgress = (t, type) => type === 'scene' && SCENE_PREFIX.test(t);

/** Typing: the type the text now asks for, and the text to keep — or
 *  null. `ctx`: { prevType, was } — the type of the line above, and this
 *  line's text before the keystroke (a "(" makes a parenthetical only
 *  when it opens an EMPTY line; "(" put in front of a written speech is
 *  an edit, not a new element). */
export function classifyInput(text, type, ctx = {}) {
  if (typeof text !== 'string' || !type) return null;
  const t = text.replace(/^\s+/, '');
  if (!t || headingInProgress(t, type)) return null;
  if (type === 'action') {
    if (SCENE_PREFIX.test(t) || SCENE_PREFIX_CAPS.test(t)) return { type: 'scene', text };
    // ".." and "..." open an ellipsis, not a heading.
    if (t.length >= 2 && t[0] === '.' && t[1] !== '.') return { type: 'scene', text: t.slice(1).replace(/^\s+/, '') };
    if (t.length >= 2 && t[0] === '@') return { type: 'character', text: t.slice(1).replace(/^\s+/, '') };
    // Fountain's lyric mark. (>centered< needs its closing mark, so it waits for Return.)
    if (t.length >= 2 && t[0] === '~') return { type: 'lyrics', text: t.slice(1).replace(/^\s+/, '') };
  } else if (type !== 'scene' && capsHeadingTyped(t)) {
    return { type: 'scene', text };
  }
  if (type !== 'transition' && isTransition(t.trim(), true)) return { type: 'transition', text };
  /* "(" opening an empty line inside a speech — a dialogue line, or the
     action line Return gives after one — is a parenthetical. */
  const speech = type === 'dialogue'
    || (type === 'action' && ['dialogue', 'paren', 'character'].includes(ctx.prevType));
  const fresh = t === '(' || ctx.was === '';
  if (speech && t[0] === '(' && fresh) return { type: 'paren', text };
  return null;
}

/** The names a cue may carry, as the editor compares them: upper case,
 *  extensions and the dual mark dropped, longest first (so "MR. RAO"
 *  is tried before "RAO"), each once. */
export function normaliseNames(names) {
  const seen = new Set();
  for (const n of names || []) {
    const v = String(n ?? '').replace(/\([^)]*\)/g, ' ').replace(/\^/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => b.length - a.length);
}

/** Return at the end of a line: what the line really was. `ctx.names`
 *  are the KNOWN speakers (the script's cues and the Characters page). */
export function classifyReturn(text, type, ctx = {}) {
  if (typeof text !== 'string' || !type || type === 'character') return null;
  const t = text.trim();
  if (!t || headingInProgress(t, type)) return null;
  if (type === 'action' && t[0] === '>') {
    if (/<\s*$/.test(t)) {                            // >centered<
      const inner = t.replace(/^>\s*/, '').replace(/\s*<$/, '');
      return inner ? { type: 'centered', text: inner } : null;
    }
    const rest = t.slice(1).trim();
    return rest ? { type: 'transition', text: rest } : null;
  }
  /* "ACT TWO" / "END OF ACT ONE" typed as action is an act break, not a
     character cue — the cue rule below would otherwise take it. */
  if (type === 'action' && ACT_LINE.test(t)) return { type: 'act', text: t };
  /* The standard transitions that do not end in TO: (QA r4: FADE OUT.,
     CUT TO BLACK. and SMASH CUT: became a character cue, or stayed
     action). Same words the importer's TRANS_RE knows. A closing card
     (THE END, BLACK.) is a line of action, never a cue. */
  if (type !== 'transition' && isTransition(t, false)) return { type: 'transition', text: t };
  if (CLOSING_CARD.test(t) || t.endsWith(':')) return null;
  /* A KNOWN name alone on the line is a cue on any line — but outside
     action only in capitals, because a speech that is just "Preethi" is
     somebody calling her. A script without case (Tamil) compares as
     typed, so a known Tamil name alone is a cue too. */
  const names = ctx.names ? normaliseNames(ctx.names) : [];
  const bare = t.replace(SUFFIXES_ANY, '').trim();
  const up = bare.toUpperCase();
  if (names.includes(up) && (type === 'action' || bare === up)) {
    return { type: 'character', text: type === 'action' ? t.toUpperCase() : t };
  }
  if (type !== 'action') return null;
  const base = t.replace(SUFFIXES, '').trim();
  const words = base.split(/\s+/);
  if (words.length < 1 || words.length > 4) return null;
  if (!isCapsLine(base) || SCENE_PREFIX.test(base)) return null;
  return { type: 'character', text: t };
}

/* ---- "Preethi says hello." -----------------------------------------
   Return on an ACTION line that opens with a KNOWN name and a speech
   verb (or "NAME:") is a speech written as prose: it becomes the cue, a
   manner parenthetical where the verb carries one, and the dialogue.
   The guards, each a false positive it prevents:
     - known names only, never any capitalised word ("Nobody says…");
     - action lines only: in a speech, "Ravi said you'd come" is a line;
     - words must follow the verb, and "says nothing" is what they do;
     - a manner verb (whispers, cries…) also reads as plain action, so
       its words must be set off — a comma, a colon, "that" or quotes:
       "Preethi cries all night." stays action. */
const SAY_VERBS = ['says', 'said', 'asks', 'asked', 'replies', 'replied', 'answers', 'answered', 'tells', 'told'];
const MANNER = {
  whispers: 'whispering', whispered: 'whispering',
  shouts: 'shouting', shouted: 'shouting',
  yells: 'yelling', yelled: 'yelling',
  mutters: 'muttering', muttered: 'muttering',
  murmurs: 'murmuring', murmured: 'murmuring',
  screams: 'screaming', screamed: 'screaming',
  cries: 'crying', cried: 'crying'
};
const QUOTES = /^["“”'‘’]+|["“”'‘’]+$/g;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function speechOf(rest) {
  const d = String(rest).trim().replace(QUOTES, '').trim();
  return d ? d[0].toLocaleUpperCase() + d.slice(1) : '';
}

/** parseSaysLine(text, names) → { name, paren, dialogue } | null.
 *  `name` is the cue as it prints (upper case); `paren` is '' or e.g.
 *  "(whispering)". Pure. */
export function parseSaysLine(text, names) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  const list = normaliseNames(names);
  if (!t || !list.length) return null;
  const objects = ['him', 'her', 'them', 'me', 'us', 'you', ...list.map(escRe)].join('|');
  const verbs = [...SAY_VERBS, ...Object.keys(MANNER)].join('|');
  const verbRe = new RegExp('^\\s*,?\\s+(' + verbs + ')(?:\\s+(?:to\\s+)?(?:' + objects + '))?(?=[\\s,:"“‘\']|$)([\\s\\S]*)$', 'iu');
  for (const name of list) {
    // The name, then a boundary that works for Tamil too (\b does not).
    const m = new RegExp('^' + escRe(name) + '(?=[\\s,:]|$)', 'iu').exec(t);
    if (!m) continue;
    const rest = t.slice(m[0].length);
    const colon = /^\s*:\s*([\s\S]+)$/u.exec(rest);
    if (colon) {
      const dialogue = speechOf(colon[1]);
      return dialogue ? { name, paren: '', dialogue } : null;
    }
    const v = verbRe.exec(rest);
    if (!v) return null;
    const manner = MANNER[v[1].toLowerCase()] || '';
    let after = v[2];
    const sep = /^\s*(?:[,:]|that\b)/i.exec(after);
    const quoted = /^\s*["“‘']/.test(after);
    if (sep) after = after.slice(sep[0].length);
    if (manner && !sep && !quoted) return null;
    if (/^\s*nothing\b/i.test(after)) return null;
    const dialogue = speechOf(after);
    if (!dialogue) return null;
    return { name, paren: manner ? '(' + manner + ')' : '', dialogue };
  }
  return null;
}

/** The editor's hook. `ed` needs getElements and setElementType; it may
 *  also give `names()` (the known speakers), `step(kind, fn, meta)` (the
 *  history: one undo step around fn) and `speak(i, parsed)` (replace line
 *  i with cue + paren + dialogue; returns the dialogue's index). */
export function createInference(ed) {
  const suppressed = new Set();          // element ids; memory only
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
  /* One history step, marked as the formatter's, so undoing it also
     tells this module to leave the line alone from then on. */
  const step = (id, fn) => (typeof ed.step === 'function' ? ed.step('auto', fn, { auto: id }) : fn());
  const names = () => {
    try { return typeof ed.names === 'function' ? ed.names() || [] : []; } catch (e) { return []; }
  };

  return {
    /** Called by the editor's type path for every change. Kept as a
     *  hook, but a hand-chosen type no longer shields the line: the
     *  owner wants it reformatted like any other (2 Nov 2026). One
     *  Ctrl+Z still restores it, and that undo is what suppresses. */
    noteTypeChange() {},
    /** The writer undid a switch on this line: never re-infer it. */
    suppress(id) { if (id) suppressed.add(id); },
    /** After the model has taken the new text of line i. `was` is the
     *  line's text before the keystroke. */
    onInput(i, ta, was) {
      const list = ed.getElements();
      const el = list[i];
      if (!el || suppressed.has(el.id)) return false;
      const r = classifyInput(el.text, el.type, { prevType: list[i - 1] && list[i - 1].type, was });
      if (!r || (r.type === el.type && r.text === el.text)) return false;
      step(el.id, () => {
        if (r.text !== el.text) setText(el, ta, r.text);
        apply(i, r.type);
      });
      return true;
    },
    /** Would Return on line i, holding `text`, be reformatted (a speech
     *  written as prose, a cue, a transition)? Asks, changes nothing: the
     *  dictation uses it to end a line at a spoken pause only when the
     *  auto-format has something to do with it. */
    wouldFormat(i, text) {
      const el = ed.getElements()[i];
      if (!el || suppressed.has(el.id) || !String(text || '').trim()) return false;
      const known = names();
      if (el.type === 'action' && parseSaysLine(text, known)) return true;
      return !!classifyReturn(text, el.type, { names: known });
    },
    /** Return at the end of a line. Returns { type, at } — the type the
     *  last line became and its index, already applied — or null to let
     *  the flow table decide. The caller adds the next line INSIDE the
     *  same history step, so one undo restores the line as typed. */
    onReturn(i, ta) {
      const el = ed.getElements()[i];
      if (!el || suppressed.has(el.id)) return null;
      const text = ta ? ta.value : el.text;
      const known = names();
      if (el.type === 'action' && typeof ed.speak === 'function') {
        const said = parseSaysLine(text, known);
        if (said) {
          let at = i;
          step(el.id, () => { at = ed.speak(i, said); });
          return { type: 'dialogue', at };
        }
      }
      const r = classifyReturn(text, el.type, { names: known });
      if (!r) return null;
      step(el.id, () => {
        setText(el, ta, r.text);
        apply(i, r.type);
      });
      return { type: r.type, at: i };
    }
  };
}

export default { classifyInput, classifyReturn, parseSaysLine, normaliseNames, createInference };
