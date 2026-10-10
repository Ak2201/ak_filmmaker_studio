/* ============================================================
   STORY BIBLE — where each answer lives, in Node
   ------------------------------------------------------------
   The Bible and the Character Bible store NOTHING of their own for the
   answers the blueprints already ask. This asserts the properties that
   make that safe:

     - writeFields (blueprint-store.js) lays a patch over the blob and
       never drops a key it was not handed;
     - for the character holding a blueprint role, the backed fields are
       read and written in the blueprint blob, and are NOT in the
       character record (no field is stored twice);
     - an old blueprint answer (s4_want) already shows in the
       protagonist's card, as a virtual card until it is edited;
     - a record written before the new fields existed reads back blank;
     - a story written before `conflicts` existed reads back [];
     - every key story-bible.json names is a real blueprint key;
     - the project's favourite film survives a backup round trip (the
       importer carries `fav`; checked in the source, and end to end in
       the browser proof).

       node scripts/test-bible.mjs      (or: npm run test:bible)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const BP = await import('../src/lib/blueprint-store.js');
const C = await import('../src/lib/characters.js');
const S = await import('../src/lib/story.js');
const BIBLE = JSON.parse(readFileSync(new URL('../src/data/story-bible.json', import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const reset = () => mem.clear();
const blob = (ns) => JSON.parse(mem.get(BP.blobKey(ns)) || '{}');
const confirmYes = () => true;

/* ---- blueprint-store: a merge-write ----------------------------- */
reset();
mem.set(BP.blobKey('feature'), JSON.stringify({ s1_whatif: 'What if…', s4_want: 'a job', s9_log: 'x' }));
ok(BP.writeFields('feature', { s3_ext: 'the town' }), 'writeFields reports success');
eq(blob('feature'), { s1_whatif: 'What if…', s4_want: 'a job', s9_log: 'x', s3_ext: 'the town' }, 'writeFields never drops an untouched key');
BP.writeFields('feature', { s4_want: '' });
eq(blob('feature').s4_want, '', 'a blank is written as a blank, not skipped');
eq(blob('feature').s1_whatif, 'What if…', '…and the rest is still there');
eq(BP.readFields('feature', ['s3_ext', 'nope']), { s3_ext: 'the town', nope: '' }, 'readFields: stored value, else ""');
reset();
BP.writeFields('short', { s5_loc: 'a rooftop' });
eq(Object.keys(blob('short')), ['s5_loc'], 'the short blueprint is its own blob');
ok(!mem.has(BP.blobKey('feature')), 'writing the short blob leaves the feature blob alone');
eq(BP.blobKey('production'), BP.blobKey('feature'), 'production steps save into the feature blob');
mem.set(BP.blobKey('feature'), '{not json');
eq(BP.readFields('feature', ['s3_ext']), { s3_ext: '' }, 'a corrupt blob reads as empty, not a throw');
BP.writeFields('feature', { s3_ext: 'x' });
eq(blob('feature'), { s3_ext: 'x' }, '…and the next write recovers it');

