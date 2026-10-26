/* ============================================================
   TEST — when the studio may ask for a testimonial, and what it sends
   ------------------------------------------------------------
   src/lib/testimonials.js, in Node: every refusal in askDecision() (not
   signed in, §59 missing, under 3 days, not enough work, the sample, a
   trial's first day, sent / never / snoozed), the consent sentence, the
   form's bounds (the same as §59's CHECKs), the preview, the site entry
   (it carries consentOn and consentId, which check-testimonials.mjs
   requires), and the calls against a stub cloud — including a database
   without §59, where `available()` is false and nothing throws.

   Run: npm run test:testimonial-prompt
   ============================================================ */
import './node-seams.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = await import('../src/lib/testimonials.js');
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

const DAY = 86400000;
const now = Date.parse('2026-10-26T12:00:00Z');
const good = { now, signedIn: true, available: true, sample: false, days: 3, pages: 6, scenes: 0, trial: null, state: {} };
const D = (o) => M.askDecision({ ...good, ...o });

ok(D({}).ask === true, 'three days, six pages, signed in, §59 present: ask');
ok(D({ pages: 0, scenes: 10 }).ask === true, 'ten scenes and no pages is enough work too');
ok(D({ signedIn: false }).why === 'signed-out', 'signed out: never');
ok(D({ available: false }).why === 'unavailable', '§59 not on the database: never');
ok(D({ days: 2 }).why === 'days', 'two days of use: not yet (and so never in the first session)');
ok(D({ pages: 4, scenes: 9 }).why === 'work', 'four pages and nine scenes: not yet');
ok(D({ sample: true }).why === 'sample', 'the sample is open: no (not their work)');
ok(D({ state: { sentAt: '2026-10-01T00:00:00Z' } }).why === 'sent', 'already sent one: never again');
ok(D({ state: { never: true } }).why === 'never', '"Don\'t ask again": never');
ok(D({ state: { dismissedAt: new Date(now - 10 * DAY).toISOString() } }).why === 'snoozed', 'dismissed ten days ago: not yet');
ok(D({ state: { dismissedAt: new Date(now - 61 * DAY).toISOString() } }).ask === true, 'dismissed 61 days ago: may ask again');
const trialStartedHoursAgo = (hrs, minutes = 4320) => ({ active: true, minutes, endsAt: new Date(now - hrs * 3600000 + minutes * 60000).toISOString() });
ok(D({ trial: trialStartedHoursAgo(5) }).why === 'trial-first-day', 'five hours into a three-day trial: not yet');
ok(D({ trial: trialStartedHoursAgo(30) }).ask === true, 'thirty hours into a three-day trial: may ask');
ok(D({ trial: { active: true, endsAt: null, minutes: null } }).why === 'trial', 'a trial whose start cannot be known: not asked');
ok(D({ trial: trialStartedHoursAgo(30, 0) }).why === 'trial', 'the trial length is READ, never assumed: none known -> not asked');
ok(D({ trial: { active: true, minutes: 30, endsAt: new Date(now + 300 * DAY).toISOString() } }).why === 'trial', 'a trial longer than the length on offer (a code trial, a grandfathered year): its start is unknown -> not asked');

ok(M.distinctDays([now, now + 1000, now - DAY, new Date(now - 2 * DAY).toISOString(), 'nonsense', null, 0]) === 3, 'distinctDays counts calendar days and skips junk');

const c = M.consentText();
ok(c.includes(BRAND.name) && /Settings/.test(c) && /take it back/.test(c) && /approves/.test(c), 'the consent sentence names the product (from brand.json), the approval and the way back');
ok(c.trim().length >= 20 && c.length <= 1000, 'the consent sentence fits §59\'s CHECK');

