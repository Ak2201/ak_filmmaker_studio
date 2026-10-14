/* ============================================================
   test:ai-phase2 — the Desk's genre/comparables, scene-notes and
   breakdown-tags jobs, in Node, against a faked fetch. No key, no
   network. Proves: a fabricated quote is stripped and counted in each;
   an element with no words behind it is dropped; a cut flag needs a
   verified quote; an unknown or duplicate scene is ignored; comparables
   are deduped and capped; the audience reaches the coverage prompts
   (and the old default holds when none is set).
   ============================================================ */
import { register } from 'node:module';

/* store.js becomes the three raw accessors over an in-memory map —
   the only part of it ai-providers.js uses. */
const mem = new Map();
globalThis.__fakeMem = mem;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        'export default {};'), shortCircuit: true };
    if (spec.endsWith('.css'))
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));


let id = 0;
const E = (type, text) => ({ id: 'e' + (++id), type, text });
const script = () => { id = 0; return [
  E('scene', 'INT. ANBU HOUSE - NIGHT'),
  E('action', 'Anbu counts coins on the floor. The ceiling fan ticks.'),
  E('character', 'ANBU'), E('dialogue', 'Naan nalaikku Chennai poren.'),
  E('scene', 'EXT. BUS STAND - DAY'),
  E('action', 'A crowd waits. Anbu holds one red bag, looking back once.')
]; };

AI.setProvider('anthropic');
AI.setKey('sk-ant-TESTTESTTESTTESTTEST');
const log = [];
const restore = installFakeFetch(async (req) => {
  const u = req.user;
  if (u.startsWith('Place the screenplay') || /Place the screenplay/.test(u)) {
    return {
      genre: 'Drama', subgenres: ['Migration', 'Family', 'Coming of age', 'Extra'], tone: 'quiet, aching', budgetTier: 'low',
      budgetWhy: 'Two interiors and a bus stand.', audience: 'Urban Tamil youth',
      comps: [{ title: 'Alpha', year: '2010', why: 'a' }, { title: 'alpha', year: '2011', why: 'dupe' }, { title: 'Beta', year: 'circa 90s', why: 'b' },
              { title: 'C', year: '', why: 'c' }, { title: 'D', year: '2001', why: 'd' }, { title: 'E', year: '2002', why: 'e' }, { title: 'F', year: '2003', why: 'f' }],
      evidence: [{ scene: '1', quote: 'Anbu counts coins on the floor.', note: 'poverty' }, { scene: '1', quote: 'A line nobody wrote', note: 'invented' }]
    };
  }
  if (/Write ONE note for EVERY scene/.test(u)) {
    return { notes: [
      { scene: '1', note: 'Establishes want.', cut: true, quote: 'Anbu counts coins on the floor.' },
      { scene: '2', note: 'Leaving.', cut: true, quote: 'a made up quote here' },
      { scene: '99', note: 'not a scene', cut: false, quote: 'whatever it is' },
      { scene: '1', note: 'duplicate', cut: false, quote: 'Anbu counts coins' }
    ] };
  }
  if (/Break each scene down/.test(u)) {
    return { elements: [
      { scene: '1', category: 'props', name: 'coins', quote: 'counts coins on the floor' },
      { scene: '1', category: 'sfx', name: 'fireworks', quote: 'fireworks light the sky' },
      { scene: '1', category: 'props', name: 'Coins', quote: 'counts coins on the floor' },
      { scene: '2', category: 'extras', name: 'crowd at the bus stand', quote: 'A crowd waits.' },
      { scene: '2', category: 'nonsense', name: 'x', quote: 'A crowd waits.' },
      { scene: '2', category: 'props', name: 'red bag', quote: 'one red bag' }
    ] };
  }
  if (/--- SCENE \S+ ---/.test(u) || /You have read the whole screenplay/.test(u)) return { scenes: [], evidence: [] };
  return {};
}, log);

