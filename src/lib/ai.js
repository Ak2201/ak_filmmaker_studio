/* ============================================================
   AI — bring your own key
   ------------------------------------------------------------
   CLAUDE.md open item 3, and its first sentence is the whole
   security model: "Key in localStorage, per-device, never synced."

   THE KEY IS NOT PROJECT DATA AND IS NOT THE USER'S WORK.
   `fms_ai_key_v1` is deliberately absent from all four of the
   places a project key is registered:

     1. SCOPED_KEYS in src/lib/store.js  — so it is NOT suffixed
        with a project id. One key, one device, every project.
     2. PROJECT_KEYS in src/pages/hub.js — so it is NOT written
        into the backup file a user emails to themselves.
     3. ALL_KEYS in src/pages/hub.js     — so "reset the studio"
        does not silently log you out of your own account. The
        panel has its own Forget button for that.
     4. the scope check in supabase-schema.sql — so it CANNOT
        sync. src/lib/cloud.js derives what it uploads from
        Store.SCOPED_KEYS; a key that is not in that list has no
        cloud scope and is never sent.

   Absence in a list in another file is a weak guarantee, so this
   module does not rely on it: every read and write goes through
   `rawGet`/`rawSet`/`rawRemove`, which bypass the storage proxy
   entirely. Even if somebody adds this key to SCOPED_KEYS by
   accident, it still cannot become project data from here.

   THE KEY NEVER COMES BACK OUT. It is written to storage, read
   into the one fetch that needs it, and otherwise only ever
   leaves this module masked. It is never logged, never put in a
   URL, never rendered into the DOM, and never included in an
   error message — an API error body is passed through, and the
   API does not echo keys.

   SENDING THE SCRIPT IS AN OUTBOUND ACTION. The user's screenplay
   is unpublished work. Nothing in this module runs on load,
   nothing runs on a timer, and `draftShotDivision()` is only ever
   reached from a click. The panel says what will be sent and
   where before the click, not after.

   THE BROWSER CALL. Anthropic's API refuses a direct browser
   request unless it opts in with
   `anthropic-dangerous-direct-browser-access`. It is dangerous in
   a normal web app because the key would be the server's; here
   the key is the user's own, typed on their own device, and there
   is no server to put it on — this studio is a static build.
   connect-src in vercel.json and netlify.toml has to allow
   api.anthropic.com or the fetch is blocked before it leaves.
   ============================================================ */
import { rawGet, rawSet, rawRemove } from './store.js';
import { SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS } from './shots.js';
import { formatEighths } from './scenes.js';
import { GEOMETRY } from './screenplay-export.js';

/* Per-device, never scoped, never synced. See the header. */
export const AI_KEY = 'fms_ai_key_v1';
export const AI_MODEL_KEY = 'fms_ai_model_v1';

export const API_ORIGIN = 'https://api.anthropic.com';
const API_URL = API_ORIGIN + '/v1/messages';
const API_VERSION = '2023-06-01';

/* Two current models, both of which support the two things this
   call needs: adaptive thinking and a JSON schema on the output.
   The default is the fast one — a shot division is a structured
   craft task, not a research problem, and the user is waiting. */
export const AI_MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'quick — the default' },
  { id: 'claude-opus-5',   label: 'Opus 5',   hint: 'slower, more considered' }
];
export const DEFAULT_MODEL = AI_MODELS[0].id;

/* ------------------------------------------------------------
   THE KEY
   ------------------------------------------------------------ */
export function getKey() {
  const k = rawGet(AI_KEY);
  return typeof k === 'string' ? k.trim() : '';
}
export function hasKey() { return getKey().length > 0; }

/** Returns false when storage refused, so the panel can say so
    rather than pretending the key was kept. */
export function setKey(value) {
  const clean = String(value ?? '').trim();
  if (!clean) return clearKey();
  return rawSet(AI_KEY, clean);
}
export function clearKey() { return rawRemove(AI_KEY); }

/** What the UI is allowed to show. Never the key. The last four
    characters are enough for a user to tell two keys apart and
    not enough for anybody else to do anything with. */
export function maskKey(value) {
  const k = String(value ?? getKey());
  if (!k) return '';
  return '•'.repeat(12) + k.slice(-4);
}

