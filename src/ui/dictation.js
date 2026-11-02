/* ============================================================
   DICTATION — the browser's own speech input, into the line you are on
   ------------------------------------------------------------
   Idea 17 of docs/SCREENPLAY-WRITER-PLAN.md. Chromium only, and
   labelled as such: the button exists only where the page can see
   `SpeechRecognition` / `webkitSpeechRecognition`, so a browser
   without it shows nothing rather than a control that cannot work.

   THE SAVE PATH IS THE EDITOR'S, NOT OURS. A final result is put
   into the textarea at the caret with setRangeText() and the field
   then dispatches an ordinary bubbling `input` — exactly what a
   keystroke produces — so write.js updates its model, its counters
   and its debounced save in the usual order. Nothing here touches
   storage; the language choice is held in memory for the visit.

   NETWORK AND CSP. Chrome's recogniser sends audio to Google's speech
   service from the BROWSER, not from the page: no fetch, no socket
   and no frame belongs to this document, so `connect-src` never sees
   it and neither vercel.json nor netlify.toml needs an entry. What
   the page does need is the microphone, which a `Permissions-Policy`
   header could forbid — neither host config sends one. If one is ever
   added, it must say `microphone=(self)` or this fails as
   'not-allowed'.

   TAMIL. ta-IN returns Tamil script, which is what Tamil speech is.
   The sample and the generator write dialogue as romanised Tanglish
   (CLAUDE.md, open item 8: the fixed-width page count depends on it),
   so English (India) is the default and the picker says what Tamil
   will insert.

   It stops on Esc, when the line loses focus, after a silence, and
   when the button is pressed again.

   OFF UNTIL SWITCHED ON (L5). Chrome's recogniser sends the audio to
   Google, which a writer should choose knowingly, so the first start
   asks (dialog.js, DICTATION_NOTICE) and remembers the answer in
   `dictation` inside fms_studio_prefs_v1; Settings, Screenplay switches
   it off again. Nothing is asked, and nothing listens, before that.

   SPOKEN TEXT TAKES THE TYPED ROUTE. A final result goes through
   dictation-model.js (spoken "new line", "comma", …), is inserted as
   an `input`, and a part that ends a line asks the editor for a Return
   with the `fms:dictation-commit` event (editor.js decides: a spoken
   "new line" always; a pause only when the auto-format has work to do,
   so "Preethi says hello" becomes a cue and a speech). The Return moves
   focus to the new line; `moving` keeps that from reading as "the line
   lost focus", and the dictation follows the caret.
   ============================================================ */
import { h } from '../lib/dom.js';
import { indiaContentShown as here } from './india-content.js';
import { ask } from './dialog.js';
import { readDictation, saveDictation } from '../lib/chrome-prefs.js';
import { splitSpoken, DICTATION_NOTICE } from '../lib/dictation-model.js';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;

const SILENCE_MS = 8000;
const LANGS = [
  ['en-IN', 'English (India)'],
  ['ta-IN', 'Tamil — inserts Tamil script']
];

let lang = 'en-IN';
/* Tamil is India-only material (docs/US-MARKET-PLAN.md §E): for a film
   made elsewhere its option is hidden (data-india-only, india-content.css) and a
   Tamil pick left over from an India film falls back to English. */
const langNow = () => (lang === 'ta-IN' && !here() ? 'en-IN' : lang);
let rec = null;
let target = null;        // the textarea being dictated into
let lastField = null;     // the last script line that had focus
let silence = 0;
let ui = null;
let moving = false;       // a spoken line break is moving focus to the next line

const isField = (n) => !!(n && n.matches && n.matches('#wr-page .wr-text[data-el-field="text"]'));

document.addEventListener('focusin', (e) => { if (isField(e.target)) lastField = e.target; });
document.addEventListener('focusout', (e) => {
  if (rec && e.target === target && !moving) stop('Stopped: the line lost focus.');
});
document.addEventListener('keydown', (e) => {
  if (rec && e.key === 'Escape') stop('Stopped.');
}, true);

function say(text, kind) {
  if (!ui) return;
  if (ui.status.textContent !== text) ui.status.textContent = text;
  ui.status.dataset.kind = kind || '';
}
function preview(text) {
  if (!ui) return;
  ui.preview.textContent = text ? '“' + text + '”' : '';
  ui.preview.hidden = !text;
}
function paint() {
  if (!ui) return;
  const on = !!rec;
  ui.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.btn.classList.toggle('is-on', on);
  ui.btn.textContent = on ? 'Stop dictation' : 'Dictation (Chrome)';
  ui.lang.disabled = on;
}

/** Put `text` at the caret of `ta`, with a space if it would otherwise
    run into the word before, then tell the editor as a keystroke would. */
