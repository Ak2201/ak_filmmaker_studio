/* ============================================================
   DIALOGUE LIST — every spoken line, numbered, for the subtitler
   and the certification file
   ------------------------------------------------------------
   PURE. Takes the script elements (src/lib/script.js) and,
   optionally, the scene rows; returns rows and the text of three
   files. Nothing is stored: the list is a reading of the script, so
   it is rebuilt every time it is asked for, and a stored copy would
   be out of date the first time a line is rewritten.

   WHAT A ROW IS. One `dialogue` element. Its character is the cue
   above it (a second dialogue block under the same cue keeps the
   speaker); its parenthetical is any `paren` between the cue or the
   last line and this one. Dialogue above the first scene heading is
   kept, under no scene — losing a line because it sits in a cold
   open would be the one unforgivable thing a dialogue list can do.

   SCENE NUMBERS come from the scene rows where the one join
   (screenplay-analysis.js matchScenes()) pairs a row with the
   heading, else the number the heading carries, else its position:
   the same number the breakdown, the stripboard and the call sheet
   print.

   REELS ARE ESTIMATED. A digital film has no physical reels, but a
   dialogue list and a subtitler both still count in them, by
   convention about twenty minutes each. The reel here is where the
   SCREEN-TIME ESTIMATE puts the scene's start — the same estimate
   the reports page shows, and labelled as one wherever it is shown.
   Reels break between scenes, never inside one.

   THREE OUTPUTS.
     toCSV   the list, with the original line and an EMPTY English
             column side by side for the translator. UTF-8 with a
             byte-order mark, because Excel opens a BOM-less CSV in the
             system code page and every Tamil letter becomes mojibake.
     toSRT   a skeleton: sequence numbers, blank timecodes
             (00:00:00,000 --> 00:00:00,000) and the line, for a
             subtitler to time against the picture. It is NOT a
             subtitle file anyone should play; it is the subtitler's
             starting list in the format their tool opens.
     the printable list is laid out by the page (deliverables.js)
             from the same rows.
   ============================================================ */
import { matchScenes, estimateSlice, sliceScript } from './screenplay-analysis.js';

export const REEL_MINUTES = 20;
export const BLANK_TIMECODE = '00:00:00,000 --> 00:00:00,000';

/** A cue as the dialogue list prints it: the extension that tells a
 *  subtitler the speaker is off screen (V.O., O.S.) is kept; (CONT'D)
 *  and the dual-dialogue caret are not. */
export function speaker(cue) {
  return String(cue || '')
    .replace(/\(\s*CONT['’]?D\s*\)|\(\s*CONTINUED\s*\)/gi, '')
    .replace(/\^\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const parenText = (t) => String(t || '').trim().replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();

/**
 * @param {Array} elements  the script's elements
 * @param {Array} [scenes]  the scene rows, for their numbers
 * @param {{ reelMinutes?: number }} [opts]
 * @returns {{ rows, reels, scenes, speakers }}
 */
export function dialogueRows(elements, scenes, opts = {}) {
  const els = Array.isArray(elements) ? elements : [];
  const reelSeconds = Math.max(1, Number(opts.reelMinutes) || REEL_MINUTES) * 60;

  /* Scene numbers and start times, per heading, by the heading's
     index among the headings (sliceScript()'s `index`). */
  const slices = sliceScript(els);
  const numberAt = new Map();
  if (Array.isArray(scenes) && scenes.length) {
    const m = matchScenes(scenes, els);
    m.pairs.forEach(({ scene, slice }, i) => {
      if (slice) numberAt.set(slice.index, String(scene.number || i + 1));
    });
  }
  const startAt = new Map();
  let clock = 0;
  for (const sl of slices) {
    startAt.set(sl.index, clock);
    clock += estimateSlice(sl).seconds;
  }

  const rows = [];
  let heading = -1;           // index among headings; -1 = above the first
  let headingText = '';
  let who = '';
  let paren = [];
  for (const el of els) {
    const text = String((el && el.text) ?? '').trim();
    const type = el && el.type;
    if (!text) continue;
    if (type === 'scene') {
      heading += 1;
      headingText = text;
      who = '';
      paren = [];
      continue;
    }
    if (type === 'character') { who = speaker(text); paren = []; continue; }
    if (type === 'paren') { paren.push(parenText(text)); continue; }
    if (type === 'dialogue') {
      const sl = heading >= 0 ? slices[heading] : null;
      const start = heading >= 0 ? (startAt.get(heading) || 0) : 0;
      rows.push({
        n: rows.length + 1,
        reel: Math.floor(start / reelSeconds) + 1,
        scene: heading >= 0 ? (numberAt.get(heading) || (sl && sl.number) || String(heading + 1)) : '',
        heading: headingText,
        character: who,
        parenthetical: paren.filter(Boolean).join('; '),
        line: text,
        english: '',
        startSeconds: start
      });
      paren = [];
      continue;
    }
    // Action, a transition or a shot ends the speech: the next line
    // without a cue has no speaker rather than the last one's.
    if (type === 'action' || type === 'transition' || type === 'shot') { who = ''; paren = []; }
  }
  return {
    rows,
    reels: rows.length ? Math.max(...rows.map((r) => r.reel)) : 0,
    scenes: new Set(rows.map((r) => r.scene)).size,
    speakers: new Set(rows.map((r) => r.character).filter(Boolean)).size
  };
}

/* ---- CSV ---------------------------------------------------- */

/* RFC 4180: a field with a comma, a quote or a line break is quoted
   and its quotes doubled. And a field that a spreadsheet would read
   as a FORMULA (=, +, @, or - followed by something other than a
   space) gets a leading apostrophe, because a dialogue list goes to
   translators and vendors who open it in Excel. */
export function csvField(v) {
  let s = String(v ?? '');
  if (/^[=+@\t\r]/.test(s) || /^-[^\s-]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(list, { original = 'Tamil', translation = 'English' } = {}) {
  const rows = Array.isArray(list) ? list : (list && list.rows) || [];
  const head = ['No.', 'Reel (est.)', 'Scene', 'Slug line', 'Character', 'Parenthetical',
    'Dialogue — ' + original, 'Dialogue — ' + translation];
  const lines = [head.map(csvField).join(',')];
  for (const r of rows) {
    lines.push([r.n, r.reel, r.scene, r.heading, r.character, r.parenthetical, r.line, r.english || '']
      .map(csvField).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/* ---- SRT skeleton ------------------------------------------- */

/** One cue per line of dialogue, numbered from 1, every timecode
 *  blank. A blank line inside a cue would end it early in every SRT
 *  reader, so internal blank lines are folded away. */
export function toSRT(list, { speakers = false } = {}) {
  const rows = Array.isArray(list) ? list : (list && list.rows) || [];
  const out = [];
  rows.forEach((r, i) => {
    const body = String(r.line || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\r\n');
    const text = speakers && r.character ? r.character + ': ' + body : body;
    out.push(String(i + 1) + '\r\n' + BLANK_TIMECODE + '\r\n' + text + '\r\n');
  });
  return out.join('\r\n');
}

export default { REEL_MINUTES, BLANK_TIMECODE, speaker, dialogueRows, csvField, toCSV, toSRT };
