# AI fast harness + AI history — the contract (2 Nov 2026)

Two builders work from this file **in parallel, without talking to each
other**: LANE A (speed + flow) and LANE B (history). Everything one lane
needs from the other is fixed here — names, shapes, file and function
ownership — so the merge is mechanical. Where this file and CLAUDE.md
disagree, CLAUDE.md wins; tell the owner.

Owner decisions (2 Nov 2026), already made, not to be re-asked:

1. **Speed.** Small batches run about three at a time; each scene's result
   is shown the moment it arrives (incremental parse of the streamed JSON);
   effort LOW by default for structured drafting, with a "Careful" switch
   that raises it (a field in `fms_studio_prefs_v1`, no new key); Anthropic
   prompt caching on the system prompt and the shared context block. First
   shot division (`shot-draft`) and the screenplay pages (`gen-batch`), then
   scene list and beat sheet where it is cheap.
2. **Flow.** One press, the run goes on in the background, cards fill in,
   then Accept all or tick per scene. The input box becomes an optional
   "Edit prompt" link. NOTHING is written before Accept; every apply keeps
   its exact Undo.
3. **History by stamping records.** Every record an AI Accept writes carries
   a small field; the history is DERIVED from the stamps (pure model,
   stores nothing). A human edit marks it edited.
4. **Shown in three places:** a History tab in the AI Desk, one project AI
   view, and an "AI" badge on items AI wrote.

Rules that bite (from CLAUDE.md): no new localStorage key (fields only);
tokens only; no inline handlers (`delegate` + `data-action`); `dialog.js`
only; `src/lib` never touches `document` (`test:layers`); the Desk task
shape in the `ai-desk.js` header is kept (fields are ADDED, none renamed);
`aiUnlocked()` fails closed; the key goes in a header, never a URL; every
`*` proof runs against fakes — **never against a real provider**.
`test:undef`, `test:layers`, `test:dialogs`, `test:paper` stay green.

---

## 0. What is there today (read before building)

- `src/lib/ai.js` — `callModel({system,user,schema,maxTokens,effort,onStatus,signal,progress})`
  is the one request path; `anthropicRequest` / `geminiRequest` build the
  body; `readStream` is the SSE reader (LF and CRLF frames); `progress(sofar)`
  receives the accumulated text. `draftShotDivision(jobs)` sends ALL scenes
  in ONE request (effort default `medium`); `draftScenePages(job)` (effort
  `high`, `pagesSchema(ids)` embeds the batch's ids); `draftSceneList`
  (`high`); `draftBeatSheet` (`high`).
- `src/lib/scriptgen.js` — `BATCH_SIZE = 4`; `draftBatch()` drafts one batch
  at the job cursor; `applyBatch(draft, keep)` writes the kept scenes, moves
  the cursor past what it wrote, leaves the rest `pending`, refuses a stale
  cursor. It already works for a draft whose `batch` is ANY length.
- `src/lib/ai-tasks.js` — `shot-draft` (one call), `gen-batch` (one batch
  per Desk session, identity = cursor), `gen-scenes`, `synopsis-script`,
  and twenty more; each `apply()` returns an exact undo.
  `ai-tasks-preprod/post/story.js` hold the ten lane tasks.
- `src/ui/ai-desk.js` — one `running` AbortController; `closeDesk()` and a
  new `openDesk()` ABORT it; Run → version → tick → Accept → toast Undo.
- `src/pages/write.js` `genRun()` — the "Write all N scenes" bulk button,
  which writes batch after batch with no review (one run Undo).
- `shots.js` already declares `ai: false` on `blankShot()`, and two writers
  set `ai: true` (`shot-draft` apply, `write.js` `breakIntoShots`);
  `visualize.js` and `shotlist-export.js` read `shot.ai` as truthy.

---

## LANE A — speed and flow

### A1. New pure modules (src/lib, no document, Node-tested)

**`src/lib/ai-batches.js`**

```js
/** Run `jobs` in batches, at most `concurrency` requests in flight.
 *  run(batch, { signal, onItems, index }) → Promise<{ items, truncated, model }>
 *    batch   = jobs.slice(i*size, i*size+size)
 *    onItems = call with an array of finished items as they parse
 *  Resolves { items, failed: [{ index, jobs, error }], truncated, model, stopped }.
 *  Never rejects for one batch's failure; rejects only if EVERY batch failed
 *  with the same AIError kind 'auth' | 'nokey' (rethrows that error). */
export async function runBatches(jobs, {
  size, concurrency = 3, run, onItems, onBatch, signal,
  warmFirst = true,          // launch batch 0 alone; start the rest when it
                             // streams its FIRST text (its prefix is then in
                             // the cache) or settles, whichever is first
  retryRate = 1              // a 'rate' / 'overloaded' batch is retried this
                             // many times after 8 s, and concurrency drops to 1
}) {}
export function batchesOf(jobs, size) {}   // [[…],[…]]  (pure helper)
```

Rules: an abort (`signal`) starts nothing new, lets nothing new be emitted,
and resolves with `stopped: true` and the items already emitted — it does
not throw. Item order in the final `items` is JOB order, whatever order the
batches finished in. `onBatch({ done, total, failed })` after each settle.

**`src/lib/ai-stream-json.js`**

```js
/** Incremental reader for `{ "<key>": [ {…}, {…} ] }` streamed as text.
 *  feed(sofar) takes the WHOLE text so far (what callModel's progress gets)
 *  and returns the array elements completed since the last call, each
 *  JSON.parse'd. Strings, escapes (\" \\ \uXXXX), nested arrays/objects and
 *  a chunk boundary anywhere are handled; a malformed element is skipped,
 *  never thrown. */
export function arrayStream(key) { return { feed(sofar) {}, count() {} }; }
```

The final `JSON.parse` in `callModel` stays the authority: an element is
SHOWN early, but what the task returns is re-derived from the parsed whole
reply (the same checks as today), so a stream that emitted an element the
final parse disagrees with shows the final version.

**`src/lib/ai-effort.js`**

```js
export const DRAFT_EFFORT = { normal: 'low', careful: 'high' };
/** The effort for a structured draft. careful = readAiCareful() unless given. */
export function draftEffort(careful) {}
```

The effort is fixed for a whole run (changing it between batches would
invalidate the cache). Reads only; the pref is read once at run start.

### A2. The Careful pref — `src/lib/chrome-prefs.js` (append at END)

```js
export function readAiCareful() {}        // boolean, default false
export function saveAiCareful(on) {}      // updateDevicePrefs({ aiCareful: !!on })
```

Field `aiCareful` inside `fms_studio_prefs_v1`. Written ON A CLICK ONLY
(the idle-write check). No new key.

### A3. `src/lib/ai.js` changes (Lane A owns the whole file)

- `callModel({ …, shared, onText, cache = true })`, additive:
  - `shared` — the run's common context (logline, synopsis, beats, cast
    list, character spellings): byte-identical for every batch of a run.
  - `onText(sofar)` — the raw accumulated text, beside `progress`.
