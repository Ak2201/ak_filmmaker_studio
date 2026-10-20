/* ============================================================
   TEST — drawn storyboard frames (NEXT-UI-REVAMP-PLAN phase 4),
   in Node, no browser, no key, no network, no Google account:

       node scripts/test-board-frames.mjs
       (or: npm run test:board-frames)

   WHAT THIS CANNOT PROVE: that Gemini answers this request with a
   picture, or that Drive stores it. Both are FAKED here (fetch is
   replaced). The model id in ai-providers.js `imageModels` and the
   request shape were written against Google's published API and
   have not been run against a real key or a real Drive.

   Asserts:
     · board-frames.js (pure): the gate's order (no Drive build →
       signed out → not connected → no token → ok), each with a reason
       and the fix; boardJobs skips shots that already have a drawn
       frame and caps a run at MAX_FRAMES; the input round-trips
       through parseBoardInput (style + the lines kept); a chip picks
       the style and free text rides as a note; the prompt names the
       shot, the setting and the cast, and asks for no text in the
       image; refs: only `drive:<id>` is a drawn ref.
     · ai.js generateImage: the Gemini key goes in `x-goog-api-key`
       and NEVER in the URL; the body asks for an IMAGE in 16:9; the
       inline base64 comes back as a Blob of the same bytes; it uses
       the Gemini key even while the text tools are set to Anthropic;
       400 API_KEY_INVALID reads as a rejected key; no key → nokey; a
       blocked prompt → refusal; an answer with no picture → malformed.
     · drive.js: createFile is one multipart POST with the bytes
       untouched and the Bearer token in a header; downloadFileBlob
       reads alt=media; with no token a call REJECTS rather than
       opening anything; driveRef/driveFileIdOf round-trip.
   ============================================================ */
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
        'export const flushStorage = () => Promise.resolve();' +
        'export default {};'), shortCircuit: true };
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

const B = await import('../src/lib/board-frames.js');
const AI = await import('../src/lib/ai.js');
const Drive = await import('../src/lib/drive.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const rejects = async (p, test, m) => {
  try { await p; ok(false, m + ' (it resolved)'); }
  catch (e) { ok(test(e), m + ' — got ' + (e && (e.kind || e.status)) + ': ' + (e && e.message)); }
};

/* ---- the gate ------------------------------------------------- */
const all = { configured: true, signedIn: true, connected: true, token: true };
eq(B.boardGate(all), { ok: true, state: 'ok', text: '' }, 'every fact true: the gate is open');
eq(B.boardGate({ ...all, configured: false }).state, 'nodrive', 'no Drive in this build comes first');
eq(B.boardGate({ ...all, configured: false, signedIn: false }).state, 'nodrive', '…even before signed out');
const so = B.boardGate({ ...all, signedIn: false, connected: false, token: false });
eq(so.state, 'signedout', 'signed out is next');
eq(so.href, 'settings.html#account', 'signed out points at the account card');
const nc = B.boardGate({ ...all, connected: false, token: false });
eq([nc.state, nc.href], ['noconnect', 'settings.html#drive'], 'not connected points at the Drive card');
const rc = B.boardGate({ ...all, token: false });
eq([rc.state, rc.reconnect], ['reconnect', true], 'a lapsed token asks to Reconnect Drive');
ok([so, nc, rc].every((g) => g.ok === false && /Drive/.test(g.text)), 'every refusal names Drive and says why');

