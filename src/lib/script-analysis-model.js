/* ============================================================
   SCRIPT ANALYSIS MODEL — how the script works, read from the page
   ------------------------------------------------------------
   The Script analysis tab on screenplay.html (src/ui/script-analysis.js)
   draws what this file derives. PURE: every function takes the data it
   reads as arguments and returns a value; nothing here reads storage
   or writes it (the readiness.js rule — two stored opinions about one
   script disagree the first time it is edited).

   IT COMPOSES, it does not re-derive:
     screen time   estimateSlice()  screenplay-analysis.js (the rule
                   screenTime() applies per scene)
     cast          cueName()        screenplay-analysis.js — a cue is a
                   person, extensions and (CONT'D) dropped
     tension       lexicalTension() story.js — the word-level estimate
                   the synopsis heatmap already uses, per SCENE here;
                   expectedAt() for the framework's convention
     levels        levelOf() / HIGH_TENSION  story-pacing.js, and
                   PACING.lowTension / minRun from frameworks.json
     story curve   tensionCurve() / intensity() / beatDeck()
                   story-pacing.js, when the Story page has a synopsis
     structure     the framework's beats (story.js frameworkById) at
                   their conventional page, against the scene that
                   actually sits on that page

   WHAT IS AN ESTIMATE SAYS SO. A scene's tension is read off its words
   (conflict vocabulary, sentence tempo, exclamations); a page count is
   lines over LINES_PER_PAGE. The view labels both as estimates, and the
   AI action ("Notes on tension and arcs", the Desk task
   'tension-notes') is where a reader's judgement comes in.

   Node-tested by scripts/test-analysis.mjs (npm run test:analysis).
   ============================================================ */
import { sliceScript, estimateSlice, cueName } from './screenplay-analysis.js';
import { lexicalTension, expectedAt, frameworkById, effectiveFramework, PACING } from './story.js';
import { levelOf, HIGH_TENSION, tensionCurve, intensity, beatDeck } from './story-pacing.js';
import { elementLines, LINES_PER_PAGE } from './script.js';
import { beatPageBasis } from './beat-basis.js';

const textOf = (el) => String((el && el.text) ?? '').trim();
const words = (t) => (String(t).match(/\S+/g) || []).length;
const round1 = (x) => Math.round(x * 10) / 10;
const lowLine = () => (PACING && Number.isFinite(PACING.lowTension) ? PACING.lowTension : 3.5);
const REGIONS = (PACING && Array.isArray(PACING.regions) && PACING.regions.length) ? PACING.regions
  : [{ from: 0, to: 0.25, label: 'Act 1' }, { from: 0.25, to: 0.5, label: 'Act 2A' }, { from: 0.5, to: 0.75, label: 'Act 2B' }, { from: 0.75, to: 1, label: 'Act 3' }];
const regionOf = (pos) => (REGIONS.find((r) => pos >= r.from && pos < r.to) || REGIONS[REGIONS.length - 1]).label;

/** "2 3/8" from eighths. */
export function pagesOf(eighths) {
  const e = Math.max(0, Math.round(Number(eighths) || 0));
  const p = Math.floor(e / 8), r = e % 8;
  return p && r ? p + ' ' + r + '/8' : p ? String(p) : r + '/8';
}

function stats(list) {
  const xs = list.filter((x) => Number.isFinite(x));
  if (!xs.length) return { n: 0, mean: 0, median: 0, min: 0, max: 0, sd: 0, cv: 0 };
  const sorted = xs.slice().sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { n: xs.length, mean, median, min: sorted[0], max: sorted[sorted.length - 1], sd, cv: mean ? sd / mean : 0 };
}

