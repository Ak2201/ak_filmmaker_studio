/* ============================================================
   BACKUP APPLY — buildBackup() / applyBackup() against the REAL
   store.js, in Node
   ------------------------------------------------------------
   test:backup-summary runs with store.js stubbed out, so it cannot
   see what an apply does to the project list. This one loads the
   real store over an in-memory localStorage, and runs ONCE PER
   NAMESPACE (store.js fixes the namespace at module evaluation, so
   each one is its own process):

     - a backup carries every namespace (buildBackup reads
       listAllProjects), so a project whose id is filed under ANOTHER
       namespace on this device is the same project, not a stranger.
       A restore (Drive pull) must update it in place, and pulling the
       same file twice must not change the project count. A merge
       (the hub's import) must still add a VISIBLE, marked copy.
     - the Supabase config is a DESTINATION, like the Drive pointer:
       a backup must neither carry it out nor write it back in, v1 or
       v2, or an imported file re-points this browser's sign-in and
       sync at whatever project the file names.

       node scripts/test-backup-apply.mjs   (npm run test:backup-apply)
   ============================================================ */
import { register } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NS = process.env.FMS_TEST_NS;

if (NS === undefined) {
  /* The parent: one child per namespace, the device's and an account's. */
  let failed = 0;
  for (const [ns, proxy] of [['', ''], ['acct-u', ''], ['', '1']]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: Object.assign({}, process.env, { FMS_TEST_NS: ns, FMS_TEST_PROXY: proxy }), encoding: 'utf8'
    });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}

/* ---- the child ------------------------------------------------ */
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('.css'))
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

const mem = new Map();

if (process.env.FMS_TEST_PROXY) {
  /* THE PROXY CHILD: a refused write is not a save. A real Storage
     prototype, so store.js installs its proxy; the small tier refuses
     one key the way a full quota does. 'saved' is what cloud.js and
     drive-sync.js stamp and push on, so it must not fire for a write
     that left the old value on disk. */
  const refuse = new Set();
  globalThis.Storage = class Storage {
    getItem(k) { return mem.has(k) ? mem.get(k) : null; }
    setItem(k, v) { if (refuse.has(k)) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, String(v)); }
    removeItem(k) { mem.delete(k); }
    key(i) { return [...mem.keys()][i] ?? null; }
    get length() { return mem.size; }
  };
  globalThis.localStorage = new globalThis.Storage();
  globalThis.document = {
    readyState: 'complete', body: null,
    addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }
  };
  mem.set('fms_studio_projects_v1', JSON.stringify([{ id: 'here', title: 'Mine', format: 'feature', ns: [''] }]));
  mem.set('fms_studio_current_project_v1', 'here');
  const Store = (await import('../src/lib/store.js')).default;
  let fail = 0, pass = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ [proxy] ' + m); } };
  const seen = [];
  Store.subscribe('saved', (d) => seen.push('saved:' + d.key));
  Store.subscribe('storage:error', (d) => seen.push('error:' + d.key));
  localStorage.setItem('fms_scenes_v1', '{"scenes":[1]}');
  ok(mem.get('fms_scenes_v1__here') === '{"scenes":[1]}' && seen.join() === 'saved:fms_scenes_v1', 'a write that goes through is a save — got ' + seen.join());
  seen.length = 0;
  /* Both tiers full: no IndexedDB here, so the big tier answers
     'unavailable' once asked, and the small tier refuses the key. */
  const Overflow = (await import('../src/lib/overflow.js')).default;
  await Overflow.hydrate();
  ok(Overflow.state() === 'unavailable', 'the overflow tier is unavailable in this child — got ' + Overflow.state());
  refuse.add('fms_scenes_v1__here');
  localStorage.setItem('fms_scenes_v1', '{"scenes":[2]}');
  ok(mem.get('fms_scenes_v1__here') === '{"scenes":[1]}', 'the refused write left the old value');
  ok(!seen.includes('saved:fms_scenes_v1'), "a refused write does not fire 'saved' — got " + seen.join());
  ok(seen.includes('error:fms_scenes_v1'), 'it fires storage:error — got ' + seen.join());
  console.log(fail ? `\n[proxy] ${fail} failed, ${pass} passed` : `✓ backup apply [proxy]: ${pass} checks`);
  process.exit(fail ? 1 : 0);
}

globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; }
};

/* store.js arms a DOMContentLoaded hook at evaluation; a document
   that has already loaded and holds nothing is all it needs. */
globalThis.document = {
  readyState: 'complete', body: null,
  addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }
};

const OTHER = NS ? '' : 'acct-u';          // the namespace this process is NOT in
const PROJECTS = 'fms_studio_projects_v1';
const CFG = 'fms_supabase_cfg_v1';

/* The device before the store loads: one project visible here, one
   filed only under the other namespace (a device project the account
   declined to adopt, or an account project seen signed out). */
