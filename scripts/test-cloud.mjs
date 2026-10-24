/* ============================================================
   THE CLOUD LAYER'S QUEUE, CLOCKS, BOOT AND GATE — in Node
   ------------------------------------------------------------
   src/lib/cloud.js is a browser module with a lazy SDK, so nothing
   but a signed-in browser used to exercise its decisions, and every
   proof that signs in runs against a built dist. This loads the REAL
   file under Node with its neighbours replaced at the seams — store.js,
   gate.js, the extension bridge, usage, billing and the Supabase SDK —
   and drives it the way a page would. Each case imports a fresh copy
   (`?case=N`), because the module keeps its session in its own scope.

   Asserted, one block per audited fault:
     · the offline queue belongs to the account that queued it: an op
       queued under A is never sent under B, stays queued for A, and a
       legacy op with no owner is sent only for a project the open
       namespace can see;
     · a queued upsert is checked against the server first: a newer
       server row wins (local salvaged, nothing uploaded), an older one
       is replaced with the EDIT time, not the send time;
     · an offline cold start whose token refresh failed on the network
       keeps the stored account; a definite sign-out still clears it;
     · a code redeemed through the pending ticket starts the code's
       trial, and the extension panel's signed-in redeem does too.

       node scripts/test-cloud.mjs      (or: npm run test:cloud)
   ============================================================ */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

