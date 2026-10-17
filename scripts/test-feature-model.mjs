/* The Feature Blueprint's pure logic (src/lib/feature-model.js), in
   Node, no browser. Each case pins an output the page produced when
   this code still lived in src/pages/feature.js. */
import assert from 'node:assert/strict';
import {
  buildParts, parseInlineHandler, tallyCompletion, completionPct, fieldFilled, savedTick,
  rowCountsFromBlob, savedAgoText, pacingChart, formatBudgetINR, budgetBreakdown, budgetBarHTML,
  wordCounterState, charMapSVG, sceneChargeChart, vol1BridgeHTML, fileSlug, blueprintPdfOptions,
  FEATURE_ROW_KEY, looksLikeShortFile, cleanImportedFields, sampleFields, emailToSelfHref,
  formatTime, timerAriaLabel, humanise, isSpecialKey, buildFeatureMarkdown, buildPitchSlides,
  slideToHTML, buildPitchPptx
} from '../src/lib/feature-model.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('parts', () => {
  const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const nsOf = new Map([['a', 'x'], ['b', 'x'], ['c', 'y']]);
  const info = (ns, id) => (id === 'c' ? { parts: [2] } : id === 'a' ? { parts: [1, 2] } : null);
  const p = buildParts([{ part: 1 }, { part: 2 }], steps, nsOf, info);
  assert.deepEqual(p.map((x) => x.steps.map((s) => s.id)), [['a'], ['a', 'c']]);
});

t('inline handler', () => {
  assert.deepEqual(parseInlineHandler("clearEmpty('sceneListBody')"), { name: 'clearEmpty', args: '["sceneListBody"]' });
  assert.deepEqual(parseInlineHandler('addSceneRow(5);'), { name: 'addSceneRow', args: '[5]' });
  assert.deepEqual(parseInlineHandler('updatePalette()'), { name: 'updatePalette', args: null });
  assert.deepEqual(parseInlineHandler('f(a b)'), { name: 'f', args: null });
  assert.equal(parseInlineHandler('a b()'), null);
});

t('completion', () => {
  assert.deepEqual(tallyCompletion([true, false], [true], [7, 1], 5), { total: 13, done: 8 });
  assert.equal(completionPct(0, 0), 0);
  assert.equal(completionPct(3, 1), 33);
  assert.equal(fieldFilled({ type: 'checkbox', checked: true }), true);
  assert.equal(fieldFilled({ type: 'text', value: '  ' }), false);
  assert.equal(savedTick('on'), false);
  assert.equal(savedTick('true'), true);
  assert.deepEqual(rowCountsFromBlob({ sl_3_slug: 'x', sl_12_pov: '', shot_2_a: 1, loc_9_name: '' }),
    { scene: 12, shot: 2, cast: 0, loc: 9 });
});

t('saved ago', () => {
  assert.equal(savedAgoText(0, 4000), '●  saved · just now');
  assert.equal(savedAgoText(0, 7000), '●  saved · 7s ago');
  assert.equal(savedAgoText(0, 125000), '●  saved · 2m ago');
  assert.equal(savedAgoText(0, 7300000), '●  saved · 2h ago');
});

t('pacing', () => {
  const c = pacingChart({ b01: 'x', b06: 'y', b07: ' ', b15: 'z' });
  assert.equal(c.filled, 3);
  assert.deepEqual([c.act1, c.act2, c.act3], ['1/3', '1/8', '1/4']);
  assert.match(c.svg, /^<line class="act-divider" x1="240"/);
  assert.equal((c.svg.match(/beat-dot filled/g) || []).length, 3);
});

