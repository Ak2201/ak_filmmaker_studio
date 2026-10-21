/* ============================================================
   test:audience — the Audience test's pure model
   (src/lib/audience-model.js, docs/AUDIENCE-TEST-PLAN.md phase 1)
   ------------------------------------------------------------
   No model is called and no browser is needed. Asserted:
     · the presets: viewing habits only, unique ids, the plan's ten;
     · the default panel per format, the genre filled in, the
       project's own audience given a seat, the size clamped;
     · a custom viewer and a checked panel;
     · the cost: one request per part plus one, on the Dragon sample
       through the real planCoverage();
     · the part prompt names every viewer and scene and carries state;
     · every check in plan §5: unknown scenes and viewers dropped and
       counted, fabricated quotes stripped (through the real
       quoteChecker), scores clamped, missing scores null, nothing
       scored after a walkout;
     · merging, spread, the "barely disagreed" rule, slumps, splits;
     · the verdict reply follows the curve, not the other way round;
     · the Desk rows, the note and the document prose;
     · nothing is written to storage;
     · phase 2: the runner against the faked providers and the store
       (see the section header further down);
     · phase 4: quick mode (the story, per beat, one request) and
       asking one viewer, pure and against the fakes, and the three
       Desk tasks themselves (section header further down).

       node scripts/test-audience.mjs   (or: npm run test:audience)
   ============================================================ */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

/* store.js becomes the three raw accessors over an in-memory map (the
   test:ai-coverage seam): the model needs none of it, but ai.js —
   imported for the real planCoverage() and quoteChecker() — does. */
const mem = new Map();
globalThis.__fakeMem = mem;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        /* A default whose every method answers null: ai-tasks.js
           (phase 4's Desk-task checks) calls Store.subscribe and
           Store.currentProject at load; nothing else reads it. */
        'export default new Proxy({}, { get: (t, k) => (k === "then" ? undefined : () => null) });'), shortCircuit: true };
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

const M = await import('../src/lib/audience-model.js');
const AI = await import('../src/lib/ai.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const before = mem.size;
let taskReg = null;            // the Desk tasks, registered once (phase 4)

/* ---- the presets ------------------------------------------------ */
const ids = M.PERSONAS.map((p) => p.id);
eq(ids.length, 10, 'ten presets');
eq(new Set(ids).size, ids.length, 'preset ids are unique');
ok(M.PERSONAS.every((p) => p.label && p.who && p.cares), 'every preset has a label, who and cares');
const banned = /\b(hindu|muslim|christian|caste|brahmin|dalit|religio|ethnic|bjp|dmk|aiadmk|congress|left-wing|right-wing)/i;
ok(M.PERSONAS.every((p) => !banned.test(p.who + ' ' + p.cares)), 'no preset is defined by religion, caste, ethnicity or politics');
ok(M.personaById('festival').label === 'Festival programmer' && M.personaById('nope') === null, 'personaById');

/* ---- the default panel ----------------------------------------- */
const feat = M.defaultPanel({ format: 'feature', genre: 'thriller' });
eq(feat.length, 8, 'feature panel is 8 by default');
eq(feat.map((p) => p.id).slice(0, 3), ['family-theatre', 'mass-fan', 'ott-binger'], 'feature order leads with theatre audiences');
ok(feat.find((p) => p.id === 'genre-fan').who.includes('thriller films'), 'genre filled into the genre fan');
ok(!feat.some((p) => p.who.includes('{genre}')), 'no unfilled {genre}');
const noGenre = M.defaultPanel({});
ok(noGenre.find((p) => p.id === 'genre-fan').who.includes('this kind of films'), 'no genre → a neutral phrase');
const short = M.defaultPanel({ format: 'short' });
eq(short.map((p) => p.id).slice(0, 2), ['festival', 'critic'], 'a short film leads with the jury');
const own = M.defaultPanel({ audience: 'college students in Coimbatore' });
eq(own.length, 8, 'stated audience takes a seat, size unchanged');
eq(own[7].id, 'project-audience', 'stated audience is the last seat');
ok(own[7].who.includes('college students in Coimbatore'), 'stated audience in the writer\'s words');
eq(M.defaultPanel({ size: 40 }).length, Math.min(M.PANEL_MAX, M.PERSONAS.length), 'size clamped to the max, and to the presets that exist');
eq(M.defaultPanel({ size: 1 }).length, M.PANEL_MIN, 'size clamped to the min');

/* ---- custom viewers and a checked panel ------------------------ */
const c1 = M.customPersona('  a 55-year-old who only watches Rajinikanth films and nothing else ever  ', 1);
eq(c1.id, 'custom-1', 'custom id');
ok(c1.custom && c1.who.startsWith('a 55-year-old'), 'custom who trimmed, sent as written');
ok(c1.label.length <= 40 && c1.label.endsWith('…'), 'long custom label shortened');
eq(M.customPersona('   '), null, 'blank custom → null');
const np = M.normalisePanel([feat[0], feat[0], { id: 'x' }, null, feat[1], c1]);
eq(np.panel.map((p) => p.id), ['family-theatre', 'mass-fan', 'custom-1'], 'normalise drops duplicates and shapeless entries');
eq(np.problem, '', 'three viewers is enough');
ok(/at least 3/.test(M.normalisePanel([feat[0]]).problem), 'too small a panel says so');
eq(M.normalisePanel(Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, who: 'w' }))).panel.length, M.PANEL_MAX, 'panel capped');

/* ---- a fixture -------------------------------------------------- */
const S = (n, heading, text) => ({ n: String(n), heading, text });
const scenes = [
  S(1, 'INT. HOUSE - DAY', 'Meena pours tea. MEENA: The bus is late again.'),
  S(2, 'EXT. STREET - DAY', 'Ravi runs. RAVI: Nobody follows me.'),
  S(3, 'INT. SHOP - NIGHT', 'The shutter falls. A long silence.'),
  S(4, 'EXT. TERRACE - NIGHT', 'Meena watches the city. MEENA: I will go.'),
  S(5, 'INT. BUS - DAY', 'The bus leaves. Ravi waves.')
];
const isQuote = (() => { const q = AI.quoteChecker(scenes.map((s) => s.text)); return (quote) => q(quote); })();
const panel = M.defaultPanel({ size: 3 });        // family-theatre, mass-fan, ott-binger
const [A, B, C] = panel.map((p) => p.id);

/* ---- the prompt ------------------------------------------------- */
const prompt = M.buildPartPrompt({ panel, scenes: scenes.slice(0, 3), part: 1, parts: 2, title: 'Dragon', states: { [B]: 'bored, waiting for the hero' }, context: 'CONTEXT BLOCK', refine: 'REFINE BLOCK' });
ok(panel.every((p) => prompt.includes(p.id + ' | ' + p.label)), 'prompt names every viewer');
ok(['1', '2', '3'].every((n) => prompt.includes('=== SCENE ' + n + ' —')) && !prompt.includes('=== SCENE 4'), 'prompt holds exactly this part\'s scenes');
ok(prompt.includes('so far: bored, waiting for the hero'), 'prompt carries a viewer\'s state');
ok(prompt.startsWith('CONTEXT BLOCK') && prompt.trim().endsWith('REFINE BLOCK'), 'context first, refine last');
ok(prompt.includes('part 1 of 2') && prompt.includes('"Dragon"'), 'part and title');
const p2 = M.buildPartPrompt({ panel, scenes: scenes.slice(3), part: 2, parts: 2, walkedOut: [C] });
ok(!p2.includes(C + ' | ') && p2.includes('Already walked out, not scored again: ' + C), 'a walked-out viewer is not on the next part\'s panel');
ok(M.AUDIENCE_SYSTEM.includes('do not make them agree'), 'system prompt asks the viewers not to agree for its own sake');
const schema = M.partSchema();
eq(schema.properties.viewers.items.required, ['viewer', 'scores', 'moments', 'state', 'walkedOutAt'], 'part schema shape');

