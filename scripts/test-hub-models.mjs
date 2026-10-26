/* ============================================================
   test-hub-models — the hub's light models, in Node, no browser
   ------------------------------------------------------------
   src/lib/hub-activity.js (the activity log, the backup-health read)
   and src/lib/tour-state.js (the tour's place) came out of the view in
   the view/logic split. Both are written on prefs.js and import nothing
   else heavy, so they run here against an in-memory localStorage. The
   point is the contract: the same keys, the same JSON shape, the same
   thirty-line cap that keeps the newest backup line.

   Run: node scripts/test-hub-models.mjs
   ============================================================ */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; }
};

const A = await import('../src/lib/hub-activity.js');
const T = await import('../src/lib/tour-state.js');
const K = await import('../src/lib/hub-keys.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

ok(K.ACTIVITY_KEY === 'fms_studio_activity_v1', 'the activity key is byte-identical');
ok(T.TOUR_KEY === 'fms_tour_v1', 'the tour key is byte-identical');
ok(K.DRIVE_STATE_KEY_COPY === 'fms_drive_sync_v1', 'the Drive pointer copy matches drive-sync.js');

ok(Array.isArray(A.activityEntries()) && A.activityEntries().length === 0, 'an empty log reads as no entries');
A.logActivity('studio', 'Exported full studio backup — 2 projects');
for (let i = 0; i < 40; i++) A.logActivity('studio', 'edit ' + i, '#projects');
const log = JSON.parse(mem.get('fms_studio_activity_v1'));
ok(log.entries.length === 31, 'thirty lines, plus the newest backup line kept past the cap');
ok(/^Exported full studio backup/.test(log.entries[30].what), 'the kept line is the backup line, last');
ok(log.entries[0].what === 'edit 39' && log.entries[0].url === '#projects', 'newest first, with its url');
ok(A.lastBackup() && A.lastBackup().via === 'file', 'lastBackup() finds the file backup');

mem.set('fms_drive_sync_v1', JSON.stringify({ enabled: true, fileId: 'x', syncedAt: new Date(Date.now() + 1000).toISOString() }));
ok(A.lastBackup().via === 'drive', 'a newer Drive sync wins');
ok(Number.isFinite(A.driveSyncedAt()), 'driveSyncedAt() reads the Drive state');
mem.set('fms_drive_sync_v1', '{garbled');
ok(Number.isNaN(A.driveSyncedAt()), 'a garbled Drive state reads as never');

mem.set('fms_studio_activity_v1', '{garbled');
A.logActivitySafe('studio', 'x');
ok(mem.get('fms_studio_activity_v1') === '{garbled', 'the band\'s write leaves an unreadable log alone');
A.logActivity('studio', 'y');
ok(JSON.parse(mem.get('fms_studio_activity_v1')).entries.length === 1, 'the hub\'s write replaces an unreadable log, as it always did');

mem.set('fms_studio_activity_v1', JSON.stringify({ entries: [{ ts: 1, what: 'a' }], lastSnap: { fp: 3 } }));
A.clearActivityLog();
const cleared = JSON.parse(mem.get('fms_studio_activity_v1'));
ok(cleared.entries.length === 0 && cleared.lastSnap.fp === 3, 'Clear log empties the entries and keeps the snapshot');

ok(A.activityHref('#projects') === 'index.html#projects', 'a bare fragment belongs to the hub');
ok(A.activityHref('arunak-filmmaker-blueprint.html#s1') === 'feature.html#s1', 'a legacy file is remapped');

ok(JSON.stringify(T.readTourState(5)) === JSON.stringify({ active: false, step: 0, dismissed: false, finished: false, hideList: false }), 'no tour stored reads as a fresh tour');
T.writeTourState({ active: true, step: 9 }, 5);
const stored = JSON.parse(mem.get('fms_tour_v1'));
ok(stored.v === 1 && stored.active === true && stored.step === 9, 'a write stores { v: 1, …patch } as given');
ok(T.readTourState(5).step === 4, 'a read clamps the step to the steps that exist');
mem.set('fms_tour_v1', '[1,2]');
ok(T.readTourState(5).active === false, 'an array reads as a fresh tour');

// The activity line for the budget estimate (fix-money r1): a dollar
// budget used to be logged as '₹ 9k', under 'Equipment list'.
{
  const seams = await import('./node-seams.mjs');
  const HM = await import('../src/lib/hub-model.js');
  const st = { f: { pct: 0 }, s: { pct: 0 }, l: { count: 0, total: 0, currency: 'USD' } };
  HM.detectActivity(st);
  HM.detectActivity({ ...st, l: { count: 2, total: 9000, currency: 'USD' } });
  const line = JSON.parse(seams.mem.get('fms_studio_activity_v1')).entries[0];
  ok(line && line.what === 'Budget estimate: 0 → 2 lines ($9k)' && line.url === 'budget.html#estimate',
    'a dollar estimate is logged in dollars, as the budget estimate: ' + (line && line.what));
  HM.detectActivity({ ...st, l: { count: 3, total: 150000 } });
  const inr = JSON.parse(seams.mem.get('fms_studio_activity_v1')).entries[0];
  ok(inr.what === 'Budget estimate: 2 → 3 lines (₹ 1.5 L)', 'a rupee estimate still reads in rupees: ' + inr.what);
}

console.log((fail ? '✗' : '✓') + ' hub models: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