/** A shape check, not a validity check — only the API can say
    whether a key works, and this exists so an obvious paste error
    is caught before it becomes a 401 the user has to interpret. */
export function looksLikeKey(value) {
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(String(value ?? '').trim());
}

export function getModel() {
  const m = rawGet(AI_MODEL_KEY);
  return AI_MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL;
}
export function setModel(id) {
  if (!AI_MODELS.some((x) => x.id === id)) return false;
  return rawSet(AI_MODEL_KEY, id);
}

/* ------------------------------------------------------------
   MATCHING THE SCRIPT TO THE SCENES
   ------------------------------------------------------------
   The script model is a flat element list; the scene model is a
   list of rows the breakdown owns. Nothing joins them, because
   nothing should: a slug line the writer retyped is not a
   different scene, and a stored join would break the first time
   either side was reordered.

   So the join is derived, here, at the moment it is needed: the
   script is cut at every scene heading, and the Nth script scene
   is offered as the text of the Nth scene row. The UI SHOWS that
   pairing rather than assuming it is right, and a scene row with
   no matching script text is still sent — with its synopsis,
   which is often all there is.
   ------------------------------------------------------------ */
export function sliceScriptByScene(elements) {
  const out = [];
  let current = null;
  for (const el of (elements || [])) {
    const text = String(el.text ?? '').trim();
    if (!text) continue;
    if (el.type === 'scene') {
      current = { heading: text, elements: [] };
      out.push(current);
      continue;
    }
    if (!current) { current = { heading: '', elements: [] }; out.push(current); }
    current.elements.push(el);
  }
  return out;
}

/** One script scene as the plain screenplay text a reader sees.
    Indented the way the format indents it, because the shape of a
    page is information: a wall of dialogue and a wall of action
    are different scenes to cover. */
export function sceneScriptText(slice) {
  if (!slice) return '';
  const lines = [];
  if (slice.heading) lines.push(slice.heading.toUpperCase());
  for (const el of slice.elements) {
    const geom = GEOMETRY[el.type] || GEOMETRY.action;
    let text = String(el.text ?? '').trim();
    if (!text) continue;
    if (el.type === 'paren' && !/^\(.*\)$/.test(text)) text = '(' + text + ')';
    if (geom.upper) text = text.toUpperCase();
    lines.push(' '.repeat(Math.round(geom.indent / 2)) + text);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------
   THE REQUEST
   ------------------------------------------------------------ */
const SYSTEM = [
  'You are a first assistant director and camera operator breaking a scene into',
  'the setups a crew will actually shoot. You are working on a Tamil-language',
  'independent feature made on a small budget in and around Chennai, so favour',
  'coverage that can be achieved with one camera, available light and a modest',
  'grip package. A setup you cannot afford is not coverage.',
  '',
  'Rules:',
  '· Cover the scene, do not decorate it. A wide to see where we are, a medium',
  '  to play it, and a close for the thing that turns — then stop. Three to',
  '  eight setups is a normal scene; more than twelve needs a reason.',
  '· Every description is ONE line of what the audience sees. If it needs two',
  '  sentences it is two shots.',
  '· "static" is a decision and usually the right one. Do not move the camera',
  '  because a field exists.',
  '· Shoot the scene you were given. Do not invent action that is not in the',
  '  text, and do not rewrite the writer.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

function schemaFor() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['scenes'],
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sceneId', 'shots'],
          properties: {
            sceneId: { type: 'string', description: 'the id given for this scene, copied exactly' },
            shots: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['size', 'angle', 'movement', 'lens', 'description'],
                properties: {
                  size: { type: 'string', enum: SHOT_SIZES.map((s) => s.id) },
                  angle: { type: 'string', enum: SHOT_ANGLES.slice() },
                  movement: { type: 'string', enum: SHOT_MOVEMENTS.slice() },
                  lens: { type: 'string', description: 'a focal length such as 35mm, or empty' },
                  description: { type: 'string', description: 'one line of what the audience sees' }
                }
              }
            }
          }
        }
      }
    }
  };
}

