/* ============================================================
   THE SCHEMA, RUN — supabase-schema.sql against a real PostgreSQL
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
const full = fs.readFileSync(path.join(ROOT, 'supabase-schema.sql'), 'utf8');
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

console.log('supabase-schema.sql §1–§20 …');
const t0 = Date.now();
r = psql(['-f', '-'], { input: phase1 });
if (r.status !== 0) fail('supabase-schema.sql (§1–§20) did not load cleanly', r);
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

console.log('supabase-schema.sql §21–§31 …');
r = psql(['-f', '-'], { input: phase2 });
if (r.status !== 0) fail('supabase-schema.sql (§21–§31) did not load cleanly on top of §1–§20', r);
console.log('✓ §21–§31 load');
/* §21 onward: each growth file seeds its own people (fresh uuids), so
   what promo.sql left behind cannot make a check pass for the wrong
   reason. The list is explicit, like the first one: a file that exists
   and is not named here is not run, and nothing would say so. */
for (const file of GROWTH_FILES) runChecks(file);

console.log('supabase-schema.sql §32 onward …');
r = psql(['-f', '-'], { input: phase3 });
if (r.status !== 0) fail('supabase-schema.sql (§32 onward) did not load cleanly on top of §1–§31', r);
/* Twice: every section claims to be idempotent, and this one ALTERs a
   table, replaces a trigger on auth.users and restates five functions. */
r = psql(['-f', '-'], { input: phase3 });
if (r.status !== 0) fail('supabase-schema.sql (§32 onward) is not re-runnable', r);
console.log('✓ the whole schema loads (and §32 onward — §33 to §39 included — re-runs cleanly)');
/* §40 and §42 (the admin console's audit log and Customer 360). Until the
   main thread folds them into supabase-schema.sql they are standalone
   files at the repo root, loaded here ON TOP of the whole schema — twice,
   because §40 restates nineteen functions and every section claims to be
   re-runnable. Once they ARE in supabase-schema.sql this block loads
   nothing and the two check files still run. They load BEFORE the
   §32-onward check files, so purchases, trial-hours, refund-trial,
   receipt-email, plan-features, goals-sync and no-free-plan — which call
   set_billing_settings, grant_trial, grant_email, resend_receipt and
   set_plan — run, UNCHANGED, against the restated bodies. The earlier
   files (billing, promo, refunds, invoice …) assert §16–§31 behaviour
   that §32 deliberately changed and cannot be replayed here; the two
   admin files re-assert every restated writer's contract instead. */
const ADMIN_FILES = ['schema-40-admin-audit.sql', 'schema-42-customer-360.sql'];
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
   at the repo root and not yet folded into supabase-schema.sql. They load on
   top of the whole schema, twice (re-runnable), after the audit shim that
   stands in for section 40's admin_audit_write(). When a section is merged
   into supabase-schema.sql, delete it from this list. */
const STANDALONE = ['schema-41-admin-health.sql', 'schema-43-usage-cohorts.sql', 'schema-44-sync-limits.sql'];
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

if (!keep) psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
else console.log(`kept: psql -d ${DB}`);
console.log(`${failed ? '✗' : '✓'} schema: loads, ${total} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
