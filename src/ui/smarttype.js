/* ============================================================
   SMARTTYPE — suggestions under the caret, never insertions
   ------------------------------------------------------------
   Phase 2 of docs/SCREENPLAY-WRITER-PLAN.md (idea 3). Three element
   types get a list as you type:

     scene heading   INT. / EXT. / INT./EXT. / EST., then the
                     locations this script has already used, then a
                     time after " - " (DAY, NIGHT, CONTINUOUS, …)
     character cue   the names this script has already used, most
                     frequent first, and the extensions (V.O.) …
     transition      CUT TO:, DISSOLVE TO:, …

   The word lists are content (src/data/write-presets.json); the names
   and locations are learned from this script and nowhere else.

   NOTHING IS EVER INSERTED WITHOUT A KEY. The list offers; ↑/↓ moves,
   Tab or Return accepts, Esc dismisses. When what you typed is already
   a complete known value — a name the script uses, a time, a
   transition — no option is pre-selected, so Return does what Return
   always does instead of swapping "RAGAVAN" for "RAGAVAN'S FATHER".
   A Return that accepts never also makes a new element: handleKey()
   answers true and the page stops there.

   The ARIA combobox pattern on the existing textarea: focus never
   leaves the line being written, the list is role=listbox, and the
   highlighted option is named by aria-activedescendant — the one
   mechanism that reports a selection the focus did not move to (same
   reasoning as src/ui/palette.js).

   CHEAP BY CONSTRUCTION. The index is built once, the first time a
   suggestion is wanted, and then kept current one element at a time
   from the input handler (noteEdit). A full render, a type change or
   an add/remove marks it stale and the next request rebuilds it —
   one pass over the elements, scene headings and cues only. No timer,
   no observer, no work while idle, and no storage at all: it is a
   view of the script model, rebuilt from it.

   The list lives on <body>, not in the row: the rows sit in runs with
   `content-visibility: auto` (write.css), which paint-contains them,
   so a list hung inside a run would be clipped at the run's edge.
   ============================================================ */
import { SMARTTYPE } from '../lib/write-keys.js';
import '../styles/smarttype.css';

const INTRO_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.?|I\/E\.?|INT\.|EXT\.|EST\.)(\s+|$)/i;
/* The LAST " - " (or an en/em dash) is where the time starts: a
   heading may carry more than one ("ENGINEERING COLLEGE - QUAD - DAY"). */
const LAST_SEP_RE = /^(.*\S)(\s+[-–—]\s*)([^-–—]*)$/;
const LIMIT = 8;
const up = (s) => String(s || '').toUpperCase();

