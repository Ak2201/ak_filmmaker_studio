# Part 07 — The Blueprints (feature.html, short.html, and how they live in the stages)

Source of truth: the worktree `admin-fixes`. Files read: `src/pages/feature.js`, `src/pages/short.js`, `src/ui/steps.js`, `src/ui/step-stages.js`, `src/ui/stage-guide.js`, `src/ui/stage-guide-body.js`, `src/ui/chrome.js` (rail, reading progress, save indicator, beat visualiser), `src/ui/blueprint-rows.js`, `src/ui/blueprint-entry.js`, `src/lib/blueprint-route.js`, `src/pages/blueprint-redirect.js`, `src/data/steps.*.json`, `festivals.json`, `festivals.checks.json`, `tokens.css`.

House style used in every Stitch prompt: dark violet product UI, page ground `#120f1c`, cards `#1b1727`, accent `#9575f8`, pill buttons, 16px radius, Catamaran (UI/body), JetBrains Mono (eyebrows, labels, numbers), Courier Prime (screenplay only).

---

## 0. READ THIS FIRST — what is actually reachable

1. `feature.html` and `short.html` are still full pages, but **both call `enableRedirect()` before rendering** (`src/pages/blueprint-redirect.js`). Arriving by their plain URL (with or without `#step-NN`, `#vol-2`, `#glossary`) does a `location.replace()` to the stage page that now owns that step. The only way to see the full page is the exemption `?stay=1` (`feature.html?stay=1`, `short.html?stay=1`), which stage-guide widgets and a few cards link to as a fallback.
2. The three legacy files `arunak-filmmaker-blueprint.html`, `arunak-shortfilm-blueprint.html`, `arunak-filmmaker-library.html` are **redirect stubs** (see section 3).
3. For a designer this means there are **two surfaces drawing the same questions**: the full long pages (this file sections 1–2, 4–6) and the per-stage **Guide** section (section 3, `#guide` on every stage page, one step at a time with a stepper). Both use the same block renderers and the same saved answers.

Block vocabulary shared by both blueprints and the stage guide (full catalogue in section 4): `formula`, `craft`, `why`, `hint`, `examples`, `asks`, `check`, `raw` (authored HTML: related-chips, char-block, char-map, beat-table, pacing-viz, pp-table + row-actions, scene-timeline, palette-picker, dept-grid, budget-summary, hod-signoff — feature; scene-table, beat-grid, page-counter, script-editor, ai-prompt-block, script-preview, prod-grid — short), and the short-only page renderers `beatviz` and `festgrid`.

---

## 1. Feature-film blueprint page (feature.html?stay=1 / src/pages/feature.js)

**Purpose** — Guided, 32-step walk from the first "what if" to delivery, in five parts (one per app stage). Every field autosaves to the user's browser. Steps 01–24 are `steps.feature.json` (vol1 = 01–10 ... vol2 = 11–24, regrouped into parts by the sidecar); 25–32 are `steps.production.json`.

**Data source** — Content: `src/data/steps.feature.json`, `steps.production.json`; part/stage/tools/readout sidecar `steps.stages.json`; "spine" (essential steps) `steps.priority.json`; Tanglish translations `steps.tanglish.json`; English copy patches `steps.copy.json`. Saved answers: one blob in `localStorage` key `fms_filmmaker_combined_v1` (every `data-key` is a field), preferences `fms_filmmaker_prefs_v1`, per-field private notes `fms_note_<key>`.

**Layout** — Single column of reading content inside `<main id="main">`, content max width ~ a 760–860px reading measure centred. Chrome around it:
- 1280px: shell band (global rail + stage phase menu) pinned at top; below it the page **toolbar** (merged into the band as a right-hand zone); fixed vertical tab "STEPS" on the left edge opens the **step rail** (220px wide drawer, left, 804px tall). Fixed round **focus timer** bottom-right. Thin **reading-progress bar** fixed at the very top of the viewport. Small **save indicator** toast fixed in a corner.
- 390px: toolbar wraps / folds into the bottom action bar + phone nav (bottom bar Home · Go to · Search · Tools). The STEPS tab is a 44px-wide vertical tab hugging the left edge; the content is inset by that width. Tables become horizontally scrollable.

Page order (top to bottom): toolbar → master cover → (blank-blueprint entry panel, only when nothing is written) → "Start here / The spine" panel → [Part I cover, how-to, steps 01–10 with Treatment Ladder interlude after 02, Tanglish toggle above step 01] → [Part II cover, 11, 12, "Write the draft" interlude, 13, "story is locked" interlude] → [Part III cover, how-to, three phase dividers before 14 / 17 / 21, steps 14–24] → [Part IV cover, steps 25–28] → [Part V cover, steps 29–32] → Pitch deck section → Sync & backup section → Glossary → Final page → focus timer.

### 1a. Toolbar (`div.toolbar`)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Left | Project link `#studioProjLink` | link | arrow `←` + project name (default `STUDIO`) | Goes to `index.html`; tooltip "Back to Studio · current project" | Shows the open project's title |
| Centre-left | Progress meter | bar + text | track with fill `#progressFill`, text `#progressText` default `0%` | Tooltip "Overall completion across all 32 steps"; fill = filled fields + ticked checks / total | 0–100% |
| | Step jumper `#stepJumper` | select | placeholder `Jump to…`; optgroup OVERVIEW: `↑ Master cover`, `→ Pitch Deck`, `→ Sync & backup`, `→ Glossary`; then one optgroup per part (`PART I · STORY` … `PART V · POST-PRODUCTION`) holding `→ Part I cover`, then `01 · The Spark`, `02 · The Logline`, `→ Treatment Ladder` (after 02), … `→ Write the draft` (after 12) | Smooth-scrolls to the section | Built from data, never hand-written |
| | Search | text input `#searchInput` + count `#searchCount` | placeholder `Search any field…` | Typing highlights matching fields (`search-hit`), count shows hits; `/` focuses; Enter jumps to next hit | Empty / hits / no hits |
| | Save status `#saveStatus` | status text | `●  ready` | While typing: `●  saving...` (busy style); after save: `●  saved · just now`, then `saved · 12s ago`, `Nm ago`, `Nh ago` | ready / saving / saved |
| Right | **Export** menu | action menu button | `Export` → items: `Print` (hint "Print or save as PDF"), `Save as PDF` (hint `A4`), `Zine layout`, divider, `JSON` (hint `data`), `Markdown` (hint `document`), `Email to myself` | Dropdown | Closed / open |
| | **More** menu (right aligned) | action menu | `More` → `Reading mode` (hides inputs), `Pitch deck` (→ `#pitch-deck`), `Sync & backup` (→ `#sync-section`), divider, `Import JSON`, one `Load sample: <name>` per sample pack, divider, `Reset this blueprint` (danger red) | Reset asks a danger confirm | |
| | Theme toggle `#darkBtn` | icon button | `◐` | Cycles ink / paper themes; tooltip "Theme — ink, paper" order | |

**States** — Empty: `0%`, `● ready`. Filled: percent and "saved · …" text. Error: save indicator shows `SAVE FAILED` (red). Search no match: count empty.

**Mobile (390px)** — Export / More collapse into the bottom Tools sheet; progress meter and save status stay visible in the band; jumper becomes a full-width select.

**Stitch prompt** — "Design the top toolbar of a long-form writing tool, dark violet UI (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, JetBrains Mono for tiny labels, pill buttons, 16px radius). One sticky row: a back link '← STUDIO', a thin 8px pill progress track with a violet fill and '0%' label in mono, a 'Jump to…' select, a rounded search field with placeholder 'Search any field…' and a small hit counter, a muted status text '●  ready', two outlined pill menu buttons 'Export' and 'More' with a caret (show 'Export' open: Print, Save as PDF A4, Zine layout, divider, JSON, Markdown, Email to myself, each with a faint mono hint on the right), and a round '◐' theme button. Under it a 3px violet reading-progress line across the viewport top. Show desktop 1280 and a 390px version where the row wraps to two lines."

### 1b. Reading-progress bar, save indicator, focus timer (fixed overlays)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Viewport top | `.reading-progress` / `.reading-progress-bar` | 3px bar | none | Width = scrolled % of page | 0–100% |
| Corner | `#saveIndicator.save-indicator` | toast chip, `aria-live=polite` | dot + `SAVED` | Appears 1.8s after a save then fades | `SAVING…` (animated dot), `SAVED`, `SAVE FAILED` (error colour) |
| Bottom-right | `#focusTimer.focus-timer` | pill button | `◷` icon, `25:00`, `×0` | Click start/pause; Shift+click or right-click resets; counts pomodoros (`×N`); aria "Focus timer, 25:00, not started" | idle / running (counting down) / paused |
| Per field | `.field-saved-mark` | tick | `✓` | Flashes beside a field when it saves | |

**Stitch prompt** — "Three small floating overlays for a dark violet writing app (#120f1c ground, #1b1727 surfaces, #9575f8 accent, Catamaran + JetBrains Mono). (1) A 3px violet progress line pinned to the very top of the viewport, 42% filled. (2) A compact bottom-left save chip with a 6px dot and the mono text 'SAVED'; show three variants side by side: 'SAVING…' with a pulsing amber dot, 'SAVED' with a green dot, 'SAVE FAILED' with a red dot and red text. (3) A fixed bottom-right pill timer button: a '◷' glyph, '25:00' in mono, and a faint '×0' pomodoro count, with a violet glow ring on hover, plus a running state '18:42 ×1' in the accent colour. Dark theme, 16px radius, subtle 1px #322c48 borders. Include a 390px phone frame where the timer sits above the bottom nav."

### 1c. Step rail (`aside#stepRail.step-rail`, toggle `#stepRailToggle`)

**Purpose** — Table of contents for the whole blueprint, grouped by part.

**Layout** — 220px drawer fixed left, full height, scrollable; opened by the vertical "STEPS" tab fixed at the left edge (`writing-mode: vertical-rl`). Collapsed by default (`.collapsed`); `.show` opens it and sets `body.rail-open`. On widths ≤1100px choosing a step closes the drawer.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Edge | Toggle tab | vertical button | `STEPS` (aria "Toggle step navigation") | Opens/closes rail, `aria-expanded` | collapsed / open (tab shifts to `left: 220px`) |
| Rail head | Heading | label | `STEPS` | — | |
| Group | Group label | mono caps | `PART I · STORY`, `PART II · SCREENPLAY`, `PART III · PRE-PRODUCTION`, `PART IV · PRODUCTION`, `PART V · POST-PRODUCTION` (the label comes from the sidecar `data-part-label`; fallback `INTERLUDE`) | — | |
| Item | Rail link `.step-rail-item` | row: number, title, check | number `01`, title `The Spark`, tick circle | Jumps to `#step-01`; the current step is highlighted (scroll-spy); a step with all its checklist ticked shows the tick filled | default / current / complete / `.is-spine` (kept when "Show only these 10" is on; others hidden) |

**Mobile (390px)** — Same drawer overlays content; the 44px STEPS tab is always visible on the left edge.

**Stitch prompt** — "A slide-out navigation rail for a 32-step writing guide, dark violet UI (#120f1c ground, rail surface #1b1727, accent #9575f8, Catamaran, JetBrains Mono caps for group labels, 16px radius). Left drawer 220px wide, full height. Header 'STEPS' in mono. Five collapsible-looking groups with mono caps labels: 'PART I · STORY', 'PART II · SCREENPLAY', 'PART III · PRE-PRODUCTION', 'PART IV · PRODUCTION', 'PART V · POST-PRODUCTION', each tinted with its stage hue (violet, gold #d6a44a, teal #2dd4bf, pink #f472b6, magenta #e879f9). Rows: mono number '01', title 'The Spark', and a small circle check on the right. Show one current row with violet wash highlight, two completed rows with filled check, rest empty. Beside the drawer show the fixed vertical 'STEPS' tab on the left edge. Provide a 390px phone version with the drawer over the content."

### 1d. Master cover (`section.master-cover`)

**Elements**

