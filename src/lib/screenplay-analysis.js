/* ============================================================
   SCREENPLAY ANALYSIS — screen time, the cast matrix, and what the
   action lines say is in each scene
   ------------------------------------------------------------
   PRD 2.0 FR-602, FR-603 and FR-604, as ONE module of pure functions
   over the two models that already exist: the scene rows
   (src/lib/scenes.js) and the script elements (src/lib/script.js).
   It stores nothing, and must not — every figure here is a reading of
   those two, and a stored copy of a reading is wrong the first time
   either is edited. readiness.js is the precedent.

   THE JOIN. The Nth scene heading in the script is the Nth scene row.
   That is the rule src/lib/ai.js already states and the visualize
   page already shows the user, and two opinions about which script
   text belongs to which scene would disagree the first time either
   side was reordered. A scene row with no script text falls back to
   its eighths, and says so.

   SCREEN TIME IS AN ESTIMATE, labelled as one everywhere it is shown.
   The industry rule is a page a minute; this refines it the way the
   PRD asks — dialogue against action rhythm — and keeps the page rule
   as the fallback and as the sanity check beside it:
     dialogue  spoken at ~2.6 words a second (Tamil and English
               dialogue both land near 150-160 wpm on screen), plus a
               short beat at each change of speaker;
     action    read as images, not words: every sentence takes at least
               a beat on screen however short it is, and a long one
               runs at ~3.5 words a second — which is why a page of
               terse action ("He runs. She turns. The door.") plays
               longer than its word count suggests;
     heading   two seconds to establish.
   Calibrated so that an ordinary mixed page lands near sixty seconds.
   ============================================================ */
import lexicon from '../data/element-lexicon.json';

export const DIALOGUE_WPS = 2.6;
export const ACTION_WPS = 3.5;
export const SENTENCE_FLOOR = 1.6;
export const SPEAKER_BEAT = 0.4;
export const HEADING_SECONDS = 2;
export const SECONDS_PER_EIGHTH = 7.5;   // a page a minute

