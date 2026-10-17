/* ============================================================
   STRIPBOARD — the page's logic, without the page
   ------------------------------------------------------------
   What src/pages/stripboard.js works out that needs no DOM: the
   groupings (a VIEW, never a write), the day out of days, the dates
   the board prints, the screen time per day and per strip, the
   implied company moves a day has not covered, the location-first
   schedule, and the sentences a move, a lock or the PDF subtitle say.
   Nothing here touches `document` (docs/ARCHITECTURE.md, rule L2) or
   imports the view (L1).

   script.js and screenplay-analysis.js are NOT imported here: the
   page loads them on demand so neither is in its first paint, and a
   static import from this file would undo that. Whatever needs them
   takes their result as an argument.
   ============================================================ */
import { formatEighths, totalEighths } from './scenes.js';
import Locations from './locations.js';
import * as Songs from './songs.js';
import DPR from './dpr.js';

export const CAST = 'cast';

export const GROUPINGS = [
  { id: 'script',   label: 'Script order' },
  { id: 'location', label: 'Location' },
  { id: 'time',     label: 'Day / night' },
  { id: 'day',      label: 'Shoot day' },
  // A song is shot as a block, usually by its own unit, so seeing its
  // strips together is how its days get scheduled at all.
  { id: 'song',     label: 'Song' }
];

export const TIME_ORDER = ['DAY', 'DAWN', 'DUSK', 'NIGHT', 'CONTINUOUS'];

/* ---- small readers ------------------------------------------
   `shootDay` is a field the board adds to the scene. It may be
   absent on every scene written before it existed, so it is read
   through one function that always answers an integer: 0 means
   unscheduled. */
export function shootDayOf(scene) {
  const n = parseInt(scene.shootDay, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export const castOf = (scene) => (scene.elements && scene.elements[CAST]) || [];
export const locationOf = (scene) => String(scene.location || '').trim();

/** Every day number in use, ascending. */
export function shootDays(scenes) {
  return [...new Set(scenes.map(shootDayOf).filter(Boolean))].sort((a, b) => a - b);
}

/* ---- grouping — a view, never a write ------------------------
   `songsById` is the songs indexed by id (read once per pass by the
   caller); `dayOrders` answers Locations.listDayOrder() and is only
   asked in the shoot-day grouping. */
export function groupScenes(scenes, mode, { songsById = {}, dayOrders = () => Locations.listDayOrder() } = {}) {
  if (mode === 'script') {
    return [{ key: 'script', label: 'Script order', scenes }];
  }
  const buckets = new Map();
  const put = (key, label, scene) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, scenes: [] });
    buckets.get(key).scenes.push(scene);
  };

  for (const scene of scenes) {
    if (mode === 'location') {
      const loc = locationOf(scene);
      put(loc ? loc.toLowerCase() : '￿', loc || 'Location not set', scene);
    } else if (mode === 'time') {
      const label = `${scene.intExt} · ${scene.dayNight}`;
      put(label, label, scene);
    } else if (mode === 'song') {
      /* Reads songs.js and writes nothing, like every other grouping
         here. The sort key is the song's POSITION, not its title, so
         the blocks come out in the order a producer counts them —
         "song three" means the third one. */
      const sg = songsById[scene.songId];
      if (sg) {
        const n = parseInt(sg.number, 10);
        put(Number.isFinite(n) ? n : 9e8,
          (sg.number ? sg.number + '. ' : '') + (sg.title || Songs.kindLabel(sg.kind)), scene);
      } else {
        put(Infinity, 'Not part of a song', scene);
      }
    } else {
      const d = shootDayOf(scene);
      put(d ? d : Infinity, d ? `Day ${d}` : 'Not scheduled yet', scene);
    }
  }

  const groups = [...buckets.values()];
  if (mode === 'day') {
    /* The one grouping with an order of its own: each day's strips in
       the order the AD put them (locations.js), unlisted ones after in
       script order. The unscheduled group stays in script order. */
    const orders = dayOrders();
    for (const g of groups) {
      if (g.key !== Infinity) g.scenes = Locations.orderByList(g.scenes, orders[String(g.key)]);
    }
  }
  if (mode === 'day' || mode === 'song') {
    groups.sort((a, b) => a.key - b.key);
  } else if (mode === 'time') {
    const rank = (g) => {
      const [ie, tod] = g.key.split(' · ');
      const t = TIME_ORDER.indexOf(tod);
      return (t < 0 ? TIME_ORDER.length : t) * 10 + (ie === 'EXT' ? 1 : ie === 'INT/EXT' ? 2 : 0);
    };
    groups.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  } else {
    groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }
  return groups;
}

/* ---- dates ----------------------------------------------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** 'YYYY-MM-DD' as "Mon 27 Oct 2025"; '' when it is not a date. */
export function localDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}
/** Today as 'YYYY-MM-DD', in the device's own day. */
export const todayISO = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/* ---- the header's figures -------------------------------------- */
/** The Shoot days card's note: how many days are dated, the calendar
 *  span and the weeks. `span` is Board.calendarSpan(). */
export function daysNote(dayCount, span) {
  if (!dayCount) return '';
  return span
    ? `${span.dated < span.total ? span.dated + ' dated · ' : ''}${span.spanDays} calendar ${span.spanDays === 1 ? 'day' : 'days'} · ${span.weeks} ${span.weeks === 1 ? 'week' : 'weeks'}`
    : 'scheduled · no dates yet';
}
/** The Est. runtime card's note and tone, against the target minutes. */
export function runtimeNote(mins, target) {
  let note = 'estimated from the script';
  let tone = null;
  if (target) {
    const d = mins - target;
    note = `target ${target} min · ${d === 0 ? 'on target' : (d > 0 ? d + ' over' : -d + ' under')}`;
    tone = d > 0 ? 'warn' : 'ok';
  }
  return { note, tone };
}

