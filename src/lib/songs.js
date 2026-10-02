/* ============================================================
   SONGS — the production unit nothing in this studio knew about
   ------------------------------------------------------------
   A Tamil feature carries four to six songs and the app had zero
   concept of one: no mention in scenes.js, none in budget.js. That
   is not a missing field, it is a missing unit of production. A song
   is not a scene that happens to have music in it —

     it is decided BEFORE the script locks, often before a scene
       exists to attach it to, because the song count is part of what
       a producer sells the film on;
     it is shot as its own BLOCK, frequently by a second unit, on its
       own days, in locations the rest of the film never visits;
     it carries its own crew — choreographer, dancers, playback — none
       of which appears on a dialogue scene's breakdown;
     and it sits at a STRUCTURAL position in the story, between beats,
       which is why the beat sheet is the right place to place it.

   So songs are their own model, and a scene points at one with
   `songId`. Not the reverse, and not both: scene rows were once
   written as flat `sm_N_*` keys AND inside a `_sceneMap` array, and
   the indices renumbered on reload and stranded stale keys that
   inflated the progress denominator forever. One representation per
   thing. The song owns its own identity; the scene owns the link.

   WHAT IS STORED AND WHAT IS DERIVED. `days` and `locations` are
   the PLANNED figures, typed by a person who may have no scenes yet.
   Once scenes are linked, the real figures are derivable from them —
   and this module reports BOTH rather than overwriting the plan. The
   budget already settled that argument: `USE N DAYS IN THE ESTIMATE`
   fills only the day fields left blank and says how many it left
   alone, because a hand-set figure is a decision, not a gap.

   NO RATES ARE INVENTED HERE. There is no published Chennai rate
   card for choreography, dancers or playback, and the 2022
   FEFSI-TFPC wage MoU expired on 9 March 2025 and is in Madras HC
   mediation, so there is no union floor to quote either. This module
   models the UNITS — how many dancers, how many days, which unit —
   and leaves the money to the budget page, where the user types a
   figure and the provenance overlay says what is and is not checked.
   A plausible-looking dancer day-rate would be worse than a blank.
   ============================================================ */

import './store.js';   // must evaluate before anything reads localStorage
import { listScenes } from './scenes.js';

export const SONGS_KEY = 'fms_songs_v1';

/* The kinds a Tamil song list actually distinguishes. These are
   scheduling and budgeting categories, not genres: an intro song and
   a montage cost and schedule nothing like each other, which is the
   only reason a field like this earns its place. */
export const SONG_KINDS = [
  { id: 'intro',   label: 'Intro',    hint: 'hero introduction — crowd, set pieces, the expensive one' },
  { id: 'duet',    label: 'Duet',     hint: 'two leads, often the travel/outdoor song' },
  { id: 'melody',  label: 'Melody',   hint: 'one or two people, mostly performance' },
  { id: 'kuthu',   label: 'Kuthu',    hint: 'dance number — dancers, a floor, long hours' },
  { id: 'folk',    label: 'Folk',     hint: 'gaana or village idiom, usually a crowd' },
  { id: 'pathos',  label: 'Pathos',   hint: 'sad song, usually cut from existing coverage' },
  { id: 'montage', label: 'Montage',  hint: 'passage of time — the cheapest, often second unit' },
  { id: 'title',   label: 'Title',    hint: 'titles or end credits' }
];
const kindIds = SONG_KINDS.map((k) => k.id);
export const kindLabel = (id) => (SONG_KINDS.find((k) => k.id === id) || SONG_KINDS[1]).label;

/* Where the recording has got to. A song that is not recorded cannot
   be picturised, so this is a scheduling dependency rather than a
   status badge — the one field here that can block a shoot day. */
export const PLAYBACK_STATES = [
  { id: 'none',     label: 'Not started', ready: false },
  { id: 'tune',     label: 'Tune locked', ready: false },
  { id: 'scratch',  label: 'Scratch track', ready: false },
  { id: 'recorded', label: 'Recorded', ready: true },
  { id: 'final',    label: 'Final mix', ready: true }
];
const playbackIds = PLAYBACK_STATES.map((p) => p.id);
export const playbackLabel = (id) =>
  (PLAYBACK_STATES.find((p) => p.id === id) || PLAYBACK_STATES[0]).label;
/** Can this song be shot yet? Picturisation needs a track to play. */
export const canPicturise = (song) =>
  (PLAYBACK_STATES.find((p) => p.id === song.playback) || PLAYBACK_STATES[0]).ready;

export const UNITS = [
  { id: 'main',   label: 'Main unit' },
  { id: 'second', label: 'Second unit' }
];

let seq = 0;
const uid = () => 'sg' + Date.now().toString(36) + (seq++).toString(36);

export function blankSong(patch = {}) {
  const s = {
    id: uid(),
    number: '',
    title: '',
    situation: '',        // what the song is doing in the story
    kind: 'duet',
    placement: '',        // a Save the Cat beat id — see scriptgen.js
    picturisation: '',    // how it is shot, in prose
    locations: '',        // PLANNED locations, free text; see the note above
    days: 0,              // PLANNED shoot days; 0 = not decided
    dancers: 0,
    choreographer: '',
    musicDirector: '',
    singers: '',
    playback: 'none',
    unit: 'main',
    ...patch
  };
  // Vocabulary is re-checked rather than trusted: an unknown value
  // falls back instead of being stored, the same rule ai.js applies
  // to everything a model returns.
  if (!kindIds.includes(s.kind)) s.kind = 'duet';
  if (!playbackIds.includes(s.playback)) s.playback = 'none';
  if (!UNITS.some((u) => u.id === s.unit)) s.unit = 'main';
  s.days = Math.max(0, Number(s.days) || 0);
  s.dancers = Math.max(0, Math.round(Number(s.dancers) || 0));
  return s;
}

