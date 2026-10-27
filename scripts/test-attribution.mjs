/* ============================================================
   TEST — src/lib/attribution.js and start-model.js's launch-pass copy, in Node
   ------------------------------------------------------------
       node scripts/test-attribution.mjs   (or: npm run test:attribution)
   A link's ?ref= and source are held for the tab (sessionStorage, ONE
   key, never localStorage); the launch pass is said from the server's
   trial_offer().pass, never typed.
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

/* ---- the launch pass, as the public pages say it (start-model.js) ----
   The free trial is retired for the public (27 Oct 2026). Every figure
   the pages print about the pass is the server's trial_offer().pass,
   read through pass-offer.js; passCopy() says what each slot shows. */
const PO = await import('../src/lib/pass-offer.js');
const NOW = Date.parse('2026-10-27T12:00:00Z');
const block = (extra = {}) => ({ open: true, amount_paise: 4900, days: 7, plan: 'pro', ends_at: '2026-10-31T18:29:00Z', cap: null, left: null, now: '2026-10-27T12:00:00Z', ...extra });
const view = (raw, now = NOW, at = NOW) => S.passCopy(PO.passState(raw, now, at), PO);
{
  const v = view(block());
  eq([v.open, v.price, v.length], [true, '₹49', '7 days'], 'an open pass: ₹49 for 7 days, from the server');
  eq(v.timer, '4d 06:29:00', 'the countdown runs to the server deadline');
  eq(v.spoken, '4 days 6 hours 29 minutes', 'and is spoken to the minute');
  eq(v.left, '', 'no cap: no count');
  eq(view(block(), NOW + 86400000 * 3, NOW + 86400000 * 3).timer, '4d 06:29:00', "a visitor's clock three days off reads the same deadline (server now + elapsed)");
  eq(view(block(), NOW + 1000, NOW).timer, '4d 06:28:59', 'one second later it is one second less');
  eq(view(block({ ends_at: null })).timer, '', 'no deadline: no timer');
  eq(view(block({ ends_at: null })).open, true, 'and the pass still shows');
  eq(view(block({ cap: 500, left: 312 })).left, '312 of 500 left', 'a cap: the real count left');
  eq(view(block({ cap: 500, left: 0 })).open, false, 'a cap reached: nothing shown');
  eq(view(block({ open: false })).open, false, 'closed: nothing shown');
  eq(view(block({ now: '2026-10-31T18:29:00Z' })).open, false, 'at the deadline: nothing shown');
  eq(view(block({ amount_paise: null })).open, false, 'a missing price: no offer (fails closed)');
  eq(view(null), { open: false, price: '', length: '', timer: '', left: '', spoken: '' }, 'no pass block: nothing at all');
  eq(view(block({ days: 1, amount_paise: 9950 })).price + ' / ' + view(block({ days: 1, amount_paise: 9950 })).length, '₹99.50 / 1 day', 'paise and one day');
  eq(S.passCopy({ state: 'open', pass: PO.readPass(block()), msLeft: null }, null).open, false, 'no formatter module: nothing');
  eq(S.spokenLeft(30 * 1000), '1 minute', 'under a minute is spoken as 1 minute, never 0');
  eq(S.spokenLeft(0), '', 'no time: no words');
  ok(!('trialCopy' in S) && !('trialMode' in S), 'the free-trial copy helpers are gone from start-model.js');
}

/* ---- purchase-model's linkCode shares the one test ------------------ */
const P = fs.readFileSync(new URL('../src/lib/purchase-model.js', import.meta.url), 'utf8');
ok(/cleanRef\(/.test(P) && !/\[A-Za-z0-9_-\]\{3,40\}/.test(P), "purchase-model.js's linkCode uses attribution.js's cleanRef, not a copy");

console.log(`attribution: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
