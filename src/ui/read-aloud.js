/* ============================================================
   READ ALOUD — a table read in the browser's own voices
   ------------------------------------------------------------
   The Web Speech SYNTHESIS API. The words and the voices are chosen by
   src/lib/read-aloud.js (pure, tested in Node); this file is the view:
   a row under the page's top bar with Play from the caret, Play this
   scene, Pause and Stop, the line being read marked on the page, and a
   small voice panel.

   NOTHING IS UPLOADED. speechSynthesis runs in the browser (a "Google"
   network voice, where the browser lists one, is the browser's own
   business and reaches its own service, not this page: no fetch here,
   so connect-src never sees it). Nothing is written to the script. The
   writer's choices — a voice per character, the narrator, skip
   parentheticals, speed — are the `readAloud` pref in
   fms_studio_prefs_v1, written on a change only, never while reading.

   HIDDEN WHERE THE BROWSER HAS NO SYNTHESIS: readAloudSupported() is
   false, mountReadAloud() returns null and the page leaves the menu
   item out.

   THE QUEUE IS ONE UTTERANCE AT A TIME. Chrome drops a long queue and
   stops a long utterance, so each line is cut into sentence-sized
   chunks (chunk()) and the next is spoken from the previous one's end
   event. A token says which run a late event belongs to: Stop, or a new
   Play, makes every callback of the old run a no-op. The utterance is
   also held in `current`, because Chrome garbage-collects one that
   nothing references and its end event never fires.
   ============================================================ */
import { h } from '../lib/dom.js';
import { button } from './kit/index.js';
import { utterancesFor, castOf, pickNarrator, assignVoices, parseReadPrefs, chunk } from '../lib/read-aloud.js';
import { readReadAloudPref, saveReadAloudPref } from '../lib/chrome-prefs.js';

export const readAloudSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

const RATES = [['0.8', 'Slower'], ['1', 'Normal'], ['1.2', 'Faster'], ['1.5', 'Fastest']];

/**
 * o = {
 *   getDoc,       () => the script blob ({ elements })
 *   editor,       the script editor (indexOf, rowOf, scrollToEl)
 *   currentId,    () => the id of the line the caret is in (or null)
 *   host,         () => the element the panel goes in (#scTop)
 *   say           (msg) => a status line
 * }
 */
