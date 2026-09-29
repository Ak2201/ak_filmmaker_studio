# The Filmmaker's Studio — working notes

Read this before changing anything. It is short on purpose; the parts that look
like fussy rules is there because breaking it has already cost a user their work
or silently broken a page.

## What this is

Browser-based tools for filmmakers — a hub, two step-by-step blueprints, a
reference library, and the scene-derived production modules built on top of
them (breakdown, stripboard, reports, contacts, visualize, write, plan). Local-first: everything a user writes lives in their
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
npm run density   # design-density report; measures, asserts nothing
npm run extract   # regenerate src/data/*.json from legacy/ and self-check
npm run icons     # regenerate PWA icons from tokens.css
```

`VITE_DISABLE_SW=1 npm run build` builds without registering a service worker —
for hosted previews that shouldn't outlive themselves in a cache.

## Layout

```
index.html feature.html short.html library.html   page entries (Vite MPA)
breakdown.html stripboard.html reports.html       the scene-derived views
contacts.html visualize.html write.html plan.html the rest of the 22 modules
arunak-*.html                                     redirect stubs for old URLs
src/
  data/      ALL content, as JSON. The asset. navigation.json is the IA.
             steps.feature.json is extracted from legacy/ and will be
             OVERWRITTEN by `npm run extract`; steps.production.json is
             hand-written and will not, because phases 03 and 04 never
             existed in the 2023 pages.
  lib/       store.js cloud.js dom.js pwa.js skin.js lang.js money.js
             scenes.js contacts.js shots.js script.js locations.js
             screenplay-export.js shotlist-export.js script-import.js ai.js
             ← one model per thing. Everything else is a VIEW of these.
  ui/        chrome.js (toolbar/theme/toasts) steps.js shell.js
             actionbar.js launcher.js
  styles/    tokens.css base.css chrome.css editorial.css widgets.css
             modules.css ← the design language, read by every page
             skins/      ← _contract.css + one file per swappable look
             print.css + one stylesheet per module page
  pages/     hub.js feature.js short.js library.js breakdown.js
             stripboard.js reports.js contacts.js visualize.js
             write.js plan.js
  sw.js      service worker (vite-plugin-pwa injectManifest)
scripts/
  extract/   the parsers that produced src/data — re-runnable, self-checking
  verify-migration.mjs   the gate
  density.mjs            the design-density report
  baseline.json          what verify diffs against
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

**3. `legacy/` is history, not the oracle.** The four original hand-written
pages. `npm run extract` still reads them to regenerate `src/data`, so they must
not be edited — but they are no longer what `npm run verify` diffs against.

They were the oracle through the migration and they earned it: they proved the
rebuild lost no `data-key` and no prose. Then they became a ceiling. Pinning the
app to 2023 markup meant every deliberate redesign had to be bought with
`EXPECTED` entries until the allowlist was the document and the check was noise.

`scripts/baseline.json` replaces them — see section 04. The first baseline was
captured from commit `16bf3b4`, which still passed 100% accounted coverage
against `legacy/`, so the original guarantee is inherited rather than discarded.
The file records the commit it came from.

Three of the four `legacy/` files also differ from `origin/main`: during the
migration the trap fixes below were applied to them so the two sides could be
compared like for like. Every one of those edits is inside a `<script>` block,
which the extractor strips, so they never affected verification.

**4. Colours, sizes and spacing come from `src/styles/tokens.css`.**
Every colour is a token. This rule previously claimed there were zero raw
colours outside that file; there were nine, and a claim nobody can verify stops
being enforceable. The real position, with the two intended exceptions:

- `src/styles/chrome-injected.css` — nine colour declarations (three hex, six
  `rgba()`). It is a verbatim port of the style string `studio-store.js` used to
  inject at runtime. The chrome surface is dark in *every* theme while
  `--danger` is not, so substituting tokens naively would cut contrast in paper.
  It wants a considered pass, not a find-and-replace.
- The palette picker's seed colours — `palette_c1..c3` in `src/pages/feature.js`
  and the matching swatches in `steps.feature.json`. `<input type="color">`
  requires a hex literal and these are the user's editable starting values.
  They are content, not design tokens. Leave them.

