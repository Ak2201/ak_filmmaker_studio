/* ============================================================
   RULES POST — the no-AI twins of the on-set and post Desk tasks
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md, lane B. Five jobs the AI Desk did only with
   a model, done here from counts, names, the logs and the rules
   JSON, with nothing sent anywhere:

     summariseChanges   two drafts' diff   -> a note per scene that changed
     wrapNote           one shoot day      -> summary, what is owed, tomorrow
     editNotes          the edit log       -> a note for each BLANK edit note
     certRead           the CBFC report    -> the hint, each rule, its questions
     tensionNotes       analyseScript()    -> each measured flag as a note

   PURE. No document, no storage, no clock, and NO import of ai*.js:
   the facts arrive as plain arguments (the task file in
   local-tasks-post.js reads the models) and what comes back is the
   Desk's item list: { id, text, detail?, keep, where?, sceneId? }.
   `keep` is the sentence a kept note carries (rules-notes.js).

   WORDING IS A MEASUREMENT. Counts, quoted names, the writer's own
   floor note and cbfc-rules.json's own sentences, and nothing else:
   no "this works", no "consider", no description of footage. A fact
   that is not there makes no item.
   ============================================================ */
import { headingFields } from './scene-sync.js';
import { cueName } from './screenplay-analysis.js';
import { scriptStatistics } from './script-stats.js';

const str = (s) => String(s == null ? '' : s);
const oneLine = (s, n) => str(s).replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => str(s).replace(/\s+/g, ' ').trim();
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const round1 = (x) => Math.round(x * 10) / 10;

/** The longest edit note (the same cap the AI task holds to). */
export const NOTE_MAX = 280;
/** The hint line every certification read carries (ai-post-model HINT_LINE, word for word). */
export const HINT_LINE = 'This is a hint, not advice, and not the Board’s decision.';

/** "Scene 12", "Sc. 4A", "scenes 3, 5 and 7" -> ['12'] ... upper case. */
export function sceneNumbersIn(text) {
  const found = [];
  const re = /\b(?:scenes?|sc\.?)\s*#?\s*([0-9]+[a-z]?(?:\s*(?:,|and|&)\s*[0-9]+[a-z]?)*)/gi;
  let m;
  while ((m = re.exec(str(text)))) {
    for (const n of m[1].split(/\s*(?:,|and|&)\s*/i)) if (n) found.push(n.trim().toUpperCase());
  }
  return found;
}

/** Blank NOW: the only state an edit note is ever written into. */
export const canFill = (current) => !str(current).trim();
/** Undo blanks only a note still exactly as written. */
export const canUndo = (current, written) => str(current) === str(written);

const names = (list, cap = 5) => {
  const l = [...list];
  return l.slice(0, cap).join(', ') + (l.length > cap ? ' and ' + (l.length - cap) + ' more' : '');
};

/* ============================================================
   1. summariseChanges
   ============================================================ */
const keyOf = (el) => (el && (el.liveId || el.id)) || '';
const sceneHeads = (list) => (list || []).filter((e) => e && e.type === 'scene' && norm(e.text));
/** 1-based place of a heading among the draft's headings (0 when absent). */
const placeOf = (list, el) => {
  const k = keyOf(el);
  return k ? sceneHeads(list).findIndex((h) => keyOf(h) === k) + 1 : 0;
};
const speakersOf = (list) => {
  const out = new Set();
  for (const e of list || []) if (e && e.type === 'character') { const n = cueName(e.text); if (n) out.add(n); }
  return out;
};
const FIELD_WORD = { intExt: 'INT/EXT', location: 'place', dayNight: 'time' };

function headingChange(a, b) {
  if (!a || !b || norm(a.text) === norm(b.text)) return '';
  const fa = headingFields(a.text), fb = headingFields(b.text);
  const parts = [];
  for (const k of ['intExt', 'location', 'dayNight']) {
    if (!(k in fa) && !(k in fb)) continue;
    if (str(fa[k]) !== str(fb[k])) parts.push(FIELD_WORD[k] + ' ' + (str(fa[k]) || 'none') + ' to ' + (str(fb[k]) || 'none'));
  }
  return 'heading changed (' + (parts.length ? parts.join('; ') : 'reworded') + ')';
}