/** One row per script scene (heading), in script order. */
export function sceneRows(elements, scenes = []) {
  const slices = sliceScript(elements || []);
  const heads = (elements || []).filter((el) => el && el.type === 'scene' && textOf(el));
  const rowOf = new Map((scenes || []).filter((s) => s && s.scriptElId).map((s) => [s.scriptElId, s]));
  const rows = slices.map((slice, i) => {
    const head = heads[i] || {};
    const row = rowOf.get(head.id) || null;
    const lines = slice.elements.reduce((n, el) => n + elementLines(el), 0) + elementLines({ type: 'scene', text: slice.heading });
    const eighths = Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8));
    const text = slice.elements.filter((e) => e.type === 'action' || e.type === 'dialogue' || e.type === 'shot').map(textOf).join('\n');
    const est = estimateSlice(slice);
    const cast = [...new Set(slice.elements.filter((e) => e.type === 'character').map((e) => cueName(e.text)).filter(Boolean))];
    const lex = text ? lexicalTension(text) : null;
    return {
      i, headingId: head.id || '', sceneId: row ? row.id : '',
      number: String((row && row.number) || slice.number || i + 1),
      heading: slice.heading, eighths, pages: pagesOf(eighths),
      seconds: est.seconds, words: words(text), dialogueWords: est.dialogueWords, actionWords: est.actionWords,
      speeches: est.speeches, cast, tension: lex == null ? null : round1(lex)
    };
  });
  const total = rows.reduce((n, r) => n + r.eighths, 0);
  let at = 0;
  for (const r of rows) {
    r.start = at;                                   // eighths before this scene
    r.page = Math.floor(at / 8) + 1;                // the page it opens on
    r.pos = total ? (at + r.eighths / 2) / total : 0;
    r.region = regionOf(r.pos);
    at += r.eighths;
  }
  return rows;
}

/** The tension read: per scene, smoothed, the convention beside it. */
export function tensionRead(rows, fwId) {
  const pts = rows.map((r) => ({
    i: r.i, number: r.number, pos: r.pos,
    value: r.tension == null ? null : r.tension,
    expected: round1(expectedAt(fwId, r.pos)),
    level: r.tension == null ? null : levelOf(r.tension)
  }));
  const vals = pts.map((p) => p.value);
  // three-scene rolling mean over the scenes that have words
  pts.forEach((p, i) => {
    const w = [vals[i - 1], vals[i], vals[i + 1]].filter((v) => v != null);
    p.smooth = w.length ? round1(w.reduce((a, b) => a + b, 0) / w.length) : null;
  });
  const read = pts.filter((p) => p.value != null);
  const s = stats(read.map((p) => p.value));
  const peak = read.length ? read.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const n = read.length;
  const count = (lv) => read.filter((p) => p.level === lv).length;
  const share = n ? { low: count('low') / n, mid: count('mid') / n, high: count('high') / n } : { low: 0, mid: 0, high: 0 };

  const flags = [];
  if (n >= 4) {
    // slack: a run of low scenes (smoothed) longer than PACING.minRun of the script
    const minRun = Math.max(3, Math.ceil(((PACING && PACING.minRun) || 0.12) * pts.length));
    /* Low for THIS script as well as low on the scale: a word-level read
       of a whole screenplay sits in a narrow band, and a line at the
       scale's 3.5 alone would call half of a calm script slack. */
    const slackLine = Math.min(lowLine(), s.mean - Math.max(0.25, 0.5 * s.sd));
    let run = [];
    const close = () => {
      if (run.length >= minRun) {
        const a = run[0], b = run[run.length - 1];
        flags.push({ kind: 'slack', level: 'warn', from: a.i, to: b.i,
          text: 'Scenes ' + a.number + ' to ' + b.number + ' (' + (regionOf(a.pos) === regionOf(b.pos) ? regionOf(a.pos) : regionOf(a.pos) + ' to ' + regionOf(b.pos)) + ') read as low tension for ' + run.length + ' scenes in a row.' });
      }
      run = [];
    };
    pts.forEach((p, i) => {
      const quietEdge = (i === 0) && !run.length;
      if (p.smooth != null && p.smooth <= slackLine && !quietEdge) run.push(p); else close();
    });
    close();
    if (peak && peak.pos < 0.5) flags.push({ kind: 'peak', level: 'info', from: peak.i, to: peak.i, text: 'The highest-tension scene (' + peak.number + ') is in the first half, at ' + Math.round(peak.pos * 100) + '% of the script. Most structures build to a peak near the end.' });
    const lastThird = read.filter((p) => p.pos >= 2 / 3);
    const firstTwo = read.filter((p) => p.pos < 2 / 3);
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b.value, 0) / xs.length : 0);
    if (lastThird.length && firstTwo.length && avg(firstTwo) - avg(lastThird) >= Math.max(0.3, 0.5 * s.sd)) flags.push({ kind: 'ending', level: 'info', text: 'The last third reads calmer on average (' + round1(avg(lastThird)) + ') than what comes before it (' + round1(avg(firstTwo)) + ').' });
    if (s.sd < 0.8) flags.push({ kind: 'flat', level: 'info', text: 'Tension varies little from scene to scene (spread ' + round1(s.sd) + ' on a 1–10 scale): the read sees one register throughout.' });
  }
  return { points: pts, mean: round1(s.mean), spread: round1(s.sd), peak, share, lowLine: lowLine(), highLine: HIGH_TENSION, flags, read: n };
}

