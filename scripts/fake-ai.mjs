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
