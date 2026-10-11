/* ============================================================
   STAGE GUIDE — the map, the cover fields and the write path, in Node
   ------------------------------------------------------------
   src/ui/stage-guide.js puts each blueprint step in the stage page
   it belongs to. The browser half (shared storage, both directions,
   a feature and a short project) is scripts/prove-stage-guide.mjs;
   this is the part that needs no browser:

     - every step the blueprints have is in a stage, and a short
       step the sidecar names twice (09) is in both;
     - the cover and ladder fields the guide restates still exist in
       the pages they were copied from (a renamed key is orphaned
       work — CLAUDE.md invariant 1);
     - a write through blueprint-store changes only the keys it was
       handed, and the two array keys keep short.js's row shape.

       node scripts/test-stage-guide.mjs     (or: npm run test:stage-guide)
   ============================================================ */
import { readFileSync } from 'node:fs';
import { mem } from './node-seams.mjs';

const G = await import('../src/ui/stage-guide.js');
const W = await import('../src/ui/stage-guide-widgets.js');
const BS = await import('../src/lib/blueprint-store.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const json = (p) => JSON.parse(readFileSync(new URL('../src/data/' + p, import.meta.url), 'utf8'));
const text = (p) => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');

/* ---- the map ------------------------------------------------- */
const feat = json('steps.feature.json');
const prod = json('steps.production.json');
const short = json('steps.short.json');
const featureIds = [...feat.vol1, ...feat.vol2, ...prod.production, ...prod.post].map((s) => s.id);
const shortIds = short.steps.map((s) => s.id);
eq(featureIds.length, 32, 'the feature blueprint has 32 steps');
eq(shortIds.length, 11, 'the short blueprint has 11 steps');

const seen = { feature: new Map(), short: new Map() };
for (const stage of G.STAGE_IDS) {
  for (const fmt of ['feature', 'short']) {
    const items = G.guideSteps(stage, fmt);
    for (const it of items) {
      if (it.kind !== 'step') continue;
      const m = seen[fmt];
      m.set(it.id, (m.get(it.id) || []).concat(stage));
    }
    const ids = items.map((i) => i.id);
    ok(new Set(ids).size === ids.length, `${fmt}/${stage}: no step twice in one stage`);
    ok(items.every((i) => i.format === fmt), `${fmt}/${stage}: format carried`);
  }
}
const gaps = (all, m) => all.filter((id) => !m.has(id));
eq(gaps(featureIds, seen.feature), [], 'every feature step 01–32 is in a stage');
eq(gaps(shortIds, seen.short), [], 'every short step 01–11 is in a stage');
const multi = (m) => [...m].filter(([, s]) => s.length > 1).map(([id, s]) => id + ':' + s.join('+'));
eq(multi(seen.feature), [], 'each feature step is in exactly one stage');
eq(multi(seen.short), ['step-09:preprod+production'], 'the short step the sidecar spans is in both stages');
eq([...seen.feature.keys()].filter((id) => !featureIds.includes(id)), [], 'no stage names a feature step that does not exist');
eq([...seen.short.keys()].filter((id) => !shortIds.includes(id)), [], 'no stage names a short step that does not exist');

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'step-' + String(a + i).padStart(2, '0'));
const idsOf = (stage, fmt) => G.guideSteps(stage, fmt).filter((i) => i.kind === 'step').map((i) => i.id);
eq(idsOf('story', 'feature'), range(1, 10), 'feature story is 01–10');
eq(idsOf('screenplay', 'feature'), range(11, 13), 'feature screenplay is 11–13');
eq(idsOf('preprod', 'feature'), range(14, 24), 'feature pre-production is 14–24');
eq(idsOf('production', 'feature'), range(25, 28), 'feature production is 25–28');
eq(idsOf('post', 'feature'), range(29, 32), 'feature post is 29–32');
eq(idsOf('story', 'short'), range(1, 5), 'short story is 01–05');
eq(idsOf('screenplay', 'short'), ['step-06', 'step-07', 'step-08', 'step-11'], 'short screenplay is 06–08 and 11');
eq(idsOf('preprod', 'short'), ['step-09'], 'short pre-production is 09');
eq(idsOf('production', 'short'), ['step-09'], 'short production is 09');
eq(idsOf('post', 'short'), ['step-10'], 'short post is 10');