export function insertAtCaret(ta, text) {
  const words = String(text || '').trim();
  if (!ta || !words) return;
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? s;
  const before = ta.value.slice(0, s);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  ta.setRangeText(lead + words, s, e, 'end');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** One final transcript: its parts, each inserted at the caret, and the
    line ended after a part that asks for it. */
function spoken(transcript) {
  for (const part of splitSpoken(transcript, langNow())) {
    if (!target || !target.isConnected) return;
    if (part.text) insertAtCaret(target, part.text);
    const field = target;
    moving = true;
    try {
      document.dispatchEvent(new CustomEvent('fms:dictation-commit', { detail: { field, newLine: part.newLine } }));
    } finally { moving = false; }
    if (isField(document.activeElement) && document.activeElement !== field) target = document.activeElement;
  }
}

function armSilence() {
  clearTimeout(silence);
  silence = setTimeout(() => stop('Stopped after a silence.'), SILENCE_MS);
}

const ERRORS = {
  'not-allowed': 'Microphone permission was refused. Allow the microphone for this site in the browser’s address bar, then try again.',
  'service-not-allowed': 'This browser has its speech service turned off, so dictation is unavailable here.',
  'audio-capture': 'No microphone was found.',
  'network': 'The browser could not reach its speech service. Dictation needs a connection.',
  'no-speech': 'Nothing was heard. Press Dictation and speak.',
  'language-not-supported': 'This browser cannot recognise that language.'
};

/** Switched on? The first time, the notice is the question. */
export async function enableDictation({ fromSettings = false } = {}) {
  const cur = readDictation();
  if (cur.on) return true;
  /* After the first notice the writer's own switch decides: one who turned
     it off is not re-asked from the Tools menu, they are told where the
     switch is. `fromSettings` is that switch being turned on. */
  if (cur.noticed && !fromSettings) return false;
  if (!cur.noticed) {
    const yes = await ask({ ...DICTATION_NOTICE });
    if (!yes) return false;
  }
  saveDictation({ on: true, noticed: true });
  return true;
}

async function begin() {
  if (!(await enableDictation())) {
    say(readDictation().noticed
      ? 'Dictation is switched off. Turn it on in Settings, under Screenplay.'
      : 'Dictation is off. Nothing was listened to.', '');
    return;
  }
  start();
}

function start() {
  const ta = (isField(document.activeElement) && document.activeElement)
    || (lastField && lastField.isConnected ? lastField : null);
  if (!ta) { say('Click into a line of the script first, then press Dictation.', 'warn'); return; }
  let r;
  try { r = new SR(); } catch (err) { say('Dictation could not start in this browser.', 'warn'); return; }
  r.lang = langNow();
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onresult = (ev) => {
    if (r !== rec) return;
    if (!target || !target.isConnected) { stop('Stopped: the line was redrawn.'); return; }
    armSilence();
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const t = res[0] ? res[0].transcript : '';
      if (res.isFinal) spoken(t);
      else interim += t;
    }
    preview(interim.trim());
  };
  r.onerror = (ev) => {
    if (r !== rec) return;
    if (ev.error === 'aborted') return;
    stop(ERRORS[ev.error] || 'Dictation stopped: ' + ev.error + '.', 'warn');
  };
  r.onend = () => { if (r === rec) stop(''); };

  rec = r;
  target = ta;
  if (document.activeElement !== ta) ta.focus();   // the selection survives a blur
  try { r.start(); } catch (err) { rec = null; target = null; say('Dictation could not start.', 'warn'); paint(); return; }
  armSilence();
  say('Listening' + (langNow() === 'ta-IN' ? ' (Tamil)' : '') + '. Esc stops.', 'on');
  paint();
}

function stop(message, kind) {
  clearTimeout(silence);
  const r = rec;
  rec = null;
  target = null;
  preview('');
  if (r) { try { r.stop(); } catch (err) { /* already ended */ } }
  if (message !== undefined) say(message, kind);
  paint();
}

function buildGroup() {
  const btn = h('button.btn.wr-xa-btn.wr-dict-btn', {
    type: 'button', 'aria-pressed': 'false',
    title: 'Speak into the line the caret is in. Uses the browser’s own speech service.',
    text: 'Dictation (Chrome)'
  });
  const langSel = h('select.wr-xa-select', { id: 'wr-dict-lang', 'aria-label': 'Dictation language' },
    LANGS.map(([v, t]) => h('option', { value: v, text: t, 'data-india-only': v === 'ta-IN' ? '' : null })));
  langSel.value = lang;
  const status = h('span.wr-xa-status', { role: 'status', 'aria-live': 'polite' });
  const prev = h('span.wr-xa-preview', { 'aria-hidden': 'true', hidden: true });
  const group = h('div.wr-xa-group.wr-dict', { role: 'group', 'aria-label': 'Dictation' },
    [btn, langSel, prev, status]);

  // Pressing the button must not take focus from the line, or the
  // blur would stop the dictation the press is starting.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => (rec ? stop('Stopped.') : begin()));
  langSel.addEventListener('change', () => { lang = langSel.value; });
  return { group, btn, lang: langSel, status, preview: prev };
}

/** Called by read-as.js whenever the bar under the gauge is (re)built. */
export function mountDictation(bar) {
  if (!SR || !bar) return;
  if (ui && ui.group.parentElement === bar) return;
  if (rec && (!target || !target.isConnected)) stop('');
  ui = ui || buildGroup();
  bar.append(ui.group);
  paint();
}

export const supported = !!SR;
export default { mountDictation, insertAtCaret, supported, enableDictation };
