/* ============================================================
   THE DRAFT SPACE — Run all, on preprod.html#drafts
   ------------------------------------------------------------
   One press asks every ticked AI tool for a draft (src/lib/ai-run-all.js,
   the engine), and this view lists them as they come back: one card per
   draft with its state, how long it took, how many items it holds and,
   when it did not run, why. Every card can be
     Review      the AI Desk on that task with the stored answer loaded
                 as v1 (ai-desk.js openWithDraft): the same ticks, refine,
                 Accept and Undo as after a Desk run
     Accept all  acceptDraft(): parents still waiting are accepted first
                 (the shots before their blocking), then this draft, one
                 Undo for all of it
     Reject      the draft is marked rejected and its answer dropped
   NOTHING IS WRITTEN TO THE STUDIO BEFORE AN ACCEPT. The drafts live in
   IndexedDB (ai-drafts.js), never in localStorage, and nothing here
   writes while the page sits idle: the store is read on mount and on a
   press, and written only by the engine during a run and by a press.

   The engine is independent of the Desk: a run goes on while a draft
   is reviewed, and the Desk never aborts it. On reload the drafts of
   the latest runs are listed again; a run that was cut short (the tab
   closed) shows Resume, which runs only what had not finished.

   LAZY, and so are the engine modules: a plain dynamic import(), so
   the engine is its own chunk and stays out of preprod.html's first
   paint (it was an import.meta.glob while the lanes built apart).

   Pro only: aiUnlocked() fails closed, and the engine asks again.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Store from '../lib/store.js';
import PlanGate from '../lib/plan-gate.js';
import { hasKey, providerLabel, apiName, apiHost } from '../lib/ai-providers.js';
import StudioUI from './chrome.js';
import { button, badge } from './kit/index.js';
import '../styles/ai.css';
import '../styles/draft-space.css';

let engineP = null;
function engine() {
  if (!engineP) {
    engineP = Promise.all([
      import('../lib/ai-run-all.js'), import('../lib/ai-run-all-model.js'),
      import('../lib/ai-drafts.js'), import('../lib/ai-headless-ctx.js')
    ]).then(([run, model, drafts, headless]) => ({ run, model, drafts, headless }))
      .catch((e) => { console.warn('[draft-space] the engine did not load', e); engineP = null; return null; });
  }
  return engineP;
}

/* ---- words ---------------------------------------------------- */
const STATE = {
  queued: ['Waiting', null], running: ['Running', 'info'], ready: ['Ready to review', 'ok'],
  failed: ['Did not run', 'danger'], skipped: ['Skipped', null], accepted: ['Accepted', 'ok'], rejected: ['Rejected', null]
};
const LIVE = new Set(['queued', 'running']);
const secs = (ms) => (Number.isFinite(ms) && ms >= 0 ? (ms < 1000 ? '<1 s' : ms < 60000 ? Math.round(ms / 1000) + ' s' : Math.floor(ms / 60000) + ' min ' + Math.round((ms % 60000) / 1000) + ' s') : '');
function itemCount(d) {
  const r = d && d.result;
  if (!r || typeof r !== 'object') return null;
  if (Array.isArray(r.items)) return r.items.length;
  if (typeof r.proposed === 'string') return 1;
  return null;
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const when = (iso) => { const t = Date.parse(iso || ''); return t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; };

/* ---- per-visit memory (no storage key) ------------------------- */
const S = {
  host: null, pid: '', E: null, loaded: false, missing: false,
  ticks: null,                       // Set of task ids, this visit only
  runs: [],                          // [{ runId, createdAt, rows: [draft] }], newest first
  live: null,                        // { pid, runId, ctl } while this tab drives a run
  estimate: null,                    // { requests, skipped } for the ticks
  note: '', busy: new Set()          // keys with a press in flight
};
const RUNS_SHOWN = 3;

const pidNow = () => { try { return String(Store.currentProjectId() || ''); } catch (e) { return ''; } };
const draftsOf = (pid) => S.E.drafts.openDrafts(pid);

/* ---- mounting ---------------------------------------------------- */
/** Fill `host` (the page's `section#drafts`). Safe to call on every
    page render: the memory above survives, only the DOM is rebuilt. */
export async function mountDraftSpace(host) {
  if (!host) return;
  S.host = host;
  wire();
  const pid = pidNow();
  const changed = pid !== S.pid;
  S.pid = pid;
  if (!S.E && !S.missing) {
    paint();
    S.E = await engine();
    if (!S.E) S.missing = true;
  }
  if (S.E && !S.ticks) S.ticks = new Set([...S.E.model.WAVE1, ...S.E.model.WAVE2].filter((id) => !S.E.model.OPT_IN.includes(id)));
  if (changed || !S.loaded) { S.runs = []; S.loaded = false; paint(); await reload(); }
  else paint();
  estimate();
}

async function reload() {
  if (!S.E || !S.pid) { S.loaded = true; paint(); return; }
  const pid = S.pid;
  try {
    const store = draftsOf(pid);
    const list = (await store.listRuns()).slice(0, RUNS_SHOWN);
    const runs = [];
    for (const r of list) runs.push({ runId: r.runId, createdAt: r.createdAt, rows: await store.getRun(r.runId) });
    if (pid !== S.pid) return;
    S.runs = runs;
  } catch (e) {
    console.warn('[draft-space] drafts did not load', e);
    S.note = 'The drafts could not be read in this browser (' + String((e && e.message) || 'storage refused').slice(0, 120) + ').';
  }
  S.loaded = true;
  paint();
}

let estT = 0;
function estimate() {
  clearTimeout(estT);
  if (!S.E || !S.pid || !PlanGate.aiUnlocked()) return;
  estT = setTimeout(async () => {
    try {
      const project = await S.E.run.projectState({ ticks: [...S.ticks] });
      const { nodes } = S.E.model.planRun({ ticks: [...S.ticks], project });
      const runs = nodes.filter((n) => !n.skip);
      S.estimate = { requests: runs.length, skipped: nodes.length - runs.length, shots: runs.some((n) => n.taskId === 'shot-draft'), frames: runs.some((n) => n.taskId === 'board-frames') };
    } catch (e) { S.estimate = null; }
    const el = S.host && S.host.querySelector('.ds-disclose p');
    if (el) el.textContent = discloseText(); else paint();
  }, 120);
}

/* ---- drawing ------------------------------------------------------ */
function discloseText() {
  const e = S.estimate;
  const n = e ? (e.requests === 1 ? 'about one request' : 'about ' + e.requests + ' requests') : 'one request per tool';
  return 'When you press Break down everything, the script, the scene list and what each ticked tool reads (shots, characters, '
    + 'locations, call sheets) are sent to ' + apiName() + ' at ' + apiHost() + ' with your ' + providerLabel() + ' key, '
    + n + (e && e.shots ? ', and more for shot division on a long script (it asks a few scenes at a time)' : '') + '. '
    + (e && e.frames ? 'Storyboard frames are drawn by ' + apiName('gemini') + ' with your ' + providerLabel('gemini') + ' key and kept in your Google Drive. ' : '')
    + 'Each answer is kept as a draft in this browser for 14 days; nothing reaches the film until you accept it.';
}

function head() {
  return h('div.ds-head', {}, [
    h('h2', { id: 'ds-title', text: 'Draft space' }),
    h('p.pp-about', { text: 'Ask every AI tool for its draft in one press: tags, notes, shots, blocking, the shoot order, recce ideas, arcs, the budget and call-sheet notes. They run in the background; each one waits here for your review.' })
  ]);
}

function controls() {
  if (!S.pid) return [h('p.pp-facts', { text: 'Open a film first: its drafts appear here.' })];
  if (S.missing) return [h('p.pp-facts', { text: 'Run all could not load. Reload the page to try again.' })];
  if (!S.E) return [h('p.pp-facts', { text: 'Loading the AI tools…' })];
  if (!PlanGate.aiUnlocked()) {
    return [h('div.ds-locked', {}, [
      h('p.pp-facts', { text: 'Break down everything is one of the Pro plan’s AI tools.' }),
      button({ label: 'See the Pro plan', href: 'purchase.html', variant: 'secondary' })
    ])];
  }
  const M = S.E.model;
  const ids = [...M.WAVE1, ...M.WAVE2];
  const ticks = h('fieldset.ds-ticks', {}, [
    h('legend', { text: 'What to draft' }),
    h('div.ds-tick-grid', {}, ids.map((id) => h('label.ds-tick', {}, [
      h('input', { type: 'checkbox', 'data-ds-tick': id, checked: S.ticks.has(id) ? true : null, disabled: S.live ? true : null }),
      h('span', {}, [
        h('span', { text: M.LABELS[id] || id }),
        id === 'board-frames' ? h('span.ds-tick-hint', { text: 'Off unless ticked: it draws pictures, needs a Gemini key and Google Drive.' }) : null
      ])
    ])))
  ]);
  const keyless = !hasKey();
  const live = S.live && S.live.pid === S.pid;
  return [
    ticks,
    h('div.ai-disclose.ds-disclose', {}, [h('strong', { text: 'What gets sent, and where' }), h('p', { text: discloseText() })]),
    h('div.ds-act', {}, [
      keyless
        ? button({ label: 'Add your AI key in Settings →', href: 'settings.html#ai', variant: 'primary' })
        : button({ label: live ? 'Breaking down…' : 'Break down everything', icon: 'auto_awesome', variant: 'primary', action: 'ds-start', disabled: live || !S.ticks.size }),
      live ? button({ label: 'Stop', icon: 'stop', action: 'ds-stop' }) : null
    ])
  ];
}

function cardFor(runId, d, live) {
  /* 'running' in the store with no engine in this tab: the tab that ran
     it closed. Resume picks it up. */
  const cut = d.status === 'running' && !live;
  const [word, tone] = cut ? ['Interrupted', 'warn'] : STATE[d.status] || [d.status, null];
  const n = itemCount(d);
  const facts = [
    d.ms != null && ['ready', 'failed', 'accepted', 'rejected'].includes(d.status) ? secs(d.ms) : '',
    n != null && d.status !== 'rejected' ? plural(n, 'item', 'items') : '',
    d.status === 'running' && d.statusText ? d.statusText : ''
  ].filter(Boolean);
  const why = (d.status === 'failed' || d.status === 'skipped') && d.error ? String(d.error.message || d.error) : '';
  const busy = S.busy.has(runId + '|' + d.key);
  const ready = d.status === 'ready';
  const label = d.label || d.taskId;
  const waits = (d.parents || []).map((k) => S.runs.find((r) => r.runId === runId)?.rows.find((x) => x.key === k)).filter((p) => p && p.status === 'ready');
  return h('li.ds-card', { 'data-ds-key': d.key, 'data-ds-run': runId, 'data-ds-status': d.status, 'aria-busy': busy || d.status === 'running' ? 'true' : null }, [
    h('div.ds-card-head', {}, [
      h('h4', { text: label }),
      badge({ label: word, tone, dot: true, class: 'ds-state' })
    ]),
    facts.length ? h('p.ds-facts', { text: facts.join(' · ') }) : null,
    why ? h('p.ds-why', { text: why }) : null,
    ready && waits.length ? h('p.ds-facts', { text: 'Accepting it accepts ' + waits.map((p) => p.label || p.taskId).join(', ') + ' first.' }) : null,
    ready ? h('div.ds-card-act', {}, [
      button({ label: 'Review', variant: 'primary', size: 'sm', action: 'ds-review', disabled: busy, attrs: { 'aria-label': 'Review ' + label } }),
      button({ label: 'Accept all', size: 'sm', action: 'ds-accept', disabled: busy, attrs: { 'aria-label': 'Accept all of ' + label } }),
      button({ label: 'Reject', variant: 'ghost', size: 'sm', action: 'ds-reject', disabled: busy, attrs: { 'aria-label': 'Reject ' + label } })
    ]) : null
  ]);
}

function runBlock(run, i) {
  const live = S.live && S.live.runId === run.runId;
  const counts = {};
  for (const d of run.rows) counts[d.status] = (counts[d.status] || 0) + 1;
  const unfinished = (counts.queued || 0) + (counts.running || 0) + (counts.failed || 0);
  const sum = [
    counts.ready ? plural(counts.ready, 'draft', 'drafts') + ' to review' : '',
    counts.accepted ? counts.accepted + ' accepted' : '',
    counts.running ? counts.running + ' running' : '',
    counts.queued ? counts.queued + ' waiting' : '',
    counts.failed ? counts.failed + ' did not run' : ''
  ].filter(Boolean).join(' · ') || 'Nothing left to review.';
  return h('section.ds-run', { 'data-ds-run': run.runId, 'aria-labelledby': 'ds-run-' + i }, [
    h('div.ds-run-head', {}, [
      h('h3', { id: 'ds-run-' + i, text: (i === 0 ? 'Latest run' : 'Earlier run') + (run.createdAt ? ' · ' + when(run.createdAt) : '') }),
      h('span.ds-facts', { text: sum }),
      !live && unfinished && PlanGate.aiUnlocked() && hasKey()
        ? button({ label: 'Resume', icon: 'play_arrow', size: 'sm', action: 'ds-resume', disabled: !!S.live, attrs: { 'data-ds-run': run.runId, 'aria-label': 'Resume this run: only what did not finish runs again' } })
        : null
    ]),
    h('ul.ds-cards', {}, run.rows.map((d) => cardFor(run.runId, d, !!live)))
  ]);
}

function paint() {
  const host = S.host;
  if (!host || !host.isConnected) return;
  const focus = document.activeElement && host.contains(document.activeElement) ? focusSpot(document.activeElement) : null;
  const kids = [head(), ...controls()];
  if (S.note) kids.push(h('p.ds-why', { role: 'alert', text: S.note }));
  if (S.pid && S.E) {
    if (!S.loaded) kids.push(h('p.pp-facts', { text: 'Reading the drafts…' }));
    else if (!S.runs.length) kids.push(h('p.pp-facts.ds-empty', { text: 'No drafts yet. Tick what to draft and press Break down everything.' }));
    else kids.push(h('div.ds-runs', {}, S.runs.map(runBlock)));
  }
  kids.push(live);
  host.replaceChildren(...kids);
  if (focus) restore(focus);
}

/* One polite live region, kept across paints, says what changed. */
const live = h('p.visually-hidden.ds-live', { role: 'status', 'aria-live': 'polite' });
function say(text) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); }

