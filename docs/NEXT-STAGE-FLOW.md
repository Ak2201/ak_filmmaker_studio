# Prompt: the remaining stage-flow work

Hand the block below to a new session. It is written to be read cold —
it names the files, the numbers measured on 11 Oct 2026, and the traps
that cost time, so the next session does not re-derive them.

Two jobs, in order. The second is the large one.

---

## The prompt

> Work in `/Users/arun-9285/filmmakers-studio`, on `develop`, cut from
> the latest `main`. Do not push until I say so; show me the result in
> the local preview first.
>
> **Context.** The Story page was rebuilt so that only one step renders
> at a time, with Back / Next and a compact pinned step bar
> (`3c778e5`, `a06816e`). I have used it and I am happy with that
> navigation. The same treatment has NOT reached the other stages, and
> the pre-production one in particular reads badly.
>
> ### Job 1 — the pre-production guide's step strip
>
> Open `breakdown.html#guide` with the Dragon sample open
> (`index.html?sample=1` seeds it). The strip above the fields shows:
>
> ```
> [1 Cover] [✓ 14 · The Director's Vision.] [3 15 · The Lookbook.] [4 16 · The Storyboard & Shot List.] [5 17 · The Cinem…
> ```
>
> Three things are wrong with it and all three are visible in that one
> line:
>
> 1. **Two numbering systems in the same pill.** `3` is the strip's own
>    position; `15 ·` is the blueprint's global step number. A reader
>    cannot tell which number means anything. Pick one. (The blueprint
>    number is the one that matches the rest of the app — the stage
>    guide is the blueprint's questions re-homed — but the strip's
>    position is what Back / Next walks.)
> 2. **The labels are full sentences with their trailing full stops**
>    — "The Storyboard & Shot List." — so twelve of them are far wider
>    than any screen. Story's bar is compact because its labels are
>    short nouns ("Idea", "Logline", "Scene order").
> 3. **It overflows right with nothing to say so.** `chrome.js`'s
>    `watchScrollEdges()` already marks `.tabs` and wide tables with
>    `data-more` and `chrome.css` fades that edge; `.stp-list` is not
>    in the `EDGY` selector. Adding it there is a one-word change and
>    probably the cheapest part of this job.
>
> Measured for reference: the guide block is 791px, the page 2.9
> screens, 235 fields in the DOM across 12 steps (correct — the other
> steps are `hidden`, not absent; every `data-key` must stay in the
> DOM).
>
> ### Job 2 — the same flow for Screenplay, Pre-production, Production
>
> Story's flow is the reference. Bring Screenplay, Pre-production and
> Production to it. The mounts are:
>
> | stage | page | call |
> |---|---|---|
> | screenplay | `script.html#guide` | `src/pages/script.js:240` `mountStageGuide(main, { stage: 'screenplay' })` |
> | preprod | `breakdown.html#guide` | `src/pages/breakdown.js:692` |
> | production | `shoot.html` | see `src/pages/shoot.js` |
> | post | `edit.html` | `src/pages/edit.js:325` `{ stage: 'post' }` |
>
> They already pass `stepper: true` into `renderGuide`
> (`src/ui/stage-guide.js:239`), so the machinery exists — this is
> about making the behaviour and the furniture match Story's, not
> building a stepper from scratch. Read `src/ui/stepper.js`,
> `src/styles/stepper.css` and how `src/pages/story.js` uses
> `showOnly` / `stepFooter` / `wireStepper` (around line 1148), then
> decide whether the stage guide should call the same helpers rather
> than keep its own arrangement. Prefer deriving over duplicating:
> `story.js`'s step sequence is read from the DOM, not listed twice,
> and the new code should keep that property.
>
> Post-production is in the table because it shares the mechanism;
> I did not ask for it, so change it only if leaving it out would make
> the four inconsistent with each other.
>
> ### Constraints
>
> - **Do not remove any `data-key` from the DOM.** Hidden is fine,
>   absent is not: `npm run verify`'s data-key check is the thing that
>   protects saved work, and a step that stops rendering orphans
>   whatever the user typed into it.
> - Content lives in `src/data/*.json`, not in markup (CLAUDE.md
>   invariant 2). The step labels come from `steps.stages.json`; if
>   short labels are the answer, add a field there rather than
>   trimming strings in JS.
> - Every shape is a `--sk-*` variable; no literal radius, padding or
>   colour in a component (invariants 4 and 7).
> - A fragment must resolve in the empty state too — CLAUDE.md's
>   "a nav target must not depend on data existing" trap. Check each
>   stage guide with NO project and with the sample.
>
> ### What to run
>
> ```bash
> npm run test:all          # includes test:undef and test:schema
> npm run build:open && npm run verify
> npm run build && npm run prove:gate
> npm run build:verify && npm run prove:growth
> ```
>
> Node 22 is at `~/.local/node22/bin/node`; the system node is 20 and
> fails with a misleading `styleText` error. PostgreSQL for
> `test:schema` on macOS: see the recipe in CLAUDE.md's command list
> (`LC_ALL=C` matters).
>
> ### Two traps that cost me time on 11 Oct
>
> - **The preview's service worker serves a stale build.** After
>   `npm run build:verify`, a reload shows the OLD CSS and you will
>   conclude your fix did not work. Unregister it and clear caches
>   first, or append a cache-buster to the URL.
> - **`requestAnimationFrame` does not run while the browser pane is
>   hidden.** Any measurement that awaits a rAF will hang or report
>   zero. Use `setTimeout`.

---

## Already done on 11 Oct (do not redo)

- The Story path renders one step at a time — this was the other
  session's `3c778e5`, confirmed, not mine.
- The Idea step no longer carries two off-topic videos (a synopsis one
  and a screenplay one were pinned to `step:feature/step-01`). It went
  from 3,557px to 2,703px. `src/data/videos.json`.
- The tour runs start to end: 10 steps, sample → story → script →
  breakdown → stripboard → budget → call sheets → shoot → edit log →
  deliverables. `src/data/tour.json`.
- Video facades show the video's own still, fetched once into
  `public/media/vid/` by `npm run thumbs`. NOT hotlinked from
  i.ytimg.com — that would send every reader's IP to Google on load,
  which is the one thing the click-to-load facade exists to prevent.
- The project-switcher panel no longer opens off the left edge and
  under the studio rail at ≥1100px. `src/styles/chrome.css`.
- Rule 01 of the Fifty Rules of Thumb no longer renders one character
  per line: `library.js` appends a video slot as a third child of a
  two-column grid and it was auto-placing into the 32px numeral
  column. `src/styles/editorial.css`.

## Still open, not started

- The step-count mismatch on the Story page: the eyebrow says "Step 1
  of 10" (the path) and the footer says "Step 1 of 13" (the path plus
  Beats & pacing, Pitch deck, Cover sheet). Both on screen at once.
  Which is right is a product decision.
- `5-qualities-great-loglines` and `what-is-a-tech-scout` have no
  thumbnail, which usually means the video itself is gone. Worth
  running `npm run check-videos-online` (or whatever
  `scripts/check-videos-online.mjs` is wired to) against the whole
  catalogue.
