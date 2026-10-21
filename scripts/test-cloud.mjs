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

function Store_save(key) { F.Store.notify('saved', { key }); }

console.log(`test:cloud — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
