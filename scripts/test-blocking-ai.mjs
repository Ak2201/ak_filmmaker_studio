#!/usr/bin/env node
/* ============================================================
   TEST — AI blocking's pure half (src/lib/blocking-ai-model.js), in Node
   ------------------------------------------------------------
       node scripts/test-blocking-ai.mjs   (or: npm run test:blocking-ai)

   No browser and no provider: every check on a model's reply (clamps,
   unknown kinds, charIds, caps, enhance ops), the prompts and schemas,
   applyBlockOps, and that the vocabulary agrees with shots.js. The two
   Desk tasks are checked to be registered in ai-tasks.js by id.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { mem } from './node-seams.mjs';

const M = await import('../src/lib/blocking-ai-model.js');
const S = await import('../src/lib/shots.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const throwsMalformed = (fn, m) => {
  try { fn(); ok(false, m + ' (did not throw)'); }
  catch (e) { ok(e && e.kind === 'malformed' && !(e instanceof TypeError) && /nothing/i.test(e.message), m + ' — ' + (e && e.message)); }
};
void mem;

/* ---- the vocabulary agrees with shots.js ------------------------ */
eq(M.BLOCK_W, S.BLOCK_W, 'BLOCK_W matches shots.js');
eq(M.BLOCK_H, S.BLOCK_H, 'BLOCK_H matches shots.js');
eq(M.MARK_KINDS.slice(), S.BLOCK_KINDS.map((k) => k.id), 'MARK_KINDS match shots.js BLOCK_KINDS');
if (Array.isArray(S.SET_KINDS)) eq(M.SET_KINDS.slice(), S.SET_KINDS.map((k) => (typeof k === 'string' ? k : k.id)), 'SET_KINDS match shots.js');
else ok(M.SET_KINDS.length === 11 && M.SET_KINDS.at(-1) === 'prop', 'SET_KINDS fallback is the contract list (shots.js has none yet)');
if (S.BLOCK_WIDTH_MAX_M) eq(M.WIDTH_MAX_M, S.BLOCK_WIDTH_MAX_M, 'WIDTH_MAX_M matches shots.js');

/* ---- marks ------------------------------------------------------- */
const chars = ['ch1', 'ch2'];
let m = M.cleanAIMark({ kind: 'actor', label: ' MEENA ', x: -10, y: 999, rot: 450, hasMove: true, toX: 150, toY: -5,
  path: [{ x: 20, y: 20, beat: 'she hears the door' }], curve: true, charId: 'ch1' }, { charIds: chars });
eq([m.x, m.y, m.rot, m.toX, m.toY], [0, 70, 90, 100, 0], 'mark: coordinates clamped into the map, rot wrapped');
eq(m.label, 'MEENA', 'mark: label trimmed');
eq(m.charId, 'ch1', 'mark: a supplied charId is kept');
eq(m.path, [{ x: 20, y: 20, beat: 'she hears the door' }], 'mark: path kept after the first leg');
ok(m.curve === true, 'mark: curve kept on a move');
eq(M.cleanAIMark({ kind: 'actor', x: 1, y: 1, charId: 'nobody' }, { charIds: chars }).charId, '', 'mark: an unknown charId is dropped');
eq(M.cleanAIMark({ kind: 'camera', x: 1, y: 1, charId: 'ch1' }, { charIds: chars }).charId, '', 'mark: only an actor carries a charId');
eq(M.cleanAIMark({ kind: 'dragon', x: 1, y: 1 }), null, 'mark: an unknown kind is dropped');
eq(M.cleanAIMark('junk'), null, 'mark: a non-object is dropped');
m = M.cleanAIMark({ kind: 'actor', x: 'abc', y: null, rot: 'x' });
eq([m.x, m.y, m.rot, m.toX], [50, 35, 0, null], 'mark: junk numbers fall back to the centre, no move');
m = M.cleanAIMark({ kind: 'actor', x: 12.345, y: 6.789, hasMove: false, toX: 0, toY: 0, path: [], curve: true });
eq([m.x, m.y, m.toX, m.toY, m.curve], [12.3, 6.8, null, null, false], 'mark: hasMove false means no move, no curve; rounded to a tenth');
m = M.cleanAIMark({ kind: 'actor', x: 10, y: 10, hasMove: false, path: [{ x: 30, y: 30, beat: 'a' }, { x: 40, y: 40, beat: 'b' }] });
eq([m.toX, m.toY, m.path.length, m.path[0].beat], [30, 30, 1, 'b'], 'mark: stops with no first leg — the first stop becomes the leg');
m = M.cleanAIMark({ kind: 'actor', x: 10, y: 10, hasMove: true, toX: 20, toY: 20,
  path: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i, beat: 'b' + i })) });
