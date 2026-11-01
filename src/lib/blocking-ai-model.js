/* ============================================================
   BLOCKING AI MODEL — the AI blocking draft and enhance, minus the request
   ------------------------------------------------------------
   The AI Desk's two blocking tasks (src/lib/ai-tasks.js
   'blocking-draft' and 'blocking-enhance') ask a model to lay out a
   scene on the overhead blocking map (src/lib/shots.js blocks), or to
   suggest changes to a setup already drawn. This file is the PURE
   half: the system prompts, the two JSON schemas, the user prompts,
   every check on a reply, and the one function that applies ticked
   suggestions to a copy of a block. ai.js composes these around
   callModel(); nothing here reads storage or calls a model, so
   scripts/test-blocking-ai.mjs runs it in Node (npm run
   test:blocking-ai). Same split as audience-model.js, and for the
   same reason: it must NEVER import ai.js.

   THE MAP. 100 units wide (x, left → right) and 70 deep (y, top →
   bottom), origin top-left — the numbers below duplicate
   shots.js BLOCK_W / BLOCK_H, BLOCK_KINDS and SET_KINDS on purpose,
   because shots.js reaches store.js and this file must stay pure. The
   test asserts they agree with shots.js, so a kind added there and
   not here fails the run instead of being silently dropped from every
   AI reply. `rot` is degrees clockwise, 0 = facing up the map.

   TRUST NOTHING. The schema makes the shape very likely and "very
   likely" is not a guarantee a writing tool is built on: every kind
   is checked against the vocabulary, every coordinate clamped into the
   map and rounded to a tenth, every string trimmed and capped, every
   list capped (MAX_*), a charId kept only when it is one of the
   character ids the prompt offered, and an enhance op that names a
   mark not on the block is dropped. A reply that is not the shape at
   all throws an Error with kind 'malformed' (ai.js turns it into its
   AIError), never a TypeError from deep inside a map().
   ============================================================ */

export const BLOCK_W = 100;
export const BLOCK_H = 70;
/** shots.js BLOCK_KINDS ids, in the same order. */
export const MARK_KINDS = Object.freeze(['actor', 'camera', 'track', 'light', 'mark']);
/** shots.js SET_KINDS (the shared blocking contract), in the same order. */
export const SET_KINDS = Object.freeze(['wall', 'door', 'window', 'table', 'chair', 'sofa', 'bed', 'counter', 'car', 'stairs', 'prop']);
export const OP_TYPES = Object.freeze(['add-mark', 'update-mark', 'remove-mark', 'add-set', 'set-axis']);
/** On a shot's diagram the set and the line are the floor's, so these two
    operations are not offered (and are dropped if a reply sends them). */
export const SHOT_OP_TYPES = Object.freeze(['add-mark', 'update-mark', 'remove-mark']);

export const MAX_MARKS = 12;      // a draft's marks; and the most an enhance may add
export const MAX_SET = 24;        // a draft's set pieces
export const MAX_BEATS = 6;       // path beats after the first leg
export const MAX_OPS = 12;        // enhance suggestions
export const MAX_SHOTS = 40;      // shot diagrams in one draft
export const WIDTH_MAX_M = 500;   // shots.js BLOCK_WIDTH_MAX_M

const malformed = (msg) => { const e = new Error(msg); e.kind = 'malformed'; return e; };
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null;   // Number(null) is 0, not "no value"
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
/** A coordinate inside the map, to a tenth; junk falls back to `dflt`. */
const cx = (v, dflt = BLOCK_W / 2) => r1(clamp(num(v) ?? dflt, 0, BLOCK_W));
const cy = (v, dflt = BLOCK_H / 2) => r1(clamp(num(v) ?? dflt, 0, BLOCK_H));
const deg = (v) => ((Math.round(num(v) ?? 0) % 360) + 360) % 360;

/* ---- the prompts --------------------------------------------- */

const MAP_RULES = [
  'THE MAP. An overhead floor plan 100 units wide (x, 0 at the left edge, 100 at',
  'the right) and 70 units deep (y, 0 at the TOP edge, 70 at the bottom). Every',
  'coordinate is in those units. `rot` is degrees clockwise, 0 = facing the top',
  'of the map, 90 = facing right, 180 = facing the bottom. widthM is how many',
  'metres the 100 units span; give the real floor width the location implies',
  '(a bedroom 4–5, a living room 6–8, a street 20–40), or 0 if you cannot tell.',
  '',
  'MARKS. actor = a character on the floor (charId: copy the id given for that',
  'character, or "" for an extra); camera = a camera position and the way it',
  'faces; track = a dolly rail from (x,y) to (toX,toY); light = a lamp head and',
  'the way it faces; mark = a tape mark. A move: hasMove true and (toX,toY) is',
  'where the mark goes first; further stops go in `path`, in order, each with a',
  'short `beat` naming the line or action that motivates it. curve true draws',
  'the walk as a curve. No move: hasMove false, toX/toY 0, path empty.',
  '',
  'SET. Pieces of the set as rectangles: (x,y) is the CENTRE, w and h the size',
  'in map units before rotation, rot the turn. Walls bound the room; doors and',
  'windows sit in walls; furniture where the action needs it.',
  '',
  'THE 180° LINE. axis is the line of action between the two people the scene',
  'plays between, from (x1,y1) to (x2,y2); on false when there is no such line.',
  'Keep every camera of one coverage on one side of it.'
].join('\n');

