// plans.js and the plan matrix: names, order, coverage, supersets, §35. Node, no browser.
import { readFileSync } from 'node:fs';
import { loadMatrixModule, generate, current } from './make-plan-features-sql.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('src/lib/plans.js');
const matrix = JSON.parse(read('src/data/plan-matrix.json'));
const nav = JSON.parse(read('src/data/navigation.json'));
const { PLAN_NAMES, PLAN_ORDER, planName } = await import('data:text/javascript,' + encodeURIComponent(src));
const M = await loadMatrixModule();
let bad = 0;
const ok = (name, c) => { if (!c) { bad++; console.error('FAIL', name); } };

ok('names', PLAN_NAMES.starter === 'Basic' && PLAN_NAMES.indie === 'Intermediate' && PLAN_NAMES.pro === 'Pro' && PLAN_NAMES.free === 'Free');
ok('order', PLAN_ORDER.join() === 'free,starter,indie,pro');
ok('every id named', PLAN_ORDER.every((id) => PLAN_NAMES[id]));
ok('planName fallback', planName('x') === 'x' && planName('pro') === 'Pro');
const rank = (id) => PLAN_ORDER.indexOf(id);
ok('rank monotonic', rank('free') < rank('starter') && rank('starter') < rank('indie') && rank('indie') < rank('pro'));
ok('matrix plans are PLAN_ORDER', Object.keys(matrix.plans).join() === PLAN_ORDER.join()
   && PLAN_ORDER.every((id) => matrix.plans[id] === PLAN_NAMES[id]));

/* COVERAGE: every module id in navigation.json is a matrix row, and no
   module row names an id navigation.json does not have. */
const navIds = [...nav.global.flatMap((g) => g.modules || []), ...nav.phases.flatMap((p) => p.modules)]
  .filter((m) => m.status !== 'planned').map((m) => m.id);
const rowKeys = matrix.features.map((f) => f.key);
ok('row keys unique', new Set(rowKeys).size === rowKeys.length);
for (const id of navIds) ok('navigation.json module "' + id + '" is in plan-matrix.json', matrix.features.some((f) => f.key === id && f.kind === 'module'));
for (const f of matrix.features.filter((x) => x.kind === 'module')) ok('matrix module "' + f.key + '" exists in navigation.json', navIds.includes(f.key));
for (const f of matrix.features) {
  ok('row "' + f.key + '" names only known plans', (f.plans || []).every((id) => PLAN_ORDER.includes(id)));
  ok('row "' + f.key + '" has a label', !!M.labelOf(f) && M.labelOf(f) !== f.key);
}

/* The capabilities plan-gate.js (CORE) lists for the console are the
   matrix's capability rows, key for key. */
const gate = read('src/lib/plan-gate.js');
const capBlock = gate.slice(gate.indexOf('export const CAPABILITIES'), gate.indexOf('];', gate.indexOf('export const CAPABILITIES')));
const gateCaps = [...capBlock.matchAll(/\['([a-z_]+)'/g)].map((m) => m[1]);
const matrixCaps = matrix.features.filter((f) => f.kind === 'capability').map((f) => f.key);
ok('plan-gate CAPABILITIES = matrix capabilities [' + gateCaps + '] vs [' + matrixCaps + ']', gateCaps.join() === matrixCaps.join());

/* SUPERSETS: each paid plan includes everything the one below it has. */
const PAID = PLAN_ORDER.filter((id) => id !== 'free');
ok('PAID', M.PAID.join() === PAID.join());
for (let i = 1; i < PAID.length; i++) {
  for (const f of matrix.features.filter((x) => !x.inverted)) {
    if (f.plans.includes(PAID[i - 1])) ok(`${PAID[i]} ⊇ ${PAID[i - 1]}: "${f.key}"`, f.plans.includes(PAID[i]));
  }
}
ok('no paid plan is sample-only', matrix.features.filter((f) => f.inverted).every((f) => PAID.every((id) => !f.plans.includes(id))));
ok('Pro has every row', matrix.features.filter((f) => !f.inverted).every((f) => f.plans.includes('pro')));

/* The seeds. */
for (const id of PLAN_ORDER) {
  const f = M.matrixFeatures(id);
  ok('features object ' + id, f && typeof f === 'object' && Object.values(f).every((v) => typeof v === 'boolean'));
}
for (const id of PAID) ok('paid map ' + id + ' carries no sample_only', !('sample_only' in M.matrixFeatures(id)));
ok('Pro locks nothing', Object.values(M.matrixFeatures('pro')).every((v) => v === true));
/* free mirrors the section 18 seed under plan-gate.js's rule (missing = allowed, false = locked). */
const freeMap = M.matrixFeatures('free');
ok('free = §18 seed: sample_only, no new projects, nothing else locked',
  freeMap.sample_only === true && freeMap.new_projects === false
  && Object.entries(freeMap).filter(([k, v]) => v === false).map(([k]) => k).join() === 'new_projects');
ok('owner split: Basic', ['screenplay', 'revisions', 'import-script', 'script-breakdown', 'scene-list', 'screen-time', 'story-beats', 'idea-vault', 'case-studies', 'exports', 'script_import', 'new_projects']
  .every((k) => M.matrixFeatures('starter')[k] === true));
ok('owner split: Intermediate, not Basic', ['budget', 'stripboard', 'breakdowns', 'pitch-deck', 'drive_backup', 'contacts', 'reports']
  .every((k) => M.matrixFeatures('starter')[k] === false && M.matrixFeatures('indie')[k] === true));
ok('owner split: Pro only', ['shoot-day', 'call-sheets', 'edit-log', 'deliverables', 'ai_tools', 'remove_branding']
  .every((k) => M.matrixFeatures('indie')[k] === false && M.matrixFeatures('pro')[k] === true));
ok('extension limit', M.matrixLimits('starter').extension === false && M.matrixLimits('indie').extension === true && M.matrixLimits('pro').extension === true);
ok('addedBy covers every row once', PAID.flatMap((id) => M.addedBy(id)).length === matrix.features.filter((f) => !f.inverted).length);

/* §35 in supabase-schema.sql is exactly what the matrix generates. */
const cur = current(read('supabase-schema.sql'));
ok('supabase-schema.sql has §35', !!cur);
ok('§35 = scripts/make-plan-features-sql.mjs output (run it with --write)', cur && cur.body === await generate());

if (bad) process.exit(1);
console.log('test-plans: all passed');
