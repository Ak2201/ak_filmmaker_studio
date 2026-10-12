/* SCRIPT NOTES — src/lib/script-notes.js in Node. node scripts/test-script-notes.mjs (npm run test:script-notes) */
import './node-seams.mjs';

const N = await import('../src/lib/script-notes.js');
const { blankElement } = await import('../src/lib/script.js');

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a));

const E = (id, type, text) => blankElement({ id, type, text });
const els = [
  E('a0', 'action', 'Black.'),
  E('s1', 'scene', 'INT. KITCHEN - DAY'), E('a1', 'action', 'She waits, "quietly".'),
  E('s2', 'scene', 'EXT. ROAD - NIGHT'), E('d1', 'dialogue', 'Go.')
];
const C = (id, key, o = {}) => ({ id, field_key: key, status: 'open', author_name: 'ann@x.in', body: 'b' + id, type: 'comment', parent_id: null, created_at: '2026-10-01T10:00:00Z', ...o });
const comments = [
  C('c3', 'script_d1', { created_at: '2026-10-03T00:00:00Z', author_name: 'bob@x.in' }),
  C('c1', 'script_a1', { body: 'Too long, "cut"\nsecond line' }),
  C('c2', 'script_a1', { parent_id: 'c1', author_name: 'bob@x.in', body: 'Agreed' }),
  C('c4', 'script_s1', { status: 'resolved' }),
  C('c5', 'script_gone'),
  C('x', 'feature_other')                        // another page's field: ignored
];
const notes = { a0: 'private about black', s2: '   ' };
const rows = N.buildNotes({ elements: els, comments, readNote: (id) => notes[id] || '' });

eq(rows.map((r) => r.id), ['note:a0', 'c4', 'c1', 'c3', 'c5'], 'script order, replies folded, foreign keys dropped, orphans last');
const c1 = rows.find((r) => r.id === 'c1');
eq([c1.sceneNumber, c1.scene, c1.replies.length, c1.authors], ['1', 'INT. KITCHEN - DAY', 1, ['ann@x.in', 'bob@x.in']], 'thread joined to its scene');
eq(rows[0].scene, 'Before the first scene', 'line before any scene');
ok(rows[0].kind === 'private' && rows[0].open, 'private note is open');
eq(rows.find((r) => r.id === 'c5').scene, 'Deleted line', 'orphan labelled');
ok(!rows.some((r) => r.id === 'note:s2'), 'blank private note skipped');

// a reply whose parent is missing is promoted rather than lost
const lone = N.buildNotes({ elements: els, comments: [C('r', 'script_a1', { parent_id: 'nope' })] });
eq(lone.length, 1, 'orphan reply surfaces as a thread');

eq(N.counts(rows), { total: 5, open: 4, resolved: 1 }, 'counts');
eq(N.filterNotes(rows, { state: 'open' }).length, 4, 'open');
eq(N.filterNotes(rows, { state: 'resolved' }).map((r) => r.id), ['c4'], 'resolved');
eq(N.filterNotes(rows, { sceneId: 's1' }).map((r) => r.id), ['c4', 'c1'], 'by scene');
eq(N.filterNotes(rows, { sceneId: 'none' }).map((r) => r.id), ['note:a0', 'c5'], 'no scene');
eq(N.filterNotes(rows, { author: 'bob@x.in' }).map((r) => r.id), ['c1', 'c3'], 'by author, incl. repliers');
eq(N.filterNotes(rows, { kind: 'private' }).length, 1, 'by kind');
eq(N.filterNotes(rows, { state: 'open', sceneId: 's1' }).map((r) => r.id), ['c1'], 'combined');
const fx = N.facets(rows);
eq(fx.authors, ['ann@x.in', 'bob@x.in', 'You (private)'], 'authors facet');
eq(fx.scenes.map((s) => s.id), ['none', 's1', 's2'], 'scene facet');

const txt = N.toText(rows, 'My Film');
ok(txt.startsWith('My Film — notes\n5 notes (4 open, 1 resolved)'), 'text header');
ok(txt.includes('1. INT. KITCHEN - DAY') && txt.includes('[Resolved] ann@x.in, 2026-10-01'), 'text groups and states');
ok(txt.includes('↳ bob@x.in, 2026-10-01: Agreed') && txt.includes('[Private] You (private)'), 'text replies and private');

const csv = N.toCSV(rows);
const lines = csv.split('\r\n');
eq(lines[0], N.CSV_HEADER.map((h) => '"' + h + '"').join(','), 'csv header');
ok(csv.includes('"Too long, ""cut""\nsecond line"'), 'csv escapes quotes, commas, newlines');
eq(lines.length, rows.length + 2, 'csv one line per note (+ header, trailing)');
eq(N.toCSV([]).split('\r\n').length, 2, 'empty csv is header only');

console.log(fails ? fails + ' FAILED of ' + n : 'script-notes: ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
