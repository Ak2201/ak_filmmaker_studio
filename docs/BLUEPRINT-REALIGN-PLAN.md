# Blueprint and stages realignment — plan

Status: BUILT, 6 Oct 2026. Revision 3 (see the end) is what shipped; CLAUDE.md open item 16 has the notes.

**Owner's asks:**
- Round 1: "Story › Blueprint › Story also has Pre-Production,
  Production and Post-Production, which will confuse the user. Realign
  it, make it alive, remove nothing."
- Round 2:
  - Should Story and Screenplay be separate or bound together?
  - Move the right Screenplay items into Pre-Production.
  - The blueprint should have beats, import and export, the same items
    as the Story page has, but in order.
  - Improve the home page's story space and the blueprint's story space.
  - Remove no feature.

**The rule for everything below: NOTHING IS REMOVED.** Every module,
page, step, field and `data-key` survives. Things move to a different
menu, get renamed, or get linked to each other. A page that holds two
stages, such as `breakdown.html`, already works the way `contacts.html`
does: the breadcrumb follows the open tab.

---

## 1. What is wrong today (checked on the built app with the Dragon sample)

### 1.1 One map filed inside the other

| Map | Where it is filed | Its parts |
|---|---|---|
| **The five stages** (tools) | the phase bar | Story · Screenplay · Pre-Production · Production · Post-Production |
| **Feature Blueprint** (a guide) | a module of **Story** | Phase 01 Story (1–12) · Phase 02 Pre-Production (13–24) · Phase 03 Production (25–28) · Phase 04 Post-Production (29–32) |
| **Short Blueprint** (a guide) | also under **Story** | 11 steps, seed to festival, no parts at all |

You click Story › Feature Blueprint and land on "Phase 02 ·
Pre-Production", a stage inside a stage.

- The blueprint calls its parts "phases", and they are not the app's
  stages: there are four of them against five stages, and none is
  Screenplay.
- Its cover stamps mix two words for the same thing: "VOL I · STORY",
  then "PHASE 02".

### 1.2 Four separate beat systems that never meet

| Where | What | Stored in |
|---|---|---|
| Story page (`story.html`) | Three-Act (7), **Save the Cat (15)**, Story Circle (8), tagged on a synopsis, with a tension curve | `fms_story_v1` |
| Feature step 08 "The 15 Beats" | **the same 15 Save the Cat beats**, typed as fields | blueprint `data-key`s |
| Short step 04 "The 5-Beat Structure" | five beats | short blueprint keys |
| Write › Outline | reads the Story page's framework; scenes carry `beatId` | scene rows |

A writer can fill in the 15 beats twice, in two places, and neither
place knows about the other.

### 1.3 The Story page

- **It is empty on the Dragon sample,** even though the sample's
  blueprint is 69% filled. The sample never seeds `fms_story_v1`.
- **It is one long scroll** (3,300px): the start cards, framework,
  synopsis, beats, the AI tagger, the pitch deck and the Idea Vault.
- **Import appears twice** on the empty page: once on the start card and
  once in the bar.
- **There is no synopsis export.** The pitch deck PDF is the only export.

### 1.4 The home page (`index.html`, 9,000px)

- **Stale copy:**
  - "Story (Vol I) and Pre-Production (Vol II) joined into one
    continuous tool".
  - "Work through Vol I (Story)… then Vol II".
  - The Feature Blueprint is labelled "24 guided steps" in
    `navigation.json`; it has 32.
  - The sample's Stage field says "Both volumes".
- **A stage label guessed from a percentage.** Under 50% filled it says
  "Vol I · Story", under 80% "Vol II · Pre-prod", whatever you are
  actually working on.
- **Three entry points that overlap:** "The map" (the stages), "Three
  doors" (the blueprints) and "Where to start". None of them says where
  this film is.

### 1.5 Small things found on the way

