/* ============================================================
   SCRIPT REPORTS — screen time and the cast matrix
   ------------------------------------------------------------
   Two readings of the SCRIPT against the scene model, moved from
   reports.html to breakdown.html (owner, 1 Nov 2026): they belong
   with the other script-derived views in the Breakdown group, where
   navigation.json already filed them. Same ids (#screentime,
   #cast-matrix) because they are fragment targets, and the old
   reports.html#screentime / #cast-matrix / #runtime links are
   forwarded to breakdown.html by src/pages/reports.js (MOVED_AWAY).

   Nothing here stores anything but what a person types — the target
   running time (inside the songs blob) and each song's length (a
   field on the song), exactly as before the move. Everything else is
   derived on render from Scenes.listScenes() and the script.

   The print / PDF / CSV handlers are wired once by wireScriptReports().
   The one-view print rules (body.rp-print-screentime / -castmatrix)
   live in styles/script-reports.css, which this module imports, so the
   page that mounts the sections gets them with it.
   ============================================================ */
import '../styles/script-reports.css';
import '../styles/runtime.css';
import StudioUI from './chrome.js';
import { actionMenu, wireActionBar } from './actionbar.js';
import { h, delegate, download } from '../lib/dom.js';
import { statCard } from './kit/index.js';
import PDF from '../lib/pdf.js';
import { brandPrint } from './footer.js';   // CORE: the "Made with" line on a plain print
import Scenes from '../lib/scenes.js';
import { loadScript } from '../lib/script.js';
import Analysis, { formatDuration } from '../lib/screenplay-analysis.js';
import { listSongs, updateSong, durationSeconds, getTargetMinutes, setTargetMinutes, kindLabel } from '../lib/songs.js';
import { getTargetMin, setTargetMin } from '../lib/editlog.js';
import {
  sceneNumbers, plural, slugOf, readFrom, runtimeGroups, fmtDelta, deltaLabel, runtimeNotes, screenTimeCSV, castMatrixCSV
} from '../lib/reports-model.js';

const stat = (value, label) => statCard({ value, label });
function toast(message, opts) {
  try { StudioUI.toast(message, Object.assign({ type: 'info' }, opts || {})); } catch (e) { /* chrome may not be up */ }
}

/* A box that scrolls sideways on a phone must be reachable from the keyboard
   (WCAG 2.1.1): focusable, a region, named by the table's caption. */
export const scrollBox = (table, label) => {
  const cap = table.querySelector('caption');
  return h('div.rp-scroll', { role: 'region', tabindex: '0', 'aria-label': label || (cap && cap.textContent.trim()) || 'Report table' }, [table]);
};
export const th = (text, cls) => h('th' + (cls ? '.' + cls : ''), { scope: 'col', text });
export const td = (text, cls) => h('td' + (cls ? '.' + cls : ''), { text });

/* ---- print -------------------------------------------------- */
/* One view at a time. The body class is what the page's print rules
   key off, and it comes off again afterwards so a later Ctrl-P prints
   the whole page. Shared with reports.js. */
export function printOnly(cls) {
  const body = document.body;
  body.classList.add(cls);
  const unbrand = brandPrint();
  const clear = () => {
    body.classList.remove(cls);
    unbrand();
    window.removeEventListener('afterprint', clear);
  };
  window.addEventListener('afterprint', clear);
  window.print();
  // Safari fires afterprint unreliably; belt and braces.
  setTimeout(clear, 1000);
}

/* ---- screen time (PRD 2.0 FR-602) ---------------------------
   An ESTIMATE, and the section says so in its first sentence. Beside
   every figure sits the page-a-minute rule it refines, so a reader can
   see when the two disagree — a dialogue-heavy page plays long, a page
   of terse action plays longer than its words — rather than trusting
   one number with no context. */