- **Anthropic** (`anthropicRequest`): `system` becomes
  `[{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]`;
  when `shared` is given, `messages[0].content` is
  `[{ type:'text', text: shared, cache_control:{type:'ephemeral'} }, { type:'text', text: user }]`.
  Two breakpoints, never more than four. `thinking: {type:'adaptive'}` stays
  (Opus 5.5 400s on disabled thinking); `output_config.effort` = the run's
  effort. A prefix under the model's minimum (512 tokens on current models)
  simply does not cache — no error, nothing to handle.
- **Cache stability rules** (a byte change invalidates everything after it):
  the system text, the schema (`output_config.format`), the effort and the
  `shared` block must be IDENTICAL across a run's batches. So
  `pagesSchema(ids)` becomes `pagesSchema(runIds)` — the enum of ALL the
  run's scene ids, built once — and the per-batch id check stays in code
  (`wanted.has`). No timestamp, cursor or batch number in `system` or
  `shared`; those go in the per-batch `user` text.
- **Gemini** (`geminiRequest`): NO explicit caching (the `cachedContents`
  API is a separate stored resource with its own billing — not worth it
  here). `shared` is put FIRST in the user text so Gemini's implicit prefix
  caching can apply; `thinkingLevel` gets the same effort word as today.
- Job functions, signatures kept (old callers unchanged), options added:
  - `draftShotDivision(jobs, { onStatus, signal, onItems, careful })` —
    internally `runBatches(jobs, { size: SHOT_BATCH = 3, concurrency: 3 })`,
    effort `draftEffort(careful)`, `maxTokens` 8000 per batch,
    `arrayStream('scenes')` → `onItems([{ sceneId, shots }])` per scene.
    Resolves `{ byScene, truncated, model, failed: [sceneId…], stopped }`
    (a stopped run resolves with what arrived; it does not throw).
  - `draftScenePages(job, { …, onItems, careful, runIds, shared })` — one
    batch; effort `draftEffort(careful)`; `onItems([{ sceneId, elements }])`.
  - `draftSceneList(job, { …, onItems, careful })` — still ONE request
    (the list needs the whole story at once); streamed cards per scene;
    effort `careful ? 'high' : 'medium'` (structure work, a cheap win only).
  - `draftBeatSheet(job, { …, onItems, careful })` — one request, streamed
    per beat, effort as the scene list.