export const DRAFT_SYSTEM = [
  'You are a director and first AD blocking a scene for a small-budget Tamil',
  'independent feature shot in and around Chennai with one camera, available',
  'light and a modest grip package. You lay the scene out on an overhead floor',
  'plan the crew will tape out on the day.',
  '',
  'Craft:',
  '· Read the scene heading and the action for the set: a room has walls and a',
  '  way in; dress only what the scene uses or implies.',
  '· Entrances and exits come through a door or an edge the set has. Every move',
  '  is motivated — a line, a look, a want — and its beat says which.',
  '· Eyelines: actors who talk face each other unless the scene says otherwise.',
  '· Coverage: a master that sees the whole geography, overs and singles on one',
  '  side of the 180° line, inserts where the script asks. Place cameras where',
  '  the listed shots and their lenses need them: a wide lens close, a long lens',
  '  further back. Reuse a setup name from the shot list for the matching camera',
  '  label when there is one.',
  '',
  'ONE FLOOR, ONE DIAGRAM PER SHOT. `floor` is the scene\'s floor plan, shared',
  'by every shot: the set, the 180° line and the floor width, drawn once.',
  '`actors` are where the people start on that floor. `shots` holds one entry',
  'per listed shot you can stage: shotId is the id given for that shot (never',
  'invent one; leave a shot out rather than guess), and its `marks` are THAT',
  'shot\'s diagram only — exactly ONE camera, the camera for that shot, plus',
  'where the actors are and how they move during it (a dolly track or a light',
  'when the shot needs one). Never put two cameras in one shot, and never put',
  'set pieces or the line in a shot: they live on the floor.',
  '· Keep it shootable: few marks, no rail you cannot lay, no light you cannot rig.',
  '· Block the scene you were given. Do not invent action or characters.',
  '',
  MAP_RULES,
  '',
  'Answer only with the JSON the schema describes.'
].join('\n');

export const ENHANCE_SYSTEM = [
  'You are a director and first AD reviewing a blocking diagram another person',
  'drew for a small-budget Tamil independent feature. Suggest specific changes,',
  'each one a single operation on the diagram, each with a one-line reason.',
  '',
  'Look for: a camera across the 180° line from the rest of its coverage; a move',
  'with no motivating beat; an entrance with no door; a camera that cannot get',
  'the listed shot with its lens; a missing master, over or single; eyelines that',
  'do not meet; a set piece the action needs and the plan lacks. Do not change',
  'what already works, and suggest nothing for the sake of it — an empty list is',
  'an honest answer.',
  '',
  'A diagram is either the scene\'s FLOOR PLAN (the set, the 180° line, the',
  'width) or ONE SHOT\'s diagram (that shot\'s single camera and the actors',
  'during it, drawn over the floor). On a shot\'s diagram the floor is shown',
  'for reference only: do not add set pieces or move the line there, and keep',
  'it to one camera.',
  '',
  'Operations: add-mark (fill `mark`), update-mark (markId = the id given, and',
  '`mark` = the mark as it should be after the change), remove-mark (markId),',
  'add-set (fill `piece`), set-axis (fill `axis`; on false removes the line).',
  'Fields an operation does not use are still sent: leave them empty or zero.',
  '',
  MAP_RULES,
  '',
  'Answer only with the JSON the schema describes.'
].join('\n');

/* ---- the schemas ----------------------------------------------
   Plain JSON Schema, every property required and additionalProperties
   false (Gemini's responseJsonSchema and Anthropic's json_schema format
   both take it; see geminiRequest() in ai.js). No min/max: the
   validators below clamp, so the schema never has to. Nullable fields
   are avoided on purpose — hasMove / on stand in for "no value". */

const pointSchema = () => ({
  type: 'object', additionalProperties: false, required: ['x', 'y', 'beat'],
  properties: {
    x: { type: 'number' }, y: { type: 'number' },
    beat: { type: 'string', description: 'the line or action that motivates this stop' }
  }
});

function markSchema(charIds) {
  return {
    type: 'object', additionalProperties: false,
    required: ['kind', 'label', 'x', 'y', 'rot', 'hasMove', 'toX', 'toY', 'path', 'curve', 'charId'],
    properties: {
      kind: { type: 'string', enum: MARK_KINDS.slice() },
      label: { type: 'string', description: 'a character name, "Cam A", "Key", …' },
      x: { type: 'number' }, y: { type: 'number' },
      rot: { type: 'number', description: 'degrees clockwise, 0 = facing the top of the map' },
      hasMove: { type: 'boolean' },
      toX: { type: 'number' }, toY: { type: 'number' },
      path: { type: 'array', items: pointSchema() },
      curve: { type: 'boolean' },
      charId: charIds && charIds.length
        ? { type: 'string', enum: [''].concat(charIds) }
        : { type: 'string', description: 'always ""' }
    }
  };
}