export function renderScreenTime(scenes, numbers = sceneNumbers(scenes)) {
  const sec = h('section.rp-sec', { id: 'screentime' });
  sec.append(
    h('p.bd-eyebrow', { text: 'Screen time' }),
    h('h2.bd-h2', { text: 'How long it will play.' }),
    h('p.bd-sub', { text: 'An estimate per scene from the script: dialogue at speaking pace, action by the rhythm of its sentences, '
      + 'two seconds to establish each heading. The page-a-minute figure is beside it; a scene with no script text uses that alone.' })
  );
  if (!scenes.length) {
    sec.append(h('p.bd-none', { text: 'No scenes yet. Import or write a script and the estimate appears here, scene by scene.' }));
    return sec;
  }
  sec.append(h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
    actionMenu('Export', [
      { label: 'Print the screen time', action: 'print-screentime' },
      { label: 'Save as PDF', action: 'pdf-screentime', hint: 'A4' },
      { label: 'Download CSV', action: 'csv-screentime', hint: 'Spreadsheet' }
    ], { kit: 'secondary' })
  ]));
  const st = Analysis.screenTime(scenes, loadScript().elements);
  sec.append(h('div.k-stat-strip.rp-stats', {}, [
    stat(formatDuration(st.total), 'estimated running time'),
    stat(formatDuration(st.byPage), 'by page count'),
    stat(st.fromScript + ' / ' + scenes.length, 'scenes read from the script')
  ]));
  /* With the songs counted, against the film's target: see
     runtimeEstimate() for why a timed song REPLACES its scenes. */
  sec.append(renderRuntime(st, scenes, numbers));
  wireRuntime();
  /* The pairing is by heading, not by position (matchScenes()), and
     whatever it could not pair is said here rather than guessed at. */
  const notes = Analysis.describeMatch(st.match);
  if (notes.length) sec.append(h('p.bd-match-note', { text: notes.join(' ') }));
  const table = h('table.scene-table.rp-table');
  table.append(h('caption.rp-caption', { text: 'Estimated screen time per scene, against the page-a-minute rule. Times read m:ss under an hour, then hours and minutes.' }));
  table.append(h('thead', {}, [h('tr', {}, [th('Scene'), th('Slug line'), th('Estimate', 'numeric'), th('By pages', 'numeric'), th('Dialogue words', 'numeric'), th('Read from')])]));
  const body = h('tbody');
  for (const r of st.rows) {
    body.append(h('tr', {}, [
      td(numbers.get(r.scene.id) || r.scene.number || '\u2014', 'mono'),
      td(r.heading || slugOf(r.scene), 'loc'),
      td(formatDuration(r.seconds), 'numeric'),
      td(formatDuration(r.byPage), 'numeric'),
      td(r.method === 'script' ? String(r.dialogueWords) : '\u2014', 'numeric'),
      td(readFrom(r), 'mono')
    ]));
  }
  table.append(body);
  sec.append(scrollBox(table));
  return sec;
}

/* ---- running time with the songs, against a target ----------
   The estimate above is read off the pages, and a song is barely on
   the page. So the songs' own lengths are added (a timed song stands
   in for the scenes linked to it — runtimeEstimate()), and the sum
   is set against a target the producer types, overall and per act.

   The per-act target is the target times the act's conventional
   share in the Story page's framework (frameworks.json pacing), the
   same share the Write page's outline meter uses. Scenes reach an
   act through their `beatId`; a song through its linked scenes, else
   its own Save the Cat placement. Everything here is derived on
   render; the only things stored are what a person types — the
   target (inside the songs blob) and each song's length (a field on
   the song). */
/* runtimeGroups() and fmtDelta() are src/lib/reports-model.js's. */

