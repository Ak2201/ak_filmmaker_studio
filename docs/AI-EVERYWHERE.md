# AI everywhere: ten more Desk tasks (owner-approved, 1 Nov 2026)

Branch `feature/phase3-ai-everywhere`. Pages that already have AI keep it
unchanged. Every task below is an AI Desk task in the existing system: a
`{id, label, kind, input, run, apply, identity?, editable?}` object (the
contract is the header of `src/ui/ai-desk.js`), opened by `aiPill()` from
`src/ui/ai-pill.js`. Nothing new is stored, no new localStorage key, no new
data-key, no schema section, no new host in `connect-src`.

## Rules every task keeps

1. **Nothing is written before Accept.** `run()` only reads and asks. `apply()`
   is the only writer, goes through the owning model (never `localStorage`),
   and returns an exact undo.
2. **Blanks and new records only.** A write fills a field that is empty NOW
   (re-read inside `apply()`, not at Run) or adds a new record. It never
   overwrites what a person typed. A field that was filled in between Run and
   Accept is skipped and counted in a say() line.
3. **Undo restores only what it wrote**, against the data as it is now: a field
   the writer edited after Accept is left alone; a record they deleted is not
   brought back (row 68's rule, as `blocking-enhance` does it).
4. **Refine re-sends the SAME schema.** `refineText(refine)` (ai-task-kit.js,
   from `ai-refine.js`'s `refineBlock`) is appended to the user prompt; the
   system prompt and the JSON schema are unchanged, and the same parser and
   checks run on the refined answer.
5. **The Desk stores nothing.** The last run's memory is `remember()` /
   `recall()` in a Map for this visit, pinned to the result shown.
6. **`aiUnlocked()` gates (Pro, fails closed)**: the pill does it, the task adds
   nothing. The key goes in a header (`callModelForTask`); never `?key=`.
7. **What leaves the browser is what `input(ctx)` shows.** The Desk displays it
   before the first send. Facts only, minimal, no contact phone/e-mail, no
   payment or account data, no other project. `editable: true` only where the
   input IS the prompt text.
8. **Honest wording.** Output is a model's suggestion. A read-only result says it
   changed nothing. Counts, ids and quotes come from our data, never from the
   model: a model that names an id we did not send is dropped.
9. Layer rule (`npm run test:layers`): `src/lib` imports nothing from `src/ui`
   or `src/pages` and touches no `document`; a page hands behaviour in through
   `ctx` callbacks. Tokens only, no inline handlers, `dialog.js` only.
10. Task ids are written into nothing today but may be tomorrow (kept results,
    the tour, usage names): **never rename one.**

## Plumbing (done by the spec agent, do not redo)

- `src/lib/ai-task-kit.js`: `ai()` (lazy `ai.js`), `resolve`, `call`, `fail`,
  `plural`, `remember`, `recall`, `refineText`, `clip`.
- `src/lib/ai-tasks-preprod.js`, `ai-tasks-post.js`, `ai-tasks-story.js`: each
  `export const TASKS = []` and `export const load = async () => {}`.
- `src/lib/ai-tasks.js` imports the three and does
  `ALL_TASKS = [..., ...Preprod.TASKS, ...Post.TASKS, ...Story.TASKS]`;
  `registerAll()` awaits `loadAll()` AND every lane's `load()` before the Desk
  calls `input()` (which is synchronous). A lane puts its dynamic
  `import('./scenes.js')` etc. in `load()` and keeps the module refs in module
  scope, exactly as `ai-tasks.js` does. A task calls the model with
  `(await ai()).callModelForTask({system, user, schema, maxTokens, effort,
  onStatus, signal, progress})`, which returns `{parsed, truncated, model}`.
- Scene text for a prompt: `planSceneRead`/`runSceneBatches` in `ai.js` when a
  task must read script pages; most tasks below send derived facts instead.
- Pills: `aiPill({label, tasks: ['<id>'], ctx: () => ({...})})`, ctx computed at
  the click, `identity` set so the Desk keeps one session per thing. Mount it in
  the page's existing tool row with the other `k-btn` controls; the page imports
  only `ai-pill.js`, so `test:ai-lazy` stays green.

## The ten tasks

Schemas are JSON Schema objects with `additionalProperties:false`; every field
`required`. "Facts" are what `input(ctx)` shows and sends.

### 1. `shoot-order` (Lane A) stripboard.html
- Pill: "Suggest day order" in the board's tool row. Kind `list`; one item per
  proposed day (`id: 'd<day>'`, text "Day 3: Sc 12, 14, 9", detail = why).
- Facts: per scene `{id, number, intExt, location, dayNight, cast[], eighths,
  songId?}`, the unlocked days' current assignment, `locationOf`, and the
  schedule prefs (days available). No synopsis, no names beyond cast labels the
  breakdown already holds.
- Schema `{days:[{day:int, sceneIds:[string], why:string}], note:string}`.
  Dropped: ids not sent, ids on a locked day, duplicates.
- Apply: `Locations.placeScene(id, day, {index})` per ticked day, in order;
  never touches a day the board has locked (`lockPreset`/day lock) and never a
  scene already shot (`shotState`). Undo: `undoPlace(record)` newest first,
  guarded by `undoIsCurrent` (otherwise says so and leaves it).

### 2. `recce-notes` (Lane A) plan.html#locations
- Pill: "Recce ideas" on the Locations section head (task per place, `ctx:
  {locationName}`; "All places" when none is picked). Kind `list`; item per
  location, detail = checklist.
- Facts: per location `{name, scenes:[{number, intExt, dayNight, castCount,
  action: first 240 chars of the scene synopsis}], existing recce field names
  that are empty}`. Address, lat/lng, contact, hospital and cost are NEVER sent.
- Schema `{places:[{name, ideas:string, checklist:[string]}]}`.
- Apply: `Locations.getRecce(name)`/`saveRecce` writes ONLY the recce fields
  that are empty now: `notes` (ideas), `bestTime`, `power`, `parking`,
  `toilets` from a fixed checklist mapping the model fills; `address`, `contact`,
  `permission`, `cost`, `lat`, `lng`, `hospital`, `police` are never written.
  Undo: blank exactly the fields written, if still equal to what was written.

### 3. `budget-estimate` (Lane A) budget.html
- Pill: "Estimate from my schedule" by the estimator's Add-line control. Kind
  `list`; one item per suggested line (`text` "Camera, 12 days", `detail` rate
  basis).
- Facts: `scheduleFacts()` (scenes, days, locations, pages), cast count and
  speaking-part count, extras and vehicles counted from breakdown tags, the
  film's region and `budgetCurrency()`, and the preset item names (so a line
  maps to a preset). Existing line amounts are not sent, only their names.
- Schema `{lines:[{item:string, days:number, rate:number, reason:string}],
  note:string}`; `rate` is in the budget's currency, the page's rate band is
  shown beside it (`rateHint`) and a rate outside it is flagged, not dropped.
- Apply: new rows only at `maxRowIndex()+1…` as `ci_<n>_item|custom|days|rate`
  through `saveCalcData`; an existing row is never edited; a name already on
  the sheet is skipped. Undo: remove exactly those row keys if unchanged.

### 4. `callsheet-notes` (Lane A) contacts.html#call-sheets
- Pill: "Draft notes" on the sheet's editor (`ctx: {sheetId}`). Kind `text`
  (original = the sheet's notes now, proposed = the draft).
- Facts: the `callsheet-text.js` facts object as the page builds it (film,
  day, date, generalCall, wrap, location, scenes[{number, slug, pages}],
  light, safety places) plus the unit message `unitMessage(facts)` as the
  tone example. Crew names, phones and per-person calls are NOT sent;
  `personMessage` is used only to show the draft reads well for one role.
- Schema `{notes:string, unitMessage:string}`; both clipped (`clip`), notes to
  800 chars, unitMessage to `WA_LIMIT`.
- Apply: fills `sheet.notes` ONLY when empty now (a non-empty one makes the
  task refuse in its own sentence at Run: "Notes are already written"); the
  unit message is shown in the note line with a copy affordance and is not
  stored. Undo: restore `''`. Writes via `updateCallSheet`.

### 5. `draft-changes` (Lane B) drafts.html
- Pill: "Summarise changes" next to the draft compare (`ctx: {olderId,
  newerId}`). Kind `read`.
- Facts: `diffElements`/`groupByScene` output reduced to per-scene counts and
  the changed lines' text (cap 12,000 chars; truncated with a note).
- Schema `{summary:string, scenes:[{heading, change}], watch:[string]}`.
- Apply: none at Run. The result text ends "Changed nothing." A Copy
  button on the Desk's read panel (see the Desk change, Lane B). Since 2 Nov 2026 its points are also
  items (`changesItems`/`wrapItems`/`certItems` in ai-post-model.js) and Accept
  keeps the ticked ones as notes through ai-tasks.js `keepNotes` (the task sets
  `keepAs`; registration gives it the apply): every
  point is a sticky note headed with its heading, never a scene row (the
  two drafts need not be the open script). Undo removes exactly those.

### 6. `day-wrap-summary` (Lane B) shoot.html
- Pill: "Wrap summary" in the day header (`ctx: {day}`). Kind `read`.
- Facts: the day's scenes `{number, slug, shotState, takes count, circled
  count, floorNote}` and totals; no crew, no contacts.
- Schema `{summary:string, owed:[string], tomorrow:[string]}`; every scene named
  is checked against the ids sent. Read-only at Run; copy button. Since 2 Nov 2026 its points are also
  items (`changesItems`/`wrapItems`/`certItems` in ai-post-model.js) and Accept
  keeps the ticked ones as notes through ai-tasks.js `keepNotes` (the task sets
  `keepAs`; registration gives it the apply): a point
  naming ONE scene of the day by its number goes on that row's note
  (appended, marked AI), the rest are sticky notes. Undo removes exactly those.

### 7. `edit-notes` (Lane B) edit.html
- Pill: "Edit notes" on the log's head. Kind `list`; item per scene
  (`id: 's<sceneId>'`).
- Facts: per scene `{number, slug, cut state, existing note text (not edited),
  pickups owed, runtime, floorNote}` and the cut versions' names.
- Schema `{notes:[{sceneId, note}]}`; ids not sent are dropped; note clipped to
  280 chars.
- Apply: `Edit.setSceneEdit(sceneId, {note})` ONLY where the scene's note is
  empty now. Undo: restore `''` if the note still equals what was written.

### 8. `cert-read` (Lane B) deliverables.html (Certification tab)
- Pill: "Certification read" in `#certification`. Kind `read`.
- Facts: `Cbfc.certificationReport()` reduced to `{ruleId, label, kind,
  tiers, scene numbers}` per fired rule, `ratingHint`, and the rule JSON's own
  `label`/`means` for the ratings. No script text, no dialogue is sent.
- Schema `{read:string, rules:[{ruleId, why}], questions:[string]}`; every
  `ruleId` must exist in `cbfc-rules.json` (`ruleById`), else dropped; the text
  is rendered with the ids as "[tobacco]". The prompt and the output MUST say
  it is a hint and not advice, and is not the Board's decision (the page's
  `DISCLAIMER` is appended verbatim by the task, not by the model).
