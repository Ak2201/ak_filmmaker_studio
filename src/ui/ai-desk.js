/* ============================================================
   THE AI DESK — the sidebar every AI pill opens
   ------------------------------------------------------------
   The Desk is the docked right-hand sidebar (a full-height sheet
   on phones) every AI pill opens. It is LAZY: src/ui/ai-pill.js
   reaches it with `import('./ai-desk.js')` at a click, so nothing
   here is in any page's first paint.

   The contract below was fixed before the Desk was built, and the
   tasks (src/lib/ai-tasks.js) and proofs are written against it.
   Keep these exports and this shape.

   EXPORTS
     registerTask(task)       add or replace a task by id; returns task
     getTask(id)              the task, or null
     listTasks()              every registered task, in insertion order
     openDesk(taskId, ctx)    open the Desk on that task with that ctx
     closeDesk()              close it; the session (chat + versions)
                              stays in memory until reload

   TASK SHAPE
     {
       id:     string, unique
       label:  string, the name the Desk header and pill menu show
       kind:   'text' | 'list' | 'read'
       schema: the JSON schema the model answers against (the same
               object the existing ai.js function uses)
       input(ctx)            → the input the task will send, derived
                               from the ctx the pill was built with;
                               shown, editable, before the first send
       buildPrompt(input)    → { system, user } — what goes on the wire
       run(input, { onStatus, signal, refine })
                             → Promise of a kind-shaped result:
            'text' → { original: string, proposed: string, note?: string }
            'list' → { items: [{ id, text, detail? }] }
            'read' → { text: string, items?: [{ id, text, detail? }] }
                     (items: the points a read can keep, ticked like
                     a list's and handed to apply() the same way)
          `refine` is undefined on the first send, and on a chat
          refinement is { previous, instructions: string[] } where
          `previous` is the current version's result and
          `instructions` the numbered chat messages so far. A refine
          re-sends the same system prompt against the SAME schema.
       apply(selected, ctx, result, meta)
                             → performs the write through the owning
                               model (editor edit path, scenes.js,
                               blueprint-store writeFields). For 'text'
                               `selected` is the final merged string
                               (only the ticked hunks applied); for
                               'list' it is the array of chosen items;
                               `result` is the SHOWN version's run()
                               result, not the latest run's; `meta` is
                               { task, model, run, at } — which run wrote
                               this (the history's stamp, docs/AI-FAST-HARNESS.md);
                               'read' tasks may omit apply (a read with
                               an apply and items shows Accept). May return
                               an undo function (or a Promise of one),
                               which the Desk offers as an actionable
                               Undo toast. One Accept is one write. An undo
                               with a string `said` is the toast's words
                               instead of '<label>: applied.'
                               Returning null means nothing was written;
                               an undo returning false refused. A task
                               that reported through ctx.say is not
                               echoed by the Desk (ai-desk-outcome.js).
     }

   OPTIONAL TASK FIELDS (docs/AI-FAST-HARNESS.md §A5; none renamed)
     stream: true       run() gets opts.onItems(items[]) — Desk items, as a
                        'list' result holds them — and the Desk shows each
                        the moment it arrives, as a live version
     background: true   closing the Desk, or opening another task, does NOT
                        abort the run; reopening the same task and identity
                        shows the live session. Leaving the PAGE stops it
                        (nothing was written). One background run per task id.
     effortSwitch: true the Careful switch (aiCareful in the device prefs,
                        written on a click only); run() gets opts.careful
     runLabel(ctx)      the primary button's words; default 'Run'
     cost(ctx)          one line under it
     total(ctx)         how many units (scenes) a full run covers, for
                        "Stopped after 4 of 12 scenes"
     An item may carry `group` and `groupLabel`: items of one group sit
     under a header with its own checkbox (tick per scene).
     ctx.go === true runs at once on open — the page button that sets it
     must show disclose() beside it, because that press is the send.

   RULES
     - Chat and versions live in memory for this page only: no
       storage key, nothing written while idle, nothing in backups.
     - No key on this device → openDesk shows a single step linking
       to settings.html#ai. No key form exists in the Desk.
     - A locked plan never reaches openDesk: the pill stops it.
     - A task with `local: true` (src/lib/local-tasks.js — the Manual
       breakdown's shot and story proposals) is not AI at all: no key
       step, no Pro gate, no provider disclosure, no chat refinement;
       it runs the moment the Desk opens, and is rebuilt from the
       current data at every open. Same tick list, same Accept/Undo.
     - A ctx (or the ctx a ctx function resolves to) may carry
       `task: '<id>'` to hand the open over to another task — how the
       "Breakdown with AI" chain goes straight to the story review when
       every scene already has its shots (src/ui/breakdown-flow.js).
   ============================================================ */


