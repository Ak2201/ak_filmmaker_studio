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
                      row's own Undo also still works, page save; the
                      other versions become the line's alternate takes
                      (`alts`, the alt-lines.js shape)
     story-steps/map  story.js models, saved by the page's commit()
     shot-draft       shots.js addShot (append only; size, angle, movement,
                      lens, rig, setup, description)
     scene-story      story.js outline steps, one per scene, linked by
                      sceneId (breakdown-extras.js appendSteps)
     synopsis-script  scriptgen.js's job (stage 1 → the beat sheet), and
                      story.js's logline and outline steps where BLANK
     gen-scenes       scriptgen.js applyScenes (stage 2 → scenes.js, each
                      row's beatId, cast joined to characters.js records)
     gen-batch        scriptgen.js applyBatch (stage 3, one batch →
                      the script blob, cursor advanced past what was
                      written; an unticked scene stays next in line)
     voice-check      coverage.js addTake (a line's alternates)
     logline          the page's setLogline(); the other ticked variants
                      into the story's `loglineAlts` (setLoglineAlts)
     genre-comps      story.js fields genre/tone/budgetTier/budgetWhy/audience/
                      comps, via commit
     scene-notes      scenes.js readerNote + cutCandidate on content-matched rows
     breakdown-tags   scenes.js tagMany (adds only), undo = untagMany
     audience-test    audience-store.js, one document in the script blob's
                      documents (a partial run's checkpoint as it lands,
                      the kept run on Accept), through the page's save
     blocking-draft   shots.js writeBlocking (the scene's floor plan,
                      filled not overwritten, and one diagram per ticked
                      shot, each with ONE camera; shot.cam filled only
                      where blank), one write; undo = undoBlocking
     blocking-enhance shots.js replaceBlock (the ticked ops applied to the
                      setup, blocking-ai-model.js applyBlockOps); undo =
                      replaceBlock of the snapshot taken before Accept
   beat-critique, tension-notes, audience-quick (the story test) and
   audience-ask (a question to one viewer) are reads: they write nothing.

   NO STORAGE KEY. The only memory here is the last run per task (what
   apply() needs beside the ticked items), in a Map for this visit.
   ============================================================ */
import { callPort, hasPort } from './ports.js';
import W from './ai-writing-apply.js';   // pure: takes, alternates, fill-only story, cast join
import Store from './store.js';   // the open project's format (scene-story)

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
let Extras = null;        // ./breakdown-extras.js
let BoardM = null;        // ./board-frames.js (pure)
let DriveM = null;        // ./drive.js
let DriveImg = null;      // ./drive-board.js (the live gate facts)
let SA = null;            // ./script-analysis-model.js (pure)
let AudM = null;          // ./audience-model.js (pure)
let AudS = null;          // ./audience-store.js
let BlockAI = null;       // ./blocking-ai-model.js (pure)
let CharM = null;         // ./characters.js
let readyP = null;

function loadAll() {
  if (!readyP) {
    readyP = Promise.all([
      import('./ai.js'), import('./blueprint-context.js'), import('./story.js'),
      import('./scenes.js'), import('./script.js'), import('./shots.js'),
      import('./screenplay-analysis.js'), import('./scriptgen.js'), import('./coverage-store.js'),
      import('./breakdown-extras.js'), import('./board-frames.js'), import('./drive.js'),
      import('./drive-board.js'), import('./script-analysis-model.js'),
      import('./audience-model.js'), import('./audience-store.js'),
      import('./blocking-ai-model.js'), import('./characters.js')
    ]).then(([a, b, st, sc, sp, sh, an, g, cv, bx, bf, dr, di, sa, am, aus, bai, ch]) => {
      AI = a; BP = b; StoryM = st; ScenesM = sc; ScriptM = sp; ShotsM = sh; Analysis = an; Gen = g; Cov = cv; Extras = bx;
      BoardM = bf; DriveM = dr; DriveImg = di; SA = sa; AudM = am; AudS = aus; BlockAI = bai; CharM = ch;
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
/* The same memory, pinned to the result it belongs to. The Desk keeps
   a version per run (and a session per speech), and Accept can be
   pressed on any of them, so apply() must read the memory of the
   version shown — the third argument the Desk passes — and fall back
   to `last` only for a caller that passes none. Non-enumerable, so a
   refinement's `previous` never carries it. */
function remember(id, result, mem) {
  last.set(id, mem);
  if (result && typeof result === 'object') Object.defineProperty(result, 'memo', { value: mem, enumerable: false });
  return result;
}
const recall = (id, result) => (result && result.memo) || last.get(id);
/* What an Accept did, said in its Undo toast. The Desk's toast says only
   "applied" otherwise, which hid a partial write (some ticked items
   skipped) behind the word for a whole one. A property on the undo
   function, so every caller that only calls undo() is unchanged. */
function withNote(undo, parts) {
  const note = [].concat(parts || []).filter(Boolean).join(' ');
  if (note) undo.note = note;
  return undo;
}

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
    /* Remembered on the result, not only in `last`: a refine adds a
       v2 beside v1, and Accept on v1 must keep v1's report. The ids
       are positional (`premise:p0`), so filtering the newest report
       with an older version's ticks keeps whatever sits at those
       indexes there — a verdict and notes nobody reviewed. */
    const items = coverageItems(res.report || {});
    return remember('coverage', { items, note: coverageNote(res) }, { sig, checkpoint, res });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('coverage', result);
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
    const others = res.options.slice(1).map((o, n) => 'Version ' + (n + 2) + ': ' + o.text + (o.note ? ' (' + o.note + ')' : ''));
    const note = [res.keep ? 'What already works: ' + res.keep : '', res.options[0].note || '', ...others,
      res.truncated ? 'The reply was cut short.' : ''].filter(Boolean).join('\n');
    const alts = res.options.slice(1).map((o) => o.text);
    const keepNote = alts.length ? 'Accept also keeps ' + (alts.length === 1 ? 'version 2' : 'versions 2–' + (alts.length + 1))
      + ' as alternate takes of this line, beside it; the line in use is the merged version above.' : '';
    return remember('dialogue-pass', { original: String(els[i].text ?? ''), proposed: res.options[0].text,
      note: [note, keepNote].filter(Boolean).join('\n') },
      { elId: els[i].id, model: res.model, alts });
  },
  apply(text, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('dialogue-pass', result) || {};
    const d = call(c.getDoc);
    const els = d && Array.isArray(d.elements) ? d.elements : null;
    const el = els && els.find((e) => String(e.id) === String(mem.elId));
    if (!el) fail('That speech is no longer in the script, so nothing was changed.');
    /* The merge is built on the speech as it was at Run. Docked at
       1100px and wider the editor stays live beside the Desk, so the
       writer can keep typing in this speech; writing the merge then
       would replace every word typed since, and an unticked hunk
       would put back the OLD line rather than the current one. */
    if (result && typeof result.original === 'string' && String(el.text ?? '') !== result.original) {
      fail('This speech has changed since the pass ran, so nothing was changed. Run the pass again on the current text.');
    }
    const before = { text: el.text, aiPass: el.aiPass ? { ...el.aiPass } : undefined };
    const changed = String(text) !== String(el.text);
    if (changed) {
      el.aiPass = { at: new Date().toISOString(), model: mem.model || '', was: el.aiPass ? el.aiPass.was : el.text };
      el.text = String(text);
    }
    /* The other versions are not thrown away: each becomes an alternate
       take of this line (alt-lines.js's "dialogue choices"), so the
       writer can swap one in later without asking again. Only dialogue
       carries takes. Undo takes out exactly these and nothing a person
       added beside them. */
    const added = el.type === 'dialogue' ? W.addTakes(el, mem.alts || []) : [];
    if (!changed && !added.length) return null;
    call(c.save);
    call(c.render, el.id);
    return () => {
      const now = (d.elements || []).find((e) => String(e.id) === String(mem.elId));
      if (!now) return;
      if (changed) {
        now.text = before.text;
        if (before.aiPass) now.aiPass = before.aiPass; else delete now.aiPass;
      }
      W.removeTakes(now, added);
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
    const items = res.rows.map((r, i) => ({
      id: 'r' + i, beat: r.beat, row: r,
      text: (labelOf.get(String(r.beat)) || r.beat) + ': “' + r.quote + '”',
      detail: [r.rationale, Number.isFinite(r.tension) ? 'tension ' + r.tension : ''].filter(Boolean).join(' · ')
    }));
    /* Pinned to the version, as coverage is: a row index read back
       from a newer run's rows is a different passage. */
    return remember('story-map', { items, note: res.truncated ? 'The reply was cut short, so some beats may be missing.' : '' },
      { fwId: fw.id, rows: res.rows });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('story-map', result);
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
        detail: [d.size, d.angle, d.movement, d.lens, d.rig, d.setup].filter(Boolean).join(' · ')
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
      /* Every column the Shot List shows, rig and setup included, so
         nothing the model drafted has to be retyped there. Named, not
         spread: a refined or stale draft carrying some other field must
         not reach the shot record. */
      const d = it.draft;
      made.push(ShotsM.addShot(it.sceneId, {
        size: d.size, angle: d.angle, movement: d.movement, lens: d.lens || '',
        rig: d.rig || '', setup: d.setup || '', description: d.description, ai: true
      }).id);
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
   SCENE → STORY — list. ctx { sceneIds: [id…], format?, after?(madeIds) }
   ------------------------------------------------------------
   draftSceneStory() over the named scenes: one outline step per
   scene, the beat the model chose (checked against the framework in
   force — the writer's choice once made, else the format's
   suggestion), else the beat the scene sits nearest. Sent in batches
   of SCENE_STORY_BATCH scenes, one request each, so a feature's sixty
   scenes are not one reply cut off at the ceiling.
   Accept files the ticked steps under their beats in story.outline,
   each linked by `sceneId` (breakdown-extras.js appendSteps, the same
   write the non-AI 'story-basic' makes); Undo removes exactly those.
   ============================================================ */
const SCENE_STORY_BATCH = 25;

const projectFormat = (c) => {
  const f = String(call(c.format) ?? c.format ?? '');
  if (f) return f === 'short' ? 'short' : 'feature';
  try { const p = Store.currentProject && Store.currentProject(); return p && p.format === 'short' ? 'short' : 'feature'; }
  catch (e) { return 'feature'; }
};

function sceneStoryJobs(c) {
  const want = new Set([].concat(c.sceneIds || []).map(String));
  const all = ScenesM.listScenes();
  const scenes = all.filter((s) => want.has(String(s.id)));
  if (!scenes.length) fail('Tick at least one scene.');
  const s = StoryM.loadStory();
  const fw = StoryM.frameworkById(StoryM.effectiveFramework(s, projectFormat(c)));
  const script = ScriptM.loadScript();
  const bySlice = new Map(Analysis.matchScenes(all, script.elements).pairs.map((p) => [p.scene.id, p.slice]));
  const pos = Extras.scenePositions(all);
  const jobs = scenes.map((scene) => {
    const slice = bySlice.get(scene.id) || null;
    return {
      sceneId: String(scene.id), number: scene.number, slug: Extras.sceneSlug(scene),
      synopsis: scene.synopsis, script: slice ? AI.sceneScriptText(slice) : '',
      beat: Extras.beatForScene(scene, pos.get(String(scene.id)), fw.id)
    };
  });
  return { fw, story: s, jobs };
}

const sceneStoryTask = {
  id: 'scene-story',
  label: 'Draft the story from the scenes',
  kind: 'list',
  editable: false,
  input(ctx) {
    let j;
    try { j = sceneStoryJobs(resolve(ctx)); } catch (e) { return (e && e.message) || ''; }
    const parts = Math.ceil(j.jobs.length / SCENE_STORY_BATCH);
    const first = AI.buildSceneStoryPrompt({
      framework: j.fw, scenes: j.jobs.slice(0, SCENE_STORY_BATCH), idea: j.story.idea, logline: j.story.logline
    });
    return plural(j.jobs.length, 'scene', 'scenes') + ', ' + plural(parts, 'request', 'requests')
      + ', against the ' + j.fw.label + ' beats.' + (parts > 1 ? ' The first request sends:' : ' It sends:')
      + '\n\n' + (first.length > 8000 ? first.slice(0, 8000) + '\n…' : first);
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const { fw, story, jobs } = sceneStoryJobs(c);
    const ask = refineText(refine);
    const steps = [];
    let truncated = false;
    for (let i = 0; i < jobs.length; i += SCENE_STORY_BATCH) {
      const part = jobs.slice(i, i + SCENE_STORY_BATCH);
      const n = Math.floor(i / SCENE_STORY_BATCH) + 1, of = Math.ceil(jobs.length / SCENE_STORY_BATCH);
      const res = await AI.draftSceneStory({
        framework: fw, scenes: part, idea: story.idea, logline: story.logline, ask,
        context: BP.blueprintContext()
      }, { signal, onStatus: (m) => call(onStatus, of > 1 ? 'Part ' + n + ' of ' + of + ' · ' + m : m) });
      steps.push(...res.steps);
      truncated = truncated || res.truncated;
    }
    const numOf = new Map(jobs.map((j) => [j.sceneId, j.number || '—']));
    const labelOf = new Map(fw.beats.map((b) => [fw.id + ':' + b.id, b.label]));
    const items = steps.map((st) => ({
      id: 'st:' + st.sceneId, sceneId: st.sceneId, beat: st.beat, text: st.text,
      detail: 'Sc ' + numOf.get(st.sceneId) + ' · under ' + (labelOf.get(st.beat) || st.beat)
    }));
    const missing = jobs.length - items.length;
    const note = [
      missing ? plural(missing, 'scene', 'scenes') + ' came back with no step.' : '',
      truncated ? 'The reply was cut short, so some scenes may be missing.' : ''
    ].filter(Boolean).join(' ');
    return { items, note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const s = StoryM.loadStory();
    const made = Extras.appendSteps(s, selected);
    if (!made.length) return null;
    StoryM.saveStory(s);
    call(c.after, made);
    return () => {
      const back = StoryM.loadStory();
      Extras.removeSteps(back, made);
      StoryM.saveStory(back);
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

   THE STORY PAGE SEES IT TOO. The same Accept fills the Story page's
   logline and its beat steps (story.js) WHERE THEY ARE BLANK, so the
   beat sheet is not typed twice: a beat that already has a written
   step, or a logline already there, is the writer's and is left
   alone. Steps are written only when the story's beat sheet in force
   is Save the Cat (the vocabulary scriptgen drafts in) and the
   outline is not locked; a short film is always the five beats, so a
   short gets the logline only. Undo takes back only what is still as
   it was written.
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
    const items = vocab.filter((b) => res.byBeat.get(b.id)).map((b) => ({
      id: b.id, text: res.byBeat.get(b.id), detail: b.label + (b.pages ? ' · pages ' + b.pages : '')
    }));
    if (!items.length) fail('The reply held no beats, so nothing changed.');
    const note = [res.logline ? 'Logline: ' + res.logline : '',
      'Accept also fills the Story page’s logline and beat steps where they are still blank; nothing you wrote there is replaced.']
      .filter(Boolean).join('\n');
    return remember('synopsis-script', { items, note },
      { synopsis, logline: res.logline, model: res.model, vocab });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('synopsis-script', result);
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
    const filled = fillStoryFromBeats(job);
    call(c.after, job);
    return () => { Gen.save(prev); undoStoryFromBeats(filled); call(c.after, prev); };
  }
};

/* The story half of synopsis-script's Accept (see its header). */
function fillStoryFromBeats(job) {
  const story = StoryM.loadStory();
  const fwId = StoryM.effectiveFramework(story, job.format);
  const fw = StoryM.frameworkById(fwId);
  const steps = fw.id === 'save_the_cat' && !story.outlineLockedAt;
  const beats = (job.beats || []).map((b) => ({ key: W.storyBeatKey(b.id, fw), text: b.happens }));
  const wrote = W.fillStoryBlanks(story, { logline: job.logline, beats, steps }, StoryM.addOutlineStep);
  if (!wrote.logline && !wrote.filled.length && !wrote.added.length) return null;
  StoryM.saveStory(story);
  return { wrote, logline: story.logline };
}
function undoStoryFromBeats(filled) {
  if (!filled) return;
  const story = StoryM.loadStory();
  W.undoStoryFill(story, filled.wrote, filled.logline);
  StoryM.saveStory(story);
}

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
   the moment of Accept. Each row keeps the beat it serves (`beatId`)
   and its cast joined to the Characters records, a record made only
   for a name nobody has (scriptgen.js applyScenes). Undo puts back the
   scene list and the job, and removes the records it made that are
   still blank.
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
    const note = plural(items.length, 'scene', 'scenes') + ' proposed. Untick any you do not want; the rest go on the scene board in this order, each with its beat, and any name in the cast that is not on the Characters page yet is added there.'
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
   SYNOPSIS → SCRIPT, STAGE 3 — list, ONE BATCH. ctx { before?(), after?() }
   ------------------------------------------------------------
   draftBatch() drafts the next BATCH_SIZE scenes at the job's cursor
   and writes nothing; the items are those scenes (heading and first
   lines). Accept hands the ticked sceneIds to applyBatch(), which
   appends them to the screenplay (a revision first, on the first
   batch only), and moves the cursor past the scenes it WROTE — an
   unticked scene, like one the reply missed, stays next in line and is
   drafted again with the next batch, never skipped for good. The identity
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
      plural(items.length, 'scene', 'scenes') + ' drafted. Ticked scenes are added to the end of the screenplay; an unticked one stays next in line and is drafted again with the next batch.',
      missed.length ? 'Not in the reply (asked for again with the next batch): ' + missed.join('; ') + '.' : '',
      draft.truncated ? 'The reply was cut short at the length limit, so the last scene may stop mid-page.' : ''
    ].filter(Boolean).join('\n');
    return { items, note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const chosen = (selected || []).filter(Boolean);
    const draft = (chosen[0] && chosen[0].draft) || (last.get('gen-batch') || {}).draft;
    if (!draft) fail('There is no batch to keep. Run it first.');
    /* applyBatch reads the script from STORAGE and writes it back, so
       a page that holds its own copy with an edit not yet saved (a
       debounced keystroke) hands it over first through `before`, or
       the batch lands on the stored copy and the page's next save
       writes the old copy over the batch. The page then reloads its
       copy in `after`. applyBatch throws GenError 'stale' with a
       sentence the writer can act on; the Desk shows it and writes
       nothing. */
    call(c.before);
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
    /* The takes are written by the Coverage tab (it registers the
       addTake port). With that view not open the port answers its
       fallback, 'gone', for every line — which used to read "those
       lines are no longer in the script" about lines that are. */
    if (!hasPort('addTake')) {
      fail('The Coverage view has to be open to keep these rewrites as takes — it is what writes them. Open it and accept again. Nothing was added, and your lines are still in the script.');
    }
    const added = [];
    let gone = 0, dup = 0;
    for (const it of selected || []) {
      if (!it || !it.elId || !it.rewrite) continue;
      // The take goes onto the row the Coverage tab has open (a port it registers).
      const r = callPort('addTake', 'gone', it.elId, it.rewrite);
      if (r === 'ok') added.push(it); else if (r === 'gone') gone++; else dup++;
    }
    if (!added.length) {
      fail(gone ? 'Those lines are no longer in the script, so nothing was added.' : 'Those takes are already on their lines.');
    }
    call(c.after);
    return () => {
      for (let i = added.length - 1; i >= 0; i--) callPort('removeTake', undefined, added[i].elId, added[i].rewrite);
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
   takes the first ticked variant as the logline; every OTHER ticked
   variant is kept as an alternate on the story (`loglineAlts`, an
   additive field, through ctx.setLoglineAlts — the page's own commit),
   shown under the workshop with "Use this". Undo puts their logline
   back and takes out exactly the alternates it added. Nothing replaces
   the logline without that Accept.
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
      note: 'Your logline, checked:\n' + check + removed + '\n\nThe first ticked variant becomes your logline; any other you tick is kept as an alternate under the workshop.'
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const pick = (selected || [])[0];
    if (!pick || typeof c.setLogline !== 'function') return null;
    const live = call(c.getLogline);
    const before = typeof live === 'string' ? live : String((storyOf(c) || {}).logline || '');
    c.setLogline(pick.text);
    let added = [];
    if (typeof c.setLoglineAlts === 'function') {
      const r = W.addLoglineAlts(W.loglineAltsOf(storyOf(c)), (selected || []).slice(1).map((it) => it && it.text), pick.text);
      added = r.added;
      if (added.length) c.setLoglineAlts(r.list);
    }
    return () => {
      c.setLogline(before);
      if (added.length) c.setLoglineAlts(W.removeLoglineAlts(W.loglineAltsOf(storyOf(c)), added));
    };
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
   genre, tone, budget tier (with its one-line why), audience (only
   into a blank) and the ticked comparables on the story (additive
   fields; the Breakdown header shows them), and Undo restores the
   story as it was.
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
    const out = [
      'Genre: ' + res.genre + (res.subgenres.length ? ' (' + res.subgenres.join(', ') + ')' : '') + (res.tone ? ' · tone: ' + res.tone : ''),
      res.budgetTier ? 'Budget tier the page asks for: ' + TIER_LABEL[res.budgetTier] + (res.budgetWhy ? ' — ' + res.budgetWhy : '') : '',
      res.audience ? 'Plays to: ' + res.audience : '',
      res.evidence.length ? 'Why, in your words:\n' + res.evidence.map((e) => 'Sc ' + e.scene + ': “' + e.quote + '” — ' + e.note).join('\n') : '',
      'The comparables are the model’s memory of films, not something this tool can check. Look each one up before it goes in a pitch.',
      res.removed ? plural(res.removed, 'quote', 'quotes') + ' removed because ' + (res.removed === 1 ? 'it was' : 'they were') + ' not word for word in your script.' : '',
      sample.sampled ? 'A long script is sampled for this, so the evidence comes from the opening of each scene.' : '',
      'Read by ' + res.model + '. Accepting saves the genre, tone, budget tier and audience above and the comparables you tick.'
    ].filter(Boolean);
    return remember('genre-comps', {
      items: res.comps.map((cp, i) => ({ id: 'c' + i, title: cp.title, year: cp.year, why: cp.why,
        text: cp.title + (cp.year ? ' (' + cp.year + ')' : ''), detail: cp.why })),
      note: out.join('\n\n')
    }, { res });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('genre-comps', result);
    if (!mem || !mem.res) fail('There is nothing to keep. Run it first.');
    const r = mem.res;
    const before = JSON.parse(JSON.stringify(storyOf(c)));
    const s = storyOf(c);
    s.genre = r.genre + (r.subgenres.length ? ' / ' + r.subgenres.join(' / ') : '');
    if (r.tone) s.tone = r.tone;
    // The why travels with the tier it explains, never apart from it.
    if (r.budgetTier) { s.budgetTier = r.budgetTier; s.budgetWhy = r.budgetWhy || ''; }
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
   items are the notes; Accept writes on the scene rows the ticked
   notes belong to:
     readerNote    APPENDED to what the row already says, marked "AI:",
                   never written over it (a note already there word for
                   word is not added twice)
     cutCandidate  set only when the row's flag is still unset — the
                   model can raise it, never clear or re-raise it
   Undo puts back exactly the values each written row had before.
   A row is found by the same content match the breakdown uses. A pair
   made only by POSITION is a guess and is left out, unless the
   script's own scene number (the writer's, never a position) agrees
   with the row's — the number is then the evidence, not the order.
   What is left out is counted in the Undo toast.
   ============================================================ */
const normNo = (v) => String(v ?? '').trim().toUpperCase();
/* The scene row a slice of the script belongs to, or null. Confident
   pairs first; then the writer's own scene number (slice.number is the
   heading's sceneNumber, '' when the writer set none — so a number that
   is only a position never counts). An unpaired slice may take the ONE
   unpaired row carrying its number; two such rows are a guess again. */
function rowFor(match, sliceIndex) {
  if (sliceIndex == null) return null;
  const pairs = match.pairs || [];
  const p = pairs.find((x) => x.slice && x.slice.index === sliceIndex);
  if (p && Analysis.isConfident(p.how)) return p.scene;
  const slice = p ? p.slice : (match.slices || [])[sliceIndex];
  const no = normNo(slice && slice.number);
  if (!no) return null;
  if (p) return normNo(p.scene.number) === no ? p.scene : null;
  const free = pairs.filter((x) => !x.slice && normNo(x.scene.number) === no);
  return free.length === 1 ? free[0].scene : null;
}
/** PURE. The note a row ends up with: the AI's appended, never over. */
function appendNote(have, note) {
  const was = String(have || '').trim();
  const add = String(note || '').trim();
  if (!add) return was;
  if (!was) return add;
  if (was.includes(add)) return was;
  return was + ' · AI: ' + add;
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
    const match = Analysis.matchScenes(ScenesM.listScenes(), els);
    const before = new Map();
    const patch = new Map();
    let skipped = 0, same = 0;
    for (const it of selected || []) {
      const row = rowFor(match, it.i);
      if (!row) { skipped++; continue; }
      // Two ticked notes on one row build on each other, not on the stored value twice.
      const cur = patch.has(row.id) ? { ...row, ...patch.get(row.id) } : row;
      const next = {};
      const note = appendNote(cur.readerNote, it.note);
      if (note !== String(cur.readerNote || '').trim()) next.readerNote = note;
      if (it.cut && !cur.cutCandidate) next.cutCandidate = true;
      if (!Object.keys(next).length) { same++; continue; }
      if (!before.has(row.id)) before.set(row.id, { readerNote: row.readerNote, cutCandidate: row.cutCandidate });
      patch.set(row.id, { ...(patch.get(row.id) || {}), ...next });
    }
    if (!patch.size) {
      fail(same && !skipped ? 'Those notes are already on their scenes, so nothing was written.'
        : 'None of those scenes is matched to a scene on the breakdown by content or scene number, so nothing was written.'
          + (skipped ? ' (' + plural(skipped, 'note', 'notes') + ' matched by position only.)' : ''));
    }
    const write = (m) => ScenesM.saveScenes(ScenesM.listScenes().map((s) => (m.has(s.id) ? { ...s, ...m.get(s.id) } : s)));
    write(patch);
    call(c.after);
    const undo = () => { write(before); call(c.after); };
    return withNote(undo, [
      'Notes on ' + plural(patch.size, 'scene', 'scenes') + '.',
      skipped ? plural(skipped, 'note', 'notes') + ' left out: the scene is matched by position only.' : '',
      same ? plural(same, 'note', 'notes') + ' already there.' : ''
    ]);
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
    const match = Analysis.matchScenes(ScenesM.listScenes(), els);
    /* Only a category the scene model has: tagMany() would otherwise
       open a new bucket under any id it is handed, which no view lists. */
    const known = new Set(ScenesM.ELEMENT_CATEGORIES.map((k) => k.id));
    const tags = [];
    let skipped = 0, unknown = 0;
    for (const it of selected || []) {
      if (!known.has(it.category)) { unknown++; continue; }
      const row = rowFor(match, it.i);
      if (!row) { skipped++; continue; }
      tags.push({ sceneId: row.id, category: it.category, name: it.name });
    }
    const added = ScenesM.tagMany(tags);
    const already = tags.length - added.length;
    /* Every reason something was not tagged is said, on success as well
       as on failure: a partial Accept that only says "applied" reads as
       if every ticked element went in. */
    const why = [
      skipped ? plural(skipped, 'element', 'elements') + ' left out: the scene is matched by position only.' : '',
      unknown ? plural(unknown, 'element', 'elements') + ' left out: not a breakdown category.' : '',
      already ? plural(already, 'element', 'elements') + ' already tagged.' : ''
    ];
    if (!added.length) fail((skipped || unknown ? 'Nothing was tagged. ' : 'Every ticked element is already tagged. ') + why.filter(Boolean).join(' '));
    call(c.after);
    const undo = () => { ScenesM.untagMany(added); call(c.after); };
    return withNote(undo, [plural(added.length, 'element', 'elements') + ' tagged.', ...why]);
  }
};

/* ============================================================
   BOARD FRAMES — list. ctx { shotIds?: [id…], style?, after?(madeIds) }
   ------------------------------------------------------------
   NEXT-UI-REVAMP-PLAN phase 4. One picture per shot that has no
   drawn frame yet (board-frames.js boardJobs, at most MAX_FRAMES a
   run), drawn by Gemini's image model through ai.js generateImage —
   the same send() as every text task, key in `x-goog-api-key`. The
   writer picks the style in "what goes in" (Style: …) or with a chip,
   which redraws the run in that style.

   NOTHING IS KEPT UNTIL ACCEPT. The pictures live as Blobs in this
   Desk session. Accept uploads each ticked one to the writer's Drive
   (drive.js createFile) and adds a frame whose `ref` is
   `drive:<fileId>` — the bytes never reach localStorage, the frame
   record or a backup file. Undo removes those frames and deletes the
   files it made, quietly (no popup; a failed delete leaves a file in
   the writer's Drive, which is theirs anyway).

   GATED TWICE: blocked() (signed out, Drive unreachable or not
   connected, no live Drive token) stops the Desk before anything is
   spent, and run() and apply() ask again.
   ============================================================ */
function boardJobsFor(c, max) {
  return BoardM.boardJobs({
    shots: ShotsM.listShots(), scenes: ScenesM.listScenes(), frames: ShotsM.listFrames(),
    onlyShotIds: Array.isArray(c.shotIds) && c.shotIds.length ? c.shotIds : null,
    max: max == null ? BoardM.MAX_FRAMES : max
  });
}

const BOARD_CHIPS = ['Pencil sketch', 'Ink and wash', 'Marker', 'Colour'];

const boardTask = {
  id: 'board-frames',
  label: 'Draw storyboard frames',
  kind: 'list',
  provider: 'gemini',
  chips: BOARD_CHIPS,
  modelLabel: () => (AI && AI.imageModelLabel ? AI.imageModelLabel('gemini') : 'image model'),
  blocked() {
    const g = DriveImg ? DriveImg.currentBoardGate() : { ok: false, text: 'The Drive tools did not load.' };
    return g.ok ? null : g;
  },
  unblock() { return DriveImg.reconnectDrive(); },
  identity(ctx) {
    const c = resolve(ctx);
    return 'board:' + [].concat(c.shotIds || []).map(String).sort().join(',');
  },
  input(ctx) {
    const c = resolve(ctx);
    const plan = boardJobsFor(c);
    if (!plan.jobs.length) return 'Every shot already has a drawn frame. Add a shot, or delete a drawn frame to draw it again.';
    return BoardM.boardInput(plan, c.style);
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const gate = DriveImg.currentBoardGate();
    if (!gate.ok) fail(gate.text);
    const c = resolve(ctx);
    const parsed = BoardM.parseBoardInput(input);
    const byLabel = new Map(boardJobsFor(c, Infinity).jobs.map((j) => [j.label, j]));
    const jobs = parsed.labels.map((l) => byLabel.get(l)).filter(Boolean).slice(0, BoardM.MAX_FRAMES);
    if (!jobs.length) fail('No shot lines are left to draw. Each line starts with a shot label such as 4.12A, then a "|".');
    const { style, notes } = BoardM.styleFromRefine(refine && refine.instructions, parsed.style);
    const items = [];
    const missed = [];
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (signal && signal.aborted) throw new AI.AIError('Stopped. Nothing was changed.', 'aborted');
      if (onStatus) onStatus('Drawing frame ' + (i + 1) + ' of ' + jobs.length + ' — shot ' + job.label + '…');
      try {
        const { blob } = await AI.generateImage({ prompt: BoardM.framePrompt(job, style, notes), aspectRatio: '16:9', signal });
        items.push({
          id: job.shotId, shotId: job.shotId, label: job.label, blob,
          image: URL.createObjectURL(blob),
          alt: 'Shot ' + job.label + ', ' + BoardM.styleOf(style).label.toLowerCase(),
          text: 'Shot ' + job.label + ' · ' + BoardM.styleOf(style).label,
          detail: BoardM.jobLine(job).split(' | ').slice(1).join(' · ')
        });
      } catch (e) {
        // A wrong key, a stop, a dead network or a rate limit ends the run;
        // a single refused or empty picture does not.
        if (!e || ['auth', 'nokey', 'aborted', 'network', 'rate'].includes(e.kind)) throw e;
        missed.push(job.label + ' (' + String(e.message || 'no picture').slice(0, 80) + ')');
      }
    }
    if (!items.length) fail(missed.length ? 'No picture came back: ' + missed.join('; ') : 'No picture came back.');
    return {
      items,
      note: 'Nothing is saved until you accept. Accepted frames are uploaded to your own Google Drive; '
        + 'this browser, the shot list and your backup files keep only a link to each picture, never the picture.'
        + (missed.length ? ' Not drawn: ' + missed.join('; ') + '.' : '')
    };
  },
  async apply(selected, ctx) {
    const c = resolve(ctx);
    const picked = (selected || []).filter((it) => it && it.shotId && it.blob);
    if (!picked.length) return null;
    // Accept is a click, so this is the one place a lapsed token may be re-asked for.
    if (!DriveM.hasToken()) await DriveM.getToken({ interactive: true });
    const frames = [];
    const files = [];
    try {
      for (const it of picked) {
        const name = BoardM.frameFileName({ label: it.label }, it.blob.type);
        const meta = await DriveM.createFile(name, it.blob, it.blob.type || 'image/png',
          { description: 'Storyboard frame for shot ' + it.label + ' (the shot list links to this file).' });
        if (!meta || !meta.id) throw new Error('Drive did not return a file id.');
        files.push(meta.id);
        frames.push(ShotsM.addFrame(it.shotId, { ref: DriveM.driveRef(meta.id), caption: '' }).id);
      }
    } catch (e) {
      // All or nothing: one Accept is one write.
      const ids = new Set(frames);
      if (ids.size) ShotsM.saveFrames(ShotsM.listFrames().filter((f) => !ids.has(f.id)));
      files.forEach((id) => DriveM.deleteFileQuiet(id).catch(() => {}));
      throw new Error('Drive did not take the pictures (' + String((e && e.message) || 'unknown error').slice(0, 120)
        + '). Nothing was saved; the drawings are still here to accept again.');
    }
    call(c.after, frames);
    return () => {
      const ids = new Set(frames);
      ShotsM.saveFrames(ShotsM.listFrames().filter((f) => !ids.has(f.id)));
      files.forEach((id) => DriveM.deleteFileQuiet(id).catch(() => {}));
      call(c.after, []);
    };
  }
};

/* ============================================================
   TENSION NOTES — read. ctx { elements?, getDoc?, title? }
   ------------------------------------------------------------
   The Script analysis tab's AI action. The model is sent the RULES'
   read of the script (script-analysis-model.js analyseScript: per
   scene its number, heading, length, estimated tension and speakers;
   per character where they enter and leave), not the pages, and asked
   for notes on where tension builds, sags and releases and on the main
   arcs. A note that names a scene not in the script is dropped and
   counted. Writes nothing.
   ============================================================ */
function tensionRead(c) {
  const els = scriptElements(c);
  let format = 'feature';
  try { const p = Store.currentProject && Store.currentProject(); if (p && p.format === 'short') format = 'short'; } catch (e) { /* default */ }
  let story = null;
  try { story = StoryM.loadStory(); } catch (e) { story = null; }
  return { els, a: SA.analyseScript({ elements: els, scenes: ScenesM.listScenes(), story, format }) };
}

const tensionTask = {
  id: 'tension-notes',
  label: 'Notes on tension and arcs',
  kind: 'read',
  editable: false,
  identity(ctx) { try { return 'tension-notes:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'tension-notes'; } },
  input(ctx) {
    const c = resolve(ctx);
    const { a } = tensionRead(c);
    if (!a.scenes.length) return 'This script has no scene headings yet, so there is nothing to read.';
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    return 'The rules’ read of the script — not its pages — in one request:\n\n' + SA.buildTensionNotesPrompt(a, { title });
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const { a } = tensionRead(c);
    if (!a.scenes.length) fail('This script has no scene headings yet, so there is nothing to read.');
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const { parsed, model } = await AI.callModelForTask({
      system: 'You are a script reader. You comment on how tension and the main characters’ arcs move across a screenplay, from a measured outline of it. You name scenes by the numbers given and do not invent plot.',
      user: SA.buildTensionNotesPrompt(a, { title, refine: refineText(refine) }),
      schema: SA.tensionNotesSchema(),
      maxTokens: 6000,
      effort: 'medium',
      onStatus, signal,
      progress: (sofar) => 'Reading the tension curve — ' + (sofar.match(/"note"/g) || []).length + ' notes so far'
    });
    const res = SA.readTensionNotes(parsed, a);
    if (!res.notes.length && !res.summary) fail('The reply held no usable notes, so nothing is shown.');
    return { text: SA.tensionNotesText(res) + (model ? '\n\nRead by ' + model + '.' : '') };
  }
};

/* ============================================================
   AUDIENCE TEST — list. ctx { getDoc, save, elements?, title?,
                               panel?, format?, getStory?, after?, progress? }
   ------------------------------------------------------------
   docs/AUDIENCE-TEST-PLAN.md. A simulated panel reads the script in
   coverage's parts (AI.runAudienceTest), checkpointed and resumable
   exactly as coverage is: each part's checkpoint is stored as it
   lands (audience-store.js, inside the script blob), which is the one
   write a Skip does not undo, on purpose — it is what stops a stopped
   run billing twice. The items are the viewers' verdicts and the
   panel-wide rows; Accept keeps ONE document whose prose holds the
   ticked rows and whose curves are whole. Undo is exact.

   THE PANEL is ctx.panel when the caller passes one (checked with
   normalisePanel, and refused in its own sentence when it is too
   small), else the panel of this draft's unfinished run — so Resume
   screens to the same viewers — else the default panel derived from
   the project's format and the story's genre and audience. Custom
   viewers are never saved on their own (plan §3): they live in the
   ctx and, if a run is kept, in its document.

   A REFINE re-runs only the verdicts: every part is already in the
   last checkpoint, so runAudienceTest() skips straight to them, and
   the follow-up rides in the verdict request as `refine`. A follow-up
   that names one viewer is answered in that viewer's voice
   (audience-model viewerRefine) — the same request and schema; for a
   question that wants an answer rather than a re-run, 'audience-ask'
   below asks one viewer in one small request.
   ============================================================ */
function audienceFormat(c) {
  const f = formatOf(c);
  if (f === 'short' || f === 'feature') return f;
  try { const p = Store.currentProject && Store.currentProject(); if (p && p.format === 'short') return 'short'; } catch (e) { /* default */ }
  return 'feature';
}

/** The panel for this ctx and draft: { panel, problem, resumed }. */
function audiencePanel(c, sig) {
  if (Array.isArray(c.panel)) return { ...AudM.normalisePanel(c.panel), resumed: false };
  const store = AudS.audienceStore(() => call(c.getDoc), () => call(c.save));
  const part = store.partialFor(sig);
  const cp = part && part.audience.checkpoint;
  if (cp && Array.isArray(cp.panel)) {
    const n = AudM.normalisePanel(cp.panel);
    if (!n.problem) return { ...n, resumed: true };
  }
  let s = null;
  try { s = storyOf(c) || {}; } catch (e) { s = {}; }
  return { panel: AudM.defaultPanel({ format: audienceFormat(c), genre: s.genre || '', audience: s.audience || '' }), problem: '', resumed: false };
}

const audienceTask = {
  id: 'audience-test',
  label: 'Audience test',
  kind: 'list',
  editable: false,
  identity(ctx) { try { return 'audience:' + AI.scriptSignature(scriptElements(resolve(ctx))); } catch (e) { return 'audience'; } },
  input(ctx) {
    const c = resolve(ctx);
    const els = scriptElements(c);
    const sig = AI.scriptSignature(els);
    const { panel, problem, resumed } = audiencePanel(c, sig);
    if (problem) return problem;
    const plan = AI.planAudienceTest(els, panel.length);
    if (!plan.batches.length) return 'This script has no scene headings yet, so there is nothing to screen.';
    const store = AudS.audienceStore(() => call(c.getDoc), () => call(c.save));
    const part = store.partialFor(sig);
    const cp0 = part && part.audience.checkpoint;
    const cp = cp0 && cp0.batchCount === plan.batches.length && cp0.panelSig === AI.panelSignature(panel) ? cp0 : null;
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const first = AI.buildAudiencePartPrompt({
      panel, scenes: plan.batches[0].map((i) => plan.scenes[i]), part: 1, parts: plan.batches.length,
      title, context: BP.blueprintContext()
    });
    const who = panel.map((p) => '· ' + p.label + ' — ' + p.who).join('\n');
    const tokens = plan.cost.tokensIn + plan.cost.tokensOut;
    return 'The panel — ' + plural(panel.length, 'simulated viewer', 'simulated viewers')
      + (resumed ? ', the same panel as the unfinished run' : '') + ':\n' + who
      + '\n\nThe whole screenplay — ' + plural(plan.scenes.length, 'scene', 'scenes') + ' — in '
      + plural(plan.batches.length, 'part', 'parts') + ', then one request for the panel’s verdict. About '
      + plural(cp ? plan.batches.length - cp.parts.length + 1 : plan.cost.requests, 'request', 'requests')
      + (cp ? ' (' + cp.parts.length + ' of ' + plan.batches.length + ' parts are already screened and are not sent again)' : '')
      + ', roughly ' + tokens.toLocaleString('en-IN') + ' tokens.'
      + '\n\n' + AudM.SIMULATED_LINE + '\n\nThe first part sends:\n\n'
      + (first.length > 6000 ? first.slice(0, 6000) + '\n…' : first);
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c).map((e) => ({ ...e }));
    const sig = AI.scriptSignature(els);
    const { panel, problem } = audiencePanel(c, sig);
    if (problem) fail(problem);
    const panelSig = AI.panelSignature(panel);
    const store = AudS.audienceStore(() => call(c.getDoc), () => call(c.save));
    const mem = last.get('audience-test');
    const fits = (cp) => cp && cp.sig === sig && cp.panelSig === panelSig;
    let prior = null;
    if (refine && mem && fits(mem.checkpoint)) prior = mem.checkpoint;
    else {
      const part = store.partialFor(sig);
      prior = part && fits(part.audience.checkpoint) ? part.audience.checkpoint : null;
      if (!prior && mem && fits(mem.checkpoint)) prior = mem.checkpoint;
    }
    let checkpoint = prior;
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const res = await AI.runAudienceTest({
      elements: els, panel, title, prior,
      context: withRefineContext(BP.blueprintContext(), refine),
      /* A follow-up addressed to one viewer ("festival programmer, why
         did you stay?") is answered in that viewer's voice: one more
         line on the same verdict request, same schema (viewerRefine). */
      refine: [refineText(refine), refine ? AudM.viewerRefine(refine.instructions, panel) : ''].filter(Boolean).join('\n\n')
    }, {
      signal, onStatus,
      onCheckpoint: (cp) => { checkpoint = cp; store.storeCheckpoint(cp); call(c.progress); }
    });
    return remember('audience-test', { items: AudM.resultItems(res), note: AudM.resultNote(res)
      + '\nRead ' + plural(res.scenes, 'scene', 'scenes') + ' in ' + plural(res.requests, 'request', 'requests') + '.' },
    { sig, checkpoint, res });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('audience-test', result);
    if (!mem || !mem.res) fail('There is no audience test to keep. Run it first.');
    const keep = new Set((selected || []).map((it) => it.id));
    const store = AudS.audienceStore(() => call(c.getDoc), () => call(c.save));
    const out = store.storeResult(JSON.parse(JSON.stringify(mem.res)), keep);
    if (!out) fail('The script could not be reached, so nothing was saved.');
    call(c.after, out.doc);
    return () => { out.undo(); call(c.after, null); };
  }
};

/* ============================================================
   AUDIENCE TEST — STORY (quick mode) — read.
   ctx { getStory?, format?, panel?, title? }
   ------------------------------------------------------------
   docs/AUDIENCE-TEST-PLAN.md §1 and §4, phase 4. The same panel reads
   the Story page's synopsis and beat sheet in ONE request
   (AI.runAudienceQuick), scored per beat, so the story can be tested
   before a page of screenplay exists.

   A READ, ON PURPOSE. There may be no script yet, so there is no
   script blob to keep a document in, and the story record has no
   field for it — keeping one would need a new field in fms_story_v1
   (a contract with saved work) for something the writer can re-run
   for one request. So it writes nothing: the answer is resultText()
   prose and the note, and the last run is remembered for this visit
   only, which is what 'audience-ask' reads when there is no kept
   screenplay run.

   THE BEATS are the framework's beats in order, numbered by their
   place in it: each one's written steps (an unplaced step joins the
   beat it is nearest to), else the passages tagged to it. With no
   beat sheet the synopsis is read in passages. Neither → a sentence.
   ============================================================ */
function storyBeats(s) {
  const o = StoryM.outlineByBeat(s);
  const near = new Map();
  for (const u of o.unplaced) {
    if (!u.suggest) continue;
    if (!near.has(u.suggest.id)) near.set(u.suggest.id, []);
    near.get(u.suggest.id).push(u);
  }
  let marks = [];
  try { marks = StoryM.matrix(s, o.fw.id); } catch (e) { marks = []; }
  return o.beats.map((r, i) => {
    const steps = r.steps.concat(near.get(r.beat.id) || []).map((x) => String(x.text || '').trim()).filter(Boolean);
    const tagged = steps.length ? [] : ((marks[i] && marks[i].marks) || []).map((m) => String(m.text || '').trim()).filter(Boolean);
    return { n: String(i + 1), label: r.beat.label || r.beat.id, text: steps.concat(tagged).join(' ') };
  });
}

function quickJob(c) {
  let s = null;
  try { s = storyOf(c) || {}; } catch (e) { s = {}; }
  const beats = s && Array.isArray(s.outline) ? storyBeats(s) : [];
  const synopsis = String((s && s.source) || '');
  const { units, unit } = AudM.quickUnits({ beats, synopsis });
  const fmt = audienceFormat(c);
  const pn = Array.isArray(c.panel)
    ? AudM.normalisePanel(c.panel)
    : { panel: AudM.defaultPanel({ format: fmt, genre: s.genre || '', audience: s.audience || '' }), problem: '' };
  let title = c.title;
  if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
  return { beats, synopsis, units, unit, panel: pn.panel, problem: pn.problem, title };
}

/** The read the Desk shows: the prose, then whatever of the note the
    prose does not already say (the simulated line is in both). */
function quickText(res) {
  const text = AudM.resultText(res);
  const extra = AudM.resultNote(res).split('\n').filter((l) => l && !text.includes(l));
  return text + (extra.length ? '\n\n' + extra.join('\n') : '')
    + '\n\nNothing was saved. Run it again after you change the story.';
}

const audienceQuickTask = {
  id: 'audience-quick',
  label: 'Audience test — story',
  kind: 'read',
  editable: false,
  identity(ctx) {
    try { return 'audience-quick:' + AI.storySignature(quickJob(resolve(ctx)).units); } catch (e) { return 'audience-quick'; }
  },
  input(ctx) {
    const c = resolve(ctx);
    const job = quickJob(c);
    if (!job.units.length) return AudM.QUICK_EMPTY;
    if (job.problem) return job.problem;
    const who = job.panel.map((p) => '· ' + p.label + ' — ' + p.who).join('\n');
    const prompt = AI.buildAudienceQuickPrompt({ ...job, context: BP.blueprintContext() });
    const tokens = Math.ceil((prompt.length + AudM.QUICK_SYSTEM.length) / 4)
      + Math.ceil(AudM.partMaxTokens(job.panel.length, job.units.length) / 2);
    const what = job.unit === 'Beat'
      ? 'The synopsis and the beat sheet — ' + plural(job.units.length, 'beat', 'beats') + ' with something written under them'
      : 'The synopsis, in ' + plural(job.units.length, 'passage', 'passages') + ' (there is no beat sheet yet)';
    return 'The panel — ' + plural(job.panel.length, 'simulated viewer', 'simulated viewers') + ':\n' + who
      + '\n\n' + what + ', in one request. Roughly ' + tokens.toLocaleString('en-IN') + ' tokens.'
      + '\n\n' + AudM.SIMULATED_LINE + '\n\nWhat is sent:\n\n'
      + (prompt.length > 6000 ? prompt.slice(0, 6000) + '\n…' : prompt);
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const job = quickJob(c);
    if (!job.units.length) fail(AudM.QUICK_EMPTY);
    if (job.problem) fail(job.problem);
    const extra = refine ? AudM.viewerRefine(refine.instructions, job.panel) : '';
    const res = await AI.runAudienceQuick({
      panel: job.panel, beats: job.beats, synopsis: job.synopsis, title: job.title,
      context: withRefineContext(BP.blueprintContext(), refine),
      refine: [refineText(refine), extra].filter(Boolean).join('\n\n')
    }, { onStatus, signal });
    return remember('audience-quick', { text: quickText(res) }, { res });
  }
};

/* ============================================================
   ASK A VIEWER — read. ctx { viewer?, question?, result?, getDoc?,
                              title? }
   ------------------------------------------------------------
   Plan §10 item 4. One question to one simulated viewer of a run
   already made, in ONE request (AI.askAudienceViewer) that carries
   that viewer's record — their curve, moments, walkout and verdict —
   and not the pages. Writes nothing.

   WHICH RUN: ctx.result when the caller hands one over, else the
   newest of the kept screenplay run (audience-store latest(), from
   ctx.getDoc or the stored script) and the runs made in this visit
   (the full test and the story test, from their remembered results).

   THE QUESTION is ctx.question, typed into the box under the first
   line, and the box is editable, so a pill needs no form of its own.
   The viewer is ctx.viewer, unless the question names another one
   (by id or label). A chat refinement is a further question to the
   same viewer, through the same refine block every task uses.
   ============================================================ */
const ASK_HEAD = 'Your question to ';
const ASK_RULE = '\n---\n';

function askSource(c) {
  if (c.result && Array.isArray(c.result.panel) && Array.isArray(c.result.order)) return c.result;
  const cands = [];
  try {
    const doc = typeof c.getDoc === 'function' ? c.getDoc() : ScriptM.loadScript();
    const kept = AudS.audienceStore(() => doc, () => {}).latest();
    if (kept) cands.push(kept.audience);
  } catch (e) { /* no script */ }
  for (const id of ['audience-test', 'audience-quick']) {
    const m = last.get(id);
    if (m && m.res) cands.push(m.res);
  }
  let best = null;
  for (const r of cands) if (!best || String(r.at || '') > String(best.at || '')) best = r;
  return best;
}

function askViewer(c, res, question) {
  if (!res) return null;
  return AudM.viewerNamed(question, res.panel) || res.panel.find((p) => p.id === c.viewer) || null;
}

/* What the writer typed: the box's text above the rule, minus the
   first line when it is still the heading the Desk put there. */
function askQuestion(input, c) {
  let t = String(input ?? '');
  const cut = t.indexOf(ASK_RULE);
  if (cut >= 0) t = t.slice(0, cut);
  const lines = t.split('\n');
  if (lines[0].startsWith(ASK_HEAD)) lines.shift();
  const q = lines.join('\n').trim();
  return q || String(c.question || '').trim();
}

const audienceAskTask = {
  id: 'audience-ask',
  label: 'Ask a viewer',
  kind: 'read',
  chips: ['Why did you feel that?', 'What would have kept you watching?', 'Which moment stayed with you?'],
  identity(ctx) {
    const c = resolve(ctx);
    try { const r = askSource(c); return 'audience-ask:' + (r ? r.sig + '@' + r.at : '') + ':' + (c.viewer || ''); } catch (e) { return 'audience-ask'; }
  },
  input(ctx) {
    const c = resolve(ctx);
    const res = askSource(c);
    if (!res) return 'There is no audience test to ask about yet. Run one on Script analysis, or on the Story page, first.';
    const q = String(c.question || '').trim();
    const p = askViewer(c, res, q);
    const who = p ? p.label : 'one of the viewers (name them in the question)';
    const L = [ASK_HEAD + who + ' — type it below. Name another viewer to ask them instead.', q, ASK_RULE.trim()];
    L.push('The panel: ' + res.panel.map((x) => x.label).join(', ') + '.');
    L.push('Sent with your question: ' + (p ? p.label + '’s' : 'that viewer’s') + ' own scores, moments and verdict from the run'
      + (res.at ? ' of ' + String(res.at).slice(0, 10) : '') + ' — not your pages. One request.');
    L.push('', AudM.SIMULATED_LINE);
    return L.join('\n');
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const res = askSource(c);
    if (!res) fail('There is no audience test to ask about yet. Run one first.');
    /* A chat follow-up with the box left empty is itself the question. */
    const asks = refine && Array.isArray(refine.instructions) ? refine.instructions.filter((x) => String(x || '').trim()) : [];
    const question = askQuestion(input, c) || String(asks[asks.length - 1] || '').trim();
    if (!question) fail('Type the question you want to ask first.');
    const p = askViewer(c, res, question);
    let title = c.title;
    if (!title) { try { title = ScriptM.projectTitle(); } catch (e) { title = ''; } }
    const out = await AI.askAudienceViewer({
      result: res, viewer: p ? p.id : '', question, title, refine: refineText(refine), headings: res.headings
    }, { onStatus, signal });
    return { text: AudM.askText(out, { res, viewer: out.viewer, question, model: out.model }) };
  }
};

/* ============================================================
   AI BLOCKING — two list tasks over the overhead blocking map
   ------------------------------------------------------------
   'blocking-draft'    ctx { sceneId, prompt?, after?(blockId|null), say? }
   'blocking-enhance'  ctx { sceneId, blockId, prompt?, after?(blockId|null), say? }
                       blockId is the diagram SHOWN: the floor plan or one
                       shot's diagram (a shot's carries the floor as
                       read-only context, and may not touch the set).

   ONE FLOOR, ONE DIAGRAM PER SHOT (1 Nov 2026). The draft used to come
   back as one setup holding every shot's camera — six shots, six cameras
   on one map, which is not a diagram anybody tapes out. It now comes back
   as the scene's floor (set, 180° line, width, where people start) and a
   diagram per shot, each naming one of the shot ids the job sent.

   The job is the scene as the model needs it to stage it: number,
   heading, synopsis, the script text matched by matchScenes() (the
   same join the shot draft uses), the characters in it WITH their
   Characters record ids (so an actor mark can carry `charId`), the
   scene's shots with lens, size and setup (a camera has to be where a
   listed shot can be taken from), and a line per setup already drawn.

   EDITABLE, because the disclosure under the box says "the text above
   is sent": the box holds the whole prompt, ending in a "What the
   director asked for" section to type into; what is in the box is what
   goes (blocking-ai-model.js `job.user`). The chat refines it against
   the same schema.

   WRITES go through shots.js only, ONE write per Accept:
     draft    blocking-ai-model.js planDraftApply() decides (pure, Node-
              tested): the floor gains only what it lacks, a shot already
              drawn by a person is SKIPPED and said so, shot.cam is filled
              only where blank; shots.js writeBlocking() writes it all at
              once; Undo is undoBlocking(), which reverts only rows still
              exactly as written.
     enhance  the ticked ops applied to a copy of the CURRENT block
              (applyBlockOps — an op naming a mark deleted since the run
              is skipped), written with replaceBlock; Undo writes back
              the snapshot taken just before.
   Pro-locked like every AI tool: the pill asks PlanGate.aiUnlocked(),
   which reads the `ai_tools` feature and fails closed.
   ============================================================ */
function sceneById(id) {
  const all = ScenesM.listScenes();
  return { all, scene: all.find((s) => String(s.id) === String(id || '')) || null };
}

/** Characters in a scene: the breakdown's cast plus every speaker the
    scene's script cues, each joined to a Characters record when one
    claims the name. Only a record's id is ever offered as a charId. */
function sceneCharacters(scene, slice) {
  const list = CharM.loadCharacters();
  const names = [].concat((scene.elements && scene.elements.cast) || []);
  for (const el of (slice && slice.elements) || []) if (el && el.type === 'character') names.push(el.text);
  const out = [];
  const seen = new Set();
  for (const raw of names) {
    const n = CharM.normName(raw);
    if (!n) continue;
    const rec = CharM.ownerOf(list, n);
    const key = rec ? 'id:' + rec.id : 'n:' + n;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: rec ? rec.id : '', name: rec ? rec.name : n });
  }
  return out.slice(0, 30);
}

function setupLine(b) {
  const count = (k) => (b.marks || []).filter((m) => m.kind === k).length;
  const cams = (b.marks || []).filter((m) => m.kind === 'camera').map((m) => m.label).filter(Boolean);
  return (b.shotId ? 'diagram of shot id ' + b.shotId + ' “' + (b.name || 'Shot') + '”' : 'floor “' + (b.name || 'Setup') + '”') + ': '
    + plural(count('actor'), 'actor', 'actors') + ', '
    + plural(count('camera'), 'camera', 'cameras') + (cams.length ? ' (' + cams.join(', ') + ')' : '')
    + (Array.isArray(b.set) && b.set.length ? ', ' + plural(b.set.length, 'set piece', 'set pieces') : '');
}

const findBlock = (id) => (typeof ShotsM.getBlock === 'function'
  ? ShotsM.getBlock(id) : ShotsM.listBlocks().find((b) => b.id === id)) || null;

function blockingJob(c, { withBlock = false } = {}) {
  const { all, scene } = sceneById(c.sceneId);
  if (!scene) fail('Pick a scene to block first.');
  const script = ScriptM.loadScript();
  const pair = Analysis.matchScenes(all, script.elements).pairs.find((p) => p.scene.id === scene.id);
  const slice = pair ? pair.slice : null;
  const cams = ShotsM.sceneCameras(scene.id);
  const shots = ShotsM.listShots().filter((s) => s.sceneId === scene.id).map((s) => ({
    id: s.id, number: s.number, size: s.size, angle: s.angle, movement: s.movement, lens: s.lens,
    setup: ShotsM.setupOf(s, cams), description: s.description
  }));
  const blocks = ShotsM.blocksOfScene(scene.id);
  const job = {
    sceneId: scene.id, number: scene.number, slug: slugOf(scene), synopsis: scene.synopsis,
    script: slice ? AI.sceneScriptText(slice) : '',
    characters: sceneCharacters(scene, slice), shots,
    setups: blocks.filter((b) => !withBlock || b.id !== c.blockId).map(setupLine),
    prompt: String(c.prompt || '')
  };
  if (withBlock) {
    const block = findBlock(c.blockId);
    if (!block || block.sceneId !== scene.id) fail('That setup is no longer on this scene. Pick one to review.');
    job.block = block;
    /* A shot's diagram is reviewed over its floor: the model sees the set
       and the line, and is told they are not its to change. */
    if (block.shotId) {
      const floor = ShotsM.floorOf(scene.id, blocks);
      if (floor) job.floor = floor;
    }
  }
  return job;
}

/** The box: the built prompt, always ending in the section to type into
    (the same heading blocking-ai-model.js prints for ctx.prompt). */
function blockingInput(job, build) {
  return build({ ...job, prompt: '' }) + '\n\nWhat the director asked for:\n' + (job.prompt || '');
}

const charNamer = (job) => { const m = new Map(job.characters.map((x) => [x.id, x.name])); return (id) => m.get(id) || ''; };

const blockingDraftTask = {
  id: 'blocking-draft',
  label: 'Block the scene',
  kind: 'list',
  editable: true,      // the input IS the prompt that is sent
  identity(ctx) { return 'scene:' + String(resolve(ctx).sceneId || ''); },
  input(ctx) {
    try { return blockingInput(blockingJob(resolve(ctx)), BlockAI.buildDraftPrompt); }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const job = blockingJob(resolve(ctx));
    const user = String(input ?? '').trim() ? String(input) : '';
    const res = await AI.draftBlocking({ ...job, user }, { onStatus, signal, refine: refineText(refine) });
    const byId = new Map(job.shots.map((s) => [s.id, s]));
    const shotLabel = (id) => { const s = byId.get(id); return s ? '#' + (s.number || '?') + (s.size ? ' ' + s.size : '') + (s.lens ? ' ' + s.lens : '') : ''; };
    const items = BlockAI.draftItems(res, { charName: charNamer(job), shotLabel });
    if (!items.length) fail('The model came back with nothing to place. Nothing was added.');
    const f = res.floor || {};
    const note = [
      'Floor “' + (f.name || 'Untitled') + '”' + (f.widthM ? ', ' + f.widthM + ' m wide' : '') + (f.note ? ': ' + f.note : '.'),
      plural(res.shots.length, 'shot diagram', 'shot diagrams') + ', one camera each.',
      res.dropped ? plural(res.dropped, 'piece was', 'pieces were') + ' not usable and left out.' : '',
      res.truncated ? 'The reply was cut short, so some pieces may be missing.' : ''
    ].filter(Boolean).join(' ');
    return remember('blocking-draft', { items, note }, { sceneId: job.sceneId, draft: res });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('blocking-draft', result);
    if (!mem) fail('There is no blocking to keep. Run it first.');
    if (typeof ShotsM.writeBlocking !== 'function') fail('This build cannot write a setup yet. Nothing was changed.');
    const pick = BlockAI.pickDraft(mem.draft, selected);
    if (!pick.floor && !pick.shots.length) return null;
    const blocks = ShotsM.listBlocks();
    const shots = ShotsM.listShots();
    const plan = BlockAI.planDraftApply(pick, {
      sceneId: mem.sceneId,
      floor: ShotsM.floorOf(mem.sceneId, blocks),
      blockOfShot: (id) => ShotsM.blockOfShot(id, blocks),
      shotOf: (id) => shots.find((s) => s.id === id && s.sceneId === mem.sceneId) || null,
      floorName: 'Floor plan',
      make: { block: ShotsM.blankBlock, mark: ShotsM.blankMark, piece: ShotsM.blankSetPiece }
    });
    const skipped = plan.skipped.length
      ? plural(plan.skipped.length, 'shot already has', 'shots already have') + ' a diagram you drew, so ' + (plan.skipped.length === 1 ? 'it was' : 'they were') + ' left as ' + (plan.skipped.length === 1 ? 'it is.' : 'they are.')
      : '';
    if (!plan.blocks.length) {
      call(c.say, ['Nothing was added.', skipped || 'The floor plan already has all of it.'].join(' '));
      return null;
    }
    const snap = ShotsM.writeBlocking({ blocks: plan.blocks, cams: plan.cams });
    call(c.say, [
      plan.floorAdded ? 'Floor plan: ' + plural(plan.floorAdded, 'thing', 'things') + ' added.' : '',
      plan.shotsMade ? plural(plan.shotsMade, 'shot diagram', 'shot diagrams') + ' added.' : '',
      snap.cams.length ? plural(snap.cams.length, 'shot is', 'shots are') + ' now linked to its camera.' : '',
      skipped
    ].filter(Boolean).join(' '));
    const firstShot = plan.blocks.find((b) => b.shotId);
    call(c.after, firstShot ? firstShot.id : plan.blocks[0].id);
    /* Undo takes away only what this wrote, and only while it is still
       exactly as written (shots.js undoBlocking): a diagram edited since,
       or a shot whose camera was re-picked, stays as the person left it. */
    return () => {
      const { reverted, kept } = ShotsM.undoBlocking(snap);
      if (kept) call(c.say, plural(kept, 'diagram has', 'diagrams have') + ' changed since and ' + (kept === 1 ? 'was' : 'were') + ' left as ' + (kept === 1 ? 'it is.' : 'they are.'));
      else if (!reverted) call(c.say, 'Nothing to undo: it has all changed since.');
      call(c.after, null);
    };
  }
};

const blockingEnhanceTask = {
  id: 'blocking-enhance',
  label: 'Improve this setup',
  kind: 'list',
  editable: true,      // the input IS the prompt that is sent
  identity(ctx) { return 'block:' + String(resolve(ctx).blockId || ''); },
  input(ctx) {
    try { return blockingInput(blockingJob(resolve(ctx), { withBlock: true }), BlockAI.buildEnhancePrompt); }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await ready();
    const job = blockingJob(resolve(ctx), { withBlock: true });
    const user = String(input ?? '').trim() ? String(input) : '';
    const res = await AI.enhanceBlocking({ ...job, user }, { onStatus, signal, refine: refineText(refine) });
    const note = [
      res.items.length ? res.note : (res.note || 'No changes suggested: the model found nothing to fix in this setup.'),
      res.dropped ? plural(res.dropped, 'suggestion was', 'suggestions were') + ' not usable and left out.' : '',
      res.truncated ? 'The reply was cut short, so some suggestions may be missing.' : ''
    ].filter(Boolean).join(' ');
    return remember('blocking-enhance', { items: res.items, note }, { blockId: job.block.id });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('blocking-enhance', result);
    if (!mem) fail('There are no suggestions to keep. Run it first.');
    if (typeof ShotsM.replaceBlock !== 'function') fail('This build cannot write a setup yet. Nothing was changed.');
    const current = findBlock(mem.blockId);
    if (!current) fail('That setup has been deleted. Nothing was changed.');
    const snapshot = JSON.parse(JSON.stringify(current));
    const ops = (selected || []).map((it) => it && it.op).filter(Boolean);
    const makers = { makeMark: (p) => ShotsM.blankMark(p) };
    if (typeof ShotsM.blankSetPiece === 'function') makers.makePiece = (p) => ShotsM.blankSetPiece(p);
    const { block, applied } = BlockAI.applyBlockOps(current, ops, makers);
    if (!applied) return null;
    call(c.before, mem.blockId);
    const wrote = JSON.parse(JSON.stringify(ShotsM.replaceBlock(block) || block));
    call(c.say, plural(applied, 'change', 'changes') + ' made to “' + (current.name || 'the setup') + '”.');
    call(c.after, mem.blockId);
    /* Undo reverses only these changes, against the setup as it is NOW:
       an edit made after Accept survives, and a deleted setup is not
       brought back (row 68). */
    return () => {
      const now = findBlock(mem.blockId);
      if (!now) { call(c.say, 'That setup has been deleted since. Nothing to undo.'); return; }
      const { block: back, reverted, kept } = BlockAI.undoBlockOps(snapshot, wrote, now);
      if (reverted) { call(c.before, mem.blockId); ShotsM.replaceBlock(back); }
      if (kept) call(c.say, plural(kept, 'change was', 'changes were') + ' edited since and left as they are.');
      call(c.after, mem.blockId);
    };
  }
};

/* ---- registration ------------------------------------------- */
const ALL_TASKS = [coverageTask, dialogueTask, critiqueTask, storyStepsTask, storyMapTask, shotTask, sceneStoryTask, synopsisTask,
  genScenesTask, genBatchTask, voiceTask, loglineTask, genreTask, sceneNotesTask, tagsTask, boardTask, tensionTask, audienceTask,
  audienceQuickTask, audienceAskTask, blockingDraftTask, blockingEnhanceTask];
let registered = false;

/** Register every task with the Desk (idempotent), and resolve once
    every model the tasks read is loaded — the Desk awaits this before
    it asks a task for its input. `register` defaults to the Desk's own
    registerTask. */
export function registerAll(register) {
  if (typeof register !== 'function') throw new TypeError('[ai-tasks] registerAll needs the Desk\'s registerTask');
  if (!registered) {
    registered = true;
    for (const t of ALL_TASKS) register(t);
  }
  return loadAll();
}

export const TASK_IDS = ALL_TASKS.map((t) => t.id);
export default { registerAll, TASK_IDS };
