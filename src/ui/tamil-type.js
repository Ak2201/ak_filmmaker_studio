/* ============================================================
   TAMIL TYPING — romanised Tamil in, Tamil script out, one word at a
   time, in the speech and nowhere else
   ------------------------------------------------------------
   An OPT-IN mode, off by default. With it on, a word typed in Roman
   letters into a DIALOGUE or PARENTHETICAL line is offered in Tamil
   script as it is typed (src/lib/tanglish.js tamilCandidates(), which
   is toTamil() plus the readings the chat convention leaves open):

     Space / Return   commit the highlighted Tamil word (Return does
                      NOT also start a new element — it is the word's)
     ↑ ↓              choose another reading
     Esc              keep this word in Roman letters ("sir", "office")
     Alt/⌥ T          the mode itself, on or off (also the strip's
                      "Type Tamil" button on a dialogue line)

   WHY ONLY THE SPEECH. Headings, action, cues and transitions stay on
   the Latin grid: that is SCRIPT_LANGS' 'ta-dialogue' register in
   ai.js, the one Tamil crews shoot from and the one whose page count
   stays arithmetic. A cue in Tamil script would also be a cue the
   breakdown, the cast matrix and the call sheet could no longer
   match. The parenthetical sits inside the speech block, at the
   speech's own measure, so it is included; nothing else is.

   NOTHING IS CONVERTED WITHOUT THE WRITER. The mode is a choice the
   writer makes, a word becomes Tamil on a key they press, and a word
   typed with the mode off is never touched afterwards. The Tamil
   PREVIEW in the dialogue strip is still a preview and is still never
   written by itself (alt-lines.js).

   ONE SAVE PATH. A commit sets the textarea's value and fires its
   `input` event, so write.js does exactly what it does for a
   keystroke: model, counters, debounced save. Nothing here writes the
   script.

   THE PREFERENCE is per device, in `fms_write_prefs_v1` as
   `tamilTyping`, read-merge-write through format-guide.js — the key
   the keyboard preset and the guide level already share. Written only
   when the writer toggles it; never on load, render or idle.

   On a phone, keydown says "Unidentified" for most keys, so a Space
   cannot be caught before it lands. The input handler therefore also
   commits on an `insertText` of a space or a punctuation mark that
   has just closed a Roman word — the same result, one event later.
   ============================================================ */
import { readPrefs, writePrefs } from './format-guide.js';
import { wordBefore, tamilCandidates } from '../lib/tanglish.js';
import StudioUI from './chrome.js';

const ROW_TYPES = ['t-dialogue', 't-paren'];
const COMMIT_PUNCT = /^[.,?!;:)"'”’…-]$/;
export const TAMIL_EVENT = 'fms:tamil-typing';

let on = (() => { try { return readPrefs().tamilTyping === true; } catch (e) { return false; } })();
let list = null;
let state = null;      // { ta, start, word, items, active }
let skip = null;       // { ta, start } — Esc'd: leave this word alone

export const isTamilTyping = () => on;

export function setTamilTyping(next, { announce = true } = {}) {
  on = !!next;
  try { writePrefs({ tamilTyping: on }); } catch (e) { /* private mode: holds for this visit */ }
  if (!on) close();
  document.dispatchEvent(new CustomEvent(TAMIL_EVENT, { detail: { on } }));
  if (announce) {
    StudioUI.toast(on
      ? 'Tamil typing on — dialogue and parentheticals only. Space or Return commits a word in Tamil script; Esc keeps it in Roman letters.'
      : 'Tamil typing off. New words stay in Roman letters.', { type: 'info' });
  }
  return on;
}

const speechRow = (ta) => {
  const row = ta && ta.closest && ta.closest('.wr-el');
  return row && ROW_TYPES.some((c) => row.classList.contains(c)) ? row : null;
};
const isLine = (t) => !!(t && t.matches && t.matches('.wr-text[data-el-field="text"]'));

