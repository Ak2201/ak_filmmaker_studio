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
const phase2 = lines.slice(at - 1).join('\n');

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

console.log('supabase-schema.sql §21 onward …');
r = psql(['-f', '-'], { input: phase2 });
if (r.status !== 0) fail('supabase-schema.sql (§21 onward) did not load cleanly on top of §1–§20', r);
console.log('✓ the whole schema loads');
/* §21 onward: each growth file seeds its own people (fresh uuids), so
   what promo.sql left behind cannot make a check pass for the wrong
   reason. The list is explicit, like the first one: a file that exists
   and is not named here is not run, and nothing would say so. */
for (const file of GROWTH_FILES) runChecks(file);

if (!keep) psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
else console.log(`kept: psql -d ${DB}`);
console.log(`${failed ? '✗' : '✓'} schema: loads, ${total} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