ok(!M.validate({ quote: 'too short', display_name: 'A' }).ok, 'a quote under 20 characters is refused, as §59 does');
ok(!M.validate({ quote: 'x'.repeat(601), display_name: 'A' }).ok, 'a quote over 600 characters is refused');
ok(!M.validate({ quote: 'A long enough quote here, really.', display_name: '  ' }).ok, 'a blank name is refused');
ok(M.validate({ quote: '  A long enough quote here, really.  ', display_name: ' Ann ', role: '', film: '' }).ok, 'a quote and a name are enough');
const pv = M.preview({ quote: ' It kept my shoot honest. Every single day. ', display_name: 'Ann', role: 'Director', film: 'Rain' });
ok(pv.quote === 'It kept my shoot honest. Every single day.' && pv.byline === 'Ann, Director · Rain', 'the preview reads quote and "Name, Role · Film"');
ok(M.preview({ quote: 'x', display_name: 'Ann' }).byline === 'Ann', 'no role and no film: just the name');

const row = { id: '5b1e2c3d-0000-4000-8000-000000000001', quote: 'Q', display_name: 'Ann', role: 'Director', film: null, consented_at: '2026-10-20T08:00:00Z', status: 'approved', revoked_at: null };
const e = M.siteEntry(row);
ok(/^\d{4}-\d{2}-\d{2}$/.test(e.consentOn) && e.consentId === row.id && e.name === 'Ann' && !('film' in e), 'the site entry carries consentOn and consentId in testimonials.json\'s shape');
ok(M.statusWord(row) === 'Published' && M.statusWord({ ...row, revoked_at: 'x' }) === 'Taken back' && M.statusWord({ status: 'pending' }) === 'Waiting for review', 'the state in words');

