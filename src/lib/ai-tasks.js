/* ============================================================
   AI TASKS — every existing AI tool, as an AI Desk task
   ------------------------------------------------------------
   The Desk (src/ui/ai-desk.js) is task-first: a pill names a task id
   and a ctx, and the Desk shows what goes in, runs it, shows the
   answer, refines it by chat, and on Accept calls the task's apply().
   This file registers the tasks. Each one WRAPS the job function that
   already existed in src/lib/ai.js — the same prompt, the same schema,
   the same quote checks — rather than building a second prompt.

   LAZY, ALL OF IT. Nothing imports this file statically. ai-desk.js
   does `import('../lib/ai-tasks.js').then((m) => m.registerAll())`
   at the first open, and awaits what registerAll() returns: the
   promise that every model this file reads has loaded, so each
   task's input(ctx) can answer synchronously (the Desk calls it
   synchronously). src/lib/ai.js is reached only from here and from
   the other lazy panels — never from a page's first paint.

   REFINEMENT WITHOUT CHANGING THE WIRE. The job functions in ai.js
   build their own user prompt from a job object and take no extra
   text. A chat refinement therefore rides in a field each job
   already sends: the blueprint context block (`context`, which every
   job that has one prints first), the dialogue pass's `ask`, a beat's
   prompt, a scene's synopsis. The text is ai.js's own refineBlock() —
   the previous answer and the numbered instructions — so every task
   refines in the same words, and the existing parser and checks run
   on the refined answer exactly as on the first.

   WRITES go through the owning model or the page that owns it, and
   each apply() returns an exact undo:
     coverage         the coverage store in src/ui/coverage.js, inside
                      the script blob, through the page's save
     dialogue-pass    the page's in-memory script, `aiPass` kept so the
                      row's own Undo also still works, page save
     story-steps/map  story.js models, saved by the page's commit()
     shot-draft       shots.js addShot (append only)
     synopsis-script  scriptgen.js's job (stage 1 → the beat sheet)
     logline          the page's setLogline()
   beat-critique is a read: it writes nothing.

   NO STORAGE KEY. The only memory here is the last run per task (what
   apply() needs beside the ticked items), in a Map for this visit.
   ============================================================ */
import { registerTask as deskRegister } from '../ui/ai-desk.js';

/* ---- the modules, loaded once ------------------------------- */
let AI = null;            // ./ai.js
let BP = null;            // ./blueprint-context.js
let StoryM = null;        // ./story.js
let ScenesM = null;       // ./scenes.js
let ScriptM = null;       // ./script.js
let ShotsM = null;        // ./shots.js
let Analysis = null;      // ./screenplay-analysis.js
let Gen = null;           // ./scriptgen.js
let Cov = null;           // ../ui/coverage.js (its coverageStore)
let readyP = null;

