/* ============================================================
   AI — bring your own key
   ------------------------------------------------------------
   CLAUDE.md open item 3, and its first sentence is the whole
   security model: "Key in localStorage, per-device, never synced."

   NEITHER KEY IS PROJECT DATA AND NEITHER IS THE USER'S WORK.
   `fms_ai_key_v1` and `fms_ai_key_gemini_v1` are deliberately
   absent from all five of the places a project key is registered,
   and both are read and written only through `rawGet`/`rawSet`/
   `rawRemove`, which bypass the storage proxy entirely. The list
   of the five, and the reason each one matters, is in the header
   of src/lib/ai-providers.js, which is where the keys live.

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
   Gemini needs no such opt-in, but it needs the same thing of the
   page: connect-src in vercel.json and netlify.toml has to name
   BOTH api.anthropic.com and generativelanguage.googleapis.com,
   or the fetch is blocked before it leaves.

   TWO PROVIDERS, ONE REQUEST PATH. src/lib/ai-providers.js owns
   who the key belongs to — the host, the key's shape, the model
   ids, which storage key it lives under. This file owns the one
   `callModel()` below, and it stays one: the wire format differs
   between Anthropic and Gemini, so the URL, the headers, the body
   and the stream frame are each built by a two-line function the
   one path calls. There is no second fetch, no second abort, no
   second status map and no second JSON parse, for exactly the
   reason the three jobs share this path rather than having three.

   THE KEY GOES IN A HEADER ON BOTH SIDES. Anthropic takes
   `x-api-key`, Gemini takes `x-goog-api-key`. Gemini's REST API
   ALSO accepts `?key=<KEY>` on the query string and that form is
   deliberately never used here: a key in a URL lands in browser
   history, in every proxy log on the way, and in any error report
   that captures a URL. Nothing in this file interpolates a key
   into a URL.
   ============================================================ */
import { SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS } from './shots.js';
import { formatEighths, INT_EXT, DAY_NIGHT } from './scenes.js';
import { GEOMETRY } from './screenplay-export.js';
import Providers, {
  PROVIDERS, DEFAULT_PROVIDER, AI_KEY, AI_MODEL_KEY,
  GEMINI_KEY, GEMINI_MODEL_KEY, AI_PROVIDER_KEY,
  getProviderId, provider, setProvider, providerLabel, apiName, apiHost, apiOrigin,
  getKey, hasKey, setKey, clearKey, maskKey, looksLikeKey,
  models, defaultModel, getModel, setModel
} from './ai-providers.js';

/* Re-exported so a caller that only wants "is there a key" or
   "which host" has one import rather than two, and so that every
   call site written when there was one provider still reads the
   same. The table itself lives in ai-providers.js. */
export {
  PROVIDERS, DEFAULT_PROVIDER, AI_KEY, AI_MODEL_KEY,
  GEMINI_KEY, GEMINI_MODEL_KEY, AI_PROVIDER_KEY,
  getProviderId, provider, setProvider, providerLabel, apiName, apiHost, apiOrigin,
  getKey, hasKey, setKey, clearKey, maskKey, looksLikeKey,
  models, defaultModel, getModel, setModel
};

const API_VERSION = '2023-06-01';

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