eq(m.path.length, M.MAX_BEATS, 'mark: path capped at MAX_BEATS');
m = M.cleanAIMark({ kind: 'track', x: 10, y: 10, hasMove: false, path: [{ x: 1, y: 1, beat: '' }] });
eq([m.toX, m.toY, m.path], [34, 10, []], 'track: always two ends, never a path');

/* ---- set pieces and the axis ------------------------------------- */
let p = M.cleanAIPiece({ kind: 'table', label: 'Dining', x: 200, y: -3, w: 0, h: 500, rot: -90 });
eq([p.kind, p.x, p.y, p.w, p.h, p.rot], ['table', 100, 0, 1, 70, 270], 'piece: clamped, w/h within 1..map, rot wrapped');
eq(M.cleanAIPiece({ kind: 'spaceship', x: 1, y: 1, w: 2, h: 2 }).kind, 'prop', 'piece: unknown kind → prop');
eq(M.cleanAIPiece(null), null, 'piece: junk dropped');
eq(M.cleanAIAxis({ on: true, x1: -1, y1: 10, x2: 120, y2: 10 }), { x1: 0, y1: 10, x2: 100, y2: 10 }, 'axis: clamped');
eq(M.cleanAIAxis({ on: false, x1: 0, y1: 0, x2: 10, y2: 10 }), null, 'axis: on false is no line');
eq(M.cleanAIAxis({ on: true, x1: 5, y1: 5, x2: 5, y2: 5 }), null, 'axis: zero length is no line');
eq(M.cleanAIAxis({ on: true, x1: 'a', y1: 5, x2: 5, y2: 5 }), null, 'axis: junk is no line');
eq([M.cleanWidth(6), M.cleanWidth('7,25'), M.cleanWidth(0), M.cleanWidth(9999), M.cleanWidth('x')], ['6', '7.3', '', '', ''], 'widthM: typed text or blank');

/* ---- a draft ------------------------------------------------------ */
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const d = M.cleanDraft({
  name: 'Master', note: 'Two-hander at the table.', widthM: 6,
  set: many(30, (i) => ({ kind: i === 0 ? 'nope' : 'chair', label: '', x: i, y: i, w: 3, h: 3, rot: 0 })).concat(['junk']),
  marks: many(15, (i) => ({ kind: i === 0 ? 'ghost' : 'actor', label: 'A' + i, x: i, y: i, rot: 0, hasMove: false, toX: 0, toY: 0, path: [], curve: false, charId: 'ch2' })),
  axis: { on: true, x1: 10, y1: 35, x2: 90, y2: 35 }
}, { charIds: chars });
eq(d.marks.length, M.MAX_MARKS, 'draft: marks capped at MAX_MARKS');
eq(d.set.length, M.MAX_SET, 'draft: set capped at MAX_SET');
eq(d.set[0].kind, 'prop', 'draft: unknown set kind became prop');
eq(d.marks[0].label, 'A1', 'draft: the unknown-kind mark was dropped');
eq(d.dropped, 1 + 2 + 1 + 6, 'draft: dropped counted (unknown mark, two over the cap, junk piece, six over the cap)');
eq([d.name, d.widthM, !!d.axis], ['Master', '6', true], 'draft: name, width, axis');
throwsMalformed(() => M.cleanDraft(null), 'draft: null reply → clear malformed error');
throwsMalformed(() => M.cleanDraft('not json'), 'draft: a string → clear malformed error');
throwsMalformed(() => M.cleanDraft({ marks: 'x' }), 'draft: marks not an array → malformed');
throwsMalformed(() => M.cleanDraft({ marks: [{ kind: 'ghost' }, 7, null] }), 'draft: no usable mark → malformed');
const lean = M.cleanDraft({ marks: [{ kind: 'camera', x: 5, y: 5 }] });
eq([lean.set, lean.axis, lean.name, lean.widthM], [[], null, '', ''], 'draft: missing optional parts read as empty');

/* ---- Desk items and picking --------------------------------------- */
const items = M.draftItems(d, { charName: (id) => (id === 'ch2' ? 'RAVI' : '') });
eq(items.length, d.marks.length + d.set.length + 1, 'items: one per mark, per piece, and the line');
ok(items.every((it) => it.id && it.text), 'items: each has an id and a text');
ok(items[0].detail.includes('RAVI'), 'items: an actor names its character');
const picked = M.pickDraft(d, [{ id: 'm0' }, { id: 's1' }, { id: 'axis' }]);
eq([picked.marks.length, picked.set.length, !!picked.axis], [1, 1, true], 'pickDraft: only the ticked parts');
eq(M.pickDraft(d, []).marks.length + M.pickDraft(d, []).set.length, 0, 'pickDraft: nothing ticked, nothing picked');