/** Pacing from the spread of scene lengths. */
export function pacingRead(rows) {
  const s = stats(rows.map((r) => r.eighths));
  const buckets = [
    { id: 'short', label: 'Up to 2/8 page', max: 2 },
    { id: 'medium', label: 'Up to a page', max: 8 },
    { id: 'long', label: 'Up to 3 pages', max: 24 },
    { id: 'xlong', label: 'Over 3 pages', max: Infinity }
  ].map((b) => ({ ...b, count: 0 }));
  for (const r of rows) (buckets.find((b) => r.eighths <= b.max) || buckets[buckets.length - 1]).count++;
  const acts = REGIONS.map((g) => {
    const mine = rows.filter((r) => r.region === g.label);
    const st = stats(mine.map((r) => r.eighths));
    return { label: g.label, scenes: mine.length, eighths: mine.reduce((n, r) => n + r.eighths, 0), mean: st.mean };
  });
  const flags = [];
  /* Long for THIS script: over two pages AND twice its median scene, so
     a script of three-page scenes is not one long run end to end. */
  const longLine = Math.max(16, 2 * s.median);
  let run = [];
  const close = (kind) => {
    if (kind === 'long' && run.length >= 3) flags.push({ kind: 'long-run', level: 'info', from: run[0].i, to: run[run.length - 1].i, text: run.length + ' long scenes in a row (' + run[0].number + ' to ' + run[run.length - 1].number + '), each over ' + pagesOf(longLine) + ' pages.' });
    if (kind === 'quick' && run.length >= 6) flags.push({ kind: 'quick-run', level: 'info', from: run[0].i, to: run[run.length - 1].i, text: run.length + ' very short scenes in a row (' + run[0].number + ' to ' + run[run.length - 1].number + '): a montage-like run.' });
    run = [];
  };
  for (const kind of ['long', 'quick']) {
    for (const r of rows) {
      if (kind === 'long' ? r.eighths > longLine : r.eighths <= 2) run.push(r); else close(kind);
    }
    close(kind);
  }
  const longest = rows.length ? rows.reduce((a, b) => (b.eighths > a.eighths ? b : a)) : null;
  const rhythm = !rows.length ? '' : s.cv < 0.45 ? 'even' : s.cv < 0.9 ? 'varied' : 'very uneven';
  return {
    scenes: rows.length, mean: s.mean, median: s.median, min: s.min, max: s.max, spread: s.sd, cv: round1(s.cv),
    meanPages: pagesOf(s.mean), medianPages: pagesOf(s.median), rhythm, buckets, acts, longest, longLine, flags
  };
}

/** The cast across the script: scenes, lines, where each enters and leaves. */
export function castRead(rows) {
  const people = new Map();
  for (const r of rows) {
    for (const name of r.cast) {
      if (!people.has(name)) people.set(name, { name, scenes: 0, first: r, last: r, numbers: [] });
      const p = people.get(name);
      p.scenes++; p.last = r; p.numbers.push(r.number);
    }
  }
  const list = [...people.values()].map((p) => ({
    name: p.name, scenes: p.scenes, numbers: p.numbers,
    first: p.first.number, last: p.last.number, from: p.first.pos, to: p.last.pos,
    share: rows.length ? p.scenes / rows.length : 0
  })).sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name));
  const pairs = new Map();
  for (const r of rows) {
    const ks = r.cast.slice().sort();
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const k = ks[i] + '\u0000' + ks[j];
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  }
  const together = [...pairs].map(([k, n]) => { const [a, b] = k.split('\u0000'); return { a, b, shared: n }; })
    .sort((x, y) => y.shared - x.shared || x.a.localeCompare(y.a)).slice(0, 8);
  return { characters: list, together };
}

/** Structure: each beat of the framework at its conventional page, and
 *  the scene that actually sits there. With a story whose scenes are
 *  linked to beats, beatDeck() says where each beat opens. */
