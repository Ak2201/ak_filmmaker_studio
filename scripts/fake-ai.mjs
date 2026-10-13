/* ============================================================
   FAKE AI — a stand-in fetch for both providers, for the AI tests
   ------------------------------------------------------------
   There is no real API key in a test run, and there must never need
   to be one. This answers api.anthropic.com and
   generativelanguage.googleapis.com the way each actually streams:

     Anthropic  `event:`/`data:` frames separated by a bare LF blank
                line, typed events (message_start, content_block_delta
                with text_delta, message_delta with stop_reason).
     Gemini     `data:` frames separated by CRLF CRLF, a whole
                GenerateContentResponse per frame, and a `thought: true`
                part first — which the reader must drop, or every JSON
                parse fails.

   The JSON answer is cut into small chunks at arbitrary offsets (and
   for Gemini a CRLF is split across two network chunks), so a reader
   that only works when a frame arrives whole fails here.

   `respond(req)` decides the answer: it receives { provider, url,
   headers, body, user } and returns a plain object (the model's JSON),
   or { status, body } for an error.
   ============================================================ */

const enc = new TextEncoder();

function chunkString(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

function anthropicSSE(json) {
  const text = JSON.stringify(json);
  const frames = [];
  frames.push('event: message_start\ndata: ' + JSON.stringify({ type: 'message_start', message: { id: 'msg_x', model: 'claude' } }) + '\n\n');
  frames.push('event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) + '\n\n');
  for (const piece of chunkString(text, 37)) {
    frames.push('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }) + '\n\n');
  }
  frames.push('event: message_delta\ndata: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + '\n\n');
  frames.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  return frames.join('');
}

function geminiSSE(json) {
  const text = JSON.stringify(json);
  const frames = [];
  frames.push('data: ' + JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Let me think about the script {not json', thought: true }] } }] }) + '\r\n\r\n');
  const pieces = chunkString(text, 53);
  pieces.forEach((piece, i) => {
    const cand = { content: { role: 'model', parts: [{ text: piece }] } };
    if (i === pieces.length - 1) cand.finishReason = 'STOP';
    frames.push('data: ' + JSON.stringify({ candidates: [cand] }) + '\r\n\r\n');
  });
  return frames.join('');
}

/** A ReadableStream that delivers `s` in uneven network chunks. */
function streamOf(s) {
  const bytes = enc.encode(s);
  const cuts = [];
  for (let i = 0; i < bytes.length;) { const n = 17 + ((i * 7) % 61); cuts.push(bytes.slice(i, i + n)); i += n; }
  let k = 0;
  return new ReadableStream({
    pull(ctrl) { if (k < cuts.length) ctrl.enqueue(cuts[k++]); else ctrl.close(); }
  });
}

export function installFakeFetch(respond, log = []) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const provider = u.startsWith('https://api.anthropic.com') ? 'anthropic'
      : u.startsWith('https://generativelanguage.googleapis.com') ? 'gemini' : null;
    if (!provider) throw new TypeError('fake-ai: unexpected host ' + u);
    if (init.signal && init.signal.aborted) {
      const e = new Error('aborted'); e.name = 'AbortError'; throw e;
    }
    const body = JSON.parse(init.body || '{}');
    const user = provider === 'anthropic'
      ? body.messages[0].content
      : body.contents[0].parts[0].text;
    const system = provider === 'anthropic' ? body.system : body.systemInstruction.parts[0].text;
    const req = { provider, url: u, headers: init.headers || {}, body, user, system };
    log.push(req);
    const ans = await respond(req);
    if (ans && ans.status) {
      return new Response(JSON.stringify(ans.body || {}), { status: ans.status, headers: { 'content-type': 'application/json' } });
    }
    const sse = provider === 'anthropic' ? anthropicSSE(ans) : geminiSSE(ans);
    return new Response(streamOf(sse), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return () => { globalThis.fetch = real; };
}

export { anthropicSSE, geminiSSE };

/* ============================================================
   DESK ANSWERS — deterministic replies for the AI Desk's tasks
   ------------------------------------------------------------
   `deskAnswer({ system, user })` returns the model's JSON for the
   three script-page tasks (coverage, dialogue pass, beat critique),
   keyed off the prompt text the existing ai.js builders write, so a
   proof can hand it straight to anthropicSSE / geminiSSE (browser,
   via Playwright route()) or return it from installFakeFetch's
   `respond` (Node).

   REFINEMENTS. A Desk refine re-sends the task's own system prompt
   and schema with a user message holding the original input, the
   previous version's JSON and the chat instructions, numbered
   "1. …", "2. …" (src/lib/ai-refine.js refineBlock()). refineRound()
   counts the numbers in the last such list, and the answer carries
   the version it is, so v1, v2 and v3 are each different and each
   predictable:

     dialogue   every EVEN-indexed line of the speech (0, 2, 4 …) gets
                " (pass vN)" appended; odd lines are left alone. A
                three-line speech therefore yields TWO hunks with an
                unchanged line between them, which is what a proof
                needs to untick one and accept the other.
     critique   notes quote the first answer verbatim; the verdict
                ends "(vN)".
     coverage   every quote is copied from the scene text sent; the
                notes and the verdict reason end "(vN)".
   ============================================================ */

/** How many numbered chat instructions the prompt carries (0 = first send). */
export function refineRound(user) {
  /* The numbered list that follows the instructions heading — in
     src/lib/ai-refine.js that is "The writer asks for these changes,
     in order:" — taking the LAST such list in the prompt. */
  const re = /(?:instruction|asks for these changes|changes, in order)[^\n]*\n((?:[ \t]*\d+[.)][ \t]+[^\n]*(?:\n|$))+)/gi;
  let block = '';
  for (const m of String(user || '').matchAll(re)) block = m[1];
  let n = 0;
  for (const m of block.matchAll(/^\s*(\d+)[.)]\s+\S/gm)) n = Math.max(n, Number(m[1]));
  return n;
}

/** The speech block buildDialoguePrompt writes: the lines after "speech:"
    up to the next blank line or "---" section. */
export function speechOf(user) {
  const m = String(user || '').match(/(?:^|\n)speech:\n([\s\S]*?)(?:\n\s*\n|\n---|$)/);
  return m ? m[1] : '';
}

/** What a dialogue pass proposes for `speech` at version `v`. */
export function passedSpeech(speech, v) {
  return String(speech).split('\n').map((l, i) => (i % 2 === 0 && l.trim() ? l + ' (pass v' + v + ')' : l)).join('\n');
}

function firstAnswer(user) {
  const m = String(user || '').match(/what the writer has put in it:\n\s+[^:\n]+:\s*([^\n]+)/);
  return m ? m[1].trim() : '';
}

export function deskAnswer({ system = '', user = '' } = {}) {
  const v = refineRound(user) + 1;
  const tag = ' (v' + v + ')';

  if (/--- THE SPEECH TO WORK ON ---/.test(user) || /dialogue editor/i.test(system)) {
    const speech = speechOf(user) || 'Line one.';
    return {
      keep: 'The rhythm already works' + tag,
      options: [
        { text: passedSpeech(speech, v), note: 'Cuts the explaining' + tag },
        { text: speech.split('\n').reverse().join('\n'), note: 'Reordered' + tag }
      ]
    };
  }

  if (/--- THE STEP TO CRITIQUE ---/.test(user)) {
    const a = firstAnswer(user);
    const quote = a.slice(0, Math.min(24, a.length)).trim();
    return {
      verdict: 'Strong enough to build on' + tag,
      notes: [
        { quote, problem: 'The want is stated, not shown' + tag, tryThis: 'Put it in an action' + tag },
        { quote, problem: 'The cost is unclear' + tag, tryThis: 'Name what he loses' + tag }
      ]
    };
  }

  const scenes = [...String(user).matchAll(/--- SCENE (\S+) ---\n([\s\S]*?)(?=\n--- SCENE |\n*$)/g)]
    .map((m) => ({ n: m[1], text: m[2] }));
  if (scenes.length) {
    const quoteFrom = (t) => {
      const line = t.split('\n').map((x) => x.trim()).find((x) => x.length > 8 && !/^(INT|EXT)[. ]/.test(x)) || t.trim();
      return line.slice(0, 30).trim();
    };
    return {
      scenes: scenes.map((s) => ({ scene: s.n, summary: 'Scene ' + s.n + ' moves on' + tag })),
      evidence: scenes.slice(0, 4).map((s, i) => ({
        aspect: ['premise', 'character', 'dialogue', 'pacing'][i], scene: s.n, quote: quoteFrom(s.text), note: 'Shows the want' + tag
      }))
    };
  }

  if (/Write the coverage/.test(user)) {
    const sec = (assessment) => ({ assessment: assessment + tag, points: [] });
    return {
      logline: 'A son leaves home to find work' + tag,
      premise: sec('Simple and clear'),
      structure: { assessment: 'A clean line' + tag, actBreaks: [], points: [] },
      character: { protagonist: 'ANBU', want: 'Work', need: 'Forgiveness', assessment: 'Want clear' + tag, points: [] },
      dialogue: sec('Mostly natural'), pacing: sec('Brisk'), marketability: sec('An OTT drama'),
      verdict: 'consider', verdictWhy: 'A voice worth developing' + tag
    };
  }
  return { ok: true };
}