- Exports added: `SHOT_BATCH`, and `callModelForTask` keeps working.

### A4. `src/lib/scriptgen.js` — Lane A owns `draftScenes`, `draftBatch`, new `draftRest`, the batch constants

```js
export const PAGE_BATCH = 2;          // scenes per request in a run
export const PAGE_CONCURRENCY = 3;
/** Draft EVERY remaining scene (cursor → end) in PAGE_BATCH batches,
 *  PAGE_CONCURRENCY at a time. Writes nothing. Resolves a draft in the
 *  SAME shape draftBatch returns, with `batch` = all remaining scenes:
 *    { cursor, batch, byScene, truncated, model, done, failed, stopped }
 *  so the unchanged applyBatch(draft, keep) writes it: a scene that did not
 *  arrive, failed or was unticked stays pending, next in line. */
export async function draftRest({ onStatus, signal, onItems, careful, extra } = {}) {}
```

`before`/`after` continuity per batch comes from the job's scene list
(synopses), so batches are independent. `knownCharacters()` is read ONCE at
run start and is part of `shared`. `BATCH_SIZE` stays exported (write.js
reads it) and keeps meaning "a single reviewed batch".

### A5. Desk changes — `src/ui/ai-desk.js` (Lane A owns, except §B7's regions)

New OPTIONAL task fields (added to the header comment; nothing renamed):

```
stream: true          run() receives opts.onItems(items[]) and the Desk shows
                      each item as a live card the moment it arrives
background: true      closing the Desk, or opening another task, does NOT
                      abort this run; reopening the same task + identity shows
                      the live session. Leaving the PAGE stops it (nothing was
                      written). Only one background run per task id.
effortSwitch: true    the Desk shows the Careful switch (checkbox,
                      data-action="ai-desk-careful", label "Careful — slower,
                      more thorough"); run() receives opts.careful
runLabel(ctx)         the primary button's text ("Draft shots for 12 scenes",
                      "Draft the remaining 18 scenes"); default 'Run'
cost(ctx)             one line under it ("About 4 requests, 3 at a time")
```

Item fields (list kind), additive: `group` (e.g. the sceneId) and
`groupLabel` ("Sc 12 · INT. HOUSE — DAY"). Items with a `group` render
under a group header with its own checkbox (ticks/unticks the group) — that
is "tick per scene". The per-item checkbox stays (`.ai-desk-item input`).

Flow:

- **One press.** A page button may open the Desk with `ctx.go === true`
  (`openDesk('shot-draft', { …, go: true })`); then the Desk runs at once.
  Such a button MUST carry the provider disclosure beside it (`disclose()`
  from `ai-panel.js`, the same sentence the Desk shows), because the press
  is the send. Without `go`, the Desk opens on the Run button (labelled by
  `runLabel`), the disclosure, and the Careful switch.
- **Edit prompt.** The textarea moves into `details.ai-desk-editprompt`
  (summary "Edit prompt"; "See what is sent" when `editable === false`),
  closed by default. `textarea.ai-desk-input` keeps its class and its
  readonly rules, so prove-ai-desk.mjs still finds it (open the details
  first). Editing it and pressing Run sends the edited text as today.
- **Live cards.** On Run the Desk pushes a version at once (`v.live = true`),
  appends items as `onItems` delivers them (keeping the reader's ticks),
  shows `.ai-desk-progress[role=status]` "4 of 12 scenes · 1 failed", and
  keeps Stop. Accept buttons are disabled while live.
- **Stop / failure.** Stop aborts; the version keeps every item that
  arrived, with the note "Stopped after N of M scenes. Nothing is written
  until you accept." A batch failure is a note line naming the scenes
  ("Not drafted (rate limited): Sc 7, Sc 8 — run again for these."), never
  the whole run's error, unless no batch succeeded.
- **Accept all / Accept selected** unchanged in meaning; one Accept is still
  one write and returns one Undo toast.
- **`meta` — the stamp source (Lane B depends on this).** Each version gets
  `v.run = newId('air')` (`record-id.js`) at Run, and the Desk calls
  `task.apply(selected, ctx, result, meta)` with

  ```js
  meta = { task: task.id, model: result.model || getModel(), run: v.run, at: new Date().toISOString() }
  ```

  Every task's `result` should carry `model` (Lane A adds it where a run()
  does not yet). Local (`local: true`) tasks get `meta` too (model `''`).

### A6. Tasks Lane A changes (in ai-tasks.js, only ABOVE each `apply(` — see §C)