/* ---- what to draw ---------------------------------------------- */
const scenes = [
  { id: 'sc1', number: '4', intExt: 'INT', location: 'CHAI SHOP', dayNight: 'DAY', synopsis: 'Ravi waits.', elements: { cast: ['RAVI', 'MEENA'] } },
  { id: 'sc2', number: '5', intExt: 'EXT', location: 'BUS STAND', dayNight: 'NIGHT', synopsis: 'Rain.', elements: {} }
];
const shots = [];
for (let i = 0; i < 12; i++) shots.push({ id: 'sh' + i, sceneId: i < 6 ? 'sc1' : 'sc2', number: String(i + 1), size: 'WS', angle: 'low', lens: '35mm', movement: 'static', description: i === 0 ? 'Ravi wipes a glass | slowly' : '' });
const frames = [
  { id: 'f1', shotId: 'sh0', ref: 'drive:1AbCdEfGhIjKlMn' },     // drawn
  { id: 'f2', shotId: 'sh1', ref: 'https://example.com/x.png' }, // a link is not a drawing
  { id: 'f3', shotId: 'sh2', ref: 'drive:' }                      // a broken ref is not either
];
ok(B.isDrawnRef('drive:1AbCdEfGhIjKlMn') && !B.isDrawnRef('https://x') && !B.isDrawnRef('drive:') && !B.isDrawnRef(''), 'only drive:<id> is a drawn ref');
const plan = B.boardJobs({ shots, scenes, frames });
eq(plan.jobs.length, B.MAX_FRAMES, 'a run is capped at MAX_FRAMES');
eq(plan.more, 11 - B.MAX_FRAMES, 'the rest are counted, not dropped silently');
ok(!plan.jobs.some((j) => j.shotId === 'sh0'), 'a shot with a drawn frame is not drawn again');
ok(plan.jobs.some((j) => j.shotId === 'sh1'), 'a shot with only a link is still drawn');
eq(plan.jobs[0].label, '4.2', 'labels are scene.shot');
eq(B.boardJobs({ shots, scenes, frames, onlyShotIds: ['sh7'] }).jobs.map((j) => j.shotId), ['sh7'], 'onlyShotIds narrows');

const text = B.boardInput(plan, 'ink');
ok(/^Style: Ink and wash/.test(text), 'the input opens with the style');
ok(/more shots? without a drawing/.test(text), 'the input says how many are left for the next run');
const back = B.parseBoardInput(text);
eq(back.style, 'ink', 'the style reads back');
eq(back.labels, plan.jobs.map((j) => j.label), 'every line reads back by label, in order');
const cut = text.split('\n').filter((l) => !l.startsWith('4.3 ')).join('\n').replace('Ink and wash', 'colour');
const back2 = B.parseBoardInput(cut);
ok(!back2.labels.includes('4.3') && back2.style === 'colour', 'a deleted line is skipped and a typed style wins');
eq(B.parseBoardInput('').style, B.DEFAULT_STYLE, 'no style line → the default');
const desc = B.boardJobs({ shots, scenes, frames: [] }).jobs[0];
ok(B.parseBoardInput(B.jobLine(desc)).labels[0] === '4.1', 'a description holding a "|" still reads back by label');

eq(B.styleFromRefine(['Colour'], 'pencil'), { style: 'colour', notes: [] }, 'a chip sets the style');
eq(B.styleFromRefine(['Pencil sketch', 'make it rain harder'], 'colour'), { style: 'pencil', notes: ['make it rain harder'] }, 'free text is a note, not a style');
eq(B.matchStyle('in color please'), 'colour', 'US spelling finds colour');

const prompt = B.framePrompt(desc, 'marker', ['wider']);
ok(/storyboard/.test(prompt) && /grey markers/.test(prompt), 'the prompt carries the style');
ok(/size WS/.test(prompt) && /lens 35mm/.test(prompt) && /INT\. CHAI SHOP — DAY/.test(prompt), 'the prompt names the camera and the setting');
ok(/RAVI, MEENA/.test(prompt), 'the prompt names the scene cast');
ok(/No text/.test(prompt) && /The writer also asks: wider/.test(prompt), 'no text in the image; the note rides along');
ok(/^filmmakers-studio-frame-4\.1-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.png$/.test(B.frameFileName(desc, 'image/png', new Date('2026-10-14T10:20:30Z'))), 'a readable Drive file name');
ok(/\.jpg$/.test(B.frameFileName(desc, 'image/jpeg')), 'jpeg → .jpg');

