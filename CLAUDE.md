# FilmMakerStudio — working notes

> **New session? Read `docs/HANDOFF.md` first.** It records everything done on
> 7–8 Oct 2026, every branch and where unfinished work sits, the owner's
> decisions, and what is planned. Then come back here for the invariants.
>
> **Branching:** develop on `develop`; `main` only receives tested work through the
> release gate in `docs/BRANCHING.md`. Never commit unfinished work to `main`.

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
npm run verify -- --budget  # recapture scripts/budget.json (first-paint bytes, 110%) — deliberate, like baseline
npm run prove:sw  # the service worker against a cleanUrls host (the redirected-response trap)
npm run test:pdf  # PDF text extraction, in Node, no browser (~1s)
npm run test:story       # story model + .docx reader, in Node (open item 11)
npm run test:screenplay  # screen time, cast matrix, auto-tag, 120pp < 1200ms
npm run test:post        # the edit log and deliverables derivations (item 13)
npm run prove:drive # Drive backup, against a faked Drive — see open item 10
npm run prove:gate  # invite gate, device lock, admin, screening room (item 11)
npm run test:import      # script import + the one slicer (item 4)
npm run test:stripboard  # per-day order, placeScene/undoPlace/nudgeScene (item 18)
npm run og               # regenerate public/og.png from tokens (after a palette change)
npm run build:extension   # the Chrome extension, into dist-extension/
npm run prove:extension   # the unpacked extension in Chromium (item 11)
npm run test:billing      # the Razorpay helper: HMACs, prices, paise (item 12)
npm run test:schema       # the WHOLE schema on a real PostgreSQL + 225 checks (pg_ctlcluster 16 main start first)
npm run test:sun / test:callsheet / test:costs / test:delivery / test:revisions / test:ai-coverage / test:testimonials  # item 20
npm run prove:growth / prove:ai-coverage / prove:storage  # item 20 (ai-coverage reads dist-verify/)
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
start.html                                        the PUBLIC landing page, outside
                                                  the site gate (item 18)
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
             write.js plan.js start.js
             hub/  ← util, first-run, project-cards, backup-menu,
                     resume-cards: hub.js is the composition
  sw.js      service worker (vite-plugin-pwa injectManifest)
docs/KNOWN-ISSUES.md  bugs found and not yet fixed — check it first
docs/UX-AUDIT-2026-10-06.md  the full UI/UX audit, ranked by severity
docs/HISTORY.md       the build log — the long form of every open item
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

**Chunking is no longer one `studio` chunk.** `vite.config.js`
`manualChunks` puts a shared CORE together by name, each `src/data` file in
its own chunk, and everything else by page. A module with a page-wide side
effect (it patches something, listens globally, mounts chrome) belongs in
CORE, or it silently stops running on the pages that do not import it by
name. Module pages fetch about 29-47% of the JS they did.

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

## Open items — status

The full log of each item — reasoning, dead ends, measurements — is in
`docs/HISTORY.md`, moved there on 7 Oct 2026 because it had grown to half
this file. This table is the brief: one line each, where the detail lives,
and the one thing to hold in your head before touching it. Items are
numbered as they are in the history.

