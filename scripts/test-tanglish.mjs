/* ============================================================
   TANGLISH — the transliterator and the word index, in Node
   ------------------------------------------------------------
       node scripts/test-tanglish.mjs   (or: npm run test:tanglish)

   src/lib/tanglish.js is pure, so this needs no browser and no
   storage seam. The transliteration is an APPROXIMATE preview and
   the page says so; what is asserted here is that the common chat
   conventions land on the right letters, so the approximation is a
   known one rather than whatever the code happened to do.
   ============================================================ */
import fs from 'node:fs';
const T = await import('../src/lib/tanglish.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- the transliterator: a dozen words and then some ---- */
const WORDS = {
  naan: 'நான்',
  nee: 'நீ',
  vaa: 'வா',
  enna: 'என்ன',
  nandri: 'நன்றி',
  konjam: 'கொஞ்சம்',
  vanthu: 'வந்து',
  thambi: 'தம்பி',
  thamizh: 'தமிழ்',
  mooNu: 'மூணு',
  kalyaaNam: 'கல்யாணம்',
  poana: 'போன',
  veedu: 'வீடு',
  sollu: 'சொல்லு',
  enga: 'எங்க',
  ingae: 'இங்கே',
  pazham: 'பழம்',
  illa: 'இல்ல',
  vaNakkam: 'வணக்கம்',
  kaatru: 'காற்று',
  rendu: 'ரெண்டு',
  kai: 'கை',
  amma: 'அம்ம',
  appa: 'அப்ப',
  Naan: 'நான்'                  // sentence case is not a letter
};
for (const [roman, tamil] of Object.entries(WORDS)) eq(T.wordToTamil(roman), tamil, `wordToTamil(${roman})`);

eq(T.toTamil('Nandri, sir.'), 'நன்றி, சிர்.', 'punctuation passes through');
eq(T.toTamil('order-la 5 mani'), 'ஒர்டெர்-ல 5 மனி', 'hyphens and digits pass through');
eq(T.toTamil(''), '', 'empty in, empty out');
ok(!/[A-Za-z]/.test(T.toTamil('Mozhangaal epdi irukku, anna?')), 'no Latin letter survives a Tanglish line');

/* ---- the word index ---- */
const els = [
  { type: 'scene', text: 'INT. HOUSE - DAY' },
  { type: 'action', text: 'The door opens. Door again.' },
  { type: 'dialogue', text: 'Naan sollunga. Sollunga, anna! Sollunga.' },
  { type: 'dialogue', text: 'Door door door. sollunga.' },
  { type: 'dialogue', text: 'Kalyanam mudiyala. kalyanam.' },
  { type: 'character', text: 'ANNA' }
];
const idx = T.wordIndex(els);
const words = idx.words.map((w) => w.word);
ok(words[0] === 'sollunga', 'most frequent spoken word first — got ' + words.join(','));
ok(words.includes('kalyanam'), 'a word said twice is learned');
ok(!words.includes('mudiyala'), 'a word said once is not');
ok(words.includes('door'), 'door: said three times in speech, twice elsewhere — kept');
eq(T.suggest(idx, 'so'), 'sollunga', 'prefix completes to the frequent word');
eq(T.suggest(idx, 'So'), 'Sollunga', 'sentence case follows the typing');
eq(T.suggest(idx, 'sollung'), '', 'a completion must add two letters');
eq(T.suggest(idx, 'x'), '', 'one letter is not a prefix');
eq(T.suggest(idx, 'zz'), '', 'unknown prefix');

const idx2 = T.wordIndex([
  { type: 'action', text: 'door door door' },
  { type: 'dialogue', text: 'door door' }
]);
ok(!idx2.words.some((w) => w.word === 'door'), 'a word the action uses as much is English and dropped');

eq(JSON.stringify(T.wordBefore('Naan sol', 8)), JSON.stringify({ start: 5, word: 'sol' }), 'wordBefore at the end');
eq(T.wordBefore('Naan solx', 8).word, '', 'caret inside a word offers nothing');

/* ---- on the sample: it learns real Tanglish and stays fast ---- */
const sample = JSON.parse(fs.readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url)));
const t0 = performance.now();
const big = T.wordIndex(sample.elements);
const ms = performance.now() - t0;
ok(ms < 150, `index of the 2,361-element sample in ${ms.toFixed(1)}ms (< 150)`);
const top = big.words.slice(0, 40).map((w) => w.word);
ok(top.includes('illa') || top.includes('enna'), 'the sample\'s top words include common Tanglish — ' + top.slice(0, 12).join(', '));
const t1 = performance.now();
for (const w of big.words.slice(0, 200)) T.toTamil(w.word);
ok(performance.now() - t1 < 50, 'transliterating 200 words is instant');

console.log(`\ntanglish: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
