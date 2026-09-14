# The Filmmaker's Studio — working notes

Read this before changing anything. It is short on purpose; the parts that look
like fussy rules is there because breaking it has already cost a user their work
or silently broken a page.

## What this is

Four browser-based tools for filmmakers — a hub, two step-by-step blueprints,
and a reference library. Local-first: everything a user writes lives in their
browser's `localStorage`. Optional Supabase sync on top. Static build, no server.

It is a **writing tool people keep months of work in.** That single fact decides
most arguments: correctness of stored data beats every other consideration.

## Commands

```bash
npm install
npm run dev       # vite dev server, no service worker
npm run build     # static output in dist/
npm run preview   # serve the build (exercises the real service worker)
npm run verify    # ← the important one, see below
npm run extract   # regenerate src/data/*.json from legacy/ and self-check
npm run icons     # regenerate PWA icons from tokens.css
```

`VITE_DISABLE_SW=1 npm run build` builds without registering a service worker —
for hosted previews that shouldn't outlive themselves in a cache.

## Layout

```
index.html feature.html short.html library.html   page entries (Vite MPA)
arunak-*.html                                     redirect stubs for old URLs
src/
  data/      ALL content, as JSON. The asset.
  lib/       store.js cloud.js dom.js pwa.js
  ui/        chrome.js (toolbar/theme/toasts) steps.js (step renderer)
  styles/    tokens.css base.css chrome.css editorial.css widgets.css print.css
  pages/     hub.js feature.js short.js library.js
  sw.js      service worker (vite-plugin-pwa injectManifest)
scripts/
  extract/   the parsers that produced src/data — re-runnable, self-checking
  verify-migration.mjs
legacy/      the original hand-written pages. Reference only. NEVER EDIT.
```

## Hard invariants

**1. Storage keys are a contract with real users' saved work.**
Every `data-key` string, and every `localStorage` key, is load-bearing. A user
who has filled in 24 steps has a blob keyed by those exact strings. Renaming one
without a migration silently orphans their writing. Do not "tidy" them.

The `arunak_` prefix is historical and should eventually go — but only as one
deliberate pass with a migration that moves existing data. Not opportunistically.

**2. Content lives in `src/data/*.json`, not in markup.**
The 24 feature steps used to exist in three places (the markup, the jump
dropdown, and `exportMarkdown()`) with nothing keeping them in step. Now the
jump menu, search index, master index and Markdown export all derive from the
same file. If you find yourself hand-writing a list of steps or films, stop —
derive it.

To change copy, edit the JSON. To change how copy is presented, edit
`src/ui/steps.js` or the stylesheets.

**3. Never edit `legacy/`.** It is the reference `npm run verify` diffs against.
If it changes, the verifier stops being able to tell a refactor from a regression.

**4. Colours, sizes and spacing come from `src/styles/tokens.css`.**
No raw hex outside that file (there are currently zero — keep it that way). No
`body.dark` rules: paper / sepia / ink are token swaps, and a rule that only
exists to restate a colour for dark mode is a bug. Tokens are declared in bare
`:root` first, then overridden under `prefers-color-scheme` and `[data-theme]`.

**5. No inline `onclick` / `onchange` anywhere.**
A strict CSP ships in `vercel.json`; an inline handler breaks the page under it.
Use `delegate()` from `src/lib/dom.js` with `data-action` attributes. Some `raw`
blocks in `src/data` still carry inline handlers from the original markup; each
page strips and rebinds them at render time (`dehydrateInlineHandlers` /
`adoptInlineHandlers`). If you promote a raw block to a real component, drop the
handler properly rather than moving it.

**6. `src/lib/store.js` must evaluate before anything reads `localStorage`.**
It monkey-patches `Storage.prototype` to namespace keys per project. As a module
this is import-order dependent, not script-tag dependent. Every page entry
imports it first. `chrome.js` and `cloud.js` import it too — those imports look
unused; they are not. Do not prune them.

## The verification workflow

**Run `npm run build && npm run verify` before every commit.** It serves `dist/`,
loads all four pages in Chromium, and diffs each against its original in
`legacy/`:

- every `data-key` still present (exact — this is the storage contract)
- visible-text coverage, with an explicit allowlist of deliberate wording
  changes in the script. A word that goes missing and is *not* on the list fails
  the run; an allowlist entry that stops firing also fails, so the list can't rot
  into a set of permanent excuses. If you intentionally reword something, add it
  to `EXPECTED` with a reason.
