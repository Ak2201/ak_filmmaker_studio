#!/usr/bin/env node
/* ============================================================
   make-usage-names-sql — the fixed list of usage counters, GENERATED
   from src/data/navigation.json
   ------------------------------------------------------------
     node scripts/make-usage-names-sql.mjs           print the block
     node scripts/make-usage-names-sql.mjs --write   put it in supabase/schema/schema-43-usage-cohorts.sql
     node scripts/make-usage-names-sql.mjs --check   exit 1 if the file differs

   The block is everything between BEGIN_MARK and END_MARK in
   supabase/schema/schema-43-usage-cohorts.sql: public.usage_names(), the one list the
   usage_daily CHECK and bump_usage() both read. `npm run test:usage-names`
   runs --check, so a module added to navigation.json without the SQL
   being regenerated fails the gate — the same pattern as
   make-plan-features-sql.mjs and its test:plans.

   WHAT COUNTS AS A MODULE: every entry of a `modules` array, under a
   phase (`phases[].modules`) or under a global page (`global[].modules`) —
   the same set plan-matrix.js keys its features by. Global PAGES
   themselves (home, dashboard, settings, purchase, admin …) are not
   modules and are not counted; the console page is never counted.
   ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SQL = new URL('supabase/schema/schema-43-usage-cohorts.sql', ROOT);
export const BEGIN_MARK = '-- BEGIN GENERATED: usage names';
export const END_MARK = '-- END GENERATED: usage names';

/** The non-module counters, in the order the owner named them (11 Oct 2026). */
export const FIXED_NAMES = [
  'script_import', 'export_pdf', 'export_docx', 'ai_call',
  'drive_connect', 'limit_hit', 'share_created', 'screening_pass_used'
];

export function moduleIds() {
  const nav = JSON.parse(readFileSync(new URL('src/data/navigation.json', ROOT), 'utf8'));
  const ids = [];
  for (const g of nav.global || []) for (const m of g.modules || []) ids.push(m.id);
  for (const p of nav.phases || []) for (const m of p.modules || []) ids.push(m.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) throw new Error('navigation.json repeats module id(s): ' + [...new Set(dup)].join(', '));
  for (const id of ids) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('module id "' + id + '" is not [a-z][a-z0-9-]* and would not be a safe counter name');
  }
  return ids;
}

export const allNames = () => [...moduleIds().map((id) => 'module_open:' + id), ...FIXED_NAMES];

export function generate() {
  const names = allNames();
  const L = [];
  L.push(BEGIN_MARK + ' (scripts/make-usage-names-sql.mjs, from src/data/navigation.json)');
  L.push('-- Do not edit by hand: change navigation.json, run');
  L.push('-- `node scripts/make-usage-names-sql.mjs --write`, commit both.');
  L.push('-- `npm run test:usage-names` fails when this text is not what the script prints.');
  L.push('create or replace function public.usage_names()');
  L.push('returns text[]');
  L.push('language sql');
  L.push('immutable');
  L.push('as $names$');
  L.push('  select array[');
  names.forEach((n, i) => L.push("    '" + n + "'" + (i < names.length - 1 ? ',' : '')));
  L.push('  ]::text[];');
  L.push('$names$;');
  L.push(END_MARK);
  return L.join('\n');
}

function splice(text, block) {
  const a = text.indexOf(BEGIN_MARK);
  const b = text.indexOf(END_MARK);
  if (a < 0 || b < a) throw new Error('supabase/schema/schema-43-usage-cohorts.sql has no "' + BEGIN_MARK + '" … "' + END_MARK + '" block');
  return text.slice(0, a) + block + text.slice(b + END_MARK.length);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const block = generate();
  const arg = process.argv[2];
  if (!arg) { console.log(block); }
  else {
    const cur = readFileSync(SQL, 'utf8');
    const next = splice(cur, block);
    if (arg === '--write') {
      if (next !== cur) { writeFileSync(SQL, next); console.log('✓ wrote usage names into supabase/schema/schema-43-usage-cohorts.sql (' + allNames().length + ' names)'); }
      else console.log('✓ already current (' + allNames().length + ' names)');
    } else if (arg === '--check') {
      if (next !== cur) {
        console.error('✗ supabase/schema/schema-43-usage-cohorts.sql does not match src/data/navigation.json — run: node scripts/make-usage-names-sql.mjs --write');
        process.exit(1);
      }
      console.log('✓ usage names match navigation.json (' + allNames().length + ' names)');
    } else { console.error('unknown argument ' + arg); process.exit(2); }
  }
}