/** The prompt. Built from what the user selected and nothing else
    — this is the payload the panel promised, and it has to stay
    the payload the panel promised. */
export function buildPrompt(jobs) {
  const parts = [
    'Break the following scene' + (jobs.length === 1 ? '' : 's') + ' into a shot division.',
    'Return one entry per scene, keyed by the exact sceneId given.',
    ''
  ];
  for (const job of jobs) {
    parts.push('--- SCENE ---');
    parts.push('sceneId: ' + job.sceneId);
    parts.push('scene number: ' + (job.number || '—'));
    parts.push('slug: ' + job.slug);
    parts.push('length: ' + formatEighths(job.eighths)
      + (Number(job.eighths) === 8 ? ' page' : ' pages'));
    if (job.synopsis) parts.push('what happens: ' + job.synopsis);
    if (job.script) { parts.push('', 'script:', job.script); }
    else parts.push('', '(no script text for this scene — work from the slug line and the synopsis, and keep the coverage conservative)');
    parts.push('');
  }
  return parts.join('\n');
}

/* ---- errors that say what to do ----------------------------
   A silent no-op is the worst outcome, and "something went
   wrong" is the second worst. Each of these is a thing the user
   can act on. */
export class AIError extends Error {
  constructor(message, kind) { super(message); this.name = 'AIError'; this.kind = kind || 'unknown'; }
}

function errorForStatus(status, body) {
  const detail = (body && body.error && body.error.message) ? String(body.error.message) : '';
  if (status === 401 || status === 403) {
    return new AIError('That key was rejected. Check it in the Anthropic console and paste it again.', 'auth');
  }
  if (status === 429) {
    /* Worded for all three jobs, not just the shot division. This
       said "send fewer scenes at once" while it had one caller; the
       dialogue pass and the step critique have no scenes in them and
       a user reading that would go looking for a control that does
       not exist. */
    return new AIError('Rate limited by the API. Wait a minute and try again, or send less at once.', 'rate');
  }
  if (status === 400) {
    return new AIError('The API refused the request' + (detail ? ': ' + detail : '.'), 'request');
  }
  if (status === 529) {
    return new AIError('The API is overloaded right now. Try again shortly — nothing was changed.', 'overloaded');
  }
  if (status >= 500) {
    return new AIError('The API had a server error (' + status + '). Nothing was changed.', 'server');
  }
  return new AIError('The API returned ' + status + (detail ? ': ' + detail : '.'), 'http');
}

/* ---- the SSE reader ----------------------------------------
   Streaming, because a whole-script division is a long output
   and a non-streaming request of that size is a request that
   times out. It also means the panel can count the scenes as
   they land instead of showing a spinner for ninety seconds. */
async function readStream(res, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stop = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    // SSE frames are separated by a blank line. Anything after the
    // last one is a partial frame and stays in the buffer.
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let evt = null;
        try { evt = JSON.parse(payload); } catch (e) { continue; }
        if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
          text += evt.delta.text;
          if (onText) onText(text);
        } else if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason) {
          stop = evt.delta.stop_reason;
        } else if (evt.type === 'error') {
          throw new AIError(
            (evt.error && evt.error.message) ? String(evt.error.message) : 'The API ended the stream with an error.',
            'stream'
          );
        }
      }
    }
  }
  return { text, stop };
}

/* ---- the one request ----------------------------------------
   Every job below is the same HTTP call with a different system
   prompt, a different schema and a different user message, so it
   is written once. Three jobs sharing one request path means one
   place where the headers, the streaming, the abort, the status
   mapping and the JSON parse are correct — and it is why adding
   the dialogue pass and the beat critique added no new way for a
   401 to be reported.

   NOTHING IN HERE RUNS ON ITS OWN. `callModel` is reachable only
   from an exported job, and every exported job is reachable only
   from a click. The key is read here, used in one header, and
   never returned, logged or rendered.
   ------------------------------------------------------------ */
