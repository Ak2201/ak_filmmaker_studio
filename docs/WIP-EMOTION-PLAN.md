# Emotional-craft layer — PLAN ONLY, nothing built

Planned 8 Oct 2026. **No code for this exists.** To start, say: *"Resume the
emotional-craft plan from docs/WIP-EMOTION-PLAN.md, Phase 0."* Read
`docs/HANDOFF.md` first for the state of the repo.

Owner decisions already made (do not re-ask): **Learn + Apply**; **AI is in
scope, as the last phase**; **learning free, tools paid** (a plan feature
key); built on **`develop`** (the owner first chose `wip-all`, which has since been merged).

## Context

The owner wants the craft ideas of Karl Iglesias's *Writing for Emotional
Impact* — engineering the audience's emotional response (hook, empathy,
curiosity, suspense, anticipation, surprise, tension and contrast, payoff) —
inside FilmMakerStudio, as something to **learn** and something to **apply**
while writing.

**Hard constraint — copyright.** The book is copyrighted. The product teaches
the *general craft ideas in original wording* with Tamil/Indian examples,
names the book once as recommended reading, and never reproduces its text,
chapter structure, lists or examples. Examples come only from the four
studied films (`dragon`, `96`, `porthozhil`, `vikramvedha`) and `films.json`,
function-labelled, no plot retelling, no quoted dialogue (the existing
`_about` rules in `studies.json`, `dissections.json`, `glossary.json`).

## Where to build it (corrected 8 Oct, late)

**This section replaces "Consequences of building on wip-all".** The owner first
chose to build on top of `wip-all`; since then the ten workstreams were
integrated and released (`ad7ab02`), `wip-all` is fully merged and frozen, and
`develop` = `main`. So:

1. **Phase 0 comes first, on `develop`:** branch `wip-emotion` off
   `origin/develop` (not `wip-all`), run the build and every `test:*`, run
   `verify` **uncapped**, record the baseline in `docs/WIP-EMOTION.md`. Failures
   that exist before our change are recorded as pre-existing, not fixed here.
2. **"Cannot ship before integration" no longer applies** — integration is done.
   It ships through the normal release gate in `docs/BRANCHING.md`. Keep every
   feature in new files with one-line import/mount hooks so it merges cleanly.
3. **Everything this plan wanted to reuse now exists on `develop`:**
   `coverageBatch` / `planCoverage` / `voiceCheck` in `src/lib/ai.js`,
   `src/ui/coverage.js`, `scripts/fake-ai.mjs`, `scripts/test-ai-coverage.mjs`,
   `scripts/prove-ai-coverage.mjs`, `src/lib/characters.js`, `paginateDoc`.
   The stale `paginate` assertion was fixed in `2d52a59`.
4. **Line numbers below are from the older `main`.** Re-find each anchor by
   symbol on `develop` before editing.
5. **New storage keys: none planned.** Every new field lives inside an existing
   record. Schema §24 already added `characters` and `costs` to the scope CHECK;
   this plan does not widen it. (The next free schema section is §25.)

## Phase 0 — Baseline (S)

- `git worktree add .claude/worktrees/wip-emotion -b feature/emotional-craft origin/develop`
- `npm install`; `VITE_SITE_GATE=off npx vite build --outDir dist-verify`;
  every `npm run test:*`; `VERIFY_DIST=dist-verify npm run verify` uncapped;
  `prove:sw`.
- Write `docs/WIP-EMOTION.md` (status doc, same shape as `docs/WIP.md` §3) and
  record what already fails.

## Phase A — Vocabulary, glossary, Library shelf (M) — first shippable slice

Pure content, no storage change, a selling point on its own.

- **New** `src/data/emotions.json`: `emotions[{id,label,blurb}]` (~10) and
  `techniques[{id,label,prompt,emotions[]}]`. Technique ids: `hook, empathy,
  curiosity, suspense, anticipation, surprise, tension, contrast, payoff`.
  `_about` carries the `frameworks.json` rule: **ids are storage keys; change
  labels, never ids.**
