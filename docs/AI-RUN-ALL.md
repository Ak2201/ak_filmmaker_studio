# AI Run all — the contract (3 Nov 2026)

"Break down everything" asks every ticked AI tool for a draft in one press.
The run goes on in the background, each answer is kept as a DRAFT, and
nothing reaches the film until somebody accepts it. This file is the
contract. Where it and CLAUDE.md disagree, CLAUDE.md wins.

Status: built on `develop` (merged from `ar/l0-harness`, `ar/l1-engine`,
`ar/l2-space`, then the review fixes in `c7246c2`). Never run against a
real provider. Every check used a faked reply.

Files:

| File | Role |
| --- | --- |
| `src/lib/ai-run-all-model.js` | `planRun()`, pure: which nodes run, in which wave, what each one reads, and why a node is skipped |
| `src/lib/ai-run-all.js` | The engine: `startRun`, `resumeRun`, `rejectDraft`, `acceptDraft`, `projectState`, `mapDraftIds` |
| `src/lib/ai-drafts.js` | The draft store (IndexedDB in the browser, an in-memory backend in Node) |
| `src/lib/ai-headless-ctx.js` | Builds each task's `ctx` from the models, with no page DOM |
| `src/ui/draft-space.js` | The view: `preprod.html#drafts`, lazy-loaded |
| `src/lib/ai-tasks.js` (+ `-preprod`, `-story`, `-post`) | The tasks themselves. Run all calls each task's `run()` and `apply()` and changes neither |

Tests: `npm run test:ai-run-all` (96 checks: the plan, the store, the pool
with faked tasks, the real tasks over a fake provider, Accept, undo,
resume, the review fixes), `npm run prove:ai-run-all` (browser, 37 checks,
in `.github/workflows/gate.yml`). Request sizing is `npm run test:ai-size`
(213); see `docs/AI-FAST-HARNESS.md` section E.

## 1. Rules that do not bend

1. **Nothing is written to the film before Accept.** The engine only reads
   and asks. A task's `run()` is the Desk's contract and holds here too.
2. **Drafts are a device-only cache, outside every storage registry.** They
   live in IndexedDB database `fms-ai-drafts`, object store `drafts`, keyed
   `[projectId, runId, key]`. They are NOT in `localStorage`, no storage key
   was added, and they are in none of `PROJECT_KEYS`, `GLOBAL_KEYS` or
   `ALL_KEYS`. So a backup, a restore and the Drive or Supabase sync never
   carry them, and they never leave the browser. A draft can hold Blobs
   (storyboard pictures) that `localStorage` could not hold anyway.
3. **Every draft is kept 14 days.** Each open of the store sweeps what is
   older (`KEEP_DAYS`). A run nobody came back to does not sit in the
   browser for ever.
4. **Pro only, fails closed.** `startRun` and `resumeRun` call
   `aiUnlocked()` before anything is planned. `acceptDraft` checks it too.
   A lapsed plan keeps its drafts to read and to reject, not to apply.
   Reject writes nothing to the film, so it stays open to a locked account.
5. **Disclose before the press.** The Desk-style notice is in
   `draft-space.js`: what is sent, to which provider and host, with which
   key, and roughly how many requests (`planRun` plus `estimate`). The
   button is "Break down everything", with a Stop beside it.
6. **One film per run.** A run belongs to the project it started in. See
   section 6.

## 2. The plan: waves and the DAG

`planRun({ ticks, project })` returns nodes in wave order. A node is
`{ key, taskId, label, ctx, wave, parents, needsParent?, skip? }`.

| Wave | Tasks | Reads |
| --- | --- | --- |
| 1 | `breakdown-tags`, `scene-notes`, `genre-comps`, `shot-draft`, `shoot-order`, `recce-notes`, `character-arcs` | The project as it is now |
| 2 | `blocking-draft` (one node per scene), `budget-estimate`, `callsheet-notes`, `board-frames` | What a wave-1 draft WOULD write |

- **Opt-in:** `board-frames` runs only when ticked by name (it costs
  pictures and needs a Gemini key and Google Drive). Absent ticks mean every
  other tool.
- **Parents.** `blocking-draft:<sceneId>` has parent `shot-draft` when the
  scene's shots are only drafted. `budget-estimate` has parent
  `shoot-order` when that is live. A child whose parent is not drafted is
  marked `needsParent`: with nothing to read it is skipped, with the reason.
- **Temporary ids.** Drafted shots are `draft:<n>`, where `n` is the item's
  position in the parent's result (`draftShotId`, `isDraftId`). They never
  reach the studio except through `mapDraftIds` on Accept.
