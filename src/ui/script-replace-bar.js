/* ============================================================
   FIND AND REPLACE BAR — the screenplay's, under its top bar.
   ------------------------------------------------------------
   The matching is src/lib/script-replace.js (pure). This file is the
   view: a row inside #scTop with the two fields, Match case and Whole
   word, a count, previous / next, Replace and Replace all.

   A match cannot be painted inside a <textarea>, so the bar marks the
   ROW: every line holding a match gets `.sc-find-row`, the current one
   `.sc-find-cur`, and next / previous scroll it into view (instantly:
   the page scrolls smoothly, and a glide through a 120-page script
   lands short). Esc closes the bar and puts the caret on the current
   match with it selected, which is where a writer wants to be.

   Every write is one model change, one persistNow() and the page's
   after-edit refresh. Replace all is undoable: the toast's Undo puts
   back each line's text as it was, by id, and leaves alone a line that
   has been edited since (counted, and said). It writes no new key and
   stores nothing of its own; the search is in memory for the visit.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { button } from './kit/index.js';
import { findMatches, replaceAll, replaceOne } from '../lib/script-replace.js';

/**
 * o = {
 *   editor,        the script editor (rowOf, scrollToEl, patchRow, applyFocus)
 *   getDoc,        () => the script blob ({ elements })
 *   persistNow,    () => save now
 *   afterChange,   () => the page's refresh after an edit (counts, scene sync)
 *   toast,         (msg, opts) => { dismiss }
 *   host,          () => the element the bar goes in (#scTop)
 * }
 */