| Task | Change |
| --- | --- |
| `shot-draft` | `stream`, `background`, `effortSwitch`; `runLabel` "Draft shots for N scenes"; run() → `draftShotDivision(jobs, { onItems, careful, signal })`; items get `group: sceneId`; `result.model`; failed scenes in the note |
| `gen-batch` | label "Write the remaining scenes"; identity `'rest:' + startedAt + ':' + cursor`; run() → `Gen.draftRest(...)`; items one per scene (`group` = sceneId); `stream`, `background`, `effortSwitch`; input() lists the remaining scenes; the Accept path (`applyBatch`) unchanged |
| `gen-scenes` | `stream` (cards per scene), `effortSwitch`; one request |
| `synopsis-script` (beat sheet) | `stream` (cards per beat), `effortSwitch`; one request |

Pages Lane A edits for the one press: `src/pages/write.js` generate
section — the bulk "Write all N scenes" button now opens
`openDesk('gen-batch', { …ctx, go: true })` with a `disclose()` line, and
`genRun()` / `offerRunUndo()` are removed (nothing is written before
Accept). `src/pages/visualize.js` and `src/ui/breakdown-overview.js`: the
existing `shot-draft` pill stays; Lane A may add a "Draft shots for all
scenes" button with `go: true` + disclosure in the Shot List toolbar only.
`write.js` `breakIntoShots()` needs no Lane A edit: `draftShotDivision`'s
signature is unchanged and it batches internally.

### A7. Files Lane A OWNS

`src/lib/ai.js`, `src/lib/ai-batches.js` (new), `src/lib/ai-stream-json.js`
(new), `src/lib/ai-effort.js` (new), `src/lib/chrome-prefs.js` (the two new
functions at the end), `src/lib/scriptgen.js` (`draftScenes`, `draftBatch`,
`draftRest`, constants), `src/ui/ai-desk.js` (all but §B7),
`src/styles/ai-desk.css`, `src/pages/write.js` (the generate section and
`genRun`), the run()/input()/identity()/label and new top-of-object fields
of the four tasks in A6, `scripts/test-ai-fast.mjs`, `scripts/prove-ai-fast.mjs`,
`scripts/prove-ai-desk.mjs` (only to open `details.ai-desk-editprompt`
before it reads the textarea).

### A8. Lane A tests

- **`npm run test:ai-fast`** (`scripts/test-ai-fast.mjs`, Node, no browser):
  `runBatches` never exceeds `concurrency` in flight; `warmFirst` holds the
  rest until batch 0's first text; job order in `items`; one failed batch
  does not fail the run; a 'rate' batch is retried once and concurrency
  drops; abort starts nothing new and resolves `stopped` with what arrived;
  `arrayStream` over the same reply cut at EVERY offset yields the same
  elements (escaped quotes, `\u` escapes, nested arrays, CRLF frames);
  `anthropicRequest` puts `cache_control` on system and on the `shared` block
  only, and the system/schema/effort/shared bytes are identical across a
  run's batches; `geminiRequest` has no `cache_control` and `shared` first;
  the key is in `x-api-key` / `x-goog-api-key`, never the URL; `draftEffort`
  low/high; `draftShotDivision` against a faked streamed `fetch` returns the
  same `byScene` as the one-request path did for the same reply text;
  `draftRest` + the unchanged `applyBatch` write only arrived, ticked scenes
  and leave the rest pending; a stopped draftRest applied writes only what
  arrived.
- **`npm run prove:ai-fast`** (`scripts/prove-ai-fast.mjs`, CI,
  `PROVE_DIST=dist-verify`): the built app, Dragon sample, Pro faked,
  `page.route` answering the provider with streamed SSE where each request
  can be held. Press "Draft shots for all scenes": a card is visible while a
  later request is still held; at most 3 requests open at once; nothing is
  written to `localStorage` before Accept (write spy); Stop keeps the
  arrived cards; Accept all writes them and Undo removes exactly them; a
  scene group checkbox unticks its shots; the Careful switch changes
  `output_config.effort` in the captured body and writes `aiCareful` only on
  the click; "Edit prompt" opens the textarea; closing the Desk mid-run and
  reopening shows the run still filling. Same walk for `gen-batch` with six
  remaining scenes; a 429 on one batch names its scenes in the note.

---

## LANE B — history

### B1. The stamp

Two fields, both optional, both on EXISTING records — never a key.