function ensureList() {
  if (list) return list;
  list = document.createElement('ul');
  list.id = 'tt-list';
  list.className = 'tt-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Tamil script for this word');
  list.hidden = true;
  // pointerdown, not click: the caret stays in the line being written.
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-tt-i]');
    if (!li || !state) return;
    e.preventDefault();
    state.active = Number(li.dataset.ttI);
    commit('');
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
  const { ta, items, active, word } = state;
  ul.replaceChildren(...items.map((t, i) => {
    const li = document.createElement('li');
    li.id = 'tt-opt-' + i;
    li.className = 'tt-opt' + (i === active ? ' is-active' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === active ? 'true' : 'false');
    li.dataset.ttI = String(i);
    const lab = document.createElement('span');
    lab.className = 'tt-lab';
    lab.lang = 'ta';
    lab.textContent = t;
    li.append(lab);
    if (i === 0) {
      const hint = document.createElement('span');
      hint.className = 'tt-hint';
      hint.textContent = 'Space ⏎ · Esc keeps ' + word;
      li.append(hint);
    }
    return li;
  }));
  ul.hidden = false;
  ta.setAttribute('aria-autocomplete', 'list');
  ta.setAttribute('aria-controls', 'tt-list');
  ta.setAttribute('aria-expanded', 'true');
  ta.setAttribute('aria-activedescendant', 'tt-opt-' + active);
  // Under the line, clamped inside the viewport (the SmartType rule:
  // a list must never be what scrolls a phone sideways).
  const r = ta.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const w = Math.min(ul.offsetWidth || 240, vw - 32);
  const left = Math.max(16, Math.min(r.left, vw - 16 - w));
  ul.style.left = (left + window.scrollX) + 'px';
  // Above the line when below it would leave the viewport (a line at
  // the foot of the screen is where the writer usually is).
  const lh = ul.offsetHeight || 0;
  const below = r.bottom + 4 + lh <= document.documentElement.clientHeight;
  ul.style.top = ((below ? r.bottom + 4 : Math.max(4, r.top - 4 - lh)) + window.scrollY) + 'px';
}

/** Offer the word that ends at the caret, or close. */
function offer(ta) {
  if (!on || !speechRow(ta) || ta.selectionStart !== ta.selectionEnd) { close(); return; }
  const at = wordBefore(ta.value, ta.selectionEnd);
  if (!at.word) { close(); return; }
  if (skip && skip.ta === ta && skip.start === at.start) { close(); return; }
  skip = null;
  const items = tamilCandidates(at.word);
  if (!items.length) { close(); return; }
  const keep = state && state.ta === ta && state.start === at.start ? Math.min(state.active, items.length - 1) : 0;
  state = { ta, start: at.start, word: at.word, items, active: keep };
  paint();
}

/** Replace the offered word with the chosen Tamil word, then `tail`
    (a space, or '' when the key that committed inserts its own). */
function commit(tail) {
  if (!state) return false;
  const { ta, start, word, items, active } = state;
  const v = ta.value;
  const end = start + word.length;
  if (v.slice(start, end) !== word) { close(); return false; }
  const tamil = items[active] || items[0];
  ta.value = v.slice(0, start) + tamil + tail + v.slice(end);
  const caret = start + tamil.length + tail.length;
  try { ta.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ }
  close();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function mountTamilType() {
  /* Capture phase, on document: this runs BEFORE write.js's own
     keydown (a bubble listener on document), so a Return that commits
     a word can stop there and never also make a new element. */
  document.addEventListener('keydown', (e) => {
    // The mode toggle: Alt/Option+T, matched on e.code because Option
    // rewrites e.key on a Mac (Option+T is '†').
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
        && (e.code === 'KeyT' || String(e.key).toLowerCase() === 't')
        && document.getElementById('wr-page')) {
      e.preventDefault();
      e.stopPropagation();
      setTamilTyping(!on);
      if (on && isLine(e.target)) offer(e.target);
      return;
    }
    if (!state || e.target !== state.ta || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = state.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      state.active = (state.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      paint();
      return;
    }
    if (e.key === ' ' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); commit(' '); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); commit(''); return; }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      skip = { ta: state.ta, start: state.start };
      close();
      return;
    }
    // A punctuation mark ends the word too: commit, then let the mark
    // land after it as the browser would have put it.
    if (COMMIT_PUNCT.test(e.key)) commit('');
  }, true);

  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!isLine(ta)) return;
    if (!on || !speechRow(ta)) { if (state) close(); return; }
    /* The phone path: a space or a mark that has just closed a Roman
       word. Only for real typing (insertText), never a paste, and
       never our own synthetic event (which has no inputType). */
    if (e.inputType === 'insertText' && typeof e.data === 'string'
        && (e.data === ' ' || COMMIT_PUNCT.test(e.data)) && ta.selectionStart === ta.selectionEnd) {
      const caret = ta.selectionEnd;
      const at = wordBefore(ta.value, caret - e.data.length);
      if (at.word && !(skip && skip.ta === ta && skip.start === at.start)) {
        const items = tamilCandidates(at.word);
        const pick = state && state.ta === ta && state.start === at.start ? items[state.active] || items[0] : items[0];
        if (pick) {
          const v = ta.value;
          ta.value = v.slice(0, at.start) + pick + v.slice(at.start + at.word.length);
          const c = caret - at.word.length + pick.length;
          try { ta.setSelectionRange(c, c); } catch (err) { /* */ }
          close();
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }
    }
    offer(ta);
  });

  document.addEventListener('focusout', (e) => { if (state && e.target === state.ta) close(); });
  // A type change away from the speech takes the list with it.
  document.addEventListener('change', (e) => {
    if (state && e.target && e.target.matches && e.target.matches('select[data-el-field="type"]')) close();
  });
  addEventListener('resize', () => { if (state) paint(); });
}

export default { mountTamilType, isTamilTyping, setTamilTyping, TAMIL_EVENT };