| Region | Element | Type | Exact label/text | Behaviour |
|---|---|---|---|---|
| Top | Mark | mono eyebrow | `A complete guide to building a film, from idea to camera` | |
| | Title (h1) | display | `The Filmmaker's` (light weight) / `Blueprint.` | |
| | Sub | paragraph | `Five parts. Thirty-two guided steps. From the first "what if?" through "ROLL CAMERA" to delivery. Examples from Dragon, Vikram Vedha, 96 & Por Thozhil, with every concept explained in English & Tanglish.` (the counts are derived) | |
| | Stamps | 5 chips `.vol-stamp` | `PART I · STORY · 10 STEPS`, `PART II · SCREENPLAY · 3 STEPS`, `PART III · PRE-PRODUCTION · 11 STEPS`, `PART IV · PRODUCTION · 4 STEPS`, `PART V · POST-PRODUCTION · 4 STEPS` — each in its stage hue | |
| | Meta grid | 4 fields | `Project title` (ph `Untitled film`, key `meta_title`), `Writer / Director` (ph `Your name`, `meta_writer`), `Started on` (ph `DD / MM / YYYY`, `meta_started`), `Stage` (ph `Story / Screenplay / Pre-prod…`, `meta_stage`) | Text inputs; the title syncs to every other cover and to the project name |

**Part covers** (`section.vol-cover`, ids `vol-1`, `part-2`, `vol-2`, `phase-3`, `phase-4`): mono mark `PART I` … `PART V`; tag chip e.g. `STORY · 10 STEPS`; heading `The Story / Blueprint.` (light word + bold word), `The Screenplay / Blueprint.`, `The Pre-Production / Blueprint.`, `The Production / Blueprint.`, `The Post-Production / Blueprint.`; a sub paragraph; and meta-grid fields:
- Part I (`vol-1`): `Working title` (ph `Untitled film`, `v1_title`), `Genre` (select `v1_genre`: `Pick a genre...`, Drama, Romance, Thriller, Crime / Noir, Comedy, Action, Horror, Sci-Fi, Fantasy, Family, Coming-of-Age, Biopic, Documentary, Anthology, Experimental, Other), `Draft` (ph `01 — Treatment`, `v1_draft`).
- Part II (`part-2`): **no fields** by design.
- Part III (`vol-2`): `Director` (`v2_director`), `Producer` (`v2_producer`), `Pre-prod start` (ph `DD / MM / YYYY`, `v2_start`), `Target shoot start` (`v2_shoot`), `Estimated budget` (`v2_budget`).
- Part IV (`phase-3`): `First day of shoot` (`p3_start`), `Shoot days planned` (ph `e.g. 28`, `p3_days`), `1st AD` (`p3_ad`), `Unit base` (ph `Chennai, Madurai…`, `p3_base`).
- Part V (`phase-4`): `Editor` (`p4_editor`), `Sound designer` (`p4_sound`), `Composer` (`p4_music`), `Target lock date` (ph `DD / MM / YYYY`, `p4_lock`).

**Mobile (390px)** — meta-grid goes to one column; stamps wrap.

**Stitch prompt** — "Cover section of a filmmaking blueprint, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono for eyebrows, pill chips, 16px radius). Mono eyebrow 'A COMPLETE GUIDE TO BUILDING A FILM, FROM IDEA TO CAMERA'. Huge two-line title: \"The Filmmaker's\" in light weight, 'Blueprint.' in bold, with a violet full stop. Paragraph: 'Five parts. Thirty-two guided steps. From the first \"what if?\" through \"ROLL CAMERA\" to delivery.' Five pill stamps in a row, each in a different hue: PART I · STORY · 10 STEPS (violet), PART II · SCREENPLAY (gold), PART III · PRE-PRODUCTION (teal), PART IV · PRODUCTION (pink), PART V · POST-PRODUCTION (magenta). Below, a 2x2 grid of labelled inputs: Project title (Untitled film), Writer / Director (Your name), Started on (DD / MM / YYYY), Stage. Desktop and 390px stacked versions."

### 1e. Blank-blueprint entry panel (`blueprintEntry`, only while nothing is written)

