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
npm run test:pdf  # PDF text extraction, in Node, no browser (~1s)
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
             screenplay-export.js shotlist-export.js script-import.js
             pdf-text.js ai.js
             ← one model per thing. Everything else is a VIEW of these.
  ui/        chrome.js (toolbar/theme/toasts) steps.js shell.js
             actionbar.js launcher.js palette.js
  styles/    tokens.css base.css chrome.css editorial.css widgets.css
             modules.css ← the design language, read by every page
             palette.css ← the command palette's own sheet
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
replaced, `binder` is flat and dense, `console` is the flat application,
`mission` is a condensed broadsheet, and `atelier` is the soft-edged daily tool
— serif display over a system sans, real elevation, pill buttons. Six.

The contract gained five variables with Atelier, and the reason is rule 4 of
the contract itself: `--sk-card-shadow-hover`, `--sk-lift`, `--sk-press`,
`--sk-field-radius`, `--sk-focus-w`. A skin that wanted a hover elevation and a
press scale needed a selector in `modules.css` to get them, which is the
definition of a missing variable. All five fall through to studio's defaults
and all five are polarity-neutral, so unlike the six slab variables a skin may
safely set none of them.

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
  all four themes crossed with all six skins, with the modals open. The floor
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
by then. Check viewport-gated chrome by hand at 390px.

The mobile action bar used to be the headline example of this and is no longer:
it LISTENS to the media query instead of sampling it, so it attaches and
detaches as the viewport crosses 720px and a verify run's resize now produces
one. That was a real bug as well as an untested path — a phone turned to
landscape kept a bar that no longer fitted, and a page loaded in landscape never
got one at all. Its height is measured and published as `--mab-h`, because the
`padding-bottom: 64px` that reserved space for it is less than a 48px row plus
padding plus `env(safe-area-inset-bottom)` on any phone with a gesture bar, and
the last control on every long page sat underneath it.

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
- **A sticky bar and no `scroll-margin` is a jump that lands behind it.**
  Nothing in the app set `scroll-margin` and two bars are sticky above the
  content — the shell at `--sh-bar-h`, the page toolbar under it. The browser
  scrolls a fragment target to y=0, and y=0 is behind both. So the step rail,
  `j`/`k`, the glossary links, `#elements`, every fragment the breadcrumb
  resolves and the skip link itself delivered you to a heading you could not
  see, with the first two lines of the thing you asked for under the chrome. It
  was never reported as a scrolling bug because it reads as the page landing in
  the wrong place. `--scroll-offset` in `tokens.css` is the fix and it is
  computed, not guessed: `--sh-stick-h` and `--tb-h` are published by the two
  owners, each asking `getComputedStyle().position` rather than restating a
  breakpoint, so the offset is zero for a bar that is not pinned at this width
  and correct when the bar wraps to two rows at 390px. The heights are
  measured TWICE, once for layout and once after `document.fonts.ready`, for
  the same reason `shell.js` already did: a bar measured in the fallback face
  is a bar measured at the wrong height.
- **`--motion` is a multiplier on DISTANCE, and it needs to be.** `base.css`
  clamps every duration to 0.01ms under `prefers-reduced-motion`, which stops
  things taking time but does not stop them travelling — a card that teleports
  six pixels is still a card that moved, and the jump is the part that matters
  to a reader with vestibular sensitivity. Every translate and scale in the
  app is written `calc(<distance> * var(--motion))` and the same media query
  sets `--motion: 0`. If you add a transform, multiply it.
- **A toast with an action must not time out.** 3.2s is right for a notice you
  only have to read and wrong the moment it carries a button, because the
  button is the only route to what it offers: an "Undo delete" that vanishes
  after three seconds is an undo that anyone reaching it by Tab, or reading it
  with a screen reader, will routinely miss. An actionable toast now stays
  until dismissed or acted on and grows its own close control; every toast
  pauses its countdown on hover and on focus. Errors go to a second host with
  `role="alert"` rather than the polite one — the politeness is bound when a
  live region enters the accessibility tree and several readers never re-read
  it, so flipping `aria-live` on one element does not work.
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
pages with no other edit. If the shape you want is not a variable yet, ADD THE
VARIABLE to `_contract.css` — that is rule 4, and Atelier's five additions are
what following it looks like. Edit `modules.css` only to change the *language* —
what objects exist and how they are arranged — and when you do, every shape you
add must be a variable, or you have quietly made it unskinnable.