function describeGroup(g, before, after, k) {
  const first = g.heading && g.ops[0] ? g.ops[0] : null;
  const body = first ? g.ops.slice(1) : g.ops;
  const moving = body.filter((o) => o.op !== 'same');
  const n = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const o of moving) n[o.op]++;
  const lines = [];
  if (n.added) lines.push(plural(n.added, 'line', 'lines') + ' added');
  if (n.removed) lines.push(n.removed + ' cut');
  if (n.changed) lines.push(n.changed + ' changed');
  if (n.moved) lines.push(n.moved + ' moved');

  /* Who speaks in the lines that moved: the cue above them. */
  const speak = new Set();
  let who = '';
  for (const o of g.ops) {
    const el = o.b || o.a;
    if (!el) continue;
    if (el.type === 'character') who = cueName(el.text);
    if ((el.type === 'dialogue' || el.type === 'paren') && o.op !== 'same' && who) speak.add(who);
  }

  const place = first
    ? (first.op === 'removed' ? placeOf(before, first.a) : placeOf(after, first.b))
    : 0;
  /* A scene cut is placed in the OLDER draft, every other one in the newer. */
  const nm = first && first.op === 'removed' ? 'Older draft scene ' : 'Scene ';
  const title = first ? (place ? nm + place + ' · ' : '') + g.heading : 'Before the first scene';
  const label = first ? (place ? nm + place + ' (' + g.heading + ')' : g.heading) : 'Before the first scene';
  const bits = [];
  let kind = 'changed';
  if (first && first.op === 'added') {
    kind = 'added';
    bits.push('new scene, ' + plural(body.length, 'line', 'lines'));
  } else if (first && first.op === 'removed' && body.every((o) => o.op === 'removed')) {
    kind = 'cut';
    bits.push('scene cut, ' + plural(body.length, 'line', 'lines') + ' with it');
  } else {
    if (first && first.op === 'moved') {
      const from = placeOf(before, first.a), to = placeOf(after, first.b);
      if (from && to && from !== to) bits.push('moved from scene ' + from + ' to scene ' + to);
      else bits.push('moved');
    }
    if (first && (first.op === 'changed' || first.op === 'moved')) {
      const hc = headingChange(first.a, first.b);
      if (hc) bits.push(hc);
    }
    if (first && first.op === 'removed') bits.push('heading cut');
    if (lines.length) bits.push(lines.join(', '));
    if (speak.size) bits.push('dialogue changed for ' + names(speak));
  }
  const detail = bits.join('; ');
  if (!detail) return null;
  return { id: 'g' + k, text: title, detail: detail.charAt(0).toUpperCase() + detail.slice(1) + '.',
    keep: label + ': ' + detail + '.', kind };
}

/**
 * summariseChanges({ groups, stats, before, after, olderLabel, newerLabel })
 *   groups  script-diff groupByScene(diff)   stats  diff.stats
 *   before / after  the two element lists (positions, speakers, pages)
 * -> { items, note }. A scene is named by its place among that draft's
 * headings and its heading as written; a draft's places are not the
 * script's scene numbers, so an item never carries a sceneId.
 */
export function summariseChanges({ groups = [], stats = null, before = [], after = [], olderLabel = '', newerLabel = '' } = {}) {
  const pair = [oneLine(olderLabel, 60), oneLine(newerLabel, 60)].filter(Boolean).join(' → ') || 'Draft changes';
  const items = [];
  const heads = groups.filter((g) => g.heading);
  const addedScenes = heads.filter((g) => g.headingOp === 'added').length;
  const cutScenes = heads.filter((g) => g.headingOp === 'removed' && g.ops.slice(1).every((o) => o.op === 'removed')).length;
  const movedScenes = heads.filter((g) => g.headingOp === 'moved').length;
  const sum = [];
  if (stats) {
    const t = [];
    if (stats.added) t.push(plural(stats.added, 'line', 'lines') + ' added');
    if (stats.removed) t.push(stats.removed + ' cut');
    if (stats.changed) t.push(stats.changed + ' changed');
    if (stats.moved) t.push(stats.moved + ' moved');
    if (t.length) sum.push(t.join(', ') + ' across ' + plural(groups.length, 'scene', 'scenes'));
  }
  const sc = [];
  if (addedScenes) sc.push(plural(addedScenes, 'scene', 'scenes') + ' added');
  if (cutScenes) sc.push(cutScenes + ' cut');
  if (movedScenes) sc.push(movedScenes + ' moved');
  if (sc.length) sum.push(sc.join(', '));
  const pa = scriptStatistics(before).pages, pb = scriptStatistics(after).pages;
  if (pa !== pb) {
    const d = round1(Math.abs(pb - pa));
    sum.push('length about ' + pa + ' pages to about ' + pb + ' (' + d + (pb > pa ? ' more' : ' fewer') + '), by the line count');
  }
  if (sum.length) {
    const text = sum.join('; ');
    items.push({ id: 'sum', text: 'Overall', detail: text.charAt(0).toUpperCase() + text.slice(1) + '.', keep: 'Overall: ' + text + '.', where: pair });
  }
  groups.forEach((g, k) => {
    const it = describeGroup(g, before, after, k);
    if (it) items.push({ ...it, where: pair });
  });
  const sb = speakersOf(before), sa = speakersOf(after);
  const fresh = [...sa].filter((x) => !sb.has(x)), lost = [...sb].filter((x) => !sa.has(x));
  if (fresh.length || lost.length) {
    const t = [fresh.length ? 'New speaking characters: ' + names(fresh, 10) : '', lost.length ? 'no longer speaking: ' + names(lost, 10) : '']
      .filter(Boolean).join('; ');
    items.push({ id: 'sp', text: 'Speaking characters', detail: t + '.', keep: t + '.', where: pair });
  }
  return { items, note: 'Counts and names from the line-by-line comparison; nothing is interpreted. Scene places are counted in each draft. Nothing is kept until you accept.' };
}