function pieceSchema() {
  return {
    type: 'object', additionalProperties: false,
    required: ['kind', 'label', 'x', 'y', 'w', 'h', 'rot'],
    properties: {
      kind: { type: 'string', enum: SET_KINDS.slice() },
      label: { type: 'string' },
      x: { type: 'number' }, y: { type: 'number' },
      w: { type: 'number' }, h: { type: 'number' },
      rot: { type: 'number' }
    }
  };
}

function axisSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['on', 'x1', 'y1', 'x2', 'y2'],
    properties: { on: { type: 'boolean' }, x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }
  };
}

/* The draft is ONE floor and ONE diagram PER SHOT (1 Nov 2026). The old
   shape — one map holding every camera — is what made a shot list of six
   come back as six cameras on one setup, which no crew can tape out. */
export function draftSchema(charIds = [], shotIds = []) {
  return {
    type: 'object', additionalProperties: false,
    required: ['floor', 'actors', 'shots'],
    properties: {
      floor: {
        type: 'object', additionalProperties: false,
        required: ['name', 'note', 'widthM', 'set', 'axis'],
        properties: {
          name: { type: 'string', description: 'the floor plan\'s name, e.g. "Kitchen"' },
          note: { type: 'string', description: 'one or two lines on the staging and coverage' },
          widthM: { type: 'number' },
          set: { type: 'array', items: pieceSchema() },
          axis: axisSchema()
        }
      },
      actors: { type: 'array', items: markSchema(charIds), description: 'where the people start on the floor' },
      shots: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['shotId', 'number', 'note', 'marks'],
          properties: {
            shotId: shotIds.length ? { type: 'string', enum: shotIds.slice() } : { type: 'string', description: 'no shots are listed: send no shots' },
            number: { type: 'string' },
            note: { type: 'string', description: 'one line on this shot\'s staging' },
            marks: { type: 'array', items: markSchema(charIds), description: 'exactly one camera, plus the actors during this shot' }
          }
        }
      }
    }
  };
}

export function enhanceSchema(charIds = [], markIds = [], { shot = false } = {}) {
  return {
    type: 'object', additionalProperties: false, required: ['suggestions', 'note'],
    properties: {
      note: { type: 'string', description: 'one line on the diagram overall, or ""' },
      suggestions: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['type', 'text', 'why', 'markId', 'mark', 'piece', 'axis'],
          properties: {
            type: { type: 'string', enum: shot ? SHOT_OP_TYPES.slice() : OP_TYPES.slice() },
            text: { type: 'string', description: 'the change, in one short line' },
            why: { type: 'string', description: 'the reason, in one line' },
            markId: markIds.length ? { type: 'string', enum: [''].concat(markIds) } : { type: 'string' },
            mark: markSchema(charIds),
            piece: pieceSchema(),
            axis: axisSchema()
          }
        }
      }
    }
  };
}

/* ---- the user prompts ------------------------------------------ */

function sceneLines(job) {
  const out = [];
  out.push('scene number: ' + (job.number || '—'));
  out.push('heading: ' + (job.slug || '—'));
  if (job.synopsis) out.push('what happens: ' + job.synopsis);
  const chars = Array.isArray(job.characters) ? job.characters : [];
  out.push('', 'characters in the scene' + (chars.length ? ' (id — name):' : ': none named'));
  for (const c of chars) out.push('  ' + (c.id ? c.id + ' — ' : '(no id) — ') + c.name);
  const shots = Array.isArray(job.shots) ? job.shots : [];
  if (shots.length) {
    out.push('', 'the shot list for this scene:');
    for (const s of shots) {
      out.push('  ' + [s.id ? 'id ' + s.id + ' —' : '', s.number ? '#' + s.number : '', s.size, s.angle, s.movement, s.lens,
        s.setup ? 'setup ' + s.setup : '', s.description ? '— ' + s.description : ''].filter(Boolean).join(' '));
    }
  } else out.push('', '(no shots listed yet — plan the coverage the scene needs)');
  const setups = Array.isArray(job.setups) ? job.setups : [];
  if (setups.length) {
    out.push('', 'diagrams already drawn for this scene:');
    for (const s of setups) out.push('  ' + s);
  }
  if (job.script) out.push('', 'script:', job.script);
  else out.push('', '(no script text for this scene — work from the heading and the synopsis, and keep it simple)');
  return out;
}

/* `job.user`, when set, is the whole prompt as the Desk showed it and the
   person edited it (the task is editable: what goes in is what is sent),
   so it replaces the built text; a refinement still rides on the end. */
const withUser = (job, build) => {
  const own = str(job.user, 60000);
  if (!own) return build();
  return own + (str(job.refine, 8000) ? '\n\n' + str(job.refine, 8000) : '');
};

export function buildDraftPrompt(job = {}) { return withUser(job, () => draftPromptBody(job)); }
export function buildEnhancePrompt(job = {}) { return withUser(job, () => enhancePromptBody(job)); }