```js
// The run that CREATED this record.
ai: { task: 'shot-draft', model: 'claude-opus-5-5', run: 'air_…', at: '2026-11-02T…Z', h: 'f1a2…' }

// Runs that FILLED or CHANGED fields of a record they did not create.
aiFill: [ { task, model, run, at, fields: ['notes'], h, mode: 'fill' | 'append' | 'replace' } ]   // newest last, at most 8
```

- `h` is `aiHash(kind, record, fields?)` of the AI-written content at write
  time (FNV-1a over the JSON of those values, in a fixed field order).
- **Edited since** is DERIVED, never written: `edited = aiHash(now) !== h`.
  No editor, setter or keystroke path changes. Reordering a record does not
  count as an edit; changing a hashed field does (a type change through
  `setElementType` included).
- Legacy `ai: true` on a shot reads as `{ task: 'shot-draft', run: '', legacy: true }`
  — listed under "Earlier AI drafts", never undoable, never edited-known.
  `shot.ai` stays truthy everywhere it is read today (visualize.js,
  shotlist-export.js), so nothing that reads the boolean changes.
- A record created by a run and later filled by another keeps its `ai` and
  gains an `aiFill` entry.

### B2. The one helper — `src/lib/ai-stamp.js` (pure)

```js
export const AI_KINDS = { shot, scene, element, step, story, character, note,
  frame, block, callsheet, recce, budgetRow, document, edit, take };   // kind → hashed fields
export function aiMeta(task, model = '', run) {}        // meta when no Desk meta (direct callers, tests); run defaults newId('air')
export function aiHash(kind, record, fields) {}         // the fingerprint
export function stampAI(kind, record, meta) {}          // returns { ...record, ai: {…meta, h} }
export function stampFill(kind, record, meta, fields, mode = 'fill') {}   // returns record with aiFill appended (cap 8)
export function readStamp(record) {}                    // normalises ai / aiFill / legacy true; never throws
export function isEdited(kind, record, stamp) {}
export default { … };
```

Every apply calls `stampAI` / `stampFill` on the records it writes,
with the Desk's `meta` (4th apply argument, §A5) or `aiMeta(task.id)` when
`meta` is absent (so Lane B works before the merge). Model functions that do
the writing for an apply take an optional `{ ai: meta }` and stamp inside.

### B3. Every apply site to stamp

| Task / caller | Writes | Stamp |
| --- | --- | --- |
| `shot-draft` | `ShotsM.addShot` | `ai` (kind `shot`) replaces `ai: true` |
| `write.js` `breakIntoShots` (direct, not the Desk) | `Shots.addShot` | `ai` with `aiMeta('shot-draft', result.model)`; rules shots stay `rules: true`, unstamped |
| `gen-scenes` | `Gen.applyScenes` (scene rows, created characters) | `ai` on each scene row and each CREATED character; `applyScenes(patch, kept, { …, ai })` |
| `gen-batch` | `Gen.applyBatch` (script elements) | `ai` (kind `element`) on each appended element; `applyBatch(draft, keep, { ai })` |
| `synopsis-script` | job (beats) + story logline/outline steps where BLANK | `ai` on created outline steps; `aiFill` on the story root (`logline`) |
| `story-steps`, `story-map`, `scene-story` | outline steps (`addOutlineStep`, `applyBeatMap`, `Extras.appendSteps`) | `ai` on created steps; `aiFill` (`beat`) on a moved existing step |
| `dialogue-pass` | element text + `aiPass` + alts | `aiFill` (`text`, mode `replace`) |
| `voice-check` | takes via `addTake` | `aiFill` (`alts`, mode `append`) on the element |
| `logline` | `setLogline` + `loglineAlts` | `aiFill` on the story root (`logline`, `loglineAlts`) |
| `genre-comps` | story fields | `aiFill` on the story root (the fields it filled) |
| `coverage`, `audience-test` | a document in the script blob | `ai` on the document (kind `document`) |
| `scene-notes` | `appendSceneNotes` + `cutCandidate` | `aiFill` (`readerNote`, `append`; `cutCandidate`, `fill`) |
| `breakdown-tags` | `tagMany` | `aiFill` (`elements`, `append`) on each scene touched |
| keepNotes (beat-critique, tension-notes, audience-quick, audience-ask, draft-changes, day-wrap-summary, cert-read) | `appendSceneNotes` / `addNotesToVault` | `aiFill` append on the scene, or `ai` on each new note |
| `board-frames` | `addFrame` | `ai` on each frame |
| `blocking-draft` | `writeBlocking` (floor + diagrams) | `ai` on created blocks; `aiFill` on a floor that was filled |
| `blocking-enhance` | `replaceBlock` | `aiFill` (`marks`, `set`, mode `replace`) |
| `shoot-order` | `LocM.placeScene` | `aiFill` on the scene row, fields = what placeScene changes on the scene; if it changes only the locations `order` list (ids), shoot-order is NOT stamped — say so in the test |
| `recce-notes` | `setRecce` | `aiFill` on the recce record (fields filled) |
| `budget-estimate` | `saveCalcData` rows `ci_<n>_*` | one more key per row, `ci_<n>_ai`, a JSON STRING of the stamp (the blob is the data-key form: values stay strings, never objects). Undo removes it with the row. Lane B first greps every `ci_` consumer; if any enumerates row suffixes, budget-estimate is the one documented exception and is not stamped |
| `callsheet-notes` | `updateCallSheet({notes})` | `aiFill` (`notes`) on the sheet |
| `edit-notes` | `setSceneEdit` | `aiFill` on the edit-log record |
| `character-arcs` | `CharsM.setField` | `aiFill` (fields filled) on each character |
| `script-cleanup` | new elements via `blankElement`, kept lines unchanged | `ai` on the NEW elements only; a kept line (same id) is not stamped |
| any other Desk task with an `apply` | — | `test:ai-history` fails until it is in this table (anti-rot, below) |