| # | Item | Status | Hold this |
| --- | --- | --- | --- |
| 1 | Storage-key rename `arunak_` → `fms_` | Done | `migratePrefix()` in store.js; five properties listed under invariant 1. Never rename a middle without a second migration. |
| 2 | The scene chain, both directions | Done | scene → breakdown → stripboard → DOOD → call sheet → budget, all reading `scenes.js`. "Use N days" fills only blank fields. |
| 3 | AI, bring-your-own-key | Done | Two providers through one `callModel()`; key in `fms_ai_key_v1` via raw get/set, in NO registry; `connect-src` in both host configs. Synopsis→script is staged and resumable. |
| 4 | Script import + screenplay PDF | Done | Position IS type in a PDF; the refusals (encrypted, scanned, no ToUnicode) are the feature. `test:pdf`. One slicer: `sliceScenes` is `sliceScript`. |
| 5 | Collaboration + RLS | Deployed, **live checks unrun** | `docs/SECURITY-RLS.md` ends with checks needing two real accounts; none has run. `acc_insert` hole fixed in schema §19 (accounts guard now BEFORE INSERT OR UPDATE) — unrun live. Projects are not attached to accounts by any UI, on purpose. |
| 6 | `--ink-faint` as text | Done | Three-deep ink hierarchy. The AA probe walks every text node; `::before/::after` content is not a text node. |
| 7 | Chennai rates, festivals | Partly — sourcing | No union floor exists (FEFSI MoU expired 2025). Never apply an inflation multiplier; show the band AND the checked figure. A festival carries its own `lastChecked`. |
| 8 | First run + the Dragon sample | Done | Reconstruction, says so everywhere. NO real person beside a contact; NO reproduction of the real screenplay. The script JSON is a dynamic import with a `vite.config.js` exception — both halves needed. |
| 9 | The interaction pass | Done | Palette derives everything, writes nothing. `COUNTDOWN` strips festival numbers at both dates; a frozen clock contradicts it. rAF doesn't run in a background tab — measure synchronously first. |
| 10 | Google Drive backup | Done; consent screen **published** (8 Oct) | Reuses the backup format. Head revision read from `readMeta` on BOTH sides. No silent re-mint exists: `getToken({interactive:false})` rejects; the sign-in grant lasts ~1h. `prove:drive`. |
| 11 | PRD 2.0: stages, Story, gate, extension | Done; 13.8/14.5 live checks unrun | The gate FAILS CLOSED. `fms_invite_code_v1` is a key on its own. One owner per redirect (`landOnInvite` stands down under the site gate). `prove:gate` 108. |
| 12 | Billing: Razorpay, tiers, plan features | Built; **§16–§20 not run live**, no key | Price read server-side; promo codes (§20) are priced server-side too; limits are triggers raising `P0402`; paying grants entry; a lapse is computed. Full-time access (§18), no periods. `docs/BILLING.md` §1 is the deploy order. |
| 13 | Post-production: edit log, deliverables | Done; **§17 not run live** | Edit log reads shoot marks, never writes them; the set's word is final. Catalogue ids are storage keys. |
| 14 | Consumer pass: legal, Library shelves, tabs, plan gate, adoption | Done | Legal pages keep words in markup, load no skin, are not in the gate. Work with no project is ADOPTED into the next empty project. `x = (async()=>{… finally{x=null}})()` is a bug. |
| 15 | The screenplay writer, six phases | Done | ONE type-change path (`setElementType`). Alt+digit by default; Ctrl+digit steals tabs. Goals key is local-only until a schema section widens the CHECK. |
| 16 | Story first, blueprints beside stages, script drives scenes | Done | `scene-sync.js` + the scene bin; zero headings bins nothing. `_readTiered()` reads in-flight first. `steps.stages.json` is the sidecar; step JSON is regenerated. |
| 17 | UX-audit Medium/Low pass + open-issues pass | Done | `docs/UX-AUDIT-2026-10-06.md` struck through item by item; `docs/KNOWN-ISSUES.md` holds two decisions. `modal-focus.js`, validated `applyBackup`, filtered tab observer, rails `visibility:hidden`, band controls everywhere, Case Studies in parts, wider AA walk. |
| 18 | Launch readiness (7 Oct 2026) | Done in code; owner steps in `docs/LAUNCH.md` | Landing page `start.html` is outside the gate and keeps its words in markup; `navigation.json` is fetched there as a URL asset on purpose (not bundled). A module with a page-wide side effect belongs in CORE in `vite.config.js`. Stripboard's per-day order lives INSIDE `fms_locations_v1` as `order` — no new key. `promo_codes` has no client access: only `quote_order` and `create_pending_payment` (5-arg) touch it. The host `thefilmmakerstudio.vercel.app` is the CONFIRMED production host (owner, 7 Oct 2026), in ten files; a custom domain later needs the same ten files + Vercel + Google authorised origins (LAUNCH §7). start.html's Dragon figures and tier names are stamped at build time (`fms-start-figures`). Purchases are final bar three exceptions; the webhook's refund handling stays for them. |
| 19 | Handoff and pending work (8 Oct 2026) | Released; pending registry in `docs/HANDOFF.md` §6c | `docs/HANDOFF.md` is the entry point: repo state, decisions, what is live, and an ID-numbered pending registry (P launch steps, G production gaps, T quality gaps, B billing, Q queued, E emotional craft) with lanes that can run in parallel. Develop on `develop`, release through `docs/BRANCHING.md`. Branch deletion is blocked on GitHub (403). |
| 20 | Release of the ten workstreams (8 Oct 2026) | Done; **§21–§24 not run live** | On set, schedule (DPR inside `fms_locations_v1`), writing (`fms_characters_v1`), revisions (`numbering` in the script blob), AI coverage, compliance (CBFC rules carry sources; the rating is a hint), money (`fms_costs_v1`), billing growth (§21–§23), growth UX (`fms_tour_v1`). §24 makes characters and costs SYNC — run it before this build goes live. A proof that fails on its own aborts is the proof's bug. |