function errorForStatus(status, body, prov) {
  const err = (body && body.error) || null;
  const detail = (err && err.message) ? String(err.message) : '';
  /* Gemini answers a bad key with 400 INVALID_ARGUMENT and
     API_KEY_INVALID in the body, not with 401 — so the status code
     alone cannot tell "your key is wrong" from "your request is
     wrong", and those are two completely different things to go and
     do about it. The body is what tells them apart. */
  const code = (err && err.status) ? String(err.status) : '';
  const keyRejected = status === 401 || status === 403
    || (status === 400 && /api[\s_-]?key/i.test(detail + ' ' + code));
  if (keyRejected) {
    return new AIError('That key was rejected. Check it in ' + prov.consoleName
      + ' and paste it again.', 'auth');
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
  /* 529 is Anthropic's overloaded code and 503 is Gemini's
     UNAVAILABLE. Both mean the same thing to the person reading it:
     come back shortly, nothing was spent on your work. */
  if (status === 529 || status === 503) {
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
   they land instead of showing a spinner for ninety seconds.

   BOTH PROVIDERS SPEAK SSE AND NEITHER SPEAKS THE SAME SSE, so
   the framing is here — once — and what a frame MEANS is a
   `read` function passed in. It returns `{ text, stop, error }`
   and the loop below does not know which API it is reading.

   The separator is `\r?\n\r?\n` rather than `\n\n`: Anthropic
   sends bare newlines and Gemini sends CRLF, and a splitter that
   only knows one of them reads the other as a single frame that
   never ends. The `\r` can also arrive at the end of one network
   chunk and the `\n` at the start of the next, which is why the
   match is done on the buffer rather than on the decoded chunk. */
async function readStream(res, read, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const SEP = /\r?\n\r?\n/;
  let buffer = '';
  let text = '';
  let stop = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let m;
    // SSE frames are separated by a blank line. Anything after the
    // last one is a partial frame and stays in the buffer.
    while ((m = SEP.exec(buffer))) {
      const frame = buffer.slice(0, m.index);
      buffer = buffer.slice(m.index + m[0].length);
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let evt = null;
        try { evt = JSON.parse(payload); } catch (e) { continue; }
        const part = read(evt);
        if (!part) continue;
        if (part.error) throw new AIError(part.error, 'stream');
        if (part.stop) stop = part.stop;
        if (part.text) { text += part.text; if (onText) onText(text); }
      }
    }
  }
  return { text, stop };
}

/* ---- the two wire formats ----------------------------------
   Each of these is the whole difference between the providers.
   A request builder returns the url, the headers WITHOUT the key,
   the name of the header the key goes in, and the body; the one
   caller below adds the key and does the fetch. The key is never
   part of what these return and never part of a url.
   ------------------------------------------------------------ */

function anthropicRequest(prov, { model, system, user, schema, maxTokens, effort }) {
  return {
    url: prov.origin + '/v1/messages',
    authHeader: 'x-api-key',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': API_VERSION,
      // Without this the API refuses a request made from a page.
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: {
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
    }
  };
}

function geminiRequest(prov, { model, system, user, schema, maxTokens, effort }) {
  /* `?alt=sse` is not optional: without it :streamGenerateContent
     answers with a JSON array rather than server-sent events, and
     the reader above would see no frames at all.

     `responseJsonSchema` rather than `responseSchema`, because the
     schemas in this file are plain JSON Schema — `responseSchema`
     is an OpenAPI 3.0 subset that rejects `additionalProperties`,
     which every schema here sets to false on purpose.

     `maxOutputTokens` INCLUDES thinking tokens on this API, which
     is why the ceilings each job passes are the budget for both
     halves and not just the answer. `thinkingLevel` takes the same
     words the Anthropic effort does, so one argument serves both. */
  return {
    url: prov.origin + '/v1beta/models/' + encodeURIComponent(model)
       + ':streamGenerateContent?alt=sse',
    authHeader: 'x-goog-api-key',
    headers: { 'content-type': 'application/json' },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingLevel: effort }
      }
    }
  };
}

/** Anthropic's stream is typed events: a delta carries the text, a
    message_delta carries the reason it stopped. */
function anthropicFrame(evt) {
  if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
    return { text: evt.delta.text };
  }
  if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason) {
    return { stop: evt.delta.stop_reason };
  }
  if (evt.type === 'error') {
    return {
      error: (evt.error && evt.error.message)
        ? String(evt.error.message) : 'The API ended the stream with an error.'
    };
  }
  return null;
}