if (NS) mem.set('fms_studio_account_v1', NS);
mem.set(PROJECTS, JSON.stringify([
  { id: 'here', title: 'Mine', format: 'feature', ns: [NS] },
  { id: 'there', title: 'Other side', format: 'short', ns: [OTHER] }
]));
mem.set('fms_scenes_v1__there', JSON.stringify({ scenes: [{ id: 'old' }] }));

const Store = (await import('../src/lib/store.js')).default;
const { buildBackup, applyBackup, GLOBAL_KEYS } = await import('../src/lib/backup.js');

let pass = 0, fail = 0;
const tag = NS ? '[account]' : '[device]';
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + tag + ' ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const all = () => JSON.parse(mem.get(PROJECTS));

eq(Store.currentNamespace(), NS, 'the store loaded in the namespace under test');
eq(Store.listProjects().map((p) => p.id), ['here'], 'only the namespace\'s own project is visible');

/* ---- restore: a pull of a file carrying both namespaces ------- */
const file = buildBackup();
eq(file.projects.map((p) => p.id).sort(), ['here', 'there'], 'the backup carries every namespace');
/* the other device edited the cross-namespace project */
file.data.there = { scenes: { scenes: [{ id: 'new' }] } };

const r1 = applyBackup(JSON.parse(JSON.stringify(file)), { mode: 'restore', confirm: () => true });
ok(r1.ok, 'the first pull applies');
eq(all().length, 2, 'a pull mints no copy of a project filed under another namespace');
eq(JSON.parse(mem.get('fms_scenes_v1__there')).scenes[0].id, 'new', 'the pull UPDATES that project in place');
eq(all().find((p) => p.id === 'there').ns, [OTHER], 'and leaves its namespace alone');
eq(r1.added, 0, 'nothing is reported as added');

applyBackup(JSON.parse(JSON.stringify(file)), { mode: 'restore', confirm: () => true });
eq(all().length, 2, 'a second pull of the same file still mints nothing');
eq(buildBackup().projects.length, 2, 'and the next push carries two projects, not three');

/* ---- a pull from an older build leaves this device's region alone ---- */
Store.updateProject('here', { region: 'INT' });
{
  const old = JSON.parse(JSON.stringify(file));
  for (const p of old.projects) delete p.region;   // an older build writes no region
  applyBackup(old, { mode: 'restore', confirm: () => true });
  eq(all().find((p) => p.id === 'here').region, 'INT', 'a pull whose entry has no region keeps the film\'s region');
  const said = JSON.parse(JSON.stringify(file));
  said.projects.find((p) => p.id === 'here').region = 'IN';
  applyBackup(said, { mode: 'restore', confirm: () => true });
  eq(all().find((p) => p.id === 'here').region, 'IN', 'a pull that states a region carries it');
}

/* ---- merge: the hub's import of the same file ----------------- */
const r2 = applyBackup(JSON.parse(JSON.stringify(file)), { mode: 'merge', confirm: () => true });
ok(r2.ok, 'a merge applies');
eq(r2.added, 2, 'a merge adds both as copies');
const visible = Store.listProjects();
ok(visible.some((p) => p.title === 'Other side (imported)' && p.id !== 'there'),
  'a cross-namespace clash in a merge lands as a VISIBLE, marked copy with a new id');
ok(visible.some((p) => p.title === 'Mine (imported)'), 'a same-namespace clash is marked as before');
eq(all().filter((p) => p.id === 'there').length, 1, 'an id never means two projects');

/* ---- the Supabase config is not part of a backup -------------- */
ok(!('sync_config' in GLOBAL_KEYS), 'GLOBAL_KEYS does not name the Supabase config');
mem.set(CFG, JSON.stringify({ url: 'https://mine.supabase.co', key: 'k-mine' }));
ok(!('sync_config' in buildBackup().global), 'an export does not carry the config');
mem.delete(CFG);

const crafted = JSON.parse(JSON.stringify(file));
crafted.global = { sync_config: { url: 'https://evil.supabase.co', key: 'k-evil' }, studio_prefs: { theme: 'ink' } };
applyBackup(crafted, { mode: 'merge', confirm: () => true });
eq(mem.get(CFG), undefined, 'a v2 file cannot write the config');
ok(JSON.parse(mem.get('fms_studio_prefs_v1') || '{}').theme === 'ink', 'the rest of the globals still restore');

mem.set(CFG, JSON.stringify({ url: 'https://mine.supabase.co', key: 'k-mine' }));
applyBackup(crafted, { mode: 'restore', confirm: () => true });
eq(JSON.parse(mem.get(CFG)).url, 'https://mine.supabase.co', 'a restore leaves an existing override alone');
mem.delete(CFG);

const v1 = { feature_blueprint: { meta_title: 'Old one' }, sync_config: { url: 'https://evil.supabase.co', key: 'k-evil' } };
applyBackup(v1, { confirm: () => true });
eq(mem.get(CFG), undefined, 'a v1 file cannot write the config');

console.log(fail ? `\n${tag} ${fail} failed, ${pass} passed` : `✓ backup apply ${tag}: ${pass} checks`);
process.exit(fail ? 1 : 0);
