/* ============================================================
   SCRIPT EDITOR — the typed element list, as a mountable editor
   ------------------------------------------------------------
   Moved out of src/pages/write.js with no behaviour change, so the
   same editor can be mounted by another page. The page keeps the
   model and the save path; the editor is handed both and never
   invents its own:

     const ed = mountEditor(document, {
       getDoc,              // () => the script model ({ elements, … })
       persist, persistNow, // the page's ONE debounced save, and its flush
       render,              // (focusSelector) => the page's full render
       canPatch,            // () => false while something sits between rows
       refreshCounters,     // DOM-only counters, after an edit
       scheduleDerived,     // idle work after an edit (offers, page view, sync)
       smart,               // createSmartType() instance
       getPrefs, known,     // write-keys prefs and the known type ids
       say, toast           // a status line, an actionable toast
     });
     page.append(ed.renderPage({ pageView, afterRow }));

   THE SAVE LOOP RULES STILL HOLD (CLAUDE.md, verify's idle check):
   rendering never writes; every write starts at a user event; typing
   goes through persist(), structure through persistNow(). Return
   PATCHES the rows it touches rather than re-rendering (C2 in the UX
   audit); only a pairing change falls back to the page's render.

   ONE type-change path: setElementType(). The select, Alt/Ctrl+digit,
   Tab, Shift+Tab and Return on an empty line all arrive there.
   ============================================================ */
import { delegate } from '../../lib/dom.js';
import { askDanger } from '../dialog.js';
import { typeLabel, blankElement, canPairDual, withContd, contdOffer } from '../../lib/script.js';
import Keys from '../../lib/write-keys.js';
import {
  PLACEHOLDER, elFocus, renderElement, rowActs, buildPage, dualSignature,
  allRows as rowsIn, tidyRun, reindexRows as reindexIn,
  NATIVE_SIZING, autosizeMany, autosize
} from './rows.js';
import { wireKeys, splitAt } from './keys.js';
import { createInference } from './inference.js';
import { wantsSplit, planPaste } from '../../lib/script-paste.js';

export { elFocus, PLACEHOLDER, CHUNK, iconBtn, field, setAttr, autosize } from './rows.js';

const ONE_LINE = new Set(['scene', 'character', 'transition']);

