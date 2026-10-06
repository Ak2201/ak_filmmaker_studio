/* ============================================================
   THE BASIC BREAKDOWN — a shot division from rules, no AI key
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, Revision 3, §1c. Visualize's
   "Draft a shot division" did nothing without an API key. This is
   the floor under it: the coverage a 1st AD would sketch on the
   back of the sides in five minutes, read straight off the script.

   PURE, AND IT STORES NOTHING. `basicShotDivision(jobs)` takes the
   same jobs the AI path takes and resolves to the SAME shape
   `draftShotDivision()` in src/lib/ai.js resolves to —
   { byScene: Map<sceneId, shot[]>, truncated, model } — so the page
   that writes the result writes it through one loop, append-only,
   with one Undo, whichever path drafted it. The caller marks every
   shot `rules: true` (src/lib/shots.js), the way the AI path marks
   `ai: true`; this module never touches storage.

   THE ONE DIFFERENCE IN THE JOB. The AI is sent the scene as
   flattened text, because that is what a prompt is. Rules need to
   know a cue from a speech from an action line, so a job here
   carries the script ELEMENTS of its slice (`elements`, from
   sliceScript()/matchScenes() in src/lib/screenplay-analysis.js —
   the one slicer, never a second copy). `basicJobs()` builds them.

   ONLY THE VOCABULARY THE SHOT MODEL HOLDS. Every size, angle and
   movement is one of SHOT_SIZES / SHOT_ANGLES / SHOT_MOVEMENTS. The
   model has no "POV" angle and no "insert" size, so a POV is an
   eye-level shot whose description says POV, an insert is an ECU
   whose description says Insert, and an aerial is an overhead
   drone shot. Inventing a value the picker cannot show would be a
   shot the shot list cannot edit.

   DETERMINISTIC. Same script in, same shots out: no clock, no
   randomness, no dependence on Map iteration beyond insertion order.
   ============================================================ */
import { SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS } from './shots.js';
import { matchScenes, isConfident, cueName, headingParts, suggestElements } from './screenplay-analysis.js';

export const BASIC_MODEL = 'basic rules';
export const MIN_SHOTS = 2;
export const MAX_SHOTS = 12;

const SIZES = new Set(SHOT_SIZES.map((s) => s.id));
const EYE = SHOT_ANGLES[0];          // 'eye level'
const STATIC = SHOT_MOVEMENTS[0];    // 'static'

/* A conventional starting lens per size. A suggestion on a draft,
   editable like every other field — and what a camera assistant
   would pencil in before the DP has said anything. */
const LENS = {
  EWS: '18mm', WS: '24mm', LS: '28mm', MLS: '35mm',
  MS: '35mm', MCU: '50mm', CU: '85mm', ECU: '100mm macro'
};

/* Priority when a scene has more shots than its length allows. Lower
   survives. Within one priority the LATER shot goes first, so what is
   kept still reads in script order from the top of the scene. */
const P = { master: 0, cue: 2, talk: 2, move: 3, pov: 4, single: 5, insert: 6, filler: 7 };

/* ---- reading a shot line -------------------------------------- */

/* A `shot` element, or an action line that OPENS with a camera cue
   ("INSERT — the binder."). Order matters: EXTREME CLOSE before
   CLOSE, TOP SHOT before anything that might match "SHOT". */