/* ---- ai.js generateImage, against a faked Gemini --------------- */
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 250, 251]);
const b64 = Buffer.from(PNG).toString('base64');
const log = [];
let answer = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: b64 } }] }, finishReason: 'STOP' }] } });
globalThis.fetch = async (url, opts) => {
  log.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
  const a = answer();
  return { ok: a.status < 300, status: a.status, json: async () => a.body, body: null };
};

await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'nokey', 'no Gemini key → nokey');
eq(log.length, 0, 'no key: nothing was sent');

AI.setProvider('anthropic');
AI.setKey('sk-ant-aaaaaaaaaaaaaaaaaaaaaaaa', 'anthropic');
const GKEY = 'AIzaFAKEFAKEFAKEFAKEFAKEFAKE';
AI.setKey(GKEY, 'gemini');
const got = await AI.generateImage({ prompt: 'draw a chai shop' });
const req = log[0];
ok(req.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'), 'it goes to the Gemini host');
ok(req.url.includes(encodeURIComponent(AI.imageModel('gemini')) + ':generateContent'), 'the image model, generateContent');
ok(!/[?&]key=/.test(req.url) && !req.url.includes(GKEY), 'THE KEY IS NOT IN THE URL');
eq(req.headers['x-goog-api-key'], GKEY, 'the Gemini key is in x-goog-api-key, though the text tools are on Anthropic');
ok(!JSON.stringify(req.body).includes(GKEY), 'the key is not in the body');
eq(req.body.generationConfig.responseModalities, ['IMAGE'], 'it asks for an image');
eq(req.body.generationConfig.imageConfig.aspectRatio, '16:9', 'in 16:9');
eq(req.body.contents[0].parts[0].text, 'draw a chai shop', 'the prompt is what was given');
ok(got.blob instanceof Blob && got.blob.type === 'image/png', 'a Blob comes back, typed');
eq([...new Uint8Array(await got.blob.arrayBuffer())], [...PNG], 'with the same bytes');
eq(AI.getProviderId(), 'anthropic', 'the active provider was not changed');

answer = () => ({ status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } });
await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'auth', '400 API_KEY_INVALID reads as a rejected key');
answer = () => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } });
await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'refusal', 'a blocked prompt is a refusal');
answer = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'I cannot' }] }, finishReason: 'IMAGE_SAFETY' }] } });
await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'refusal', 'IMAGE_SAFETY is a refusal');
answer = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'only words' }] }, finishReason: 'STOP' }] } });
await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'malformed', 'no picture → malformed, nothing kept');
answer = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'text/html', data: b64 } }] } }] } });
await rejects(AI.generateImage({ prompt: 'x' }), (e) => e.kind === 'malformed', 'a non-image inline part is refused');

/* ---- drive.js, against a faked Drive --------------------------- */
eq(Drive.driveFileIdOf(Drive.driveRef('1AbCdEfGhIjKlMn')), '1AbCdEfGhIjKlMn', 'driveRef / driveFileIdOf round-trip');
eq(Drive.driveFileIdOf('https://drive.google.com/x'), '', 'a link is not a drive ref');
eq(Drive.driveFileIdOf('drive:../../etc'), '', 'a ref with path characters is refused');

const dlog = [];
let dans = () => ({ status: 200, json: { id: 'FILE123456789', name: 'n' } });
Drive.__setFetch(async (url, opts) => {
  dlog.push({ url: String(url), opts });
  const a = dans();
  return { ok: a.status < 300, status: a.status, json: async () => a.json, blob: async () => a.blob, text: async () => '' };
});
Drive.forgetToken();
await rejects(Drive.createFile('a.png', new Blob([PNG], { type: 'image/png' }), 'image/png'),
  (e) => /click|client id/.test(e.message), 'with no token a Drive call rejects instead of opening a window');
eq(dlog.length, 0, '…and sends nothing');