- **New** `src/data/emotional-craft.json` (shelf content: per technique a
  definition, a "try this on your scene" prompt, one function-labelled example
  from a studied film, a link to the existing glossary term) and
  `src/ui/emotional-craft.js` (thin renderer, modelled on
  `src/ui/case-studies.js` / `dissection.js`).
- **Modify** `src/data/navigation.json`: add library module
  `{id:"emotional-craft", status:"built", href:"library.html#emotional-craft"}`
  (library.modules, ~lines 28-56). Rail, palette, hub map and tab label derive.
- **Modify** `src/pages/library.js`: a `SECTIONS` entry (~207-322), a
  `renderEmotionalCraftHost()` and one `mountShelf()` line (~633-641). Use
  `section.section-body` so glossary popovers tag it (`chrome.js:1199`).
  `tabs.js` already lists `library`, so it becomes a tab with no list edit.
- **Modify** `src/data/glossary.json`: ~9 original terms
  (`{term, aliases, def, tanglish, examples[{film,note}]}`). Link to existing
  `setup, payoff, subtext, exposition, reveal, stakes` — do not redefine.
  Choose aliases carefully: `autoTagGlossary` (`chrome.js:1197`) auto-tags
  across the blueprints (min length 4).
- **Modify** `src/data/steps.stages.json` (never `steps.feature.json` —
  `npm run extract` overwrites it): add `"emotional-craft"` to `tools` for
  feature steps 08, 10, 11 (11 has the "scene charge timeline" widget) and the
  short film's 5-beat step, so "Do this in…" chips point at the shelf.
- **Plan gate:** the module id is the feature key; `plan-gate.js:69-70` treats
  a key as open unless `features[key] === false`. The shelf is open on every
  plan. Check `supabase-schema.sql` §18 for hard-coded key lists first.
- **Tests / gates:** `scripts/test-emotions.mjs` (unique ids, every technique's
  emotions exist, film keys valid); `scripts/check-copyright.mjs` (below);
  `npm run verify`. Re-baseline with **zero data-key movement** asserted
  explicitly. Expect shifts in the hub "N of M ready", Library cover/TOC
  counts, `numWord()` and `N_TERMS`; the new words appear as NEW, not missing.

## Phase B — Story emotion layer (M)  [tools: paid key]

All inside `fms_story_v1`; no new key. Anchors (main): `story.js` blankStory
53-56, loadStory 84-91, updateOutlineStep 475-481, heatmap 248-274, Clear
button 1069; `story-kit.js` renderHeat 60-130; `beat-guide.js` derive 110-160 /
body 165-205; `beat-board.js:116-118`.

- **Fields (additive, `typeof` guards, old data reads blank):** `step.emo`,
  `step.tech`, `mark.emo`, `story.emo = {'fw:beat': emotionId}`,
  `story.audience`. Per-beat default `emo` in `frameworks.json` next to `tension`.
- **story.js:** normalise in `loadStory`; allow `emo`/`tech` in
  `updateOutlineStep`; add `setBeatEmotion`; add **derived**
  `emotionCurve(story, fwId)` modelled on `heatmap()` (never stored); the Clear
  button resets the new maps.
- **UI:** new module `src/ui/emotion-kit.js` mounted as a tab
  `{id:'emotion', label:'Emotion'}` in `TABS` (`story.js:80-85`; hash routing
  at 1207-1212 gives `#emotion` free) reusing `renderHeat` including its
  `<table>` fallback; a "what the audience should feel here" select + technique
  chip under each beat prompt in `renderOutline` (298-382) / `renderStepRow`
  (384-403); an **"intended feeling here"** line in `beat-guide.js` (highest
  value — the writer sees it while writing); an emotion chip beside Tension in
  `beat-board.js`. Do **not** add a PATH step.
