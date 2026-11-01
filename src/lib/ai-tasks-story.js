/* ============================================================
   AI TASKS — Story and screenplay: character arcs, script clean-up
   ------------------------------------------------------------
   One lane's Desk tasks (docs/AI-EVERYWHERE.md sections 9 and 10).
   Registered by ai-tasks.js, which spreads TASKS into ALL_TASKS and
   awaits load() before the Desk asks any task for its input (input() is
   called synchronously, so every model it reads must be loaded by then).
   Helpers: ./ai-task-kit.js. Models load lazily inside load(); never
   import ai.js, a page or a ui file at the top of this module. The
   decisions (schemas, prompts, checks, blanks-only merge, word-keep
   check, undo guards) are ./ai-story-model.js's, pure.

     character-arcs   ctx { list?(), save?(now), rerender?(), say? }   story.html (Characters)
     script-cleanup   ctx { getDoc(), getSelection(), setType(id, type),
                            save(), render(focusId?), after?(), say? } screenplay.html

   Every task builds its prompt in ONE function that input() and run()
   share, so what the Desk shows before the first send is what is sent.
   run() only reads and asks. apply() is the only writer.
   ============================================================ */
import { ai, resolve, call, fail, plural, remember, recall, refineText } from './ai-task-kit.js';
import * as M from './ai-story-model.js';

let CharsM = null, StoryM = null, ScenesM = null, ScriptM = null;
let loading = null;

