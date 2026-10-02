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

The prefix is `fms_`. It was `arunak_` until the rename, which happened as one
deliberate pass with a migration — `migratePrefix()` in `src/lib/store.js` —
exactly as this note used to demand. If you rename keys again, copy its five
properties rather than its code: raw, not through the proxy (or you rename the
open project's data and silently skip every other project); prefix-only (so the
`__<projectId>` suffix and the open-ended `note_` family come along without
being enumerated); set, verify, then remove (never delete the old value until
the new one reads back); never clobber; and idempotent with the marker written
last, so a run killed halfway finishes on the next load.

`npm run verify` fails if `arunak_` survives anywhere outside that migration. A
half-finished rename is the worst outcome available here: the app writes one
prefix and reads the other, so a field saves and never comes back, and nothing
looks wrong until somebody reopens a project.

The rename deliberately did NOT touch the middles. `fms_library_calc_v1` still
says `library` although the estimator now lives on `budget.html`. Renaming a
middle is a second migration, and hiding it inside the first is how a rename
turns into data loss.

**There are now TWO scoping dimensions, and no key was renamed to get the
second one.** Keys were already suffixed per project (`fms_scenes_v1__<id>`).
Accounts are scoped by a `ns` field on each entry in `fms_studio_projects_v1` —
absent or `[""]` means this device signed out, `["<uid>"]` an account, both
means adopted — so `listProjects()` filters and data separation follows from
list separation: a project id only exists to be suffixed if the open namespace
can see it. Blob keys are byte-identical to before, which is why signed-out
studios need no migration and none was written. The one new key form is the
per-namespace pointer: bare `fms_studio_current_project_v1` stays the device
pointer, an account uses `…@<uid>`. `fms_studio_account_v1` holds the identity
and is deliberately in NONE of the five registries — `GLOBAL_KEYS` most of all,
because that is what `export-all` walks and an account id inside a backup would
make another machine claim to be somebody. Full reasoning in
`docs/STORAGE-MODEL.md`.

**The second dimension put the studio-wide trap straight back.** `exportAll()`
and `resetAll()` in `hub.js` were built from `listProjects()`, which now filters
by account too — so the backup would again have called itself a full studio
backup while holding one namespace, and "this erases EVERYTHING" would have left
every account-only project on disk. Both read `listAllProjects()` now, and reset
uses `purgeProjectEverywhere()`, which exists for that one caller because
`deleteProject()` is namespace-scoped on purpose: deleting a film inside your
account must not reach the copy on the device. `resetAll()` also sweeps
`currentPointerKeys()`, since `ALL_KEYS` only knows the bare pointer name.
Proved by script, both directions: a backup containing both namespaces, and a
reset leaving nothing but an empty list. Widening the export is only safe
because the importer does not carry `ns` across — it passes id/title/format to
`createProject`, which stamps the importing namespace, so a backup taken signed
in restores visibly when signed out.

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

**The oracle cannot hold a clock, and there are two of them.** Anything the
pages compute from today's date varies without anybody editing copy, so it is
removed from *both* sides rather than allowed. The hub's greeting is a fixed
word set (`CLOCK`). The short film's festival countdowns are not: they are
numbers, and which numbers depends on when the baseline was captured. A
baseline taken on 29 September failed on the 30th with `13 unexplained missing
words (108, 119, 131, 134, 162, 198)` — all 13 a bare integer from
`festivals.checks.json` counting down, or, for a deadline already past,
counting up. `COUNTDOWN` in the verify script derives them from that same file
at the baseline's own `capturedAt` and at now, and excludes only the tokens
that differ, so "in", "days" and "ago" keep their coverage.

If this recurs, the two obvious fixes are both wrong. An `EXPECTED` entry names
integers that are stale tomorrow — and the anti-rot check then fails the run for
stale allowances, so it would need editing daily. `npm run baseline` goes green
until midnight. Neither is a redesign, and no copy went missing: check whether
the missing words are all bare integers before reaching for either.

**The service worker is a second blind spot, and it shipped a broken page.**
The run's Chromium has no service worker, so nothing in `verify` exercises the
worker, its precache or its fetch handler — and a route sweep cannot either,
because HTTP is not where it fails. A `.html` URL that 404s nowhere and returns
200 to `curl` can still be ERR_FAILED in a browser that has the worker
installed. See the redirected-response trap below. Check one `.html` URL in a
real browser after any change to `sw.js`, `vercel.json` or the page entries.