/* ---- the key map is real ---------------------------------------- */
{
  const keysIn = (file) => {
    const raw = readFileSync(new URL(file, import.meta.url), 'utf8');
    return new Set([...raw.matchAll(/(?:"key":\s*"|data-key=\\"|data-key=")(s\d+_[a-z_0-9]+)/g)].map((m) => m[1]));
  };
  const feature = keysIn('../src/data/steps.feature.json');
  const short = keysIn('../src/data/steps.short.json');
  for (const [card, m] of Object.entries(BIBLE.map)) {
    for (const k of m.feature) ok(feature.has(k), `${card}: ${k} is a feature blueprint key`);
    for (const k of m.short) ok(short.has(k), `${card}: ${k} is a short blueprint key`);
    for (const k of [...m.feature, ...m.short, ...(BIBLE.fallback[card] || [])]) ok(BIBLE.fields[k] && BIBLE.fields[k].label, `${card}: ${k} has a label`);
  }
  for (const [role, sl] of Object.entries(BIBLE.slots)) {
    if (role.startsWith('_')) continue;
    for (const k of Object.values(sl.fields)) ok(feature.has(k), `${role}: ${k} is a feature blueprint key`);
    for (const k of Object.values(sl.short || {})) ok(short.has(k), `${role}: ${k} is a short blueprint key`);
    for (const x of sl.extras.feature || []) ok(feature.has(x.key), `${role}: extra ${x.key} is a feature key`);
    for (const x of sl.extras.short || []) ok(short.has(x.key), `${role}: extra ${x.key} is a short key`);
  }
  eq(BIBLE.map.stakes.feature, ['s3_ext', 's3_int'], 'Stakes: s3_ext, s3_int');
  eq(BIBLE.map.theme.feature, ['s3_theme', 's3_phil'], 'Theme: s3_theme, s3_phil');
  eq(BIBLE.map.world.feature, ['s7_era', 's7_location', 's7_duration', 's7_rules', 's7_sensory'], 'World (feature)');
  eq(BIBLE.map.world.short, ['s5_loc', 's5_time', 's5_anchors', 's5_rules'], 'World (short)');
  eq(BIBLE.conflicts.map((c) => c.label), ['Person vs Person', 'Person vs Self', 'Person vs Society', 'Person vs Nature',
    'Person vs Fate / the supernatural', 'Person vs Technology', 'Family', 'Time / a deadline'], 'the eight kinds of conflict');
  eq(BIBLE.characterCard.map((s) => s.label), ['Who', 'Drive', 'Make-up', 'Change', 'Ties'], 'the character card sections');
  eq(S.bibleFields('world', 'short').map((f) => f.key), ['s5_loc', 's5_time', 's5_anchors', 's5_rules', 's7_era', 's7_duration'],
    'a short film uses its own world keys, then the feature keys it has no counterpart for');
  eq(S.bibleFields('world', 'feature').map((f) => f.ns), ['feature', 'feature', 'feature', 'feature', 'feature'], 'a feature uses the feature blob');
  eq(S.bibleFields('stakes', 'short').map((f) => [f.ns, f.key]), [['feature', 's3_ext'], ['feature', 's3_int']], 'a short has no stakes keys of its own: the feature ones');
}

/* ---- the film index is a faithful copy ---------------------------- */
{
  const studies = JSON.parse(readFileSync(new URL('../src/data/studies.json', import.meta.url), 'utf8'));
  eq(BIBLE.films, studies.films.map((f) => ({ slug: f.meta.slug, title: f.meta.title, year: f.meta.year, director: f.meta.director, genre: f.meta.genre })),
    'story-bible.json `films` matches studies.json meta (the picker draws from the copy so first paint skips the studies)');
  const fav = src('../src/ui/fav-film.js');
  const ds = /const DEMO_KEY = '([^']+)'/.exec(src('../src/lib/studies.js'));
  ok(ds && fav.includes(`const DEMO_KEY = '${ds[1]}'`), 'fav-film.js reads the same device key studies.js writes');
  ok(!/^import .*studies\.js/m.test(fav) && /import\('\.\.\/lib\/studies\.js'\)/.test(fav), 'studies.js is imported lazily, never statically, by the picker');
}

/* ---- the story model -------------------------------------------- */
reset();
eq([S.loadStory().conflicts, S.loadStory().conflictLine], [[], ''], 'conflicts default to [] and the line to ""');
{
  const s = S.loadStory();
  s.conflicts = ['self']; s.conflictLine = 'Him against himself.';
  S.saveStory(s);
  const back = S.loadStory();
  eq([back.conflicts, back.conflictLine], [['self'], 'Him against himself.'], 'conflicts are stored in fms_story_v1 and read back');
  ok(mem.has('fms_story_v1'), 'in the story key, not a new one');
}

/* ---- characters: new fields, no migration ------------------------ */
reset();
{
  mem.set(C.CHARACTERS_KEY, JSON.stringify([{ id: 'old1', name: 'ANBU', aliases: [], age: '30s', want: 'a job', need: 'rest', arc: '', voice: '', contactId: '' }]));
  const [old] = C.loadCharacters();
  eq([old.role, old.look, old.stakes, old.fear, old.lie, old.flaw, old.strength, old.wound, old.secret, old.arcStart, old.arcEnd, old.relationships],
    ['', '', '', '', '', '', '', '', '', '', '', []], 'a record from before the Bible reads back blank new fields');
  eq([old.want, old.need, old.age], ['a job', 'rest', '30s'], 'and keeps what it had');
  eq(C.blankCharacter({ role: 'wizard' }).role, '', 'an unknown role reads as none');
  eq(C.blankCharacter({ relationships: [{ who: 'MEENA', how: 'sister' }, null, 'x'] }).relationships, [{ who: 'MEENA', how: 'sister' }], 'relationships are {who, how} pairs');
  eq(C.CHARACTERS_KEY, 'fms_characters_v1', 'the key is unchanged');
}

/* ---- a blueprint answer already there: the virtual protagonist -- */
reset();
mem.set(BP.blobKey('feature'), JSON.stringify({ s4_name: 'Ravi', s4_want: 'to win the race', s4_lie: 'money is safety', s9_other: 'keep' }));
{
  const list = C.loadCharacters();
  const views = C.characterViews(list, 'feature');
  eq(views.length, 1, 'an old blueprint with a protagonist shows one card');
  const v = views[0];
  ok(v.virtual && v.role === 'protagonist' && v.id === 'bp:protagonist', 'a virtual protagonist card');
  eq([v.name, v.want, v.lie], ['RAVI', 'to win the race', 'money is safety'], 'old s4_name, s4_want, s4_lie show in the card model');
  ok(!mem.has(C.CHARACTERS_KEY) || C.loadCharacters().length === 0, 'showing it stored nothing');

  // editing a field the blueprint has no key for makes it a record
  const r = C.setField(list, v, 'fear', 'heights');
  ok(r.listChanged && list.length === 1 && list[0].role === 'protagonist', 'the first edit of a non-blueprint field makes a real record');
  eq([list[0].fear, list[0].want, list[0].name, list[0].lie], ['heights', '', '', ''], 'the record holds ONLY the non-blueprint field');
  C.saveCharacters(list);
  const raw = mem.get(C.CHARACTERS_KEY);
  ok(!/to win the race/.test(raw) && !/money is safety/.test(raw) && !/Ravi|RAVI/.test(raw), 'the blueprint answers are not copied into fms_characters_v1');
  // …and now it is the protagonist's own card
  const after = C.characterViews(C.loadCharacters(), 'feature');
  eq(after.length, 1, 'still one card (the record replaced the virtual one)');
  eq([after[0].name, after[0].want, after[0].fear, !!after[0].virtual], ['RAVI', 'to win the race', 'heights', false], 'blueprint answers + record field, one card');
}

/* ---- writes go where the field lives ----------------------------- */
{
  const list = C.loadCharacters();
  const view = C.characterViews(list, 'feature')[0];
  const r = C.setField(list, view, 'want', 'to win the whole league');
  ok(!r.listChanged, 'a blueprint-backed field does not touch the stored list');
  eq(blob('feature').s4_want, 'to win the whole league', 'protagonist want is written to s4_want in the blueprint blob');
  eq(blob('feature').s9_other, 'keep', 'the rest of the blueprint blob is untouched');
  eq(C.loadCharacters()[0].want, '', 'and the character record still has no want');
  const map = { name: 's4_name', age: 's4_age', want: 's4_want', need: 's4_need', lie: 's4_lie', wound: 's4_wound', strength: 's4_skill', flaw: 's4_flaw', arc: 's4_arc' };
  for (const [f, key] of Object.entries(map)) {
    const v = C.characterViews(C.loadCharacters(), 'feature')[0];
    C.setField(list, v, f, 'v-' + f);
    eq(blob('feature')[key], 'v-' + f, `protagonist ${f} → ${key}`);
  }
  ok(!/v-(age|need|lie|wound|strength|flaw|arc)/.test(mem.get(C.CHARACTERS_KEY) || ''), 'none of them leaked into the record');
  C.setExtra(C.slotSpec('antagonist', 'feature').extras[0], 'order must hold');
  eq(blob('feature').s5_philosophy, 'order must hold', 'an extra prompt writes its blueprint key (s5_philosophy)');
}

/* ---- the short film's own keys ------------------------------------ */
reset();
mem.set(BP.blobKey('short'), JSON.stringify({ s3_name: 'Ravi, 38, divorced father', s3_want: 'teach her to ride', s3_obstacle: 'she does not trust him' }));
mem.set(BP.blobKey('feature'), JSON.stringify({ s4_need: 'forgiveness' }));
{
  const list = [];
  const [v] = C.characterViews(list, 'short');
  eq([v.name, v.nameRaw, v.want], ['RAVI', 'Ravi, 38, divorced father', 'teach her to ride'], 'short: s3_name and s3_want; the cue name is what comes before the comma');
  eq(v.extras.map((x) => x.key), ['s3_obstacle', 's3_show', 's3_turn'], 'short: obstacle, show and turn are extra prompts');
  eq(v.extras[0].value, 'she does not trust him', '…with their stored values');
  C.setField(list, v, 'want', 'to let her fall');
  eq(JSON.parse(mem.get(BP.blobKey('short'))).s3_want, 'to let her fall', 'short want is written to s3_want');
  const nd = C.viewFor(list, 'bp:protagonist', 'RAVI', 'short');
  eq(nd.backed.need, { ns: 'feature', key: 's4_need' }, 'a short project falls back to the feature key where the short blueprint has none');
  eq(nd.need, 'forgiveness', '…and reads it');
}

/* ---- roles: one protagonist, one antagonist ----------------------- */
reset();
mem.set(BP.blobKey('feature'), JSON.stringify({ s4_name: 'Ravi', s4_want: 'the race', s5_name: 'Kumar', s5_want: 'the crown', s5_philosophy: 'might is right' }));
{
  const list = [C.blankCharacter({ id: 'a', name: 'MEENA', want: 'a quiet life', look: 'tall' }), C.blankCharacter({ id: 'b', name: 'ANBU', role: 'ally' })];
  // Meena becomes the protagonist while the blueprint's virtual protagonist (Ravi) exists: confirm, then move
  let asked = '';
  const decline = C.assignRole(list, C.viewFor(list, 'a', 'MEENA', 'feature'), 'protagonist', { format: 'feature', confirm: (m) => { asked = m; return false; } });
  ok(!decline.ok && /RAVI is your protagonist/.test(asked), 'taking the role from the current protagonist asks first');
  eq([list[0].role, blob('feature').s4_name], ['', 'Ravi'], 'declined: nothing moved');
  const yes = C.assignRole(list, C.viewFor(list, 'a', 'MEENA', 'feature'), 'protagonist', { format: 'feature', confirm: confirmYes });
  ok(yes.ok && yes.moved && list[0].role === 'protagonist', 'accepted: the role moves');
  ok(list.some((c) => c.name === 'RAVI' && c.want === 'the race'), 'the old protagonist keeps their blueprint answers on their own record');
  eq([blob('feature').s4_name, blob('feature').s4_want], ['MEENA', 'a quiet life'], 'the new protagonist\'s name and want moved INTO the blueprint (stored once)');
  eq([list[0].name, list[0].want, list[0].look], ['', '', 'tall'], '…and out of the record; the non-blueprint field stays');
  eq(list.filter((c) => c.role === 'protagonist').length, 1, 'exactly one protagonist');
  // antagonist: Kumar is only in the blueprint, so he is a virtual card, and still holds the role
  ok(C.characterViews(list, 'feature').some((v) => v.virtual && v.role === 'antagonist' && v.name === 'KUMAR'), 'the blueprint\'s antagonist shows as a virtual card too');
  const noAnta = C.assignRole(list, C.viewFor(list, 'b', 'ANBU', 'feature'), 'antagonist', { format: 'feature', confirm: () => false });
  ok(!noAnta.ok && list[1].role === 'ally', 'declined: ANBU stays the ally');
  const anta = C.assignRole(list, C.viewFor(list, 'b', 'ANBU', 'feature'), 'antagonist', { format: 'feature', confirm: confirmYes });
  ok(anta.ok && anta.moved, 'accepted: the antagonist role moves to ANBU');
  ok(list.some((c) => c.name === 'KUMAR' && c.want === 'the crown'), 'Kumar keeps his blueprint answers on his own record');
  eq([blob('feature').s5_name, blob('feature').s5_want], ['ANBU', ''], 'the blueprint slot now belongs to ANBU (name moved in, want blank)');
  eq(blob('feature').s5_philosophy, 'might is right', 'the antagonist extras stay with the role');
  // ally: the first one owns the blueprint slot, a second is plain
  const l2 = [C.blankCharacter({ id: 'x', name: 'ONE', role: 'ally' }), C.blankCharacter({ id: 'y', name: 'TWO', role: 'ally' })];
  ok(C.isSlotOwner(l2, l2[0]) && !C.isSlotOwner(l2, l2[1]), 'the first ally owns step 06; a second ally is a plain record');
  C.setField(l2, C.viewFor(l2, 'x', 'ONE', 'feature'), 'name', 'Anbu');
  eq(blob('feature').s6_ally_name, 'Anbu', 'ally name → s6_ally_name');
  C.setField(l2, C.viewFor(l2, 'y', 'TWO', 'feature'), 'want', 'to leave');
  eq(l2[1].want, 'to leave', 'a second ally\'s want is on its record');
}

/* ---- derived, never stored ---------------------------------------- */
reset();
{
  const els = [
    { id: 1, type: 'scene', text: 'INT. TEA STALL - DAY' }, { id: 2, type: 'character', text: 'MEENA' }, { id: 3, type: 'dialogue', text: 'Not today, I said.' },
    { id: 4, type: 'scene', text: 'EXT. ROAD - NIGHT' }, { id: 5, type: 'character', text: 'ANBU (V.O.)' }, { id: 6, type: 'dialogue', text: 'One more time please.' },
    { id: 7, type: 'character', text: 'MEENA' }, { id: 8, type: 'dialogue', text: 'Go.' }
  ];
  const list = [C.blankCharacter({ id: 'a', name: 'MEENA' })];
  const roster = C.buildRoster(list, els, 'feature');
  eq(roster.map((c) => [c.name, !!c.derived]), [['MEENA', false], ['ANBU', true]], 'script speakers appear as derived characters');
  const st = C.rosterStats(roster, els);
  eq(st.get('a').first, { heading: 'INT. TEA STALL - DAY', sceneNo: 1 }, 'first appearance is derived from the script');
  eq([st.get('a').scenes, st.get('a').lines, st.get('a').words], [2, 2, 5], 'scenes, lines and words for a speaker');
  eq(C.firstAppearances(els).get('ANBU').sceneNo, 2, 'ANBU first speaks in scene 2');
  const adopted = C.setField(list, roster[1], 'fear', 'the dark');
  ok(adopted.listChanged && list.length === 2 && list[1].name === 'ANBU', 'typing into a derived row adopts it');
}

/* ---- the path knows the Bible ------------------------------------- */
reset();
{
  const st = S.blankStory();
  ok(!S.bibleStatus(st).any && !S.pathProgress(st, { scenes: [] }).find((p) => p.id === 'bible').done, 'an empty project: the Bible step is empty');
  BP.writeFields('feature', { s7_location: 'Chennai' });
  ok(S.bibleStatus(st).cards.world && S.pathProgress(st, { scenes: [] }).find((p) => p.id === 'bible').done, 'any blueprint-held bible field ticks the step');
  reset();
  ok(S.bibleStatus({ ...st, conflicts: ['time'] }).cards.conflict, 'a chosen conflict ticks it');
  ok(S.bibleStatus({ ...st, conflictLine: ' x ' }).cards.conflict, '…and so does the one-line version');
  reset();
  mem.set(C.CHARACTERS_KEY, JSON.stringify([{ id: 'z', name: 'KAVYA' }]));
  ok(S.bibleStatus(st).cards.characters, 'a stored character ticks Characters');
  reset();
  BP.writeFields('feature', { s4_want: 'x' });
  ok(S.bibleStatus(st).cards.characters, 'a blueprint protagonist answer ticks Characters');
  eq(S.pathProgress(st, { scenes: [] }).find((p) => p.id === 'bible').detail, '1 of 5 cards', 'the detail says how many cards');
}

/* ---- nothing runs without an event -------------------------------- */
{
  const before = mem.size;
  S.pathProgress(S.blankStory(), { scenes: [] }); S.bibleStatus(S.blankStory()); C.characterViews([], 'feature');
  eq(mem.size, before, 'deriving the path, the Bible status and the roster writes nothing');
}

/* ---- the favourite film survives a backup ------------------------- */
{
  const b = src('../src/lib/backup.js');
  ok(/fav:\s+meta\.fav/.test(b), 'the importer carries `fav` across with title and format (both paths)');
  ok((b.match(/fav:\s+meta\.fav/g) || []).length === 2, '…for a replaced project and for a created one');
  ok(/Store\.listAllProjects\(\)/.test(b), 'the exporter writes the whole project entry, so `fav` is in the file');
  const st = src('../src/lib/store.js');
  ok(/if \(isFavSlug\(meta\.fav\)\) project\.fav = meta\.fav/.test(st), 'createProject stamps a valid fav');
  ok(!/fms_fav|fav_v1/.test(st), 'the favourite is a field on the project entry, not a new storage key');
}

/* ---- registered ---------------------------------------------------- */
{
  const pkg = JSON.parse(src('../package.json'));
  ok(pkg.scripts['test:bible'] === 'node scripts/test-bible.mjs', 'test:bible is registered');
  ok(/npm run test:bible/.test(pkg.scripts['test:all']), 'and is in test:all');
}

console.log(`${fail ? '✗' : '✓'} story bible: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