/* ---- the seams ------------------------------------------------- */
const F = (globalThis.__cloudFakes = {});
const delegate = (name, fns) => fns.map((f) => `export const ${f} = (...a) => globalThis.__cloudFakes.${name}.${f}(...a);`).join('\n');
const STUBS = {
  'store.js': 'export default new Proxy({}, { get: (_, k) => globalThis.__cloudFakes.Store[k] });\n'
    + delegate('Store', ['rawGet', 'rawSet', 'rawRemove']),
  'gate.js': delegate('gate', ['createGate', 'startHeartbeat', 'useHolder', 'getCodePass']),
  'extension-bridge.js': delegate('ext', ['inExtension', 'sessionStorageAdapter', 'gateHolder', 'extensionGoogleTokens', 'onSessionLost']),
  'usage.js': 'export const bumpUsage = () => {};',
  'ports.js': 'export const callPort = (n, d) => d; export const hasPort = () => false;',
  'billing.js': 'export default { startTrial: (...a) => globalThis.__cloudFakes.billing.startTrial(...a) };',
  'drive-sync.js': 'export const isConnected = () => false; export const push = async () => ({ ok: true });',
  '@supabase/supabase-js': delegate('sdk', ['createClient', 'isAuthRetryableFetchError'])
};
const enc = (src) => 'data:text/javascript,' + encodeURIComponent(src);
register(enc(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(spec, ctx, next) {
    const bare = spec.split('?')[0];
    for (const [name, src] of Object.entries(STUBS)) {
      if (bare === name || bare.endsWith('/' + name))
        return { url: 'data:text/javascript,' + encodeURIComponent(src), shortCircuit: true };
    }
    return next(spec, ctx);
  }
`), import.meta.url);

/* ---- browser globals ------------------------------------------- */
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  key: (i) => [...ls.keys()][i] ?? null,
  get length() { return ls.size; }
};
const ss = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (ss.has(k) ? ss.get(k) : null),
  setItem: (k, v) => ss.set(k, String(v)),
  removeItem: (k) => ss.delete(k)
};
const listeners = {};
globalThis.window = globalThis;
globalThis.addEventListener = (t, fn) => { (listeners[t] ||= []).push(fn); };
let online = true;
Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online; }, userAgent: 'node' }, configurable: true });
globalThis.location = { hash: '', search: '', pathname: '/dashboard', origin: 'https://example.test', href: 'https://example.test/dashboard' };
globalThis.document = { documentElement: { dataset: {} } };
globalThis.setInterval = () => 0;          // the 30s flush timer: driven by hand here
const noToast = () => ({});
globalThis.StudioUI = { toast: noToast, toastSuccess: noToast, toastError: noToast, toastInfo: noToast };
console.warn = () => {}; console.info = () => {}; console.error = () => {};

/* ---- the fake Store -------------------------------------------- */
const raw = new Map();
let projects = [];            // [{ id, title, format, ns, updatedAt }]
let currentPid = null;
let accountNs = '';
const setAccountCalls = [];
const subs = {};
F.Store = {
  SCOPED_KEYS: ['fms_script_v1', 'fms_scenes_v1'],
  rawGet: (k) => (raw.has(k) ? raw.get(k) : null),
  rawSet: (k, v) => raw.set(k, String(v)),
  rawRemove: (k) => raw.delete(k),
  listAllProjects: () => projects.slice(),
  listProjects: () => projects.filter((p) => (p.ns || ['']).includes(accountNs)),
  getProject: (id) => projects.find((p) => p.id === id) || null,
  currentProjectId: () => currentPid,
  setCurrentProject: (id) => { currentPid = id; },
  isAccountNamespace: () => !!accountNs,
  listAdoptableProjects: () => [],
  adoptDeviceProjects: () => [],
  upsertProjectMeta: () => {},
  setAccount: (uid) => { setAccountCalls.push(uid); accountNs = uid || ''; return false; },
  subscribe: (ev, fn) => { (subs[ev] ||= []).push(fn); return () => {}; },
  notify: (ev, d) => { (subs[ev] || []).forEach((fn) => { try { fn(d); } catch (e) { /* the page's */ } }); }
};

/* ---- the fake gate, extension and billing ---------------------- */
let gateImpl = {};
let codePass = null;
F.gate = {
  createGate: () => new Proxy({}, { get: (_, k) => (...a) => (gateImpl[k] ? gateImpl[k](...a) : Promise.resolve(null)) }),
  startHeartbeat: () => ({ stop() {} }),
  useHolder: () => {},
  getCodePass: () => codePass
};
F.ext = {
  inExtension: () => false, sessionStorageAdapter: () => undefined, gateHolder: () => ({}),
  extensionGoogleTokens: async () => null, onSessionLost: () => {}
};
let trials = 0;
F.billing = { startTrial: async () => { trials++; return { ok: true }; } };

/* ---- the fake Supabase ----------------------------------------- */
let sessionResult = { data: { session: null }, error: null };
let onGetSession = () => {};
let dbHandler = () => ({ data: null, error: null });
const calls = [];
function builder(table) {
  const ops = [];
  const p = new Proxy({}, {
    get(_, k) {
      if (k === 'then') {
        const res = Promise.resolve().then(() => { calls.push({ table, ops }); return dbHandler(table, ops); });
        return res.then.bind(res);
      }
      return (...a) => { ops.push([k, ...a]); return p; };
    }
  });
  return p;
}
F.sdk = {
  isAuthRetryableFetchError: (e) => !!e && e.name === 'AuthRetryableFetchError',
  createClient: () => ({
    auth: {
      getSession: async () => { onGetSession(); return sessionResult; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({})
    },
    from: (t) => builder(t),
    rpc: (name, args) => builder('rpc:' + name),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe() {}, track: async () => {}, untrack() {}, presenceState: () => ({}) }; return ch; },
    removeChannel: () => {},
    realtime: { setAuth() {} }
  })
};

/* ---- the test kit ---------------------------------------------- */
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const QUEUE_KEY = 'fms_studio_cloud_queue_v1';
const META_KEY = 'fms_studio_sync_meta_v1';
const SALVAGE_KEY = 'fms_studio_sync_salvage_v1';
const queue = () => JSON.parse(raw.get(QUEUE_KEY) || '[]');
const sessionFor = (uid) => ({ data: { session: { user: { id: uid, email: uid + '@x.test' }, access_token: 't' } }, error: null });
const openGate = () => {
  gateImpl = {
    status: async () => ({ deployed: true, registered: true, role: '' }),
    hasPendingTicket: async () => false,
    acquire: async () => 'ok'
  };
};
const writes = (table) => calls.filter((c) => c.table === table && c.ops.some(([k]) => k === 'insert' || k === 'upsert' || k === 'update'));
const touches = (pid) => calls.filter((c) => JSON.stringify(c.ops).includes(pid) && c.ops.some(([k]) => k === 'insert' || k === 'upsert'));

let caseN = 0;
async function load({ uid, storedToken = true } = {}) {
  calls.length = 0;
  setAccountCalls.length = 0;
  ls.set('fms_supabase_cfg_v1', JSON.stringify({ url: 'https://abc.supabase.co', key: 'anon' }));
  if (storedToken) ls.set('sb-abc-auth-token', '{}'); else ls.delete('sb-abc-auth-token');
  if (uid !== undefined) sessionResult = uid ? sessionFor(uid) : { data: { session: null }, error: null };
  const mod = await import('../src/lib/cloud.js?case=' + (++caseN));
  await wait(30);                  // boot(): client, session, runGate, attach
  return mod;
}
/* The default database: nothing exists, every write succeeds. */
const emptyDb = (table, ops) => {
  if (ops.some(([k]) => k === 'select') && !ops.some(([k]) => k === 'insert' || k === 'upsert')) return { data: [], error: null };
  return { data: null, error: null };
};

/* ================================================================
   BUG 2 — the queue is flushed under whichever account signs in
   ================================================================ */
{
  // A's session: a push that fails on the network is queued, OWNED by A.
  projects = [{ id: 'pA', title: 'A film', format: 'feature', ns: ['uA'], updatedAt: '2026-10-01T00:00:00Z' }];
  accountNs = 'uA'; currentPid = 'pA';
  openGate();
  dbHandler = (table, ops) => (table === 'project_data' && ops.some(([k]) => k === 'upsert'))
    ? { data: null, error: { message: 'Failed to fetch' } } : emptyDb(table, ops);
  raw.set('fms_script_v1__pA', JSON.stringify({ elements: [{ id: 'e1', text: 'A wrote this' }] }));
  await load({ uid: 'uA' });
  raw.delete(QUEUE_KEY);
  Store_save('fms_script_v1');
  await wait(900);                 // the 800ms debounce, then the failed push
  const q = queue();
  ok(q.length === 1 && q[0].kind === 'upsert' && q[0].projectId === 'pA', 'a failed push is queued');
  eq(q[0] && q[0].uid, 'uA', 'the queued op names the account that queued it');
}
{
  // B signs in on the same browser. A's op (stamped) and a LEGACY op with
  // no owner for A's project are both waiting; so is one of B's own.
  projects.push({ id: 'pB', title: 'B film', format: 'feature', ns: ['uB'], updatedAt: '2026-10-01T00:00:00Z' });
  raw.set('fms_script_v1__pB', JSON.stringify({ elements: [{ id: 'b1', text: 'B wrote this' }] }));
  const t = Date.now();
  raw.set(QUEUE_KEY, JSON.stringify([
    { kind: 'meta', project: projects[0], uid: 'uA', ts: t },
    { kind: 'upsert', projectId: 'pA', scope: 'script', uid: 'uA', ts: t },
    { kind: 'upsert', projectId: 'pA', scope: 'scenes', ts: t },          // legacy: no owner
    { kind: 'upsert', projectId: 'pB', scope: 'script', uid: 'uB', ts: t }
  ]));
  accountNs = 'uB'; currentPid = 'pB';
  dbHandler = emptyDb;
  const C = await load({ uid: 'uB' });
  calls.length = 0;
  await C.flushQueue();
  eq(touches('pA').length, 0, "B's flush sends nothing of A's project (no insert of A's film, no upsert of A's scopes)");
  ok(writes('project_data').some((c) => JSON.stringify(c.ops).includes('"pB"')), "B's own queued op is sent");
  const left = queue();
  ok(left.some((o) => o.kind === 'meta' && o.uid === 'uA') && left.some((o) => o.kind === 'upsert' && o.projectId === 'pA' && o.uid === 'uA'),
    "A's ops stay queued for A's next sign-in");
  ok(left.some((o) => o.kind === 'upsert' && o.projectId === 'pA' && o.scope === 'scenes'),
    "a legacy, owner-less op for a project outside B's namespace is kept, not sent");
  ok(!left.some((o) => o.projectId === 'pB'), "B's sent op left the queue");
  ok(C.getSyncStatus().pending === 0, "B's status does not count A's waiting changes — got " + C.getSyncStatus().pending);
  // A legacy op for a project B's namespace CAN see is B's to send.
  raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pB', scope: 'script', ts: t }]));
  calls.length = 0;
  await C.flushQueue();
  ok(writes('project_data').some((c) => JSON.stringify(c.ops).includes('"pB"')), 'a legacy op for a project in the open namespace is sent');
  eq(queue().length, 0, 'and leaves the queue (adopted, not duplicated)');
  ok(C.getSyncStatus().pending === 0, "B's status does not count A's waiting changes — got " + C.getSyncStatus().pending);
}

/* ================================================================
   BUG 3 — a stale queued edit is stamped with the send time
   ================================================================ */
const T10 = Date.parse('2026-10-20T10:00:00Z');
const T11 = Date.parse('2026-10-20T11:00:00Z');
const T09 = Date.parse('2026-10-20T09:00:00Z');
{
  projects = [{ id: 'pS', title: 'S', format: 'feature', ns: ['uA'], updatedAt: '2026-10-20T10:00:00Z' }];
  accountNs = 'uA'; currentPid = 'pS';
  openGate();
  const LOCAL = JSON.stringify({ scenes: [{ id: 's1', slug: 'old offline edit' }] });
  const SERVER = { scenes: [{ id: 's1', slug: 'newer edit from device B' }] };
  dbHandler = (table, ops) => {
    if (table === 'project_data' && !ops.some(([k]) => k === 'upsert'))
      return { data: [{ scope: 'scenes', data: SERVER, updated_at: new Date(T11).toISOString() }], error: null };
    return emptyDb(table, ops);
  };
  const C = await load({ uid: 'uA' });
  raw.set('fms_scenes_v1__pS', LOCAL);
  raw.set(META_KEY, JSON.stringify({ 'pS::scenes': { local: T10, remote: T09 } }));
  raw.set(SALVAGE_KEY, '[]');
  raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pS', scope: 'scenes', uid: 'uA', ts: T10 }]));
  calls.length = 0;
  await C.flushQueue();
  eq(writes('project_data').length, 0, 'a queued 10:00 edit does not overwrite the server’s 11:00 row');
  eq(raw.get('fms_scenes_v1__pS'), JSON.stringify(SERVER), 'the newer server copy is applied here');
  ok((raw.get(SALVAGE_KEY) || '').includes('old offline edit'), 'the displaced local copy is in the salvage ring');
  eq(queue().length, 0, 'the op is resolved, not retried for ever');
}
{
  const LOCAL = JSON.stringify({ scenes: [{ id: 's1', slug: 'offline edit, newer than the server' }] });
  let upserted = null;
  dbHandler = (table, ops) => {
    const up = ops.find(([k]) => k === 'upsert');
    if (table === 'project_data' && up) { upserted = up[1]; return { data: null, error: null }; }
    if (table === 'project_data')
      return { data: [{ scope: 'scenes', data: { scenes: [] }, updated_at: new Date(T09).toISOString() }], error: null };
    return emptyDb(table, ops);
  };
  const C = await load({ uid: 'uA' });
  raw.set('fms_scenes_v1__pS', LOCAL);
  raw.set(META_KEY, JSON.stringify({ 'pS::scenes': { local: T10, remote: T09 } }));
  raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pS', scope: 'scenes', uid: 'uA', ts: T10 }]));
  await C.flushQueue();
  ok(!!upserted, 'a queued edit newer than the server row is uploaded');
  eq(upserted && upserted.updated_at, new Date(T10).toISOString(), 'it carries the EDIT time (10:00), not the moment it was sent');
  eq(queue().length, 0, 'and leaves the queue');
}
{
  // A plain live push still goes up stamped no later than now.
  let upserted = null;
  dbHandler = (table, ops) => {
    const up = ops.find(([k]) => k === 'upsert');
    if (table === 'project_data' && up) { upserted = up[1]; return { data: null, error: null }; }
    return emptyDb(table, ops);
  };
  const C = await load({ uid: 'uA' });
  raw.set('fms_scenes_v1__pS', JSON.stringify({ scenes: [{ id: 's2' }] }));
  const before = Date.now();
  Store_save('fms_scenes_v1');
  await wait(900);
  ok(!!upserted, 'a live save is pushed');
  const at = upserted ? Date.parse(upserted.updated_at) : 0;
  ok(at >= before - 5 && at <= Date.now(), 'a live push is stamped with its edit, which is now');
  void C;
}

/* ================================================================
   BUG 4 — an offline cold start erases the account pointer
   ================================================================ */
{
  openGate();
  dbHandler = emptyDb;
  online = false;
  sessionResult = { data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } };
  await load({ storedToken: true });
  ok(!setAccountCalls.includes(null), 'offline, a refresh that failed on the network keeps the stored account (setAccount calls: ' + JSON.stringify(setAccountCalls) + ')');
  online = true;
}
{
  // Online, but the refresh failed retryably (a dead captive portal): still kept.
  sessionResult = { data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } };
  await load({ storedToken: true });
  ok(!setAccountCalls.includes(null), 'a retryable refresh failure keeps the stored account');
}
{
  // A definite end: auth-js removed the token (refresh refused), online.
  sessionResult = { data: { session: null }, error: { name: 'AuthApiError', message: 'Invalid Refresh Token' } };
  onGetSession = () => ls.delete('sb-abc-auth-token');
  await load({ storedToken: true });
  onGetSession = () => {};
  ok(setAccountCalls.includes(null), 'a refused refresh (token gone) still clears the stale account');
}
{
  // Nothing stored at all, configured: signed out, cleared as before.
  sessionResult = { data: { session: null }, error: null };
  await load({ storedToken: false });
  ok(setAccountCalls.includes(null), 'no stored session at all still clears the stale account');
}

/* ================================================================
   BUG 32 — the pending-ticket redemption never starts the trial
   ================================================================ */
{
  projects = [{ id: 'pT', title: 'T', format: 'feature', ns: ['uT'], updatedAt: '2026-10-01T00:00:00Z' }];
  accountNs = 'uT'; currentPid = 'pT';
  let registered = false, ticket = true;
  gateImpl = {
    status: async () => ({ deployed: true, registered, role: '' }),
    hasPendingTicket: async () => ticket,
    redeemPending: async () => { ticket = false; registered = true; return { ok: true }; },
    redeemCode: async () => { registered = true; return { ok: true }; },
    acquire: async () => 'ok'
  };
  codePass = { code: 'ABCD-EFGH' };   // held as well, exactly as gate-ui.js leaves it
  dbHandler = emptyDb;
  trials = 0;
  await load({ uid: 'uT' });
  eq(trials, 1, 'a code redeemed through the pending ticket starts the code trial, once');
  codePass = null;
}
{
  // Already a member: no ticket redemption, no trial call.
  gateImpl = {
    status: async () => ({ deployed: true, registered: true, role: '' }),
    hasPendingTicket: async () => false,
    acquire: async () => 'ok'
  };
  trials = 0;
  await load({ uid: 'uT' });
  eq(trials, 0, 'an existing member starts no trial on sign-in');
}
{
  // The extension panel's signed-in redeem form (DOM-bound, so traced from
  // source): the trial must start between the redemption and the gate.
  const src = readFileSync(new URL('../src/pages/panel.js', import.meta.url), 'utf8');
  const m = src.match(/form\.dataset\.pnForm === 'redeem'\)\s*\{([\s\S]*?)\}\s*else/);
  const body = m ? m[1] : '';
  const iRedeem = body.indexOf('redeemCode('), iTrial = body.indexOf('startCodeTrial('), iGate = body.indexOf('runGate(');
  ok(iRedeem >= 0 && iTrial > iRedeem && iGate > iTrial, "panel.js's redeem branch calls startCodeTrial() after redeemCode() and before runGate()");
}

/* ================================================================
   PONYTAIL (data) — a push resets the local clock to an older time
   ================================================================ */
{
  projects = [{ id: 'pR', title: 'R', format: 'feature', ns: ['uA'], updatedAt: '2026-10-01T00:00:00Z' }];
  accountNs = 'uA'; currentPid = 'pR';
  openGate();
  const ups = [];
  let delay = 0;
  dbHandler = (table, ops) => {
    const up = ops.find(([k]) => k === 'upsert');
    if (table === 'project_data' && up) { ups.push(up[1]); return wait(delay).then(() => ({ data: null, error: null })); }
    return emptyDb(table, ops);
  };
  await load({ uid: 'uA' });
  raw.delete(META_KEY);
  raw.set('fms_scenes_v1__pR', JSON.stringify({ scenes: [{ id: 'r1', slug: 'first edit' }] }));
  delay = 300;
  Store_save('fms_scenes_v1');                 // t0
  await wait(850);                             // the push is in flight now
  raw.set('fms_scenes_v1__pR', JSON.stringify({ scenes: [{ id: 'r1', slug: 'typed during the upsert' }] }));
  const t1 = Date.now();
  Store_save('fms_scenes_v1');                 // a save that lands mid-flight
  await wait(400);                             // the first upsert has returned
  const row = JSON.parse(raw.get(META_KEY) || '{}')['pR::scenes'] || {};
  ok(row.local >= t1, 'a push returning after a newer save leaves the local clock at that save (local ' + row.local + ', save ' + t1 + ')');
  delay = 0;
  await wait(900);                             // the second, debounced push
  const last = ups[ups.length - 1] || {};
  ok(ups.length >= 2 && last.data && last.data.scenes[0].slug === 'typed during the upsert', 'the newer content goes up — ' + JSON.stringify(ups.map((u) => [u.updated_at, u.data])));
  ok(Date.parse(last.updated_at) >= t1, 'and is stamped with ITS edit, not the first one — got ' + last.updated_at);
}

/* ================================================================
   PONYTAIL (data) — received copies push the offline copy out of
   the salvage ring
   ================================================================ */
{
  projects = [{ id: 'pV', title: 'V', format: 'feature', ns: ['uA'], updatedAt: '2026-10-01T00:00:00Z' }];
  accountNs = 'uA'; currentPid = 'pV';
  openGate();
  let serverRow = null;
  dbHandler = (table, ops) => (table === 'project_data' && ops.some(([k]) => k === 'select'))
    ? { data: serverRow ? [serverRow] : [], error: null } : emptyDb(table, ops);
  const C = await load({ uid: 'uA' });
  raw.set('fms_scenes_v1__pV', JSON.stringify({ scenes: [{ id: 'v', slug: 'a week of offline work' }] }));
  raw.set(META_KEY, JSON.stringify({ 'pV::scenes': { local: T09 } }));
  raw.set(SALVAGE_KEY, '[]');
  for (let i = 0; i < 14; i++) {
    serverRow = { scope: 'scenes', data: { scenes: [{ id: 'v', slug: 'collaborator copy ' + i }] }, updated_at: new Date(T10 + i * 1000).toISOString() };
    await C.pullProjectData('pV');
  }
  const ring = JSON.parse(raw.get(SALVAGE_KEY) || '[]');
  ok(ring.some((r) => r.data.includes('a week of offline work')), 'the offline copy is still in the salvage ring after 13 received copies');
  eq(ring.length, 1, 'a copy this device only received from the server is not salvaged');
  // A copy written here without a clock (a backup restore, raw) is still salvaged.
  raw.set('fms_scenes_v1__pV', JSON.stringify({ scenes: [{ id: 'v', slug: 'restored from a file' }] }));
  serverRow = { scope: 'scenes', data: { scenes: [{ id: 'v', slug: 'collaborator copy 14' }] }, updated_at: new Date(T10 + 14000).toISOString() };
  await C.pullProjectData('pV');
  ok(JSON.parse(raw.get(SALVAGE_KEY) || '[]').some((r) => r.data.includes('restored from a file')), 'a local copy that differs from the last server copy is still salvaged');
}

/* ================================================================
   §55 — a PRIVATE budget on a view link is not pushed, not queued
   ================================================================ */
{
  projects = [{ id: 'pP', title: 'P', format: 'feature', ns: ['uV'], updatedAt: '2026-10-01T00:00:00Z' }];
  accountNs = 'uV'; currentPid = 'pP';
  openGate();
  let privacy = { data: { private: true, visible: false, can_change: false }, error: null };
  dbHandler = (table, ops) => {
    if (table === 'rpc:budget_privacy') return privacy;
    if (table === 'project_data' && ops.some(([k]) => k === 'upsert')) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    return emptyDb(table, ops);
  };
  raw.set('fms_costs_v1__pP', JSON.stringify({ expenses: [{ id: 'x', amount: 500 }] }));
  raw.set('fms_scenes_v1__pP', JSON.stringify({ scenes: [{ id: 's', slug: 'kept' }] }));
  raw.delete(QUEUE_KEY);
  /* Every earlier case's module copy is still subscribed to 'saved'; only this one may answer. */
  const fresh = () => { for (const k of Object.keys(subs)) delete subs[k]; };
  fresh();
  const C = await load({ uid: 'uV' });
  const st = await C.budgetPrivacy('pP');
  ok(st.known && st.private && !st.visible && !st.canChange, 'budget_privacy() reads private + not visible — ' + JSON.stringify(st));
  calls.length = 0;
  Store_save('fms_costs_v1');
  await wait(900);
  eq(writes('project_data').length, 0, 'a viewer’s costs are not sent when the budget is private');
  eq(queue().filter((o) => o.scope === 'costs').length, 0, 'and nothing is queued to retry');
  ok(raw.get('fms_costs_v1__pP').includes('"amount":500'), 'the viewer’s local copy is untouched');
  // A legacy queued op for the private scope is dropped on flush, not retried.
  raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pP', scope: 'library', uid: 'uV', ts: Date.now() }]));
  calls.length = 0;
  await C.flushQueue();
  eq(writes('project_data').length, 0, 'a queued library op is not sent');
  eq(queue().length, 0, 'and leaves the queue');
  // Not cached yet, the owner flips it mid-session: the 42501 is asked about once and dropped.
  fresh();
  const C2 = await load({ uid: 'uV' });
  privacy = { data: { private: false, visible: true, can_change: false }, error: null };
  await C2.budgetPrivacy('pP', { force: true });
  privacy = { data: { private: true, visible: false, can_change: false }, error: null };
  raw.delete(QUEUE_KEY);
  Store_save('fms_library_calc_v1');
  raw.set('fms_library_calc_v1__pP', JSON.stringify({ calc_item_1: 'Camera' }));
  Store_save('fms_library_calc_v1');
  await wait(900);
  eq(queue().filter((o) => o.scope === 'library').length, 0, 'a 42501 on a budget that turned private is not queued');
  // Section 55 absent: PGRST202 reads as not private, and costs go up as before.
  privacy = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  fresh();
  const C3 = await load({ uid: 'uV' });
  const st3 = await C3.budgetPrivacy('pP', { force: true });
  ok(!st3.known && !st3.private && st3.visible && st3.missing, 'PGRST202 reads as unknown / not private — ' + JSON.stringify(st3));
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? privacy : emptyDb(table, ops);
  calls.length = 0;
  Store_save('fms_costs_v1');
  await wait(900);
  ok(writes('project_data').some((c) => JSON.stringify(c.ops).includes('"costs"')), 'without §55 the costs scope syncs exactly as before');
  // The owner's toggle reads the answer back.
  privacy = { data: { private: true, visible: true, can_change: true }, error: null };
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? privacy
    : table === 'rpc:set_budget_private' ? { data: true, error: null } : emptyDb(table, ops);
  const r = await C3.setBudgetPrivate('pP', true);
  ok(r.ok && r.state.private && r.state.canChange, 'setBudgetPrivate() reports what the server reads back — ' + JSON.stringify(r));
  dbHandler = (table, ops) => table === 'rpc:set_budget_private' ? { data: null, error: { code: '42501', message: 'Only the film’s owner' } }
    : table === 'rpc:budget_privacy' ? { data: { private: false, visible: true, can_change: false }, error: null } : emptyDb(table, ops);
  const r2 = await C3.setBudgetPrivate('pP', true);
  ok(!r2.ok && r2.error === '42501' && !r2.state.private, 'a refused toggle says so and the state stays off — ' + JSON.stringify(r2));
  // A set that worked but whose read-back failed is a success, and the switch stays.
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? { data: { private: false, visible: true, can_change: true }, error: null } : emptyDb(table, ops);
  await C3.budgetPrivacy('pP', { force: true });
  dbHandler = (table, ops) => table === 'rpc:set_budget_private' ? { data: true, error: null }
    : table === 'rpc:budget_privacy' ? { data: null, error: { code: '503', message: 'upstream' } } : emptyDb(table, ops);
  const r3 = await C3.setBudgetPrivate('pP', true);
  ok(r3.ok && r3.state.known && r3.state.private && r3.state.canChange, 'a successful set with a failed read-back is reported as done and keeps the switch — ' + JSON.stringify(r3));
  // A flaky re-read does not unlock a viewer's known private state.
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? { data: { private: true, visible: false, can_change: false }, error: null } : emptyDb(table, ops);
  await C3.budgetPrivacy('pP', { force: true });
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? { data: null, error: { code: '500', message: 'boom' } } : emptyDb(table, ops);
  const st4 = await C3.budgetPrivacy('pP', { force: true });
  ok(st4.known && st4.private && !st4.visible, 'a transient failure keeps the known private state — ' + JSON.stringify(st4));
  dbHandler = (table, ops) => table === 'rpc:budget_privacy' ? { data: null, error: { code: 'PGRST202', message: 'gone' } } : emptyDb(table, ops);
  const st5 = await C3.budgetPrivacy('pP', { force: true });
  ok(!st5.known && st5.missing, 'but a missing function (§55 absent) does replace it — ' + JSON.stringify(st5));
}

/* ================================================================
   THE SHARED BEAT SHEET — the story scope merges only with §49 on
   ================================================================ */
{
  const T1 = Date.parse('2026-10-24T09:00:00Z'), T2 = Date.parse('2026-10-24T11:00:00Z'), T3 = Date.parse('2026-10-24T12:00:00Z');
  const step = (id, text, u) => ({ id, beat: 'save_the_cat:catalyst', text, u });
  const LOCAL = JSON.stringify({ v: 1, source: 'S', outline: [step('a', 'Shared step', 1), step('mine', 'Written here', 100)], marks: [] });
  const SERVER = { v: 1, source: 'S', outline: [step('a', 'Shared step', 1), step('theirs', 'Written there', 200)], marks: [] };
  const storyCase = async (coEdit) => {
    projects = [{ id: 'pK', title: 'K', format: 'feature', ns: ['uA'], updatedAt: '2026-10-24T09:00:00Z' }];
    accountNs = 'uA'; currentPid = 'pK';
    openGate();
    raw.set('fms_story_v1__pK', LOCAL);
    raw.set(META_KEY, JSON.stringify({ 'pK::story': { local: T1, remote: T1 } }));
    raw.set(SALVAGE_KEY, '[]');
    raw.delete(QUEUE_KEY);
    dbHandler = (table, ops) => {
      if (table === 'rpc:co_editing_enabled') return { data: coEdit, error: null };
      if (table === 'project_data' && ops.some(([k]) => k === 'select') && !ops.some(([k]) => k === 'upsert'))
        return { data: [{ scope: 'story', data: SERVER, updated_at: new Date(T2).toISOString() }], error: null };
      return emptyDb(table, ops);
    };
    for (const k of Object.keys(subs)) delete subs[k];
    const C = await load({ uid: 'uA' });
    await C.pullProjectData('pK');
    return { C, ids: (JSON.parse(raw.get('fms_story_v1__pK') || '{}').outline || []).map((s) => s.id) };
  };
  const off = await storyCase(false);
  eq(off.ids, ['a', 'theirs'], 'switch OFF: the story is last write wins — the newer server copy replaces this one');
  ok((raw.get(SALVAGE_KEY) || '').includes('Written here'), 'switch OFF: the displaced local story is in the salvage ring, as before');
  const on = await storyCase(true);
  eq(on.ids, ['a', 'mine', 'theirs'], 'switch ON: the two copies of the story merge step by step');
  ok(on.C.coEditingKnown() === true, 'switch ON: coEditingKnown() says so');

  /* A base that outlives the page: a copy RECEIVED and not edited since
     lets a later page tell their delete from a step new here. */
  const received = JSON.stringify(SERVER);
  const reload = async (withRh) => {
    raw.set('fms_story_v1__pK', received);
    const meta = { 'pK::story': { local: T2, remote: T2 } };
    if (withRh) {
      // what markReceived() records: let a pull of the same copy write it
      raw.set(META_KEY, JSON.stringify(meta));
      dbHandler = (table, ops) => table === 'rpc:co_editing_enabled' ? { data: true, error: null }
        : (table === 'project_data' && ops.some(([k]) => k === 'select')) ? { data: [{ scope: 'story', data: SERVER, updated_at: new Date(T2).toISOString() }], error: null }
        : emptyDb(table, ops);
      for (const k of Object.keys(subs)) delete subs[k];
      const C0 = await load({ uid: 'uA' });
      await C0.pullProjectData('pK');
      ok(JSON.parse(raw.get(META_KEY))['pK::story'].rh, 'a copy received from the server is fingerprinted (rh)');
    } else raw.set(META_KEY, JSON.stringify(meta));
    const DELETED = { ...SERVER, outline: [SERVER.outline[0]] };   // they removed 'theirs'
    dbHandler = (table, ops) => table === 'rpc:co_editing_enabled' ? { data: true, error: null }
      : (table === 'project_data' && ops.some(([k]) => k === 'select')) ? { data: [{ scope: 'story', data: DELETED, updated_at: new Date(T3).toISOString() }], error: null }
      : emptyDb(table, ops);
    for (const k of Object.keys(subs)) delete subs[k];
    const C = await load({ uid: 'uA' });       // a new page: no in-memory base
    await C.pullProjectData('pK');
    return (JSON.parse(raw.get('fms_story_v1__pK') || '{}').outline || []).map((s) => s.id);
  };
  eq(await reload(true), ['a'], 'a new page whose copy is the one last received honours their delete');
  eq(await reload(false), ['a', 'theirs'], 'without that proof, a new page deletes nothing');
}

/* ================================================================
   QA ROUND 2 — a step deleted by the collaborator who did not add it
   stays deleted (no push ping-pong), and a keystroke on its debounce
   is saved BEFORE an arrival is merged
   ================================================================ */
{
  const T1 = Date.parse('2026-10-24T09:00:00Z'), T2 = Date.parse('2026-10-24T10:00:00Z'), T3 = Date.parse('2026-10-24T11:00:00Z');
  const step = (id, text, u) => ({ id, beat: 'save_the_cat:catalyst', text, u });
  const BASE = { v: 1, source: 'S', outline: [step('a', 'Shared step', 1)], marks: [] };
  const MINE = { ...BASE, outline: [step('a', 'Shared step', 1), step('S', 'Added here', 50)] };
  let upserted = null, serverRow = null;
  const device = async () => {
    projects = [{ id: 'pD', title: 'D', format: 'feature', ns: ['uA'], updatedAt: '2026-10-24T09:00:00Z' }];
    accountNs = 'uA'; currentPid = 'pD';
    openGate();
    upserted = null; serverRow = null;
    raw.set('fms_story_v1__pD', JSON.stringify(MINE));
    raw.set(META_KEY, JSON.stringify({ 'pD::story': { local: T1, remote: 0 } }));
    raw.set(SALVAGE_KEY, '[]');
    raw.delete(QUEUE_KEY);
    dbHandler = (table, ops) => {
      if (table === 'rpc:co_editing_enabled') return { data: true, error: null };
      const up = ops.find(([k]) => k === 'upsert');
      if (table === 'project_data' && up) { if (up[1].project_id === 'pD') upserted = up[1]; return { data: null, error: null }; }
      if (table === 'project_data' && ops.some(([k]) => k === 'select')) return { data: serverRow ? [serverRow] : [], error: null };
      return emptyDb(table, ops);
    };
    for (const k of Object.keys(subs)) delete subs[k];
    const C = await load({ uid: 'uA' });
    raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pD', scope: 'story', uid: 'uA', ts: T1 }]));
    await C.flushQueue();                          // A pushes the step it added
    return C;
  };
  const ids = () => (JSON.parse(raw.get('fms_story_v1__pD') || '{}').outline || []).map((x) => x.id);
  let C = await device();
  const mine = upserted && upserted.data && upserted.data._sync;
  ok(!!(mine && mine.id) && mine.seen == null, 'a co-edited push names itself, and has received nothing yet — ' + JSON.stringify(mine));
  ok(!('_sync' in JSON.parse(raw.get('fms_story_v1__pD'))), 'the local copy never carries the sync note');
  // B received that push, deleted S and pushed: its row says it had seen A's push
  serverRow = { scope: 'story', data: { ...BASE, _sync: { id: 'pushB1', seen: mine && mine.id } }, updated_at: new Date(T2).toISOString() };
  await C.pullProjectData('pD');
  eq(ids(), ['a'], 'their delete of a step added HERE sticks once their copy was built on my push');
  ok(!raw.get('fms_story_v1__pD').includes('_sync'), 'the arrival’s sync note is stripped before it is stored');
  upserted = null;
  await C.pullProjectData('pD');
  await wait(400);                               // a merge that differs pushes 250ms later
  eq([ids(), upserted], [['a'], null], 'and nothing is pushed back: the two copies agree (no ping-pong)');
  // A's next push says it received B's
  raw.set('fms_story_v1__pD', JSON.stringify({ ...BASE, source: 'S, edited' }));
  raw.set(META_KEY, JSON.stringify({ 'pD::story': { local: T3, remote: T2 } }));
  raw.set(QUEUE_KEY, JSON.stringify([{ kind: 'upsert', projectId: 'pD', scope: 'story', uid: 'uA', ts: T3 }]));
  await C.flushQueue();
  eq(upserted && upserted.data._sync && upserted.data._sync.seen, 'pushB1', 'a later push names the push it received last');
  // the control: a copy NOT built on my push (an older build, a writer who never saw it) deletes nothing
  C = await device();
  serverRow = { scope: 'story', data: { ...BASE, _sync: { id: 'pushB2', seen: 'somebody-else' } }, updated_at: new Date(T2).toISOString() };
  await C.pullProjectData('pD');
  eq(ids(), ['a', 'S'], 'a copy that never saw my push does not delete what I added');
  C = await device();
  serverRow = { scope: 'story', data: BASE, updated_at: new Date(T2).toISOString() };
  await C.pullProjectData('pD');
  eq(ids(), ['a', 'S'], 'nor does one with no sync note at all');

  /* typing on its debounce is saved before the merge reads the copy */
  const RECEIVED = { v: 1, source: 'S', outline: [step('a', 'Shared step', 1), step('sb', 'Ravi wins the street over.', 2)], marks: [] };
  const reloadWith = async (typing) => {
    raw.set('fms_story_v1__pD', JSON.stringify(RECEIVED));
    raw.set(META_KEY, JSON.stringify({ 'pD::story': { local: T1, remote: T1 } }));
    dbHandler = (table, ops) => table === 'rpc:co_editing_enabled' ? { data: true, error: null }
      : (table === 'project_data' && ops.some(([k]) => k === 'select')) ? { data: [{ scope: 'story', data: RECEIVED, updated_at: new Date(T1).toISOString() }], error: null }
      : emptyDb(table, ops);
    for (const k of Object.keys(subs)) delete subs[k];
    const D = await load({ uid: 'uA' });
    await D.pullProjectData('pD');             // the received copy is fingerprinted: it is a base
    const order = [];
    if (typing) F.Store.subscribe('cloud:incoming', (p) => {   // what story.html does: flush the debounce
      order.push(p.scope);
      const cur = JSON.parse(raw.get('fms_story_v1__pD'));
      cur.outline.find((x) => x.id === 'sb').text += ' typing';
      cur.outline.find((x) => x.id === 'sb').u = Date.now();
      raw.set('fms_story_v1__pD', JSON.stringify(cur));
    });
    dbHandler = (table, ops) => table === 'rpc:co_editing_enabled' ? { data: true, error: null }
      : (table === 'project_data' && ops.some(([k]) => k === 'select')) ? { data: [{ scope: 'story', data: { ...RECEIVED, outline: [RECEIVED.outline[0]] }, updated_at: new Date(T2).toISOString() }], error: null }
      : emptyDb(table, ops);
    await D.pullProjectData('pD');             // the collaborator deleted sb
    return { order, story: JSON.parse(raw.get('fms_story_v1__pD')) };
  };
  const typed = await reloadWith(true);
  eq(typed.order, ['story'], 'an arrival says cloud:incoming before it reads the local copy');
  eq((typed.story.outline.find((x) => x.id === 'sb') || {}).text, 'Ravi wins the street over. typing', 'so the step being typed in survives their delete, with the typing');
}

function Store_save(key) { F.Store.notify('saved', { key }); }

console.log(`test:cloud — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