- **Skips are shown, not hidden.** A tool that cannot run here is still a
  node, with `skip` set to a sentence in the writer's words ("There are no
  scenes on the breakdown yet."). A list of only what ran would read the
  same whether a tool was not needed or the check had stopped working.

Ticks come as an array, a Set or `{id: bool}` (`tickSet`).

## 3. The pool, retries and abort

- **Three at a time.** `CONCURRENCY = 3`. A wave-2 node starts the moment
  its parents are settled (a "fed" node goes to the front of the queue),
  ahead of wave-1 nodes still waiting. Otherwise wave, then plan order.
- **Rate limits.** A `rate` or `overloaded` reply is retried once after
  `RETRY_DELAY_MS` (8 s), and the pool drops to one request at a time for
  the rest of the run. A second failure is the draft's `failed` status.
- **A missing or refused key halts the run once.** `auth` or `nokey`
  stops everything not yet started and fails those drafts with the same
  message, instead of failing eleven tools with eleven messages.
- **Abort.** A Stop puts running drafts back to `queued` (`startedAt` and
  `endedAt` cleared), so Resume runs them again from the start. `done`
  resolves `{ runId, stopped, counts, moved }` and never rejects for one
  tool's failure.
- **Careful is read ONCE per run** (`readAiCareful()`), because effort is
  part of each task's prompt-cache key and must not change between batches.
  Effort then comes from `taskEffort(id, careful)` (L0, `ai-effort.js`).

Draft statuses: `queued`, `running`, `ready`, `failed`, `skipped`,
`accepted`, `rejected`. Settled for good: `ready`, `failed`, `skipped`,
`accepted`, `rejected`, except the cases in section 5.

## 4. Accept: parents first, ids mapped, one undo

`acceptDraft(projectId, runId, key, selected?)` → `{ undo, wrote }`.

1. `aiUnlocked()` (fails closed), then the film check (section 6).
2. The target must be `ready`. A missing row says the draft is no longer
   kept.
3. **Staleness.** A draft records each parent's `rev` when it was made
   (`parentRev`). A parent refined in the Desk since then has a higher `rev`,
   so the draft is marked `failed` with kind `stale` and the Accept throws
   "… was changed after this draft was made … Press Resume". Its `draft:<n>`
   positions would map onto the wrong real shots. A draft stored before
   `parentRev` existed cannot tell, and is accepted as before.
4. **Order.** Still-`ready` parents are accepted first, all their items, then
   the target with `selected` (default: every item). Each goes through the
   task's OWN `apply(selected, ctx, result, meta)`, so blanks are filled,
   typed work is never overwritten, the history stamp is written, and the
   undo is exact.
5. **Id mapping.** After a shot-draft apply, `undo.made` gives
   `[itemId, realId]` pairs, and `madeOf()` turns them into
   `'draft:<n>' → realId`. Every child's result, memo and selection is
   passed through `mapDraftIds` (any depth, including `shot:draft:3` item
   ids). A `draft:<n>` that never became real stays as it is, and the child's
   apply skips that shot.
6. **Meta.** Each apply gets `meta = { task, model, run, at }`, where `run` is
   the draft's own `aiRun`, so `ai-stamp` stamps the records with the run that
   made them.
7. **Rollback.** If any apply throws, everything this call already wrote is
   undone, newest first, the drafts go back to `ready`, and the error is
   rethrown. One Accept, one outcome.
8. **Result.** `wrote` lists `{ key, taskId, said, made, unit }` per draft
   and the Desk reads it for its toast. Each accepted draft is stored as
   `accepted` with its `made` map and `acceptedAt`.

**Undo** is one async function, newest first. It will not undo a parent this
Accept took along when a LATER accepted sibling leans on it (a Blocking for
Sc 2 mapped onto the shots of Sc 1): that parent stays accepted, so later
work never points at a deleted shot. Everything else goes back to `ready`
with `made` cleared. Calling it twice does nothing the second time.

`rejectDraft` changes only a `ready` draft to `rejected`. Nothing is written.

## 5. Resume

`resumeRun(projectId, runId)` re-runs only what did not finish:

- `queued`, `running` (a closed tab left it there) and `failed`;
- and a child `skipped` only because its parent had not finished
  (`error.kind === 'parent'`). If the parent fails again it is skipped again
  with the same sentence.

A `ready`, `accepted` or `rejected` draft, and a skip for any other reason,
is left alone. Drafts are re-queued from the start, not resumed mid-answer.

## 6. One film at a time