function draftPromptBody(job) {
  const parts = ['Block the following scene: one floor plan (the set, the 180° line, where the actors start) and one diagram per listed shot (its one camera, the actors and their moves during it).', ''];
  parts.push(...sceneLines(job));
  if (str(job.prompt, 2000)) parts.push('', 'What the director asked for:', str(job.prompt, 2000));
  if (str(job.refine, 8000)) parts.push('', str(job.refine, 8000));
  return parts.join('\n');
}

/** A block as the enhance prompt shows it: ids first, so an op can name one. */
export function describeBlock(block) {
  const b = isObj(block) ? block : {};
  const out = ['setup: ' + (str(b.name, 120) || 'Untitled') + (str(b.widthM, 20) ? ' (floor ' + str(b.widthM, 20) + ' m wide)' : '')];
  if (str(b.note, 600)) out.push('note: ' + str(b.note, 600));
  const marks = Array.isArray(b.marks) ? b.marks : [];
  out.push('marks:' + (marks.length ? '' : ' none'));
  for (const m of marks) {
    if (!isObj(m)) continue;
    let line = '  ' + m.id + ' ' + m.kind + ' "' + str(m.label, 60) + '" at (' + m.x + ',' + m.y + ') rot ' + m.rot;
    if (m.charId) line += ' charId ' + m.charId;
    if (m.toX != null && m.toY != null) line += ' → (' + m.toX + ',' + m.toY + ')';
    for (const p of Array.isArray(m.path) ? m.path : []) line += ' → (' + p.x + ',' + p.y + ')' + (p.beat ? ' "' + str(p.beat, 80) + '"' : '');
    if (m.curve) line += ' curved';
    out.push(line);
  }
  const set = Array.isArray(b.set) ? b.set : [];
  out.push('set:' + (set.length ? '' : ' none'));
  for (const p of set) {
    if (!isObj(p)) continue;
    out.push('  ' + p.id + ' ' + p.kind + (p.label ? ' "' + str(p.label, 60) + '"' : '') + ' centre (' + p.x + ',' + p.y + ') ' + p.w + '×' + p.h + ' rot ' + p.rot);
  }
  const a = b.axis;
  out.push('180° line: ' + (isObj(a) ? '(' + a.x1 + ',' + a.y1 + ') — (' + a.x2 + ',' + a.y2 + ')' : 'none'));
  return out.join('\n');
}

function enhancePromptBody(job) {
  const parts = ['Review this blocking diagram and suggest specific changes, one operation each.', ''];
  parts.push(...sceneLines(job));
  if (isObj(job.floor)) {
    parts.push('', 'THE FLOOR this shot is staged on (shared by every shot; reference only — do not change it here):', describeBlock(job.floor));
    parts.push('', 'THE DIAGRAM of ' + (str(job.block && job.block.name, 80) || 'this shot') + ' (one camera):', describeBlock(job.block));
  } else parts.push('', 'THE DIAGRAM:', describeBlock(job.block));
  if (str(job.prompt, 2000)) parts.push('', 'What the director asked for:', str(job.prompt, 2000));
  if (str(job.refine, 8000)) parts.push('', str(job.refine, 8000));
  return parts.join('\n');
}

/* ---- the checks ------------------------------------------------ */

/** A mark from a reply, checked. Returns null for junk. */
export function cleanAIMark(m, { charIds = [] } = {}) {
  if (!isObj(m)) return null;
  const kind = MARK_KINDS.includes(m.kind) ? m.kind : null;
  if (!kind) return null;
  const ids = new Set([].concat(charIds || []).map(String));
  const charId = kind === 'actor' && ids.has(String(m.charId ?? '')) ? String(m.charId) : '';
  const out = { kind, label: str(m.label, 60), x: cx(m.x), y: cy(m.y), rot: deg(m.rot), toX: null, toY: null, path: [], curve: false, charId };
  let path = (Array.isArray(m.path) ? m.path : []).filter(isObj)
    .map((p) => ({ x: cx(p.x), y: cy(p.y), beat: str(p.beat, 80) }));
  const moves = m.hasMove === true || (m.hasMove == null && num(m.toX) != null && num(m.toY) != null);
  if (moves && num(m.toX) != null && num(m.toY) != null) { out.toX = cx(m.toX); out.toY = cy(m.toY); }
  else if (path.length && kind !== 'track') {
    /* Stops with no first leg: the first stop IS the first leg, so an
       older build (which draws only toX/toY) still shows the move. */
    out.toX = path[0].x; out.toY = path[0].y; path = path.slice(1);
  }
  if (kind === 'track') {
    // A rail always has two ends and never a path (shots.js cleanMark).
    if (out.toX == null) { out.toX = cx(out.x + 24); out.toY = out.y; }
    return out;
  }
  if (out.toX != null) {
    out.path = path.slice(0, MAX_BEATS);
    out.curve = m.curve === true;
  }
  return out;
}

/** A set piece from a reply, checked. Returns null for junk. Unknown kind → 'prop'. */
export function cleanAIPiece(p) {
  if (!isObj(p)) return null;
  return {
    kind: SET_KINDS.includes(p.kind) ? p.kind : 'prop',
    label: str(p.label, 60),
    x: cx(p.x), y: cy(p.y),
    w: r1(clamp(num(p.w) ?? 10, 1, BLOCK_W)),
    h: r1(clamp(num(p.h) ?? 10, 1, BLOCK_H)),
    rot: deg(p.rot)
  };
}

