/* ============================================================
   THE SCHEMA, RUN — supabase/schema/supabase-schema.sql against a real PostgreSQL
   ------------------------------------------------------------
   CLAUDE.md's standing complaint about the schema is that its record
   of its own runs is not evidence. This is evidence: a scratch
   database on the local PostgreSQL, a shim of exactly what Supabase
   provides (scripts/schema-tests/shim.sql), the WHOLE schema file
   loaded with ON_ERROR_STOP, and then the checks a section lists at
   its foot executed with real role switches and real RLS.

       npm run test:schema
       npm run test:schema -- --keep     (leave the database for a look)

   Needs a local PostgreSQL 16 with a running cluster (`pg_ctlcluster 16
   main start`) and psql; connects as the postgres OS user through the
   socket, via runuser when run as root. Not part of `npm run verify`,
   which is a browser gate.

   The check files run IN ORDER in one database: billing.sql (§16 +
   §18) seeds the people and edits a price, accounts.sql (§19) and
   promo.sql (§20) build on what it left — against §1–§20 only. Then
   §21 onward loads, and the growth files (GROWTH_FILES) run against the
   whole schema. A check that needs a clean
   state opens its own transaction and rolls it back.

   What it does NOT prove: Supabase's own objects beyond the shim
   (auth triggers, realtime filtering, the dashboard's role grants) and
   anything about the edge functions. It proves the SQL is the SQL.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB = process.env.SCHEMA_TEST_DB || 'fms_schema_test';
const keep = process.argv.includes('--keep');
/* The growth sections' checks, one file per section, in section order. */
const GROWTH_FILES = ['upgrade.sql', 'referral.sql', 'affiliate.sql', 'scopes.sql', 'refunds.sql', 'invoice.sql', 'leads.sql', 'trial.sql', 'currency.sql'];

function psql(args, { db = DB, input } = {}) {
  const base = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-d', db, ...args];
  const cmd = os.userInfo().username === 'root' && !process.env.PGHOST ? ['runuser', '-u', 'postgres', '--', ...base] : base;
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, input, encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=notice' } });
  return r;
}
const fail = (msg, r) => {
  console.error('✗ ' + msg);
  if (r) console.error((r.stderr || '').split('\n').filter((l) => !/^NOTICE|^psql:.*NOTICE/.test(l)).slice(-30).join('\n'));
  process.exit(1);
};

let r = psql(['-tAc', 'select 1'], { db: 'postgres' });
if (r.status !== 0) fail('cannot reach PostgreSQL (is the cluster running? `pg_ctlcluster 16 main start`)', r);

psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
r = psql(['-c', `create database ${DB}`], { db: 'postgres' });
if (r.status !== 0) fail('could not create the scratch database', r);

console.log('shim …');
r = psql(['-f', 'scripts/schema-tests/shim.sql']);
if (r.status !== 0) fail('the shim did not load', r);

/* TWO PHASES, because the schema is a history. §1–§20 load first and
   the three files written for them run against the database AS THOSE
   SECTIONS LEFT IT — their checks describe §20's behaviour (a Starter
   buyer quoting Indie paid the list price), which §21 deliberately
   changed. Then §21 onward loads on top, exactly as the owner will run
   it on the live project, and the growth files run against the final
   state, re-asserting the §20 invariants that still hold. Splitting at
   the section header rather than editing the old files keeps both
   statements true at once. */
const full = fs.readFileSync(path.join(ROOT, 'supabase/schema/supabase-schema.sql'), 'utf8');
const lines = full.split('\n');
const at = lines.findIndex((l) => /^-- 21\. /.test(l));
if (at < 1) fail('could not find the §21 header to split the schema at');
const phase1 = lines.slice(0, at - 1).join('\n') + '\n';
/* A THIRD PHASE, for the same reason as the second: section 32 turns
   purchasing OFF by default, which makes billing_status() entitled for
   everybody and stands the P0402 triggers down — so every check written
   for §30 and earlier (a wall after expiry, a cap that fires) would be
   asserting the switched-off database. §21–§31 load, their files run
   against what they describe, then §32 loads on top and purchases.sql
   proves both positions of the switch. */