The task `apply()` writes through the store proxy into whichever film is open
at call time, while the draft store is bound to the film the run started in.
So the engine asks which film is open (`projectNow`) before each node and
after each answer. If it moved, the run stops: in-flight drafts go back to
`queued` and `done.moved` is true. `acceptDraft` refuses ("These drafts belong
to another film. Open that film to accept them.") when the open film is not
the draft's. The view stops a run that belongs to another film when the
project changes, and "Break down everything" stays disabled while a run is
live, so two runs never overlap.

## 7. Headless context, and why the Desk is not involved

`headlessCtx(taskId, ctx, { parentsResults })` builds each task's `ctx` from
the models, with no DOM. Call `headlessReady()` first, or go through
`startRun`, `resumeRun` or `acceptDraft`, which await it. A task whose
`run()` needs the page is not a Run-all tool and is not in `planRun`.

No Desk session is opened, read or aborted by a run. The Desk's sessions and
Run all never meet. `openWithDraft(taskId, ctx, result, opts)` in
`ai-desk.js` is the one bridge: it shows a stored draft as version 1 without
a request, so ticks, refine, Accept and Undo all work as after a normal run.
`opts.accept` replaces the task's own apply with `acceptDraft`, so an Accept
from the Desk goes parents-first with one undo. A refined version is written
over the stored draft before it is accepted.

## 8. The view: `preprod.html#drafts`

- `section#drafts` always renders, so the fragment resolves whether or not a
  film is open. With no film open, `preprod.js` fetches no draft-space code and
  prints "Open a film first: its drafts appear here."
- With a film open, `draft-space.js` loads when the section comes within
  200px of the screen, or when the address is `#drafts`.
- Entry points: a "Draft space" button in the Breakdown header, and a link in
  the lock's done state (`pipeline-checklist.js` `summaryBlock` when
  `ai === 'lock'`).
- Each draft is a live card: state, time taken (in memory only, as the Desk
  does), item count, and the reason it was skipped or failed. Review opens
  the Desk (`openWithDraft`), Accept all calls `acceptDraft`, Reject calls
  `rejectDraft`.
- The latest runs are listed again after a reload. A draft still `running`
  with no engine in this tab shows as "Interrupted", with Resume.
- One polite live region, labelled buttons, focus kept on its card while
  cards update, laid out at 390px. Everything it shows is in memory or in
  the draft store; no `localStorage` write.
- **Review and Accept are Pro.** Locked accounts see Reject only, and a
  locked Review says why.

## 9. What a run never does

- Write a storage key, `localStorage`, a backup or a sync payload.
- Touch the studio models. Only an Accept does, through the task's apply.
- Open a Desk session, abort one, or read one.
- Send anything without the Pro gate and the disclosure.

## 10. Open items (carried from the lanes and the review)

- **Accept takes every item of a ready parent.** Accepting Blocking for one
  scene also writes the shots drafted for every other scene, and accepting
  the budget applies the whole drafted shoot order. Only the items the child
  needs should be accepted, and that needs a partly-accepted parent state.
- **A rejected parent leaves its children `ready`.** Accepting a child then
  applies with unmapped `draft:<n>` ids, and the task's apply skips those
  shots. The card does not warn. (The review fixes did not cover this case.)
- **A child accepted separately is not reconciled** when its parent is undone
  in between. The tasks' own undo guards keep the data right; only the draft
  statuses can drift.
- **Reset and project deletion do not clear drafts.** Nothing in `src/` calls
  `indexedDB.deleteDatabase`, so drafts for a deleted film stay until the
  14-day sweep. Draft Blobs are the writer's own pictures. Check that this is
  the intended behaviour before a release.
- **`callsheet-notes` has no parent** and runs in wave 2 at once. It reads the
  project as it is, which is what its interface names.
- **Coverage, audience-test and voice-check are not in Run all.** They still
  run their batches in series through their own loops, because their
  checkpoint and Resume depend on that order.
- **Storyboard pictures in Review** are re-created from their stored Blobs on
  each Review (review fix 4). Board-frames has not been exercised with a real
  Gemini key and Drive.
- **Only the latest 3 runs are listed** in the view.
- **Gemini 3.0 Pro thinking level.** `geminiThinkingLevel()` sends `high` where
  a task asks for `medium`, because the 3.0 Pro level set is only `low` and
  `high`. This is a guess from the API's refusals and has not been checked
  with a real key. See `docs/AI-FAST-HARNESS.md` E6.
- **`scripts/budget.json`.** The preprod row is back at develop's 968704
  bytes (909.3 KB measured). An earlier hand-raised value was reverted during
  integration. Recapture with `npm run verify -- --budget` only as a
  deliberate act.
- **Not run in this lane:** `test:schema`, `prove:scroll`, `prove:nav` and
  the other `prove:*` scripts were not run for the docs commit. The
  integration commit's gate results are in `docs/HISTORY.md` item 82.
- **Never run against a real provider.** Every check used faked replies.
  The owner's measurement steps are `docs/AI-FAST-HARNESS.md` E6.
