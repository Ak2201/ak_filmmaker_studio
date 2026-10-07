/* ============================================================
   test:ai-coverage — coverage, the logline workshop and the
   character-voice check, in Node, against a faked fetch for BOTH
   providers (scripts/fake-ai.mjs). No key, no network.

   What it proves, in the order the rules are written in CLAUDE.md:
     · one request path: both providers answered, the key in a
       HEADER (x-api-key / x-goog-api-key) and never in a URL;
     · LF frames (Anthropic) and CRLF frames + a `thought` part
       (Gemini) both parse;
     · Gemini's 400 + API_KEY_INVALID reads as a rejected key;
     · a fabricated quote is STRIPPED and COUNTED, in all three
       jobs; a real quote under the wrong scene is re-numbered;
     · coverage is batched (more than one request for a long script),
       Stop leaves a checkpoint, and Resume does not send a finished
       batch again — the run never bills twice;
     · nothing in ai.js writes storage.
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

/* ---- a small script ------------------------------------------- */
let id = 0;
const E = (type, text, extra = {}) => ({ id: 'e' + (++id), type, text, ...extra });
function script() {
  id = 0;
  return [
    E('scene', 'INT. ANBU HOUSE - NIGHT'),
    E('action', 'Anbu counts coins on the floor. The ceiling fan ticks.'),
    E('character', 'ANBU'),
    E('dialogue', 'Naan nalaikku Chennai poren.'),
    E('character', 'AMMA'),
    E('dialogue', 'Yaaru kitta kettu poriya?'),
    E('scene', 'EXT. BUS STAND - DAY'),
    E('action', 'Crowds. Anbu with one bag, looking back once.'),
    E('character', 'ANBU (V.O.)'),
    E('dialogue', 'Indha ooru ennai vida perusu.'),
    E('scene', 'INT. OFFICE - DAY'),
    E('action', 'A manager in a pressed shirt does not look up.'),
    E('character', 'MANAGER'),
    E('dialogue', 'Experience irukka?'),
    E('character', 'ANBU'),
    E('dialogue', 'Furthermore, I would posit that my qualifications are exemplary.'),
    E('scene', 'EXT. MARINA BEACH - NIGHT'),
    E('action', 'Anbu sits alone. The sea is very loud.'),
    E('character', 'ANBU'),
    E('dialogue', 'Amma, naan thirumbi varala.')
  ];
}

/* ---- the pure halves ------------------------------------------ */
{
  const c = AI.quoteChecker('He said “Naan varuven” — and left.\nNext   line');
  ok(c('Naan varuven'), 'quote: plain span');
  ok(c('"naan VARUVEN"'), 'quote: case and the model\'s own quote marks are not a misquote');
  ok(c('he said "naan varuven" - and left. next line'), 'quote: curly quotes, dashes, whitespace normalised');
  ok(!c('Naan varuvein'), 'quote: one letter off fails');
  ok(!c('He said … left'), 'quote: an elided span fails');
  ok(!c('he'), 'quote: under four characters is not evidence');
  ok(!c(''), 'quote: empty fails');

  const els = script();
  const sig = AI.scriptSignature(els);
  ok(sig === AI.scriptSignature(script()), 'signature: stable');
  const els2 = script(); els2[3].text += '!';
  ok(sig !== AI.scriptSignature(els2), 'signature: one character changes it');

  const sc = AI.coverageScenes(els);
  eq(sc.map((s) => s.n), ['1', '2', '3', '4'], 'coverage scenes numbered by position');
  const numbered = script(); numbered[0].sceneNumber = '12A';
  eq(AI.coverageScenes(numbered)[0].n, '12A', 'a scene number the writer set wins');

  const plan = AI.planCoverage(els, { batchChars: 200 });
  ok(plan.batches.length >= 2, 'plan: a small batch size makes several batches (' + plan.batches.length + ')');
  ok(plan.batches.flat().length === sc.length && new Set(plan.batches.flat()).size === sc.length, 'plan: every scene in exactly one batch, none split');
  eq(plan.requests, plan.batches.length + 1, 'plan: requests = batches + the synthesis');
  ok(plan.tokensIn > Math.floor(plan.chars / 4), 'plan: the estimate covers at least chars/4');
  const one = AI.planCoverage(els);
  eq(one.batches.length, 1, 'plan: a short script is one batch');
  eq(AI.planCoverage([]).requests, 0, 'plan: no headings, no requests');
  ok(AI.planCoverage([E('scene', 'INT. X - DAY'), E('dialogue', 'நான் வருவேன்')]).tamil, 'plan: Tamil script is flagged (the estimate runs low)');

  const cast = AI.speakingCharacters(els);
  eq(cast[0], { name: 'ANBU', lines: 4 }, 'cast: ANBU first, V.O. folded into the name');
  const lines = AI.characterLines(els, 'Anbu');
  eq(lines.map((l) => l.scene), ['1', '2', '3', '4'], 'lines: one per scene, scene numbers from the script');
}

