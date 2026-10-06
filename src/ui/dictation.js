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
   ============================================================ */
import { h } from '../lib/dom.js';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;

const SILENCE_MS = 8000;
const LANGS = [
  ['en-IN', 'English (India)'],
  ['ta-IN', 'Tamil — inserts Tamil script']
];

let lang = 'en-IN';
let rec = null;
let target = null;        // the textarea being dictated into
let lastField = null;     // the last script line that had focus
let silence = 0;
let ui = null;

const isField = (n) => !!(n && n.matches && n.matches('#wr-page .wr-text[data-el-field="text"]'));

document.addEventListener('focusin', (e) => { if (isField(e.target)) lastField = e.target; });
document.addEventListener('focusout', (e) => {
  if (rec && e.target === target) stop('Stopped: the line lost focus.');
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

function start() {
  const ta = (isField(document.activeElement) && document.activeElement)
    || (lastField && lastField.isConnected ? lastField : null);
  if (!ta) { say('Click into a line of the script first, then press Dictation.', 'warn'); return; }
  let r;
  try { r = new SR(); } catch (err) { say('Dictation could not start in this browser.', 'warn'); return; }
  r.lang = lang;
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
      if (res.isFinal) insertAtCaret(target, t);
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
  say('Listening' + (lang === 'ta-IN' ? ' (Tamil)' : '') + '. Esc stops.', 'on');
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
    LANGS.map(([v, t]) => h('option', { value: v, text: t })));
  langSel.value = lang;
  const status = h('span.wr-xa-status', { role: 'status', 'aria-live': 'polite' });
  const prev = h('span.wr-xa-preview', { 'aria-hidden': 'true', hidden: true });
  const group = h('div.wr-xa-group.wr-dict', { role: 'group', 'aria-label': 'Dictation' },
    [btn, langSel, prev, status]);

  // Pressing the button must not take focus from the line, or the
  // blur would stop the dictation the press is starting.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => (rec ? stop('Stopped.') : start()));
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
export default { mountDictation, insertAtCaret, supported };