- zero inline handlers
- zero `localStorage` writes during four seconds of idle (see the save loop below)
- zero horizontal overflow at 390px
- zero console errors

Current state: all four pages pass at 100% accounted coverage.

## Traps already paid for

These were real bugs. Re-introducing one is easy, so they are named here.

- **The save loop.** `updatePalette()` must never call `debouncedSave()`. It runs
  inside `refreshAll()`, which runs inside `saveData()`. That cycle re-serialised
  all 359 fields and re-rendered four widgets every 400ms forever. The idle-write
  assertion in `verify` exists to catch its return.
- **Escaping order.** `escAttr` must escape `&` *before* `"`. The other order
  turned `&quot;` into `&amp;quot;` on every save, so quote marks in a script grew
  four characters per autosave.
- **`li.value` is a number.** `HTMLLIElement.value` is an ordinal, not a string.
  Assigning a saved boolean to a checklist `<li>` made it `1`, and the next
  `.trim()` threw — one ticked checkbox permanently broke the short-film page on
  every later load. Field scans use
  `input[data-key], textarea[data-key], select[data-key]`; checklist items get
  their own `.step-check li` scan.
- **Unanchored suffix matching.** `parseNum` tests must be anchored (`/(lakh|l)$/`).
  Unanchored, a bare `l` anywhere made "1 lens day" parse as ₹1,00,000.
- **Don't persist the same thing twice.** Scene rows were once written both as
  flat `sm_N_*` keys and inside a `_sceneMap` array; indices renumbered on reload
  and stranded stale keys that inflated the progress denominator forever. One
  representation per thing.
- **An empty array is truthy.** `loadData` checking `if (saved._sceneMap)` gave
  returning users a table with zero rows and no way to add one.
- **Chrome initialises at import time**, when `#app` is still empty. Pages call a
  re-init after render to rebuild the step rail, glossary popovers and aria
  labels. If you add render-dependent chrome, wire it into that re-init.

## How to do common things

**Change a step's wording** → edit `src/data/steps.feature.json` (or `.short`).
Keep `key` values untouched.

**Add a film / rule / director** → append to the JSON. Counts on the cover and in
the section heads derive, so they update themselves.

**Promote a bespoke widget** → `raw` blocks are elements the extractors couldn't
model (`char-map`, `pp-table`, `dept-grid`, `beat-viz`, …). They are re-inserted
verbatim, which is why nothing was lost in the migration. To promote one, add a
renderer to `BLOCKS` in `src/ui/steps.js`, convert the block in the JSON, and run
`npm run verify` — the data-key assertion will tell you if you dropped a field.

**Re-run extraction** → `npm run extract` reads `legacy/`, rewrites `src/data`,
self-checks coverage, and fixes the old page filenames. Safe to re-run; it is
deterministic (same input, byte-identical output).

## Open items

In rough priority order. The reasoning behind the ordering is in the revamp plan.

1. **Rename the storage keys** off `arunak_` with a migration. Blocked on a
   product name. Do it before more people have data, not after.
2. **Close the chain** — scene → shot → stripboard → day-out-of-days → call
   sheet. The single feature that would make this worth switching to. It needs a
   real scene model (INT/EXT, D/N, location, cast IDs, eighths) that the scene
   list, shot list, schedule and budget all read from; today they are four
   islands on the same page.
3. **AI, bring-your-own-key.** Key in `localStorage`, per-device, never synced.
   Anthropic's browser calls need `anthropic-dangerous-direct-browser-access`.
   The value is in-place work (dialogue passes, beat critique) using the
   blueprint as context — not a chat box.
4. **Script import** (`.fountain`, `.fdx`) and a proper screenplay PDF. Export
   exists; import does not, so the tool can't be used on a project in flight.
5. **Finish collaboration.** The comments API in `src/lib/cloud.js` is fully
   written — threads, suggestions, accept/reject — with no UI attached.
   Audit Supabase row-level security before real strangers hold share links.
6. **Refresh the Chennai rates** (currently 2024-25, shown with that date) and
   turn the festival list into a submission tracker.
7. First-run experience: a new user currently lands on a blocking "new project"
   modal in front of a wall of 24 steps.

## Things that are deliberate, not oversights

- `radius: 2px`. The studio is printed matter, not iOS.
- Sepia is a real third theme for long writing sessions, not a dark variant.
- Semantic colours (ok / warn / danger) are never one of the three volume hues.
- Supabase and `pptxgenjs` are lazy chunks; they must stay out of first paint.
- `legacy/` is committed on purpose. It is the test oracle.