/* ns: 25–32 render under `production`, which shares the feature's blob. */
ok(G.guideSteps('production', 'feature').every((i) => i.ns === 'production'), 'production steps are in the production ns');
ok(G.guideSteps('story', 'feature').every((i) => i.ns === 'feature'), 'story steps are in the feature ns');
eq(BS.blobKey('production'), BS.blobKey('feature'), 'production and feature share one blob');
ok(BS.blobKey('short') !== BS.blobKey('feature'), 'the short has its own blob');

/* the interludes, in their places */
const story = G.guideSteps('story', 'feature').map((i) => i.id);
eq(story.slice(0, 4), ['step-01', 'step-02', 'treatment-ladder', 'step-03'], 'the treatment ladder sits after step 02');
const scr = G.guideSteps('screenplay', 'feature').map((i) => i.id);
eq(scr, ['step-11', 'step-12', 'write-the-draft', 'step-13'], 'write-the-draft sits after step 12');
ok(G.guideSteps('story', 'short').every((i) => i.kind === 'step'), 'the short has no interludes');
eq(G.guideSteps('nope', 'feature'), [], 'an unknown stage has no steps');
eq(G.guideSteps('story', undefined).map((i) => i.id), story, 'a missing format reads as the feature');

/* ---- the covers ---------------------------------------------- */
const featureSrc = text('pages/feature.js');
const shortSrc = text('pages/short.js');
const stages = json('steps.stages.json');
for (const p of stages.parts.feature) {
  ok(Object.prototype.hasOwnProperty.call(G.COVER_FIELDS, p.cover), `cover ${p.cover} (${p.stage}) has a field spec`);
  eq(G.coverFields(p.stage, 'feature'), G.COVER_FIELDS[p.cover], `coverFields(${p.stage}) is derived from the sidecar's part`);
}
for (const [cover, fields] of Object.entries(G.COVER_FIELDS)) {
  for (const f of fields) ok(featureSrc.includes('data-key="' + f.key + '"'), `feature.js still has cover key ${f.key}`);
  ok(new Set(fields.map((f) => f.key)).size === fields.length, `${cover}: cover keys unique`);
}
for (const f of G.SHORT_COVER_FIELDS) ok(shortSrc.includes("key: '" + f.key + "'"), `short.js still has cover key ${f.key}`);
for (const r of W.LADDER) ok(featureSrc.includes('data-key="' + r.key + '"'), `feature.js still has ladder key ${r.key}`);
eq(G.coverFields('story', 'short').map((f) => f.key), ['meta_title', 'meta_writer', 'meta_started', 'meta_runtime'], 'the short cover sits with its story stage');
eq(G.coverFields('post', 'short'), [], 'no cover on the short’s other stages');

/* every key the guide could write is a key the blueprint knows */
const known = new Set();
for (const s of [...feat.vol1, ...feat.vol2, ...prod.production, ...prod.post]) {
  for (const b of s.blocks || []) {
    for (const it of b.items || []) if (it.key) known.add(it.key);
    for (const m of String(b.html || '').matchAll(/data-key="([^"]+)"/g)) known.add(m[1]);
  }
}
ok(known.size > 200, 'the feature blueprint’s keys were read (' + known.size + ')');