/* ---- reading a part (plan §5) ----------------------------------- */
const part1 = M.readPart({
  viewers: [
    { viewer: A, scores: [{ scene: '1', score: 2 }, { scene: '2', score: 7 }, { scene: '3', score: 'x' }, { scene: '99', score: 1 }],
      moments: [{ scene: '1', kind: 'hooked', quote: 'The bus is late again.', note: 'I know this house.' },
                { scene: '2', kind: 'lost', quote: 'Everybody follows me.', note: 'Who is he?' },
                { scene: '42', kind: 'bored', quote: '', note: 'nope' }],
      state: 'warm, curious', walkedOutAt: '' },
    { viewer: B, scores: [{ scene: '1', score: -2 }, { scene: '2', score: -1 }, { scene: '3', score: -2 }],
      moments: [], state: 'restless', walkedOutAt: '' },
    { viewer: C, scores: [{ scene: '1', score: 0 }, { scene: '2', score: -2 }, { scene: '3', score: -1 }],
      moments: [{ scene: '2', kind: 'bored', quote: '', note: 'Skipping.' }], state: 'gone', walkedOutAt: '2' },
    { viewer: A, scores: [], moments: [], state: 'duplicate', walkedOutAt: '' },
    { viewer: 'stranger', scores: [{ scene: '1', score: 1 }], moments: [], state: '', walkedOutAt: '' }
  ]
}, { panel, sceneNs: ['1', '2', '3'], isQuote });
eq(part1.viewers[A].scores, { 1: 2, 2: 2 }, 'scores clamped to +2; a non-number and an unknown scene are not scores');
eq(part1.viewers[A].moments.map((m) => m.quote), ['The bus is late again.', ''], 'a real quote kept, a fabricated one stripped');
eq(part1.viewers[A].moments.length, 2, 'a moment on an unknown scene is dropped');
eq(part1.viewers[C].scores, { 1: 0, 2: -2 }, 'nothing scored after a walkout');
ok(part1.viewers[C].moments.some((m) => m.kind === 'walkout' && m.scene === '2'), 'a walkout always has a walkout moment');
eq(part1.dropped, { scenes: 2, quotes: 1, viewers: 2, scores: 2 }, 'every drop is counted');
const badOut = M.readPart({ viewers: [{ viewer: A, scores: [{ scene: '1', score: 1 }], moments: [], state: '', walkedOutAt: '77' }] }, { panel, sceneNs: ['1'], isQuote });
eq(badOut.viewers[A].walkedOutAt, '', 'a walkout at an unknown scene is ignored');
eq(M.readPart(null, { panel, sceneNs: ['1'] }).viewers, {}, 'a null reply reads as nothing, without throwing');

const part2 = M.readPart({
  viewers: [
    { viewer: A, scores: [{ scene: '4', score: 2 }, { scene: '5', score: 1 }], moments: [{ scene: '4', kind: 'moved', quote: 'I will go.', note: 'There it is.' }], state: 'won over', walkedOutAt: '' },
    { viewer: B, scores: [{ scene: '4', score: -1 }, { scene: '5', score: -2 }], moments: [], state: 'never got the hero', walkedOutAt: '' },
    { viewer: C, scores: [{ scene: '4', score: 2 }], moments: [], state: 'came back?', walkedOutAt: '' }
  ]
}, { panel, sceneNs: ['4', '5'], isQuote, walkedOut: [C] });
ok(!part2.viewers[C], 'a viewer who walked out in an earlier part is not read again');

/* ---- merging ---------------------------------------------------- */
const run = M.mergeParts([part1, part2], { panel, scenes });
eq(run.order, ['1', '2', '3', '4', '5'], 'run order is the script\'s');
eq(run.curves[A], [2, 2, null, 2, 1], 'a missing score is null, never 0');
eq(run.curves[C], [0, -2, null, null, null], 'a walked-out curve stops');
eq(run.walkouts, { [C]: '2' }, 'walkouts recorded');
eq(run.mean, [0, -0.33, -2, 0.5, -0.5], 'mean over the viewers who scored');
eq(run.states[B], 'never got the hero', 'the last state wins');
eq(run.dropped.quotes, 1, 'drops are summed across parts');

