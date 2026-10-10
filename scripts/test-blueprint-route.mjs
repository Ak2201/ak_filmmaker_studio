/* ============================================================
   TEST — src/lib/blueprint-route.js, in Node
   ------------------------------------------------------------
   Every blueprint step (feature 01-32, short 01-11) maps to exactly
   one stage page; guideHref has the shape the stage guide reads; and
   the old blueprint hashes (and cleanUrls paths with no .html) route
   somewhere real. Pure: no DOM, no storage.
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const R = await import('../src/lib/blueprint-route.js');
const nav = JSON.parse(readFileSync(new URL('../src/data/navigation.json', import.meta.url), 'utf8'));
const stages = JSON.parse(readFileSync(new URL('../src/data/steps.stages.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const pad = (n) => 'step-' + String(n).padStart(2, '0');

const PAGE = { story: 'story.html', screenplay: 'write.html', preprod: 'breakdown.html', production: 'shoot.html', post: 'edit.html' };
for (const [stage, page] of Object.entries(PAGE)) eq(R.stagePage(stage), page, 'stage ' + stage + ' lives on ' + page);
ok(nav.phases.every((p) => PAGE[p.id]), 'navigation.json has exactly the five known stages');

/* feature 01-32: the one blueprint page holds both namespaces. */
const seen = new Set();
for (let n = 1; n <= 32; n++) {
  const id = pad(n);
  const ns = n <= 24 ? 'feature' : 'production';
  const r = R.stageForStep(ns, id);
  ok(r && PAGE[r.stage] === r.page, `feature ${id} maps to a stage page`);
  eq(R.stagesForStep(ns, id).length, 1, `feature ${id} has exactly one stage`);
  // a caller on feature.html says `feature` for all 32
  eq(R.stageForStep('feature', id), r, `feature ${id} resolves the same under ns=feature`);
  const h = R.guideHref('feature', id);
  eq(h, `${r.page}?step=feature/${id}#guide`, `guideHref feature ${id}`);
  seen.add(id);
}
eq(R.guideHref('feature', 'step-07'), 'story.html?step=feature/step-07#guide', 'feature 07 is in Story');
eq(R.stageForStep('feature', 'step-14').page, 'breakdown.html', 'feature 14 is in Pre-Production');
eq(R.stageForStep('feature', 'step-25').page, 'shoot.html', 'feature 25 is in Production');
eq(R.stageForStep('feature', 'step-11').page, 'write.html', 'feature 11 is in the Screenplay');
eq(R.stageForStep('feature', 'step-32').page, 'edit.html', 'feature 32 is in Post');

/* short 01-11; step 9 spans two stages and answers with the first. */
for (let n = 1; n <= 11; n++) {
  const id = pad(n);
  const r = R.stageForStep('short', id);
  ok(r && PAGE[r.stage] === r.page, `short ${id} maps to a stage page`);
  eq(R.guideHref('short', id), `${r.page}?step=short/${id}#guide`, `guideHref short ${id}`);
}
eq(R.stagesForStep('short', 'step-09'), ['preprod', 'production'], 'short 9 spans two stages');
eq(R.stageForStep('short', 'step-09').page, 'breakdown.html', 'short 9 answers with its first stage');
eq(R.stageForStep('short', 'step-11').page, 'write.html', 'short 11 (the lock) is the Screenplay');

/* every sidecar step is covered by the loops above (no orphan). */
for (const key of Object.keys(stages.steps)) {
  const [ns, id] = key.split(':');
  ok(R.stageForStep(ns, id), `sidecar ${key} resolves`);
}

/* unknown ids */
eq(R.stageForStep('feature', 'step-99'), null, 'an unknown step is null');
eq(R.guideHref('short', 'step-12'), null, 'an unknown short step has no href');
eq(R.stageGuideHref('story'), 'story.html#guide', 'stage guide href');
eq(R.stageGuideHref('nope'), null, 'unknown stage');

/* cleanUrls: production pathnames have no .html. */
eq(R.pageOf('/feature'), 'feature.html', 'pageOf /feature');
eq(R.pageOf('/feature.html'), 'feature.html', 'pageOf /feature.html');
eq(R.pageOf('/short/'), 'short.html', 'pageOf /short/');
eq(R.pageOf('/Short.HTML'), 'short.html', 'pageOf is case-folded');
eq(R.pageOf('feature.html?stay=1#x'), 'feature.html', 'pageOf drops query and hash');
eq(R.pageOf('/'), 'index.html', 'pageOf /');

/* old anchors */
eq(R.routeForAnchor('/feature', '#step-07'), 'story.html?step=feature/step-07#guide', 'feature #step-07 (cleanUrls path)');
eq(R.routeForAnchor('/feature.html', '#step-30'), 'edit.html?step=feature/step-30#guide', 'feature #step-30 (production ns)');
eq(R.routeForAnchor('/short', '#step-09'), 'breakdown.html?step=short/step-09#guide', 'short #step-09');
eq(R.routeForAnchor('/feature', '#vol-1'), 'story.html#guide', 'cover vol-1');
eq(R.routeForAnchor('/feature', '#part-2'), 'write.html#guide', 'cover part-2');
eq(R.routeForAnchor('/feature', '#vol-2'), 'breakdown.html#guide', 'cover vol-2');
eq(R.routeForAnchor('/feature', '#phase-3'), 'shoot.html#guide', 'cover phase-3');
eq(R.routeForAnchor('/feature', '#phase-4'), 'edit.html#guide', 'cover phase-4');
eq(R.routeForAnchor('/feature', '#glossary'), 'library.html#glossary', 'feature glossary');
eq(R.routeForAnchor('/feature', '#treatment-ladder').split('?')[0], 'story.html', 'treatment-ladder interlude has a stage page');
eq(R.routeForAnchor('/feature', ''), 'story.html#guide', 'no hash lands on the first stage guide');
eq(R.routeForAnchor('/short', '#whatever'), 'story.html#guide', 'unknown short anchor lands on the first stage guide');

/* navigation.json: every stage's guide entries point at <page>#guide, and the shelf is gone. */
ok(!nav.global.some((g) => g.id === 'blueprints'), 'the Blueprints shelf is not a destination');
for (const p of nav.phases) {
  ok((p.guide || []).length > 0 && p.guide.every((g) => g.href === PAGE[p.id] + '#guide'), `${p.id}: guide entries point at ${PAGE[p.id]}#guide`);
}

/* the redirect module is inert until asked */
const gx = globalThis;
gx.window = gx.window || gx;
const Red = await import('../src/pages/blueprint-redirect.js');
const calls = [];
const loc = (pathname, hash, search = '') => ({ pathname, hash, search, replace: (u) => calls.push(u) });
eq(Red.redirectIfBlueprint(loc('/feature', '#step-07')), false, 'the redirect is off by default');
gx.window.__FMS_BLUEPRINT_REDIRECT__ = true;
eq(Red.redirectIfBlueprint(loc('/feature', '#step-07', '?stay=1')), false, '?stay=1 exempts');
eq(Red.redirectIfBlueprint(loc('/feature', '#step-07')), true, 'enabled: redirects');
eq(calls, ['story.html?step=feature/step-07#guide'], 'location.replace got the guide href');
delete gx.window.__FMS_BLUEPRINT_REDIRECT__;

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `✓ blueprint-route: ${pass} checks`);
process.exit(fail ? 1 : 0);