/* Gemini's finish reasons, in Anthropic's vocabulary. Normalised
   HERE rather than at the two places that read `stop`, so that
   `stop === 'max_tokens'` and `stop === 'refusal'` keep meaning
   one thing each in the one path below. Everything that is a
   model declining to answer maps to `refusal`, because that is
   the sentence the user needs; which filter fired is not. */
const GEMINI_STOP = {
  STOP: 'end_turn',
  MAX_TOKENS: 'max_tokens',
  SAFETY: 'refusal',
  RECITATION: 'refusal',
  BLOCKLIST: 'refusal',
  PROHIBITED_CONTENT: 'refusal',
  SPII: 'refusal',
  IMAGE_SAFETY: 'refusal'
};

/** Gemini's stream is a whole GenerateContentResponse per frame.
    The text is in the candidate's parts — and a part marked
    `thought` is the model's reasoning, not the answer, so it is
    dropped: concatenated into the JSON it would make every parse
    fail, which is the kind of bug that reads as "the model is
    broken". */
function geminiFrame(evt) {
  if (evt.error) {
    return {
      error: evt.error.message
        ? String(evt.error.message) : 'The API ended the stream with an error.'
    };
  }
  const blocked = evt.promptFeedback && evt.promptFeedback.blockReason;
  if (blocked) {
    return { error: 'The API refused the request before answering (' + blocked + ').' };
  }
  const cand = Array.isArray(evt.candidates) ? evt.candidates[0] : null;
  if (!cand) return null;
  const parts = (cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : [];
  const text = parts
    .filter((p) => p && typeof p.text === 'string' && !p.thought)
    .map((p) => p.text).join('');
  const out = {};
  if (text) out.text = text;
  if (cand.finishReason) {
    out.stop = GEMINI_STOP[cand.finishReason] || String(cand.finishReason).toLowerCase();
  }
  return (out.text || out.stop) ? out : null;
}

const WIRE = {
  anthropic: { request: anthropicRequest, frame: anthropicFrame },
  gemini:    { request: geminiRequest,    frame: geminiFrame }
};

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

   THE PROVIDER IS CHOSEN HERE AND NOWHERE ELSE. Everything above
   this line — the three jobs, the four script stages, the schemas,
   the quotation check — is written against this one function and
   none of it knows which API it is talking to.
   ------------------------------------------------------------ */
async function callModel({
  system, user, schema, maxTokens = 32000, effort = 'medium',
  onStatus, signal, progress
}) {
  const prov = provider();
  const key = getKey();
  if (!key) throw new AIError('No API key saved on this device.', 'nokey');

  const model = getModel();
  const say = (m) => { if (onStatus) { try { onStatus(m); } catch (e) { /* UI */ } } };

  const wire = WIRE[prov.id] || WIRE[DEFAULT_PROVIDER];
  const req = wire.request(prov, { model, system, user, schema, maxTokens, effort });

  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      signal,
      /* The key is added HERE, to a header named by the wire
         format, and it is the last thing to touch it. It is not in
         `req`, it is not in the url, and it is not in anything
         logged or thrown below. */
      headers: { ...req.headers, [req.authHeader]: key },
      body: JSON.stringify(req.body)
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AIError('Stopped. Nothing was changed.', 'aborted');
    /* A blocked connect-src and a dead network are the same
       TypeError, and a user cannot tell them apart, so name both.
       The origin named is THIS provider's: sending somebody to add
       the wrong host to their CSP is a worse error than none. */
    throw new AIError(
      'Could not reach ' + prov.host + '. Check the connection — and if you are '
      + 'running your own build of the studio, its Content-Security-Policy has to '
      + 'allow connect-src ' + prov.origin + '.',
      'network'
    );
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* not every error is JSON */ }
    throw errorForStatus(res.status, body, prov);
  }
  if (!res.body) throw new AIError('The API returned an empty response.', 'empty');

  let text, stop;
  try {
    ({ text, stop } = await readStream(res, wire.frame, progress ? (sofar) => {
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
  ...Providers,
  sliceScriptByScene, sceneScriptText, buildPrompt,
  buildDialoguePrompt, buildCritiquePrompt,
  draftShotDivision, dialoguePass, beatCritique, AIError
};

/* ============================================================
   FROM A SYNOPSIS TO A SCRIPT
   ------------------------------------------------------------
   Three jobs, run in order, each a checkpoint the writer reads
   before the next one spends anything:

     draftBeatSheet  synopsis -> this story's version of the 15
                     Save the Cat beats. Small and cheap, and the
                     place to argue with the structure.
     draftSceneList  beats -> scene headings, one line each. Writes
                     the SCENE MODEL, so the breakdown, stripboard,
                     budget and reports have something the moment
                     it lands.
     draftScenePages a BATCH of those scenes -> script elements.

   WHY THREE AND NOT ONE. A feature is about 20,000 words. Tamil
   tokenises at roughly three to six tokens a word against English's
   one and a third, so a Tamil feature is 60,000-120,000 output
   tokens — several times what one response can carry, and the
   ceiling here is 32,000. One call cannot do it, and a call that
   tries gets cut off at `max_tokens` with the writer billed for
   everything up to the cut. Batching is not an optimisation, it is
   the only shape that works.

   AND IT HAS TO RESUME. The state lives in `scriptgen.js` with a
   cursor, so a stopped, failed or closed-tab run continues from the
   last finished batch. Restarting a feature from scene one because
   scene forty timed out would charge the writer twice for the same
   pages.

   LANGUAGE. See SCRIPT_LANGS. The default is Tamil dialogue under
   English action, which is what Tamil sets actually shoot from, and
   it is also the only mode whose page count is arithmetic rather
   than a guess — see the note on the constant.
   ============================================================ */

/* The four modes, and the typographic fact behind the default.
   `--f-script` is Courier Prime, which ships `latin` and
   `latin-ext` and no Tamil subset; no monospaced Tamil font exists
   to swap in. Screenplay page maths — 55 lines a page, a page a
   minute — is arithmetic on a fixed-width grid, so it is exact for
   Latin and an estimate for Tamil. Modes that put Tamil in the
   structural elements say so rather than printing a number the
   grid cannot support. */
export const SCRIPT_LANGS = [
  {
    id: 'ta-dialogue',
    label: 'Tamil dialogue, English slugs and action',
    hint: 'what Tamil crews shoot from — and the page count stays exact',
    exactPages: true
  },
  {
    id: 'tanglish',
    label: 'Tanglish throughout',
    hint: 'romanised Tamil; fits the Courier grid, so the page count stays exact',
    exactPages: true
  },
  {
    id: 'ta-full',
    label: 'Tamil throughout',
    hint: 'action in Tamil too — page count becomes an estimate',
    exactPages: false
  },
  { id: 'en', label: 'English', hint: '', exactPages: true }
];
const langById = Object.fromEntries(SCRIPT_LANGS.map((l) => [l.id, l]));
export const scriptLang = (id) => langById[id] || langById['ta-dialogue'];
export const pagesAreExact = (id) => scriptLang(id).exactPages;

/* What each mode asks for, element by element. Written out rather
   than described, because "write it in Tamil" produced headings in
   Tamil with INT./EXT. transliterated, which no AD can scan. */
const LANG_RULES = {
  'ta-dialogue': [
    'LANGUAGE — this is the standard Tamil shooting-script register:',
    '· Scene headings: English. INT./EXT., the location, DAY/NIGHT.',
    '· Action lines: English, plain and present tense.',
    '· Character names: English capitals (ANBU, not in Tamil script).',
    '· Dialogue: TAMIL SCRIPT. Natural spoken Tamil, not literary Tamil.',
    '· Parentheticals: English.',
    'An English craft word inside Tamil dialogue is correct when that is',
    'what the character would say — "sir", "office", "train" are Tamil now.'
  ],
  tanglish: [
    'LANGUAGE — Tanglish, the romanised register this studio uses:',
    '· Scene headings, action, character names, parentheticals: English.',
    '· Dialogue: Tamil written in ROMAN letters, spoken register.',
    '  "Naan varuven", not "நான் வருவேன்" and not "I will come".',
    '· Do not use Tamil script anywhere. The whole point of this mode is',
    '  that every glyph fits the Courier grid.'
  ],
  'ta-full': [
    'LANGUAGE — Tamil throughout:',
    '· Dialogue, action and parentheticals: Tamil script.',
    '· Scene headings: keep INT./EXT. and DAY/NIGHT in English capitals,',
    '  because they are the structural keywords an AD scans a stack for,',
    '  and put the location in Tamil.',
    '· Character names: English capitals, so the breakdown can match them.'
  ],
  en: ['LANGUAGE — English throughout.']
};
const langRules = (id) => (LANG_RULES[scriptLang(id).id] || LANG_RULES.en).join('\n');

const SCRIPT_SYSTEM = [
  'You are a Tamil screenwriter working on an independent feature shot in and',
  'around Chennai on a small budget. You write the script, not a treatment of',
  'the script.',
  '',
  'Craft rules:',
  '· Write what the camera sees and what the microphone hears. Nothing else.',
  '  No interiority, no "he realises", no "she remembers" — if the audience',
  '  cannot see it, it is not in an action line.',
  '· Action in the present tense, in short paragraphs. Four lines is long.',
  '· Dialogue is how people speak, with the hesitations and the half-sentences.',
  '  Nobody explains the plot to someone who already knows it.',
  '· Budget is a craft constraint, not an afterthought. Crowds, rain, night',
  '  exteriors, vehicles and children cost money. Prefer two people in a room',
  '  with something at stake.',
  '· No song sequences unless the synopsis asks for one. If it does, write the',
  '  situation and the cut, not lyrics.',
  '· Do not describe camera or editing. No "CUT TO" between every scene, no',
  '  "we PAN across". The scene heading is the cut.',
  '· Answer only with the JSON the schema describes.'
].join('\n');

/* ---- stage 1: the beat sheet -------------------------------
   The fifteen beats are NOT invented here. They come from
   src/data/studies.json through the caller, so the model fills in
   this story's version of a vocabulary the app already teaches and
   already renders — and the schema pins the ids, so a beat cannot
   be renamed, merged or dropped. */
function beatSchemaFor(beatIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['logline', 'beats'],
    properties: {
      logline: { type: 'string', description: 'one sentence: who wants what, and what stands in the way' },
      beats: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'happens'],
          properties: {
            id: { type: 'string', enum: beatIds.slice() },
            happens: { type: 'string', description: 'what happens at this beat IN THIS STORY, two or three sentences' }
          }
        }
      }
    }
  };
}