- Scene List and Script Breakdowns both link to `breakdown.html#scenes`.
- The extension's side panel reads only `nav.phases`, so anything moved
  out of the stages disappears from it (KNOWN-ISSUES #2).

---

## 2. Story and Screenplay: separate or bound?

**Recommendation: keep them as separate stages, and bind them with a
hand-off.**

- **They are different jobs, done with different tools.**
  - Story is deciding what the film is: synopsis, structure, beats,
    pacing.
  - Screenplay is writing the pages and everything read from the pages.
  - Merged, the Story stage would hold about 16 modules, which brings
    back the overload this plan exists to fix.
- **They should feel like one flow.** The binding:
  - **Story's last move hands off to Screenplay's first.** A "Story
    locked → start the pages" card on the Story page opens Write ›
    Outline. Outline already reads the Story page's framework.
  - **The beats travel.** A Story beat shows up on Write's beat board
    and in the margin. The plumbing exists; it needs to be visible in
    both places.
  - **In the blueprint they become Part I and Part II, side by side** (§4).
- **Why not merge:** the five stages are also the plan-gate's features,
  the phase colours and the breadcrumb. Merging two stages changes all
  of those. Keeping them separate and linked changes none.

---

## 3. Screenplay → Pre-Production: checked, module by module

The rule: **it stays in Screenplay if it is the script itself, or read
straight off the pages. It moves if it is planning the shoot.**

| Module | Now | Verdict | Why |
|---|---|---|---|
| Screenplay | Screenplay | **stays** | the pages |
| Revisions | Screenplay | **stays** | versions of the pages |
| Documents | Screenplay | **stays** | treatment, one-pager: writer's documents |
| Scene List | Screenplay | **stays** | the pages, sliced into scenes |
| Screen Time | Screenplay | **stays** | running time read off the pages |
| Script Breakdowns | Screenplay | **→ Pre-Production** | tagging cast, props, wardrobe and VFX is the 1st AD's and the line producer's prep, the first job of pre-production |
| Elements | Screenplay | **→ Pre-Production** | the library of what has to be sourced |
| Auto-Tagging | Screenplay | **→ Pre-Production** | a helper for the breakdown, so it goes where the breakdown goes |
| Songs | Screenplay | **→ Pre-Production** | its own blurb says "each its own shoot block": choreography, location, days |
| Stripboard | Screenplay | **→ Pre-Production** | ordering scenes into shoot days is scheduling, and its Day Out of Days twin is already in Pre-Production |
| Cast Matrix | Screenplay | **→ Pre-Production** | who shares the most scenes drives casting and the schedule. (Debatable: a writer reads it too. It stays reachable from the Scene List either way.) |
| Pitch Deck | Screenplay | **→ Story** | it lives on `story.html` and is built from the logline, synopsis and beats. It is packaging the story, not writing pages |

**Result:**
- Screenplay: 5 modules, the pages and what is read from them.
- Pre-Production: 17 modules. To keep that readable, its menu is grouped
  under four small headings: **Break down** · **See it** · **Cost and
  staff it** · **Schedule it**. These are the stage's own blurb, "See
  it, cost it, staff it, schedule it", made literal.

**What does not change:**
- Module ids, so plan features, the launcher's counts and the palette
  are all safe.
- Page URLs and fragments.
- `breakdown.html` and `reports.html` become two-stage pages, which
  `resolveLocation()` already handles.

Scene List and Script Breakdowns get two different targets:
`breakdown.html#scenes` and `breakdown.html#breakdown`, the second on a
wrapper that always renders, per the nav-target trap in CLAUDE.md. The
old `#scenes` link keeps working.

---

## 4. The blueprint: realigned to the five stages

### 4.1 Where it lives

- **A "Blueprints" shelf in the rail,** beside the Library, holding
  Feature and Short. This is the same mechanism the Library's three tabs
  use (`navmodel.js` `shelves()`).
- **Each stage menu gets a footer row,** "Guide for this stage → Feature
  steps 11–13 · Short steps 6–8". It is a cross-reference in its own
  row, not a module.
- **The breadcrumb** reads `Blueprints › Feature › Part II · Screenplay`.

### 4.2 Five parts that match the five stages, order unchanged

The 32 steps keep their order and numbers. Only the part boundaries
move, so each part is exactly one stage.

| Part | Stage | Steps | Note |
|---|---|---|---|
| I | Story | 01–10 Spark → Setups & Payoffs | the whole development of the idea |
| II | Screenplay | 11 Scene List · 12 Final Check · **"Write the draft" interlude** · 13 Script Lock | steps 11–12 were the end of "Story"; step 13 was the start of "Pre-Production" |
| III | Pre-Production | 14–24 | |
| IV | Production | 25–28 | |
| V | Post-Production | 29–32 | |

- **The new "Write the draft" interlude** is not a step and has no
  fields. The feature blueprint today has no step for writing the
  screenplay at all: it goes from "Final Check, before you write FADE
  IN" straight to "Script Lock". The interlude says so, opens Write, and
  shows the live page and scene count (§5.2). It follows the pattern of
  the existing Treatment Ladder interlude.
- **"Phase" becomes "Part" everywhere inside the blueprints,** so
  "phase" or "stage" only ever means the app's five.
- **What stays the same:**
  - The ids `#vol-1`, `#vol-2`, `#phase-3` and `#phase-4`, and every
    `data-key`.
  - The covers' fields (`v1_*`, `v2_*`, `p3_*`, `p4_*`) stay on their
    covers.
  - The new Part II cover has no fields. It gets id `#part-2`, which is
    also how the guide row links to it.
- **The Short Blueprint keeps its 11 steps in order,** with each step
  tagged:

  | Stage | Short steps |
  |---|---|
  | Story | 1–5 |
  | Screenplay | 6–8 |
  | Pre-Production and Production | 9 |
  | Post | 10 Festival |
  | (lock) | 11 Final Lock |

- **Every step in both blueprints gets a stage chip** in that stage's
  hue.
- **The mapping lives in one sidecar,** `src/data/steps.stages.json`,
  like `steps.priority.json`. The step files are regenerated by
  `npm run extract` and would lose anything written into them.

### 4.3 The Story toolkit, in order, inside the blueprint (the "beats, import, export" ask)

The Story page's tools appear in the blueprint at the step where you
need them, in working order. They are the same tools and the same data,
not copies. Each is shown as a compact panel that reads and writes the
Story page's own key, `fms_story_v1`.

| In the blueprint | Story page tool | What it does there |
|---|---|---|
| Part I cover | **Start: Sample · New · Import** | the same three start cards. Import a synopsis or treatment (`.docx`, `.pdf`, `.txt`) and it lands on the Story page |
| Step 02 Logline | **the Idea Vault** | clippings beside the logline you are shaping |
| Step 08 The 15 Beats | **Beats: Save the Cat** | your step-08 answers and the Story page's tagged passages for each beat, side by side, with "Open in Story" and "Map with AI" |
| Step 10 → Part I wrap | **Pacing** | the tension curve, read only, with its slack flags |
| End of Part I | **Export** | synopsis as `.txt` / `.docx`, beat sheet as `.md` (new, §6.4), and the **Pitch Deck** PDF |
| Short step 04 | **Beats: Three-Act** | the same panel; the short's five beats beside the Three-Act framework |

**How the two beat lists are bound, without storing anything twice**
(the "Don't persist the same thing twice" trap in CLAUDE.md):
- Step 08's fields stay the blueprint's own. The Story page's tags stay
  the Story page's own.
- Each place shows the other's answer for the same beat, worked out at
  render time.
- There is exactly one copying action: "Start the Story synopsis from
  my 15 beats". It is offered only when the synopsis is empty, writes
  nothing over existing text, and has Undo.

The blueprint's existing Export menu (Markdown, JSON, PDF) stays as it
is. The Part I export panel adds the story exports beside it, without
replacing anything.

---

## 5. Making it alive

1. **"Do this in…" buttons on every step.**
   - **What it does:** opens the tool where the step's work happens.
     - 08 → Story beats · Write › Outline
     - 11 → Scene List
     - 13 → Revisions
     - 15 → Lookbook
     - 16 → Shot List · Storyboard
     - 18–19 → Breakdown › Elements
     - 20 → Cast Matrix · Contacts
     - 21 → Locations
     - 22 → Songs
     - 23 → Stripboard · Budget · Contacts
     - 24 → Readiness on the Dashboard
     - 25 → Shoot Day · Call Sheets
     - 26–27 → Shoot Day
     - 29–30 → Edit Log
     - 32 → Deliverables
   - **Where the links come from:** the sidecar, by module id.
2. **Live readouts on the steps,** worked out at render time and stored
   nowhere.
   - **Examples:**
     - Step 11: "36 scenes · 105 pages · 4 with no location".
     - The draft interlude: "106.5 pages written, 2,361 lines".
     - Step 23: "18 shoot days · budget ₹… · 29 in the unit".
     - Step 25: "Day 3 of 18 · 6 scenes shot".
   - **How:** each readout reads from `readiness.js` and the scene model.
     An empty film shows the button instead.
3. **The guide inside each tool.**
   - **What it does:** a "Blueprint step 16" pill on the module page
     opens a side drawer with that step's question and your answer to
     it, editable in place.
   - **How:** the answer saves to the same `data-key`, through the
     existing save path.
4. **A journey strip on the home page and the Dashboard.**
   - **What it does:** five stages in a row, each with guide progress
     (steps) and tool progress (readiness), "you are here", and one
     "Next" button.
   - **What it replaces:** the percentage-guessed "Vol II · Pre-prod"
     label is replaced by the real stage. The label stays; only its
     source changes.
5. **Hand-offs.**
   - **What they do:** move a step's answer into a tool, for example
     - Step 11 → "Send these scenes to the Breakdown";
     - Step 02 → "Use as the synopsis's first line";
     - Step 15 → "Add to the Lookbook".
   - **Safety rules:** each is an explicit click, adds only, and has
     Undo.
6. **A wrap card at the end of each part.**
   - **What it shows:** "Part I done: logline, 15 beats, 42 scene
     ideas", then the next part and its first tool.
   - **How:** derived from the existing ticks.

---

## 6. Home and Story page improvements (nothing removed)

### 6.1 Home (`index.html`)

- **Section order follows the work:**
  1. Your projects
  2. **the journey strip** (new, §5.4)
  3. The map (five stages)
  4. The blueprints ("Three doors")
  5. Where to start
  6. Tools
  7. Master index
  8. Activity

  All of them stay; only the order changes.
- **"Where to start" points into the journey:** its cards open the Part
  of the blueprint and the stage that fit the answer.
- **Fix the stale copy:** "Vol I / Vol II", "joined into one continuous
  tool", "24 guided steps" (→ 32, derived), and the sample's "Both
  volumes" → "All five stages".
- **The project card's stage label** comes from the journey (§5.4), not
  from a percentage.

### 6.2 The Story page (`story.html`)

- **Tabs below the editor.** The synopsis and beat matrix stay as the
  editor, untabbed: CLAUDE.md keeps `story.html` out of the tab list for
  that reason. The sections under them, **Pacing · Map with AI · Pitch
  deck · Idea Vault**, become a tab strip with the same hash links
  (`#pitch`, `#vault`), so the deep links still land. This takes the
  page from one 3,300px scroll to the editor plus one panel.
- **The Dragon sample gets a story,** a synopsis with Save the Cat tags,
  so the Story page, the Outline and the blueprint's beat panel have
  something to show. Like the screenplay, it is written from the
  sample's own scene synopses and marked as a reconstruction. It is a
  dynamic import, the same as `sample.dragon.script.json`.
- **One import control at a time.** The bar's IMPORT is hidden while the
  "Bring a file" card is on screen, and comes back once the card goes.
  Both still exist.
- **A "Story locked → start the pages" card** at the foot of the page,
  the hand-off from §2.
- **"Guide: Feature steps 01–10"** in the page header, linking to Part I.

### 6.3 The blueprint's Story part (`feature.html` Part I, `short.html` steps 1–5)

- The Part I cover: the five-part stamps, then the start cards (§4.3).
- Step 08 binds to the Story beats (§4.3). Short step 04 binds to the
  Three-Act beats.
- The Part I wrap card, with the export panel.
- **The step rail** groups by Part, with stage hues, and the Treatment
  Ladder interlude sits under Part I.
- **The "Jump to…" menu** lists the five Parts.

### 6.4 New exports (adds, never replaces)

- **Synopsis:** `.txt` and `.docx`. The `.docx` writer is the existing
  hand-rolled zip that `docx-text.js` reads in reverse, or `.txt` only,
  if that proves heavy.
- **Beat sheet:** `.md`, with the framework, each beat, its passage and
  the step-08 answer.
- **Both are reachable from the Story page bar and the blueprint's
  Part I panel.**

---

## 7. Order of work, and how each piece is checked

| # | Work | Main files | Gate impact |
|---|---|---|---|
| A | Navigation: the Blueprints shelf; Screenplay → Pre-Production moves; Pitch Deck → Story; Pre-Production sub-headings; the guide row; the breadcrumb; `#breakdown` target; extension panel on `moduleGroups()` | `navigation.json`, `navmodel.js`, `shell.js`, `panel.js`, `breakdown.js` | nav and hub words move → deliberate re-baseline, **zero data-key movement** |
| B | The five parts: the Part II cover and draft interlude, Phase → Part, stage chips, the sidecar, rail and jump menu | `feature.js`, `short.js`, `steps.js`, `steps.stages.json` | feature and short words → re-baseline |
| C | "Do this in…" links | `steps.js`, sidecar | words only |
| D | The Story toolkit in the blueprint, and the beat binding | new `src/ui/story-kit.js`, `steps.js`, `story.js` (read helpers) | writes only `fms_story_v1`, through `Story.saveStory` |
| E | Story page: tabs under the editor, sample story, single import, hand-off card, exports | `story.js`, `sample.dragon.story.json`, `vite.config.js` (lazy exception) | story words → re-baseline |
| F | Live readouts | `steps.js`, `readiness.js` (read only) | seeded words only |
| G | Home: order, stale copy, journey strip and stage label | `hub.js`, `dashboard.js` | hub words → re-baseline |
| H | The guide drawer in modules | new `src/ui/blueprint-drawer.js` | round-trip proof: same key, same value |
| I | Hand-offs and wrap cards | `steps.js`, `scenes.js`, `story.js` | new prove script: add-only and Undo |

- **The realignment you asked for is A, B, D, E and G.** C, F, H and I
  are what makes it alive.
- **Each letter can be its own agent.** A goes first because everything
  else reads the new nav.
- **Proof for every step:**
  - `npm run verify` is green after each deliberate re-baseline, with
    the diff checked for zero data-key movement.
  - `prove:billing`, `prove:gate` and `prove:extension` pass, because
    the nav and the plan features moved.
  - The fragment loads (`#vol-1`, `#vol-2`, `#phase-3`, `#phase-4`,
    `#part-2`, `#scenes`, `#breakdown`) all land, in the empty and
    seeded states.
  - A browser read at 390px of `feature.html`, `short.html`, `story.html`
    and the hub.

---

## 8. Decisions for the owner (recommendation first)

1. **Story and Screenplay:** **separate stages, bound by the hand-off**
   (§2), or merged into one stage.
2. **The Screenplay → Pre-Production moves** (§3): all six as listed, or
   keep **Cast Matrix** in Screenplay.
3. **Pitch Deck → Story:** **yes**, or leave it in Screenplay.
4. **Blueprints location:** **their own shelf in the rail**, or a Library
   tab.
5. **Five parts matching the stages** (§4.2): **yes**, or keep four parts
   with stage chips only.
6. **The guide drawer in each tool:** **may edit the answer**, or show it
   only.

## 9. My reading of "same items as in the dashboard"

I read "dashboard" as **the Story page**, which has the beats, the
import and the pitch-deck export, and planned §4.3 on that basis. If you
meant the **Dashboard page** (`dashboard.html`: the stat tiles, "the next
thing to do", blueprint progress, the chain and readiness), the journey
strip (§5.4) and the wrap cards (§5.6) carry those into the blueprint.
Either way both are in the plan.


---

# Revision 3 — the approved build plan (6 Oct 2026)

Supersedes the decisions in §8 above (all taken as recommended), and adds the story-first path, every beat format, beat guidance in Write, script → shot list (AI or basic), and script-driven scenes with a bin.


## Context

The owner found the Story and Blueprint spaces confusing.

- **A stage inside a stage.** Story › Feature Blueprint opens a page
  with its own "Phase 02 Pre-Production … Phase 04 Post-Production".
- **Screenplay holds shoot-planning tools.**
- **Four separate beat systems that never meet:**
  - the Story page frameworks;
  - Feature step 08 "15 Beats";
  - Short step 04 "5-Beat";
  - Write › Outline.
- **The Story page opens on a blank synopsis.**

The owner's latest ask: writing a story should START WITH A STEP OUTLINE
and then proceed, not jump straight into writing. The decisions so far:

- **A step outline means both:** a guided path, and at its centre a
  numbered list of story events under each beat.
- **Guided but skippable.** Import and "I already have a synopsis" stay.
- **Nothing is removed.** Every module, step, field and `data-key`
  survives. Things are moved, renamed or linked.

Later asks from the owner, all folded into this plan:
- **The writer picks the beat sheet format, and every format is
  offered** (§1a).
- **The beats guide the writing when wanted** (§1b).
- **A script breaks down into a shot list:** with AI when there is a
  key, and a basic rule-based breakdown when there is not (§1c).
- **Everything is attached to the project and derived from story →
  script → scenes.** A new scene heading adds its scene automatically.
  A removed one takes its breakdown, shots, schedule and call-sheet rows
  with it, into a bin first and then deleted for good (§1d).

The full rationale is in `docs/BLUEPRINT-REALIGN-PLAN.md`, revision 2,
already pushed. Revision 3 adds this story path and is the first commit
of the build.

The defaults below are the recommendations from that doc. The owner
hasn't overridden any of them:

- Story and Screenplay stay SEPARATE stages, bound by a hand-off.
- Six modules move from Screenplay to Pre-Production.
- Pitch Deck moves to Story.
- A Blueprints shelf in the rail.
- Five blueprint parts, one per stage.
- The guide drawer edits in place.

## 1. The story path (new, the core of this ask)

**`story.html` gets a path stepper**, which is how a new story begins:

**1 Idea → 2 Logline → 3 Structure → 4 Step outline → 5 Synopsis →
6 To the Screenplay**

- **1 Idea / 2 Logline.**
  - Two short fields with a prompt and a Dragon example.
  - Stored in the story model: `logline` already exists in
    `blankStory()` in `src/lib/story.js`, and `idea` is added there.
  - If the blueprint's step 01 or 02 answer exists, "Use my blueprint
    answer" copies it. This is explicit and offered only when the field
    is empty.
- **3 Structure: the writer picks the beat sheet format.**
  - A card grid replaces the bare select. The select stays as the
    compact control in the bar. Each card shows the format's name, its
    beat count, one line on what it suits, and a mini tension curve
    drawn from its beats' `tension`.
  - Every format is offered. The pre-selection is only a suggestion:
    Save the Cat for a feature, Short five-beat for a short. The choice
    is already stored as `story.framework`.
  - Switching format later is a view change, as it is today. Outline
    steps keep their beat ids qualified by framework, and a step whose
    beat does not exist in the new format is listed under "Not placed
    in this format" rather than lost (§1a).
- **4 Step outline (the main screen).**
  - For each beat of the framework there is a card with:
    - the beat's `prompt` from `frameworks.json`;
    - for `save_the_cat`, the blueprint step-08 answer for that beat,
      worked out at render time and read only;
    - a numbered list of steps, one or two lines each. Numbering runs
      1..N across the whole outline.
  - You can add, edit, reorder and move steps between beats.
  - A coverage line reads, for example, "12 of 15 beats have a step".
  - Optional, last: "Suggest steps for this beat" through the existing
    BYOK path (`callModel()` in `src/lib/ai.js`, gated by
    `src/ui/ai-panel.js`). It is a new `draftOutlineSteps()` beside
    `draftBeatSheet()`.
- **5 Synopsis.**
  - "Build my synopsis from the outline" assembles the steps into
    `source`, one paragraph per act, using `actsOf()` from
    `src/lib/beat-outline.js`.
  - It creates a mark for each step's exact text span, with
    `origin: 'outline'`, through `addMark()`, so the beat matrix and the
    tension curve light up at once.
  - It is offered directly when the synopsis is empty. When it isn't,
    it reads "Rebuild": a confirm plus a one-level Undo snapshot, never
    silent.
  - After that, the existing editor, tagging, pacing and AI mapping work
    unchanged.
- **6 To the Screenplay.**
  - "Send the outline to Screenplay" makes one placeholder scene per
    step, with `beatId` set (the field `src/lib/scenes.js` already has).
  - It reuses `draftPlan()` / `insertionPoint()` from
    `src/lib/beat-outline.js`.
  - It is add-only, with Undo, and then opens `write.html#outline`.
- **The stepper's state is derived** from what is filled (logline set,
  steps per beat, source present, scenes with a beatId). Nothing new is
  stored for it.
- **Skippable.** The existing Sample, New and Import cards stay:
  - "New" now starts the path.
  - The blank-page card becomes "I already have a synopsis", with paste
    and Import.
  - Every stepper tab can be clicked at any time.
- **Storage.**
  - `outline: []` (`{id, beat, text}`) and `idea: ''` go into
    `blankStory()`.
  - `loadStory()` already spreads the blank under the stored row, so old
    stories need no migration.
  - It stays in the same key, `fms_story_v1`, already in all five
    registries and the cloud scope. No new key.

## 1a. Every beat sheet format (`src/data/frameworks.json`)

The file has three today: `three_act` (7), `save_the_cat` (15) and
`story_circle` (8, labelled "Hero's Journey / Story Circle"). The
change is additive. Existing ids are kept, so marks and `beatId`s
already tagged still resolve.

| id | Format | Beats | Note |
|---|---|---|---|
| `three_act` | Three-Act Structure | 7 | existing |
| `save_the_cat` | Save the Cat! | 15 | existing; matches Feature step 08 |
| `story_circle` | Story Circle (Dan Harmon) | 8 | existing; relabelled, because it is not the 12-stage Hero's Journey |
| `heros_journey` | Hero's Journey (Vogler) | 12 | new |
| `seven_point` | Seven-Point Structure | 7 | new |
| `freytag` | Freytag's Pyramid / Five-Act | 5 | new |
| `fichtean` | Fichtean Curve | 6 | new; crisis after crisis |
| `kishotenketsu` | Kishōtenketsu | 4 | new; no central conflict |
| `sequence` | Eight-Sequence | 8 | new; the film-school sequence approach |
| `interval` | Two-Half / Interval Structure | 9 | new; Indian features: the first-half build, the interval block, the second-half turn and the climax. This is the shape a Tamil feature is actually built in |
| `short_five` | Short Film Five-Beat | 5 | new; matches Short step 04 |

- **What each beat carries:** `id`, `label`, `at`, `tension`, `act` and
  `prompt`, the existing shape, so `heatmap()`, `pacingFlags()`,
  `nearestBeat()` and `actsOf()` work with no code change. The
  per-framework `pacing` regions are added the same way.
- **What the agent checks:** whether `test:story` or `test:beats`
  assert the framework count, and if so updates them.
- **How formats reach other pages:** Write › Outline and the beat board
  read `story.framework`, so every format appears there automatically.

## 1b. The beats guide the writing, when wanted

- **In the Story path and the synopsis editor:**
  - the beat card's `prompt`;
  - "you are at 38%; Midpoint is expected around 50%", from
    `nearestBeat()` / `expectedAt()` in `src/lib/story.js`.
- **In Write: a "Beat guide" toggle.**
  - **Settings:** Off · Margin · Panel, default Margin. Stored in the
    existing `fms_write_prefs_v1` by read-merge-write, like the
    guide/keys/focus prefs. No new key.
  - **Margin:** the beat labels Phase 5 already draws.
  - **Panel:** a side card for the scene under the cursor, showing its
    beat (from the scene's `beatId`, else estimated from the page
    position), that beat's prompt, the outline steps written for it,
    "expected around p. 52, you are on p. 47", and the next beat to
    reach.
  - **How:** built on `src/lib/beat-outline.js` (`outline()`,
    `resolveBeat()`, `sceneSpans()`). It writes nothing.
  - **Focus mode** hides it, like the other chrome.

## 1c. Screenplay → shot list: AI when there is a key, a basic breakdown when not

**What exists:**
- Visualize's "Draft a shot division": `aiScenePlan()` and
  `AI.draftShotDivision()` in `src/pages/visualize.js` and
  `src/lib/ai.js`.
- It is append-only through `Shots.addShot()` and undoable via
  `aiLastRun`.
- It does nothing without a key.

**New: a rule-based breakdown** in `src/lib/shot-rules.js`.
- **What it is:** pure, stores nothing, and returns the SAME draft shape
  `draftShotDivision()` returns.
- **Rules, per scene slice of the script** (the slicing is
  `matchScenes()` / `sliceScript()`):
  - **Opening shot:** a master WS, labelled "Establishing" for EXT.
  - **Explicit `shot` elements:** one shot each. The size comes from the
    text: CLOSE ON → CU, INSERT, POV, ANGLE ON, AERIAL / DRONE.
  - **Dialogue:**
    - a two-person exchange → an OTS on each speaker;
    - a single speaker → MCU;
    - three or more speakers → a group MS plus a single per speaking
      character.
  - **Action lines:**
    - movement verbs (runs, chases, fights) → a tracking or handheld move;
    - "sees" / "looks at" → POV;
    - props from the existing auto-tag suggestions
      (`src/lib/screenplay-analysis.js`) → an Insert.
  - **The count per scene** is clamped by its `eighths`, at least 2 and
    at most 12.
- **Provenance:** a new `rules: false` field declared in `blankShot()`
  (`src/lib/shots.js`), beside the existing `ai` field. The shot list
  marks it "Basic" the way it marks "AI".
- **Visualize's draft panel offers both paths:**
  - With a key: "Draft with AI" stays the main button, and "Basic
    breakdown" is secondary.
  - Without a key: "Basic breakdown (no AI key needed)" is the main
    button, and the key form stays.
  - Both use the same scene picker, append-only write and Undo.
  - Scenes that already have shots are unticked by default, as today.
- **From Write, it feels automatic without overwriting anything:**
  - Each scene heading's margin shows a derived "Sc 12 · no shots yet"
    or "Sc 12 · 6 shots".
  - The toolbar's "Break into shots" sends the script's scenes into the
    Scene List first, through the existing hand-off banner's "Add them"
    path.
  - Then it runs the AI or basic breakdown for the scenes with no shots,
    and toasts "18 shots added · Undo · Open Shot List".
  - Nothing runs on a timer, and nothing ever changes a shot a person
    edited.

## 1d. Everything belongs to the project and follows story → script → scenes

**What already holds.** Every model is per project:
- `fms_story_v1`, the script, scenes, shots, frames, boards, the
  schedule, call sheets, the edit log and deliverables are all
  `SCOPED_KEYS`, suffixed `__<projectId>` by the `src/lib/store.js`
  proxy.
- A second project never sees the first's breakdown.
- `deleteProject()` removes all of it.

The new pieces (`outline`, `rules` shots, the beat-guide prefs) live in
those same keys, so they inherit this. A proof asserts it (see
Verification).

**What is missing, and the decisions taken:** the script does not drive
the scenes.
- A new heading needs the hand-off banner's "Add them".
- A deleted heading leaves its scene, shots, frames, schedule slot and
  call-sheet rows behind.
- `removeScene()` (`src/lib/scenes.js:154`) deletes only the row, so its
  dependents are orphaned even today.

The owner chose AUTOMATIC adds, and a BIN before final deletion.

- **A stable link.** Script elements already have stable `id`s
  (`src/lib/script.js:131`). Each scene row gains an additive
  `scriptElId`, the id of its heading element.
  - Existing projects are linked once by `matchScenes()`
    (`src/lib/screenplay-analysis.js:154`), which writes the link only
    where the match is unambiguous.
  - `listScenes()` already spreads `blankScene()`, so this needs no
    migration.
- **A new `src/lib/scene-sync.js`: `reconcile(script, scenes)`,** which
  is pure and returns a plan of what to add, update and bin.
  - **It is applied by Write's existing `scheduleDerived()` after a
    script save.** It runs only on a save, never on a timer, so verify's
    idle-write check holds.
  - **New heading → a new scene row,** auto-linked, with the
    INT/EXT, location and time parsed from the heading and `beatId`
    taken from the outline step it came from. A quiet note reads
    "Scene 37 added to the Breakdown · Undo".
  - **Edited heading → the linked scene's heading-derived fields
    update** (INT/EXT, location, time, number). Everything typed by
    hand stays: synopsis, cast, elements, notes.
  - **Deleted heading → the scene and EVERY dependent go to the bin:**
    - its shots and their frames (`src/lib/shots.js`);
    - its storyboard entries;
    - its stripboard and day placement;
    - its call-sheet rows (`src/lib/contacts.js`);
    - its edit-log state (`src/lib/editlog.js`);
    - its shoot-day marks;
    - its song links.

    It vanishes from every page at once. The dependent list comes from a
    grep of `sceneId` across `src/lib` and `src/pages`: `ai`, `contacts`,
    `editlog`, `readiness`, `scenes`, `screenplay-analysis`, `scriptgen`,
    `shootday`, `shotlist-export`, `shots`, `breakdown`, `stripboard`,
    `edit`, `hub` and `short`. The agent confirms each.
  - **A move is not a delete.** A heading whose id vanished while an
    identical heading text appeared in the same save is treated as a
    move. So is a cut-and-paste.
- **The bin** is a new per-project key, `fms_scene_bin_v1`:
  - It is added to `SCOPED_KEYS`, `PROJECT_KEYS` and `ALL_KEYS` and the
    test:keys registry. It is in no cloud scope until a schema section
    widens the CHECK, the same as `fms_write_goals_v1`.
  - Each entry holds the scene row plus a snapshot of all its
    dependents.
  - **Restore** puts the scene and every dependent back exactly. It
    happens automatically when Undo in Write brings the heading's id
    back, or when the same heading is typed again; by hand from the bin
    otherwise.
  - **"Delete for good"** (one entry) and **"Empty bin"** delete for
    good, after a confirm that names the counts, for example "Scene 12:
    6 shots, 4 frames, Day 3".
  - Nothing is purged on a timer.
  - The bin is shown on the Breakdown, as "Removed from script (2)",
    and its count is in the Write hand-off banner.
- **One cascade for every path.** `removeScene()` gains the same cascade
  through the bin, so deleting a scene by hand on the Breakdown no
  longer orphans its shots either.
- **Story → script.**
  - An outline step sent to the Screenplay records the `sceneId` it
    made.
  - Deleting that step offers to bin its placeholder scene, but only
    while that scene has no script heading and no shots. Otherwise the
    step goes and the scene stays, because the script now owns it.
- **No script yet:** scenes typed by hand on the Breakdown, with no
  `scriptElId`, are never touched by `reconcile`. The script drives
  only the scenes it is linked to.

### Also on the Story page (from revision 2)

- **A tab strip below the editor:** Pacing · Map with AI · Pitch deck ·
  Idea Vault. The `#pitch` and `#vault` hashes still land. It is
  page-local, not `src/ui/tabs.js`, since story.html is deliberately off
  that list.
- **The Dragon sample gets a story:** an idea, a logline, a Save the Cat
  step outline built from its 36 scene synopses, and an assembled
  synopsis.
  - It lives in a new dynamic import, `src/data/sample.dragon.story.json`,
    with a matching lazy exception in `vite.config.js`, like
    `sample.dragon.script.json`.
  - It is marked as a reconstruction.
- **One import control on screen at a time,** so the bar's IMPORT hides
  while the card shows.
- **Exports:** synopsis `.txt`, and beat sheet / step outline `.md`.
  - `.docx` only if the writer stays small.
  - Reachable from the Story bar and the blueprint's Part I panel.

## 2. Navigation (`src/data/navigation.json`, `src/lib/navmodel.js`, `src/ui/shell.js`)

**Moves:**
- **To Pre-Production:** Script Breakdowns, Elements, Auto-Tagging,
  Songs, Stripboard, Cast Matrix.
- **To Story:** Pitch Deck.
- **Into a new global `blueprints` shelf:** Feature Blueprint and Short
  Blueprint. This uses the existing `shelves()` mechanism the Library
  uses.

**What stays the same:** every module id and href, so plan features,
the launcher counts and the palette all keep working.

**New:**
- **Pre-Production sub-headings:** Break down · See it · Cost & staff
  it · Schedule it. A `group` field on each module, rendered by the
  phase menu.
- **A "Guide for this stage" row** in each stage menu, linking to the
  matching blueprint part.
- **A breadcrumb** that reads `Blueprints › Feature › Part N · <Stage>`
  on the blueprints.
- **Script Breakdowns gets its own target, `breakdown.html#breakdown`,**
  on an always-rendered wrapper. `#scenes` keeps working.

**Fixes and copy:**
- The extension panel (`src/pages/panel.js`) iterates `moduleGroups()`,
  which fixes KNOWN-ISSUES #2.
- The stale blurb "24 guided steps" becomes 32.

## 3. The blueprint: five parts, one per stage (`src/pages/feature.js`, `src/pages/short.js`, `src/ui/steps.js`)

**The five parts:**

| Part | Stage | Feature steps |
|---|---|---|
| I | Story | 01–10 |
| II | Screenplay | 11, 12, a new "Write the draft" interlude, 13 |
| III | Pre-Production | 14–24 |
| IV | Production | 25–28 |
| V | Post-Production | 29–32 |

- **The step order and numbers are unchanged.**
- **Part II gets a new cover with no fields,** id `#part-2`.
- **The existing ids stay:** `#vol-1`, `#vol-2`, `#phase-3` and
  `#phase-4`, with the `v1_*` / `v2_*` / `p3_*` / `p4_*` covers.
- **Wording:** "Phase" and "Vol" become "Part" in the covers, the stamps,
  the rail and the Jump menu.

**The sidecar.** `src/data/steps.stages.json` maps each step to its
stage and to its "Do this in…" module ids. It follows the
`steps.priority.json` pattern, because the step files are regenerated by
`npm run extract`.

**On every step, in both blueprints:**
- A stage chip.
- "Do this in…" buttons. For example, 08 → Story step outline · Write ›
  Outline; 11 → Scene List; 16 → Shot List · Storyboard;
  23 → Stripboard · Budget · Contacts; 32 → Deliverables.

**Story toolkit panels in Part I.** A new `src/ui/story-kit.js`. It only
calls the `src/lib/story.js` API and stores no second copy.
- **Part I cover:** start the story path, or Import.
- **Step 02:** the Idea Vault.
- **Step 08:** this beat's outline steps and tagged passages beside the
  step-08 fields, with "Open the step outline".
- **End of Part I:** the pacing curve (read only), the exports and the
  Pitch Deck.
- **Short step 04:** the same panel, on `short_five`.

**Live readouts,** derived from `src/lib/readiness.js` and the scene
model, and stored nowhere. For example, step 11 "36 scenes · 105 pages",
the draft interlude's page count, and step 25 "Day 3 of 18".

## 4. Home and Dashboard (`src/pages/hub.js`, `src/pages/dashboard.js`)

- **A journey strip,** a new derivation `src/lib/journey.js`. It shows
  the five stages, guide steps against tool readiness, "you are here",
  and one Next button.
- **On the hub,** the strip sits after Your projects. The other sections
  are reordered but all stay.
- **The project stage label** comes from `journey.js`, not from the
  percentage at `hub.js:970`.
- **Stale copy:**
  - `hub.js:576` and `hub.js:653` lose the "Vol I / Vol II" wording.
  - `PHASE_NAME` at `hub.js:222` moves to the five stages.
  - The sample's `meta_stage` in `src/data/sample.dragon.json` changes
    from "Both volumes" to "All five stages".

## 5. Later, after the above lands

- **A guide drawer** (`src/ui/blueprint-drawer.js`): the "Blueprint step
  N" pill on module pages, editing through the same `data-key` and the
  existing save path.
- **More hand-offs** (step 11 → Breakdown, step 15 → Lookbook) and a
  wrap card at the end of each part. All add-only, with Undo.

## Build order, in parallel worktree agents like the screenplay build

1. **Nav** (§2).
2. **Story path and Story page** (§1). Owns `story.js`, `story.html`,
   `frameworks.json`, the sample story and `ai.js`. It publishes the API
   first: `addOutlineStep`, `moveOutlineStep`, `outlineByBeat`,
   `buildSynopsisFromOutline`, `sendOutlineToScenes`.
3. **Blueprint parts and sidecar** (§3 minus the story kit), in parallel
   with 1 and 2.
4. **Home and journey** (§4), in parallel.
5. **All the beat formats** (§1a). This is a data agent, and runs in
   parallel.
6. **The basic shot breakdown and Write's "Break into shots"** (§1c),
   in parallel. It owns `shot-rules.js`, `shots.js` and `visualize.js`.
7. **The beat guide in Write** (§1b), after 2 and 5 merge.
7b. **Scene sync and the bin** (§1d), in parallel with 1–6. It owns
    `scene-sync.js`, the cascade in `scenes.js` and the bin UI on
    `breakdown.js`. It hooks into `write.js` only through
    `scheduleDerived()`, and merges before 6's "Break into shots", which
    relies on auto-added scenes.
8. **The story kit in the blueprint** (§3 panels), after 2 merges.
9. **The §5 items.**

## Verification

- **Each agent:** `VITE_SITE_GATE=off npx vite build --outDir dist-verify`,
  then `VERIFY_DIST=dist-verify VERIFY_PORT=<free> npm run verify`.
- **Re-baselining** (`npm run baseline`) is deliberate and done once, at
  the end. Diff it to confirm ZERO data-key movement and word changes
  only on the touched pages.
- **`npm run test:story` gains:**
  - an old blob with no `outline` loads blank;
  - every outline step's mark text is verbatim at its offsets after
    assembly;
  - Rebuild's Undo restores `source` and `marks` exactly;
  - `sendOutlineToScenes` is add-only and its Undo removes only what it
    added;
  - `short_five` beats.
- **New `npm run test:shots`** (Node, no browser) checks `shot-rules.js`
  on the Dragon script:
  - every scene gets 2–12 shots;
  - a two-hander gets OTS pairs;
  - an explicit CLOSE ON becomes a CU;
  - the output has the same shape as the AI draft;
  - nothing is produced for an empty scene.
- **New `npm run test:sync`** (Node):
  - adding, editing and deleting headings produces the right
    add / update / bin plan;
  - a cut-and-paste of a scene is a move, not a delete;
  - restoring brings back the scene, its shots, frames, strip slot and
    call-sheet rows byte-identical;
  - "Empty bin" leaves no `sceneId` orphan in any model;
  - hand-made, unlinked scenes are never touched.
- **`prove:storage` gains a two-project block.** Project A's script
  makes scenes and shots. Project B stays empty. Deleting a heading in
  A bins only A's. Deleting project A leaves B intact and no
  `__<A id>` key behind.
- **Every framework** passes a shape check: its `at` values climb from
  0 to 1, its ids are unique, and its `pacing` regions are present.
- **The other suites and proofs:** `test:keys`, `test:beats`,
  `test:screenplay`, `prove:storage`, `prove:gate`, `prove:billing`
  (plan features keyed by module id), `prove:extension` (the panel now
  lists the moved modules) and `prove:drive`.
- **Playwright smoke** at 1280 and 390, both themes:
  1. new project → Story → path step 1 → logline → Save the Cat → add a
     step to 3 beats;
  2. build the synopsis, and the matrix shows 3 tagged beats;
  3. send to Screenplay, and `write.html#outline` shows 3 placeholder
     scenes; Undo;
  4. the Dragon sample shows a full outline;
  5. switching the format to Hero's Journey and then Interval re-files
     the steps, with nothing lost;
  6. Write's Beat guide panel names the current beat;
  7. with no AI key, "Break into shots" adds basic shots to the scenes
     that have none, and Undo removes exactly those;
  8. typing a new heading in Write adds the scene to the Breakdown;
  9. deleting it bins the scene and its shots everywhere;
  10. Ctrl+Z in Write brings both back.
- **Fragment loads land in the empty and seeded states:** `#vol-1`,
  `#vol-2`, `#part-2`, `#phase-3`, `#phase-4`, `#scenes`, `#breakdown`,
  `#pitch` and `#vault`.
- **Docs:**
  - `docs/BLUEPRINT-REALIGN-PLAN.md` revision 3, marked BUILT at the
    end.
  - A CLAUDE.md open item 16.
  - KNOWN-ISSUES #2 pruned.
- **Commit and push** to `claude/improvement-ideas-0gwjyx` and to main.