/* ---- enhance ------------------------------------------------------ */
const block = {
  id: 'bk1', sceneId: 'sc1', name: 'Setup 1', note: '', widthM: '6',
  marks: [
    { id: 'mkA', kind: 'actor', label: 'MEENA', x: 30, y: 30, rot: 90, toX: null, toY: null, path: [], curve: false, charId: 'ch1' },
    { id: 'mkC', kind: 'camera', label: 'Cam A', x: 50, y: 60, rot: 0, toX: null, toY: null, path: [], curve: false, charId: '' }
  ],
  set: [{ id: 'st1', kind: 'table', label: '', x: 50, y: 30, w: 10, h: 6, rot: 0 }],
  axis: null
};
const sug = (o) => ({ text: '', why: '', markId: '', mark: { kind: 'actor', x: 0, y: 0 }, piece: { kind: 'prop', x: 0, y: 0, w: 1, h: 1 }, axis: { on: false, x1: 0, y1: 0, x2: 0, y2: 0 }, ...o });
const e = M.cleanEnhance({
  note: 'Mostly sound.',
  suggestions: [
    sug({ type: 'add-mark', text: 'Add a single on Meena', why: 'Her turn needs it', mark: { kind: 'camera', label: 'Cam B', x: 20, y: 60, rot: 0, hasMove: false } }),
    sug({ type: 'update-mark', markId: 'mkC', mark: { kind: 'actor', label: 'Cam A', x: 45, y: 60, rot: 0, hasMove: false, charId: 'ch1' } }),
    sug({ type: 'update-mark', markId: 'mkA', mark: { kind: 'actor', label: 'MEENA', x: 30, y: 30, rot: 90, hasMove: false, charId: 'ch1' } }),
    sug({ type: 'remove-mark', markId: 'ghost' }),
    sug({ type: 'remove-mark', markId: 'mkA' }),
    sug({ type: 'remove-mark', markId: 'mkA' }),
    sug({ type: 'add-set', piece: { kind: 'door', label: 'Kitchen', x: 0, y: 30, w: 1, h: 8, rot: 0 } }),
    sug({ type: 'set-axis', axis: { on: true, x1: 10, y1: 30, x2: 90, y2: 30 } }),
    sug({ type: 'set-axis', axis: { on: false } }),
    sug({ type: 'explode' }),
    'junk'
  ]
}, { block, charIds: chars });
const types = e.items.map((it) => it.op.type);
eq(types, ['add-mark', 'update-mark', 'remove-mark', 'add-set', 'set-axis'], 'enhance: valid ops kept in order');
const upd = e.items[1].op;
eq([upd.id, upd.patch], ['mkC', { x: 45 }], 'enhance: update is a patch of what changed; kind and charId stay a camera\'s');
ok(e.items.every((it) => it.text), 'enhance: every item has a text (a plain one when the model gave none)');
eq(e.items[0].detail, 'Her turn needs it', 'enhance: the reason is the detail');
eq(e.dropped, 6, 'enhance: dropped = no-op update, unknown id, duplicate, axis-off with no axis, bad type, junk');
eq(e.note, 'Mostly sound.', 'enhance: the note');
const capped = M.cleanEnhance({ note: '', suggestions: many(20, (i) => sug({ type: 'add-set', piece: { kind: 'chair', x: i, y: i, w: 2, h: 2, rot: 0 } })) }, { block });
eq(capped.items.length, M.MAX_OPS, 'enhance: suggestions capped at MAX_OPS');
eq(M.cleanEnhance({ suggestions: [] }, { block }).items, [], 'enhance: an empty list is an honest answer');
throwsMalformed(() => M.cleanEnhance(null, { block }), 'enhance: null reply → malformed');
throwsMalformed(() => M.cleanEnhance({ suggestions: 'x' }, { block }), 'enhance: suggestions not an array → malformed');
eq(M.cleanEnhance({ suggestions: [sug({ type: 'remove-mark', markId: 'mkA' })] }, {}).items, [], 'enhance: no block → nothing names a mark');