/** The 180° line from a reply, or null (off, junk, or a zero-length line). */
export function cleanAIAxis(a) {
  if (!isObj(a) || a.on === false) return null;
  if ([a.x1, a.y1, a.x2, a.y2].some((v) => num(v) == null)) return null;
  const out = { x1: cx(a.x1), y1: cy(a.y1), x2: cx(a.x2), y2: cy(a.y2) };
  return out.x1 === out.x2 && out.y1 === out.y2 ? null : out;
}

/** widthM as the block stores it: the typed text, '' for unknown. */
export function cleanWidth(v) {
  const w = num(typeof v === 'string' ? v.replace(',', '.') : v);
  return w != null && w > 0 && w <= WIDTH_MAX_M ? String(r1(w)) : '';
}

/**
 * A draft reply, checked.
 *   parsed   the model's JSON
 *   charIds  the character ids the prompt offered
 *   shotIds  the shot ids the prompt offered (a shot naming any other id,
 *            or one already given, is dropped: it would have nowhere to go)
 * → { floor: { name, note, widthM, set, axis }, actors, shots: [{ shotId,
 *     number, note, marks }], dropped }
 * Each shot keeps exactly ONE camera — the first; a second is dropped and
 * counted, and a shot with none is dropped (a shot diagram is its camera).
 * Throws (kind 'malformed') when it is not a draft at all, or holds nothing.
 */
export function cleanDraft(parsed, { charIds = [], shotIds = [] } = {}) {
  if (!isObj(parsed) || !Array.isArray(parsed.shots)) {
    throw malformed('The reply was not the blocking we asked for, so nothing was added.');
  }
  let dropped = 0;
  const fl = isObj(parsed.floor) ? parsed.floor : {};
  const set = [];
  for (const p of Array.isArray(fl.set) ? fl.set : []) {
    const c = cleanAIPiece(p);
    if (!c) { dropped++; continue; }
    if (set.length >= MAX_SET) { dropped++; continue; }
    set.push(c);
  }
  /* The floor's people: actors and tape marks. A camera here has no shot
     to belong to, so it is dropped rather than guessed onto one. */
  const actors = [];
  for (const m of Array.isArray(parsed.actors) ? parsed.actors : []) {
    const c = cleanAIMark(m, { charIds });
    if (!c || c.kind === 'camera') { dropped++; continue; }
    if (actors.length >= MAX_MARKS) { dropped++; continue; }
    actors.push(c);
  }
  const offered = new Set([].concat(shotIds || []).map(String));
  const seen = new Set();
  const shots = [];
  for (const sh of parsed.shots) {
    const id = isObj(sh) ? String(sh.shotId ?? '') : '';
    if (!id || !offered.has(id) || seen.has(id) || shots.length >= MAX_SHOTS) { dropped++; continue; }
    const marks = [];
    let cams = 0;
    for (const m of Array.isArray(sh.marks) ? sh.marks : []) {
      const c = cleanAIMark(m, { charIds });
      if (!c) { dropped++; continue; }
      if (c.kind === 'camera' && cams) { dropped++; continue; }   // ONE camera per shot
      if (marks.length >= MAX_MARKS) { dropped++; continue; }
      if (c.kind === 'camera') cams++;
      marks.push(c);
    }
    if (!cams) { dropped++; continue; }
    seen.add(id);
    shots.push({ shotId: id, number: str(sh.number, 20), note: str(sh.note, 300), marks });
  }
  const floor = { name: str(fl.name, 80), note: str(fl.note, 600), widthM: cleanWidth(fl.widthM), set, axis: cleanAIAxis(fl.axis) };
  if (!shots.length && !actors.length && !set.length && !floor.axis) {
    throw malformed('The model came back with no floor plan and no shots, so nothing was added.');
  }
  return { floor, actors, shots, dropped };
}

/** What changed between a mark and the reply's version of it, as a patch; {} when nothing did. */
function markPatch(was, now) {
  const patch = {};
  for (const k of ['label', 'x', 'y', 'rot', 'toX', 'toY', 'curve', 'charId']) {
    if (JSON.stringify(was[k] ?? null) !== JSON.stringify(now[k] ?? null)) patch[k] = now[k];
  }
  if (JSON.stringify(was.path || []) !== JSON.stringify(now.path || [])) patch.path = now.path;
  return patch;
}

const pointText = (x, y) => '(' + x + ', ' + y + ')';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/**
 * An enhance reply, checked against the block it is about.
 *   parsed   the model's JSON
 *   block    the block as shots.js holds it (marks with ids)
 *   charIds  the character ids the prompt offered
 * → { items: [{ id, text, detail, op }], note, dropped }
 * `op` is one of the contract's operations:
 *   { type: 'add-mark', mark } · { type: 'update-mark', id, patch }
 *   { type: 'remove-mark', id } · { type: 'add-set', piece }
 *   { type: 'set-axis', axis }   (axis null removes the line)
 */