function focusSpot(el) {
  const card = el.closest('[data-ds-key]');
  return { action: el.dataset.action || '', tick: el.dataset.dsTick || '', key: card ? card.dataset.dsKey : '', run: card ? card.dataset.dsRun : (el.dataset.dsRun || '') };
}
function restore(f) {
  const host = S.host;
  let el = null;
  if (f.tick) el = host.querySelector('[data-ds-tick="' + CSS.escape(f.tick) + '"]');
  else if (f.key) {
    const card = host.querySelector('[data-ds-run="' + CSS.escape(f.run) + '"] [data-ds-key="' + CSS.escape(f.key) + '"]');
    el = card && (card.querySelector('[data-action="' + CSS.escape(f.action) + '"]:not([disabled])') || card.querySelector('button:not([disabled])'));
    if (!el && card) { card.tabIndex = -1; el = card; }
  } else if (f.action) el = host.querySelector('[data-action="' + CSS.escape(f.action) + '"]:not([disabled])') || host.querySelector('[data-action="ds-start"]');
  if (el) try { el.focus({ preventScroll: true }); } catch (e) { /* gone */ }
}

/* ---- the engine's updates ------------------------------------------ */
function onUpdate(pid) {
  return (d) => {
    const runId = d && d.runId;
    if (pid !== S.pid || !runId) return;
    let run = S.runs.find((r) => r.runId === runId);
    if (!run) { run = { runId, createdAt: d.createdAt, rows: [] }; S.runs.unshift(run); S.runs = S.runs.slice(0, RUNS_SHOWN); }
    const i = run.rows.findIndex((x) => x.key === d.key);
    const was = i >= 0 ? run.rows[i].status : '';
    if (i >= 0) run.rows[i] = d; else run.rows.push(d);
    if (was !== d.status && !LIVE.has(d.status)) {
      const n = itemCount(d);
      say((d.label || d.taskId) + ': ' + (STATE[d.status] || [d.status])[0].toLowerCase() + (n != null && d.status === 'ready' ? ', ' + plural(n, 'item', 'items') : '') + '.');
    }
    patchCard(run, d);
  };
}