/* ---- parsing (pure) ------------------------------------------ */
export function parseHeading(text) {
  const t = up(text).trim();
  const m = INTRO_RE.exec(t);
  if (!m) return { intro: '', location: '', time: '' };
  const rest = t.slice(m[0].length).trim();
  const s = LAST_SEP_RE.exec(rest);
  if (!s) return { intro: m[1], location: rest, time: '' };
  return { intro: m[1], location: s[1].trim(), time: s[3].trim().replace(/\s*\(.*$/, '') };
}

/** A cue's name with its extension and any (CONT'D) taken off. */
export function cueName(text) {
  return up(text).replace(/\(.*$/, '').replace(/\^\s*$/, '').trim();
}

/* ---- the index (pure, incremental) --------------------------- */
export function createIndex() {
  const counts = { loc: new Map(), name: new Map(), time: new Map() };
  const contrib = new Map();          // element id -> { loc, name, time }
  let stale = true;

  const bump = (map, k, d) => {
    if (!k) return;
    const n = (map.get(k) || 0) + d;
    if (n > 0) map.set(k, n); else map.delete(k);
  };
  const apply = (c, d) => {
    if (!c) return;
    bump(counts.loc, c.loc, d); bump(counts.name, c.name, d); bump(counts.time, c.time, d);
  };
  const of = (el) => {
    if (el.type === 'scene') { const p = parseHeading(el.text); return { loc: p.location, time: p.time }; }
    if (el.type === 'character') return { name: cueName(el.text) };
    return null;
  };

  return {
    invalidate() { stale = true; },
    ensure(elements) {
      if (!stale) return;
      counts.loc.clear(); counts.name.clear(); counts.time.clear(); contrib.clear();
      for (const el of elements) {
        const c = of(el);
        if (c) { contrib.set(el.id, c); apply(c, 1); }
      }
      stale = false;
    },
    /** One element changed: swap its old contribution for its new one. */
    noteEdit(el) {
      if (stale || !el) return;
      apply(contrib.get(el.id), -1);
      const c = of(el);
      if (c) { contrib.set(el.id, c); apply(c, 1); } else contrib.delete(el.id);
    },
    /** Ranked, most frequent first, with `ownId`'s contribution taken
        out — so a name half-typed in THIS cue is never offered back. */
    ranked(kind, ownId) {
      const own = ownId ? contrib.get(ownId) : null;
      const out = [];
      counts[kind].forEach((n, k) => {
        const c = own && own[kind] === k ? n - 1 : n;
        if (c > 0) out.push([k, c]);
      });
      out.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      return out.map((x) => x[0]);
    }
  };
}

/* ---- what to offer (pure) -------------------------------------
   `before` is the text up to the caret. Each item's `value` is the
   whole new text-before-caret; `chain` says the list should reopen
   for the next part (an intro wants a location, a location a time).
   `exact` is true when what was typed is already a complete value. */
export function suggest(type, before, index, ownId) {
  const raw = String(before || '');
  const U = up(raw);
  if (!U.trim()) return { items: [], exact: false };
  const starts = (cand, typed) => cand.startsWith(typed) && cand !== typed;

  if (type === 'scene') {
    if (!/\s/.test(raw)) {
      const items = SMARTTYPE.intros.filter((i) => starts(i, U))
        .map((i) => ({ label: i.trim(), value: i, chain: true, hint: 'heading' }));
      return { items, exact: SMARTTYPE.intros.some((i) => i.trim() === U) && !items.length };
    }
    const m = INTRO_RE.exec(U);
    if (!m) return { items: [], exact: false };
    const intro = m[1] + ' ';
    const rest = U.slice(m[0].length);
    const locs = index.ranked('loc', ownId);
    const items = [];
    const s = LAST_SEP_RE.exec(rest);
    let exact = false;
    if (s) {
      const tail = s[3].trimStart();
      const head = intro + s[1] + s[2].replace(/\s*$/, ' ').replace(/^\s*/, ' ');
      const times = [...SMARTTYPE.times];
      index.ranked('time', ownId).forEach((t) => { if (!times.includes(t)) times.push(t); });
      times.filter((t) => starts(t, tail)).forEach((t) => items.push({ label: t, value: head + t, hint: 'time' }));
      exact = times.includes(tail.trim());
    }
    const typedLoc = rest.trim();
    locs.filter((l) => starts(l, typedLoc) || (!typedLoc && l))
      .forEach((l) => items.push({ label: l, value: intro + l + SMARTTYPE.separator, chain: true, hint: 'location' }));
    if (!s && locs.includes(typedLoc)) exact = true;
    return { items: items.slice(0, LIMIT), exact };
  }

  if (type === 'character') {
    const paren = raw.indexOf('(');
    if (paren >= 0) {
      const name = raw.slice(0, paren).trimEnd();
      const typed = U.slice(paren);
      const items = SMARTTYPE.extensions.filter((x) => starts(x, typed))
        .map((x) => ({ label: x, value: name + ' ' + x, hint: 'extension' }));
      return { items, exact: SMARTTYPE.extensions.includes(typed.trim()) };
    }
    const names = index.ranked('name', ownId);
    const typed = U.trimStart();
    const items = names.filter((n) => starts(n, typed))
      .map((n) => ({ label: n, value: n, hint: 'character' }));
    const known = names.includes(typed.trim());
    if (known && /\s$/.test(raw)) {
      SMARTTYPE.extensions.forEach((x) => items.push({ label: x, value: typed.trim() + ' ' + x, hint: 'extension' }));
    }
    return { items: items.slice(0, LIMIT), exact: known };
  }

  if (type === 'transition') {
    const typed = U.trimStart();
    const items = SMARTTYPE.transitions.filter((t) => starts(t, typed))
      .map((t) => ({ label: t, value: t, hint: 'transition' }));
    return { items, exact: SMARTTYPE.transitions.includes(typed.trim()) };
  }
  return { items: [], exact: false };
}

/* ---- the UI ---------------------------------------------------
   createSmartType({ getElements, elementOf })
     getElements()      the live element array
     elementOf(ta)      the model element a textarea edits, or null
   The page calls update(ta, el) from its input handler, handleKey(e, ta)
   first thing in its keydown handler, noteEdit(el) after a model
   change and invalidate() after anything structural. */
export function createSmartType({ getElements, elementOf }) {
  const index = createIndex();
  let list = null;
  let state = null;     // { ta, items, active }
  let chainNext = null; // after an accept: reopen (true) or stay shut (false)

  function ensureList() {
    if (list) return list;
    list = document.createElement('ul');
    list.id = 'st-list';
    list.className = 'st-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Suggestions');
    list.hidden = true;
    // pointerdown, not click: keep the caret in the textarea.
    list.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('[data-st-i]');
      if (!li || !state) return;
      e.preventDefault();
      state.active = Number(li.dataset.stI);
      accept();
    });
    document.body.append(list);
    return list;
  }

  function close() {
    if (!state) return;
    const ta = state.ta;
    state = null;
    if (list) { list.hidden = true; list.replaceChildren(); }
    ta.setAttribute('aria-expanded', 'false');
    ta.removeAttribute('aria-activedescendant');
  }

  function paint() {
    const ul = ensureList();
    const { ta, items, active } = state;
    ul.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.id = 'st-opt-' + i;
      li.className = 'st-opt' + (i === active ? ' is-active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === active ? 'true' : 'false');
      li.dataset.stI = String(i);
      const lab = document.createElement('span');
      lab.className = 'st-lab';
      lab.textContent = it.label;
      const hint = document.createElement('span');
      hint.className = 'st-hint';
      hint.textContent = it.hint || '';
      li.append(lab, hint);
      return li;
    }));
    ul.hidden = false;
    ta.setAttribute('aria-autocomplete', 'list');
    ta.setAttribute('aria-controls', 'st-list');
    ta.setAttribute('aria-expanded', 'true');
    if (active >= 0) ta.setAttribute('aria-activedescendant', 'st-opt-' + active);
    else ta.removeAttribute('aria-activedescendant');
    // Under the line being written, clamped inside the viewport so the
    // list can never be the thing that scrolls a phone sideways.
    const r = ta.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = Math.min(ul.offsetWidth || 288, vw - 32);
    const left = Math.max(16, Math.min(r.left, vw - 16 - w));
    ul.style.left = (left + window.scrollX) + 'px';
    ul.style.top = (r.bottom + window.scrollY + 4) + 'px';
    if (active >= 0) {
      const node = ul.children[active];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    }
  }

  function update(ta, known) {
    // The page usually has the element already; finding it again is a
    // scan of the whole script per keystroke on a feature.
    const el = known || elementOf(ta);
    const chain = chainNext;
    chainNext = null;
    if (!el || !['scene', 'character', 'transition'].includes(el.type)
        || chain === false
        || ta.selectionStart !== ta.selectionEnd || ta.selectionEnd !== ta.value.length) {
      close();
      return;
    }
    index.ensure(getElements());
    const { items, exact } = suggest(el.type, ta.value, index, el.id);
    if (!items.length) { close(); return; }
    state = { ta, items, active: exact ? -1 : 0 };
    paint();
  }

  function accept() {
    if (!state || state.active < 0) return false;
    const { ta, items, active } = state;
    const it = items[active];
    ta.value = it.value;
    try { ta.setSelectionRange(it.value.length, it.value.length); } catch (e) { /* not a text field */ }
    chainNext = !!it.chain;
    close();
    // The page's own input handler saves it and calls update() again,
    // which reopens for the next part when `chain` says so.
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  /** True when the key was the list's; the page must then do nothing. */
  function handleKey(e, ta) {
    if (!state || state.ta !== ta) return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const n = state.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      state.active = state.active < 0 ? (d > 0 ? 0 : n - 1) : (state.active + d + n) % n;
      paint();
      return true;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && state.active >= 0) {
      e.preventDefault();
      accept();
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return true;
    }
    return false;
  }

  return {
    update,
    handleKey,
    close,
    isOpen: () => !!state,
    noteEdit: (el) => index.noteEdit(el),
    invalidate: () => { index.invalidate(); close(); },
    _index: index
  };
}

export default { createSmartType, suggest, createIndex, parseHeading, cueName };