async function callModel({
  system, user, schema, maxTokens = 32000, effort = 'medium',
  onStatus, signal, progress
}) {
  const key = getKey();
  if (!key) throw new AIError('No API key saved on this device.', 'nokey');

  const model = getModel();
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        // Without this the API refuses a request made from a page.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        thinking: { type: 'adaptive' },
        output_config: {
          effort,
          format: { type: 'json_schema', schema }
        },
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AIError('Stopped. Nothing was changed.', 'aborted');
    /* A blocked connect-src and a dead network are the same
       TypeError, and a user cannot tell them apart, so name both. */
    throw new AIError(
      'Could not reach api.anthropic.com. Check the connection — and if you are '
      + 'running your own build of the studio, its Content-Security-Policy has to '
      + 'allow connect-src https://api.anthropic.com.',
      'network'
    );
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* not every error is JSON */ }
    throw errorForStatus(res.status, body);
  }
  if (!res.body) throw new AIError('The API returned an empty response.', 'empty');

  let text, stop;
  try {
    ({ text, stop } = await readStream(res, progress ? (sofar) => {
      const line = progress(sofar);
      if (line) say(line);
    } : null));
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AIError('Stopped. Nothing was changed.', 'aborted');
    throw e;
  }

  if (stop === 'refusal') {
    throw new AIError('The model declined this request. Nothing was changed.', 'refusal');
  }

  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {
    if (stop === 'max_tokens') {
      throw new AIError('The reply was cut off before it finished. Try a smaller piece.', 'truncated');
    }
    throw new AIError('The reply was not the shape we asked for, so nothing was changed.', 'malformed');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new AIError('The reply was not the shape we asked for, so nothing was changed.', 'malformed');
  }
  return { parsed, truncated: stop === 'max_tokens', model };
}

/** Trim, cap and refuse anything that is not a string. Every field
    that comes back from a model goes through this before it is shown
    or stored — the schema makes the shape very likely and "very
    likely" is not a guarantee a writing tool is built on. */
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Draft a shot division.
 *
 *   jobs      [{ sceneId, number, slug, eighths, synopsis, script }]
 *   onStatus  called with a short line of progress; DOM only
 *   signal    an AbortSignal, so Stop actually stops
 *
 * Resolves to { byScene: Map<sceneId, shot[]>, truncated, model }.
 * It writes nothing: the caller decides what to keep.
 */
export async function draftShotDivision(jobs, { onStatus, signal } = {}) {
  if (!jobs || !jobs.length) throw new AIError('No scenes selected.', 'noscenes');
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };
  say('Sending ' + jobs.length + (jobs.length === 1 ? ' scene' : ' scenes')
    + ' to ' + getModel() + '…');

  const { parsed, truncated, model } = await callModel({
    system: SYSTEM,
    user: buildPrompt(jobs),
    schema: schemaFor(),
    onStatus, signal,
    progress: (sofar) => {
      // Cheap progress: count the scene keys that have arrived. It is
      // a substring count of a partial JSON document on purpose — it
      // is a progress line, not a parse.
      const n = (sofar.match(/"sceneId"/g) || []).length;
      return n ? 'Drafting… ' + n + ' of ' + jobs.length + ' scenes' : 'Drafting…';
    }
  });

  if (!Array.isArray(parsed.scenes)) {
    throw new AIError('The reply was not the shot list we asked for, so nothing was added.', 'malformed');
  }

  /* Trust nothing about the shape. The schema makes it very likely
     and "very likely" is not a guarantee you build a writing tool
     on — every field is re-checked against the vocabulary the shot
     model actually holds, and an unknown value falls back rather
     than being written. */
  const wanted = new Set(jobs.map((j) => j.sceneId));
  const sizes = new Set(SHOT_SIZES.map((s) => s.id));
  const byScene = new Map();
  for (const entry of parsed.scenes) {
    if (!entry || typeof entry !== 'object') continue;
    const sceneId = String(entry.sceneId ?? '');
    if (!wanted.has(sceneId)) continue;          // never touch a scene we did not offer
    const shots = (Array.isArray(entry.shots) ? entry.shots : [])
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        size: sizes.has(s.size) ? s.size : 'MS',
        angle: SHOT_ANGLES.includes(s.angle) ? s.angle : SHOT_ANGLES[0],
        movement: SHOT_MOVEMENTS.includes(s.movement) ? s.movement : SHOT_MOVEMENTS[0],
        lens: str(s.lens, 40),
        description: str(s.description, 400)
      }))
      .filter((s) => s.description);
    if (shots.length) byScene.set(sceneId, shots);
  }

  return { byScene, truncated, model };
}