export function cleanEnhance(parsed, { block, charIds = [], shot = false } = {}) {
  if (!isObj(parsed) || !Array.isArray(parsed.suggestions)) {
    throw malformed('The reply was not the list of suggestions we asked for, so nothing was changed.');
  }
  const marks = new Map((isObj(block) && Array.isArray(block.marks) ? block.marks : []).filter(isObj).map((m) => [String(m.id), m]));
  const items = [];
  const seen = new Set();
  let dropped = 0;
  for (const s of parsed.suggestions) {
    if (items.length >= MAX_OPS) { dropped++; continue; }
    if (!isObj(s) || !(shot ? SHOT_OP_TYPES : OP_TYPES).includes(s.type)) { dropped++; continue; }
    const text = str(s.text, 200);
    const why = str(s.why, 300);
    let op = null;
    if (s.type === 'add-mark') {
      const mark = cleanAIMark(s.mark, { charIds });
      if (mark) op = { type: 'add-mark', mark };
    } else if (s.type === 'add-set') {
      const piece = cleanAIPiece(s.piece);
      if (piece) op = { type: 'add-set', piece };
    } else if (s.type === 'set-axis') {
      op = { type: 'set-axis', axis: cleanAIAxis(s.axis) };
      // Removing a line that is not there changes nothing.
      if (!op.axis && !(isObj(block) && isObj(block.axis))) op = null;
    } else {
      const id = String(s.markId ?? '');
      const was = marks.get(id);
      if (was && s.type === 'remove-mark') op = { type: 'remove-mark', id };
      else if (was && s.type === 'update-mark') {
        /* The reply sends the mark as it should be. Its kind is the
           stored one — an update never turns a camera into an actor. */
        const now = cleanAIMark({ ...(isObj(s.mark) ? s.mark : {}), kind: was.kind }, { charIds });
        const patch = now ? markPatch(was, now) : {};
        if (Object.keys(patch).length) op = { type: 'update-mark', id, patch };
      }
    }
    if (!op) { dropped++; continue; }
    const sig = JSON.stringify(op);
    if (seen.has(sig)) { dropped++; continue; }
    seen.add(sig);
    items.push({ id: 'o' + items.length, text: text || opText(op, marks), detail: why, op });
  }
  return { items, note: str(parsed.note, 300), dropped };
}

/** A plain line for an op the model gave no text for. */
export function opText(op, marks = new Map()) {
  const name = (id) => { const m = marks.get(id); return m ? (m.label || m.kind) : 'a mark'; };
  switch (op.type) {
    case 'add-mark': return 'Add ' + op.mark.kind + (op.mark.label ? ' “' + op.mark.label + '”' : '') + ' at ' + pointText(op.mark.x, op.mark.y);
    case 'update-mark': return 'Change ' + name(op.id) + ': ' + Object.keys(op.patch).join(', ');
    case 'remove-mark': return 'Remove ' + name(op.id);
    case 'add-set': return 'Add ' + op.piece.kind + (op.piece.label ? ' “' + op.piece.label + '”' : '');
    case 'set-axis': return op.axis ? 'Set the 180° line ' + pointText(op.axis.x1, op.axis.y1) + ' — ' + pointText(op.axis.x2, op.axis.y2) : 'Remove the 180° line';
    default: return '';
  }
}

/* ---- the Desk's list of a draft ------------------------------- */

const KIND_WORD = { actor: 'Actor', camera: 'Camera', track: 'Dolly track', light: 'Light', mark: 'Mark' };
const markLine = (m, charName) => {
  const who = m.charId ? charName(m.charId) : '';
  return (KIND_WORD[m.kind] || 'Mark') + ' ' + (m.label || who || m.kind) + ' at ' + pointText(m.x, m.y)
    + (m.kind !== 'track' && m.toX != null ? ' → ' + pointText(m.toX, m.toY) : '');
};

/** A draft as Desk items: the FLOOR (one item: set, line, width, where the
    people start) and one item PER SHOT (its camera and actors). Each is
    ticked whole: a shot diagram half-kept is a diagram nobody drew. */
export function draftItems(draft, { charName = () => '', shotLabel = () => '' } = {}) {
  const items = [];
  const f = draft.floor || {};
  const set = f.set || [], actors = draft.actors || [];
  if (set.length || actors.length || f.axis || f.widthM) {
    items.push({
      id: 'floor', part: 'floor',
      text: 'Floor plan' + (f.name ? ' “' + f.name + '”' : '') + ': ' + [
        set.length ? plural(set.length, 'set piece', 'set pieces') : '',
        actors.length ? plural(actors.length, 'actor', 'actors') : '',
        f.axis ? 'the 180° line' : '', f.widthM ? f.widthM + ' m wide' : ''
      ].filter(Boolean).join(', '),
      detail: [...set.map((p) => p.kind + (p.label ? ' “' + p.label + '”' : '')), ...actors.map((m) => markLine(m, charName))].join(' · ')
    });
  }
  for (const sh of draft.shots || []) {
    const cam = sh.marks.find((m) => m.kind === 'camera');
    items.push({
      id: 'shot:' + sh.shotId, part: 'shot', shotId: sh.shotId,
      text: 'Shot ' + (shotLabel(sh.shotId) || (sh.number ? '#' + sh.number : sh.shotId)) + ': '
        + (cam ? (cam.label || 'camera') + ' at ' + pointText(cam.x, cam.y) + ', facing ' + cam.rot + '°' : 'no camera'),
      detail: [sh.note, ...sh.marks.filter((m) => m !== cam).map((m) => markLine(m, charName))].filter(Boolean).join(' · ')
    });
  }
  return items;
}
/** The parts of a draft the ticked items name. */
export function pickDraft(draft, selected) {
  const want = new Set([].concat(selected || []).map((it) => String(it && it.id)));
  return {
    floor: want.has('floor') ? { ...draft.floor, actors: draft.actors || [] } : null,
    shots: (draft.shots || []).filter((sh) => want.has('shot:' + sh.shotId))
  };
}