/* ---- spread, slumps, splits ------------------------------------ */
eq(M.spread({ a: [1, 1, 1], b: [1, 1, 1] }), 0, 'identical curves → spread 0');
eq(M.spread({ a: [2, 2], b: [-2, -2] }), 4, 'opposite curves → spread 4');
eq(M.spread({ a: [1, null], b: [null, 1] }), null, 'no common scene → null');
eq(M.spread({ a: [1] }), null, 'one viewer → null');
const slump = M.slumps({ order: ['1', '2', '3', '4', '5'], curves: { a: [1, -1, -1, -1, 1], b: [1, -2, -1, -2, 1], c: [1, 1, -1, -1, 1] } }, { panel: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
eq(slump, [{ from: '2', to: '4', viewers: 3, of: 3 }], 'a three-scene run with most of the panel below zero is a slump');
eq(M.slumps({ order: ['1', '2'], curves: { a: [-1, -1], b: [-1, -1] } }, { panel: [{ id: 'a' }, { id: 'b' }] }), [], 'two scenes is not a slump');
eq(M.splits(run, { panel }).map((x) => x.scene), ['1', '2', '4', '5'], 'scenes with a range of 3+ are splits');
eq(M.splits({ order: ['1'], curves: { a: [1], b: [-1] } }, { panel: [{ id: 'a' }, { id: 'b' }] }), [], 'a range of 2 is not a split');

/* ---- the verdicts ----------------------------------------------- */
const synthPrompt = M.buildSynthPrompt({ panel, run, scenes, title: 'Dragon' });
ok(synthPrompt.includes('1 | INT. HOUSE - DAY | 2 | -2 | 0'), 'verdict prompt carries the score table');
ok(synthPrompt.includes(C + ': gone Walked out at scene 2.'), 'verdict prompt carries walkouts');
ok(!synthPrompt.includes('pours tea'), 'verdict prompt does not resend the pages');
const synth = M.readSynth({
  verdicts: [
    { viewer: A, verdict: 'walkout', hooked: '1', lost: '88', voice: 'It found me at the end.' },
    { viewer: B, verdict: 'recommend', hooked: '', lost: '3', voice: 'Where was the hero?' },
    { viewer: C, verdict: 'mixed', hooked: '', lost: '2', voice: 'Too slow for me.' },
    { viewer: 'stranger', verdict: 'recommend', hooked: '', lost: '', voice: '' }
  ],
  panel: [{ scene: '2', note: 'Scene 2 lost two of three.' }, { scene: '404', note: 'phantom' }, { scene: '', note: '' }]
}, { panel, run });
eq(synth.verdicts[A].verdict, 'mixed', 'a "walkout" verdict without a walkout becomes mixed');
eq(synth.verdicts[C].verdict, 'walkout', 'a viewer who walked out gets the walkout verdict');
eq(synth.verdicts[B].verdict, 'recommend', 'a consistent verdict is kept');
eq(synth.verdicts[A].lost, '', 'a verdict naming an unknown scene loses the scene');
eq(synth.notes, [{ scene: '2', note: 'Scene 2 lost two of three.' }, { scene: '', note: 'phantom' }], 'panel notes checked, empty dropped');
eq(synth.dropped, { scenes: 2, viewers: 1 }, 'verdict drops counted');

/* ---- the result, the rows, the note, the prose ----------------- */
const res = M.buildResult({ panel, run, synth, model: 'test-model', sig: '5-abc', at: '2026-10-21T10:00:00Z' });
ok(res.spread > M.AGREE_SPREAD && !res.agreed, 'this panel disagreed');
eq(res.dropped, { scenes: 4, quotes: 1, viewers: 4, scores: 2, verdicts: 0 }, 'result sums the run\'s and the verdicts\' drops (a walked-out viewer replying again is a drop)');
const items = M.resultItems(res);
eq(items.filter((it) => it.id.startsWith('v:')).length, 3, 'one row per viewer');
ok(items.find((it) => it.id === 'v:' + C).text.includes('Walked out'), 'walkout row says so');
ok(items.find((it) => it.id === 'v:' + A).detail.includes('Hooked at Sc 1: I know this house.'), 'a viewer row carries their moment');
ok(items.some((it) => it.id.startsWith('split:')), 'split rows listed');
eq(new Set(items.map((it) => it.id)).size, items.length, 'row ids are unique');
const note = M.resultNote(res);
ok(note.startsWith(M.SIMULATED_LINE), 'the note leads with "simulated"');
ok(note.includes('1 quote was removed') && note.includes('4 reactions were dropped') && note.includes('test-model'), 'the note counts what was removed');
ok(!note.includes('barely disagreed'), 'no agreement line on a panel that disagreed');
ok(note.includes('4 reaction lines were dropped because they named a viewer who is not on the panel'), 'the note counts dropped viewer lines');
ok(note.includes('2 scores were dropped'), 'the note counts dropped scores');

/* A verdict left out, or not one of VERDICTS, stays missing: never "Mixed". */
const synthGap = M.readSynth({ verdicts: [{ viewer: B, verdict: 'loved it', hooked: '', lost: '', voice: 'Odd one.' }], panel: [] }, { panel, run });
eq(synthGap.verdicts[B].verdict, '', 'a verdict that is not allowed stays empty, not "mixed"');
const gapRes = M.buildResult({ panel, run, synth: synthGap, model: 'm', sig: 's', at: '2026-10-21T10:00:00Z' });
eq(gapRes.dropped.verdicts, 2, 'viewers with no usable verdict (one invalid, one left out) are counted; a walkout stands in');
const gapItems = M.resultItems(gapRes);
ok(gapItems.find((it) => it.id === 'v:' + B).text.includes(M.NO_VERDICT) && gapItems.find((it) => it.id === 'v:' + A).text.includes(M.NO_VERDICT), 'a missing verdict reads "No verdict in the reply"');
ok(!gapItems.some((it) => it.text.includes('Mixed')), 'no invented "Mixed" anywhere in the rows');
ok(gapItems.find((it) => it.id === 'v:' + C).text.includes('Walked out'), 'a walkout still stands in for a missing verdict');
ok(M.resultNote(gapRes).includes('2 viewers have no verdict'), 'the note says how many viewers have no verdict');
ok(M.resultText(gapRes).includes(M.NO_VERDICT) && !M.resultText(gapRes).includes('— Mixed'), 'the kept prose says the verdict is missing');
const gapAsk = M.buildAskPrompt({ res: gapRes, viewer: A, question: 'Why?' });
ok(gapAsk && !gapAsk.includes('YOUR VERDICT'), 'the ask prompt gives no verdict line to a viewer who has none');
ok(M.buildAskPrompt({ res: gapRes, viewer: B, question: 'Why?' }).includes('WHAT YOU SAID AFTERWARDS: “Odd one.”'), 'their own words still go in');

const flat = { order: ['1', '2'], curves: { [A]: [1, 1], [B]: [1, 1], [C]: [1, 1] }, mean: [1, 1], moments: [], walkouts: {}, states: {}, dropped: { scenes: 0, quotes: 0, viewers: 0, scores: 0 } };
const flatRes = M.buildResult({ panel, run: flat, synth: { verdicts: {}, notes: [], dropped: { scenes: 0, viewers: 0 } } });
ok(flatRes.agreed && M.resultNote(flatRes).includes('barely disagreed'), 'a panel that agreed is told it was one reader\'s view');

const text = M.resultText(res);
ok(text.startsWith('AUDIENCE TEST — 3 VIEWERS') && text.includes(M.SIMULATED_LINE), 'prose header and simulated line');
ok(text.includes('“The bus is late again.” — I know this house.'), 'prose keeps the verified quote');
ok(!text.includes('Everybody follows me'), 'prose never carries a stripped quote');
ok(text.includes('1:0  2:-0.33  3:-2  4:0.5  5:-0.5'), 'prose carries the engagement line');
const kept = M.resultText(res, new Set(['v:' + A]));
ok(kept.includes(panel[0].label.toUpperCase()) && !kept.includes(panel[1].label.toUpperCase()) && !kept.includes('THE PANEL'), 'prose keeps only the ticked rows');

/* ---- the cost, on the Dragon sample ----------------------------- */
const dragon = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8'));
const plan = AI.planCoverage(dragon.elements);
const cost = M.planAudience(plan, 8);
eq(cost.parts, plan.batches.length, 'parts are coverage\'s batches');
eq(cost.requests, plan.requests, 'requests: one per part plus one — the same as coverage');
ok(cost.requests >= 2, 'the Dragon sample takes more than one part (' + cost.parts + ')');
ok(cost.tokensIn > plan.tokensIn, 'the panel costs more tokens in than coverage');
ok(M.planAudience(plan, 12).tokensOut > cost.tokensOut, 'a bigger panel costs more out, not more requests');
eq(M.planAudience(plan, 12).requests, cost.requests, 'panel size does not change the request count');
eq(M.planAudience({ scenes: [], batches: [] }, 8).requests, 0, 'an empty script costs nothing');
const mt = M.partMaxTokens(8, 25);
ok(mt >= 4000 && mt <= 16000, 'part output budget within bounds (' + mt + ')');

/* ---- nothing written -------------------------------------------- */
eq(mem.size, before, 'nothing written to storage');

/* ================================================================
   PHASE 2 — the runner (ai.js runAudienceTest) and the store
   (audience-store.js), against scripts/fake-ai.mjs for BOTH
   providers: Anthropic's LF frames and Gemini's CRLF frames with a
   `thought` part first. Asserted:
     · a long script is screened in more than one part, then one
       verdict request; the key is in a header, never in the URL;
     · states and walkouts are carried from part to part, and a
       viewer who walked out is not on a later part's panel;
     · Stop leaves a checkpoint; Resume does not re-send a finished
       part; a checkpoint from another draft or another panel is
       ignored;
     · a fabricated quote is stripped and counted, a real one kept;
     · an unusable reply fails with a sentence, never an empty list;
     · nothing in the runner writes storage (and the new code never
       names a storage call);
     · the store: checkpoint, partialFor, finished document, latest,
       and an undo that is byte-exact.
   ================================================================ */
const { installFakeFetch } = await import('./fake-ai.mjs');
const { audienceStore } = await import('../src/lib/audience-store.js');

const FAKE_LINE = 'Naan oru dragon da, theriyuma unakku';
const blocksOf = (u) => {
  const out = [];
  const re = /=== SCENE (\S+) — [^\n]*===\n([\s\S]*?)(?=\n\n=== SCENE |\n\nFor every viewer)/g;
  for (const m of u.matchAll(re)) out.push({ n: m[1], text: m[2] });
  return out;
};
const viewersIn = (u, head) => {
  const at = u.indexOf(head);
  const block = u.slice(at, u.indexOf('\n\n', at + head.length + 1));
  return [...block.matchAll(/^- (\S+) \| /gm)].map((m) => m[1]);
};
const realQuote = (text) => {
  const line = text.split('\n').map((l) => l.trim()).find((l, i) => i > 0 && l.length >= 8) || text.split('\n')[0].trim();
  return line.slice(0, 30).trim();
};

const flog = [];
let abortOn = Infinity;        // abort once more than N part requests have gone out
let ctl = null;
let partMode = 'good';         // 'good' | 'empty'
let synthMode = 'good';        // 'good' | 'empty'
let walkAt = 2;                // which part the third viewer walks out in
const restoreFetch = installFakeFetch(async (req) => {
  const u = req.user;
  if (/test screening of[\s\S]*has finished/.test(u)) {
    if (synthMode === 'empty') return { verdicts: [], panel: [] };
    const ids = viewersIn(u, 'THE PANEL:');
    return {
      verdicts: ids.map((v, i) => ({ viewer: v, verdict: i % 2 ? 'mixed' : 'recommend', hooked: '1', lost: '', voice: 'Viewer ' + v + ' on the film.' })),
      panel: [{ scene: '1', note: 'The opening held most of the room.' }]
    };
  }
  if (/=== SCENE \S+ — /.test(u)) {
    const parts = flog.filter((r) => /=== SCENE \S+ — /.test(r.user)).length;
    if (parts > abortOn && ctl) ctl.abort();
    if (partMode === 'empty') return { viewers: [] };
    const part = Number((u.match(/— part (\d+) of/) || [])[1]);
    const ids = viewersIn(u, 'THE PANEL (');
    const scenes = blocksOf(u);
    return {
      viewers: ids.map((v, vi) => {
        const out = vi === 2 && part === walkAt ? scenes[0].n : '';
        return {
          viewer: v,
          scores: scenes.map((s, si) => ({ scene: s.n, score: ((vi * 3 + si) % 5) - 2 })),
          moments: vi === 0
            ? [{ scene: scenes[0].n, kind: 'hooked', quote: realQuote(scenes[0].text), note: 'Real words.' },
               { scene: scenes[0].n, kind: 'lost', quote: FAKE_LINE, note: 'Invented words.' }]
            : [],
          state: 'state of ' + v + ' after part ' + part,
          walkedOutAt: out
        };
      })
    };
  }
  throw new Error('fake-ai: unrecognised prompt');
}, flog);

const dragonEls = dragon.elements;
const panel8 = M.defaultPanel({ format: 'feature', genre: 'action' });
const planD = AI.planCoverage(dragonEls);
const partReqs = () => flog.filter((r) => /=== SCENE \S+ — /.test(r.user));
const AKEYS = { anthropic: 'sk-ant-AUDIENCETESTKEY000001', gemini: 'AIzaAUDIENCETESTKEY0000001' };

for (const prov of ['anthropic', 'gemini']) {
  const L = '[' + prov + '] ';
  AI.setProvider(prov);
  AI.setKey(AKEYS[prov]);
  const sizeBefore = mem.size;
  flog.length = 0; abortOn = Infinity; ctl = null; partMode = 'good'; synthMode = 'good';

  /* ---- a whole run -------------------------------------------- */
  const cps = [];
  const res = await AI.runAudienceTest({ elements: dragonEls, panel: panel8, title: 'Dragon', context: [{ step: 'Idea', answers: [{ label: 'Logline', value: 'A dragon story.' }] }] },
    { onCheckpoint: (cp) => cps.push(cp) });
  ok(planD.batches.length >= 2, L + 'the Dragon sample is more than one part (' + planD.batches.length + ')');
  eq(flog.length, planD.batches.length + 1, L + 'one request per part, then one for the verdicts');
  eq(res.requests, flog.length, L + 'the run reports the requests it made');
  eq(res.scenes, planD.scenes.length, L + 'the run reports the scenes it read');
  const hdr = prov === 'anthropic' ? 'x-api-key' : 'x-goog-api-key';
  ok(flog.every((r) => r.headers[hdr] === AKEYS[prov]), L + 'the key is in the ' + hdr + ' header');
  ok(flog.every((r) => !r.url.includes(AKEYS[prov]) && !/[?&]key=/.test(r.url)), L + 'the key is never in a URL');
  if (prov === 'gemini') ok(flog.every((r) => /alt=sse/.test(r.url)), L + 'Gemini streams with alt=sse (CRLF frames and a thought part parsed)');
  ok(flog.every((r) => r.system.startsWith(M.AUDIENCE_SYSTEM.slice(0, 60))), L + 'every request carries the audience system prompt');
  ok(partReqs()[0].user.startsWith('--- THE BLUEPRINT ---'), L + 'the blueprint context is printed first, as every job prints it');
  eq(cps.length, planD.batches.length, L + 'a checkpoint after every part');
  eq(cps[cps.length - 1].parts.length, planD.batches.length, L + 'the last checkpoint holds every part');
  ok(cps.every((cp) => cp.sig === AI.scriptSignature(dragonEls) && cp.panelSig === AI.panelSignature(panel8)), L + 'checkpoints carry the draft and the panel they belong to');
  const third = panel8[2].id;
  ok(partReqs()[1].user.includes('so far: state of ' + panel8[0].id + ' after part 1'), L + 'a viewer\'s state is carried into the next part');
  if (planD.batches.length >= 3) {
    const p3 = partReqs()[2].user;
    ok(p3.includes('Already walked out, not scored again: ' + third) && !p3.includes('- ' + third + ' | '), L + 'a viewer who walked out is not on a later part\'s panel');
  }
  ok(res.walkouts[third], L + 'the walkout is recorded (' + res.walkouts[third] + ')');
  eq(res.verdicts[third].verdict, 'walkout', L + 'the walked-out viewer\'s verdict follows the curve');
  eq(res.dropped.quotes, planD.batches.length, L + 'one fabricated quote per part stripped and counted');
  const kept = res.moments.filter((m) => m.quote);
  ok(kept.length === planD.batches.length && kept.every((m) => AI.quoteChecker(AI.coverageScenes(dragonEls).find((s) => s.n === m.scene).text)(m.quote)),
    L + 'every surviving quote is word for word in the scene it names (' + kept.length + ')');
  ok(!res.moments.some((m) => m.quote === FAKE_LINE), L + 'the fabricated quote is nowhere in the result');
  ok(Array.isArray(res.headings) && res.headings.length === res.order.length
    && res.headings.every((x, i) => x.n === res.order[i] && x.heading === AI.coverageScenes(dragonEls)[i].heading),
  L + 'the result keeps each scene\'s heading as the test read it, beside order');
  ok(M.resultNote(res).includes(planD.batches.length + ' quotes were removed'), L + 'the note says how many quotes were removed');
  eq(res.order.length, planD.scenes.length, L + 'a curve point per scene');
  eq(res.panel.length, 8, L + 'the panel is in the result');
  eq(mem.size, sizeBefore, L + 'runAudienceTest writes no storage');

  /* ---- Stop, then Resume ---------------------------------------- */
  flog.length = 0;
  let saved = null;
  ctl = new AbortController();
  abortOn = 1;                    // abort while the second part is in flight
  let threw = null;
  try {
    await AI.runAudienceTest({ elements: dragonEls, panel: panel8 }, { signal: ctl.signal, onCheckpoint: (cp) => { saved = cp; } });
  } catch (e) { threw = e; }
  ok(threw && threw.kind === 'aborted' && /Resume/.test(threw.message), L + 'Stop throws aborted, in a sentence (' + (threw && threw.kind) + ')');
  ok(saved && saved.parts.length >= 1 && saved.parts.length < planD.batches.length, L + 'Stop leaves a checkpoint with the finished parts (' + (saved && saved.parts.length) + ')');
  abortOn = Infinity; ctl = null;
  flog.length = 0;
  const resumed = await AI.runAudienceTest({ elements: dragonEls, panel: panel8, prior: saved });
  eq(flog.length, planD.batches.length - saved.parts.length + 1, L + 'Resume sends only the unread parts and the verdicts');
  const firstBatch = planD.batches.slice(0, saved.parts.length).flat().map((i) => planD.scenes[i].n);
  ok(partReqs().every((r) => firstBatch.every((n) => !r.user.includes('=== SCENE ' + n + ' — '))), L + 'no finished part is sent again');
  eq(resumed.requests, flog.length, L + 'the resumed run counts only what it sent');
  eq(JSON.stringify(resumed.curves), JSON.stringify(res.curves), L + 'the resumed curves equal an uninterrupted run');

  /* ---- a checkpoint that does not fit is ignored --------------- */
  flog.length = 0;
  const changed = dragonEls.map((e) => ({ ...e }));
  changed[1].text = String(changed[1].text) + ' Rain.';
  await AI.runAudienceTest({ elements: changed, panel: panel8, prior: saved });
  eq(flog.length, planD.batches.length + 1, L + 'a checkpoint from another draft is ignored');
  flog.length = 0;
  const other = M.defaultPanel({ format: 'short' });
  await AI.runAudienceTest({ elements: dragonEls, panel: other, prior: saved });
  eq(flog.length, planD.batches.length + 1, L + 'a checkpoint from another panel is ignored');

  /* ---- unusable replies, and refusals before any request -------- */
  flog.length = 0; partMode = 'empty';
  let bad = null; const cpsBad = [];
  try { await AI.runAudienceTest({ elements: dragonEls, panel: panel8 }, { onCheckpoint: (cp) => cpsBad.push(cp) }); } catch (e) { bad = e; }
  ok(bad && bad.kind === 'malformed' && /no reactions/.test(bad.message), L + 'a part with no usable reactions fails with a sentence');
  eq(cpsBad.length, 0, L + '…and is not checkpointed as read');
  partMode = 'good'; synthMode = 'empty';
  let badS = null;
  try { await AI.runAudienceTest({ elements: dragonEls, panel: panel8, prior: saved }); } catch (e) { badS = e; }
  ok(badS && badS.kind === 'malformed' && /no verdicts/.test(badS.message), L + 'a verdict reply with no verdicts fails with a sentence');
  synthMode = 'good';
  flog.length = 0;
  let small = null;
  try { await AI.runAudienceTest({ elements: dragonEls, panel: panel8.slice(0, 2) }); } catch (e) { small = e; }
  ok(small && small.kind === 'nopanel' && /at least 3/.test(small.message) && flog.length === 0, L + 'too small a panel is refused before any request');
  let empty = null;
  try { await AI.runAudienceTest({ elements: [], panel: panel8 }); } catch (e) { empty = e; }
  ok(empty && empty.kind === 'noscenes' && flog.length === 0, L + 'no scene headings, no request');

  /* ---- the whole panel walks out: later parts are not sent ------ */
  if (planD.batches.length >= 3) {
    flog.length = 0;
    const trio = panel8.slice(0, 3);
    const leaveAll = installFakeFetch(async (req) => {
      if (/has finished/.test(req.user)) return { verdicts: viewersIn(req.user, 'THE PANEL:').map((v) => ({ viewer: v, verdict: 'walkout', hooked: '', lost: '', voice: 'Gone.' })), panel: [] };
      const sc = blocksOf(req.user);
      return { viewers: viewersIn(req.user, 'THE PANEL (').map((v) => ({ viewer: v, scores: [{ scene: sc[0].n, score: -2 }], moments: [], state: 'leaving', walkedOutAt: sc[0].n })) };
    }, flog);
    const gone = await AI.runAudienceTest({ elements: dragonEls, panel: trio });
    leaveAll();
    eq(flog.length, 2, L + 'when the whole panel walks out in part 1, only the verdicts follow');
    eq(Object.keys(gone.walkouts).length, 3, L + 'every walkout recorded');
  }
  eq(mem.size, sizeBefore, L + 'still nothing written to storage');
}
restoreFetch();

/* ---- the new code never names a storage call ------------------- */
{
  /* Code only: the header comments are allowed to say what is NOT done. */
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = readFileSync(new URL('../src/lib/ai.js', import.meta.url), 'utf8');
  const a = src.lastIndexOf('/*', src.indexOf('   THE AUDIENCE TEST\n'));
  const b = src.indexOf('   THE LOGLINE WORKSHOP');
  ok(a > 0 && b > a, 'the runner block is found in ai.js');
  const STORAGE = /localStorage|sessionStorage|rawSet|rawRemove|setItem|removeItem|indexedDB/;
  ok(!STORAGE.test(code(src.slice(a, b))), 'the runner names no storage call');
  ok(!STORAGE.test(code(readFileSync(new URL('../src/lib/audience-model.js', import.meta.url), 'utf8'))), 'audience-model.js names no storage call');
  ok(!STORAGE.test(code(readFileSync(new URL('../src/lib/audience-store.js', import.meta.url), 'utf8'))), 'audience-store.js names no storage call (it writes through the page\'s save)');
  ok(!/from '\.\/ai\.js'/.test(readFileSync(new URL('../src/lib/audience-model.js', import.meta.url), 'utf8')), 'audience-model.js does not import ai.js');
}

/* ---- the store: round trip and an exact undo -------------------- */
{
  const doc = { elements: [], documents: [{ id: 'cov1', kind: 'Notes', title: 'Coverage', body: 'x', coverage: { status: 'done' } }], revisions: [] };
  let saves = 0;
  const st = audienceStore(() => doc, () => { saves++; });
  const sig = AI.scriptSignature(dragonEls);
  const cp1 = { sig, batchCount: 3, panelSig: AI.panelSignature(panel8), panel: panel8, parts: [{ viewers: {}, dropped: {} }], model: 'm' };
  st.storeCheckpoint(cp1);
  eq(doc.documents.length, 2, 'store: a checkpoint adds one partial document');
  ok(st.partialFor(sig) && st.partialFor(sig).audience.status === 'partial', 'store: partialFor finds it by draft');
  eq(st.partialFor('other-sig'), undefined, 'store: …and not for another draft');
  st.storeCheckpoint({ ...cp1, parts: cp1.parts.concat([{ viewers: {}, dropped: {} }]) });
  eq(doc.documents.length, 2, 'store: a second checkpoint updates the same document');
  eq(st.partialFor(sig).audience.checkpoint.parts.length, 2, 'store: …with the newer parts');
  eq(st.latest(), null, 'store: nothing finished yet');
  ok(st.docs()[0].coverage && st.stored().length === 1, 'store: coverage documents are not audience documents');

  const res = await (async () => {
    const r = M.buildResult({ panel, run, synth, model: 'test-model', sig, at: '2026-10-21T10:00:00.000Z' });
    return { ...r, requests: 4, scenes: 5, truncated: false };
  })();
  const before = JSON.stringify(doc.documents);
  const savesBefore = saves;
  const keep = new Set(['v:' + A, 'split:0']);
  const out = st.storeResult(res, keep);
  eq(doc.documents.length, 2, 'store: a finished run replaces this draft\'s partial in place');
  eq(doc.documents[1].id, JSON.parse(before)[1].id, 'store: …keeping its id');
  eq(out.doc.title, 'Audience test — 3 viewers', 'store: titled by the panel size');
  eq(out.doc.kind, 'Notes', 'store: a Notes document');
  eq(out.doc.body, M.resultText(res, keep), 'store: the body is the ticked rows as prose');
  eq(out.doc.audience.status, 'done', 'store: status done');
  eq(out.doc.audience.curves, res.curves, 'store: the curves are kept whole');
  eq(out.doc.audience.kept, ['v:' + A, 'split:0'], 'store: the ticked rows are recorded');
  ok(!('requests' in out.doc.audience) && !('checkpoint' in out.doc.audience), 'store: run-only fields and the checkpoint are not kept');
  ok(saves === savesBefore + 1, 'store: one save through the page');
  eq(st.latest().id, out.doc.id, 'store: latest() is the finished run');
  eq(st.partialFor(sig), undefined, 'store: no partial left for this draft');
  out.undo();
  eq(JSON.stringify(doc.documents), before, 'store: undo restores the partial exactly, checkpoint and all');

  const bare = { documents: [] };
  const st2 = audienceStore(() => bare, () => {});
  const o1 = st2.storeResult({ ...res, at: '2026-10-20T10:00:00.000Z' });
  const o2 = st2.storeResult({ ...res, sig: 'another', at: '2026-10-21T11:00:00.000Z' });
  eq(bare.documents.length, 2, 'store: a run with no partial is a new document');
  eq(st2.latest().id, o2.doc.id, 'store: latest() is the newest run');
  eq(o1.doc.audience.kept, null, 'store: no selection keeps every row');
  eq(o1.doc.body, M.resultText(res), 'store: …and the prose holds them all');
  const snap = JSON.stringify(bare.documents.slice(0, 1));
  o2.undo();
  eq(JSON.stringify(bare.documents), snap, 'store: undo of a new document removes exactly it');
  eq(audienceStore(() => null, () => {}).storeResult(res), null, 'store: no script, nothing stored');
}

/* ================================================================
   PHASE 4 — quick mode and Ask a viewer (plan §1, §4, §10 item 4).
   Asserted, pure:
     · the units: beats with something written, numbered by their
       place in the framework; a synopsis alone read in passages; a
       story with neither is nothing to screen;
     · the quick prompt names every viewer and beat, prints the
       synopsis beside beats and not beside its own passages;
     · readQuick holds every §5 check through readPart: an unknown
       beat dropped and counted, a fabricated quote stripped against
       the story, scores clamped, missing null, nothing after a
       walkout, a stranger in the reply dropped once;
     · the result prints "Beat N", says "your story", and a scene
       run's result carries no `unit` (its prose is unchanged);
     · viewerNamed / viewerRefine; the ask prompt carries ONE
       viewer's record and not the pages; a cited scene the run does
       not have is dropped and counted.
   Against the fakes, both providers: one request for a quick run
   and one for an ask, the key in a header, nothing stored. And the
   Desk tasks themselves (audience-quick, audience-ask, and a refine
   of audience-test addressed to one viewer), loaded through
   ai-tasks.js registerAll().
   ================================================================ */
{
  /* ---- the units ------------------------------------------------ */
  const beats = [
    { label: 'Setup', text: 'Meena runs a tea stall by the bus stand.' },
    { label: 'Inciting', text: '   ' },
    { label: 'Turn', text: 'A stranger leaves a dragon-shaped key on her counter.' }
  ];
  const qu = M.quickUnits({ beats, synopsis: 'ignored when there are beats' });
  eq(qu.unit, 'Beat', 'quick: beats with text are the units');
  eq(qu.units.map((u) => u.n), ['1', '3'], 'quick: an empty beat is skipped and keeps the numbering stable');
  eq(qu.units[1].heading, 'Turn', 'quick: a beat unit is headed by its label');
  const qp = M.quickUnits({ synopsis: 'First paragraph here.\n\nSecond paragraph there.' });
  eq([qp.unit, qp.units.length], ['Passage', 2], 'quick: a synopsis alone is read in passages');
  const longOne = Array.from({ length: 7 }, (_, i) => 'Sentence ' + (i + 1) + ' happens.').join(' ');
  eq(M.quickUnits({ synopsis: longOne }).units.length, 3, 'quick: one long paragraph is cut into runs of three sentences');
  eq(M.quickUnits({ beats: [{ label: 'x', text: '' }], synopsis: '  ' }), { units: [], unit: '' }, 'quick: no synopsis and no beats is nothing to screen');

  /* ---- the prompt ----------------------------------------------- */
  const synopsis = 'Meena runs a tea stall by the bus stand. A stranger leaves a dragon-shaped key on her counter.';
  const qprompt = M.buildQuickPrompt({ panel, units: qu.units, unit: 'Beat', synopsis, title: 'Dragon', context: 'CONTEXT BLOCK', refine: 'REFINE BLOCK' });
  ok(qprompt.startsWith('CONTEXT BLOCK'), 'quick prompt: context first');
  ok(panel.every((p) => qprompt.includes('- ' + p.id + ' | ' + p.label)), 'quick prompt: every viewer named with id and label');
  ok(qprompt.includes('=== BEAT 1 — Setup ===') && qprompt.includes('=== BEAT 3 — Turn ==='), 'quick prompt: every beat, by its number');
  ok(qprompt.includes('THE SYNOPSIS:\n' + synopsis), 'quick prompt: the synopsis beside the beats');
  ok(qprompt.trim().endsWith('REFINE BLOCK'), 'quick prompt: refine last');
  const pprompt = M.buildQuickPrompt({ panel, units: qp.units, unit: 'Passage', synopsis: 'First paragraph here.\n\nSecond paragraph there.' });
  ok(!pprompt.includes('THE SYNOPSIS:\n') && pprompt.includes('=== PASSAGE 2 — Passage 2 ==='), 'quick prompt: passages are not sent twice');
  const qs = M.quickSchema();
  eq(qs.properties.viewers.items.properties.scores.items.required, ['beat', 'score'], 'quick schema: scores cite a beat');
  ok(qs.properties.viewers.items.required.includes('verdict') && qs.required.includes('panel'), 'quick schema: verdicts in the same reply');

  /* ---- the reader ----------------------------------------------- */
  const storyQuote = AI.quoteChecker([synopsis]);
  const qisQuote = (q) => storyQuote(q);
  const qrun = M.readQuick({
    viewers: [
      { viewer: A, scores: [{ beat: '1', score: 5 }, { beat: '3', score: -1 }, { beat: '9', score: 1 }],
        moments: [{ beat: '1', kind: 'hooked', quote: 'runs a tea stall by the bus stand', note: 'Real words.' },
                  { beat: '3', kind: 'lost', quote: 'the dragon breathes fire on the city', note: 'Invented words.' },
                  { beat: '7', kind: 'bored', quote: '', note: 'No such beat.' }],
        walkedOutAt: '', verdict: 'recommend', hooked: '1', lost: '8', voice: 'I liked the tea stall.' },
      { viewer: B, scores: [{ beat: '1', score: -2 }, { beat: '3', score: 2 }], moments: [], walkedOutAt: '1', verdict: 'recommend', hooked: '', lost: '', voice: 'Gone.' },
      { viewer: C, scores: [{ beat: '1', score: 'x' }], moments: [], walkedOutAt: '', verdict: 'walkout', hooked: '', lost: '', voice: 'Meh.' },
      { viewer: 'stranger', scores: [{ beat: '1', score: 2 }], moments: [], walkedOutAt: '', verdict: 'mixed', hooked: '', lost: '', voice: 'Who am I?' }
    ],
    panel: [{ beat: '3', note: 'The key split the room.' }, { beat: '12', note: 'No such beat.' }]
  }, { panel, units: qu.units, isQuote: qisQuote });
  eq(qrun.order, ['1', '3'], 'readQuick: the run is ordered by beat');
  eq(qrun.curves[A], [2, -1], 'readQuick: scores clamped, an unknown beat not scored');
  eq(qrun.curves[B], [-2, null], 'readQuick: nothing scored after a walkout');
  eq(qrun.curves[C], [null, null], 'readQuick: a missing score is null, never 0');
  eq(qrun.walkouts, { [B]: '1' }, 'readQuick: the walkout is recorded');
  eq(qrun.dropped.scenes, 2, 'readQuick: an unknown beat (score and moment) dropped and counted');
  eq(qrun.dropped.quotes, 1, 'readQuick: a fabricated quote stripped and counted');
  eq(qrun.dropped.scores, 1 + 1, 'readQuick: an unreadable score and a score after the walkout counted');
  eq(qrun.dropped.viewers, 1, 'readQuick: a viewer not on the panel dropped');
  ok(qrun.moments.find((m) => m.viewer === A && m.kind === 'hooked').quote === 'runs a tea stall by the bus stand', 'readQuick: a real quote kept');
  ok(!qrun.moments.some((m) => /breathes fire/.test(m.quote)), 'readQuick: the fabricated quote is gone, the moment stays');
  eq(qrun.synth.verdicts[B].verdict, 'walkout', 'readQuick: the verdict follows the curve (walked out)');
  eq(qrun.synth.verdicts[C].verdict, 'mixed', 'readQuick: …and a walkout verdict with no walkout is mixed');
  eq(qrun.synth.verdicts[A].lost, '', 'readQuick: a verdict naming an unknown beat is cleared');
  eq(qrun.synth.dropped.viewers, 0, 'readQuick: the stranger is counted once, not twice');
  eq(qrun.synth.notes.map((n) => n.scene), ['3', ''], 'readQuick: a panel note naming an unknown beat keeps its note, loses the beat');

  const qres = M.buildResult({ panel, run: qrun, synth: qrun.synth, model: 'm', sig: 'story:x', at: '2026-10-21T12:00:00Z', unit: 'Beat' });
  eq(qres.unit, 'Beat', 'quick result: carries its unit');
  ok(!('unit' in res), 'a screenplay result carries no unit (its stored shape is unchanged)');
  const qitems = M.resultItems(qres);
  ok(qitems.some((it) => /Walked out at Beat 1/.test(it.detail || '')), 'quick rows: "Beat N", not "Sc N"');
  ok(qitems.some((it) => it.text === 'Beat 3 — The key split the room.'), 'quick rows: panel notes by beat');
  ok(!qitems.some((it) => /\bSc \d/.test(it.text + ' ' + (it.detail || ''))), 'quick rows: no scene numbers anywhere');
  const qnote = M.resultNote(qres);
  ok(qnote.includes('1 quote was removed because they were not word for word in your story.'), 'quick note: quotes checked against the story');
  ok(qnote.includes('named a beat that is not in the story'), 'quick note: unknown beats named as beats');
  const qtext = M.resultText(qres);
  ok(qtext.startsWith('AUDIENCE TEST OF THE STORY — 3 VIEWERS\n' + M.SIMULATED_LINE), 'quick prose: its own heading and the simulated line');
  ok(qtext.includes('ENGAGEMENT PER BEAT (panel mean') && qtext.includes('  1:0  3:-1'), 'quick prose: engagement per beat');
  ok(M.resultText(res).includes('ENGAGEMENT PER SCENE') && M.resultText(res).startsWith('AUDIENCE TEST — '), 'scene prose unchanged');

  /* ---- naming a viewer ------------------------------------------ */
  eq(M.viewerNamed('Family weekend viewer, why did you stay?', panel).id, A, 'viewerNamed: by label');
  eq(M.viewerNamed('ask mass-fan about Sc 4', panel).id, B, 'viewerNamed: by id');
  eq(M.viewerNamed('what did everyone think?', panel), null, 'viewerNamed: nobody named → null');
  const two = [{ id: 'a1', label: 'Fan' }, { id: 'a2', label: 'Genre fan' }];
  eq(M.viewerNamed('genre fan, why?', two).id, 'a2', 'viewerNamed: the longest name wins');
  ok(M.viewerRefine(['shorter', 'OTT binger: why did you skip?'], panel).includes('addressed to OTT binger (' + C + ')'), 'viewerRefine: the latest instruction names the viewer');
  eq(M.viewerRefine(['OTT binger, why?', 'shorter please'], panel), '', 'viewerRefine: only the latest instruction counts');

  /* ---- the ask prompt and reader -------------------------------- */
  const askP = M.buildAskPrompt({ res, viewer: A, question: 'Why did you love scene 1?', title: 'Dragon', refine: 'REFINE' });
  ok(askP.startsWith('YOU ARE: ' + panel[0].label), 'ask prompt: who the viewer is, first');
  ok(res.order.every((n) => askP.includes('Sc ' + n + ': ')), 'ask prompt: the viewer\'s whole curve');
  ok(askP.includes('THE WRITER ASKS YOU:\nWhy did you love scene 1?') && askP.trim().endsWith('REFINE'), 'ask prompt: the question, then refine');
  ok(!scenes.some((s) => askP.includes(s.text)), 'ask prompt: none of the pages are sent');
  ok(!askP.includes('YOU ARE: ' + panel[1].label), 'ask prompt: one viewer only');
  eq(M.buildAskPrompt({ res, viewer: 'nobody', question: 'q' }), '', 'ask prompt: an unknown viewer builds nothing');
  const ans = M.readAsk({ answer: ' It was the tea. ', cites: [{ scene: '1', note: 'tea' }, { scene: '1', note: 'dup' }, { scene: '99', note: 'no' }] }, { res });
  eq(ans.cites, [{ scene: '1', note: 'tea' }], 'readAsk: known scenes kept once');
  eq(ans.dropped.scenes, 1, 'readAsk: an unknown scene dropped and counted');
  const at = M.askText(ans, { res, viewer: A, question: 'Why?', model: 'm' });
  ok(at.includes('“It was the tea.”') && at.includes('· Sc 1 — tea') && at.includes(M.SIMULATED_LINE) && at.includes('1 reference was dropped'), 'askText: answer, scenes, simulated line, what was dropped');
  ok(M.askText(M.readAsk({ answer: 'x', cites: [{ scene: '3', note: '' }] }, { res: qres }), { res: qres, viewer: A }).includes('· Beat 3'), 'askText: a story run cites beats');
}

/* ---- quick and ask, against the fakes -------------------------- */
{
  const STORY = 'Meena runs a tea stall by the bus stand. A stranger leaves a dragon-shaped key on her counter. She follows him into the old fort.';
  const qBeats = [{ label: 'Setup', text: 'Meena runs a tea stall by the bus stand.' }, { label: 'Turn', text: 'A stranger leaves a dragon-shaped key on her counter.' },
    { label: 'Climax', text: 'She follows him into the old fort.' }];
  const qlog = [];
  const unitsIn = (u) => [...u.matchAll(/^=== (?:BEAT|PASSAGE) (\S+) — /gm)].map((m) => m[1]);
  const undo = installFakeFetch(async (req) => {
    const u = req.user;
    if (/read before the screenplay is written/.test(u)) {
      const ids = viewersIn(u, 'THE PANEL (id | who they are):');
      const ns = unitsIn(u);
      return {
        viewers: ids.map((v, vi) => ({
          viewer: v,
          scores: ns.map((n, i) => ({ beat: n, score: ((vi + i) % 5) - 2 })),
          moments: vi === 0 ? [{ beat: ns[0], kind: 'hooked', quote: 'runs a tea stall', note: 'Real.' }, { beat: ns[0], kind: 'lost', quote: FAKE_LINE, note: 'Invented.' }] : [],
          walkedOutAt: '', verdict: 'mixed', hooked: ns[0], lost: '', voice: v + ' on the story.'
        })),
        panel: [{ beat: ns[1], note: 'The turn worked.' }]
      };
    }
    if (/THE WRITER ASKS YOU:/.test(u)) {
      return { answer: 'Because the key ' + (/REFINE-ASK/.test(u) ? 'still ' : '') + 'surprised me.', cites: [{ scene: '1', note: 'the key' }, { scene: '404', note: 'nope' }] };
    }
    if (/^The test screening of[\s\S]*has finished/.test(u)) {
      return { verdicts: viewersIn(u, 'THE PANEL:').map((v) => ({ viewer: v, verdict: 'mixed', hooked: '', lost: '', voice: 'v' })), panel: [] };
    }
    if (/=== SCENE \S+ — /.test(u)) {
      const sc = blocksOf(u);
      return { viewers: viewersIn(u, 'THE PANEL (').map((v) => ({ viewer: v, scores: sc.map((s) => ({ scene: s.n, score: 1 })), moments: [], state: 's', walkedOutAt: '' })) };
    }
    throw new Error('fake-ai: unrecognised prompt');
  }, qlog);

  for (const prov of ['anthropic', 'gemini']) {
    const L = '[' + prov + '] ';
    AI.setProvider(prov);
    AI.setKey(AKEYS[prov]);
    const sizeBefore = mem.size;
    const hdr = prov === 'anthropic' ? 'x-api-key' : 'x-goog-api-key';

    qlog.length = 0;
    const qr = await AI.runAudienceQuick({ panel: panel8, beats: qBeats, synopsis: STORY, title: 'Dragon', context: [{ step: 'Idea', answers: [{ label: 'Logline', value: 'A key.' }] }] });
    eq(qlog.length, 1, L + 'quick: one request for the whole story');
    ok(qlog[0].headers[hdr] === AKEYS[prov] && !qlog[0].url.includes(AKEYS[prov]), L + 'quick: the key in the header, never the URL');
    ok(qlog[0].system.startsWith(M.QUICK_SYSTEM.slice(0, 60)), L + 'quick: the quick system prompt');
    ok(qlog[0].user.startsWith('--- THE BLUEPRINT ---'), L + 'quick: the blueprint context first');
    eq([qr.unit, qr.order, qr.requests, qr.beats], ['Beat', ['1', '2', '3'], 1, 3], L + 'quick: scored per beat, in one request');
    eq(qr.dropped.quotes, 1, L + 'quick: the fabricated quote stripped and counted');
    ok(qr.moments.some((m) => m.quote === 'runs a tea stall'), L + 'quick: a real quote from the story kept');
    eq(Object.keys(qr.verdicts).length, 8, L + 'quick: every viewer\'s verdict');
    ok(/^story:/.test(qr.sig), L + 'quick: signed as a story run');
    ok(M.resultItems(qr).some((it) => it.text === 'Beat 2 — The turn worked.'), L + 'quick: the Desk rows read by beat');
    let none = null;
    qlog.length = 0;
    try { await AI.runAudienceQuick({ panel: panel8, beats: [], synopsis: '' }); } catch (e) { none = e; }
    ok(none && none.kind === 'nocontent' && none.message === M.QUICK_EMPTY && qlog.length === 0, L + 'quick: no synopsis and no beats fails with a sentence, no request');

    qlog.length = 0;
    const ar = await AI.askAudienceViewer({ result: qr, question: 'Festival programmer, why did the key work?' });
    eq(qlog.length, 1, L + 'ask: one request');
    eq(ar.viewer, 'festival', L + 'ask: the viewer the question names');
    ok(qlog[0].system.startsWith(M.ASK_SYSTEM.slice(0, 40)) && qlog[0].user.startsWith('YOU ARE: Festival programmer'), L + 'ask: in that viewer\'s voice');
    ok(!qlog[0].user.includes(STORY), L + 'ask: the story itself is not sent again');
    eq([ar.cites.length, ar.dropped.scenes], [1, 1], L + 'ask: a beat the run does not have is dropped and counted');
    ok(qlog[0].headers[hdr] === AKEYS[prov], L + 'ask: the key in the header');
    let nobody = null;
    try { await AI.askAudienceViewer({ result: qr, question: 'what did everyone think?' }); } catch (e) { nobody = e; }
    ok(nobody && nobody.kind === 'nocontent' && /Name the viewer/.test(nobody.message), L + 'ask: a question naming nobody fails with a sentence');
    eq(mem.size, sizeBefore, L + 'quick and ask write no storage');
  }

  /* ---- the Desk tasks themselves -------------------------------- */
  const Tasks = await import('../src/lib/ai-tasks.js');
  const StoryM = await import('../src/lib/story.js');
  const reg = new Map();
  await Tasks.registerAll((t) => reg.set(t.id, t));
  taskReg = reg;                 // registerAll registers once; the section below reuses it
  ok(['audience-test', 'audience-quick', 'audience-ask'].every((id) => Tasks.TASK_IDS.includes(id)), 'tasks: the three audience tasks are registered');
  const quick = reg.get('audience-quick');
  const askT = reg.get('audience-ask');
  eq([quick.kind, quick.label, askT.kind], ['read', 'Audience test — story', 'read'], 'tasks: quick and ask are reads');
  ok(typeof quick.apply !== 'function' && typeof askT.apply !== 'function', 'tasks: neither has an apply — they keep nothing');

  const st = StoryM.blankStory();
  st.source = STORY;
  const fw = StoryM.frameworkById(st.framework);
  StoryM.addOutlineStep(st, { beat: StoryM.qualifyBeat(fw.id, fw.beats[0].id), text: 'Meena runs a tea stall by the bus stand.' });
  StoryM.addOutlineStep(st, { beat: StoryM.qualifyBeat(fw.id, fw.beats[2].id), text: 'A stranger leaves a dragon-shaped key on her counter.' });
  const sctx = { getStory: () => st, format: () => 'short' };
  AI.setProvider('anthropic'); AI.setKey(AKEYS.anthropic);
  const sizeBefore = mem.size;
  const qin = quick.input(sctx);
  ok(/simulated viewers/.test(qin) && qin.includes(M.SIMULATED_LINE) && qin.includes('=== BEAT 3 — '), 'task quick: the input shows the panel, the simulated line and the prompt');
  ok(/2 beats with something written/.test(qin), 'task quick: the cost line counts the written beats');
  qlog.length = 0;
  const qout = await quick.run(qin, { ctx: sctx });
  eq(qlog.length, 1, 'task quick: one request');
  ok(qlog[0].user.includes('- festival | ') && viewersIn(qlog[0].user, 'THE PANEL (id | who they are):')[0] === 'festival', 'task quick: a short film\'s panel (the jury first)');
  ok(qout.text.startsWith('AUDIENCE TEST OF THE STORY') && /Nothing was saved/.test(qout.text), 'task quick: the read is the prose, and says nothing was saved');
  ok(qout.text.split(M.SIMULATED_LINE).length === 2, 'task quick: the simulated line once, not twice');
  eq(mem.size, sizeBefore, 'task quick: writes no storage');
  const blank = { getStory: () => StoryM.blankStory() };
  eq(quick.input(blank), M.QUICK_EMPTY, 'task quick: an empty story says so in the input');
  let qe = null;
  qlog.length = 0;
  try { await quick.run('', { ctx: blank }); } catch (e) { qe = e; }
  ok(qe && qe.message === M.QUICK_EMPTY && qlog.length === 0, 'task quick: …and refuses to run, with no request');

  /* audience-ask, on the quick run just made (remembered for this visit) */
  const actx = { viewer: 'critic' };
  const ain = askT.input(actx);
  ok(ain.startsWith('Your question to Film-society regular'), 'task ask: the input is addressed to ctx.viewer');
  qlog.length = 0;
  const aout = await askT.run(ain.replace('\n---', 'What lost you?\n---'), { ctx: actx });
  ok(qlog.length === 1, 'task ask: (sanity) one request so far');
  eq(qlog.length, 1, 'task ask: one request');
  ok(qlog[0].user.startsWith('YOU ARE: Film-society regular') && qlog[0].user.includes('THE WRITER ASKS YOU:\nWhat lost you?'), 'task ask: the typed question, to that viewer');
  ok(aout.text.includes('“Because the key surprised me.”') && aout.text.includes('· Beat 1'), 'task ask: the answer cites beats of the story run');
  qlog.length = 0;
  const typed = ain.replace('\n---', 'What lost you?\n---');
  const aout2 = await askT.run(typed, { ctx: actx, refine: { previous: aout, instructions: ['REFINE-ASK: and now?'] } });
  ok(qlog[0].user.includes('REFINE-ASK') && qlog[0].user.includes('Your previous answer (JSON)') && /still surprised/.test(aout2.text), 'task ask: a chat follow-up rides the same refine block');
  let ae = null;
  try { await askT.run(ain, { ctx: { viewer: 'critic', result: { panel: [], order: [] } } }); } catch (e) { ae = e; }
  ok(ae && /Type the question/.test(ae.message), 'task ask: no question typed fails with a sentence');
  qlog.length = 0;
  await askT.run(ain, { ctx: actx, refine: { previous: aout, instructions: ['Why did you stay to the end?'] } });
  ok(qlog[0].user.includes('THE WRITER ASKS YOU:\nWhy did you stay to the end?'), 'task ask: a follow-up with the box empty is the question');
  eq(mem.size, sizeBefore, 'task ask: writes no storage');

  /* audience-test: a refine addressed to one viewer */
  const doc = { elements: dragonEls.map((e) => ({ ...e })), documents: [] };
  const tctx = { getDoc: () => doc, save: () => {}, panel: panel8, title: 'Dragon' };
  const full = reg.get('audience-test');
  qlog.length = 0;
  const first = await full.run('', { ctx: tctx });
  ok(first.items.length >= 8, 'task test: a full run lists the panel');
  qlog.length = 0;
  await full.run('', { ctx: tctx, refine: { previous: first, instructions: ['Distributor, would you buy this?'] } });
  eq(qlog.length, 1, 'task test: a refine re-sends only the verdict request');
  ok(qlog[0].user.includes('addressed to Distributor (distributor)'), 'task test: a refine naming a viewer asks them in their voice');
  qlog.length = 0;
  await full.run('', { ctx: tctx, refine: { previous: first, instructions: ['shorter'] } });
  ok(!qlog[0].user.includes('addressed to'), 'task test: a refine naming nobody adds nothing');
  const aout3 = await askT.run(askT.input({ viewer: 'distributor', getDoc: () => doc }).replace('\n---', 'Trailer?\n---'), { ctx: { viewer: 'distributor', getDoc: () => doc } });
  ok(/Sc 1 — the key/.test(aout3.text), 'task ask: the newest run this visit is the full test, cited by scene');
  undo();
}

/* ---- Accept keeps what was shown, and what is there now --------
   Three Desk tasks beside the audience ones, tested in this harness
   because it is the one that already loads ai-tasks.js:
     · coverage: Accept on v1 after a refine made v2 keeps v1's report
       (the ids are positional, so v2 filtered by v1's ticks is a mix);
     · dialogue pass: Accept refuses when the speech changed after Run
       (the merge base would be the stale original);
     · gen-batch: Accept hands the page's unsaved copy over (`before`)
       BEFORE the batch commits, and write.js reloads its copy after,
       so the next page save does not write the old script over the
       generated pages. */
{
  const Script = await import('../src/lib/script.js');
  const Gen = await import('../src/lib/scriptgen.js');
  const reg = taskReg;
  let covRound = 0;
  const undo = installFakeFetch(async (req) => {
    const u = req.user;
    if (/--- SCENE \S+ ---/.test(u)) {
      const ns = [...u.matchAll(/--- SCENE (\S+) ---/g)].map((m) => m[1]);
      return { scenes: ns.map((n) => ({ scene: n, summary: 'Scene ' + n + '.' })), evidence: [] };
    }
    if (/Write the coverage/.test(u)) {
      covRound++;
      const V = 'V' + covRound;
      const pt = (note) => ({ scene: '1', quote: 'Meena pours tea at the stall.', note });
      return {
        logline: V + ' logline.',
        premise: { assessment: V + ' premise.', points: [pt(V + ' first premise note'), pt(V + ' second premise note')] },
        structure: { assessment: V, actBreaks: [], points: [] },
        character: { protagonist: 'MEENA', want: 'w', need: 'n', assessment: V, points: [] },
        dialogue: { assessment: V, points: [] },
        pacing: { assessment: V, points: [] },
        marketability: { assessment: V, points: [] },
        verdict: covRound === 1 ? 'pass' : 'recommend',
        verdictWhy: V + ' why.'
      };
    }
    if (/--- THE SPEECH TO WORK ON ---/.test(u)) return { keep: 'It is plain.', options: [{ text: 'The bus is late.', note: 'Shorter.' }] };
    throw new Error('fake-ai: unrecognised prompt');
  });
  AI.setProvider('anthropic'); AI.setKey(AKEYS.anthropic);

  const els = [
    { id: 'k1', type: 'scene', text: 'INT. TEA STALL - DAY' },
    { id: 'k2', type: 'action', text: 'Meena pours tea at the stall.' },
    { id: 'k3', type: 'character', text: 'MEENA' },
    { id: 'k4', type: 'dialogue', text: 'The bus is late again, like every single day.' }
  ];

  /* coverage */
  const cdoc = { elements: els.map((e) => ({ ...e })), documents: [] };
  const cctx = { getDoc: () => cdoc, save: () => {}, title: 'Tea' };
  const cov = reg.get('coverage');
  const v1 = await cov.run('', { ctx: cctx });
  const v2 = await cov.run('', { ctx: cctx, refine: { previous: v1, instructions: ['again'] } });
  ok(/V1 first/.test(v1.items[0].text) && /V2 first/.test(v2.items[0].text), 'coverage: two versions, each its own report');
  cov.apply([v1.items[0]], cctx, v1);
  const kept = cdoc.documents.find((d) => d.coverage && d.coverage.status === 'done');
  const keptPts = kept ? kept.coverage.result.report.premise.points.map((p) => p.note) : null;
  eq(keptPts, ['V1 first premise note'], 'coverage: Accept on v1 keeps v1\'s ticked point, not v2\'s at that index');
  eq(kept && kept.coverage.result.report.verdict, 'pass', 'coverage: Accept on v1 keeps v1\'s verdict');

  /* dialogue pass */
  const ddoc = { elements: els.map((e) => ({ ...e })), documents: [] };
  let dsaves = 0;
  const dctx = { getDoc: () => ddoc, save: () => { dsaves++; }, render: () => {}, elId: 'k4' };
  const dlg = reg.get('dialogue-pass');
  const r1 = await dlg.run(dlg.input(dctx), { ctx: dctx });
  ddoc.elements[3].text = 'The bus is late. I typed this after Run.';
  let de = null;
  try { dlg.apply(r1.proposed, dctx, r1); } catch (e) { de = e; }
  ok(de && /changed since the pass ran/.test(de.message), 'dialogue: Accept after the speech changed refuses with a sentence');
  eq([ddoc.elements[3].text, dsaves], ['The bus is late. I typed this after Run.', 0], 'dialogue: …and writes nothing over the newer text');
  const r2 = await dlg.run(dlg.input(dctx), { ctx: dctx });
  const dundo = dlg.apply(r2.proposed, dctx, r2);
  ok(ddoc.elements[3].text === 'The bus is late.' && typeof dundo === 'function', 'dialogue: an unchanged speech is still written');

  /* gen-batch: the page's copy and the batch both survive */
  Script.saveScript({ elements: [{ id: 'p1', type: 'action', text: 'Stored line.' }], revisions: [], documents: [] });
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, scenes: [{ sceneId: 'g1', slug: 'INT. FORT - NIGHT', synopsis: 'She goes in.' }] });
  let pageDoc = Script.loadScript();
  pageDoc.elements[0].text = 'Stored line, edited and not yet saved.';
  const order = [];
  const gctx = {
    before: () => { order.push('before'); Script.saveScript(pageDoc); },
    after: (job) => { order.push('after'); if (job !== null) pageDoc = Script.loadScript(); }
  };
  const draft = { cursor: 0, batch: [{ sceneId: 'g1', slug: 'INT. FORT - NIGHT' }],
    byScene: { g1: [{ type: 'scene', text: 'INT. FORT - NIGHT' }, { type: 'action', text: 'Dark stone.' }] }, model: 'm' };
  reg.get('gen-batch').apply([{ id: 'g1', draft }], gctx);
  Script.saveScript(pageDoc);                         // the page's next save (a Coverage checkpoint, say)
  const after = Script.loadScript().elements.map((e) => e.text);
  eq(order, ['before', 'after'], 'gen-batch: the page flushes before the commit and reloads after it');
  eq(after, ['Stored line, edited and not yet saved.', 'INT. FORT - NIGHT', 'Dark stone.'], 'gen-batch: the unsaved edit and the batch both survive the page\'s next save');

  /* write.js wires it: the pill flushes and reloads, and the bulk run
     commits between a flush and a reload (no bare runNextBatch). */
  const W = readFileSync(new URL('../src/pages/write.js', import.meta.url), 'utf8');
  const pill = W.slice(W.indexOf("tasks: ['gen-batch']"), W.indexOf("tasks: ['gen-batch']") + 400);
  ok(/before: flushDoc/.test(pill) && /after: \(\) => \{ reloadDoc\(\);/.test(pill), 'write.js: the gen-batch pill passes before: flushDoc and reloads doc in after');
  ok(!/Scriptgen\.runNextBatch\(/.test(W) && /flushDoc\(\);\s*res = Scriptgen\.applyBatch\(d, null\);\s*reloadDoc\(\);/.test(W), 'write.js: the bulk run flushes, commits and reloads');
  /* Nothing a Desk task drafts is written before Accept: scriptgen
     offers draft/apply halves only, never a one-call ask-and-write. */
  eq(Object.keys(Gen).filter((k) => /^run/.test(k)), [], 'scriptgen: no run* export asks the model and writes in one call');
  undo();
}

console.log(`test:audience — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
