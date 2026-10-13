/* ============================================================
   COVERAGE — a reader's report on the whole script, and the
   character-voice check, as one tab on write.html
   ------------------------------------------------------------
   write.js carries ONE import and ONE mount line for this, because
   two other features edit that file and this one does not need to
   live inside it. The page hands over three things:

     getDoc()  the in-memory script — the one model the page saves;
     save()    the page's own save path (persistNow), so nothing here
               writes the script blob behind the page's back;
   and this module puts its own `section#coverage` back into <main>
   every time write.js re-renders (it replaces <main> whole), which
   tabs.js then turns into the "Coverage" tab.

   THE RULES, every one of them already paid for elsewhere:

   1. NOTHING IS SENT WITHOUT A CLICK, and the panel says what will
      be sent, where, and roughly what it costs BEFORE the button:
      "about N requests", tokens ≈ characters ÷ 4 (and that Tamil
      script runs higher than that).
   2. TWO GATES. The AI pill (locked plan → the Pro offer; no key →
      Settings) and the Desk it opens. No scene headings
      (or a character with fewer than two lines) → a sentence saying
      so and no button to press.
   3. QUOTES ARE CHECKED. src/lib/ai.js strips every quotation that
      is not word for word in the scene it cites, and counts it; this
      page prints the count ("2 quotes removed because they were not
      in your script"). A point that lost its quote is marked.
   4. IT DOES NOT BILL TWICE. The run is batched and checkpointed: the
      summaries of every part read are stored as they land, so Stop,
      a failure or a closed tab resumes from the next part. The
      finished report is stored too, keyed by a fingerprint of the
      script's words, so reopening the tab reads the stored report
      and re-running is a deliberate, confirmed act.
   5. NO NEW STORAGE KEY. The report is a DOCUMENT inside the script
      blob that already exists (`fms_script_v1` → `documents`), kind
      "Notes", with the structured report in a `coverage` field that
      blankDocument() keeps through a load. That is also why it is in
      every backup and every sync already — and why the writer can
      read, edit or delete it from the Documents tab like any note.
   6. NOTHING OVERWRITES THE WRITER'S TEXT. The voice check's rewrites
      go into the line's alternates (`alts`, the alt-lines.js shape),
      never into the line in use, on a click, with an Undo.

   LAZY. None of the model code, the key machinery or the blueprint
   context loads until the Coverage tab is actually on screen.
   ============================================================ */
import '../styles/coverage.css';
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import { apiHost } from '../lib/ai-providers.js';
import { ask } from './dialog.js';
import { aiPill } from './ai-pill.js';

let getDoc = () => null;
let save = () => {};

let AIm = null, Panelm = null, BPm = null;
let loading = null;

/* View state, in memory only — none of it is the writer's work. */
const run = { running: false, abort: null, status: '', error: '' };
const voice = { character: '' };   // the picked character; the run and its result live in the AI Desk
let viewId = '';              // which stored report is open

const SECTION_ID = 'coverage';
const fmtN = (n) => Number(n || 0).toLocaleString('en-IN');
const plural = (n, one, many) => fmtN(n) + ' ' + (n === 1 ? one : many);

/* ---- loading ------------------------------------------------ */
function prime() {
  if (AIm) return Promise.resolve(true);
  if (!loading) {
    loading = Promise.all([
      import('../lib/ai.js'),
      import('./ai-panel.js'),
      import('../lib/blueprint-context.js')
    ]).then(([a, p, b]) => {
      AIm = a; Panelm = p; BPm = b;
      Panelm.wireAIPanel();
      Panelm.onAIChange(() => paint());
      paint();
      return true;
    }).catch((e) => {
      console.warn('[coverage] ai', e);
      loading = null;
      run.error = 'The coverage tools could not be loaded. Check the connection and try again.';
      paint();
      return false;
    });
  }
  return loading;
}

/* ---- the stored reports -------------------------------------
   A stored coverage is a document with a `coverage` object:
     { v:1, status:'partial'|'done', sig, at, model, revision,
       checkpoint?  (partial)   { sig, batchCount, parts },
       result?      (done)      what runCoverage() resolved to }  */