/* ============================================================
   THE SIDEBAR
   ------------------------------------------------------------
   LAYOUT. One `aside.ai-desk` is appended to <body> on first open
   and reused. `html.ai-desk-open` is set while it shows.
     ≥1100px  docked right; its measured width is published as
              `--ai-desk-w` on <html>, and ai-desk.css gives `main`
              that much `margin-inline-end`, so the page NARROWS
              beside it (main is never translated — fragment
              landings depend on it).
     <1100px  a full-height sheet above the phone's bottom bar
              (`--mab-h`), with Tab held inside it (modal-focus.js),
              because at that width it covers the page.

   SELECTORS the proofs read (scripts/prove-ai-desk.mjs):
     header       .ai-desk-title, .ai-desk-model,
                  button[data-action="ai-desk-close"]
     what goes in details.ai-desk-editprompt > textarea.ai-desk-input (closed
                  until the "Edit prompt" link is opened), .ai-disclose,
                  button[data-action="ai-desk-run"],
                  input[data-action="ai-desk-careful"] (effortSwitch tasks)
     running      .ai-status[role=status], .ai-error[role=alert],
                  button[data-action="ai-desk-stop"]
     answer       .ai-hunk input[type=checkbox] ('text'),
                  .ai-desk-item input[type=checkbox] ('list'),
                  .ai-desk-read + span.ai-mark ('read'),
                  button[data-action="ai-desk-copy"] ('read' only),
                  button.ai-desk-ver ('v1', 'v2' … aria-pressed)
     chat         textarea.ai-desk-chat,
                  button[data-action="ai-desk-send"],
                  button.ai-desk-chip
     footer       [data-action="ai-desk-accept"] (hidden for a 'read'
                  with no apply or no items),
                  [data-action="ai-desk-accept-all"],
                  [data-action="ai-desk-skip"]
     no key       a[href="settings.html#ai"] and nothing else

   MEMORY. `sessions` holds { input, versions, chat } per task and
   ctx for this page visit. Nothing here touches localStorage or
   sessionStorage, and nothing runs while the Desk sits idle.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import PlanGate from '../lib/plan-gate.js';
import { hasKey, providerLabel, apiName, apiHost, getModel, models } from '../lib/ai-providers.js';
import { diffLines, mergeHunks } from '../lib/ai-diff.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import StudioUI from './chrome.js';
import { disclose, aiMark } from './ai-panel.js';
import { LOCAL_TASKS, ready as localReady } from '../lib/local-tasks.js';
import { listenSay, acceptNote, undoNote } from '../lib/ai-desk-outcome.js';
import { newId } from '../lib/record-id.js';
import { readAiCareful, saveAiCareful } from '../lib/chrome-prefs.js';
import '../styles/ai.css';
import '../styles/ai-desk.css';

const tasks = new Map();
const isLocal = (t) => !!(t && t.local);

export function registerTask(task) {
  if (!task || !task.id) throw new Error('[ai-desk] a task needs an id');
  tasks.set(task.id, task);
  return task;
}

export function getTask(id) {
  return tasks.get(id) || null;
}

export function listTasks() {
  return [...tasks.values()];
}

// The non-AI tasks are part of the Desk itself: registered at load.
for (const t of LOCAL_TASKS) registerTask(t);

/* ---- the tasks module, loaded once at the first open ---------- */
let tasksReady = null;
let tasksError = '';
function loadTasks() {
  if (!tasksReady) {
    // registerAll() may return a promise that settles once the tasks'
    // lazy dependencies load; it is awaited before any task.input(ctx).
    tasksReady = import('../lib/ai-tasks.js')
      .then((m) => { if (m && typeof m.registerAll === 'function') return m.registerAll(registerTask); })
      .catch((e) => {
        tasksError = 'The AI tools did not load (' + ((e && e.message) || 'unknown error') + '). Reload the page and try again.';
        console.warn('[ai-desk] ai-tasks.js did not load', e);
      });
  }
  return tasksReady;
}

/* ---- per-visit memory ---------------------------------------- */
const sessions = new Map();

function identity(ctx) {
  if (ctx == null) return '';
  if (typeof ctx !== 'object') return String(ctx);
  if (ctx.identity != null) return String(ctx.identity);
  try {
    return JSON.stringify(ctx, (k, v) => {
      if (k === 'go') return undefined;       // the one-press flag is not part of what a session is
      if (typeof v === 'function') return undefined;
      if (typeof Node !== 'undefined' && v instanceof Node) return undefined;
      return v;
    }) || '';
  } catch (e) { return ''; }
}

function sessionFor(task, ctx) {
  let ident;
  if (typeof task.identity === 'function') {
    try { ident = String(task.identity(ctx) ?? ''); } catch (e) { ident = identity(ctx); }
  } else ident = identity(ctx);
  const key = task.id + '|' + ident;
  const derive = () => {
    try { return String(task.input ? (task.input(ctx) ?? '') : ''); }
    catch (e) { console.warn('[ai-desk] task.input threw', e); return ''; }
  };
  let s = sessions.get(key);
  if (!s) {
    /* A run belongs to its session: `run` is the AbortController while a
       request is out, `bg` says it may outlive the Desk being closed. */
    s = { key, input: derive(), edited: false, versions: [], current: -1, chat: [], draft: '',
      run: null, bg: false, taskId: task.id, status: '', error: '', promptOpen: false };
    sessions.set(key, s);
  } else if (!s.versions.length && !s.edited) {
    /* Nothing has come back yet and the writer has not typed in the
       box: what goes in is re-derived, so a reopen shows what WILL be
       sent now (a coverage run that read part 1 before it failed
       sends one part fewer), never a copy frozen at the first open. */
    s.input = derive();
  }
  return s;
}

/* A version: the result, plus what the reader has unticked. */
function makeVersion(task, result) {
  const v = { result: result || {}, hunks: [], items: [], unticked: new Set() };
  if (task.kind === 'text') {
    v.hunks = diffLines(v.result.original ?? '', v.result.proposed ?? '');
  } else if (task.kind === 'list' || (task.kind === 'read' && Array.isArray(v.result.items))) {
    // The item objects are kept UNCHANGED — apply() reads fields of
    // its own on them (row, draft, sceneId, beat …). Ids live beside.
    v.items = [].concat(v.result.items || []).filter(Boolean);
    v.itemIds = v.items.map((it, i) => (it.id != null ? String(it.id) : 'i' + i));
  }
  return v;
}

/* ---- state of the open Desk ---------------------------------- */
let desk = null;        // the aside
let body = null;        // its scrolling body
let foot = null;        // the footer, outside the scroll
let open = false;
let opener = null;
let task = null;
let ctx = {};
let sess = null;
/* The run, its status line and its error live on the SESSION (sess.run,
   sess.status, sess.error): a background task's run goes on while the Desk
   shows something else or nothing at all. */
const busyNow = () => !!(sess && sess.run);
let mode = 'task';      // 'task' | 'nokey' | 'missing' | 'blocked'
let blockedWhy = null;  // a task's blocked(ctx) answer while mode is 'blocked'
let missingText = '';   // why a local task could not open
let held = false;