- Apply: none at Run. Since 2 Nov 2026 its points are also
  items (`changesItems`/`wrapItems`/`certItems` in ai-post-model.js) and Accept
  keeps the ticked ones as notes through ai-tasks.js `keepNotes` (the task sets
  `keepAs`; registration gives it the apply): each rule and question is a sticky note. Undo
  removes exactly those.

### 9. `character-arcs` (Lane C) story.html (Characters & world)
- Pill: "Draft arcs" in the Characters section head. Kind `list`; item per
  character (`id: 'c<characterId>'`).
- Facts: per character `{name, role, want, need, arc state, arcStart, arcEnd}`
  and the beat sheet's step text plus each scene's number/slug/synopsis (the
  story the writer wrote). Nothing from contacts.
- Schema `{arcs:[{characterId, arc, arcStart, arcEnd}]}`; ids not sent dropped.
- Apply: for each ticked character, fill only the EMPTY ones of `arc`,
  `arcStart`, `arcEnd`. A field with a blueprint key (the slot map in
  `story-bible.json`; role holder of protagonist/antagonist/ally/mentor/love)
  is written through `blueprint-store.writeFields` (read back, merge-write),
  the rest through `characters.js` `setField`. Undo: blank the fields written
  if unchanged, same route.

### 10. `script-cleanup` (Lane C) screenplay.html
- Pill: a task in the AI menu ("Clean up pasted text") when the caret is in a
  selection or on a block just pasted/imported. Kind `list`; item per proposed
  element `{id:'e<i>', text, detail: type}` so each can be unticked.