**Add something to the command palette** → usually nothing. `src/ui/palette.js`
derives its index: modules and global entries from `navigation.json`, skins
from `skin.js` reading the CSSOM, themes from `StudioUI.themeOrder()`, projects
from `listProjects()`, and scenes and contacts from their own models. A module
added to `navigation.json` is searchable with no edit here, which is the same
rule that keeps the steps in JSON. A genuinely new KIND of thing gets a
function returning `entry({…})` objects; a new MODEL goes in `loadContent()`,
which is dynamically imported on first open so none of it is in any page's
first paint.

Two things it must not do. It must not write to storage — `verify` asserts zero
`localStorage` writes across four idle seconds, and a map that recorded its own
opening would trip it, correctly. (Recents are in memory for the session and
deliberately do not survive it; the alternative was a new key in a contract
that holds months of people's work, bought for a reordered list.) And a row's
hue class must come from the right family: `.sh-ph-*` for a phase, `.hue-*` for
a category. A phase id written as `hue-develop` matches neither rule in
`tokens.css`, `--hue` stays undefined and the row falls back to the accent
without an error — the breakdown shipped exactly that for two commits.

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

   **PDF too.** It is the format a script actually arrives in and it
   had no reader. `src/lib/pdf-text.js` turns a PDF back into indented
   text and PARSER 2 reads it — a PDF has no element types in it, what
   it has is POSITIONS, and in a screenplay the position IS the type
   (cue at 3.7in, parenthetical at 3.1in, dialogue at 2.5in, action at
   1.5in). Those are the columns `parseText()` has always read, so
   there is no second classifier and no second place for the two to
   disagree.

   **No library, and that is three decisions rather than a shortcut.**
   `script-src 'self'` with no `worker-src` means a blob: worker — how
   most bundled PDF engines start — is refused by the browser; a
   megabyte outside the service worker's manifest is an import that
   works at the desk and fails on location; and this needs one thing
   from a PDF, which is where each run of text sits.
   `DecompressionStream('deflate')` is native and is the piece that
   used to require one.

   **The refusals are the feature.** Encrypted, scanned, and
   subset-fonts-with-no-ToUnicode-map are each detected and declined
   with a sentence saying what to do instead, because an extractor
   that half-works produces mojibake and mojibake imported into
   somebody's script is worse than an import that stopped.
   `npm run test:pdf` builds real PDFs — compressed, packed in object
   streams, Type0/Identity-H — and asserts the columns survive. 43
   assertions, no browser, no dependencies, ~1s. It found two bugs
   while being written and the first is the one to know:
   **DecompressionStream throws on ANY trailing byte, and the spec
   says the EOL before `endstream` is not part of the stream** — so
   every writer emits one and nothing compressed decoded at all.

   Known gaps, small: `.fdx` `Number="12"` attributes are not read (a
   number inside the heading text is); the plain-text parser is
   heuristic — it round-trips our own export exactly, but a
   third-party `.txt` may need a type corrected by hand; and the PDF
   reader assumes a monospaced advance within a run, which is every
   screenplay and not every PDF.
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
   it), there is no `claim_invite()` so account invites cannot be claimed
   at all, and Supabase Realtime could not be verified statically, because
   DELETE payloads are documented as not RLS-filtered the way INSERT and
   UPDATE are.

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
   shell, across 4 themes × 6 skins × every page, and every model is
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
   never-premiere-before-a-rejection rule rather than printing it. Two
   findings need a human: MAMI looks dormant (its own page still
   advertises 2024), and IFFI Goa's listing shows no short-film category
   although the blueprint sends shorts there.

   Still owed: `src/ui/budget.js` prices off the 2024-25 figures only — it
   imports the base file and not the overlay.

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