const WIDE = '(min-width: 1100px)';
const isWide = () => window.matchMedia(WIDE).matches;

/* A task may name the provider it needs (`provider: 'gemini'` — the
   storyboard's drawn frames, the one image model in the table) and its
   own model line (`modelLabel()`); every other task uses the active one. */
const provOf = (t) => (t && t.provider) || undefined;

function modelText() {
  if (isLocal(task)) return 'On this device · no AI';
  if (task && task.provider) {
    let m = '';
    try { m = typeof task.modelLabel === 'function' ? String(task.modelLabel() || '') : ''; } catch (e) { m = ''; }
    return providerLabel(task.provider) + (m ? ' · ' + m : '');
  }
  const id = getModel();
  const m = (models() || []).find((x) => x.id === id);
  return providerLabel() + ' · ' + (m ? m.label : id);
}

function ensureDesk() {
  if (desk) return desk;
  desk = h('aside.ai-desk', {
    role: 'dialog', 'aria-labelledby': 'ai-desk-title', 'aria-modal': 'false', hidden: true, tabindex: '-1'
  });
  body = h('div.ai-desk-body');
  foot = h('div.ai-desk-foothost');
  desk.append(body, foot);
  document.body.append(desk);
  wire();
  return desk;
}

/* ---- publishing the docked width ------------------------------ */
function publishWidth() {
  const root = document.documentElement;
  if (open && desk && isWide()) root.style.setProperty('--ai-desk-w', desk.offsetWidth + 'px');
  else root.style.removeProperty('--ai-desk-w');
  /* The footer's height, so a toast (an Undo from the last Accept never
     times out) is lifted clear of Accept / Skip on a phone instead of
     sitting over them — the chain in breakdown-flow.js opens one review
     straight after another. Measured, never assumed: it wraps. */
  if (open && foot) root.style.setProperty('--ai-desk-foot-h', foot.offsetHeight + 'px');
  else root.style.removeProperty('--ai-desk-foot-h');
  // Below 1100 the sheet covers the page, so Tab stays inside it.
  const want = open && !isWide();
  if (want && !held) { holdFocus(desk); held = true; }
  else if (!want && held) { releaseFocus(desk); held = false; }
}

/* ---- rendering ------------------------------------------------- */
function header() {
  return h('header.ai-desk-head', {}, [
    historyButton(),
    h('div.ai-desk-headtext', {}, [
      h('h2#ai-desk-title.ai-desk-title', { text: task ? task.label : 'AI' }),
      h('p.ai-desk-model', { text: modelText() })
    ]),
    h('button.btn.ai-desk-close', {
      type: 'button', 'data-action': 'ai-desk-close', 'aria-label': 'Close the AI Desk', text: 'Close'
    })
  ]);
}

function lineList(cls, lines, sign) {
  return h('div.' + cls, {}, lines.map((l) =>
    h('div.ai-line', {}, [
      h('span.ai-line-sign', { 'aria-hidden': 'true', text: sign }),
      h('span.ai-line-text', { text: l === '' ? ' ' : l })
    ])));
}

function answerText(v) {
  if (!v.hunks.length) return [h('p.ai-desk-empty', { text: 'No changes proposed — the answer matches what you sent.' })];
  return v.hunks.map((hk, i) => {
    const where = hk.removed.length ? 'line ' + (hk.start + 1) : 'after line ' + hk.start;
    return h('div.ai-hunk', { 'data-hunk': hk.id }, [
      h('label.ai-hunk-head', {}, [
        h('input', {
          type: 'checkbox', 'data-tick': 'hunk', 'data-id': hk.id,
          checked: !v.unticked.has(hk.id)
        }),
        h('span', { text: 'Change ' + (i + 1) + ' · ' + where })
      ]),
      hk.before ? h('p.ai-hunk-ctx', { text: hk.before }) : null,
      hk.removed.length ? lineList('ai-hunk-del', hk.removed, '−') : null,
      hk.added.length ? lineList('ai-hunk-add', hk.added, '+') : null
    ]);
  });
}

/* Items that carry a `group` (a scene) sit under a header with its own
   checkbox: tick or untick the whole scene. */
function groupHeader(v, it) {
  const ids = v.items.map((x, j) => (x.group === it.group ? v.itemIds[j] : null)).filter(Boolean);
  return h('label.ai-desk-group', {}, [
    h('input', {
      type: 'checkbox', 'data-tick': 'group', 'data-group': String(it.group),
      checked: ids.every((id) => !v.unticked.has(id)), 'aria-label': 'Tick every item of ' + String(it.groupLabel || it.group)
    }),
    h('span', { text: String(it.groupLabel || it.group) })
  ]);
}

function answerList(v) {
  if (!v.items.length) {
    return [h('p.ai-desk-empty', { text: v.live ? 'Waiting for the first scene…' : 'Nothing came back to choose from.' })];
  }
  const rows = [];
  let lastGroup = null;
  v.items.forEach((it, i) => {
    if (it.group != null && it.group !== lastGroup) rows.push(groupHeader(v, it));
    lastGroup = it.group != null ? it.group : null;
    rows.push(itemRow(v, it, i));
  });
  return rows;
}

function itemRow(v, it, i) {
  return (
    h('label.ai-desk-item' + (it.group != null ? '.ai-desk-ingroup' : ''), {}, [
      h('input', { type: 'checkbox', 'data-tick': 'item', 'data-id': v.itemIds[i], checked: !v.unticked.has(v.itemIds[i]) }),
      h('div.ai-desk-itemtext', {}, [
        /* A picture to judge before it is kept (board-frames): an object
           URL for a Blob held in this session only. */
        typeof it.image === 'string' && /^blob:/.test(it.image)
          ? h('img.ai-desk-pic', { src: it.image, alt: String(it.alt || it.text || 'Generated picture') })
          : null,
        h('strong', { text: String(it.text ?? '') }),
        it.detail ? h('p', { text: String(it.detail) }) : null
      ])
    ]));
}