Anything else is a bug. To check:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\([0-9]' src --include=*.css --include=*.js | grep -v tokens.css
```

No `body.dark` rules: paper / sepia / ink are token swaps, and a rule that only
exists to restate a colour for dark mode is a bug. Tokens are declared in bare
`:root` first, then overridden under `prefers-color-scheme` and `[data-theme]` —
and the JS half has to hold up its end, which it did not for a while. See the
theme trap below.

**7. Shapes come from the skin, not from the rule that draws them.**
`src/styles/modules.css` is the design language every page reads. Nothing in it
hard-codes a radius, a padding, a border width, a display size or an italic:
each is a `--sk-*` variable, and a *skin* is one file in `src/styles/skins/`
that sets them. `skins/_contract.css` lists the variables and the four rules a
skin follows; `studio` is the default, `press` is the printed-matter look this
replaced, `binder` is flat and dense.

This is what makes the design swappable rather than merely changed, and it is
cheap to break: one `border-radius: 4px` typed into a rule is a shape one skin
can never override. Two things keep it honest —

- a skin is discovered, never registered. `skin.js` globs the directory and
  reads the picker back out of the CSSOM, so dropping a file in is the whole
  installation. The same reason the steps live in JSON: a hand-written list of
  what exists is wrong by the second change.
- `verify` asserts that every skin file on disk reached the page, that each
  produces a distinct look, and that none of them overflows at 390px.

Theme and skin are orthogonal: theme picks the palette, skin picks the shapes.
All nine combinations have to work, which is why a skin never writes a literal
colour — only `var(--token)`.

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
loads all four pages in Chromium, and diffs each against `scripts/baseline.json`:

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
- the three themes produce three distinct backgrounds. The stylesheets key off
  `:root[data-theme]`; when `applyTheme()` only set body classes every theme
  rendered identically and nothing above noticed, because the text, the keys and
  the handlers are all still correct on a page with the wrong palette.
- the skins: every file in `src/styles/skins/` reached the page, each produces a
  distinct set of `--sk-*` values, and none overflows at 390px. Three
  assertions rather than one because they fail differently — a skin that stops
  changing anything shows up as a duplicate fingerprint, but a skin whose file
  never loaded produces no duplicate at all, so only the disk-vs-page count
  catches it.
- **text meets WCAG AA (4.5:1)** on every surface a skin controls, across
  all four themes crossed with all five skins, with the modals open. The floor
  was 3.0 while the invisible cases were being cleared; it is 4.5 now, which is
  the real bar. Two rules came out of getting there and are worth knowing
  before you pick a colour:

  **A fill is not a text colour.** `--accent`, `--danger` and the six hues are
  chosen to be painted *behind* something. As text they run 3.3–4.4:1 on a
  light card in the brighter themes. Text takes `--accent-deep` / `--hue-deep`
  on a light ground and `--hue-lift` on a dark one. Most of the AA work was
  this one mistake in fourteen places, including every eyebrow in the app.

  **An inline style beats every stylesheet.** Three of the last four failures
  were `style="color: var(--accent)"` and `style="color: var(--paper)"` left in
  `feature.js` markup, silently defeating the token fix. If a token change does
  not take, grep the markup before you doubt the cascade.

- hue-coded surfaces still distinguish. Where the markup declares a variant
  (`.door.shorts`, `.start-card.f`, `.fest-card.t2`, `.example.alt`) the design
  must render more than one colour, at 3px or wider. This exists because the
  redesign's main move — folding decorative left rules into hairline cards —
  swallowed two groups that were carrying data, and the hub's three blueprints
  came out reading as two. No other check could see it: the keys, the words,
  the handlers and the overflow are all correct on a page whose colour coding
  has collapsed. The check keys off the *variant* rather than asking "do these
  differ?", so a group that is legitimately uniform is not flagged.

Then one studio-level check that is not per page:

- **a backup round trip** — two projects out, two projects back, contents
  matched. `export`/`import` is the only backup a local-first app has, and the
  per-page diff cannot see it: the hub's markup is identical whether the file
  holds every project or just the open one.

Current state: all four pages pass at 100% accounted coverage, and the round
trip restores both projects.

**Re-baselining.** `npm run baseline` recaptures `scripts/baseline.json` from the
current build. It is a deliberate act, not a fix for a failing run — the new
capture becomes the thing every later run is judged against, so a regression
baked in at that moment is invisible forever after. Re-baseline when a redesign
is intentional and the output is known good, and say so in the commit. If
`EXPECTED` is growing, that is the signal to re-baseline rather than to keep
adding rows.

**What the text check can and cannot see.** Coverage compares word *sets*, not
sentences. Deleting a sentence whose every word appears elsewhere on the page
will not trip it — that was equally true of the `legacy/` oracle. The `data-key`
check is the exact one, and it is the one that protects saved work: a renamed
key fails the run immediately.

**Known blind spot.** The run loads each page at 1280px and resizes to 390px
*afterwards*, so anything gated on `matchMedia` at load time has already decided
by then — the mobile action bar never attaches during a verify run and its
layout is untested. Check viewport-gated chrome by hand at 390px.

This is narrower than it was: overflow is now also measured at 390px *before*
a project is created, which is the only time the first-run panel exists. That
measurement is still a resize rather than a fresh load at 390, so it inherits
the same `matchMedia` caveat. Loading that one case directly into a 390px
context would close it properly.

**Running two verifies at once.** The server port is `VERIFY_PORT`, default
5321. Several worktrees of this repo can be live at the same time, and they
used to fight over it — badly enough that sessions began running
`lsof -ti:5321 | xargs kill -9` as a preamble, which SIGKILLs whoever
legitimately holds the port. Two runs died mid-Chromium that way and reported
it as "Target page, context or browser has been closed", which looks like a
flaky test and is not. Use `VERIFY_PORT=5322 npm run verify`; the run now says
so itself rather than crashing on `EADDRINUSE`.

**Checks that can skip themselves.** The hue-coding assertion reports each
group as passed, failed *or skipped*, because a group that never appears looks
exactly like one that passes if you only print the ones that ran. The
breakdown's chips exist only once a scene does, so the run seeds two scenes on
that page — after the text and key capture, so the empty state is still what
the baseline is compared against. Gating a check on something the bug itself
would remove is the trap here: the first version skipped the breakdown groups
whenever their class names were wrong, which is when they mattered.

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
- **Money parsing lives in `src/lib/money.js`, and the rule is NOT "anchor the
  suffix".** This entry used to say it was, which is how the second half of the
  bug survived the first fix.

  Unanchored, a bare `l` anywhere made "1 lens day" parse as ₹1,00,000; `cr`
  matched "crew", `k` matched "bank". Anchoring to `$` fixes those and is still
  wrong: `/(lakh|lac|l)$/` fires on "1500 per roll", because the last letter of
  "roll" is an l — a ₹1,500 line read as ₹15,00,00,000. That is worse than the
  bug it replaced, not better. Once every page shares one wrong parser the
  figures agree with each other, so nothing looks broken.

  The rule is a **whole-string match**: a suffix counts only when the entire
  string is a number followed by that suffix and nothing else. Anything with
  words in it falls through to the number at the front — "1500 per roll" is
  1500, "3 days" is 3, and "crew 500" is 0 because there is no leading number.

  **Four** pages carried their own copy at one time or another — `library.js`,
  `hub.js`, `feature.js`, `dashboard.js` — and they disagreed about identical
  stored data: one row read ₹4,600 in the library's calculator and ₹0.46 on the
  hub card beside it. Import `parseNum` / `fmtINR` from `money.js`. A local
  wrapper for *presentation* is fine — `feature.js` prints an em-dash where the
  rest of the studio prints ₹ 0 — but a local copy of the parse is not.

  The worst of those four is the instructive one: `dashboard.js` was written
  *after* `money.js` already existed, and still got a fresh copy, with a comment
  saying it should move into a lib "if this ever needs a third caller". It did.
  The copy outlived the note. A comment is not a constraint.

  Clearing it took three passes, because each pass grepped for the parser by the
  names it already knew and concluded from that that it was done. Grep for the
  behaviour instead; the magnitudes are the tell, and this finds every copy:

  ```bash
  grep -rn '10000000' src --include=*.js
  ```
- **Don't persist the same thing twice.** Scene rows were once written both as
  flat `sm_N_*` keys and inside a `_sceneMap` array; indices renumbered on reload
  and stranded stale keys that inflated the progress denominator forever. One
  representation per thing.
- **An empty array is truthy.** `loadData` checking `if (saved._sceneMap)` gave
  returning users a table with zero rows and no way to add one.
- **Chrome initialises at import time**, when `#app` is still empty. Pages call a
  re-init after render to rebuild the step rail, glossary popovers and aria
  labels. If you add render-dependent chrome, wire it into that re-init.
  `short.js` went a long time without one at all, which is why it had no step
  rail, no reading progress and eighteen unlabelled inputs while the other three
  pages were fine.
- **The storage proxy scopes "studio-wide" operations to the open project.**
  `store.js` patches `getItem`/`setItem`/`removeItem` to suffix every
  `SCOPED_KEYS` entry with the current project id. Anything in `hub.js` that
  reaches for one of those keys through `localStorage` therefore gets *one*
  project, however global its name. Export called itself "full studio backup"
  and contained a single film; reset promised "this erases EVERYTHING" and left
  the other projects on disk. When an operation really is studio-wide, iterate
  `listProjects()` and address each project explicitly through
  `rawGet`/`rawSet`/`rawRemove(key + '__' + id)`, which bypass the proxy.
- **`--hue` is set by a class, and the class has to exist.** Two families
  set it: `.sh-ph-*` maps a phase to its hue for the nav, and `.hue-*` names
  the hue directly for things whose colour is a *category*. `breakdown.js`
  wrote `.sh-ph-feature` and `.sh-ph-library` for its element chips — names in
  neither family, matching no rule — so `--hue` was never defined, the borders
  fell back to `currentColor`, and the page that introduced "colour = the
  category" rendered every category in grey from the day it shipped. Nothing
  noticed for two commits, because a CSS variable that is never defined fails
  silently by design. If you add a hue, add it in `tokens.css` and nowhere
  else.
- **A skin's defaults belong on bare `:root` too.** `studio.css` declares its
  `--sk-*` values on `:root` *and* on `:root[data-skin="studio"]`. Only the
  second looks necessary. The first is what makes the app correct before
  `skin.js` has run and when `localStorage` throws — without it every card on
  the page loses its border and its padding for the length of one paint. Same
  shape of bug as the theme trap below, one level up: the JS sets an attribute
  the CSS keys off, so the CSS has to be right when the JS has not run.
- **Sticky the navigation, not just the page's own bar.** For a while the shell
  (rail + phases) was `position: relative` and the page toolbar was `sticky`.
  Scrolling a 65,000px blueprint therefore discarded the bar that says *where
  you are* and kept the one that says *what you can do here* — the navigation
  layer existed only at the very top of the longest pages in the app. The shell
  is sticky at ≥1100px now and publishes its measured height as `--sh-h` for the
  toolbar to sit under. Below 1100px it still scrolls away on purpose: the two
  bars stack there, and 164px of chrome above a text field on a phone is worse
  than losing the nav. For the same reason `.toolbar` is `position: static`
  below 560px — wrapped to four rows and stuck, it was 391px, 46% of an 844px
  phone, permanently. What you need while typing is the fixed bottom action bar
  and the save indicator; the toolbar is one flick up.
- **The theme lives on `:root[data-theme]`, not on a body class.** `tokens.css`
  matches `[data-theme="light"|"sepia"|"dark"]`; `body.dark` / `body.sepia`
  match nothing. When `applyTheme()` set only the classes, all three themes
  rendered identically, a user who chose paper got ink on a dark-mode OS
  (nothing set `[data-theme="light"]`, so the `prefers-color-scheme` block won),
  and sepia was unreachable. `applyTheme()` stamps the attribute *first* —
  `documentElement` exists before `<body>`, so that also avoids a flash — and
  keeps the classes in the same call, because four pages still read them as
  state. `verify` asserts three distinct backgrounds now.

## How to do common things

**Change a step's wording** → edit `src/data/steps.feature.json` (or `.short`).
Keep `key` values untouched.

**Add a film / rule / director** → append to the JSON. Counts on the cover and in
the section heads derive, so they update themselves.

**Promote a bespoke widget** → `raw` blocks are elements the extractors couldn't
model (`char-map`, `pp-table`, `dept-grid`, …). They are re-inserted verbatim,
which is why nothing was lost in the migration. To promote one, add a renderer,
convert the block in the JSON, and run `npm run verify` — the data-key assertion
will tell you if you dropped a field.

Two places to put the renderer. A widget every blueprint could use goes in
`BLOCKS` in `src/ui/steps.js`. One that only a single page can render — because
it reads that page's data — is passed as the third argument to `renderSteps()`,
which merges page renderers over `BLOCKS`; that keeps the shared module from
importing a page's data. `short.js` does this for `beatviz` and `festgrid`.

Finish the conversion. Adding the renderer while leaving the `raw` block in the
JSON means the page builds the static markup, throws it away and replaces it —
two representations of one thing, and in the short film's case 5.2KB shipped to
be discarded.

**Change the look** → do NOT edit `modules.css` to make it darker, rounder or
denser. Write a skin: one file in `src/styles/skins/` setting the `--sk-*`
variables in `_contract.css`, and it appears in the Appearance menu on all five
pages with no other edit. Edit `modules.css` only to change the *language* —
what objects exist and how they are arranged — and when you do, every shape you
add must be a variable, or you have quietly made it unskinnable.

**Parse or print a rupee figure** → `src/lib/money.js`. `parseNum` for anything
a person typed, `fmtINR` for a glanceable magnitude, `INR.format` when the
number matters. Never write a second copy; see the trap above for what that
costs.

**Change the palette** → `tokens.css`, under `[data-theme]`. That is the other
axis; see invariant 7.

**Re-run extraction** → `npm run extract` reads `legacy/`, rewrites `src/data`,
self-checks coverage, and fixes the old page filenames. Safe to re-run; it is
deterministic (same input, byte-identical output).

## Open items

In rough priority order. The reasoning behind the ordering is in the revamp plan.

1. **Rename the storage keys** off `arunak_` with a migration. Blocked on a
   product name. This got more urgent, not less: there are now five scoped
   model keys rather than one, and every new one is another row in the
   migration that has to be written eventually. Do it before more people have
   data, not after.
2. **The chain is closed in both directions** — scene → breakdown →
   stripboard → day out of days → call sheet, all reading
   `src/lib/scenes.js`, and now the budget reads it too: the library's
   calculator derives shoot days, scenes, pages and locations from the scene
   model rather than asking for a day count the user already worked out.
   `USE N DAYS IN THE ESTIMATE` fills only the day fields left blank and says
   how many it left alone — a hand-set figure is a decision, not a gap. This
   was the open item that justified the whole rebuild and it is done.
3. ~~**AI, bring-your-own-key.**~~ Done, for one job: drafting a shot
   division from the script. `src/lib/ai.js`, key at `arunak_ai_key_v1`
   through `rawGet`/`rawSet`/`rawRemove` so the storage proxy cannot scope
   it, absent from all five registries (`SCOPED_KEYS`, `PROJECT_KEYS`,
   `ALL_KEYS`, the Supabase scope list, and `GLOBAL_KEYS` — that last one
   is what `export-all` walks, and it is the one most easily missed).
   `connect-src` in `vercel.json` and `netlify.toml` names
   `api.anthropic.com`; without it the browser refuses the request.
   Two independent gates: no key, and no script.

   What is left of this item is the rest of the value: in-place work on
   the writing itself — dialogue passes, beat critique — using the
   blueprint as context. Still not a chat box.
4. ~~**Script import and a proper screenplay PDF.**~~ Done.
   `src/lib/script-import.js` reads `.fountain`, plain screenplay text and
   `.fdx` (via `DOMParser`, no dependency) and fills BOTH the script
   elements and the scene model — an import that fills only the editor
   leaves the breakdown, stripboard, budget and reports empty, which is
   half a job. Nothing is written before a preview; Replace takes a
   revision first. `src/lib/screenplay-export.js` paginates properly, so
   `(MORE)`/`(CONT'D)` and page numbers are correct.

   Known gaps, small: `.fdx` `Number="12"` attributes are not read (a
   number inside the heading text is), and the plain-text parser is
   heuristic — it round-trips our own export exactly, but a third-party
   `.txt` may need a type corrected by hand.
5. **Finish collaboration.** The comments API in `src/lib/cloud.js` is fully
   written — threads, suggestions, accept/reject — with no UI attached.
   Audit Supabase row-level security before real strangers hold share links.
6. **`--ink-faint` fails the 4.5:1 floor, and the gate cannot see it.**
   `.bd-stat span` measures 2.53–2.76:1 in desk; `.bd-el-scenes` and
   `.bd-el-cat` are also under. Two agents found this independently on
   four different pages, so it is app-wide, not local. The reason it is
   invisible is the more important half: `.bd-stat`, `.hero-stat`,
   `.hub-stat-strip` and `.bd-el` are not in the contrast probe's
   `SURFACES` list in `verify-migration.mjs`, so the stat strip — which
   is on seven pages — has never been contrast-checked at all. Widen the
   probe FIRST, then fix what it finds; fixing the colour first would
   leave the hole open.

7. **Refresh the Chennai rates** (currently 2024-25, shown with that date) and
   turn the festival list into a submission tracker.
8. ~~First-run experience.~~ Done. The hub no longer opens the new-project
   modal on a timer; the empty grid renders a first-run panel instead — what
   the studio is, three destinations that need no project at all, then the
   ask, plus a sample project that seeds a logline, a theme and four scenes
   across two shoot days so the blueprint, breakdown, stripboard and budget
   all have something to show. What is *not* done is the wall of 24 steps
   behind it: a new project still opens on step 1 of 24 with no sense of
   which ones matter first. That is a steps problem, not a hub problem.

## Things that are deliberate, not oversights

- `radius: 2px`. The studio is printed matter, not iOS.
- Sepia is a real third theme for long writing sessions, not a dark variant.
- Semantic colours (ok / warn / danger) are never one of the three volume hues.
- Supabase and `pptxgenjs` are lazy chunks; they must stay out of first paint.
- `legacy/` is committed on purpose — now as the historical record and as the
  input `npm run extract` parses, not as the verification oracle.