- Facts: only the selected or pasted text (ctx `getSelection()` returns
  `{ids:[elementIds in order], text}`) plus the two elements above it for
  context. Up to 20,000 chars; refused longer with a sentence.
- Schema `{elements:[{type:'scene'|'action'|'character'|'dialogue'|'paren'|
  'transition', text:string}]}`. Words are kept: the task checks that the
  proposal's words equal the input's words ignoring case, spacing, and added
  cue punctuation (a proposal that rewrites wording is rejected, "this is
  formatting, not editing").
- Apply: replaces ONLY the elements in `ids` (the selection or pasted block) in
  place, new elements for the proposed list, each `type` through the editor's
  `setElementType` (ctx `setType(id, type)`), then `save()` and `render()`.
  Elements outside `ids` are untouched; if one of them changed since Run,
  nothing is written. Undo: put back the removed elements (same ids/text/type)
  in place and remove the added ones, if the block is still as written.

## Lanes (disjoint files)

| Lane | Tasks | Task module | Pages and pills | Own test |
| --- | --- | --- | --- | --- |
| A preprod | 1, 2, 3, 4 | `src/lib/ai-tasks-preprod.js` (+ pure `src/lib/ai-preprod-model.js`) | `src/pages/stripboard.js`, `src/pages/plan.js`, `src/ui/budget.js`, `src/pages/contacts.js` | `scripts/test-ai-preprod.mjs`, `scripts/prove-ai-preprod.mjs` |
| B post | 5, 6, 7, 8 | `src/lib/ai-tasks-post.js` (+ `src/lib/ai-post-model.js`) | `src/pages/drafts.js`, `src/pages/shoot.js`, `src/pages/edit.js`, `src/pages/deliverables.js`, `src/ui/ai-desk.js` (Copy button on the `read` panel only) | `scripts/test-ai-post.mjs`, `scripts/prove-ai-post.mjs` |
| C story | 9, 10 | `src/lib/ai-tasks-story.js` (+ `src/lib/ai-story-model.js`) | `src/pages/story.js` or `src/ui/story-bible.js` (the Characters section), `src/pages/screenplay.js` | `scripts/test-ai-story.mjs`, `scripts/prove-ai-story.mjs` |

Lane rules: edit only your files; do not edit `ai-tasks.js`, `ai-task-kit.js`,
another lane's module, `package.json` or `docs/` (the integrator adds
`test:ai-everywhere` and the HISTORY/CLAUDE rows). If you need a helper in the
kit, put it in your own pure model file. Put decisions that are pure (drop
unknown ids, blanks-only merge, the word-keep check, clipping) in the model file
so `scripts/test-ai-*.mjs` runs them in Node with no browser, in the style of
`test-ai-desk.mjs`.