/* ---- the fake, per job ----------------------------------------- */
function sceneNumbersIn(user) {
  return [...user.matchAll(/--- SCENE (\S+) ---/g)].map((m) => m[1]);
}
const log = [];
let abortAfter = Infinity;
let controller = null;
const restore = installFakeFetch(async (req) => {
  const u = req.user;
  if (/--- SCENE \S+ ---/.test(u)) {
    if (log.filter((r) => /--- SCENE/.test(r.user)).length > abortAfter && controller) controller.abort();
    const ns = sceneNumbersIn(u);
    const ev = [];
    if (ns.includes('1')) ev.push({ aspect: 'premise', scene: '1', quote: 'Anbu counts coins on the floor.', note: 'Poverty in one image.' });
    if (ns.includes('1')) ev.push({ aspect: 'dialogue', scene: '1', quote: 'Naan kandippa jeyippen da', note: 'A fabricated line.' });
    if (ns.includes('3')) ev.push({ aspect: 'dialogue', scene: '2', quote: 'Furthermore, I would posit', note: 'Register slips (wrong scene cited).' });
    return {
      scenes: ns.map((n) => ({ scene: n, summary: 'Scene ' + n + ' happens.' })).concat([{ scene: '99', summary: 'not a scene' }]),
      evidence: ev
    };
  }
  if (/Write the coverage/.test(u)) {
    const pt = (scene, quote, note) => ({ scene, quote, note });
    return {
      logline: 'A broke son leaves for Chennai and cannot go home.',
      premise: { assessment: 'Simple and clear.', points: [pt('1', 'Anbu counts coins on the floor.', 'Opens on need.')] },
      structure: {
        assessment: 'Four scenes, a clean line.',
        actBreaks: [{ label: 'End of act one', scene: '2', quote: 'Indha ooru ennai vida perusu.', note: 'He leaves.' },
                    { label: 'Midpoint', scene: '3', quote: 'The manager weeps openly.', note: 'Fabricated.' }],
        points: [pt('4', 'Amma, naan thirumbi varala.', 'A strong last line.')]
      },
      character: { protagonist: 'ANBU', want: 'A job in Chennai', need: 'To forgive his mother', assessment: 'Want is clear; need is not.',
        points: [pt('1', 'Naan nalaikku Chennai poren', 'States the want.')] },
      dialogue: { assessment: 'Mostly natural.', points: [pt('3', 'I would posit that my qualifications', 'Off-voice.'),
        pt('3', 'Unga appa enna sonnaru?', 'Fabricated again.')] },
      pacing: { assessment: 'Brisk.', points: [pt('1', 'Experience irukka?', 'Right line, wrong scene.')] },
      marketability: { assessment: 'An OTT drama, not a theatrical mass film.', points: [] },
      verdict: 'consider',
      verdictWhy: 'A voice worth developing.'
    };
  }
  if (/workshop on their logline/.test(u)) {
    return {
      check: [
        { part: 'protagonist', present: true, found: 'a broke son', note: 'Clear.' },
        { part: 'goal', present: true, found: 'to find work in Chennai', note: 'Clear.' },
        { part: 'obstacle', present: true, found: 'a city that does not want him', note: 'Fabricated — not in the logline.' },
        { part: 'stakes', present: false, found: '', note: 'Missing.' },
        { part: 'irony', present: true, found: '“leaves his mother”', note: 'Quoted with marks.' }
      ],
      variants: [
        { text: 'A broke son leaves his mother to find work in Chennai — and finds he cannot go back.', angle: 'stakes' },
        { text: 'A broke son leaves his mother to find work in Chennai.', angle: 'duplicate of theirs' },
        { text: 'To feed his mother, a son must leave her.', angle: 'irony' },
        { text: 'One bag, one bus, no way home.', angle: 'shorter' }
      ]
    };
  }
  if (/Check the voice of/.test(u)) {
    const ids = [...u.matchAll(/\[(e\d+)\] scene/g)].map((m) => m[1]);
    const out = { voice: 'Short, plain Tanglish; never formal.', breaks: [] };
    if (ids.includes('e16')) out.breaks.push({ line: 'e16', quote: 'Furthermore, I would posit', why: 'He never talks like a textbook.', rewrite: 'Sir, enakku velai venum.' });
    if (ids.includes('e4')) out.breaks.push({ line: 'e4', quote: 'Naan naalai Mumbai poren', why: 'Fabricated quote.', rewrite: '' });
    if (ids.includes('e20')) out.breaks.push({ line: 'e10', quote: 'naan thirumbi varala', why: 'Right words, wrong line id.', rewrite: 'Amma, naan thirumbi varala.' });
    return out;
  }
  if (/Reply with \{"ok": true\}/.test(u)) {
    if (req.provider === 'gemini' && req.headers['x-goog-api-key'] === 'AIzaBADBADBADBADBADBADBAD') {
      return { status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } };
    }
    return { ok: true };
  }
  throw new Error('fake-ai: unrecognised prompt');
}, log);

