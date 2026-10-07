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

   THE JOIN is by CONTENT, not by position. The scene rows and the
   script are two lists that nothing keeps in step: deleting or moving
   a row on the breakdown never touches the script, so "the Nth heading
   is the Nth row" mispaired every scene after the first edit, and the
   auto-tagger then wrote hundreds of elements onto the wrong scenes.
   matchScenes() below pairs each row with the heading that SAYS the
   same place, and reports what it could not pair instead of guessing.
   Every caller (the breakdown's suggestions, the reports' screen time
   and cast matrix, the AI shot division) reads that one function, so
   they cannot disagree about which text belongs to which scene. A
   scene row with no script text falls back to its eighths, and says so.

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
 *  is a preamble (title, FADE IN, a note) and belongs to NO scene.
 *
 *  THE ONE SLICER. src/lib/ai.js re-exports this as sliceScriptByScene
 *  and the visualize page reads it through matchScenes(). Both used to
 *  carry their own copy that kept the preamble as slice 0, so on any
 *  script with text above its first heading every scene was sent the
 *  previous scene's pages. `number` is a scene number the file carried
 *  on the heading element (.fdx), else ''; `index` is the heading's
 *  position among the headings. */
export function sliceScript(elements) {
  const out = [];
  let cur = null;
  for (const el of elements || []) {
    const text = String((el && el.text) ?? '').trim();
    if (!text) continue;
    if (el.type === 'scene') {
      cur = { heading: text, number: String(el.sceneNumber || '').trim(), index: out.length, elements: [] };
      out.push(cur);
      continue;
    }
    if (cur) cur.elements.push(el);
  }
  return out;
}

/* ---- the join: scene rows and script headings ----------------

   A heading and a scene row are compared as three normalised parts,
   INT/EXT, the place and the time of day, because that is all a scene
   row stores about where it is. Punctuation, dashes, case, a trailing
   "(2014)" and a scene number on either end are noise, and the common
   time synonyms fold the way the importer folds them (MORNING to DAY).

   Matching runs in tiers, each only over what the tier above left:
     1. 'heading'   INT/EXT, place and time all agree;
     2. 'location'  the place agrees (the row's time or INT/EXT was
                    edited, or never set);
     3. 'position'  neither, but the row sits between two matched
                    neighbours with exactly as many unmatched headings
                    between the same neighbours: a renamed row in an
                    otherwise intact run. Shown as a guess, never used
                    to write anything in bulk.
   Inside a tier, a place that occurs more than once (the canteen in
   scenes 5, 9 and 27) is settled by scene number first (the row's
   number against the heading's own number, else its position in the
   script), then by order, but ONLY when the two sides have the same
   count left. Unequal counts are ambiguous and stay unmatched. */