const at32 = lines.findIndex((l) => /^-- 32\. /.test(l));
if (at32 < at) fail('could not find the §32 header to split the schema at');
const phase2 = lines.slice(at - 1, at32 - 1).join('\n') + '\n';
const phase3 = lines.slice(at32 - 1).join('\n');

console.log('supabase/schema/supabase-schema.sql §1–§20 …');
const t0 = Date.now();
r = psql(['-f', '-'], { input: phase1 });
if (r.status !== 0) fail('supabase/schema/supabase-schema.sql (§1–§20) did not load cleanly', r);
const warnings = (r.stderr || '').split('\n').filter((l) => /WARNING/.test(l));
console.log(`✓ §1–§20 load (${Math.round((Date.now() - t0) / 100) / 10}s${warnings.length ? `, ${warnings.length} warning(s)` : ''})`);

let total = 0, failed = 0;
function runChecks(file) {
  console.log(`checks: ${file} …`);
  r = psql(['-f', 'scripts/schema-tests/' + file]);
  const notices = (r.stderr || '').split('\n').filter((l) => /^(psql:.*)?NOTICE:\s+ok - /.test(l) || /NOTICE:\s+ok - /.test(l));
  total += notices.length;
  notices.forEach((l) => console.log('  ✓ ' + l.replace(/.*ok - /, '')));
  if (r.status !== 0) { failed++; fail(`${file} failed after ${notices.length} passing check(s)`, r); }
}
// In order: later files use the people and prices the earlier ones left.
for (const file of ['billing.sql', 'accounts.sql', 'promo.sql']) runChecks(file);

console.log('supabase/schema/supabase-schema.sql §21–§31 …');
r = psql(['-f', '-'], { input: phase2 });
if (r.status !== 0) fail('supabase/schema/supabase-schema.sql (§21–§31) did not load cleanly on top of §1–§20', r);
console.log('✓ §21–§31 load');
/* §21 onward: each growth file seeds its own people (fresh uuids), so
   what promo.sql left behind cannot make a check pass for the wrong
   reason. The list is explicit, like the first one: a file that exists
   and is not named here is not run, and nothing would say so. */
for (const file of GROWTH_FILES) runChecks(file);

console.log('supabase/schema/supabase-schema.sql §32 onward …');
r = psql(['-f', '-'], { input: phase3 });
if (r.status !== 0) fail('supabase/schema/supabase-schema.sql (§32 onward) did not load cleanly on top of §1–§31', r);
/* Twice: every section claims to be idempotent, and this one ALTERs a
   table, replaces a trigger on auth.users and restates five functions. */
r = psql(['-f', '-'], { input: phase3 });
if (r.status !== 0) fail('supabase/schema/supabase-schema.sql (§32 onward) is not re-runnable', r);
console.log('✓ the whole schema loads (and §32 onward — §33 to §39 included — re-runs cleanly)');
/* §40 and §42 (the admin console's audit log and Customer 360). Until the
   main thread folds them into supabase/schema/supabase-schema.sql they are standalone
   files at the repo root, loaded here ON TOP of the whole schema — twice,
   because §40 restates nineteen functions and every section claims to be
   re-runnable. Once they ARE in supabase/schema/supabase-schema.sql this block loads
   nothing and the two check files still run. They load BEFORE the
   §32-onward check files, so purchases, trial-hours, refund-trial,
   receipt-email, plan-features, goals-sync and no-free-plan — which call
   set_billing_settings, grant_trial, grant_email, resend_receipt and
   set_plan — run, UNCHANGED, against the restated bodies. The earlier
   files (billing, promo, refunds, invoice …) assert §16–§31 behaviour
   that §32 deliberately changed and cannot be replayed here; the two
   admin files re-assert every restated writer's contract instead. */