const KEYS = { anthropic: 'sk-ant-TESTKEYTESTKEYTESTKEY1234', gemini: 'AIzaTESTKEYTESTKEYTESTKEY12' };

for (const prov of ['anthropic', 'gemini']) {
  AI.setProvider(prov);
  AI.setKey(KEYS[prov]);
  log.length = 0;
  const label = '[' + prov + '] ';

  /* ---- coverage, one batch ------------------------------------ */
  const writesBefore = mem.size;
  const cov = await AI.runCoverage({ elements: script(), title: 'Ooru' });
  ok(mem.size === writesBefore, label + 'runCoverage writes no storage');
  eq(log.length, 2, label + 'short script: one batch + one synthesis');
  for (const r of log) {
    ok(!r.url.includes(KEYS[prov]) && !/[?&]key=/.test(r.url), label + 'the key is not in the URL');
    const hdr = prov === 'anthropic' ? 'x-api-key' : 'x-goog-api-key';
    eq(r.headers[hdr], KEYS[prov], label + 'the key is in the ' + hdr + ' header');
  }
  if (prov === 'gemini') ok(/alt=sse/.test(log[0].url), label + 'streams with alt=sse');
  eq(cov.report.verdict, 'consider', label + 'verdict parsed');
  eq(cov.removed, 2, label + 'synthesis: two fabricated quotes stripped and counted');
  eq(cov.readRemoved, 1, label + 'reading: one fabricated evidence quote dropped and counted');
  ok(cov.renumbered >= 2, label + 'real quotes cited under the wrong scene were re-numbered (' + cov.renumbered + ')');
  const mid = cov.report.structure.actBreaks.find((b) => b.label === 'Midpoint');
  eq([mid.quote, mid.scene], ['', ''], label + 'a fabricated act break keeps its note and loses quote + scene');
  const pace = cov.report.pacing.points[0];
  eq([pace.scene, pace.quote], ['3', 'Experience irukka?'], label + 'a real quote is moved to the scene it is actually in');
  const allQuotes = [];
  const walk = (o) => { if (o && typeof o === 'object') { if (typeof o.quote === 'string' && o.quote) allQuotes.push(o); Object.values(o).forEach(walk); } };
  walk(cov.report);
  const scenes = AI.coverageScenes(script());
  ok(allQuotes.length >= 5 && allQuotes.every((p) => AI.quoteChecker(scenes.find((s) => s.n === p.scene).text)(p.quote)),
    label + 'every surviving quote is verbatim in the scene it cites (' + allQuotes.length + ')');
  eq(cov.summaries.map((s) => s.scene), ['1', '2', '3', '4'], label + 'summaries keep only real scenes');

  /* ---- coverage, batched, stopped and resumed ------------------ */
  log.length = 0;
  let saved = null;
  controller = new AbortController();
  abortAfter = 1;          // abort while the second batch is in flight
  let threw = null;
  try {
    await AI.runCoverage({ elements: script() }, { batchChars: 120, signal: controller.signal, onCheckpoint: (s) => { saved = s; } });
  } catch (e) { threw = e; }
  ok(threw && threw.kind === 'aborted', label + 'Stop throws aborted (' + (threw && threw.kind) + ')');
  ok(saved && saved.parts.length >= 1, label + 'a checkpoint was handed over before the stop');
  const sentBefore = log.length;
  const doneParts = saved.parts.length;
  abortAfter = Infinity; controller = null;
  log.length = 0;
  const plan = AI.planCoverage(script(), { batchChars: 120 });
  const resumed = await AI.runCoverage({ elements: script(), prior: saved }, { batchChars: 120 });
  eq(log.length, plan.batches.length - doneParts + 1, label + 'resume sends only the unread batches + the synthesis');
  const firstUser = log[0].user;
  const already = saved.parts.flatMap((p) => p.summaries.map((s) => s.scene));
  ok(already.every((n) => !firstUser.includes('--- SCENE ' + n + ' ---')), label + 'no scene already read is sent again');
  eq(resumed.requests, log.length, label + 'the run reports the requests it actually made');
  ok(sentBefore >= 2, label + 'the stopped run had made ' + sentBefore + ' requests');

  /* a checkpoint for a DIFFERENT draft is not reused */
  log.length = 0;
  const changed = script(); changed[1].text += ' Rain.';
  await AI.runCoverage({ elements: changed, prior: saved }, { batchChars: 120 });
  eq(log.length, plan.batches.length + 1, label + 'a checkpoint from another draft is ignored');

  /* ---- logline workshop ---------------------------------------- */
  log.length = 0;
  const theirs = 'A broke son leaves his mother to find work in Chennai.';
  const ws = await AI.loglineWorkshop({ logline: theirs, format: 'feature' });
  eq(log.length, 1, label + 'workshop: one request');
  eq(ws.removed, 1, label + 'workshop: the fabricated "found" span is stripped and counted');
  const ob = ws.check.find((c) => c.part === 'obstacle');
  eq([ob.found, ob.present], ['', false], label + 'workshop: stripped part reads as absent');
  eq(ws.check.find((c) => c.part === 'irony').found, 'leaves his mother', label + 'workshop: model quote marks unwrapped, span verified');
  eq(ws.check.map((c) => c.part), ['protagonist', 'goal', 'obstacle', 'stakes', 'irony'], 'workshop: all five parts, in order');
  ok(ws.variants.length === 3 && !ws.variants.some((v) => v.text === theirs), label + 'workshop: the writer\'s own line is not offered back as a variant');
  let noLog = null;
  try { await AI.loglineWorkshop({ logline: '  ' }); } catch (e) { noLog = e; }
  ok(noLog && noLog.kind === 'nocontent', label + 'workshop: no logline, no request');

  /* ---- voice check --------------------------------------------- */
  log.length = 0;
  const vc = await AI.voiceCheck({ elements: script(), character: 'anbu' });
  eq(log.length, 1, label + 'voice: one request for a short part');
  eq(vc.removed, 1, label + 'voice: the fabricated quote is stripped and counted');
  eq(vc.remapped, 1, label + 'voice: a real quote under the wrong line id is re-mapped');
  eq(vc.breaks.map((b) => [b.id, b.scene]), [['e16', '3'], ['e20', '4']], label + 'voice: scene numbers come from the script');
  eq(vc.breaks[0].rewrite, 'Sir, enakku velai venum.', label + 'voice: a rewrite is offered');
  eq(vc.breaks[1].rewrite, '', label + 'voice: a "rewrite" identical to the line is dropped');
  ok(!/MANAGER|Experience irukka/.test(log[0].user), label + 'voice: only this character\'s lines are sent');
  log.length = 0;
  const vb = await AI.voiceCheck({ elements: script(), character: 'ANBU' }, { batchChars: 80 });
  ok(log.length >= 2 && /TALKS ACROSS THE SCRIPT/.test(log[0].user), label + 'voice: a long part is batched with a shared voice sample (' + log.length + ' requests)');
  eq(vb.breaks.length, 2, label + 'voice: batched result is the same');
  let none = null;
  try { await AI.voiceCheck({ elements: script(), character: 'MANAGER' }); } catch (e) { none = e; }
  ok(none && none.kind === 'nocontent', label + 'voice: one line is not a voice; no request');
}

/* ---- Gemini's bad key ------------------------------------------- */
AI.setProvider('gemini');
AI.setKey('AIzaBADBADBADBADBADBADBAD');
const t = await AI.testKey();
ok(!t.ok && t.kind === 'auth', 'gemini 400 + API_KEY_INVALID reads as a rejected key (' + t.kind + ')');

/* ---- no key, no request ------------------------------------------ */
AI.clearKey();
log.length = 0;
let nk = null;
try { await AI.runCoverage({ elements: script() }); } catch (e) { nk = e; }
ok(nk && nk.kind === 'nokey' && log.length === 0, 'no key: nothing leaves the process');

restore();
console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