- **Plan gate:** feature key `emotion_tools` (missing = allowed; only `false`
  locks) via the existing `plan-gate.js`; the admin Features matrix lists it
  through `moduleCatalogue`.
- **Tests:** extend `test-story.mjs` (round-trip of the new fields, rendering
  other frameworks writes nothing, `blankStory()` spread safety, unknown-id
  fallback like `beatOf`); `verify` seeds `fms_story_v1`
  (`verify-migration.mjs` ~1192) and walks `#path-3/4/6` (~1727) — new DOM
  must pass the AA walk and keep idle writes at zero. `make-sample-story.mjs`
  gains one example emotion so the sample shows the feature.

## Phase C — Per-scene `feeling`, margin chip, honest hints (M–L)  [tools: paid key]

- **Field:** `feeling:''` (+ optional `feelingTo:''`) on `blankScene()`
  (`scenes.js:70`). `listScenes()` spreads it under stored rows (no migration);
  `fieldPatch` (`scene-sync.js:110`) only compares
  `intExt/dayNight/location/number`, so a heading edit never overwrites it;
  `Bin.binScene` stores the whole row so restore keeps it. Edit only through
  `Scenes.updateScene(id,{feeling})`.
- **Margin chip:** mirror `beat-board.js:263 decorateEditor()` — one
  `querySelector` per *heading* row (~60-120 rows), one shared margin pass with
  `.bb-marker`, `delegate()` for clicks, nothing per keystroke, nothing across
  all 2,361 elements. New code in `src/ui/feeling-chip.js` with one import +
  one mount line in `write.js` (it already merges Revisions, Tamil typing and
  Coverage — keep our edit additive).
- **Rule-based hints** — `src/data/format-rules.json` + cases in `checkOne`
  (`format-rules.js` ~160-200), severity **`hint` only**, individually
  dismissible, default-quiet. **Honest signals only:** scene length, dialogue
  to action word ratio, long action paragraph, same cast/location/INT-DAY run
  across N scenes, scene ending on an unanswered question, a neutral "no
  feeling set for N scenes". **Never ship** detectors for stakes, hook
  strength, empathy, surprise or "conflict present" — keyword lists cannot
  measure them.
- **Tests:** `test-format.mjs` (new rule ids; a `shot` type yields no finding;
  silent on an empty script), `test-screenplay.mjs` (ratio helper; 120pp <
  1200 ms), `test-sync.mjs` (`feeling` survives `applySync`, bin and restore).
  Measure Enter-paint on the 2,361-element sample against the ~30 ms median
  before/after.

## Phase D — AI "emotional read" (M)  [tools: paid key; BYO key]

- **`emotionRead(job)` in `src/lib/ai.js`**, copied from `beatCritique` (main
  `ai.js:889`) including the `forCompare` verbatim check (862-925): a quote that
  is not word for word in the scene's own text (`sceneScriptText`, `ai.js:110`)
  is stripped and counted. Per scene returns
  `{quote, feelingAudienceGets, mechanism, tryThis}`; **writes nothing**.
- **Reuse** the existing coverage batching (`planCoverage`/`coverageBatch`), `fake-ai.mjs`
  and `prove-ai-coverage.mjs` patterns; surface from the existing coverage panel
  or the margin chip's popover.
- **Gates:** `Panelm.keyGate` (`ai-panel.js:198`) then a click to run, mirroring
  `write.js:702-726`; off by default; `ai.js` stays lazy (assert it is absent
  from first paint in the `scripts/budget.json` check). Accepting a read sets
  `feeling` via `updateScene`; rewrites, if offered, go to `alts` through
  `alt-lines.js` — never the active take.
- **Tests:** Node test with `fake-ai` for BOTH providers (LF and CRLF frames, a
  Gemini `thought` part), an invented quote is stripped and counted, no key →
  gated, no write without accept.

## Phase E — Case-study and dissection columns (S–M)

- **Case studies:** optional `emotion:{felt,how}` on `studies.json` `scenes[]`
  (`validate()` `studies.js:182` keeps it optional) + one row in the
  `case-studies.js` scene card; authored function-labelled only.