/**
 * Stage 1. Synopsis -> this story's fifteen beats.
 *
 *   job  { synopsis, format, lang, beats:[{id,label,pages,function}] }
 *
 * Resolves to { logline, byBeat: Map<beatId, happens>, truncated, model }.
 * Writes nothing.
 */
export async function draftBeatSheet(job, { onStatus, signal } = {}) {
  const synopsis = str(job && job.synopsis, 6000);
  if (!synopsis) throw new AIError('Write a synopsis first — a paragraph is enough.', 'nosynopsis');
  const beats = Array.isArray(job.beats) ? job.beats : [];
  if (!beats.length) throw new AIError('The beat vocabulary did not load.', 'nobeats');

  const ids = beats.map((b) => String(b.id));
  const lines = [
    'Here is the synopsis for a Tamil ' + (job.format === 'short' ? 'short film' : 'feature')
      + '. Place it on the fifteen-beat structure below.',
    '',
    'SYNOPSIS:',
    synopsis,
    '',
    'Fill in every beat. Where the synopsis is silent, INVENT something that',
    'serves the story it is telling — that is the job — but never contradict',
    'what the synopsis actually says.',
    '',
    langRules(job.lang),
    '',
    'Write `happens` in ENGLISH for every mode. This is the writer\'s own',
    'planning document, not a page of the script.',
    '',
    'THE BEATS:'
  ];
  for (const b of beats) {
    lines.push('· ' + b.id + '  (' + b.label + ', ' + (b.pages || '') + ') — ' + (b.function || ''));
  }

  const { parsed, truncated, model } = await callModel({
    system: SCRIPT_SYSTEM,
    user: lines.join('\n'),
    schema: beatSchemaFor(ids),
    maxTokens: 12000,
    effort: 'high',
    onStatus,
    signal,
    progress: (sofar) => {
      const n = (sofar.match(/"happens"/g) || []).length;
      return n ? 'Shaping the structure… ' + n + ' of ' + ids.length + ' beats' : 'Shaping the structure…';
    }
  });

  if (!Array.isArray(parsed.beats)) {
    throw new AIError('The reply was not a beat sheet, so nothing was saved.', 'malformed');
  }
  const wanted = new Set(ids);
  const byBeat = new Map();
  for (const b of parsed.beats) {
    if (!b || typeof b !== 'object') continue;
    const id = String(b.id ?? '');
    if (!wanted.has(id)) continue;          // never write a beat we did not offer
    const happens = str(b.happens, 1200);
    if (happens) byBeat.set(id, happens);
  }
  return { logline: str(parsed.logline, 400), byBeat, truncated, model };
}

