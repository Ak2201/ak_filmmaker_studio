# FilmMakerStudio — working notes

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

**And since 5 Oct 2026 the website is INVITE-ONLY, by the owner's decision.**
`src/lib/sitegate.js` (imported by `chrome.js`, so on every reachable page)
hides the document until the gate answers and sends anyone not through it —
signed out, or signed in without membership — to `invite.html`. A valid
invite CODE is a key on its own: it enters with no sign-in, is remembered in
that browser (`fms_invite_code_v1`, in `ALL_KEYS`, in no backup) and
re-verified each browser session; every code is also a link,
`invite.html#code=…`, that the console copies. This reverses
"the gate guards the cloud, never local work", which older notes below still
say; read those as history. Local work is HIDDEN from a visitor outside the
gate, never deleted or touched. Two builds follow from it: `npm run build` has
the gate on (what the hosts run); `npm run build:open` turns it off and is the
only build `npm run verify` accepts, because verify loads every page signed
out. `prove:gate` refuses the open build. `docs/GATE.md` §0.

## Commands

```bash
npm install
npm run dev       # vite dev server, no service worker
npm run build     # static output in dist/ — the site gate ON
npm run build:open  # the same with VITE_SITE_GATE=off; what verify needs
npm run preview   # serve the build (exercises the real service worker)
npm run verify    # ← the important one, see below; refuses a gated dist
npm run test:pdf  # PDF text extraction, in Node, no browser (~1s)
npm run test:story       # story model + .docx reader, in Node (open item 11)
npm run test:screenplay  # screen time, cast matrix, auto-tag, 120pp < 1200ms
npm run test:post        # the edit log and deliverables derivations (item 13)
npm run prove:drive # Drive backup, against a faked Drive — see open item 10
npm run prove:gate  # invite gate, device lock, admin, screening room (item 11)
npm run build:extension   # the Chrome extension, into dist-extension/
npm run prove:extension   # the unpacked extension in Chromium (item 11)
npm run test:billing      # the Razorpay helper: HMACs, prices, paise (item 12)
npm run test:schema       # the WHOLE schema on a real PostgreSQL + 48 §16 checks
npm run prove:billing     # a purchase end to end against a faked Razorpay (item 12)
npm run density   # design-density report; measures, asserts nothing
npm run extract   # regenerate src/data/*.json from legacy/ and self-check
npm run icons     # regenerate PWA icons from tokens.css
```

`VITE_DISABLE_SW=1 npm run build` builds without registering a service worker —
for hosted previews that shouldn't outlive themselves in a cache.

## Layout

```
index.html feature.html short.html library.html   page entries (Vite MPA)
invite.html                                       the doorway: where a closed
                                                  gate lands a sign-in — and,
                                                  now, every visitor who is not
                                                  through it
admin.html                                        the application console
breakdown.html stripboard.html reports.html       the scene-derived views
contacts.html visualize.html write.html plan.html the rest of the 22 modules
shoot.html                                        the on-set day view
edit.html deliverables.html                       Post-Production: the suite's
                                                  view of the shoot, and the
                                                  checklist of what leaves
story.html                                        the Story stage (PRD 2.0)
screening.html                                    a screening pass's read-only room
extension/                                        manifest template, background
                                                  worker, side panel entry
privacy.html terms.html refund.html               the legal documents
arunak-*.html                                     redirect stubs for old URLs
src/
  data/      ALL content, as JSON. The asset. navigation.json is the IA.
             steps.feature.json is extracted from legacy/ and will be
             OVERWRITTEN by `npm run extract`; steps.production.json is
             hand-written and will not, because phases 03 and 04 never
             existed in the 2023 pages.
  lib/       readiness.js  ← what is missing before this film can shoot,
                           derived at render time and stored nowhere
             shootday.js   ← the one view that WRITES BACK to a scene
             editlog.js    ← the cut's word on each scene, and what is
                             still owed; reads shotState, never writes it
             deliverables.js ← state against src/data/deliverables.json,
                             festival formats joined from festivals.js
             account.js    ← the account tier's sending end
             store.js cloud.js dom.js pwa.js skin.js lang.js money.js
             scenes.js contacts.js shots.js script.js locations.js
             screenplay-export.js shotlist-export.js script-import.js
             pdf-text.js ai.js scriptgen.js songs.js
             backup.js  ← the backup FORMAT: one builder, one applier,
                          and the PROJECT_KEYS / GLOBAL_KEYS maps that
                          used to sit in hub.js
             drive.js drive-sync.js ← Drive, and when to talk to it
             story.js ← synopsis, marks, tension; the mapping, heatmap
                        and pacing flags are DERIVED, never stored
             screenplay-analysis.js ← screen time, cast matrix,
                        auto-tag suggestions; pure, stores nothing
             gate.js ← invite codes, invite requests, the device lock,
                       screening passes, the console's counts
             sitegate.js ← the website-wide gate; see §0 of docs/GATE.md
             extension-bridge.js ← the app's half of the extension
             docx-text.js pitch-deck.js watermark.js
             ← one model per thing. Everything else is a VIEW of these.
  ui/        chrome.js (toolbar/theme/toasts) steps.js shell.js
             actionbar.js launcher.js palette.js
             tabs.js ← a page's sibling sections as tabs, on the twelve
                       pages it names; hash picks the tab, nothing is
                       removed from the DOM (the gate reads innerHTML)
             gate-ui.js invite-request.js ← the gate's two faces: the
                       code box + admin console, and the request block
                       invite.html and the extension panel both draw
  styles/    tokens.css base.css chrome.css editorial.css widgets.css
             modules.css ← the design language, read by every page
             palette.css ← the command palette's own sheet
             skins/      ← _contract.css + one file per swappable look
             print.css + one stylesheet per module page
  pages/     hub.js feature.js short.js library.js breakdown.js
             stripboard.js reports.js contacts.js visualize.js
             write.js plan.js
  sw.js      service worker (vite-plugin-pwa injectManifest)
docs/KNOWN-ISSUES.md  bugs found and not yet fixed — check it first
docs/UX-AUDIT-2026-10-06.md  the full UI/UX audit, ranked by severity
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

**`PROJECT_KEYS` and `GLOBAL_KEYS` live in `src/lib/backup.js` now, not in
`hub.js`.** They are the backup file's own schema, and the file has a second
reader and a second writer since Drive sync landed. `ALL_KEYS` stayed on the
hub, because that one is the reset list.

**`fms_drive_sync_v1` is the third key that is deliberately out of
`GLOBAL_KEYS`**, for the same shape of reason as the account id: it points at
one Drive file on one device, so a backup carrying it would make the machine
that restored it start pushing its own studio into the first machine's file. It
IS in `ALL_KEYS`, unlike `fms_ai_key_v1` — reset must disconnect Drive, or a
wiped studio stays pointed at a file full of work and the next keystroke
uploads the emptiness over it. Reset never deletes the Drive file.

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
Every colour is a token. **The palette is violet, and the default is INK** —
a near-black ground with a violet cast. The light theme (`paper`) is the
alternate and is described below as the ground most of this section's worked
examples were measured against: a lavender-tinted page,
plain white surfaces, and `--brand` — a seventh hue beside the six that mean a
phase — for the product's own voice. `[data-volume="studio"]` points `--accent`
at it, which is the one line that paints the hub.

Two tokens exist because the surfaces under them moved, and both are worth
knowing before you reach for a near neighbour:

- **`--brand` is not `--visualize`.** The six hues are held apart by the gate
  because each means a phase. The brand means the product, so the day visualize
  shifts to tell itself apart from plan is not the day the primary button
  changes colour.
- **`--chrome-accent` is not `--panel-gilt`.** The nav band is **white in the
  light theme** and near-black in the dark one, so the accent on it cannot be
  the dark slab's. Eight rules in `chrome.css` used `--panel-gilt` for this and
  were correct for exactly as long as chrome and panel were both dark; the day
  the band went white it measured 1.5:1.

**`--panel` and the slab are now two different things.** They used to be one,
which is why `_contract.css` has a long warning about widgets on the slab
reaching past `--sk-slab-*` for `--panel-ink`: the two agreed, so the mistake
was invisible. They no longer agree.

- **`--panel` is the FLOATING family** — toast, tooltip, glossary popover,
  phase menu, focus timer, the sync instructions' code block. Dark in both
  themes, deliberately: a dark surface over a light page is how a temporary
  thing reads as temporary. `--panel-gilt` is its accent and points at
  `--brand-lift`, so an overlay never wears a phase's colour.
- **`--sk-slab-*` is the IN-PAGE family** and it follows the theme. The phase
  bands, the formula boxes, the step checks, the resume and data cards, the
  budget summary, the pitch slide, the final page, the library's contents
  cards. A brand-washed tint: lavender in light, deep violet in dark, reached
  through ordinary page tokens rather than a second palette.

That is why nothing in a slab takes a `*-lift` colour any more. A lift is a hue
mixed for a ground that is dark *in every theme*, and the slab is not one —
`--accent-deep` already resolves to the lifted value inside
`[data-theme="dark"]`, so one token is right on both. If you add a slab widget,
colour it from `--sk-slab-*` or from `--ink` / `--ink-muted` / `--accent-deep`,
never from `--panel-*`.

This rule previously claimed there were zero raw colours outside `tokens.css`;
there were nine, and a claim nobody can verify stops being enforceable. There
is now **one** intended exception, because the other one closed:

- ~~`src/styles/chrome-injected.css` — nine colour declarations.~~ Gone. That
  entry justified them: the chrome surface was dark in every theme while
  `--danger` was not, so naive substitution would have cut contrast in paper,
  and it wanted a considered pass rather than a find-and-replace. The band is
  white now, which turned the exception into a bug — `#f5ecd6` on `#ffffff` is
  1.09:1 — so the considered pass happened, forced rather than volunteered.
  Every value reads the chrome family; the no-project state reads
  `--danger-wash` under `--danger` instead of three hand-mixed alphas of one
  hex; the hard-coded 10px and 1.5px track went with them.
