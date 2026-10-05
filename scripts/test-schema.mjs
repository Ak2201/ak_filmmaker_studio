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

   What it does NOT prove: Supabase's own objects beyond the shim
   (auth triggers, realtime filtering, the dashboard's role grants) and
   anything about the edge functions. It proves the SQL is the SQL.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DB = process.env.SCHEMA_TEST_DB || 'fms_schema_test';
const keep = process.argv.includes('--keep');

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

console.log('supabase-schema.sql …');
const t0 = Date.now();
r = psql(['-f', 'supabase-schema.sql']);
if (r.status !== 0) fail('supabase-schema.sql did not load cleanly', r);
const warnings = (r.stderr || '').split('\n').filter((l) => /WARNING/.test(l));
console.log(`✓ the whole schema loads (${Math.round((Date.now() - t0) / 100) / 10}s${warnings.length ? `, ${warnings.length} warning(s)` : ''})`);

let total = 0, failed = 0;
for (const file of ['billing.sql']) {
  console.log(`checks: ${file} …`);
  r = psql(['-f', 'scripts/schema-tests/' + file]);
  const notices = (r.stderr || '').split('\n').filter((l) => /^(psql:.*)?NOTICE:\s+ok - /.test(l) || /NOTICE:\s+ok - /.test(l));
  total += notices.length;
  notices.forEach((l) => console.log('  ✓ ' + l.replace(/.*ok - /, '')));
  if (r.status !== 0) { failed++; fail(`${file} failed after ${notices.length} passing check(s)`, r); }
}

if (!keep) psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
else console.log(`kept: psql -d ${DB}`);
console.log(`${failed ? '✗' : '✓'} schema: loads, ${total} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