function loadAll() {
  if (!readyP) {
    readyP = Promise.all([
      import('./ai.js'), import('./blueprint-context.js'), import('./story.js'),
      import('./scenes.js'), import('./script.js'), import('./shots.js'),
      import('./screenplay-analysis.js'), import('./scriptgen.js'), import('../ui/coverage.js')
    ]).then(([a, b, st, sc, sp, sh, an, g, cv]) => {
      AI = a; BP = b; StoryM = st; ScenesM = sc; ScriptM = sp; ShotsM = sh; Analysis = an; Gen = g; Cov = cv;
      return true;
    }).catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}
const ready = () => loadAll();

/* ---- small helpers ------------------------------------------ */
const resolve = (ctx) => {
  let c = ctx;
  if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
  return (c && typeof c === 'object') ? c : {};
};
const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const fail = (msg) => { const e = new Error(msg); e.kind = 'nocontent'; throw e; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const last = new Map();   // taskId → what apply() needs from the last run

/** The refine block, as ai.js writes it, or ''. */
function refineText(refine) {
  if (!refine) return '';
  const prev = refine.previous;
  /* The model's own previous answer, trimmed to the part that matters,
     so a long list does not crowd the prompt it rides in. */
  let previous = prev;
  if (prev && Array.isArray(prev.items)) previous = prev.items.map((it) => it.text);
  else if (prev && typeof prev.proposed === 'string') previous = prev.proposed;
  else if (prev && typeof prev.text === 'string') previous = prev.text;
  const block = AI && typeof AI.refineBlock === 'function'
    ? AI.refineBlock({ previous, instructions: refine.instructions })
    : '\n\nPrevious answer: ' + JSON.stringify(previous) + '\nChanges asked for:\n'
      + (refine.instructions || []).map((t, i) => (i + 1) + '. ' + t).join('\n');
  return String(block || '').trim();
}

/** A refinement as one more group of the blueprint context block —
    the first thing every job with a `context` prints. */
function withRefineContext(context, refine) {
  const t = refineText(refine);
  if (!t) return context || [];
  return (context || []).concat([{
    step: 'THE WRITER’S FOLLOW-UP ON YOUR PREVIOUS ANSWER (not part of the blueprint)',
    answers: [{ label: 'follow-up', value: t }]
  }]);
}

/* The script the page has in memory (ctx.getDoc / ctx.elements), else
   the stored one. A page passes its own, because the stored copy can
   be a debounce behind the words on screen. */
function scriptElements(c) {
  const live = call(c.elements);
  if (Array.isArray(live)) return live;
  const d = call(c.getDoc);
  if (d && Array.isArray(d.elements)) return d.elements;
  try { return ScriptM.loadScript().elements || []; } catch (e) { return []; }
}

/* The element the caret is in: ctx.elId, else ctx.cursorId(). */
function cursorIndex(c, els) {
  const id = c.elId != null ? c.elId : call(c.cursorId);
  if (id == null || id === '') return -1;
  return els.findIndex((e) => String(e.id) === String(id));
}

/* Which slice (scene) of sliceScript() an element index sits in. */
function sceneIndexAt(els, i) {
  let n = -1;
  for (let j = 0; j <= i && j < els.length; j++) {
    if (els[j] && els[j].type === 'scene' && String(els[j].text ?? '').trim()) n++;
  }
  return n;
}

/* ============================================================
   COVERAGE — list. ctx { getDoc, save, elements?, title?, after? }
   ------------------------------------------------------------
   runCoverage(): batched, checkpointed, resumable. The checkpoints
   are stored as they land (that is what stops a stopped run billing
   twice — and is the one write a Skip does not undo, on purpose).
   The items are the report's points; Accept stores the report with
   only the accepted points, as the Coverage tab stores it.
   A REFINE re-runs only the synthesis: every part is already in the
   last checkpoint, so runCoverage() skips straight to the report.
   ============================================================ */
const SECTIONS = [
  ['premise', 'Premise'], ['structure', 'Structure'], ['character', 'Character'],
  ['dialogue', 'Dialogue'], ['pacing', 'Pacing'], ['marketability', 'Marketability']
];

function coverageItems(report) {
  const items = [];
  const push = (id, label, p) => {
    const where = [label, p.scene ? 'Sc ' + p.scene : '', p.quote ? '“' + p.quote + '”' : 'no quote — the one given was not in your script'];
    items.push({ id, text: (p.label ? p.label + ' — ' : '') + p.note, detail: where.filter(Boolean).join(' · ') });
  };
  for (const [key, label] of SECTIONS) {
    const s = report[key];
    if (!s) continue;
    if (key === 'structure') (s.actBreaks || []).forEach((p, i) => push(key + ':ab' + i, 'Act break', p));
    (s.points || []).forEach((p, i) => push(key + ':p' + i, label, p));
  }
  return items;
}

function coverageNote(res) {
  const r = res.report || {};
  const verdict = { pass: 'Pass', consider: 'Consider', recommend: 'Recommend' }[r.verdict] || 'No verdict';
  const out = ['Verdict: ' + verdict + (r.verdictWhy ? ' — ' + r.verdictWhy : '')];
  if (r.logline) out.push('Logline as read: ' + r.logline);
  if (res.removed || res.readRemoved) {
    out.push(plural((res.removed || 0) + (res.readRemoved || 0), 'quote was', 'quotes were')
      + ' removed because they were not word for word in your script.');
  }
  out.push('Read ' + plural(res.scenes, 'scene', 'scenes') + ' in ' + plural(res.requests, 'request', 'requests') + ' by ' + res.model + '.');
  return out.join('\n');
}

const coverageTask = {
  id: 'coverage',
  label: 'Coverage report',
  kind: 'list',
  editable: false,
  identity(ctx) { try { return 'coverage:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'coverage'; } },
  input(ctx) {
    const c = resolve(ctx);
    const els = scriptElements(c);
    const plan = AI.planCoverage(els);
    if (!plan.batches.length) return 'This script has no scene headings yet, so there is nothing to cover.';
    const store = Cov.coverageStore(() => call(c.getDoc), () => call(c.save));
    const part = store.partialFor(AI.scriptSignature(els));
    const cp = part && part.coverage.checkpoint && part.coverage.checkpoint.batchCount === plan.batches.length
      ? part.coverage.checkpoint : null;
    const first = AI.buildCoverageBatchPrompt({
      scenes: plan.batches[0].map((i) => plan.scenes[i]), part: 1, parts: plan.batches.length,
      context: BP.blueprintContext()
    });
    return 'The whole screenplay — ' + plural(plan.scenes.length, 'scene', 'scenes') + ', '
      + plan.chars.toLocaleString('en-IN') + ' characters — in ' + plural(plan.batches.length, 'part', 'parts')
      + ', then one request for the report. About ' + plural(cp ? plan.batches.length - cp.parts.length + 1 : plan.requests, 'request', 'requests')
      + (cp ? ' (' + cp.parts.length + ' of ' + plan.batches.length + ' parts are already read and are not sent again)' : '')
      + ', roughly ' + plan.tokensIn.toLocaleString('en-IN') + ' tokens.\n\nThe first part sends:\n\n'
      + (first.length > 6000 ? first.slice(0, 6000) + '\n…' : first);
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c).map((e) => ({ ...e }));
    const store = Cov.coverageStore(() => call(c.getDoc), () => call(c.save));
    const sig = AI.scriptSignature(els);
    const mem = last.get('coverage');
    let prior = null;
    if (refine && mem && mem.sig === sig && mem.checkpoint) prior = mem.checkpoint;
    else {
      const part = store.partialFor(sig);
      prior = part && part.coverage.checkpoint ? part.coverage.checkpoint : null;
      if (!prior && mem && mem.sig === sig && mem.checkpoint) prior = mem.checkpoint;
    }
    let checkpoint = prior;
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const res = await AI.runCoverage({
      elements: els, title, context: withRefineContext(BP.blueprintContext(), refine), prior
    }, {
      signal, onStatus,
      onCheckpoint: (cp) => { checkpoint = cp; store.storeCheckpoint(cp); }
    });
    last.set('coverage', { sig, checkpoint, res });
    const items = coverageItems(res.report || {});
    return { items, note: coverageNote(res) };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const mem = last.get('coverage');
    if (!mem || !mem.res) fail('There is no coverage to keep. Run it first.');
    const keep = new Set((selected || []).map((it) => it.id));
    const res = JSON.parse(JSON.stringify(mem.res));
    const r = res.report || {};
    for (const [key] of SECTIONS) {
      const s = r[key];
      if (!s) continue;
      if (Array.isArray(s.points)) s.points = s.points.filter((p, i) => keep.has(key + ':p' + i));
      if (key === 'structure' && Array.isArray(s.actBreaks)) s.actBreaks = s.actBreaks.filter((p, i) => keep.has(key + ':ab' + i));
    }
    const getDoc = () => call(c.getDoc);
    const store = Cov.coverageStore(getDoc, () => call(c.save));
    /* The undo is exact: storeResult() turns this draft's partial-run
       document into the report, so Undo puts the partial back (with
       its checkpoint, so a re-run does not bill twice); a brand-new
       document is simply removed. */
    const part = store.partialFor(res.sig);
    const partCopy = part ? JSON.parse(JSON.stringify(part)) : null;
    const doc = store.storeResult(res);
    if (!doc) fail('The script could not be reached, so nothing was saved.');
    call(c.after, doc);
    return () => {
      const d = getDoc();
      if (!d || !Array.isArray(d.documents)) return;
      const i = d.documents.findIndex((x) => x && x.id === doc.id);
      if (i >= 0) {
        if (partCopy) d.documents.splice(i, 1, partCopy); else d.documents.splice(i, 1);
      }
      call(c.save);
      call(c.after, null);
    };
  }
};

/* ============================================================
   DIALOGUE PASS — text. ctx { elId? | cursorId(), getDoc, save,
                               render?(focus), elements? }
   ------------------------------------------------------------
   One speech: the one named, else the speech at the caret, else the
   first speech after the caret in the same scene. The proposal is the
   model's first version; the others are in the note. Accept writes
   the merged text into the element through the page's own model and
   save, and keeps `aiPass` exactly as the inline panel did — the
   FIRST original survives a second pass, so Undo always means "back
   to what I wrote".
   ============================================================ */
function speechTarget(c) {
  const els = scriptElements(c);
  let i = cursorIndex(c, els);
  if (i < 0) return { els, i: -1 };
  if (els[i].type === 'dialogue') return { els, i };
  // Not on a speech: the next one in the same scene.
  for (let j = i + 1; j < els.length; j++) {
    if (els[j].type === 'scene') break;
    if (els[j].type === 'dialogue' && String(els[j].text ?? '').trim()) return { els, i: j };
  }
  return { els, i: -1 };
}

function passJob(els, i) {
  let slug = '';
  for (let j = i; j >= 0; j--) {
    if (els[j].type === 'scene' && String(els[j].text ?? '').trim()) { slug = String(els[j].text).trim().toUpperCase(); break; }
  }
  let character = '', paren = '';
  for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
    if (els[j].type === 'character' && !character) character = String(els[j].text ?? '').trim();
    else if (els[j].type === 'paren' && !paren) paren = String(els[j].text ?? '').trim();
    else break;
  }
  const label = (t) => { try { return ScriptM.typeLabel(t).toUpperCase(); } catch (e) { return String(t).toUpperCase(); } };
  const line = (el) => label(el.type) + ': ' + String(el.text ?? '').trim();
  const before = els.slice(Math.max(0, i - 6), i).filter((e) => String(e.text ?? '').trim() && e.type !== 'scene').map(line).join('\n');
  const after = els.slice(i + 1, i + 4).filter((e) => String(e.text ?? '').trim()).map(line).join('\n');
  return { slug, before, after, character, paren, speech: String(els[i].text ?? '') };
}

const dialogueTask = {
  id: 'dialogue-pass',
  label: 'Dialogue pass',
  kind: 'text',
  editable: true,      // the input IS the speech that is sent
  identity(ctx) { const { els, i } = speechTarget(resolve(ctx)); return 'speech:' + (i >= 0 ? els[i].id : ''); },
  input(ctx) {
    const c = resolve(ctx);
    const { els, i } = speechTarget(c);
    return i >= 0 ? String(els[i].text ?? '') : '';
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const { els, i } = speechTarget(c);
    if (i < 0) fail('Put the caret in a speech (a dialogue line) first — the pass works on one speech.');
    const speech = String(input ?? '').trim() ? String(input) : String(els[i].text ?? '');
    if (!speech.trim()) fail('This speech is empty. Write the line first.');
    const job = passJob(els, i);
    const ask = [c.ask, refineText(refine)].filter(Boolean).join('\n\n');
    const res = await AI.dialoguePass({ ...job, speech, ask, context: BP.blueprintContext() }, { onStatus, signal });
    last.set('dialogue-pass', { elId: els[i].id, model: res.model });
    const others = res.options.slice(1).map((o, n) => 'Version ' + (n + 2) + ': ' + o.text + (o.note ? ' (' + o.note + ')' : ''));
    const note = [res.keep ? 'What already works: ' + res.keep : '', res.options[0].note || '', ...others,
      res.truncated ? 'The reply was cut short.' : ''].filter(Boolean).join('\n');
    return { original: String(els[i].text ?? ''), proposed: res.options[0].text, note };
  },
  apply(text, ctx) {
    const c = resolve(ctx);
    const mem = last.get('dialogue-pass') || {};
    const d = call(c.getDoc);
    const els = d && Array.isArray(d.elements) ? d.elements : null;
    const el = els && els.find((e) => String(e.id) === String(mem.elId));
    if (!el) fail('That speech is no longer in the script, so nothing was changed.');
    const before = { text: el.text, aiPass: el.aiPass ? { ...el.aiPass } : undefined };
    if (String(text) === String(el.text)) return null;
    el.aiPass = { at: new Date().toISOString(), model: mem.model || '', was: el.aiPass ? el.aiPass.was : el.text };
    el.text = String(text);
    call(c.save);
    call(c.render, el.id);
    return () => {
      const now = (d.elements || []).find((e) => String(e.id) === String(mem.elId));
      if (!now) return;
      now.text = before.text;
      if (before.aiPass) now.aiPass = before.aiPass; else delete now.aiPass;
      call(c.save);
      call(c.render, now.id);
    };
  }
};

/* ============================================================
   BEAT CRITIQUE — read. Two shapes of ctx:
     { stepId, flush? }                a blueprint step (feature.html)
     { getDoc | elements, cursorId }   the scene at the caret (script.html)
   ------------------------------------------------------------
   beatCritique() quotes only from the `answers` it is handed and
   checks every quote, so for a scene the scene's own text is the one
   answer. Writes nothing.
   ============================================================ */
function critiqueJob(c) {
  if (c.stepId) {
    call(c.flush);
    const answers = BP.stepAnswers(c.stepId);
    if (!answers.length) fail('There is nothing written in this step yet. Fill in an answer and come back.');
    return { step: BP.stepMeta(c.stepId), answers, context: BP.blueprintContext({ skipStepId: c.stepId }) };
  }
  const els = scriptElements(c);
  const i = cursorIndex(c, els);
  const scenes = AI.coverageScenes(els);
  const k = i >= 0 ? sceneIndexAt(els, i) : -1;
  const sc = scenes[k >= 0 ? k : 0];
  if (!sc || !sc.text.trim()) fail('There is no scene to critique yet. Write a scene heading and a few lines.');
  return {
    step: { num: 'Sc ' + sc.n, title: sc.heading, deck: 'One scene of the screenplay. Critique the scene as written.' },
    answers: [{ label: 'the scene', value: sc.text }],
    context: BP.blueprintContext()
  };
}

function critiqueText(res) {
  const L = [];
  if (res.verdict) L.push(res.verdict, '');
  res.notes.forEach((n, i) => {
    L.push((i + 1) + '. ' + n.problem);
    if (n.quote) L.push('   “' + n.quote + '”');
    if (n.tryThis) L.push('   Try: ' + n.tryThis);
    L.push('');
  });
  if (res.unverified) {
    L.push(plural(res.unverified, 'note', 'notes') + ' came back with a quotation that is not word for word '
      + 'what you wrote, so the quotation was dropped rather than shown.');
  }
  L.push('These are notes, not edits. Nothing was changed.');
  return L.join('\n').trim();
}

const critiqueTask = {
  id: 'beat-critique',
  label: 'Beat critique',
  kind: 'read',
  editable: false,
  identity(ctx) {
    const c = resolve(ctx);
    if (c.stepId) return 'step:' + c.stepId;
    const els = scriptElements(c);
    const i = cursorIndex(c, els);
    return 'scene:' + (i >= 0 ? sceneIndexAt(els, i) : 0);
  },
  input(ctx) {
    const c = resolve(ctx);
    try { return AI.buildCritiquePrompt(critiqueJob(c)); }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const job = critiqueJob(resolve(ctx));
    const res = await AI.beatCritique({ ...job, context: withRefineContext(job.context, refine) }, { onStatus, signal });
    return { text: critiqueText(res) };
  }
};

/* ============================================================
   STORY — suggest steps for one beat (list) and map the beats (list).
   ctx { beatKey (steps only), getStory(), commit(story), format? }
   getStory and commit are story.js's own: the framework in force, and
   the one save-and-redraw path.
   ============================================================ */
const storyOf = (c) => (typeof c.getStory === 'function' ? c.getStory() : StoryM.loadStory());
const commitStory = (c, s) => { if (typeof c.commit === 'function') c.commit(s); else StoryM.saveStory(s); };
const formatOf = (c) => String(call(c.format) ?? c.format ?? '');

function stepsJob(c) {
  const s = storyOf(c);
  const p = StoryM.resolveBeatKey(c.beatKey);
  if (!p) fail('That beat is not in the framework any more.');
  return {
    idea: s.idea, logline: s.logline, synopsis: s.source, format: formatOf(c),
    framework: p.fw, beat: p.beat,
    steps: StoryM.stepsInOrder(s).map((x) => ({ beat: x.beat, text: x.text }))
  };
}

const storyStepsTask = {
  id: 'story-steps',
  label: 'Suggest steps for this beat',
  kind: 'list',
  editable: false,
  input(ctx) {
    const c = resolve(ctx);
    let job;
    try { job = stepsJob(c); } catch (e) { return (e && e.message) || ''; }
    const L = ['The beat: ' + (job.beat.label || job.beat.id) + ' — ' + (job.beat.prompt || ''), ''];
    if (job.idea) L.push('Idea: ' + job.idea);
    if (job.logline) L.push('Logline: ' + job.logline);
    if (job.synopsis) L.push('', 'Synopsis:', job.synopsis.slice(0, 12000));
    if (job.steps.length) L.push('', 'The outline so far (' + plural(job.steps.length, 'step', 'steps') + '):', ...job.steps.slice(0, 120).map((x) => '· ' + x.text));
    L.push('', 'And the names of the ' + (job.framework.label || '') + ' beats. Nothing else.');
    return L.join('\n');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const job = stepsJob(c);
    const extra = refineText(refine);
    if (extra) job.beat = { ...job.beat, prompt: (job.beat.prompt || '') + '\n\n' + extra };
    const res = await AI.draftOutlineSteps(job, { onStatus, signal });
    return { items: res.steps.map((t, i) => ({ id: 's' + i, text: t })) };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const s = storyOf(c);
    const added = [];
    for (const it of selected || []) {
      const st = StoryM.addOutlineStep(s, { beat: c.beatKey, text: it.text });
      if (st) added.push(st.id);
    }
    if (!added.length) return null;
    commitStory(c, s);
    return () => {
      const back = storyOf(c);
      added.forEach((id) => StoryM.removeOutlineStep(back, id));
      commitStory(c, back);
    };
  }
};

const storyMapTask = {
  id: 'story-map',
  label: 'Map the beats',
  kind: 'list',
  editable: false,
  input(ctx) {
    const c = resolve(ctx);
    const s = storyOf(c);
    const fw = StoryM.frameworkById(s.framework);
    if (!String(s.source || '').trim()) return 'No synopsis yet. Write, paste or import one first; the model reads only what is on the Story page.';
    return 'The synopsis on this page and the names of the ' + fw.short + ' beats. Nothing else.\n\nThe beats: '
      + fw.beats.map((b) => b.label).join(' · ') + '\n\nThe synopsis:\n' + s.source;
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const s = storyOf(c);
    if (!String(s.source || '').trim()) fail('Add a synopsis first — paste it, or import a file.');
    const fw = StoryM.frameworkById(s.framework);
    let framework = fw;
    const extra = refineText(refine);
    if (extra && fw.beats.length) {
      const beats = fw.beats.slice();
      const end = beats.length - 1;
      beats[end] = { ...beats[end], prompt: (beats[end].prompt || '') + '\n\n' + extra };
      framework = { ...fw, beats };
    }
    const res = await AI.draftBeatMap({ synopsis: s.source, framework }, { onStatus, signal });
    const labelOf = new Map(fw.beats.map((b) => [String(b.id), b.label]));
    last.set('story-map', { fwId: fw.id, rows: res.rows });
    const items = res.rows.map((r, i) => ({
      id: 'r' + i, beat: r.beat, row: r,
      text: (labelOf.get(String(r.beat)) || r.beat) + ': “' + r.quote + '”',
      detail: [r.rationale, Number.isFinite(r.tension) ? 'tension ' + r.tension : ''].filter(Boolean).join(' · ')
    }));
    return { items, note: res.truncated ? 'The reply was cut short, so some beats may be missing.' : '' };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const mem = last.get('story-map');
    if (!mem) fail('There is no mapping to keep. Run it first.');
    const rows = (selected || []).map((it) => it.row || mem.rows[Number(String(it.id).slice(1))]).filter(Boolean);
    const s = storyOf(c);
    const fwId = mem.fwId;
    const beforeIds = new Set(s.marks.map((m) => m.id));
    const beforeTag = new Map(s.marks.map((m) => [m.id, m.tags[fwId]]));
    const beforeTension = { ...(s.tension || {}) };
    const { added, dropped } = StoryM.applyBeatMap(s, fwId, rows);
    commitStory(c, s);
    const note = plural(added, 'passage', 'passages') + ' tagged'
      + (dropped ? '; ' + plural(dropped, 'quote was', 'quotes were') + ' not word for word in the synopsis and dropped' : '');
    call(c.say, note + '.');
    if (!added) return null;
    return () => {
      const back = storyOf(c);
      back.marks = back.marks.filter((m) => beforeIds.has(m.id));
      for (const m of back.marks) {
        if (!beforeTag.has(m.id)) continue;
        const was = beforeTag.get(m.id);
        if (was === undefined) delete m.tags[fwId]; else m.tags[fwId] = was;
      }
      back.tension = beforeTension;
      commitStory(c, back);
    };
  }
};

/* ============================================================
   SHOT DRAFT — list. ctx { sceneIds: [id…], after?(madeIds) }
   ------------------------------------------------------------
   draftShotDivision() over the ticked scenes, the script text matched
   by matchScenes() exactly as visualize.html does. Accept APPENDS the
   ticked shots (addShot numbers them after what is there) marked
   `ai: true`; Undo removes exactly those ids.
   ============================================================ */
const slugOf = (scene) => scene.intExt + '. ' + (scene.location || 'Location TBC') + ' — ' + scene.dayNight;

function shotJobs(c) {
  const want = new Set([].concat(c.sceneIds || []).map(String));
  const scenes = ScenesM.listScenes().filter((s) => want.has(String(s.id)));
  if (!scenes.length) fail('Tick at least one scene.');
  const script = ScriptM.loadScript();
  const bySlice = new Map(Analysis.matchScenes(scenes, script.elements).pairs.map((p) => [p.scene.id, p.slice]));
  return scenes.map((scene) => {
    const slice = bySlice.get(scene.id) || null;
    return {
      sceneId: scene.id, number: scene.number, slug: slugOf(scene), eighths: scene.eighths,
      synopsis: scene.synopsis, script: slice ? AI.sceneScriptText(slice) : ''
    };
  });
}

const shotTask = {
  id: 'shot-draft',
  label: 'Draft a shot division',
  kind: 'list',
  editable: false,
  input(ctx) {
    try { return AI.buildPrompt(shotJobs(resolve(ctx))); }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    let jobs = shotJobs(resolve(ctx));
    const extra = refineText(refine);
    if (extra) jobs = jobs.map((j) => ({ ...j, synopsis: [j.synopsis, extra].filter(Boolean).join('\n\n') }));
    const res = await AI.draftShotDivision(jobs, { onStatus, signal });
    const numOf = new Map(jobs.map((j) => [j.sceneId, j.number || '—']));
    const items = [];
    for (const [sceneId, list] of res.byScene) {
      list.forEach((d, i) => items.push({
        id: sceneId + '#' + i, sceneId, draft: d,
        text: 'Sc ' + numOf.get(sceneId) + ' · ' + d.description,
        detail: [d.size, d.angle, d.movement, d.lens].filter(Boolean).join(' · ')
      }));
    }
    if (!items.length) fail('The model came back with no shots. Nothing was added.');
    return { items, note: res.truncated ? 'The reply was cut short, so some scenes may be missing.' : '' };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const made = [];
    for (const it of selected || []) {
      if (!it.sceneId || !it.draft) continue;
      made.push(ShotsM.addShot(it.sceneId, { ...it.draft, ai: true }).id);
    }
    if (!made.length) return null;
    call(c.after, made);
    return () => {
      const ids = new Set(made);
      ShotsM.saveShots(ShotsM.listShots().filter((s) => !ids.has(s.id)));
      call(c.after, []);
    };
  }
};

/* ============================================================
   SYNOPSIS → SCRIPT, STAGE 1 — list. ctx { prepare?(), after?() }
   ------------------------------------------------------------
   The staged flow lives in scriptgen.js and on write.html#generate,
   and stays there: stage 2 writes the scene board and stage 3 writes
   pages in resumable batches, and both keep their own panel. This
   task is the first stage — the synopsis becomes this story's beat
   sheet — so the writer can argue with the structure in the Desk,
   tick the beats to keep, and Accept writes them into the job,
   exactly where "Draft the beat sheet" wrote them. The page's panel
   then offers stage 2. `prepare()` lets the page save its form first.
   ============================================================ */
const synopsisTask = {
  id: 'synopsis-script',
  label: 'Synopsis → beat sheet',
  kind: 'list',
  editable: true,      // the input IS the synopsis that is sent
  input(ctx) {
    const c = resolve(ctx);
    call(c.prepare);
    return String(Gen.load().synopsis || '');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const job = Gen.load();
    const synopsis = String(input ?? '').trim() ? String(input) : String(job.synopsis || '');
    if (!synopsis.trim()) fail('Write a synopsis first — a paragraph is enough.');
    const vocab = await Gen.beatVocabulary();
    const extra = refineText(refine);
    /* draftBeatSheet keeps 6,000 characters of synopsis; the follow-up
       goes in front so it is never the part that is cut. */
    const sent = extra ? 'WRITER’S NOTES FOR THIS DRAFT:\n' + extra + '\n\nTHE SYNOPSIS ITSELF:\n' + synopsis : synopsis;
    const res = await AI.draftBeatSheet({ synopsis: sent, format: job.format, lang: job.lang, beats: vocab }, { onStatus, signal });
    last.set('synopsis-script', { synopsis, logline: res.logline, model: res.model, vocab });
    const items = vocab.filter((b) => res.byBeat.get(b.id)).map((b) => ({
      id: b.id, text: res.byBeat.get(b.id), detail: b.label + (b.pages ? ' · pages ' + b.pages : '')
    }));
    if (!items.length) fail('The reply held no beats, so nothing changed.');
    return { items, note: res.logline ? 'Logline: ' + res.logline : '' };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const mem = last.get('synopsis-script');
    if (!mem) fail('There is no beat sheet to keep. Run it first.');
    const keep = new Map((selected || []).map((it) => [String(it.id), it.text]));
    if (!keep.size) return null;
    const prev = Gen.load();
    const job = JSON.parse(JSON.stringify(prev));
    job.synopsis = mem.synopsis;
    job.beats = mem.vocab.filter((b) => keep.has(b.id)).map((b) => ({ id: b.id, label: b.label, happens: keep.get(b.id) }));
    job.logline = mem.logline || job.logline;
    job.model = mem.model || job.model;
    job.stage = 'beats';
    Gen.save(job);
    call(c.after, job);
    return () => { Gen.save(prev); call(c.after, prev); };
  }
};

/* ============================================================
   LOGLINE WORKSHOP — list. ctx { getLogline(), getStory(),
                                  setLogline(text), format? }
   ------------------------------------------------------------
   loglineWorkshop(): the five-part check of THEIR logline (in the
   note, every span verified) and five variants (the items). Accept
   takes the first ticked variant as the logline; Undo puts theirs
   back. Nothing replaces the logline without that Accept.
   ============================================================ */
const loglineTask = {
  id: 'logline',
  label: 'Logline workshop',
  kind: 'list',
  editable: true,      // the input IS the logline that is checked
  input(ctx) {
    const c = resolve(ctx);
    const live = call(c.getLogline);
    if (typeof live === 'string') return live;
    return String((storyOf(c) || {}).logline || '');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const s = storyOf(c) || {};
    const logline = String(input ?? '').trim() ? String(input) : String(s.logline || '');
    if (!logline.trim()) fail('Write your logline first — the workshop works on yours.');
    const extra = refineText(refine);
    const synopsis = [extra ? 'WRITER’S NOTES FOR THIS WORKSHOP (context, not to be quoted):\n' + extra : '', String(s.source || '')]
      .filter(Boolean).join('\n\n');
    const res = await AI.loglineWorkshop({ logline, idea: s.idea, synopsis, format: formatOf(c) }, { onStatus, signal });
    const check = res.check.map((p) => (p.present ? '✓ ' : '— ') + p.label + ': '
      + (p.found ? '“' + p.found + '”' : 'not in your logline') + (p.note ? ' — ' + p.note : '')).join('\n');
    const removed = res.removed ? '\n' + plural(res.removed, 'quote', 'quotes') + ' removed because they were not in your logline.' : '';
    return {
      items: res.variants.map((v, i) => ({ id: 'v' + i, text: v.text, detail: v.angle })),
      note: 'Your logline, checked:\n' + check + removed + '\n\nTick ONE variant to use it as your logline.'
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const pick = (selected || [])[0];
    if (!pick || typeof c.setLogline !== 'function') return null;
    const live = call(c.getLogline);
    const before = typeof live === 'string' ? live : String((storyOf(c) || {}).logline || '');
    c.setLogline(pick.text);
    return () => c.setLogline(before);
  }
};

/* ---- registration ------------------------------------------- */
const ALL_TASKS = [coverageTask, dialogueTask, critiqueTask, storyStepsTask, storyMapTask, shotTask, synopsisTask, loglineTask];
let registered = false;

/** Register every task with the Desk (idempotent), and resolve once
    every model the tasks read is loaded — the Desk awaits this before
    it asks a task for its input. `register` defaults to the Desk's own
    registerTask. */
export function registerAll(register = deskRegister) {
  if (!registered) {
    registered = true;
    for (const t of ALL_TASKS) register(t);
  }
  return loadAll();
}

export const TASK_IDS = ALL_TASKS.map((t) => t.id);
export default { registerAll, TASK_IDS };