const els = script();
const sc = AI.coverageScenes(els);

/* genre */
{
  const r = await AI.genreComps({ scenes: sc, title: 'T', audience: 'Urban Tamil youth' });
  eq(r.genre, 'Drama', 'genre read');
  eq(r.subgenres.length, 3, 'subgenres capped at three');
  eq(r.comps.map((c) => c.title), ['Alpha', 'Beta', 'C', 'D', 'E'], 'comparables deduped (case-insensitively) and capped at five');
  eq(r.comps[1].year, '', 'a year that is not four digits is dropped');
  eq(r.evidence.length, 1, 'the invented quote is stripped');
  eq(r.removed, 1, '…and counted');
  eq(r.budgetTier, 'low', 'budget tier kept when valid');
  let none = null;
  try { await AI.genreComps({ scenes: [] }); } catch (e) { none = e; }
  ok(none && none.kind === 'noscenes', 'no scenes, no request');
}

/* scene notes */
{
  const r = await AI.sceneNotesBatch({ scenes: sc, part: 1, parts: 1 });
  eq(r.notes.map((n) => n.scene), ['1', '2'], 'unknown scene 99 and the duplicate of scene 1 are ignored');
  eq(r.notes[0].cut, true, 'a cut flag with a verified quote stands');
  eq(r.notes[1].cut, false, 'a cut flag with an invented quote is refused');
  eq(r.notes[1].quote, '', '…and the quote is stripped');
  eq(r.removed, 1, '…and counted');
  eq(r.notes[1].note, 'Leaving.', 'the note itself is kept');
}

/* breakdown tags */
{
  const cats = [{ id: 'props', label: 'Props' }, { id: 'sfx', label: 'SFX' }, { id: 'extras', label: 'Background' }];
  const r = await AI.breakdownTagsBatch({ scenes: sc, part: 1, parts: 1, categories: cats });
  eq(r.elements.map((e) => e.scene + ':' + e.category + ':' + e.name), ['1:props:coins', '2:extras:crowd at the bus stand', '2:props:red bag'],
    'an element with no words behind it, a duplicate and an unknown category are dropped');
  eq(r.removed, 1, 'the element with no quote in the scene is counted');
  let none = null;
  try { await AI.breakdownTagsBatch({ scenes: sc, part: 1, parts: 1, categories: [] }); } catch (e) { none = e; }
  ok(none && none.kind === 'nocontent', 'no categories, no request');
}

/* the run: batching and abort */
{
  const calls = [];
  const run = await AI.runSceneBatches(els, async (scenes, part, parts) => { calls.push([scenes.length, part, parts]); return { n: scenes.length }; }, { batchChars: 60 });
  ok(calls.length >= 2, 'a small batch size makes several batches (' + calls.length + ')');
  eq(run.parts.reduce((n, p) => n + p.n, 0), sc.length, 'every scene is read exactly once');
  const ac = new AbortController(); ac.abort();
  let e2 = null;
  try { await AI.runSceneBatches(els, async () => ({}), { signal: ac.signal }); } catch (e) { e2 = e; }
  ok(e2 && e2.kind === 'aborted', 'an aborted run stops before the first request');
  eq(AI.planSceneRead(els).requests, AI.planCoverage(els).batches.length, 'the plan costs one request per batch (no summary pass)');
}

/* the audience */
{
  log.length = 0;
  await AI.coverageBatch({ scenes: sc, part: 1, parts: 1, audience: 'Telugu festival audiences' });
  ok(/Telugu festival audiences/.test(log[0].user), 'a named audience reaches the coverage read');
  ok(!/Tamil theatrical/.test(log[0].user), '…and replaces the default wording');
  log.length = 0;
  await AI.coverageBatch({ scenes: sc, part: 1, parts: 1 });
  ok(/Tamil theatrical or OTT|Tamil theatrical and OTT/.test(log[0].user), 'with none set, the long-standing default is unchanged');
}

restore();
console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
