/* ============================================================
   AI RUN ALL — the plan (PURE)
   ------------------------------------------------------------
   "Run all" asks every ticked AI tool for a draft in one press, in the
   background, and keeps each answer as a DRAFT (src/lib/ai-drafts.js)
   until somebody accepts it. This file decides WHAT runs: one node per
   draft, in two waves.

     wave 1  reads only the project as it is now
     wave 2  reads what a wave-1 draft WOULD write, before anybody has
             accepted it: blocking is staged on the drafted shots
             (temporary ids 'draft:<n>'), the budget is estimated from
             the drafted shoot order, frames are drawn for drafted
             shots. A wave-2 node names its parent; the engine starts
             it the moment the parent's draft is ready.

   PURE: it takes a snapshot of the project (ai-run-all.js
   projectState() builds it from the models) and returns nodes. No
   storage, no document, no model call. A tool that cannot run on this
   project is still a node, with `skip` saying why in the writer's
   words, so the run-all list shows every tool it was asked for — a
   list of only what ran reads the same whether a tool was not needed
   or the check stopped working.

   project = {
     scriptScenes   scene headings in the script
     scenes         [{ id, number, shots }]  shots = real shots now
     shootable      scenes the board may move (shoot-order's facts)
     places         places with blank recce fields (recce-notes' facts)
     characters     characters with a blank arc field (character-arcs')
     callSheets     [{ id, title, notes }]   notes true when written
     board          { ok, text }             the Drive gate (board-frames)
   }
   ============================================================ */

export const WAVE1 = ['breakdown-tags', 'scene-notes', 'genre-comps', 'shot-draft', 'shoot-order', 'recce-notes', 'character-arcs'];
export const WAVE2 = ['blocking-draft', 'budget-estimate', 'callsheet-notes', 'board-frames'];

/** board-frames costs pictures and needs Drive: it runs only when ticked
    by name, never by default. */
export const OPT_IN = ['board-frames'];

export const LABELS = {
  'breakdown-tags': 'Breakdown tags',
  'scene-notes': 'Scene notes',
  'genre-comps': 'Genre and comparables',
  'shot-draft': 'Shot division',
  'shoot-order': 'Shoot order',
  'recce-notes': 'Recce ideas',
  'character-arcs': 'Character arcs',
  'blocking-draft': 'Blocking',
  'budget-estimate': 'Budget estimate',
  'callsheet-notes': 'Call sheet notes',
  'board-frames': 'Storyboard frames'
};

/** A temporary shot id for the n-th item of a shot-draft result. */
export const draftShotId = (n) => 'draft:' + n;
export const isDraftId = (s) => /^draft:\d+$/.test(String(s || ''));

/** The ticks as a Set of task ids. An array, a Set or {id: bool}; absent
    means every tool but the opt-in ones. */
export function tickSet(ticks) {
  if (ticks == null) return new Set([...WAVE1, ...WAVE2].filter((id) => !OPT_IN.includes(id)));
  if (ticks instanceof Set) return new Set([...ticks].map(String));
  if (Array.isArray(ticks)) return new Set(ticks.map(String));
  if (typeof ticks === 'object') return new Set(Object.keys(ticks).filter((k) => ticks[k]));
  return new Set();
}

const num = (s) => 'Sc ' + (String((s && s.number) || '').trim() || '?');

/**
 * planRun({ ticks, project }) → { nodes: [{ key, taskId, label, ctx, wave,
 *   parents: [key], needsParent?, skip? }] }
 * Nodes come in wave order, wave 1 first; `skip` is a sentence when the
 * tool cannot run on this project. `needsParent` marks a node that has
 * nothing to read unless its parent's draft is ready (blocking on a
 * scene whose only shots are drafted ones).
 */