/* ---- stage 2: the scene list -------------------------------
   Produces rows shaped for `blankScene()` in scenes.js, because
   the point of this stage is that the rest of the studio lights
   up before a single page is written. script-import.js learned
   this the same way: an import that fills only the editor leaves
   the breakdown, stripboard, budget and reports empty, which is
   half a job. */
function sceneListSchema(beatIds) {
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
          required: ['intExt', 'location', 'dayNight', 'synopsis', 'eighths', 'beat'],
          properties: {
            intExt: { type: 'string', enum: INT_EXT.slice() },
            location: { type: 'string', description: 'the location as it appears in the slug line' },
            dayNight: { type: 'string', enum: DAY_NIGHT.slice() },
            synopsis: { type: 'string', description: 'one line: what happens in this scene' },
            eighths: { type: 'integer', minimum: 1, maximum: 48,
              description: 'length in eighths of a page; 8 is one full page' },
            beat: { type: 'string', enum: beatIds.slice() },
            cast: { type: 'array', items: { type: 'string' },
              description: 'character names appearing, in English capitals' }
          }
        }
      }
    }
  };
}

/**
 * Stage 2. Beats -> a scene list.
 *
 *   job  { synopsis, logline, format, lang, beats:[{id,label,happens}], target }
 *
 * Resolves to { scenes:[…], truncated, model }. Writes nothing.
 */
