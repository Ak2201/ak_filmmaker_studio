#!/usr/bin/env node
/* ============================================================
   DEPLOY BILLING — run schema §16–§18 and deploy the edge functions
   ------------------------------------------------------------
   Everything docs/BILLING.md §1 lists as "do this in the dashboard",
   as one command, against the project in .env (VITE_SUPABASE_URL).

     node scripts/deploy-billing.mjs --print     write the SQL to stdout,
                                                 for the dashboard editor
     node scripts/deploy-billing.mjs --sql       run §16 and §17 through
                                                 the Management API
     node scripts/deploy-billing.mjs --functions deploy rzp-order,
                                                 rzp-verify, rzp-refund, rzp-webhook
                                                 (--no-verify-jwt), and
                                                 set the Razorpay secrets
                                                 that are in the env
     node scripts/deploy-billing.mjs             --sql then --functions

   NEEDS, as environment variables, never as arguments and never in
   the repo:
     SUPABASE_ACCESS_TOKEN     a personal access token (dashboard →
                               Account → Access Tokens). Both steps.
     RAZORPAY_KEY_ID           optional; set as function secrets when
     RAZORPAY_KEY_SECRET       present. Without them the functions
     RAZORPAY_WEBHOOK_SECRET   deploy and answer 503 until they are set.

   The SQL is SLICED FROM supabase-schema.sql rather than copied into
   this file, so there is one text of each section. The slice is the
   two sections verbatim, including their CHECKS comments; it is
   idempotent (create if not exists / or replace / drop if exists), as
   every section of that file is, so a second run is safe.

   The functions are deployed with the Supabase CLI via npx, which
   bundles them itself; nothing needs Deno locally. The CLI reads
   SUPABASE_ACCESS_TOKEN from the environment.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = new Set(process.argv.slice(2));
const want = (f) => args.has(f);
const doSql = want('--sql') || (!want('--functions') && !want('--print'));
const doFns = want('--functions') || (!want('--sql') && !want('--print'));

/* ---- the project ---------------------------------------------- */
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const REF = (env.VITE_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!REF) { console.error('✗ VITE_SUPABASE_URL in .env does not name a Supabase project'); process.exit(2); }

/* ---- the SQL: sections 16 and 17, sliced ------------------------- */
function sliceSchema() {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase-schema.sql'), 'utf8');
  const start = sql.search(/^-- 16\. BILLING/m);
  if (start < 0) { console.error('✗ section 16 not found in supabase-schema.sql'); process.exit(2); }
  // The separator line above the heading belongs to the section too.
  const from = sql.lastIndexOf('\n-- ====', start) + 1;
  return sql.slice(from);   // 16, 17 and 18 run to the end of the file
}

if (want('--print')) { process.stdout.write(sliceSchema()); process.exit(0); }

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) {
  console.error('✗ SUPABASE_ACCESS_TOKEN is not set. Create one in the dashboard (Account → Access Tokens)');
  console.error('  and put it in the environment — not in .env, not in this chat. Or: --print, and paste.');
  process.exit(2);
}

async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Management API ${r.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

if (doSql) {
  console.log(`running schema §16 onward on ${REF} …`);
  await runSql(sliceSchema());
  // Ask the database, not the file (CLAUDE.md, open item 5).
  const plans = await runSql(`select id, monthly_paise, yearly_paise from public.plans order by sort`);
  const fns = await runSql(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname in ('billing_status','activate_payment','create_pending_payment','admin_set_plan','apply_plan') order by 1`);
  const scope = await runSql(`select pg_get_constraintdef(con.oid) d from pg_constraint con join pg_class c on c.oid = con.conrelid
    where c.relname = 'project_data' and con.contype = 'c'`);
  console.log('  plans:', plans.map((p) => `${p.id} ${p.monthly_paise}/${p.yearly_paise}`).join(', '));
  console.log('  functions:', fns.map((f) => f.proname).join(', '));
  console.log('  project_data scopes include edit/deliverables:', /'edit'/.test(JSON.stringify(scope)) && /'deliverables'/.test(JSON.stringify(scope)));
  console.log('  project_data scopes include characters/costs (§24):', /'characters'/.test(JSON.stringify(scope)) && /'costs'/.test(JSON.stringify(scope)));
  if (plans.length !== 4 || fns.length !== 5) { console.error('✗ the schema did not land as expected'); process.exit(1); }
  console.log('✓ schema §16 onward is live');
}

if (doFns) {
  const cli = (...a) => {
    const r = spawnSync('npx', ['--yes', 'supabase@latest', ...a, '--project-ref', REF], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN } });
    if (r.status !== 0) { console.error(`✗ supabase ${a.join(' ')} failed`); process.exit(1); }
  };
  console.log('deploying edge functions …');
  cli('functions', 'deploy', 'rzp-order');
  cli('functions', 'deploy', 'rzp-verify');
  cli('functions', 'deploy', 'rzp-refund');   // schema section 27; verifies the JWT and the admin role itself
  cli('functions', 'deploy', 'rzp-webhook', '--no-verify-jwt');
  const secrets = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].filter((k) => process.env[k]);
  if (secrets.length) {
    console.log('setting function secrets:', secrets.join(', '));
    cli('secrets', 'set', ...secrets.map((k) => `${k}=${process.env[k]}`));
  } else {
    console.log('  no RAZORPAY_* in the environment; the functions answer 503 until `supabase secrets set` runs');
  }
  console.log('✓ functions deployed. Register the webhook URL in the Razorpay dashboard:');
  console.log(`  https://${REF}.supabase.co/functions/v1/rzp-webhook  (payment.captured, payment.failed, refund.processed, refund.failed)`);
}
