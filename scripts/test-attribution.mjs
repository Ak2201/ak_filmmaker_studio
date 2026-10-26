/* ============================================================
   TEST — src/lib/attribution.js and start-model.js's trial copy, in Node
   ------------------------------------------------------------
       node scripts/test-attribution.mjs   (or: npm run test:attribution)
   A link's ?ref= and source are held for the tab (sessionStorage, ONE
   key, never localStorage); the trial's length is said from the server's
   trial_offer(), never typed.
   ============================================================ */
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- a sessionStorage for Node, and one that throws -------------- */
const mem = new Map();
const local = { setItem() { throw new Error('localStorage must not be written'); }, getItem() { return null; } };
const good = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
globalThis.localStorage = local;
globalThis.sessionStorage = good;

const A = await import('../src/lib/attribution.js');
const S = await import('../src/lib/start-model.js');

/* ---- import-free: it lives in startlib ---------------------------- */
const src = fs.readFileSync(new URL('../src/lib/attribution.js', import.meta.url), 'utf8');
ok(!/^\s*import\b/m.test(src) && !/\bimport\(/.test(src), 'attribution.js imports nothing (startlib)');
ok(/attribution\|/.test(fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')) || /\|attribution\b/.test(fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')), 'vite.config.js puts it in the startlib chunk');
ok(!/localStorage/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'attribution.js never touches localStorage');

/* ---- parse -------------------------------------------------------- */
eq(A.parseAttribution('?ref=founder50&src=Insta'), { ref: 'FOUNDER50', src: 'insta', medium: '', campaign: '' }, 'ref upper-cased, src lower-cased');
eq(A.parseAttribution('?utm_source=Google%20Ads&utm_medium=CPC&utm_campaign=Diwali 2026!'), { ref: '', src: 'google-ads', medium: 'cpc', campaign: 'diwali-2026' }, 'utm_* bucketed to [a-z0-9_-]');
eq(A.parseAttribution('?src=yt&utm_source=other').src, 'yt', '?src= wins over utm_source');
eq(A.parseAttribution('?ref=ab').ref, '', 'a ref under 3 characters is refused');
eq(A.parseAttribution('?ref=' + 'A'.repeat(41)).ref, '', 'a ref over 40 characters is refused');
eq(A.parseAttribution('?ref=REF-<script>').ref, '', 'a ref with markup is refused');
eq(A.parseAttribution('?ref=REF-AB12CD').ref, 'REF-AB12CD', 'a referral code keeps its shape');
ok(A.parseAttribution('?src=' + 'x'.repeat(80)).src.length === 32, 'a source is cut to 32');
ok(/^[a-z0-9_-]*$/.test(A.bucketSource('  ÜBER-Tube!!  ')) && !/^-|-$/.test(A.bucketSource('--a--')), 'a bucket is [a-z0-9_-] with no edge dashes');
eq(A.bucketSource(null), '', 'nothing buckets to nothing');
eq(A.parseAttribution(''), { ref: '', src: '', medium: '', campaign: '' }, 'an empty address says nothing');
eq(A.cleanRef(' refx '), 'REFX', 'cleanRef trims and upper-cases');

/* ---- merge -------------------------------------------------------- */
eq(A.mergeAttribution({ ref: 'OLD', src: 'insta', medium: 'social', campaign: '' }, { ref: 'NEW', src: 'google', medium: 'cpc', campaign: 'x' }),
  { ref: 'NEW', src: 'insta', medium: 'social', campaign: '' }, 'first source wins (with its medium), latest ref wins');
eq(A.mergeAttribution({ ref: 'KEEP', src: '' }, { ref: '', src: 'yt', medium: 'video' }), { ref: 'KEEP', src: 'yt', medium: 'video', campaign: '' }, 'no ref keeps the held one; the first source arrives');

