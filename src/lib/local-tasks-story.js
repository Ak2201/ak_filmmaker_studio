/* ============================================================
   LOCAL TASKS — STORY LANE: Desk tasks that need no AI, key or plan
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md Lane C. Registered by local-tasks.js
   (`...RULES_TASKS_STORY`); `local: true` is what tells the Desk to
   show no key step, no Pro gate and no provider line, and to build
   the list the moment it opens.

     script-cleanup-rules  ctx { getDoc(), getSelection(), setType(id, type),
                                 save(), render(focusId?), after?(), say? }
     logline-rules         ctx { getLogline(), getStory?(), names?() }
     voice-check-rules     ctx { character, elements() | getDoc(), after?() }

   The decisions are rules-story.js's (pure). Nothing here is ever
   AI-stamped: no `ai`, no `aiFill`. A clean-up writes through the same
   guards the AI clean-up uses (ai-story-model.js blockStillThere /
   addedStillThere), types change ONLY through ctx.setType, and one
   Undo puts the original lines back while the new ones are still as
   written. The two reads keep nothing, or keep what the writer ticks
   as ONE sticky note (`from: 'rules'`), removed again by Undo while
   it still reads as written. NO STORAGE KEY, no AI import.
   ============================================================ */
let Rules = null, Model = null, ScriptM = null, CharsM = null, StoryM = null, NotesM = null;
let readyP = null;