- The palette picker's seed colours — `palette_c1..c3` in `src/pages/feature.js`
  and the matching swatches in `steps.feature.json`. `<input type="color">`
  requires a hex literal and these are the user's editable starting values.
  They are content, not design tokens. Leave them.

**A second AI provider was added without a second request path.** Gemini
sits beside Anthropic through the same `callModel()`, with a provider table
supplying the host, the key shape, the model list and the console link, and
one key form in `ai-panel.js` for both. Three things there fail as "the
model is broken" rather than as themselves: Anthropic streams LF frame
separators and Gemini CRLF, so the splitter must accept both; a Gemini
`thought` part concatenated into the text makes every JSON parse fail; and
Gemini answers a bad key with **400 + `API_KEY_INVALID`**, not 401, which
status alone cannot tell from a malformed request.

THE KEY GOES IN A HEADER. Gemini's API also accepts `?key=` on the query
string — do not use it. A key in a URL is a key in browser history, in proxy
logs and in any error report that captures a URL. And `connect-src` in
**both** `vercel.json` and `netlify.toml` must name a new provider's origin
in the same commit, or the browser refuses the request before it leaves.

Anything else is a bug. To check:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\([0-9]' src --include=*.css --include=*.js | grep -v tokens.css
```

No `body.dark` rules: paper / sepia / ink are token swaps, and a rule that only
exists to restate a colour for dark mode is a bug. Tokens are declared in bare
`:root` first (the DARK palette, since ink is the default), then overridden
under `@media (prefers-color-scheme: light)` for the un-chosen state and under
`[data-theme]` for an explicit choice —
and the JS half has to hold up its end, which it did not for a while. See the
theme trap below.

**7. Shapes come from the skin, not from the rule that draws them.**
`src/styles/modules.css` is the design language every page reads. Nothing in it
hard-codes a radius, a padding, a border width, a display size or an italic:
each is a `--sk-*` variable, and a *skin* is one file in `src/styles/skins/`
that sets them. `skins/_contract.css` lists the variables and the four rules a
skin follows.

**There is ONE skin: `studio`.** `press`, `binder`, `console`, `mission`,
`atelier` and `bright` were deleted when the violet look landed, and that was a
deliberate narrowing rather than an oversight — seven looks meant seven sets of
every shape decision to keep correct across every theme, and the AA walk is
themes × skins × pages, so each one is a standing cost in the gate as well as
in the design. The brief was one identity. They are in the history if a menu of
looks is ever wanted back, and nothing had to be unregistered to remove them:
`skin.js` globs the directory, so deleting the file IS the uninstallation.

The variables all stay, because `modules.css` is written against them and a
hard-coded shape is a shape nothing can ever override. With one skin the
contract is the single source of this design rather than a switchboard.

Five of those variables arrived with Atelier and outlived it, which is rule 4
of the contract working: `--sk-card-shadow-hover`, `--sk-lift`, `--sk-press`,
`--sk-field-radius`, `--sk-focus-w`. A skin that wanted a hover elevation and a
press scale needed a selector in `modules.css` to get them, which is the
definition of a missing variable. All five are polarity-neutral, so unlike the
six slab variables a skin may safely set none of them.

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
- every theme produces a distinct background. The assertion counts themes
  rather than naming three of them, and reads the list from `themeOrder()` in
  the app, so dropping one or reordering them needs no change here. There are
  **two now, and `ink` is the default** — which is FOUR places in
  `chrome.js` — `THEME_ORDER`'s first entry, `currentTheme()`'s fallback,
  `loadTheme()`'s fallback branch, and `applyTheme()`'s
  `CSS_THEME[theme] || …`. This list said THREE until the flip back to ink
  found the fourth, which is the easy one to leave behind because it only
  fires for a theme name absent from `CSS_THEME` altogether. All four have to
  agree with whichever palette the bare `:root` in `tokens.css` carries. They
  have now disagreed in both directions; each time the picker said one thing
  and the page rendered another.

  **AND THE GATE CANNOT SEE HALF OF IT.** verify's Chromium runs the page's
  scripts, so all four fallbacks could be flipped back and the run would stay
  green as long as they agreed with each other — the bare `:root` half is
  invisible to it. The check that sees it is a scripts-off probe: load the
  built page in an iframe with `sandbox="allow-same-origin"`, assert no
  `[data-theme]` is set and the ground is already the default theme's. That is
  about fifteen lines and is not in the gate; it was run by hand for the flip
  to ink, and it is how "no flash of the wrong palette" is actually
  established.

  The check exists because the stylesheets key off `:root[data-theme]`: when
  `applyTheme()` only set body classes every theme rendered identically and
  nothing above noticed, because the text, the keys and the handlers are all
  still correct on a page with the wrong palette.
- the skins: every file in `src/styles/skins/` reached the page, each produces a
  distinct set of `--sk-*` values, and none overflows at 390px. Three
  assertions rather than one because they fail differently — a skin that stops
  changing anything shows up as a duplicate fingerprint, but a skin whose file
  never loaded produces no duplicate at all, so only the disk-vs-page count
  catches it.
- **text meets WCAG AA (4.5:1)** on every surface a skin controls, across
  every theme crossed with every skin, with the modals open. The run counts
  what exists rather than naming a number of each, which is why dropping two
  themes and six skins needed no change here — it is two and one now. The floor
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

- **`--f-script` keeps its Tamil face LAST.** The screenplay stack names
  Noto Sans Tamil because Courier Prime ships `latin`/`latin-ext` only and
  no monospaced Tamil font exists. Google serves that family as three
  `@font-face` blocks — tamil, latin-ext, latin — so the family claims
  Latin too: put it before `'Courier New'` and it becomes the first
  *available* font on every page that never loaded Courier Prime, and
  takes every glyph. Measured, a slug line went from 600px of Courier New
  to 534px of proportional sans. Nothing errors and nothing overflows —
  the fixed-width grid `pageCount()` is arithmetic on has simply stopped
  being fixed-width. The check asserts a Tamil family is present and sits
  after the last Courier family.

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

**Only its WIDTH is measured, though — none of its COPY is.** The text and
`data-key` capture runs *after* `createProject()`, because the blueprints will
not scope storage without a project, and creating one replaces the first-run
panel with the project grid. So the panel contributes **nothing** to
`baseline.json`: `renderFirstRun()` can say anything, drift any number, or lose
a sentence, and the hub still reports 100% coverage. That is how
`Twenty-two modules` sat two behind the data — nothing was ever going to
notice.

Be precise about what that does and does not mean, because the obvious
shorthand is wrong. Plenty of the panel's words ARE in the hub's baseline —
`modules`, `film`, `script`, `browser`, `desk`, `call`, `sheet` — put there by
the launcher and the cover, not by the panel. What is true is the one-way half:
a word that appears ONLY on the panel can never be in the baseline, so no edit
to the panel can ever produce a missing word. The gate's silence is structural,
not a measurement that happened to pass.

The flip side is that editing that panel produces **no** gate fallout, so an
`EXPECTED.hub` row for a word removed from it is stale the moment it is
written, and the anti-rot check fails the run for it (proved: the run reports
`stale allowlist entries: twenty-two`). Read the panel in a browser; the gate
cannot. The number it quotes was wrong twice for this reason — first stale, then
derived from the total instead of the built count — and both times every check
was green.

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
  is sticky at ≥1100px now and publishes its measured height for the page to
  sit under. Below 1100px it still scrolls away on purpose, because chrome above
  a text field on a phone is worse than losing the nav — measured at its worst,
  a stuck toolbar wrapped to four rows was 391px, 46% of an 844px phone,
  permanently. What you need while typing is the fixed bottom action bar and the
  save indicator; the nav is one flick up.

  **THERE IS ONE BAR NOW, so the stacking half of this is history.** The four
  original pages each built their own `.toolbar` under the shell's bar;
  `adoptPageTools()` in `shell.js` moves that element INTO `.sh-bar` as a
  right-hand zone, and the page's section links fold into a SECTIONS disclosure
  on the breadcrumb. The eleven module pages never had a second bar and are
  untouched. The trap above is still the lesson — pin the layer that says where
  you are — but "the two bars stack" describes a layout that no longer exists.

  Two things about that move are worth keeping. It relocates the **element**,
  not its children: ids survive either way, but `chrome.js`'s `autoInit`, the
  four pages that use `.toolbar` as the host for the sign-in pill and the
  Appearance menu, the `.toolbar .btn` chrome-palette rules, `print.css` and a
  live reference in `library.js` are all keyed off the element, and dropping it
  would have broken every one of them quietly. And the links are **harvested**
  from `a.nav-link[href^="#"]` rather than listed, so `shell.js` still names no
  page and no section.
- **`var(--radius)` in a component is as unskinnable as `4px` was.** The rule
  everyone remembered was "do not type a literal radius into `modules.css`".
  The one nobody did was that reaching for the raw TOKEN is the same bug with
  better manners: `--radius` is a fixed token, `--sk-radius` is what a skin
  sets, and 80 rules across eleven stylesheets took the first one. That is
  about forty per cent of the radii in the app, and the symptom is a skin that
  works on the surfaces somebody happened to check — the hub's first-run cards
  stayed at 2px under a 20px skin and looked like a rendering fault rather
  than a missing variable. All 80 now read
  `var(--sk-radius, var(--radius))`, which is a no-op for every existing skin
  because `studio.css` set `--sk-radius: var(--radius)` **at the time** —
  it sets `16px` now, so those 80 rules are the reason the redesign took
  effect on all of them at once instead of on the forty per cent somebody
  remembered. Which is the argument for the rule, arrived at the hard way
  from the other side. The 14
  `var(--radius-pill)` uses are left alone: a pill is a shape with a meaning,
  not a radius with a value. If you add a surface, it takes `--sk-radius`.
- **A sticky bar and no `scroll-margin` is a jump that lands behind it.**
  Nothing in the app set `scroll-margin` and the chrome above the content is
  sticky. (It was two bars when this was written — the shell and the page
  toolbar under it; it is one band now, and the fix is the same either way
  because the band is MEASURED rather than assumed.) The browser
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
- **The baseline contains derived counts, so adding a module fails it.**
  The launcher prints "N of M ready" per phase from `navigation.json`.
  Adding the Songs module took Breakdown from "6 of 6" to "7 of 7", so the
  word `6` left the hub and `verify` reported an unexplained missing word
  on a page nothing had edited. It is allowed in `EXPECTED.hub` with that
  reason. Every future module will collide the same way; this is the shape
  of problem the CLOCK exclusion solves properly, and the counts cannot be
  excluded the same way without blinding the check to every digit on the
  page. Past two or three such rows, re-baseline instead.

- **A font family covers more than you asked it for.** Adding Noto Sans
  Tamil to `--f-script` to get Tamil glyphs also handed it every Latin
  glyph, because the family ships latin subsets as well and Courier Prime
  is not loaded on the eleven module pages — only `index`, `feature`,
  `short` and `library` request any webfont at all. CSS fallback is per
  glyph, which is what makes the mixed document work, but it only skips a
  family that has *no* glyph. Order the stack so the narrow-coverage face
  is last. `verify` asserts it now.

- **A measured number is only as good as its last measurement, and twice it
  was not.** `--sh-chrome-h` is the pinned band's height, derived by
  `measureChrome()` from whatever is actually sticky, and it feeds the one
  `scroll-padding-top` in the app — so a wrong value here is every fragment
  jump in the studio landing in the wrong place, which reads as a scrolling
  bug and never as a chrome bug.

  - **It counted the step rail as a band.** The rail is 220px wide, 804px tall
    and anchored left; half a 390px viewport is 195px, so it passed the
    "is this wide enough" test. The band measured **868px** on both blueprints
    at 390px. A candidate must straddle the horizontal centre, which is the
    test the existing comment already claimed to apply.
  - **It went stale.** Controls arrive in the band after the last scheduled
    measure — the sign-in pill from the lazy cloud module, the Appearance menu
    swap, the switcher label. On feature at 1280 the band settled at 102px
    while the published value stayed 146px, and nothing had resized so the
    resize listener never fired. A rAF-throttled `MutationObserver` on
    `.sh-bar` fixes it, and it writes custom properties on `<html>` —
    outside the observed subtree, so there is no notification loop. That is
    the distinction the note warning off a `ResizeObserver` was reaching for.

- **When two rules tie, order decides, and order is not where you wrote it.**
  Three instances, all of them a state or an override losing to a rule declared
  later in the same or a later-imported sheet: `.search-hit` under
  `.meta-field input`; `.sh-plate`'s narrow-width un-pinning under
  `.sh-plate { position: sticky }` ~430 lines below it, which left 38px of
  brand plate pinned on every phone AND fed it into `--sh-bar-h`; and
  `.phase .label`, which is why that override lives in `modules.css` rather
  than `editorial.css`. The fix always lives where it cannot be ordered out —
  a doubled class, or the end of the section — never where it reads best. A
  dead CSS rule is bad enough; a dead CSS rule feeding a measured number is
  how it becomes arithmetic.

- **A token declared once on bare `:root` has only the DEFAULT theme's
  value**, and a palette swap is when you find out which tokens those are.
  Two families were declared in one place because every theme agreed about
  them, and both broke the moment the themes stopped agreeing:

  - the **chrome** family. `--chrome`, `--chrome-hair` and `--chrome-fill`
    differed per theme and were overridden; `--chrome-ink`, `--chrome-muted`
    and the two `-strong` variants were inherited, because the band was dark
    in every theme. Flipping the light theme's band to white would have given
    the dark theme a white band carrying white text. All seven are stated in
    both blocks now.
  - the **brand** family, WHICH HAS NOW FIRED TWICE, IN OPPOSITE
    DIRECTIONS — which is the strongest argument the rule could have, so
    both are kept. First, with light as the default: `--brand-deep` is the
    brand as text and stayed at the light theme's `#5b21b6` on every dark
    page — the gate measured
    1.95–2.1:1 on the shortcut sheet's heading, the budget's eyebrow and the
    dashboard's inline link. It reached all three through one hop:
    `[data-volume]` is declared *after* `[data-phase]` in `tokens.css`, so
    `studio` wins and `--accent-deep` **is** `--brand-deep` on thirteen pages.

    Then, flipping back to ink: the same three tokens lived only on bare
    `:root` with the LIGHT values while dark restated them, so moving the
    base would have handed the LIGHT theme `--brand-deep: #b69bfb` — a violet
    mixed to sit on near-black — as its link colour, its eyebrow colour and
    `--chrome-accent`, on white. The light block states its own four now.

  The tell is a token whose value is a hex rather than a `var()` sitting
  outside a `[data-theme]` block. The AA walk catches it, which is how these
  were found rather than shipped — and note that WHICH THEME IS THE DEFAULT IS
  NOT A FIXED FACT, so "it inherits correctly" is only ever true of the
  arrangement you are looking at.

  `color-scheme` belongs to this family too, and was missed both times: it was
  only on the two `[data-theme]` blocks and the media query, never on bare
  `:root`, so a form control, a scrollbar and a native date picker painted
  their light-mode UA chrome on a near-black page until the JS ran. CSS cannot
  restyle those, which makes it the one flash no palette fix can cover.

- **A card inside the slab is not a card on the page.** `--sk-slab-fill`
  exists for an inset surface ON the slab, and the stat strip needed it the
  day it stopped being a ruled band and became a row of cards: the slab sets
  `color` on itself and two rules in `widgets.css` opt the numbers back into
  `--sk-slab-ink`, which is correct only while the item has no surface of its
  own. Give it a white one and the number renders at 1.14:1 — the same
  "number gone, label dim" failure those rules were written to fix, arrived at
  from the opposite direction.

- **The theme lives on `:root[data-theme]`, not on a body class.** `tokens.css`
  matches `[data-theme="light"|"sepia"|"dark"]`; `body.dark` / `body.sepia`
  match nothing. When `applyTheme()` set only the classes, all three themes
  rendered identically, a user who chose paper got ink on a dark-mode OS
  (nothing set `[data-theme="light"]`, so the `prefers-color-scheme` block won),
  and sepia was unreachable. `applyTheme()` stamps the attribute *first* —
  `documentElement` exists before `<body>`, so that also avoids a flash — and
  keeps the classes in the same call, because four pages still read them as
  state. `verify` counts the themes rather than naming a number of them, so
  it asserts two distinct backgrounds now and would assert five without an
  edit.
- **`Element.append(null)` inserts the text "null".** It does not skip
  the argument. `settings.js` said it did, and that held only while every
  section happened to render something. `h()` skips null children, but
  the native method does not. Filter first.
- **`ensureClient()` raced itself.** It checked `if (supabase)` and then
  awaited the SDK import, so the boot and a page calling it in the same
  tick each built a client: two GoTrue clients on one storage key, both
  refreshing and both firing auth events. The in-flight promise is
  shared now. Any lazy singleton behind an `await` needs the same.
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
variables in `_contract.css`, and it appears in the Appearance menu on every
page with no other edit — the picker is read back out of the CSSOM, so there is
no list to add it to. (With one skin shipping, the picker has one entry; a
second file is what makes it a choice again.) If the shape you want is not a
variable yet, ADD THE VARIABLE to `_contract.css` — that is rule 4, and the
five variables Atelier left behind are what following it looks like. Edit `modules.css` only to change the *language* —
what objects exist and how they are arranged — and when you do, every shape you
add must be a variable, or you have quietly made it unskinnable.

**Tabs, not scrolling (owner, 6 Oct 2026).** `src/ui/tabs.js` turns the
top-level `section[id]` siblings of a page into tabs — a strip pinned under
the shell, one section shown, the rest `hidden` — on an explicit list of
twelve pages: settings, admin, library, study, dissect, breakdown,
stripboard, reports, contacts, visualize, write, plan. The list is a UI
decision, not a derivation: the two blueprints are a reading flow with a
step rail, the hub is the landing page the gate drives, invite.html is two
routes meant to be read together, story.html is its editor. The hash picks
the tab (deep links and the phase menu's `page.html#frag` land right; an
in-page link to another section switches to it), `replaceState` keeps the
back button honest, and a hand-dispatched `hashchange` keeps the crumb in
step. Labels: `data-tab-label` on the section, else the navigation.json
module whose fragment is the id, else the section's heading. Re-applied by
a MutationObserver because settings and admin replace `main` on every
render. **A proof that targets a section inside a hidden tab reaches it by
hash** (`admin.html#billing`), not by scrolling — three proofs were edited
for exactly that.

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

2. **The chain is closed in both directions** — and now it also runs
   BACKWARDS, which it never did. scene → breakdown →
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

   A fourth job is in: **a synopsis becomes a script.**
   `src/lib/scriptgen.js` owns the job, `ai.js` owns the three calls
   (`draftBeatSheet`, `draftSceneList`, `draftScenePages`) and the
   writing still lands in `script.js` and `scenes.js`. It is staged
   because it has to be: a Tamil feature is 60,000-120,000 output
   tokens against a 32,000 ceiling, so one call cannot do it and a
   call that tries is billed up to the cut. Stage 2 commits the SCENE
   MODEL before any pages exist, so the breakdown, stripboard, budget
   and reports light up even if stage 3 never runs — the same lesson
   `script-import.js` learned. A cursor makes it resumable, because a
   run that dies at scene forty must not re-bill thirty-nine scenes.

   The honest part: screenplay page maths is 55 lines of fixed-width
   Courier, so the default mode keeps Tamil in the DIALOGUE and leaves
   slugs and action in English — which is what Tamil crews shoot from
   anyway, and the only arrangement where the page count stays
   arithmetic. Tamil-throughout is offered and labels its page count an
   estimate rather than printing a number the grid cannot support.

   All three earlier callers go through `src/ui/ai-panel.js`. visualize.js
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

   **The SCHEMA HAS NOW RUN; the AUDIT is still static.** This note said for
   a long time that `supabase-schema.sql` had never met a database, and that
   stopped being true without anybody updating it — which is the failure mode
   this file exists to avoid. All seven tables are live on the project
   `conhlrulxfwkhsnymakz`, sections 11 and 12 (`claim_invite`, the scriptgen
   and songs scopes) included, and the SQL file itself records the two runs.
   What has NOT happened is the live half of the audit: `docs/SECURITY-RLS.md`
   ends with ten checks needing two real accounts, and none of them has been
   executed. Also open — share tokens are stored in
   plaintext (a product call: the owner's "re-copy this link" depends on
   it), and Supabase Realtime could not be verified statically, because
   DELETE payloads are documented as not RLS-filtered the way INSERT and
   UPDATE are.

   `claim_invite()` now EXISTS — schema section 11, wired in `cloud.js`,
   with nine live checks written into `docs/SECURITY-RLS.md`. The function is
   deployed, but none of those nine checks has been run against it, so its
   BEHAVIOUR is still only argued rather than observed.
   The credential is deliberately the EMAIL, not a token: an `owner`/`admin`
   row is read by `has_project_access()` and grants `edit` on every project
   in the account with no collaborator row, so a forwardable bearer string
   conferring that would be the most dangerous credential in the system.
   Google is the only sign-in, so the address is attested rather than typed.
   An `owner`-role invite is deliberately not claimable; invite as `admin`
   and promote.

   **BOTH ENDS EXIST NOW.** `src/lib/account.js` and
   `src/ui/account-panel.js` are the sending end — create the account, list
   members, invite by e-mail, revoke — as a section on `settings.html`. It
   needed NO new SQL: `acc_insert`, `acc_select`, `am_select` and `am_write`
   already permitted exactly this, and `account_members_guard()` already
   compares OLD and NEW so an admin cannot promote itself or delete the owner.

   **And section 11 had never actually run.** This file claimed it had. Probed
   through the app's own client, `accounts`, `account_members` and
   `projects.account_id` were all present and `claim_invite` was NOT — so the
   receiving end did not exist either. It has been applied and verified
   through the app rather than the SQL editor. Take the lesson over the fact:
   **the schema file's record of its own runs is not evidence.** Ask the
   database.

   **A HOLE THE AUDIT MISSED, found while building the panel.** `acc_insert`
   checks only `owner_id = auth.uid()`, and `accounts_guard` — the trigger
   carrying "Plan and limits are set by billing, not by the client" — is
   BEFORE UPDATE. So an INSERT carrying `seat_limit: 999, plan: 'pro'` is
   refused by nothing: any user can mint themselves an unlimited account. The
   guard is enforced on update and open on insert. `createAccount()` sends
   only a name and an owner id and lets every limit default, deliberately,
   rather than writing the shortcut into the product. The fix belongs in
   `docs/SECURITY-RLS.md` and in a WITH CHECK on that policy.

   **Seats are real and the panel does not argue with them.** `seat_limit`
   defaults to 1, the owner's own row takes it, and `enforce_seat_limit()`
   raises 53400 on the next insert. So the invite form is HIDDEN when seats
   are full and the panel says where seats come from, rather than offering a
   control whose only outcome is an error.

   **What is still missing.** Projects are not attached to accounts by any
   UI: `projects.account_id` exists and `has_project_access()` reads it, but
   nothing sets it, so an admin you invite today sees no films. `account.js`
   has `setProjectAccount()` ready and the panel deliberately does not call
   it — attaching a film hands every account admin edit rights on it, which
   is an access-control decision a person should make on purpose rather than
   as a side effect of creating an account.

   Also still open from the audit's A6: an invitee cannot SEE an invite
   before claiming (`am_select` matches on `user_id`, null while pending),
   so the flow auto-joins on sign-in with no preview and no decline. And the
   ten live RLS checks in `docs/SECURITY-RLS.md` have still never been run —
   the schema being deployed is not the same claim as the policies behaving.

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
   shell, across every theme × every skin × every page, and every model is
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
   ask, plus a sample project — Dragon (2025, dir. Ashwath Marimuthu), 36
   scenes, 105 pages, 18 shoot days, 17 locations and a 29-person unit, so
   the blueprint, breakdown, stripboard, reports, contacts, plan, visualize,
   write and budget all have something real to show.

   **It is a reconstruction and says so everywhere it could mislead.** The
   public facts are credited and right; every piece of paperwork — the
   schedule, the dates, the budget, the unit, the recces, both call sheets —
   is invented, and that is stated in `_about`, in the meta fields, in the
   first line of both call sheets, in the first action element and at the top
   of all four documents. Two rules keep it honest and apply to any film that
   replaces it: NO REAL PERSON beside a contact detail (all 29 contacts are
   invented names on `@dragon.example`; character names are public and live
   in the role column; `hod_dir_date` is deliberately blank rather than
   invent a real director's signature date), and NO REPRODUCTION of
   anybody's actual screenplay.

   **That second rule used to read NO RETELLING and say the script was
   27 action, 7 scene headings, 6 transitions and ZERO DIALOGUE.** It
   is a full 36-scene screenplay now — `src/data/sample.dragon.script.json`,
   2,361 elements, 611 of them spoken — and the old wording was doing two
   jobs that have come apart. The part that still holds is that none of it
   is the film's writing: every line is original, written from the sample's
   own synopses, and each `synopsis` is still the functional line a 1st AD
   writes rather than a narrative beat. The part that had to go was "zero
   dialogue", which was never the principle — it was what the pages
   happened to be while a writing tool's demo project had no script for
   the Write module, the screenplay PDF, the sides, the page count or the
   AI shot division to act on. And the scene rows claimed 105 pages while
   the script held 2.3, which is the sample contradicting itself about the
   one number every other module is derived from.

   Four things about that file are load-bearing and the first is the one
   that will be broken first. It is a DYNAMIC import, and
   `vite.config.js` carries a matching exception, because the rule that
   folds `src/data/*.json` into the shared `data` chunk would have put a
   quarter of a megabyte on twenty first paints to serve one click; both
   halves are needed or the lazy import means nothing. Each scene is
   written to the length its own `eighths` already claim, measured with
   `script.js`'s metric, so the schedule and the budget still agree with
   the pages — it lands at 106.5 against the breakdown's 105.0, which is
   the difference a real script and a real 1st AD's eighths have, not a
   bug. The DIALOGUE IS TANGLISH and the slug lines, action and
   transitions are English, which is what a Tamil unit shoots from and
   the only arrangement where the fixed-width Courier grid the page count
   is arithmetic on stays fixed-width. And it is ROMANISED: the gate's
   romanisation check only walks keys ending `Tanglish`, so it cannot see
   these elements, and `--f-script` keeps its Tamil face last precisely
   because a Tamil family claims the Latin glyphs too.

   The wall of 24 steps behind it is handled
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

   **The festival countdown comes out of both sides of the oracle, and
   the run's clock is NOT pinned.** The short film's step 10 prints live
   countdowns from `festivals.checks.json` — "in 33 days", "119 days
   ago" — and every one moves with the calendar, in both directions. A
   baseline captured on the 29th failed on the 30th with 13 unexplained
   missing words, all bare integers, none of them copy anybody had
   touched.

   `COUNTDOWN` in `scripts/verify-migration.mjs` derives the varying
   numbers from the same file the page reads, at the two dates that
   matter — the baseline's own `capturedAt` and now — and removes only
   the symmetric difference. So "in", "days" and "ago" keep their
   coverage, as does any number that lands on the same value twice, and
   immediately after a re-baseline the cost is zero because the two
   dates are the same day.

   **A FROZEN CLOCK USED TO SIT BESIDE IT AND HAD TO GO.** A
   `FROZEN_CLOCK` constant plus a UTC-pinned context solved the same
   problem a second way, and the two contradict rather than reinforce:
   COUNTDOWN's premise is that the page renders TODAY'S countdowns, so
   freezing the browser makes it strip the wrong set and whatever it
   failed to predict leaks. Exactly one number leaked ("61") the first
   time both were in the file.

   It survived as long as it did by coincidence — the frozen date was
   the same day the baseline was captured, so the two agreed and
   nothing failed. With the freeze gone the filter absorbs the real gap
   (3 days, 32 clock words, green) which is the proof that it was
   always the one doing the work. Pinning the timezone was wrong in the
   same shape: COUNTDOWN reads the LOCAL calendar day because that is
   the day the browser thinks it is, so forcing the page to UTC while
   this script stays on the machine's zone makes them disagree for part
   of every day.

   Neither an `EXPECTED` entry nor a re-baseline can do this job. The
   first names integers that are wrong tomorrow, and the anti-rot check
   then fails for stale allowances. The second goes green until
   midnight.

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

10. **Back up to Google Drive — the whole studio, one file, kept current.**
    `src/lib/drive.js` is the client (auth, find-or-create, upload, download,
    head revision, revisions) and knows nothing about films;
    `src/lib/drive-sync.js` is the only place Drive and the studio meet. The UI
    is on `settings.html`, which is the app-scope page.

    **It REUSES the backup file rather than inventing a format.** `exportAll()`
    in `hub.js` used to build the v2 object and trigger a download in one
    function; the seam is cut, and `buildBackup()` / `applyBackup()` in
    `src/lib/backup.js` are now the only implementations of each. The hub owns
    the `<a download>` and the file picker, Drive owns the PUT and the GET, and
    the gate's backup round trip exercises the same code on every run — so the
    guarantee is inherited rather than re-earned. `applyBackup` has two modes
    and ONE loop: `merge` (the hub's import, additive, a colliding id lands
    beside as a marked copy) and `restore` (a Drive pull, a colliding id
    replaces in place, because a pull is this device catching up with itself
    rather than importing somebody else's films). Neither mode deletes a local
    project the file has never heard of.

    **One file, a stable id, and Drive's own revisions are the versioning.**
    No version scheme is maintained here; "restore the one from Tuesday" is a
    `revisions` call. The scope is `drive.file` — non-sensitive, no OAuth
    verification, and unlike `drive.appdata` it puts the file somewhere the
    person can open, copy and keep, which this app's whole premise requires.

    **Never clobber a remote you have not seen.** Every push reads
    `headRevisionId` first and refuses if it has moved since this device last
    pulled or pushed; the user gets both sides with their timestamps and picks.

    **AND BOTH SIDES OF THAT COMPARISON MUST COME FROM `readMeta`.** The
    question "does the upload response carry the head revision" was listed
    below as unproven; it is proven now and the answer is do not rely on it.
    `_doPush` and `connect()`'s create path stored what the WRITE returned
    while `_doReconcile` compared against what `readMeta` returns, and the two
    disagreed: a forced push succeeded, `revisionId` and `syncedAt` were both
    recorded, and the very next reconcile declared a conflict on a file
    nobody else had touched. Left alone `moved` is true for ever and Drive
    never uploads again. `headAfterWrite()` re-reads the head after every
    write — one GET, the same call reconcile makes, which makes the two sides
    equal by construction. The harness missed it because its fake Drive always
    returned a fresh id on a media PATCH; it can withhold one now, and that
    check was seen RED before it was trusted.
    "What changed locally" is `max(updatedAt)` across projects against
    `syncedAt` — a clock the storage proxy already keeps, which is why nothing
    here writes a dirty flag and nothing writes on a timer.

    **Only one sync owner.** `cloud.js` gained `ownsSync()` —
    `isConfigured() && session`, the same two conditions its own `saved`
    subscriber uses. Drive asks it (through `window.StudioCloud`, as
    `src/ui/auth.js` does) and goes manual-only when Supabase is live, because
    two live syncs writing the same storage echo each other forever, and
    Supabase also carries collaboration that a Drive file cannot. Worth
    knowing: `vite.config.js` folds every `src/lib` and `src/ui` module into one
    `studio` chunk, so cloud.js already evaluates on **every** page, not only
    the three that import it by name.

    **THE TOKEN, AND THE TWO THINGS THIS PARAGRAPH USED TO GET WRONG.**
    It is still never persisted BY THIS APP — a module variable, gone with the
    document. The client id is `VITE_GOOGLE_CLIENT_ID` at build time, not a
    storage key, and a build without it says so instead of offering a button
    that cannot work. Both halves below were measured against real Google,
    which is the only way either could have been settled.

    **There is no silent re-mint. This said there was.**
    `google.accounts.oauth2`'s token client ALWAYS opens a popup;
    `prompt: ''` suppresses the consent SCREEN, not the window, and a popup
    with no user gesture behind it is blocked. A direct probe in the live page
    returned `popup_failed_to_open`. That is One Tap / ID-token behaviour, not
    this flow. Consequences worth holding together:

      - `getToken({ interactive: false })` must therefore REJECT rather than
        fall through to a request, and now does. The version that fell
        through shipped a user-visible bug: Drive connected means every page
        load called it, and arriving by CLICKING a nav link leaves a fresh
        gesture on the document, so the browser allowed the popup — clicking
        Dashboard or Settings threw Google's sign-in window at somebody
        already signed in. Arriving any other way it was blocked and nothing
        showed, which is why it read as intermittent.
      - an expired token therefore surfaces as an error beside a working
        Connect button. It cannot refresh itself. That is the design now, not
        a gap.

    **Signing in connects Drive, and the window is ONE HOUR.** Sign-in asks
    Google for `drive.file` alongside the e-mail, and Supabase returns the
    Google token as `session.provider_token`. Supabase's docs say that value
    is returned once and not persisted; supabase-js 2.45.4 in fact writes it
    into the session blob in localStorage, so it survives a reload — measured,
    persisted true and live true on a reloaded page. drive-sync.js adopts it
    and connects with no popup and no second consent.

    **But it does not survive a REFRESH.** When supabase-js refreshes the
    access token roughly an hour in, the refresh response carries no
    `provider_token` and the stored one goes with it. So the automatic
    connection works on the sign-in and for about an hour after; beyond that
    Drive needs the button, and the error text says so. Measured: an hour-old
    session reported no grant live and none persisted.

    That one-hour window is a property of Supabase's refresh flow, not a bug
    here, and it cannot be closed from a static build. The two real fixes are
    both out of scope: a server holding a Google refresh token (which needs
    the client secret this app deliberately has nowhere to keep), or asking
    for consent again, which is the button. Do not "fix" it by writing the
    token to storage; that is the mistake ai.js already refuses for the API
    key.

    **The adoption listens for ANY session-bearing auth event**, not
    `SIGNED_IN`. supabase-js 2.45.4 announces a RESTORED session as
    `INITIAL_SESSION`, and restored loads are the only ones that can finish —
    the load that signs in is the one `Store.setAccount()` reloads out from
    under it, on a zero timer, which is what killed the first three attempts
    at this.

    **CSP.** Four new entries in BOTH `vercel.json` and `netlify.toml`:
    `script-src https://accounts.google.com/gsi/client`, `connect-src`
    `https://www.googleapis.com` and `https://accounts.google.com/gsi/`,
    `frame-src https://accounts.google.com/gsi/` (the silent token request is an
    iframe), and `style-src https://accounts.google.com/gsi/style`.

    **What is proved, and by what.** `settings.html` is NOT in the gate's
    `PAGES` and `baselineFacts()` hard-exits on a name missing from
    `baseline.json`, so none of this is in `npm run verify`.
    `scripts/prove-drive.mjs` builds its own `dist-drive/` with a fake client id
    and replaces exactly one seam — `fetch` to googleapis.com, and the GIS token
    client — with an in-memory Drive that counts revisions. Everything above
    that seam is the shipped code. It asserts the uploaded bytes are a v2
    backup holding both projects; that the API key's VALUE AND NAME are absent
    from those bytes with a key set on the device; create-on-first-connect;
    push with an unmoved head; refusal plus a named conflict when the head has
    moved; keep-mine and take-theirs; that a pull replaces rather than
    duplicates; the revision list and a restore from one; manual-only under
    Supabase ownership with no push on save; a debounced push when Drive is
    live; zero localStorage writes across four idle seconds with Drive
    connected; disconnect leaving the Drive file alone; and the settings page at
    1280 and 390 in both themes with no overflow, no inline handlers and every
    text node over 4.5:1.

    **Five of those six are now PROVED, against real Google.** The list used
    to read: a real OAuth consent, a real silent re-grant, the real
    `drive.file` scope, the real create and media PATCH, Drive's revision
    retention, and the CSP as a live browser enforces it.

      - consent, the scope, the create, the PATCH and the CSP: all exercised
        on the deployed host. A backup file exists, holds this studio, and
        Drive lists **four revisions** of it — so the revision history the
        restore feature rests on is real, not assumed.
      - the sixth, "a real silent re-grant", is proved to be IMPOSSIBLE
        rather than proved to work. See the token note above.

    **What is still unproved:** restoring from a revision against real Drive
    (the list is read, a restore from it is not), and what Drive does with a
    file somebody edits outside the app. The conflict path has only ever been
    exercised against a head this device had not seen, never against a
    genuine second writer.

    **THE CLIENT ID EXISTS NOW, AND IT IS COMMITTED.** `.env` carries
    `VITE_GOOGLE_CLIENT_ID` for the Web client "Filmmakers Studio - Drive
    (browser)" in the Google Cloud project `filmstudio-495419`. Committing it
    is the deliberate part: Vite inlines every `VITE_*` into the bundle, so
    the value ships in the page whatever we do, and Vercel builds from git —
    a value only in the dashboard would make a local build and the deployed
    one disagree about whether Drive exists at all. What actually guards the
    account is the client's **Authorised JavaScript origins** list, which is
    why a new deploy domain is a change in the Google console, not in this
    repo. Registered today: the vercel.app host, `localhost:5173` (dev) and
    `localhost:4173` (preview). A real secret still goes in `.env.local`,
    which is now gitignored; the GIS token model uses no secret at all.

    **Setting it moved the gate.** With a client id present, `settings.html`
    renders the Drive panel instead of the "this build was made without a
    Google client id" paragraph — nine words left the page and seventeen
    arrived, which the text check correctly failed. The answer was
    `npm run baseline`, not an EXPECTED row: nine allowances for one cause is
    the list growing, and the diff was confined to `settings` with zero
    data-key movement on any of the sixteen pages, so the recapture was
    provably narrow. Check that diff yourself before re-baselining for the
    same reason; a wider one means something else drifted too.

    **The consent screen is the remaining blocker, and it is not code.** The
    Google project is still `Testing` with zero test users, which means NO
    account can consent — including the developer's — so Drive and the
    Supabase Google sign-in both fail until it is published or a test user is
    added. Publishing an External app needs a privacy policy and terms of
    service on the authorised domain, which is what `privacy.html` and
    `terms.html` are for (see the note on them below).

11. **PRD 2.0 — five stages, the Story stage, the gate, the extension.**
    The six phases are now the PRD's five stages (Story, Screenplay,
    Pre-Production, Production, Post-Production). Every module object,
    id and href survived the regroup; no phase id is stored anywhere, so
    renaming them needed no migration. Post-Production carried two
    `planned` modules; both are built now (open item 12). The scope decisions, asked of the user and
    answered before any code: the extension WRAPS this app (one
    codebase); the gate guards the CLOUD and the EXTENSION, never local
    work; the backend is the existing Supabase project; built modules
    stay live.

    - **Story** (`story.html`, `src/lib/story.js`, `src/data/frameworks.json`):
      highlight-to-tag, three frameworks, a tension heatmap with pacing
      flags, AI beat mapping that returns QUOTES (offsets are found
      here; a non-verbatim quote is dropped), `.docx` with no library.
      A hand tag is stored per framework; switching framework is a view
      change. Marks re-anchor by text after an edit, and a passage that
      left the synopsis is reported detached, never re-pointed.
    - **Screenplay** (`src/lib/screenplay-analysis.js`): screen time
      (dialogue pace against action rhythm, with page-a-minute shown
      beside it), the cast matrix, auto-tag suggestions that are
      buttons, not tags. The PRD's colours (cast red, props blue,
      vehicles and stunts yellow, sound green) are CATEGORY hues,
      `.hue-el-*`, in all four token blocks; yellow carries its own
      on-colour. Pitch deck: one click, landscape PDF, print pipeline.
    - **The gate** (schema sections 13 and 14, `src/lib/gate.js`,
      `cloud.js`'s `runGate()`): it FAILS CLOSED. It failed open until
      section 13 ran — and section 13 NEVER RAN (probed 5 Oct 2026:
      every function PGRST202), so for its whole life the "gate" let
      every Google account sync. "Function missing" is still told apart
      from "the function said no", but only for the SENTENCE: reason
      `notdeployed` versus `noinvite` / `pending` / `declined` /
      `disabled` / `revoked` / `unreachable`, all of them `state:
      'closed'`. A closed gate or a lost lock pauses sync, and the local
      write clock is still recorded, so paused writes win at the next
      sync. Section 13.6b makes it a boundary with additive triggers;
      its grandfathering insert is COMMENTED OUT now, because "already
      owns a cloud project" stopped meaning "was let in".

      **The flow is sign in → invite.html → through or ask.** The FIRST
      load after a sign-in that ends closed is sent to `invite.html`
      (a sessionStorage marker, `fms_gate_landing`, set when the sign-in
      begins and consumed by the first `runGate()`), and ONLY that load:
      local work was never behind the gate, so a visitor waiting on an
      admin keeps every page. Two routes through: a code, or a REQUEST
      (section 14, `request_invite`) — the row carries the e-mail and
      name Google attested, copied server-side out of `auth.users`, plus
      a note and the browser; the admin console on `settings.html`
      lists the queue and APPROVE writes the `studio_members` row
      directly (no code), DECLINE records a note the requester sees and
      a seven-day cooling-off. Membership arriving by any route closes
      a pending request (14.4 trigger). `studio_status()` was widened
      to carry the request's standing and, for an admin, the pending
      count, so the pill, the account menu and `invite.html` all read
      ONE answer (`getGateState().status`) and `gateDetail(reason)` is
      the one sentence they print.

      BOTH SECTIONS RAN on 5 Oct 2026, plus the 13.2 bootstrap — through
      the dashboard SQL editor, verified afterwards through PostgREST
      (every function 401 to anon, where it was PGRST202 that morning).
      `auth.users` held one account, now the admin; the second
      `VITE_ADMIN_EMAILS` address has never signed in and gets its row
      the first time it does (re-run the 13.2 line, or approve its
      request). The 13.8 and 14.5 LIVE CHECKS are still unrun: deployed
      is not the same claim as behaving. `docs/GATE.md`.
    - **Keys.** `fms_story_v1`, `fms_idea_vault_v1`: per project, in all
      five registries (13.7 adds the scopes). `fms_device_session_v1`:
      the website's lock handle, in `ALL_KEYS` and deliberately NOT in
      `GLOBAL_KEYS`, for the Drive pointer's reason. The pre-auth ticket
      is sessionStorage on the website. In the extension, the ticket,
      the lock handle AND the Supabase session are `chrome.storage.session`
      (supabase-js gets a storage adapter); `fms_clip_queue` is
      `chrome.storage.local`, because a clipping is not a credential.
    - **The extension** (`docs/EXTENSION.md`): needs its
      `chromiumapp.org` redirect URL on the Supabase allow-list before
      Google sign-in works.

    Proved: `test:story` 49, `test:screenplay` 29, `prove:gate` 107
    ((a) asserts CLOSED when undeployed; (i)–(k) the landing,
    request/approve and decline; (l) the site gate; (m) the console;
    (n) code-only entry and the invite link), `prove:billing` 65
    ((i) the Features matrix, the free tier's sample-only hub, a locked
    page), `prove:extension` 28, all against the real GATED build. What is
    NOT proved: the 13.8/14.5/15.1 live checks against the database
    (the sections are DEPLOYED, see above), Google's consent screen for
    the extension, and Chrome Web Store review.

    **Two traps the site gate paid for on its first day.** The veil
    (`data-sitegate="pending"` → `body > * { visibility: hidden }`)
    hid the TAKEOVER PROMPT, because `runGate()` asks that question
    before it settles the state; `base.css` excepts `.gt-overlay`, and
    `sitegate.js`'s give-up timer re-arms while one is open. And on
    the first load after a closed sign-in, `landOnInvite()` and the
    site gate both navigated to `invite.html` in the same tick — a
    harness sees an interrupted navigation, a person a flash — so
    `landOnInvite()` stands down whenever the site gate is installed.
    One owner per redirect.

12. **Billing — Razorpay, three paid tiers, limits by plan.** Schema
    section 16, three edge functions, `src/lib/billing.js`, the cards on
    `settings.html#plan` and `invite.html`, the console on `admin.html`.
    Four decisions asked before the code and recorded in `docs/BILLING.md`:
    ~~PREPAID PERIODS (one Razorpay Order buys 30 or 365 days, nothing
    recurs)~~ — **WITHDRAWN 6 Oct 2026 by the owner: FULL-TIME ACCESS.**
    Section 18: one price per tier (`plans.price_paise`), bought once and
    kept for good; `apply_plan()` and `admin_grant_plan()` keep their
    signatures and write `plan_until` NULL, which `account_plan()` always
    read as "no end"; `create_pending_payment()` refuses 'month'/'year' by
    name. The cards have no period switch and no renew/extend; the
    console has one price field and a grant with no days. **And
    FEATURES BY PLAN**, same section: `plans.features` (key → boolean),
    the console's Features matrix (`src/ui/plan-features.js`), and
    `src/lib/plan-gate.js`, which locks an unticked module's page behind
    an upgrade panel, flags it in every menu, and gives the free tier the
    Dragon sample alone (`sample_only`, `new_projects` off). Missing key
    = allowed; signed-out and code-only visitors are not gated. The
    plan sits on the ORGANISATION (`accounts.plan`, which
    section 6 reserved and `accounts_guard` has defended as "set by
    billing" since); PAYING GRANTS ENTRY (activation inserts the
    `studio_members` row, so a stranger who pays is through the gate with
    no code — a disabled member is refused before an order exists); and
    the caps are on the CLOUD AND THE EXTENSION, never local work.

    **The price is read from the table by the server, never from the
    client**, so a console edit is live on the next order with no
    Razorpay object to update. **The limits are triggers**, each raising
    `P0402` with the plan and the cap in the sentence; the UI explains,
    it does not enforce. `cloud.js` does NOT queue a `P0402` on a project
    insert — retrying every thirty seconds would fail every thirty
    seconds — the sync status says why, a toast offers the plans once a
    minute, and the film stays on the device. A lapse is computed from
    `plan_until`, never scheduled. A refund lapses the plan.

    Three things the first proof run found, each a real bug or a real
    trap: `planRank` was called on the module's default export and
    missing from it, which took the WHOLE plan section off the page
    with one `pageerror` and nothing else visible; the fake Supabase
    answered a project PATCH with `[]`, so every pulled project was
    re-inserted and hit the cap — `_pushProjectMeta` updates first and
    inserts only on an empty answer, and a fake has to honour that or it
    proves the wrong thing; and the console's "Saved." clears itself
    with a re-render 2.5s on, under whatever the next form was being
    filled with.

    **The proof builds its own `dist-billing/`** with a fake public key
    id and the gate ON, because the committed `.env` carries no key id
    until the owner has one, and a build without one disables every BUY.
    That is right for the product and wrong for the fixture. The hex
    fallback for Checkout's theme colour is gone too: the literal is
    READ from `--brand`, and a missing token means Razorpay's own colour,
    not a colour typed here.

    **NOT RUN against the live database or a live Razorpay account.**
    `test:schema` proves §16 loads and behaves on a real PostgreSQL;
    `prove:billing` proves the pages against a fake that signs exactly as
    Razorpay does. The deploy order — run §16, set the secrets, deploy
    the three functions (`rzp-webhook` with `--no-verify-jwt`), register
    the webhook, set `VITE_RAZORPAY_KEY_ID`, set the real prices — is in
    `docs/BILLING.md` §1, and the seeded prices are PLACEHOLDERS.
13. **Post-Production is built: the Edit Log and the Deliverables list.**
    The two modules that had said SOON since the five-stage regroup.
    `edit.html` / `src/lib/editlog.js` and `deliverables.html` /
    `src/lib/deliverables.js`, keys `fms_edit_v1` and
    `fms_deliverables_v1`, in all five registries. `npm run test:post`
    (57 assertions, Node, no browser) covers the derivations.

    **The edit log reads the shoot day's marks and does not write
    them.** `shoot.html` stays the only view that writes to a scene;
    the suite's opinion — in the cut / locked / cut out, a note, the
    pick-ups owed — is its own key, because the 1st AD's "dropped" and
    the editor's "cut out" are two facts with two owners that disagree
    all the time, and the disagreement is the report (a dropped scene
    the cut still claims is a CONFLICT, shown first). Everything else
    is derived in `coverage()`: pages in the can, pages owed, waste.
    **The set's word is final** — a scene marked shot is in the can
    even with shot-list setups unticked; the ticks are reported as a
    note, never as a debt. The first version let a checkbox nobody
    maintains on the floor overrule the mark, and the sample's 36
    scenes all read "owed".

    **The deliverables catalogue is content** (`src/data/deliverables.json`,
    rule 2) and its `id`s are storage keys: the page stores only state
    against them, and the default state is not stored at all. Festival
    FORMATS are not in the catalogue — they are joined at render time
    from the submission tracker and `festivals.json`'s `format`, so a
    festival added on the short film's step 10 appears with what it
    asks for and nothing is kept in step by hand. Only 5 of 18
    catalogue festivals record a format; the rest say so rather than
    guess. The CBFC copy is stated carefully (public exhibition in
    India; festivals abroad do not ask; Indian festivals screen under
    an I&B exemption) and the ratings are the 2024 set — change it in
    the JSON if the rules change. The page also quotes the blueprint's
    step-32 answers (`po_deliver_list`, `po_release_plan`) beside the
    list rather than copying them.

    **Schema section 17 has NOT run.** Until it does, Postgres refuses
    the two new scopes and the pages save locally only; everything
    else keeps syncing. Same shape as 13.7 was.

    **Two gate things learned on the way in.** `verify` and `baseline`
    now honour `VERIFY_DIST`, because a second session rebuilding
    `dist/` with the gate ON in the middle of a baseline capture turned
    nine pages of the capture into copies of `invite.html` — the
    capture never failed, it recorded the wrong site. Build into
    `dist-verify/` (gitignored) when another session may be live. And
    the recapture for these two pages was checked the way section 04
    asks: zero data-key movement on every page, and the only word
    changes outside the two new pages were the nav copy that moved
    from "Coming next / In development / SOON" to the built labels.

14. **The consumer pass (6 Oct 2026): legal pages, the Library's three
    shelves, a clearer band, and a plan gate that actually gates.**
    - **Legal.** `privacy.html`, `terms.html` and a new `refund.html` (the
      same markup-only, `legal.js`-only pattern; in the vite inputs, the
      sitegate `EXEMPT` list and the rewrites in both host configs). The
      refund window, governing law (India, Chennai courts) and the
      contact are a DRAFT for the owner to confirm; there is no business
      name or postal address yet. `src/ui/footer.js` puts Privacy ·
      Terms · Refunds on every page, from `chrome.js`, after `#app` so a
      re-render cannot remove it.
    - **Case Studies, Dissection and the Craft Glossary are Library
      tabs.** navigation.json hangs them off the global `library` entry
      as `modules`; `src/lib/navmodel.js` is the one place stages and
      shelves are joined. Module ids are unchanged, so plan features
      keyed by them still hold. `study.html` / `dissect.html` are stubs
      that load `src/pages/moved.js` (a meta refresh drops the fragment;
      the CSP forbids an inline script). Their renderers moved to
      `src/ui/case-studies.js` and `src/ui/dissection.js` — one copy each.
    - **Tabs.** The strip takes the content column on module pages, sits
      one below the band so phase menus paint over it, and a tab switch
      lands the new panel under the strip. `measureChrome()` leaves
      anything stuck at exactly `--sh-chrome-h` out of that number and
      publishes it as `--sh-cover-h` — the strip used to feed its own
      height back into its `top` and drift down the page. Phase menus are
      capped to the viewport when opened and scroll inside themselves.
    - **The breadcrumb follows the open tab** on pages that host two
      stages (`resolveLocation()` in shell.js): hash, then a fragment
      inside a section, then the first VISIBLE section, then nav order.
      The scroll spy skips hidden sections, which is what made
      contacts.html read "Production › Call Sheets".
    - **THE PLAN GATE NEVER GATED.** `refresh()` in `plan-gate.js`
      cleared its in-flight marker in a `finally` inside the async body;
      signed out that body never awaits, so it finished before the
      promise was assigned and the marker stayed set for ever — every
      later refresh, the gate opening included, got the stale
      signed-out answer. `prove:billing` failed 6 of 59 on it and the
      failures were read as pre-existing. Any lazy guard of the form
      `x = (async () => { … finally { x = null } })()` has this bug.
    - `prove:drive` builds with the site gate off (it drives settings
      signed out) and stubs Google Fonts and `/favicon.ico`; it had been
      broken since the site gate landed.
    - **Work done with no project open is ADOPTED, not lost (audit C1).**
      With no project the proxy writes the HOLDING SLOT — the bare key on
      the device, `key@<uid>` in an account — and creating a project used
      to hide it for good (`migrateLegacy()` only runs on the first load).
      Now the hub's New Project form calls `createProject({ adopt: true })`
      and `adoptUnfiled()` in `store.js` moves the slot into it: raw,
      set-verify-then-remove (big values verified after `flushStorage()`),
      never over a different value already in the target (the slot is kept
      and offered to the next project), and idempotent with no marker — a
      slot whose exact value already sits in a project of this namespace is
      an interrupted adoption and is just removed. **Which project:** the
      next one CREATED EMPTY from the form, in the namespace the work was
      written in. The sample, duplicate, backup import, cloud pull and
      `migrateLegacy()` do NOT adopt — each fills the new project with its
      own content and adoption would mix two films. `buildBackup()` now
      reads every holding slot whatever the project count (`_unfiled`,
      `_unfiled_<n>` for accounts — numbered so no account id is in the
      file); a merge import lands each as a project, a Drive restore puts
      it back into the holding slot without clobbering. The banner
      (`ensureNoProjectBanner()`, wired by `src/ui/no-project.js` from
      `chrome.js` on every page a STAGE module lives on, derived from
      navigation.json) says the work is kept on this device and moves into
      the next project created — the old "your edits won't save" was false.
      It is no longer sticky.
    - **Blueprint reset and import REPLACE (audit H1).** Both `loadData()`s
      set a field the blob does not carry back to its markup default and
      untick absent checklist items (by class — never `li.value`), so
      Reset clears the screen and an import no longer interleaves two
      films. Imports go through `src/lib/blueprint-file.js` first (refuses
      non-JSON, studio backups, the other blueprint's file and anything
      whose fields are mostly not this page's) and then confirm. The short
      film's Erase ALL also removes `fms_festivals_v1` (scoped, so this
      project's tracker only).
    - **Left open, on purpose and on record:** `docs/KNOWN-ISSUES.md` —
      the Library's dark-pref carry-over reads an undefined `PREF_KEY`,
      the extension panel lost the three Library modules, a Case Studies
      empty state names a data file, an unconfirmed band height on the
      Library at 390px, and Case Studies being one long tab. Read it
      before touching any of those files; prune it when you fix one.

15. **The screenplay writer (6 Oct 2026): `docs/SCREENPLAY-WRITER-PLAN.md`,
    all six phases built.** Seven parallel agents, merged in `write.js`.
    - **Format (Phase 1):** a `shot` element type (additive; never a
      scene); dual dialogue as `dual: true` on the SECOND cue, pairs
      derived by `dualPairs()`; (CONT'D) offers; `titlePage` inside the
      script blob (no new key); a page view drawn from the PDF's own
      `paginate()`, so screen and PDF agree by construction.
    - **Keys (Phase 2):** `src/lib/write-keys.js` + `src/data/write-presets.json`
      (Final Draft / Celtx), SmartType autocomplete (`src/ui/smarttype.js`),
      the navigator, shortcut sheets. Measured on Chromium/Linux with real
      X11 events: Ctrl+1..8 IS catchable by a page (it steals tab
      switching), so Alt/Option+digit is the default and Ctrl/Cmd+digit is
      opt-in in a tab, on in the installed app. Dual is Alt+D only —
      Ctrl/Cmd+D cycles the theme on every page.
    - **ONE type-change path:** `setElementType()` in write.js carries the
      dual rules too; the select, every shortcut and Alt+D go through it.
    - **Guide (Phase 3):** `src/lib/format-rules.js` + `src/data/format-rules.json`,
      `src/ui/format-guide.js`; unknown types are neutral by design.
    - **Focus (Phase 4):** `src/ui/focus-mode.js`; goals in a new per-project
      key `fms_write_goals_v1` (SCOPED_KEYS, PROJECT_KEYS, ALL_KEYS; LOCAL
      only — no cloud scope until a schema section widens the CHECK).
    - **Beats (Phase 5):** `beatId` on scene rows (additive, framework-
      qualified), `src/lib/beat-outline.js`, the Outline tab.
    - **Extras (Phase 6):** read-as, dictation, the Breakdown hand-off,
      alternate takes (`alts` on the element, active take is the text),
      a Tanglish preview that is NEVER written into the script.
    - **Prefs:** `fms_write_prefs_v1`, per device, in `ALL_KEYS` and
      `GLOBAL_KEYS`, shared by guide/keys/focus with read-merge-write.
    - **Storage fix found on the way:** a large save made while the page
      was leaving was lost (4/4 on the sample). `store.js` copies in-flight
      overflowed writes to localStorage on pagehide; `prove:storage` 14-15.
    - **Enter paints in ~80-160ms on the 2,361-element sample** in this
      container, the same before these phases; the handler is ~30ms. The
      remaining cost is the browser laying out the inserted row.

16. **Story first, blueprints beside the stages, the script drives the
    scenes (6 Oct 2026): `docs/BLUEPRINT-REALIGN-PLAN.md` revision 3,
    built.** Nothing was removed; module ids and every data-key held
    (verify: 720 keys, 0 moved, re-baselined from `edfb125`).
    - **Nav.** Six modules moved Screenplay → Pre-Production (breakdowns,
      elements, auto-tag, songs, stripboard, cast-matrix), Pitch Deck →
      Story, the two blueprints to a global `blueprints` SHELF (same
      `shelves()` path as the Library). Pre-Production modules carry a
      `group`; each stage carries `guide` links into the blueprints.
      `plan-gate.js` counts whole-page shelf modules, or moving the
      blueprints out of Story would have stopped it locking them.
      Script Breakdowns' target is `breakdown.html#breakdown`, an
      always-rendered div inside `#scenes`.
    - **Blueprints in five Parts, one per stage**, step order and ids
      unchanged; `#part-2` and `#write-the-draft` are new, fieldless.
      `src/data/steps.stages.json` is the sidecar (stage, part, tools,
      readout) — the step JSON is regenerated by extract, so nothing new
      goes in it. Chips, "Do this in…", readouts: `src/ui/step-stages.js`.
    - **The Story page is a path**: Idea → Logline → Structure → Step
      outline → Synopsis → To the Screenplay. `outline` and `idea` live
      INSIDE `fms_story_v1` (no new key). 11 frameworks in
      `frameworks.json`; old ids kept. The synopsis is assembled from
      the outline with `origin:'outline'` marks. Pacing, AI, Pitch and
      Vault are a page-local tab strip — so an extension clipping's
      toast now carries "Open the Idea Vault", or it lands hidden.
    - **The script drives the scenes** (`src/lib/scene-sync.js`): scene
      rows carry `scriptElId`; a new heading adds its row, an edited one
      updates heading-derived fields only, a deleted one sends the row
      AND its shots, frames, call-sheet rows and edit-log state to
      `fms_scene_bin_v1` (`src/lib/scene-bin.js`; scoped, project, reset
      lists, local only). Zero headings bins nothing. `removeScene()`
      and Write's replace-scenes import go through the bin too.
    - **Script → shot list**: AI with a key, `src/lib/shot-rules.js`
      without; same draft shape, append-only, `rules: true`.
    - **store.js: a read in the same task as an overflowed write served
      the OLD value**, so a loop of `addShot()` lost 42 of 254 shots.
      `_readTiered()` now reads `_inflight` first.
    - Also: journey strip (`src/lib/journey.js`, derived), beat guide in
      Write (`src/ui/beat-guide.js`; Panel mode left-aligns the whole
      column to make room for its card), story kit in the blueprints,
      the guide drawer on module pages (`src/ui/blueprint-drawer.js`,
      writes the blueprint's own key read-merge-write), hand-offs and
      wrap cards. Open ends are in `docs/KNOWN-ISSUES.md` §7.
    - Browser runs in this container need
      `PW_CHROMIUM=/opt/pw-browsers/chromium`.

17. **The Medium/Low pass over the UX audit (7 Oct 2026).** All 27 Medium
    and 30 of 31 Low items in `docs/UX-AUDIT-2026-10-06.md`, struck
    through there item by item; five parallel agents, each on its own
    file set, merged and gated once. Re-baselined from `94e062d` with
    zero data-key movement on all 21 pages — the words that left are
    named against the items (`replaces`, `above`/`below`, `bottom`/
    `calculator`, the Feature keyboard line, the admin's signed-out copy).
    Four things changed shared machinery and are worth knowing:
    - **`src/ui/modal-focus.js`** — `holdFocus` / `releaseFocus`, the one
      focus trap; the hub's project modal and the sign-in modal use it.
      A new dialog takes it rather than a third keydown handler.
    - **`applyBackup()` validates before it writes.** A v2 file needs a
      `projects` array of objects with ids and a `data` object; a v1
      file needs a known field. `{"hello":1}` used to import "1 project".
    - **The tab strip observer filters.** `apply()` re-runs only when a
      mutation adds or removes a `section[id]`, `main` or the strip —
      settings and admin still re-tab; typing in write.html no longer
      costs 11ms a frame. And the strip is one row that scrolls sideways.
    - **The closed rails are `visibility: hidden`**, not just translated
      off-screen, so they leave the Tab order; the change waits for the
      slide so focus-on-open still lands on a visible link.
    **And the open-issues pass, the same day,** closed everything that
    one left in `docs/KNOWN-ISSUES.md`: the band carries a sign-in pill
    and the Appearance menu on every shell page (`buildStudioTools()` in
    shell.js, when `adoptPageTools()` finds no `.toolbar`; the four
    toolbar pages keep theirs, so exactly one of each everywhere); the
    palette handle is a direct child of `.sh-bar` and stays at the first
    row's right end at every width; Case Studies has a second-level
    strip over a study's PARTS (`#cs-<part>` picks a part, `#study-<slug>`
    the film — the 21,000px was one film, not the list); `sliceScenes`
    IS `sliceScript` now, pinned first by `npm run test:import`; the
    Story guide pill reads the open path step through an additive
    `paths` block in `steps.stages.json`; the AA walk measures Story at
    path steps 3/4/6 and Write in Panel mode (3,124 and 1,800 nodes,
    zero findings); module pages hide their controls in print; and
    `prove:gate` (h) no longer races supabase-js's `lswt-*` storage
    probe (108 assertions). Re-baselined again from the merged tree,
    zero data-key movement; the words that left were `alone` (the call
    sheet no longer promises one page) and the pill's old step list.
    `docs/KNOWN-ISSUES.md` now holds two recorded decisions and one
    thing seen once.

## Things that are deliberate, not oversights

- ~~`radius: 2px`. The studio is printed matter, not iOS.~~ **Corrected, not
  contradicted.** The radius is `--sk-radius: 16px` and buttons are pills. That
  note was true of the design it described — a plate on a page. This design is a
  working product surface: a card is a panel you act inside, and a 2px corner on
  a 1px hairline reads as a rendering artefact rather than as a decision. It is
  one line in one skin file either way, which is the point of the contract.
- ~~Sepia is a real third theme.~~ Gone, along with desk. Two themes, light
  (`paper`) and dark (`ink`), and **ink is the default**.
- The brand plate at the top of every page **does not rotate on a timer**, and
  that is not a styling preference. Visible text that changes by itself is a
  clock in the one element that appears on every page, and the gate compares
  each page's words against a baseline captured once — three messages in
  rotation, one in the baseline, every later run failing for words that "went
  missing". The dots advance it on click and nothing else. See
  `src/data/announcements.json`, which says so where the next person to add an
  item will be looking.
- **`privacy.html` and `terms.html` keep their words in the MARKUP**, which
  every other page here is forbidden to do, and the exception is the point.
  Those pages exist because Google will not publish an OAuth consent screen
  without them, so the first readers are a reviewer and a crawler — and a page
  that renders itself from JS hands both an empty `<div id="app">`. Their only
  script is `src/pages/legal.js`, which imports two stylesheets and stops: no
  `store.js` (they touch no storage), no `chrome.js` (no toolbar, no theme
  picker, no shell to re-init), no `pwa.js`. The rule they are NOT breaking is
  rule 2: that one exists because the 24 steps are DERIVED and were drifting
  in three places. These words are derived from nothing and counted by
  nothing.

  Two consequences to know before editing them. **No skin loads**, because
  `skin.js` never runs, so `legal.css` may not read a `--sk-*` variable and
  reads the fixed tokens instead — the one place in this codebase where that
  is correct rather than the trap named above. And **they are not in the
  gate**: `PAGES` is read from `baseline.json` and neither is in it, so the
  text check, the AA walk and the overflow measurement all skip them. Read
  them in a browser, at 390px, in both themes. Nothing else will.

- **The Supabase URL and anon key are a BUILD setting now**, in `.env` as
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, with anything in
  `fms_supabase_cfg_v1` treated as an override. Both values are public — RLS is
  what guards the database — and the reason is a bootstrap, not convenience:
  `signInWithGoogle()` needs `ensureClient()`, which needs the config, so
  before this NOBODY could sign in until somebody had typed a project URL and a
  208-character JWT into a modal. There is no account, and therefore no admin,
  until the config already exists, which is why "only an admin may configure
  it" cannot be the whole answer.

- **There is ONE Google OAuth client, and that is a reversal.** Drive briefly
  had its own, which reads like good isolation and defeats the thing people
  actually want: Google records consent PER CLIENT ID, so granting `drive.file`
  during sign-in taught a separate Drive client nothing and GIS still raised a
  second popup. One consent means one client. `signInWithGoogle()` now asks for
  `drive.file` alongside the e-mail, and `drive-sync.js` adopts the resulting
  `session.provider_token` — which Supabase returns on the sign-in response
  ONLY and never persists, so after a reload the silent GIS mint is the path
  back, and it works without prompting precisely because the consent was
  recorded against this same client.

- **The admin console gates by VISIBILITY, which is not a boundary.**
  `VITE_ADMIN_EMAILS` decides who is shown the Supabase config on
  `settings.html`. The bundle is public and anyone can call `setCfg()` from a
  devtools console; what stops them reading another account's rows is RLS. It
  is also a bootstrap for a tier that already exists —
  `account_members.role` — which `cloud.js` still makes no reads of. See open
  item 5.

- **settings.html's CONTENT DEPENDS ON `.env`, so the baseline does too.**
  This one nearly shipped as a latent failure. The admin section renders when
  `mayConfigure()` is true, and that includes the case "this build carries no
  Supabase project" — so a baseline captured with `VITE_SUPABASE_ANON_KEY`
  blank records 39 words that VANISH the moment the key is filled in, and the
  text check fails on a page nobody edited. The recapture was reverted and the
  original baseline still passes, because the FilmMakerStudio rename moved no
  visible words at all: the old name lived in `<title>`, the manifest and the
  docs, none of which the word-set check reads. Before re-baselining, diff the
  capture and ask which env it was taken under.

- **`shoot.html` is the only view that WRITES to a scene**, and that is the
  point of it rather than a shortcut. Everything else derived from the scene
  model reads: the breakdown, the stripboard, the day out of days, the call
  sheet, the budget, and now the readiness check. Marking a scene shot is the
  day answering the plan. It is one FIELD on an existing record —
  `scenes.shotState` plus `shotAt` — because `listScenes()` spreads
  `blankScene()` under every stored row, so a scene written before the field
  existed reads back unshot and no migration exists to get wrong. That is the
  pattern `songId` established; use it for the next field too.

  Four states, not a boolean: '' / shot / part / dropped. "We got some of it"
  is the commonest outcome of a shoot day and a tool that cannot say so gets
  lied to.

  It is also the one page designed at 390px and widened, rather than a desk
  squeezed down. On the floor the slug line is the biggest thing on the card
  and the targets are 48px before `pointer: coarse` has an opinion.

- **`src/lib/readiness.js` stores nothing and must stay that way.** Every
  answer is derived at render time, and it COMPOSES `unplacedScenes()`,
  `unscheduledScenes()`, `locationIndex()` and `calendarDays()` rather than
  re-deriving them — two opinions about the same data disagree the first time
  one of them is edited. Passed checks are rendered, not filtered out: a list
  of only failures reads identically whether the production is clean or the
  check stopped running, which is the trap the hue assertion already names.

- **`EXPECTED` is no longer empty, and it holds exactly one row.** Adding a
  module took `navigation.json` from 25 to 26, the launcher prints that
  number, and the hub failed for a missing word on a page nobody edited —
  precisely the collision the note in section 04 predicts. One allowance with
  its reason is the sanctioned answer for the first one; the guidance to
  re-baseline applies once two or three have piled up. The anti-rot check is
  watching it, so it cannot quietly become a permanent excuse.

- Semantic colours (ok / warn / danger) are never one of the three volume hues.
- Supabase and `pptxgenjs` are lazy chunks; they must stay out of first paint.
- `legacy/` is committed on purpose — now as the historical record and as the
  input `npm run extract` parses, not as the verification oracle.