**What is live and what is not** — the one list to trust, re-established
by ASKING on 8 Oct 2026 rather than reading: schema §1–§14 have run on
`conhlrulxfwkhsnymakz` (verified through PostgREST, not from the file);
**§16, §17 and §18 are live** (6 Oct) and **§19 and §24 are live**
(8 Oct, read back: `accounts_guard` tgtype 23, the scope CHECK 442
characters naming `characters` and `costs`); **§20–§23 have NOT run** and
are deferred until Razorpay is live, because §20 drops and recreates
`create_pending_payment` and belongs in the same session as the
`rzp-order` redeploy. The **Google consent screen is PUBLISHED** — In
production, External, and Google states verification is not required
because no sensitive or restricted scopes are requested; its branding is
filled in and awaiting re-verification after the 8 Oct Search Console
ownership check. No Razorpay key exists. None of the live RLS checks has
been executed. Ask the database, not the file — and note that this
paragraph said "§16–§24 have NOT been verified" and "the consent screen
is in Testing" while both had been false for days, which is the whole
argument for asking.

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

- **The `google-site-verification` meta tag in `index.html` is
  load-bearing.** `<meta name="google-site-verification" content="-V57…">`
  on line 31 is what proves to Google that this host is ours. It is the
  sole ownership proof behind the Search Console property created on
  8 Oct 2026, and that property is what the OAuth consent screen's
  branding verification checks. Delete the tag and the branding stops
  being shown to users on Google's next sweep — silently, and with a
  24-hour minimum to undo. If you ever need the hub's `<head>` tidied,
  add a second verification method in Search Console → Settings →
  Ownership verification FIRST.

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
  This is TRUE and enforced: `cloud.js` `boot()` calls `ensureClient()` only
  when there is a session to restore — an `sb-*-auth-token` key in
  localStorage (matched by shape, read without the SDK), an OAuth redirect
  in the URL, or the extension — and otherwise only records the config. A
  signed-out first load fetches no `supabase-*` chunk; every later need (the
  sign-in click, the invite-code check, a share link, billing, Drive) calls
  `ensureClient()` itself, so a new caller must too, never assume `supabase`
  is non-null. `scripts/budget.json` fails a first paint that fetches one of
  the lazy chunks by name; `knownLazyFetches` is empty now.
- `legacy/` is committed on purpose — now as the historical record and as the
  input `npm run extract` parses, not as the verification oracle.