Drive.adoptToken('ya29.TOKEN', 3600);
const meta = await Drive.createFile('frame.png', new Blob([PNG], { type: 'image/png' }), 'image/png', { description: 'd' });
eq(meta.id, 'FILE123456789', 'createFile returns the metadata');
const up = dlog[0];
ok(up.url.startsWith('https://www.googleapis.com/upload/drive/v3/files?') && /uploadType=multipart/.test(up.url), 'one multipart upload');
eq(up.opts.method, 'POST', 'a POST (a new file, never a PATCH of the backup)');
eq(up.opts.headers.Authorization, 'Bearer ya29.TOKEN', 'the token is in the Authorization header');
ok(!up.url.includes('ya29'), 'the token is not in the URL');
const raw = new Uint8Array(await up.opts.body.arrayBuffer());
const asText = Buffer.from(raw).toString('latin1');
ok(/"name":"frame\.png"/.test(asText) && /"mimeType":"image\/png"/.test(asText) && /"description":"d"/.test(asText), 'the metadata part names the file and its type');
const at = Buffer.from(raw).indexOf(Buffer.from(PNG));
ok(at > 0, 'the image bytes cross untouched (binary, not text-mangled)');

dans = () => ({ status: 200, blob: new Blob([PNG], { type: 'image/png' }) });
const blob = await Drive.downloadFileBlob('FILE123456789');
ok(/\/drive\/v3\/files\/FILE123456789\?alt=media$/.test(dlog[1].url), 'downloadFileBlob reads alt=media');
eq(blob.size, PNG.length, '…and returns the picture');

dans = () => ({ status: 401, json: { error: { message: 'expired' } } });
const before401 = dlog.length;
await rejects(Drive.downloadFileBlob('FILE123456789'), (e) => /click|client id/.test(e.message), 'a 401 does not open a window: it rejects, and the page shows Reconnect Drive');
eq(dlog.length - before401, 1, '…after exactly one request (no silent retry)');
dans = () => ({ status: 404, json: { error: { message: 'not found' } } });
Drive.adoptToken('ya29.TOKEN2', 3600);
eq(await Drive.deleteFileQuiet('FILE123456789'), false, 'deleteFileQuiet: a 404 is "already gone"');

/* ---- uploads and the frame's shape ---- */
ok(JSON.stringify(B.fitWithin(4000, 3000)) === '{"w":1600,"h":1200}', 'a 4000x3000 photo fits 1600 on the long edge');
ok(JSON.stringify(B.fitWithin(1080, 1920)) === '{"w":900,"h":1600}', 'a portrait fits on its height');
ok(JSON.stringify(B.fitWithin(800, 450)) === '{"w":800,"h":450}', 'a small picture is never enlarged');
ok(JSON.stringify(B.fitWithin(0, 450)) === '{"w":0,"h":0}', 'no size, no picture');
ok(B.uploadProblem({ type: 'image/png', size: 1000 }) === '', 'a PNG is accepted');
ok(/not a picture/.test(B.uploadProblem({ type: 'application/pdf', size: 1000 })), 'a PDF is refused, in words');
ok(/25 MB/.test(B.uploadProblem({ type: 'image/jpeg', size: 30 * 1024 * 1024 })), 'a 30 MB file is refused');
ok(/No file/.test(B.uploadProblem(null)), 'nothing chosen says so');
ok(B.aspectOf('') === '16:9' && B.aspectOf('nonsense') === '16:9', "'' and unknown read as the default");
ok(B.aspectOf('2.39:1') === '2.39:1' && B.aspectOf('1:1') === '1:1', 'a known aspect reads back');
ok(new Set(B.ASPECTS.map((a) => a.id)).size === B.ASPECTS.length, 'aspect ids are unique');