export async function draftSceneList(job, { onStatus, signal } = {}) {
  const beats = Array.isArray(job.beats) ? job.beats : [];
  if (!beats.length) throw new AIError('Draft the beat sheet first.', 'nobeats');
  const target = Math.max(8, Math.min(120, Number(job.target) || (job.format === 'short' ? 14 : 48)));
  const ids = beats.map((b) => String(b.id));

  const lines = [
    'Break this story into a scene list of about ' + target + ' scenes.',
    '',
    'LOGLINE: ' + str(job.logline, 400),
    '',
    'SYNOPSIS:',
    str(job.synopsis, 6000),
    '',
    'THE BEATS, already agreed — every scene must serve one of them, and each',
    'beat must be served by at least one scene:'
  ];
  for (const b of beats) {
    lines.push('· ' + b.id + ' (' + b.label + '): ' + str(b.happens, 1200));
  }
  lines.push('');
  lines.push(langRules(job.lang));
  lines.push('');
  lines.push([
    'Rules for this stage:',
    '· Put the scenes in screen order.',
    '· `location` is a place a location manager could go and find. Reuse the',
    '  same wording for the same place every time — the breakdown groups on it,',
    '  and "ANBU\'S HOUSE" and "Anbu house" become two locations and two days.',
    '· `eighths` is length in eighths of a page: 8 is one page. Most scenes are',
    '  4 to 16. The total should land near ' + (job.format === 'short' ? '15' : '100') + ' pages.',
    '· `synopsis` is ONE line in English whatever the script language is. It is',
    '  what the stripboard and the call sheet print.',
    '· Night exteriors and crowds cost money. Earn them.'
  ].join('\n'));

  const { parsed, truncated, model } = await callModel({
    system: SCRIPT_SYSTEM,
    user: lines.join('\n'),
    schema: sceneListSchema(ids),
    maxTokens: 24000,
    effort: 'high',
    onStatus,
    signal,
    progress: (sofar) => {
      const n = (sofar.match(/"location"/g) || []).length;
      return n ? 'Laying out scenes… ' + n + ' so far' : 'Laying out scenes…';
    }
  });

  if (!Array.isArray(parsed.scenes)) {
    throw new AIError('The reply was not a scene list, so nothing was saved.', 'malformed');
  }
  const okInt = new Set(INT_EXT);
  const okDay = new Set(DAY_NIGHT);
  const beatSet = new Set(ids);
  const scenes = parsed.scenes
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      intExt: okInt.has(s.intExt) ? s.intExt : 'INT',
      location: str(s.location, 120),
      dayNight: okDay.has(s.dayNight) ? s.dayNight : 'DAY',
      synopsis: str(s.synopsis, 500),
      // clamp rather than trust: an eighths of 0 makes a strip with no
      // height and an eighths of 900 makes a one-scene shoot day.
      eighths: Math.max(1, Math.min(48, Math.round(Number(s.eighths) || 8))),
      beat: beatSet.has(s.beat) ? s.beat : '',
      cast: (Array.isArray(s.cast) ? s.cast : [])
        .map((c) => str(c, 60)).filter(Boolean).slice(0, 24)
    }))
    .filter((s) => s.location);
  if (!scenes.length) {
    throw new AIError('The reply held no usable scenes, so nothing was saved.', 'malformed');
  }
  return { scenes, truncated, model };
}

