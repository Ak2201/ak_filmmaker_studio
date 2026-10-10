// plans.js: names, order and the matrix seed. Node, no browser.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/lib/plans.js', import.meta.url), 'utf8');
const msrc = readFileSync(new URL('../src/lib/plan-matrix.js', import.meta.url), 'utf8')
  .replace("import matrix from '../data/plan-matrix.json';", '');
const matrix = JSON.parse(readFileSync(new URL('../src/data/plan-matrix.json', import.meta.url), 'utf8'));
const { PLAN_NAMES, PLAN_ORDER, planName } = await import('data:text/javascript,' + encodeURIComponent(src));
const { matrixFeatures } = await import('data:text/javascript,' + encodeURIComponent('const matrix=' + JSON.stringify(matrix) + ';\n' + msrc));
let bad = 0;
const ok = (name, c) => { if (!c) { bad++; console.error('FAIL', name); } };
ok('names', PLAN_NAMES.starter === 'Basic' && PLAN_NAMES.indie === 'Intermediate' && PLAN_NAMES.pro === 'Pro' && PLAN_NAMES.free === 'Free');
ok('order', PLAN_ORDER.join() === 'free,starter,indie,pro');
ok('every id named', PLAN_ORDER.every((id) => PLAN_NAMES[id]));
ok('planName fallback', planName('x') === 'x' && planName('pro') === 'Pro');
const rank = (id) => PLAN_ORDER.indexOf(id);
ok('rank monotonic', rank('free') < rank('starter') && rank('starter') < rank('indie') && rank('indie') < rank('pro'));
for (const id of PLAN_ORDER) {
  const f = matrixFeatures(id);
  ok('features object ' + id, f && typeof f === 'object');
}
const nFalse = (id) => Object.values(matrixFeatures(id)).filter((v) => v === false).length;
ok('pro locks no more than free', nFalse('pro') <= nFalse('free'));
if (bad) process.exit(1);
console.log('test-plans: all passed');