/* A card is redrawn alone while a run streams, so the reader's focus and
   place in the list stay where they are. */
function patchCard(run, d) {
  const host = S.host;
  if (!host || !host.isConnected) return;
  const old = host.querySelector('.ds-run[data-ds-run="' + CSS.escape(run.runId) + '"] [data-ds-key="' + CSS.escape(d.key) + '"]');
  if (!old) { paint(); return; }
  const next = cardFor(run.runId, d, true);
  if (next.outerHTML === old.outerHTML) return;
  const f = old.contains(document.activeElement) ? focusSpot(document.activeElement) : null;
  old.replaceWith(next);
  if (f) restore(f);
  const headSum = host.querySelector('.ds-run[data-ds-run="' + CSS.escape(run.runId) + '"] .ds-run-head .ds-facts');
  if (headSum) {
    const fresh = runBlock(run, S.runs.indexOf(run)).querySelector('.ds-run-head .ds-facts');
    if (fresh) headSum.textContent = fresh.textContent;
  }
}

async function drive(start) {
  const pid = S.pid;
  const ctl = new AbortController();
  S.live = { pid, runId: '', ctl };
  S.note = '';
  paint();
  try {
    const { runId, done } = await start(ctl, pid);
    S.live.runId = runId;
    await reload();
    say('Break down everything started. Each draft appears here as it is ready.');
    const end = await done;
    const c = end && end.counts ? end.counts : {};
    say(end && end.stopped ? 'Stopped. What had finished is kept as drafts.'
      : 'Done: ' + plural(c.ready || 0, 'draft', 'drafts') + ' to review' + (c.failed ? ', ' + c.failed + ' did not run' : '') + '.');
  } catch (e) {
    S.note = (e && e.message) || 'It did not start.';
  } finally {
    if (S.live && S.live.ctl === ctl) S.live = null;
  }
  if (pid === S.pid) await reload(); else paint();
}

