/* ============================================================
   READINESS — what is missing before this film can shoot
   ------------------------------------------------------------
   Every answer on this page is DERIVED. There is no readiness
   model, no checklist anybody ticks, and no new storage key: each
   check is a question asked of the scene model and the three models
   hanging off it. That is the same rule the steps and the command
   palette follow — a hand-written list of what exists is wrong by
   the second change — and it is why this file can be added without
   touching the storage contract at all.

   IT COMPOSES RATHER THAN RE-DERIVES. locations.js already answers
   half of this: unplacedScenes(), unscheduledScenes(), orphanDays()
   and locationIndex() exist because the breakdown and the stripboard
   needed them. Re-implementing those here would be a second opinion
   about the same data, and two opinions disagree the first time one
   of them is edited. So they are called.

   TWO SEVERITIES, AND THE LINE BETWEEN THEM IS NOT COSMETIC.

     blocker  you cannot shoot the day. A scene with no location, a
              day with no date, a location that was refused.
     gap      you can shoot, and you will regret it. No call sheet,
              no recce, a character with nobody cast.

   A check that finds nothing is reported as PASSED rather than left
   out. A list of only the failures looks identical whether the
   model is clean or the check never ran — the same reason the hue
   assertion in verify reports skipped groups out loud.

   NOTHING HERE WRITES. It is safe to call on every render.
   ============================================================ */
import Scenes from './scenes.js';
import Locations from './locations.js';
import Contacts from './contacts.js';
/* Named, because songs.js has no default export — the only one of
   these four that does not. */
import { listSongs } from './songs.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** One check's result. `items` are the offending things, named. */
function check(id, severity, label, items, hint, where) {
  return {
    id, severity, label, hint, where,
    items: items || [],
    count: (items || []).length,
    passed: !(items || []).length
  };
}

/**
 * The whole report.
 *
 * @returns {{checks: Array, blockers: number, gaps: number,
 *            ready: boolean, hasFilm: boolean}}
 *          `hasFilm` false means there are no scenes yet — the
 *          report would otherwise be a wall of green saying nothing
 *          is wrong with nothing, which is the most misleading
 *          possible answer.
 */
export function readiness() {
  const scenes = Scenes.listScenes();
  const checks = [];

  if (!scenes.length) {
    return { checks, blockers: 0, gaps: 0, ready: false, hasFilm: false };
  }

  /* ---- the scene model itself --------------------------------- */
  checks.push(check(
    'scene-location', 'blocker',
    'Scenes with no location',
    Locations.unplacedScenes(scenes).map((s) => sceneLabel(s)),
    'A scene with no location cannot be scheduled, budgeted or recced.',
    'breakdown.html#scenes'
  ));

  checks.push(check(
    'scene-cast', 'gap',
    'Scenes with nobody in them',
    scenes.filter((s) => !Locations.castOf(s).length).map((s) => sceneLabel(s)),
    'Cast tagged on a scene is what the call sheet and the day out of days are built from.',
    'breakdown.html#elements'
  ));

  checks.push(check(
    'scene-day', 'blocker',
    'Scenes not on a shoot day',
    Locations.unscheduledScenes(scenes).map((s) => sceneLabel(s)),
    'Unscheduled scenes are invisible to the stripboard and to every report after it.',
    'stripboard.html#stripboard'
  ));

  /* ---- the schedule ------------------------------------------- */
  const days = Locations.calendarDays(scenes);

  checks.push(check(
    'day-date', 'blocker',
    'Shoot days with no date',
    days.filter((d) => !String(d.date || '').trim()).map((d) => 'Day ' + d.day),
    'Without a date a day cannot be checked against anybody’s availability, or put on a call sheet.',
    'stripboard.html#dood'
  ));

  /* A call sheet claims a day by listing that day's scenes, so the
     link is read through sceneIds rather than through a day number
     the sheet does not store. */
  const sheets = Contacts.listCallSheets();
  const coveredScenes = new Set();
  sheets.forEach((cs) => (cs.sceneIds || []).forEach((id) => coveredScenes.add(id)));
  checks.push(check(
    'day-callsheet', 'gap',
    'Shoot days with no call sheet',
    days.filter((d) => !d.scenes.some((s) => coveredScenes.has(s.id)))
        .map((d) => 'Day ' + d.day),
    'The call sheet is the only document most of the unit will read.',
    'reports.html#sides'
  ));

  /* ---- locations ---------------------------------------------- */
  const index = Locations.locationIndex(scenes);

  checks.push(check(
    'loc-recce', 'gap',
    'Locations with no recce',
    index.filter((l) => !l.recce || !norm(l.recce.address)).map((l) => l.name),
    'A location nobody has stood in is a location nobody can budget or light.',
    'plan.html'
  ));

  checks.push(check(
    'loc-refused', 'blocker',
    'Locations that were refused',
    index.filter((l) => l.recce && l.recce.permission === 'refused').map((l) => l.name),
    'These scenes need somewhere else to happen before the day arrives.',
    'plan.html'
  ));

  checks.push(check(
    'loc-permission', 'gap',
    'Locations with permission still open',
    index.filter((l) => {
      const p = l.recce && l.recce.permission;
      return p === 'unknown' || p === 'scouting' || p === 'requested' || !p;
    }).map((l) => l.name),
    'Asked is not approved. A permission that lands late is a day lost.',
    'plan.html'
  ));

  /* ---- people -------------------------------------------------- */
  /* A character is cast when SOMEBODY carries that name — contacts
     put the character in the role column, which is the convention
     the Dragon sample documents and the call sheet already reads. */
  const contacts = Contacts.listContacts();
  const claimed  = new Set();
  contacts.forEach((c) => {
    if (norm(c.role)) claimed.add(norm(c.role));
    if (norm(c.name)) claimed.add(norm(c.name));
  });
  const characters = [];
  scenes.forEach((s) => Locations.castOf(s).forEach((n) => {
    if (norm(n) && !characters.some((x) => norm(x) === norm(n))) characters.push(n);
  }));
  checks.push(check(
    'cast-uncast', 'gap',
    'Characters with nobody cast',
    characters.filter((n) => !claimed.has(norm(n))),
    'Nobody to call, and nobody to pay. Add them in Contacts with the character in the role column.',
    'contacts.html'
  ));

  /* ---- songs, because a Tamil feature carries four to six ------ */
  const songs = listSongs();
  if (songs.length) {
    const placed = new Set(scenes.map((s) => String(s.songId || '')).filter(Boolean));
    checks.push(check(
      'song-unplaced', 'gap',
      'Songs with no scene',
      songs.filter((s) => !placed.has(String(s.id))).map((s) => s.title || 'Untitled song'),
      'A song shot as a block still needs scenes, days and a location like any other unit.',
      'plan.html'
    ));
  }

  const blockers = checks.filter((c) => c.severity === 'blocker' && !c.passed).length;
  const gaps     = checks.filter((c) => c.severity === 'gap'     && !c.passed).length;

  return { checks, blockers, gaps, ready: blockers === 0 && gaps === 0, hasFilm: true };
}

/** "12 · INT KITCHEN — DAY", or a usable stand-in when unnumbered. */
export function sceneLabel(s) {
  const n   = String((s && s.number) || '').trim();
  const loc = String((s && s.location) || '').trim();
  const head = [s && s.intExt, loc].filter(Boolean).join(' ');
  const tail = (s && s.dayNight) ? ' — ' + s.dayNight : '';
  const body = (head + tail).trim();
  if (n && body) return n + ' · ' + body;
  if (n) return 'Scene ' + n;
  return body || 'Untitled scene';
}

export default { readiness, sceneLabel };