export function mountReadAloud(o) {
  if (!readAloudSupported()) return null;
  const synth = window.speechSynthesis;
  let prefs = parseReadPrefs(readReadAloudPref());
  let voices = [];
  let panel = null, statusNode = null, playBtn = null, sceneBtn = null, pauseBtn = null, stopBtn = null;
  let voiceBox = null, skipBox = null, rateSel = null, narratorSel = null, castHost = null;
  let queue = [];
  let qi = 0;
  let token = 0;
  let state = 'idle';             // idle | playing | paused
  let current = null;             // the live utterance (see the header)
  let marked = null;              // the row carrying .sc-reading
  const els = () => (o.getDoc() || {}).elements || [];

  const save = () => saveReadAloudPref({ ...prefs, rate: prefs.rate === 1 ? undefined : prefs.rate, voices: Object.keys(prefs.voices).length ? prefs.voices : undefined, narrator: prefs.narrator || undefined, skipParens: prefs.skipParens || undefined });

  const loadVoices = () => {
    voices = (synth.getVoices() || []).map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, native: v }));
    if (panel && !panel.hidden) buildVoices();
  };
  loadVoices();
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);

  const narrator = () => pickNarrator(voices, navigator.language || document.documentElement.lang || 'en', prefs.narrator);
  const assignment = () => {
    const n = narrator();
    return assignVoices(castOf(els()), voices, prefs.voices, n ? n.voiceURI : '');
  };

  /* ---- marking the line (DOM only) ---- */
  function unmark() {
    if (marked) marked.classList.remove('sc-reading');
    marked = null;
  }
  function mark(id) {
    unmark();
    const row = o.editor.rowOf(id);
    if (!row) { o.editor.scrollToEl(id); return; }
    row.classList.add('sc-reading');
    marked = row;
    o.editor.scrollToEl(id);
  }

  function paint() {
    if (!panel) return;
    const playing = state !== 'idle';
    pauseBtn.disabled = !playing;
    stopBtn.disabled = !playing;
    const label = state === 'paused' ? 'Resume' : 'Pause';
    if (pauseBtn.dataset.label !== label) {
      pauseBtn.dataset.label = label;
      pauseBtn.setAttribute('aria-label', label);
      pauseBtn.title = label;
      const t = pauseBtn.querySelector('span:not(.sym)');
      if (t) t.textContent = label;
      const ic = pauseBtn.querySelector('.sym');
      if (ic) ic.textContent = state === 'paused' ? 'play_arrow' : 'pause';
    }
  }
  const tell = (msg) => { if (statusNode && statusNode.textContent !== msg) statusNode.textContent = msg; };

  /* ---- the run ---- */
  function finish(msg) {
    token++;
    state = 'idle';
    current = null;
    unmark();
    tell(msg || '');
    paint();
  }
  function stop(msg) {
    token++;
    try { synth.cancel(); } catch (e) { /* nothing speaking */ }
    finish(msg === undefined ? 'Stopped.' : msg);
  }

  function speakItem(tok) {
    if (tok !== token) return;
    if (qi >= queue.length) { finish('Finished.'); return; }
    const item = queue[qi];
    if (item.first) mark(item.id);
    const u = new window.SpeechSynthesisUtterance(item.text);
    const v = item.voice && item.voice.native;
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = prefs.rate;
    const advance = () => { if (tok === token) { qi++; speakItem(tok); } };
    u.onend = advance;
    u.onerror = (ev) => {
      if (tok !== token) return;
      if (ev && (ev.error === 'canceled' || ev.error === 'interrupted')) return;
      advance();   // one line the voice cannot say must not end the read
    };
    current = u;
    try { synth.speak(u); } catch (e) { console.warn('[read-aloud]', e); finish('Reading could not start in this browser.'); }
  }

  function play(scope) {
    if (!voices.length) loadVoices();
    const list = els();
    const at = Math.max(0, o.editor.indexOf(o.currentId() || '') );
    const lines = utterancesFor(list, { from: at, scope, skipParens: prefs.skipParens });
    if (!lines.length) { tell('Nothing to read from here.'); return; }
    stop('');
    const who = assignment();
    const n = narrator();
    const byURI = new Map(voices.map((v) => [v.voiceURI, v]));
    queue = [];
    for (const ln of lines) {
      const voice = ln.role === 'speaker' ? byURI.get(who[ln.speaker]) || n : n;
      chunk(ln.text).forEach((text, k) => queue.push({ id: ln.id, text, voice, first: k === 0 }));
    }
    qi = 0;
    state = 'playing';
    tell(scope === 'scene' ? 'Reading this scene…' : 'Reading from here…');
    paint();
    speakItem(token);
  }

  function togglePause() {
    if (state === 'playing') { try { synth.pause(); } catch (e) { /* ignore */ } state = 'paused'; tell('Paused.'); }
    else if (state === 'paused') { try { synth.resume(); } catch (e) { /* ignore */ } state = 'playing'; tell('Reading…'); }
    paint();
  }

  /* ---- the panel ---- */
  const voiceLabel = (v) => v.name + ' (' + v.lang + ')';
  function voiceSelect(id, label, value, onPick, autoLabel) {
    const sel = h('select.sc-ra-sel', { id, 'aria-label': label });
    sel.append(h('option', { value: '', text: autoLabel }));
    voices.forEach((v) => sel.append(h('option', { value: v.voiceURI, text: voiceLabel(v) })));
    sel.value = value || '';
    if (sel.value !== (value || '')) sel.value = '';
    sel.addEventListener('change', () => onPick(sel.value));
    return sel;
  }
  function buildVoices() {
    if (!voiceBox) return;
    if (!voices.length) {
      voiceBox.replaceChildren(h('p.sc-ra-note', { text: 'This browser lists no voices yet. They can take a moment to load.' }));
      return;
    }
    const n = narrator();
    const who = assignment();
    const row = (labelText, sel) => h('label.sc-ra-row', {}, [h('span.sc-ra-name', { text: labelText }), sel]);
    narratorSel = voiceSelect('scRaNarrator', 'Narrator voice', prefs.narrator, (uri) => {
      prefs.narrator = uri;
      save();
      buildVoices();
    }, 'Automatic' + (n ? ' (' + n.name + ')' : ''));
    const cast = castOf(els());
    castHost = h('div.sc-ra-cast', {}, cast.length
      ? cast.map((name, k) => {
        const auto = voices.find((v) => v.voiceURI === who[name]);
        return row(name, voiceSelect('scRaV' + k, 'Voice for ' + name, prefs.voices[name], (uri) => {
          if (uri) prefs.voices[name] = uri; else delete prefs.voices[name];
          save();
          buildVoices();
        }, 'Automatic' + (auto ? ' (' + auto.name + ')' : '')));
      })
      : [h('p.sc-ra-note', { text: 'No characters yet. Each cue in the script gets a voice here.' })]);
    voiceBox.replaceChildren(row('Narrator', narratorSel), castHost);
  }

  function build() {
    playBtn = button({ label: 'Play from here', icon: 'play_arrow', variant: 'secondary', size: 'sm', action: 'ra-play' });
    sceneBtn = button({ label: 'Play scene', icon: 'record_voice_over', variant: 'secondary', size: 'sm', action: 'ra-scene' });
    pauseBtn = button({ label: 'Pause', icon: 'pause', variant: 'ghost', size: 'sm', action: 'ra-pause' });
    stopBtn = button({ label: 'Stop', icon: 'stop', variant: 'ghost', size: 'sm', action: 'ra-stop' });
    statusNode = h('span.sc-ra-status', { role: 'status', 'aria-live': 'polite' });
    skipBox = h('input', { id: 'scRaSkip', type: 'checkbox' });
    skipBox.checked = prefs.skipParens;
    rateSel = h('select.sc-ra-sel', { id: 'scRaRate', 'aria-label': 'Speed' }, RATES.map(([v, t]) => h('option', { value: v, text: t })));
    rateSel.value = String(prefs.rate);
    if (rateSel.value !== String(prefs.rate)) rateSel.value = '1';
    voiceBox = h('div.sc-ra-voices', { hidden: true });
    const voicesBtn = button({ label: 'Voices', icon: 'expand_more', variant: 'ghost', size: 'sm', action: 'ra-voices' });
    voicesBtn.setAttribute('aria-expanded', 'false');
    panel = h('div#scRead.sc-ra', { role: 'region', 'aria-label': 'Read aloud', hidden: true }, [
      h('div.sc-ra-acts', {}, [playBtn, sceneBtn, pauseBtn, stopBtn, voicesBtn, statusNode]),
      h('div.sc-ra-opts', {}, [
        h('label.sc-find-opt', { for: 'scRaSkip' }, [skipBox, h('span', { text: 'Skip parentheticals' })]),
        h('label.sc-find-opt', { for: 'scRaRate' }, [h('span', { text: 'Speed' }), rateSel])
      ]),
      voiceBox,
      button({ label: 'Close read aloud', icon: 'close', iconOnly: true, variant: 'ghost', size: 'sm', action: 'ra-close', class: 'sc-ra-x' })
    ]);
    panel.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      const a = b.dataset.action;
      if (a === 'ra-play') play('cursor');
      else if (a === 'ra-scene') play('scene');
      else if (a === 'ra-pause') togglePause();
      else if (a === 'ra-stop') stop();
      else if (a === 'ra-close') close();
      else if (a === 'ra-voices') {
        voiceBox.hidden = !voiceBox.hidden;
        b.setAttribute('aria-expanded', String(!voiceBox.hidden));
        if (!voiceBox.hidden) buildVoices();
      }
    });
    skipBox.addEventListener('change', () => { prefs.skipParens = skipBox.checked; save(); });
    rateSel.addEventListener('change', () => { prefs.rate = Number(rateSel.value) || 1; save(); });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    paint();
  }

  function open() {
    const host = o.host();
    if (!host) return;
    if (!panel) build();
    if (panel.parentNode !== host) host.append(panel);
    panel.hidden = false;
    if (!voiceBox.hidden) buildVoices();
    playBtn.focus();
  }
  function close() {
    stop('');
    if (panel) panel.hidden = true;
    const id = o.currentId();
    if (id) o.editor.focusEl(id);
  }
  /* A page that is going away must not keep talking. */
  window.addEventListener('pagehide', () => { try { synth.cancel(); } catch (e) { /* ignore */ } });

  return { open, close, stop, play, isOpen: () => !!panel && !panel.hidden };
}

export default { mountReadAloud, readAloudSupported };