/* ---- the short's row shapes, against short.js ----------------- */
const fieldsDecl = /const SCENE_FIELDS = \[([^\]]*)\]/.exec(shortSrc);
eq(fieldsDecl[1].split(',').map((s) => s.trim().replace(/'/g, '')), W.SCENE_FIELDS, 'scene-map row fields match short.js');
const beatsDecl = /const SCENE_BEATS\s*= \[([^\]]*)\]/.exec(shortSrc);
eq(beatsDecl[1].split(',').map((s) => s.trim().replace(/'/g, '')), W.SCENE_BEATS, 'scene-map beats match short.js');
const dom = [...shortSrc.slice(shortSrc.indexOf('function buildSceneMapRow'), shortSrc.indexOf('function renumberSceneMap'))
  .matchAll(/data-field="(\w+)"/g)].map((m) => m[1]);
eq(dom, W.SCENE_FIELDS, 'short.js builds its row cells in that order (so rowValues() keys follow it)');
const wdom = [...text('ui/stage-guide-widgets.js').slice(text('ui/stage-guide-widgets.js').indexOf('function sceneMapRow'),
  text('ui/stage-guide-widgets.js').indexOf('function rowValues'))
  .matchAll(/'data-field': '(\w+)'/g)].map((m) => m[1]);
eq(wdom, W.SCENE_FIELDS, 'the guide builds its row cells in that order too');
const collect = shortSrc.slice(shortSrc.indexOf('function collectScriptData'), shortSrc.indexOf('function clearScript'));
ok(/dialogues\.push\(\{\s*character:[^}]*parenthetical:[^}]*line:/s.test(collect), 'short.js dialogue shape is { character, parenthetical, line }');
ok(/scenes\.push\(\{ slug, action, dialogues \}\)/.test(collect), 'short.js scene shape is { slug, action, dialogues }');
const wcollect = text('ui/stage-guide-widgets.js');
ok(/dialogues\.push\(\{\s*character:[^}]*parenthetical:[^}]*line:/s.test(wcollect), 'the guide’s dialogue shape is the same');
ok(/scenes\.push\(\{ slug, action, dialogues \}\)/.test(wcollect), 'the guide’s scene shape is the same');

/* ---- the write path: a merge, and only what was handed -------- */
const KEY = 'fms_filmmaker_combined_v1';
const before = {
  meta_title: 'Dragon', s1_whatif: 'what if', sl_1_slug: 'INT. HOUSE - DAY', ck_x: true,
  hod_a_check: true, palette_c1: '#112233', b01: 'open'
};
mem.set(KEY, JSON.stringify(before));
ok(BS.writeFields('feature', { s1_whatif: 'what if a dragon' }), 'writeFields reports success');
let after = JSON.parse(mem.get(KEY));
eq(Object.keys(after), Object.keys(before), 'no key added or dropped');
eq(Object.keys(after).filter((k) => after[k] !== before[k]), ['s1_whatif'], 'only the edited key changed');
BS.writeFields('production', { hod_a_check: false });
after = JSON.parse(mem.get(KEY));
eq(after.hod_a_check, false, 'a checkbox is stored as a boolean through the production ns');
eq(after.s1_whatif, 'what if a dragon', 'the production write kept the feature answer');
ok(BS.writeFields('feature', {}), 'an empty patch is a no-op');
eq(JSON.parse(mem.get(KEY)), after, 'an empty patch changed nothing');
mem.delete(KEY);
BS.writeFields('feature', { s1_whatif: 'x' });
eq(JSON.parse(mem.get(KEY)), { s1_whatif: 'x' }, 'a write to an empty blob creates just that key');

/* the arrays go in whole, beside the fields, untouched by a field write */
const SKEY = 'fms_shortfilm_blueprint_v1';
const rows = [{ slug: 'INT. FLAT - DAY', who: 'Ravi', what: 'He waits.', beat: 'Setup', pages: '0.5' },
  { slug: '', who: '', what: '', beat: '', pages: '' }];
const script = [{ slug: 'INT. FLAT - DAY', action: 'Ravi waits.', dialogues: [{ character: 'RAVI', parenthetical: '', line: 'Hello.' }] }];
mem.set(SKEY, JSON.stringify({ meta_title: 'T', _sceneMap: rows, _script: script }));
BS.writeFields('short', { meta_title: 'T2' });
let s = JSON.parse(mem.get(SKEY));
eq(s._sceneMap, rows, '_sceneMap survives a field write');
eq(s._script, script, '_script survives a field write');
const edited = rows.map((r, i) => (i === 0 ? { ...r, what: 'He waits, then leaves.' } : r));
BS.writeFields('short', { _sceneMap: edited });
s = JSON.parse(mem.get(SKEY));
eq(JSON.stringify(s._sceneMap), JSON.stringify(edited), '_sceneMap round-trips byte-identical');
eq(s._script, script, 'and leaves _script alone');
eq(s.meta_title, 'T2', 'and the fields');

console.log(`stage guide: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