**Known blind spot.** The run loads each page at 1280px and resizes to 390px
*afterwards*, so anything gated on `matchMedia` at load time has already decided
by then — the mobile action bar never attaches during a verify run and its
layout is untested. Check viewport-gated chrome by hand at 390px.

This is narrower than it was: overflow is now also measured at 390px *before*
a project is created, which is the only time the first-run panel exists. That
measurement is still a resize rather than a fresh load at 390, so it inherits
the same `matchMedia` caveat. Loading that one case directly into a 390px
context would close it properly.

**Only its WIDTH is measured, though — none of its COPY is.** The text and
`data-key` capture runs *after* `createProject()`, because the blueprints will
not scope storage without a project, and creating one replaces the first-run
panel with the project grid. So every word on that panel is outside
`baseline.json` entirely: `renderFirstRun()` can say anything, drift any
number, or lose a sentence, and the hub still reports 100% coverage. That is
how `Twenty-two modules` sat two behind the data — nothing was ever going to
notice. The flip side is that editing that panel produces **no** gate fallout,
so an `EXPECTED.hub` row for a word removed from it is stale the moment it is
written, and the anti-rot check fails the run for it (proved: the run reports
`stale allowlist entries: twenty-two`). Read the panel in a browser; the gate
cannot.

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
- **A nav target must not depend on data existing.** `navigation.json` sent the
  Breakdown phase to `breakdown.html#scenes` and `#elements`, Reports to
  `#reports` / `#sides`, the Stripboard to `#stripboard` / `#dood` — and all six
  ids lived only on the POPULATED branch of those pages' `render()`. On a studio
  with no scenes the fragment resolved to nothing and the browser stayed put, so
  the phase menu looked broken to exactly the person who had never opened the
  page. 6 of the 18 fragment hrefs in `navigation.json` were absent from the
  DOM, in both the no-project and the project-without-scenes states.

  The ids now sit on wrappers that always render, with the empty state inside
  the one it belongs to; `renderElements()` needed nothing, because it already
  kept its id and carried its own copy when the index was empty — which is the
  pattern the other two were missing. Same family as the `--hue`-class trap and
  the skin-defaults trap below: something the markup promises has to be there
  before the data or the JS arrives, and a CSS variable, a shape and a fragment
  target all fail silently by design when it is not.

  `verify` does not check this and still does not: it loads each page at its
  URL without a fragment, so it cannot tell whether an anchor resolves. The
  check that would catch it is 18 fragment loads across the empty,
  project-only and seeded states — 0 missing and 0 obscured is the bar, and
  both halves matter, because `scroll-padding-top` and the id's existence are
  two different bugs with one symptom. `shell.js`'s own `fragmentTargets()` spy
  was silently inert on those three pages for the same reason.
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
- **A service worker must never answer a navigation with a *redirected*
  response.** Chrome refuses it — "a redirected response was used for a request
  whose redirect mode is not 'follow'" — and shows **ERR_FAILED**. This one cost
  a day of looking in the wrong place, because every tool that is not a browser
  says the site is fine: `/dashboard.html` returned 308 → `/dashboard` → 200 with
  the right title under `curl`, the page was deployed, and `/dashboard` worked
  the whole time. Only the typed `.html` form failed, and only in a browser that
  had the worker installed.

  `vercel.json` sets `cleanUrls`, so `/page.html` answers with a 308 to `/page`.
  That made **21 of the 68 precached URLs redirects** — every HTML page,
  `index.html` among them, so the offline shell was broken the same way. Three
  things then had to be true at once, which is why it survived review:

  - `fetch()` follows the 308 and resolves **200**, with `redirected: true`.
  - `Cache.put` and `cache.addAll` **both accept** that response. Neither
    throws. Do not assume otherwise — the guess that atomic `addAll` would fail
    the install was wrong, and checking it against the real host is what
    corrected the diagnosis.
  - the guard was `response.type === 'basic'`, which is **also true of a
    followed redirect**, so nothing filtered the tainted copy.

  So the poison went in quietly at install and surfaced only on a later
  navigation. `clean()` rebuilds a response without the flag on the way INTO
  the cache; `precacheAll()` replaces `addAll` to get that rebuild while keeping
  its atomicity (`Promise.all` rejects on the first failure); `matchUsable()`
  treats an already-tainted entry as a miss **and deletes it**, so an affected
  browser heals on its next load — "clear your site data" is not an instruction
  you can give someone who is just trying to open a page.

  `cleanUrls` is deliberately left ON: the worker is now correct against any
  host, which is the durable fix. If you add a redirect rule, a rewrite, or a
  new page entry, nothing needs changing — but if you ever put `addAll` back, or
  cache a response without `clean()`, this returns exactly as before. The
  `arunak-*.html` stubs are excluded from the precache outright: their whole job
  is to 301, and an old bookmark is what the network is for.

  **`verify` cannot see this, and neither can a route sweep.** Both were green
  throughout — verify because its Chromium context has no service worker, and a
  sweep because HTTP was never the problem. The commit before this one reported
  "all 15 production routes return 200" and was correct and useless. Check a
  `.html` URL in a real browser with the worker installed.

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

