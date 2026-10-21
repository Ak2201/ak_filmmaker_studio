/* ============================================================
   PAPERWORK — the film's paper and date style, and the board CSVs
   ------------------------------------------------------------
   docs/US-MARKET-PLAN.md §E PAPERWORK. Asserted in Node, no browser:
     · pdf.js picks US Letter for a film whose paper is Letter and A4
       otherwise, for every paperwork family (a4, landscape, sheet);
       the screenplay setups stay Letter on both; the invoice and the
       pitch deck never follow the film;
     · the dates those documents print come out in the film's style
       (Indian: 21 Oct 2026, US: Oct 21, 2026), and a day stored as
       'YYYY-MM-DD' never moves a day whatever the zone;
     · boardCsv() — one row per scene, in SHOOT order with its day,
       the unscheduled strips last — and doodCsv() — cast × days, the
       same marks as the grid — quote every cell (RFC 4180), end lines
       CRLF, and carry a UTF-8 BOM so Excel reads Tamil as Tamil;
     · without prefs the old date readers are byte-identical.

       node scripts/test-paperwork.mjs   (or: npm run test:paperwork)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

/* pdf.js itself needs a page and the store; the choice of paper is in
   its pure half, paper-setups.js, which pdf.js re-exports. */
const PDF = await import('../src/lib/paper-setups.js');
const S = await import('../src/lib/stripboard-model.js');
const RM = await import('../src/lib/reports-model.js');
const CM = await import('../src/lib/contacts-model.js');
const { regionPrefs, projectPrefs, formatPaperDate } = await import('../src/lib/region-core.js');
const { paperDate } = await import('../src/lib/paper-date.js');
const Scenes = (await import('../src/lib/scenes.js')).default;
const L = await import('../src/lib/locations.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const IN = regionPrefs('IN');
const US = regionPrefs('INT');

/* ---- the paper ---------------------------------------------------- */
eq(IN.paper, 'A4', 'an Indian film is A4');
eq(US.paper, 'Letter', 'a film made elsewhere is Letter');
eq(projectPrefs({ id: 'p', title: 'Old film' }, 'INT').paper, 'A4', 'a film with no region keeps A4');
eq(projectPrefs({ region: 'INT', paper: 'A4' }, 'IN').paper, 'A4', 'entry.paper overrides the region');

for (const k of ['letter', 'letter-landscape', 'sheet-letter']) ok(PDF.SETUPS[k], 'SETUPS has ' + k);
eq(PDF.SETUPS.letter.size, 'Letter', 'letter is Letter portrait');
eq(PDF.SETUPS['letter-landscape'].size, 'Letter landscape', 'letter-landscape is Letter landscape');
eq(PDF.SETUPS['sheet-letter'].size, 'Letter', 'sheet-letter is Letter portrait');
for (const [from, to] of Object.entries(PDF.LETTER_OF)) {
  ok(PDF.SETUPS[from] && /^A4/.test(PDF.SETUPS[from].size), from + ' is an A4 family');
  ok(PDF.SETUPS[to] && /^Letter/.test(PDF.SETUPS[to].size), to + ' is its Letter twin');
  eq(/landscape/.test(PDF.SETUPS[from].size), /landscape/.test(PDF.SETUPS[to].size), from + ' keeps its orientation on Letter');
}

const size = (opts, prefs) => PDF.resolveSetup(opts, prefs).setup.size;
const PAPERWORK = ['callsheet', 'board', 'dood', 'reports', 'sides', 'bdsheets', 'blueprint', 'overview'];
for (const scope of PAPERWORK) {
  ok(/^A4/.test(size({ scope }, IN)), scope + ' prints A4 on an Indian film');
  ok(/^Letter/.test(size({ scope }, US)), scope + ' prints Letter on a US film');
}
eq(size({ scope: 'board' }, US), 'Letter landscape', 'the stripboard stays landscape on Letter');
eq(size({ scope: 'dood' }, IN), 'A4 landscape', 'the DOOD stays landscape on A4');
eq(PDF.resolveSetup({ scope: 'callsheet' }, US).name, 'sheet-letter', 'the call sheet takes sheet-letter');
eq(PDF.resolveSetup({ scope: 'callsheet' }, IN).name, 'sheet', 'the call sheet takes sheet on A4');
// A page that names its own family (reports.js, breakdown.js) still follows the film.
eq(PDF.resolveSetup({ scope: 'elements', setup: 'a4' }, US).name, 'letter', 'an explicit a4 family prints Letter on a US film');
eq(PDF.resolveSetup({ scope: 'oneliner', setup: 'a4' }, IN).name, 'a4', 'an explicit a4 family prints A4 on an Indian film');
// The screenplay is Letter everywhere, and does not change.
for (const p of [IN, US]) {
  eq(PDF.resolveSetup({ scope: 'screenplay' }, p).name, 'screenplay', 'screenplay setup unchanged (' + p.region + ')');
  eq(PDF.resolveSetup({ scope: 'screenplay', setup: 'screenplay-wide' }, p).name, 'screenplay-wide', 'shooting script unchanged (' + p.region + ')');
}
eq(PDF.SETUPS.screenplay.size, 'Letter', 'the screenplay is Letter');
// Not paperwork of the film: the invoice and the deck keep their paper.
eq(size({ scope: 'invoice' }, US), 'A4', 'the invoice does not follow the film');
eq(size({ scope: 'pitch' }, US), 'A4 landscape', 'the pitch deck does not follow the film');
// A one-job override wins over the film.
eq(size({ scope: 'callsheet', paper: 'A4' }, US), 'A4', 'opts.paper A4 overrides a Letter film');
eq(size({ scope: 'callsheet', paper: 'Letter' }, IN), 'Letter', 'opts.paper Letter overrides an A4 film');
// An unknown family falls back to a4 rather than to nothing.
eq(PDF.paperSetupName('nonsense', 'Letter'), 'letter', 'an unknown setup is a4, then its twin');
eq(PDF.paperSetupName('a4', 'A4'), 'a4', 'A4 keeps the name');

/* ---- dates in the film's style ------------------------------------ */
// paperDate and region-core's formatPaperDate must agree wherever their
// styles overlap, so the copy cannot drift from the contract's function.
for (const day of ['2026-01-01', '2026-09-07', '2026-10-21', '2025-12-31', '2024-02-29']) {
  for (const style of ['medium', 'long', 'numeric']) {
    for (const p of [IN, US]) eq(paperDate(day, p, style), formatPaperDate(day, p, style), `paperDate = formatPaperDate (${day}, ${style}, ${p.region})`);
  }
}
eq(paperDate('2026-10-21', IN, 'weekday'), 'Wed, 21 Oct 2026', 'weekday, Indian (composed: no comma after the month)');
eq(paperDate('2026-10-21', US, 'weekday'), 'Wed, Oct 21, 2026', 'weekday, US');
eq(paperDate('2026-10-21', US, 'numeric'), '10/21/2026', 'numeric, US');
eq(paperDate('2026-10-21', IN, 'numeric'), '21/10/2026', 'numeric, Indian');
eq(paperDate('nope', US), '', 'not a date');
eq(paperDate('', US), '', 'empty');
eq(paperDate('2026-10-21', null), '21 Oct 2026', 'no prefs reads as Indian, the studio default');
eq(S.localDate('2025-10-27'), 'Mon 27 Oct 2025', 'no prefs: the board date is byte-identical to before');
eq(S.localDate('2025-10-27', IN), 'Mon, 27 Oct 2025', 'board date, Indian film');
eq(S.localDate('2025-10-27', US), 'Mon, Oct 27, 2025', 'board date, US film');
eq(S.localDate('soon', US), '', 'not a date');
eq(S.dayMonth('2025-10-27', IN), '27 Oct', 'DOOD column, Indian film');
eq(S.dayMonth('2025-10-27', US), 'Oct 27', 'DOOD column, US film');
eq(S.dayMonth('', US), '', 'DOOD column, no date');

eq(RM.shortDate('2026-10-21', true, US), 'Wednesday, October 21, 2026', 'report day, US long');
eq(RM.shortDate('2026-10-21', true, IN), 'Wednesday, 21 October 2026', 'report day, Indian long');
eq(RM.shortDate('2026-10-21', false, US), 'Wed, Oct 21', 'report day, US short');
eq(RM.shortDate('2026-10-21', false, IN), 'Wed, 21 Oct', 'report day, Indian short');
eq(RM.shortDate('typed', true, US), 'typed', 'a typed non-date prints as typed');

eq(CM.prettyDate('2024-02-12'), '12 February 2024', 'no prefs: the call sheet date is byte-identical to before');
eq(CM.prettyDate('2024-02-12', IN), '12 February 2024', 'call sheet date, Indian film');
eq(CM.prettyDate('2024-02-12', US), 'February 12, 2024', 'call sheet date, US film');
eq(CM.prettyDate('', US), 'Date not set', 'call sheet with no date');

// A stored DAY never moves, whatever zone the machine is in: each of the
// readers builds it from the parts at local time, never `new Date(iso)`.
const zone = process.env.TZ;
for (const tz of ['Pacific/Honolulu', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
  process.env.TZ = tz;
  eq(S.dayMonth('2026-01-01', US), 'Jan 1', 'New Year stays New Year in ' + tz);
}
if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;

/* ---- the stripboard CSV ------------------------------------------- */
const reset = () => { mem.delete('fms_scenes_v1'); mem.delete('fms_locations_v1'); };
reset();
Scenes.addScene({ id: 's1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'KITCHEN', eighths: 12, shootDay: 2, synopsis: 'Ravi says "no"\nand leaves', elements: { cast: ['RAVI', 'மீனா'] } });
Scenes.addScene({ id: 's2', number: '2', intExt: 'EXT', dayNight: 'NIGHT', location: 'ROAD, CHENNAI', eighths: 8, shootDay: 1, elements: { cast: ['RAVI'] } });
Scenes.addScene({ id: 's3', number: '3', intExt: 'INT', dayNight: 'DAY', location: 'KITCHEN', eighths: 3, shootDay: 2, elements: { cast: ['மீனா'] } });
Scenes.addScene({ id: 's4', number: '4', intExt: 'EXT', dayNight: 'DAY', location: 'BEACH', eighths: 8, shootDay: 0, elements: {} });
// Day 2's order is the AD's, not the script's: scene 3 before scene 1.
L.placeScene('s3', 2, { index: 0 });
const scenes = Scenes.listScenes();
const dateOf = new Map([[1, '2026-10-21'], [2, '2026-10-22']]);
const groups = S.groupScenes(scenes, 'day', { dayOrders: () => L.listDayOrder() });

const board = S.boardCsv(groups, { dateOf, prefs: US });
ok(board.startsWith('﻿'), 'board CSV starts with a BOM');
ok(board.endsWith('\r\n'), 'board CSV ends with CRLF');
const rows = board.slice(1).split('\r\n').filter((l) => l !== '');
// The synopsis carried a newline; the CSV row must not.
eq(rows.length, 1 + 4, 'board CSV: a header and one row per scene');
eq(rows[0], S.BOARD_CSV_HEADER.map((c) => '"' + c + '"').join(','), 'board CSV header');
eq(rows.slice(1).map((r) => r.split('","')[3]), ['2', '3', '1', '4'], 'board CSV: shoot order — day 1, then day 2 as the AD ordered it, then unscheduled');
ok(rows[1].startsWith('"1","Oct 21, 2026","1","2","EXT","ROAD, CHENNAI","NIGHT"'), 'board CSV: day, US date, order, scene, I/E, a set with a comma kept inside its quotes — got ' + rows[1]);
ok(rows[2].startsWith('"2","Oct 22, 2026","1","3"'), 'board CSV: day 2 opens with scene 3 at order 1');
ok(rows[3].includes('"Ravi says ""no"" and leaves"'), 'board CSV: a quote is doubled, a newline flattened — got ' + rows[3]);
ok(rows[3].includes('"RAVI, மீனா"'), 'board CSV: Tamil cast survives');
ok(rows[3].includes('"1 4/8"'), 'board CSV: pages in eighths — got ' + rows[3]);
ok(rows[4].startsWith('"","","","4"'), 'board CSV: an unscheduled scene has no day, date or order — got ' + rows[4]);
const boardIN = S.boardCsv(groups, { dateOf, prefs: IN });
ok(boardIN.includes('"21 Oct 2026"'), 'board CSV: Indian dates on an Indian film');
ok(!S.boardCsv(groups, {}).includes('Oct 21'), 'board CSV with no dates prints none');
eq(S.boardCsv([], {}), '﻿' + S.BOARD_CSV_HEADER.map((c) => '"' + c + '"').join(',') + '\r\n', 'an empty board is a header alone');

/* ---- the day out of days CSV -------------------------------------- */
const days = S.shootDays(scenes);
eq(days, [1, 2], 'two shoot days');
const index = Scenes.elementIndex();
const dood = S.doodRows(scenes, days, index);
const csv = S.doodCsv(dood, days, { dateOf, prefs: US });
ok(csv.startsWith('﻿') && csv.endsWith('\r\n'), 'DOOD CSV: BOM and CRLF');
const drows = csv.slice(1).split('\r\n').filter(Boolean);
eq(drows[0], '"Cast","Day 1 · Oct 21, 2026","Day 2 · Oct 22, 2026","Days worked","Days on hold","Total days"', 'DOOD CSV header, US dates');
const byName = Object.fromEntries(drows.slice(1).map((r) => [r.split('","')[0].slice(1), r]));
eq(byName.RAVI, '"RAVI","SW","WF","2","0","2"', 'DOOD CSV: Ravi starts day 1, finishes day 2');
eq(byName['மீனா'], '"மீனா","","SWF","1","0","1"', 'DOOD CSV: Meena is one day, not needed on day 1');
eq(drows.length, 1 + dood.length, 'DOOD CSV: one row per performer');
const doodIN = S.doodCsv(dood, days, { dateOf: {}, prefs: IN });
ok(doodIN.includes('"Day 1","Day 2"'), 'DOOD CSV: an undated day is "Day N" alone');
// A hold day shows as H, as on the grid.
reset();
Scenes.addScene({ id: 'h1', number: '1', shootDay: 1, elements: { cast: ['ANU'] } });
Scenes.addScene({ id: 'h2', number: '2', shootDay: 3, elements: { cast: ['ANU'] } });
Scenes.addScene({ id: 'h3', number: '3', shootDay: 2, elements: { cast: ['BALA'] } });
const hs = Scenes.listScenes();
const hd = S.shootDays(hs);
const hcsv = S.doodCsv(S.doodRows(hs, hd, Scenes.elementIndex()), hd, {});
ok(hcsv.includes('"ANU","SW","H","WF","2","1","3"'), 'DOOD CSV: a hold day is H and counts — got ' + hcsv);
reset();

/* ---- the pages use them ------------------------------------------- */
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const sb = read('src/pages/stripboard.js');
ok(/action: 'csv-board'/.test(sb) && /data-action="csv-board"/.test(sb), 'stripboard: Stripboard as CSV is in the export menu and handled');
ok(/action: 'csv-dood'/.test(sb) && /data-action="csv-dood"/.test(sb), 'stripboard: Day Out of Days as CSV is in the export menu and handled');
ok(/'text\/csv;charset=utf-8'/.test(sb), 'stripboard: saved as text/csv, utf-8 (the breakdown\'s type)');
const pdf = read('src/lib/pdf.js');
ok(/paperDate\(new Date\(\), prefs, 'medium'\)/.test(pdf), 'pdf.js: the masthead date is paperDate in the film\'s style');
/* paper-date.js exists only because region-core.js sits in startlib (its
   header says why). It must not import anything, and must not leave the
   page chunks for startlib or CORE, or it pays the cost it was made to
   avoid. */
const pd = read('src/lib/paper-date.js');
ok(!/^\s*import\b/m.test(pd), 'paper-date.js imports nothing');
ok(!/paper-date/.test(read('vite.config.js')), 'paper-date.js is not forced into startlib or CORE');
ok(!/toLocaleDateString\(undefined/.test(pdf), 'pdf.js: no device-locale date left on the masthead');
ok(/from '\.\/paper-setups\.js'/.test(pdf) && /export \{ SETUPS, LETTER_OF, DOCUMENTS, paperSetupName \}/.test(pdf), 'pdf.js re-exports the setups it prints with');
ok(/resolveSetup\(opts, prefs\)/.test(pdf), 'pdf.js stage() resolves the setup against the film');

console.log(`\n  paperwork: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