### B4. Every read path that must keep the fields (check each, fix where it drops them)

`shots.js` `listShots` / `blankShot` / `cleanBlock` / `cleanMark` /
`blankFrame`; `scenes.js` `listScenes` / `blankScene`; `script.js`
`blankElement` / `blankDocument` / `normaliseRevision` (a revision keeps the
stamps it snapshot); `story.js` `loadStory` (root spread, `outline` map —
already `...x`), `listVault`; `notes-model.js` `makeNote` (and any note
normaliser); `characters.js` `blankCharacter` (spreads the patch — keep it);
`contacts.js` `blankCallSheet` / `listCallSheets`; `locations.js` recce
read; `editlog.js` record read; `budget-model.js` `readCalcData`;
`story-merge.js` / `script-merge.js` (merge by id must carry the fields and
must not treat a stamp difference alone as a conflict); `backup.js`
build/apply round trip; `drive-store.js` canonical hash (a stamp is content:
it syncs); every DOCX/FDX/Fountain/PDF exporter IGNORES the fields (none
prints them). A cleaner that rebuilds a record field by field must copy
`ai` and `aiFill` through `readStamp()`; never invent one.

### B5. The pure history model — `src/lib/ai-history.js`

```js
/** sources: { shots, scenes, elements, documents, story, steps, characters,
 *  notes, frames, blocks, callsheets, recce, budgetRows, edits } (plain arrays /
 *  objects, already read). Pure: no storage, no document, no clock. */
export function collectAI(sources) {}
// → entries [{ key, kind, id, label, stage, task, model, run, at, mode: 'new'|'fill'|'append'|'replace',
//             fields, edited, legacy, href, undoable }]
export function groupByRun(entries) {}   // → [{ run, task, model, at, stage, count, edited, items }], newest first
export function filterAI(entries, { stage, task, edited } = {}) {}
export function stageOf(task) {}         // 'story' | 'screenplay' | 'preprod' | 'production' | 'post'
export function revertPlan(entries) {}   // → { remove: [{kind,id}], blank: [{kind,id,fields}], kept, notUndoable }
```

- `href` is a fragment that ALWAYS resolves (the nav-target trap): shot →
  `visualize.html#shot-list`, scene → `breakdown.html#scenes`, element →
  `screenplay.html#line-<id>`, step → `story.html#stStep_<id>`, character →
  the Characters tab, note → `vault.html`, call sheet →
  `contacts.html#call-sheets`, budget row → `budget.html` (its tab),
  document → its tab. Lane B checks each against the built page.
- `undoable` = mode `new` or `fill`, not edited, not legacy. `append` and
  `replace` are listed but never undoable from History (the toast Undo still
  is, while it lives) — their old value is not stored and will not be.

