/* ============================================================
   SPLIT VIEW — a second pane on the same script
   ------------------------------------------------------------
   Final Draft's split view: the script twice, side by side, each pane
   with its own scroll, so a writer can keep page 12 open while writing
   page 80. The left pane is the editor itself (src/ui/script-editor/,
   scrolling with the page); this is the right one, a sticky column with
   its own scroll box.

   ONE MODEL. Both panes edit `doc.elements`; nothing is copied, and
   this module stores nothing. A keystroke here writes the element's
   text, the line's edit stamp (`u`, for the co-editing merge), patches
   the left pane's row through the editor (patchRow) and saves through
   the page's ONE debounced save; a keystroke on the left is mirrored
   here at once. A structural edit anywhere (Return, a delete, a move,
   an undo, an import) rebuilds this pane on the next frame, keeping its
   scroll position. Each burst of typing here opens one history step
   (editor.checkpoint) so Ctrl/⌘+Z undoes it like any other edit.

   TEXT ONLY, ON PURPOSE. Return, Tab and type changes live in the main
   pane, where the flow tables and the one type path (setElementType)
   are; this pane takes words. Return here says so instead of silently
   splitting a line two ways.

   ITS FIELDS ARE NOT `.wr-text`. A dozen modules listen for input on
   `.wr-text` / `[data-el]` (SmartType, the alt-lines strip, presence,
   Tamil typing, the hand-off); a second set of those would fire them
   twice with a row they cannot find. Rows carry `data-split-el` and
   fields `.sc-split-text`, and screenplay.css gives them the page's
   look. It sits inside `.sc-sheet`, so the paper tokens apply.

   Desk only: at 1100px and over. Under that it is off (the page has
   no room for two Letter pages), and turning the window narrow while it
   is open closes it. On/off is memory only — no key, no pref write.
   ============================================================ */
import { h } from '../lib/dom.js';
import { typeLabel } from '../lib/script.js';
import { NATIVE_SIZING, autosizeMany, autosize } from './script-editor/rows.js';
import '../styles/script-tools.css';

export const SPLIT_QUERY = '(min-width: 1100px)';

export function mountSplit({ getDoc, editor, persist, onEdit, say }) {
  const ac = new AbortController();
  const signal = ac.signal;
  const mq = typeof matchMedia === 'function' ? matchMedia(SPLIT_QUERY) : null;
  let on = false;
  let pane = null;
  let page = null;
  let frame = 0;
  let burst = null;              // the element id the current typing burst is on

  const els = () => (getDoc() && getDoc().elements) || [];
  const sheet = () => document.getElementById('screenplay');
  const fieldOf = (id) => page && page.querySelector('[data-split-el="' + CSS.escape(String(id)) + '"] .sc-split-text');

  function row(el, i) {
    const ta = h('textarea.sc-split-text', {
      rows: '1', spellcheck: 'true',
      'aria-label': typeLabel(el.type) + ', element ' + (i + 1) + ' (second view)'
    });
    ta.value = el.text || '';
    return h('article.wr-el.sc-split-el.t-' + el.type, { 'data-split-el': el.id }, [ta]);
  }
  function build() {
    if (!pane) return;
    const keep = pane.scrollTop;
    const list = els();
    page = h('div.wr-page.is-pageview.sc-split-page');
    const CH = 64;
    for (let k = 0; k < list.length; k += CH) {
      page.append(h('div.wr-chunk', {}, list.slice(k, k + CH).map((el, j) => row(el, k + j))));
    }
    pane.replaceChildren(h('p.sc-split-cap', { text: 'Second view · words only; Return and line types are in the main page' }), page);
    pane.scrollTop = keep;
    /* Where field-sizing is not supported the fields are measured, as
       the editor's are (rows.js), once laid out. */
    if (!NATIVE_SIZING) requestAnimationFrame(() => { if (page) autosizeMany(Array.from(page.querySelectorAll('.sc-split-text'))); });
  }
  function rebuildSoon() {
    if (!on || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (on) build(); });
  }

  function setOn(want) {
    const can = !mq || mq.matches;
    const next = !!want && can;
    if (want && !can) { if (say) say('Split view needs a wider window (1100px or more).'); }
    if (next === on) return on;
    on = next;
    const host = sheet();
    if (on) {
      pane = h('aside.sc-split', { 'aria-label': 'Second view of the script', tabindex: '-1' });
      if (host) { host.append(pane); host.classList.add('is-split'); }
      build();
    } else {
      if (host) host.classList.remove('is-split');
      if (pane) pane.remove();
      pane = null; page = null;
    }
    return on;
  }

  /* The page re-renders the sheet (an import, a draft opened, a synced
     copy taken): put the pane back in the new sheet. */
  function reattach() {
    if (!on) return;
    const host = sheet();
    if (!host) return;
    if (!pane || !host.contains(pane)) {
      pane = pane || h('aside.sc-split', { 'aria-label': 'Second view of the script', tabindex: '-1' });
      host.append(pane);
    }
    host.classList.add('is-split');
    rebuildSoon();
  }

  /* ---- this pane → the model (and the main pane) --------------- */
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches && e.target.matches('.sc-split-text')) burst = null;
  }, { signal });
  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!ta || !ta.matches || !ta.matches('.sc-split-text')) return;
    const id = ta.closest('[data-split-el]')?.dataset.splitEl;
    const el = id && els().find((x) => x.id === id);
    if (!el) return;
    if (burst !== id) { editor.checkpoint('edit'); burst = id; }
    el.text = ta.value;
    el.u = Date.now();
    if (!NATIVE_SIZING) autosize(ta);
    editor.patchRow(id);
    persist();
    if (onEdit) onEdit(id);
  }, { signal });
  document.addEventListener('keydown', (e) => {
    const ta = e.target;
    if (!ta || !ta.matches || !ta.matches('.sc-split-text')) return;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (say) say('Return, Tab and line types work in the main page; this view takes words.');
    }
    if (e.key === 'Escape') { e.preventDefault(); setOn(false); if (say) say('Split view off.'); }
  }, { signal });

  /* ---- the main pane → this pane -------------------------------- */
  document.addEventListener('input', (e) => {
    if (!on || !e.target || !e.target.matches || !e.target.matches('#wr-page .wr-text')) return;
    const id = e.target.closest('[data-el]')?.dataset.el;
    const f = id && fieldOf(id);
    if (f && f.value !== e.target.value) { f.value = e.target.value; if (!NATIVE_SIZING) autosize(f); }
  }, { signal });
  const offChange = editor.on('change', (d) => { if (d && d.kind === 'structure') rebuildSoon(); });
  const offType = editor.on('type', () => rebuildSoon());

  if (mq) {
    const narrow = () => { if (on && !mq.matches) { setOn(false); if (say) say('Split view closed: the window is too narrow for two pages.'); } };
    if (mq.addEventListener) mq.addEventListener('change', narrow, { signal });
  }

  return {
    setOn,
    toggle: () => setOn(!on),
    isOn: () => on,
    reattach,
    refresh: rebuildSoon,
    destroy() { ac.abort(); offChange(); offType(); setOn(false); }
  };
}

export default { mountSplit, SPLIT_QUERY };
