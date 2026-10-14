/* ============================================================
   STORY PACING — the #pacing curve, intensity and deck, in Node
   ------------------------------------------------------------
   src/lib/story-pacing.js derives the tension curve, the intensity
   distribution and the beat deck from the stored story, scenes and
   script. Asserted here: the numbers come from the model, nothing is
   invented when it cannot be measured, and nothing is written.

       node scripts/test-story-pacing.mjs   (or: npm run test:pacing)
   ============================================================ */
import { mem } from './node-seams.mjs';

const P = (await import('../src/lib/story-pacing.js')).default;
const S = await import('../src/lib/story.js');
const { blankScene } = await import('../src/lib/scenes.js');
const sample = (await import('../src/data/sample.dragon.json')).default;
const script = (await import('../src/data/sample.dragon.script.json')).default;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const memBefore = JSON.stringify([...mem.entries()]);
const stc = S.frameworkById('save_the_cat');

/* ---- the curve ------------------------------------------------ */
const empty = { ...S.blankStory(), framework: 'save_the_cat' };
let c = P.tensionCurve(empty);
eq(c.length, 15, 'Save the Cat!: fifteen points on the curve');
eq(c.map((p) => p.tension), [...stc.beats].sort((a, b) => a.at - b.at).map((b) => b.tension), 'an unscored story draws the convention');
ok(c.every((p) => p.placed === 'convention' && !p.overridden), 'with nothing tagged, every beat sits at its convention');
ok(c.every((p, i) => i === 0 || p.at >= c[i - 1].at), 'points are in position order');

const TURN = 'THE MIDPOINT TURN.';
const src = 'Alpha opens quietly here. '.repeat(20) + TURN + ' ' + 'Then more happens later on. '.repeat(20);
const at = src.indexOf(TURN);
const tagged = { ...S.blankStory(), framework: 'save_the_cat', source: src, marks: [], tension: {} };
S.addMark(tagged, { start: at, end: at + TURN.length, fw: 'save_the_cat', beat: 'catalyst' });
S.setTension(tagged, 'save_the_cat', 'catalyst', 9);
c = P.tensionCurve(tagged);
const cat = c.find((p) => p.beat.id === 'catalyst');
ok(cat.placed === 'tagged' && cat.overridden && cat.tension === 9, 'a hand tag moves the beat and a hand score sets its height');
ok(Math.abs(cat.at - S.positionOf({ start: at, end: at + TURN.length }, src.length)) < 1e-9, 'the beat sits at its tagged passage');
eq(cat.expected, stc.beats.find((b) => b.id === 'catalyst').tension, 'the convention is still carried beside the score');

/* ---- intensity ------------------------------------------------ */
eq(P.intensity(empty).slices, [], 'no synopsis, no slices');
const d = P.intensity(tagged);
eq(d.slices.length, S.PACING.windows, 'one slice per heatmap window');
const sum = d.share.low + d.share.mid + d.share.high;
ok(Math.abs(sum - 1) < 1e-9, 'the shares add to the whole story');
ok(d.slices.every((w) => w.level === P.levelOf(w.tension)), 'each slice carries its level');
eq([P.levelOf(S.PACING.lowTension), P.levelOf(5), P.levelOf(P.HIGH_TENSION)], ['low', 'mid', 'high'], 'level thresholds');
ok(d.slices.some((w) => !w.estimated && w.tension === 9), 'a tagged slice takes the beat\'s hand score');

/* ---- the deck ------------------------------------------------- */
let deck = P.beatDeck({ story: empty, scenes: [], elements: [] });
eq(deck.beats.map((b) => b.n), Array.from({ length: 15 }, (_, i) => i + 1), 'the deck is numbered 1..15 in framework order');
ok(deck.beats.every((b) => b.pageTarget === null && b.opensOn === null && b.href === null), 'no scenes: no page target, no page, no link — nothing invented');
eq(deck.pages, { total: 0, source: null }, 'no length known');

const elements = script.elements.map((e, i) => ({ id: 'e' + i, type: e.type, text: e.text }));
const scenes = sample.scenes.map((s, i) => blankScene({ ...s, id: 'sc' + i }));
scenes[2].beatId = 'save_the_cat:catalyst';
scenes[5].beatId = 'save_the_cat:catalyst';
deck = P.beatDeck({ story: tagged, scenes, elements });
eq(deck.pages.source, 'script', 'pages come from the script when the scenes match it');
ok(deck.pages.total > 0, 'the film has a length');
const card = deck.beats.find((b) => b.beat.id === 'catalyst');
eq(card.pageTarget, Math.max(1, Math.round(card.conventionAt * deck.pages.total)), 'page target = convention × length');
eq(card.scenes, 2, 'two scenes serve the catalyst');
ok(card.href && card.href.startsWith('screenplay.html#line-'), 'a linked scene opens its heading in the script');
ok(card.opensOn >= 1 && card.opensOn <= Math.ceil(deck.pages.total), 'opens on a page inside the film');
ok(card.passage && !card.passage.inferred && card.passage.text === TURN, 'the tagged passage rides on its card');
ok(card.tension === 9 && card.overridden, 'the card reads the hand score');
const bare = deck.beats.find((b) => b.beat.id === 'finale');
ok(bare && bare.scenes === 0 && bare.href === null && bare.opensOn === null, 'a beat with no scene has no page and no link');
const noScript = P.beatDeck({ story: tagged, scenes, elements: [] });
eq(noScript.pages.source, 'scenes', 'without a script the scene list\'s eighths are the length');

/* ---- the path ------------------------------------------------- */
eq(P.smoothPath([]), '', 'no points, no path');
ok(/^M0,10 C/.test(P.smoothPath([[0, 10], [50, 0], [100, 10]])), 'a smooth path through the points');
const ys = [...P.smoothPath([[0, 10], [50, 0], [100, 10]]).matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
ok(ys.every((y) => y >= 0 && y <= 10), 'the curve never overshoots the band its points span');

eq(JSON.stringify([...mem.entries()]), memBefore, 'nothing was written to storage');

console.log(`story-pacing: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