/* The storage half, bound to a script doc and its save path. Exported
   (coverageStore) so the AI Desk's coverage task — which runs on
   script.html too, where this tab is not mounted — stores a report in
   exactly the shape and place this tab reads, through the page's own
   save. ONE copy of "where a coverage lives". */
export function coverageStore(getDocFn, saveFn) {
  const docsOf = () => {
    const d = getDocFn();
    return d && Array.isArray(d.documents) ? d.documents : [];
  };
  const storedOf = () => docsOf().filter((d) => d && d.coverage && typeof d.coverage === 'object');
  const doneOf = () => storedOf().filter((d) => d.coverage.status === 'done' && d.coverage.result);
  const partialOf = (sig) => storedOf().find((d) => d.coverage.status === 'partial'
    && d.coverage.checkpoint && d.coverage.checkpoint.sig === sig);
  const revision = () => {
    const d = getDocFn();
    const revs = d && Array.isArray(d.revisions) ? d.revisions : [];
    return revs.length ? revs[revs.length - 1].name : '';
  };

  /** Store the partial run, so Stop or a closed tab never bills twice. */
  function storeCheckpoint(cp) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents)) return;
    let doc = partialOf(cp.sig);
    const now = new Date().toISOString();
    const body = 'Coverage in progress: ' + cp.parts.length + ' of ' + cp.batchCount
      + ' parts of the script read. Resume it from the Coverage tab — the parts already read are not sent again.';
    if (!doc) {
      doc = { id: newDocId(), title: 'Coverage (in progress)', kind: 'Notes', body, updated: now,
        coverage: { v: 1, status: 'partial', sig: cp.sig, at: now, model: cp.model, revision: revision(), checkpoint: cp } };
      d.documents.push(doc);
    } else {
      doc.body = body;
      doc.updated = now;
      doc.coverage = { ...doc.coverage, model: cp.model, checkpoint: cp };
    }
    saveFn();
  }

  function storeResult(res) {
    const d = getDocFn();
    if (!d || !Array.isArray(d.documents)) return null;
    const now = new Date().toISOString();
    const meta = { at: now, revision: revision() };
    let doc = partialOf(res.sig);
    if (!doc) { doc = { id: newDocId(), kind: 'Notes' }; d.documents.push(doc); }
    doc.title = 'Coverage — ' + (VERDICT_WORD[res.report.verdict] || 'report') + ' — ' + stamp(now).split(',')[0];
    doc.kind = 'Notes';
    doc.body = reportText(res, meta);
    doc.updated = now;
    doc.coverage = { v: 1, status: 'done', sig: res.sig, at: now, model: res.model, revision: meta.revision, result: res };
    saveFn();
    return doc;
  }

  return { docs: docsOf, stored: storedOf, done: doneOf, partialFor: partialOf, revisionLabel: revision, storeCheckpoint, storeResult };
}

const store = coverageStore(() => getDoc(), () => save());
const docs = () => store.docs();
const done = () => store.done();
const partialFor = (sig) => store.partialFor(sig);