1. ~~**Rename the storage keys.**~~ Done. The prefix is `fms_`;
   `migratePrefix()` in `src/lib/store.js` runs first in `init()` — before
   `migrateLegacy()` and before the storage proxy is installed, because the
   proxy would have scoped the rename to the open project. 137 string
   literals across 26 files.

   Proved on a seeded pre-rename studio rather than assumed: every value
   survived, including the `__<projectId>` suffixes, private notes, theme
   and the AI key; zero old keys left; idempotent across three consecutive
   loads. The one real breakage path was backups — project buckets are keyed
   by field name and survive untouched, but `notes` stores RAW key names, so
   both importers (V1 and V2) now map `arunak_note_*` forward. Tested with a
   real exported file rewritten to the old prefix.

2. **The chain is closed in both directions** — scene → breakdown →
   stripboard → day out of days → call sheet, all reading
   `src/lib/scenes.js`, and now the budget reads it too: the library's
   calculator derives shoot days, scenes, pages and locations from the scene
   model rather than asking for a day count the user already worked out.
   `USE N DAYS IN THE ESTIMATE` fills only the day fields left blank and says
   how many it left alone — a hand-set figure is a decision, not a gap. This
   was the open item that justified the whole rebuild and it is done.
3. ~~**AI, bring-your-own-key.**~~ Done, for one job: drafting a shot
   division from the script. `src/lib/ai.js`, key at `fms_ai_key_v1`
   through `rawGet`/`rawSet`/`rawRemove` so the storage proxy cannot scope
   it, absent from all five registries (`SCOPED_KEYS`, `PROJECT_KEYS`,
   `ALL_KEYS`, the Supabase scope list, and `GLOBAL_KEYS` — that last one
   is what `export-all` walks, and it is the one most easily missed).
   `connect-src` in `vercel.json` and `netlify.toml` names
   `api.anthropic.com`; without it the browser refuses the request.
   Two independent gates: no key, and no script.

   The rest of it is done too: dialogue passes and beat critique, in
   place, gated twice, sharing one `callModel()` fetch/stream/abort path
   with the shot division rather than a third copy. A model cannot tell a
   writer they wrote something they did not — a quotation that is not word
   for word is stripped and counted.

   All three callers now go through `src/ui/ai-panel.js`. visualize.js
   was the last holdout — it carried a hand-copied key form and key bar,
   the third copy the module exists to prevent, and it is gone: the page
   keeps the shot half (pick / run / stop / undo) and the module owns the
   key, the bar, the gates and the disclosure. A page-local mirror of
   "does a key exist" is what goes stale, so there isn't one any more;
   the module asks `ai.js` at render time and pages redraw on
   `onAIChange`.
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
5. ~~**Finish collaboration.**~~ Done, with residuals that matter.
   `src/ui/comments.js` attaches a thread to a FIELD, not a character
   offset — the text under a note is about to change. Accepting a
   suggestion dispatches a bubbling `input`/`change` from the field itself,
   so the page's own save path, its derived widgets and the cloud push all
   run in their usual order; the row is marked accepted only after the
   value lands.

   `docs/SECURITY-RLS.md` holds the audit. It found three high-severity
   holes, each of which the UI actively lied about: a share link could not
   be revoked or expired (claiming one wrote a *permanent* collaborator
   row, and revoke deleted the token while the access stayed); an `edit`
   collaborator could move the project into an account they owned and then
   delete that account, cascading the whole project away; and a view-only
   link handed over the crew's email addresses, because comments stamped
   the signed-in email into `author_name`. Fixed in an appended schema
   section, along with comment-status forgery, replies cascading away with
   a deleted parent, and three account-tier escalations.

   **What is left is not small: the audit is STATIC.** `supabase-schema.sql`
   has still never run against a database, and the doc ends with ten live
   checks needing two real accounts. Also open — share tokens are stored in
   plaintext (a product call: the owner's "re-copy this link" depends on
   it), and Supabase Realtime could not be verified statically, because
   DELETE payloads are documented as not RLS-filtered the way INSERT and
   UPDATE are.

   `claim_invite()` now EXISTS — schema section 11, wired in `cloud.js`,
   with nine live checks written into `docs/SECURITY-RLS.md`. It has never
   been executed against a database, so it closes the gap on paper only.
   The credential is deliberately the EMAIL, not a token: an `owner`/`admin`
   row is read by `has_project_access()` and grants `edit` on every project
   in the account with no collaborator row, so a forwardable bearer string
   conferring that would be the most dangerous credential in the system.
   Google is the only sign-in, so the address is attested rather than typed.
   An `owner`-role invite is deliberately not claimable; invite as `admin`
   and promote.

   **The RECEIVING end is done and the SENDING end is not, which is the
   bigger half.** Nothing in any UI inserts a pending `account_members` row
   and `cloud.js` has no account-tier reads, so an invite has to be typed
   into the SQL editor by hand. An Account panel — list members, invite by
   email, revoke — needs no new SQL at all: `am_select` already permits
   owner/admin to read and `am_write` already permits them to insert. Until
   it exists, `claim_invite()` is a door with nothing on the other side.
   Also still open from the audit's A6: an invitee cannot SEE an invite
   before claiming (`am_select` matches on `user_id`, null while pending),
   so the flow auto-joins on sign-in with no preview and no decline.

