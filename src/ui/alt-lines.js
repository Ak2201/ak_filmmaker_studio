/* ============================================================
   ALTERNATE LINES, and the Tanglish help that sits beside them
   ------------------------------------------------------------
   Final Draft calls these "dialogue choices": a speech can carry
   several takes, the writer picks the one in use, and the others wait.

   ONLY THE ACTIVE TAKE IS THE ELEMENT'S TEXT. The takes not in use
   live on the element as `alts: [string, …]`, inside the script blob
   that already exists (`fms_script_v1`; no new key, no registry to
   touch). Every reader of the script — the PDF, the .fountain and
   .txt exports, the page count, the breakdown's join, the AI shot
   division — reads `text` and nothing else, so none of them needed to
   learn about takes and none of them can print the wrong one.
   `blankElement()` in src/lib/script.js spreads the stored element, so
   `alts` survives a load; a revision snapshot keeps `type` and `text`
   only, which is the right shape for a snapshot of the PAGE.

   ONE SAVE PATH. Nothing here calls saveScript(). A change to the
   takes mutates the element the page holds in memory and then fires
   the row's own `input` event, so write.js runs exactly what it runs
   for a keystroke: the model takes the textarea's value, the counters
   refresh, the debounced save is scheduled. A swap that bypassed that
   would be a second writer of the same blob.

   THE TOOLS APPEAR ON FOCUS, INSIDE THE ROW. A strip of three small
   controls is added to the dialogue row that has the caret and taken
   away when the caret leaves; the 2,361 rows of a feature never carry
   it, so a render costs nothing extra and the keystroke path is one
   prefix lookup.

   TANGLISH, CO-OPERATIVELY. The keyboard presets own Tab and Return
   and their own autocomplete, so the word suggestion here binds
   neither: it is a chip, accepted by a click or by Alt+Return, and
   write.js's Return handler already ignores a Return with Alt held.
   The Tamil-script view is a PREVIEW under the line and is never
   written into the line by itself: the page count is arithmetic on a
   fixed-width grid, and the line in use is the writer's to choose.

   TWO WAYS THE WRITER MAY TAKE THE TAMIL, both their own act:
     - "Keep as Tamil take" stores the preview's rendering as one more
       ALTERNATE take of this line (`alts`, above). The line in use is
       untouched, and the Tamil take is chosen the way any take is,
       with "Use this take". Dialogue only, because this strip is.
     - "Type Tamil" (Alt/⌥ T) is src/ui/tamil-type.js: an opt-in mode
       where each Roman word typed in a dialogue or parenthetical line
       is offered in Tamil script and committed with Space or Return.
   ============================================================ */
import { h } from '../lib/dom.js';
import StudioUI from './chrome.js';
import { wordIndex, suggest, wordBefore, toTamil, hasLatin } from '../lib/tanglish.js';
import { mountTamilType, isTamilTyping, setTamilTyping, TAMIL_EVENT } from './tamil-type.js';

let getDoc = () => null;

/* Session state, in memory only. The preview toggle is a reading
   preference for this sitting; a key for it would be a new entry in a
   storage contract that holds months of people's work. */
let showTamil = false;
let openFor = null;           // element id whose takes panel is open
let index = null;             // the Tanglish word index, built lazily
let indexDirty = true;
let current = null;           // { start, word, completion } on screen
let pointerInStrip = false;

const STRIP = 'wx-strip';

function elementFor(id) {
  const doc = getDoc();
  return doc && Array.isArray(doc.elements) ? doc.elements.find((e) => e.id === id) : null;
}
const takesOf = (el) => (el && Array.isArray(el.alts) ? el.alts.filter((t) => typeof t === 'string') : []);

