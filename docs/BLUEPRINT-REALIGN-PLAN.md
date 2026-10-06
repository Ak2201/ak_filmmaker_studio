# Blueprint and stages realignment — plan

Status: PLAN, not built. Revision 2, 6 Oct 2026.

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
