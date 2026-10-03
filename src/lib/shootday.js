/* ============================================================
   SHOOT DAY — the only screen that is about TODAY
   ------------------------------------------------------------
   Every other scene-derived view answers a planning question:
   what is in the film, what order, who is needed, what it costs.
   This one answers "what are we shooting now, and did we get it",
   and the difference changes what it is allowed to assume.

   IT IS THE ONE VIEW THAT WRITES BACK. The chain has run one way
   until now — scenes feed the breakdown, the stripboard, the day
   out of days and the call sheet, and none of them tell the scene
   anything. Marking a scene shot is the day answering the plan.
   That is one new FIELD on an existing record (scenes.shotState),
   not a new model and not a new key: blankScene() spreads under
   every stored row, so scenes written before it exist read back as
   unshot.

   NO CLOCK IN THE DERIVATION. pickDay() looks at today's date, and
   that is a choice a CALLER makes, not something baked into a
   report — the oracle cannot hold a clock, and a function whose
   answer changes at midnight is one that cannot be tested. So the
   date comparison lives in one named function and everything else
   takes a day number.

   NOTHING HERE IS SORTED BY SCENE NUMBER. Scenes come back in the
   order the stripboard put them, because that IS the shooting
   order and re-sorting would quietly discard the AD's work.
   ============================================================ */
import Scenes, { totalEighths, formatEighths } from './scenes.js';
import Locations from './locations.js';

/** Done enough to not shoot again. 'part' is NOT done. */
const isDone = (s) => s.shotState === 'shot' || s.shotState === 'dropped';

/**
 * Every shoot day with its own progress.
 *
 * Built on calendarDays(), which already groups scenes by day and
 * collects that day's cast and locations — this adds only the
 * question calendarDays has no reason to ask.
 */
export function days(scenes) {
  const list = scenes || Scenes.listScenes();
  return Locations.calendarDays(list).map((d) => {
    const done  = d.scenes.filter(isDone);
    const total = totalEighths(d.scenes);
    return {
      ...d,
      done:      done.length,
      remaining: d.scenes.length - done.length,
      complete:  d.scenes.length > 0 && done.length === d.scenes.length,
      eighthsDone:  totalEighths(done),
      eighthsTotal: total,
      pagesDone:  formatEighths(totalEighths(done)),
      pagesTotal: formatEighths(total)
    };
  });
}

/**
 * Which day to open on.
 *
 * Today by date if one matches, else the first day with work left,
 * else the last day — a wrapped shoot should open on the end of it
 * rather than bouncing back to day one.
 *
 * `now` is a parameter so a test can pin it. The default is the
 * only place in this module that reads a clock.
 */
export function pickDay(scenes, now) {
  const all = days(scenes);
  if (!all.length) return 0;
  const today = toISODate(now || new Date());
  const match = all.find((d) => String(d.date || '').slice(0, 10) === today);
  if (match) return match.day;
  const next = all.find((d) => !d.complete);
  return (next || all[all.length - 1]).day;
}

/** Local calendar date, not UTC — the day the person is standing in. */
export function toISODate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

/** One day, with its scenes in shooting order. */
export function detail(day, scenes) {
  const all = days(scenes);
  return all.find((d) => d.day === Number(day)) || null;
}

/**
 * Mark a scene, or clear it by passing ''.
 *
 * Writes through updateScene so the storage proxy, the save event
 * and every subscriber behave exactly as they do for any other
 * scene edit. Nothing special happens on the day.
 */
export function mark(sceneId, state) {
  const ok = ['', 'shot', 'part', 'dropped'];
  const next = ok.includes(state) ? state : '';
  return Scenes.updateScene(sceneId, {
    shotState: next,
    shotAt: next ? new Date().toISOString() : ''
  });
}

/** The whole production, for a line that says how far in we are. */
export function overall(scenes) {
  const list = scenes || Scenes.listScenes();
  const done = list.filter(isDone);
  return {
    scenes: list.length,
    done: done.length,
    eighthsDone: totalEighths(done),
    eighthsTotal: totalEighths(list),
    pagesDone: formatEighths(totalEighths(done)),
    pagesTotal: formatEighths(totalEighths(list))
  };
}

export default { days, pickDay, detail, mark, overall, toISODate };