export function mountReplaceBar(o) {
  const st = { q: '', repl: '', matchCase: false, wholeWord: false, hits: [], cur: -1 };
  let bar = null, findIn = null, replIn = null, countNode = null, caseBox = null, wordBox = null;
  let marked = [];
  let recomputeTimer = 0;
  const els = () => (o.getDoc() || {}).elements || [];
  const opts = () => ({ matchCase: st.matchCase, wholeWord: st.wholeWord });

  function build() {
    findIn = h('input.sc-find-in', { id: 'scFindQ', type: 'search', placeholder: 'Find', 'aria-label': 'Find', autocomplete: 'off', spellcheck: 'false' });
    replIn = h('input.sc-find-in', { id: 'scFindR', type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with', autocomplete: 'off', spellcheck: 'false' });
    caseBox = h('input', { id: 'scFindCase', type: 'checkbox' });
    wordBox = h('input', { id: 'scFindWord', type: 'checkbox' });
    countNode = h('span.sc-find-count', { role: 'status', 'aria-live': 'polite', text: '' });
    bar = h('div#scFind.sc-find', { role: 'search', 'aria-label': 'Find and replace in the screenplay', hidden: true }, [
      h('div.sc-find-fields', {}, [findIn, replIn]),
      h('div.sc-find-opts', {}, [
        h('label.sc-find-opt', { for: 'scFindCase' }, [caseBox, h('span', { text: 'Match case' })]),
        h('label.sc-find-opt', { for: 'scFindWord' }, [wordBox, h('span', { text: 'Whole word' })])
      ]),
      h('div.sc-find-acts', {}, [
        countNode,
        button({ label: 'Previous match', icon: 'expand_less', iconOnly: true, variant: 'ghost', size: 'sm', action: 'sc-find-prev' }),
        button({ label: 'Next match', icon: 'expand_more', iconOnly: true, variant: 'ghost', size: 'sm', action: 'sc-find-next' }),
        button({ label: 'Replace', variant: 'secondary', size: 'sm', action: 'sc-find-one' }),
        button({ label: 'Replace all', variant: 'secondary', size: 'sm', action: 'sc-find-all' })
      ]),
      button({ label: 'Close find and replace', icon: 'close', iconOnly: true, variant: 'ghost', size: 'sm', action: 'sc-find-close', class: 'sc-find-x' })
    ]);
    findIn.addEventListener('input', () => { st.q = findIn.value; recompute(true); });
    replIn.addEventListener('input', () => { st.repl = replIn.value; });
    caseBox.addEventListener('change', () => { st.matchCase = caseBox.checked; recompute(true); });
    wordBox.addEventListener('change', () => { st.wholeWord = wordBox.checked; recompute(true); });
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Enter' && e.target === findIn) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
      if (e.key === 'Enter' && e.target === replIn) { e.preventDefault(); replaceCurrent(); }
    });
  }

  function ensureIn() {
    const host = o.host();
    if (!bar) build();
    if (host && bar.parentNode !== host) host.append(bar);
    return !!host;
  }

  /* ---- matches and marks (DOM only) -------------------------------- */
  function unmark() {
    for (const row of marked) row.classList.remove('sc-find-row', 'sc-find-cur');
    marked = [];
  }
  function mark() {
    unmark();
    const seen = new Set();
    st.hits.forEach((hit) => {
      if (seen.has(hit.id)) return;
      seen.add(hit.id);
      const row = o.editor.rowOf(hit.id);
      if (row) { row.classList.add('sc-find-row'); marked.push(row); }
    });
    const cur = st.hits[st.cur];
    const row = cur && o.editor.rowOf(cur.id);
    if (row) row.classList.add('sc-find-cur');
  }
  function say() {
    const n = st.hits.length;
    const t = !st.q ? '' : n ? (st.cur + 1) + ' of ' + n : 'No matches';
    if (countNode.textContent !== t) countNode.textContent = t;
  }
  /* keepPlace: after a replace, stay at the same position in the list
     (which is now the next match); after a new search, start from the
     match nearest the caret's line. */
  function recompute(fresh, keepPlace) {
    const before = st.cur;
    st.hits = findMatches(els(), st.q, opts());
    if (!st.hits.length) st.cur = -1;
    else if (keepPlace) st.cur = Math.min(Math.max(before, 0), st.hits.length - 1);
    else if (fresh || st.cur < 0 || st.cur >= st.hits.length) st.cur = nearestTo(st.from);
    mark();
    say();
    if (fresh && st.cur >= 0) reveal();
  }
  function nearestTo(id) {
    if (!id) return 0;
    const at = els().findIndex((e) => e.id === id);
    const k = st.hits.findIndex((hit) => hit.index >= at);
    return k < 0 ? 0 : k;
  }
  function reveal() {
    const hit = st.hits[st.cur];
    if (hit) o.editor.scrollToEl(hit.id);
  }
  function step(d) {
    if (!st.hits.length) return;
    st.cur = (st.cur + d + st.hits.length) % st.hits.length;
    mark();
    say();
    reveal();
  }

  /* ---- writing ------------------------------------------------------ */
  function apply(changes) {
    const list = els();
    for (const c of changes) {
      const el = list.find((e) => e.id === c.id);
      if (!el) continue;
      el.text = c.after;
      o.editor.patchRow(c.id);
    }
    o.persistNow();
    o.afterChange();
  }
  function replaceCurrent() {
    const hit = st.hits[st.cur];
    if (!hit) return;
    const c = replaceOne(els(), hit, st.q, st.repl, opts());
    if (!c) { recompute(false); return; }
    apply([c]);
    recompute(false, true);
    reveal();
  }
  let undoToast = null;
  function replaceEverything() {
    if (!st.q) return;
    const { changes, count } = replaceAll(els(), st.q, st.repl, opts());
    if (!count) { say(); return; }
    apply(changes);
    recompute(false, true);
    if (undoToast) { try { undoToast.dismiss(); } catch (e) { /* gone */ } }
    const lines = changes.length;
    try {
      undoToast = o.toast('Replaced ' + count + (count === 1 ? ' match' : ' matches') + ' in ' + lines + (lines === 1 ? ' line.' : ' lines.'), {
        type: 'info', action: 'Undo',
        onAction: () => {
          undoToast = null;
          const list = els();
          const back = [];
          let skipped = 0;
          for (const c of changes) {
            const el = list.find((e) => e.id === c.id);
            if (!el) continue;
            if (el.text !== c.after) { skipped++; continue; }
            back.push({ id: c.id, before: c.after, after: c.before });
          }
          if (back.length) apply(back);
          if (bar && !bar.hidden) recompute(false, true);
          if (skipped) {
            try { o.toast(skipped + (skipped === 1 ? ' line was' : ' lines were') + ' edited after the replace and kept as they are now.', { type: 'info' }); } catch (e) { /* chrome may not be up */ }
          }
        }
      });
    } catch (e) { /* chrome may not be up */ }
  }

  /* ---- open / close ------------------------------------------------- */
  function open(fromId) {
    if (!ensureIn()) return;
    st.from = fromId || null;
    /* Seed the field with a one-line selection in the current line. */
    const ta = document.activeElement;
    if (ta && ta.matches && ta.matches('.wr-text') && ta.selectionEnd > ta.selectionStart) {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel && !sel.includes('\n') && sel.length <= 80) { findIn.value = sel; st.q = sel; }
    }
    bar.hidden = false;
    findIn.focus();
    findIn.select();
    recompute(true);
  }
  function close(toMatch) {
    if (!bar || bar.hidden) return;
    const hit = st.hits[st.cur];
    bar.hidden = true;
    unmark();
    if (toMatch && hit) {
      const ta = o.editor.rowOf(hit.id)?.querySelector('.wr-text');
      if (ta) {
        o.editor.applyFocus(ta);
        try { ta.setSelectionRange(hit.start, hit.end); } catch (e) { /* select */ }
      }
    }
  }
  const isOpen = () => !!bar && !bar.hidden;

  delegate(document, 'click', '[data-action="sc-find-prev"]', () => step(-1));
  delegate(document, 'click', '[data-action="sc-find-next"]', () => step(1));
  delegate(document, 'click', '[data-action="sc-find-one"]', () => replaceCurrent());
  delegate(document, 'click', '[data-action="sc-find-all"]', () => replaceEverything());
  delegate(document, 'click', '[data-action="sc-find-close"]', () => close(false));
  document.addEventListener('fms:script-find', (e) => open(e.detail && e.detail.id));
  /* Typing in the script while the bar is open moves the matches. */
  document.addEventListener('input', (e) => {
    if (!isOpen() || !e.target || !e.target.matches || !e.target.matches('.wr-text')) return;
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => recompute(false), 150);
  }, { capture: true });

  return { open, close, isOpen };
}

export default { mountReplaceBar };
