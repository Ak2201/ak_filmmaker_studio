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
     gen-scenes       scriptgen.js applyScenes (stage 2 → scenes.js)
     gen-batch        scriptgen.js applyBatch (stage 3, one batch →
                      the script blob, cursor advanced)
     voice-check      coverage.js addTake (a line's alternates)
     logline          the page's setLogline()
     genre-comps      story.js fields genre/audience/budgetTier/comps, via commit
     scene-notes      scenes.js readerNote + cutCandidate on content-matched rows
     breakdown-tags   scenes.js tagMany (adds only), undo = untagMany
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
   COVERAGE — list. ctx { getDoc, save, elements?, title?, after?, progress? }
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
      elements: els, title, context: withRefineContext(BP.blueprintContext(), refine), prior,
      audience: (StoryM.loadStory() || {}).audience || ''
    }, {
      signal, onStatus,
      /* `progress` lets the page that owns the report repaint (the
         Coverage tab's pill then reads "Resume — N of M read" when a
         run stops or fails part way); nothing else is written. */
      onCheckpoint: (cp) => { checkpoint = cp; store.storeCheckpoint(cp); call(c.progress); }
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
   The staged flow lives in scriptgen.js and on write.html#generate.
   Each stage is its own task: this one, then 'gen-scenes' (the scene
   board) and 'gen-batch' (one batch of pages) below; the bulk
   "write all the rest" run stays on the page. This task is the first
   stage — the synopsis becomes this story's beat
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

/* A refinement whose `previous` is what this task's model actually
   said (the proposal objects, the drafted elements), not the Desk's
   one-line item texts — so "keep scene 3 but move it to night" has
   the scene to work on. ai.js's own refineBlock(), trimmed. */
function refineWith(refine, previous) {
  if (!refine) return '';
  const block = AI && typeof AI.refineBlock === 'function'
    ? AI.refineBlock({ previous, instructions: refine.instructions })
    : refineText(refine);
  return String(block || '').trim();
}

/* A short fingerprint, for a Desk identity that has to change when
   the words it was derived from change. Not a security hash. */
function fingerprint(s) {
  let x = 5381;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}

/* ============================================================
   SYNOPSIS → SCRIPT, STAGE 2 — list. ctx { patch(), replaceScenes(),
                                           after?() }
   ------------------------------------------------------------
   The beat sheet becomes a scene board. draftScenes() asks the model
   and writes nothing; the items are its proposed scenes; Accept hands
   the ticked ones to applyScenes(), which writes the SCENE MODEL (so
   the breakdown, stripboard and budget can read them) and moves the
   job to stage 3. `replaceScenes()` is the page's checkbox, read at
   the moment of Accept. Undo puts back the scene list and the job.
   ============================================================ */
const sceneSlug = (p) => (p.intExt || 'INT') + '. ' + String(p.location || 'Location TBC').toUpperCase() + ' — ' + (p.dayNight || 'DAY');

function scenesJob(c) {
  const patch = call(c.patch) || {};
  return { ...Gen.load(), ...patch };
}

const genScenesTask = {
  id: 'gen-scenes',
  label: 'Lay out the scenes',
  kind: 'list',
  editable: false,
  identity(ctx) {
    try {
      const j = scenesJob(resolve(ctx));
      return 'scenes:' + fingerprint(JSON.stringify([j.synopsis, j.logline, j.format, j.lang, j.target, (j.beats || []).map((b) => b.happens)]));
    } catch (e) { return 'scenes'; }
  },
  input(ctx) {
    const j = scenesJob(resolve(ctx));
    if (!(j.beats || []).length) return 'Draft the beat sheet first.';
    const L = ['The beat sheet as it stands on the page, with the logline and the synopsis — nothing else from the studio.', ''];
    if (j.logline) L.push('Logline: ' + j.logline);
    L.push('Length: ' + (j.format || 'feature') + (j.target ? ' · about ' + j.target + ' scenes' : ''), '');
    L.push('The beats (' + plural(j.beats.length, 'beat', 'beats') + '):');
    for (const b of j.beats) L.push('· ' + (b.label || b.id) + ' — ' + String(b.happens || '').trim());
    if (String(j.synopsis || '').trim()) L.push('', 'Synopsis:', String(j.synopsis).slice(0, 6000));
    return L.join('\n');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const patch = call(c.patch) || {};
    const prevItems = refine && refine.previous && Array.isArray(refine.previous.items) ? refine.previous.items : [];
    const extra = refineWith(refine, prevItems.map((it) => it.proposal).filter(Boolean));
    const res = await Gen.draftScenes(patch, { onStatus, signal, extra });
    const proposals = res.proposals || [];
    if (!proposals.length) fail('The reply held no scenes, so nothing changed.');
    last.set('gen-scenes', { proposals, model: res.model });
    const items = proposals.map((p, i) => ({
      id: 'p' + i, proposal: p, model: res.model,
      text: sceneSlug(p),
      detail: [String(p.synopsis || '').trim(), (p.cast || []).length ? 'Cast: ' + p.cast.join(', ') : '',
        p.eighths ? p.eighths + '/8 pp' : ''].filter(Boolean).join(' · ')
    }));
    const note = plural(items.length, 'scene', 'scenes') + ' proposed. Untick any you do not want; the rest go on the scene board in this order.'
      + (res.truncated ? '\nThe reply was cut short at the length limit, so the list may stop early.' : '');
    return { items, note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const kept = (selected || []).map((it) => it && it.proposal).filter(Boolean);
    if (!kept.length) return null;
    const model = ((selected || []).find((it) => it && it.model) || {}).model || (last.get('gen-scenes') || {}).model;
    const r = Gen.applyScenes(call(c.patch) || {}, kept, { replaceScenes: !!call(c.replaceScenes), model });
    call(c.after, r.job);
    return () => { r.undo(); call(c.after, null); };
  }
};

/* ============================================================
   SYNOPSIS → SCRIPT, STAGE 3 — list, ONE BATCH. ctx { after?() }
   ------------------------------------------------------------
   draftBatch() drafts the next BATCH_SIZE scenes at the job's cursor
   and writes nothing; the items are those scenes (heading and first
   lines). Accept hands the ticked sceneIds to applyBatch(), which
   appends them to the screenplay (a revision first, on the first
   batch only), and moves the cursor past the WHOLE batch — an unticked
   scene is skipped exactly as a scene the reply missed. The identity
   is the job and its cursor, so every batch is its own Desk session,
   and a draft made at an old cursor is refused ('stale') rather than
   written in the wrong place.
   ============================================================ */
function batchSlice() {
  const job = Gen.load();
  const batch = job.scenes.slice(job.cursor, job.cursor + Gen.BATCH_SIZE);
  return { job, batch };
}

const elLine = (el) => {
  const t = String(el.text || '').trim();
  if (el.type === 'character') return t.toUpperCase();
  if (el.type === 'paren') return '(' + t.replace(/^\(|\)$/g, '') + ')';
  return t;
};

const genBatchTask = {
  id: 'gen-batch',
  label: 'Write the next scenes',
  kind: 'list',
  editable: false,
  identity() {
    try { const j = Gen.load(); return 'batch:' + (j.startedAt || '') + ':' + j.cursor; }
    catch (e) { return 'batch'; }
  },
  input() {
    const { job, batch } = batchSlice();
    if (job.stage !== 'pages' && job.stage !== 'done') return 'Lay out the scenes first.';
    if (!batch.length) return 'Every scene on the list is written. There is nothing left to send.';
    const L = ['Scenes ' + (job.cursor + 1) + '–' + (job.cursor + batch.length) + ' of ' + job.scenes.length
      + ', each with its slug line and one-line synopsis; the logline; the character names written so far; '
      + 'and the slugs and synopses of the two scenes either side, for continuity. Nothing else.', ''];
    batch.forEach((s, i) => {
      L.push((job.cursor + i + 1) + '. ' + s.slug);
      if (s.synopsis) L.push('   ' + s.synopsis);
    });
    return L.join('\n');
  },
  async run(input, { onStatus, signal, refine } = {}) {
    await ready();
    const prevItems = refine && refine.previous && Array.isArray(refine.previous.items) ? refine.previous.items : [];
    const prevDraft = prevItems.length ? prevItems[0].draft : null;
    const extra = refineWith(refine, prevDraft ? prevDraft.byScene : undefined);
    const draft = await Gen.draftBatch({ onStatus, signal, extra });
    if (draft.done) fail('Every scene on the list is written. There is nothing left to draft.');
    last.set('gen-batch', { draft });
    const items = [];
    const missed = [];
    for (const s of draft.batch) {
      const els = draft.byScene[s.sceneId];
      if (!els || !els.length) { missed.push(s.slug); continue; }
      const body = els.filter((el) => el.type !== 'scene' && String(el.text || '').trim()).slice(0, 3).map(elLine);
      items.push({ id: s.sceneId, draft, text: s.slug, detail: body.join(' / ') + (els.length > 4 ? ' …' : '') });
    }
    if (!items.length) fail('The reply held none of the scenes it was asked for, so nothing was written. Ask again.');
    const note = [
      plural(items.length, 'scene', 'scenes') + ' drafted. Ticked scenes are added to the end of the screenplay; an unticked one is skipped and the run moves on past it.',
      missed.length ? 'Not in the reply (skipped if you accept): ' + missed.join('; ') + '.' : '',
      draft.truncated ? 'The reply was cut short at the length limit, so the last scene may stop mid-page.' : ''
    ].filter(Boolean).join('\n');
    return { items, note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const chosen = (selected || []).filter(Boolean);
    const draft = (chosen[0] && chosen[0].draft) || (last.get('gen-batch') || {}).draft;
    if (!draft) fail('There is no batch to keep. Run it first.');
    /* applyBatch throws GenError 'stale' with a sentence the writer can
       act on; the Desk shows it and writes nothing. */
    const r = Gen.applyBatch(draft, chosen.map((it) => it.id));
    call(c.after, r.job);
    return () => { r.undo(); call(c.after, null); };
  }
};

/* ============================================================
   VOICE CHECK — list. ctx { character() | character, elements?,
                             getDoc?, after?() }
   ------------------------------------------------------------
   voiceCheck() reads every line one character speaks and flags the
   ones that break the voice, every quote checked against the line.
   The items are the suggested REWRITES; Accept adds the ticked ones
   to their lines' alternates through coverage.js's own addTake() —
   the line in use never changes — and Undo removes exactly those.
   A flagged line with no rewrite is in the note.
   ============================================================ */
const voiceName = (c) => String(call(c.character) ?? c.character ?? '').trim();

const voiceTask = {
  id: 'voice-check',
  label: 'Voice check',
  kind: 'list',
  editable: false,
  identity(ctx) {
    const c = resolve(ctx);
    if (c.identity != null) return String(c.identity);
    try { return 'voice:' + voiceName(c) + ':' + AI.scriptSignature(scriptElements(c)); } catch (e) { return 'voice:' + voiceName(c); }
  },
  input(ctx) {
    const c = resolve(ctx);
    const name = voiceName(c);
    if (!name) return 'Pick a character first.';
    const lines = AI.characterLines(scriptElements(c), name);
    if (lines.length < 2) return name + ' has ' + (lines.length ? 'one line' : 'no lines') + ' — a voice needs a few lines to be established.';
    const plan = AI.planVoiceCheck(lines);
    return 'Every line ' + name + ' speaks — ' + plural(lines.length, 'line', 'lines') + ' with their scene numbers, '
      + 'nothing else from the script — in ' + plural(plan.requests, 'request', 'requests') + ', roughly '
      + plan.tokensIn.toLocaleString('en-IN') + ' tokens.\n\n'
      + lines.slice(0, 200).map((l) => 'scene ' + l.scene + ': ' + l.text).join('\n')
      + (lines.length > 200 ? '\n…' : '');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const name = voiceName(c);
    if (!name) fail('Pick a character first.');
    const res = await AI.voiceCheck({
      elements: scriptElements(c).map((e) => ({ ...e })), character: name,
      context: withRefineContext(BP.blueprintContext(), refine)
    }, { onStatus, signal });
    const items = [];
    const bare = [];
    res.breaks.forEach((b, i) => {
      if (!b.rewrite) { bare.push('Sc ' + b.scene + ': “' + b.quote + '”' + (b.why ? ' — ' + b.why : '')); return; }
      items.push({
        id: 'b' + i, elId: b.id, scene: b.scene, line: b.line, rewrite: b.rewrite,
        text: b.rewrite,
        detail: 'Sc ' + b.scene + ' · your line: “' + b.line + '”' + (b.why ? ' · ' + b.why : '')
      });
    });
    const out = [];
    if (res.voice) out.push('The voice: ' + res.voice);
    out.push(res.breaks.length
      ? plural(res.breaks.length, 'line', 'lines') + ' flagged of ' + plural(res.lines, 'line', 'lines') + ' read. A ticked rewrite goes into that line’s alternates, beside your line — the line in use does not change.'
      : 'No line was flagged: every line read as ' + res.character + '.');
    if (bare.length) out.push('Flagged without a rewrite:\n' + bare.join('\n'));
    if (res.removed) out.push(plural(res.removed, 'quote', 'quotes') + ' removed because ' + (res.removed === 1 ? 'it was' : 'they were') + ' not in ' + res.character + '’s lines.');
    if (res.remapped) out.push(plural(res.remapped, 'quote was', 'quotes were') + ' matched to the line ' + (res.remapped === 1 ? 'it is' : 'they are') + ' actually in.');
    if (res.truncated) out.push('The reply was cut short.');
    out.push('Read by ' + res.model + '.');
    return { items, note: out.join('\n') };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const added = [];
    let gone = 0, dup = 0;
    for (const it of selected || []) {
      if (!it || !it.elId || !it.rewrite) continue;
      const r = Cov.addTake(it.elId, it.rewrite);
      if (r === 'ok') added.push(it); else if (r === 'gone') gone++; else dup++;
    }
    if (!added.length) {
      fail(gone ? 'Those lines are no longer in the script, so nothing was added.' : 'Those takes are already on their lines.');
    }
    call(c.after);
    return () => {
      for (let i = added.length - 1; i >= 0; i--) Cov.removeTake(added[i].elId, added[i].rewrite);
      call(c.after);
    };
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
    const removed = res.removed ? '\n' + plural(res.removed, 'quote', 'quotes') + ' removed because '
      + (res.removed === 1 ? 'it was' : 'they were') + ' not in your logline.' : '';
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


/* ============================================================
   GENRE AND COMPARABLES — list. ctx { getStory(), commit(story)?,
                                       elements?, getDoc?, title? }
   ------------------------------------------------------------
   genreComps(): the genre, tone, budget tier and audience the PAGE
   shows, with verbatim evidence (verified), and 3-5 comparable films.
   The comparables are the model's memory and cannot be checked here,
   so the note says so. The items are the comparables; Accept saves
   genre, tone-as-budget tier, audience and the ticked comparables on
   the story (additive fields), and Undo restores the story as it was.
   ============================================================ */
const TIER_LABEL = { micro: 'Micro', low: 'Low', mid: 'Mid', high: 'High' };

const genreTask = {
  id: 'genre-comps',
  label: 'Genre and comparables',
  kind: 'list',
  editable: false,
  identity(ctx) { try { return 'genre:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'genre'; } },
  input(ctx) {
    const c = resolve(ctx);
    const els = scriptElements(c);
    const sample = AI.genreSample(els);
    if (!sample.scenes.length) return 'This script has no scene headings yet, so there is nothing to place.';
    const s = storyOf(c) || {};
    return 'The screenplay — ' + plural(sample.scenes.length, 'scene', 'scenes')
      + (sample.sampled ? ', the opening of each scene (a long script is sampled, not sent whole)' : ', in full')
      + ' — in one request.' + (s.audience ? '\n\nThe audience you named: ' + s.audience : '\n\nNo audience is named on the story, so the model is asked who it plays to.')
      + '\n\nIt returns a genre, a tone, the budget tier the page asks for, and three to five comparable films.';
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c).map((e) => ({ ...e }));
    const sample = AI.genreSample(els);
    const s = storyOf(c) || {};
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const res = await AI.genreComps({
      scenes: sample.scenes, title, logline: s.logline, audience: s.audience,
      context: withRefineContext(BP.blueprintContext(), refine)
    }, { onStatus, signal });
    last.set('genre-comps', { res });
    const out = [
      'Genre: ' + res.genre + (res.subgenres.length ? ' (' + res.subgenres.join(', ') + ')' : '') + (res.tone ? ' · tone: ' + res.tone : ''),
      res.budgetTier ? 'Budget tier the page asks for: ' + TIER_LABEL[res.budgetTier] + (res.budgetWhy ? ' — ' + res.budgetWhy : '') : '',
      res.audience ? 'Plays to: ' + res.audience : '',
      res.evidence.length ? 'Why, in your words:\n' + res.evidence.map((e) => 'Sc ' + e.scene + ': “' + e.quote + '” — ' + e.note).join('\n') : '',
      'The comparables are the model’s memory of films, not something this tool can check. Look each one up before it goes in a pitch.',
      res.removed ? plural(res.removed, 'quote', 'quotes') + ' removed because ' + (res.removed === 1 ? 'it was' : 'they were') + ' not word for word in your script.' : '',
      sample.sampled ? 'A long script is sampled for this, so the evidence comes from the opening of each scene.' : '',
      'Read by ' + res.model + '. Accepting saves the genre, budget tier and audience above and the comparables you tick.'
    ].filter(Boolean);
    return {
      items: res.comps.map((cp, i) => ({ id: 'c' + i, title: cp.title, year: cp.year, why: cp.why,
        text: cp.title + (cp.year ? ' (' + cp.year + ')' : ''), detail: cp.why })),
      note: out.join('\n\n')
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const mem = last.get('genre-comps');
    if (!mem || !mem.res) fail('There is nothing to keep. Run it first.');
    const r = mem.res;
    const before = JSON.parse(JSON.stringify(storyOf(c)));
    const s = storyOf(c);
    s.genre = r.genre + (r.subgenres.length ? ' / ' + r.subgenres.join(' / ') : '');
    if (r.budgetTier) s.budgetTier = r.budgetTier;
    if (r.audience && !String(s.audience || '').trim()) s.audience = r.audience;
    const have = new Set((s.comps || []).map((x) => x.title.toLowerCase()));
    const comps = (s.comps || []).slice();
    for (const it of selected || []) {
      if (!it || !it.title || have.has(it.title.toLowerCase())) continue;
      have.add(it.title.toLowerCase());
      comps.push({ title: it.title, year: it.year || '', why: it.why || '' });
    }
    s.comps = comps;
    commitStory(c, s);
    return () => commitStory(c, before);
  }
};

/* ============================================================
   SCENE NOTES — list. ctx { elements?, getDoc?, title?, after?() }
   ------------------------------------------------------------
   One note per scene, each resting on a quote verified against that
   scene, plus a cut-candidate flag that needs the quote to stand. The
   items are the notes; Accept writes `readerNote` and `cutCandidate`
   on the scene rows the ticked notes belong to. A row is found by the
   same content match the breakdown uses; a pair made only by position
   is a guess and is left out, and the note says how many.
   ============================================================ */
function rowFor(pairs, sliceIndex) {
  const p = pairs.find((x) => x.slice && x.slice.index === sliceIndex && Analysis.isConfident(x.how));
  return p ? p.scene : null;
}

const sceneNotesTask = {
  id: 'scene-notes',
  label: 'Scene notes',
  kind: 'list',
  editable: false,
  identity(ctx) { try { return 'scene-notes:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'scene-notes'; } },
  input(ctx) {
    const plan = AI.planSceneRead(scriptElements(resolve(ctx)));
    if (!plan.batches.length) return 'This script has no scene headings yet, so there is nothing to read.';
    return 'The whole screenplay — ' + plural(plan.scenes.length, 'scene', 'scenes') + ', '
      + plan.chars.toLocaleString('en-IN') + ' characters — in ' + plural(plan.requests, 'request', 'requests')
      + ', roughly ' + plan.tokensIn.toLocaleString('en-IN') + ' tokens. One note per scene; nothing is written until you accept.';
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c).map((e) => ({ ...e }));
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const context = withRefineContext(BP.blueprintContext(), refine);
    const run = await AI.runSceneBatches(els, (scenes, part, parts) =>
      AI.sceneNotesBatch({ scenes, part, parts, title, context }, { onStatus, signal }), { onStatus, signal });
    const heading = new Map(run.scenes.map((sc, i) => [sc.n, { i, heading: sc.heading }]));
    const notes = run.parts.flatMap((p) => p.notes);
    const removed = run.parts.reduce((n, p) => n + p.removed, 0);
    last.set('scene-notes', { notes: notes.map((n) => ({ ...n, i: (heading.get(n.scene) || {}).i })) });
    const cuts = notes.filter((n) => n.cut).length;
    return {
      items: notes.map((n) => ({ id: 's' + n.scene, scene: n.scene, i: (heading.get(n.scene) || {}).i, note: n.note, cut: n.cut,
        text: n.note + (n.cut ? '  — CUT CANDIDATE' : ''),
        detail: 'Sc ' + n.scene + ' · ' + ((heading.get(n.scene) || {}).heading || '') + (n.quote ? ' · “' + n.quote + '”' : ' · no quote — the one given was not in the scene') })),
      note: plural(notes.length, 'scene note', 'scene notes') + ' from ' + plural(run.scenes.length, 'scene', 'scenes') + ' read; '
        + plural(cuts, 'scene', 'scenes') + ' flagged as cut candidates (a flag needs a quote that is in the scene).'
        + (removed ? ' ' + plural(removed, 'quote', 'quotes') + ' removed because not word for word in the script; those notes keep their words and cannot be cut candidates.' : '')
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const els = scriptElements(c);
    const rows = ScenesM.listScenes();
    const pairs = Analysis.matchScenes(rows, els).pairs;
    const before = new Map();
    const patch = new Map();
    let skipped = 0;
    for (const it of selected || []) {
      const row = rowFor(pairs, it.i);
      if (!row) { skipped++; continue; }
      before.set(row.id, { readerNote: row.readerNote || '', cutCandidate: !!row.cutCandidate });
      patch.set(row.id, { readerNote: it.note, cutCandidate: !!it.cut });
    }
    if (!patch.size) fail('None of those scenes is matched to a scene on the breakdown by content, so nothing was written.' + (skipped ? ' (' + skipped + ' matched by position only.)' : ''));
    const write = (m) => ScenesM.saveScenes(ScenesM.listScenes().map((s) => (m.has(s.id) ? { ...s, ...m.get(s.id) } : s)));
    write(patch);
    call(c.after);
    return () => { write(before); call(c.after); };
  }
};

/* ============================================================
   BREAKDOWN TAGS — list. ctx { elements?, getDoc?, title?, after?() }
   ------------------------------------------------------------
   Every element the page calls for, in every breakdown category, each
   with the words that call for it, verified against the scene (an
   element with no words behind it is removed). Accept adds the ticked
   ones through scenes.js tagMany(), which only ADDS and skips what is
   already tagged; Undo removes exactly what this call wrote.
   ============================================================ */
const tagsTask = {
  id: 'breakdown-tags',
  label: 'Breakdown tags',
  kind: 'list',
  editable: false,
  identity(ctx) { try { return 'breakdown-tags:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'breakdown-tags'; } },
  input(ctx) {
    const plan = AI.planSceneRead(scriptElements(resolve(ctx)));
    if (!plan.batches.length) return 'This script has no scene headings yet, so there is nothing to break down.';
    return 'The whole screenplay — ' + plural(plan.scenes.length, 'scene', 'scenes') + ' — in ' + plural(plan.requests, 'request', 'requests')
      + ', roughly ' + plan.tokensIn.toLocaleString('en-IN') + ' tokens. Every element the page calls for, in all '
      + ScenesM.ELEMENT_CATEGORIES.length + ' categories, each with the words that call for it.\n\nNothing is tagged until you accept, and only what you tick.';
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c).map((e) => ({ ...e }));
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const context = withRefineContext(BP.blueprintContext(), refine);
    const categories = ScenesM.ELEMENT_CATEGORIES.map((k) => ({ id: k.id, label: k.label }));
    const run = await AI.runSceneBatches(els, (scenes, part, parts) =>
      AI.breakdownTagsBatch({ scenes, part, parts, title, context, categories }, { onStatus, signal }), { onStatus, signal });
    const at = new Map(run.scenes.map((sc, i) => [sc.n, { i, heading: sc.heading }]));
    const label = Object.fromEntries(categories.map((k) => [k.id, k.label]));
    const found = run.parts.flatMap((p) => p.elements);
    const removed = run.parts.reduce((n, p) => n + p.removed, 0);
    return {
      items: found.map((e, k) => ({ id: 't' + k, scene: e.scene, i: (at.get(e.scene) || {}).i, category: e.category, name: e.name,
        text: 'Sc ' + e.scene + ' · ' + label[e.category] + ': ' + e.name,
        detail: '“' + e.quote + '”' })),
      note: plural(found.length, 'element', 'elements') + ' across ' + plural(new Set(found.map((e) => e.scene)).size, 'scene', 'scenes') + '.'
        + (removed ? ' ' + plural(removed, 'element', 'elements') + ' removed because the words they cited are not in the scene.' : '')
        + ' Elements already tagged on a scene are skipped, not duplicated.'
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const els = scriptElements(c);
    const pairs = Analysis.matchScenes(ScenesM.listScenes(), els).pairs;
    const tags = [];
    let skipped = 0;
    for (const it of selected || []) {
      const row = rowFor(pairs, it.i);
      if (!row) { skipped++; continue; }
      tags.push({ sceneId: row.id, category: it.category, name: it.name });
    }
    const added = ScenesM.tagMany(tags);
    if (!added.length) fail(skipped ? 'Those scenes are matched to the breakdown by position only, so nothing was tagged.' : 'Every ticked element is already tagged.');
    call(c.after);
    return () => { ScenesM.untagMany(added); call(c.after); };
  }
};

/* ---- registration ------------------------------------------- */
const ALL_TASKS = [coverageTask, dialogueTask, critiqueTask, storyStepsTask, storyMapTask, shotTask, synopsisTask,
  genScenesTask, genBatchTask, voiceTask, loglineTask, genreTask, sceneNotesTask, tagsTask];
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