9. **The interaction pass.** A command palette, a sixth skin, a motion
   scale and a set of state fixes. Four of these are worth knowing about
   because they changed shared machinery rather than one page:

   - `src/ui/palette.js` + `palette.css` — ⌘K / Ctrl-K over the whole
     studio. Wired once in `chrome.js`, so every page has it; a handle in
     the shell bar (`.sh-find`) makes the binding visible, because a
     shortcut nobody has been told about is a feature that does not exist
     for most people. It is the combobox pattern, not a div with a keydown
     handler: focus stays in the field and the active row is named by
     `aria-activedescendant`, which is the one mechanism that reports a
     selection the focus did not move to. The handle hides below 720px —
     the bottom action bar carries SEARCH there, and at 375px the handle
     wrapped the shell bar to a third row, which is ~300px of chrome above
     the first word of the page.
   - `--scroll-offset`, `--motion`, the four-step speed scale and
     `--ease-spring` in `tokens.css`; see the traps above for the first two.
   - `base.css` gained the document-level interaction rules: `touch-action:
     manipulation` on controls (never on the body — disabling pinch-zoom is
     a WCAG failure), 44px minimum targets under `pointer: coarse` only,
     `accent-color` so native checkboxes and ranges stop being the
     browser's blue on a sepia page, themed scrollbars, `text-wrap: pretty`
     on prose and `overflow-wrap: anywhere` with the `min-width: 0` that
     makes it actually work on a flex child.
   - `actionbar.js` menus answer to the arrow keys, Home and End, return
     focus to the button that opened them, and treat Tab as one stop rather
     than eight. `role="menu"` is a promise, and it was not being kept.

   **Gate run, on Node 22.** All fifteen pages: 720 `data-key`s present and
   0 lost, 100% accounted coverage everywhere but `short`, 0 idle writes, 0
   horizontal overflow at 390px, 6/6 skins distinct and reaching every page,
   0 console errors, 0 low-contrast findings from the AA walk across 4
   themes x 6 skins with the modals open, and the backup round trip
   restoring both projects.

   **The verify run's clock is frozen, and it has to be.** The short
   blueprint's step 10 prints live countdowns to real festival deadlines
   — "Short film registration: 2026-11-04 — in 33 days" — through
   `relativeDays()` in `src/lib/festivals.js`. The baseline records the
   words a page renders, so the text check on `short` failed on every day
   except the one the baseline happened to be captured on: twelve missing
   numeric words, each exactly as many less than its recorded value as
   there were days since capture, allowlist clean, no explanation.

   A gate that cries wolf daily is a gate people learn to run with
   `--baseline`, which is exactly how a real regression gets captured as
   the new truth. `page.clock.setFixedTime()` pins it, and the context is
   pinned to UTC alongside — `todayISO()` reads the LOCAL calendar date,
   so an instant near midnight would render a different day depending on
   where the machine is and the gate would pass in Chennai and fail in
   California.

   `setFixedTime` rather than `clock.install()` on purpose: it fixes what
   `Date` reports without pausing timers, and the idle-write assertion
   waits four REAL seconds. A fully faked clock would have skipped that
   wait and asserted nothing — a check that silently stops checking is
   worse than the flake it replaced.

   Three things about `FROZEN_CLOCK` worth knowing before you touch it:

   - **The date was chosen to be the then-current baseline's capture
     date**, so the twelve countdowns already in the file are the ones
     this clock renders. The fix therefore cost no re-baseline, and that
     is also how it was proved: the run went green against the unchanged
     `baseline.json`.
   - **It is still checked, not excluded.** Moving the constant seven days
     forward fails `short` with 13 missing words. The countdown text has
     deterministic coverage now; it did not lose coverage.
   - **Changing it is a re-baseline event**, and `baselineFacts()` refuses
     a baseline whose recorded `clock` differs, naming the real cause
     instead of reporting missing words. A baseline with no `clock` field
     predates the freeze and is accepted, because the frozen date is that
     capture's date.

   No production code changed for any of this. A date seam in
   `festivals.js` would have been a test hook in a module that already
   parameterises `fromISO` everywhere — the harness is the right place to
   decide what "now" means during a run.

   **Three things the browser found that static checks could not:**

   - `requestAnimationFrame` does not run in a background tab, and every
     measured height in the chrome was published from inside one. A page
     opened in a background tab — open-in-new-tab, a restored session, a
     PWA cold start — had no `--mab-h`, no `--tb-h` and no `--sh-stick-h`
     until it was looked at, so the anchor offset was zero and the body
     reserved a 64px fallback for a 69px bar. All three now measure
     synchronously first, with the rAF kept as the post-font refinement.
     `getBoundingClientRect()` forces layout and works while hidden.
   - The hub already bound ⌘K to its own hero search and labelled the
     field with it, so on `index.html` both handlers fired: the palette
     opened AND the field behind its scrim took focus. The key belongs to
     the palette, which answers the same everywhere; the hub's field keeps
     `/`, which `chrome.js` already bound, and its badge says so now.
   - The focus timer is `position: fixed; bottom: 16px` at `--z-float`,
     one above the action bar, so at 375px on a blueprint it covered the
     END button completely. The save indicator and the toast host had
     already been lifted above the bar and the timer had not — when a
     bottom bar exists, the list of floats to lift has to be all of them.

## Things that are deliberate, not oversights

- `radius: 2px`. The studio is printed matter, not iOS.
- Sepia is a real third theme for long writing sessions, not a dark variant.
- Semantic colours (ok / warn / danger) are never one of the three volume hues.
- Supabase and `pptxgenjs` are lazy chunks; they must stay out of first paint.
- `legacy/` is committed on purpose — now as the historical record and as the
  input `npm run extract` parses, not as the verification oracle.