/* ---- stage 3: the pages ------------------------------------
   One call per BATCH of scenes, not per script and not per scene.
   Per script does not fit; per scene pays the context cost once
   per scene and loses the rhythm between them. A batch gets the
   scenes around it as context and writes only its own. */
const PAGE_ELEMENT_TYPES = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition'];

function pagesSchema(sceneIds) {
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
          required: ['sceneId', 'elements'],
          properties: {
            sceneId: { type: 'string', enum: sceneIds.slice() },
            elements: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'text'],
                properties: {
                  type: { type: 'string', enum: PAGE_ELEMENT_TYPES.slice() },
                  text: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Stage 3. A batch of scenes -> script elements.
 *
 *   job {
 *     lang, logline, format,
 *     scenes: [{ sceneId, slug, synopsis, eighths, cast, beatLabel }],
 *     before: [{ slug, synopsis }],   // the two scenes just before
 *     after:  [{ slug, synopsis }],   // the two just after
 *     characters: [string]            // the running cast, for consistency
 *   }
 *
 * Resolves to { byScene: Map<sceneId, element[]>, truncated, model }.
 * Writes nothing.
 */
export async function draftScenePages(job, { onStatus, signal } = {}) {
  const scenes = Array.isArray(job.scenes) ? job.scenes : [];
  if (!scenes.length) throw new AIError('No scenes in this batch.', 'noscenes');
  const ids = scenes.map((s) => String(s.sceneId));

  const pages = scenes.reduce((n, s) => n + (Number(s.eighths) || 8), 0) / 8;
  const lines = [
    'Write the full script for the ' + scenes.length
      + (scenes.length === 1 ? ' scene' : ' scenes') + ' marked WRITE THIS below.',
    'About ' + (Math.round(pages * 10) / 10) + ' pages in total across the batch.',
    '',
    'LOGLINE: ' + str(job.logline, 400),
    ''
  ];
  if (Array.isArray(job.characters) && job.characters.length) {
    lines.push('CHARACTERS ALREADY ESTABLISHED (keep the spelling exactly): '
      + job.characters.slice(0, 40).join(', '));
    lines.push('');
  }
  if (Array.isArray(job.before) && job.before.length) {
    lines.push('COMES AFTER (context only — do NOT write these):');
    for (const s of job.before) lines.push('  ' + s.slug + ' — ' + str(s.synopsis, 300));
    lines.push('');
  }
  lines.push('WRITE THIS:');
  for (const s of scenes) {
    lines.push('--- SCENE ---');
    lines.push('sceneId: ' + s.sceneId);
    lines.push('heading: ' + s.slug);
    lines.push('length: ' + formatEighths(s.eighths) + ' pages');
    if (s.beatLabel) lines.push('serves the beat: ' + s.beatLabel);
    if (s.synopsis) lines.push('what happens: ' + s.synopsis);
    if (Array.isArray(s.cast) && s.cast.length) lines.push('in the scene: ' + s.cast.join(', '));
    lines.push('');
  }
  if (Array.isArray(job.after) && job.after.length) {
    lines.push('LEADS INTO (context only — do NOT write these):');
    for (const s of job.after) lines.push('  ' + s.slug + ' — ' + str(s.synopsis, 300));
    lines.push('');
  }
  lines.push(langRules(job.lang));
  lines.push('');
  lines.push([
    'Element rules:',
    '· Start each scene with exactly ONE `scene` element whose text is the',
    '  heading given above, copied as it stands.',
    '· `character` holds a name only. The parenthetical goes in `paren`, and',
    '  `paren` text is written WITHOUT the surrounding brackets.',
    '· `dialogue` follows the `character` it belongs to. One speech per element.',
    '· Use `transition` almost never.',
    '· Hit the length. A scene marked 4/8 is half a page, not two pages.',
    '· Return one entry per sceneId, keyed by the exact sceneId given.'
  ].join('\n'));

  const { parsed, truncated, model } = await callModel({
    system: SCRIPT_SYSTEM,
    user: lines.join('\n'),
    schema: pagesSchema(ids),
    maxTokens: 32000,
    effort: 'high',
    onStatus,
    signal,
    progress: (sofar) => {
      const n = (sofar.match(/"sceneId"/g) || []).length;
      return n ? 'Writing… scene ' + n + ' of ' + scenes.length : 'Writing…';
    }
  });

  if (!Array.isArray(parsed.scenes)) {
    throw new AIError('The reply was not script pages, so nothing was added.', 'malformed');
  }
  const wanted = new Set(ids);
  const okTypes = new Set(PAGE_ELEMENT_TYPES);
  const byScene = new Map();
  for (const entry of parsed.scenes) {
    if (!entry || typeof entry !== 'object') continue;
    const sceneId = String(entry.sceneId ?? '');
    if (!wanted.has(sceneId)) continue;
    const els = (Array.isArray(entry.elements) ? entry.elements : [])
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        type: okTypes.has(e.type) ? e.type : 'action',
        // A scene's worth of text, not a novel. The cap is per element.
        text: str(e.text, 4000)
      }))
      .filter((e) => e.text);
    if (els.length) byScene.set(sceneId, els);
  }
  if (!byScene.size) {
    throw new AIError('The reply held no usable pages, so nothing was added.', 'malformed');
  }
  return { byScene, truncated, model };
}