export function structureRead(rows, { fwId, story = null, scenes = [], elements = [], targetPages = 0 } = {}) {
  const fw = frameworkById(fwId);
  const total = rows.reduce((n, r) => n + r.eighths, 0);
  /* The script's length is counted the way the beats panel counts it
     (lines over LINES_PER_PAGE, every element), not the sum of the
     scene rows' rounded eighths, or the two views disagree by a page. */
  const scriptPages = elements.length ? elements.reduce((n, e) => n + elementLines(e), 0) / LINES_PER_PAGE : total / 8;
  /* ONE rule (beat-basis.js): the target if set, else the script as written. */
  const basis = beatPageBasis({ targetPages, scriptPages });
  const totalPages = basis.pages;
  let deck = null;
  if (story) { try { deck = beatDeck({ story, scenes, elements, fwId: fw.id }); } catch (e) { deck = null; } }
  const opens = new Map(((deck && deck.beats) || []).filter((b) => b.opensOn).map((b) => [b.beat.id, b]));
  const beats = fw.beats.slice().sort((a, b) => a.at - b.at).map((b) => {
    const at = basis.basis === 'target' ? b.at * totalPages * 8 : b.at * total;
    const r = rows.find((x) => at >= x.start && at < x.start + x.eighths) || rows[rows.length - 1] || null;
    const linked = opens.get(b.id) || null;
    return {
      id: b.id, label: b.label, at: b.at, expected: b.tension,
      targetPage: total ? Math.max(1, Math.round(b.at * totalPages)) : null,
      scene: r ? r.number : '', sceneHeading: r ? r.heading : '', tensionThere: r ? (r.tension == null ? null : r.tension) : null,
      opensOn: linked ? linked.opensOn : null,
      /* Against the SAME clamped page the Page column shows: a beat at
         0% is "p. 1", and measuring from page 0 printed "p. 1 (+1)"
         beside it (QA r2). */
      drift: linked && total ? Math.round(linked.opensOn - Math.max(1, b.at * totalPages)) : null
    };
  });
  return { framework: { id: fw.id, label: fw.label, short: fw.short }, pages: round1(scriptPages), basis, beats, linked: opens.size };
}

/**
 * The whole read. `story` (story.js loadStory()) and `format` are
 * optional: without a story the framework is the format's suggestion
 * and the story curve is left out.
 */
export function analyseScript({ elements = [], scenes = [], story = null, fwId = null, format = 'feature', targetPages = 0 } = {}) {
  const rows = sceneRows(elements, scenes);
  const fw = frameworkById(fwId || effectiveFramework(story, format)).id;
  const eighths = rows.reduce((n, r) => n + r.eighths, 0);
  const seconds = rows.reduce((n, r) => n + r.seconds, 0);
  let storyCurve = null;
  if (story && String(story.source || '').trim()) {
    try { storyCurve = { curve: tensionCurve(story, fw), intensity: intensity(story, fw) }; } catch (e) { storyCurve = null; }
  }
  return {
    framework: fw,
    scenes: rows,
    totals: { scenes: rows.length, eighths, pages: pagesOf(eighths), seconds, words: rows.reduce((n, r) => n + r.words, 0) },
    tension: tensionRead(rows, fw),
    pacing: pacingRead(rows),
    cast: castRead(rows),
    structure: structureRead(rows, { fwId: fw, story, scenes, elements, targetPages }),
    story: storyCurve
  };
}

/* ---- the AI action: notes on tension and arcs ------------------
   The model is given the READ, not the whole script: per scene its
   number, heading, length, estimated tension and who speaks, and per
   character where they enter and leave. Small, so it is one request.
   The notes must name scenes that exist; a note about a scene number
   not in the list is dropped and counted. */

export function tensionNotesSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['summary', 'notes'],
    properties: {
      summary: { type: 'string', description: 'two or three sentences on how tension builds across the script' },
      notes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['kind', 'scene', 'note'],
          properties: {
            kind: { type: 'string', enum: ['tension', 'arc', 'structure'] },
            scene: { type: 'string', description: 'the scene number the note is about, copied exactly from the list' },
            character: { type: 'string', description: 'for an arc note, the character name as listed; otherwise empty' },
            note: { type: 'string', description: 'one specific, fair sentence' }
          }
        }
      }
    }
  };
}