/** Run the page's own save path for this row. */
function commit(ta) {
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Mark a row that carries takes, so it reads differently unfocused. */
function markRow(row, el) {
  if (!row) return;
  const n = takesOf(el).length;
  if (n) row.setAttribute('data-alts', String(n + 1));
  else row.removeAttribute('data-alts');
}

/** After a full render: put the marks back on the few rows with takes. */
function markAll() {
  const doc = getDoc();
  const page = document.getElementById('wr-page');
  if (!doc || !page) return;
  for (const el of doc.elements) {
    if (!el || !Array.isArray(el.alts) || !el.alts.length) continue;
    markRow(page.querySelector(`[data-el="${CSS.escape(String(el.id))}"]`), el);
  }
}

/* ---- the strip --------------------------------------------- */

function buildStrip(row, el) {
  const n = takesOf(el).length + 1;
  const strip = h('div.' + STRIP, { 'data-for': el.id });
  strip.append(
    h('div.wx-strip-row', {}, [
      h('button.btn.wx-mini', {
        type: 'button', 'data-action': 'alts-toggle',
        'aria-expanded': openFor === el.id ? 'true' : 'false',
        title: 'Keep other takes of this line and choose the one in use',
        text: n > 1 ? `Alternates · ${n}` : 'Alternates'
      }),
      h('button.btn.wx-mini', {
        type: 'button', 'data-action': 'tamil-toggle',
        'aria-pressed': showTamil ? 'true' : 'false',
        title: 'An approximate preview in Tamil script. Never saved into the script.',
        text: 'Tamil script'
      }),
      h('button.btn.wx-mini', {
        type: 'button', 'data-action': 'tamil-type-toggle',
        'aria-pressed': isTamilTyping() ? 'true' : 'false',
        title: 'Type Roman letters, get Tamil script — in dialogue and parentheticals only (Alt/⌥ T)',
        text: 'Type Tamil'
      }),
      h('span.wx-suggest-slot', { 'aria-live': 'polite' })
    ])
  );
  if (showTamil) strip.append(tamilPreview(el.text));
  if (openFor === el.id) strip.append(takesPanel(el));
  return strip;
}

function tamilPreview(text) {
  const t = String(text || '').trim();
  const keep = h('button.btn.wx-mini.wx-keep-ta', {
    type: 'button', 'data-action': 'tamil-keep',
    title: 'Store this Tamil rendering as another take of the line. The line in use does not change.',
    text: 'Keep as Tamil take'
  });
  keep.hidden = !hasLatin(t);
  return h('div.wx-tamil', {}, [
    h('p.wx-tamil-line', { lang: 'ta', text: t ? toTamil(t) : '—' }),
    h('div.wx-tamil-foot', {}, [
      h('p.wx-note', { text: 'Approximate preview from the romanised line. It is not saved unless you keep it as a take; the line in use stays as you typed it.' }),
      keep
    ])
  ]);
}

function takesPanel(el) {
  const takes = takesOf(el);
  const panel = h('div.wx-takes', { role: 'group', 'aria-label': 'Takes of this line' });
  panel.append(h('p.wx-take-now', {}, [
    h('span.wx-label', { text: 'In use' }),
    h('span.wx-take-text', { text: el.text.trim() || '(empty)' })
  ]));
  if (takes.length) {
    const list = h('ol.wx-take-list');
    takes.forEach((t, k) => {
      list.append(h('li.wx-take', {}, [
        h('span.wx-take-text', { text: t.trim() || '(empty)' }),
        h('span.wx-take-acts', {}, [
          h('button.btn.wx-mini', { type: 'button', 'data-action': 'alts-use', 'data-take': String(k), text: 'Use this take' }),
          h('button.btn.wx-mini.wx-quiet', {
            type: 'button', 'data-action': 'alts-remove', 'data-take': String(k),
            'aria-label': 'Remove take ' + (k + 2), text: 'Remove'
          })
        ])
      ]));
    });
    panel.append(list);
  } else {
    panel.append(h('p.wx-note', { text: 'No other takes yet. Keep this line as a take, then rewrite it — or write the other version below.' }));
  }
  const input = h('textarea.wx-take-new', {
    rows: '1', 'aria-label': 'Write another take of this line', placeholder: 'Another way to say it…'
  });
  panel.append(
    input,
    h('div.wx-take-foot', {}, [
      h('button.btn.wx-mini', { type: 'button', 'data-action': 'alts-add', text: 'Add take' }),
      h('button.btn.wx-mini', { type: 'button', 'data-action': 'alts-keep', text: 'Keep this line as a take' })
    ])
  );
  return panel;
}

function stripOf(row) { return row ? row.querySelector(':scope > .' + STRIP) : null; }

function showStrip(row) {
  const id = row && row.dataset.el;
  const el = id && elementFor(id);
  if (!el || el.type !== 'dialogue') return;
  document.querySelectorAll('.' + STRIP).forEach((s) => { if (s.parentElement !== row) s.remove(); });
  const fresh = buildStrip(row, el);
  const old = stripOf(row);
  if (old) old.replaceWith(fresh);
  // Last in the row, after the row's own buttons: the grid then puts it
  // on a line of its own under the text, whatever else the row holds.
  else row.append(fresh);
  updateSuggestion(row.querySelector('.wr-text'));
}

function hideStrip(row) {
  const s = stripOf(row);
  if (s) s.remove();
  if (openFor && row && row.dataset.el === openFor) openFor = null;
  current = null;
}

/* ---- Tanglish suggestion ----------------------------------- */

/* Built when the browser is idle after a dialogue line takes focus,
   never inside a keystroke: on a feature it is a pass over every
   speech, and Return into a dialogue line is a key pressed every few
   seconds. Until it lands there is simply no chip. Stale by the words
   of the line being typed, which is the line it would be suggesting
   into anyway. */
let indexTask = 0;
function primeIndex(ta) {
  if (index && !indexDirty) return;
  if (indexTask) return;
  const run = () => {
    indexTask = 0;
    const doc = getDoc();
    index = wordIndex(doc ? doc.elements : []);
    indexDirty = false;
    if (ta && document.activeElement === ta) updateSuggestion(ta);
  };
  indexTask = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 800 })
    : setTimeout(run, 50);
}