/* ============================================================
   2. wrapNote
   ============================================================ */
const STATE = { shot: 'shot', part: 'part shot', dropped: 'dropped' };
const stateOf = (s) => (STATE[s] ? s : 'not marked');
const lab = (s) => (s.number ? 'Scene ' + s.number : oneLine(s.slug, 60) || 'A scene');
const labFull = (s) => (s.number && s.slug ? 'Scene ' + s.number + ' (' + oneLine(s.slug, 80) + ')' : lab(s));

/**
 * wrapNote(facts, { nextDay })
 *   facts    { day, scenes: [{ id, number, slug, shotState, takes, circled, floorNote }] }
 *   nextDay  { day, scenes: [{ id, number, slug }] } | null
 * -> { items, note }. Only the day's scenes and the next day's are named.
 */
export function wrapNote(facts, { nextDay = null } = {}) {
  const day = str(facts && facts.day);
  const scenes = ((facts && facts.scenes) || []).filter(Boolean);
  const where = 'Day ' + day + ' wrap';
  const by = (st) => scenes.filter((s) => stateOf(s.shotState) === st).length;
  const takes = scenes.reduce((n, s) => n + (Number(s.takes) || 0), 0);
  const circled = scenes.reduce((n, s) => n + (Number(s.circled) || 0), 0);
  const parts = [scenes.length + ' planned'];
  if (by('shot')) parts.push(by('shot') + ' shot');
  if (by('part')) parts.push(by('part') + ' part');
  if (by('dropped')) parts.push(by('dropped') + ' dropped');
  if (by('not marked')) parts.push(by('not marked') + ' not marked');
  const tail = takes ? '; ' + plural(takes, 'take', 'takes') + ', ' + circled + ' circled' : '';
  const sum = 'Day ' + day + ': ' + parts.join(', ') + tail + '.';
  const items = [{ id: 'sum', text: 'Day ' + day + ' in numbers', detail: sum, keep: sum, where }];

  for (const s of scenes) {
    const st = stateOf(s.shotState);
    if (st === 'shot') continue;
    const what = st === 'part' ? 'part shot, pick-ups owed' : st === 'dropped' ? 'dropped, not shot' : 'not marked shot';
    items.push({ id: 'o' + s.id, sceneId: s.id, text: lab(s) + ' · ' + (STATE[st] || 'not marked'),
      detail: labFull(s) + ': ' + what + '.', keep: labFull(s) + ': ' + what + '.', where: 'Day ' + day + ' — owed' });
  }
  for (const s of scenes) {
    const f = oneLine(s.floorNote, 300);
    if (!f) continue;
    items.push({ id: 'f' + s.id, sceneId: s.id, text: lab(s) + ' · floor note', detail: '“' + f + '”',
      keep: 'Floor note, ' + lab(s) + ': “' + f + '”', where: 'Day ' + day + ' — floor note', floor: true });
  }

  const carried = scenes.filter((s) => stateOf(s.shotState) === 'part');
  const next = nextDay && (nextDay.scenes || []).length ? nextDay : null;
  const tom = [];
  if (next) tom.push('Day ' + str(next.day) + ': ' + next.scenes.map((s) => labFull(s)).join('; '));
  else tom.push('No later shoot day has scenes on it');
  if (carried.length) tom.push('carried from Day ' + day + ' (part shot): ' + carried.map(lab).join(', '));
  if (next || carried.length) {
    const t = 'Tomorrow — ' + tom.join('. ') + '.';
    items.push({ id: 'tom', text: next ? 'Tomorrow · Day ' + str(next.day) : 'Tomorrow', detail: t.replace(/^Tomorrow — /, ''),
      keep: t, where: 'Day ' + day + ' — next' });
  }
  return { items, note: 'Built from the day’s marks, take counts and floor notes, and the next day on the stripboard. Nothing is kept until you accept.' };
}