/**
 * What an Accept writes, planned without writing (shots.js writeBlocking()
 * does the one write, and undoBlocking() takes it back). FILL, NEVER
 * OVERWRITE:
 *   floor   none yet → a new floor block. One already → a copy that gains
 *           the AI's set pieces (a piece of the same kind within 3 units of
 *           one already there is the same piece, and is not added again),
 *           and the width, note, line and actors ONLY where blank. Nothing
 *           on it is deleted or moved. Unchanged → not written at all.
 *   shots   none yet → a new diagram. An EMPTY one → filled in place. One
 *           that already has marks → SKIPPED and reported: a person drew it.
 *   cams    each new diagram's camera id, for the shot's `cam` — and
 *           writeBlocking() fills it only where the shot names none.
 * `make.block/mark/piece` give ids (shots.js blankBlock/blankMark/
 * blankSetPiece); `shotOf(id)` is the shot record; `blockOfShot(id)` its
 * diagram. → { blocks, cams, skipped: [shotId], floorAdded, shotsMade }
 */
export function planDraftApply(pick, {
  sceneId, floor = null, blockOfShot = () => null, shotOf = () => null, floorName = '',
  make = {}
} = {}) {
  const mkBlock = make.block || ((p) => ({ id: localId('bk'), shotId: '', marks: [], set: [], axis: null, ...p }));
  const mkMark = make.mark || ((p) => ({ id: localId('mk'), ...p }));
  const mkPiece = make.piece || ((p) => ({ id: localId('st'), ...p }));
  const out = { blocks: [], cams: [], skipped: [], floorAdded: 0, shotsMade: 0 };
  const f = pick && pick.floor;
  if (f) {
    const actors = (f.actors || []).map((m) => mkMark({ ...m }));
    if (!floor) {
      out.blocks.push(mkBlock({ sceneId, shotId: '', name: f.name || floorName, note: f.note || '', widthM: f.widthM || '',
        set: (f.set || []).map((p) => mkPiece({ ...p })), axis: f.axis ? { ...f.axis } : null, marks: actors }));
      out.floorAdded = (f.set || []).length + actors.length + (f.axis ? 1 : 0);
    } else {
      const next = JSON.parse(JSON.stringify(floor));
      next.set = Array.isArray(next.set) ? next.set : [];
      next.marks = Array.isArray(next.marks) ? next.marks : [];
      let n = 0;
      const had = next.set.slice();   // compare with what the person had, not with this pass's own adds
      for (const p of f.set || []) {
        if (had.some((q) => q.kind === p.kind && Math.hypot(q.x - p.x, q.y - p.y) <= 3)) continue;
        next.set.push(mkPiece({ ...p })); n++;
      }
      if (!String(next.widthM || '').trim() && f.widthM) { next.widthM = f.widthM; n++; }
      if (!String(next.note || '').trim() && f.note) { next.note = f.note; n++; }
      if (!next.axis && f.axis) { next.axis = { ...f.axis }; n++; }
      if (!next.marks.some((m) => m.kind === 'actor') && actors.length) { next.marks.push(...actors); n += actors.length; }
      if (n) { out.blocks.push(next); out.floorAdded = n; }
    }
  }
  for (const sh of (pick && pick.shots) || []) {
    const shot = shotOf(sh.shotId);
    if (!shot) { out.skipped.push(sh.shotId); continue; }
    const have = blockOfShot(sh.shotId);
    if (have && Array.isArray(have.marks) && have.marks.length) { out.skipped.push(sh.shotId); continue; }
    const marks = sh.marks.map((m) => mkMark({ ...m }));
    const row = have
      ? { ...JSON.parse(JSON.stringify(have)), marks, note: String(have.note || '').trim() ? have.note : (sh.note || '') }
      : mkBlock({ sceneId, shotId: sh.shotId, name: 'Shot ' + (String(shot.number || '').trim() || sh.number || '?'), note: sh.note || '', marks });
    out.blocks.push(row);
    const cam = marks.find((m) => m.kind === 'camera');
    if (cam && !String(shot.cam || '')) out.cams.push({ id: sh.shotId, cam: cam.id });
    out.shotsMade++;
  }
  return out;
}