function updateSuggestion(ta) {
  const row = ta && ta.closest('[data-el]');
  const strip = stripOf(row);
  const slot = strip && strip.querySelector('.wx-suggest-slot');
  if (!slot) return;
  current = null;
  const at = wordBefore(ta.value, ta.selectionEnd);
  const completion = at.word && index ? suggest(index, at.word) : '';
  if (!completion) { if (slot.firstChild) slot.replaceChildren(); return; }
  current = { start: at.start, word: at.word, completion };
  slot.replaceChildren(h('button.btn.wx-mini.wx-chip', {
    type: 'button', 'data-action': 'tanglish-accept',
    title: 'From this script\'s own dialogue. Click, or press Alt+Return.',
    'aria-label': 'Complete to ' + completion + ' (Alt+Return)'
  }, [h('span', { text: completion }), h('kbd.wx-kbd', { text: 'Alt+⏎' })]));
}

function acceptSuggestion(ta) {
  if (!current || !ta) return false;
  const { start, word, completion } = current;
  const v = ta.value;
  const end = start + word.length;
  if (v.slice(start, end) !== word) return false;
  const tail = v.slice(end);
  const space = tail && /^\s/.test(tail) ? '' : ' ';
  ta.value = v.slice(0, start) + completion + space + tail;
  const caret = start + completion.length + space.length;
  try { ta.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ }
  current = null;
  commit(ta);
  ta.focus();
  return true;
}

/* ---- the takes: mutations ---------------------------------- */

function withRow(btn, fn) {
  const row = btn.closest('[data-el]');
  const el = row && elementFor(row.dataset.el);
  const ta = row && row.querySelector('.wr-text');
  if (!el || !ta) return;
  el.text = ta.value;          // the debounce may not have fired
  fn(el, ta, row);
  markRow(row, el);
  commit(ta);
  showStrip(row);
}