function renderRuntime(st, scenes, numbers) {
  const box = h('div.rt-box', { id: 'runtime' });
  const songs = listSongs();
  /* ONE target (src/lib/target-runtime.js): this field, else a value the
     Edit Log stored before there was one — read the same way edit.html and
     the stripboard read it, so the three pages never disagree. */
  const targetMin = getTargetMinutes() || getTargetMin();
  const groups = runtimeGroups(scenes);
  const songIn = songs.map((s) => ({ id: s.id, seconds: durationSeconds(s), placement: s.placement }));
  const est = Analysis.runtimeEstimate(st, songIn, { targetSeconds: targetMin * 60, ...groups.byAct });
  const byBeat = Analysis.runtimeEstimate(st, songIn, { targetSeconds: 0, ...groups.byBeat });

  box.append(h('h3.rp-h3', { text: 'With the songs, against your target' }));

  const field = h('div.rt-field');
  field.append(h('label', { for: 'rt-target', text: 'Target running time, in minutes' }));
  const input = h('input#rt-target.rt-target', {
    type: 'number', min: '1', max: '600', step: '1', inputmode: 'numeric',
    placeholder: 'e.g. 140', 'data-rt-field': 'target'
  });
  input.value = targetMin ? String(targetMin) : '';
  field.append(input);
  box.append(field);

  box.append(h('div.k-stat-strip.rp-stats', {}, [
    stat(formatDuration(est.total), 'estimated, songs included'),
    stat(targetMin ? formatDuration(est.target) : '—', targetMin ? 'target' : 'no target set'),
    stat(targetMin ? fmtDelta(est.delta) : '—', deltaLabel(targetMin, est.delta))
  ]));

  box.append(h('p.bd-match-note', { text: runtimeNotes(est, songs.length) }));

  if (songs.length) {
    const t = h('table.scene-table.rp-table.rt-songs');
    t.append(h('caption.rp-caption', { text: 'Each song’s length, as m:ss (4:30). The recording decides it, not the page.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('No.'), th('Song'), th('Kind'), th('Length'), th('Linked scenes', 'numeric')])]));
    const body = h('tbody');
    for (const s of songs) {
      const linked = scenes.filter((x) => x.songId === s.id);
      const name = String(s.title || '').trim() || 'Untitled song';
      const len = h('input.rt-len', {
        type: 'text', inputmode: 'decimal', placeholder: '4:30', autocomplete: 'off',
        'data-rt-field': 'song-duration', 'data-song': s.id,
        'aria-label': 'Length of song ' + (s.number || '') + ': ' + name
      });
      len.value = s.duration || '';
      body.append(h('tr', {}, [
        td(String(s.number || ''), 'mono'),
        td(name, 'loc'),
        td(kindLabel(s.kind)),
        h('td', {}, [len]),
        td(linked.length ? linked.map((x) => numbers.get(x.id) || x.number).join(', ') : '—', 'numeric')
      ]));
    }
    t.append(body);
    box.append(scrollBox(t));
  }

  if (est.groups.length) {
    const t = h('table.scene-table.rp-table.rt-acts');
    t.append(h('caption.rp-caption', { text: targetMin
      ? 'Per act, against the target split by each act’s conventional share of the story framework.'
      : 'Per act. Set a target above to see each act against its share of it.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('Act'), th('Scenes', 'numeric'), th('Songs', 'numeric'), th('Estimate', 'numeric'), th('Target', 'numeric'), th('Difference', 'numeric')])]));
    const body = h('tbody');
    const row = (g, label) => h('tr', {}, [
      h('th.loc', { scope: 'row', text: label }),
      td(String(g.sceneCount), 'numeric'), td(String(g.songCount), 'numeric'),
      td(formatDuration(g.seconds), 'numeric'),
      td(g.target ? formatDuration(g.target) : '—', 'numeric'),
      td(g.target ? fmtDelta(g.delta) : '—', 'numeric')
    ]);
    est.groups.forEach((g) => body.append(row(g, g.label)));
    if (est.ungrouped) body.append(row(est.ungrouped, 'Not linked to a beat'));
    t.append(body);
    box.append(scrollBox(t));
  } else {
    /* The beats are set on Story -> Beat Sheet (story.html#path-outline); the
       Write page's Outline tab that said so is retired. A link, not a bare
       sentence, so the reader is one click from the place they must act. */
    box.append(h('p.bd-none', {}, [
      'No scene is linked to a story beat yet, so there is no per-act split. '
      + 'Link scenes to beats on ',
      h('a', { href: 'story.html#path-outline', text: 'Story, on the Beat Sheet' }),
      ' and each act appears here against its share of the target.'
    ]));
  }

  if (byBeat.groups.length) {
    const t = h('table.scene-table.rp-table.rt-beats');
    t.append(h('caption.rp-caption', { text: 'Per beat, in story order. A beat has no target of its own; the act does.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('Beat'), th('Scenes', 'numeric'), th('Songs', 'numeric'), th('Estimate', 'numeric'), th('Share of the film', 'numeric')])]));
    const body = h('tbody');
    byBeat.groups.forEach((g) => body.append(h('tr', {}, [
      h('th.loc', { scope: 'row', text: g.label }),
      td(String(g.sceneCount), 'numeric'), td(String(g.songCount), 'numeric'),
      td(formatDuration(g.seconds), 'numeric'),
      td(byBeat.total ? Math.round((g.seconds / byBeat.total) * 100) + '%' : '—', 'numeric')
    ])));
    t.append(body);
    box.append(scrollBox(t));
  }
  return box;
}

/* Wired once, from renderScreenTime(). A change saves, then the
   runtime box alone is rebuilt — after the focus has moved, so a Tab
   out of one length lands in the next one rather than being thrown
   back to the top of the page. */
function wireRuntime() {
  if (wireRuntime.done) return;
  wireRuntime.done = true;
  delegate(document, 'change', '[data-rt-field]', (e, el) => {
    const f = el.getAttribute('data-rt-field');
    if (f === 'target') {
      /* A typed number the target cannot hold (0, -30, 99999, 2.5) is said, not erased or rounded in silence. */
      const typed = String(el.value).trim();
      const kept = setTargetMinutes(typed);
      if (typed && String(kept) !== typed) toast(kept ? 'Target rounded to ' + kept + ' minutes.' : 'The target is 1 to 600 minutes, so nothing was set.');
      if (getTargetMin()) setTargetMin(0);   // retire the legacy fallback
    }
    else if (f === 'song-duration') updateSong(el.getAttribute('data-song'), { duration: el.value });
    else return;
    setTimeout(() => {
      const old = document.getElementById('runtime');
      if (!old) return;
      const a = document.activeElement;
      const again = a && a.closest && a.closest('#runtime') && a.getAttribute('data-rt-field')
        ? '[data-rt-field="' + a.getAttribute('data-rt-field') + '"]'
          + (a.getAttribute('data-song') ? '[data-song="' + CSS.escape(a.getAttribute('data-song')) + '"]' : '')
        : null;
      const scenes = Scenes.listScenes();
      old.replaceWith(renderRuntime(Analysis.screenTime(scenes, loadScript().elements), scenes, sceneNumbers(scenes)));
      if (again) { const n = document.querySelector(again); if (n) n.focus(); }
    }, 0);
  });
}

/* ---- the cast matrix (PRD 2.0 FR-604) ------------------------
   Characters down, scenes across. A character is in a scene if the
   breakdown tags them OR the script gives them a cue there — the union,
   because an unfinished breakdown and an unwritten scene are both
   ordinary. Dense scenes (many of the cast at once) are the expensive
   days to schedule, so they are named, not just shaded. */
export function renderCastMatrix(scenes, numbers = sceneNumbers(scenes)) {
  const sec = h('section.rp-sec', { id: 'cast-matrix' });
  sec.append(
    h('p.bd-eyebrow', { text: 'Cast matrix' }),
    h('h2.bd-h2', { text: 'Who is in what, and with whom.' }),
    h('p.bd-sub', { text: 'Every character against every scene, from the breakdown\u2019s cast tags and the script\u2019s cues. '
      + 'The pairs who share the most scenes and the scenes that call the most of the cast are the scheduling constraints.' })
  );
  const cm = scenes.length ? Analysis.castMatrix(scenes, loadScript().elements) : null;
  if (!cm || !cm.characters.length) {
    sec.append(h('p.bd-none', { text: 'No cast yet. Tag cast on the breakdown or write character cues in the script, and the grid fills in.' }));
    return sec;
  }
  sec.append(h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
    actionMenu('Export', [
      { label: 'Print the cast matrix', action: 'print-castmatrix' },
      { label: 'Save as PDF', action: 'pdf-castmatrix', hint: 'Landscape' },
      { label: 'Download CSV', action: 'csv-castmatrix', hint: 'Spreadsheet' }
    ], { kit: 'secondary' })
  ]));
  const notes = Analysis.describeMatch(cm.match);
  if (notes.length) sec.append(h('p.bd-match-note', { text: 'Cues are read only from scenes matched to a heading. ' + notes.join(' ') }));
  const table = h('table.scene-table.rp-table.rp-matrix');
  table.append(h('caption.rp-caption', { text: `${plural(cm.characters.length, 'character', 'characters')} across ${plural(scenes.length, 'scene', 'scenes')}. \u25CF in the scene; the last row counts the cast each scene calls.` }));
  const head = h('tr', {}, [th('Character', 'loc'), th('Scenes', 'numeric')]);
  cm.density.forEach((d) => head.append(h('th.rp-mx-col' + (d.high ? '.is-dense' : ''), { scope: 'col', text: numbers.get(d.scene.id) || d.scene.number || '\u2014' })));
  table.append(h('thead', {}, [head]));
  const body = h('tbody');
  for (const c of cm.characters) {
    const row = h('tr', {}, [h('th.loc', { scope: 'row', text: c.name }), td(String(c.scenes.size), 'numeric')]);
    cm.density.forEach((d) => {
      const on = c.scenes.has(d.scene.id);
      row.append(h('td.rp-mx-cell' + (on ? '.is-on' : '') + (d.high ? '.is-dense' : ''), {
        text: on ? '\u25CF' : '', 'aria-label': on ? `${c.name} in scene ${numbers.get(d.scene.id) || d.scene.number}` : undefined
      }));
    });
    body.append(row);
  }
  const foot = h('tr', {}, [h('th.loc', { scope: 'row', text: 'Cast called' }), td('')]);
  cm.density.forEach((d) => foot.append(td(String(d.count), 'numeric' + (d.high ? ' is-dense' : ''))));
  table.append(body, h('tfoot', {}, [foot]));
  sec.append(scrollBox(table));

  const cols = h('div.rp-mx-notes');
  const pairs = cm.interactions.slice(0, 8);
  const pl = h('div.rp-mx-note', {}, [h('h3.rp-h3', { text: 'Most scenes together' })]);
  if (pairs.length) {
    const ol = h('ol.rp-mx-list');
    pairs.forEach((p) => ol.append(h('li', { text: `${p.a.name} & ${p.b.name} \u2014 ${plural(p.shared, 'scene', 'scenes')}` })));
    pl.append(ol);
  } else pl.append(h('p.bd-none', { text: 'No two characters share a scene yet.' }));
  const dense = cm.density.filter((d) => d.high);
  const dl = h('div.rp-mx-note', {}, [h('h3.rp-h3', { text: `Dense scenes (${cm.threshold}+ cast)` })]);
  if (dense.length) {
    const ol = h('ol.rp-mx-list');
    dense.forEach((d) => ol.append(h('li', { text: `Scene ${numbers.get(d.scene.id) || d.scene.number} \u2014 ${slugOf(d.scene)}: ${d.count} cast` })));
    dl.append(ol);
  } else dl.append(h('p.bd-none', { text: 'No scene calls more than a handful of the cast.' }));
  cols.append(pl, dl);
  sec.append(cols);
  return sec;
}

/* Screen time and the cast matrix: print, PDF and CSV of what the tab
   shows. Wired once, whichever page mounts the sections. */
const castFile = () => (PDF.projectTitle ? PDF.projectTitle() : 'film').replace(/[^\w஀-௿-]+/g, '_').replace(/^_+|_+$/g, '') || 'film';
let wired = false;
export function wireScriptReports() {
  wireActionBar();   // the Export menus' opener (idempotent)
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="print-screentime"]', () => printOnly('rp-print-screentime'));
  delegate(document, 'click', '[data-action="print-castmatrix"]', () => printOnly('rp-print-castmatrix'));
  delegate(document, 'click', '[data-action="pdf-screentime"]', () => PDF.exportPDF({
    scope: 'screentime', label: 'Screen time', setup: 'a4', classes: ['rp-print-screentime'],
    subtitle: plural(Scenes.listScenes().length, 'scene', 'scenes')
  }));
  delegate(document, 'click', '[data-action="pdf-castmatrix"]', () => PDF.exportPDF({
    scope: 'castmatrix', label: 'Cast matrix', setup: 'landscape', classes: ['rp-print-castmatrix'],
    subtitle: plural(Scenes.listScenes().length, 'scene', 'scenes')
  }));
  delegate(document, 'click', '[data-action="csv-screentime"]', () => {
    const scenes = Scenes.listScenes();
    download(castFile() + '-screen-time.csv', screenTimeCSV(Analysis.screenTime(scenes, loadScript().elements), sceneNumbers(scenes)), 'text/csv;charset=utf-8');
  });
  delegate(document, 'click', '[data-action="csv-castmatrix"]', () => {
    const scenes = Scenes.listScenes();
    download(castFile() + '-cast-matrix.csv', castMatrixCSV(Analysis.castMatrix(scenes, loadScript().elements), sceneNumbers(scenes)), 'text/csv;charset=utf-8');
  });
}
