import { register } from 'node:module';

const mem = new Map();
globalThis.__fakeMem = mem;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        'export const onWriteElsewhere = () => () => {};' +
        'export const flushStorage = () => {};' +
        'export default new Proxy({}, { get: () => () => {} });'), shortCircuit: true };
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

const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');
const P = await import('../src/lib/ai-providers.js');

/* test:ai-retry — a busy model is retried, then the next model answers.
   Owner report (4 Nov 2026): every Run on Gemini 3.8 Flash said "The API is
   overloaded". Google's 503 is per model; callModel now retries the chosen
   model twice, then each fallback once, and only while nothing has streamed.
   Faked fetch only; never a real provider. */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
AI.RETRY_MS[0] = 1; AI.RETRY_MS[1] = 1;
P.setProvider('gemini');
P.setKey('AIza' + 'x'.repeat(30), 'gemini');
P.setModel && P.setModel('gemini-3.8-flash', 'gemini');
const chosen = P.getModel('gemini');
ok(chosen === 'gemini-3.8-flash', 'chosen model is 3.8 Flash (got ' + chosen + ')');
const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };
const job = { system: 's', user: 'u', schema };
const modelOf = (url) => decodeURIComponent(url.split('/models/')[1].split(':')[0]);
const busy = { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } } };

async function run(respond, extra = {}) {
  const log = [];
  const undo = installFakeFetch(respond, log);
  try { return { out: await AI.callModelForTask({ ...job, ...extra }), log }; }
  catch (e) { return { err: e, log }; }
  finally { undo(); }
}

// 1. busy twice, then the chosen model answers
{ let n = 0; const { out, log } = await run(() => (++n <= 2 ? busy : { a: 'x' }));
  ok(out && out.parsed.a === 'x', '1: answered on the third try');
  ok(log.length === 3 && log.every((r) => modelOf(r.url) === chosen), '1: three calls, all on the chosen model');
  ok(out && out.model === chosen && !out.fellBackFrom, '1: no fallback reported'); }

// 2. chosen always busy, 3.7 Flash answers
{ const { out, log } = await run((r) => (modelOf(r.url) === chosen ? busy : { a: 'y' }));
  ok(out && out.parsed.a === 'y', '2: the fallback answered');
  ok(log.length === 4 && modelOf(log[3].url) === 'gemini-3.7-flash', '2: fourth call is 3.7 Flash');
  ok(out && out.model === 'gemini-3.7-flash' && out.fellBackFrom === chosen, '2: reports the model that answered');
  ok(log.every((r) => !r.url.includes('key=')), '2: the key never goes in the URL'); }

// 3. everything busy: one clear error naming what was tried
{ const { err, log } = await run(() => busy);
  ok(err && err.kind === 'overloaded', '3: kind overloaded');
  ok(err && /3\.8 Flash/.test(err.message) && /3\.7 Flash/.test(err.message) && /Settings/.test(err.message), '3: message names the models and where to change');
  ok(log.length === 5, '3: 3 tries + 2 fallbacks (got ' + log.length + ')'); }

// 4. chosen model not served (404): straight to the fallback, no same-model retry
{ const { out, log } = await run((r) => (modelOf(r.url) === chosen ? { status: 404, body: { error: { message: 'models/x is not found' } } } : { a: 'z' }));
  ok(out && out.parsed.a === 'z' && log.length === 2, '4: 404 skips the retries (got ' + log.length + ' calls)'); }

// 5. a request error is not retried
{ const { err, log } = await run(() => ({ status: 400, body: { error: { message: 'bad schema' } } }));
  ok(err && err.kind === 'request' && log.length === 1, '5: 400 is one call and its own error'); }

// 6. a bad key is not retried
{ const { err, log } = await run(() => ({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. API_KEY_INVALID' } } }));
  ok(err && err.kind === 'auth' && log.length === 1, '6: a rejected key is one call'); }

// 7. a 200 stream that carries UNAVAILABLE as an event, before any text: retried
const real = globalThis.fetch;
const enc = new TextEncoder();
const sse = (frames) => new Response(new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode('data: ' + JSON.stringify(f) + '\r\n\r\n')); c.close(); } }), { status: 200 });
{ let n = 0;
  globalThis.fetch = async () => (++n === 1
    ? sse([{ error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded.' } }])
    : sse([{ candidates: [{ content: { parts: [{ text: '{"a":"w"}' }] }, finishReason: 'STOP' }] }]));
  let out = null, err = null;
  try { out = await AI.callModelForTask({ ...job }); } catch (e) { err = e; }
  ok(out && out.parsed.a === 'w' && n === 2, '7: mid-stream UNAVAILABLE before text is retried' + (err ? ' (' + err.message + ')' : '')); }

// 8. ...but once text has reached the page, it goes up as it is (no re-stream)
{ let n = 0; const seen = [];
  globalThis.fetch = async () => { n++; return sse([
    { candidates: [{ content: { parts: [{ text: '{"a":' }] } }] },
    { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }]); };
  let err = null;
  try { await AI.callModelForTask({ ...job, onText: (t) => seen.push(t) }); } catch (e) { err = e; }
  ok(err && err.kind === 'overloaded' && n === 1 && seen.length > 0, '8: streamed text is never re-requested by callModel'); }

// 9. Stop during a retry wait ends at once and starts nothing new
{ AI.RETRY_MS[0] = 5000; let n = 0; const ctl = new AbortController();
  globalThis.fetch = async () => { n++; setTimeout(() => ctl.abort(), 20); return new Response(JSON.stringify(busy.body), { status: 503 }); };
  const t0 = Date.now(); let err = null;
  try { await AI.callModelForTask({ ...job, signal: ctl.signal }); } catch (e) { err = e; }
  ok(err && err.kind === 'aborted' && n === 1 && Date.now() - t0 < 2000, '9: Stop ends the wait (calls ' + n + ', ' + (Date.now() - t0) + 'ms)');
  AI.RETRY_MS[0] = 1; }
globalThis.fetch = real;

// 9b. a 429 goes straight to the next model (quota is per model)
{ const { out, log } = await run((r) => (modelOf(r.url) === chosen ? { status: 429, body: { error: { message: 'quota' } } } : { a: 'q' }));
  ok(out && out.parsed.a === 'q' && log.length === 2, '9b: 429 skips the same-model retries (got ' + log.length + ' calls)'); }

// 10. the provider table: fallbacks never repeat the chosen model
const fb = P.fallbackModels('gemini-3.8-flash', 'gemini').map((m) => m.id);
ok(fb[0] === 'gemini-3.7-flash' && !fb.includes('gemini-3.8-flash'), '10: fallback order ' + fb.join(','));
ok(P.modelLabel('gemini-3.7-flash', 'gemini') === 'Gemini 3.7 Flash', '10: fallback has a label');

console.log('test:ai-retry — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