export function planRun({ ticks, project } = {}) {
  const want = tickSet(ticks);
  const p = project && typeof project === 'object' ? project : {};
  const scenes = Array.isArray(p.scenes) ? p.scenes : [];
  const sheets = Array.isArray(p.callSheets) ? p.callSheets : [];
  const script = Number(p.scriptScenes) || 0;
  const nodes = [];
  const add = (n) => { nodes.push({ wave: 1, parents: [], ctx: {}, label: LABELS[n.taskId], ...n }); return n; };
  const live = (key) => nodes.some((n) => n.key === key && !n.skip);

  /* ---- wave 1 ---- */
  const noScript = script ? undefined : 'The script has no scene headings yet, so there is nothing to read.';
  for (const id of ['breakdown-tags', 'scene-notes', 'genre-comps']) {
    if (want.has(id)) add({ key: id, taskId: id, skip: noScript });
  }
  let drafted = [];
  if (want.has('shot-draft')) {
    drafted = scenes.filter((s) => !(Number(s.shots) > 0)).map((s) => String(s.id));
    add({
      key: 'shot-draft', taskId: 'shot-draft', ctx: { sceneIds: drafted },
      skip: !scenes.length ? 'There are no scenes on the breakdown yet.'
        : !drafted.length ? 'Every scene already has shots, so there is nothing to divide.' : undefined
    });
    if (!live('shot-draft')) drafted = [];
  }
  if (want.has('shoot-order')) {
    add({ key: 'shoot-order', taskId: 'shoot-order',
      skip: Number(p.shootable) > 0 ? undefined : 'There are no scenes the board can move yet.' });
  }
  if (want.has('recce-notes')) {
    add({ key: 'recce-notes', taskId: 'recce-notes', ctx: { locationName: '' },
      skip: Number(p.places) > 0 ? undefined : 'Every place already has its recce fields, or no scene names a location yet.' });
  }
  if (want.has('character-arcs')) {
    add({ key: 'character-arcs', taskId: 'character-arcs',
      skip: Number(p.characters) > 0 ? undefined : 'Every character already has an arc, a start and an end, or no one is named yet.' });
  }

  /* ---- wave 2 ---- */
  const draftedSet = new Set(drafted);
  if (want.has('blocking-draft')) {
    const targets = scenes.filter((s) => Number(s.shots) > 0 || draftedSet.has(String(s.id)));
    if (!targets.length) {
      add({ key: 'blocking-draft', taskId: 'blocking-draft', wave: 2, skip: 'No scene has shots to block yet.' });
    }
    for (const s of targets) {
      const onDraft = draftedSet.has(String(s.id));
      add({
        key: 'blocking-draft:' + s.id, taskId: 'blocking-draft', wave: 2,
        label: LABELS['blocking-draft'] + ' · ' + num(s), ctx: { sceneId: String(s.id) },
        parents: onDraft ? ['shot-draft'] : [], needsParent: onDraft || undefined
      });
    }
  }
  if (want.has('budget-estimate')) {
    add({
      key: 'budget-estimate', taskId: 'budget-estimate', wave: 2,
      parents: live('shoot-order') ? ['shoot-order'] : [],
      skip: scenes.length ? undefined : 'There are no scenes yet, so there is no schedule to estimate from.'
    });
  }
  if (want.has('callsheet-notes')) {
    if (!sheets.length) add({ key: 'callsheet-notes', taskId: 'callsheet-notes', wave: 2, skip: 'There are no call sheets yet.' });
    for (const sh of sheets) {
      add({
        key: 'callsheet-notes:' + sh.id, taskId: 'callsheet-notes', wave: 2,
        label: LABELS['callsheet-notes'] + ' · ' + (String(sh.title || '').trim() || 'Untitled sheet'),
        ctx: { sheetId: String(sh.id) },
        skip: sh.notes ? 'Notes are already written on this sheet.' : undefined
      });
    }
  }
  if (want.has('board-frames')) {
    const board = p.board && typeof p.board === 'object' ? p.board : { ok: false, text: '' };
    const hasShots = scenes.some((s) => Number(s.shots) > 0) || live('shot-draft');
    add({
      key: 'board-frames', taskId: 'board-frames', wave: 2,
      parents: live('shot-draft') ? ['shot-draft'] : [],
      skip: !board.ok ? (String(board.text || '').trim() || 'Connect Google Drive first: drawn frames are kept there.')
        : !hasShots ? 'There are no shots to draw yet.' : undefined
    });
  }
  for (const n of nodes) if (n.skip === undefined) delete n.skip;
  return { nodes };
}

export default { WAVE1, WAVE2, OPT_IN, LABELS, planRun, tickSet, draftShotId, isDraftId };