/* A read keeps its prose; when it also returns items (the points it
   can keep as notes), they follow as the same tick list a 'list' has. */
function answerRead(v) {
  const read = h('div.ai-desk-read', {}, [
    aiMark(),
    h('div.ai-desk-readtext', { text: String(v.result.text ?? '') }),
    /* Every read result can be copied out (docs/AI-EVERYWHERE.md, task 5):
       it changes nothing, and the writer often wants it in a message. */
    h('button.btn.ai-desk-copy', { type: 'button', 'data-action': 'ai-desk-copy', text: 'Copy' })
  ]);
  if (!v.items.length) return [read];
  return [read, h('h3.ai-desk-label', { text: 'Keep as notes' }), ...answerList(v)];
}

/* Does this version have anything Accept can write? A 'read' only when
   its task has an apply and the run gave it points to keep. */
const canAccept = (t, v) => t.kind !== 'read' || (typeof t.apply === 'function' && !!v && v.items.length > 0);

const liveNow = () => !!(sess && sess.run && sess.versions.some((x) => x.live));

function statusLines() {
  const err = sess ? sess.error : '';
  return h('div.ai-desk-lines', {}, [
    h('p.ai-status' + (liveNow() ? '.ai-desk-progress' : ''), { role: 'status', text: sess ? sess.status : '' }),
    err ? h('p.ai-error', { role: 'alert' }, [
      h('strong', { text: 'It did not run. ' }), h('span', { text: err })
    ]) : null,
    busyNow() ? h('button.btn.ai-desk-stop', { type: 'button', 'data-action': 'ai-desk-stop', text: 'Stop' }) : null
  ]);
}

/* The answer section's children, shared by a full render and by the
   lighter refresh a live card arrival does (no focus or scroll lost). */
function answerSection(v) {
  const vers = h('div.ai-desk-vers', { role: 'group', 'aria-label': 'Versions' },
    sess.versions.map((_, i) => h('button.ai-desk-ver', {
      type: 'button', 'data-action': 'ai-desk-ver', 'data-i': String(i),
      'aria-pressed': i === sess.current ? 'true' : 'false', text: 'v' + (i + 1)
    })));
  const answer = task.kind === 'text' ? answerText(v) : task.kind === 'list' ? answerList(v) : answerRead(v);
  const note = v.live
    ? 'Cards appear as each scene arrives. Nothing is written until you accept.'
    : (v.result.note ? String(v.result.note) : '');
  return [
    h('div.ai-desk-answerhead', {}, [h('h3.ai-desk-label', { text: 'The answer' }), vers]),
    note ? h('p.ai-desk-note', { text: note }) : null,
    ...answer
  ];
}

/** A live card arrived: patch the answer in place. */
function refreshAnswer() {
  if (!desk || !open || !sess) return;
  const v = sess.versions[sess.current];
  const host = desk.querySelector('.ai-desk-answer');
  if (!v || !host) { render(); return; }
  const keep = body.scrollTop;
  host.replaceChildren(...answerSection(v).filter(Boolean));
  body.scrollTop = keep;
}