export function ready() {
  if (!readyP) {
    readyP = Promise.all([
      import('./rules-story.js'), import('./ai-story-model.js'), import('./script.js'),
      import('./characters.js'), import('./story.js'), import('./notes-model.js')
    ]).then(([r, m, sp, ch, st, nm]) => {
      Rules = r; Model = m; ScriptM = sp; CharsM = ch; StoryM = st; NotesM = nm;
      return true;
    }).catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}

const resolve = (ctx) => {
  let c = ctx;
  if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
  return (c && typeof c === 'object') ? c : {};
};
const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const fail = (msg) => { const e = new Error(msg); e.kind = 'nocontent'; throw e; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const clone = (x) => JSON.parse(JSON.stringify(x));
const brief = (e) => ({ id: e.id, type: e.type, text: e.text });
const sentence = (...parts) => parts.filter(Boolean).join(' ');

/* What apply() needs beside the ticked items, pinned to the result it
   belongs to (non-enumerable); memory for this visit only. */
const last = new Map();
function remember(id, result, mem) {
  last.set(id, mem);
  Object.defineProperty(result, 'memo', { value: mem, enumerable: false });
  return result;
}
const recall = (id, result) => (result && result.memo) || last.get(id);

/* ============================================================
   script-cleanup-rules
   ============================================================ */
function cleanupRead(c) {
  const doc = call(c.getDoc);
  const els = doc && Array.isArray(doc.elements) ? doc.elements : [];
  const sel = call(c.getSelection);
  const ids = sel && Array.isArray(sel.ids) ? sel.ids.map(String) : [];
  const block = els.filter((e) => ids.includes(String(e.id)));
  const at = block.length ? els.indexOf(block[0]) : -1;
  const above = at > 0 ? els.slice(Math.max(0, at - 2), at) : [];
  const below = at >= 0 ? (els[at + block.length] || null) : null;
  return { els, block, above, below, at };
}
const CLEAN_NONE = 'Select some text in a line, or paste text into the script, and then open this again. It works on the selected or pasted lines only.';

const cleanupRules = {
  id: 'script-cleanup-rules',
  label: 'Clean up pasted text (no AI)',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The lines you selected or just pasted, read by the script’s own rules: a heading, a name cue, a parenthetical, '
      + 'a line of dialogue, a transition or action, by the way each is written. Your words are kept exactly, in order; '
      + 'only the lines and their types change. Nothing is sent anywhere.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const r = cleanupRead(c);
    if (!r.block.length) fail(CLEAN_NONE);
    const res = Rules.cleanupSplit({ block: r.block.map(brief) });
    if (res.tooLong) fail('That is more than ' + Model.CLEANUP_MAX_CHARS.toLocaleString('en') + ' characters. Select a smaller block (a scene or two) and try again.');
    if (res.rejected) fail(res.rejected);
    if (!res.changed) {
      fail(res.left.length
        ? 'The rules could not cut this block: it is one long run of ' + (r.block.length === 1 ? 'text' : 'lines') + ' with no cue or heading to read. Enhance with AI can try it.'
        : 'These lines already read as they should, so there is nothing to re-cut.');
    }
    const kept = res.items.length - res.changed;
    const note = sentence(
      'This is formatting, not editing: the script’s rules kept your words (checked) and cut the block into '
        + plural(res.items.length, 'line', 'lines') + ' with a type each.'
        + (kept ? ' ' + plural(kept, 'line is', 'lines are') + ' unchanged and keep' + (kept === 1 ? 's' : '') + ' their place and notes.' : ''),
      res.left.length ? plural(res.left.length, 'block was', 'blocks were') + ' left whole for Enhance with AI: nothing in ' + (res.left.length === 1 ? 'it' : 'them') + ' says where a line begins.' : '',
      'Only the selected or pasted lines are replaced. Untick a line to keep its words as plain action.');
    return remember('script-cleanup-rules', { items: res.items, note }, {
      snap: { block: r.block.map(brief), above: r.above.map(brief), below: r.below ? brief(r.below) : null },
      originals: clone(r.block)
    });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('script-cleanup-rules', result);
    if (!mem) fail('There is nothing to apply. Run the clean-up first.');
    if (typeof c.setType !== 'function') fail('This build cannot change a line’s type from here. Nothing was changed.');
    const doc = call(c.getDoc);
    const els = doc && Array.isArray(doc.elements) ? doc.elements : null;
    if (!els) fail('The script is not open. Nothing was changed.');
    const there = Model.blockStillThere(els, mem.snap);
    if (there.at < 0) fail(there.why + ' Nothing was changed. Run the clean-up again.');
    const all = (result && result.items) || [];
    const picked = Model.cleanupPlan(selected, all);
    if (!picked.length) return null;
    /* An unchanged line keeps its element, id and type, ticked or not;
       only genuinely new lines get new elements. */
    const plan = picked.map((p, i) => (all[i].keepId ? { type: all[i].type, text: p.text, keepId: all[i].keepId } : p));
    const pool = new Map(els.slice(there.at, there.at + mem.snap.block.length).map((e) => [e.id, e]));
    const added = plan.map((p) => {
      const kept = p.keepId && pool.get(p.keepId);
      if (kept) { pool.delete(p.keepId); return kept; }
      return ScriptM.blankElement({ type: 'action', text: p.text });
    });
    els.splice(there.at, mem.snap.block.length, ...added);
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
      const still = Model.addedStillThere(now, wrote);
      if (still.at < 0) { call(c.say, still.why + ' Left as it is.'); return; }
      now.splice(still.at, wrote.length, ...clone(mem.originals));
      call(c.save);
      call(c.render, mem.originals[0] && mem.originals[0].id);
      call(c.after);
      call(c.say, 'The ' + plural(mem.originals.length, 'original line', 'original lines') + ' put back.');
    };
  }
};

/* ============================================================
   the two reads: keep what is ticked as ONE sticky note
   ============================================================ */
function keepAsNote(selected, title, task) {
  const lines = (selected || []).map((it) => String((it && it.keep) || (it && it.text) || '').trim()).filter(Boolean);
  if (!lines.length) return null;
  const note = NotesM.makeNote(title + '\n' + lines.join('\n'));
  if (!note) return null;
  note.from = 'rules';   // a field, not a key; never `ai` / `aiFill`
  if (StoryM.listVault().some((x) => x && x.from === 'rules' && x.snippet === note.snippet)) return null;   // already kept, word for word
  const added = StoryM.addNotesToVault([note]);
  if (!added || !added.length) fail('The notes board could not be saved (storage may be full), so nothing was kept.');
  const undo = () => {
    const now = StoryM.listVault().find((x) => x && x.id === note.id);
    if (!now) return;
    if (now.snippet === note.snippet) StoryM.removeManyFromVault([note.id]);   // edited since: it is the writer's now
  };
  undo.said = task + ': kept as 1 sticky note on the notes board.';
  return undo;
}

/* ============================================================
   logline-rules
   ============================================================ */
const storyOf = (c) => { try { return call(c.getStory) || StoryM.loadStory(); } catch (e) { return null; } };