export function mountEditor(host, opts) {
  const root = host || document;
  const ac = new AbortController();
  const signal = ac.signal;
  const o = opts;
  const els = () => o.getDoc().elements;
  const listeners = new Map();
  const emit = (name, detail) => {
    (listeners.get(name) || []).forEach((fn) => { try { fn(detail); } catch (e) { console.warn('[script-editor]', e); } });
    if (name === 'change' && typeof o.onChange === 'function') o.onChange(detail);
  };
  const persist = () => { o.persist(); emit('change', { kind: 'text' }); };
  const persistNow = () => { o.persistNow(); emit('change', { kind: 'structure' }); };
  const render = (focus) => o.render(focus);
  const smart = o.smart;
  /* false on the writing-only page: no per-row select or icon buttons. */
  const rowChrome = o.rowChrome !== false;
  // INT./EXT., ALL CAPS + Return and the Fountain marks; see inference.js.
  const inference = createInference({
    getElements: () => els(),
    setElementType: (i, t) => setElementType(i, t)
  });

  /* Which dual-dialogue pairs the page was last BUILT with. A patch that
     changes the pairing (a line inserted inside a pair, a flag whose
     speech above it was just deleted) cannot be patched row by row; it
     falls back to a render, and this is how it knows. */
  let dualRendered = '';

  const idOf = (el, attr) => el.closest(`[data-${attr}]`)?.dataset[attr];
  const indexOfEl = (id) => els().findIndex((e) => e.id === id);

  /* ---- the page ------------------------------------------------ */
  function renderPage({ pageView = false, afterRow } = {}) {
    dualRendered = dualSignature(els());
    return buildPage(els(), { pageView, afterRow, rowChrome });
  }

  /* A structural edit PATCHES the page rather than rebuilding it. On a
     feature-length script a full render is thousands of rows of DOM, and
     Return is a key people press every few seconds; rebuilding the lot
     for one new row is what made this page freeze (C2 in the UX audit).

     So add, delete and move touch the affected row(s) and nothing else,
     then bring the cheap derived state into step: each row's ordinal in
     its aria-labels, the first row's dead ↑ and the last row's dead ↓,
     and the counters. The model and the save path are exactly as before —
     the splice and `persistNow()` happen first, and the DOM follows.

     It falls back to a full render whenever a patch would have to know
     more than one row: the empty state (no page to patch), the header's
     "element"/"elements" switching at one, and whatever the page says
     through canPatch() (an open import preview, an open pass panel).
     All rare; none of them is Return.

     The rows live in runs (`.wr-chunk`). A patch puts a new row in the
     run of the row above it, splits a run that has grown to twice its
     size, and drops a run left empty; a full render re-deals them. */
  const pageNode = () => document.getElementById('wr-page');
  const rowOf = (id) => {
    const page = pageNode();
    return page ? page.querySelector(`[data-el="${CSS.escape(String(id))}"]`) : null;
  };
  const allRows = () => rowsIn(pageNode());
  const reindexRows = (from, to) => reindexIn(pageNode(), els(), from, to);

  /** A structural patch is only safe outside a dual pair. Inside one, or
      when the edit changed which speeches pair, the page is rebuilt. */
  function dualNeedsRender(...nodes) {
    if (dualSignature(els()) !== dualRendered) return true;
    return nodes.some((n) => n && n.closest && n.closest('.wr-dual'));
  }

  function patchable(lenBefore, lenAfter) {
    return lenBefore >= 2 && lenAfter >= 2 && (o.canPatch ? o.canPatch() : true) && !!pageNode();
  }

  /* The ordinals of every row BELOW an insertion or a deletion are one
     out until this runs. They are only words in an aria-label — the
     arrows at either end are fixed synchronously — so they are brought
     back in step once the browser is idle, not inside the keystroke. */
  let reindexFrom = Infinity;
  let reindexTask = 0;
  function reindexLater(from) {
    reindexFrom = Math.min(reindexFrom, Math.max(0, from));
    if (reindexTask) return;
    const run = () => {
      reindexTask = 0;
      const start = reindexFrom;
      reindexFrom = Infinity;
      if (start !== Infinity) reindexRows(start);
    };
    reindexTask = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 1000 })
      : setTimeout(run, 200);
  }

  /* ---- focus ---------------------------------------------------- */
  function applyFocus(sel) {
    const node = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!node) return;
    /* A row in a run the browser is skipping (off screen, see write.css)
       has a placeholder height, and the page scrolls smoothly — so a
       focus() aimed at it plans its scroll against the placeholders and
       stops thousands of pixels short. Bring that row into view first,
       instantly, which lays its run out for real; then focus as before. */
    if (typeof node.checkVisibility === 'function'
        && !node.checkVisibility({ contentVisibilityAuto: true })
        && node.closest('.wr-chunk')) {
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    node.focus();
    if (typeof node.setSelectionRange === 'function' && typeof node.value === 'string') {
      try { node.setSelectionRange(node.value.length, node.value.length); } catch (e) { /* select */ }
    }
    keepInView(node);
  }
  /* The line being typed stays clear of the chip bar and the phone's
     bottom bar (WCAG 2.4.11). html's scroll-padding-bottom (screenplay.css,
     from the measured --sc-chips-h and --mab-h) says how much the bottom
     covers; 'nearest' is a no-op when the line is already clear. INSTANT,
     never 'auto': the page has scroll-behavior: smooth, and 'auto' means
     "use it", so every keystroke would start an animation. */
  function keepInView(node) {
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  /* ---- sizing (fallback only; see rows.js) ---------------------
     The elements are `overflow: hidden`, so a height measured against the
     wrong font clips the text and there is no scrollbar to say so. The
     script face is a webfont: the first measurement happens before it
     arrives, every line then gets wider, and a four-line action block
     renders as three. So measure again once the fonts are in, and again
     whenever the column changes width — the indents are percentages, so a
     resize genuinely does change how many lines a block takes. (Only the
     fallback path needs any of this; field-sizing re-flows by itself.) */
  function autosizeAll() {
    if (NATIVE_SIZING) return;
    autosizeMany(Array.from(document.querySelectorAll('.wr-text')));
  }
  if (!NATIVE_SIZING && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (!signal.aborted) autosizeAll(); }).catch(() => {});
  }
  let resizeFrame = 0;
  if (!NATIVE_SIZING) {
    addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(autosizeAll);
    }, { signal });
  }

  /* ---- structure ------------------------------------------------ */
  function addElement(after, type, text = '') {
    const list = els();
    const el = blankElement({ type, text });
    const lenBefore = list.length;
    const at = after === null ? lenBefore : after + 1;
    list.splice(at, 0, el);
    persistNow();
    if (!patchable(lenBefore, list.length)) { render(elFocus(el.id)); return; }

    const row = renderElement(el, at, list.length, list, rowChrome);
    const prev = at > 0 ? rowOf(list[at - 1].id) : null;
    const next = list[at + 1] ? rowOf(list[at + 1].id) : null;
    if (!prev && !next) { render(elFocus(el.id)); return; }
    if (dualNeedsRender(prev, next)) { render(elFocus(el.id)); return; }
    // Into the run of the row above, straight after it — or, for a new
    // first element, in front of the old one.
    if (prev) prev.after(row);
    else next.before(row);
    tidyRun(row.parentElement);
    autosize(row.querySelector('.wr-text'));
    reindexRows(at - 1, at);
    reindexLater(at + 1);
    o.refreshCounters();
    applyFocus(row.querySelector('.wr-text'));
    o.scheduleDerived();
  }

  /** Split element `i` at the caret: the head stays, the tail becomes a
   *  new element straight after it — the same type, except after a
   *  one-line type, where it takes `flowType` (Return's usual next). */
  function splitElement(i, ta, flowType) {
    const at = splitAt(ta);
    const el = els()[i];
    if (!at || !el) return;
    const head = ta.value.slice(0, at.a).replace(/\s+$/, '');
    const tail = ta.value.slice(at.b).replace(/^\s+/, '');
    el.text = head;
    ta.value = head;
    autosize(ta);
    addElement(i, ONE_LINE.has(el.type) && flowType ? flowType : el.type, tail);
    const next = document.activeElement;
    if (next && next.matches && next.matches('.wr-text')) {
      try { next.setSelectionRange(0, 0); } catch (e) { /* not a text field */ }
    }
  }

  /** Take element `i` out, and put the caret in `neighbourOf(i)`. */
  function removeElement(i, neighbourOf) {
    const list = els();
    const lenBefore = list.length;
    const [gone] = list.splice(i, 1);
    persistNow();
    const neighbour = neighbourOf(i);
    if (!patchable(lenBefore, list.length)) {
      render(neighbour ? elFocus(neighbour.id) : null);
      return;
    }
    const row = rowOf(gone.id);
    if (dualNeedsRender(row)) {
      render(neighbour ? elFocus(neighbour.id) : null);
      return;
    }
    if (row) {
      const run = row.parentElement;
      row.remove();
      tidyRun(run);
    }
    reindexRows(i - 1, i);
    reindexLater(i + 1);
    o.refreshCounters();
    if (neighbour) applyFocus(elFocus(neighbour.id));
    o.scheduleDerived();
  }

  function moveElement(id, delta) {
    const list = els();
    const i = indexOfEl(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    persistNow();
    const len = list.length;
    const mine = rowOf(id);
    const theirs = rowOf(list[i].id);   // the one it swapped with
    if (!patchable(len, len) || !mine || !theirs || dualNeedsRender(mine, theirs)) { render(elFocus(id)); return; }
    // Whichever row now comes first goes in front of the other.
    // Across a run boundary this moves a row from one run to the next,
    // which can leave a run of one empty.
    const runs = [mine.parentElement, theirs.parentElement];
    if (delta < 0) theirs.before(mine);
    else mine.before(theirs);
    runs.forEach(tidyRun);
    reindexRows(Math.min(i, j), Math.max(i, j));
    applyFocus(elFocus(id));
    o.scheduleDerived();
  }

  /** Change element i's type in place: the model, the row's class, the
      select, the placeholder and the label. One path for the select,
      Alt/Ctrl+number, Tab, Shift+Tab and Return on an empty line. */
  function setElementType(i, type) {
    const list = els();
    if (i < 0 || !list[i]) return;
    const row = rowOf(list[i].id);
    const el = list[i];
    inference.noteTypeChange(el.id);
    el.type = type;
    // Only a cue can be the second half of a dual pair (Phase 1).
    if (type !== 'character') delete el.dual;
    if (row && dualNeedsRender(row)) {
      // A pair is two speeches in two columns: more than one row's patch.
      persistNow();
      smart.invalidate();
      render(`[data-el="${el.id}"] .wr-text`);
      emit('type', { id: el.id, type });
      return;
    }
    if (row) {
      // Swap only the t-* class, so a class another feature put on the
      // row (has-ai, a dual mark) survives a type change.
      row.classList.forEach((c) => { if (c.startsWith('t-')) row.classList.remove(c); });
      row.classList.add('t-' + type);
      const sel = row.querySelector('select[data-el-field="type"]');
      if (sel && sel.value !== type) sel.value = type;
      const ta = row.querySelector('.wr-text');
      if (ta) {
        ta.placeholder = PLACEHOLDER[type] || '';
        ta.setAttribute('aria-label', typeLabel(type) + ', element ' + (i + 1));
        autosize(ta);
      }
      // The buttons depend on the type: ◇ on a speech, ⇄ and CONT'D on a cue.
      const acts = row.querySelector('.wr-el-acts');
      if (acts) acts.replaceWith(rowActs(el, i, list.length, list));
    }
    smart.invalidate();
    o.refreshCounters();
    persistNow();
    o.scheduleDerived();
    emit('type', { id: el.id, type });
  }

  /* DUAL DIALOGUE (Alt+D). Toggles the flag on the cue this speech
     belongs to — the same path as the ⇄ button on the cue's row, so the
     key and the click cannot disagree about when a pair is allowed or
     how the page redraws it. */
  function toggleDual(i) {
    const list = els();
    let c = i;
    while (c >= 0 && list[c].type !== 'character') {
      const t = list[c].type;
      if (t !== 'dialogue' && t !== 'paren') { c = -1; break; }
      c--;
    }
    if (c < 0) { o.say('Dual dialogue goes on a character cue — put the caret in one first.'); return; }
    const cue = list[c];
    if (cue.dual === true) delete cue.dual;
    else {
      if (!canPairDual(list, c)) {
        o.say('Dual dialogue sets this speech beside the one directly above it, and there is no speech directly above this cue.');
        return;
      }
      cue.dual = true;
    }
    persistNow();
    render(`[data-el="${cue.id}"] .wr-text`);
    o.say(cue.dual ? 'Dual dialogue: the two speeches now sit side by side.' : 'Dual dialogue off.');
  }

  /** Show or hide each cue's "+ CONT'D" as the script now reads. */
  function refreshCueOffers() {
    const list = els();
    const rows = allRows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.classList.contains('t-character')) continue;
      const btn = row.querySelector('.wr-contd');
      if (!btn) continue;
      const el = list[i];
      const want = !!el && el.id === row.dataset.el && contdOffer(list, i);
      if (btn.hidden === want) btn.hidden = !want;
    }
  }

  /** Bring one row's text back in step with the model (a rename, a
      change made elsewhere). DOM only. */
  function patchRow(id) {
    const i = indexOfEl(id);
    const ta = rowOf(id)?.querySelector('.wr-text');
    if (!ta) return;
    if (i >= 0 && ta.value !== els()[i].text) ta.value = els()[i].text;
    autosize(ta);
  }

  /* ---- events: delegated, no inline handlers -------------------- */
  const on = (type, sel, fn, extra) => delegate(root, type, sel, fn, { ...(extra || {}), signal });

  on('click', '[data-action="el-first"]', () => addElement(null, 'scene'));
  on('click', '[data-action="el-add"]', () => {
    const list = els();
    const last = list[list.length - 1];
    addElement(null, last ? Keys.returnNext(last.type, o.getPrefs(), o.known()) : 'scene');
  });
  on('click', '[data-action="el-up"]', (e, btn) => moveElement(idOf(btn, 'el'), -1));
  on('click', '[data-action="el-down"]', (e, btn) => moveElement(idOf(btn, 'el'), 1));
  on('click', '[data-action="el-del"]', async (e, btn) => {
    const id = idOf(btn, 'el');
    let i = indexOfEl(id);
    if (i < 0) return;
    const el = els()[i];
    // Only ask when there is something to lose. A confirm on an empty
    // element is the dialog people learn to click through.
    if (el.text.trim()
        && !(await askDanger({ title: `Delete this ${typeLabel(el.type).toLowerCase()}?`, body: '“' + el.text.trim().slice(0, 80) + '”', confirm: 'Delete' }))) return;
    i = indexOfEl(id);   // the document may have moved while the dialog was open
    if (i < 0) return;
    removeElement(i, (k) => els()[k] || els()[k - 1]);
  });

  /* Typing updates the model and the counters; it does not re-render,
     because a re-render takes the caret with it. */
  on('input', '.wr-text[data-el-field="text"]', (e, ta) => {
    const i = indexOfEl(idOf(ta, 'el'));
    if (i < 0) return;
    const el = els()[i];
    el.text = ta.value;
    inference.onInput(i, ta);
    autosize(ta);
    keepInView(ta);
    o.refreshCounters();
    persist();
    smart.noteEdit(el);
    smart.update(ta, el);
    o.scheduleDerived();
  });
  on('focusout', '.wr-text[data-el-field="text"]', () => smart.close());

  /* PASTE. A line is a textarea, so a native paste of several paragraphs
     made ONE element of the lot — a heading holding a whole scene, and a
     Breakdown row with that scene as its location (QA). A paste that
     needs it (src/lib/script-paste.js) is split into elements with the
     same parser the Import dialog's paste box uses, loaded at the paste.
     The default is cancelled synchronously; the selection is read now,
     because the parser arrives a tick later. */
  on('paste', '.wr-text[data-el-field="text"]', (e, ta) => {
    const raw = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const i0 = indexOfEl(idOf(ta, 'el'));
    if (i0 < 0 || !wantsSplit(els()[i0].type, raw)) return;
    e.preventDefault();
    const id = els()[i0].id;
    const line = { type: els()[i0].type, before: ta.value.slice(0, ta.selectionStart), after: ta.value.slice(ta.selectionEnd) };
    const text = raw.replace(/\r\n?/g, '\n');
    import('../../lib/script-import.js')
      .then((P) => { try { return P.parseScript(text, '').elements; } catch (err) { return null; } })
      .catch(() => null)
      .then((parsed) => {
        const i = indexOfEl(id);
        if (i < 0) return;
        const plan = planPaste(line, parsed, text);
        const el = els()[i];
        if (plan.type !== el.type) { inference.noteTypeChange(el.id); el.type = plan.type; if (plan.type !== 'character') delete el.dual; }
        el.text = plan.text;
        const made = plan.insert.map((x) => blankElement({ type: x.type, text: x.text }));
        els().splice(i + 1, 0, ...made);
        if (smart && smart.invalidate) smart.invalidate();
        persistNow();
        render(elFocus((made[made.length - 1] || el).id));
        o.refreshCounters();
        o.scheduleDerived();
        if (made.length) o.say('Pasted as ' + (made.length + 1) + ' lines.');
      });
  });

  /* A type change moves the element across the page, so the row's class
     changes — but re-rendering the whole section would cost the focus the
     user still has on the select. Swap the class in place instead. */
  on('change', 'select[data-el-field="type"]', (e, sel) => {
    const row = sel.closest('[data-el]');
    setElementType(indexOfEl(row?.dataset.el), sel.value);
  });

  /* ---- dual dialogue and (CONT'D) -----------------------------
     Both are clicks on a cue's own row. The toggle rebuilds the page —
     a pair is two speeches moving into two columns, which is more than
     one row's patch — and is rare enough that it may. The (CONT'D) is
     four words added to one textarea and patches that one row. */
  on('click', '[data-action="el-dual"]', (e, btn) => {
    const id = idOf(btn, 'el');
    const i = indexOfEl(id);
    if (i < 0) return;
    const list = els();
    const el = list[i];
    if (el.dual === true) delete el.dual;
    else {
      if (!canPairDual(list, i)) {
        o.say('Dual dialogue sets this speech beside the one directly above it, and there is no speech directly above this cue.');
        return;
      }
      el.dual = true;
    }
    persistNow();
    render(`[data-el="${id}"] [data-action="el-dual"]`);
    o.say(el.dual ? 'Dual dialogue: the two speeches now sit side by side.' : 'Dual dialogue off.');
  });

  on('click', '[data-action="el-contd"]', (e, btn) => {
    const id = idOf(btn, 'el');
    const i = indexOfEl(id);
    if (i < 0) return;
    const el = els()[i];
    el.text = withContd(el.text);
    const ta = rowOf(id)?.querySelector('.wr-text');
    if (ta) { ta.value = el.text; autosize(ta); }
    btn.hidden = true;
    persistNow();
    o.refreshCounters();
    o.scheduleDerived();
    if (ta) applyFocus(ta);
  });

  const api = {
    getElements: els,
    indexOf: indexOfEl,
    renderPage,
    rerender: render,
    /** By id (or by index, when handed a number). The one type path. */
    setElementType: (idOrIndex, type) =>
      setElementType(typeof idOrIndex === 'number' ? idOrIndex : indexOfEl(idOrIndex), type),
    addElement,
    splitElement,
    removeElement,
    moveElement,
    toggleDual,
    patchRow,
    refreshCueOffers,
    applyFocus,
    focusEl: (id) => applyFocus(elFocus(id)),
    scrollToEl: (id) => {
      const row = rowOf(id);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'instant' });
    },
    autosize,
    autosizeAll,
    allRows,
    rowOf,
    pageNode,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => listeners.set(name, (listeners.get(name) || []).filter((f) => f !== fn));
    },
    destroy() { ac.abort(); listeners.clear(); }
  };

  /* The keyboard: Return / Tab / Shift+Tab / Alt+digit / Alt+D, the
     navigator, a note on a line, and Backspace on an empty line. */
  wireKeys(root, api, {
    ...o,
    persistNow,
    idOf,
    inference,
    setElementTypeAt: setElementType,
    signal
  });

  return api;
}