/* ---- many pictures at once (runBulkUpload), against the faked Drive ---- */
{
  const before = dlog.length;
  let nextId = 0;
  dans = () => ({ status: 200, json: { id: 'BULKFILE' + String(++nextId).padStart(4, '0') } });
  Drive.adoptToken('ya29.BULK', 3600);
  const frames = [];
  const removed = [];
  const order = [];
  const pic = (name, type = 'image/jpeg', size = 2000) => ({ name, type, size, blob: new Blob([PNG], { type }) });
  const files = [pic('a.jpg'), pic('notes.pdf', 'application/pdf'), pic('b.png', 'image/png'), pic('c.webp', 'image/webp')];
  let inFlight = 0, maxInFlight = 0;
  const res = await B.runBulkUpload(files, {
    addFrame: (file, i) => { const f = { id: 'fr' + i, shotId: 'sh0', ref: '' }; frames.push(f); return f; },
    removeFrame: (f) => removed.push(f.id),
    onProgress: (i, n, file) => order.push(i + '/' + n + ':' + file.name),
    uploadOne: async (file, frame) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      const meta = await Drive.createFile(B.frameFileName({ label: '4.' + frame.id }, 'image/jpeg'), file.blob, 'image/jpeg');
      inFlight--;
      frame.ref = Drive.driveRef(meta.id);
      return { ok: true, id: meta.id };
    }
  });
  eq(res.refused.map((r) => r.file.name), ['notes.pdf'], 'bulk: the PDF is refused before any frame is made');
  eq(frames.length, 3, 'bulk: one frame per picture');
  eq(dlog.length - before, 3, 'bulk: three uploads to Drive');
  eq(maxInFlight, 1, 'bulk: uploads run one at a time, never in parallel');
  eq(order, ['0/3:a.jpg', '1/3:b.png', '2/3:c.webp'], 'bulk: in the order dropped');
  ok(frames.every((f) => /^drive:BULKFILE\d{4}$/.test(f.ref)), 'bulk: each frame keeps only drive:<fileId>');
  ok(dlog.slice(before).every((r) => r.opts.method === 'POST' && /uploadType=multipart/.test(r.url)), 'bulk: each is a multipart POST');
  eq(res.made.map((m) => m.id), ['BULKFILE0001', 'BULKFILE0002', 'BULKFILE0003'], 'bulk: the made list names the files (for Undo)');
  eq(removed, [], 'bulk: nothing removed when every upload worked');
  ok(/3 pictures saved/.test(B.bulkSummary(res)) && /1 file was not a picture/.test(B.bulkSummary(res)), 'bulk: one sentence says both — ' + B.bulkSummary(res));

  // A failure mid-run: that frame is taken away again; a gate stop ends the run.
  let call = 0;
  dans = () => (++call === 2 ? { status: 500, json: { error: { message: 'backend error' } } } : { status: 200, json: { id: 'BULKX' + call + 'XXXXXX' } });
  const frames2 = [], removed2 = [];
  const res2 = await B.runBulkUpload([pic('1.jpg'), pic('2.jpg'), pic('3.jpg')], {
    addFrame: (file, i) => { const f = { id: 'g' + i }; frames2.push(f); return f; },
    removeFrame: (f) => removed2.push(f.id),
    uploadOne: async (file) => {
      try { const m = await Drive.createFile('x.jpg', file.blob, 'image/jpeg'); return { ok: true, id: m.id }; }
      catch (e) { return { ok: false, why: e.message }; }
    }
  });
  eq([res2.made.length, res2.failed.length], [2, 1], 'bulk: one failure, the others still made');
  eq(removed2, ['g1'], 'bulk: the failed frame is removed, so no empty frame is left');
  const res3 = await B.runBulkUpload([pic('1.jpg'), pic('2.jpg')], {
    addFrame: (file, i) => ({ id: 'h' + i }), removeFrame: () => {},
    uploadOne: async () => ({ ok: false, why: 'Drive needs reconnecting', stop: true })
  });
  eq([res3.made.length, res3.failed.length], [0, 1], 'bulk: a closed gate stops the run after the first');
  eq(B.bulkSummary({}), 'Nothing to upload.', 'bulk: an empty run says so');
}

console.log(`test:board-frames — ${pass} passed, ${fail} failed`);
console.log('  (Gemini and Drive are FAKED here; nothing in this test reached a real provider.)');
process.exit(fail ? 1 : 0);
