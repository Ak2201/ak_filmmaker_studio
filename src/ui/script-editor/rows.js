/* ============================================================
   SCRIPT EDITOR — the rows
   ------------------------------------------------------------
   The DOM for one typed element, and the runs (`.wr-chunk`) the
   rows are dealt into. Moved out of src/pages/write.js unchanged so
   a second page can mount the same editor (see editor.js).

   Everything here BUILDS or READS DOM from an element list it is
   handed. Nothing here touches storage, and nothing here holds
   state: the model is the caller's, passed in on every call.

   The hooks other modules key off are kept exactly: `.wr-el[data-el]`
   on the row, `.t-<type>` for its type, `.wr-text` on the textarea,
   `select[data-el-field="type"]` and `[data-el-field="text"]`.
   ============================================================ */
import { h } from '../../lib/dom.js';
import { ELEMENT_TYPES, typeLabel, dualPairs, contdOffer } from '../../lib/script.js';

/** Rows per run on the screenplay page; see buildPage(). */
export const CHUNK = 64;

export const PLACEHOLDER = {
  scene: 'INT. LOCATION — DAY',
  action: 'What we see.',
  character: 'CHARACTER',
  paren: 'quietly',
  dialogue: 'What they say.',
  transition: 'CUT TO:',
  shot: 'CLOSE ON —'
};

/** The selector that puts the caret in element `id`'s text. */
export const elFocus = (id) => `[data-el="${id}"] .wr-text`;

/* ---- small builders ---------------------------------------- */
export function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

export function field(spec, props, value) {
  const el = h(spec, props);
  if (value !== undefined) el.value = value;
  return el;
}

export function setAttr(node, name, value) {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** One element's row. `elements` is the whole list (the cue buttons
    read the speech before this one). */
export function renderElement(el, i, total, elements, rowChrome = true) {
  /* id=line-<element id>: the DOM target a screenplay.html#line-<id> link names
     (script-find.js lands on it too, for rows not yet drawn). */
  const row = h('article.wr-el.t-' + el.type, { 'data-el': el.id, id: 'line-' + el.id });

  const sel = h('select.wr-type', {
    'data-el-field': 'type',
    'aria-label': 'Element type for element ' + (i + 1)
  });
  ELEMENT_TYPES.forEach((t) => {
    const opt = h('option', { value: t.id, text: t.label });
    if (t.id === el.type) opt.selected = true;
    sel.append(opt);
  });

  const ta = field('textarea.wr-text', {
    rows: '1',
    spellcheck: 'true',
    'data-el-field': 'text',
    placeholder: PLACEHOLDER[el.type] || '',
    'aria-label': typeLabel(el.type) + ', element ' + (i + 1)
  }, el.text);

  /* The mark is built here, not by the lazy AI module, so that a line
     the model wrote is marked from the first paint of a cold load
     rather than three hundred milliseconds into it. A mark that
     arrives late is a mark somebody can miss. */
  if (el.aiPass) {
    row.classList.add('has-ai');
    row.append(h('div.wr-ai-tag', {}, [
      h('span.ai-mark', {
        title: 'This line was written by ' + (el.aiPass.model || 'a model')
             + ' and accepted by you. Undo puts your own words back.',
        text: 'AI PASS'
      }),
      h('button.ai-undo', {
        type: 'button', 'data-action': 'pass-undo',
        title: 'Put back the line you wrote',
        text: 'Undo'
      })
    ]));
  }

  // rowChrome:false is the writing-only page: the line is the whole row;
  // its type lives in the page's one dropdown, its actions in a menu.
  if (rowChrome) row.append(sel, ta, rowActs(el, i, total, elements));
  else row.append(ta);
  return row;
}

