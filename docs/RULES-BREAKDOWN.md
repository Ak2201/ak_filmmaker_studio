# Rules breakdown — the no-AI paths (item 88)

Owner request, 4 Nov 2026: *"Can we break down a lot more of things without
AI? If it is possible, do them as such. Leave only what can be broken down
through AI."*

This file is the contract for that round. Every job the studio does today
only through an AI Desk task, and that a deterministic method (the script's
own structure, lexicons, counts, the schedule, the rate card, diffs) can do
well enough, gets a **no-AI path**: no key, no Pro plan, nothing sent
anywhere. The AI task stays as an optional **"Enhance with AI"**. Jobs that
genuinely need a language model stay AI-only (listed at the end, with why).

Two audits were run; this file records what survived checking them against
the code on `develop` (2421808).

---

## 0. The mechanism already exists: `local: true` Desk tasks

`src/lib/local-tasks.js` (`shot-basic`, `story-basic`) is the template and
nothing new needs inventing. A task with `local: true` is registered by
`src/ui/ai-desk.js` (`for (const t of LOCAL_TASKS) registerTask(t)`), and the
Desk then shows **no key step, no Pro gate, no provider disclosure, no chat
refinement**; it builds the list the moment it opens, from current data. Same
tick list, same Accept selected / Accept all / Skip, same Undo toast. One
review surface, two sources.

So every rules path in this round is a **local Desk task** whose `run()` calls
a **pure function** in `src/lib`, and whose `apply()` writes through the same
plan/undo helpers the AI task already uses. Rules:

1. **Pure logic in `src/lib/rules-<lane>.js`** — no `document`, no storage,
   no imports of `ai.js`/`ai-tasks*.js`/`ai-stamp.js` (`scripts/check-layers.mjs`
   enforces the `document` half; the test enforces the rest by grep).
   Node-testable with injected inputs.
