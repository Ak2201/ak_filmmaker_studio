/* ============================================================
   TEST — src/lib/funnel.js's counters (schema §29 + §58), in Node
   ------------------------------------------------------------
   The source bucket never carries anything but ^[a-z0-9_-]{1,32}$; the
   one-argument call is what goes out with no source (so a server without
   §58 sees exactly what it always saw); a two-argument call refused as
   missing (PGRST202 / 404) is retried ONCE with one argument and the page
   stops sending sources; opt-out sends nothing; and funnel.js imports
   nothing (it lives in the startlib chunk, vite.config.js).

   import.meta.env does not exist in Node, so the module is loaded from a
   copy whose two env reads name a fake project. No network: fetch is a
   stub that records each call.

   Run: npm run test:funnel
   ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/lib/funnel.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

ok(!/^\s*import\s/m.test(SRC), 'funnel.js imports nothing (startlib must stay import-free)');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fms-funnel-'));
const file = path.join(tmp, 'funnel.mjs');
fs.writeFileSync(file, SRC.replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, "'https://fake.supabase.test'")
                          .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, "'anon-key'"));

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
if (!globalThis.navigator) globalThis.navigator = {};
globalThis.window = {};
const calls = [];
let missingTwoArg = false;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ name: url.split('/rpc/')[1], body });
  if (missingTwoArg && 'p_source' in body) return { ok: false, status: 404, json: async () => ({ code: 'PGRST202', message: 'Could not find the function public.bump_event(p_name, p_source)' }) };
  return { ok: true, status: 204, json: async () => { throw new Error('no body'); } };
};
const tick = () => new Promise((r) => setTimeout(r, 5));

const F = await import(file);

// the bucket
const B = F.sourceBucket;
ok(B('Google') === 'google', 'a source is lower-cased');
ok(B('  Insta Gram!! ') === 'insta-gram', 'spaces and punctuation become one hyphen, ends trimmed');
ok(B('someone@example.com') === 'someone-example-com', 'an e-mail never survives as an e-mail (no @, no .)');
ok(B('https://x.test/a?b=c') === 'https-x-test-a-b-c', 'a URL never survives as a URL');
ok(B('') === '' && B(null) === '' && B(undefined) === '' && B('__--') === '', 'nothing, or nothing but separators, is no source');
ok(B('a'.repeat(40)).length === 32, 'a long source is cut to 32');
ok(B('news_letter-oct') === 'news_letter-oct', 'a clean bucket is unchanged');
for (const x of ['Google', 'a b', 'x@y.z', 'a'.repeat(99), '--a--', 'Ünïcode']) {
  const b = B(x);
  ok(b === '' || /^[a-z0-9_-]{1,32}$/.test(b), `bucket(${JSON.stringify(x)}) = ${JSON.stringify(b)} matches the server's CHECK`);
}

// no source: the one-argument call, exactly as before §58
F.bumpEvent('landing_view');
await tick();
ok(calls.length === 1 && calls[0].name === 'bump_event' && JSON.stringify(calls[0].body) === '{"p_name":"landing_view"}', 'no source: bump_event({p_name}) and nothing else');

// an explicit source
calls.length = 0;
F.bumpEvent('pricing_view', 'Newsletter Oct');
await tick();
ok(calls.length === 1 && calls[0].body.p_source === 'newsletter-oct', 'an explicit source goes as p_source, bucketed');

// the session's source
calls.length = 0;
ok(F.setFunnelSource('Instagram') === 'instagram' && F.funnelSource() === 'instagram', 'setFunnelSource keeps the bucket for the session');
F.bumpEvent('signup');
await tick();
ok(calls.length === 1 && calls[0].body.p_source === 'instagram', 'a later count carries the session source');
calls.length = 0;
F.bumpEvent('signup', '');
await tick();
ok(calls.length === 1 && !('p_source' in calls[0].body), 'an explicit empty source overrides the session one');

// bumpOnce, and the named helpers
calls.length = 0;
F.countTrialStart(); F.countTrialStart();
F.countSignIn(); F.countSampleOpen(); F.countPlanViewInApp();
await tick();
ok(calls.filter((c) => c.body.p_name === 'trial_start').length === 1, 'countTrialStart counts once per session');
ok(['signin_done', 'sample_open', 'plan_view_in_app'].every((n) => calls.some((c) => c.body.p_name === n)), 'the other three new steps go out under their schema names');

// an old server: retried once without the source, then no more sources
calls.length = 0;
missingTwoArg = true;
F.bumpEvent('checkout_start', 'google');
await tick(); await tick();
ok(calls.length === 2 && 'p_source' in calls[0].body && !('p_source' in calls[1].body) && calls[1].body.p_name === 'checkout_start',
  'a server without §58: the two-argument call is retried once with one argument');
calls.length = 0;
F.bumpEvent('purchase', 'google');
await tick();
ok(calls.length === 1 && !('p_source' in calls[0].body), '... and later counts on that page go with one argument straight away');

// opted out: nothing at all
calls.length = 0;
F.optOut();
F.bumpEvent('purchase', 'google'); F.countSignIn('x');
await tick();
ok(calls.length === 0, 'after "Don\'t count this visit" nothing is sent');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${fail ? '✗' : '✓'} funnel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
