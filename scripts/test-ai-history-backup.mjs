#!/usr/bin/env node
/* ============================================================
   test:ai-history (the backup half) — a backup keeps the stamps
   ------------------------------------------------------------
       node scripts/test-ai-history-backup.mjs

   buildBackup() → JSON → applyBackup() against the REAL store.js over an
   in-memory localStorage (the test:backup-apply seam). A stamp is a field
   inside a blob the backup already carries, so it should round trip with
   no code of its own; this proves it, for the blobs an AI Accept writes
   into: shots, scenes, the script, the story, the sticky notes, the
   characters, the call sheets, the locations and the edit log. A stamp is
   CONTENT: it goes in the backup file and syncs, because the history of a
   film is part of the film.
   ============================================================ */
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
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

const mem = new Map();
/* A real Storage prototype, so store.js installs its project proxy: a blob is
   written under its project's key (`fms_scenes_v1__here`), which is what
   buildBackup() reads (the FMS_TEST_PROXY child of test:backup-apply). */
globalThis.Storage = class Storage {
  getItem(k) { return mem.has(k) ? mem.get(k) : null; }
  setItem(k, v) { mem.set(k, String(v)); }
  removeItem(k) { mem.delete(k); }
  key(i) { return [...mem.keys()][i] ?? null; }
  get length() { return mem.size; }
};
globalThis.localStorage = new globalThis.Storage();
globalThis.document = {
  readyState: 'complete', body: null,
  addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; }
};
mem.set('fms_studio_projects_v1', JSON.stringify([{ id: 'here', title: 'Mine', format: 'feature', ns: [''] }]));
mem.set('fms_studio_current_project_v1', 'here');

const Store = (await import('../src/lib/store.js')).default;
const { buildBackup, applyBackup } = await import('../src/lib/backup.js');
const Stamp = await import('../src/lib/ai-stamp.js');
const Shots = await import('../src/lib/shots.js');
const Scenes = await import('../src/lib/scenes.js');
const Script = await import('../src/lib/script.js');
const StoryM = await import('../src/lib/story.js');
const Chars = await import('../src/lib/characters.js');
const Contacts = await import('../src/lib/contacts.js');
const Edit = await import('../src/lib/editlog.js');
const Loc = await import('../src/lib/locations.js');
const Hist = await import('../src/lib/ai-history-read.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const meta = (task, run) => ({ task, model: 'model-x', run, at: '2026-11-02T10:00:00.000Z' });
const m = meta('shot-draft', 'RB'), f = meta('scene-notes', 'RBF');
const both = (kind, rec) => Stamp.stampFill(kind, Stamp.stampAI(kind, rec, m), f, ['x'], 'fill');

/* an open project with a stamp in every blob an Accept writes into */
Shots.saveShots([both('shot', Shots.blankShot({ id: 'sh1', sceneId: 's1', description: 'd' }))]);
Scenes.saveScenes([both('scene', Scenes.blankScene({ id: 'sc1' }))]);
Script.saveScript({ elements: [both('element', Script.blankElement({ id: 'e1', type: 'action', text: 'T' }))], revisions: [], documents: [both('document', Script.blankDocument({ id: 'd1', title: 'Cov' }))] });
const story = StoryM.blankStory();
story.outline = [both('step', { id: 'st1', beat: 'save_the_cat:setup', text: 'S' })];
Object.assign(story, both('story', story));
StoryM.saveStory(story);
StoryM.addNoteToVault(both('note', { id: 'nt1', kind: 'note', snippet: 'n', color: 'yellow', beat: '', sceneId: '', at: 1 }));
Chars.saveCharacters([both('character', Chars.blankCharacter({ id: 'ch1', name: 'Anbu' }))]);
Contacts.saveCallSheets([both('callsheet', Contacts.blankCallSheet({ id: 'cs1' }))]);
Loc.setRecce('Hall', { notes: 'n', ai: m, aiFill: [Stamp.stampFill('recce', { notes: 'n' }, f, ['notes'], 'fill').aiFill[0]] });
Edit.setSceneEdit('sc1', { note: 'n', aiFill: [Stamp.stampFill('edit', { note: 'n' }, f, ['note'], 'fill').aiFill[0]] });

const before = Hist.readProjectAI();
ok(before.length >= 10, 'the project holds stamps to carry (' + before.length + ' entries)');
const stampsOf = (entries) => entries.map((e) => [e.key, e.task, e.model, e.run, e.at, e.mode, e.edited].join('|')).sort();

const file = JSON.parse(JSON.stringify(buildBackup()));
ok(JSON.stringify(file).includes('"run":"RB"'), 'the backup file carries the stamps');

/* wipe, then restore from the file */
for (const k of [...mem.keys()]) if (/__here$/.test(k)) mem.delete(k);
ok(Hist.readProjectAI().length === 0, '(sanity) the project is empty before the restore');
const r = applyBackup(JSON.parse(JSON.stringify(file)), { mode: 'restore', confirm: () => true });
ok(r.ok, 'the restore applies');
const after = Hist.readProjectAI();
eq(stampsOf(after), stampsOf(before), 'a backup round trip keeps every stamp, byte for byte (task, model, run, at, mode, edited)');
ok(after.every((e) => !e.edited), 'no stamp reads edited after the round trip (the hashes still match)');

console.log(`test:ai-history (backup) — ${pass} passed, ${fail} failed`);
void Store;
if (fail) process.exit(1);