/* ============================================================
   3. editNotes
   ============================================================ */
const tc = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/**
 * editNotes(rows, { cutRun, targetMin })
 *   rows  [{ id, number, slug, state (shotState), takes, circled, pickups:[text],
 *            floorNote, cutId ('', in, locked, out), cut (its label), seconds, note }]
 * A scene whose edit note is NOT blank is never in the result; a scene
 * with no fact (set state, takes, a pick-up owed, a floor note) is not
 * either. -> { items: [{ id: 's<sceneId>', sceneId, note, text, detail }], note }
 */
export function editNotes(rows, { cutRun = null, targetMin = 0 } = {}) {
  const items = [];
  for (const r of rows || []) {
    if (!r || !canFill(r.note)) continue;
    const pieces = [];
    const state = str(r.state);
    if (state === 'shot') pieces.push('The set marked it shot.');
    else if (state === 'part') pieces.push('The set got part of it.');
    else if (state === 'dropped') pieces.push('The set dropped it.');
    const takes = Number(r.takes) || 0;
    if (takes) pieces.push(plural(takes, 'take', 'takes') + ' logged, ' + (Number(r.circled) || 0) + ' circled.');
    const owed = (r.pickups || []).map((p) => oneLine(p, 60)).filter(Boolean);
    if (owed.length) pieces.push('Pick-ups owed: ' + owed.slice(0, 3).join('; ') + (owed.length > 3 ? '; and ' + (owed.length - 3) + ' more' : '') + '.');
    const floor = oneLine(r.floorNote, 240);
    if (!pieces.length && !floor) continue;
    if (floor) pieces.push('Floor note: “' + floor + '”');
    if (r.cutId && r.cut) pieces.push('Cut status: ' + oneLine(r.cut, 30) + '.');
    if (Number(r.seconds) > 0 && (r.cutId === 'in' || r.cutId === 'locked')) pieces.push('About ' + tc(r.seconds) + ' on screen by the page count.');
    let note = '';
    for (const p of pieces) {
      const next = note ? note + ' ' + p : p;
      if (next.length <= NOTE_MAX) { note = next; continue; }
      if (p.startsWith('Floor note: “') && !note.includes('Floor note')) {
        const room = NOTE_MAX - (note ? note.length + 1 : 0) - 'Floor note: “…”'.length;
        if (room >= 30) note = (note ? note + ' ' : '') + 'Floor note: “' + floor.slice(0, room).trim() + '…”';
      }
    }
    if (!note) continue;
    items.push({ id: 's' + r.id, sceneId: r.id, note, text: lab(r) + (r.slug ? ' · ' + oneLine(r.slug, 80) : ''), detail: note });
  }
  const extra = [];
  if (cutRun && cutRun.scenes) {
    extra.push('In the cut: ' + plural(cutRun.scenes, 'scene', 'scenes') + ', about ' + tc(cutRun.seconds) + ' by the script’s estimate'
      + (targetMin ? ' (target ' + targetMin + ' min)' : '') + '.');
  }
  return { items, note: ['Notes for scenes that have none, from the set’s marks and the logs. A scene that already has a note is never touched, and no note describes footage.']
    .concat(extra).concat('Nothing is kept until you accept.').join(' ') };
}

/* ============================================================
   4. certRead
   ============================================================ */
const nums = (rows, cap = 40) => {
  const n = (rows || []).map((r) => str(r.number)).filter(Boolean);
  return n.slice(0, cap).join(', ') + (n.length > cap ? ', …' : '');
};

/**
 * certRead(report, { disclaimer, ratings })  report = cbfc.certificationReport()
 * Only cbfc-rules.json's own sentences, with their source and the date
 * they were checked. -> { items, note, fired }
 */