6. ~~**`--ink-faint` fails the 4.5:1 floor, and the gate cannot see it.**~~
   Done, and the second half of it is the part worth keeping.

   `--ink-faint` is no longer a text colour anywhere. It clears 4.5:1
   against **no ground in any theme** — 4.13:1 at best on the ink
   theme's sunk card, 2.34:1 at worst on Desk's — and it could not be
   retuned, because raised far enough to clear AA it lands on
   `--ink-muted`. It was misnamed rather than mistuned: "faint"
   described how it looked, and what it encoded was "below the
   legibility floor". All 41 `color:` rules now take `--ink-muted`
   (worst case 4.54:1); the token survives for borders, swatches and
   hover lines, where a 3:1 hairline is a correct hairline. **The ink
   hierarchy is three deep now, not four** — `--ink`, `--ink-body`,
   `--ink-muted`. Two kinds of secondary text are told apart by size,
   weight or case, not by a fourth grey nobody can read.

   Two more went with it: `--rule`/`--rule-hair` as text (1.2–1.8:1),
   and `--print-rule` as text on the screenplay preview (3.54:1), which
   is why `--print-muted` now exists.

   **The probe no longer walks a list.** `SURFACES` is gone; the AA
   check walks every leaf text node in `main`, the open modals and the
   shell, across 4 themes × 5 skins × every page, and every model is
   seeded on every page first — an empty page has nothing to walk, and
   a wholesale walk of an empty state is a list by another name. A
   second source check greps for `color:`/`fill:` on the four hairline
   tokens, the same shape as the fill-as-text check beside it, because
   a grep sees files no test page renders. Verdict at the time of
   writing: zero findings, from 173.

   What is still unmeasured, so nobody mistakes the walk for total
   coverage: page state this run does not reach, and `::before` /
   `::after` content, which is not a text node.