/** Resolve once every model this lane's tasks read has loaded. */
export const load = () => {
  if (!loading) {
    loading = Promise.all([
      import('./characters.js'), import('./story.js'), import('./scenes.js'), import('./script.js')
    ]).then(([ch, st, sc, sp]) => { CharsM = ch; StoryM = st; ScenesM = sc; ScriptM = sp; return true; })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
};

const sentence = (...parts) => parts.filter(Boolean).join(' ');

async function ask(system, user, schema, { onStatus, signal, maxTokens = 4000 } = {}) {
  const { parsed, truncated } = await (await ai()).callModelForTask({
    system, user, schema, maxTokens, effort: 'medium', onStatus, signal
  });
  return { parsed, truncated };
}

/* ============================================================
   9. character-arcs
   ============================================================ */
const charList = (c) => (typeof c.list === 'function' ? c.list() : CharsM.loadCharacters());
const viewsOf = (c) => CharsM.characterViews(charList(c), CharsM.projectFormat());

/** The view a characterId stands for NOW. A blueprint-only protagonist
    ('bp:protagonist') becomes a stored record the first time one of its
    unbacked fields is written; it is found again by its role. */
function viewNow(c, id) {
  const views = viewsOf(c);
  const sid = String(id);
  return views.find((v) => !v.derived && String(v.id) === sid)
    || (sid.startsWith('bp:') ? views.find((v) => !v.derived && !v.virtual && v.role === sid.slice(3)) : null) || null;
}

function arcFacts(c) {
  const fmt = CharsM.projectFormat();
  const story = StoryM.loadStory();
  let steps = [];
  try { steps = StoryM.stepsInOrder(story, StoryM.effectiveFramework(story, fmt)); } catch (e) { steps = []; }
  return M.arcsFacts({ views: viewsOf(c), steps, scenes: ScenesM.listScenes(), slugOf: ScenesM.slug });
}
const ARCS_NONE = 'Every character you have described already has an arc, a start and an end written, or no one is named yet.';

const arcsTask = {
  id: 'character-arcs',
  label: 'Draft arcs',
  kind: 'list',
  editable: false,
  identity() { return 'character-arcs'; },
  input(ctx) {
    try { const f = arcFacts(resolve(ctx)); return f.characters.length ? M.arcsPrompt(f) : ARCS_NONE; }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await load();
    const c = resolve(ctx);
    const f = arcFacts(c);
    if (!f.characters.length) fail(ARCS_NONE + ' Nothing was changed.');
    const { parsed, truncated } = await ask(M.ARCS_SYSTEM, M.arcsPrompt(f, refineText(refine, M.arcsPrevious)), M.arcsSchema(), { onStatus, signal });
    const res = M.readArcs(parsed, f);
    if (!res.items.length) fail('The model came back with no usable arcs. Nothing was changed.');
    const note = sentence(
      'A model’s suggestion for ' + plural(res.items.length, 'character', 'characters') + '; tick the ones you want. '
        + 'Only fields that are empty now are filled: nothing you wrote is replaced.',
      res.dropped ? plural(res.dropped, 'reply was', 'replies were') + ' not usable and left out.' : '',
      truncated ? 'The reply was cut short, so some characters may be missing.' : '');
    return remember('character-arcs', { items: res.items, note }, {});
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const { writes, skipped } = M.planArcWrites(selected, (id) => viewNow(c, id));
    const wrote = [];
    let listTouched = false;
    for (const w of writes) {
      const list = charList(c);
      const view = viewNow(c, w.characterId);
      if (!view || String(view[w.field] || '').trim()) continue;       // filled since the plan: skip
      const r = CharsM.setField(list, view, w.field, w.value);
      if (r.listChanged) listTouched = true;
      const back = viewNow(c, w.characterId);
      if (back && String(back[w.field] || '') === w.value) wrote.push(w);
    }
    if (listTouched) { if (typeof c.save === 'function') c.save(true); else CharsM.saveCharacters(charList(c)); }
    if (!wrote.length) {
      call(c.say, sentence('Nothing was written.', skipped ? plural(skipped, 'field was', 'fields were') + ' already filled.' : ''));
      call(c.rerender);
      return null;
    }
    const left = skipped + (writes.length - wrote.length);
    call(c.say, sentence(plural(wrote.length, 'arc field', 'arc fields') + ' filled.',
      left ? plural(left, 'field was', 'fields were') + ' already filled and left as you wrote it.' : ''));
    call(c.rerender);
    return () => {
      const { blank, kept } = M.planArcUndo(wrote, (id, f) => { const v = viewNow(c, id); return v ? String(v[f] || '') : null; });
      let touched = false;
      for (const b of blank) {
        const v = viewNow(c, b.characterId);
        if (!v) continue;
        const r = CharsM.setField(charList(c), v, b.field, '');
        if (r.listChanged) touched = true;
      }
      if (touched) { if (typeof c.save === 'function') c.save(true); else CharsM.saveCharacters(charList(c)); }
      call(c.say, sentence(plural(blank.length, 'field', 'fields') + ' blanked again.',
        kept ? plural(kept, 'field was', 'fields were') + ' edited since and left as they are.' : ''));
      call(c.rerender);
    };
  }
};

/* ============================================================
   10. script-cleanup
   ============================================================ */
const clone = (x) => JSON.parse(JSON.stringify(x));
const brief = (e) => ({ id: e.id, type: e.type, text: e.text });

/** The selection as the page reports it, and the context around it. */
function cleanupRead(c) {
  const doc = call(c.getDoc);
  const els = doc && Array.isArray(doc.elements) ? doc.elements : [];
  const sel = call(c.getSelection);
  const ids = sel && Array.isArray(sel.ids) ? sel.ids.map(String) : [];
  const block = els.filter((e) => ids.includes(String(e.id)));
  /* The text is rebuilt from the elements, in script order, so what is
     sent and what is replaced are the same lines. */
  const text = block.map((e) => e.text).join('\n');
  const at = block.length ? els.indexOf(block[0]) : -1;
  const above = at > 0 ? els.slice(Math.max(0, at - 2), at) : [];
  const below = at >= 0 ? (els[at + block.length] || null) : null;
  return { els, block, text, above, below, at };
}

function cleanupFactsOf(c) {
  const r = cleanupRead(c);
  return { r, facts: M.cleanupFacts({ ids: r.block.map((e) => e.id), text: r.text }, r.above.map(brief)) };
}
const CLEAN_NONE = 'Select some text in a line, or paste text into the script, and then open this again. It works on the selected or pasted lines only.';
const cleanRefusal = (facts) => (facts.empty ? CLEAN_NONE
  : facts.tooLong ? 'That is more than ' + M.CLEANUP_MAX_CHARS.toLocaleString('en') + ' characters. Select a smaller block (a scene or two) and try again. Nothing was sent.'
    : '');

const cleanupTask = {
  id: 'script-cleanup',
  label: 'Clean up pasted text',
  kind: 'list',
  editable: false,
  identity(ctx) {
    try { return 'cleanup:' + cleanupRead(resolve(ctx)).block.map((e) => e.id).join(','); } catch (e) { return 'cleanup:'; }
  },
  input(ctx) {
    try {
      const { facts } = cleanupFactsOf(resolve(ctx));
      return cleanRefusal(facts) || M.cleanupPrompt(facts);
    } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await load();
    const c = resolve(ctx);
    const { r, facts } = cleanupFactsOf(c);
    const refused = cleanRefusal(facts);
    if (refused) fail(refused);
    const { parsed, truncated } = await ask(M.CLEANUP_SYSTEM, M.cleanupPrompt(facts, refineText(refine, M.cleanupPrevious)),
      M.cleanupSchema(), { onStatus, signal, maxTokens: Math.min(12000, 1200 + Math.ceil(facts.text.length / 2)) });
    const res = M.readCleanup(parsed, facts);
    if (res.rejected) fail(truncated ? 'The reply was cut short, so it could not be checked against your words. Nothing was changed.' : res.rejected);
    const note = sentence(
      'This is formatting, not editing: the model kept your words (checked), and only re-cut the block into '
        + plural(res.items.length, 'line', 'lines') + ' with a type each. Only the selected or pasted lines are replaced. '
        + 'Untick a line to keep its words as plain action.',
      truncated ? 'The reply was cut short.' : '');
    return remember('script-cleanup', { items: res.items, note }, {
      snap: { block: r.block.map(brief), above: r.above.map(brief), below: r.below ? brief(r.below) : null },
      originals: clone(r.block)
    });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('script-cleanup', result);
    if (!mem) fail('There is nothing to apply. Run the clean-up first.');
    if (typeof c.setType !== 'function') fail('This build cannot change a line’s type from here. Nothing was changed.');
    const doc = call(c.getDoc);
    const els = doc && Array.isArray(doc.elements) ? doc.elements : null;
    if (!els) fail('The script is not open. Nothing was changed.');
    const there = M.blockStillThere(els, mem.snap);
    if (there.at < 0) fail(there.why + ' Nothing was changed. Run the clean-up again.');
    const plan = M.cleanupPlan(selected, result && result.items);
    if (!plan.length) return null;
    /* A line that comes back with the same words KEEPS its element, id and
       all: private notes, shared comments and the co-editing merge are keyed
       by element id, so a fresh id would detach them from a line the writer
       never changed. Only genuinely new lines get new elements. */
    const pool = els.slice(there.at, there.at + mem.snap.block.length);
    const added = plan.map((p) => {
      const k = pool.findIndex((e) => e && String(e.text || '').trim() === String(p.text || '').trim());
      if (k < 0) return ScriptM.blankElement({ type: 'action', text: p.text });
      const kept = pool[k]; pool[k] = null;
      return kept;
    });
    els.splice(there.at, mem.snap.block.length, ...added);
    /* Every type change goes through the editor's one path. */
    added.forEach((el, i) => { if (plan[i].type !== el.type) c.setType(el.id, plan[i].type); });
    const wrote = added.map(brief);
    call(c.save);
    call(c.render, added[0].id);
    call(c.after);
    call(c.say, plural(mem.snap.block.length, 'line', 'lines') + ' replaced by ' + plural(added.length, 'line', 'lines') + '.');
    return () => {
      const d = call(c.getDoc);
      const now = d && Array.isArray(d.elements) ? d.elements : null;
      if (!now) return;
      const still = M.addedStillThere(now, wrote);
      if (still.at < 0) { call(c.say, still.why + ' Left as it is.'); return; }
      now.splice(still.at, wrote.length, ...clone(mem.originals));
      call(c.save);
      call(c.render, mem.originals[0] && mem.originals[0].id);
      call(c.after);
      call(c.say, 'The ' + plural(mem.originals.length, 'original line', 'original lines') + ' put back.');
    };
  }
};

export const TASKS = [arcsTask, cleanupTask];
export default { TASKS, load };