function setTakes(el, takes) {
  if (takes.length) el.alts = takes;
  else delete el.alts;
}

/** A rebuild replaces the button that had focus; put focus back on its
 *  successor, or on the line itself, rather than dropping it on <body>. */
function refocus(row, btn) {
  const strip = stripOf(row);
  const sel = btn && btn.dataset.action
    ? `[data-action="${btn.dataset.action}"]` + (btn.dataset.take ? `[data-take="${btn.dataset.take}"]` : '')
    : null;
  const next = (strip && sel && strip.querySelector(sel)) || (row && row.querySelector('.wr-text'));
  if (next) next.focus();
}

function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !btn.closest('.' + STRIP)) return;
  const hadFocus = btn.contains(document.activeElement) || document.activeElement === btn;
  const act = btn.dataset.action;
  const row = btn.closest('[data-el]');
  const ta = row && row.querySelector('.wr-text');
  if (act === 'tanglish-accept') { acceptSuggestion(ta); return; }
  if (act === 'tamil-toggle') { showTamil = !showTamil; showStrip(row); refocus(row, btn); return; }
  if (act === 'tamil-type-toggle') {
    setTamilTyping(!isTamilTyping());   // the event below repaints the strip
    if (ta) ta.focus();
    return;
  }
  if (act === 'tamil-keep') {
    let kept = false;
    withRow(btn, (el) => {
      const tamil = toTamil(String(el.text || '').trim());
      if (!tamil || !hasLatin(el.text)) return;
      const takes = takesOf(el);
      if (takes.includes(tamil) || tamil === el.text) return;
      takes.push(tamil);
      setTakes(el, takes);
      kept = true;
    });
    refocus(row, { dataset: { action: 'tamil-keep' } });
    StudioUI.toast(kept
      ? 'Kept as a Tamil take. The line in use is unchanged — open Alternates to use it.'
      : 'That Tamil take is already kept.', { type: 'info' });
    return;
  }
  if (act === 'alts-toggle') {
    openFor = openFor === row.dataset.el ? null : row.dataset.el;
    showStrip(row);
    const first = openFor && stripOf(row)?.querySelector('.wx-takes button, .wx-take-new');
    if (first) first.focus();
    return;
  }
  const k = Number(btn.dataset.take);
  if (act === 'alts-use') {
    withRow(btn, (el, field) => {
      const takes = takesOf(el);
      if (!(k >= 0 && k < takes.length)) return;
      const chosen = takes[k];
      takes[k] = el.text;          // the line in use goes where the take was
      setTakes(el, takes);
      field.value = chosen;
    });
    refocus(row, null);
    StudioUI.toast('That take is the line in use now. The other stays as a take.', { type: 'info' });
    return;
  }
  if (act === 'alts-remove') {
    let removed = null;
    withRow(btn, (el) => {
      const takes = takesOf(el);
      if (!(k >= 0 && k < takes.length)) return;
      removed = takes.splice(k, 1)[0];
      setTakes(el, takes);
    });
    refocus(row, hadFocus ? { dataset: { action: 'alts-toggle' } } : null);
    if (removed !== null) {
      const id = row.dataset.el;
      StudioUI.toast('Take removed.', {
        type: 'info', action: 'Undo',
        onAction: () => {
          const el = elementFor(id);
          const r = document.querySelector(`[data-el="${CSS.escape(id)}"]`);
          const field = r && r.querySelector('.wr-text');
          if (!el || !field) return;
          const takes = takesOf(el);
          takes.splice(Math.min(k, takes.length), 0, removed);
          setTakes(el, takes);
          markRow(r, el);
          commit(field);
          if (stripOf(r)) showStrip(r);
        }
      });
    }
    return;
  }
  if (act === 'alts-add' || act === 'alts-keep') {
    const input = stripOf(row)?.querySelector('.wx-take-new');
    const text = act === 'alts-keep' ? (ta ? ta.value : '') : (input ? input.value : '');
    if (!text.trim()) {
      StudioUI.toast(act === 'alts-keep' ? 'Write the line first, then keep it as a take.' : 'Write the other take in the box first.', { type: 'info' });
      return;
    }
    withRow(btn, (el) => {
      const takes = takesOf(el);
      if (!takes.includes(text) && text !== (act === 'alts-add' ? el.text : null)) takes.push(text);
      setTakes(el, takes);
    });
    const again = stripOf(row)?.querySelector(act === 'alts-add' ? '.wx-take-new' : '[data-action="alts-keep"]');
    if (again) again.focus();
  }
}

