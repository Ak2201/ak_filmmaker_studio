/* ============================================================
   READ ALOUD — the table read, as pure functions
   ------------------------------------------------------------
   The Web Speech synthesis half lives in src/ui/read-aloud.js; this
   file decides WHAT is said and WITH WHICH voice, so it runs in Node
   (npm run test:read-aloud) with no speechSynthesis anywhere.

   Nothing here touches storage. The writer's choices (a voice per
   character, the narrator, skip parentheticals) are held by the view
   in `readAloud` inside fms_studio_prefs_v1.

   WHAT IS READ. The narrator reads headings, action, shots,
   transitions, act breaks and (unless skipped) parentheticals; a cue
   itself is never read, it only says whose voice the dialogue under it
   takes. Dialogue with no cue above it is read by the narrator. A voice
   speaks the words, never "(CONT'D)" — a cue's extensions are not text
   anyone says.

   VOICES. A voice is { voiceURI, name, lang }. The pool is the voices
   in the narrator's language (the browser lists dozens, in every
   language: a Tamil script read by an English voice is noise). A name
   starts at a position taken from a hash of the name and probes forward
   to the next voice nobody has, so the same cast gets the same voices
   on every visit and two characters share a voice only when there are
   more characters than voices. A voice the writer picked wins, but only
   while the browser still lists it.
   ============================================================ */

/** A cue's speaker: extensions and the dual mark dropped, upper case. */
export function speakerOf(text) {
  return String(text ?? '').replace(/\([^)]*\)/g, ' ').replace(/\^/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

const NARRATED = new Set(['scene', 'action', 'shot', 'transition', 'act', 'centered', 'lyrics']);

/** Every utterance for a read, in script order:
    [{ id, index, role: 'narrator' | 'speaker', speaker, text }].
    opts: { from (index), scope: 'cursor' | 'scene' | 'all', skipParens } */
export function utterancesFor(elements, opts = {}) {
  const list = Array.isArray(elements) ? elements : [];
  const scope = opts.scope || 'cursor';
  let from = Math.max(0, Math.min(Number(opts.from) || 0, Math.max(0, list.length - 1)));
  let to = list.length;
  if (scope === 'all') from = 0;
  if (scope === 'scene') {
    // The scene the line is in: back to its heading, forward to the next.
    while (from > 0 && !(list[from] && list[from].type === 'scene')) from--;
    to = list.findIndex((e, i) => i > from && e && e.type === 'scene');
    if (to < 0) to = list.length;
  }
  const out = [];
  let speaker = '';
  /* The speaker in force at `from`: a read that starts in the middle of a
     speech still needs to know whose it is. */
  for (let i = from; i >= 0; i--) {
    const t = list[i] && list[i].type;
    if (t === 'character') { speaker = speakerOf(list[i].text); break; }
    if (t !== 'dialogue' && t !== 'paren') break;
  }
  for (let i = from; i < to; i++) {
    const el = list[i];
    if (!el) continue;
    const text = String(el.text ?? '').replace(/\s+/g, ' ').trim();
    if (el.type === 'character') { speaker = speakerOf(el.text); continue; }
    if (!NARRATED.has(el.type) && el.type !== 'dialogue' && el.type !== 'paren') { speaker = ''; continue; }
    if (NARRATED.has(el.type)) speaker = '';
    if (!text) continue;
    if (el.type === 'paren') {
      if (opts.skipParens) continue;
      out.push({ id: el.id, index: i, role: 'narrator', speaker: '', text: text.replace(/^\(|\)$/g, '') });
      continue;
    }
    if (el.type === 'dialogue') {
      out.push({ id: el.id, index: i, role: speaker ? 'speaker' : 'narrator', speaker, text });
      continue;
    }
    out.push({ id: el.id, index: i, role: 'narrator', speaker: '', text });
  }
  return out;
}

/** The distinct speakers of a script, in order of first appearance. */
export function castOf(elements) {
  const seen = [];
  for (const el of elements || []) {
    if (el && el.type === 'character') {
      const n = speakerOf(el.text);
      if (n && !seen.includes(n)) seen.push(n);
    }
  }
  return seen;
}

const langOf = (v) => String((v && v.lang) || '').replace('_', '-').toLowerCase();
const primary = (l) => String(l || '').toLowerCase().split(/[-_]/)[0];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The narrator: the writer's pick if listed, else the first voice that
    speaks `lang` exactly (en-IN), else its language (en), else any. */
export function pickNarrator(voices, lang, savedURI) {
  const list = Array.isArray(voices) ? voices : [];
  if (!list.length) return null;
  const saved = savedURI && list.find((v) => v.voiceURI === savedURI);
  if (saved) return saved;
  const want = String(lang || 'en').replace('_', '-').toLowerCase();
  const sorted = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return sorted.find((v) => langOf(v) === want)
    || sorted.find((v) => primary(langOf(v)) === primary(want))
    || sorted[0];
}

/** A voice per name: { NAME: voiceURI }. `saved` is the writer's own
    choices ({ NAME: voiceURI }); `narratorURI` is kept out of the pool
    while another voice exists, so the narrator is not also a character. */
export function assignVoices(names, voices, saved = {}, narratorURI = '') {
  const all = Array.isArray(voices) ? voices : [];
  const out = {};
  if (!all.length) return out;
  const narrator = all.find((v) => v.voiceURI === narratorURI) || null;
  let pool = narrator ? all.filter((v) => primary(langOf(v)) === primary(langOf(narrator))) : all.slice();
  if (!pool.length) pool = all.slice();
  pool.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.voiceURI).localeCompare(String(b.voiceURI)));
  if (narrator && pool.length > 1) pool = pool.filter((v) => v.voiceURI !== narrator.voiceURI);
  const listed = new Set(all.map((v) => v.voiceURI));
  const taken = new Set();
  const order = [...new Set(names || [])].sort();
  for (const n of order) {
    const mine = saved && saved[n];
    if (mine && listed.has(mine)) { out[n] = mine; taken.add(mine); }
  }
  for (const n of order) {
    if (out[n]) continue;
    let k = hash(n) % pool.length;
    for (let step = 0; step < pool.length && taken.has(pool[k].voiceURI); step++) k = (k + 1) % pool.length;
    out[n] = pool[k].voiceURI;
    taken.add(out[n]);
    if (taken.size >= pool.length) taken.clear();   // more characters than voices: start sharing
  }
  return out;
}