/* ============================================================
   IN-PLACE WORK ON THE WRITING
   ------------------------------------------------------------
   CLAUDE.md open item 3, the half that was left: "in-place work
   on the writing itself — dialogue passes, beat critique — using
   the blueprint as context. Still not a chat box."

   NOT A CHAT BOX is a constraint on the SHAPE, and the shape is
   the point. Both jobs below take one specific piece of the
   user's writing — a speech, a step's answers — and return
   something about THAT piece. There is no conversation, no
   history, no second turn. Each call is a whole transaction:
   here is my speech, here is a pass on it, accept or do not.

   THE BLUEPRINT IS THE CONTEXT, NOT THE SUBJECT. What the writer
   has already decided about the film — logline, theme, who the
   protagonist is and what they are lying about — is handed over
   as ground the model must not contradict. It is assembled by
   src/lib/blueprint-context.js, which this module deliberately does not
   import: the context arrives as data so that visualize.html can
   keep loading this file without 124KB of step JSON.

   NOTHING HERE WRITES ANYTHING. Both jobs resolve to a proposal.
   The page decides what to show and a person decides what to
   keep — and when they keep it, it is written through the page's
   normal save path, marked, and undoable.
   ============================================================ */

/** The blueprint, rendered for a prompt. Empty in, empty out —
    a heading with nothing under it is worse than no heading. */
function contextBlock(context) {
  const groups = (context || []).filter((g) => g && g.answers && g.answers.length);
  if (!groups.length) return '';
  const out = [
    '--- THE BLUEPRINT ---',
    'What the writer has already decided about this film. Treat it as settled:',
    'use it, do not contradict it, and do not restate it back at them.',
    ''
  ];
  for (const g of groups) {
    out.push(g.step);
    for (const a of g.answers) out.push('  ' + a.label + ': ' + a.value);
    out.push('');
  }
  return out.join('\n');
}

/* ------------------------------------------------------------
   JOB 2 — A PASS ON ONE SPEECH
   ------------------------------------------------------------
   Alternatives, never a replacement. The model is asked for up to
   three versions of one speech and one line on what each changes,
   and the panel shows them BESIDE the original. Nothing is
   applied by this function and nothing can be: it returns text.
   ------------------------------------------------------------ */
const DIALOGUE_SYSTEM = [
  'You are a dialogue editor on a Tamil-language independent feature. A writer has',
  'given you ONE speech out of their screenplay and asked for a pass on it.',
  '',
  'Rules:',
  '· Work on the speech you were given. Do not rewrite the scene, do not add a new',
  '  line for another character, and do not invent events that are not in the text.',
  '· Keep the character speaking. A pass that makes every character sound like the',
  '  same clever writer is a worse draft, not a better one.',
  '· Cut before you add. Most speeches that need a pass need to be shorter and to',
  '  stop explaining themselves. Subtext over statement.',
  '· Match the language of the original exactly — if it is written in Tanglish,',
  '  romanised Tamil, or English, answer in that. Do not translate the writer.',
  '· Give at most three versions and make them genuinely different from each other.',
  '  Three near-identical options is one option and two of them wasted.',
  '· Each note is ONE line saying what that version changes and what it costs.',
  '· Say what is already working, in one line, and mean it. If nothing is, say that.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

function dialogueSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['keep', 'options'],
    properties: {
      keep: {
        type: 'string',
        description: 'one line on what already works in the original, or why nothing does'
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'note'],
          properties: {
            text: { type: 'string', description: 'the speech, rewritten — dialogue only, no cue, no parenthetical' },
            note: { type: 'string', description: 'one line: what this version changes and what it costs' }
          }
        }
      }
    }
  };
}

/** The prompt. Built from the speech, the scene it sits in and the
    blueprint — which is exactly what the panel said it would send. */