const TIME_WORDS = {
  DAY: 'DAY', NIGHT: 'NIGHT', DAWN: 'DAWN', DUSK: 'DUSK', CONTINUOUS: 'CONTINUOUS',
  MORNING: 'DAY', AFTERNOON: 'DAY', NOON: 'DAY', EVENING: 'NIGHT', MIDNIGHT: 'NIGHT',
  SUNRISE: 'DAWN', SUNSET: 'DUSK', LATER: '', 'MOMENTS LATER': '', 'SAME TIME': ''
};
const tokensOf = (t) => String(t || '')
  .toUpperCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/['’`]/g, '')
  .replace(/\b(INT|EXT)\.?\s*\/\s*(INT|EXT)\b\.?/g, 'I/E ')
  .replace(/\bI\s*\/\s*E\b/g, 'I/E')
  .replace(/[^\p{L}\p{N}/]+/gu, ' ')
  .replace(/(^|\s)\/|\/(\s|$)/g, ' ')
  .trim().split(/\s+/).filter(Boolean);
const IE = { INT: 'INT', EST: 'INT', EXT: 'EXT', 'I/E': 'INT/EXT', 'INT/EXT': 'INT/EXT', 'EXT/INT': 'INT/EXT' };
const SCENE_NO = /^[A-Z]?\d+[A-Z]?$/;

/** A heading (or a typed location) as { ie, place, time, number }. */
export function headingParts(heading) {
  let toks = tokensOf(heading);
  let number = '';
  if (toks.length > 1 && SCENE_NO.test(toks[0]) && IE[toks[1]]) { number = toks[0]; toks = toks.slice(1); }
  let ie = '';
  if (toks.length && IE[toks[0]]) { ie = IE[toks[0]]; toks = toks.slice(1); }
  if (toks.length > 1 && /^\d+[A-Z]?$/.test(toks[toks.length - 1])) {
    number = number || toks[toks.length - 1];
    toks = toks.slice(0, -1);
  }
  let time = '';
  for (const n of [2, 1]) {
    if (toks.length > n) {
      const tail = toks.slice(-n).join(' ');
      if (tail in TIME_WORDS) { time = TIME_WORDS[tail]; toks = toks.slice(0, -n); break; }
    }
  }
  return { ie, place: toks.join(' ').replace(/\//g, ' ').replace(/\s+/g, ' ').trim(), time, number };
}

/** A scene row as the same parts. */
export function sceneParts(scene) {
  const s = scene || {};
  const loc = headingParts(String(s.location || ''));
  const dn = String(s.dayNight || '').toUpperCase();
  return {
    ie: IE[String(s.intExt || '').toUpperCase()] || loc.ie,
    place: loc.place,
    time: dn in TIME_WORDS ? TIME_WORDS[dn] : loc.time,
    number: String(s.number || '').trim().toUpperCase()
  };
}

/** Pair every scene row with its script slice, by content.
 *  Returns { pairs: [{ scene, slice, how }] in row order, slices,
 *  unmatchedScenes, unmatchedHeadings, guessed }. `how` is 'heading',
 *  'location', 'position' or null; isConfident(how) is true for the
 *  first two only. */
export function matchScenes(scenes, elements) {
  const rows = scenes || [];
  const slices = sliceScript(elements);
  const sp = rows.map(sceneParts);
  const hp = slices.map((sl) => headingParts(sl.heading));
  const sceneTo = new Array(rows.length).fill(-1);
  const headTo = new Array(slices.length).fill(-1);
  const how = new Array(rows.length).fill(null);
  const link = (i, j, label) => { sceneTo[i] = j; headTo[j] = i; how[i] = label; };
  const headNo = (j) => (hp[j].number || slices[j].number || String(j + 1)).toUpperCase();

  const tier = (label, keyOf) => {
    const groups = new Map();
    const put = (k, side, i) => {
      if (!k) return;
      if (!groups.has(k)) groups.set(k, { s: [], h: [] });
      groups.get(k)[side].push(i);
    };
    rows.forEach((_, i) => { if (sceneTo[i] < 0) put(keyOf(sp[i]), 's', i); });
    slices.forEach((_, j) => { if (headTo[j] < 0) put(keyOf(hp[j]), 'h', j); });
    for (const { s, h } of groups.values()) {
      if (!s.length || !h.length) continue;
      if (s.length === 1 && h.length === 1) { link(s[0], h[0], label); continue; }
      // A repeated place: the scene number settles what it can.
      for (const i of s) {
        if (!sp[i].number) continue;
        const j = h.find((jj) => headTo[jj] < 0 && headNo(jj) === sp[i].number);
        if (j !== undefined) link(i, j, label);
      }
      const ls = s.filter((i) => sceneTo[i] < 0);
      const lh = h.filter((j) => headTo[j] < 0);
      if (ls.length && ls.length === lh.length) ls.forEach((i, k) => link(i, lh[k], label));
    }
  };
  tier('heading', (p) => (p.place ? [p.ie, p.place, p.time].join('|') : ''));
  tier('location', (p) => p.place);

  /* Tier 3: the gaps between matched anchors. The anchors are the
     longest run of matched rows whose headings also ascend, so one
     moved scene does not open a gap across half the film. */
  const matched = rows.map((_, i) => i).filter((i) => sceneTo[i] >= 0);
  const anchors = ascendingRun(matched, (i) => sceneTo[i]);
  const bounds = [{ i: -1, j: -1 }, ...anchors.map((i) => ({ i, j: sceneTo[i] })), { i: rows.length, j: slices.length }];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const lo = bounds[b], hi = bounds[b + 1];
    const gs = [], gh = [];
    for (let i = lo.i + 1; i < hi.i; i++) if (sceneTo[i] < 0) gs.push(i);
    for (let j = lo.j + 1; j < hi.j; j++) if (headTo[j] < 0) gh.push(j);
    // A gap pair whose places DO agree was only ambiguous (a repeated
    // place with no number to settle it); the anchors settle it.
    if (gs.length && gs.length === gh.length) {
      gs.forEach((i, k) => link(i, gh[k], sp[i].place && sp[i].place === hp[gh[k]].place ? 'location' : 'position'));
    }
  }

  const pairs = rows.map((scene, i) => ({ scene, slice: sceneTo[i] >= 0 ? slices[sceneTo[i]] : null, how: how[i] }));
  return {
    pairs,
    slices,
    unmatchedScenes: pairs.filter((p) => !p.slice).map((p) => p.scene),
    unmatchedHeadings: slices.filter((_, j) => headTo[j] < 0),
    guessed: pairs.filter((p) => p.how === 'position').length
  };
}

/** True for a pair the bulk actions may act on. */
export const isConfident = (how) => how === 'heading' || how === 'location';

/** The longest subsequence of `items` whose `val` strictly ascends. */
function ascendingRun(items, val) {
  const tails = [];
  const prev = new Array(items.length).fill(-1);
  items.forEach((it, k) => {
    const v = val(it);
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (val(items[tails[m]]) < v) lo = m + 1; else hi = m; }
    if (lo > 0) prev[k] = tails[lo - 1];
    tails[lo] = k;
  });
  const out = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(items[k]);
  return out.reverse();
}

/** What the join could not do, as sentences the pages print. Empty
 *  when there is no script, or when every row and heading paired. */
export function describeMatch(m) {
  if (!m || !m.slices.length) return [];
  const out = [];
  const ns = m.unmatchedScenes.length, nh = m.unmatchedHeadings.length;
  if (ns) {
    const nums = m.unmatchedScenes.slice(0, 8).map((s) => s.number || '—').join(', ') + (ns > 8 ? ', …' : '');
    out.push(`${ns} scene${ns === 1 ? ' has' : 's have'} no matching heading in the script (scene${ns === 1 ? '' : 's'} ${nums}).`);
  }
  if (nh) {
    const heads = m.unmatchedHeadings.slice(0, 3).map((s) => s.heading).join('; ') + (nh > 3 ? '; …' : '');
    out.push(`${nh} heading${nh === 1 ? '' : 's'} in the script ${nh === 1 ? 'has' : 'have'} no scene row: ${heads}.`);
  }
  if (m.guessed) {
    out.push(`${m.guessed} scene${m.guessed === 1 ? ' is' : 's are'} paired by position only, because the slug line and the heading disagree.`);
  }
  return out;
}

/** Scene rows paired with their script slice, by content; see matchScenes(). */
export function pairScenes(scenes, elements) {
  return matchScenes(scenes, elements).pairs;
}

/* ---- FR-602: screen time ------------------------------------ */

export function estimateSlice(slice) {
  let dialogueWords = 0, actionWords = 0, seconds = HEADING_SECONDS, speeches = 0;
  for (const el of slice.elements) {
    const t = String(el.text || '');
    if (el.type === 'dialogue') dialogueWords += words(t);
    else if (el.type === 'character') speeches++;
    /* A shot is an image on screen like an action line, so it takes the
       same rhythm. It is NOT a heading: sliceScript() above cuts only at
       `scene`, so a shot stays inside the scene it belongs to. It is kept
       out of the auto-tagger below, which reads capitals as cast
       introductions and a shot is all capitals. */
    else if (el.type === 'action' || el.type === 'shot') {
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
  const match = matchScenes(scenes, elements);
  const rows = match.pairs.map(({ scene, slice, how }) => {
    const byPage = Math.round((Number(scene.eighths) || 0) * SECONDS_PER_EIGHTH);
    if (slice && slice.elements.length) {
      const e = estimateSlice(slice);
      return { scene, heading: slice.heading, how, method: 'script', byPage, ...e };
    }
    return { scene, heading: '', how, method: 'eighths', byPage, seconds: byPage, dialogueWords: 0, actionWords: 0, speeches: 0 };
  });
  const total = rows.reduce((n, r) => n + r.seconds, 0);
  const byPage = rows.reduce((n, r) => n + r.byPage, 0);
  return { rows, total, byPage, fromScript: rows.filter((r) => r.method === 'script').length, match };
}

/* ---- the running time, with the songs in it -----------------

   A Tamil feature's songs are a fifth of its length and almost none
   of it is on the page — a song scene is a heading and a line of
   action — so screenTime() alone reads every song as a few seconds.
   This adds what the song list says each song RUNS, and compares the
   sum with a target.

   NO SONG IS COUNTED TWICE. A song with a duration REPLACES the
   page-read estimate of every scene linked to it (scene.songId): the
   recording is the truth about how long those scenes play. A song
   with no duration adds nothing, its linked scenes keep their
   estimate, and both are counted and said, so a total that is low
   because three songs have no length reads as that and not as a
   short film.

   PURE, like everything in this file. The caller passes each song's
   length in seconds and, for the per-act and per-beat split, a
   `groupOf(scene)` / `songGroupOf(song)` that answers
   { key, label, order, share } or null — so this module knows
   nothing about frameworks, stores nothing and reads nothing.

   @param screen   screenTime()'s result
   @param songs    [{ id, seconds, ... }]
   @param opts     { targetSeconds, groupOf, songGroupOf }  */
export function runtimeEstimate(screen, songs, opts = {}) {
  const rows = (screen && screen.rows) || [];
  const list = Array.isArray(songs) ? songs : [];
  const target = Math.max(0, Math.round(Number(opts.targetSeconds) || 0));
  const timed = new Map(list.filter((s) => Number(s.seconds) > 0).map((s) => [s.id, Math.round(Number(s.seconds))]));
  const groups = new Map();
  const groupFor = (g) => {
    const key = g ? String(g.key) : '';
    if (!groups.has(key)) {
      groups.set(key, {
        key, label: g ? g.label : '', order: g && Number.isFinite(g.order) ? g.order : Infinity,
        share: g && Number(g.share) > 0 ? Number(g.share) : 0,
        sceneCount: 0, sceneSeconds: 0, songCount: 0, songSeconds: 0
      });
    }
    return groups.get(key);
  };
  const ask = (fn, x) => { try { return typeof fn === 'function' ? fn(x) : null; } catch (e) { return null; } };

  let sceneSeconds = 0, covered = 0;
  for (const r of rows) {
    const g = groupFor(ask(opts.groupOf, r.scene));
    g.sceneCount += 1;
    if (r.scene && r.scene.songId && timed.has(r.scene.songId)) { covered += 1; continue; }
    sceneSeconds += r.seconds;
    g.sceneSeconds += r.seconds;
  }
  let songSeconds = 0;
  for (const s of list) {
    const sec = timed.get(s.id) || 0;
    if (!sec) continue;
    songSeconds += sec;
    const g = groupFor(ask(opts.songGroupOf, s));
    g.songCount += 1;
    g.songSeconds += sec;
  }
  const total = sceneSeconds + songSeconds;
  const out = [...groups.values()].map((g) => {
    const seconds = g.sceneSeconds + g.songSeconds;
    const tgt = target && g.share ? Math.round(target * g.share) : 0;
    return { ...g, seconds, target: tgt, delta: tgt ? seconds - tgt : 0 };
  });
  const grouped = out.filter((g) => g.key !== '').sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return {
    total,
    sceneSeconds,
    songSeconds,
    songs: list.length,
    songsTimed: timed.size,
    songsUntimed: list.length - timed.size,
    coveredScenes: covered,
    target,
    delta: target ? total - target : 0,
    groups: grouped,
    ungrouped: out.find((g) => g.key === '') || null
  };
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
  const match = matchScenes(scenes, elements);
  const pairs = match.pairs;
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
  return { characters, interactions, density, threshold, match };
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

/* A capital after a space, a hyphen, a slash or an opening bracket —
   NOT after an apostrophe, which `\b` counts as a word edge and which
   made "RAGAVAN'S FATHER" into "Ragavan'S Father" (UX audit L27). An
   O' or D' prefix is the one place a letter after one is a capital. */
export const titleCase = (s) => String(s)
  .replace(/(^|[\s\-/(])(\p{L})/gu, (m, pre, c) => pre + c.toUpperCase())
  .replace(/(^|[\s\-/(])([OoDd])(['’])(\p{L})/gu, (m, pre, o, q, c) => pre + o.toUpperCase() + q + c.toUpperCase());

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

/** Suggestions for every scene that has any. Each row carries `how`
 *  from matchScenes(), so a caller that tags in bulk can leave out the
 *  pairs that are only a guess. */
export function suggestAll(scenes, elements) {
  return suggestReport(scenes, elements).rows;
}

/** The same rows, with the join's own report beside them. */
export function suggestReport(scenes, elements) {
  const match = matchScenes(scenes, elements);
  const rows = match.pairs
    .map(({ scene, slice, how }) => ({ scene, heading: slice ? slice.heading : '', how, suggestions: suggestElements(scene, slice) }))
    .filter((r) => Object.values(r.suggestions).some((l) => l.length));
  return { rows, match };
}

export default { sliceScript, headingParts, sceneParts, matchScenes, isConfident, describeMatch, pairScenes, suggestReport, estimateSlice, screenTime, runtimeEstimate, formatDuration, cueName, castMatrix, suggestElements, suggestAll };
