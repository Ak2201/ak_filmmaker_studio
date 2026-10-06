/* ============================================================
   FORMAT RULES — the Write page's format guide, in Node
   ------------------------------------------------------------
       node scripts/test-format.mjs   (or: npm run test:format)

   src/lib/format-rules.js is pure, so every rule is tested here
   with no browser: one case that must be flagged and one that must
   not, per rule (Phase 3's "done when"), plus the sample script,
   which must carry no `warn` at all — its scenes are correctly
   formatted, so a warning there is a false positive by definition.
   ============================================================ */
import { mem } from './node-seams.mjs';
void mem;

const F = await import('../src/lib/format-rules.js');
const RULES = (await import('../src/data/format-rules.json')).default;
const SAMPLE = (await import('../src/data/sample.dragon.script.json')).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const el = (type, text) => ({ type, text });
const ids = (els) => F.checkScript(els).map((f) => f.ruleId);
const flags = (els, rule, at) => F.checkScript(els).some((f) => f.ruleId === rule && (at === undefined || f.index === at));

const SLUG = el('scene', 'INT. TEA STALL - DAY');
const LONG = 'Steam rises off the kettle while the boy counts coins on the counter and the radio plays. ';

/* [rule, a script that must flag it (and where), a script that must not] */
const CASES = [
  ['heading-prefix',
    [el('scene', 'TEA STALL - DAY')], 0,
    [el('scene', 'INT. TEA STALL - DAY'), el('scene', 'EXT./INT. CAR - NIGHT'), el('scene', 'I/E AUTO - DAY'), el('scene', 'EST. CHENNAI - DAWN'), el('scene', 'int. kitchen - night')]],
  ['heading-time',
    [el('scene', 'INT. TEA STALL')], 0,
    [el('scene', 'INT. SCHOOL ASSEMBLY HALL, ASHOK NAGAR - DAY (2014)'), el('scene', 'INT. CORPORATE OFFICE — HR ROOM - DAY'), el('scene', 'EXT. QUAD – MOMENTS LATER'), el('scene', 'INT. HOUSE - CONTINUOUS'), el('scene', 'EXT. BEACH ROAD - DUSK')]],
  ['heading-time (DAYCARE is not DAY)',
    [el('scene', 'INT. DAYCARE')], 0,
    [el('scene', 'INT. DAYCARE - DAY')]],
  ['cue-caps',
    [SLUG, el('character', 'Ravi'), el('dialogue', 'Vaa da.')], 1,
    [SLUG, el('character', 'RAVI (V.O.)'), el('dialogue', 'Vaa da.'), el('character', 'மணி'), el('dialogue', 'சரி.')]],
  ['action-long',
    [SLUG, el('action', LONG.repeat(3))], 1,
    [SLUG, el('action', LONG.repeat(2))]],
  ['paren-long',
    [SLUG, el('character', 'RAVI'), el('paren', '(to the man selling flowers at the gate)'), el('dialogue', 'Ennaa?')], 2,
    [SLUG, el('character', 'RAVI'), el('paren', '(into the phone)'), el('dialogue', 'Ennaa?')]],
  ['paren-capital',
    [SLUG, el('character', 'RAVI'), el('paren', '(Quietly)'), el('dialogue', 'Ennaa?')], 2,
    [SLUG, el('character', 'RAVI'), el('paren', '(quietly)'), el('dialogue', 'Ennaa?'), el('character', 'MEENA'), el('paren', '(Ravi, softly)'), el('dialogue', 'Seri.'), el('paren', '(V.O.)')]],
  ['paren-closed',
    [SLUG, el('character', 'RAVI'), el('paren', '(quietly'), el('dialogue', 'Ennaa?')], 2,
    [SLUG, el('character', 'RAVI'), el('paren', '(quietly)'), el('dialogue', 'Ennaa?')]],
  ['dialogue-speaker',
    [SLUG, el('action', 'He turns.'), el('dialogue', 'Ennaa da?')], 2,
    [SLUG, el('character', 'RAVI'), el('paren', '(beat)'), el('dialogue', 'Ennaa da?'), el('dialogue', 'Sollu.')]],
  ['dialogue-speaker (at the very top)',
    [el('dialogue', 'Hello?')], 0,
    [el('character', 'RAVI'), el('dialogue', 'Hello?')]],
  ['transition-caps',
    [SLUG, el('transition', 'cut to:')], 1,
    [SLUG, el('transition', 'CUT TO:')]],
  ['transition-to',
    [SLUG, el('transition', 'HE WALKS AWAY')], 1,
    [SLUG, el('transition', 'DISSOLVE TO:'), el('transition', 'FADE OUT.'), el('transition', 'CUT TO BLACK.'), el('transition', 'FADE IN:')]],
  ['contd',
    [SLUG, el('character', 'RAVI'), el('dialogue', 'Wait.'), el('action', 'He looks back.'), el('character', 'RAVI'), el('dialogue', 'Seri.')], 4,
    [SLUG, el('character', 'RAVI'), el('dialogue', 'Wait.'), el('action', 'He looks back.'), el('character', "RAVI (CONT'D)"), el('dialogue', 'Seri.'),
      el('character', 'MEENA'), el('dialogue', 'Enna?'), el('character', 'RAVI'), el('dialogue', 'Onnum illa.'),
      // a new scene resets it
      el('scene', 'EXT. ROAD - NIGHT'), el('action', 'Rain.'), el('character', 'RAVI'), el('dialogue', 'Pochu.')]],
  ['scene-long',
    [SLUG, ...Array.from({ length: 60 }, () => el('action', LONG + LONG))], 0,
    [SLUG, ...Array.from({ length: 20 }, () => el('action', LONG + LONG))]]
];