/** A line as sentence-sized chunks for the synthesiser. Chrome cuts a long
    utterance off after about fifteen seconds on several voices, and a
    chunk that ends at a sentence is a natural place for a breath anyway.
    Each chunk is at most `max` characters unless one sentence is longer
    (it is then split at its last space before `max`). */
export function chunk(text, max = 220) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  let cur = '';
  const push = () => { if (cur) { out.push(cur); cur = ''; } };
  for (const sentence of t.split(/(?<=[.!?\u2026])\s+/)) {
    let rest = sentence;
    while (rest.length > max) {
      let at = rest.lastIndexOf(' ', max);
      if (at < max / 2) at = max;
      push();
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (cur && (cur + ' ' + rest).length > max) push();
    cur = cur ? cur + ' ' + rest : rest;
  }
  push();
  return out;
}

/** The `readAloud` pref, cleaned: unknown fields dropped, voices a map of strings. */
export function parseReadPrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const voices = {};
  if (r.voices && typeof r.voices === 'object') {
    for (const [k, v] of Object.entries(r.voices)) if (typeof v === 'string' && v) voices[String(k).slice(0, 80)] = v;
  }
  const rate = Number(r.rate);
  return {
    skipParens: r.skipParens === true,
    narrator: typeof r.narrator === 'string' ? r.narrator : '',
    voices,
    rate: rate >= 0.5 && rate <= 2 ? rate : 1
  };
}

export default { chunk, speakerOf, utterancesFor, castOf, pickNarrator, assignVoices, parseReadPrefs };