/** A row's buttons. Built per type, so a type change rebuilds them. */
export function rowActs(el, i, total, elements) {
  return h('div.wr-el-acts', {}, [
    /* Only dialogue. An action line is description and a slug is an
       address; neither is the thing "a dialogue pass" means, and a ◇
       on all six types is a ◇ nobody reads. */
    el.type === 'dialogue'
      ? iconBtn('◇', 'pass-open', 'Ask for a pass on this speech', false)
      : null,
    ...(el.type === 'character' ? cueButtons(el, i, elements) : []),
    iconBtn('↑', 'el-up', 'Move up', i === 0),
    iconBtn('↓', 'el-down', 'Move down', i === total - 1),
    iconBtn('✕', 'el-del', 'Delete element', false, true)
  ].filter(Boolean));
}

/* ---- a cue's two extra controls --------------------------------
   Dual dialogue is a toggle on the SECOND cue (src/lib/script.js has
   the model): pressed, this speech sits beside the one above it. And
   (CONT'D) is OFFERED, never typed for the writer — the button only
   shows when the same character speaks again after action in the same
   scene, and one click appends the words to the cue. Both are DOM
   built from the model at render; refreshCueOffers() keeps the offer
   in step as the writer types, at idle, without a re-render. */
export function cueButtons(el, i, elements) {
  const on = el.dual === true;
  const dual = h('button.bd-icon.wr-dual-btn' + (on ? '.is-on' : ''), {
    type: 'button', 'data-action': 'el-dual',
    title: on ? 'Dual dialogue: on — this speech sits beside the one above'
      : 'Dual dialogue: set this speech beside the one above',
    'aria-label': 'Dual dialogue', 'aria-pressed': on ? 'true' : 'false',
    text: '⇄'
  });
  const contd = h('button.wr-contd', {
    type: 'button', 'data-action': 'el-contd',
    title: "Same speaker after action in this scene — add (CONT'D)",
    text: "+ CONT'D"
  });
  contd.hidden = !contdOffer(elements, i);
  return [contd, dual];
}

/** The pairing a page is built with, as ids. Cheap: one scan of the
    element list, and on a script with no dual flag at all, nothing. */
export function dualSignature(elements) {
  if (!elements.some((e) => e.dual === true)) return '';
  return dualPairs(elements)
    .map((p) => [p.left[0], p.left[1], p.right[0], p.right[1]].map((k) => elements[k].id).join(','))
    .join(';');
}

/* The rows go into runs of CHUNK. A run is the unit the browser may
   skip while it is off screen (`content-visibility` in write.css), so
   a keystroke lays out the few runs in view instead of a feature's
   two thousand rows. The runs are invisible: same column, same gap.

   A dual-dialogue pair is the one place rows are nested: both
   speeches go in a `.wr-dual` holding two columns, so they sit side
   by side. A run never breaks inside one.

   `afterRow(el, i)` may return a node to sit straight after a row (the
   page's pass panel); null for none. */
export function buildPage(elements, { pageView = false, afterRow, rowChrome = true } = {}) {
  const page = h('div.wr-page' + (pageView ? '.is-pageview' : ''), { id: 'wr-page' });
  const pairs = new Map(dualPairs(elements).map((p) => [p.left[0], p]));
  let run = null;
  let inRun = 0;
  let pair = null;
  elements.forEach((el, i) => {
    if (!pair && (!run || inRun >= CHUNK)) { run = h('div.wr-chunk'); page.append(run); inRun = 0; }
    if (!pair && pairs.has(i)) {
      pair = pairs.get(i);
      const left = h('div.wr-dual-col');
      const right = h('div.wr-dual-col');
      run.append(h('div.wr-dual', { 'data-dual': elements[pair.right[0]].id }, [left, right]));
      pair.cols = [left, right];
    }
    const box = pair ? pair.cols[i >= pair.right[0] ? 1 : 0] : run;
    box.append(renderElement(el, i, elements.length, elements, rowChrome));
    inRun++;
    // The panel is a sibling of the row it belongs to, so it opens
    // where the speech is rather than somewhere else on the page.
    const extra = afterRow ? afterRow(el, i) : null;
    if (extra) box.append(extra);
    if (pair && i === pair.right[1]) pair = null;
  });
  return page;
}