function render() {
  if (!desk) return;
  if (historyOpen) return showHistory();
  const keepScroll = body.scrollTop;
  foot.replaceChildren();
  if (mode === 'nokey') {
    body.replaceChildren(header(), h('section.ai-desk-sec', {}, [
      h('p', { text: task && task.provider
        ? 'This tool runs on ' + apiName(task.provider) + ' with your own ' + providerLabel(task.provider)
          + ' key, and this device does not have one yet.'
        : 'AI tools run on your own key, and this device does not have one yet.' }),
      h('a.btn.primary.ai-desk-settings', { href: 'settings.html#ai', text: 'Add your AI key in Settings →' })
    ]));
    return;
  }
  if (mode === 'blocked') {
    /* A task that cannot run here yet says why before anything is sent
       (board-frames: signed out, Drive not connected, Drive token
       lapsed). `href` goes to the fix; `reconnect` asks the task to fix
       it on this click (task.unblock), then the Desk re-opens. */
    const why = blockedWhy || {};
    body.replaceChildren(header(), h('section.ai-desk-sec.ai-desk-blocked', {}, [
      h('p.ai-desk-why', { role: 'status', text: why.text || 'This tool cannot run here yet.' }),
      why.reconnect ? h('button.btn.primary.ai-desk-unblock', {
        type: 'button', 'data-action': 'ai-desk-unblock', text: why.reconnectLabel || 'Reconnect Drive'
      }) : null,
      why.href ? h('a.btn.primary.ai-desk-fix', { href: why.href, text: (why.hrefLabel || 'Fix this') + ' →' }) : null
    ]));
    return;
  }
  if (mode === 'missing') {
    body.replaceChildren(header(), h('section.ai-desk-sec', {}, [
      h('p.ai-error', { role: 'alert' }, [
        h('strong', { text: 'Not available. ' }),
        h('span', { text: missingText || tasksError || 'This AI tool is not available on this page.' })
      ])
    ]));
    return;
  }

  const v = sess.versions[sess.current] || null;
  const busy = busyNow();
  const kids = [header()];

  const local = isLocal(task);
  const runWords = (() => {
    try { return (typeof task.runLabel === 'function' && String(task.runLabel(ctx) || '')) || 'Run'; } catch (e) { return 'Run'; }
  })();
  const costLine = (() => {
    try { return typeof task.cost === 'function' ? String(task.cost(ctx) || '') : ''; } catch (e) { return ''; }
  })();
  const promptBox = h('textarea.ai-desk-input', {
    rows: local ? '4' : '8', 'aria-label': local ? 'What it reads' : 'What goes in', spellcheck: 'false',
    readonly: task.editable === false || sess.versions.length > 0 || busy ? true : null
  });
  kids.push(h('section.ai-desk-sec.ai-desk-in', {}, [
    local ? h('h3.ai-desk-label', { text: 'What it reads' }) : null,
    local ? promptBox : null,
    local
      ? h('p.ai-desk-note', { text: 'Built on this device from your script and scene list. Nothing is sent anywhere, and nothing is kept until you accept.' })
      : disclose('When you press ' + runWords + ', the prompt behind the link below is sent to ' + apiName(provOf(task)) + ' at ' + apiHost(provOf(task))
        + ' with your key, and nowhere else. Chat refinements send it again with your requests.'),
    !local && task.effortSwitch ? h('label.ai-desk-careful', {}, [
      h('input', { type: 'checkbox', 'data-action': 'ai-desk-careful', checked: readAiCareful(), disabled: busy ? true : null }),
      h('span', { text: 'Careful \u2014 slower, more thorough' })
    ]) : null,
    sess.versions.length ? null : h('button.btn.primary.ai-desk-run', {
      type: 'button', 'data-action': 'ai-desk-run', disabled: busy ? true : null, text: busy ? 'Running\u2026' : runWords
    }),
    !local && costLine && !sess.versions.length ? h('p.ai-desk-cost', { text: costLine }) : null,
    /* The prompt is optional reading, not a step: closed until asked for. */
    local ? null : h('details.ai-desk-editprompt', { open: sess.promptOpen ? true : null }, [
      h('summary', { text: task.editable === false ? 'See what is sent' : 'Edit prompt' }),
      promptBox
    ])
  ]));

  kids.push(statusLines());

  if (v) {
    kids.push(h('section.ai-desk-sec.ai-desk-answer', {}, answerSection(v).filter(Boolean)));

    if (!isLocal(task)) kids.push(h('section.ai-desk-sec.ai-desk-talk', {}, [
      h('h3.ai-desk-label', { text: 'Ask for changes' }),
      h('div.ai-desk-chips', {}, (Array.isArray(task.chips) && task.chips.length ? task.chips : ['Shorter', 'Keep my wording', 'More tension', 'In Tanglish']).map((c) =>
        h('button.ai-desk-chip', { type: 'button', 'data-action': 'ai-desk-chip', 'data-say': c, disabled: busy ? true : null, text: c }))),
      sess.chat.length ? h('ol.ai-desk-asked', {}, sess.chat.map((m) => h('li', { text: m }))) : null,
      h('textarea.ai-desk-chat', { rows: '2', 'aria-label': 'Ask for a change', placeholder: 'e.g. keep the second line as it was' }),
      h('button.btn.ai-desk-send', { type: 'button', 'data-action': 'ai-desk-send', disabled: busy ? true : null, text: 'Send' })
    ]));
  }

  const read = !canAccept(task, v);
  foot.replaceChildren(h('footer.ai-desk-foot', {}, [
    read ? null : h('button.btn.primary.ai-desk-accept', {
      type: 'button', 'data-action': 'ai-desk-accept', disabled: !v || busy ? true : null, text: 'Accept selected'
    }),
    read ? null : h('button.btn.ai-desk-acceptall', {
      type: 'button', 'data-action': 'ai-desk-accept-all', disabled: !v || busy ? true : null, text: 'Accept all'
    }),
    h('button.btn.ai-desk-skip', {
      type: 'button', 'data-action': 'ai-desk-skip',
      text: read ? 'Done' : (busy && sess.bg ? 'Close \u2014 keeps drafting' : 'Skip')
    })
  ]));

  body.replaceChildren(...kids);
  // Values are set as properties: a textarea's attribute is not its value.
  const inp = body.querySelector('.ai-desk-input');
  if (inp) inp.value = sess.input;
  const chat = body.querySelector('.ai-desk-chat');
  if (chat) chat.value = sess.draft;
  body.scrollTop = keepScroll;
}

/** Text to the clipboard: the async API, else a hidden textarea. */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  try {
    const t = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', readonly: 'readonly' });
    t.value = text;
    t.style.position = 'fixed'; t.style.opacity = '0';
    desk.append(t);
    t.select();
    const okay = document.execCommand('copy');
    t.remove();
    return !!okay;
  } catch (e) { return false; }
}

function setStatus(text, own = sess) {
  if (!own) return;
  own.status = text || '';
  if (own !== sess || !desk) return;
  const el = desk.querySelector('.ai-desk-lines .ai-status');
  if (el) el.textContent = own.status;
}

/* ---- running --------------------------------------------------- */
/* A live card (or several) arrived from the task's run(): add them to
   the live version by id (a retried batch re-sends a scene; the later
   copy replaces the earlier one), and patch the answer in place. */
function addLive(own, live, items) {
  for (const it of [].concat(items || []).filter(Boolean)) {
    const id = it.id != null ? String(it.id) : 'i' + live.items.length;
    const at = live.itemIds.indexOf(id);
    if (at >= 0) { live.items[at] = it; continue; }
    live.items.push(it);
    live.itemIds.push(id);
  }
  if (open && sess === own && own.versions[own.current] === live) refreshAnswer();
}

const groupsOf = (items) => new Set(items.filter((it) => it.group != null).map((it) => it.group)).size;

function stopNote(t, c, items) {
  const n = groupsOf(items) || items.length;
  let total = 0;
  try { total = typeof t.total === 'function' ? Number(t.total(c)) || 0 : 0; } catch (e) { total = 0; }
  return 'Stopped after ' + n + (total ? ' of ' + total : '') + (n === 1 ? ' scene' : ' scenes')
    + '. Nothing is written until you accept.';
}