const CUES = [
  { re: /^(EXTREME CLOSE[- ]?UP|EXTREME CLOSE|ECU|XCU|BCU)\b/, size: 'ECU', label: 'ECU' },
  { re: /^INSERT\b/, size: 'ECU', label: 'Insert' },
  { re: /^(CLOSE ON|CLOSE[- ]?UP|CLOSE|CU)\b/, size: 'CU', label: 'CU' },
  { re: /^(AERIAL|DRONE)\b/, size: 'EWS', angle: 'overhead', movement: 'drone', label: 'Aerial' },
  { re: /^(TOP SHOT|TOP DOWN|TOP-DOWN|OVERHEAD|BIRD'?S[- ]EYE)\b/, size: 'WS', angle: 'overhead', label: 'Top shot' },
  { re: /^(?:[A-Z][A-Z'’. -]*'S\s+)?POV\b/, size: 'MS', label: 'POV' },
  { re: /^ANGLE ON\b/, size: 'MS', label: 'Angle on' },
  { re: /^(TRACKING|TRACK WITH|MOVING WITH)\b/, size: 'MS', movement: 'track', label: 'Tracking' },
  { re: /^(EXTREME WIDE|WIDE ON|WIDE SHOT|WIDE|ESTABLISHING)\b/, size: 'WS', label: 'Wide' },
  { re: /^(TWO[- ]SHOT|2[- ]SHOT|MEDIUM SHOT|MEDIUM)\b/, size: 'MS', label: 'Medium' }
];

/** The cue a line opens with, and the rest of the line after it.
    Cues are CAPITALS in an action line ("Close to the window, he…"
    is prose, "CLOSE ON the medal" is a shot); a `shot` element is a
    shot whatever its case, so it is read upper-cased. */
function readCue(text, isShot) {
  const t = String(text || '').trim();
  const probe = isShot ? t.toUpperCase() : t;
  for (const c of CUES) {
    const m = probe.match(c.re);
    if (m) return { ...c, rest: t.slice(m[0].length).replace(/^[\s:—–-]+/, '') };
  }
  return null;
}

/** Angle words inside a shot line override the cue's default. */
function angleIn(text) {
  if (/\blow[- ]angle\b/i.test(text)) return 'low';
  if (/\bhigh[- ]angle\b/i.test(text)) return 'high';
  if (/\bdutch\b/i.test(text)) return 'dutch';
  return null;
}

/* ---- reading action ------------------------------------------- */

/* "Run" alone is useless — on the sample every hit was "a run of
   codes", "the chairs ran out", "applause runs longer". A body moving
   through space is a locomotion verb WITH a direction after it; the
   chase and flight verbs carry their own. */
const RUN = /\b(?:(?:runs|ran|running|races|raced|racing|sprints|sprinted|sprinting|dashes|dashed|bolts|bolted|hurries|hurried|rushes|rushed)\s+(?:down|up|across|after|toward|towards|through|into|out of|off|back|from|along|past|away|for|to|round|around)|chases|chased|chasing|gives chase|flees|fled|fleeing|escapes|escaped|escaping)\b/i;
const FIGHT = /\b(fights?|fighting|punches|throws a punch|shoves|shoved|scuffles?|brawls?|wrestles|wrestling|lunges|lunged|tackles|tackled|grapples|grappling|struggles with|struggling with)\b/i;
/* "Nobody looks at him" is a line about NOT looking. */
const NO_LOOK = /\b(nobody|no one|no-one|none of them|never)\s*$/i;
const LOOK = /\b(sees|looks (?:at|up at|down at|across at|over at)|stares at|staring at|watches|glances (?:at|over at)|notices|spots)\b/i;

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
/** The first few words of a line, quoted, for a description. */
function excerpt(t, n = 7) {
  const w = clean(t).split(' ');
  return '"' + w.slice(0, n).join(' ').replace(/[,;:—–-]+$/, '') + (w.length > n ? '…' : '') + '"';
}
const OFFSCREEN = /\((?:[^)]*\b(?:V\.?\s?O|O\.?\s?S|O\.?\s?C)\b[^)]*)\)/i;
// Not \b: "RAGAVAN'S" must become "Ragavan's", not "Ragavan'S".
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());

/* A name a line opens with, in capitals, the way a screenplay
   introduces a person: "DEEPA looks at the screen." */
const LEAD_CAPS = /^([A-Z][A-Z'’.-]+(?:\s+[A-Z][A-Z'’.-]+){0,2})\b(?![a-z])/;
const NOT_A_NAME = /^(INT|EXT|DAY|NIGHT|CUT|FADE|INSERT|CLOSE|ANGLE|POV|SFX|BACK|LATER|THE|A|AN|WE|HE|SHE|IT|THEY|SUPER|TITLE|ON)$/;
const listNames = (names) =>
  names.length <= 1 ? (names[0] || '')
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

/** The place in a heading, as words: "Engineering College - Quad". */
function placeOf(heading) {
  let t = clean(heading)
    .replace(/^\d+[A-Z]?\s+/, '')
    .replace(/^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST)\.?\s*/i, '');
  t = t.replace(/\s*\([^)]*\)\s*$/, '');
  const dash = t.split(/\s+[-–—]\s+/);
  if (dash.length > 1) dash.pop();     // the time of day
  return titleCase(dash.join(' - ').trim());
}