/* ---- applying ops ----------------------------------------------- */

let seq = 0;
const localId = (p) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * Ticked enhance ops applied to a COPY of a block. Pure: the caller
 * writes the result (shots.js replaceBlock) and keeps the original as
 * the undo. `makeMark` / `makePiece` give new records their ids
 * (shots.js blankMark / blankSetPiece); the defaults are for tests.
 * An op naming a mark that is no longer there is skipped, not an error.
 */
export function applyBlockOps(block, ops, {
  makeMark = (p) => ({ id: localId('mk'), ...p }),
  makePiece = (p) => ({ id: localId('st'), ...p })
} = {}) {
  const out = JSON.parse(JSON.stringify(isObj(block) ? block : {}));
  out.marks = Array.isArray(out.marks) ? out.marks : [];
  out.set = Array.isArray(out.set) ? out.set : [];
  let applied = 0;
  for (const op of [].concat(ops || [])) {
    if (!isObj(op)) continue;
    if (op.type === 'add-mark' && isObj(op.mark)) { out.marks.push(makeMark({ ...op.mark })); applied++; }
    else if (op.type === 'add-set' && isObj(op.piece)) { out.set.push(makePiece({ ...op.piece })); applied++; }
    else if (op.type === 'set-axis') { out.axis = isObj(op.axis) ? { ...op.axis } : null; applied++; }
    else if (op.type === 'remove-mark') {
      const n = out.marks.length;
      out.marks = out.marks.filter((m) => m.id !== op.id);
      if (out.marks.length !== n) applied++;
    } else if (op.type === 'update-mark' && isObj(op.patch)) {
      const i = out.marks.findIndex((m) => m.id === op.id);
      if (i >= 0) { out.marks[i] = { ...out.marks[i], ...op.patch, id: op.id }; applied++; }
    }
  }
  return { block: out, applied };
}

/* Key-order-free equality: a stored row may come back with its keys in
   a different order from the object that was written. */
const stable = (v) => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : isObj(v) ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : JSON.stringify(v === undefined ? null : v);
const same = (a, b) => stable(a) === stable(b);

/** Undo an AI write to a setup WITHOUT reverting anything else (CLAUDE.md
    row 68: an Undo restores only what it wrote). `before` is the setup as
    it was, `after` what the write stored, `current` the setup now. Marks
    and pieces the write added go only while they are still exactly as
    written; a mark it changed goes back only while it still reads as
    written; a mark it removed comes back only if nothing took its id;
    the axis goes back only while it is still the one written. Anything
    edited since is left alone and counted in `kept`. Pure. */
export function undoBlockOps(before, after, current) {
  const b = isObj(before) ? before : {}, a = isObj(after) ? after : {};
  const out = JSON.parse(JSON.stringify(isObj(current) ? current : {}));
  out.marks = Array.isArray(out.marks) ? out.marks : [];
  out.set = Array.isArray(out.set) ? out.set : [];
  let reverted = 0, kept = 0;
  for (const field of ['marks', 'set']) {
    const was = new Map((Array.isArray(b[field]) ? b[field] : []).map((x) => [x.id, x]));
    const wrote = new Map((Array.isArray(a[field]) ? a[field] : []).map((x) => [x.id, x]));
    for (const [id, w] of wrote) {
      const i = out[field].findIndex((x) => x.id === id);
      const old = was.get(id);
      if (old && same(old, w)) continue;                    // untouched by the write
      if (i < 0) continue;                                  // gone since: nothing to undo
      if (!same(out[field][i], w)) { kept++; continue; }    // edited since: theirs now
      if (old) out[field][i] = JSON.parse(JSON.stringify(old)); else out[field].splice(i, 1);
      reverted++;
    }
    for (const [id, old] of was) {
      if (wrote.has(id)) continue;                          // the write removed it
      if (out[field].some((x) => x.id === id)) { kept++; continue; }
      const at = (Array.isArray(b[field]) ? b[field] : []).findIndex((x) => x.id === id);
      out[field].splice(Math.min(at, out[field].length), 0, JSON.parse(JSON.stringify(old)));
      reverted++;
    }
  }
  if (!same(b.axis ?? null, a.axis ?? null)) {
    if (same(out.axis ?? null, a.axis ?? null)) { out.axis = b.axis ? JSON.parse(JSON.stringify(b.axis)) : null; reverted++; }
    else kept++;
  }
  return { block: out, reverted, kept };
}

export default {
  BLOCK_W, BLOCK_H, MARK_KINDS, SET_KINDS, OP_TYPES, MAX_MARKS, MAX_SET, MAX_BEATS, MAX_OPS,
  SHOT_OP_TYPES, MAX_SHOTS,
  DRAFT_SYSTEM, ENHANCE_SYSTEM, draftSchema, enhanceSchema, buildDraftPrompt, buildEnhancePrompt, describeBlock,
  cleanAIMark, cleanAIPiece, cleanAIAxis, cleanWidth, cleanDraft, cleanEnhance, opText, draftItems, pickDraft, planDraftApply, applyBlockOps, undoBlockOps
};