## How each lane proves it

- Node: pure model tests (schema parse, id filtering, blanks-only merge, undo
  guard) plus `npm run test:undef`, `test:layers`, `test:ai-desk`.
- Browser: `scripts/prove-ai-<lane>.mjs` modelled on `prove-ai-desk.mjs`:
  Pro plan + a key via `aiScenario()` in `fake-supabase.mjs`, a faked
  Anthropic answer added to `fake-ai.mjs`' `deskAnswer()` (a lane adds its
  own answers in its own prove script instead, to keep files disjoint). Assert
  for each task: the pill is locked without Pro; nothing is sent before Run;
  nothing written before Accept; three idle seconds write nothing; Accept
  writes exactly the allowed fields and leaves a typed value alone; Undo
  restores only what was written; a read task shows a working Copy and
  (since 2 Nov 2026) keeps its points as notes with an exact Undo.
- Before handing back: `VITE_SITE_GATE=off npx vite build --outDir <dir>`,
  `npm run test:ai-lazy` on that dir, `prove:scroll` on the touched pages (a pill
  must not move content), delete the build dir.

## Decisions taken here (owner may overrule)

- Task 7 fills empty per-scene edit notes only (it does not add cut notes at a
  timecode: the model cannot see the cut).
- Task 4's unit message is shown and copyable, not stored: the sheet has no
  field for it, and a new field would be new data.
- Task 10 refuses wording changes: it formats, it does not edit.
- Task 5's copy button is a Desk-wide affordance on every `read` result.