/** Every row on the page, in order, across the runs. */
export function allRows(page) {
  const rows = [];
  if (!page) return rows;
  for (const run of page.children) {
    for (const n of run.children) {
      if (n.tagName === 'ARTICLE') rows.push(n);
      // A dual-dialogue pair: its two columns, left then right, which
      // is the order the elements are in.
      else if (n.classList.contains('wr-dual')) {
        for (const col of n.children) for (const r of col.children) if (r.tagName === 'ARTICLE') rows.push(r);
      }
    }
  }
  return rows;
}

/** Keep the runs a sensible size after a patch. Never touches a row's
    contents, only which run holds it. */
export function tidyRun(run) {
  if (!run || !run.classList.contains('wr-chunk')) return;
  if (!run.children.length) { run.remove(); return; }
  if (run.children.length < CHUNK * 2) return;
  const tail = h('div.wr-chunk');
  const kids = Array.from(run.children).slice(CHUNK);
  // A pass panel belongs with the row before it; never split them.
  while (kids.length && kids[0].tagName !== 'ARTICLE') kids.shift();
  tail.append(...kids);
  run.after(tail);
}

/** Bring rows [from, to] back in step with their position: the ordinal
    in both labels, and which arrows are dead. Attribute writes only —
    no layout is read, so this is cheap even across the whole script. */
export function reindexRows(page, elements, from, to) {
  if (!page) return;
  // Rows only (an open pass panel is a sibling between them), and the
  // row's own children walked rather than queried.
  const rows = allRows(page);
  const total = elements.length;
  const last = Math.min(rows.length - 1, to === undefined ? rows.length - 1 : to);
  for (let i = Math.max(0, from); i <= last; i++) {
    const el = elements[i];
    if (!el) continue;
    for (const part of rows[i].children) {
      if (part.tagName === 'SELECT') setAttr(part, 'aria-label', 'Element type for element ' + (i + 1));
      else if (part.tagName === 'TEXTAREA') setAttr(part, 'aria-label', typeLabel(el.type) + ', element ' + (i + 1));
      else if (part.tagName === 'DIV' && part.classList.contains('wr-el-acts')) {
        for (const btn of part.children) {
          const act = btn.getAttribute('data-action');
          if (act === 'el-up') { if (btn.disabled !== (i === 0)) btn.disabled = i === 0; }
          else if (act === 'el-down') { if (btn.disabled !== (i === total - 1)) btn.disabled = i === total - 1; }
        }
      }
    }
  }
}

/* ---- sizing the elements to their text ---------------------
   C2 in docs/UX-AUDIT-2026-10-06.md: on a feature-length script this
   page froze for minutes. The old autosize wrote `height: auto`, read
   scrollHeight and wrote the height back, once per textarea — a forced
   synchronous layout of the whole page per row, 2,361 times per render,
   twice per render, and every Return re-rendered every row.

   Where the browser can do it, it does: `field-sizing: content` in
   write.css grows each textarea to its text with no script at all, and
   it stays right across a font swap and a resize for free. Everywhere
   else the JS below is the fallback, and it is BATCHED — every write,
   then every read, then every write — so a whole page costs one layout
   rather than one per row. DOM only; never touches storage. */
export const NATIVE_SIZING = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('field-sizing', 'content');

export function autosizeMany(list) {
  if (NATIVE_SIZING || !list.length) return;
  list.forEach((ta) => { ta.style.height = 'auto'; });
  // `scrollHeight` is the CONTENT box; the element is border-box, so
  // assigning it directly loses the two border pixels and every block
  // renders two pixels short of its own text. Add the frame back.
  const heights = list.map((ta) => ta.scrollHeight + (ta.offsetHeight - ta.clientHeight));
  list.forEach((ta, i) => { ta.style.height = heights[i] + 'px'; });
}
export function autosize(ta) { if (ta) autosizeMany([ta]); }