async function run(refineWith) {
  if (!task || !sess || sess.run) return;
  const own = sess;
  const myTask = task;
  const myCtx = ctx;
  const ctl = new AbortController();
  own.run = ctl;
  own.bg = !!myTask.background && !isLocal(myTask);
  own.taskId = myTask.id;
  own.error = '';
  own.status = refineWith ? 'Refining\u2026' : 'Sending\u2026';
  const runId = newId('air');
  const careful = readAiCareful();          // read once: fixed for the whole run
  const previous = refineWith ? own.versions[own.current].result : undefined;
  let live = null;
  if (myTask.stream && !isLocal(myTask)) {
    live = makeVersion(myTask, { items: [] });
    live.live = true;
    live.run = runId;
    own.versions.push(live);
    own.current = own.versions.length - 1;
  }
  render();
  try {
    const refine = refineWith ? { previous, instructions: refineWith } : undefined;
    let result = await myTask.run(own.input, {
      onStatus: (m) => { if (own.run === ctl) setStatus(m, own); },
      signal: ctl.signal, ctx: myCtx, refine, careful,
      onItems: live ? (items) => { if (own.run === ctl) addLive(own, live, items); } : undefined
    });
    const stopped = ctl.signal.aborted;
    if (stopped && !(live && result && Array.isArray(result.items) && result.items.length)) {
      throw Object.assign(new Error('Stopped. Nothing was changed.'), { code: 'aborted' });
    }
    if (refineWith) { own.chat = refineWith.slice(); own.draft = ''; }
    result = result || {};
    if (stopped) result = { ...result, note: stopNote(myTask, myCtx, result.items) + (result.note ? '\n' + result.note : '') };
    let v;
    if (live) {
      const fresh = makeVersion(myTask, result);
      Object.assign(live, { result: fresh.result, items: fresh.items, itemIds: fresh.itemIds, live: false });
      v = live;
    } else {
      v = makeVersion(myTask, result);
      v.run = runId;
      own.versions.push(v);
      own.current = own.versions.length - 1;
    }
    own.status = stopped ? 'Stopped. Nothing is written until you accept.' : 'v' + own.versions.length + ' is ready.';
  } catch (e) {
    const stopped = (e && (e.kind === 'aborted' || e.code === 'aborted' || e.name === 'AbortError')) || ctl.signal.aborted;
    const msg = (e && e.message) || 'Something went wrong.';
    if (live && live.items.length) {
      /* Keep what arrived: every card is still a reviewed choice. */
      live.result = {
        items: live.items.slice(),
        note: stopped ? stopNote(myTask, myCtx, live.items)
          : 'The run ended early (' + msg + ') — the scenes below arrived. Nothing is written until you accept.'
      };
      live.live = false;
      own.status = stopped ? 'Stopped. Nothing is written until you accept.' : '';
      own.error = stopped ? '' : msg;
    } else {
      if (live) {
        own.versions.splice(own.versions.indexOf(live), 1);
        own.current = own.versions.length - 1;
      }
      own.status = stopped ? 'Stopped. Nothing was changed.' : '';
      own.error = stopped ? '' : msg;
    }
  } finally {
    if (own.run === ctl) own.run = null;
  }
  if (open && sess === own) {
    render();
    const focus = desk.querySelector(own.error ? '.ai-error' : '.ai-desk-answer .ai-desk-ver[aria-pressed="true"]');
    if (focus) focus.focus();
  } else if (own.bg && !own.error && !ctl.signal.aborted && own.versions.length) {
    /* A background run finished while the Desk was closed or on another
       task: say so, with the one button that gets back to it. */
    StudioUI.toast(myTask.label + ' is ready in the AI Desk. Nothing is written until you accept.', {
      action: 'Open', onAction: () => { openDesk(myTask.id, myCtx); }
    });
  }
}

function send(text) {
  const msg = String(text || '').trim();
  if (!msg || !sess || !sess.versions.length || isLocal(task)) return;
  run([...sess.chat, msg]);
}

/* ---- accepting --------------------------------------------------- */
async function accept(all) {
  if (!task || !sess || sess.run) return;
  const v = sess.versions[sess.current];
  if (!v) return;
  let selected;
  if (task.kind === 'text') {
    const ids = v.hunks.map((hk) => hk.id).filter((id) => all || !v.unticked.has(id));
    if (!ids.length && v.hunks.length) { setStatus('Nothing is ticked, so there is nothing to accept.'); return; }
    selected = mergeHunks(v.result.original ?? '', v.hunks, ids);
  } else if (task.kind === 'list' || canAccept(task, v)) {
    selected = v.items.filter((it, i) => all || !v.unticked.has(v.itemIds[i]));
    if (!selected.length) { setStatus('Nothing is ticked, so there is nothing to accept.'); return; }
  } else {
    closeDesk();
    return;
  }
  if (typeof task.apply !== 'function') { closeDesk(); return; }
  let undo;
  /* A task that told the page what happened (ctx.say) is not followed by
     the Desk's own "applied." / "Undone." — ai-desk-outcome.js. */
  const heard = listenSay(ctx);
  try {
    /* The fourth argument says which run wrote this: the stamp the
       history reads (docs/AI-FAST-HARNESS.md). A local task is no AI. */
    const meta = {
      task: task.id,
      model: isLocal(task) ? '' : String((v.result && v.result.model) || getModel() || ''),
      run: v.run || newId('air'),
      at: new Date().toISOString()
    };
    undo = await task.apply(selected, heard.ctx, v.result, meta);
    v.accepted = true;
  } catch (e) {
    sess.error = (e && e.message) || 'The change could not be written. Nothing was changed.';
    render();
    return;
  }
  const label = task.label;
  closeDesk();
  if (typeof undo === 'function') {
    // An actionable toast never times out (chrome.js); Undo is reachable.
    // A task may say what the Accept did: `said` replaces the whole line (a
    // read task's notes, ai-tasks.js keepNotes), `note` is appended to it
    // (ai-tasks.js withNote: what it left out matters as much as what it
    // wrote). Both survive, so a tool can use either.
    const head = typeof undo.said === 'string' && undo.said ? undo.said : label + ': applied.';
    const said = typeof undo.note === 'string' && undo.note ? ' ' + undo.note : '';
    StudioUI.toast(head + said, {
      action: 'Undo',
      onAction: () => {
        heard.reset();
        Promise.resolve().then(() => undo())
          .then((ret) => { const t = undoNote(ret, heard.spoke()); if (t) StudioUI.toast(t, { type: 'info' }); })
          .catch(() => StudioUI.toastError('It could not be undone.'));
      }
    });
  } else {
    const n = acceptNote(undo, heard.spoke(), label);
    if (n && n.type === 'success') StudioUI.toastSuccess(n.text);
    else if (n) StudioUI.toast(n.text, { type: 'info' });
  }
}