/* ---- applyBlockOps ------------------------------------------------ */
const before = JSON.stringify(block);
const { block: after, applied } = M.applyBlockOps(block, e.items.map((it) => it.op));
eq(JSON.stringify(block), before, 'apply: the original block is untouched (it is the undo)');
eq(applied, 5, 'apply: five ops applied');
eq(after.marks.map((x) => x.label), ['Cam A', 'Cam B'], 'apply: Meena removed, Cam B added');
eq(after.marks.find((x) => x.id === 'mkC').x, 45, 'apply: Cam A moved');
ok(after.marks[1].id && after.marks[1].id !== 'mkC', 'apply: a new mark gets a fresh id');
eq(after.set.map((x) => x.kind), ['table', 'door'], 'apply: the door added');
eq(after.axis, { x1: 10, y1: 30, x2: 90, y2: 30 }, 'apply: the line set');
eq(M.applyBlockOps(after, [{ type: 'set-axis', axis: null }]).block.axis, null, 'apply: set-axis null removes the line');
eq(M.applyBlockOps(block, [{ type: 'update-mark', id: 'gone', patch: { x: 1 } }, { type: 'remove-mark', id: 'gone' }, null]).applied, 0, 'apply: ops naming a missing mark are skipped');
const made = M.applyBlockOps({ marks: [] }, [{ type: 'add-mark', mark: { kind: 'actor', x: 1, y: 1 } }], { makeMark: (q) => ({ id: 'given', ...q }) });
eq(made.block.marks[0].id, 'given', 'apply: makeMark gives ids (shots.js blankMark in the app)');
eq(M.applyBlockOps(null, []).block.marks, [], 'apply: no block → an empty one, not a crash');

/* ---- prompts and schemas ----------------------------------------- */
const job = { sceneId: 'sc1', number: '4', slug: 'INT. KITCHEN — NIGHT', synopsis: 'Meena waits.',
  characters: [{ id: 'ch1', name: 'MEENA' }, { id: '', name: 'RAVI' }],
  shots: [{ number: '4A', size: 'WS', lens: '24mm', setup: 'Cam A', description: 'The kitchen' }],
  setups: ['Setup 1: 1 actor, 1 camera (Cam A)'], script: 'INT. KITCHEN - NIGHT\nMeena waits.', prompt: 'She enters from the yard.' };
const dp = M.buildDraftPrompt(job);
ok(dp.includes('ch1 — MEENA') && dp.includes('24mm') && dp.includes('She enters from the yard.') && dp.includes('Setup 1'), 'draft prompt: characters with ids, lenses, the director\'s ask, existing setups');
eq(M.buildDraftPrompt({ ...job, user: 'EDITED BOX', refine: 'Previous answer: …' }), 'EDITED BOX\n\nPrevious answer: …', 'draft prompt: an edited box is sent as is, refine appended');
const ep = M.buildEnhancePrompt({ ...job, block });
ok(ep.includes('mkA actor "MEENA"') && ep.includes('st1 table'), 'enhance prompt: the diagram with its ids');
ok(M.DRAFT_SYSTEM.includes('180°') && /master/i.test(M.DRAFT_SYSTEM) && M.DRAFT_SYSTEM.includes('top'), 'system: the craft and the map');
const ds = M.draftSchema(['ch1']);
eq(ds.properties.marks.items.properties.kind.enum, M.MARK_KINDS.slice(), 'schema: mark kinds enum');
eq(ds.properties.marks.items.properties.charId.enum, ['', 'ch1'], 'schema: charId pinned to the offered ids');
eq(ds.properties.set.items.properties.kind.enum, M.SET_KINDS.slice(), 'schema: set kinds enum');
const strict = (sc) => sc && typeof sc === 'object' && (sc.type !== 'object' || (sc.additionalProperties === false
  && JSON.stringify(Object.keys(sc.properties).sort()) === JSON.stringify(sc.required.slice().sort())
  && Object.values(sc.properties).every(strict))) && (sc.type !== 'array' || strict(sc.items));
ok(strict(ds), 'schema: draft — every object closed and fully required');
const es = M.enhanceSchema(['ch1'], ['mkA', 'mkC']);
ok(strict(es), 'schema: enhance — every object closed and fully required');
eq(es.properties.suggestions.items.properties.markId.enum, ['', 'mkA', 'mkC'], 'schema: markId pinned to the block\'s marks');
eq(es.properties.suggestions.items.properties.type.enum, M.OP_TYPES.slice(), 'schema: op types');

/* ---- registration (by source; ai-tasks.js needs the browser to load) */
const tasksSrc = readFileSync(new URL('../src/lib/ai-tasks.js', import.meta.url), 'utf8');
ok(/id: 'blocking-draft'/.test(tasksSrc) && /id: 'blocking-enhance'/.test(tasksSrc), 'ai-tasks: both tasks defined');
ok(/blockingDraftTask, blockingEnhanceTask\]/.test(tasksSrc), 'ai-tasks: both in ALL_TASKS');
const aiSrc = readFileSync(new URL('../src/lib/ai.js', import.meta.url), 'utf8');
ok(/export async function draftBlocking/.test(aiSrc) && /export async function enhanceBlocking/.test(aiSrc), 'ai.js: draftBlocking and enhanceBlocking exported');
const modelSrc = readFileSync(new URL('../src/lib/blocking-ai-model.js', import.meta.url), 'utf8');
ok(!/^\s*import\b/m.test(modelSrc), 'blocking-ai-model.js stays pure: it imports nothing');

console.log(`test-blocking-ai: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