/* ---- capture, through sessionStorage ------------------------------- */
eq(A.attribution(), { ref: '', src: '' }, 'nothing held at first');
eq(A.captureAttribution({ search: '?ref=CODE7&src=insta' }), { ref: 'CODE7', src: 'insta' }, 'capture returns what is held');
ok([...mem.keys()].length === 1 && mem.has(A.ATTRIB_KEY) && A.ATTRIB_KEY === 'fms_attrib_session', 'ONE sessionStorage key, fms_attrib_session');
A.captureAttribution({ search: '?utm_source=google' });
eq(A.attribution(), { ref: 'CODE7', src: 'insta' }, 'a later source does not replace the first');
A.captureAttribution({ search: '?ref=LATER9' });
eq(A.attribution(), { ref: 'LATER9', src: 'insta' }, 'a later ref replaces the first');
const before = mem.get(A.ATTRIB_KEY);
A.captureAttribution({ search: '?plan=pro' });
ok(mem.get(A.ATTRIB_KEY) === before, 'an address with nothing to say writes nothing');
A.clearAttribRef();
eq(A.attribution(), { ref: '', src: 'insta' }, 'clearing the code keeps the source');
mem.set(A.ATTRIB_KEY, JSON.stringify({ ref: '<b>x</b>', src: 'Bad Value!' }));
eq(A.attribution(), { ref: '', src: 'bad-value' }, 'a tampered record is re-cleaned on the way out');
mem.set(A.ATTRIB_KEY, '{not json');
eq(A.attribution(), { ref: '', src: '' }, 'garbage reads as nothing');

globalThis.sessionStorage = broken;
let threw = false;
try { eq(A.captureAttribution({ search: '?ref=CODE7&src=insta' }), { ref: 'CODE7', src: 'insta' }, 'blocked storage: this load still knows'); A.attribution(); A.clearAttribRef(); }
catch (e) { threw = true; }
ok(!threw, 'blocked storage never throws');
delete globalThis.sessionStorage;
threw = false;
try { A.captureAttribution({ search: '?ref=CODE7' }); A.attribution(); A.captureAttribution(undefined); } catch (e) { threw = true; }
ok(!threw, 'no storage and no location at all never throws');
globalThis.sessionStorage = good;

/* ---- the trial's length (start-model.js) ---------------------------- */
const on = (m, extra = {}) => ({ trial_enabled: true, trial_minutes: m, ...extra });
eq(S.trialCopy(on(4320), 'label'), { hide: false, text: '3-day free trial' }, '4320 minutes is a 3-day free trial');
eq(S.trialCopy(on(4320), 'length'), { hide: false, text: '3 days' }, 'and "3 days" in a sentence');
eq(S.trialCopy(on(30), 'label').text, '30-minute free trial', '30 minutes');
eq(S.trialCopy(on(30)).text, '30 minutes', 'length is the default form');
eq(S.trialCopy(on(1)).text, '1 minute', 'one minute is singular');
eq(S.trialCopy(on(60), 'label').text, '1-hour free trial', 'an hour');
eq(S.trialCopy(on(90)).text, '1.5 hours', 'an hour and a half');
eq(S.trialCopy(on(1440)).text, '24 hours', 'one day reads as 24 hours, as trial-time.js says it');
eq(S.trialCopy(on(10080), 'label').text, '7-day free trial', 'seven days');
eq(S.trialCopy({ trial_enabled: true, trial_hours: 72 }, 'label').text, '3-day free trial', 'trial_hours when minutes are absent');
eq(S.trialCopy(null, 'label'), { hide: false, text: '' }, 'no offer known: keep the fallback words');
eq(S.trialCopy({ trial_enabled: false, trial_minutes: 4320 }, 'label'), { hide: true, text: '' }, 'trials off: hide, say nothing');
eq(S.trialCopy(on(0), 'label'), { hide: false, text: '' }, 'no usable length: keep the fallback');
eq(S.trialCopy(on('abc')), { hide: false, text: '' }, 'a garbage length: keep the fallback');
eq(S.trialMode('label', 'a limited time'), 'label', 'an explicit mode wins');
eq(S.trialMode('', 'free trial'), 'label', 'a fallback that is a label is a label');
eq(S.trialMode('', 'a limited time'), 'length', 'a fallback inside a sentence is a length');
eq(S.trialMode(null, ''), 'length', 'nothing at all is a length');

/* ---- purchase-model's linkCode shares the one test ------------------ */
const P = fs.readFileSync(new URL('../src/lib/purchase-model.js', import.meta.url), 'utf8');
ok(/cleanRef\(/.test(P) && !/\[A-Za-z0-9_-\]\{3,40\}/.test(P), "purchase-model.js's linkCode uses attribution.js's cleanRef, not a copy");

console.log(`attribution: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