/* ---- presses ------------------------------------------------------- */
function rowOf(runId, key) {
  const run = S.runs.find((r) => r.runId === runId);
  return run ? run.rows.find((d) => d.key === key) || null : null;
}

/** The stored memo back where the task's recall() looks for it. */
function pin(result, memo) {
  const out = result && typeof result === 'object' ? { ...result } : {};
  if (memo != null) Object.defineProperty(out, 'memo', { value: memo, enumerable: false, configurable: true });
  return out;
}

function parentsResults(runId, d) {
  const out = {};
  for (const k of d.parents || []) {
    const p = rowOf(runId, k);
    if (p) out[k] = { taskId: p.taskId, status: p.status, result: pin(p.result, p.memo), made: p.made || {} };
  }
  return out;
}

function undoToast(text, undo, pid) {
  StudioUI.toast(text, {
    action: 'Undo',
    onAction: () => {
      Promise.resolve().then(() => undo())
        .then((ret) => { StudioUI.toast(ret === false ? 'Nothing to undo: it was changed since.' : 'Undone. The draft is ready to review again.', { type: 'info' }); })
        .catch(() => StudioUI.toastError('It could not be undone.'))
        .finally(() => { if (pid === S.pid) reload(); });
    }
  });
}

function saidOf(wrote, label) {
  const lines = (wrote || []).flatMap((w) => w.said || []).filter(Boolean);
  return lines.length ? lines.join(' ') : label + ': accepted.';
}