for (const [name, bad, at, good] of CASES) {
  const rule = name.split(' ')[0];
  ok(flags(bad, rule, at), `${name}: flagged at ${at} — got ${JSON.stringify(F.checkScript(bad))}`);
  ok(!flags(good, rule), `${name}: not flagged on the correct case — got ${JSON.stringify(F.checkScript(good).filter((f) => f.ruleId === rule))}`);
}

/* Every rule in the JSON is exercised above, and every rule has its copy. */
const tested = new Set(CASES.map((c) => c[0].split(' ')[0]));
for (const r of RULES.rules) {
  ok(tested.has(r.id), `rule ${r.id} has a test`);
  ok(['warn', 'hint'].includes(r.severity), `rule ${r.id} has a known severity`);
  ok(r.message && r.why && r.why.length > 40, `rule ${r.id} has a message and a why`);
}

/* A finding's shape. */
const one = F.checkScript([el('scene', 'TEA STALL - DAY')])[0];
ok(one && ['index', 'ruleId', 'severity', 'message', 'why'].every((k) => k in one), 'a finding carries index, ruleId, severity, message, why');

/* Neutral things. */
ok(ids([el('shot', 'CLOSE ON the kettle'), el('dialogue', 'Hmm.')]).length === 0, 'an unknown type (shot) is neutral and does not orphan the dialogue under it');
ok(ids([el('shot', 'anything lower case at all, any length ' + LONG.repeat(5))]).length === 0, 'an unknown type is never flagged itself');
ok(ids([SLUG, el('character', ''), el('paren', ''), el('dialogue', ''), el('transition', ''), el('scene', '')]).filter((r) => r !== 'dialogue-speaker').length === 0, 'empty elements are never flagged');
ok(ids([SLUG, el('character', 'RAVI'), el('dialogue', 'Enna da, nee innum kelambalaiya? Amma kooptaanga.')]).length === 0, 'Tanglish dialogue is not judged for case');
ok(ids([el('scene', 'உள். வீடு - இரவு')]).length === 0, 'a Tamil-script heading has no Latin case or prefix to judge');

/* checkAround: the live check sees only what it is asked about (plus its scene heading). */
const mixed = [el('scene', 'TEA STALL'), el('action', 'Ok.'), el('character', 'ravi'), el('dialogue', 'Hi.')];
const around = F.checkAround(mixed, [2]).map((f) => f.index);
ok(around.includes(2) && around.includes(0) && !around.includes(3), 'checkAround reports the element and its heading, nothing else');

/* THE SAMPLE: correctly formatted, so zero warnings. */
const t0 = performance.now();
const sample = F.checkScript(SAMPLE.elements);
const ms = performance.now() - t0;
const warns = sample.filter((f) => f.severity === 'warn');
ok(warns.length === 0, `the sample carries no warn finding — got ${warns.length}: ${JSON.stringify(warns.slice(0, 5))}`);
ok(ms < 200, `the whole sample checks in under 200ms (${ms.toFixed(1)}ms)`);
const hintCounts = {};
for (const f of sample) hintCounts[f.ruleId] = (hintCounts[f.ruleId] || 0) + 1;

console.log(`format rules: ${pass} passed, ${fail} failed · sample: ${SAMPLE.elements.length} elements, 0 warn, hints ${JSON.stringify(hintCounts)}, ${ms.toFixed(1)}ms`);
process.exit(fail ? 1 : 0);