export function buildTensionNotesPrompt(a, { title = '', refine = '' } = {}) {
  const L = [];
  L.push('A read of the screenplay' + (title ? ' "' + title + '"' : '') + ', measured by rules (not by a reader):');
  L.push('Tension is estimated per scene on a 1–10 scale from the words (conflict vocabulary, sentence tempo). Treat it as a rough signal.');
  L.push('Framework: ' + a.structure.framework.label + '. ' + a.totals.scenes + ' scenes, ' + a.totals.pages + ' pages.');
  L.push('');
  L.push('SCENES (number | heading | pages | tension | speaking):');
  for (const r of a.scenes) L.push(r.number + ' | ' + r.heading + ' | ' + r.pages + ' | ' + (r.tension == null ? '—' : r.tension) + ' | ' + (r.cast.join(', ') || '—'));
  L.push('');
  L.push('CHARACTERS (name | scenes | first scene | last scene):');
  for (const c of a.cast.characters.slice(0, 24)) L.push(c.name + ' | ' + c.scenes + ' | ' + c.first + ' | ' + c.last);
  if (a.tension.flags.length) { L.push(''); L.push('Rule flags: ' + a.tension.flags.map((f) => f.text).join(' ')); }
  L.push('');
  L.push('Write notes on where tension builds, sags and releases, and on the arcs of the main characters (where they');
  L.push('enter, go quiet, return). Every note names one scene number from the list. Do not invent plot beyond the headings.');
  if (refine) { L.push(''); L.push(refine); }
  return L.join('\n');
}

/** The model's answer, checked: { summary, notes, dropped }. */
export function readTensionNotes(parsed, a) {
  const known = new Set(a.scenes.map((r) => String(r.number)));
  const names = new Set(a.cast.characters.map((c) => c.name));
  let dropped = 0;
  const notes = [];
  for (const n of (parsed && Array.isArray(parsed.notes) ? parsed.notes : [])) {
    if (!n || typeof n !== 'object') continue;
    const scene = String(n.scene ?? '').trim();
    const note = String(n.note ?? '').trim().slice(0, 400);
    if (!note || !known.has(scene)) { dropped++; continue; }
    const kind = ['tension', 'arc', 'structure'].includes(n.kind) ? n.kind : 'tension';
    const who = String(n.character ?? '').trim().toUpperCase();
    notes.push({ kind, scene, character: names.has(who) ? who : '', note });
  }
  return { summary: String((parsed && parsed.summary) ?? '').trim().slice(0, 800), notes: notes.slice(0, 30), dropped };
}

/** The notes as the Desk's read text. */
export function tensionNotesText(res) {
  const L = [];
  if (res.summary) L.push(res.summary, '');
  const label = { tension: 'Tension', arc: 'Arc', structure: 'Structure' };
  for (const n of res.notes) L.push('Sc ' + n.scene + ' · ' + label[n.kind] + (n.character ? ' · ' + n.character : '') + ' — ' + n.note);
  if (res.dropped) L.push('', res.dropped + (res.dropped === 1 ? ' note was' : ' notes were') + ' dropped because they named a scene that is not in the script.');
  L.push('', 'These are notes, not edits. Nothing was changed.');
  return L.join('\n').trim();
}

export default { analyseScript, sceneRows, tensionRead, pacingRead, castRead, structureRead, pagesOf, buildTensionNotesPrompt, tensionNotesSchema, readTensionNotes, tensionNotesText };

/* ---- labels the analysis prints ------------------------------------ */
/* A cue or a heading, title-cased for reading. A short word with no
   vowel is an initialism (HR, DJ, TV, DSP) and keeps its capitals —
   title-casing made "HR MANAGER" read "Hr Manager" (QA r2); the honorifics
   that look the same (MR, DR …) are words and are cased as words. */
const HONORIFIC = new Set(['MR', 'MRS', 'MS', 'DR', 'ST', 'JR', 'SR']);
export function readableName(s) {
  return String(s || '').replace(/\p{L}[\p{L}\p{M}'’.]*/gu, (w) => {
    const bare = w.replace(/[.'’]/g, '');
    const up = bare.toUpperCase();
    if (up === bare && bare.length <= 3 && /^[A-Z]+$/.test(bare) && !/[AEIOUY]/.test(bare) && !HONORIFIC.has(bare)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}
/** "Sc 4–9", or "Sc 23" for a character in one scene (not "Sc 23–23"). */
export function sceneSpan(first, last) {
  return 'Sc ' + (String(first) === String(last) ? first : first + '–' + last);
}
