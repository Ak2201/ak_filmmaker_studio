/* ============================================================
   DRIVE SYNC — the decisions in src/lib/drive-sync.js, in Node
   ------------------------------------------------------------
   prove:drive drives the shipped page against a faked Drive and
   needs a build. This one needs nothing: it loads drive-sync.js
   with its five imports (store, backup, drive, plan-gate, usage)
   replaced by in-memory stand-ins, so what is on trial is only the
   module's own choices — when it pushes, when it pulls, and what it
   records as "level with the head".

   Asserted here:
     (a) signing in with Supabase owning sync, on a device already
         connected to Drive, does NOT reconcile — no read, no pull,
         no upload; the status says manual (audit bug 27)
     (b) restoring an EARLIER revision makes it the new head: the
         restored content is uploaded at once (audit bug 26)
     (c) when that upload fails, the device is NOT recorded as level
         with the head, so the next reconcile pushes the restore
         rather than reporting "Up to date"

       node scripts/test-drive-sync.mjs   (npm run test:drive-sync)
   ============================================================ */
import { register } from 'node:module';

const STUB = (src) => ({ url: 'data:text/javascript,' + encodeURIComponent(src), shortCircuit: true });
register('data:text/javascript,' + encodeURIComponent(`
  const STUB = ${STUB.toString()};
  export async function resolve(spec, ctx, next) {
    if (spec === './store.js') return STUB(\`
      const S = globalThis.__fms;
      export const rawGet = (k) => S.mem.has(k) ? S.mem.get(k) : null;
      export const rawSet = (k, v) => { S.mem.set(k, String(v)); };
      export const rawRemove = (k) => { S.mem.delete(k); };
      export default {
        listAllProjects: () => S.projects,
        flushStorage: async () => {},
        subscribe: () => () => {}
      };\`);
    if (spec === './backup.js') return STUB(\`
      const S = globalThis.__fms;
      export const buildBackup = () => ({ _version: 2, content: S.local });
      export const backupShape = () => ({ looksOurs: true });
      export const applyBackup = (all) => { S.applied.push(all.content); S.local = all.content; return { ok: true, message: 'Restored' }; };\`);
    if (spec === './drive.js') return STUB('export default globalThis.__fms.drive;');
    if (spec === './plan-gate.js') return STUB('export default { allowed: () => true, guard: () => true };');
    if (spec === './usage.js') return STUB('export const bumpUsage = () => {};');
    return next(spec, ctx);
  }
`), import.meta.url);

/* ---- the fake Drive: one file, numbered revisions ----------- */
function fakeDrive() {
  const d = {
    revs: new Map(), head: null, n: 0, calls: [], token: false, failUpload: false,
    _put(text) { const id = 'r' + (++d.n); d.revs.set(id, text); d.head = id; return id; },
    isConfigured: () => true,
    hasToken: () => d.token,
    adoptToken: () => { d.token = true; return true; },
    forgetToken: () => { d.token = false; },
    getToken: async () => { d.calls.push('getToken'); d.token = true; },
    readMeta: async () => { d.calls.push('readMeta'); return { headRevisionId: d.head, modifiedTime: 'now' }; },
    downloadBackup: async () => { d.calls.push('downloadBackup'); return d.revs.get(d.head); },
    downloadRevision: async (f, id) => { d.calls.push('downloadRevision'); return d.revs.get(id); },
    uploadBackup: async (f, text) => {
      d.calls.push('uploadBackup');
      if (d.failUpload) throw new Error('network down');
      return { headRevisionId: d._put(text) };
    },
    findBackupFile: async () => ({ id: 'f1' }),
    createBackupFile: async () => ({ id: 'f1' }),
    listRevisions: async () => [...d.revs.keys()].map((id) => ({ id })),
    deleteFile: async () => true,
    BACKUP_FILE_NAME: 'backup.json'
  };
  return d;
}

const S = globalThis.__fms = {
  mem: new Map(), applied: [], local: 'LOCAL', drive: fakeDrive(),
  projects: [{ id: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }]
};
const file = (content) => JSON.stringify({ _version: 2, content });

/* Already connected, level with head r1, synced after the last edit. */
const r1 = S.drive._put(file('CLOUD-OLDER'));
S.mem.set('fms_drive_sync_v1', JSON.stringify({
  enabled: true, fileId: 'f1', revisionId: r1, syncedAt: '2026-10-02T00:00:00.000Z'
}));
/* Another device of the same account backed up to Drive since. */
S.drive._put(file('OTHER-DEVICE'));

/* cloud.js, signed in, owning live sync, with a Google token adopted. */
let authCb = null;
let owns = true;
globalThis.window = globalThis;
globalThis.StudioCloud = {
  ownsSync: () => owns,
  onAuth: (cb) => { authCb = cb; },
  getSession: () => ({ expires_in: 3600 }),
  providerToken: () => 'ya29.probe'
};

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`}`);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const DS = (await import('../src/lib/drive-sync.js')).default;

console.log('--- (a) sign-in while Supabase owns sync ---');
await tick(30);           // boot's setTimeout(0): tryNow → adopt → autoConnect
check('a Google token was adopted', S.drive.token, true);
check('nothing was read from Drive', S.drive.calls.filter((c) => c === 'readMeta').length, 0);
check('nothing was pulled over the cloud copy', S.applied, []);
check('nothing was uploaded', S.drive.calls.includes('uploadBackup'), false);
check('the status says Drive is a manual backup', DS.getDriveStatus().state, 'manual');
check('the local studio is untouched', S.local, 'LOCAL');

console.log('\n--- (b) restoring an earlier revision makes it the head ---');
owns = false;
S.drive.calls.length = 0;
/* Wednesday's head is bad; Tuesday's revision is the one wanted. */
const tue = S.drive._put(file('TUESDAY-GOOD'));
S.drive._put(file('WEDNESDAY-BAD'));
await DS.reconcile();      // this device takes the bad head, as it would
check('the bad head was pulled first', S.local, 'WEDNESDAY-BAD');
const back = await DS.restoreVersion(tue);
check('the restore applies', [back.ok, S.local], [true, 'TUESDAY-GOOD']);
check('the restored content was uploaded', S.drive.calls.includes('uploadBackup'), true);
check('Drive\'s head now holds the restore', JSON.parse(S.drive.revs.get(S.drive.head)).content, 'TUESDAY-GOOD');
check('and the device is level with that head', DS.readState().revisionId, S.drive.head);
const again = await DS.reconcile();
check('a later reconcile has nothing to do', again.did, 'nothing');

console.log('\n--- (c) the restore\'s upload fails ---');
const tue2 = S.drive.head;
S.drive._put(file('THURSDAY-BAD'));
await DS.reconcile();
check('the next bad head was pulled', S.local, 'THURSDAY-BAD');
S.drive.failUpload = true;
const back2 = await DS.restoreVersion(tue2);
check('the restore still applies here', [back2.ok, S.local], [true, 'TUESDAY-GOOD']);
check('the head is still the bad one', JSON.parse(S.drive.revs.get(S.drive.head)).content, 'THURSDAY-BAD');
check('the device is NOT recorded as level', DS.readState().syncedAt, null);
S.drive.failUpload = false;
const retry = await DS.reconcile();
check('the next reconcile pushes the restore', retry.did, 'push');
check('…and the head is the restore', JSON.parse(S.drive.revs.get(S.drive.head)).content, 'TUESDAY-GOOD');

console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ all drive-sync checks pass');
process.exit(failed ? 1 : 0);