2. **The local tasks in `src/lib/local-tasks-<lane>.js`**, each
   `{ id, label, kind: 'list', editable: false, local: true, input, run, apply }`.
   `input()` is SYNCHRONOUS and must not need a model loaded — return a fixed
   sentence describing what the rules read (the Desk awaits only
   `local-tasks.js`'s own `ready()` before calling it). `run()` awaits the
   lane file's own `ready()` (dynamic imports of the models), then calls the
   pure function. Fail with `e.kind = 'nocontent'` when there is nothing to
   propose, exactly like `local-tasks.js`.
3. **Registration** — `src/lib/local-tasks.js` is a shared registration file.
   Each lane adds exactly two lines and touches nothing else in it:
   ```js
   import { RULES_TASKS_<LANE> } from './local-tasks-<lane>.js';   // one import line
   export const LOCAL_TASKS = [shotBasic, storyBasic, ...RULES_TASKS_PREPROD, ...];  // append its spread
   ```
   Merge order A → B → C; the spread line is the one expected conflict and is
   resolved by keeping every spread.
4. **Never AI-stamped.** A record written by rules carries no `ai` and no
   `aiFill` (ai-stamp.js is for AI only). A rules scene note is written with
   `from: 'Rules (<label>)'`; a rules sticky note has `from: 'rules'`. Tests
   assert the absence of `ai`/`aiFill` on every record a rules apply writes.
5. **Write blanks or NEW records only; never overwrite typed words.** Every
   apply returns an exact Undo that removes/blanks only what it wrote and only
   while it still reads as written (later edits are kept and counted in the
   toast). An apply that writes nothing returns `null` and says so.
6. **Idempotent.** A second run on unchanged data proposes nothing new (or
   only items whose apply is a no-op), and nothing writes outside an Accept —
   verify's four-second idle-write check must stay at zero.
7. **No new localStorage key.** Fields on existing records only.
8. **Content in `src/data/*.json`** — lexicons, check phrases, templates. A
   list of words never lives in code.
9. **Money** only through `money.js` (`parseNum`, `fmtINR`, `INR`); never sum
   across currencies; never an inflation multiplier (item 7).
10. **Type changes** only through `setElementType`.
11. **Never call a real provider**, in code or in tests.

### UI entry

Beside each AI pill that has a rules twin, the page draws a kit button
(`k-btn`, secondary) whose label says what it does — **"Draft without AI"**
or the job's own verb ("Plan days", "Check recce", "Summarise changes") —
and, under it, nothing else: no key, no plan flag. Its click is a
`data-action` delegated handler (no inline handler) that runs
`import('../ui/ai-desk.js').then((D) => D.openDesk('<rules-id>', ctx))`,
the shape `breakdown-flow.js` already uses. The AI pill beside it is
relabelled **"Enhance with AI"** (its task list unchanged).

**Gating:** the rules button is NEVER behind `aiUnlocked()`. It follows the
owning module through plan-gate: the page (or its section) is already walled
by its module, and where a button sits in a section with its own module id
the host checks `allowed('<module>')` (fails open) and
`isDisabledEverywhere('<module>')` (hides it) — never `aiUnlocked()`.

---

## 1. Chosen items

`rules-full` = the rules job replaces the AI job for the common case;
`rules-partial` = the rules job does the measurable half and the AI keeps the
judgement half. Item ids of the rules tasks are permanent (a ctx can name
them): `<ai-id>-rules`.

### Lane A — `rules/preprod`

#### A1. `shoot-order-rules` — Plan days without AI (rules-full)
* **Verified:** `script-pipeline.js proposeDays()` packs UNscheduled scenes by
  place against `pageTarget()`; `stripboard-model.js scheduleByLocation()` is
  location-only. Neither looks at day/night, INT/EXT, cast, songs or closed
  days. `ai-preprod-model.js shootOrderFacts / closedDays / movable /
  planPlacements` already define what may move.
* **Pure:** `rules-preprod.js proposeShootOrder(facts, { castOf, songOf,
  pageTarget }) → { items: [{ id:'d<day>', day, sceneIds, detail }], note }`.
  Input = `shootOrderFacts()` output (already excludes shot scenes and closed
  days). Group by location as `locationIndex()` groups it (the same normalised name the Locations page uses); inside
  a location NIGHT scenes together and EXT before INT within a time; keep a
  `songId` run together; order locations longest first, ties broken by cast
  overlap with the previous location (fewer actor days); pack into days
  against the page target (`dpr.js DEFAULT_PAGE_TARGET` fallback), a day
  number never reusing a locked one. `detail` is templated: `"Same location:
  BEACH HOUSE · night · 5 4/8 pages · cast MARA, JOE"`. Deterministic: same
  input, same output (sort keys spelled out, script order last).
* **Write path:** the AI task's own: `planPlacements(items, listScenes())`
  then `LocM.placeScene` per move, Undo `LocM.undoIsCurrent` + `undoPlace` in
  reverse — **without** the `stampFill` lines. Nothing moves before Accept.
* **UI:** `src/pages/stripboard.js` beside the "Suggest day order" pill
  (~l.432): button **"Plan days"**; the pill becomes "Enhance with AI". The
  existing "Schedule by location" control (~l.1456) is left as it is.
* **Data:** none (structure only).

#### A2. `recce-notes-rules` — Recce checklist (rules-full)
* **Verified:** `lock-seed.js bestTimeOf` derives best time; `recceFacts /
  readRecce / planRecceWrites / planRecceUndo` and `RECCE_PREFIX = 'To check: '`
  are the AI path's contract.
* **Pure:** `proposeRecce(places, { tagsOf, extrasOf, light }) → { items:
  [{ id, location, field, text }] }`, one item per BLANK field of
  `RECCE_FIELDS`. Every line starts `To check: ` and is conditional on a real
  fact: bestTime from the scenes' DAY/NIGHT mix (+ sunrise/sunset from
  `recce-light.js`/`sun.js` when the place has lat/lng); power when any scene
  is INT or NIGHT or tags lights/sfx/special; parking when vehicles are
  tagged or extras exceed a threshold; toilets when extras or the day load
  passes a threshold; notes = the counts ("4 scenes, 2 night; vehicle in Sc 5;
  crowd of 40 in Sc 12"). A place with no qualifying fact gets no item.
  Never a statement about the place itself.
* **Data:** `src/data/recce-checks.json` — the phrases and thresholds, keyed
  by field and trigger.
* **Write path:** `planRecceWrites(selected, recceNow)` / `planRecceUndo`,
  writing through `locations.js setRecce`; no stamp.
* **UI:** `src/pages/plan.js` `recceIdeas` (~l.289): button **"Check recce"**
  beside the pill, which becomes "Enhance with AI".

#### A3. `budget-estimate-rules` — Budget lines from the schedule (rules-partial)
* **Verified:** `lock-seed.js planBudgetLines/lineList` derive the lines and
  DAYS with rates blank on purpose; `ai-preprod-model.js planBudgetRows /
  planBudgetUndo / firstFreeRow / existingLineNames` own the row ids;
  `bandOf()` lives in `ai-tasks-preprod.js` (not importable by this lane — the
  lane reimplements the band lookup over the same JSON in `rules-preprod.js`).
* **Pure:** `proposeBudget({ schedule, scenes, elements, presets, rates,
  region, existing }) → { items: [{ id, item, days, rate, band, basis }] }`.
  Lines = `lineList` output plus template lines chosen by counts (shoot days →
  camera/light/sound/grip kit, NIGHT scenes → extra light line, vehicles →
  vehicle line, stunts → stunt line). Names already on the sheet are skipped.
  **The rate is opt-in:** each item shows the band (low–high) from
  `rates.chennai.2024.json` (or `rates.us.json` for a non-India film via
  `film-region.js`) and a suggested midpoint, labelled `"rate card midpoint,
  an estimate — not a quote"`; when there is no band the rate stays blank.
  No multiplier, ever. Percent rows (contingency) stay with the page.
* **Data:** `src/data/budget-template.json` — the count-triggered template
  lines and which preset/band each maps to.
* **Write path:** `planBudgetRows(selected, data, firstFreeRow(...))` /
  `planBudgetUndo`, so ids clear both the estimate and the costs blob
  (`budget-line-ids.js`). Money through `money.js`.
* **UI:** `src/ui/budget.js` (~l.519): **"Draft lines"** beside the pill.

#### A4. `callsheet-notes-rules` — Call sheet notes (rules-full)
* **Verified:** `callsheet-text.js unitMessage()` already builds the unit
  message without AI; `callsheetFacts / callsheetWrite / callsheetUndo /
  NOTES_MAX` are the write contract.
* **Pure:** `proposeCallsheetNotes(facts, { tagsByScene, ages }) → { notes }`:
  one line per fact present, none invented — sunrise/sunset; "Night shoot:
  wrap after sunset" when a NIGHT scene is on the day or wrap passes sunset
  (`sun.js isPastSunset`); company moves (`dpr.js impliedMoves`); vehicle /
  animal / stunt / sfx tags by scene ("Bring the car for Sc 5"); a child
  artist from `cbfc.js agesIn` ("Child artist: guardian on set, hours
  limit"); total pages. Clipped to `NOTES_MAX`. Empty facts → empty notes →
  no item.
* **Write path:** `callsheetWrite(selected, notesNow)` (empty box only) /
  `callsheetUndo`.
* **UI:** `src/pages/contacts.js` call sheet AI row (~l.438): **"Write
  notes"**; the pill becomes "Enhance with AI".

**Lane A tests:** `npm run test:rules-preprod` (`scripts/test-rules-preprod.mjs`,
Node): determinism (two runs equal), closed days and shot scenes never in an
item, night/EXT ordering, page target respected, songs kept together; recce
only blank fields, every line prefixed, empty project → no items; budget
skips existing names, band shown, no rate without a band, ids clear the costs
blob, no multiplier (rates equal the JSON midpoint exactly); notes ≤ NOTES_MAX,
no line without its fact; every apply → undo round trip leaves storage
byte-identical; an edit after apply survives Undo; no `ai`/`aiFill` written;
`rules-preprod.js` imports nothing from `ai*.js`.
**Prove:** `npm run prove:rules-preprod` (`scripts/prove-rules-preprod.mjs`,
`PROVE_DIST=dist-verify`, no key in storage, signed out): on the Dragon sample
press "Plan days" → the Desk opens with no key step → Accept all → scenes
placed → Undo → board as before; same press-through for "Check recce",
"Draft lines", "Write notes". Zero network requests to any AI host.

### Lane B — `rules/post`

A shared, lane-owned helper: **`src/lib/rules-notes.js keepRuleNotes(selected,
{ label, after })`** — the rules twin of `ai-tasks.js keepNotes`, simpler
because a rules item always knows its scene row id: items with `sceneId` go
to `ScenesM.appendSceneNotes(list, { from: 'Rules (' + label + ')' })`, the
rest become sticky notes (`NotesM.makeNote`, `from: 'rules'`) through
`StoryM.addNotesToVault`; Undo = `undoSceneNotes(changes)` +
`removeManyFromVault(ids)`; a note already on its scene word for word is not
written again (`changes.same`), and the toast says what was written. No stamp.
(This is not a UI module despite touching storage through the models — it is
the same layer as `local-tasks.js`.)

#### B1. `draft-changes-rules` — What changed between drafts (rules-full)
* **Verified:** `script-diff.js diffElements/groupByScene/wordDiff` already
  yield per-scene ops; `ai-post-model.js changeFacts` is built from them.
* **Pure:** `rules-post.js summariseChanges({ groups, stats, before, after })
  → { items: [{ id, sceneId?, where, text }] }`: per scene "Scene 4: 6 lines
  added, 2 cut; dialogue changed for MARA"; whole scene added/removed;
  heading change (location/time, `scene-sync.js headingFields`); moved
  ("from 7 to 5"); new / lost speaking characters (`cueName` sets before vs
  after); page delta (`script-stats.js`). Counts and quoted names only, no
  interpretation.
* **UI:** `src/pages/drafts.js` (~l.183): **"Summarise changes"**.

#### B2. `day-wrap-summary-rules` — Wrap note (rules-full)
* **Pure:** `wrapNote(facts, { nextDay }) → { items }` from `wrapFacts()`:
  summary ("Day 4: 6 planned, 4 shot, 1 part, 1 dropped; 23 takes, 9
  circled"), owed = part / dropped / not-marked scenes plus each floor note
  verbatim (≤300), tomorrow = the next day's scenes in stripboard order
  (`orderedDayScenes`) plus carried part-shot scenes. Only scenes on the day
  or the next day are named (`sceneNumbersIn` check reused).
* **UI:** `src/pages/shoot.js` (~l.360): **"Wrap note"** beside the pill.

#### B3. `edit-notes-rules` — Edit notes from the logs (rules-full)
* **Pure:** `editNotes(rows) → { items: [{ id: sceneId, text }] }` for scenes
  whose edit note is blank: set state, takes/circled, pick-ups owed
  (`editlog.js pickupText`), floor note verbatim, run time vs page estimate
  (`cutRunTime`). ≤ `NOTE_MAX` (280). No fact → no item. Never describes
  footage.
* **Write path:** `canFill` / `canUndo` + `setSceneEdit` (the AI task's own
  checks), re-read at apply.
* **UI:** `src/pages/edit.js` (~l.517): **"Draft notes"**.

#### B4. `cert-read-rules` — Certification read (already-has-rules → surfaced)
* **Pure:** `certRead(report) → { items }` over `cbfc.js
  certificationReport/ratingHint`: "Hint: UA 16+ — tobacco (Sc 3, 9), child
  artist (Sc 5)", then each fired rule's own `what` and `do` text from
  `cbfc-rules.json` with its source and checked date, and its `do` list as
  questions. No wording beyond the JSON's sourced text; `HINT_LINE` and
  `DISCLAIMER` on every read.
* **UI:** `src/pages/deliverables.js` (~l.377): **"Read the flags"**.

#### B5. `tension-notes-rules` — Measured tension notes (rules-partial)
* **Verified:** `script-analysis-model.js tensionRead / pacingRead /
  castRead` already compute the flags the page shows; nothing turns them into
  keepable notes.
* **Pure:** `tensionNotes(a) → { items }` where `a = analyseScript(...)`:
  each flag → one note (`kind` tension|structure, scene number, the flag
  text with its numbers, worded as a measurement: "Measured: a slack run of
  6 scenes, Sc 14–19"), plus an arc note for a lead absent over a long run
  (castRead gaps). The why and the advice stay with the AI.
* **UI:** `src/ui/script-analysis.js` (~l.547): **"Measured notes"** beside
  the pill (its tasks unchanged).

All five keep through `keepRuleNotes` (B4 and B5 as sticky notes when not
on a scene).

**Lane B tests:** `npm run test:rules-post` (Node): each pure function on
fixtures (two drafts with add/remove/move/heading change; a day with every
state; edit rows with and without facts; a report with three fired rules; a
script with a slack run); only listed scenes named; blank-only for edit
notes; keepRuleNotes round trip exact, `same` skip, no `ai`/`aiFill`, no
`from: 'ai'`; idempotent re-run; no `ai*.js` import.
**Prove:** `npm run prove:rules-post`: drafts, shoot, edit, deliverables,
screenplay#analysis on the Dragon sample with no key — each button opens the
Desk without a key step, Accept writes, Undo restores; zero AI-host requests.

### Lane C — `rules/story`

#### C1. `script-cleanup-rules` — Clean up pasted text (rules-full)
* **Verified:** `script-import.js parseScript` (l.1294) and
  `script-paste.js planPaste/wantsSplit` already classify pasted text;
  `ai-story-model.js readCleanup / sameWords / cleanupPlan / blockStillThere /
  addedStillThere` are the safety gate and undo.
* **Pure:** `rules-story.js cleanupSplit(facts) → { items }`: the selection's
  joined text through `parseScript`, then the SAME `readCleanup` gate (a
  result whose words differ is refused); element ids kept for lines that
  come back unchanged. Lines the parser leaves as one action block are
  reported ("left for Enhance with AI").
* **Write path:** `cleanupPlan`; types only via `setElementType`; one undo
  step.
* **UI:** `src/pages/screenplay.js` (~l.874): **"Clean up (no AI)"**.

#### C2. `logline-rules` — Logline checklist (rules-partial)
* **Pure:** `loglineCheck(text, { names }) → { check: [{ part, found, words }] }`
  in the same shape as the AI's `res.check`: word count (target band), one
  sentence, a protagonist (a character name or a role noun), a goal ("must",
  "wants", "to <verb>"), an obstacle connective, stakes words, ≤2 proper
  names, no "a story about", no question. Shown as found / not found with the
  writer's own words; a checklist, never a score. Variants stay AI.
* **Data:** `src/data/logline-checks.json` (role nouns, goal/obstacle/stakes
  words, bands).
* **Write path:** none — it is a read; the Desk list's Accept keeps nothing
  (or keeps the checklist as a sticky note through the lane's own small
  keeper, `from: 'rules'`).
* **UI:** `src/ui/logline-workshop.js` (~l.87): **"Check without AI"**.

#### C3. `voice-check-rules` — Measured voice (rules-partial)
* **Pure:** `voiceStats(elements, character, { minLines }) → { items }`: per
  speaker mean/max line length, question/exclamation rate, signature words
  (tf-idf against the other speakers), vocabulary overlap; flags lines far
  from the speaker's own mean or mostly in another speaker's vocabulary.
  Requires a minimum line count (else "too few lines to measure"). Flags
  only, worded "measured"; rewrites stay AI.
* **UI:** `src/ui/coverage.js` (~l.364): **"Measure voice"**.

#### C4. Framing of jobs that are already rules
* `breakdown-tags`: the Breakdown page leads with the existing Auto-tag (no
  key); the AI task's label becomes "Enhance tags with AI". `src/pages/breakdown.js` (~l.85).
* `shot-draft`: a **"Shots without AI"** button (opens `shot-basic`) beside
  every `shot-draft` pill — `src/pages/visualize.js` (~l.952) and
  `src/ui/breakdown-overview.js` (~l.155). `breakdown-flow.js` is unchanged.
* `scene-story`: `story-basic` already exists and is reached through the
  Manual breakdown chain; no new button.

**Lane C tests:** `npm run test:rules-story` (Node): cleanup keeps every word
in order on fixtures (slug, cue, paren, transition, an ALL-CAPS action line),
refuses a changed word, keeps ids of unchanged lines; logline checklist on
good/bad fixtures, same shape as the AI check; voice stats deterministic,
min-line guard; no `ai*.js` import; no `ai`/`aiFill` written.
**Prove:** `npm run prove:rules-story`: screenplay cleanup press-through
(Accept, one Ctrl+Z / Undo restores), logline check opens with no key,
visualize "Shots without AI" opens `shot-basic`; zero AI-host requests.

---

## 2. Not this round (possible, deferred) — and why

* **blocking-enhance as a geometry linter** (camera across the 180° line,
  overlapping marks, cast with no mark, FOV misses) and **blocking-draft as a
  template layout**: deterministic and worth doing, but they sit on the
  one-camera / one-floor invariants of item 85 and `undoBlocking`'s split
  rules; they deserve their own round with `test:blocking` coverage.
* **story-map / synopsis-script positional split** (sentences to beats by
  `at`): a proportional split is often wrong for non-linear stories; it would
  write marks/beats a writer then trusts. Deferred until a review-first
  surface for it is designed.
* **scene-notes measured cut candidates**: overlaps B5's measured notes;
  revisit after B5 ships.
* **character-arcs anchors** ("first seen in Sc N"): the two audits disagreed;
  writing synopses into `arcStart`/`arcEnd` would read as a finished arc.
  Not written. (A read-only "appears Sc 2–41" line may be added later.)
* **genre-comps lexicon guess**, **board-frames SVG schematic**: low value or
  confusable with the real output.
* Other ideas from the audits (story-day continuity, safety/permit checklist,
  call times, DOOD conflicts, wardrobe continuity, script format lint, cue
  sheet, revision report) are new features, not AI replacements; they go to
  `docs/HANDOFF.md`'s queue.

## 3. Stays AI-only

| Task | Why |
| --- | --- |
| coverage | a verdict and critique; numbers cannot say Pass / Consider |
| dialogue-pass | rewriting a speech is generative prose |
| beat-critique | a judgement of whether a beat does its job |
| story-steps | invents new plot steps |
| gen-scenes | invents a scene list |
| gen-batch | writes pages: action and dialogue |
| genre-comps | comparable films need world knowledge |
| audience-test / audience-quick / audience-ask | simulated opinion, by definition a model |
| board-frames | pictures need an image model |
| character-arcs | how a person changes is interpretation |
| the "Enhance" half of every chosen item | the why, the advice, the tone |

## 4. CLAUDE.md status row (#88), to add when the lanes merge

| 88 | Rules breakdown: no-AI paths (4 Nov 2026) | Done | `docs/RULES-BREAKDOWN.md`. Every rules path is a `local: true` Desk task (`local-tasks-preprod/post/story.js`, registered by spread in `local-tasks.js`) over a PURE `rules-*.js`: no key, no Pro, never `aiUnlocked()`, follows its module's plan; nothing before Accept, blanks or new records only, exact Undo, never AI-stamped (`from: 'Rules (…)'` / `'rules'`). Ids are permanent: shoot-order-, recce-notes-, budget-estimate-, callsheet-notes-, draft-changes-, day-wrap-summary-, edit-notes-, cert-read-, tension-notes-, script-cleanup-, logline-, voice-check-`rules`. A budget rate is a rate-card MIDPOINT the person ticks, with the band shown; no multiplier. The AI pill beside a rules button reads "Enhance with AI". `test:rules-preprod/post/story`, `prove:rules-preprod/post/story`. |

## 5. Lanes and file ownership

Each lane works on its own branch from `develop` and edits ONLY the files
listed. Shared registration files — `package.json` (one `test:`/`prove:` line
each, and one `&& npm run test:rules-<lane>` appended to `test:all`),
`.github/workflows/gate.yml` (one step per prove), `src/lib/local-tasks.js`
(the two lines in §0) — take additions on their own lines. Read-only imports
of anything else are fine; editing it is not. If a lane needs a change in a
file it does not own, it stops and reports it.

| Lane | Branch | Owns (new) | Owns (edit) |
| --- | --- | --- | --- |
| A preprod | `rules/preprod` | `src/lib/rules-preprod.js`, `src/lib/local-tasks-preprod.js`, `src/data/recce-checks.json`, `src/data/budget-template.json`, `scripts/test-rules-preprod.mjs`, `scripts/prove-rules-preprod.mjs` | `src/pages/stripboard.js`, `src/pages/plan.js`, `src/ui/budget.js`, `src/pages/contacts.js` (the AI rows only) |
| B post | `rules/post` | `src/lib/rules-post.js`, `src/lib/rules-notes.js`, `src/lib/local-tasks-post.js`, `scripts/test-rules-post.mjs`, `scripts/prove-rules-post.mjs` | `src/pages/drafts.js`, `src/pages/shoot.js`, `src/pages/edit.js`, `src/pages/deliverables.js`, `src/ui/script-analysis.js` |
| C story | `rules/story` | `src/lib/rules-story.js`, `src/lib/local-tasks-story.js`, `src/data/logline-checks.json`, `scripts/test-rules-story.mjs`, `scripts/prove-rules-story.mjs` | `src/pages/screenplay.js`, `src/ui/logline-workshop.js`, `src/ui/coverage.js`, `src/pages/breakdown.js`, `src/pages/visualize.js`, `src/ui/breakdown-overview.js` |

No lane edits `ai-tasks*.js`, `ai-*-model.js`, `ai-desk.js`, `ai-pill.js`,
`ai-stamp.js`, `script-pipeline.js`, `lock-*.js`, `shot-rules.js` or any
model file. A new `.json` lexicon lands in its own Vite data chunk
automatically (`manualChunks`); no `vite.config.js` edit is expected.

**Gate for each lane before it reports:** `npm run test:all` (includes
`test:undef`, `test:layers`, `test:ai-history`), its own test and prove,
`npm run build:open && npm run verify` (a relabelled pill or a new button
changes words: add `EXPECTED` rows with reasons, do not re-baseline in a
lane), and the raw-colour grep from CLAUDE.md. Merge order A → B → C into
`develop`; the integrator adds row #88 to CLAUDE.md.