function isExterior(job) {
  const ie = String(job.intExt || '').toUpperCase();
  if (ie) return ie !== 'INT';
  const h = headingParts(job.heading || job.slug || '');
  return h.ie === 'EXT' || h.ie === 'INT/EXT';
}

/* ---- one scene ------------------------------------------------- */

/** Shots for one job, in script order, clamped. [] for a scene with
    nothing to read. */
export function shotsForScene(job) {
  const els = (job && Array.isArray(job.elements) ? job.elements : [])
    .filter((e) => e && clean(e.text));
  if (!els.some((e) => e.type === 'action' || e.type === 'dialogue' || e.type === 'shot')) return [];

  const out = [];
  const seen = new Set();
  const push = (pri, key, shot) => {
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    const size = SIZES.has(shot.size) ? shot.size : 'MS';
    out.push({
      pri,
      shot: {
        size,
        angle: SHOT_ANGLES.includes(shot.angle) ? shot.angle : EYE,
        movement: SHOT_MOVEMENTS.includes(shot.movement) ? shot.movement : STATIC,
        lens: shot.lens != null ? shot.lens : LENS[size],
        description: clean(shot.description).slice(0, 400)
      }
    });
  };

  /* Who is in it: every on-screen cue, in order of first line. */
  const speakers = [];
  for (const e of els) {
    if (e.type !== 'character' || OFFSCREEN.test(e.text)) continue;
    const n = cueName(e.text);
    if (n && !speakers.includes(n)) speakers.push(n);
  }
  const cast = speakers.length ? speakers
    : ((job.cast && job.cast.length) ? job.cast.map((n) => cueName(n)).filter(Boolean) : []);

  /* 1. The master. */
  const place = placeOf(job.heading || job.slug || '') || 'the location';
  const ext = isExterior(job);
  const who = cast.length ? ', with ' + listNames(cast.slice(0, 4)) + (cast.length > 4 ? ' and the others' : '') : '';
  push(P.master, 'master', {
    size: 'WS',
    description: ext
      ? 'Establishing — ' + place + '. Wide master to set the geography' + who + '.'
      : 'Master — wide on ' + place + ', holding the whole scene' + who + '.'
  });

  /* 2. Walk the scene. Dialogue is gathered into exchanges — a run of
     cues and speeches that one action beat does not break, two do. */
  let exchange = null;       // { speakers: [], first: Map(name -> line) }
  let actionGap = 0;
  let lastNamed = '';
  let pendingCue = '';
  let moves = 0, povs = 0;

  const known = () => [...new Set([...cast, ...speakers])];
  const namedIn = (text) => {
    const up = String(text).toUpperCase();
    let best = '', at = Infinity;
    for (const n of known()) {
      const i = up.search(new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'));
      if (i >= 0 && i < at) { at = i; best = n; }
    }
    if (best) return best;
    // A new person introduced in capitals: "DEEPA, 24, at the desk."
    const lead = String(text).match(LEAD_CAPS);
    if (lead && /^\s*[,(]/.test(String(text).slice(lead[0].length))
      && !NOT_A_NAME.test(lead[1].split(/\s+/)[0])) return lead[1];
    return '';
  };

  /* Who is doing the looking: the subject of the clause the verb is
     in. A known name wins; a pronoun means the last person named; a
     short noun phrase ("the invigilator") is used as written; anything
     longer is not guessed at. */
  const lookerOf = (before, fallback) => {
    const clause = clean(String(before).split(/[.!?;]\s+/).pop()).replace(/,$/, '');
    const name = namedIn(clause);
    if (name) return name;
    const words = clause.split(' ').filter(Boolean);
    // A pronoun stays a pronoun: the last name in the scene is as likely
    // to be the one being looked AT, and a wrong name is worse than none.
    if (words.length === 1 && /^(he|she|they|we|i)$/i.test(words[0])) return words[0].toLowerCase();
    if (words.length >= 1 && words.length <= 3) {
      return clause === clause.toUpperCase() ? clause : clause.charAt(0).toLowerCase() + clause.slice(1);
    }
    return fallback && !words.length ? fallback : 'the character';
  };

  const closeExchange = () => {
    if (!exchange) return;
    const sp = exchange.speakers;
    const line = (n) => exchange.first.get(n) ? ' — from ' + excerpt(exchange.first.get(n)) : '';
    if (sp.length === 1) {
      push(P.talk, 'mcu:' + sp[0], {
        size: 'MCU', description: 'MCU on ' + sp[0] + line(sp[0]) + '.'
      });
    } else if (sp.length === 2) {
      const [a, b] = sp;
      push(P.talk, 'ots:' + a + '>' + b, {
        size: 'MCU', description: 'OTS on ' + a + ', over ' + b + "'s shoulder" + line(a) + '.'
      });
      push(P.talk, 'ots:' + b + '>' + a, {
        size: 'MCU', description: 'OTS on ' + b + ', over ' + a + "'s shoulder" + line(b) + '.'
      });
    } else if (sp.length > 2) {
      push(P.talk, 'group:' + [...sp].sort().join(','), {
        size: 'MS', description: 'Group MS — ' + listNames(sp) + ', holding the exchange.'
      });
      sp.slice(0, 4).forEach((n) => push(P.single, 'mcu:' + n, {
        size: 'MCU', description: 'Single on ' + n + line(n) + '.'
      }));
    }
    exchange = null;
  };

  for (const e of els) {
    const text = clean(e.text);
    if (e.type === 'character') {
      actionGap = 0;
      if (OFFSCREEN.test(e.text)) { pendingCue = ''; continue; }
      pendingCue = cueName(text);
      if (!pendingCue) continue;
      if (!exchange) exchange = { speakers: [], first: new Map() };
      if (!exchange.speakers.includes(pendingCue)) exchange.speakers.push(pendingCue);
      lastNamed = pendingCue;
      continue;
    }
    if (e.type === 'dialogue') {
      if (exchange && pendingCue && !exchange.first.has(pendingCue)) exchange.first.set(pendingCue, text);
      continue;
    }
    if (e.type === 'paren') continue;
    if (e.type === 'transition') { closeExchange(); continue; }

    // action or shot
    const cue = readCue(text, e.type === 'shot');
    if (e.type === 'shot' || cue) {
      closeExchange();
      const c = cue || { size: 'MS', label: 'Shot', rest: text };
      const angle = angleIn(text) || c.angle || EYE;
      // A POV keeps its owner ("RAGAVAN'S POV — the board").
      const desc = c.rest && c.label !== 'POV' ? c.label + ' — ' + c.rest : text;
      push(P.cue, 'cue:' + text.toUpperCase(), {
        size: c.size, angle, movement: c.movement || STATIC, description: desc
      });
      actionGap = 0;
      continue;
    }

    actionGap++;
    if (actionGap >= 2) closeExchange();
    const named = namedIn(text);
    if (named) lastNamed = named;

    if (moves < 2 && RUN.test(text)) {
      moves++;
      push(P.move, '', {
        size: 'LS', movement: 'track',
        description: 'Tracking with ' + (named || lastNamed || 'the action') + ' — ' + excerpt(text, 9) + '.'
      });
    } else if (moves < 2 && FIGHT.test(text)) {
      moves++;
      push(P.move, '', {
        size: 'MS', movement: 'handheld',
        description: 'Handheld, in the fight — ' + excerpt(text, 9) + '.'
      });
    } else if (povs < 2 && LOOK.test(text) && !NO_LOOK.test(text.slice(0, text.match(LOOK).index))) {
      povs++;
      const m = text.match(LOOK);
      const seen = clean(text.slice(m.index + m[0].length)).replace(/^[,;:]\s*/, '');
      const who = lookerOf(text.slice(0, m.index), lastNamed);
      // "watches him do it." says nothing on its own; the line does.
      push(P.pov, '', {
        size: 'MS',
        description: seen.split(' ').length >= 2 && !/^(it|him|her|them|me|us)\b/i.test(seen)
          ? 'POV — what ' + who + ' sees: ' + excerpt(seen, 8) + '.'
          : 'POV — from ' + excerpt(text, 9) + '.'
      });
    }
  }
  closeExchange();

  /* 3. Inserts for the props the script names (the auto-tagger's own
     reading, against an empty breakdown so a prop already tagged
     still counts), unless a shot line already covers it. */
  const slice = { heading: job.heading || '', elements: els };
  const props = suggestElements({ elements: {} }, slice).props;
  const cueText = out.map((o) => o.shot.description.toLowerCase()).join(' \n ');
  let inserts = 0;
  for (const p of props) {
    if (inserts >= 2) break;
    if (cueText.includes(p.name.toLowerCase())) continue;
    inserts++;
    push(P.insert, 'insert:' + p.name, {
      size: 'ECU', description: 'Insert — the ' + p.name + '.'
    });
  }

  /* 4. A floor of two. A scene of action only, with nothing above,
     still wants something closer than the master. */
  if (out.length < MIN_SHOTS) {
    const first = els.find((x) => x.type === 'action');
    const subject = cast[0] || lastNamed;
    push(P.filler, 'filler', subject
      ? { size: 'MS', description: 'MS on ' + subject + (first ? ' — ' + excerpt(first.text, 9) : '') + '.' }
      : { size: 'MS', description: 'Closer on the action' + (first ? ' — ' + excerpt(first.text, 9) : '') + '.' });
  }

  return clamp(out, capFor(job)).map((o) => o.shot);
}

/** How many setups a scene of this length can carry: two, plus one
    for every quarter page, at most twelve. */
export function capFor(job) {
  const e = Number(job && job.eighths);
  const eighths = Number.isFinite(e) && e > 0 ? e : 8;
  return Math.max(MIN_SHOTS, Math.min(MAX_SHOTS, 2 + Math.ceil(eighths / 2)));
}

function clamp(list, cap) {
  const keep = list.map((o, i) => ({ ...o, i }));
  while (keep.length > cap) {
    let drop = 0;
    for (let k = 1; k < keep.length; k++) {
      const a = keep[k], b = keep[drop];
      if (a.pri > b.pri || (a.pri === b.pri && a.i > b.i)) drop = k;
    }
    keep.splice(drop, 1);
  }
  return keep;
}

/* ---- the job list and the run ---------------------------------- */

const slugOf = (s) => [s.intExt, s.location, s.dayNight].filter(Boolean).join(' · ');

/**
 * Jobs for the rules, from the scene rows and the script.
 *   only           a Set of scene ids to include (default: all)
 *   confidentOnly  leave out pairs matchScenes() only guessed by
 *                  position — a bulk write never acts on a guess
 * Scenes with no script slice are left out: there is nothing to read.
 */
export function basicJobs(scenes, elements, { only = null, confidentOnly = false } = {}) {
  const m = matchScenes(scenes || [], elements || []);
  const jobs = [];
  for (const { scene, slice, how } of m.pairs) {
    if (!slice) continue;
    if (only && !only.has(scene.id)) continue;
    if (confidentOnly && !isConfident(how)) continue;
    jobs.push(jobFor(scene, slice));
  }
  return jobs;
}

/** One job from a scene row and its slice. */
export function jobFor(scene, slice) {
  return {
    sceneId: scene.id,
    number: scene.number,
    slug: slugOf(scene),
    eighths: scene.eighths,
    synopsis: scene.synopsis,
    intExt: scene.intExt,
    cast: (scene.elements && scene.elements.cast) || [],
    heading: slice ? slice.heading : '',
    elements: slice ? slice.elements : []
  };
}

/**
 * The basic breakdown. Same contract as draftShotDivision(): resolves
 * to { byScene: Map<sceneId, shot[]>, truncated: false, model }, and a
 * scene with nothing to read has no entry. Async only so the two paths
 * are called the same way; it does no I/O.
 */
export async function basicShotDivision(jobs) {
  return basicShotDivisionSync(jobs);
}

export function basicShotDivisionSync(jobs) {
  const byScene = new Map();
  for (const job of jobs || []) {
    if (!job || !job.sceneId) continue;
    const shots = shotsForScene(job);
    if (shots.length) byScene.set(String(job.sceneId), shots);
  }
  return { byScene, truncated: false, model: BASIC_MODEL };
}

export default { basicShotDivision, basicShotDivisionSync, basicJobs, jobFor, shotsForScene, capFor, BASIC_MODEL };