export function certRead(report, { disclaimer = '' } = {}) {
  const byRule = (report && report.byRule) || [];
  const hint = (report && report.hint) || {};
  const items = [];
  const sceneOfRule = new Map(byRule.map((b) => [b.rule.id, nums(b.scenes)]));
  const why = [];
  const seen = new Set();
  for (const r of hint.reasons || []) {
    if (seen.has(r.ruleId)) continue;
    seen.add(r.ruleId);
    const n = sceneOfRule.get(r.ruleId);
    why.push(str(r.label) + (n ? ' (Sc ' + n + ')' : ''));
  }
  const hintText = 'Hint: ' + str(hint.rating || 'U') + ' — ' + (why.length ? why.join(', ') : 'no flagged rule carries a rating hint') + '.';
  items.push({ id: 'hint', text: 'Rating hint · ' + str(hint.rating || 'U'),
    detail: hintText + ' ' + HINT_LINE + (disclaimer ? '\n' + disclaimer : ''), keep: hintText + ' ' + HINT_LINE, where: 'Certification' });
  for (const b of byRule) {
    const r = b.rule;
    const n = nums(b.scenes);
    const src = str(r.source) ? ' Source: ' + str(r.source) + (r.checked ? ' (checked ' + r.checked + ').' : '') : '';
    const unsure = str(r.uncertain) ? ' Not settled: ' + str(r.uncertain) : '';
    const head = '[' + r.id + '] ' + str(r.label) + (n ? ' (Sc ' + n + ')' : '');
    items.push({ id: 'r' + r.id, text: head, detail: str(r.what) + src + unsure,
      keep: head + ': ' + str(r.what) + src + unsure, where: 'Certification' });
    const asks = (r.do || []).map((d) => 'In place? ' + str(d)).filter(Boolean);
    if (asks.length) {
      items.push({ id: 'q' + r.id, text: '[' + r.id + '] Questions to answer',
        detail: asks.map((a) => '- ' + a).join('\n'), keep: '[' + r.id + '] To confirm before applying:\n' + asks.map((a) => '- ' + a).join('\n'),
        where: 'Certification' });
    }
  }
  return { items, fired: byRule.length,
    note: HINT_LINE + (disclaimer ? ' ' + disclaimer : '') + ' The wording is cbfc-rules.json’s own. Nothing is kept until you accept.' };
}

/* ============================================================
   5. tensionNotes
   ============================================================ */
const leadShare = 0.25;

/**
 * tensionNotes(a)  a = script-analysis-model analyseScript(...)
 * Each flag of the tension and pacing reads becomes one note worded as a
 * measurement, plus one for a lead who is absent for a long run.
 * -> { items, note }. A note whose first scene is linked to a scene row
 * carries its sceneId (it goes on that scene), else it is a sticky note.
 */
export function tensionNotes(a) {
  const rows = (a && a.scenes) || [];
  const items = [];
  const flags = [].concat(
    (((a && a.tension) || {}).flags || []).map((f) => ({ ...f, group: 'Tension' })),
    (((a && a.pacing) || {}).flags || []).map((f) => ({ ...f, group: 'Structure' }))
  );
  flags.forEach((f, k) => {
    const row = Number.isInteger(f.from) ? rows[f.from] : null;
    const text = 'Measured: ' + f.text;
    items.push({ id: 'f' + k, text: (row ? 'Sc ' + row.number + ' · ' : '') + f.group + ' (' + f.kind + ')', detail: f.text,
      keep: text, where: row ? 'Sc ' + row.number : f.group, ...(row && row.sceneId ? { sceneId: row.sceneId } : {}) });
  });
  const people = (((a && a.cast) || {}).characters || []);
  const minRun = Math.max(5, Math.ceil(0.15 * rows.length));
  people.filter((p) => rows.length && p.scenes >= 3 && p.share >= leadShare).slice(0, 3).forEach((p, k) => {
    const at = rows.map((r, i) => (r.cast.includes(p.name) ? i : -1)).filter((i) => i >= 0);
    let best = null;
    for (let i = 1; i < at.length; i++) {
      const gap = at[i] - at[i - 1] - 1;
      if (gap >= minRun && (!best || gap > best.gap)) best = { gap, from: at[i - 1] + 1, to: at[i] - 1 };
    }
    if (!best) return;
    const text = 'Measured: ' + p.name + ' (in ' + p.scenes + ' of ' + rows.length + ' scenes) does not appear for '
      + best.gap + ' scenes in a row, Sc ' + rows[best.from].number + ' to ' + rows[best.to].number + '.';
    items.push({ id: 'l' + k, text: 'Cast · ' + p.name + ' absent', detail: text.replace(/^Measured: /, ''), keep: text, where: 'Cast' });
  });
  return { items, note: 'Each note is a measurement the Script analysis tab already shows, in numbers: the tension is an estimate read off the words, and the why and the advice are left to you. Nothing is kept until you accept.' };
}

export default { summariseChanges, wrapNote, editNotes, certRead, tensionNotes, canFill, canUndo, sceneNumbersIn, NOTE_MAX, HINT_LINE };