/* ---- wiring ------------------------------------------------- */

/** `opts.getDoc` returns the page's in-memory script. */
export function mountAltLines(opts = {}) {
  if (typeof opts.getDoc === 'function') getDoc = opts.getDoc;
  try { mountTamilType(); } catch (e) { console.warn('[write] tamil typing', e); }
  // The mode changed (button or Alt+T): repaint the strip that is up.
  document.addEventListener(TAMIL_EVENT, () => {
    const s = document.querySelector('.' + STRIP);
    const b = s && s.querySelector('[data-action="tamil-type-toggle"]');
    if (b) b.setAttribute('aria-pressed', isTamilTyping() ? 'true' : 'false');
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    const row = t && t.closest && t.closest('.wr-el');
    if (!row) return;
    if (t.matches('.wr-text') && row.classList.contains('t-dialogue')) {
      if (!stripOf(row)) showStrip(row);
      else updateSuggestion(t);
      primeIndex(t);
    }
  });
  document.addEventListener('focusout', (e) => {
    const row = e.target && e.target.closest && e.target.closest('.wr-el');
    if (!row || !stripOf(row)) return;
    // Deferred: a click on a strip button moves focus after this fires,
    // and Safari does not focus a button on click at all.
    setTimeout(() => {
      if (pointerInStrip) return;
      const a = document.activeElement;
      if (a && row.contains(a)) return;
      hideStrip(row);
    }, 0);
  });
  document.addEventListener('pointerdown', (e) => {
    pointerInStrip = !!(e.target.closest && e.target.closest('.' + STRIP));
  }, true);
  document.addEventListener('pointerup', () => { setTimeout(() => { pointerInStrip = false; }, 0); }, true);
  document.addEventListener('click', onClick);

  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('.wr-text')) return;
    const row = ta.closest('.wr-el');
    if (!row || !row.classList.contains('t-dialogue')) return;
    indexDirty = true;                       // rebuilt at the next focus, off the keystroke
    const strip = stripOf(row);
    if (!strip) return;
    const prev = strip.querySelector('.wx-tamil-line');
    if (prev) prev.textContent = ta.value.trim() ? toTamil(ta.value.trim()) : '—';
    const keep = strip.querySelector('.wx-keep-ta');
    if (keep) keep.hidden = !hasLatin(ta.value);
    updateSuggestion(ta);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const ta = e.target;
    if (!ta.matches || !ta.matches('.wr-text') || !current) return;
    const row = ta.closest('.wr-el');
    if (!row || !stripOf(row)) return;
    if (acceptSuggestion(ta)) e.preventDefault();
  });
  // A type switch away from dialogue takes the strip with it.
  document.addEventListener('change', (e) => {
    const sel = e.target;
    if (!sel.matches || !sel.matches('select[data-el-field="type"]')) return;
    const row = sel.closest('.wr-el');
    if (row && !row.classList.contains('t-dialogue')) hideStrip(row);
  });

  const app = document.getElementById('app');
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(() => { indexDirty = true; openFor = null; current = null; markAll(); })
      .observe(app, { childList: true });
  }
  markAll();
}

export default { mountAltLines };