export function buildDialoguePrompt(job) {
  const parts = [];
  const ctx = contextBlock(job.context);
  if (ctx) parts.push(ctx);

  parts.push('--- THE SCENE ---');
  if (job.slug) parts.push(job.slug);
  if (job.before) parts.push(job.before);
  parts.push('');
  parts.push('--- THE SPEECH TO WORK ON ---');
  if (job.character) parts.push('character: ' + job.character);
  if (job.paren) parts.push('parenthetical: ' + job.paren);
  parts.push('speech:');
  parts.push(job.speech);
  parts.push('');
  if (job.after) {
    parts.push('--- WHAT COMES AFTER IT ---');
    parts.push(job.after);
    parts.push('');
  }
  if (job.ask) {
    parts.push('--- WHAT THE WRITER ASKED FOR ---');
    parts.push(job.ask);
    parts.push('');
  }
  parts.push('Give a pass on the speech above and nothing else.');
  return parts.join('\n');
}

/**
 * A pass on one speech.
 *
 *   job  { speech, character, paren, slug, before, after, ask, context }
 *
 * Resolves to { keep, options: [{text, note}], truncated, model }.
 * WRITES NOTHING. The caller shows the options beside the original
 * and a person chooses.
 */
export async function dialoguePass(job, { onStatus, signal } = {}) {
  if (!job || !String(job.speech ?? '').trim()) {
    throw new AIError('There is no speech to work on.', 'nocontent');
  }
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };
  say('Sending one speech to ' + getModel() + '…');

  const { parsed, truncated, model } = await callModel({
    system: DIALOGUE_SYSTEM,
    user: buildDialoguePrompt(job),
    schema: dialogueSchema(),
    maxTokens: 8000,
    onStatus, signal,
    progress: (sofar) => {
      const n = (sofar.match(/"text"/g) || []).length;
      return n ? 'Writing… version ' + n : 'Reading the speech…';
    }
  });

  /* Re-check everything. A model that returns four options, or an
     option that is only whitespace, or a note of nine paragraphs, is
     a model whose output would otherwise become a button the user
     clicks to overwrite their own line. */
  const options = (Array.isArray(parsed.options) ? parsed.options : [])
    .filter((o) => o && typeof o === 'object')
    .map((o) => ({ text: str(o.text, 2000), note: str(o.note, 300) }))
    .filter((o) => o.text)
    .slice(0, 3);

  if (!options.length) {
    throw new AIError('The reply held no alternative version, so nothing changed.', 'empty-result');
  }
  return { keep: str(parsed.keep, 400), options, truncated, model };
}

/* ------------------------------------------------------------
   JOB 3 — A CRITIQUE OF ONE STEP
   ------------------------------------------------------------
   "Ask what is weak about beat 9 given the theme and the
   protagonist's stated lie; get a critique that cites the user's
   own step answers back at them."

   CITING IS ENFORCED, NOT REQUESTED. Every note carries a `quote`
   that must appear VERBATIM in what the user wrote. It is checked
   here against the submitted answers, and a quote that does not
   verify is stripped and counted rather than shown. Asking a
   model to quote and then printing whatever it returns inside
   quotation marks is how a tool ends up telling a writer they
   wrote something they did not.
   ------------------------------------------------------------ */
const CRITIQUE_SYSTEM = [
  'You are a script editor reading one step of a writer\'s blueprint for a',
  'Tamil-language independent feature. They have asked what is weak in it.',
  '',
  'Rules:',
  '· Read the blueprint context first. The strongest notes are the ones that catch',
  '  this step contradicting something the writer already decided elsewhere.',
  '· Every note must QUOTE the writer, verbatim, from the answers given below —',
  '  a short span, copied character for character, no paraphrase and no ellipsis.',
  '  A note you cannot anchor to something they actually wrote is a note about a',
  '  film you imagined. Leave it out.',
  '· Name the problem in one sentence. Not "consider deepening" — say what does not',
  '  work and why a reader will feel it.',
  '· Then one concrete thing to try. A question they can answer, or a change they',
  '  can make this evening. Not a principle.',
  '· Three to six notes. A list of twelve is a list nobody acts on.',
  '· Do not rewrite their work, do not supply the answers, and do not invent plot.',
  '  This is a critique, not a draft.',
  '· The verdict is one sentence: is this step strong enough to build on, or not.',
  '· Match the language the writer used.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

function critiqueSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'notes'],
    properties: {
      verdict: { type: 'string', description: 'one sentence: strong enough to build on, or not' },
      notes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['quote', 'problem', 'tryThis'],
          properties: {
            quote: { type: 'string', description: 'a short span copied VERBATIM from the writer\'s answers' },
            problem: { type: 'string', description: 'one sentence naming what does not work' },
            tryThis: { type: 'string', description: 'one concrete thing to try' }
          }
        }
      }
    }
  };
}

