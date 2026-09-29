/* ============================================================
   AI — bring your own key
   ------------------------------------------------------------
   CLAUDE.md open item 3, and its first sentence is the whole
   security model: "Key in localStorage, per-device, never synced."

   THE KEY IS NOT PROJECT DATA AND IS NOT THE USER'S WORK.
   `arunak_ai_key_v1` is deliberately absent from all four of the
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
export const AI_KEY = 'arunak_ai_key_v1';
export const AI_MODEL_KEY = 'arunak_ai_model_v1';

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
    return new AIError('Rate limited by the API. Wait a minute and try again, or send fewer scenes at once.', 'rate');
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
  const key = getKey();
  if (!key) throw new AIError('No API key saved on this device.', 'nokey');
  if (!jobs || !jobs.length) throw new AIError('No scenes selected.', 'noscenes');

  const model = getModel();
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };
  say('Sending ' + jobs.length + (jobs.length === 1 ? ' scene' : ' scenes') + ' to ' + model + '…');

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
        max_tokens: 32000,
        stream: true,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: schemaFor() }
        },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(jobs) }]
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

  say('Drafting…');
  const { text, stop } = await readStream(res, (sofar) => {
    // Cheap progress: count the scene keys that have arrived. It is
    // a substring count of a partial JSON document on purpose — it
    // is a progress line, not a parse.
    const n = (sofar.match(/"sceneId"/g) || []).length;
    if (n) say('Drafting… ' + n + ' of ' + jobs.length + ' scenes');
  });

  if (stop === 'refusal') {
    throw new AIError('The model declined this request. Nothing was changed.', 'refusal');
  }

  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {
    if (stop === 'max_tokens') {
      throw new AIError('The reply was cut off before it finished. Try fewer scenes at once.', 'truncated');
    }
    throw new AIError('The reply was not the shot list we asked for, so nothing was added.', 'malformed');
  }
  if (!parsed || !Array.isArray(parsed.scenes)) {
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
        lens: String(s.lens ?? '').trim().slice(0, 40),
        description: String(s.description ?? '').trim().slice(0, 400)
      }))
      .filter((s) => s.description);
    if (shots.length) byScene.set(sceneId, shots);
  }

  return { byScene, truncated: stop === 'max_tokens', model };
}

export default {
  AI_KEY, AI_MODEL_KEY, AI_MODELS, DEFAULT_MODEL, API_ORIGIN,
  getKey, hasKey, setKey, clearKey, maskKey, looksLikeKey,
  getModel, setModel,
  sliceScriptByScene, sceneScriptText, buildPrompt,
  draftShotDivision, AIError
};