7. **Chennai rates — partly done, and the remainder is a sourcing problem
   rather than a coding one.** Camera bodies are verified against a Chennai
   rental house and tagged CHECKED with a link and a date. Everything else
   — every lens, light, grip, sound and post item, and all eleven crew
   rates — is unchanged and now reads NOT UPDATED, because no Chennai rate
   card for any of it is published anywhere reachable.

   The crew section is the interesting one: **there is no current union
   floor to quote, because none exists.** The 2022 FEFSI–TFPC wage MoU
   expired 9 March 2025, was never replaced, and is in Madras HC mediation.
   That absence, cited, is worth more to a producer than a two-year-old
   number presented as a rate.

   Two traps for whoever picks this up. Do NOT apply an inflation
   multiplier to close the gap — the overlay says so in its own `method`
   field. And the 2026 vendor figures run about 3x BELOW the 2024-25
   ranges, probably body-versus-package but unconfirmed, so both are shown:
   replacing a market range with one vendor's list price would make a
   filmmaker under-budget threefold.

   The festival list is now a submission tracker that **enforces** the
   never-premiere-before-a-rejection rule rather than printing it.

   **The IFFI finding is closed, and it was a real deadline error.** The
   entry used to say no short-film category was visible; a short does
   have a route, and it is Indian Panorama's Non-Feature section, not
   the International Competition. Its deadline was 10 August 2026 for
   the online form and 17 August for the stamped hard copy — three
   weeks EARLIER than the 31 August FilmFreeway date the overlay showed
   as the single "Regular deadline". A Chennai filmmaker reading that
   one as theirs missed the festival by three weeks. Both routes are
   now listed with the route in the label, because the fix is telling
   them apart rather than picking one. Indian Panorama is also a postal
   submission to NFDC Mumbai, not an upload.

   **MAMI still looks dormant** and still needs a human — unchanged.

   Two things learned while re-checking, both now enforced by the file:
   a festival carries the date ITS OWN entry was read, because
   re-checking four of eighteen used to restamp the other fourteen as
   fresh (the card read the file's single `lastChecked`); and an
   aggregator listing is not a source. Aspen is the case for the
   second — its own site publishes no next-edition dates while
   secondary listings happily do, so the entry stays `not-checked` and
   says why, which `not-checked` entries can now do because that
   branch renders its notes.

   A deadline may also be marked `seedable: false` — listed on the card
   but never seeded into a submission. Clermont-Ferrand needs it: its
   National competition closes AFTER both International dates, so the
   soonest future deadline on that festival is French-productions-only
   and tracking it would have counted down to a deadline the user
   cannot enter.

   ~~Still owed: `src/ui/budget.js` prices off the 2024-25 figures only.~~
   Done, and the second half of it is the part worth keeping. Reading the
   overlay was the easy half and was already finished; the estimator then
   showed the CHECKED figure *instead of* the band, which walked straight
   into the 3x trap named two paragraphs above. Alexa Mini hinted ₹8,000
   against a 25,000–35,000 card, Komodo ₹4,500 against 15,000–22,000 — a
   filmmaker anchored to the hint under-budgets the biggest line in the
   shoot threefold. `rateHint()` now shows **both**, names the multiple
   when the gap is material, and says the checked figure is one vendor's
   list price that may be body-only. Where they agree — FX6, 4,000 against
   a 4,000–7,000 band — there is no warning, because there is nothing
   wrong. It only ever hinted, never autofilled, which is why this was a
   misleading note rather than a wrong total.

   The library had this right all along by rendering the check rows BESIDE
   the card row instead of over it. The estimator is the page people type
   numbers into, and it was the one replacing — worth remembering next time
   a fix means "make page B agree with page A".

   `budget.html`'s own provenance line was the same fault in prose: it
   asserted every preset was 2024-25 while the hints underneath it showed
   2026 dates. It counts the overlay now instead of asserting.

8. ~~First-run experience.~~ Done. The hub no longer opens the new-project
   modal on a timer; the empty grid renders a first-run panel instead — what
   the studio is, three destinations that need no project at all, then the
   ask, plus a sample project that seeds a logline, a theme and four scenes
   across two shoot days so the blueprint, breakdown, stripboard and budget
   all have something to show. The wall of 24 steps behind it is handled
   too: a ten-step spine, and for each step the thing IN THIS APP that
   reads its answers, derived from `src/data/steps.priority.json` rather
   than hand-listed. The filter can never strand you on a hidden step —
   jumping or searching to one turns it off and says why.

## Things that are deliberate, not oversights

- `radius: 2px`. The studio is printed matter, not iOS.
- Sepia is a real third theme for long writing sessions, not a dark variant.
- Semantic colours (ok / warn / danger) are never one of the three volume hues.
- Supabase and `pptxgenjs` are lazy chunks; they must stay out of first paint.
- `legacy/` is committed on purpose — now as the historical record and as the
  input `npm run extract` parses, not as the verification oracle.