/* ---- screen time ------------------------------------------------
   `st` is screenplay-analysis's screenTime(scenes, elements). Only a
   scene the script actually measures counts. */
export function screenTimeByDay(st) {
  const byDay = new Map(), byScene = new Map();
  if (!st || !st.fromScript) return { byDay, byScene };
  for (const r of st.rows) {
    if (r.method !== 'script') continue;
    const sec = Number(r.seconds) || 0;
    byScene.set(r.scene.id, sec);
    const d = shootDayOf(r.scene);
    if (d) byDay.set(d, (byDay.get(d) || 0) + sec);
  }
  return { byDay, byScene };
}

/* ---- a day's banners ------------------------------------------- */
/** The company moves the day IMPLIES that no written move banner
 *  covers, keyed by the scene they follow. Derived, stored nowhere. */
export function uncoveredMoves(dayScenes, dayBanners) {
  const covered = new Set(dayBanners.filter((b) => b.kind === 'move').map((b) => b.after));
  return new Map(DPR.impliedMoves(dayScenes)
    .filter((m) => !covered.has(m.after)).map((m) => [m.after, m]));
}
/** The first implied move on a day no written move covers yet — the
 *  one the AD was about to type. */
export function nextUncoveredMove(dayScenes, dayBanners) {
  const taken = new Set(dayBanners.filter((b) => b.kind === 'move').map((b) => b.after));
  return DPR.impliedMoves(dayScenes).find((m) => !taken.has(m.after));
}

/* ---- day out of days -----------------------------------------
   SW on the first day a performer works, W on every working day after
   it, H on a day inside their span they do NOT work, WF on the last.
   SWF when the whole part is one day. Every value is computed here and
   none of it is stored. `index` is Scenes.elementIndex(). */
export const MARK = { start: 'SW', work: 'W', hold: 'H', finish: 'WF', only: 'SWF' };
export const LONG = {
  start: 'starts work', work: 'works', hold: 'on hold', finish: 'works and finishes',
  only: 'starts, works and finishes', off: 'not needed'
};

export function doodRows(scenes, days, index) {
  const dayOf = new Map(scenes.map((s) => [s.id, shootDayOf(s)]));
  return index
    .filter((item) => item.category === CAST)
    .map((item) => {
      const working = new Set(
        item.scenes.map((s) => dayOf.get(s.id)).filter((d) => d && d > 0)
      );
      const sorted = [...working].sort((a, b) => a - b);
      const first = sorted[0] || 0;
      const last = sorted[sorted.length - 1] || 0;
      let hold = 0;
      const cells = days.map((d) => {
        if (working.has(d)) {
          if (first === last) return { day: d, mark: MARK.only, kind: 'only' };
          if (d === first) return { day: d, mark: MARK.start, kind: 'start' };
          if (d === last) return { day: d, mark: MARK.finish, kind: 'finish' };
          return { day: d, mark: MARK.work, kind: 'work' };
        }
        if (first && d > first && d < last) { hold += 1; return { day: d, mark: MARK.hold, kind: 'hold' }; }
        return { day: d, mark: '', kind: 'off' };
      });
      return {
        name: item.name,
        scenes: item.scenes.length,
        work: working.size,
        hold,
        span: first ? (last - first + 1) : 0,
        cells
      };
    })
    .sort((a, b) => b.work - a.work || a.name.localeCompare(b.name));
}

/* ---- moves ------------------------------------------------------- */
/** What a move did, in the sentence the live region reads. `scene` is
 *  the moved scene (or undefined); `total` the strips now on its day. */
export function describeMove(rec, scene, total) {
  const n = scene && scene.number ? `Scene ${scene.number}` : 'The scene';
  if (!rec.toDay) return `${n} is off the schedule.`;
  const where = rec.fromDay === rec.toDay ? `moved to position ${rec.index + 1} of ${total} on Day ${rec.toDay}`
    : `moved to Day ${rec.toDay}, position ${rec.index + 1} of ${total}`;
  return `${n} ${where}.`;
}

/** Schedule by location: each place becomes a day, in script order.
 *  Returns the scene → day plan; the caller writes it. */
export function scheduleByLocation(scenes) {
  const dayFor = new Map();
  const plan = [];
  for (const scene of scenes) {
    const key = locationOf(scene).toLowerCase() || '￿';
    if (!dayFor.has(key)) dayFor.set(key, dayFor.size + 1);
    plan.push({ id: scene.id, day: dayFor.get(key) });
  }
  return { plan, days: dayFor.size };
}

/* ---- the production-draft lock ---------------------------------- */
/** How many scene headings with text the script carries. */
export const sceneHeadings = (doc) => (doc.elements || []).filter((e) => e && e.type === 'scene' && String(e.text ?? '').trim()).length;
/** The latest numbered draft in the script blob's `revisions`. */
export function latestDraft(doc) {
  const revs = Array.isArray(doc.revisions) ? doc.revisions : [];
  return { latest: revs.length ? revs[revs.length - 1] : null, count: revs.length };
}
/** An imported shooting script's numbers, from the Breakdown's rows:
 *  heading id → number, for every row that carries both. */
export function lockPreset(scenes) {
  const preset = new Map();
  for (const s of scenes) if (s.scriptElId && s.number) preset.set(s.scriptElId, String(s.number));
  return preset;
}

/* ---- PDF ---------------------------------------------------------- */
/** The export's subtitle: scenes, pages, shoot days. */
export function boardSummary(scenes) {
  const days = shootDays(scenes).length;
  return `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'} · `
       + `${formatEighths(totalEighths(scenes))} pages · `
       + `${days} ${days === 1 ? 'shoot day' : 'shoot days'}`;
}