/* ---- open / close ---------------------------------------------- */
function onResize() { if (open) publishWidth(); }

function onDocKey(e) {
  if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
  // A dialog over the Desk holds focus and takes its own Escape, so
  // only an Escape from inside the Desk (or from nowhere) closes it.
  const inDesk = desk.contains(document.activeElement);
  if (!inDesk && document.activeElement && document.activeElement !== document.body) return;
  e.preventDefault();
  closeDesk();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  delegate(desk, 'click', '[data-action="ai-desk-close"]', () => closeDesk());
  delegate(desk, 'click', '[data-action="ai-desk-skip"]', () => closeDesk());
  delegate(desk, 'click', '[data-action="ai-desk-copy"]', () => {
    const v = sess && sess.versions[sess.current];
    if (!v || !v.result) return;
    copyText(String(v.result.text ?? '')).then(
      (okay) => setStatus(okay ? 'Copied. Nothing was changed.' : 'Could not copy. Select the text and copy it by hand.'));
  });
  delegate(desk, 'click', '[data-action="ai-desk-run"]', () => run());
  delegate(desk, 'click', '[data-action="ai-desk-unblock"]', (e, el) => {
    if (!task || typeof task.unblock !== 'function') return;
    el.disabled = true;
    const id = task.id;
    const again = ctx;
    Promise.resolve().then(() => task.unblock())
      .then(() => openDesk(id, again))
      .catch((err) => {
        el.disabled = false;
        const why = desk.querySelector('.ai-desk-why');
        if (why) why.textContent = 'It did not reconnect (' + String((err && err.message) || 'dismissed').slice(0, 120) + '). Try again.';
      });
  });
  delegate(desk, 'click', '[data-action="ai-desk-stop"]', () => {
    if (sess && sess.run) { sess.run.abort(); setStatus('Stopping…'); }
  });
  /* The Careful switch: how this device asks, written on the click. */
  delegate(desk, 'change', 'input[data-action="ai-desk-careful"]', (e, el) => { saveAiCareful(el.checked); });
  /* `toggle` does not bubble; the capture phase sees it. The open state
     of "Edit prompt" survives the redraws a run causes. */
  desk.addEventListener('toggle', (e) => {
    if (sess && e.target && e.target.classList && e.target.classList.contains('ai-desk-editprompt')) sess.promptOpen = e.target.open;
  }, true);
  delegate(desk, 'click', '[data-action="ai-desk-ver"]', (e, el) => {
    const i = Number(el.dataset.i);
    if (!sess || !(i >= 0 && i < sess.versions.length)) return;
    sess.current = i;
    render();
    const now = desk.querySelector('.ai-desk-ver[data-i="' + i + '"]');
    if (now) now.focus();
  });
  delegate(desk, 'click', '[data-action="ai-desk-send"]', () => {
    const chat = desk.querySelector('.ai-desk-chat');
    send(chat ? chat.value : '');
  });
  delegate(desk, 'click', '[data-action="ai-desk-chip"]', (e, el) => send(el.dataset.say));
  delegate(desk, 'click', '[data-action="ai-desk-accept"]', () => accept(false));
  delegate(desk, 'click', '[data-action="ai-desk-accept-all"]', () => accept(true));

  delegate(desk, 'change', 'input[data-tick]', (e, el) => {
    const v = sess && sess.versions[sess.current];
    if (!v) return;
    if (el.dataset.tick === 'group') {
      /* Tick or untick every item of one scene, and the boxes with it. */
      v.items.forEach((it, i) => {
        if (String(it.group) !== el.dataset.group) return;
        if (el.checked) v.unticked.delete(v.itemIds[i]); else v.unticked.add(v.itemIds[i]);
      });
      desk.querySelectorAll('input[data-tick="item"]').forEach((box) => {
        const at = v.itemIds.indexOf(box.dataset.id);
        if (at >= 0 && String(v.items[at].group) === el.dataset.group) box.checked = el.checked;
      });
      return;
    }
    if (el.checked) v.unticked.delete(el.dataset.id); else v.unticked.add(el.dataset.id);
    /* The scene's own box follows its items. */
    if (el.dataset.tick === 'item') {
      const at = v.itemIds.indexOf(el.dataset.id);
      const g = at >= 0 ? v.items[at].group : null;
      if (g != null) {
        const head = desk.querySelector('input[data-tick="group"][data-group="' + CSS.escape(String(g)) + '"]');
        if (head) head.checked = v.items.every((it, i) => String(it.group) !== String(g) || !v.unticked.has(v.itemIds[i]));
      }
    }
  });
  delegate(desk, 'input', '.ai-desk-input', (e, el) => { if (sess) { sess.input = el.value; sess.edited = true; } });
  delegate(desk, 'input', '.ai-desk-chat', (e, el) => { if (sess) sess.draft = el.value; });
  delegate(desk, 'keydown', '.ai-desk-chat', (e, el) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(el.value); }
  });

  document.addEventListener('keydown', onDocKey);
  window.addEventListener('resize', onResize);
  delegate(desk, 'click', '[data-action="ai-desk-history"]', () => toggleHistory());
}

