/* ============================================================
   STICKY NOTES — the model and the vault writes, in Node
   ------------------------------------------------------------
   src/lib/notes-model.js is pure; src/lib/story.js's addNoteToVault,
   moveInVault and restoreToVault write the Idea Vault array the notes
   share with the clippings (owner, 23 Oct 2026: sticky notes, no new
   key). Asserted here, no browser.

       node scripts/test-notes.mjs      (or: npm run test:notes)
   ============================================================ */
import { mem } from './node-seams.mjs';

const N = await import('../src/lib/notes-model.js');
const S = await import('../src/lib/story.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- the model --------------------------------------------- */
eq(N.makeNote('   '), null, 'empty text makes no note');
const a = N.makeNote('  The lift is broken  ', { color: 'pink' }, 5);
eq([a.kind, a.snippet, a.color, a.beat, a.sceneId, a.at], ['note', 'The lift is broken', 'pink', '', '', 5], 'a note: trimmed text, its colour, no pin');
ok(typeof a.id === 'string' && a.id.length > 6, 'a note has an id');
eq(N.makeNote('x', { color: '#ff0000' }).color, 'yellow', 'a colour is a name from COLORS, never a hex');
eq(N.makeNote('y'.repeat(5000)).snippet.length, N.MAX_TEXT, 'text is capped');
eq(N.pinPatch('scene:s1'), { sceneId: 's1', beat: '' }, 'a scene pin clears the beat');
eq(N.pinPatch('beat:short_five:turn'), { beat: 'short_five:turn', sceneId: '' }, 'a beat pin clears the scene');
eq(N.pinPatch(''), { beat: '', sceneId: '' }, 'unpinning clears both');
eq(N.pinValue({ sceneId: 's1', beat: 'x:y' }), 'scene:s1', 'a scene pin wins the select');
const items = [{ id: '1', kind: 'note', snippet: 'a', beat: 'f:b' }, { id: '2', snippet: 'clip' }, { id: '3', kind: 'note', snippet: 'c', sceneId: 's9', color: 'blue' }];
eq(N.moveItem(items, '3', 0).map((x) => x.id), ['3', '1', '2'], 'move to the top');
eq(N.moveItem(items, '1', 99).map((x) => x.id), ['2', '3', '1'], 'a move past the end is clamped');
ok(N.moveItem(items, '2', 1) === items, 'a move to the same place returns the same array');
ok(N.moveItem(items, 'nope', 0) === items, 'an unknown id moves nothing');
eq(N.notesFor(items, { sceneId: 's9' }).map((x) => x.id), ['3'], 'the notes pinned to a scene');
eq(N.notesFor(items, { beat: 'f:b' }).map((x) => x.id), ['1'], 'the notes pinned to a beat');
eq(N.pinCounts(items), { 'beat:f:b': 1, 'scene:s9': 1 }, 'pin counts, clippings never counted');
eq(N.filterBoard(items, 'clips').map((x) => x.id), ['2'], 'the Clippings filter');
eq(N.filterBoard(items, 'notes').map((x) => x.id), ['1', '3'], 'the Notes filter');
eq(N.filterBoard(items, 'blue').map((x) => x.id), ['3'], 'a colour filter');
eq(N.hereFirst(items, { sceneId: 's9' }).map((x) => x.id), ['3', '1'], 'the pinned notes first, then the rest, no clippings');

/* ---- undo of an append: never drops writing done since ------ */
eq(N.undoAppend('A.\n\nNote', 'A.', 'A.\n\nNote'), 'A.', 'an untouched append undoes to the text before it');
eq(N.undoAppend('A.\n\nNote MORE.', 'A.', 'A.\n\nNote'), 'A. MORE.', 'writing typed after the append survives its undo');
eq(N.undoAppend('X A.\n\nNote', 'A.', 'A.\n\nNote'), 'X A.', 'writing typed before it survives too');
eq(N.undoAppend('A.\n\nNo, changed', 'A.', 'A.\n\nNote'), null, 'an appended part since edited is not undone (null)');
eq(N.undoAppend('A.\n\nNotebook', 'A.', 'A.\n\nNote'), null, 'the appended part run into a longer word is not cut');
eq(N.undoAppend('Breakfast.\nKettle\nLATER EDIT', 'Breakfast.', 'Breakfast.\nKettle'), 'Breakfast.\nLATER EDIT', 'a scene synopsis keeps its later edit');
eq(N.undoAppend('Note', '', 'Note'), '', 'an append to an empty synopsis undoes to empty');

/* ---- the vault writes ---------------------------------------- */
mem.clear();
S.addToVault({ snippet: 'a clipping', url: 'https://example.com/x' });
const n1 = N.makeNote('first note', { color: 'green' });
ok(S.addNoteToVault(n1) === n1, 'a note goes into the vault');
eq(S.listVault().map((x) => x.snippet), ['first note', 'a clipping'], 'newest first, beside the clippings');
ok(S.addNoteToVault(n1) === null, 'the same id twice is a no-op');
/* Another tab wrote a field this build does not know: it survives. */
const raw = JSON.parse(mem.get(S.VAULT_KEY));
raw[0].futureField = 42;
mem.set(S.VAULT_KEY, JSON.stringify(raw));
S.updateVault(n1.id, { color: 'violet' });
eq([S.listVault()[0].color, S.listVault()[0].futureField], ['violet', 42], 'an update keeps fields it does not know');
const n2 = N.makeNote('second');
S.addNoteToVault(n2);
ok(S.moveInVault(n2.id, 2), 'a move writes');
eq(S.listVault().map((x) => x.snippet), ['first note', 'a clipping', 'second'], 'the board order is the array order');
ok(S.moveInVault(n2.id, 2) === false, 'a move to the same place writes nothing');
const gone = S.listVault()[0];
S.removeFromVault(gone.id);
ok(S.restoreToVault(gone, 0), 'undo puts a note back');
eq(S.listVault()[0], gone, 'at its old place, every field kept');
ok(S.restoreToVault(gone, 0) === false, 'undo twice does not duplicate');

console.log(fail ? `✗ notes: ${pass} passed, ${fail} failed` : `✓ notes: ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