async function accept(runId, key, selected) {
  const pid = S.pid;
  const d = rowOf(runId, key);
  const res = await S.E.run.acceptDraft(pid, runId, key, selected);
  const undo = res.undo;
  undo.said = saidOf(res.wrote, (d && d.label) || key);
  if (pid === S.pid) await reload();
  return undo;
}

async function press(el, fn) {
  const card = el.closest('[data-ds-key]');
  const tag = card ? card.dataset.dsRun + '|' + card.dataset.dsKey : '';
  if (tag && S.busy.has(tag)) return;
  if (tag) { S.busy.add(tag); el.disabled = true; }
  try { await fn(card ? card.dataset.dsRun : '', card ? card.dataset.dsKey : ''); }
  catch (e) { StudioUI.toastError((e && e.message) || 'That did not work. Nothing was changed.'); }
  finally { if (tag) S.busy.delete(tag); paint(); }
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  /* The plan arrives after the first paint (signed in, billing read):
     the Pro button and Resume follow it. Nothing is written. */
  Store.subscribe('plan:changed', () => { if (S.host && S.host.isConnected) { paint(); estimate(); } });
  delegate(document, 'change', '#drafts input[data-ds-tick]', (e, el) => {
    if (el.checked) S.ticks.add(el.dataset.dsTick); else S.ticks.delete(el.dataset.dsTick);
    const go = S.host.querySelector('[data-action="ds-start"]');
    if (go && !S.live) go.disabled = !S.ticks.size;
    estimate();
  });
  delegate(document, 'click', '#drafts [data-action="ds-start"]', () => {
    if (S.live || !S.E || !S.ticks.size || !PlanGate.aiUnlocked()) return;
    drive((ctl, pid) => S.E.run.startRun({ projectId: pid, ticks: [...S.ticks], signal: ctl.signal, onUpdate: onUpdate(pid) }));
  });
  delegate(document, 'click', '#drafts [data-action="ds-resume"]', (e, el) => {
    const runId = el.dataset.dsRun;
    if (S.live || !S.E || !runId) return;
    drive((ctl, pid) => S.E.run.resumeRun(pid, runId, { signal: ctl.signal, onUpdate: onUpdate(pid) }).then((r) => ({ runId, done: r.done })));
  });
  delegate(document, 'click', '#drafts [data-action="ds-stop"]', () => {
    if (S.live) { S.live.ctl.abort(); say('Stopping. What has finished is kept.'); }
  });
  delegate(document, 'click', '#drafts [data-action="ds-accept"]', (e, el) => press(el, async (runId, key) => {
    const d = rowOf(runId, key);
    const undo = await accept(runId, key);
    say(((d && d.label) || key) + ': accepted.');
    undoToast(undo.said, undo, S.pid);
  }));
  delegate(document, 'click', '#drafts [data-action="ds-reject"]', (e, el) => press(el, async (runId, key) => {
    const d = rowOf(runId, key);
    await S.E.run.rejectDraft(S.pid, runId, key);
    /* Rejected is kept as a mark (the run's list stays whole); the answer goes. */
    await draftsOf(S.pid).update(runId, key, { result: null, memo: null });
    say(((d && d.label) || key) + ': rejected. Nothing was written.');
    await reload();
  }));
  delegate(document, 'click', '#drafts [data-action="ds-review"]', (e, el) => press(el, review));
}