export function buildCritiquePrompt(job) {
  const parts = [];
  const ctx = contextBlock(job.context);
  if (ctx) parts.push(ctx);

  parts.push('--- THE STEP TO CRITIQUE ---');
  parts.push('step ' + (job.step && job.step.num ? job.step.num : '—')
    + ': ' + ((job.step && job.step.title) || ''));
  if (job.step && job.step.deck) parts.push('what this step is for: ' + job.step.deck);
  parts.push('');
  parts.push('what the writer has put in it:');
  for (const a of job.answers || []) {
    parts.push('  ' + a.label + ': ' + a.value);
  }
  parts.push('');
  parts.push('Critique the step above. Quote only from the answers in this section.');
  return parts.join('\n');
}

/* Whitespace, case and the four quotation marks a word processor
   substitutes are not differences a reader would call a misquote, so
   they are normalised on both sides before the comparison. Anything
   else is. */
function forCompare(s) {
  return String(s ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A critique of one step, anchored in what the writer actually wrote.
 *
 *   job  { step: {num, title, deck}, answers: [{label, value}], context }
 *
 * Resolves to { verdict, notes: [{quote, problem, tryThis}], unverified,
 * truncated, model }. `unverified` counts notes whose quote did not
 * appear in the submitted answers; those notes are kept but their
 * quote is dropped, so nothing is ever attributed to the writer that
 * they did not write.
 *
 * WRITES NOTHING. A critique is commentary on the user's work, not a
 * change to it.
 */
export async function beatCritique(job, { onStatus, signal } = {}) {
  const answers = (job && Array.isArray(job.answers) ? job.answers : [])
    .filter((a) => a && String(a.value ?? '').trim());
  if (!answers.length) {
    throw new AIError('There is nothing written in this step to critique yet.', 'nocontent');
  }
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };
  say('Sending step ' + ((job.step && job.step.num) || '—') + ' to ' + getModel() + '…');

  const { parsed, truncated, model } = await callModel({
    system: CRITIQUE_SYSTEM,
    user: buildCritiquePrompt({ ...job, answers }),
    schema: critiqueSchema(),
    maxTokens: 8000,
    onStatus, signal,
    progress: (sofar) => {
      const n = (sofar.match(/"problem"/g) || []).length;
      return n ? 'Reading… ' + n + (n === 1 ? ' note' : ' notes') : 'Reading what you wrote…';
    }
  });

  const haystack = forCompare(answers.map((a) => a.value).join('\n'));
  let unverified = 0;

  const notes = (Array.isArray(parsed.notes) ? parsed.notes : [])
    .filter((n) => n && typeof n === 'object')
    .map((n) => {
      const quote = str(n.quote, 300);
      const verified = quote && haystack.includes(forCompare(quote));
      if (quote && !verified) unverified++;
      return {
        quote: verified ? quote : '',
        problem: str(n.problem, 600),
        tryThis: str(n.tryThis, 600)
      };
    })
    .filter((n) => n.problem)
    .slice(0, 8);

  if (!notes.length) {
    throw new AIError('The reply held no usable notes, so nothing is shown.', 'empty-result');
  }
  return { verdict: str(parsed.verdict, 400), notes, unverified, truncated, model };
}

export default {
  AI_KEY, AI_MODEL_KEY, AI_MODELS, DEFAULT_MODEL, API_ORIGIN,
  getKey, hasKey, setKey, clearKey, maskKey, looksLikeKey,
  getModel, setModel,
  sliceScriptByScene, sceneScriptText, buildPrompt,
  buildDialoguePrompt, buildCritiquePrompt,
  draftShotDivision, dialoguePass, beatCritique, AIError
};