/* ---- persistence -------------------------------------------
   Plain localStorage so store.js's proxy scopes it to the open
   project. Array.isArray on the way in: an empty array is truthy and
   a stored null is not an array, and that pair has already given a
   returning user a table with zero rows and no way to add one. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(SONGS_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { songs: [] };
  try {
    const parsed = JSON.parse(raw);
    return { songs: Array.isArray(parsed.songs) ? parsed.songs : [] };
  } catch (e) {
    return { songs: [] };
  }
}

function writeAll(data) {
  try { localStorage.setItem(SONGS_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}

export function listSongs() {
  return readAll().songs.map((s) => ({ ...blankSong(), ...s }));
}

export function saveSongs(songs) {
  return writeAll({ songs: (songs || []).map((s) => blankSong(s)) });
}

export function addSong(patch) {
  const songs = listSongs();
  const song = blankSong({ number: String(songs.length + 1), ...patch });
  songs.push(song);
  saveSongs(songs);
  return song;
}

export function updateSong(id, patch) {
  const songs = listSongs();
  const i = songs.findIndex((s) => s.id === id);
  if (i === -1) return null;
  songs[i] = blankSong({ ...songs[i], ...patch, id });
  saveSongs(songs);
  return songs[i];
}

/** Remove a song. Scenes linked to it are NOT deleted — they are
    unlinked by the caller. Deleting a song must never delete pages. */
export function removeSong(id) {
  const songs = listSongs().filter((s) => s.id !== id);
  saveSongs(songs);
  return songs;
}

export function moveSong(id, delta) {
  const songs = listSongs();
  const i = songs.findIndex((s) => s.id === id);
  if (i === -1) return songs;
  const j = i + delta;
  if (j < 0 || j >= songs.length) return songs;
  [songs[i], songs[j]] = [songs[j], songs[i]];
  // Renumber, because the number IS the position in the song list and
  // a producer counts "song three" by where it falls.
  songs.forEach((s, n) => { s.number = String(n + 1); });
  saveSongs(songs);
  return songs;
}

/* ---- derived ------------------------------------------------
   Everything below READS. Nothing here writes, which is what lets
   the stripboard group by song without the board changing the data
   it is grouping — the same discipline `view.group` already keeps
   there, for the same reason. */

/** Scenes linked to a song, in script order. */
export function scenesFor(songId, scenes) {
  return (scenes || listScenes()).filter((s) => s.songId === songId);
}

/**
 * Plan versus script, per song, without overwriting either.
 *
 *   plannedDays   what a person typed, or 0
 *   scriptDays    distinct shoot days across its linked scenes
 *   eighths       page length of the linked scenes
 *   sceneCount    how many scenes carry this songId
 *   disagrees     both figures exist and differ — reported, not fixed
 *
 * `disagrees` is the whole point. A song planned for two days whose
 * scenes are spread over four is a schedule problem the producer
 * needs to SEE, and silently replacing the plan with the derived
 * number would delete the evidence that there was a disagreement.
 */
export function songFacts(song, scenes) {
  const all = scenes || listScenes();
  const mine = scenesFor(song.id, all);
  /* The SAME day rule stripboard.js uses — a positive integer, and
     nothing else. Counting distinct non-empty strings instead would
     score a stray "0" as a shoot day, and then this page and the
     board would report different day counts for the same song, which
     is the kind of disagreement nobody debugs because both numbers
     look plausible. */
  const days = new Set(
    mine.map((s) => parseInt(s.shootDay, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
  );
  const eighths = mine.reduce((n, s) => n + (Number(s.eighths) || 0), 0);
  const scriptDays = days.size;
  const planned = Number(song.days) || 0;
  return {
    sceneCount: mine.length,
    eighths,
    scriptDays,
    plannedDays: planned,
    disagrees: planned > 0 && scriptDays > 0 && planned !== scriptDays,
    // what the schedule should actually budget for: the script if it
    // has something to say, otherwise the plan
    effectiveDays: scriptDays || planned,
    ready: canPicturise(song)
  };
}

/** Studio-level totals for a header or a report. */
export function songTotals(songs, scenes) {
  const list = songs || listSongs();
  const all = scenes || listScenes();
  let days = 0, eighths = 0, dancers = 0, linked = 0, blocked = 0;
  for (const s of list) {
    const f = songFacts(s, all);
    days += f.effectiveDays;
    eighths += f.eighths;
    dancers = Math.max(dancers, Number(s.dancers) || 0);
    linked += f.sceneCount;
    if (!f.ready && f.effectiveDays) blocked += 1;
  }
  return {
    count: list.length,
    days,
    eighths,
    peakDancers: dancers,
    linkedScenes: linked,
    // songs with shoot days planned and no usable track to play
    blocked
  };
}

/** Songs that have no scenes yet. Not a fault — most songs are
    decided before the scenes exist — but it is what the breakdown
    needs to say instead of showing an empty block. */
export const unlinked = (songs, scenes) =>
  (songs || listSongs()).filter((s) => !scenesFor(s.id, scenes).length);
