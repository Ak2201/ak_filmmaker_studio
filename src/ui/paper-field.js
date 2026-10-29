/* ============================================================
   PAPER FIELDS — the one way a writing input becomes a page
   ------------------------------------------------------------
   Owner, 20 Oct 2026: every place somebody WRITES (story, beats, the
   Save the Cat beat sheet, characters, blueprint answers) is white
   paper with black Courier Prime, like the Screenplay Writer's page.
   The rest of the app stays dark. src/styles/paper-field.css has the
   look; this file is how a control or a container asks for it.

     paperTextarea(attrs)          h('textarea', attrs), on paper
     paperTextarea('#id.cls', a)   h('textarea#id.cls', a), on paper
     paperField(el)                an existing input / textarea → paper
     paperField(el, {script:false}) the same page in Onest, for notes / clippings
     paperScope(el)                every textarea inside el → paper,
                                   including ones added later (table
                                   rows) and raw blueprint markup

   Prose only. Settings, search, numbers, money, dates, selects and
   admin forms are NOT paper — do not reach for this there.
   `npm run test:paper` (scripts/check-paper-fields.mjs) fails a
   textarea built in a writing file that does not come through here.
   Nothing here touches a data-key, a value or storage: it adds a class.
   ============================================================ */
import { h } from '../lib/dom.js';
import '../styles/paper-field.css';

export const PAPER_CLASS = 'paper-field';
export const PAPER_SCOPE = 'paper-scope';
export const PAPER_SANS = 'paper-sans';

/** Mark an existing input or textarea as paper. Returns it (null-safe).
    `{ script: false }` is the interface-face variant: the same white
    page and black ink, set in Onest (--f-body) instead of Courier Prime.
    Use it for notes, clippings and vault entries, which are not
    screenplay text; every screenplay-shaped surface keeps the default. */
export function paperField(el, opts) {
  if (el && el.classList) {
    el.classList.add(PAPER_CLASS);
    if (opts && opts.script === false) el.classList.add(PAPER_SANS);
  }
  return el;
}

/** A textarea on paper: `paperTextarea(attrs)` or `paperTextarea('#id.cls', attrs, kids)`. */
export function paperTextarea(sel, attrs, kids) {
  const el = typeof sel === 'string'
    ? h('textarea' + sel, attrs || {}, kids)
    : h('textarea', sel || {}, attrs);
  return paperField(el);
}

/** Every textarea inside `el` is paper, now and later. Returns it. */
export function paperScope(el) {
  if (el && el.classList) el.classList.add(PAPER_SCOPE);
  return el;
}

/* A paper textarea that grows with its text. CSS `field-sizing: content`
   does it where it exists (the sheet that asks for it also sets the min
   and max); where it does not, this sets height from scrollHeight on
   every input and once after the element is laid out. Writes only
   style.height: no value, no class the gate reads, no storage. */
const GROW_CSS = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');
let growBound = false;
function fit(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px';
}
/** Make a textarea grow with its content. Returns it (null-safe). */
export function paperGrow(el) {
  if (!el || GROW_CSS) return el;
  el.dataset.paperGrow = '';
  if (!growBound && typeof document !== 'undefined') {
    growBound = true;
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('textarea[data-paper-grow]')) fit(t);
    });
  }
  requestAnimationFrame(() => { if (el.isConnected) fit(el); });
  return el;
}

export default { paperField, paperTextarea, paperScope, paperGrow, PAPER_CLASS, PAPER_SCOPE, PAPER_SANS };