const ADMIN_FILES = ['supabase/schema/schema-40-admin-audit.sql', 'supabase/schema/schema-42-customer-360.sql'];
if (!/admin_audit_write/.test(full)) {
  for (const f of ADMIN_FILES) {
    for (let pass = 1; pass <= 2; pass++) {
      r = psql(['-f', f]);
      if (r.status !== 0) fail(`${f} ${pass === 1 ? 'did not load cleanly' : 'is not re-runnable'}`, r);
    }
  }
  console.log('✓ §40 and §42 load (and re-run cleanly)');
}
/* In file order. no-free-plan.sql covers §38 and §39 and runs LAST because
   §38 withdraws the free plan's offer and plan-features.sql asserts the
   paid tiers' maps — the two touch different rows, but a file that reads
   `plans` should see the file's final state, not a half-applied one. */
for (const file of ['purchases.sql', 'trial-hours.sql', 'refund-trial.sql', 'receipt-email.sql', 'plan-features.sql', 'goals-sync.sql', 'no-free-plan.sql']) runChecks(file);

for (const file of ['admin-audit.sql', 'admin-customer.sql']) runChecks(file);
/* ADMIN CONSOLE V2 — the STANDALONE sections (41, 43, 44), authored as files
   at the repo root and not yet folded into supabase/schema/supabase-schema.sql. They load on
   top of the whole schema, twice (re-runnable), after the audit shim that
   stands in for section 40's admin_audit_write(). When a section is merged
   into supabase/schema/supabase-schema.sql, delete it from this list. */
const STANDALONE = ['supabase/schema/schema-41-admin-health.sql', 'supabase/schema/schema-43-usage-cohorts.sql', 'supabase/schema/schema-44-sync-limits.sql'];
const STANDALONE_CHECKS = ['admin-health.sql', 'usage-cohorts.sql', 'sync-limits.sql'];
r = psql(['-f', 'scripts/schema-tests/audit-shim.sql']);
if (r.status !== 0) fail('the audit shim did not load', r);
for (const f of STANDALONE) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load on top of the whole schema`, r);
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} is not re-runnable`, r);
}
console.log('✓ the standalone sections (§41, §43, §44) load and re-run cleanly');
/* usage_names() must equal the module ids in navigation.json plus the fixed
   names, read from the LIVE function: the generator's --check proves the file,
   this proves what PostgreSQL holds. */
{
  const nav = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/navigation.json'), 'utf8'));
  const ids = [];
  for (const g of nav.global || []) for (const m of g.modules || []) ids.push('module_open:' + m.id);
  for (const p of nav.phases || []) for (const m of p.modules || []) ids.push('module_open:' + m.id);
  const want = [...ids, 'script_import', 'export_pdf', 'export_docx', 'ai_call', 'drive_connect', 'limit_hit', 'share_created', 'screening_pass_used'].sort();
  r = psql(['-tAc', 'select n from unnest(public.usage_names()) n order by n']);
  const got = (r.stdout || '').split('\n').filter(Boolean).sort();
  if (r.status !== 0 || JSON.stringify(got) !== JSON.stringify(want)) fail(`usage_names() in the database (${got.length}) is not navigation.json's module ids plus the fixed names (${want.length})`, r);
  total++;
  console.log(`  ✓ usage_names() in PostgreSQL equals navigation.json's ${ids.length} module ids plus the 8 fixed names`);
}
for (const file of STANDALONE_CHECKS) runChecks(file);
/* §45 (admin controls) is a standalone file at the repo root, not yet
   folded into supabase/schema/supabase-schema.sql, and it calls section 40's
   admin_audit_write(), which §40 (loaded above) provides: load the section — twice, for re-runnability — then its checks.
   */