async function review(runId, key) {
  const pid = S.pid;
  const d = rowOf(runId, key);
  if (!d || d.status !== 'ready') return;
  await S.E.headless.headlessReady();
  const ctx = S.E.headless.headlessCtx(d.taskId, d.ctx || {}, { parentsResults: parentsResults(runId, d) });
  const Desk = await import('./ai-desk.js');
  const stored = pin(d.result, d.memo);
  await Desk.openWithDraft(d.taskId, ctx, stored, {
    identity: runId + '|' + d.key + '|' + (d.endedAt || ''),
    run: d.aiRun || '', model: d.model || '',
    /* A refined version is the answer being accepted: it replaces the
       stored one first, so acceptDraft applies exactly what was shown. */
    accept: async (selected, result, info) => {
      if (info && info.version > 0) {
        const plain = { ...(result || {}) };
        await draftsOf(pid).update(runId, key, { result: JSON.parse(JSON.stringify(plain)), memo: result && result.memo !== undefined ? result.memo : null });
      }
      const undo = await accept(runId, key, selected);
      const inner = undo;
      const wrapped = async () => { const r = await inner(); if (pid === S.pid) reload(); return r; };
      wrapped.said = inner.said;
      return wrapped;
    },
    onAccepted: () => { say(((d && d.label) || key) + ': accepted.'); if (pid === S.pid) reload(); }
  });
}

export default { mountDraftSpace };