export async function openDesk(taskId, ctxArg = {}) {
  // The pill asks the Pro question; a local (non-AI) task needs no plan.
  if (!isLocal(getTask(taskId)) && !PlanGate.aiUnlocked()) return;
  const from = document.activeElement;
  let c = ctxArg;
  if (typeof c === 'function') {
    try { c = await c(); } catch (e) { console.warn('[ai-desk] ctx() threw', e); c = {}; }
  }
  c = c || {};
  if (c.cancel) return;                    // the ctx factory decided not to open
  if (c.task && c.task !== taskId) {       // a hand-over to another task
    taskId = String(c.task);
    if (!isLocal(getTask(taskId)) && !PlanGate.aiUnlocked()) return;
  }

  ensureDesk();
  missingText = '';

  const local = isLocal(getTask(taskId));
  let localFail = '';
  if (local) {
    try { await localReady(); }
    catch (e) { localFail = 'The breakdown tools did not load (' + ((e && e.message) || 'unknown error') + '). Reload the page and try again.'; }
  } else await loadTasks();
  if (local && localFail) {
    mode = 'missing';
    missingText = localFail;
    task = getTask(taskId);
    sess = null;
  } else if (local) {
    mode = 'task';
    task = getTask(taskId);
    ctx = c;
    // Rebuilt from the data as it is now, at every open.
    for (const k of [...sessions.keys()]) if (k.startsWith(task.id + '|')) sessions.delete(k);
    sess = sessionFor(task, ctx);
  } else if (!hasKey(provOf(getTask(taskId)))) {
    mode = 'nokey';
    task = getTask(taskId);
    sess = null;
  } else if (getTask(taskId) && typeof getTask(taskId).blocked === 'function'
    && (blockedWhy = (() => { try { return getTask(taskId).blocked(c); } catch (e) { return { text: (e && e.message) || 'This tool cannot run here yet.' }; } })())) {
    mode = 'blocked';
    task = getTask(taskId);
    ctx = c;
    sess = null;
  } else {
    task = getTask(taskId);
    if (!task) {
      mode = 'missing';
      sess = null;
    } else {
      mode = 'task';
      ctx = c;
      sess = sessionFor(task, ctx);
    }
  }

  /* Runs left behind: a run that is not a background one stops (as ever);
     a background run goes on — unless this open is the SAME task asking
     for something else (one background run per task id). */
  for (const o of sessions.values()) {
    if (o.run && o !== sess && (!o.bg || (task && o.taskId === task.id))) o.run.abort();
  }
  if (sess && !sess.run) { sess.status = ''; sess.error = ''; }

  if (!open) opener = from && from !== document.body ? from : null;
  open = true;
  desk.hidden = false;
  document.documentElement.classList.add('ai-desk-open');
  render();
  publishWidth();
  const first = desk.querySelector(mode === 'task'
    ? (sess && sess.versions.length ? '.ai-desk-ver[aria-pressed="true"]' : '.ai-desk-run, .ai-desk-input')
    : (mode === 'nokey' ? 'a[href="settings.html#ai"]'
      : mode === 'blocked' ? '.ai-desk-unblock, .ai-desk-fix, [data-action="ai-desk-close"]' : '[data-action="ai-desk-close"]'));
  (first || desk).focus();
  if (local && mode === 'task' && sess && !sess.versions.length) run();   // nothing to spend: build the list now
  /* One press: the page button asked for the run (and showed the
     provider disclosure beside itself). A session whose answers were all
     accepted starts a fresh run; one with an unaccepted answer shows it. */
  else if (c.go === true && mode === 'task' && sess && !isLocal(task) && !sess.run
    && sess.versions.every((x) => x.accepted)) run();
}

export function closeDesk() {
  if (!desk || !open) return;
  /* Closing stops a request — except a background one, which fills its
     session while the Desk is away (nothing is written either way). */
  if (sess && sess.run && !sess.bg) sess.run.abort();
  open = false;
  if (held) { releaseFocus(desk); held = false; }
  desk.hidden = true;
  document.documentElement.classList.remove('ai-desk-open');
  document.documentElement.style.removeProperty('--ai-desk-w');
  document.documentElement.style.removeProperty('--ai-desk-foot-h');
  const back = opener;
  opener = null;
  if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  // a chain of reviews (breakdown-flow.js) waits for this to say its
  // own result once the last review has gone, not over the top of it
  window.dispatchEvent(new Event('ai-desk:closed'));
}

export default { registerTask, getTask, listTasks, openDesk, closeDesk };

/* ==== HISTORY TAB (Lane B) ====================================
   docs/AI-FAST-HARNESS.md B6(a): the project's AI-made items grouped by
   run, in the Desk. Reads only; opening it writes nothing. The list is
   src/ui/ai-history-view.js (lazy), drawn into this body. It shows for
   as long as the task and ctx the Desk was on when it was opened are
   still the ones on show: pressing a pill (a new task, a new ctx) lands
   on that task, not on a stale History. */
import('../styles/ai-history.css');
let historyOpen = false;
let histTask = null;
let histCtx = null;

function historyButton() {
  return h('button.btn.ai-desk-histbtn', {
    type: 'button', 'data-action': 'ai-desk-history', 'aria-pressed': String(historyOpen),
    title: 'What AI has drafted in this film', text: 'History'
  });
}

function toggleHistory() {
  historyOpen = !historyOpen;
  histTask = task;
  histCtx = ctx;
  render();
  const b = desk && desk.querySelector('.ai-desk-histbtn');
  if (b) b.focus();
}

function showHistory() {
  if (task !== histTask || ctx !== histCtx) { historyOpen = false; render(); return; }
  const host = h('section.ai-desk-sec.ai-desk-history', { 'aria-label': 'AI history' });
  body.replaceChildren(header(), host);
  foot.replaceChildren();
  import('./ai-history-view.js').then((m) => m.mountHistory(host, { compact: true }));
}

window.addEventListener('ai-desk:closed', () => { historyOpen = false; });