t('budget', () => {
  const b = budgetBreakdown({ atl: '1 lakh', btl: '50000', post: '', total: '9', cont: '10 %' });
  assert.equal(b.total, 165000);
  assert.equal(b.cont, 15000);
  assert.match(budgetBarHTML(b), /budget-bar-seg atl" style="width:60\.6%"/);
  assert.equal(budgetBreakdown({ total: '9' }).total, 9);
  assert.equal(budgetBarHTML(budgetBreakdown({ total: '9' })), '');
  assert.equal(formatBudgetINR(0), '—');
});

t('word counter', () => {
  assert.deepEqual(wordCounterState('', 30), { text: '0 words · target <30', state: '' });
  assert.deepEqual(wordCounterState('one', 30), { text: '1 word · target <30', state: 'good' });
  assert.equal(wordCounterState('a b c', 2, 'two').state, 'over');
  assert.equal(wordCounterState('a b c', 2, 'two').text, '3 words · target two');
});

t('char map escapes', () => {
  const s = charMapSVG({ protag: '<b>Arun</b>', antag: '', ally: '', lover: '', mentor: '' });
  assert.ok(!s.includes('<b>'));
  assert.ok(s.includes('— empty —'));
  assert.ok(s.includes('char-name protagonist'));
});

t('scene chart', () => {
  const rows = [
    { hasContent: true, charge: 'pos' }, { hasContent: true, charge: 'dbl-pos' },
    { hasContent: true, charge: 'neg' }, ...Array.from({ length: 8 }, () => ({ hasContent: false, charge: '' }))
  ];
  const c = sceneChargeChart(rows);
  assert.equal(c.total, 8);
  assert.equal(c.charged, 3);
  assert.equal(c.flips, 1);
  assert.equal(c.longestRun, '2 scenes');
  assert.equal(sceneChargeChart([]).longestRun, '—');
});

t('bridge', () => {
  assert.equal(vol1BridgeHTML('', ''), '');
  assert.ok(vol1BridgeHTML('a<b', '').includes('"a&lt;b"'));
});

t('files', () => {
  assert.equal(fileSlug('My Film!'), 'my_film_');
  assert.equal(fileSlug(''), 'film');
  assert.deepEqual(blueprintPdfOptions({ v1_title: 'X' }, 1),
    { scope: 'blueprint', project: 'X', label: 'Feature blueprint', title: 'X — Feature blueprint', subtitle: '1 step' });
  assert.equal(blueprintPdfOptions({}, 32).subtitle, '32 steps');
});

t('import', () => {
  assert.ok(FEATURE_ROW_KEY.test('sl_3_slug'));
  assert.ok(!FEATURE_ROW_KEY.test('s3_theme'));
  assert.ok(looksLikeShortFile({ _sceneMap: [] }));
  assert.deepEqual(cleanImportedFields({ a: 1, b: null, c: undefined, d: '' }), { a: 1, d: '' });
});

t('sample', () => {
  assert.deepEqual(sampleFields({ title: 'T', blueprint: { a: 'x', meta_title: 'old' }, blueprintChecks: ['c1'] }),
    { a: 'x', meta_title: 'T', v1_title: 'T', c1: true });
});

t('email', () => {
  const href = emailToSelfHref({ meta_title: 'T', s2_log1: 'L' }, 42, 'Studio');
  assert.ok(href.startsWith('mailto:?subject=%5BFilmmaker\'s%20Blueprint%5D%20T&body='));
  assert.ok(decodeURIComponent(href).includes('PROGRESS\n42% across 24 steps'));
  assert.ok(decodeURIComponent(href).includes('— Sent from Studio'));
});

t('timer', () => {
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(61), '01:01');
  assert.equal(timerAriaLabel({ running: false, paused: false, done: false, remaining: 1500, pomos: 0 }),
    'Focus timer, 25:00, not started');
  assert.equal(timerAriaLabel({ running: false, paused: false, done: true, remaining: 1500, pomos: 2 }),
    'Focus timer, 25:00, session done, 2 completed');
});

t('labels', () => {
  assert.equal(humanise('s4_want'), 'Want');
  assert.equal(humanise('v2s11_total'), 'Total');
  assert.ok(isSpecialKey('b08'));
  assert.ok(isSpecialKey('s10_pay_3'));
  assert.ok(!isSpecialKey('s10_theme'));
});

t('markdown', () => {
  const data = { meta_title: 'Film', s1_whatif: 'What if', b01: 'Open', sl_1_slug: 'INT. X', sl_1_charge: 'pos',
    cast_1_role: 'Hero', cast_1_actor: 'A', cast_1_status: 'ok', loc_1_name: 'Beach', loc_1_scene: '3' };
  const parts = [{ part: 1, steps: [{ id: 'step-01' }, { id: 'step-08' }, { id: 'step-11' }] },
                 { part: 2, steps: [{ id: 'step-20' }, { id: 'step-21' }] }];
  const md = buildFeatureMarkdown({
    data, parts,
    partHeading: (n) => 'Part ' + n,
    heading: (s) => s.id.toUpperCase(),
    exportableFields: (s) => (s.id === 'step-01' ? [['What if', 's1_whatif']] : []),
    methodBeats: [{ n: 1, label: 'Opening Image' }],
    brandName: 'Studio'
  });
  assert.ok(md.startsWith("# THE FILMMAKER'S BLUEPRINT\n## Film\n\n**Director:** —\n"));
  assert.ok(md.includes('## STEP-01\n\n**What if:** What if\n\n'));
  assert.ok(md.includes('**01 · Opening Image:** Open'));
  assert.ok(md.includes('**Sc1** | INT. X | POV:  | Want:  | Conflict:  | +→−'));
  assert.ok(md.includes('\n---\n\n# Part 2\n\n'));
  assert.ok(md.includes('- **Hero** — A (ok)'));
  assert.ok(md.includes('- Sc3: **Beach** |  | Permit: '));
  assert.ok(md.endsWith("\n---\n*Generated from The Filmmaker's Blueprint · Studio*\n"));
});

t('pitch', () => {
  const slides = buildPitchSlides({ meta_title: 'F', b01: 'x', b10: 'y' });
  assert.equal(slides.length, 10);
  assert.equal(slides[0].body, 'Logline pending');
  assert.deepEqual(slides[7].bullets, ['01 · x', '10 · y']);
  const html = slideToHTML({ label: 'SLIDE 02 · WHAT IF', title: '<i>', footer: 'F' });
  assert.ok(html.includes('pitch-slide empty'));
  assert.ok(html.includes('<span class="slide-num">SLIDE 02</span>'));
  assert.ok(html.includes('&lt;i&gt;'));
  const calls = [];
  class Fake { addSlide() { return { addText: (...a) => calls.push(a), addShape: () => {} }; } }
  const { pres, fileName } = buildPitchPptx(Fake, { meta_title: 'F' }, slides, 'Studio');
  assert.equal(fileName, 'F-deck.pptx');
  assert.equal(pres.author, 'Studio');
  assert.equal(pres.layout, 'LAYOUT_WIDE');
  assert.ok(calls.length > 30);
});

console.log(`✓ feature model: ${n} groups pass`);