const words = (t) => (String(t || '').match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/** Cut the script at each scene heading. Text before the first heading
 *  is a preamble (title, FADE IN) and belongs to no scene. */
export function sliceScript(elements) {
  const out = [];
  let cur = null;
  for (const el of elements || []) {
    const text = String((el && el.text) ?? '').trim();
    if (!text) continue;
    if (el.type === 'scene') { cur = { heading: text, elements: [] }; out.push(cur); continue; }
    if (cur) cur.elements.push(el);
  }
  return out;
}

/** Scene rows paired with their script slice, by position. */
export function pairScenes(scenes, elements) {
  const slices = sliceScript(elements);
  return (scenes || []).map((scene, i) => ({ scene, slice: slices[i] || null }));
}

/* ---- FR-602: screen time ------------------------------------ */

export function estimateSlice(slice) {
  let dialogueWords = 0, actionWords = 0, seconds = HEADING_SECONDS, speeches = 0;
  for (const el of slice.elements) {
    const t = String(el.text || '');
    if (el.type === 'dialogue') dialogueWords += words(t);
    else if (el.type === 'character') speeches++;
    else if (el.type === 'action') {
      const sentences = t.split(/(?<=[.!?…])\s+|\n+/).filter((x) => x.trim());
      for (const sn of sentences) {
        const w = words(sn);
        actionWords += w;
        seconds += Math.max(SENTENCE_FLOOR, w / ACTION_WPS);
      }
    }
    // paren and transition: no screen time of their own.
  }
  seconds += dialogueWords / DIALOGUE_WPS + speeches * SPEAKER_BEAT;
  return { seconds: Math.round(seconds), dialogueWords, actionWords, speeches };
}

/** Every scene's estimate. `method` says which rule produced it. */
export function screenTime(scenes, elements) {
  const rows = pairScenes(scenes, elements).map(({ scene, slice }) => {
    const byPage = Math.round((Number(scene.eighths) || 0) * SECONDS_PER_EIGHTH);
    if (slice && slice.elements.length) {
      const e = estimateSlice(slice);
      return { scene, heading: slice.heading, method: 'script', byPage, ...e };
    }
    return { scene, heading: '', method: 'eighths', byPage, seconds: byPage, dialogueWords: 0, actionWords: 0, speeches: 0 };
  });
  const total = rows.reduce((n, r) => n + r.seconds, 0);
  const byPage = rows.reduce((n, r) => n + r.byPage, 0);
  return { rows, total, byPage, fromScript: rows.filter((r) => r.method === 'script').length };
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/* ---- names -------------------------------------------------- */

/** A cue as a person: no extensions, no (CONT'D), upper case. */
export function cueName(t) {
  return String(t || '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONT’D)\b/gi, '')
    .replace(/[\^]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
const key = (n) => cueName(n);

/** Speaking parts introduced in capitals in action: "RAVI, 30s, ..." —
 *  a run of 2+ capital letters (words) followed by a comma or "(". */
function capsIntros(text) {
  const out = [];
  const re = /\b([A-Z][A-Z'’.-]{1,}(?:\s+[A-Z][A-Z'’.-]{1,}){0,2})\s*(?:,|\()/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].trim();
    if (/^(INT|EXT|DAY|NIGHT|CUT|FADE|V\.O|O\.S|CONT'?D|CLOSE|ANGLE|POV|SFX|INSERT|BACK|LATER)$/i.test(name)) continue;
    if (lexicon.soundCaps.words.includes(name)) continue;
    out.push(name);
  }
  return out;
}

/* ---- FR-604: the cast matrix --------------------------------- */

/** Characters × scenes. A character is in a scene if they are tagged as
 *  cast on the scene row OR have a cue in its script text — the union,
 *  because a breakdown that has not been finished and a script that
 *  has not been written are both ordinary states. */
export function castMatrix(scenes, elements) {
  const pairs = pairScenes(scenes, elements);
  const people = new Map();   // KEY -> { name, scenes: Set(sceneId), lines }
  const inScene = pairs.map(({ scene, slice }) => {
    const here = new Map();
    for (const n of (scene.elements && scene.elements.cast) || []) {
      const k = key(n); if (k) here.set(k, { name: String(n).trim(), lines: 0 });
    }
    if (slice) {
      for (const el of slice.elements) {
        if (el.type === 'character') {
          const k = key(el.text);
          if (!k) continue;
          if (!here.has(k)) here.set(k, { name: k, lines: 0 });
          here.get(k).lines++;
        }
      }
    }
    for (const [k, v] of here) {
      if (!people.has(k)) people.set(k, { key: k, name: v.name, scenes: new Set(), lines: 0 });
      const p = people.get(k);
      p.scenes.add(scene.id);
      p.lines += v.lines;
      // Prefer the breakdown's spelling ("Prakash") over a cue's capitals.
      if (p.name === k && v.name !== k) p.name = v.name;
    }
    return { scene, keys: [...here.keys()] };
  });
  const characters = [...people.values()].sort((a, b) => b.scenes.size - a.scenes.size || a.name.localeCompare(b.name));

  // Interaction: two characters share a scene.
  const pairCount = new Map();
  for (const { keys } of inScene) {
    const ks = [...keys].sort();
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const id = ks[i] + '\u0000' + ks[j];
      pairCount.set(id, (pairCount.get(id) || 0) + 1);
    }
  }
  const byKey = new Map(characters.map((c) => [c.key, c]));
  const interactions = [...pairCount.entries()]
    .map(([id, shared]) => { const [a, b] = id.split('\u0000'); return { a: byKey.get(a), b: byKey.get(b), shared }; })
    .sort((x, y) => y.shared - x.shared || x.a.name.localeCompare(y.a.name));

  // Density: how many of the cast each scene calls.
  const counts = inScene.map((r) => r.keys.length);
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  // Dense = at least three people and half again the film's median.
  const threshold = Math.max(3, Math.ceil(median * 1.5));
  const density = inScene.map((r) => ({ scene: r.scene, count: r.keys.length, keys: r.keys, high: r.keys.length >= threshold }));
  return { characters, interactions, density, threshold };
}

/* ---- FR-603: suggested elements ------------------------------ */

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (list) => new RegExp('\\b(' + [...list].sort((a, b) => b.length - a.length).map(escRe).join('|') + ')\\b', 'gi');
const RE = {
  props: phraseRe(lexicon.props),
  vehicles: phraseRe(lexicon.vehicles),
  stunts: phraseRe(lexicon.stunts),
  sound: phraseRe(lexicon.sound)
};
const CAPS_SOUND = new RegExp('\\b(' + lexicon.soundCaps.words.map(escRe).join('|') + ')\\b', 'g');

const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** What a scene's script text suggests should be on its breakdown,
 *  minus what is already tagged. Each suggestion carries `from`, the
 *  line it was read off, so the user decides with the evidence. */
export function suggestElements(scene, slice) {
  const out = { cast: [], props: [], vehicles: [], stunts: [], sound: [] };
  if (!slice) return out;
  const have = {};
  for (const cat of Object.keys(out)) {
    have[cat] = new Set(((scene.elements && scene.elements[cat]) || []).map((n) => String(n).trim().toLowerCase()));
  }
  const seen = { cast: new Set(), props: new Set(), vehicles: new Set(), stunts: new Set(), sound: new Set() };
  const add = (cat, name, from) => {
    const k = name.trim().toLowerCase();
    if (!k || have[cat].has(k) || seen[cat].has(k)) return;
    // Cast match is on the cue form, so "Prakash" tagged covers "PRAKASH".
    if (cat === 'cast' && [...have.cast].some((x) => cueName(x) === cueName(name))) return;
    seen[cat].add(k);
    out[cat].push({ name, from: String(from).slice(0, 160) });
  };
  for (const el of slice.elements) {
    const t = String(el.text || '');
    if (el.type === 'character') { const n = cueName(t); if (n) add('cast', titleCase(n.toLowerCase()), t); continue; }
    if (el.type !== 'action') continue;
    for (const n of capsIntros(t)) add('cast', titleCase(n.toLowerCase()), t);
    for (const cat of ['props', 'vehicles', 'stunts', 'sound']) {
      RE[cat].lastIndex = 0;
      let m;
      while ((m = RE[cat].exec(t))) {
        // Sound words in lower case are often prose ("the rain"); keep
        // them, but a capitalised cue is the stronger signal below.
        add(cat, m[1].toLowerCase(), t);
      }
    }
    CAPS_SOUND.lastIndex = 0;
    let m;
    while ((m = CAPS_SOUND.exec(t))) add('sound', m[1].toLowerCase(), t);
  }
  return out;
}

/** Suggestions for every scene that has any. */
export function suggestAll(scenes, elements) {
  return pairScenes(scenes, elements)
    .map(({ scene, slice }) => ({ scene, heading: slice ? slice.heading : '', suggestions: suggestElements(scene, slice) }))
    .filter((r) => Object.values(r.suggestions).some((l) => l.length));
}

export default { sliceScript, pairScenes, estimateSlice, screenTime, formatDuration, cueName, castMatrix, suggestElements, suggestAll };