**`src/lib/ai-history-read.js`** (reads the models, no document):
`readProjectAI()` → `collectAI(sources)` for the open project.
**`src/lib/ai-history-revert.js`**: `revertRun(run)` / `revertEntries(list)`
apply `revertPlan` through the owning models — one write per model,
re-reading first, removing a `new` record or blanking a `fill`'s fields and
dropping that `aiFill` entry ONLY while the hash still matches; returns
`{ reverted, kept }`, and the UI says both numbers. Asked through `ask()`
from `dialog.js` before it writes ("Undo 9 AI-written items from this run? 2
you have edited stay as they are.").

### B6. Where history is shown

**(a) Desk History tab.** A toggle in the Desk header,
`button.ai-desk-histbtn[data-action="ai-desk-history"]` (aria-pressed),
switches the body to the project's runs (`groupByRun`), each run with its
task label, model, time, item links, an "edited" count and
`button[data-action="ai-hist-undo"][data-run]` when anything is undoable.
Reads only; opening it writes nothing. Rendered by
`src/ui/ai-history-view.js` `mountHistory(el, { compact: true })`.

**(b) The project AI view — a section of `dashboard.html`, not a new
page.** `details.db-more.db-ai#ai` ("AI in this film"), beside the other
`db-more` disclosures. Chosen because it is clearly lighter and is still one
place for the project: the dashboard is the project home; a closed
disclosure keeps "the dashboard is one screen"; `dashboard.html#ai` already
works through `revealTarget()`; and it needs NO vite input, no navigation /
global entry, no sitegate or sw registration, no sitemap, no prove:nav
expectation and no plan id. The id renders in every state (no project, no
AI yet: "Nothing in this film was drafted by AI yet."). Its body is built
on the first `toggle` open by a dynamic import of `ai-history-view.js`
(`mountHistory(el, { filters: true })`): stage and task filters (`k-seg` /
select), runs grouped, the same links and Undo. Nothing in it is in first
paint, and a closed disclosure adds no words to the baseline.

**(c) The badge — `src/ui/ai-badge.js`.**
`aiBadge(record)` → `span.ai-badge` text "AI", `role="img"`,
`aria-label` "Drafted by AI — Shot division, 2 Nov" (+ ", edited since"),
or `null` for an unstamped record (filter before append). Styles in
`src/styles/ai-history.css` (imported by `ai-badge.js` and
`ai-history-view.js`): tokens only, `--brand` text on `--brand-wash`,
`--sk-field-radius`, AA 4.5. Placed: shot rows (`visualize.js` row, beside
the existing `.is-ai`), scene rows (`breakdown.js` `.bd-sl` card),
script elements (`script-editor/rows.js` row chrome, OUTSIDE the textarea,
only when `rowChrome`), story steps (`story.js` `renderStepRow`), sticky
notes, characters. One line per site.

### B7. Lane B's regions in Lane A's files

- `src/ui/ai-desk.js`: Lane B appends ONE delimited block at the END of the
  file (`/* ==== HISTORY TAB (Lane B) ==== */`) holding `historyButton()`,
  `showHistory()` and a module flag `historyOpen`, and makes exactly three
  insertions: the history button as the first child of the
  `header.ai-desk-head` array in `header()`; one `delegate(...)` line at the
  END of `wire()`; and `if (historyOpen) return showHistory();` as the line
  right after `if (!desk) return;` in `render()`. Lane A does not move those
  three anchors and puts its Careful switch in the body, not the header.
- `src/lib/scriptgen.js`: Lane B owns `applyScenes` and `applyBatch` (the
  `{ ai }` option only; behaviour unchanged).
- `src/lib/ai-tasks.js` and `ai-tasks-*.js`: Lane B owns every `apply(` body
  and `keepNotes`, and the WRITES list in the header comment.

### B8. Files Lane B OWNS

`src/lib/ai-stamp.js`, `src/lib/ai-history.js`, `src/lib/ai-history-read.js`,
`src/lib/ai-history-revert.js` (new); `src/ui/ai-history-view.js`,
`src/ui/ai-badge.js`, `src/styles/ai-history.css` (new); the read paths in
§B4 (shots, scenes, script, story, notes-model, characters, contacts,
locations, editlog, budget-model, story-merge, script-merge, backup); the
apply bodies; the badge lines in visualize.js, breakdown.js,
script-editor/rows.js, story.js (and the vault/characters views);
`dashboard.js` (the `#ai` disclosure); `write.js` `breakIntoShots` (the
stamp line only); `scripts/test-ai-history.mjs`, `scripts/prove-ai-history.mjs`.

### B9. Lane B tests

- **`npm run test:ai-history`** (`scripts/test-ai-history.mjs`, Node). The
  name `test:history` is already taken by another suite — do not reuse it.
  Asserts: stamp shape; `aiHash` stable across key order, changed by a
  hashed field, unchanged by a move; legacy `ai: true`; `aiFill` cap 8;
  `collectAI` / `groupByRun` / `filterAI` / `stageOf`; `revertPlan` (an
  unchanged `new` is removed, an edited one kept, a `fill` blanked, `append`
  and `replace` never undoable); a ROUND TRIP through every read path in
  §B4 keeps `ai` and `aiFill` byte-for-byte (shots, blocks, marks, frames,
  scenes, elements, documents, revisions, story root, steps, vault notes,
  characters, call sheets, recce, edit log, budget `ci_<n>_ai`, backup
  build → apply, both mergers); every apply in §B3, run against fakes with a
  `meta`, writes records whose stamp carries `meta.run`; and the anti-rot
  check — every task id registered with an `apply` is in the stamped table
  or the named exception list, so a new task without a stamp fails.
- **`npm run prove:ai-history`** (`scripts/prove-ai-history.mjs`, CI,
  `PROVE_DIST=dist-verify`): built app, Dragon sample, faked SSE provider;
  accept a shot division → `.ai-badge` on those shot rows with an
  `aria-label`; the Desk History tab lists the run with the right count and
  its links land; edit one shot, then the run's Undo removes the others and
  keeps the edited one (the dialog says both numbers); `dashboard.html#ai`
  opens the disclosure and filters by stage; zero `localStorage` writes from
  opening History or the dashboard section; axe-style AA on the badge.

---

## C. Shared files — how the merge stays mechanical

| File | Lane A may edit | Lane B may edit |
| --- | --- | --- |
| `src/lib/ai-tasks.js` | in `shot-draft`, `gen-batch`, `gen-scenes`, `synopsis-script`: `label`, new fields placed right after `editable:`, `identity`, `input`, `run` — everything ABOVE `apply(`; helpers they alone use (`shotJobs`, `batchSlice`) | every `apply(` … to the object's closing `};`, `keepNotes`, `withNote`, the header WRITES list; imports of `ai-stamp.js` at the end of the import block |
| `src/lib/ai-tasks-*.js` | nothing | apply bodies |
| `src/ui/ai-desk.js` | everything except §B7 | §B7's block and three anchors |
| `src/lib/scriptgen.js` | `draftScenes`, `draftBatch`, `draftRest`, constants | `applyScenes`, `applyBatch` |
| `src/pages/write.js` | the generate section, `genRun`, `offerRunUndo` | the `addShot` line in `breakIntoShots` |
| `src/pages/visualize.js` | the optional "Draft shots for all scenes" button | the badge in the shot row |
| `package.json` | `test:ai-fast`, `prove:ai-fast`; append ` && npm run test:ai-fast` after `test:ai-everywhere` in `test:all` | `test:ai-history`, `prove:ai-history`; append ` && npm run test:ai-history` after `test:ai-writing` in `test:all` |
| `.github/workflows/gate.yml` | one `prove:ai-fast` step | one `prove:ai-history` step |
| `CLAUDE.md` | nothing | nothing — the row below is added at the merge |

`test:all` is one line, so both lanes touch it: the resolution is to keep
both insertions. Neither lane re-baselines; neither adds a storage key,
a page, a nav module or a plan id.

The handshake between lanes is ONLY: the 4th `apply` argument `meta`
(`{ task, model, run, at }`, §A5) and `result.model`. Lane B tolerates its
absence (`aiMeta(task.id)`); Lane A passes it whether or not anything reads
it.

---

## D. CLAUDE.md status row to add at the merge (#87)

| 87 | AI fast harness + AI history (2 Nov 2026) | Built; **never run against a real provider** | `docs/AI-FAST-HARNESS.md` is the contract. Drafting runs in small batches, 3 at a time (`ai-batches.js` `runBatches`, warm-first so the cache is written once); cards show as each scene parses (`ai-stream-json.js`); effort LOW unless the Desk's Careful switch (`aiCareful` in `fms_studio_prefs_v1`, written on a click only); Anthropic `cache_control` on the system prompt and the run's `shared` block — system, schema, effort and `shared` must be byte-identical across a run's batches (so `pagesSchema` takes the RUN's ids); Gemini has no explicit cache, `shared` goes first. One press runs in the background (`background` tasks survive closing the Desk, not the page); the input is an "Edit prompt" link; a `go: true` button must carry `disclose()`; still nothing before Accept, one Undo per Accept. `genRun`'s unreviewed bulk write is gone. History is DERIVED from stamps on records: `ai` (the creating run) and `aiFill[]` (fills, cap 8), each `{task, model, run, at, h}` — fields, no key; "edited" = the hash differs, never written; legacy `shot.ai === true` still reads truthy. Every apply stamps via `ai-stamp.js` with the Desk's 4th apply argument `meta`; a read path that rebuilds a record must carry both fields (`test:ai-history` round-trips every model and fails on an unstamped task). Shown in the Desk History tab, `dashboard.html#ai` (a disclosure, not a page) and `aiBadge()`. History Undo removes or blanks only unchanged records and says how many it kept; append/replace runs are listed, never undone from History. `test:ai-fast`, `test:ai-history`, `prove:ai-fast`, `prove:ai-history`. |