function liveElements() {
  const d = getDoc();
  const els = d && Array.isArray(d.elements) ? d.elements : [];
  /* The debounce may not have fired: read the words on screen. */
  for (const ta of document.querySelectorAll('#wr-page [data-el] .wr-text')) {
    const id = ta.closest('[data-el]').dataset.el;
    const el = els.find((e) => String(e.id) === id);
    if (el && el.text !== ta.value) el.text = ta.value;
  }
  return els;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', '
    + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const VERDICT_WORD = { pass: 'Pass', consider: 'Consider', recommend: 'Recommend' };
const SECTION_LABEL = {
  premise: 'Premise', structure: 'Structure', character: 'Character',
  dialogue: 'Dialogue', pacing: 'Pacing', marketability: 'Marketability — Tamil theatrical & OTT'
};

/** The report as plain prose, for the document body: readable in the
    Documents tab and in a backup, with every quote it kept. */
function reportText(res, meta) {
  const r = res.report;
  const L = [];
  L.push('SCRIPT COVERAGE — ' + (VERDICT_WORD[r.verdict] || '—').toUpperCase());
  L.push('Read ' + stamp(meta.at) + (meta.revision ? ' · draft after revision ' + meta.revision : '')
    + ' · ' + plural(res.scenes, 'scene', 'scenes') + ' · by ' + res.model + '. Written by a model, not by a person.');
  if (res.removed || res.readRemoved) L.push(quotesRemovedSentence(res));
  L.push('');
  if (r.logline) L.push('LOGLINE AS READ', r.logline, '');
  const pts = (list) => (list || []).forEach((p) => {
    L.push('  · ' + (p.label ? p.label + ' — ' : '') + (p.scene ? 'Sc ' + p.scene + ': ' : '')
      + (p.quote ? '“' + p.quote + '” — ' : '') + p.note);
  });
  for (const id of ['premise', 'structure', 'character', 'dialogue', 'pacing', 'marketability']) {
    const s = r[id];
    if (!s) continue;
    L.push(SECTION_LABEL[id].toUpperCase());
    if (id === 'character') {
      if (s.protagonist) L.push('Protagonist: ' + s.protagonist);
      if (s.want) L.push('Wants: ' + s.want);
      if (s.need) L.push('Needs: ' + s.need);
    }
    if (s.assessment) L.push(s.assessment);
    if (id === 'structure' && s.actBreaks && s.actBreaks.length) { L.push('Act breaks:'); pts(s.actBreaks); }
    pts(s.points);
    L.push('');
  }
  L.push('VERDICT: ' + (VERDICT_WORD[r.verdict] || '—'));
  if (r.verdictWhy) L.push(r.verdictWhy);
  return L.join('\n');
}

function quotesRemovedSentence(res) {
  const out = [];
  if (res.removed) {
    out.push(plural(res.removed, 'quote', 'quotes') + ' removed because '
      + (res.removed === 1 ? 'it was' : 'they were') + ' not in your script.');
  }
  if (res.readRemoved) {
    out.push((res.removed ? fmtN(res.readRemoved) + ' more' : plural(res.readRemoved, 'quote', 'quotes'))
      + ' dropped while the scenes were read, for the same reason.');
  }
  return out.join(' ');
}

function newDocId() {
  return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ---- render ------------------------------------------------- */
function paint() {
  const old = document.getElementById(SECTION_ID);
  if (!old) return;
  const fresh = renderSection();
  /* Keep focus on a control that is rebuilt, the way the page does. */
  const a = document.activeElement;
  const sel = a && old.contains(a) && a.dataset && a.dataset.action ? '[data-action="' + a.dataset.action + '"]' : '';
  const hidden = old.hidden;
  for (const attr of ['role', 'aria-labelledby', 'tabindex']) {
    if (old.hasAttribute(attr)) fresh.setAttribute(attr, old.getAttribute(attr));
  }
  fresh.hidden = hidden;
  old.replaceWith(fresh);
  watchVisible(fresh);
  if (sel) { const n = fresh.querySelector(sel); if (n) n.focus(); }
}

function renderSection() {
  const sec = h('section.wr-section.cv', { id: SECTION_ID, 'data-tab-label': 'Coverage', 'aria-label': 'Coverage' });
  sec.append(
    h('h2.bd-h2', { text: 'Coverage' }),
    h('p.bd-sub', {
      text: 'A reader’s report on the whole script — premise, structure, character, dialogue, '
        + 'pacing and how it plays to a Tamil theatrical and OTT audience — and a check of one '
        + 'character’s voice. Every point cites a scene and quotes your words; a quote that is '
        + 'not word for word in your script is removed, and the page tells you how many.'
    })
  );
  if (!AIm) {
    sec.append(run.error ? errorText(run.error) : h('p.bd-none', { text: 'Loading the coverage tools…' }));
    return sec;
  }
  sec.append(renderRunPanel());
  const report = renderReport();
  if (report) sec.append(report);
  sec.append(renderVoicePanel());
  return sec;
}

function errorText(t) {
  return Panelm ? Panelm.errorLine(t) : h('p.ai-error', { role: 'alert', text: t });
}

function renderRunPanel() {
  const panel = h('div.ai-panel.cv-run.cv-noprint');
  panel.append(h('div.ai-head', {}, [h('h3.ai-title', { text: 'A reader’s report' }), Panelm.aiMark('AI')]));

  /* No key gate here any more: the AI pill below is the way in, and
     it is greyed (with the Pro offer) on a plan without AI, and sends
     a device with no key to Settings. The plan and the cost are still
     stated here, before the pill, because they are true either way. */
  const els = liveElements();
  const plan = AIm.planCoverage(els);
  if (!plan.batches.length) {
    panel.append(Panelm.gate('No scenes yet.',
      'Coverage reads the script scene by scene, and this one has no scene headings. '
      + 'Write or import a few scenes first.'));
    return panel;
  }
  const sig = AIm.scriptSignature(els);
  const have = done().find((d) => d.coverage.sig === sig);
  const part = partialFor(sig);
  const cp = part && part.coverage.checkpoint && part.coverage.checkpoint.batchCount === plan.batches.length
    ? part.coverage.checkpoint : null;

  const context = BPm.blueprintContext();
  const sum = BPm.contextSummary(context);
  const left = plan.batches.length - (cp ? cp.parts.length : 0);
  panel.append(Panelm.disclose(
    'Clicking the button sends the whole screenplay — ' + plural(plan.scenes.length, 'scene', 'scenes')
    + ', ' + fmtN(plan.chars) + ' characters — in ' + plural(plan.batches.length, 'part', 'parts')
    + ', then the summaries and quotes those parts produce, '
    + (sum.fields ? 'with ' + plural(sum.fields, 'answer', 'answers') + ' from your feature blueprint, ' : '')
    + 'to ' + apiHost() + ' using the key on this device, billed to your account. '
    + 'Nothing is sent until you click.'
  ));
  panel.append(h('p.cv-cost', { role: 'note' }, [
    h('strong', { text: 'About ' + plural(cp ? left + 1 : plan.requests, 'request', 'requests') }),
    ' · roughly ' + fmtN(plan.tokensIn) + ' tokens sent'
      + ' (characters ÷ 4' + (plan.tamil ? '; Tamil script counts higher, so expect more' : '') + ')'
      + (cp ? ' · ' + cp.parts.length + ' of ' + plan.batches.length + ' parts already read and not sent again' : '')
  ]));

  const peek = h('details.ai-peek');
  peek.append(h('summary', { text: 'Show me what the first part sends' }));
  const pre = h('pre.ai-peek-body');
  const first = AIm.buildCoverageBatchPrompt({
    scenes: plan.batches[0].map((i) => plan.scenes[i]), part: 1, parts: plan.batches.length, context
  });
  pre.textContent = first.length > 6000 ? first.slice(0, 6000) + '\n…' : first;
  peek.append(pre);
  panel.append(peek);

  /* The run itself is the AI Desk's 'coverage' task (src/lib/ai-tasks.js):
     the same runCoverage(), the same checkpoints, stored through
     coverageStore() above — and the Desk lets the writer keep only the
     points they accept. */
  const acts = h('div.ai-acts');
  const pill = aiPill({
    label: cp ? 'Resume coverage — ' + cp.parts.length + ' of ' + plan.batches.length + ' read'
      : (have ? 'Run coverage again' : 'Run coverage'),
    tasks: ['coverage'],
    ctx: { identity: 'coverage:' + sig, getDoc: () => getDoc(), elements: () => liveElements(), save: () => save(), after: () => paint(), progress: () => paint() }
  });
  if (pill) acts.append(pill);
  if (cp) acts.append(h('button.btn', { type: 'button', 'data-action': 'cv-restart', text: 'Start over' }));
  panel.append(acts);
  if (have) {
    panel.append(h('p.ai-caveat', { text: 'This exact draft already has coverage, below. Running it again bills again.' }));
  }
  const st = Panelm.statusLine(run.status);
  if (st) panel.append(st);
  if (run.error) panel.append(errorText(run.error));
  return panel;
}

function quoteBlock(p) {
  const li = h('li.cv-point');
  const head = [];
  if (p.label) head.push(h('span.cv-label', { text: p.label }));
  if (p.scene) head.push(h('span.cv-sc', { text: 'Sc ' + p.scene }));
  if (head.length) li.append(h('p.cv-point-head', {}, head));
  if (p.quote) li.append(h('blockquote.cv-quote', { text: '“' + p.quote + '”' }));
  li.append(h('p.cv-note', { text: p.note }));
  if (!p.quote) li.append(h('p.cv-unquoted', { text: 'No quote — the one given was not in your script, so it was removed.' }));
  return li;
}

function renderReport() {
  const list = done().slice().sort((a, b) => String(b.coverage.at).localeCompare(String(a.coverage.at)));
  if (!list.length) return null;
  let open = list.find((d) => d.id === viewId) || null;
  const sig = AIm.scriptSignature(getDoc().elements || []);
  if (!open) open = list.find((d) => d.coverage.sig === sig) || list[0];
  const c = open.coverage;
  const res = c.result;
  const r = res.report || {};

  const wrap = h('article.cv-report', { 'aria-label': 'Coverage report' });
  const bar = h('div.cv-report-bar.cv-noprint');
  if (list.length > 1) {
    const sel = h('select.ai-sel', { 'data-action': 'cv-view', 'aria-label': 'Which coverage report' });
    list.forEach((d) => {
      const o = h('option', { value: d.id, text: stamp(d.coverage.at) + ' — ' + (VERDICT_WORD[d.coverage.result.report.verdict] || '—')
        + (d.coverage.sig === sig ? ' (this draft)' : '') });
      if (d.id === open.id) o.selected = true;
      sel.append(o);
    });
    bar.append(h('label.ai-field', {}, [h('span.ai-flabel', { text: 'Report' }), sel]));
  }
  bar.append(h('span.ai-gap'));
  bar.append(h('button.btn', { type: 'button', 'data-action': 'cv-print', 'data-doc': open.id, text: 'Save as PDF' }));
  wrap.append(bar);

  wrap.append(h('header.cv-report-head', {}, [
    h('p.bd-eyebrow', { text: 'Script coverage' }),
    h('p.cv-verdict.is-' + (r.verdict || 'none'), { text: (VERDICT_WORD[r.verdict] || 'No verdict') }),
    r.verdictWhy ? h('p.cv-verdict-why', { text: r.verdictWhy }) : null,
    h('p.cv-meta', {}, [
      Panelm.aiMark('MODEL READING'),
      ' Read ' + stamp(c.at) + (c.revision ? ' · draft after revision “' + c.revision + '”' : '')
        + ' · ' + plural(res.scenes, 'scene', 'scenes') + ' · by ' + res.model
        + (res.truncated ? ' · the reply was cut short' : '')
    ])
  ]));
  if (c.sig !== sig) {
    wrap.append(h('p.cv-stale', { role: 'note', text: 'Your script has changed since this report was written, so a scene number or a quote may no longer match the page.' }));
  }
  if (res.removed || res.readRemoved || res.renumbered) {
    const t = [quotesRemovedSentence(res)];
    if (res.renumbered) t.push(plural(res.renumbered, 'quote was', 'quotes were') + ' cited under the wrong scene and now name the scene '
      + (res.renumbered === 1 ? 'it is' : 'they are') + ' actually in.');
    wrap.append(h('p.cv-removed', { role: 'note', text: t.filter(Boolean).join(' ') }));
  }
  if (r.logline) {
    wrap.append(h('section.cv-part', { 'aria-label': 'Logline as read' }, [
      h('h4.cv-h', { text: 'Logline as read' }), h('p.cv-logline', { text: r.logline })
    ]));
  }
  for (const id of ['premise', 'structure', 'character', 'dialogue', 'pacing', 'marketability']) {
    const s = r[id];
    if (!s) continue;
    const part = h('section.cv-part', { 'aria-label': SECTION_LABEL[id] }, [h('h4.cv-h', { text: SECTION_LABEL[id] })]);
    if (id === 'character' && (s.protagonist || s.want || s.need)) {
      const dl = h('dl.cv-dl');
      if (s.protagonist) dl.append(h('dt', { text: 'Protagonist' }), h('dd', { text: s.protagonist }));
      if (s.want) dl.append(h('dt', { text: 'Wants' }), h('dd', { text: s.want }));
      if (s.need) dl.append(h('dt', { text: 'Needs' }), h('dd', { text: s.need }));
      part.append(dl);
    }
    if (s.assessment) part.append(h('p.cv-assess', { text: s.assessment }));
    if (id === 'structure' && s.actBreaks && s.actBreaks.length) {
      part.append(h('p.cv-sub', { text: 'Act breaks found' }));
      part.append(h('ol.cv-points', {}, s.actBreaks.map(quoteBlock)));
    }
    if (s.points && s.points.length) part.append(h('ul.cv-points', {}, s.points.map(quoteBlock)));
    wrap.append(part);
  }
  wrap.append(h('p.ai-caveat.cv-noprint', {
    text: 'Saved in Documents as “' + (open.title || 'Coverage') + '”, inside this script, so reopening it costs nothing. Delete it there to remove it.'
  }));
  return wrap;
}

/* ---- the voice check ---------------------------------------- */
function renderVoicePanel() {
  const panel = h('div.ai-panel.cv-voice.cv-noprint');
  panel.append(h('div.ai-head', {}, [h('h3.ai-title', { text: 'A character’s voice' }), Panelm.aiMark('AI')]));
  /* No key gate: the AI pill below is the way in (locked plan → the
     Pro offer; no key → Settings), as in the reader's report above. */
  const els = liveElements();
  const cast = AIm.speakingCharacters(els);
  if (!cast.length) {
    panel.append(Panelm.gate('No speaking characters yet.', 'The check reads one character’s dialogue, and this script has none.'));
    return panel;
  }
  if (voice.character && !cast.some((c) => c.name === voice.character)) voice.character = '';
  const sel = h('select.ai-sel', { 'data-action': 'cv-voice-pick', 'aria-label': 'Character' });
  sel.append(h('option', { value: '', text: 'Choose a character…' }));
  cast.forEach((c) => {
    const o = h('option', { value: c.name, text: c.name + ' — ' + plural(c.lines, 'line', 'lines') });
    if (c.name === voice.character) o.selected = true;
    sel.append(o);
  });
  panel.append(h('label.ai-field', {}, [h('span.ai-flabel', { text: 'Character' }), sel]));

  const lines = voice.character ? AIm.characterLines(els, voice.character) : [];
  const plan = AIm.planVoiceCheck(lines);
  if (voice.character) {
    if (lines.length < 2) {
      panel.append(Panelm.gate(voice.character + ' has one line.', 'A voice needs a few lines to be established. Pick someone who speaks more.'));
    } else {
      panel.append(Panelm.disclose('Clicking the button sends every line ' + voice.character + ' speaks — '
        + plural(lines.length, 'line', 'lines') + ' with their scene numbers, nothing else from the script — to '
        + apiHost() + ' using the key on this device. About ' + plural(plan.requests, 'request', 'requests')
        + ', roughly ' + fmtN(plan.tokensIn) + ' tokens sent' + (plan.tamil ? ' (Tamil script counts higher)' : '') + '.'));
    }
  }
  const can = voice.character && lines.length >= 2;
  /* The run is the AI Desk's 'voice-check' task (src/lib/ai-tasks.js):
     the same voiceCheck(), and its suggested rewrites become alternate
     takes through addTake() below, only the ones the writer ticks, with
     an Undo. Until a character with two lines is picked there is
     nothing to send, so the button stays a disabled one. */
  const acts = h('div.ai-acts');
  if (can) {
    const pill = aiPill({
      label: 'Check ' + voice.character + '’s voice', tasks: ['voice-check'],
      ctx: {
        identity: 'voice:' + voice.character + ':' + AIm.scriptSignature(els),
        character: voice.character, elements: () => liveElements(), getDoc: () => getDoc(),
        after: () => paint()
      }
    });
    if (pill) acts.append(pill);
  } else {
    acts.append(h('button.btn.primary', { type: 'button', disabled: true,
      text: voice.character ? 'Check ' + voice.character + '’s voice' : 'Check the voice' }));
  }
  panel.append(acts);
  return panel;
}

/* ---- the alternates path -------------------------------------
   The shape alt-lines.js owns: `alts` is an array of strings on the
   dialogue element; only `text` is the line in use. The write goes
   through the row's own `input` event when the row is on the page —
   exactly what alt-lines.js does — so write.js runs its keystroke
   path (model, counters, debounced save); otherwise through save(). */
function takesOf(el) { return Array.isArray(el.alts) ? el.alts.filter((t) => typeof t === 'string') : []; }
function commitRow(id, el) {
  const row = document.querySelector('#wr-page [data-el="' + CSS.escape(String(id)) + '"]');
  const n = takesOf(el).length;
  if (row) { if (n) row.setAttribute('data-alts', String(n + 1)); else row.removeAttribute('data-alts'); }
  const ta = row && row.querySelector('.wr-text');
  if (ta) { el.text = ta.value; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  else save();
}
export function addTake(id, text) {
  const d = getDoc();
  const el = d && Array.isArray(d.elements) ? d.elements.find((e) => String(e.id) === String(id)) : null;
  if (!el || el.type !== 'dialogue') return 'gone';
  const takes = takesOf(el);
  if (takes.includes(text) || el.text === text) return 'dup';
  takes.push(text);
  el.alts = takes;
  commitRow(id, el);
  return 'ok';
}
export function removeTake(id, text) {
  const d = getDoc();
  const el = d && Array.isArray(d.elements) ? d.elements.find((e) => String(e.id) === String(id)) : null;
  if (!el) return;
  const takes = takesOf(el);
  const k = takes.lastIndexOf(text);
  if (k < 0) return;
  takes.splice(k, 1);
  if (takes.length) el.alts = takes; else delete el.alts;
  commitRow(id, el);
}

/* ---- the run ------------------------------------------------
   Coverage runs from the AI Desk now (the pill in renderRunPanel).
   "Start over" stays here: it only discards the stored partial run,
   after a confirm, so the next run reads from the first scene. */
async function discardPartial() {
  if (!AIm) return;
  const sig = AIm.scriptSignature(liveElements());
  const part = partialFor(sig);
  if (!part) return;
  if (!await ask('Start the coverage again from the first scene? The parts already read are discarded and will be sent — and billed — again.')) return;
  const i = docs().indexOf(part);
  if (i >= 0) getDoc().documents.splice(i, 1);
  save();
  run.status = 'The parts already read were discarded. Run coverage reads from the first scene.';
  paint();
}

function printReport(docId) {
  const d = done().find((x) => x.id === docId);
  if (!d) return;
  viewId = d.id;
  paint();
  PDF.exportPDF({
    scope: 'coverage', label: 'Script coverage',
    subtitle: (VERDICT_WORD[d.coverage.result.report.verdict] || '') + ' · read ' + stamp(d.coverage.at).split(',')[0],
    classes: ['cv-print']
  });
}

function wire() {
  delegate(document, 'click', '[data-action="cv-restart"]', () => { discardPartial(); });
  delegate(document, 'change', 'select[data-action="cv-view"]', (e, sel) => { viewId = sel.value; paint(); });
  delegate(document, 'click', '[data-action="cv-print"]', (e, btn) => printReport(btn.dataset.doc));
  delegate(document, 'change', 'select[data-action="cv-voice-pick"]', (e, sel) => {
    voice.character = sel.value;
    paint();
  });
}

/* ---- mounting ----------------------------------------------- */
let visObs = null;
function watchVisible(sec) {
  if (AIm || typeof IntersectionObserver !== 'function') return;
  if (!visObs) {
    visObs = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { visObs.disconnect(); prime(); }
    });
  }
  visObs.observe(sec);
}

function ensureSection() {
  const app = document.getElementById('app');
  const main = app && app.querySelector('main');
  if (!main || main.querySelector('#' + SECTION_ID)) return;
  const sec = renderSection();
  main.append(sec);
  watchVisible(sec);
}

/** `opts.getDoc` returns the page's in-memory script; `opts.save` is
    the page's own save path. */
export function mountCoverage(opts = {}) {
  if (typeof opts.getDoc === 'function') getDoc = opts.getDoc;
  if (typeof opts.save === 'function') save = opts.save;
  wire();
  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(ensureSection).observe(app, { childList: true });
  ensureSection();
  /* A deep link straight to the tab loads the tools at once. */
  if (location.hash === '#' + SECTION_ID) prime();
  addEventListener('hashchange', () => { if (location.hash === '#' + SECTION_ID) prime(); });
}

export default mountCoverage;