Eyebrow `BEFORE STEP 01`; title `Two ways in.`; deck `This blueprint is 32 steps and nothing has been written in it yet. Typing into step 01 is one way to fill it. If the film already exists on paper — a synopsis, a treatment, a screenplay — bring that in instead, and the steps downstream of it start with something to read.` Two link cards: `I already have a screenplay` (note: "Read in this browser, never uploaded, and shown to you before a word is stored. It fills the screenplay AND the scene list, so the breakdown, stripboard, budget and reports have something to read.") → `screenplay.html#import`; `I have a synopsis` (note about the staged AI draft, needs the user's own API key) → `write.html?stay=1#generate`. Primary pill button `START FROM SCRATCH`; fine print "Nothing on this panel writes anything…"; a `✕` hide button (aria "Hide the ways-in panel"). The panel disappears once anything is saved.

### 1f. "Start here — The spine" panel (`section#start-here.st-path`)

**Purpose** — Names the 10 essential steps so a beginner can do the shortest path.

| Element | Type | Exact text | Behaviour |
|---|---|---|---|
| Eyebrow | mono | `START HERE` | |
| Title | h2 | `The spine.` | |
| Deck | paragraph | `There are 32 steps below and they are in the order you do them, not the order they matter. These 10 are the shortest path to a blueprint you could put in front of somebody: fill only these and the pitch deck builds, the scene list feeds the breakdown, and the numbers add up. The other 22 are not optional — they are later.` | |
| List | 10 rows `li.st-path-item` | tick `○` (becomes filled when the step is complete), number, name, note | Rows: 01 The Spark ("The one question the film is. Everything below is an answer to it."), 02 The Logline ("One sentence. Until it exists you cannot tell anyone what you are making."), 03 The Theme & Stakes ("What the film argues, and what it wagers on the argument."), 04 The Protagonist ("Who changes. Name, want, need, wound, arc — five lines, and the film has a spine."), 05 The Antagonist ("The opposing want. A protagonist with nothing pushing back is a description, not a story."), 07 The World ("Era, place, rules. The third character, and the one the budget is really about."), 08 The 15 Beats ("Fifteen beats. The first point at which the whole film exists in one place."), 11 The Scene List ("Everything downstream of the blueprint — breakdown, board, schedule — starts here."), 14 The Director's Vision ("One page every department reads. Without it the crew are making different films."), 23 The Schedule, Budget & Crew ("Days, money, heads of department. The three numbers a producer asks for first.") — each links to `#step-NN` |
| Button | primary pill, `aria-pressed` | `Show only these 10` | Toggles `body.prio-spine-only`: hides every step without `.is-spine` (and the same rail entries). Nothing is deleted |
| Hint | caption | `Nothing is deleted or hidden on disk — this only narrows what is on screen, and every one of the 32 steps keeps whatever you have written in it.` | |

**Stitch prompt** — "A 'start here' checklist panel on a dark violet writing-tool page (#120f1c ground, panel #1b1727, accent #9575f8, Catamaran, JetBrains Mono eyebrow, 16px radius, pill buttons). Mono eyebrow 'START HERE', heading 'The spine.', a two-sentence deck explaining that 10 of 32 steps are the shortest path to a pitchable blueprint. A numbered list of 10 rows; each row has a ring tick '○', a mono step number (01, 02, 03, 04, 05, 07, 08, 11, 14, 23), a name link ('The Spark', 'The Logline', …) and a one-line muted note on the right. Show 3 rows ticked (filled violet check). Footer: a primary pill button 'Show only these 10' with aria-pressed state, and a small caption about nothing being deleted. Desktop 1280 and 390px stacked."

### 1g. Language toggle (`div.steps-lang`, above step 01)

A segmented control from `lang.js` (English / Tanglish; tooltip "Switches the step explanations. Field labels, step names and your own writing are untouched."). In Tanglish mode step decks and the "Why this matters" paragraphs swap in place (no re-render, so typed text survives). Formula and craft blocks always show their short Tanglish gloss line in italics beneath.

### 1h. The step frame (every step, `section.step#step-NN`)

**Layout** — A card/section per step, full reading width. Vertical order: header row → stage row → "why/feeds" line → deck → blocks in data order → empty video slot (hidden unless a video joins). Printing puts each step on its own page.

| Region | Element | Type | Exact text | Behaviour | Variants |
|---|---|---|---|---|---|
| Header | Step number `.step-num` | big mono numeral | `01` … `32` | | In stage hue |
| | Title `.step-title` | display heading with italic emphasis | e.g. `The <em>Spark.</em>` | | |
| | Spine chip `.st-spine-chip` | small chip | `ESSENTIAL · 1 of 10` (tooltip = spine note) | Only on spine steps | present/absent |
| | Time `.step-time` | mono right-aligned | e.g. `~ 1 EVENING`, `~ 2-3 EVENINGS`, `~ 2-4 WEEKS`, `~ EVERY DAY` | | |
| | Badge `.step-badge` | pill | `EMPTY` → `IN PROGRESS · 40%` → `COMPLETE` | Computed live from filled fields + ticked checks in that step | empty (grey) / partial (amber) / complete (green) |
| Stage row | Chip `.st-stage-chip` | pill in stage hue | e.g. `PART I · STORY`, `PART III · PRE-PRODUCTION`; the final-lock step reads `FINAL LOCK · SCREENPLAY`; a step spanning two stages shows a second hue as a small swatch | | 5 hues |
| | "DO THIS IN" | label + link buttons | label `DO THIS IN`, buttons like `Idea Vault →`, `Beats & Pacing →`, `Screenplay › Outline →`, `Scene list →`, `Stripboard →`, `Budget →`, `Contacts →` (resolved from navigation.json) | Links into the module that does the work | 0–3 buttons |
| | Live readout `.st-readout` (role=status) | text | step 11: `12 scenes · 14 pages · every scene has a location` or `Nothing in the Breakdown yet`; step 23: `3 shoot days · 8 people`; step 25: `Day 2 of 5 · 4 scenes shot`; Write-the-draft: `32 pages · 12 scenes in the script` or `No pages in the Screenplay Writer yet` | Derived, stored nowhere; re-reads when the tab becomes visible; empty state may carry a CTA | filled / empty |
| Feeds line | `.st-why` | text | bold spine note + label `FEEDS` + what reads this step, e.g. `FEEDS Pitch deck slides 02 and 10`, `FEEDS The scene charge timeline on this step · the Markdown export's scene table` | | spine or feeds only |
| Deck | `.step-deck` | italic lead paragraph | e.g. "Every film starts as a question that won't leave you alone. Capture it here — raw, unedited, in any form." | Swaps to Tanglish translation when selected | |
| Body | blocks | see section 4 | | | |
| Per field | Comment button | small icon on text fields | `✎`/count | Opens a private note thread (`fms_note_<key>`) | has-note badge |

The 32 steps (number, title, time, blocks) — titles only, for orientation:
01 The Spark · 02 The Logline · 03 The Theme & Stakes · 04 The Protagonist · 05 The Antagonist · 06 The Supporting Cast · 07 The World · 08 The 15 Beats · 09 The Timeline · 10 The Setups & Payoffs · 11 The Scene List · 12 The Final Check · 13 The Script Lock · 14 The Director's Vision · 15 The Lookbook · 16 The Storyboard & Shot List · 17 The Cinematography Plan · 18 The Production Design · 19 The Costume, Hair & Makeup · 20 The Casting · 21 The Locations & Recce · 22 The Sound & Music · 23 The Schedule, Budget & Crew · 24 The Tech Recce & Final Lock · 25 The Shoot Day · 26 The Continuity Log · 27 The Dailies · 28 The Wrap · 29 The Assembly · 30 The Picture Lock · 31 The Sound & Music · 32 The Delivery.
Parts: I = 01–10, II = 11–13 (+ "Write the draft" interlude between 12 and 13), III = 14–24, IV = 25–28, V = 29–32. Short stage names in the guide stepper: Spark, Logline, Theme & stakes, Protagonist, Antagonist, Supporting cast, World, 15 beats, Timeline, Setups & payoffs, Scene list, Final check, Script lock, Director's vision, Lookbook, Storyboard & shots, Cinematography, Production design, Costume & makeup, Casting, Locations & recce, Sound & music, Schedule & budget, Tech recce & lock, Shoot day, Continuity, Dailies, Wrap, Assembly, Picture lock, Sound & music, Delivery.

**States** — empty step: badge `EMPTY`, fields blank, checks hollow. Partial: amber badge with %. Complete: green badge, rail tick. Spine-only filter on: non-spine steps vanish.

**Mobile (390px)** — header wraps: number + title on the first line, time and badge below; stage row chip then buttons wrap; tables scroll sideways inside their wrapper.

**Stitch prompt** — "One step card from a long guided filmmaking blueprint, dark violet UI (#120f1c ground, card #1b1727, accent #9575f8, Catamaran, JetBrains Mono for numerals and labels, pill chips and buttons, 16px radius). Header row: a big mono numeral '01' in violet, title 'The *Spark.*' with an italic emphasised word, a small 'ESSENTIAL · 1 of 10' chip, right-aligned mono '~ 1 EVENING', and a status pill 'IN PROGRESS · 40%' in amber. Below: a stage row with a violet pill 'PART I · STORY', the mono label 'DO THIS IN' and an outlined pill button 'Idea Vault →', and a live readout text. Then a line 'FEEDS Pitch deck slides 02 and 10', then an italic lead paragraph. Leave a body area. Show badge variants EMPTY (grey), IN PROGRESS (amber), COMPLETE (green). 1280 and 390px."

### 1i. Interludes and dividers

- **Treatment Ladder** (`section.ladder-step#treatment-ladder`, between 02 and 03): mono eyebrow `INTERLUDE · BETWEEN STEPS 02 AND 03`; title `The Treatment Ladder.`; intro paragraph ("Five rungs from one sentence to a step outline…"); a formula box ("Each rung must be readable on its own…" with a Tanglish line); then five rung cards `.ladder-rung`, each with `h4`, a mono target line, a textarea and a hint: `Rung 1 — The Logline` (target `5 – 30 words · already done in Step 02`, key `lad_1_logline`, 2 rows), `Rung 2 — One-Paragraph Synopsis` (`100 – 150 words · the elevator pitch`, `lad_2_synopsis`, 6 rows), `Rung 3 — One-Pager` (`~ 400 – 500 words · one printed page`, `lad_3_onepager`, 14 rows), `Rung 4 — The Treatment` (`5 – 12 pages · prose narrative of the whole film`, `lad_4_treatment`, 16 rows), `Rung 5 — Step Outline` (`15 – 40 numbered scenes · the bridge to script`, `lad_5_outline`, 14 rows); closing italic tip.
- **Write the draft** (`#write-the-draft`): eyebrow `INTERLUDE · BETWEEN STEPS 12 AND 13`; title `Write the draft.`; deck about writing in the Screenplay Writer; a slot holding the stage row (chip, `DO THIS IN` → Screenplay Writer, live readout of pages/scenes). No fields.
- **"The story is locked"** (`section.interlude`): `▼ ▼ ▼`, heading `The story is locked. Now the film gets made.`, one paragraph.
- **How-to cards** (`section.how-to`, after Part I and Part III covers): heading `How to use Part I.` / `How to use Pre-production.`, a deck, a numbered list of 6 rules, and tip boxes (`A NOTE ON RHYTHM` / `SHORTCUTS & FEATURES` / `A NOTE ON SCALE`) with a left accent border.
- **Phase dividers** before steps 14, 17, 21 (`section.phase`): label `PART III · 1` / `· 2` / `· 3`, headings `From Script to Vision.`, `Building the World.`, `The Logistics & Lock.`, with a one-line step range description.

**Stitch prompt** — "Interlude sections in a dark violet writing app (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono eyebrows, 16px radius, pill buttons). Design: (A) 'The Treatment Ladder' — mono eyebrow 'INTERLUDE · BETWEEN STEPS 02 AND 03', heading, a formula callout, then a vertical stack of five rung cards. Each card has a title ('Rung 1 — The Logline'), a mono target line ('5 – 30 words'), a tall textarea with placeholder and a muted hint; textareas grow taller down the ladder. (B) A centred 'The story is locked. Now the film gets made.' interlude with '▼ ▼ ▼' above it. (C) A phase divider: mono label 'PART III · 1', heading 'From Script to Vision.' and a one-line description, with a hairline. Desktop and 390px."

### 1j. Pitch deck, Sync & backup, Glossary, Final page

- **Pitch deck** (`section.pitch-section#pitch-deck`): mono eyebrow `AUTO-GENERATED · 10 SLIDES`; heading `The Pitch Deck.`; deck "Auto-generated from your filled fields above. The deck refreshes every time you save…"; buttons `↻ REBUILD FROM DATA` (primary), `EXPORT .PPTX`, `PRINT DECK ONLY`; a `#pitchDeckContainer` that holds ten 16:9 slide cards built from the answers (slides: logline, spark, theme, protagonist, antagonist, world, structure, … cast/budget/camera line).
- **Sync & backup** (`#sync-section`): heading `Sync & backup.`; deck pointing to the sign-in pill and Home backup; one button `BACKUP SETTINGS` → `settings.html#drive`.
- **Glossary** (`#glossary`): heading `The Glossary.`; deck; a grid of category labels (`CAMERA & LENS`, `SHOT & COVERAGE TYPES`, `CAMERA MOVEMENT`, …) each followed by term cards: bold term (`FOCAL LENGTH (mm)`, `ANAMORPHIC`, `MASTER`, `WS / EWS`, `DOLLY` …) with a definition.
- **Final page** (`section.final-page`): quote `"Pre-production is where you direct the film. The shoot is where you protect it."`, signature `THE FILMMAKER'S BLUEPRINT`, and `PARTS I–V · COMPLETE · END OF DOCUMENT`.

**Stitch prompt** — "Closing sections of a filmmaking guide in dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono labels, 16px radius, pill buttons). Section 1: mono eyebrow 'AUTO-GENERATED · 10 SLIDES', heading 'The Pitch Deck.', three buttons ('↻ REBUILD FROM DATA' primary, 'EXPORT .PPTX', 'PRINT DECK ONLY'), then a 2-column grid of ten 16:9 slide thumbnails (dark cards with a mono slide number, a big title and two lines of text). Section 2: 'Sync & backup.' with one outlined button 'BACKUP SETTINGS'. Section 3: 'The Glossary.' as a 3-column term grid, with mono category labels 'CAMERA & LENS' and cards holding a bold uppercase term and a short definition. Section 4: a centred quote page with a signature in mono caps. Desktop and 390px."

---

## 2. Short-film blueprint page (short.html?stay=1 / src/pages/short.js)

**Purpose** — Eleven steps from one image to a festival-ready short, with a structured script editor, Fountain export, AI-prompt builder, a five-beat visualiser and a festival tracker.

**Data source** — `src/data/steps.short.json` (`steps` + `beats`), `festivals.json` (18 reference cards, "tier" + deadline text), `festivals.checks.json` (the verified 2026 overlay: per-festival `checked` date, `fee`, `deadlines`, `notes`, source URL), the user's campaign in `fms_festivals_v1` (NOT part of the blueprint blob). Saved answers: `fms_shortfilm_blueprint_v1` (fields keyed by `data-key`, plus script scenes and scene-map rows in the same blob), debounced 600ms.

**Layout** — Same frame as the feature page: toolbar, cover, how-to, 11 steps, glossary, final page; step rail built from the sections; reading-progress bar; save indicator. No spine panel, no part covers, no pitch deck. Single reading column at 1280; at 390 everything stacks and tables scroll.

### 2a. Toolbar (short)

Same elements as 1a except:
- Jumper (`#stepJumper`, aria "Jump to a step"): `Jump to…`, `↑ Cover`, optgroups named by stage label from the sidecar (`PART I · STORY`, `PART II · SCREENPLAY`, `PARTS III–IV · PRE-PRODUCTION & PRODUCTION`, `PART V · POST-PRODUCTION`, `FINAL LOCK · SCREENPLAY`) holding `01 · The Seed` … `11 · The Final Lock`, then `→ Glossary`.
- Save status `●  ready` (flash messages last 1.5s, e.g. `●  plain text copied`).
- **Export** menu: `Print`, `Save as PDF` (`A4`), divider, `JSON` (`data`), `Fountain` (`screenplay`). **More** menu: `Import JSON`, divider, `Reset this blueprint` (danger). No search, no Markdown, no samples.

### 2b. Cover and how-to

- Cover `section.cover#top`: mono mark `A focused guide for the short form`; h1 `The Short Film` (light) / `Blueprint.`; sub `Eleven steps from a single image to a festival-ready short. Includes a structured script editor, Fountain-format export, and AI prompt generator. For films under 30 minutes.`; stamps `SHORT FILM · 11 STEPS` (blue, the shorts hue `#60a5fa`), `FEATURE · PART I · STORY` and `FEATURE · PART III · PRE-PROD` (faded); fields `Project title` (ph `Untitled short`, `meta_title`), `Writer / Director` (`meta_writer`), `Started on` (`meta_started`), `Target runtime` (ph `e.g. 8 min`, `meta_runtime`).
- How-to `section.how-to`: label `HOW TO USE THIS BLUEPRINT`; h2 `One idea, told cleanly.` (italic emphasis on "idea" and "cleanly."); two paragraphs about compression and Fountain; two compare cards `.sf-vs-feature`:
  - `SHORT FILM`: One central moment — a turn, a reveal, a small but decisive change · One protagonist with one want · One or two locations · 5–30 minutes (festival sweet spot is 8–15) · Ends on a single image that contains the meaning · Festival calling card — your "business card" as a director
  - `FEATURE FILM` (muted variant): Multiple moments / acts — a full character arc · Protagonist + antagonist + supporting cast · Multiple locations · 90–180 minutes · Ends on a transformed character · A theatrical / OTT product to be sold and distributed

**Stitch prompt** — "Cover and how-to for a short-film guide, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent but this page's volume hue is blue #60a5fa, Catamaran, mono eyebrows, pill chips, 16px radius). Mono mark 'A FOCUSED GUIDE FOR THE SHORT FORM', huge title 'The Short Film' light + 'Blueprint.' bold, a sub paragraph, three stamp chips (SHORT FILM · 11 STEPS in blue, two faded outline chips 'FEATURE · PART I · STORY', 'FEATURE · PART III · PRE-PROD'), and a 2x2 labelled input grid (Project title, Writer / Director, Started on, Target runtime). Then a how-to card: label 'HOW TO USE THIS BLUEPRINT', heading 'One idea, told cleanly.', two paragraphs and two side-by-side comparison cards 'SHORT FILM' (blue accent, six bullets) and 'FEATURE FILM' (muted, six bullets). Desktop and 390px stacked."

### 2c. The 11 steps (titles, time, blocks)

01 The Seed. (~ ONE EVENING) · 02 The Logline. (~ TWO EVENINGS) · 03 The Character. · 04 The 5-Beat Structure. · 05 The World. (~ ONE EVENING) · 06 The Scene Map. · 07 The Script Pages. (~ 5-10 SESSIONS) · 08 Format & Export. · 09 Production Reality. · 10 Festival Strategy. · 11 The Final Lock. (~ 30 MIN). Each has a badge starting at `EMPTY`. Stage mapping (sidecar short names): Seed, Logline, Character, 5-beat structure, World (Story) · Scene map, Script pages, Format & export (Screenplay) · Production reality (Pre-production + Production, two hue swatches) · Festival strategy (Post) · Final lock (`FINAL LOCK · SCREENPLAY`, locks the script).

### 2d. Five-beat visualiser (`beatviz`, step 04) and beat grid

**Purpose** — A 800×200 curve with five dots that fill in as the five beat fields are written; clicking a dot scrolls to its field.

**Data** — `steps.short.json` `beats`: Setup (`BEAT 1 · ≤15%`, key `b1_setup`, dot 40,130, label "SETUP"), Disturbance (`BEAT 2 · ~10%`, `b2_disturb`, 120,110, "DISTURB"), Escalation (`BEAT 3 · ~50%`, `b3_escalate`, 380,65, "ESCALATE", label above), Turn (`BEAT 4 · ~15%`, `b4_turn`, 580,80, "TURN"), Image (`BEAT 5 · ~10%`, `b5_image`, 780,90, "IMAGE").

| Region | Element | Type | Text | Behaviour | States |
|---|---|---|---|---|---|
| Visual | `.beat-viz` svg | SVG 800×200 | axis line at y=100, smooth quadratic curve through the five dots anchored to both edges | Hover shows `.beat-tooltip` | |
| | `.beat-dot` | circle r5, focusable (role button, aria "Beat 1 · Setup — jump to this field") | label under/over each dot (SETUP, DISTURB, ESCALATE, TURN, IMAGE) | Click/Enter jumps to the matching textarea | hollow → `.filled` when the field has text |
| Grid below (`raw .beat-grid`) | 5 `.beat-cell` | mono position `BEAT 1 · ≤15%` / `BEAT 2 · ~10%` / `BEAT 3 · ~50%` / `BEAT 4 · ~15%` / `BEAT 5 · ~10%`; h4 `Setup` / `Disturbance` / `Escalation` / `Turn` / `Image`; textarea with the beat description as placeholder (e.g. Setup: "Establish the protagonist, the world, the normal. End the moment they touch something that hints at the want.") | Autosaves under the beat key | empty / filled |
| Before | formula `FORMULA · 5 BEATS` listing the five beats with percentages; why-block "The 5-beat is the minimum a short film needs…" | | |
| After | ask `Self-test — Read the five beats aloud back-to-back. Does it feel like a story?` (`s4_test`, 3 rows, ph "Note any beat that felt thin, and what it's missing.") and check `STRUCTURE LOCK CHECK` (4 items) | | |

(The feature page has the equivalent `#beatVisualizer` built by `chrome.js` above step 08's table: header `15-BEAT EMOTIONAL CURVE` / `CLICK A DOT TO JUMP`, 800×220 SVG, 15 dots with short labels Opening, Theme, Setup, Catalyst, Debate, Break II, B-Story, Fun & Games, Midpoint, Bad guys, All lost, Dark night, Break III, Finale, Final; dots fill as `b01`–`b15` are filled.)

**Mobile (390px)** — SVG scales to width (labels shrink); beat grid becomes one column.

**Stitch prompt** — "A five-beat story-shape visualiser plus a beat grid for a short-film guide, dark violet UI (#120f1c ground, #1b1727 card, blue accent #60a5fa for the shorts hue with violet #9575f8 secondary, Catamaran, JetBrains Mono labels, 16px radius). Top: a wide card with an SVG curve: faint horizontal axis, a smooth line rising from SETUP (low-left) through DISTURB, peaking around ESCALATE, TURN, falling slightly to IMAGE, with five round dots and mono labels (SETUP, DISTURB, ESCALATE above its dot, TURN, IMAGE); two dots filled blue, three hollow; a small tooltip 'Beat 3 · Escalation'. Below: five equal cards in a row (stack at 390px), each with a mono caption 'BEAT 1 · ≤15%', a title 'Setup' and a textarea with a faint placeholder sentence. Show filled vs empty cells."

### 2e. Festival block (`festgrid`, step 10) — tracker, countdown cards, catalogue

Structure: `div.fest-block` = **tracker** (`section#festival-tracker`) above a **grid of 18 festival cards** (`div.fest-grid`).

**Tracker elements**

| Region | Element | Type | Exact text | Behaviour | Variants |
|---|---|---|---|---|---|
| Head | h4 | heading | `Your submission campaign` | | |
| | hint | paragraph | `The cards below are the reference list. This is your run at it — what you are targeting, what you sent, what it cost and what came back. Saved to this project in your browser, and included in the studio backup.` | | |
| Alerts | `.ft-alerts` (role=status) | alert cards, each with a tag + sentence | Clear case: tag `PREMIERE` + "No festival is holding your premiere right now. Nothing here blocks an online release." or "Nothing is holding your premiere yet. Add the Tier 1 festivals you are targeting and this will tell you when it is safe to post the film." Conflicts: tag `DO NOT POST` (online premiere scheduled while a festival holds it), `PREMIERE HELD`, `UNSENT` | Text comes from the premiere rule | `ok` / `warn` / `danger` levels |
| Stats | 5 `.ft-stat` tiles | big number + mono label | `NEXT DEADLINE` (value like `in 12 days`, `tomorrow`, `today`; becomes `MISSED DEADLINE` with `3 days ago`; `urgent` style when ≤14 days), `TRACKED`, `OUT THERE` (submitted + in competition), `ANSWERED`, `FEES PAID` (e.g. `$120 + ₹500`; per-currency, never summed) | | |
| | next line | caption | `Next up: <festival> — <yyyy-mm-dd>, in N days.` | | |
| Rows | `.ft-row.t1/.t2/.t3` | one card per tracked festival with a tier-coloured left edge | head: editable name input (aria "Festival name", ph `Festival name`), flag `HOLDS PREMIERE` (tooltip "This festival requires a premiere — it holds your film off the internet until it answers."), delete `✕` (aria "Stop tracking …"); fields: `Status` (select: Targeting, Submitted, In competition, Selected, Rejected, Withdrawn), `Deadline` (date), `Submitted` (date), `Fee paid` (text ph `0` + currency select USD/INR), `Heard back` (date); notes input ph `Notes — which cut you sent, the FilmFreeway reference, who to chase`; marks line below | Field changes save to `fms_festivals_v1`; the tracker redraws on change (not per keystroke) | Marks: overdue `Deadline was 3 days ago and it is still only a target.`; soon `Deadline in 5 days.`; approximate `The catalogue says ~Feb each year. Look up the real date and put it in — this cannot warn you about an approximation.` |
| Empty | `.ft-empty` | text | `Nothing tracked yet. Pick a festival below, or add one that is not on the list.` | | |
| Add | `.ft-add` | select + 2 buttons | label `Add from the list`, select `Choose a festival…` then `<name> — tier N`, buttons `+ TRACK IT`, `+ ONE NOT ON THE LIST` | | |
| Premiere | `.ft-premiere` | planner | label `Your planned online premiere`; hint "Fill this in and the warning above checks it against every festival still holding your film. Leave it blank until you have the rejections."; `Date` (date), `Where` (ph `YouTube, Vimeo Staff Picks, a platform deal…`) | | |

**Festival countdown cards (catalogue grid `div.fest-card.t1/.t2/.t3`, 18 cards)**

| Element | Type | Exact text/sample | Behaviour | Variants |
|---|---|---|---|---|
| Tier tag `.tier` | mono caps | `TIER 1 · OSCAR-QUALIFYING`, `TIER 1`, `TIER 2 · INTERNATIONAL`, `TIER 2 · USA`, `TIER 2 · INDIA`, `TIER 3 · GENRE`, `TIER 3 · ONLINE`, `TIER 3 · INDIA` | | colour per tier t1/t2/t3 (left rule or tint) |
| Name h4 | | `Cannes Court Métrage`, `Sundance Shorts`, `Berlinale Shorts`, `TIFF · Toronto`, `SXSW Shorts`, `Locarno Pardi di domani`, `Clermont-Ferrand`, `Palm Springs ShortFest`, `Aspen ShortsFest`, `MAMI · Mumbai Film Festival`, `IFFK · Kerala`, `IFFI · Goa`, `Fantasia (Montreal)`, `Sitges (Spain)`, `Vimeo Staff Picks`, `Short of the Week`, `Dharamshala International`, `Bengaluru International` | | |
| Description | paragraph | e.g. "The career-launcher for U.S. and international shorts. Submission via FilmFreeway. 70+ shorts selected from 12,000+." | | |
| Requirements `.req` | mono line | e.g. `Deadline: ~Aug · Format: DCP / ProRes · Length ≤40 min` | | |
| **Check box `.fest-check`** (the countdown) | provenance + live dates | **Checked:** tag `CHECKED 2026-09-29` (green); fee line, e.g. "€75 processing fee for a short film (€175 for a feature), payable once however many sections you apply to, non-refundable."; a dated list, each line `Short film registration: 2026-11-04 — in 21 days` (relative text: `today`, `tomorrow`, `yesterday`, `in N days`, `N days ago`; passed dates struck/`gone`); note paragraphs (e.g. "Not on FilmFreeway…"); if every checked deadline has passed: "Every checked deadline for this edition has passed. The next cycle's dates were not published when this was looked up." **Warning/blocked:** tag `UNCONFIRMED` or `COULD NOT CHECK` (amber) + notes. **Not re-checked:** tag `NOT RE-CHECKED` (grey) + "The line above is the blueprint's own approximation from 2023 and nobody has verified it since. Look the date and the fee up yourself before you plan around them." | Dates are real calendar dates; the number of days is computed against today when rendered (so the card text changes daily) | checked / unconfirmed / blocked / not-checked |
| Track button `.fest-track` | pill | `+ TRACK` → disabled `TRACKED` once added | Adds a row to the tracker | enabled / disabled |

Sample checked entries: Berlinale Shorts — checked 2026-09-29, deadline "Short film registration 2026-11-04", fee €75; Sundance Shorts — checked 2026-09-29, three past deadlines (Early 2026-07-13, Official 2026-08-03, Late 2026-08-31), note that all had passed and the fee could not be read.
Under the grid: italic note `Note: Deadlines and rules change every year. Always verify current dates on each festival's official site or via FilmFreeway before submitting.` Then asks `My target festivals (3 tier-1, 5 tier-2, 5 tier-3)` (`s10_targets`, 6 rows), `My festival positioning — one paragraph` (`s10_pos`, hint about programmers, 4 rows), `Submission budget` (`s10_budget`, 2 rows, hint "Tier-1 shorts are usually $40–$70. Tier 2: $25–$50. Tier 3: $10–$30. Plan for $400–$800 total."); check `FESTIVAL STRATEGY CHECK` (5 items).

**Mobile (390px)** — tracker stats wrap 2 per row; each row's five fields stack in a 2-column then 1-column grid; the 18 catalogue cards become one column.

**Stitch prompt** — "Festival submission tracker and countdown cards for a short-film guide, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono, pill buttons, 16px radius; tier colours: tier 1 gold #d6a44a, tier 2 blue #60a5fa, tier 3 teal #2dd4bf as left edges). Top card 'Your submission campaign': a green alert chip 'PREMIERE' with one sentence; five stat tiles (NEXT DEADLINE 'in 12 days' with urgent amber state, TRACKED 3, OUT THERE 1, ANSWERED 0, FEES PAID '$120 + ₹500'). Two tracker rows: festival name input, 'HOLDS PREMIERE' flag, ✕, then fields Status select, Deadline, Submitted, Fee paid + currency, Heard back, and a notes input; one row shows a red overdue mark. Below, a 3-column grid of festival cards: mono tier tag, name 'Berlinale Shorts', description, requirement line, a green 'CHECKED 2026-09-29' tag, a dated list 'Short film registration: 2026-11-04 — in 21 days', and a '+ TRACK' pill (one 'TRACKED' disabled). Include one grey 'NOT RE-CHECKED' card. 390px: single column."

### 2f. Short-film-only widgets (raw blocks)

**Scene map (step 06)** — `table.scene-table`, header `# | Slug (INT./EXT. — Place — Time) | Who | What happens | Beat | Pages |` (last column is row controls). Row (built in JS, **rows carry `data-field`, not `data-key`; saved as an array in the blob**): number `01` (renumbers), slug input (ph `INT. APARTMENT - DAY`), who input (ph `Ravi, Maya`), what textarea (ph `What happens. End on a different value than start.`), beat select (`—`, Setup, Disturb, Escalate, Turn, Image), pages input (ph `0.5`, 60px), controls `⎘` duplicate and `✕` delete. Buttons under the table: `+ ADD SCENE` (primary), `+ ADD 3`. Ask `Self-test: read the "What happens" column top-to-bottom` (`s6_test`, hint "Do the scenes escalate?…"). Check `SCENE MAP LOCK CHECK` (4). Formula: "For each scene, ask: WHO is in it? What do they WANT? What's the OBSTACLE? How does it END differently from how it started?…".

**Script editor (step 07)** — formula `FORMULA · 1 PAGE = 1 MINUTE`; **page counter** (`div.page-counter`): three stat tiles `TOTAL WORDS` (`0`), `EST. PAGES` (`0.0`), `EST. RUNTIME` (`0:00`) plus a status line (`enter scenes below`; compares against the cover's target runtime; 210 words ≈ 1 page); **editor** (`div.script-editor`): stack of scene blocks, each with header (`SCENE 01` tag, slug input ph `INT. APARTMENT - DAY`, `✕` delete), label `ACTION`, action textarea (ph `Describe what happens. Present tense. Third person. No camera directions unless essential.`), a list of dialogue blocks (character input ph `CHARACTER NAME`, line textarea ph `The dialogue line.`, `✕`, and a parenthetical input ph `(parenthetical, optional — e.g. whispering, off-screen)`), button `+ ADD DIALOGUE`; footer button `+ ADD SCENE`; action row (mini buttons) `↻ REFRESH PREVIEW`, `COPY AS FOUNTAIN`, `COPY AS PLAIN TEXT`, danger `CLEAR SCRIPT` (asks to confirm). Check `SCRIPT LOCK CHECK` (5).

**Format & export (step 08)** — formula `FORMULA · WHY FOUNTAIN`; **AI prompt block** (`div.ai-prompt-block`): h4 `AI PROMPT GENERATOR`, paragraph "Stuck on a scene? This builds a prompt from your blueprint data — character, want, world, beat — that you can paste into Claude, ChatGPT, or any AI tool to draft a scene. Your data stays here; only the prompt is copied.", read-only textarea (ph `Click 'BUILD PROMPT' to generate.`), buttons `BUILD SCENE PROMPT`, `BUILD DIALOGUE PROMPT`, `BUILD FEEDBACK PROMPT` (alt style), `COPY TO CLIPBOARD`; mono heading `FORMATTED PREVIEW`; **script preview** (`div.script-preview`, Courier Prime page on a light-toned "paper" panel: slug lines caps, action, centred character names and dialogue; empty text `Add scenes and dialogue in Step 7 to see the formatted preview here.`); buttons `↓ DOWNLOAD .FOUNTAIN` (primary), `↓ DOWNLOAD .TXT`, `PRINT SCRIPT ONLY`. Check `EXPORT CHECK` (4).

**Production reality (step 09)** — related chips (FEATURE Step 23 Schedule & Budget, LIBRARY Equipment Estimator), formula (BUDGET = (DAYS × CREW SIZE × LOCATION FEE) + EQUIPMENT + POST…), why block, **prod-grid** of 12 labelled inputs (keys): `SHOOT DAYS` (`p_days`, ph `e.g. 2 days`), `CAST` (`p_cast`, `e.g. 3 speaking, 2 background`), `LOCATIONS` (`p_locs`, `e.g. 1 — apartment`), `CREW SIZE` (`p_crew`, `e.g. 6`), `CAMERA` (`p_cam`, `e.g. Sony FX3 (owned)`), `LENS KIT` (`p_lens`), `SOUND` (`p_sound`), `LIGHTING` (`p_light`), `BUDGET (TOTAL)` (`p_budget`, `e.g. ₹1.5L`), `FUNDING` (`p_funding`), `POST-PRO` (`p_post`), `SHOOT MONTH` (`p_month`, `e.g. March 2026`); asks `Five things in the script I cannot afford to shoot` (`p_cuts`, 4 rows), `My biggest production risk` (`p_risk`, 3 rows); check `PRODUCTION REALITY CHECK` (4).

**Logline counter (step 02)** — under the `Draft 3 — The locked logline` textarea (`s2_log_final`): mono caption `0 / 25 words` that turns warn-amber over 25.

**Stitch prompt** — "Three widgets from a short-film writing tool, dark violet UI (#120f1c ground, #1b1727 cards, blue accent #60a5fa, violet #9575f8, Catamaran, mono labels, 16px radius, pill buttons). (1) A scene-map table: header '# | Slug (INT./EXT. — Place — Time) | Who | What happens | Beat | Pages', rows with mono number '01', inputs, a Beat select (Setup/Disturb/Escalate/Turn/Image) and ⎘ ✕ row controls; buttons '+ ADD SCENE' (primary) and '+ ADD 3'. (2) A structured script editor: a three-tile counter (TOTAL WORDS 412, EST. PAGES 2.0, EST. RUNTIME 2:00) and a status line; a scene block with 'SCENE 01' tag, slug input, 'ACTION' label and textarea, a dialogue row with 'CHARACTER NAME', line and parenthetical inputs, '+ ADD DIALOGUE'; footer mini buttons '↻ REFRESH PREVIEW', 'COPY AS FOUNTAIN', 'CLEAR SCRIPT' (danger). (3) A Courier Prime formatted-script preview on a pale page. Desktop + 390px."

---

## 3. How the blueprints now live inside the stages

**The relationship in one paragraph** — The two blueprints are no longer destinations; they are the question bank for the five stage pages. Each stage page (Story, Screenplay, Pre-Production, Production, Post-Production) ends with a **Guide** section (`section#guide.sg`, tab label "Guide", reachable as `<stage page>#guide`) that draws that stage's slice of the blueprint for the open project's format (feature or short — read from the project, not chosen on the page). The answers are the blueprint's own: written to the same blob (`fms_filmmaker_combined_v1` / `fms_shortfilm_blueprint_v1`) but only through a **merge-write of the fields touched**, so the full blueprint page and the guide never overwrite each other. Old links keep working: `feature.html` / `short.html` (and the `arunak-*.html` stubs that bounce to them) forward to the owning stage guide.

**Which stage owns which step** (`steps.stages.json`, derived — never listed in code)
- Story (`story.html`): feature 01–10 + Treatment Ladder; short 01–05. On the Story page the guide **omits steps the Story path already asks inline** (`story-paths.json` `absorbs`), so a question appears once; what remains is the cover sheet (Project title, Writer / Director, Started on, Stage, Working title, Genre, Draft; short: Project title, Writer / Director, Started on, Target runtime).
- Screenplay (`screenplay.html`): feature 11, 12, "Write the draft", 13; short 06, 07, 08, and 11 (final lock).
- Pre-Production (`breakdown.html#script` is the first module): feature 14–24; short 09 (shared with Production).
- Production (`shoot.html`): feature 25–28; short 09.
- Post-Production (`edit.html#log`): feature 29–32; short 10.

**Redirects and routing**
| From | To |
|---|---|
| `feature.html#step-07`, `short.html#step-04` | `<stage page>?step=<feature|short>/<step-id>#guide`, e.g. `story.html?step=feature/step-07#guide` (feature 25–32 also use `feature/`) |
| `feature.html#vol-1`, `#part-2`, `#vol-2`, `#phase-3`, `#phase-4` | the guide of the stage that cover opens (`story`, `screenplay`, `preprod`, `production`, `post`) |
| `feature.html#treatment-ladder`, `#write-the-draft` | Story guide / Screenplay guide at that step |
| `#glossary` | `library.html#glossary` |
| `feature.html#pitch-deck` | `story.html#pitch` |
| `feature.html#sync-section` | `settings.html#drive` |
| `short.html#festival-tracker` | `deliverables.html#festivals` |
| anything unknown | `story.html#guide` |
| `?stay=1` on feature/short | no redirect: the full legacy page |
| `arunak-filmmaker-blueprint.html`, `arunak-shortfilm-blueprint.html`, `arunak-filmmaker-library.html` | meta-refresh + `location.replace` stubs (title "Moved — <brand>") to `feature.html`, `short.html`, `library.html`, carrying the hash; page text `This page moved to <a>` and "Your saved work is untouched — it lives in this browser and the new page reads the same storage." Never cached by the service worker. |

### 3a. Stage guide section (`section#guide.sg`, src/ui/stage-guide.js + stage-guide-body.js)

**Purpose** — Answer the blueprint's questions for the current stage without leaving it.

**Layout** — Appended below the stage page's own modules; also one of the page's tabs (`data-tab-label="Guide"`). Lazy: the heavy body loads when the section nears the screen or the hash is `#guide`. A single card column; one step visible at a time ("stepper"), the rest are `hidden` (still in the DOM, so no saved field is lost).

| Region | Element | Type | Exact text | Behaviour | States |
|---|---|---|---|---|---|
| Head | Eyebrow `.sg-eyebrow` | mono | `Guide · Story` / `Screenplay` / `Pre-Production` / `Production` / `Post-Production` | | |
| | Title `.sg-title` | h2 | Story: `The cover sheet.`; others: `The questions for this stage.` | | |
| | Deck `.sg-deck` | paragraph | Story: `Every question the Feature Blueprint asks for the story is answered in the path above, once. What is left here is the film's cover sheet for "<title>": its title, writer and draft.` Others: `These are the Feature Blueprint's questions for pre-production, answered here for "<title>". Your answers are the blueprint's own — the same ones, saved in the same place.` (Short Film Blueprint for short projects) | | |
| Body | Loading | text | `Loading the questions…` | | loading |
| | Step bar `.stp-list` | horizontal pill strip, scrolls sideways | Cover pill `Cover`, then one pill per step: blueprint step number + short name (`11 Scene list`, `12 Final check`, …); done pill when all that step's checks are ticked; current pill `.is-on` | Click switches the visible step; footer shows "Step 3 of 12" with Back / Next buttons named after the neighbouring steps' short names | current / done / default |
| | Cover fields `.sg-cover` | meta-grid | the stage's cover fields (see above) | | |
| | Step panel | the step rendered by the same `renderStep()` (header, stage row hidden of duplicates, deck, all blocks of section 4) | Tables show an `+ Add a row` button and the note `Reorder, duplicate or delete rows in the full blueprint.` | | |
| | Private note toggle | `✎` button (tooltip "Add a private note (saved on your device)") | feature only | | |
| Empty | No project | the section keeps only its heading; the red "NO PROJECT OPEN" banner above the page links to the hub | | no-project |
| | Nothing for stage | `This stage has no blueprint questions.` | | |
| Error | `The guide could not load. Reload the page to try again.` | | |

**Mobile (390px)** — step bar is a one-line horizontally scrolling strip (the active pill is scrolled into view); Back / Next stack full width; blocks as in section 4 at phone width.

**Stitch prompt** — "A 'Guide' section embedded at the bottom of a stage page in a filmmaking studio, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono eyebrow, pill buttons, 16px radius). Mono eyebrow 'GUIDE · SCREENPLAY', heading 'The questions for this stage.', deck sentence naming the project in quotes. A horizontally scrolling stepper of pills: 'Cover', '11 Scene list' (current, violet fill), '12 Final check', 'Write the draft', '13 Script lock', with a small tick on completed pills. Below, one step card (mono number, title, formula callout, a table with columns Slug / POV / Want / Conflict / Charge, and a '+ Add a row' button with a muted note). Footer: caption 'Step 2 of 5' with outlined pill buttons '← Cover' and 'Final check →'. Provide 1280 and 390px frames, plus a no-project empty state."

---

## 4. Block catalogue — every type the step renderer can draw

Renderer: `renderStep()` in `src/ui/steps.js` iterates `step.blocks`; each block's `type` is looked up first in the page's extra renderers (`beatviz`, `festgrid` on short.html and in the short stage guide), then in `BLOCKS`. An unknown type is skipped with a console warning. Saving is the same for every field: any element with `data-key` is read into the page blob on input (400ms debounce on feature, 600ms on short), restored on load; checklist items save `true/false` under their `data-key`.

### 4.1 `formula` — Formula box (`div.formula-box`)
**Purpose** — The one-line "equation" of the step. **Data** — `{type, label, eq (HTML), tanglish}`. **Layout** — a tinted slab (brand-washed lavender in light, deep violet in dark; follows the theme) full width; mono label top-left, equation in larger text with `<code>` chips for key terms.
| Region | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Top | `.label` | mono caps | `FORMULA` (default; short film uses `FORMULA · 5 BEATS`, `FORMULA · 1 PAGE = 1 MINUTE`, `FORMULA · WHY FOUNTAIN`, `FORMULA · THE FESTIVAL HIERARCHY`) | | |
| Body | `.eq` | rich text | Step 01: `SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]` (the "What if" is a `code` chip) | | |
| Gloss | `.tn` span | italic muted | Tanglish line e.g. `SPARK = "Enna aagum?" + [… ] …` | Always shown | |
**States** read-only. **Sample** Step 11: `SCENE = Slug + POV + Want + Conflict + Charge flip / If charge doesn't flip (+→− or −→+), it's not yet a scene.` **Mobile** same, wraps.
**Stitch prompt** — "A 'formula' callout box in a dark violet guide (#120f1c page, slab fill #241a3d-ish violet wash, accent #9575f8, Catamaran, JetBrains Mono label, 16px radius). Mono caps label 'FORMULA' top-left in light violet. Equation text 'SPARK = [What if] + [unusual situation] + happening to + [specific person] + in [specific world]' where bracketed terms are rounded code chips with a slightly lighter violet background. Under it an italic muted Tanglish gloss line. Generous 20px padding, subtle 1px border, no shadow. Show a two-line equation variant (PROTAGONIST = (Want ↔ Need) + The Lie + The Wound + The Flaw / ARC = Lie believed → Lie tested → Lie broken → New self). Desktop and 390px."

### 4.2 `craft` — Craft lesson (`div.por-thozil`)
**Data** `{label, trade, body, tanglish}`. Card with left accent bar. Label `POR THOZHIL · CRAFT LESSON` (mono), bold trade headline (e.g. `Vignesh Raja's spark that survived a decade`, `Prakash — the rookie who shouldn't be a cop`), paragraph body (with italic film names), Tanglish gloss span. 23 of 24 feature steps have one. **States** read-only.
**Stitch prompt** — "A 'craft lesson' card in a dark violet guide (#1b1727 card on #120f1c, accent #9575f8, Catamaran, mono label, 16px radius). 4px violet left accent bar. Mono caps label 'POR THOZHIL · CRAFT LESSON', a bold one-line headline 'Vignesh Raja's spark that survived a decade', a paragraph of body text with italic film titles, and an italic muted Tanglish line below separated by a thin rule. Show desktop and 390px."

### 4.3 `why` — Why this matters (`div.why-this`)
**Data** `{label, body, tanglish}`. Label `WHY THIS MATTERS` (mono), one paragraph. In Tanglish mode the paragraph is **replaced** by the full translation (not appended). **Sample** "Most stories die because the writer can't articulate why this story, why now, why them."
**Stitch prompt** — "A 'why this matters' note in a dark violet guide: card #1b1727 with a hairline #322c48 border, small mono caps label 'WHY THIS MATTERS' in light violet #b69bfb, then one calm paragraph in #ece9f6. Slight inset, 16px radius, 18px padding. Also show a language-toggle state where the same paragraph is swapped for Tanglish text. Desktop + 390px."

### 4.4 `hint` — plain hint (`div.hint`)
A muted italic line, optional Tanglish gloss. Used for helper sentences.

### 4.5 `examples` — Example cards (`div.examples` > `div.example` / `.example.alt`)
**Data** `{items:[{heading?, label, body, tanglish, alt}]}`. Two side-by-side cards (stack at 390px): first in the default tone, second `alt` (second hue wash). Mono label (`VIKRAM VEDHA`, `96`, `VIKRAM VEDHA — VIKRAM`, `96 — RAM`), body paragraph, italic Tanglish gloss. **Sample** Step 01: VIKRAM VEDHA "What if the gangster a righteous cop is hunting voluntarily walked into the station and started telling him stories that proved the cop's "good kills" were murders?" / 96 "What if two high-school sweethearts who lost touch for 22 years met for one single night at a school reunion — knowing nothing could come of it?"
**Stitch prompt** — "A pair of example cards for a screenwriting guide, dark violet UI (#120f1c ground, cards #1b1727, accent #9575f8, secondary hue gold #d6a44a for the alternate card, Catamaran, mono labels, 16px radius). Two equal cards side by side: each has a mono caps label ('VIKRAM VEDHA' / '96'), a body paragraph quoting a 'What if…' premise, and a muted italic Tanglish line. The second card has a gold-tinted left edge. At 390px they stack. Hairline borders, 20px padding."

### 4.6 `asks` — Question fields (`div.ask`, one per item)
**Data** `{items:[{key, label, hint, kind: textarea|input|select, placeholder, rows, size, inputType, readonly, options, extras}]}`. Each ask is: `label.ask-label` (real `<label for="f_<key>">`), optional `div.hint`, the control (`textarea` default; `input`; `select` with optional placeholder option), size class (`lg` taller textarea), optional extras HTML after (e.g. the word counter). **Sample (step 01, textarea):** `A · The "What If" question that won't let you sleep` (ph `What if...`, size lg, key `s1_whatif`); `B · Why YOU have to tell this story` (ph `What in your life makes you the right person for this?`, `s1_why_me`); `C · The image, scene, or moment you can already see` (ph `The visual that started it all...`, `s1_image`). **States** empty (placeholder), focused (violet ring 2px), filled, saved (field-saved tick `✓` flashes at the corner), search-hit highlight, reading-mode (inputs hidden), read-only (greyed). Errors: none inline; a failed save shows the SAVE FAILED indicator.
**Stitch prompt** — "Question fields from a writing guide, dark violet UI (#120f1c ground, #1b1727 card, input fill #120f1c, accent #9575f8, Catamaran, mono for hints, pill-radius 16px inputs). Three stacked asks: label 'A · The \"What If\" question that won't let you sleep' (bold), a tall textarea with placeholder 'What if...'; label 'B · Why YOU have to tell this story' with a normal textarea; label 'C · The image, scene, or moment you can already see'. Show states: empty, focused (2px violet ring), filled with a small green '✓' flash at the corner, and a search-highlighted field with amber outline. Include a one-line select variant ('Pick a genre...') and a single-line input variant. 390px full width."

### 4.7 `check` — Checklist (`div.step-check`)
**Data** `{heading, items:[{key, text}]}`. Heading `BEFORE MOVING ON` (default; short film uses `STRUCTURE LOCK CHECK`, `SCENE MAP LOCK CHECK`, `SCRIPT LOCK CHECK`, `EXPORT CHECK`, `PRODUCTION REALITY CHECK`, `FESTIVAL STRATEGY CHECK`). Items are `li[role=checkbox]` (tabindex 0, `aria-checked`), a square tick box + sentence; click/Space toggles; saved as boolean under `ck_s1_a` etc.; ticked items count toward the step badge, the progress meter and the rail tick (all ticked = complete). A slab surface like the formula box. **Sample (step 11):** Every scene has a clear POV character. / Every scene has someone wanting something. / Every scene has a clear obstacle. / Each scene's charge flips by the time it ends. **States** unticked, ticked (filled violet box with ✓, text unchanged), keyboard-focus ring.
**Stitch prompt** — "A 'before moving on' checklist inside a dark violet guide slab (#241a3d wash on #120f1c page, accent #9575f8, Catamaran, mono heading, 16px radius). Heading 'BEFORE MOVING ON' in mono caps. Four rows each with a 20px rounded checkbox and a sentence: 'Every scene has a clear POV character.', 'Every scene has someone wanting something.', 'Every scene has a clear obstacle.', 'Each scene's charge flips by the time it ends.' Show two ticked (violet fill, white tick) and two empty, one with a keyboard focus ring. Rows are full-width tap targets (48px at 390px)."

### 4.8 `raw` — authored bespoke widgets (re-inserted as HTML; handlers rewired to data-actions)
The following are the distinct raw widgets. Each has the exact class name listed.

**4.8.1 Related chips** (`div.related-chips`) — mono label `RELATED:` + link chips (`a.related-chip.short|feat|lib` with a tiny `.src` tag), e.g. `SHORTS · Step 03 Character` (feature step 04), `FEATURE · Step 08 The 15 Beats`, `LIBRARY · Equipment Estimator`. Cross-blueprint links (now forwarded by the redirects). Chip hue: blue = shorts, violet = feature, gold = library.
*Prompt:* "A row of small cross-link chips on a dark violet page (#120f1c, accent #9575f8, Catamaran, mono label): label 'RELATED:' then pill chips each with a tiny uppercase source tag and text — 'SHORTS · Step 03 Character' (blue #60a5fa tint), 'FEATURE · Step 08 The 15 Beats' (violet tint), 'LIBRARY · Equipment Estimator' (gold #d6a44a tint). Hover raises border brightness. Wraps at 390px."

**4.8.2 Character block** (`div.char-block`, steps 04, 05, 06) — card with `h4` + `div.dept-fields` two-column label/input pairs. Step 04 `Your Protagonist`: `Name` (`s4_name`), `Age / role / context` (`s4_age`), `External Want` (`s4_want`), `Internal Need` (`s4_need`), `The Lie They Believe` (`s4_lie`), `Wound (the past event)` (`s4_wound`), `Skill / Weapon` (`s4_skill`), `Fatal Flaw` (`s4_flaw`). Step 06 blocks have an italic description line (e.g. `Ally / Confidant`: "The one who knows the hero well. Often the deepest betrayal — or the deepest loss." fields `Name` (`s6_ally_name`), `What They Reflect About the Hero`, `Their Independent Subplot`, `The Moment They Leave / Betray / Die`). Names typed here feed the relationship map and the pitch deck.
*Prompt:* "A character profile form card in dark violet UI (#1b1727 card, #120f1c inputs, accent #9575f8, Catamaran, 16px radius): bold heading 'Your Protagonist', then a 2-column grid of labelled single-line inputs: Name, Age / role / context, External Want, Internal Need, The Lie They Believe, Wound (the past event), Skill / Weapon, Fatal Flaw. Small muted labels above each input, 12px gaps. One variant with an italic helper line under the heading (Ally / Confidant). 390px single column."

**4.8.3 Relationship map** (`div.char-map`, step 06) — label `RELATIONSHIP MAP`, deck "Every character orbits your protagonist. As you fill names above, they appear here. The dotted line connects narrative function — solid lines mean "active relationship in the story."", an SVG (`#charMapSvg`, viewBox 720×380): protagonist node in the centre, other named characters as nodes on an orbit, lines between. Derived from the typed names (nothing stored). Empty = just the centre/placeholder.
*Prompt:* "A character relationship map card in dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono label, 16px radius). Mono label 'RELATIONSHIP MAP', a muted deck sentence, and a 720×380 SVG: a large violet node for the protagonist in the centre, five smaller labelled nodes (Antagonist, Ally, Mentor, Love interest, Rival) orbiting it, solid violet lines for active relationships and dotted grey lines for narrative function. Show an empty state with only the centre node and the text 'Fill the names above to see them appear'. Desktop and 390px."

**4.8.4 Beat table** (`table.beat-table`, feature step 08) — header `Beat | Your Version`; 15 rows: left cell `.beat-name` = bold `01 · Opening Image` (names derived from the Save-the-Cat method: Opening Image, Theme Stated, Set-Up, Catalyst, Debate, Break Into Two, B Story, Fun and Games, Midpoint, Bad Guys Close In, All Is Lost, Dark Night of the Soul, Break Into Three, Finale, Final Image), a mono page marker (`Page 1`, `~ Page 5`, `Pages 1-10`, `~ Page 12`, `Pages 12-25`, `Page 25`, `Page 30`, `Pages 30-55`, `Page 55`, `Pages 55-75`, `Page 75`, `Pages 75-85`, `Page 85`, `Pages 85-110`, `Last page`) and a hint (`Hero's world before change.`, `Someone says the lesson aloud.`, `Establish world, flaw, want.`, `The thing that breaks status quo.`, `Hero hesitates.`, `Hero commits. New rules.`, `Second relationship begins.`, `Promise of the premise.`, `False victory or defeat. Goal inverts.`, `Pressure mounts.`, `A death — literal or symbolic.`, `Hero alone. Lie cracks.`, `New plan. New self.`, `Resolves external + internal.`, `Mirror of opening, transformed.`); right cell a textarea keyed `b01`…`b15` (placeholders on 01, 04, 09 give VV / 96 examples). A worked-example card from the Dragon case study is inserted **right after** the table (`beat-eg-card`, lazy-loaded).
*Prompt:* "A 15-row beat sheet table for a screenwriting guide, dark violet UI (#120f1c ground, #1b1727 table surface, hairline #322c48 rules, accent #9575f8, Catamaran, mono for page markers, 16px radius). Two columns: 'Beat' (a bold '01 · Opening Image', a small mono page marker 'Page 1', and a muted hint 'Hero's world before change.') and 'Your Version' (an auto-growing textarea with placeholder). Show rows 01–04 and 09 with the filled/empty difference, a faint violet tint on filled rows. At 390px each row stacks beat above textarea. Add a small collapsible 'worked example' card under the table."

**4.8.5 Pacing visualiser** (`div.pacing-viz`, feature step 08) — label `PACING VISUALIZER`, deck "Each beat lights up as you fill it. The dotted arc traces the typical rise and fall of dramatic intensity…", SVG `#pacingSvg` (720×200), and four stats: `Beats filled: 0 / 15`, `Act 1: 0/3`, `Act 2: 0/8`, `Act 3: 0/4`. Derived live from `b01–b15`.
*Prompt:* "A pacing visualiser card: mono label 'PACING VISUALIZER', a short deck, a wide 720×200 SVG with a dotted violet arc of dramatic intensity and fifteen small beat bars/dots that light up in violet as they are filled (show 6 lit), and four stat chips below: 'Beats filled: 6 / 15', 'Act 1: 3/3', 'Act 2: 3/8', 'Act 3: 0/4'. Dark violet UI (#1b1727 card, #9575f8 accent, Catamaran, mono), 16px radius."

**4.8.6 Table with row actions** (`table.pp-table` + `div.row-actions`) — used for tables of repeated rows:
- Step 10 Setups & payoffs: columns `# | Setup (what + roughly which page) | Payoff (what + roughly which page)`; five fixed rows `01`–`05` with two textareas each (`s10_setup_N`, `s10_pay_N`; ph `What you plant + page...` / `How it lands + page...`).
- Step 11 Scene list: columns `# | Slug (location + time) | POV | Want | Conflict | Charge`; rows built in JS (`sl_N_slug` ph `INT. LOCATION – DAY`, `sl_N_pov` ph `POV`, `sl_N_want` ph `Wants...`, `sl_N_conf` ph `What blocks it...`, `sl_N_charge` select `—`, `+ → −`, `− → +`, `+ → ++`, `− → −−`) — the charge cell is tinted by value; each row ends with `⎘` duplicate and `✕` delete controls. Buttons `+ ADD SCENE`, `+ ADD 5`, `CLEAR EMPTY` (mini buttons).
- Step 16 Shot list: `#` / `Sc#` (`shot_N_scene`) / `Action / blocking` (`_desc`) / `Lens...` select (groups Wide 12–24mm, Normal 28–50mm, Tele 65–200mm, Anamorphic 32–75 Ana, Other: Zoom 24-70, Zoom 70-200, Macro, Probe lens) / `Move...` select (Static, Pan, Tilt, Dolly in/out/with, Push in, Pull out, Handheld, Steadicam, Gimbal, Slider, Crane / Jib, Drone / Aerial, Whip pan, Tracking, Snap zoom) / `Coverage...` select (Master, Establishing, EWS — Extreme Wide, WS — Wide Shot, MS — Medium, MCU — Medium CU, CU — Close Up, ECU — Extreme CU, OS — Over Shoulder, 2-Shot, POV, Insert, Cutaway) / `Lighting / notes`.
- Step 20 Cast list: `# | Character name | Actor | Status... | Notes, dates, conflicts`; status options Not contacted, Audition scheduled, Auditioned, Callback, Look test, Chemistry read done, Verbally confirmed, Contract signed, Fully locked, Declined / withdrawn.
- Step 21 Locations: `# | Scene | Location name & address | Type | Permit | Recce date`; type options Real (as-is), Real (dressed), Built set, Partial build, Hybrid (real + build), Studio, Green screen; permit options Not required, Researching, Application pending, Application filed, Approved, Denied — need backup; recce ph `DD / MM`.
All row fields save as indexed keys (`sl_3_slug`, `shot_2_lens`, `cast_1_status`, `loc_4_permit`); a row number renumbers on delete; duplicate copies the row's values. `CLEAR EMPTY` removes all-blank rows. **States** empty table (zero rows, only add buttons), 1+ rows, charge colour variants.
*Prompt:* "An editable scene-list table for a screenwriting tool, dark violet UI (#120f1c ground, #1b1727 table, hairline #322c48, accent #9575f8, Catamaran, mono numerals, 16px radius, pill buttons). Header: '# | Slug (location + time) | POV | Want | Conflict | Charge'. Three rows: mono '01', slug input 'INT. LOCATION – DAY', POV input, two auto-growing textareas, and a charge select showing '+ → −' with a green tint, '− → +' with a red tint; each row ends with small ⎘ and ✕ icon buttons. Below the table three small outlined pill buttons: '+ ADD SCENE', '+ ADD 5', 'CLEAR EMPTY'. 390px: horizontally scrollable with the # column sticky."

**4.8.7 Scene charge timeline** (`div.scene-timeline`, feature step 11) — label `SCENE CHARGE TIMELINE`, deck "Every scene's emotional charge plotted in order. Bars above the line are positive flips, below are negative…", a bar chart `#sceneChart` (one bar per scene up or down from a centre line), legend `+ → −`, `− → +`, `+ → ++`, `− → −−` (each with a coloured swatch), four stats: `Total scenes: 0`, `With charge: 0`, `Polarity flips: 0`, `Longest single-polarity run: —`.
*Prompt:* "A scene charge timeline card, dark violet UI (#1b1727, accent #9575f8, ok green and danger red for polarity, Catamaran, mono labels, 16px radius). Mono label 'SCENE CHARGE TIMELINE', a deck sentence, a bar chart of 14 slim bars rising above and falling below a centre axis (green positive, red negative, double-height for ++/−−), a legend with four swatches '+ → −', '− → +', '+ → ++', '− → −−', and a stats row 'Total scenes: 14', 'With charge: 11', 'Polarity flips: 7', 'Longest single-polarity run: 3'. Empty variant: flat axis and '—'."

**4.8.8 Colour palette picker** (`div.palette-picker`, feature step 15) — label `VISUAL PALETTE — pick three colors that signature every frame`; three rows each = swatch (clickable, contains `input[type=color]`, keys `palette_c1..c3`, seeds `#b03a1f`, `#a87a32`, `#1f5d4a`), read-only hex text (`palette_cN_hex`), a name input (`palette_cN_name`, ph `What this color is for (e.g. blood, anger, the gangster world)`, `Second color & meaning...`, `Third color & meaning...`); below, a 3-segment colour bar `#paletteBar` mirrors the swatches. The pitch deck reads these.
*Prompt:* "A three-colour palette picker in a dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono hex text, 16px radius). Label 'VISUAL PALETTE — pick three colors that signature every frame'. Three rows: a 44px rounded swatch (brick red, ochre, forest green), a read-only mono hex field '#B03A1F', and a wide text input 'What this color is for (e.g. blood, anger, the gangster world)'. Under the rows a 24px tall tri-colour bar made of the three swatches with equal widths and 16px rounded ends. 390px: swatch + hex on one line, name input below."

**4.8.9 Department grid** (`div.dept-grid` of `div.dept-block`; steps 17, 18, 19, 22, 23) — a stack of cards, each with an `h4` and `div.dept-fields` (2-column label/field pairs; some blocks force one column). Fields are inputs, textareas and selects. **Sample (step 18):** block `Sets & Spaces` (textareas `Major built sets needed` `v2s6_sets`, `Real locations to be dressed (not built)` `v2s6_dressed`), block `Props & Signature Objects` (`Hero props (essential to story)` ph "e.g. the gun in Vikram Vedha; the photograph in 96", `Recurring objects (gather meaning across scenes)`, `Period-specific items needing research`), block `Art Director / Designer` (`Production designer`, `Art director`, `Set construction lead`, `Art dept budget`). **Sample (step 23):** blocks `Schedule` (`Total shoot days`, `Average pages per day` select `Pick avg...` ~1 page (heavy production) / ~2 pages (standard prestige) / ~3 pages (mainstream) / ~4 pages (TV / fast-paced) / ~5+ pages (indie / low-budget), `Number of schedules / blocks`, `1st AD name`, `Most expensive day on schedule (and why)`), `Budget` (`Total budget`, `Above-the-line`, `Below-the-line`, `Post-production`, `Contingency` select `Pick contingency...` 5% (very tight) / 10% (standard minimum) / 12.5% / 15% (recommended) / 20% (first-time / risky) / 25%+ (high-risk shoot), `Largest single line item`) plus the budget summary below, and `Heads of Department` (`DOP / Cinematographer`, `Production Designer`, `Editor`, `Composer`, `Sound Designer`, `Costume Designer`, `Casting Director`, `Production Manager`).
*Prompt:* "A department planning grid, dark violet UI (#120f1c ground, #1b1727 cards, accent #9575f8, Catamaran, mono small labels, 16px radius). A vertical stack of three cards: 'Sets & Spaces' (two full-width textareas 'Major built sets needed', 'Real locations to be dressed (not built)'), 'Props & Signature Objects' (three textareas with placeholder 'e.g. the gun in Vikram Vedha; the photograph in 96'), 'Art Director / Designer' (2x2 grid of single-line inputs: Production designer, Art director, Set construction lead, Art dept budget). Card headings are bold with a thin violet underline. Show filled vs empty. 390px single column."

**4.8.10 Budget summary** (`div.budget-summary`, inside the Budget block of step 23) — label `AUTO-CALCULATED TOTAL`; total `#budgetTotal` shows `— (fill numbers above)` until numbers exist, then the formatted rupee total; a stacked bar `#budgetBar` (segments Above-the-line, Below-the-line, Post, Contingency) with legend dots; hint `Type any number format — 50, 50,00,000, 50L, 50 lakh, 2cr — the totals add up automatically.` (money parser: whole-string suffix match). 
*Prompt:* "An auto-calculated budget summary panel in dark violet UI (slab #241a3d wash, accent #9575f8, Catamaran, mono label, 16px radius). Mono label 'AUTO-CALCULATED TOTAL', a huge total '₹ 1.2 Cr' (empty variant '— (fill numbers above)' with a muted '(fill numbers above)'), a 14px stacked bar split into four segments in violet, blue #60a5fa, teal #2dd4bf and amber, a legend with four coloured dots 'Above-the-line', 'Below-the-line', 'Post', 'Contingency', and a caption with kbd chips '50', '50,00,000', '50L', '50 lakh', '2cr'."

**4.8.11 HOD sign-off** (`div.hod-signoff`, feature step 24) — `h4` `HOD SIGN-OFF — DEPARTMENT LOCK`, deck "Each Head of Department countersigns that their work is locked, schedule-ready, and budget-aligned. Once all rows are checked, you can call ROLL CAMERA. Signatures here are honour-bound; they don't replace contracts."; 11 rows `div.hod-row`: role label (`Director`, `Producer`, `DOP`, `Production Designer`, `1st AD`, `Sound Designer`, `Composer`, `Editor`, `Costume`, `Casting Director`, `Production Manager`), a `Name` input, a `Date` input, a checkbox (keys `hod_dir_name`, `hod_dir_date`, `hod_dir_check`, …; tooltip "Director sign-off").
*Prompt:* "A sign-off sheet card for department heads, dark violet UI (#1b1727 card, accent #9575f8, Catamaran, mono heading, 16px radius). Heading 'HOD SIGN-OFF — DEPARTMENT LOCK', a deck sentence, then 11 aligned rows: role text (Director, Producer, DOP, Production Designer, 1st AD, Sound Designer, Composer, Editor, Costume, Casting Director, Production Manager), a 'Name' input, a 'Date' input and a round checkbox. Show three rows signed (checked, violet) with names and dates. 390px: role on its own line, name/date side by side, checkbox right."

**4.8.12 Short-film raw widgets** — `beat-grid` (see 2d), `scene-table`, `page-counter`, `script-editor`, `ai-prompt-block`, `script-preview`, `editor-actions`, `prod-grid` (see 2f). Heading `FORMATTED PREVIEW` mono in step 08.

### 4.9 `beatviz` (short only) — see 2d. 
### 4.10 `festgrid` (short only) — see 2e.
### 4.11 `video slot` — empty div at the end of a step; filled only when an approved video is attached (not in step JSON).

---

## 5. Three fully worked example steps

### 5.1 Step 01 — The Spark (first step, text-only, spine #1)
- Header: `01` · `The Spark.` · `~ 1 EVENING` · chip `ESSENTIAL · 1 of 10` · badge `EMPTY`.
- Stage row: pill `PART I · STORY`; `DO THIS IN` → `Idea Vault →`.
- Feeds: `FEEDS Pitch deck slides 02 and 10`.
- Deck: "Every film starts as a question that won't leave you alone. Capture it here — raw, unedited, in any form."
- Blocks in order:
  1. **formula** `FORMULA`: "SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]"; Tanglish gloss.
  2. **craft** `POR THOZHIL · CRAFT LESSON`, trade `Vignesh Raja's spark that survived a decade`, body: "The "what if" behind Por Thozhil — a serial killer from 1979 starts killing again — was so strong it survived TWO scares of obsolescence: the writers reworked the script after Jigarthanda released, then again after Ratsasan. A real spark doesn't die when nearby films release."
  3. **why** `WHY THIS MATTERS`: "Most stories die because the writer can't articulate why this story, why now, why them."
  4. **examples** (two cards): `VIKRAM VEDHA` and `96` (text in 4.5).
  5. **asks** (3 textareas): `A · The "What If" question that won't let you sleep` (ph `What if...`, lg, `s1_whatif`); `B · Why YOU have to tell this story` (ph `What in your life makes you the right person for this?`, `s1_why_me`); `C · The image, scene, or moment you can already see` (ph `The visual that started it all...`, `s1_image`).
  6. **check** `BEFORE MOVING ON`: My "what if" is specific, not generic. / I can name an emotional reason this story matters to me. / I can already see at least one scene clearly in my head. (`ck_s1_a/b/c`)
- Saved: 6 fields (3 text + 3 checks) in `fms_filmmaker_combined_v1`; badge goes `IN PROGRESS · 17%` after the first text answer (1 of 6).

**Stitch prompt** — "Full desktop and 390px screen for a guided-writing step page, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, JetBrains Mono, pill buttons, 16px radius). Header: mono '01', title 'The *Spark.*', chip 'ESSENTIAL · 1 of 10', '~ 1 EVENING', amber 'IN PROGRESS · 17%'. Stage row: violet pill 'PART I · STORY', 'DO THIS IN' + outlined button 'Idea Vault →', line 'FEEDS Pitch deck slides 02 and 10'. Italic deck 'Every film starts as a question that won't leave you alone.' Then: formula slab 'SPARK = What if + [unusual situation] + happening to + [specific person] + in [specific world]'; craft lesson card; why note; two example cards (VIKRAM VEDHA, 96); three labelled textareas A/B/C; a 'BEFORE MOVING ON' checklist with three items. Left STEPS tab and top reading-progress line visible."

### 5.2 Step 04 — The Protagonist (form-heavy)
- Header: `04` · `The Protagonist.` · `~ 2-3 EVENINGS` · `ESSENTIAL · 4 of 10` · stage `PART I · STORY` (no DO THIS IN buttons). Feeds: `Pitch deck slide 04 · the character map below`. Deck: "Build your hero from the inside out. The lie they believe at page 1 is the whole arc."
- Blocks: related chips (`SHORTS · Step 03 Character`); formula "PROTAGONIST = (Want ↔ Need) + The Lie + The Wound + The Flaw / ARC = Lie believed → Lie tested → Lie broken → New self"; craft `Prakash — the rookie who shouldn't be a cop` ("Want: do well in his first case. Need: stop being a cop because someone else wants him to. Lie: "this uniform is enough." Wound: family pressure. Flaw: book-smart, body-blind…"); examples `VIKRAM VEDHA — VIKRAM` and `96 — RAM`; **character block** `Your Protagonist` with 8 inputs (`Name` `s4_name`, `Age / role / context` `s4_age`, `External Want` `s4_want`, `Internal Need` `s4_need`, `The Lie They Believe` `s4_lie`, `Wound (the past event)` `s4_wound`, `Skill / Weapon` `s4_skill`, `Fatal Flaw` `s4_flaw`); **ask** `Who is the protagonist at the end? (one sentence)` (ph `By the final scene, they have become...`, `s4_arc`); check `BEFORE MOVING ON`: My hero's want and need are clearly different. / I can name the exact lie they believe on page 1. / I can name the wound that created that lie. / My hero changes meaningfully by the end.
- Saved: 9 text keys + 4 check keys. The typed name feeds the relationship map in step 06 and pitch-deck slide 04.

**Stitch prompt** — "Form-heavy step screen, dark violet UI (#120f1c ground, #1b1727 cards, #9575f8 accent, Catamaran, mono labels, 16px radius). Header 'The *Protagonist.*' with '04', 'ESSENTIAL · 4 of 10', '~ 2-3 EVENINGS'. Feeds line 'Pitch deck slide 04 · the character map below'. A 'RELATED:' chip row, a two-line formula slab, a craft card, two example cards, then the main card 'Your Protagonist' with a 2-column grid of 8 labelled inputs (Name, Age / role / context, External Want, Internal Need, The Lie They Believe, Wound (the past event), Skill / Weapon, Fatal Flaw), then a labelled textarea 'Who is the protagonist at the end? (one sentence)', then a 4-item checklist. Show desktop and 390px (inputs single column)."

### 5.3 Step 11 — The Scene List (table-heavy, spine #8)
- Header: `11` · `The Scene List.` · `~ 2-4 WEEKS` · `ESSENTIAL · 8 of 10` · stage pill `PART II · SCREENPLAY` (gold). Stage row: `DO THIS IN` → `Scene list →`; live readout `12 scenes · 14 pages · every scene has a location` (or `Nothing in the Breakdown yet`). Feeds: `The scene charge timeline on this step · the Markdown export's scene table`. Deck: "Break each beat into actual scenes. This is the bridge between outline and draft."
- Blocks: formula "SCENE = Slug + POV + Want + Conflict + Charge flip / If charge doesn't flip (+→− or −→+), it's not yet a scene."; craft (railway-crossing scene, Por Thozhil); **scene table** (`# | Slug (location + time) | POV | Want | Conflict | Charge`, rows from JS); row-actions `+ ADD SCENE` / `+ ADD 5` / `CLEAR EMPTY`; **scene charge timeline** (4.8.7); check `BEFORE MOVING ON`: Every scene has a clear POV character. / Every scene has someone wanting something. / Every scene has a clear obstacle. / Each scene's charge flips by the time it ends.
- Saved: per-row keys `sl_N_slug|pov|want|conf|charge` plus check keys `ck_s11_a–d`; the page-1 scene bin and breakdown read the rows.

**Stitch prompt** — "Table-heavy step screen for a screenwriting tool, dark violet UI (#120f1c ground, #1b1727 cards, gold stage hue #d6a44a for the Screenplay part, accent #9575f8, Catamaran, mono, 16px radius). Header '11 The *Scene List.*', 'ESSENTIAL · 8 of 10', '~ 2-4 WEEKS', gold pill 'PART II · SCREENPLAY', 'DO THIS IN' + 'Scene list →', live readout '12 scenes · 14 pages · every scene has a location'. Formula slab, craft card, then a scene table (# / Slug / POV / Want / Conflict / Charge select) with 4 rows and per-row ⎘ ✕, three mini buttons under it, then a 'SCENE CHARGE TIMELINE' bar chart card with four stats, then a 4-item checklist. Desktop and 390px (table scrolls sideways)."

---

## 6. The six hues and where they appear

The five **stage** hues are carried by classes `.sh-ph-<stage>` (and the same colours are the older volume hues `.hue-*`); a sixth, blue, is the short-film volume hue. The hue is set on `--hue` / `--hue-deep` / `--hue-lift` / `--hue-on` and a `*-wash` tint exists for each. Dark theme values (default):

| # | Name | Meaning | Fill | Deep (as text on light) / lift | Wash | Where it appears in the blueprints |
|---|---|---|---|---|---|---|
| 1 | feature / story (violet) | Story stage, Part I, feature blueprint, the brand | `#9575f8` | `#b69bfb` | `#241a3d` | Part I stamp and cover, step chips for 01–10, step rail group label, the product accent |
| 2 | library / screenplay (gold) | Screenplay stage, Part II | `#d6a44a` | `#e8c384` | `#2e2415` | Part II stamp and cover, chips for 11–13 and "Write the draft"; library chips on related-chips |
| 3 | plan / preprod (teal) | Pre-Production, Part III | `#2dd4bf` | `#7fe8da` | `#11302c` | Part III stamp and cover, chips for 14–24 |
| 4 | shoot / production (pink) | Production, Part IV | `#f472b6` | `#f9a8d4` | `#33182a` | Part IV stamp and cover, chips for 25–28 |
| 5 | visualize / post (magenta) | Post-Production, Part V | `#e879f9` | `#f0abfc` | `#2e1030` | Part V stamp and cover, chips for 29–32 |
| 6 | shorts (blue) | Short-film volume | `#60a5fa` | `#93c5fd` | `#16233c` | The short blueprint's cover stamp `SHORT FILM · 11 STEPS`, its related-chip `SHORTS` tag, `vol-stamp.blue`, short-film accents |

Where hues are applied: stage chip colour on each step (`.st-stage-chip.sh-ph-*`); step-rail group label per part; the part stamps on the master cover; the part covers' tag chip; a part's divider labels; a step spanning two stages shows the second hue as a small circular swatch next to the chip; festival tier cards use their own tier left-edge colours (tier 1/2/3) rather than phase hues; semantic colours (ok green, warn amber, danger red) are never one of these hues. Light theme (`paper`, alternate): same roles with darker fills — feature `#6d28d9`, shorts `#2563eb`, library `#8f5a07`, visualize `#b21ec4` (page `#f7f5fc`, ink `#171233`, brand `#6d28d9`).

**Stitch prompt** — "A colour-key legend for six stage hues on a dark violet UI (#120f1c ground, #1b1727 cards, Catamaran, JetBrains Mono labels, pill chips, 16px radius). Six pill chips in a row labelled in mono caps: 'PART I · STORY' (#9575f8), 'PART II · SCREENPLAY' (#d6a44a), 'PART III · PRE-PRODUCTION' (#2dd4bf), 'PART IV · PRODUCTION' (#f472b6), 'PART V · POST-PRODUCTION' (#e879f9), 'SHORT FILM' (#60a5fa). Under each chip show: a 48px swatch, its hex, its wash tint, and a mini step-rail row ('01 The Spark') coloured with that hue, plus a step header chip. Include a combined chip with a small second-hue swatch (a step spanning Pre-production and Production). Desktop and 390px (two per row)."