for (const f of ['supabase/schema/schema-45-admin-controls.sql', 'supabase/schema/schema-45-admin-controls.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §45 loads (and re-runs cleanly)');
runChecks('admin-controls.sql');
/* --- §46 (the role matrix) --- standalone, on top of §40, §42 and §45:
   it restates twenty writers with one require_role() line each. Loaded twice
   (re-runnable), after the §45 checks so they ran against the unrestated
   writers. */
for (const f of ['supabase/schema/schema-46-role-matrix.sql', 'supabase/schema/schema-46-role-matrix.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §46 loads (and re-runs cleanly)');
runChecks('role-matrix.sql');
/* --- end §46 --- */
/* --- §47 (total delete anonymises the invoice) --- standalone, on §45. --- */
for (const f of ['supabase/schema/schema-47-delete-anonymise.sql', 'supabase/schema/schema-47-delete-anonymise.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §47 loads (and re-runs cleanly)');
runChecks('delete-anonymise.sql');
/* --- end §47 --- */
/* --- §48 (who may join a project's presence channel) --- standalone, on
   §1–§3. Loaded once with no Realtime (it must only say so), then on top
   of a stand-in realtime.messages, twice, then its checks. --- */
r = psql(['-f', 'supabase/schema/schema-48-presence.sql']);
if (r.status !== 0) fail('schema-48-presence.sql did not load cleanly without a realtime schema', r);
if (!/realtime\.messages does not exist here/.test(r.stderr || '')) fail('§48 without Realtime should say it made no policy', r);
r = psql(['-f', 'scripts/schema-tests/presence-stub.sql']);
if (r.status !== 0) fail('presence-stub.sql did not load', r);
for (const f of ['supabase/schema/schema-48-presence.sql', 'supabase/schema/schema-48-presence.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §48 loads without Realtime, then on it (and re-runs cleanly)');
runChecks('presence.sql');
/* --- end §48 --- */
/* --- §49 (the co-editing switch) --- standalone, on §40 and §45/§46. --- */
for (const f of ['supabase/schema/schema-49-co-editing.sql', 'supabase/schema/schema-49-co-editing.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §49 loads (and re-runs cleanly)');
runChecks('co-editing.sql');
/* --- end §49 --- */
/* --- §50 (refunds follow the role matrix, seats follow the plan, a decline
   sticks) --- standalone, on §45. Loaded twice (re-runnable), after every
   earlier check file so those ran against the functions it restates. The
   seed goes in BEFORE the first load: it is the live data the backfill has
   to mark, and the second load fills only nulls. --- */
r = psql(['-f', 'scripts/schema-tests/refund-seat-trial-seed.sql']);
if (r.status !== 0) fail('refund-seat-trial-seed.sql did not load', r);
for (const f of ['supabase/schema/schema-50-refund-seat-trial.sql', 'supabase/schema/schema-50-refund-seat-trial.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §50 loads (and re-runs cleanly)');
runChecks('refund-seat-trial.sql');
/* --- end §50 --- */
/* --- §51 (the security follow-ups) --- standalone, on §40, §45, §46 and
   §50. The seed goes in BEFORE the first load: a duplicate payment and an
   orphaned referral code made with the pre-§51 functions, which the
   backfills have to mark. Loaded twice (re-runnable), after every earlier
   check file so those ran against the functions it restates. --- */
r = psql(['-f', 'scripts/schema-tests/security-51-seed.sql']);
if (r.status !== 0) fail('security-51-seed.sql did not load', r);
for (const f of ['supabase/schema/schema-51-security-followups.sql', 'supabase/schema/schema-51-security-followups.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §51 loads (and re-runs cleanly)');
runChecks('security-51.sql');
/* --- end §51 --- */

/* --- §52 (yearly plans) --- the seed is made with the pre-§52 functions
   (a buyer for good, a grant for good) so the backfill has work; loaded
   twice to prove the backfill runs once. --- */
r = psql(['-f', 'scripts/schema-tests/yearly-seed.sql']);
if (r.status !== 0) fail('yearly-seed.sql did not load', r);
for (const f of ['supabase/schema/schema-52-yearly-plans.sql', 'supabase/schema/schema-52-yearly-plans.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §52 loads (and re-runs cleanly)');
runChecks('yearly.sql');
/* --- end §52 --- */

/* --- §53 (the billing audit fixes) --- on §52, loaded twice (it drops the
   old quote_for / paid_credit_paise forms, which a re-run must survive),
   after yearly.sql so §52's checks ran against §52's own bodies. Every
   check in audit-53.sql failed against §52 before §53 was written. --- */
for (const f of ['supabase/schema/schema-53-audit-fixes.sql', 'supabase/schema/schema-53-audit-fixes.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §53 loads (and re-runs cleanly)');
runChecks('audit-53.sql');
/* --- end §53 --- */

/* --- §54 (the plan caps lock before they count) --- on §50/§51/§53, loaded
   twice. cap-locks.sql proves each body locks and still refuses; the race
   itself needs TWO connections, so it is driven here: session A inserts a
   Free owner's one allowed project and holds its transaction open, session
   B inserts a second one meanwhile. Unlocked (§53), B counts 0 because A
   has not committed, and both land; locked, B waits for A, counts 1 and is
   refused with P0402. --- */
for (const f of ['supabase/schema/schema-54-cap-locks.sql', 'supabase/schema/schema-54-cap-locks.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §54 loads (and re-runs cleanly)');
runChecks('cap-locks.sql');
{
  const U = '00000000-0000-4000-8000-000000005410';
  const prev = psql(['-tAc', 'select coalesce((select purchase_required from public.billing_settings where id), false)']).stdout.trim();
  r = psql(['-c', `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('${U}', 's54-race@example.com', now(), '{}');
                   insert into public.studio_members (user_id, role) values ('${U}', 'user');
                   update public.billing_settings set purchase_required = true where id;`]);
  if (r.status !== 0) fail('§54 race: setup failed', r);
  const { spawn } = await import('node:child_process');
  const psqlAsync = (sql) => new Promise((done) => {
    const base = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-d', DB, '-c', sql];
    const cmd = os.userInfo().username === 'root' && !process.env.PGHOST ? ['runuser', '-u', 'postgres', '--', ...base] : base;
    const c = spawn(cmd[0], cmd.slice(1), { cwd: ROOT });
    let stderr = '';
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (status) => done({ status, stderr }));
  });
  const one = (title, hold) => `begin; select t.claims('${U}');
    insert into public.projects (owner_id, title) values ('${U}', '${title}');
    ${hold ? 'select pg_sleep(2);' : ''} commit;`;
  const a = psqlAsync(one('Race A', true));
  await new Promise((res) => setTimeout(res, 700));
  const b = psqlAsync(one('Race B', false));
  const [ra, rb] = await Promise.all([a, b]);
  const n = Number(psql(['-tAc', `select count(*) from public.projects where owner_id = '${U}'`]).stdout.trim());
  psql(['-c', `delete from public.projects where owner_id = '${U}'; update public.billing_settings set purchase_required = ${prev === 't'} where id;`]);
  total++;
  if (ra.status === 0 && rb.status !== 0 && /syncs up to 1 project/.test(rb.stderr) && n === 1) {
    console.log('  ✓ 54. two parallel inserts on a one-project plan: the second waits, counts 1 and is refused (P0402); 1 project');
  } else {
    failed++;
    fail(`§54 race: A exit ${ra.status}, B exit ${rb.status}, ${n} project(s) synced (want 0, refused, 1)\n${ra.stderr}\n${rb.stderr}`);
  }
}
/* --- end §54 --- */

/* --- §55 (keep the budget private) --- on everything above, loaded twice
   (it adds a column, a trigger and restates five policies). Every
   pre-existing check has already run against the unrestated policies. --- */
for (const f of ['supabase/schema/schema-55-budget-private.sql', 'supabase/schema/schema-55-budget-private.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §55 loads (and re-runs cleanly)');
runChecks('budget-private.sql');
/* --- end §55 --- */

/* --- §56 (charging in US dollars) --- on §56, loaded twice (it drops the
   four-argument quote_for, the five-argument create_pending_payment and two
   functions whose return type grew), after cap-locks.sql so §54's checks ran
   against §54's own bodies. --- */
for (const f of ['supabase/schema/schema-56-usd-checkout.sql', 'supabase/schema/schema-56-usd-checkout.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §56 loads (and re-runs cleanly)');
runChecks('usd-checkout.sql');
/* --- end §56 --- */

/* --- §57 (the year on the invoice) --- the seed is a purchase made
   before §57, so the backfill has an invoice with no year; loaded twice
   to prove the backfill and the trigger restatement re-run cleanly. --- */
r = psql(['-f', 'scripts/schema-tests/invoice-year-seed.sql']);
if (r.status !== 0) fail('invoice-year-seed.sql did not load', r);
for (const f of ['supabase/schema/schema-57-invoice-year.sql', 'supabase/schema/schema-57-invoice-year.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §57 loads (and re-runs cleanly)');
runChecks('invoice-year.sql');
/* --- end §57 --- */

/* --- §58 (funnel counts by source) --- it widens §29's events key, so a
   counter bumped with the ONE-argument form before it loads must still be
   there (with source '') after, and the one-argument form must keep
   working on the new key. Loaded twice (it swaps a primary key and two
   CHECKs, which a re-run must survive). --- */
r = psql(['-c', `select public.bump_event('purchase')`]);
if (r.status !== 0) fail('§58 seed: bump_event(text) before §58 failed', r);
for (const f of ['supabase/schema/schema-58-funnel-source.sql', 'supabase/schema/schema-58-funnel-source.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
{
  const n = psql(['-tAc', `select coalesce(sum(count), 0) from public.events where name = 'purchase' and source = ''`]).stdout.trim();
  total++;
  if (Number(n) >= 1) console.log('  ✓ 58. a counter written before §58 survives the new key, under no source');
  else { failed++; fail(`§58: the pre-§58 purchase counter is gone (${n})`); }
}
console.log('✓ §58 loads (and re-runs cleanly)');
runChecks('funnel-source.sql');
{
  /* EVERY BUCKET funnel.js can send is one §58's CHECK accepts, read from
     funnel.js itself (SOURCES), so a bucket added there is tested here
     with no edit. As anon, in a transaction that rolls back. */
  const { SOURCES } = await import(path.join(ROOT, 'src/lib/funnel.js'));
  const calls = SOURCES.map((b) => `select public.bump_event('landing_view', '${b.replace(/'/g, "''")}');`).join('\n');
  const q = psql(['-f', '-'], { input: `begin;\nselect t.claims('00000000-0000-4000-8000-000000000001', 'anon');\n${calls}\nselect t.reset();\nselect 'n=' || count(distinct source) from public.events where name = 'landing_view' and source = any(array[${SOURCES.map((b) => `'${b}'`).join(',')}]);\nrollback;` });
  total++;
  const n = Number((/n=(\d+)/.exec(q.stdout || '') || [])[1]);
  if (q.status === 0 && n === SOURCES.length) console.log(`  ✓ 58. every bucket funnel.js can send (${SOURCES.length}) is accepted by bump_event(name, source) and stored as itself`);
  else { failed++; fail(`§58: a funnel.js bucket was refused or rewritten (${n} of ${SOURCES.length})`, q); }
}
{
  /* THE REVERSE ORDER: §29 re-run AFTER §58 (the base file is re-runnable,
     and a re-run restates bump_event(text) and admin_funnel). §29's
     bodies hand over to §58's when it is there; without that, the
     one-argument call would raise 42P10 on the wider key and every count
     would stop silently. Only §29.2–§29.3 are replayed: the rest of the
     base file is restated by later sections and is not this test. */
  const from = full.indexOf('-- 29.2 bump_event');
  const to = full.indexOf('revoke execute on function public.add_lead(text, text, text)');
  if (from < 0 || to < from) fail('§58: could not find §29.2–§29.3 in supabase-schema.sql');
  r = psql(['-f', '-'], { input: full.slice(from, to) });
  if (r.status !== 0) fail('§58: replaying §29.2–§29.3 after §58 failed', r);
  const q = (sql) => psql(['-tAc', sql]);
  total += 2;
  const one = q(`select public.bump_event('purchase'); select 'ok'`);
  if (one.status === 0 && /ok/.test(one.stdout)) console.log('  ✓ 58. after a re-run of §29, bump_event(text) still counts (no 42P10)');
  else { failed++; fail('§58: bump_event(text) broke after a re-run of §29', one); }
  const steps = q(`select t.claims('00000000-0000-4000-8000-00000000000a'); select count(*) from public.admin_funnel(null, null)`).stdout.trim().split('\n').pop();
  if (Number(steps) === 10) console.log('  ✓ 58. after a re-run of §29, admin_funnel still lists the ten steps');
  else { failed++; fail(`§58: admin_funnel shrank to ${steps} steps after a re-run of §29`); }
  r = psql(['-f', 'supabase/schema/schema-58-funnel-source.sql']);
  if (r.status !== 0) fail('§58 did not re-load after the §29 replay', r);
}
/* --- end §58 --- */

/* --- §59 (testimonials) --- on §40 and §45, loaded twice. --- */
for (const f of ['supabase/schema/schema-59-testimonials.sql', 'supabase/schema/schema-59-testimonials.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §59 loads (and re-runs cleanly)');
runChecks('testimonials.sql');
/* --- end §59 --- */

/* --- §60 (a pressed trial follows the console's trial_scope) --- on §50 and
   §51 (it restates §51.12's start_trial and §33.1's trial_offer), loaded
   twice. --- */
for (const f of ['supabase/schema/schema-60-signup-trial-scope.sql', 'supabase/schema/schema-60-signup-trial-scope.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §60 loads (and re-runs cleanly)');
runChecks('signup-trial-scope.sql');
{
  /* §60's body is §51.12's plus ONE marked line: any other drift in a
     restated function is how a refusal goes missing without a test saying
     so. Compare the two bodies with that line taken out. */
  const body = (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const from = src.indexOf('create or replace function public.start_trial(');
    const to = src.indexOf('$fn$;', from);
    return src.slice(from, to).replace(/\n\s*-- §60:[^\n]*/, '').replace(/case when src = 'signup' then 'sample' else coalesce\(s\.trial_scope, 'sample'\) end/, "coalesce(s.trial_scope, 'sample')");
  };
  total++;
  if (body('supabase/schema/schema-60-signup-trial-scope.sql') === body('supabase/schema/schema-51-security-followups.sql')) console.log("  ✓ 60. start_trial() is §51.12's body with only the scope line changed");
  else { failed++; fail("§60: start_trial() differs from §51.12's body beyond the scope line"); }
}
/* --- end §60 --- */

/* --- §61 (the launch week pass) --- on §56–§60 (it restates §56's order and
   activation path, §53's billing_status and refund, §52's apply_plan, §34's
   refund trial, §58's event names and §60's start_trial / trial_offer),
   loaded twice: it drops and re-creates CHECKs and one function whose
   return type grew. Every earlier check file ran against the unrestated
   bodies. --- */
for (const f of ['supabase/schema/schema-61-week-pass.sql', 'supabase/schema/schema-61-week-pass.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §61 loads (and re-runs cleanly)');
runChecks('week-pass.sql');
{
  /* The year path of each restated function is its predecessor's body plus
     the lines marked §61 (a marked line, or a block from "-- §61:" to
     "-- end §61"). Anything else that drifted is a refusal or a price that
     changed without a test saying so. */
  const body = (file, fn) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const from = src.indexOf(`create or replace function public.${fn}(`);
    const to = src.indexOf('$fn$;', from);
    if (from < 0 || to < 0) fail(`§61: ${fn} not found in ${file}`);
    return src.slice(from, to)
      .replace(/\n[^\n]*-- §61:[^\n]*\n(?:[^\n]*\n)*?\s*-- end §61/g, '')
      .split('\n').filter((l) => !/§61/.test(l)).join('\n');
  };
  const pairs = [
    ['create_pending_payment', 'supabase/schema/schema-56-usd-checkout.sql'],
    ['start_trial', 'supabase/schema/schema-60-signup-trial-scope.sql']
  ];
  for (const [fn, was] of pairs) {
    total++;
    if (body('supabase/schema/schema-61-week-pass.sql', fn) === body(was, fn)) console.log(`  ✓ 61. ${fn}() is its predecessor's body plus the lines marked §61`);
    else { failed++; fail(`§61: ${fn}() differs from ${was} beyond the lines marked §61`); }
  }
}
/* --- end §61 --- */

/* --- §62 (auto-renew: Razorpay Subscriptions) --- on §61 (it restates
   §61's pass_sold, pass_block, unapplied_sentence, trial_offer,
   price_notice(text) and billing_status), loaded twice: it creates tables
   and drops and re-adds a CHECK. --- */
for (const f of ['supabase/schema/schema-62-autorenew.sql', 'supabase/schema/schema-62-autorenew.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §62 loads (and re-runs cleanly)');
runChecks('autorenew.sql');
{
  /* Each restated function is §61's body plus the lines marked §62: in
     'once' mode nothing else may differ. */
  const body = (file, fn, end) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const from = src.indexOf(`create or replace function public.${fn}(`);
    const to = src.indexOf(end, from);
    if (from < 0 || to < 0) fail(`§62: ${fn} not found in ${file}`);
    return src.slice(from, to).split('\n').filter((l) => !/§62/.test(l)).join('\n')
      // a marked line that ADDED a key to a call moved the closing paren onto it
      .replace(/public\.pass_block\(\),\n/, 'public.pass_block())\n');
  };
  const pairs = [['billing_status', '$fn$;'], ['trial_offer', '$$;'], ['price_notice', '$$;']];
  for (const [fn, end] of pairs) {
    total++;
    if (body('supabase/schema/schema-62-autorenew.sql', fn, end) === body('supabase/schema/schema-61-week-pass.sql', fn, end)) console.log(`  ✓ 62. ${fn}() is §61's body plus the lines marked §62`);
    else { failed++; fail(`§62: ${fn}() differs from §61 beyond the lines marked §62`); }
  }
}
/* --- end §62 --- */
/* --- §63 (renewal reminders) --- on §62 (a column on subscriptions and two
   service-only functions), loaded twice. ABOVE the purge, which must stay
   last. --- */
for (const f of ['supabase/schema/schema-63-renewal-reminders.sql', 'supabase/schema/schema-63-renewal-reminders.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §63 loads (and re-runs cleanly)');
runChecks('renewal-reminders.sql');
/* --- end §63 --- */
/* --- §64 (the Pro plan's blurb) --- one UPDATE on plans, loaded twice. ABOVE
   the purge. --- */
for (const f of ['supabase/schema/schema-64-pro-blurb.sql', 'supabase/schema/schema-64-pro-blurb.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §64 loads (and re-runs cleanly)');
runChecks('pro-blurb.sql');
/* --- end §64 --- */
/* --- §65 (auto-pay wording) --- restates quote_subscription (§62) with one
   message reworded; loaded twice. ABOVE the purge. --- */
for (const f of ['supabase/schema/schema-65-autopay-wording.sql', 'supabase/schema/schema-65-autopay-wording.sql']) {
  r = psql(['-f', f]);
  if (r.status !== 0) fail(`${f} did not load cleanly`, r);
}
console.log('✓ §65 loads (and re-runs cleanly)');
runChecks('autopay-wording.sql');
/* --- end §65 --- */
/* --- §66 (drive-only storage, server half; the first-ever tour flag) ---
   Loaded twice, with an account made BETWEEN the two loads: the tour
   backfill must run on the first load only, or a re-run would mark
   everybody who signed up in between as already toured. ABOVE the purge,
   which has to know §66's two tables. --- */
r = psql(['-f', 'supabase/schema/schema-66-drive-storage.sql']);
if (r.status !== 0) fail('schema-66-drive-storage.sql did not load cleanly', r);
r = psql(['-c', `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000066ff', 'd66-between@example.com', now(), '{}')`]);
if (r.status !== 0) fail('§66: could not make the between-loads account', r);
r = psql(['-f', 'supabase/schema/schema-66-drive-storage.sql']);
if (r.status !== 0) fail('schema-66-drive-storage.sql is not re-runnable', r);
console.log('✓ §66 loads (and re-runs cleanly)');
runChecks('drive-storage.sql');
/* --- end §66 --- */
/* --- the clean-slate purge (supabase/schema/patches/purge-test-data-2026-10-27.sql)
   --- LAST, after every section (and §62's when it lands above this block):
   it COMMITS and leaves one sign-in, so nothing may run after it. It runs
   the patch file's own PART 2 and PART 3, cut out with the awk line the
   owner checksums, and stands in for §62's tables when §62 is not loaded. --- */
runChecks('purge.sql');
/* --- end purge --- */

if (!keep) psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
else console.log(`kept: psql -d ${DB}`);
console.log(`${failed ? '✗' : '✓'} schema: loads, ${total} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