const loglineRules = {
  id: 'logline-rules',
  label: 'Check my logline (no AI)',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The logline in the field, read for length, one sentence, a protagonist, a goal, an obstacle, stakes, '
      + 'how many proper names it holds, “a story about” and a question mark. A checklist of your own words, '
      + 'not a score. Nothing is sent anywhere.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const live = call(c.getLogline);
    const text = String(typeof live === 'string' ? live : (storyOf(c) || {}).logline || '').trim();
    if (!text) fail('Write your logline first. The check works on yours.');
    let names = call(c.names);
    if (!Array.isArray(names)) {
      try { names = CharsM.loadCharacters().flatMap((x) => [x.name].concat(x.aliases || [])); } catch (e) { names = []; }
    }
    const res = Rules.loglineCheck(text, { names });
    const lines = Rules.loglineLines(res.check);
    const items = res.check.map((p, i) => ({
      id: p.part, text: lines[i], detail: p.found ? p.note : '', keep: lines[i]
    }));
    const found = res.check.filter((p) => p.checked !== false && p.present).length;
    const checked = res.check.filter((p) => p.checked !== false).length;
    return {
      items,
      note: 'Your logline, checked by rules: ' + found + ' of ' + checked + ' points hold. A checklist of your own words, not a score; '
        + 'irony and fresh variants need Enhance with AI. Tick any lines to keep them as a sticky note, or just close this.'
    };
  },
  apply(selected) { return keepAsNote(selected, 'Logline check (rules)', 'Logline check'); }
};

/* ============================================================
   voice-check-rules
   ============================================================ */
const voiceName = (c) => String(call(c.character) ?? c.character ?? '').trim();
const voiceElements = (c) => {
  const e = call(c.elements);
  if (Array.isArray(e)) return e;
  const d = call(c.getDoc);
  return d && Array.isArray(d.elements) ? d.elements : [];
};

const voiceRules = {
  id: 'voice-check-rules',
  label: 'Measure a character’s voice (no AI)',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'Every line the chosen character speaks, measured against the other speakers: line length, questions and '
      + 'exclamations, signature words and shared vocabulary. Lines that sit far from their own average are flagged '
      + 'with the measurement, nothing more. Nothing is sent anywhere.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const name = voiceName(c);
    if (!name) fail('Pick a character first.');
    const v = Rules.voiceStats(voiceElements(c), name);
    if (!v.enough) fail(v.message);
    const s = v.stats;
    const head = {
      id: 'profile', text: v.character + ': ' + plural(s.lines, 'line', 'lines') + ', ' + s.mean + ' words a line (longest ' + s.max + '); '
        + s.questions + '% questions, ' + s.exclaims + '% exclamations',
      detail: [v.signature.length ? 'Signature words: ' + v.signature.map((x) => x.word + ' (' + x.count + ')').join(', ') + '.' : '',
        v.overlap.length ? 'Shared vocabulary: ' + v.overlap.map((x) => x.name + ' ' + x.percent + '%').join(', ') + '.' : ''].filter(Boolean).join(' ')
    };
    const flags = v.flags.map((f) => ({
      id: f.id, text: (f.scene ? f.scene + ': ' : '') + '“' + f.line + '”', detail: f.why,
      keep: 'Measured: ' + (f.scene ? f.scene + ' · ' : '') + '“' + f.line + '” — ' + f.why.replace(/^Measured: /, '')
    }));
    return {
      items: [{ ...head, keep: head.text + '. ' + head.detail }, ...flags],
      note: 'Measured from the script’s own dialogue, nothing sent anywhere. '
        + (flags.length ? plural(flags.length, 'line', 'lines') + ' sit' + (flags.length === 1 ? 's' : '') + ' far from ' + v.character + '’s own pattern; a measurement is not a verdict, the line may be exactly right. '
          : 'No line sits far from ' + v.character + '’s own pattern. ')
        + 'Tick any to keep them as a sticky note. Rewrites and a judgement of voice need Enhance with AI.'
    };
  },
  apply(selected) { return keepAsNote(selected, 'Voice check (rules)', 'Voice check'); }
};

export const RULES_TASKS_STORY = [cleanupRules, loglineRules, voiceRules];
export default { ready, RULES_TASKS_STORY };
