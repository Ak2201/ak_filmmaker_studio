/* ============================================================
   BACKUP SUMMARY — summariseBackup() / compareForRestore() in Node
   ------------------------------------------------------------
   The restore preview reads a backup without applying it. It must
   count what a backup holds, mirror what a restore would do, and
   never throw on a file that is damaged, truncated or not ours.

       node scripts/test-backup-summary.mjs   (npm run test:backup-summary)
   ============================================================ */
import { mem } from './node-seams.mjs';
void mem;

const { summariseBackup, compareForRestore } = await import('../src/lib/backup.js');
const { pageCount } = await import('../src/lib/script.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const el = (type, text) => ({ type, text });
const scriptOf = (n) => ({ elements: Array.from({ length: n }, (_, i) => el(i % 2 ? 'dialogue' : 'action', 'Line ' + i)) });

const backup = {
  _exported: '2026-10-01T10:00:00.000Z', _from: 'FilmMakerStudio', _version: 2,
  projects: [
    { id: 'p1', title: 'Dragon', format: 'feature', updatedAt: '2026-09-30T00:00:00Z' },
    { id: 'p2', title: 'Tea Stall', format: 'short' }
  ],
  currentProject: 'p1',
  data: {
    p1: { scenes: { scenes: [{}, {}, {}] }, contacts: { contacts: [{}, {}] }, script: scriptOf(120) },
    p2: { scenes: { scenes: [{}] } },
    _unfiled: { scenes: { scenes: [{}, {}] }, contacts: { contacts: [{}] } }
  },
  global: { studio_prefs: { theme: 'ink' }, write_prefs: {} },
  notes: { fms_note_a: 'x', arunak_note_b: 'y', fms_studio_projects_v1: 'evil', fms_note_c: 5 }
};

/* ---- a good v2 file ------------------------------------------ */
const s = summariseBackup(backup, { pageCount });
ok(s.ok, 'a good file reads');
eq(s.version, 2, 'version 2');
ok(s.looksOurs, 'looks ours');
eq(s.exported, '2026-10-01T10:00:00.000Z', 'the date is carried');
eq(s.projects.map((p) => [p.id, p.title, p.format]), [['p1', 'Dragon', 'feature'], ['p2', 'Tea Stall', 'short']], 'titles and formats');
eq(s.projects[0].scenes, 3, 'scene count');
eq(s.projects[0].contacts, 2, 'contacts count');
eq(s.projects[0].scriptElements, 120, 'script elements');
ok(s.projects[0].scriptPages > 0 && s.projects[1].scriptPages === 0, 'script pages come from the injected counter, 0 for no script');
eq(s.unfiled, { buckets: 1, scenes: 2, contacts: 1 }, 'unfiled work is counted apart');
eq(s.totals.projects, 2, 'total projects');
eq(s.totals.scenes, 6, 'total scenes include unfiled');
eq(s.totals.contacts, 3, 'total contacts include unfiled');
ok(typeof s.totals.scriptPages === 'number', 'total pages when a counter is given');
eq(s.notes, 2, 'only string note keys count, as the applier writes them (a legacy arunak_ one maps forward; a project key or a non-string does not)');
ok(s.hasPrefs, 'prefs present');

const noPages = summariseBackup(backup);
eq(noPages.projects[0].scriptPages, null, 'without a counter pages are null, not guessed');
eq(noPages.totals.scriptPages, null, 'and so is the total');
ok(noPages.projects[0].scriptElements === 120, 'but elements still count');

/* ---- v1 ------------------------------------------------------- */
const v1 = summariseBackup({ feature_blueprint: { meta_title: 'Old film' } });
ok(v1.ok && v1.version === 1 && v1.projects[0].title === 'Old film', 'a v1 file is one project named from its blueprint');

/* ---- damaged and foreign files never throw -------------------- */
const hostile = [
  undefined, null, 0, 1, 'text', [], {}, { hello: 1 }, true,
  { _version: 2 }, { _version: 2, data: {}, projects: 'nope' },
  { _version: 2, data: 'x', projects: [] },
  { _version: 2, data: {}, projects: [null] },
  { _version: 2, data: {}, projects: [{ id: 5 }] },
  { _version: 2, data: { p: 7 }, projects: [{ id: 'p' }] },
  { _version: 2, data: { p: { scenes: 'x', contacts: [], script: { elements: 'no' } } }, projects: [{ id: 'p', title: { a: 1 }, format: [] }] },
  { _version: 2, data: { p: { script: { elements: [null, 3, 'x'] } } }, projects: [{ id: 'p' }] },
  { _version: 2, data: { p: {} }, projects: [{ id: 'p' }], notes: 'nope', global: 4 },
  JSON.parse('{"_version":2,"projects":[],"data":{"_unfiled":null}}')
];
hostile.forEach((h, i) => {
  let r = null, threw = false;
  try { r = summariseBackup(h, { pageCount }); } catch (e) { threw = true; }
  ok(!threw, `hostile input #${i} does not throw`);
  ok(r && typeof r.ok === 'boolean' && Array.isArray(r.projects), `hostile input #${i} still returns the shape`);
  if (r && !r.ok) ok(typeof r.problem === 'string' && r.problem.length > 0, `hostile input #${i} says why`);
});
ok(!summariseBackup({ hello: 1 }).ok, 'a foreign object is not ok');
ok(!summariseBackup('text').ok, 'a string is not ok');
ok(summariseBackup({ _version: 2, data: {}, projects: [] }).ok, 'an empty studio is a readable backup');
ok(summariseBackup({ _version: 2, data: { p: { script: { elements: [null, 3, 'x'] } } }, projects: [{ id: 'p' }] }, { pageCount }).ok,
  'garbage elements do not make the file unreadable');
ok(summariseBackup(backup, { pageCount: () => { throw new Error('boom'); } }).ok, 'a throwing counter is survived');
ok(summariseBackup(backup, { pageCount: () => NaN }).projects[0].scriptPages === null, 'a NaN counter reads as unknown');

/* ---- compareForRestore ---------------------------------------- */
const now = summariseBackup({
  _version: 2, _from: 'FilmMakerStudio',
  projects: [{ id: 'p1', title: 'Dragon (edited)' }, { id: 'p9', title: 'Only here' }],
  data: { p1: { scenes: { scenes: [{}] } }, p9: {} }
});
const c = compareForRestore(s, now);
eq(c.replaces.map((r) => r.incoming.id), ['p1'], 'p1 is in both: replaced');
eq(c.replaces[0].current.title, 'Dragon (edited)', 'the current side is carried for the comparison');
eq(c.adds.map((p) => p.id), ['p2'], 'p2 is only in the file: added');
eq(c.keeps.map((p) => p.id), ['p9'], 'p9 is only here: left alone');
const c0 = compareForRestore(null, undefined);
eq([c0.replaces.length, c0.adds.length, c0.keeps.length], [0, 0, 0], 'null inputs compare to nothing');

console.log(fail ? `\n${fail} failed, ${pass} passed` : `✓ backup summary: ${pass} checks`);
process.exit(fail ? 1 : 0);
