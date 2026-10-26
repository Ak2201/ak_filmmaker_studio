/* ============================================================
   TEST — src/lib/funnel.js's counters (schema §29 + §58), in Node
   ------------------------------------------------------------
   The source bucket is a name from a fixed list or 'other', never a
   tidied copy of what it was given (an e-mail, a name, a phone number); the
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

// the bucket: a FIXED list, everything else 'other' (never a tidied copy of free text)
const B = F.sourceBucket;
ok(B('Google') === 'google' && B(' Insta ') === 'instagram' && B('newsletter') === 'email' && B('fb') === 'facebook', 'known sources and their aliases map onto the list');
for (const x of ['kasi.v@zohocorp.com', 'someone@example.com', 'John Smith', '+91 98400 12345', '9840012345', 'https://evil.com/?u=bob', 'news_letter-oct', 'a'.repeat(99), 'Ünïcode']) {
  ok(B(x) === 'other', `an unknown source ${JSON.stringify(x)} goes as 'other', not as itself`);
}
ok(B('REF-AB12CD') === 'referral', "a referral code as a source counts as 'referral', never as the code (the ref-* family)");
// THE SOURCE BUCKET CONTRACT (the playbook tags links with it): every exact
// name, every prefix family, and the slug after the dash never survives
const EXACT = {
  google: 'google', instagram: 'instagram', ig: 'instagram', insta: 'instagram', facebook: 'facebook', fb: 'facebook',
  youtube: 'youtube', yt: 'youtube', x: 'x', twitter: 'x', linkedin: 'linkedin', whatsapp: 'whatsapp', wa: 'whatsapp',
  telegram: 'telegram', reddit: 'reddit', threads: 'threads', pinterest: 'pinterest', producthunt: 'producthunt',
  email: 'email', mail: 'email', newsletter: 'email', podcast: 'podcast', partner: 'partner', affiliate: 'partner',
  event: 'event', festival: 'event', bing: 'bing', duckduckgo: 'duckduckgo', yahoo: 'yahoo',
  referral: 'referral', quora: 'quora', school: 'school', directory: 'directory', ads: 'ads'
};
const bad = Object.entries(EXACT).filter(([k, v]) => B(k) !== v);
ok(!bad.length, 'every exact name in the contract maps to its bucket' + (bad.length ? ' (wrong: ' + bad.map(([k]) => k).join(', ') + ')' : ''));
const FAMILY = {
  'ig-bio': 'instagram', 'insta-reel3': 'instagram', 'fb-group-chennai': 'facebook', 'meta-t1a': 'ads', 'yt-shorts': 'youtube',
  'wa-status': 'whatsapp', 'school-loyola': 'school', 'fest-iffk': 'event', 'dir-saashub': 'directory',
  'creator-rahul': 'partner', 'aff-kasi': 'partner', 'ref-ab12cd': 'referral', 'IG-Bio': 'instagram'
};
const badF = Object.entries(FAMILY).filter(([k, v]) => B(k) !== v);
ok(!badF.length, 'every prefix family maps to its bucket' + (badF.length ? ' (wrong: ' + badF.map(([k]) => k).join(', ') + ')' : ''));
ok(['google-ads', 'x-thread', 'reddit-r-film', 'tiktok', 'tiktok-1', '-ig', 'ig_bio', 'igbio', 'schools-x', 'preflight-test'].every((x) => B(x) === 'other'),
  "a token that is not a family (even an exact name with a dash) is 'other'");
{
  const slugs = ['loyola', 'rahul', 'kasi', 'saashub', 'iffk', 't1a', 'chennai', 'ab12cd'];
  const out = Object.keys(FAMILY).map(B);
  ok(out.every((b) => !slugs.some((sl) => b.includes(sl))), 'the slug after the dash never survives into the bucket');
}
ok(F.SOURCES.every((b) => b.length <= 32) && Object.keys(FAMILY).concat(Object.keys(EXACT), ['x'.repeat(200), 'ig-' + 'y'.repeat(200)]).every((x) => B(x).length <= 32),
  'every bucket is at most 32 characters');
{
  const want = [...new Set(Object.values(EXACT).concat(Object.values(FAMILY))), 'other'].sort();
  ok(JSON.stringify([...F.SOURCES].sort()) === JSON.stringify(want), 'SOURCES is exactly the contract\'s buckets plus other');
}
ok(B('') === '' && B(null) === '' && B(undefined) === '' && B('   ') === '', 'nothing is no source');
ok(F.SOURCES.includes('other') && F.SOURCES.every((b) => /^[a-z0-9_-]{1,32}$/.test(b) && !/[0-9]{7}/.test(b)), "every bucket on the list passes the server's CHECK");

// the visit's source comes from attribution.js's ONE record (src only, never ref)
const ATTR = path.join(ROOT, 'src/lib/attribution.js');
if (fs.existsSync(ATTR)) {
  const m = /export const ATTRIB_KEY\s*=\s*'([^']+)'/.exec(fs.readFileSync(ATTR, 'utf8'));
  ok(!!m && m[1] === F.ATTRIB_KEY, `funnel.js reads attribution.js's own key (${F.ATTRIB_KEY})`);
}
ok(F.funnelSource() === '', 'no attribution record: no source');
store.set(F.ATTRIB_KEY, JSON.stringify({ ref: 'REF-AB12CD', src: 'kasi-v-zohocorp-com' }));
ok(F.funnelSource() === 'other', "a tidied e-mail in the record still goes as 'other'");
store.set(F.ATTRIB_KEY, 'not json');
ok(F.funnelSource() === '', 'a broken record is no source');
store.delete(F.ATTRIB_KEY);

// no source: the one-argument call, exactly as before §58
F.bumpEvent('landing_view');
await tick();
ok(calls.length === 1 && calls[0].name === 'bump_event' && JSON.stringify(calls[0].body) === '{"p_name":"landing_view"}', 'no source: bump_event({p_name}) and nothing else');

// an explicit source
calls.length = 0;
F.bumpEvent('pricing_view', 'Newsletter');
await tick();
ok(calls.length === 1 && calls[0].body.p_source === 'email', 'an explicit source goes as p_source, bucketed');

// the session's source, from attribution.js's record
calls.length = 0;
store.set(F.ATTRIB_KEY, JSON.stringify({ ref: 'REF-AB12CD', src: 'insta' }));
ok(F.funnelSource() === 'instagram', 'the tab source is read from the attribution record');
F.bumpEvent('signup');
await tick();
ok(calls.length === 1 && calls[0].body.p_source === 'instagram' && !JSON.stringify(calls[0].body).includes('REF-'), 'a later count carries the tab source, and never the referral code');
calls.length = 0;
F.bumpEvent('signup', '');
await tick();
ok(calls.length === 1 && !('p_source' in calls[0].body), 'an explicit empty source overrides the tab one');

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