- **Dissection:** `emotion` string on `Sequence` (`dissect.js:28-47`,
  `blankSequence` ~115), a labelled row in `dissection.js` (~372) and a dt/dd
  (~161). `fms_dissect_v1` is already registered everywhere. Read
  `story.tension`; do not duplicate it.
- **Tests:** `studies` validate with and without the field; dissect round trip
  with old stored data.

## Cross-cutting guardrails (acceptance checks, enforced by scripts)

1. **`scripts/check-copyright.mjs`** (run by `verify`): fails if any new content
   file (`emotions.json`, `emotional-craft.json`, glossary additions,
   studies/dissections additions) contains an 8-word run found in a
   **hashed-shingle deny-list** the owner supplies as
   `scripts/deny-shingles.txt` (hashes only — the book's text is never
   committed); fails on definitions over 40 words, blurbs over 20, prompts over
   25; fails on numbered "1." / "Chapter" style lists; caps techniques at 9 per
   shelf so the shelf cannot mirror the book's structure.
2. **Credit:** exactly one occurrence of the author's name in `src/`, as
   "Further reading: *Writing for Emotional Impact* by Karl Iglesias." on the
   shelf. No link, no affiliate, no quotes. A test asserts the count.
3. **Examples:** only the four studied films + `films.json`; a validator checks
   `film` keys and runs the existing `_about` linter.
4. **Standing:** zero new storage keys (diff the registries), zero idle writes,
   no inline handlers, tokens only, AA 4.5:1 in both themes,
   `Element.append(null)` trap avoided, no Tamil-script UI labels (open owner
   decision — task #15).

## Critical files

`src/lib/story.js`, `src/pages/story.js`, `src/ui/story-kit.js`,
`src/ui/beat-guide.js`, `src/ui/beat-board.js`, `src/lib/scenes.js`,
`src/lib/format-rules.js` + `src/data/format-rules.json`, `src/lib/ai.js`,
`src/pages/library.js`, `src/data/navigation.json`, `src/data/glossary.json`,
`src/data/steps.stages.json`, `src/lib/plan-gate.js`; new:
`src/data/emotions.json`, `src/data/emotional-craft.json`,
`src/ui/emotional-craft.js`, `src/ui/emotion-kit.js`, `src/ui/feeling-chip.js`,
`scripts/test-emotions.mjs`, `scripts/check-copyright.mjs`,
`docs/WIP-EMOTION.md`.

## Verification (end to end)

Per phase: `VITE_SITE_GATE=off npx vite build --outDir dist-verify` then
`VERIFY_DIST=dist-verify VERIFY_PORT=<port> npm run verify` (uncapped; only
deliberate wording diffs acceptable; data-key movement must be zero); every
`npm run test:*` including `test:story`, `test:format`, `test:sync`,
`test:screenplay`, the new `test:emotions`; `check-copyright`; gated
`npm run build` + `prove:gate` + `prove:billing` (the plan-gate key);
`prove:sw`. In Chromium on the Dragon sample (`index.html?sample=1`) at 390 and
1280 in both themes: Library → Emotional craft; Story → Emotion tab and the
beat-guide line; Write → margin chip and a hint; with a faked key, run the
emotional read and confirm a fabricated quote is stripped and counted. Record
Enter-paint before/after for Phase C and the first-paint budget delta for every
phase.

## Owner inputs still needed (do not block Phase 0 / A)

1. The hashed deny-list (`scripts/deny-shingles.txt`) — or agree to rely on the
   structural caps and a human read of each content file instead.
2. Vocabulary size (default: 9 techniques, ~10 emotions).
3. Tanglish alongside English on emotion/technique labels (the glossary's
   `tanglish` field needs native review either way).
4. Whether Write shows the per-scene `feeling` field by default or only when the
   Emotion tool is switched on (affects Phase C's perf budget).