// the calls, against a stub cloud
const stub = (answer) => ({ ensureClient: async () => ({ rpc: async (name, args) => answer(name, args) }) });
ok(await M.available(stub(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_testimonials' } }))) === false, 'a database without §59: available() is false, nothing thrown');
ok(await M.available(stub(() => ({ data: [], error: null }))) === true, 'with §59: available()');
ok(await M.available(stub(() => ({ data: { not: 'a list' }, error: null }))) === false, 'an answer that is not a list is not believed');
ok((await M.mine(stub(() => ({ data: null, error: { code: 'PGRST202', message: 'x' } })))).length === 0, 'mine() is [] without §59');
let sent = null;
await M.submit(stub((name, args) => { sent = { name, args }; return { data: { id: 'n' }, error: null }; }), { quote: 'A long enough quote here, really.', display_name: 'Ann' });
ok(sent && sent.name === 'submit_testimonial' && sent.args.p_consent === M.consentText() && sent.args.p_role === null, 'submit sends the exact consent sentence, blanks as null');
let threw = '';
try { await M.submit(stub(() => ({ data: null, error: { code: 'P0429', message: 'x' } })), { quote: 'A long enough quote here, really.', display_name: 'Ann' }); } catch (x) { threw = x.message; }
ok(/plenty for one day/.test(threw), 'the flood guard comes back as a sentence');

// the fake project answers the same RPCs (scripts/fake-supabase.mjs)
const { F, USERS } = await import('./fake-supabase.mjs');
F.reset();
const calls = [];
const route = (resolve) => ({ fulfill: (r) => resolve({ status: r.status, body: r.body ? JSON.parse(r.body) : null }) });
const askFake = (name, args, tok) => new Promise((res) => {
  const req = { url: () => 'https://x.supabase.co/rest/v1/rpc/' + name, headers: () => ({ authorization: tok ? 'Bearer ' + tok : '' }), postData: () => JSON.stringify(args || {}), method: () => 'POST' };
  calls.push(name);
  import('./fake-supabase.mjs').then((m) => m.handle({ request: () => req, fulfill: route(res).fulfill }));
});
let r = await askFake('submit_testimonial', { p_quote: 'The fake keeps the same rules too.', p_display_name: 'Ben', p_consent: M.consentText() }, 'tok-ben');
ok(r.status === 200 && r.body.status === 'pending' && !('author_email' in r.body), 'fake: submit -> pending, own row');
r = await askFake('admin_set_testimonial_status', { p_id: r.body.id, p_status: 'approved' }, 'tok-ben');
ok(r.status >= 400 && r.body.code === '42501', 'fake: a member cannot approve');
const id = F.db.testimonials[0].id;
r = await askFake('admin_set_testimonial_status', { p_id: id, p_status: 'approved' }, 'tok-admin');
ok(r.status === 200 && r.body.status === 'approved', 'fake: the owner approves');
r = await askFake('public_testimonials', {}, null);
ok(r.body.length === 1 && !('author' in r.body[0]) && !('consent_text' in r.body[0]), 'fake: anon reads display fields only');
await askFake('revoke_testimonial', { p_id: id }, 'tok-ben');
r = await askFake('public_testimonials', {}, null);
ok(r.body.length === 0, 'fake: a revoked one leaves the public list at once');
r = await askFake('admin_list_testimonials', { p_status: 'takedown' }, 'tok-admin');
ok(r.body.length === 1 && r.body[0].id === id && M.needsTakedown(r.body[0]), 'fake: published then taken back -> on the owner\'s takedown list');
r = await askFake('admin_mark_testimonial_removed', { p_id: id }, 'tok-admin');
ok(r.status === 200 && !!r.body.site_removed_at && !M.needsTakedown(r.body), 'fake: the owner marks it off the site');
r = await askFake('admin_list_testimonials', { p_status: 'takedown' }, 'tok-admin');
ok(r.body.length === 0, 'fake: ... and the takedown list is empty again');
await askFake('bump_event', { p_name: 'trial_start', p_source: 'google' });
await askFake('bump_event', { p_name: 'trial_start' });
r = await askFake('admin_funnel_by_source', {}, 'tok-admin');
ok(r.body.some((x) => x.name === 'trial_start' && x.source === 'google' && x.total === 1) && r.body.some((x) => x.name === 'trial_start' && x.source === '' && x.total === 1), 'fake: bump_event one- and two-argument, by source');
r = await askFake('bump_event', { p_name: 'landing_view', p_source: 'a@b.c' });
ok(r.status >= 400 && r.body.code === '22023', 'fake: a bad source is refused');
r = await askFake('bump_event', { p_name: 'landing_view', p_source: 'x9840012345' });
ok(r.status >= 400 && r.body.code === '22023', 'fake: a source holding a phone number is refused');

/* ---- THE PROMISES MUST BE TRUE ------------------------------------
   The site's testimonials are copied in by hand, so a revoke cannot take
   one off the site by itself. No sentence the author reads may say it
   does (the consent text is STORED as what they agreed to). */
const SRC = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const UI = SRC('src/ui/testimonial-prompt.js'), TAB = SRC('src/pages/admin-tabs/testimonials.js');
const FALSE_PROMISE = /remov\w* (it )?(from the site )?(at once|straight away|immediately)|removes it from the site|no longer shown anywhere|hidden at once/i;
ok(!FALSE_PROMISE.test(M.consentText()), 'the consent sentence does not promise the site copy vanishes at once');
ok(!FALSE_PROMISE.test(UI.replace(/\/\*[\s\S]*?\*\//g, '')), 'no sentence in the prompt or the Settings list promises it either');
ok(!FALSE_PROMISE.test(TAB.replace(/\/\*[\s\S]*?\*\//g, '')), 'nor the console tab');
ok(/told straight away/.test(M.consentText()), 'the consent sentence says what does happen: the studio is told');

/* ---- THE REVOKE ROUTE BEFORE THE ASK --------------------------------
   The card promises "take it back in Settings", so it may only be drawn
   once Settings mounts the list. settings.js is another lane's file; the
   flag in testimonial-prompt.js says whether it does, and must agree. */
const wired = /export const SETTINGS_ROUTE_WIRED\s*=\s*true\b/.test(UI);
const settingsMounts = /mountMyTestimonials\s*\(/.test(SRC('src/pages/settings.js'));
ok(wired === settingsMounts, `SETTINGS_ROUTE_WIRED (${wired}) agrees with settings.js calling mountMyTestimonials() (${settingsMounts})`);
ok(/if \(!routeWired \|\|/.test(UI), 'maybePromptTestimonial() draws nothing while the Settings route is not wired');
ok(/maybePromptTestimonial\s*\(/.test(SRC('src/pages/hub.js')), 'the hub asks maybePromptTestimonial() after render (it stays inert until the flag flips)');
void USERS;

console.log(`${fail ? '✗' : '✓'} testimonial prompt: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
